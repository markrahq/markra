use std::fs;
use std::path::PathBuf;

use super::asset::allow_asset_directory;
use super::history::{
    markdown_history_root, write_markdown_file_with_history_root,
    write_markdown_file_with_optional_history_root,
};
use super::types::MarkdownFile;

#[tauri::command]
pub(crate) fn read_markdown_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<MarkdownFile, String> {
    let path_buf = PathBuf::from(&path);
    let size_bytes = fs::metadata(&path_buf)
        .map_err(|error| error.to_string())?
        .len();
    let contents = fs::read_to_string(&path_buf).map_err(|error| error.to_string())?;
    if let Some(parent) = path_buf.parent() {
        allow_asset_directory(&app, parent)?;
    }

    Ok(MarkdownFile {
        path,
        contents,
        size_bytes,
    })
}

#[tauri::command]
pub(crate) fn write_markdown_file(
    app: tauri::AppHandle,
    path: String,
    contents: String,
    skip_history_snapshot: Option<bool>,
    history_cursor_id: Option<String>,
) -> Result<(), String> {
    match markdown_history_root(&app) {
        Ok(history_root) if skip_history_snapshot.unwrap_or(false) => {
            write_markdown_file_with_optional_history_root(
                Some(&history_root),
                path,
                contents,
                true,
                history_cursor_id,
            )
        }
        Ok(history_root) => write_markdown_file_with_history_root(&history_root, path, contents),
        Err(_) => write_markdown_file_with_optional_history_root(None, path, contents, false, None),
    }
}
