use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{Event, EventKind};
use tauri::Emitter;

use crate::markdown_files::MarkdownIgnoreRules;

mod directory;

use directory::DirectoryWatcher;

const MARKDOWN_FILE_CHANGED_EVENT: &str = "markra://file-changed";
const MARKDOWN_TREE_CHANGED_EVENT: &str = "markra://tree-changed";

struct ActiveMarkdownWatcher {
    ignore_rules: Arc<Mutex<MarkdownIgnoreRules>>,
    subscriber_count: usize,
    watcher: DirectoryWatcher,
}

#[derive(Default)]
pub(crate) struct MarkdownFileWatcherState(Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>);

#[derive(Default)]
pub(crate) struct MarkdownTreeWatcherState(Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>);

#[derive(Clone, serde::Serialize)]
struct MarkdownFileChanged {
    path: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownTreeChanged {
    path: String,
    root_path: String,
}

fn is_target_file_event(event: &Event, watched_path: &Path) -> bool {
    if !matches!(
        event.kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_)
    ) {
        return false;
    }

    let Some(watched_file_name) = watched_path.file_name() else {
        return false;
    };

    event.paths.iter().any(|event_path| {
        event_path == watched_path
            || (event_path.parent() == watched_path.parent()
                && event_path.file_name() == Some(watched_file_name))
    })
}

fn markdown_ignore_root(watched_path: &Path, candidate_root: Option<&Path>) -> PathBuf {
    let watched_parent = watched_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    candidate_root
        .filter(|root| watched_path.starts_with(root))
        .map(Path::to_path_buf)
        .unwrap_or(watched_parent)
}

fn is_markdown_tree_path(_path: &Path) -> bool {
    true
}

fn reload_markdown_ignore_rules_for_event(event: &Event, ignore_rules: &mut MarkdownIgnoreRules) {
    if event
        .paths
        .iter()
        .any(|event_path| ignore_rules.is_control_file(event_path))
    {
        ignore_rules.reload();
    }
}

fn markdown_tree_event_path<'a>(
    event: &'a Event,
    root: &Path,
    ignore_rules: &MarkdownIgnoreRules,
) -> Option<&'a Path> {
    if !matches!(
        event.kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    ) {
        return None;
    }

    event.paths.iter().map(PathBuf::as_path).find(|event_path| {
        let Ok(relative_path) = event_path.strip_prefix(root) else {
            return false;
        };

        if relative_path.as_os_str().is_empty() {
            return false;
        }

        // The control file stays hidden from the tree, but its event must trigger
        // a refresh so subsequent traversal uses the updated rules.
        ignore_rules.is_control_file(event_path)
            || (!ignore_rules.ignores(event_path, event_path.is_dir())
                && is_markdown_tree_path(event_path))
    })
}

fn remove_path_entry<T>(entries: &mut HashMap<PathBuf, T>, path: &Path) -> Option<T> {
    entries.remove(path)
}

fn release_active_watcher_subscription(subscriber_count: &mut usize) -> bool {
    if *subscriber_count > 1 {
        *subscriber_count -= 1;
        return false;
    }

    true
}

fn has_active_watcher_subscription(
    watcher_state: &Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>,
    path: &Path,
    ignore_root: &Path,
    global_ignore_rules: Option<&str>,
) -> Result<bool, String> {
    let mut active_watchers = watcher_state
        .lock()
        .map_err(|_| "markdown watcher state lock is poisoned".to_string())?;

    if let Some(watcher) = active_watchers.get_mut(path) {
        let mut ignore_rules = watcher
            .ignore_rules
            .lock()
            .map_err(|_| "markdown ignore rules lock is poisoned".to_string())?;
        // React may subscribe with new settings before the previous async unwatch
        // reaches Rust, so refresh a shared watcher's matcher during subscription.
        *ignore_rules = MarkdownIgnoreRules::for_root(ignore_root, global_ignore_rules);
        // Linux reconciliation reads this matcher on its coordinator thread.
        drop(ignore_rules);
        watcher.watcher.reconcile()?;
        watcher.subscriber_count += 1;
        return Ok(true);
    }

    Ok(false)
}

fn remember_active_watcher(
    watcher_state: &Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>,
    path: PathBuf,
    watcher: DirectoryWatcher,
    ignore_rules: Arc<Mutex<MarkdownIgnoreRules>>,
) -> Result<(), String> {
    let mut active_watchers = watcher_state
        .lock()
        .map_err(|_| "markdown watcher state lock is poisoned".to_string())?;

    if let Some(existing_watcher) = active_watchers.get_mut(&path) {
        let mut existing_ignore_rules = existing_watcher
            .ignore_rules
            .lock()
            .map_err(|_| "markdown ignore rules lock is poisoned".to_string())?;
        let mut next_ignore_rules = ignore_rules
            .lock()
            .map_err(|_| "markdown ignore rules lock is poisoned".to_string())?;
        std::mem::swap(&mut *existing_ignore_rules, &mut *next_ignore_rules);
        // Release both matcher locks before waiting for Linux reconciliation.
        drop(existing_ignore_rules);
        drop(next_ignore_rules);
        existing_watcher.watcher.reconcile()?;
        existing_watcher.subscriber_count += 1;
        return Ok(());
    }

    active_watchers.insert(
        path.clone(),
        ActiveMarkdownWatcher {
            ignore_rules,
            subscriber_count: 1,
            watcher,
        },
    );

    Ok(())
}

fn release_active_watcher(
    watcher_state: &Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>,
    path: &Path,
) -> Result<(), String> {
    let mut active_watchers = watcher_state
        .lock()
        .map_err(|_| "markdown watcher state lock is poisoned".to_string())?;

    if let Some(watcher) = active_watchers.get_mut(path) {
        if !release_active_watcher_subscription(&mut watcher.subscriber_count) {
            return Ok(());
        }
    }

    remove_path_entry(&mut active_watchers, path);
    Ok(())
}

#[tauri::command]
pub(crate) fn watch_markdown_file(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, MarkdownFileWatcherState>,
    path: String,
    global_ignore_rules: Option<String>,
    ignore_root_path: Option<String>,
) -> Result<(), String> {
    let watched_path = PathBuf::from(&path);
    let watch_root = watched_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    // The OS subscription stays scoped to the file's parent, while ignore matching
    // may need workspace-relative paths. Reject unrelated roots before using them.
    let ignore_root =
        markdown_ignore_root(&watched_path, ignore_root_path.as_deref().map(Path::new));
    if has_active_watcher_subscription(
        &watcher_state.0,
        &watched_path,
        &ignore_root,
        global_ignore_rules.as_deref(),
    )? {
        return Ok(());
    }
    let emitted_path = watched_path.to_string_lossy().to_string();
    let emitted_root = watch_root.to_string_lossy().to_string();
    let callback_path = watched_path.clone();
    let callback_root = watch_root.clone();
    let ignore_rules = Arc::new(Mutex::new(MarkdownIgnoreRules::for_root(
        &ignore_root,
        global_ignore_rules.as_deref(),
    )));
    let callback_ignore_rules = Arc::clone(&ignore_rules);

    // Watch the parent tree so atomic saves and adjacent pasted assets are still visible.
    let watcher = DirectoryWatcher::new(
        &watch_root,
        Arc::clone(&ignore_rules),
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };

            if is_target_file_event(&event, &callback_path) {
                let _ = app.emit(
                    MARKDOWN_FILE_CHANGED_EVENT,
                    MarkdownFileChanged {
                        path: emitted_path.clone(),
                    },
                );
            }

            let Ok(mut ignore_rules) = callback_ignore_rules.lock() else {
                return;
            };
            reload_markdown_ignore_rules_for_event(&event, &mut ignore_rules);
            if let Some(event_path) =
                markdown_tree_event_path(&event, &callback_root, &ignore_rules)
            {
                let _ = app.emit(
                    MARKDOWN_TREE_CHANGED_EVENT,
                    MarkdownTreeChanged {
                        path: event_path.to_string_lossy().to_string(),
                        root_path: emitted_root.clone(),
                    },
                );
            }
        },
    )?;

    remember_active_watcher(&watcher_state.0, watched_path, watcher, ignore_rules)
}

#[tauri::command]
pub(crate) fn unwatch_markdown_file(
    watcher_state: tauri::State<'_, MarkdownFileWatcherState>,
    path: String,
) -> Result<(), String> {
    let watched_path = PathBuf::from(path);
    release_active_watcher(&watcher_state.0, &watched_path)
}

#[tauri::command]
pub(crate) fn watch_markdown_tree(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, MarkdownTreeWatcherState>,
    root_path: String,
    global_ignore_rules: Option<String>,
) -> Result<(), String> {
    let source_path = PathBuf::from(&root_path);
    let watch_root = if source_path.is_dir() {
        source_path.clone()
    } else {
        source_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    };
    if has_active_watcher_subscription(
        &watcher_state.0,
        &source_path,
        &watch_root,
        global_ignore_rules.as_deref(),
    )? {
        return Ok(());
    }
    let emitted_root = watch_root.to_string_lossy().to_string();
    let callback_root = watch_root.clone();
    let ignore_rules = Arc::new(Mutex::new(MarkdownIgnoreRules::for_root(
        &callback_root,
        global_ignore_rules.as_deref(),
    )));
    let callback_ignore_rules = Arc::clone(&ignore_rules);

    let watcher = DirectoryWatcher::new(
        &watch_root,
        Arc::clone(&ignore_rules),
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };

            let Ok(mut ignore_rules) = callback_ignore_rules.lock() else {
                return;
            };
            reload_markdown_ignore_rules_for_event(&event, &mut ignore_rules);
            if let Some(event_path) =
                markdown_tree_event_path(&event, &callback_root, &ignore_rules)
            {
                let _ = app.emit(
                    MARKDOWN_TREE_CHANGED_EVENT,
                    MarkdownTreeChanged {
                        path: event_path.to_string_lossy().to_string(),
                        root_path: emitted_root.clone(),
                    },
                );
            }
        },
    )?;

    remember_active_watcher(&watcher_state.0, source_path, watcher, ignore_rules)
}

#[tauri::command]
pub(crate) fn unwatch_markdown_tree(
    watcher_state: tauri::State<'_, MarkdownTreeWatcherState>,
    root_path: String,
) -> Result<(), String> {
    let watched_path = PathBuf::from(root_path);
    release_active_watcher(&watcher_state.0, &watched_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind};
    use std::collections::HashMap;

    fn test_markdown_tree_event_path<'a>(event: &'a Event, root: &Path) -> Option<&'a Path> {
        let ignore_rules = MarkdownIgnoreRules::for_root(root, None);
        markdown_tree_event_path(event, root, &ignore_rules)
    }

    #[test]
    fn uses_workspace_root_for_nested_watched_files() {
        let watched_path = Path::new("/mock-workspace/docs/note.md");

        assert_eq!(
            markdown_ignore_root(watched_path, Some(Path::new("/mock-workspace"))),
            PathBuf::from("/mock-workspace")
        );
    }

    #[test]
    fn rejects_ignore_roots_that_do_not_contain_the_watched_file() {
        let watched_path = Path::new("/mock-workspace/docs/note.md");

        assert_eq!(
            markdown_ignore_root(watched_path, Some(Path::new("/other-workspace"))),
            PathBuf::from("/mock-workspace/docs")
        );
    }

    #[test]
    fn matches_target_file_modifications_in_the_watched_directory() {
        let watched_path = PathBuf::from("/mock-files/readme.md");
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(PathBuf::from("/mock-files/readme.md"));

        assert!(is_target_file_event(&event, &watched_path));
    }

    #[test]
    fn matches_target_file_recreation_from_atomic_saves() {
        let watched_path = PathBuf::from("/mock-files/readme.md");
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/mock-files/readme.md"));

        assert!(is_target_file_event(&event, &watched_path));
    }

    #[test]
    fn ignores_other_files_in_the_same_directory() {
        let watched_path = PathBuf::from("/mock-files/readme.md");
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(PathBuf::from("/mock-files/other.md"));

        assert!(!is_target_file_event(&event, &watched_path));
    }

    #[test]
    fn matches_nested_markdown_tree_asset_creations() {
        let root = PathBuf::from("/mock-files");
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/mock-files/assets/pasted-image.png"));

        assert!(test_markdown_tree_event_path(&event, &root).is_some());
    }

    #[test]
    fn ignores_dependency_folder_tree_events() {
        let root = PathBuf::from("/mock-files");
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/mock-files/node_modules/pkg/readme.md"));

        assert!(test_markdown_tree_event_path(&event, &root).is_none());
    }

    #[test]
    fn ignores_tool_metadata_folder_tree_events() {
        let root = PathBuf::from("/mock-files");
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content))).add_path(
            PathBuf::from("/mock-files/.obsidian/plugins/mock-plugin/data.json"),
        );

        assert!(test_markdown_tree_event_path(&event, &root).is_none());
    }

    #[test]
    fn uses_root_markraignore_for_tree_events() {
        let root = std::env::temp_dir().join(format!(
            "markra-ignore-watcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let generated = root.join("generated");

        std::fs::create_dir_all(&generated).expect("generated folder should be created");
        let mut ignore_rules = MarkdownIgnoreRules::for_root(&root, None);
        std::fs::write(root.join(".markraignore"), "generated/\n")
            .expect("ignore rules should be created");
        let control_event =
            Event::new(EventKind::Create(CreateKind::File)).add_path(root.join(".markraignore"));
        reload_markdown_ignore_rules_for_event(&control_event, &mut ignore_rules);
        let event =
            Event::new(EventKind::Create(CreateKind::File)).add_path(generated.join("hidden.md"));

        assert!(markdown_tree_event_path(&event, &root, &ignore_rules).is_none());

        std::fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn preserves_global_rules_when_root_markraignore_reloads() {
        let root = std::env::temp_dir().join(format!(
            "markra-global-ignore-watcher-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let generated = root.join("generated");

        std::fs::create_dir_all(&generated).expect("generated folder should be created");
        let mut ignore_rules = MarkdownIgnoreRules::for_root(&root, Some("generated/\n"));
        std::fs::write(root.join(".markraignore"), "").expect("workspace rules should be created");
        let control_event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(root.join(".markraignore"));
        reload_markdown_ignore_rules_for_event(&control_event, &mut ignore_rules);
        let event =
            Event::new(EventKind::Create(CreateKind::File)).add_path(generated.join("hidden.md"));

        assert!(markdown_tree_event_path(&event, &root, &ignore_rules).is_none());

        std::fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn emits_root_markraignore_tree_events() {
        let root = PathBuf::from("/mock-files");
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(root.join(".markraignore"));

        assert_eq!(
            test_markdown_tree_event_path(&event, &root),
            Some(root.join(".markraignore").as_path())
        );
    }

    #[test]
    fn removing_an_active_watcher_keeps_other_paths() {
        let mut entries = HashMap::from([
            (PathBuf::from("/mock-files/first.md"), "first"),
            (PathBuf::from("/mock-files/second.md"), "second"),
        ]);

        remove_path_entry(&mut entries, Path::new("/mock-files/first.md"));

        assert_eq!(entries.len(), 1);
        assert!(entries.contains_key(Path::new("/mock-files/second.md")));
    }

    #[test]
    fn shared_active_watchers_release_only_after_last_subscription() {
        let mut subscriber_count = 2;

        assert!(!release_active_watcher_subscription(&mut subscriber_count));
        assert_eq!(subscriber_count, 1);
        assert!(release_active_watcher_subscription(&mut subscriber_count));
    }
}
