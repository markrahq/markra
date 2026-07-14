use std::path::Path;
use std::sync::{Arc, Mutex};

#[cfg(any(target_os = "linux", test))]
use std::collections::HashSet;
#[cfg(any(target_os = "linux", test))]
use std::fs;
#[cfg(any(target_os = "linux", test))]
use std::path::PathBuf;

#[cfg(any(target_os = "linux", test))]
use notify::event::{CreateKind, ModifyKind, RemoveKind};
#[cfg(any(target_os = "linux", test))]
use notify::EventKind;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

use crate::markdown_files::MarkdownIgnoreRules;

#[derive(Debug, PartialEq, Eq)]
enum DirectoryWatchStrategy {
    #[cfg(not(target_os = "linux"))]
    RecursiveRoot,
    #[cfg(target_os = "linux")]
    VisibleDirectories,
}

#[cfg(target_os = "linux")]
fn directory_watch_strategy() -> DirectoryWatchStrategy {
    DirectoryWatchStrategy::VisibleDirectories
}

#[cfg(not(target_os = "linux"))]
fn directory_watch_strategy() -> DirectoryWatchStrategy {
    DirectoryWatchStrategy::RecursiveRoot
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, PartialEq, Eq)]
struct DirectoryWatchDiff {
    add: HashSet<PathBuf>,
    remove: HashSet<PathBuf>,
}

#[cfg(any(target_os = "linux", test))]
fn visible_watch_directories(
    root: &Path,
    ignore_rules: &MarkdownIgnoreRules,
) -> Result<HashSet<PathBuf>, String> {
    fn collect(
        directory: &Path,
        ignore_rules: &MarkdownIgnoreRules,
        directories: &mut HashSet<PathBuf>,
    ) -> Result<(), String> {
        directories.insert(directory.to_path_buf());
        for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_dir()
                && !ignore_rules.ignores(&path, true)
            {
                collect(&path, ignore_rules, directories)?;
            }
        }
        Ok(())
    }

    let mut directories = HashSet::new();
    collect(root, ignore_rules, &mut directories)?;
    Ok(directories)
}

#[cfg(any(target_os = "linux", test))]
fn directory_watch_diff(
    current: &HashSet<PathBuf>,
    desired: &HashSet<PathBuf>,
) -> DirectoryWatchDiff {
    DirectoryWatchDiff {
        add: desired.difference(current).cloned().collect(),
        remove: current.difference(desired).cloned().collect(),
    }
}

#[cfg(any(target_os = "linux", test))]
fn event_requires_reconciliation(event: &Event, ignore_rules: &MarkdownIgnoreRules) -> bool {
    event.need_rescan()
        || matches!(
            event.kind,
            EventKind::Any
                | EventKind::Create(CreateKind::Any | CreateKind::Folder)
                | EventKind::Modify(ModifyKind::Name(_))
                | EventKind::Remove(RemoveKind::Any | RemoveKind::Folder)
        )
        || event
            .paths
            .iter()
            .any(|path| ignore_rules.is_control_file(path))
}

pub(super) struct DirectoryWatcher {
    #[cfg(target_os = "linux")]
    coordinator: LinuxDirectoryWatcher,
    #[cfg(not(target_os = "linux"))]
    _watcher: RecommendedWatcher,
}

impl DirectoryWatcher {
    pub(super) fn new<F>(
        root: &Path,
        ignore_rules: Arc<Mutex<MarkdownIgnoreRules>>,
        handler: F,
    ) -> Result<Self, String>
    where
        F: FnMut(notify::Result<Event>) + Send + 'static,
    {
        #[cfg(target_os = "linux")]
        {
            debug_assert_eq!(
                directory_watch_strategy(),
                DirectoryWatchStrategy::VisibleDirectories
            );
            return LinuxDirectoryWatcher::new(root, ignore_rules, handler)
                .map(|coordinator| Self { coordinator });
        }

        #[cfg(not(target_os = "linux"))]
        {
            debug_assert_eq!(
                directory_watch_strategy(),
                DirectoryWatchStrategy::RecursiveRoot
            );
            let _ignore_rules = ignore_rules;
            let mut watcher =
                notify::recommended_watcher(handler).map_err(|error| error.to_string())?;
            watcher
                .watch(root, RecursiveMode::Recursive)
                .map_err(|error| error.to_string())?;
            Ok(Self { _watcher: watcher })
        }
    }

    pub(super) fn reconcile(&self) -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            return self.coordinator.reconcile();
        }

        #[cfg(not(target_os = "linux"))]
        Ok(())
    }
}

#[cfg(target_os = "linux")]
struct LinuxDirectoryWatcher {
    coordinator: Option<std::thread::JoinHandle<()>>,
    sender: std::sync::mpsc::Sender<CoordinatorMessage>,
}

#[cfg(target_os = "linux")]
enum CoordinatorMessage {
    BackendEvent(notify::Result<Event>),
    Reconcile(std::sync::mpsc::SyncSender<Result<(), String>>),
    Shutdown,
}

#[cfg(target_os = "linux")]
impl LinuxDirectoryWatcher {
    fn new<F>(
        root: &Path,
        ignore_rules: Arc<Mutex<MarkdownIgnoreRules>>,
        handler: F,
    ) -> Result<Self, String>
    where
        F: FnMut(notify::Result<Event>) + Send + 'static,
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        let event_sender = sender.clone();
        let mut watcher = notify::recommended_watcher(move |result| {
            let _ = event_sender.send(CoordinatorMessage::BackendEvent(result));
        })
        .map_err(|error| error.to_string())?;
        let mut watched_directories = {
            let rules = ignore_rules
                .lock()
                .map_err(|_| "markdown ignore rules lock is poisoned".to_string())?;
            visible_watch_directories(root, &rules)?
        };
        let mut initial_directories = watched_directories.iter().collect::<Vec<_>>();
        initial_directories.sort();
        for directory in initial_directories {
            watcher
                .watch(directory, RecursiveMode::NonRecursive)
                .map_err(|error| error.to_string())?;
        }

        let coordinator_root = root.to_path_buf();
        let coordinator_rules = Arc::clone(&ignore_rules);
        let coordinator = std::thread::Builder::new()
            .name("markra-directory-watcher".to_string())
            .spawn(move || {
                run_linux_coordinator(
                    watcher,
                    &mut watched_directories,
                    &coordinator_root,
                    &coordinator_rules,
                    handler,
                    receiver,
                );
            })
            .map_err(|error| error.to_string())?;

        Ok(Self {
            coordinator: Some(coordinator),
            sender,
        })
    }

    fn reconcile(&self) -> Result<(), String> {
        let (result_sender, result_receiver) = std::sync::mpsc::sync_channel(1);
        self.sender
            .send(CoordinatorMessage::Reconcile(result_sender))
            .map_err(|_| "markdown directory watcher has stopped".to_string())?;
        result_receiver
            .recv()
            .map_err(|_| "markdown directory watcher has stopped".to_string())?
    }
}

#[cfg(target_os = "linux")]
impl Drop for LinuxDirectoryWatcher {
    fn drop(&mut self) {
        let _ = self.sender.send(CoordinatorMessage::Shutdown);
        if let Some(coordinator) = self.coordinator.take() {
            let _ = coordinator.join();
        }
    }
}

#[cfg(target_os = "linux")]
fn run_linux_coordinator<F>(
    mut watcher: RecommendedWatcher,
    watched_directories: &mut HashSet<PathBuf>,
    root: &Path,
    ignore_rules: &Arc<Mutex<MarkdownIgnoreRules>>,
    mut handler: F,
    receiver: std::sync::mpsc::Receiver<CoordinatorMessage>,
) where
    F: FnMut(notify::Result<Event>),
{
    while let Ok(message) = receiver.recv() {
        match message {
            CoordinatorMessage::BackendEvent(result) => {
                let should_reconcile = result.as_ref().ok().is_some_and(|event| {
                    ignore_rules
                        .lock()
                        .map(|rules| event_requires_reconciliation(event, &rules))
                        .unwrap_or(true)
                });
                handler(result);
                if should_reconcile {
                    let _ = reconcile_linux_directories(
                        &mut watcher,
                        watched_directories,
                        root,
                        ignore_rules,
                    );
                }
            }
            CoordinatorMessage::Reconcile(result_sender) => {
                let result = reconcile_linux_directories(
                    &mut watcher,
                    watched_directories,
                    root,
                    ignore_rules,
                );
                let _ = result_sender.send(result);
            }
            CoordinatorMessage::Shutdown => break,
        }
    }
}

#[cfg(target_os = "linux")]
fn reconcile_linux_directories(
    watcher: &mut RecommendedWatcher,
    watched_directories: &mut HashSet<PathBuf>,
    root: &Path,
    ignore_rules: &Arc<Mutex<MarkdownIgnoreRules>>,
) -> Result<(), String> {
    let desired_directories = {
        let rules = ignore_rules
            .lock()
            .map_err(|_| "markdown ignore rules lock is poisoned".to_string())?;
        visible_watch_directories(root, &rules)?
    };
    let diff = directory_watch_diff(watched_directories, &desired_directories);
    let mut additions = diff.add.into_iter().collect::<Vec<_>>();
    additions.sort();
    let mut added: Vec<PathBuf> = Vec::new();

    // Add the full desired set before pruning stale watches. A failed addition
    // rolls back only this attempt, preserving the last known-good coverage.
    // notify invokes callbacks on its backend thread. All watch mutations stay on
    // this coordinator thread to avoid re-entering inotify and deadlocking it.
    for directory in additions {
        if let Err(error) = watcher.watch(&directory, RecursiveMode::NonRecursive) {
            for added_directory in added.into_iter().rev() {
                if watcher.unwatch(&added_directory).is_err() {
                    watched_directories.insert(added_directory);
                }
            }
            return Err(error.to_string());
        }
        added.push(directory);
    }
    watched_directories.extend(added);

    let mut removals = diff.remove.into_iter().collect::<Vec<_>>();
    removals.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    let mut first_error = None;
    for directory in removals {
        if !directory.exists() {
            let _ = watcher.unwatch(&directory);
            watched_directories.remove(&directory);
            continue;
        }

        match watcher.unwatch(&directory) {
            Ok(()) => {
                watched_directories.remove(&directory);
            }
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error.to_string());
                }
            }
        }
    }

    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind};
    use notify::{Event, EventKind};
    use std::collections::HashSet;
    use std::fs;
    use std::path::PathBuf;

    use crate::markdown_files::MarkdownIgnoreRules;

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "markra-directory-watcher-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ))
    }

    #[test]
    fn collects_only_visible_directories() {
        let root = test_root("visible");
        fs::create_dir_all(root.join("docs/generated"))
            .expect("generated directory should be created");
        fs::create_dir_all(root.join("node_modules/pkg"))
            .expect("dependency directory should be created");
        let rules = MarkdownIgnoreRules::for_root(&root, Some("docs/generated/\n"));

        let directories = visible_watch_directories(&root, &rules)
            .expect("visible directories should be collected");

        assert!(directories.contains(&root));
        assert!(directories.contains(&root.join("docs")));
        assert!(!directories.contains(&root.join("docs/generated")));
        assert!(!directories.contains(&root.join("node_modules")));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn calculates_directory_registration_changes() {
        let root = PathBuf::from("/mock-workspace");
        let current = HashSet::from([root.clone(), root.join("docs"), root.join("drafts")]);
        let desired = HashSet::from([root.clone(), root.join("docs"), root.join("notes")]);

        let diff = directory_watch_diff(&current, &desired);

        assert_eq!(diff.add, HashSet::from([root.join("notes")]));
        assert_eq!(diff.remove, HashSet::from([root.join("drafts")]));
    }

    #[test]
    fn recalculates_registrations_after_rules_change() {
        let root = test_root("rule-change");
        fs::create_dir_all(root.join("drafts")).expect("drafts directory should be created");
        fs::create_dir_all(root.join("notes")).expect("notes directory should be created");
        let initial_rules = MarkdownIgnoreRules::for_root(&root, Some("drafts/\n"));
        let next_rules = MarkdownIgnoreRules::for_root(&root, Some("notes/\n"));
        let current = visible_watch_directories(&root, &initial_rules)
            .expect("initial directories should be collected");
        let desired = visible_watch_directories(&root, &next_rules)
            .expect("next directories should be collected");

        let diff = directory_watch_diff(&current, &desired);

        assert_eq!(diff.add, HashSet::from([root.join("drafts")]));
        assert_eq!(diff.remove, HashSet::from([root.join("notes")]));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn selects_the_native_directory_watch_strategy() {
        #[cfg(target_os = "linux")]
        assert_eq!(
            directory_watch_strategy(),
            DirectoryWatchStrategy::VisibleDirectories
        );

        #[cfg(not(target_os = "linux"))]
        assert_eq!(
            directory_watch_strategy(),
            DirectoryWatchStrategy::RecursiveRoot
        );
    }

    #[test]
    fn reconciles_for_directory_and_control_file_events_only() {
        let root = PathBuf::from("/mock-workspace");
        let rules = MarkdownIgnoreRules::for_root(&root, None);
        let directory_event =
            Event::new(EventKind::Create(CreateKind::Folder)).add_path(root.join("notes"));
        let control_event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(root.join(".markraignore"));
        let file_event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(root.join("note.md"));

        assert!(event_requires_reconciliation(&directory_event, &rules));
        assert!(event_requires_reconciliation(&control_event, &rules));
        assert!(!event_requires_reconciliation(&file_event, &rules));
    }
}
