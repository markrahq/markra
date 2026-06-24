use std::fs;
use std::path::{Component, Path, PathBuf};

use super::asset::allow_asset_directory;
use super::path::{is_markdown_open_file, markdown_tree_relative_path};
use super::types::ClipboardAttachmentFile;

fn normalize_clipboard_attachment_folder(folder: &str) -> Result<PathBuf, String> {
    let normalized = folder.trim().replace('\\', "/");
    if normalized == "." {
        return Ok(PathBuf::new());
    }

    let candidate = Path::new(&normalized);
    if normalized.is_empty() || candidate.is_absolute() {
        return Err("Clipboard attachment folder must be relative".to_string());
    }

    let mut target = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            _ => {
                return Err(
                    "Clipboard attachment folder cannot leave the current folder".to_string(),
                )
            }
        }
    }

    if target.as_os_str().is_empty() {
        return Err("Clipboard attachment folder is invalid".to_string());
    }

    Ok(target)
}

fn requested_clipboard_attachment_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || matches!(trimmed, "." | "..")
    {
        return Err("Clipboard attachment file name is invalid".to_string());
    }

    let candidate = Path::new(trimmed);
    if candidate.components().count() != 1 {
        return Err("Clipboard attachment file name cannot include folders".to_string());
    }

    let Some(stem) = candidate.file_stem().and_then(|stem| stem.to_str()) else {
        return Err("Clipboard attachment file name is invalid".to_string());
    };

    if stem.trim().is_empty() || matches!(stem.trim(), "." | "..") {
        return Err("Clipboard attachment file name is invalid".to_string());
    }

    Ok(trimmed.to_string())
}

fn clipboard_attachment_file_name(file_name: &str, attempt: usize) -> Result<String, String> {
    let requested_name = requested_clipboard_attachment_file_name(file_name)?;
    if attempt == 0 {
        return Ok(requested_name);
    }

    let path = Path::new(&requested_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Clipboard attachment file name is invalid".to_string())?;
    let suffix = format!("-{}", attempt + 1);

    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        return Ok(format!("{stem}{suffix}.{extension}"));
    }

    Ok(format!("{stem}{suffix}"))
}

fn save_clipboard_attachment_file(
    document_path: String,
    folder: String,
    bytes: Vec<u8>,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    if bytes.is_empty() {
        return Err("Clipboard attachment is empty".to_string());
    }

    let document_path = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !document_path.is_file() || !is_markdown_open_file(&document_path) {
        return Err("Current document must be a saved Markdown file".to_string());
    }

    let root = document_path
        .parent()
        .ok_or_else(|| "Current document folder is invalid".to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    allow_root_assets(&root)?;
    let folder = normalize_clipboard_attachment_folder(&folder)?;
    let target_folder = root.join(folder);

    fs::create_dir_all(&target_folder).map_err(|error| error.to_string())?;
    target_folder
        .canonicalize()
        .map_err(|error| error.to_string())?
        .strip_prefix(&root)
        .map_err(|_| {
            "Clipboard attachment folder is outside the current Markdown folder".to_string()
        })?;

    for attempt in 0..1000 {
        let target_path = target_folder.join(clipboard_attachment_file_name(&file_name, attempt)?);
        if target_path.exists() {
            continue;
        }

        fs::write(&target_path, &bytes).map_err(|error| error.to_string())?;
        return Ok(ClipboardAttachmentFile {
            relative_path: markdown_tree_relative_path(&root, &target_path)?,
        });
    }

    Err("Could not create a unique clipboard attachment file".to_string())
}

#[tauri::command]
pub(crate) fn save_clipboard_attachment(
    app: tauri::AppHandle,
    document_path: String,
    folder: String,
    bytes: Vec<u8>,
    file_name: String,
) -> Result<ClipboardAttachmentFile, String> {
    save_clipboard_attachment_file(document_path, folder, bytes, file_name, |root| {
        allow_asset_directory(&app, root)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_clipboard_attachments_below_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-clipboard-attachment-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");

        let saved = save_clipboard_attachment_file(
            note.to_string_lossy().to_string(),
            "assets/files".to_string(),
            vec![4, 5, 6],
            "Reference Doc.docx".to_string(),
            |_| Ok(()),
        )
        .expect("clipboard attachment should be saved");

        assert_eq!(saved.relative_path, "assets/files/Reference Doc.docx");
        assert_eq!(
            fs::read(root.join(saved.relative_path)).expect("saved attachment should be readable"),
            vec![4, 5, 6]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn creates_unique_clipboard_attachment_file_names() {
        assert_eq!(
            clipboard_attachment_file_name("Reference Doc.docx", 0)
                .expect("initial name should be valid"),
            "Reference Doc.docx"
        );
        assert_eq!(
            clipboard_attachment_file_name("Reference Doc.docx", 1)
                .expect("second name should be valid"),
            "Reference Doc-2.docx"
        );
    }
}
