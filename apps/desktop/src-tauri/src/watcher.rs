use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

const MARKDOWN_FILE_CHANGED_EVENT: &str = "markra://file-changed";
const MARKDOWN_TREE_CHANGED_EVENT: &str = "markra://tree-changed";

struct ActiveMarkdownWatcher {
    subscriber_count: usize,
    _watcher: RecommendedWatcher,
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

fn is_ignored_tree_component(component: &std::ffi::OsStr) -> bool {
    component
        .to_str()
        .is_some_and(|name| matches!(name, ".git" | "node_modules" | "target" | "dist" | "build"))
}

fn is_markdown_tree_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "avif"
                    | "bmp"
                    | "gif"
                    | "jpg"
                    | "jpeg"
                    | "md"
                    | "markdown"
                    | "png"
                    | "svg"
                    | "webp"
            )
        })
        .unwrap_or(true)
}

fn markdown_tree_event_path<'a>(event: &'a Event, root: &Path) -> Option<&'a Path> {
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

        let has_ignored_component = relative_path
            .components()
            .any(|component| is_ignored_tree_component(component.as_os_str()));

        !has_ignored_component && is_markdown_tree_path(event_path)
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
) -> Result<bool, String> {
    let mut active_watchers = watcher_state
        .lock()
        .map_err(|_| "markdown watcher state lock is poisoned".to_string())?;

    if let Some(watcher) = active_watchers.get_mut(path) {
        watcher.subscriber_count += 1;
        return Ok(true);
    }

    Ok(false)
}

fn remember_active_watcher(
    watcher_state: &Mutex<HashMap<PathBuf, ActiveMarkdownWatcher>>,
    path: PathBuf,
    watcher: RecommendedWatcher,
) -> Result<(), String> {
    let mut active_watchers = watcher_state
        .lock()
        .map_err(|_| "markdown watcher state lock is poisoned".to_string())?;

    if let Some(existing_watcher) = active_watchers.get_mut(&path) {
        existing_watcher.subscriber_count += 1;
        return Ok(());
    }

    active_watchers.insert(
        path.clone(),
        ActiveMarkdownWatcher {
            subscriber_count: 1,
            _watcher: watcher,
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
) -> Result<(), String> {
    let watched_path = PathBuf::from(&path);
    if has_active_watcher_subscription(&watcher_state.0, &watched_path)? {
        return Ok(());
    }

    let watch_root = watched_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let emitted_path = watched_path.to_string_lossy().to_string();
    let emitted_root = watch_root.to_string_lossy().to_string();
    let callback_path = watched_path.clone();
    let callback_root = watch_root.clone();

    // Watch the parent tree so atomic saves and adjacent pasted assets are still visible.
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
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

        if let Some(event_path) = markdown_tree_event_path(&event, &callback_root) {
            let _ = app.emit(
                MARKDOWN_TREE_CHANGED_EVENT,
                MarkdownTreeChanged {
                    path: event_path.to_string_lossy().to_string(),
                    root_path: emitted_root.clone(),
                },
            );
        }
    })
    .map_err(|error| error.to_string())?;

    watcher
        .watch(&watch_root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    remember_active_watcher(&watcher_state.0, watched_path, watcher)
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
) -> Result<(), String> {
    let source_path = PathBuf::from(&root_path);
    if has_active_watcher_subscription(&watcher_state.0, &source_path)? {
        return Ok(());
    }

    let watch_root = if source_path.is_dir() {
        source_path.clone()
    } else {
        source_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    };
    let emitted_root = watch_root.to_string_lossy().to_string();
    let callback_root = watch_root.clone();

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let Ok(event) = result else {
            return;
        };

        if let Some(event_path) = markdown_tree_event_path(&event, &callback_root) {
            let _ = app.emit(
                MARKDOWN_TREE_CHANGED_EVENT,
                MarkdownTreeChanged {
                    path: event_path.to_string_lossy().to_string(),
                    root_path: emitted_root.clone(),
                },
            );
        }
    })
    .map_err(|error| error.to_string())?;

    watcher
        .watch(&watch_root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    remember_active_watcher(&watcher_state.0, source_path, watcher)
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

        assert!(markdown_tree_event_path(&event, &root).is_some());
    }

    #[test]
    fn ignores_dependency_folder_tree_events() {
        let root = PathBuf::from("/mock-files");
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/mock-files/node_modules/pkg/readme.md"));

        assert!(markdown_tree_event_path(&event, &root).is_none());
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
