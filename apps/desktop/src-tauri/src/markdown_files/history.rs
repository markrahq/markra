use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tauri::Manager;

use super::path::is_markdown_history_file;
use super::types::{MarkdownFileHistoryEntry, MarkdownFileHistoryFile};

const MARKDOWN_HISTORY_RETENTION_LIMIT: usize = 30;

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileHistoryIndex {
    document_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    current_entry_id: Option<String>,
    entries: Vec<MarkdownFileHistoryEntry>,
}

fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn hash_hex(input: impl AsRef<[u8]>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    format!("{:x}", hasher.finalize())
}

fn canonical_history_document_path(path: &Path) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

pub(super) fn markdown_history_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("markdown-history"))
        .map_err(|error| error.to_string())
}

fn markdown_history_bucket(root: &Path, document_path: &str) -> PathBuf {
    root.join(hash_hex(document_path))
}

fn markdown_history_index_path(bucket: &Path) -> PathBuf {
    bucket.join("index.json")
}

fn markdown_history_snapshots_dir(bucket: &Path) -> PathBuf {
    bucket.join("snapshots")
}

fn markdown_history_snapshot_path(bucket: &Path, id: &str) -> PathBuf {
    markdown_history_snapshots_dir(bucket).join(format!("{id}.md"))
}

fn empty_markdown_history_index(document_path: String) -> MarkdownFileHistoryIndex {
    MarkdownFileHistoryIndex {
        document_path,
        current_entry_id: None,
        entries: Vec::new(),
    }
}

fn load_markdown_history_index(
    root: &Path,
    path: &Path,
) -> Result<(PathBuf, MarkdownFileHistoryIndex), String> {
    let document_path = canonical_history_document_path(path);
    let bucket = markdown_history_bucket(root, &document_path);
    let index_path = markdown_history_index_path(&bucket);
    if !index_path.exists() {
        return Ok((bucket, empty_markdown_history_index(document_path)));
    }

    let index = serde_json::from_str::<MarkdownFileHistoryIndex>(
        &fs::read_to_string(&index_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    Ok((bucket, index))
}

fn save_markdown_history_index(
    bucket: &Path,
    index: &MarkdownFileHistoryIndex,
) -> Result<(), String> {
    fs::create_dir_all(bucket).map_err(|error| error.to_string())?;
    fs::write(
        markdown_history_index_path(bucket),
        serde_json::to_string_pretty(index).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn normalize_markdown_history_entries(index: &mut MarkdownFileHistoryIndex) {
    let mut seen_ids = Vec::new();
    index.entries.retain(|entry| {
        if seen_ids.iter().any(|id| id == &entry.id) {
            return false;
        }

        seen_ids.push(entry.id.clone());
        true
    });
}

fn prune_markdown_history(bucket: &Path, index: &mut MarkdownFileHistoryIndex) {
    normalize_markdown_history_entries(index);
    let removed_entries = if index.entries.len() > MARKDOWN_HISTORY_RETENTION_LIMIT {
        index.entries.split_off(MARKDOWN_HISTORY_RETENTION_LIMIT)
    } else {
        Vec::new()
    };

    for entry in removed_entries {
        let _remove_result = fs::remove_file(markdown_history_snapshot_path(bucket, &entry.id));
    }
}

fn remove_markdown_history_snapshots(bucket: &Path, entries: &[MarkdownFileHistoryEntry]) {
    for entry in entries {
        let _remove_result = fs::remove_file(markdown_history_snapshot_path(bucket, &entry.id));
    }
}

fn truncate_markdown_history_after_current_entry(
    bucket: &Path,
    index: &mut MarkdownFileHistoryIndex,
) -> bool {
    let Some(current_entry_id) = index.current_entry_id.take() else {
        return false;
    };

    normalize_markdown_history_entries(index);
    let Some(current_index) = index
        .entries
        .iter()
        .position(|entry| entry.id == current_entry_id)
    else {
        return true;
    };
    let future_entries = index.entries.drain(..current_index).collect::<Vec<_>>();
    remove_markdown_history_snapshots(bucket, &future_entries);

    true
}

fn newest_markdown_history_contents(
    bucket: &Path,
    index: &MarkdownFileHistoryIndex,
) -> Option<String> {
    index.entries.first().and_then(|entry| {
        fs::read_to_string(markdown_history_snapshot_path(bucket, &entry.id)).ok()
    })
}

fn markdown_history_snapshot_id(bucket: &Path, created_at: u64, contents: &str) -> String {
    let content_hash = hash_hex(contents);
    let base_id = format!("{created_at}-{}", &content_hash[..12]);
    let mut id = base_id.clone();
    let mut suffix = 1;

    while markdown_history_snapshot_path(bucket, &id).exists() {
        suffix += 1;
        id = format!("{base_id}-{suffix}");
    }

    id
}

fn snapshot_markdown_file_history(
    root: &Path,
    path: &Path,
    next_contents: &str,
) -> Result<(), String> {
    if !is_markdown_history_file(path) || !path.is_file() {
        return Ok(());
    }

    let current_contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if current_contents == next_contents {
        return Ok(());
    }

    let (bucket, mut index) = load_markdown_history_index(root, path)?;
    let history_was_truncated = truncate_markdown_history_after_current_entry(&bucket, &mut index);
    if newest_markdown_history_contents(&bucket, &index).as_deref()
        == Some(current_contents.as_str())
    {
        if history_was_truncated {
            save_markdown_history_index(&bucket, &index)?;
        }
        return Ok(());
    }

    let created_at = current_time_millis();
    let id = markdown_history_snapshot_id(&bucket, created_at, &current_contents);
    let snapshots_dir = markdown_history_snapshots_dir(&bucket);
    fs::create_dir_all(&snapshots_dir).map_err(|error| error.to_string())?;
    fs::write(
        markdown_history_snapshot_path(&bucket, &id),
        &current_contents,
    )
    .map_err(|error| error.to_string())?;

    index.entries.insert(
        0,
        MarkdownFileHistoryEntry {
            id,
            created_at,
            size_bytes: current_contents.as_bytes().len() as u64,
        },
    );
    prune_markdown_history(&bucket, &mut index);
    save_markdown_history_index(&bucket, &index)
}

fn mark_markdown_history_current_entry(root: &Path, path: &Path, id: String) -> Result<(), String> {
    let (bucket, mut index) = load_markdown_history_index(root, path)?;
    if !index.entries.iter().any(|entry| entry.id == id) {
        return Err("History version was not found".to_string());
    }

    index.current_entry_id = Some(id);
    save_markdown_history_index(&bucket, &index)
}

fn list_markdown_file_history_with_root(
    root: &Path,
    path: String,
) -> Result<Vec<MarkdownFileHistoryEntry>, String> {
    let path_buf = PathBuf::from(path);
    let (_bucket, mut index) = load_markdown_history_index(root, &path_buf)?;
    normalize_markdown_history_entries(&mut index);

    Ok(index.entries)
}

fn read_markdown_file_history_with_root(
    root: &Path,
    path: String,
    id: String,
) -> Result<MarkdownFileHistoryFile, String> {
    let path_buf = PathBuf::from(path);
    let (bucket, index) = load_markdown_history_index(root, &path_buf)?;
    let entry = index
        .entries
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "History version was not found".to_string())?;
    let contents = fs::read_to_string(markdown_history_snapshot_path(&bucket, &entry.id))
        .map_err(|error| error.to_string())?;

    Ok(MarkdownFileHistoryFile {
        id: entry.id.clone(),
        contents,
    })
}

pub(super) fn write_markdown_file_with_history_root(
    root: &Path,
    path: String,
    contents: String,
) -> Result<(), String> {
    write_markdown_file_with_optional_history_root(Some(root), path, contents, false, None)
}

pub(super) fn write_markdown_file_with_optional_history_root(
    root: Option<&Path>,
    path: String,
    contents: String,
    skip_history_snapshot: bool,
    history_cursor_id: Option<String>,
) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    if let Some(root) = root.filter(|_| !skip_history_snapshot) {
        let _history_result = snapshot_markdown_file_history(root, &path_buf, &contents);
    }

    fs::write(&path_buf, contents).map_err(|error| error.to_string())?;

    if skip_history_snapshot {
        if let (Some(root), Some(history_cursor_id)) = (root, history_cursor_id) {
            mark_markdown_history_current_entry(root, &path_buf, history_cursor_id)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn list_markdown_file_history(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<MarkdownFileHistoryEntry>, String> {
    list_markdown_file_history_with_root(&markdown_history_root(&app)?, path)
}

#[tauri::command]
pub(crate) fn read_markdown_file_history(
    app: tauri::AppHandle,
    path: String,
    id: String,
) -> Result<MarkdownFileHistoryFile, String> {
    read_markdown_file_history_with_root(&markdown_history_root(&app)?, path, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_existing_markdown_before_overwriting() {
        let root = std::env::temp_dir().join(format!(
            "markra-history-write-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let history_root = root.join("history");
        let note = root.join("Synthetic.md");
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Initial\n\nSynthetic body").expect("markdown file should be created");

        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# Updated\n\nSynthetic body".to_string(),
        )
        .expect("markdown file should be written");

        assert_eq!(
            fs::read_to_string(&note).expect("markdown file should be readable"),
            "# Updated\n\nSynthetic body"
        );

        let entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].size_bytes, 25);

        let history_file = read_markdown_file_history_with_root(
            &history_root,
            note.to_string_lossy().to_string(),
            entries[0].id.clone(),
        )
        .expect("history file should read");
        assert_eq!(history_file.contents, "# Initial\n\nSynthetic body");

        fs::remove_dir_all(root).expect("test folder should be removed");
    }

    #[test]
    fn skips_history_snapshot_when_saved_contents_match_disk() {
        let root = std::env::temp_dir().join(format!(
            "markra-history-unchanged-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let history_root = root.join("history");
        let note = root.join("Synthetic.md");
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Same\n\nSynthetic body").expect("markdown file should be created");

        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# Same\n\nSynthetic body".to_string(),
        )
        .expect("markdown file should be written");

        let entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        assert!(entries.is_empty());

        fs::remove_dir_all(root).expect("test folder should be removed");
    }

    #[test]
    fn skips_history_snapshot_when_requested() {
        let root = std::env::temp_dir().join(format!(
            "markra-history-skip-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let history_root = root.join("history");
        let note = root.join("Synthetic.md");
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Current\n\nSynthetic body").expect("markdown file should be created");

        write_markdown_file_with_optional_history_root(
            Some(&history_root),
            note.to_string_lossy().to_string(),
            "# Earlier\n\nSynthetic body".to_string(),
            true,
            None,
        )
        .expect("markdown file should be written");

        assert_eq!(
            fs::read_to_string(&note).expect("markdown file should be readable"),
            "# Earlier\n\nSynthetic body"
        );

        let entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        assert!(entries.is_empty());

        fs::remove_dir_all(root).expect("test folder should be removed");
    }

    #[test]
    fn truncates_future_history_after_saving_from_a_restored_state() {
        let root = std::env::temp_dir().join(format!(
            "markra-history-linear-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let history_root = root.join("history");
        let note = root.join("Synthetic.md");
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# State A\n\nSynthetic body").expect("markdown file should be created");

        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# State B\n\nSynthetic body".to_string(),
        )
        .expect("state B should be written");
        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# State C\n\nSynthetic body".to_string(),
        )
        .expect("state C should be written");
        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# State D\n\nSynthetic body".to_string(),
        )
        .expect("state D should be written");

        let initial_entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        assert_eq!(initial_entries.len(), 3);
        let restored_entry = initial_entries
            .iter()
            .find(|entry| {
                read_markdown_file_history_with_root(
                    &history_root,
                    note.to_string_lossy().to_string(),
                    entry.id.clone(),
                )
                .expect("history entry should read")
                .contents
                    == "# State B\n\nSynthetic body"
            })
            .expect("state B history should exist");

        write_markdown_file_with_optional_history_root(
            Some(&history_root),
            note.to_string_lossy().to_string(),
            "# State B\n\nSynthetic body".to_string(),
            true,
            Some(restored_entry.id.clone()),
        )
        .expect("restored state should be written");

        let restored_entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        assert_eq!(restored_entries.len(), 3);

        write_markdown_file_with_history_root(
            &history_root,
            note.to_string_lossy().to_string(),
            "# State E\n\nSynthetic body".to_string(),
        )
        .expect("state E should be written");

        let entries =
            list_markdown_file_history_with_root(&history_root, note.to_string_lossy().to_string())
                .expect("history should list");
        let entry_contents = entries
            .iter()
            .map(|entry| {
                read_markdown_file_history_with_root(
                    &history_root,
                    note.to_string_lossy().to_string(),
                    entry.id.clone(),
                )
                .expect("history entry should read")
                .contents
            })
            .collect::<Vec<_>>();
        assert_eq!(
            entry_contents,
            vec![
                "# State B\n\nSynthetic body".to_string(),
                "# State A\n\nSynthetic body".to_string(),
            ]
        );
        assert_eq!(
            fs::read_to_string(&note).expect("markdown file should be readable"),
            "# State E\n\nSynthetic body"
        );

        fs::remove_dir_all(root).expect("test folder should be removed");
    }

    #[test]
    fn writes_markdown_when_history_root_is_unavailable() {
        let root = std::env::temp_dir().join(format!(
            "markra-history-unavailable-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("Synthetic.md");
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Initial\n\nSynthetic body").expect("markdown file should be created");

        write_markdown_file_with_optional_history_root(
            None,
            note.to_string_lossy().to_string(),
            "# Updated\n\nSynthetic body".to_string(),
            false,
            None,
        )
        .expect("markdown file should be written");

        assert_eq!(
            fs::read_to_string(&note).expect("markdown file should be readable"),
            "# Updated\n\nSynthetic body"
        );

        fs::remove_dir_all(root).expect("test folder should be removed");
    }
}
