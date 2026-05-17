use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

const MARKDOWN_FILE_CHANGED_EVENT: &str = "markra://file-changed";
const MARKDOWN_TREE_CHANGED_EVENT: &str = "markra://tree-changed";

struct ActiveMarkdownWatcher {
    path: PathBuf,
    _watcher: RecommendedWatcher,
}

#[derive(Default)]
pub(crate) struct MarkdownFileWatcherState(Mutex<Option<ActiveMarkdownWatcher>>);

#[derive(Default)]
pub(crate) struct MarkdownTreeWatcherState(Mutex<Option<ActiveMarkdownWatcher>>);

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

#[tauri::command]
pub(crate) fn watch_markdown_file(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, MarkdownFileWatcherState>,
    path: String,
) -> Result<(), String> {
    let watched_path = PathBuf::from(&path);
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

    let mut active_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| "markdown file watcher state lock is poisoned".to_string())?;
    *active_watcher = Some(ActiveMarkdownWatcher {
        path: watched_path,
        _watcher: watcher,
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn unwatch_markdown_file(
    watcher_state: tauri::State<'_, MarkdownFileWatcherState>,
    path: String,
) -> Result<(), String> {
    let watched_path = PathBuf::from(path);
    let mut active_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| "markdown file watcher state lock is poisoned".to_string())?;

    if active_watcher
        .as_ref()
        .is_some_and(|watcher| watcher.path == watched_path)
    {
        *active_watcher = None;
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn watch_markdown_tree(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, MarkdownTreeWatcherState>,
    root_path: String,
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

    let mut active_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| "markdown tree watcher state lock is poisoned".to_string())?;
    *active_watcher = Some(ActiveMarkdownWatcher {
        path: source_path,
        _watcher: watcher,
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn unwatch_markdown_tree(
    watcher_state: tauri::State<'_, MarkdownTreeWatcherState>,
    root_path: String,
) -> Result<(), String> {
    let watched_path = PathBuf::from(root_path);
    let mut active_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| "markdown tree watcher state lock is poisoned".to_string())?;

    if active_watcher
        .as_ref()
        .is_some_and(|watcher| watcher.path == watched_path)
    {
        *active_watcher = None;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind};

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
}
