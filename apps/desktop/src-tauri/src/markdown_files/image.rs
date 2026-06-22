use std::fs;
use std::path::{Component, Path, PathBuf};

use super::asset::allow_asset_directory;
use super::path::{
    is_markdown_open_file, is_markdown_tree_asset_file, markdown_tree_relative_path, path_to_string,
};
use super::types::{ClipboardImageFile, MarkdownImageFile};

fn clipboard_image_extension(mime_type: &str) -> Result<&'static str, String> {
    let normalized = mime_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "image/png" => Ok("png"),
        "image/jpeg" | "image/jpg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/avif" => Ok("avif"),
        "image/bmp" => Ok("bmp"),
        "image/svg+xml" => Ok("svg"),
        _ => Err("Clipboard image type is not supported".to_string()),
    }
}

fn markdown_image_mime_type(path: &Path) -> Result<&'static str, String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "gif" => Ok("image/gif"),
        "webp" => Ok("image/webp"),
        "avif" => Ok("image/avif"),
        "bmp" => Ok("image/bmp"),
        "svg" => Ok("image/svg+xml"),
        _ => Err("Markdown image type is not supported".to_string()),
    }
}

fn strip_markdown_image_src_suffix(src: &str) -> &str {
    let query_index = src.find('?');
    let fragment_index = src.find('#');
    let end_index = [query_index, fragment_index]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(src.len());

    &src[..end_index]
}

fn percent_decode_markdown_path(path: &str) -> Result<String, String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("Markdown image path has invalid percent encoding".to_string());
            }

            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| "Markdown image path has invalid percent encoding".to_string())?;
            let byte = u8::from_str_radix(hex, 16)
                .map_err(|_| "Markdown image path has invalid percent encoding".to_string())?;
            decoded.push(byte);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8(decoded)
        .map_err(|_| "Markdown image path has invalid UTF-8 encoding".to_string())
}

fn local_markdown_image_src(src: &str) -> Result<String, String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return Err("Markdown image path is empty".to_string());
    }

    let normalized_scheme = trimmed.to_ascii_lowercase();
    if normalized_scheme.starts_with("data:") || normalized_scheme.contains("://") {
        return Err("Only local Markdown images can be read".to_string());
    }

    let local_src = strip_markdown_image_src_suffix(trimmed).trim();
    if local_src.is_empty() {
        return Err("Markdown image path is empty".to_string());
    }

    percent_decode_markdown_path(local_src)
}

fn read_markdown_image_file_for_document(
    document_path: String,
    src: String,
) -> Result<MarkdownImageFile, String> {
    const MAX_AI_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

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
    let decoded_src = local_markdown_image_src(&src)?;
    let src_path = Path::new(&decoded_src);
    let candidate_path = if src_path.is_absolute() {
        src_path.to_path_buf()
    } else {
        root.join(src_path)
    };
    let canonical_path = candidate_path
        .canonicalize()
        .map_err(|error| error.to_string())?;

    canonical_path
        .strip_prefix(&root)
        .map_err(|_| "Markdown image is outside the current Markdown folder".to_string())?;

    if !canonical_path.is_file() || !is_markdown_tree_asset_file(&canonical_path) {
        return Err("Path is not a supported Markdown image".to_string());
    }

    let metadata = fs::metadata(&canonical_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_AI_IMAGE_BYTES {
        return Err("Markdown image is too large for AI vision context".to_string());
    }

    Ok(MarkdownImageFile {
        bytes: fs::read(&canonical_path).map_err(|error| error.to_string())?,
        mime_type: markdown_image_mime_type(&canonical_path)?.to_string(),
        path: path_to_string(&canonical_path),
    })
}

fn read_local_image_file_for_import(path: String) -> Result<MarkdownImageFile, String> {
    let canonical_path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if !canonical_path.is_file() || !is_markdown_tree_asset_file(&canonical_path) {
        return Err("Path is not a supported image".to_string());
    }

    Ok(MarkdownImageFile {
        bytes: fs::read(&canonical_path).map_err(|error| error.to_string())?,
        mime_type: markdown_image_mime_type(&canonical_path)?.to_string(),
        path: path_to_string(&canonical_path),
    })
}

fn normalize_clipboard_image_folder(folder: &str) -> Result<PathBuf, String> {
    let normalized = folder.trim().replace('\\', "/");
    if normalized == "." {
        return Ok(PathBuf::new());
    }

    let candidate = Path::new(&normalized);
    if normalized.is_empty() || candidate.is_absolute() {
        return Err("Clipboard image folder must be relative".to_string());
    }

    let mut target = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            _ => return Err("Clipboard image folder cannot leave the current folder".to_string()),
        }
    }

    if target.as_os_str().is_empty() {
        return Err("Clipboard image folder is invalid".to_string());
    }

    Ok(target)
}

fn requested_clipboard_image_stem(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || matches!(trimmed, "." | "..")
    {
        return Err("Clipboard image file name is invalid".to_string());
    }

    let stem = trimmed
        .rsplit_once('.')
        .map_or(trimmed, |(stem, _)| stem)
        .trim();
    if stem.is_empty() || matches!(stem, "." | "..") {
        return Err("Clipboard image file name is invalid".to_string());
    }

    Ok(stem.to_string())
}

fn clipboard_image_file_name(
    extension: &str,
    attempt: usize,
    requested_file_name: Option<&str>,
) -> Result<String, String> {
    if let Some(file_name) = requested_file_name {
        let stem = requested_clipboard_image_stem(file_name)?;
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{}", attempt + 1)
        };

        return Ok(format!("{stem}{suffix}.{extension}"));
    }

    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let suffix = if attempt == 0 {
        String::new()
    } else {
        format!("-{}", attempt + 1)
    };

    Ok(format!("pasted-image-{millis}{suffix}.{extension}"))
}

fn save_clipboard_image_file(
    document_path: String,
    folder: String,
    mime_type: String,
    bytes: Vec<u8>,
    file_name: Option<String>,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<ClipboardImageFile, String> {
    if bytes.is_empty() {
        return Err("Clipboard image is empty".to_string());
    }

    let extension = clipboard_image_extension(&mime_type)?;
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
    let folder = normalize_clipboard_image_folder(&folder)?;
    let target_folder = root.join(folder);

    fs::create_dir_all(&target_folder).map_err(|error| error.to_string())?;
    target_folder
        .canonicalize()
        .map_err(|error| error.to_string())?
        .strip_prefix(&root)
        .map_err(|_| "Clipboard image folder is outside the current Markdown folder".to_string())?;

    for attempt in 0..1000 {
        let target_path = target_folder.join(clipboard_image_file_name(
            extension,
            attempt,
            file_name.as_deref(),
        )?);
        if target_path.exists() {
            continue;
        }

        fs::write(&target_path, &bytes).map_err(|error| error.to_string())?;
        return Ok(ClipboardImageFile {
            relative_path: markdown_tree_relative_path(&root, &target_path)?,
        });
    }

    Err("Could not create a unique clipboard image file".to_string())
}

#[tauri::command]
pub(crate) fn save_clipboard_image(
    app: tauri::AppHandle,
    document_path: String,
    folder: String,
    mime_type: String,
    bytes: Vec<u8>,
    file_name: Option<String>,
) -> Result<ClipboardImageFile, String> {
    save_clipboard_image_file(document_path, folder, mime_type, bytes, file_name, |root| {
        allow_asset_directory(&app, root)
    })
}

#[tauri::command]
pub(crate) fn read_markdown_image_file(
    document_path: String,
    src: String,
) -> Result<MarkdownImageFile, String> {
    read_markdown_image_file_for_document(document_path, src)
}

#[tauri::command]
pub(crate) fn read_local_image_file(path: String) -> Result<MarkdownImageFile, String> {
    read_local_image_file_for_import(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_clipboard_images_below_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-clipboard-image-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");

        let saved = save_clipboard_image_file(
            note.to_string_lossy().to_string(),
            "assets/screenshots".to_string(),
            "image/png".to_string(),
            vec![1, 2, 3],
            None,
            |_| Ok(()),
        )
        .expect("clipboard image should be saved");

        assert!(saved
            .relative_path
            .starts_with("assets/screenshots/pasted-image-"));
        assert!(saved.relative_path.ends_with(".png"));
        assert_eq!(
            fs::read(root.join(saved.relative_path)).expect("saved image should be readable"),
            vec![1, 2, 3]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn saves_clipboard_images_with_the_requested_file_name() {
        let root = std::env::temp_dir().join(format!(
            "markra-clipboard-image-name-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");

        let saved = save_clipboard_image_file(
            note.to_string_lossy().to_string(),
            "assets".to_string(),
            "image/png".to_string(),
            vec![1, 2, 3],
            Some("diagram-from-rule.png".to_string()),
            |_| Ok(()),
        )
        .expect("clipboard image should use the requested name");

        assert_eq!(saved.relative_path, "assets/diagram-from-rule.png");
        assert_eq!(
            fs::read(root.join(saved.relative_path)).expect("saved image should be readable"),
            vec![1, 2, 3]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn saves_svg_clipboard_images_with_svg_extension() {
        assert_eq!(
            clipboard_image_extension("image/svg+xml").expect("SVG images should be supported"),
            "svg"
        );
    }

    #[test]
    fn reads_markdown_images_below_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-read-image-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");
        let assets = root.join("assets");
        let image = assets.join("arch.png");

        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");
        fs::write(&image, [104, 101, 108, 108, 111]).expect("image file should be created");

        let read = read_markdown_image_file_for_document(
            note.to_string_lossy().to_string(),
            "assets/arch.png".to_string(),
        )
        .expect("markdown image should be readable");

        assert_eq!(
            read,
            MarkdownImageFile {
                bytes: vec![104, 101, 108, 108, 111],
                mime_type: "image/png".to_string(),
                path: image
                    .canonicalize()
                    .expect("image should have a canonical path")
                    .to_string_lossy()
                    .to_string(),
            }
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn reads_supported_local_images_for_import() {
        let root = std::env::temp_dir().join(format!(
            "markra-read-local-image-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test folder should be created");
        let image = root.join("Local Diagram.png");
        fs::write(&image, [1, 2, 3]).expect("image file should be created");

        let read = read_local_image_file_for_import(image.to_string_lossy().to_string())
            .expect("local image should be readable for import");

        assert_eq!(read.bytes, vec![1, 2, 3]);
        assert_eq!(read.mime_type, "image/png");
        assert_eq!(
            read.path,
            path_to_string(&image.canonicalize().expect("image should canonicalize"))
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_markdown_images_outside_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-read-image-boundary-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let sibling = std::env::temp_dir().join(format!(
            "markra-read-image-sibling-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");
        let image = sibling.join("arch.png");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::create_dir_all(&sibling).expect("sibling folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");
        fs::write(&image, [1, 2, 3]).expect("sibling image file should be created");

        assert!(read_markdown_image_file_for_document(
            note.to_string_lossy().to_string(),
            "../".to_string()
                + sibling
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                + "/arch.png",
        )
        .is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
        fs::remove_dir_all(sibling).expect("sibling tree should be removed");
    }

    #[test]
    fn rejects_clipboard_image_folders_outside_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-clipboard-image-boundary-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");

        assert!(save_clipboard_image_file(
            note.to_string_lossy().to_string(),
            "../outside".to_string(),
            "image/png".to_string(),
            vec![1, 2, 3],
            None,
            |_| Ok(()),
        )
        .is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
