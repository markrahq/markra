use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;

#[derive(Default)]
pub(crate) struct EditorWindowRestoreState(Mutex<HashMap<String, EditorWindowRestoreEntry>>);

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditorWindowRestoreEntry {
    pub(crate) file_path: Option<String>,
    pub(crate) label: String,
    pub(crate) open_file_paths: Vec<String>,
}

fn normalize_optional_path(path: Option<String>) -> Option<String> {
    path.and_then(|path| {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_open_file_paths(paths: Vec<String>) -> Vec<String> {
    let mut seen_paths = std::collections::HashSet::new();
    let mut normalized_paths = Vec::new();

    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() || seen_paths.contains(trimmed) {
            continue;
        }

        seen_paths.insert(trimmed.to_string());
        normalized_paths.push(trimmed.to_string());
    }

    normalized_paths
}

fn editor_window_restore_entry(
    label: String,
    file_path: Option<String>,
    open_file_paths: Vec<String>,
) -> Option<EditorWindowRestoreEntry> {
    let file_path = normalize_optional_path(file_path);
    let mut open_file_paths = normalize_open_file_paths(open_file_paths);

    if let Some(path) = &file_path {
        if !open_file_paths.contains(path) {
            open_file_paths.push(path.clone());
        }
    }

    if file_path.is_none() && open_file_paths.is_empty() {
        return None;
    }

    Some(EditorWindowRestoreEntry {
        file_path,
        label,
        open_file_paths,
    })
}

#[tauri::command]
pub(crate) fn set_editor_window_restore_state(
    window: tauri::Window,
    state: tauri::State<'_, EditorWindowRestoreState>,
    file_path: Option<String>,
    open_file_paths: Vec<String>,
) {
    let label = window.label().to_string();
    let mut entries = state
        .0
        .lock()
        .expect("editor window restore state poisoned");

    if let Some(entry) = editor_window_restore_entry(label.clone(), file_path, open_file_paths) {
        entries.insert(label, entry);
    } else {
        entries.remove(&label);
    }
}

#[tauri::command]
pub(crate) fn list_editor_window_restore_states(
    state: tauri::State<'_, EditorWindowRestoreState>,
) -> Vec<EditorWindowRestoreEntry> {
    let mut entries = state
        .0
        .lock()
        .expect("editor window restore state poisoned")
        .values()
        .cloned()
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| left.label.cmp(&right.label));
    entries
}

pub(crate) fn remove_editor_window_restore_state<R>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) where
    R: tauri::Runtime,
{
    if !matches!(event, tauri::WindowEvent::Destroyed) {
        return;
    }

    let state = window.state::<EditorWindowRestoreState>();
    let mut entries = state
        .0
        .lock()
        .expect("editor window restore state poisoned");
    entries.remove(window.label());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_editor_window_restore_entries() {
        let entry = editor_window_restore_entry(
            "markra-editor-1".to_string(),
            Some(" /mock-files/active.md ".to_string()),
            vec![
                "/mock-files/notes.md".to_string(),
                " ".to_string(),
                "/mock-files/notes.md".to_string(),
            ],
        )
        .expect("entry should be retained");

        assert_eq!(
            entry,
            EditorWindowRestoreEntry {
                file_path: Some("/mock-files/active.md".to_string()),
                label: "markra-editor-1".to_string(),
                open_file_paths: vec![
                    "/mock-files/notes.md".to_string(),
                    "/mock-files/active.md".to_string()
                ]
            }
        );
    }

    #[test]
    fn drops_empty_editor_window_restore_entries() {
        assert_eq!(
            editor_window_restore_entry("main".to_string(), Some(" ".to_string()), vec![]),
            None
        );
    }
}
