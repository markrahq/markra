use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::windows::{
    editor_window_url_for_folder, editor_window_url_for_path, spawn_editor_window,
};
use tauri::Manager;

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub(crate) struct MarkdownFile {
    pub(crate) path: String,
    pub(crate) contents: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub(crate) struct MarkdownTemplateFile {
    pub(crate) contents: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PandocExportFormat {
    Docx,
    Epub,
    Latex,
}

impl PandocExportFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Epub => "epub",
            Self::Latex => "tex",
        }
    }

    fn pandoc_writer(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Epub => "epub",
            Self::Latex => "latex",
        }
    }
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MarkdownFolderEntryKind {
    Asset,
    File,
    Folder,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) created_at: Option<u64>,
    pub(crate) kind: MarkdownFolderEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) modified_at: Option<u64>,
    pub(crate) path: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardImageFile {
    pub(crate) relative_path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownImageFile {
    pub(crate) bytes: Vec<u8>,
    pub(crate) mime_type: String,
    pub(crate) path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum MarkdownOpenPath {
    File { path: String },
    Folder { path: String },
}

fn is_markdown_tree_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

fn is_markdown_tree_asset_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "avif" | "bmp" | "gif" | "jpg" | "jpeg" | "png" | "svg" | "webp"
            )
        })
}

fn markdown_tree_file_kind(path: &Path) -> Result<MarkdownFolderEntryKind, String> {
    if is_markdown_tree_file(path) {
        return Ok(MarkdownFolderEntryKind::File);
    }

    if is_markdown_tree_asset_file(path) {
        return Ok(MarkdownFolderEntryKind::Asset);
    }

    Err("File must be Markdown or a supported image asset".to_string())
}

fn is_markdown_open_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn system_time_millis(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| duration.as_millis().try_into().ok())
}

fn file_metadata_time_millis(
    metadata: &fs::Metadata,
    read_time: impl FnOnce(&fs::Metadata) -> std::io::Result<SystemTime>,
) -> Option<u64> {
    read_time(metadata).ok().and_then(system_time_millis)
}

pub(crate) fn markdown_open_path_for_path(path: &Path) -> Result<MarkdownOpenPath, String> {
    if path.is_dir() {
        return Ok(MarkdownOpenPath::Folder {
            path: path_to_string(path),
        });
    }

    if path.is_file() && is_markdown_open_file(path) {
        return Ok(MarkdownOpenPath::File {
            path: path_to_string(path),
        });
    }

    Err("Selected path is not a supported Markdown file or folder".to_string())
}

fn should_skip_markdown_tree_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| matches!(name, ".git" | "node_modules" | "target" | "dist" | "build"))
}

fn markdown_tree_relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative_path = path.strip_prefix(root).map_err(|error| error.to_string())?;
    let parts = relative_path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>();

    Ok(parts.join("/"))
}

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

fn allow_asset_directory<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    directory: &Path,
) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(directory, true)
        .map_err(|error| error.to_string())
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

fn markdown_folder_file(
    root: &Path,
    path: &Path,
    kind: MarkdownFolderEntryKind,
) -> Result<MarkdownFolderFile, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at = file_metadata_time_millis(&metadata, fs::Metadata::modified);
    let created_at = file_metadata_time_millis(&metadata, fs::Metadata::created).or(modified_at);

    Ok(MarkdownFolderFile {
        created_at,
        kind,
        modified_at,
        path: path_to_string(path),
        relative_path: markdown_tree_relative_path(root, path)?,
    })
}

fn collect_markdown_tree_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<MarkdownFolderFile>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    entries.sort_by(|a, b| {
        a.file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().to_string_lossy().to_lowercase())
    });

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if !should_skip_markdown_tree_directory(&path) {
                files.push(markdown_folder_file(
                    root,
                    &path,
                    MarkdownFolderEntryKind::Folder,
                )?);
                collect_markdown_tree_files(root, &path, files)?;
            }
            continue;
        }

        if file_type.is_file() {
            if is_markdown_tree_file(&path) {
                files.push(markdown_folder_file(
                    root,
                    &path,
                    MarkdownFolderEntryKind::File,
                )?);
            } else if is_markdown_tree_asset_file(&path) {
                files.push(markdown_folder_file(
                    root,
                    &path,
                    MarkdownFolderEntryKind::Asset,
                )?);
            }
        }
    }

    Ok(())
}

fn markdown_tree_root_for_path(path: &Path) -> Result<PathBuf, String> {
    if path.is_dir() {
        return Ok(path.to_path_buf());
    }

    if path.is_file() {
        return path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Current Markdown folder is invalid".to_string());
    }

    if is_markdown_open_file(path) || is_markdown_tree_asset_file(path) {
        let parent = path
            .parent()
            .ok_or_else(|| "Current Markdown folder is invalid".to_string())?;
        if parent.is_dir() {
            return Ok(parent.to_path_buf());
        }
    }

    Err("Markdown folder no longer exists".to_string())
}

fn normalize_markdown_tree_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_name = normalize_markdown_tree_single_file_name(file_name)?;
    let candidate = Path::new(&trimmed_name);

    if candidate.extension().is_none() {
        return Ok(format!("{trimmed_name}.md"));
    }

    if !is_markdown_tree_file(candidate) {
        return Err("File must use .md or .markdown".to_string());
    }

    Ok(trimmed_name)
}

fn normalize_markdown_tree_rename_file_name(
    file_name: &str,
    source_path: &Path,
) -> Result<String, String> {
    let trimmed_name = normalize_markdown_tree_single_file_name(file_name)?;
    let candidate = Path::new(&trimmed_name);
    let normalized_name = if candidate.extension().is_some() {
        trimmed_name
    } else if is_markdown_tree_asset_file(source_path) {
        let extension = source_path
            .extension()
            .and_then(|extension| extension.to_str())
            .ok_or_else(|| "Image file extension is invalid".to_string())?;

        format!("{trimmed_name}.{extension}")
    } else {
        format!("{trimmed_name}.md")
    };
    let normalized_candidate = Path::new(&normalized_name);

    if is_markdown_tree_file(source_path) && !is_markdown_tree_file(normalized_candidate) {
        return Err("File must use .md or .markdown".to_string());
    }

    if is_markdown_tree_asset_file(source_path)
        && !is_markdown_tree_asset_file(normalized_candidate)
    {
        return Err("Image file must use a supported image extension".to_string());
    }

    Ok(normalized_name)
}

fn normalize_markdown_tree_single_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_name = file_name.trim();
    if trimmed_name.is_empty() {
        return Err("File name is required".to_string());
    }

    let candidate = Path::new(trimmed_name);
    if candidate.components().count() != 1
        || trimmed_name.contains('/')
        || trimmed_name.contains('\\')
    {
        return Err("File name cannot include folders".to_string());
    }

    let Some(stem) = candidate.file_stem().and_then(|stem| stem.to_str()) else {
        return Err("File name is invalid".to_string());
    };

    if stem.trim().is_empty() || matches!(trimmed_name, "." | "..") {
        return Err("File name is invalid".to_string());
    }

    Ok(trimmed_name.to_string())
}

fn normalize_markdown_template_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_name = normalize_markdown_tree_single_file_name(file_name)?;
    let candidate = Path::new(&trimmed_name);

    if candidate
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Ok(trimmed_name);
    }

    Err("Template file must use .md".to_string())
}

fn markdown_template_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("templates"))
        .map_err(|error| error.to_string())
}

fn markdown_template_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(markdown_template_dir(app)?.join(normalize_markdown_template_file_name(file_name)?))
}

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::new();

    for byte in path.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn file_url_from_path(path: &Path) -> String {
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    let absolute_path = if normalized_path.starts_with('/') {
        normalized_path
    } else if normalized_path.len() >= 2 && normalized_path.as_bytes()[1] == b':' {
        format!("/{normalized_path}")
    } else {
        format!("/{normalized_path}")
    };

    format!("file://{}", encode_file_url_path(&absolute_path))
}

fn browser_pdf_arguments(
    source_path: &Path,
    target_path: &Path,
    profile_path: &Path,
) -> Vec<String> {
    vec![
        "--headless=new".to_string(),
        "--disable-gpu".to_string(),
        "--allow-file-access-from-files".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-component-update".to_string(),
        "--disable-extensions".to_string(),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        format!("--user-data-dir={}", profile_path.display()),
        "--no-pdf-header-footer".to_string(),
        format!("--print-to-pdf={}", target_path.display()),
        file_url_from_path(source_path),
    ]
}

fn path_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;

    for directory in std::env::split_paths(&path) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(target_os = "windows")]
        {
            let exe_candidate = directory.join(format!("{name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }

    None
}

fn pdf_renderer_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            PathBuf::from("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ]);
    }

    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
            if let Some(base_path) = std::env::var_os(variable) {
                let base_path = PathBuf::from(base_path);
                candidates.extend([
                    base_path.join("Google/Chrome/Application/chrome.exe"),
                    base_path.join("Chromium/Application/chrome.exe"),
                    base_path.join("Microsoft/Edge/Application/msedge.exe"),
                ]);
            }
        }
    }

    for executable in [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
        "msedge",
    ] {
        if let Some(candidate) = path_executable(executable) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn find_pdf_renderer() -> Option<PathBuf> {
    pdf_renderer_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn pandoc_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for executable in ["pandoc"] {
        if let Some(candidate) = path_executable(executable) {
            candidates.push(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/pandoc"),
            PathBuf::from("/usr/local/bin/pandoc"),
        ]);
    }

    candidates
}

fn detect_pandoc_path_from_candidates(
    candidates: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn find_pandoc(path: &str) -> Result<PathBuf, String> {
    let trimmed_path = path.trim();
    if !trimmed_path.is_empty() {
        let candidate = PathBuf::from(trimmed_path);
        if candidate.is_file() {
            return Ok(candidate);
        }

        return Err(format!("Pandoc executable not found: {trimmed_path}"));
    }

    detect_pandoc_path_from_candidates(pandoc_candidates()).ok_or_else(|| {
            "Pandoc export requires Pandoc. Install Pandoc or set the executable path in Export settings."
                .to_string()
        })
}

fn unique_pandoc_export_temp_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    std::env::temp_dir().join(format!(
        "markra-pandoc-export-{}-{nanos}",
        std::process::id()
    ))
}

fn parse_pandoc_extra_args(args: &str) -> Result<Vec<String>, String> {
    let mut parsed = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for character in args.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }

        if character == '\\' {
            escaped = true;
            continue;
        }

        if let Some(quote_character) = quote {
            if character == quote_character {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }

        if character == '\'' || character == '"' {
            quote = Some(character);
            continue;
        }

        if character.is_whitespace() {
            if !current.is_empty() {
                parsed.push(current);
                current = String::new();
            }
            continue;
        }

        current.push(character);
    }

    if escaped {
        current.push('\\');
    }

    if quote.is_some() {
        return Err("Pandoc arguments contain an unterminated quote".to_string());
    }

    if !current.is_empty() {
        parsed.push(current);
    }

    Ok(parsed)
}

fn parent_directory_from_path(path: &str) -> Option<PathBuf> {
    PathBuf::from(path).parent().map(Path::to_path_buf)
}

fn pandoc_working_directory(document_path: Option<&str>, target_path: &Path) -> PathBuf {
    document_path
        .and_then(parent_directory_from_path)
        .or_else(|| target_path.parent().map(Path::to_path_buf))
        .unwrap_or_else(std::env::temp_dir)
}

fn unique_pdf_export_temp_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    std::env::temp_dir().join(format!("markra-pdf-export-{}-{nanos}", std::process::id()))
}

fn pdf_output_file_size(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .map(|metadata| metadata.len())
        .filter(|size| *size > 0)
}

fn run_pdf_renderer_process_with_timeout(
    binary: &Path,
    args: &[String],
    target_path: &Path,
    timeout: Duration,
    poll_interval: Duration,
    stable_output_duration: Duration,
) -> Result<bool, String> {
    let mut child = Command::new(binary)
        .args(args)
        .spawn()
        .map_err(|error| format!("Failed to launch PDF renderer: {error}"))?;
    let started_at = Instant::now();
    let mut last_output_size = 0;
    let mut stable_output_since: Option<Instant> = None;

    loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Ok(status.success());
        }

        let now = Instant::now();
        if let Some(output_size) = pdf_output_file_size(target_path) {
            if output_size == last_output_size {
                let stable_since = stable_output_since.get_or_insert(now);
                if now.duration_since(*stable_since) >= stable_output_duration {
                    let _kill_result = child.kill();
                    let _wait_result = child.wait();
                    return Ok(true);
                }
            } else {
                last_output_size = output_size;
                stable_output_since = Some(now);
            }
        }

        if now.duration_since(started_at) >= timeout {
            let _kill_result = child.kill();
            let _wait_result = child.wait();
            return Ok(false);
        }

        thread::sleep(poll_interval);
    }
}

fn run_pdf_renderer_process(
    binary: &Path,
    args: &[String],
    target_path: &Path,
) -> Result<bool, String> {
    run_pdf_renderer_process_with_timeout(
        binary,
        args,
        target_path,
        Duration::from_secs(45),
        Duration::from_millis(100),
        Duration::from_millis(700),
    )
}

fn export_pdf_file_with_renderer(
    path: String,
    html: String,
    renderer_path: &Path,
    mut render: impl FnMut(&Path, &Path, &Path, &[String]) -> Result<bool, String>,
) -> Result<(), String> {
    if html.trim().is_empty() {
        return Err("PDF export HTML is empty".to_string());
    }

    let target_path = PathBuf::from(path);
    let temp_root = unique_pdf_export_temp_dir();
    let source_path = temp_root.join("index.html");
    let output_path = temp_root.join("output.pdf");
    let profile_path = temp_root.join("profile");

    fs::create_dir_all(&profile_path).map_err(|error| error.to_string())?;
    fs::write(&source_path, html).map_err(|error| error.to_string())?;

    let result = (|| {
        let args = browser_pdf_arguments(&source_path, &output_path, &profile_path);
        if !render(renderer_path, &source_path, &output_path, &args)? {
            return Err("PDF renderer failed".to_string());
        }

        let metadata = fs::metadata(&output_path)
            .map_err(|_| "PDF renderer did not create output file".to_string())?;
        if metadata.len() == 0 {
            return Err("PDF renderer created an empty file".to_string());
        }

        fs::copy(&output_path, &target_path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    let _cleanup_result = fs::remove_dir_all(&temp_root);

    result
}

fn run_pandoc_process(
    binary: &Path,
    working_directory: &Path,
    args: &[String],
) -> Result<bool, String> {
    let status = Command::new(binary)
        .current_dir(working_directory)
        .args(args)
        .status()
        .map_err(|error| format!("Failed to launch Pandoc: {error}"))?;

    Ok(status.success())
}

fn export_pandoc_file_with_runner(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: Option<PathBuf>,
    pandoc_args: String,
    mut run: impl FnMut(&Path, &Path, &Path, &Path, &[String]) -> Result<bool, String>,
) -> Result<(), String> {
    if markdown.trim().is_empty() {
        return Err("Pandoc export Markdown is empty".to_string());
    }

    let target_path = PathBuf::from(path);
    let pandoc_binary = pandoc_path.ok_or_else(|| "Pandoc executable is required".to_string())?;
    let temp_root = unique_pandoc_export_temp_dir();
    let source_path = temp_root.join("input.md");
    let output_path = temp_root.join(format!("output.{}", format.extension()));
    let working_directory = pandoc_working_directory(document_path.as_deref(), &target_path);

    fs::create_dir_all(&temp_root).map_err(|error| error.to_string())?;
    fs::write(&source_path, markdown).map_err(|error| error.to_string())?;

    let result = (|| {
        let mut args = parse_pandoc_extra_args(&pandoc_args)?;

        if let Some(resource_path) = document_path
            .as_deref()
            .and_then(parent_directory_from_path)
        {
            args.push(format!("--resource-path={}", resource_path.display()));
        }

        args.extend([
            "--from".to_string(),
            "gfm+tex_math_dollars+tex_math_single_backslash".to_string(),
            "--to".to_string(),
            format.pandoc_writer().to_string(),
            "--output".to_string(),
            output_path.to_string_lossy().to_string(),
            source_path.to_string_lossy().to_string(),
        ]);

        if !run(
            &pandoc_binary,
            &source_path,
            &output_path,
            &working_directory,
            &args,
        )? {
            return Err("Pandoc export failed".to_string());
        }

        let metadata = fs::metadata(&output_path)
            .map_err(|_| "Pandoc did not create an output file".to_string())?;
        if metadata.len() == 0 {
            return Err("Pandoc created an empty output file".to_string());
        }

        fs::copy(&output_path, &target_path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    let _cleanup_result = fs::remove_dir_all(&temp_root);

    result
}

fn normalize_markdown_tree_folder_name(folder_name: &str) -> Result<String, String> {
    let trimmed_name = folder_name.trim();
    if trimmed_name.is_empty() {
        return Err("Folder name is required".to_string());
    }

    let candidate = Path::new(trimmed_name);
    if candidate.components().count() != 1
        || trimmed_name.contains('/')
        || trimmed_name.contains('\\')
    {
        return Err("Folder name cannot include folders".to_string());
    }

    let Some(name) = candidate.file_name().and_then(|name| name.to_str()) else {
        return Err("Folder name is invalid".to_string());
    };

    if name.trim().is_empty() || matches!(trimmed_name, "." | "..") {
        return Err("Folder name is invalid".to_string());
    }

    Ok(trimmed_name.to_string())
}

fn canonical_markdown_tree_root(root_path: &Path) -> Result<PathBuf, String> {
    markdown_tree_root_for_path(root_path)?
        .canonicalize()
        .map_err(|error| error.to_string())
}

fn canonical_markdown_tree_file(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;

    canonical_path
        .strip_prefix(root)
        .map_err(|_| "File is outside the current Markdown folder".to_string())?;

    if !canonical_path.is_file()
        || !(is_markdown_tree_file(&canonical_path) || is_markdown_tree_asset_file(&canonical_path))
    {
        return Err("Path is not a Markdown file or supported image asset".to_string());
    }

    Ok(canonical_path)
}

fn canonical_markdown_tree_entry(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;

    canonical_path
        .strip_prefix(root)
        .map_err(|_| "File is outside the current Markdown folder".to_string())?;

    if canonical_path == root {
        return Err("Cannot delete the current Markdown folder root".to_string());
    }

    if canonical_path.is_dir()
        || (canonical_path.is_file()
            && (is_markdown_tree_file(&canonical_path)
                || is_markdown_tree_asset_file(&canonical_path)))
    {
        return Ok(canonical_path);
    }

    Err("Path is not a Markdown file, supported image asset, or folder".to_string())
}

fn canonical_movable_markdown_tree_entry(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;

    canonical_path
        .strip_prefix(root)
        .map_err(|_| "File is outside the current Markdown folder".to_string())?;

    if canonical_path == root {
        return Err("Cannot move the current Markdown folder root".to_string());
    }

    if canonical_path.is_dir()
        || (canonical_path.is_file()
            && (is_markdown_tree_file(&canonical_path)
                || is_markdown_tree_asset_file(&canonical_path)))
    {
        return Ok(canonical_path);
    }

    Err("Path is not a Markdown file, supported image asset, or folder".to_string())
}

fn markdown_tree_entry_kind(path: &Path) -> Result<MarkdownFolderEntryKind, String> {
    if path.is_dir() {
        return Ok(MarkdownFolderEntryKind::Folder);
    }

    markdown_tree_file_kind(path)
}

fn ensure_markdown_tree_parent(root: &Path, parent: &Path) -> Result<(), String> {
    let canonical_parent = parent.canonicalize().map_err(|error| error.to_string())?;
    canonical_parent
        .strip_prefix(root)
        .map_err(|_| "File is outside the current Markdown folder".to_string())?;
    Ok(())
}

fn markdown_tree_target_parent(
    root: &Path,
    parent_path: Option<String>,
) -> Result<PathBuf, String> {
    let Some(parent_path) = parent_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(root.to_path_buf());
    };

    let candidate_parent = PathBuf::from(parent_path);
    let candidate_parent = if candidate_parent.is_absolute() {
        candidate_parent
    } else {
        root.join(candidate_parent)
    };
    let canonical_parent = candidate_parent
        .canonicalize()
        .map_err(|error| error.to_string())?;

    canonical_parent
        .strip_prefix(root)
        .map_err(|_| "Folder is outside the current Markdown folder".to_string())?;

    if !canonical_parent.is_dir() {
        return Err("Target folder is invalid".to_string());
    }

    Ok(canonical_parent)
}

fn markdown_open_picker_title(title: Option<String>) -> String {
    title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Open Markdown File or Folder".to_string())
}

#[cfg(target_os = "macos")]
async fn pick_markdown_path<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    title: Option<String>,
) -> Result<Option<PathBuf>, String> {
    use dispatch2::run_on_main;
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSArray, NSString};

    let panel_title = markdown_open_picker_title(title);

    Ok(autoreleasepool(|_| {
        run_on_main(|mtm| {
            let panel = NSOpenPanel::openPanel(mtm);
            let allowed_file_types = [
                NSString::from_str("md"),
                NSString::from_str("markdown"),
                NSString::from_str("txt"),
            ];
            let allowed_file_types = NSArray::from_retained_slice(&allowed_file_types);

            // NSOpenPanel can select both files and folders, while Tauri's JS dialog exposes them separately.
            panel.setCanChooseFiles(true);
            panel.setCanChooseDirectories(true);
            panel.setAllowsMultipleSelection(false);
            panel.setCanCreateDirectories(false);
            panel.setMessage(Some(&NSString::from_str(&panel_title)));

            #[allow(deprecated)]
            panel.setAllowedFileTypes(Some(&allowed_file_types));

            if panel.runModal() != NSModalResponseOK {
                return None;
            }

            let url = panel.URL()?;
            let path = url.path()?;
            Some(PathBuf::from(path.to_string()))
        })
    }))
}

#[cfg(not(target_os = "macos"))]
async fn pick_markdown_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    title: Option<String>,
) -> Result<Option<PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (path_tx, mut path_rx) = tauri::async_runtime::channel(1);

    app.dialog()
        .file()
        .set_title(markdown_open_picker_title(title))
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file(move |selected_path| {
            let _ = path_tx.try_send(selected_path);
        });

    let Some(path) = path_rx.recv().await.flatten() else {
        return Ok(None);
    };

    path.into_path()
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn read_markdown_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<MarkdownFile, String> {
    let path_buf = PathBuf::from(&path);
    let contents = fs::read_to_string(&path_buf).map_err(|error| error.to_string())?;
    if let Some(parent) = path_buf.parent() {
        allow_asset_directory(&app, parent)?;
    }

    Ok(MarkdownFile { path, contents })
}

#[tauri::command]
pub(crate) fn read_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<MarkdownTemplateFile, String> {
    let path = markdown_template_file_path(&app, &file_name)?;
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;

    Ok(MarkdownTemplateFile { contents })
}

#[tauri::command]
pub(crate) fn write_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
    contents: String,
) -> Result<(), String> {
    let dir = markdown_template_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(
        dir.join(normalize_markdown_template_file_name(&file_name)?),
        contents,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn delete_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<(), String> {
    let path = markdown_template_file_path(&app, &file_name)?;
    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn open_markdown_path(
    app: tauri::AppHandle,
    title: Option<String>,
) -> Result<Option<MarkdownOpenPath>, String> {
    let Some(path) = pick_markdown_path(&app, title).await? else {
        return Ok(None);
    };

    markdown_open_path_for_path(&path).map(Some)
}

#[tauri::command]
pub(crate) fn resolve_markdown_path(path: String) -> Result<MarkdownOpenPath, String> {
    markdown_open_path_for_path(&PathBuf::from(path))
}

fn list_markdown_files_for_path_with_asset_scope(
    path: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Vec<MarkdownFolderFile>, String> {
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?;
    let mut files = Vec::new();

    allow_root_assets(&root)?;
    collect_markdown_tree_files(&root, &root, &mut files)?;
    files.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });

    Ok(files)
}

#[tauri::command]
pub(crate) fn list_markdown_files_for_path(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<MarkdownFolderFile>, String> {
    list_markdown_files_for_path_with_asset_scope(path, |root| allow_asset_directory(&app, root))
}

#[tauri::command]
pub(crate) fn create_markdown_tree_file(
    root_path: String,
    file_name: String,
    parent_path: Option<String>,
    contents: Option<String>,
) -> Result<MarkdownFolderFile, String> {
    let root_path = PathBuf::from(root_path);
    let root = canonical_markdown_tree_root(&root_path)?;
    let normalized_file_name = normalize_markdown_tree_file_name(&file_name)?;
    let parent = markdown_tree_target_parent(&root, parent_path)?;
    let target_path = parent.join(normalized_file_name);

    ensure_markdown_tree_parent(&root, &parent)?;

    if target_path.exists() {
        return Err("File already exists".to_string());
    }

    fs::write(&target_path, contents.unwrap_or_default()).map_err(|error| error.to_string())?;

    markdown_folder_file(&root, &target_path, MarkdownFolderEntryKind::File)
}

#[tauri::command]
pub(crate) fn create_markdown_tree_folder(
    root_path: String,
    folder_name: String,
    parent_path: Option<String>,
) -> Result<MarkdownFolderFile, String> {
    let root_path = PathBuf::from(root_path);
    let root = canonical_markdown_tree_root(&root_path)?;
    let normalized_folder_name = normalize_markdown_tree_folder_name(&folder_name)?;
    let parent = markdown_tree_target_parent(&root, parent_path)?;
    let target_path = parent.join(normalized_folder_name);

    ensure_markdown_tree_parent(&root, &parent)?;

    if target_path.exists() {
        return Err("Folder already exists".to_string());
    }

    fs::create_dir(&target_path).map_err(|error| error.to_string())?;

    markdown_folder_file(&root, &target_path, MarkdownFolderEntryKind::Folder)
}

#[tauri::command]
pub(crate) fn rename_markdown_tree_file(
    root_path: String,
    path: String,
    file_name: String,
) -> Result<MarkdownFolderFile, String> {
    let root_path = PathBuf::from(root_path);
    let root = canonical_markdown_tree_root(&root_path)?;
    let source_path = canonical_markdown_tree_file(&root, &PathBuf::from(path))?;
    let normalized_file_name = normalize_markdown_tree_rename_file_name(&file_name, &source_path)?;
    let parent = source_path
        .parent()
        .ok_or_else(|| "File parent is invalid".to_string())?;
    let target_path = parent.join(normalized_file_name);

    ensure_markdown_tree_parent(&root, parent)?;

    if target_path.exists() && target_path != source_path {
        return Err("File already exists".to_string());
    }

    fs::rename(&source_path, &target_path).map_err(|error| error.to_string())?;

    markdown_folder_file(&root, &target_path, markdown_tree_file_kind(&target_path)?)
}

#[tauri::command]
pub(crate) fn move_markdown_tree_file(
    root_path: String,
    path: String,
    target_parent_path: Option<String>,
) -> Result<MarkdownFolderFile, String> {
    let root_path = PathBuf::from(root_path);
    let root = canonical_markdown_tree_root(&root_path)?;
    let source_path = canonical_movable_markdown_tree_entry(&root, &PathBuf::from(path))?;
    let target_parent = markdown_tree_target_parent(&root, target_parent_path)?;
    let source_name = source_path
        .file_name()
        .ok_or_else(|| "File name is invalid".to_string())?;
    let target_path = target_parent.join(source_name);

    ensure_markdown_tree_parent(&root, &target_parent)?;

    if source_path.is_dir()
        && (target_parent == source_path || target_parent.starts_with(&source_path))
    {
        return Err("Cannot move a folder into itself".to_string());
    }

    if target_path.exists() && target_path != source_path {
        return Err("File already exists".to_string());
    }

    if target_path != source_path {
        fs::rename(&source_path, &target_path).map_err(|error| error.to_string())?;
    }

    markdown_folder_file(&root, &target_path, markdown_tree_entry_kind(&target_path)?)
}

#[tauri::command]
pub(crate) fn delete_markdown_tree_file(root_path: String, path: String) -> Result<(), String> {
    let root_path = PathBuf::from(root_path);
    let root = canonical_markdown_tree_root(&root_path)?;
    let source_path = canonical_markdown_tree_entry(&root, &PathBuf::from(path))?;

    if source_path.is_dir() {
        fs::remove_dir_all(source_path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(source_path).map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub(crate) fn write_markdown_file(path: String, contents: String) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    fs::write(path_buf, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn export_pdf_file(path: String, html: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export_pdf_file_blocking(path, html))
        .await
        .map_err(|error| format!("PDF export task failed: {error}"))?
}

fn export_pdf_file_blocking(path: String, html: String) -> Result<(), String> {
    let renderer_path = find_pdf_renderer().ok_or_else(|| {
        "PDF export requires Google Chrome, Chromium, or Microsoft Edge".to_string()
    })?;

    export_pdf_file_with_renderer(
        path,
        html,
        &renderer_path,
        |binary, _source_path, output_path, args| {
            let renderer_succeeded = run_pdf_renderer_process(binary, args, output_path)?;
            if !renderer_succeeded {
                return Ok(false);
            }

            Ok(pdf_output_file_size(output_path).is_some())
        },
    )
}

#[tauri::command]
pub(crate) async fn export_pandoc_file(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: String,
    pandoc_args: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_pandoc_file_blocking(
            path,
            markdown,
            format,
            document_path,
            pandoc_path,
            pandoc_args,
        )
    })
    .await
    .map_err(|error| format!("Pandoc export task failed: {error}"))?
}

fn export_pandoc_file_blocking(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: String,
    pandoc_args: String,
) -> Result<(), String> {
    let pandoc_binary = find_pandoc(&pandoc_path)?;

    export_pandoc_file_with_runner(
        path,
        markdown,
        format,
        document_path,
        Some(pandoc_binary),
        pandoc_args,
        |binary, _source_path, _output_path, working_directory, args| {
            run_pandoc_process(binary, working_directory, args)
        },
    )
}

#[tauri::command]
pub(crate) async fn check_pandoc_available(pandoc_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || check_pandoc_available_blocking(pandoc_path))
        .await
        .map_err(|error| format!("Pandoc check task failed: {error}"))?
}

fn check_pandoc_available_blocking(pandoc_path: String) -> Result<(), String> {
    find_pandoc(&pandoc_path).map(|_| ())
}

#[tauri::command]
pub(crate) async fn detect_pandoc_path() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(detect_pandoc_path_blocking)
        .await
        .map_err(|error| format!("Pandoc detection task failed: {error}"))
}

fn detect_pandoc_path_blocking() -> Option<String> {
    detect_pandoc_path_from_candidates(pandoc_candidates()).map(|path| path_to_string(&path))
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
pub(crate) fn open_markdown_file_in_new_window(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    spawn_editor_window(app, editor_window_url_for_path(&path));
    Ok(())
}

#[tauri::command]
pub(crate) fn open_markdown_folder_in_new_window(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    spawn_editor_window(app, editor_window_url_for_folder(&path));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_markdown_folder_file(
        file: &MarkdownFolderFile,
        kind: MarkdownFolderEntryKind,
        path: &Path,
        relative_path: &str,
    ) {
        assert_eq!(&file.kind, &kind);
        assert_eq!(file.path, path.to_string_lossy().to_string());
        assert_eq!(file.relative_path, relative_path);
        assert!(file.created_at.is_some());
        assert!(file.modified_at.is_some());
    }

    #[test]
    fn normalizes_markdown_template_file_names() {
        assert_eq!(
            normalize_markdown_template_file_name(" standup.md ")
                .expect("template file name should normalize"),
            "standup.md"
        );
        assert!(normalize_markdown_template_file_name("../standup.md").is_err());
        assert!(normalize_markdown_template_file_name("standup.markdown").is_err());
        assert!(normalize_markdown_template_file_name("standup").is_err());
    }

    #[test]
    fn resolves_markdown_file_or_folder_path() {
        let root = std::env::temp_dir().join(format!(
            "markra-drop-resolve-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test folder should be created");
        let markdown_file = root.join("Dropped.md");
        let unsupported_file = root.join("image.png");
        fs::write(&markdown_file, "# Dropped").expect("markdown file should be created");
        fs::write(&unsupported_file, "not markdown").expect("unsupported file should be created");

        assert_eq!(
            resolve_markdown_path(root.to_string_lossy().to_string())
                .expect("folder should resolve"),
            MarkdownOpenPath::Folder {
                path: root.to_string_lossy().to_string(),
            }
        );
        assert_eq!(
            resolve_markdown_path(markdown_file.to_string_lossy().to_string())
                .expect("markdown file should resolve"),
            MarkdownOpenPath::File {
                path: markdown_file.to_string_lossy().to_string(),
            }
        );
        assert!(resolve_markdown_path(unsupported_file.to_string_lossy().to_string()).is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn lists_markdown_files_below_the_current_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");
        let assets = root.join("assets");
        let ignored = root.join("node_modules").join("package");

        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::create_dir_all(root.join("empty")).expect("empty folder should be created");
        fs::create_dir_all(&ignored).expect("ignored folder should be created");
        fs::write(root.join("Untitled.md"), "# Untitled").expect("root markdown should be created");
        fs::write(root.join("AWS.md"), "# AWS").expect("root markdown should be created");
        fs::write(assets.join("pasted-image.png"), [1, 2, 3])
            .expect("asset image should be created");
        fs::write(assets.join("raw.txt"), "raw").expect("non-asset should be created");
        fs::write(root.join("notes.txt"), "notes").expect("non-markdown should be created");
        fs::write(docs.join("guide.markdown"), "# Guide")
            .expect("nested markdown should be created");
        fs::write(ignored.join("dependency.md"), "# Dependency")
            .expect("ignored markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.join("Untitled.md").to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .expect("markdown tree should be listed");

        assert_eq!(
            files
                .iter()
                .map(|file| (&file.kind, file.relative_path.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (&MarkdownFolderEntryKind::Folder, "assets"),
                (&MarkdownFolderEntryKind::Asset, "assets/pasted-image.png"),
                (&MarkdownFolderEntryKind::File, "AWS.md"),
                (&MarkdownFolderEntryKind::Folder, "docs"),
                (&MarkdownFolderEntryKind::File, "docs/guide.markdown"),
                (&MarkdownFolderEntryKind::Folder, "empty"),
                (&MarkdownFolderEntryKind::File, "Untitled.md"),
            ]
        );
        assert!(files.iter().all(|file| file.created_at.is_some()));
        assert!(files.iter().all(|file| file.modified_at.is_some()));

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn lists_markdown_files_below_the_selected_folder() {
        let root = std::env::temp_dir().join(format!(
            "markra-folder-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");

        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::write(root.join("index.md"), "# Index").expect("root markdown should be created");
        fs::write(docs.join("note.md"), "# Note").expect("nested markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .expect("selected folder tree should be listed");

        assert_eq!(
            files
                .iter()
                .map(|file| (&file.kind, file.relative_path.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (&MarkdownFolderEntryKind::Folder, "docs"),
                (&MarkdownFolderEntryKind::File, "docs/note.md"),
                (&MarkdownFolderEntryKind::File, "index.md"),
            ]
        );
        assert!(files.iter().all(|file| file.created_at.is_some()));
        assert!(files.iter().all(|file| file.modified_at.is_some()));

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_deleted_markdown_folder_roots_instead_of_using_the_parent_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-deleted-folder-root-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test folder should be created");
        fs::remove_dir_all(&root).expect("test folder should be removed");
        let unexpected_file_name = format!(
            "Should not be created {}",
            root.file_name()
                .and_then(|name| name.to_str())
                .expect("test folder should have a UTF-8 name")
        );
        let unexpected_file = root
            .parent()
            .expect("test folder should have a parent")
            .join(format!("{unexpected_file_name}.md"));

        assert!(list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .is_err());
        assert!(create_markdown_tree_file(
            root.to_string_lossy().to_string(),
            unexpected_file_name,
            None,
            None,
        )
        .is_err());
        assert!(!unexpected_file.exists());
    }

    #[test]
    fn allows_asset_scope_when_listing_markdown_folder_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-asset-scope-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("README.md"), "# Readme").expect("markdown file should be created");

        let mut allowed_paths = Vec::new();
        list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            |path: &Path| {
                allowed_paths.push(path.to_path_buf());
                Ok(())
            },
        )
        .expect("folder files should be listed");

        assert_eq!(allowed_paths, vec![root.clone()]);

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn classifies_unified_open_picker_targets() {
        let root = std::env::temp_dir().join(format!(
            "markra-open-target-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let readme = root.join("README.md");
        let unsupported = root.join("image.png");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&readme, "# README").expect("markdown file should be created");
        fs::write(&unsupported, "not markdown").expect("unsupported file should be created");

        assert_eq!(
            markdown_open_path_for_path(&readme),
            Ok(MarkdownOpenPath::File {
                path: readme.to_string_lossy().to_string(),
            })
        );
        assert_eq!(
            markdown_open_path_for_path(&root),
            Ok(MarkdownOpenPath::Folder {
                path: root.to_string_lossy().to_string(),
            })
        );
        assert!(markdown_open_path_for_path(&unsupported).is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn localizes_unified_open_picker_title() {
        assert_eq!(
            markdown_open_picker_title(Some(" 打开 Markdown 或文件夹 ".to_string())),
            "打开 Markdown 或文件夹"
        );
        assert_eq!(
            markdown_open_picker_title(Some("   ".to_string())),
            "Open Markdown File or Folder"
        );
        assert_eq!(
            markdown_open_picker_title(None),
            "Open Markdown File or Folder"
        );
    }

    #[test]
    fn non_macos_unified_open_picker_avoids_blocking_dialog_call() {
        let source = include_str!("markdown_files.rs");
        let blocking_pick_file_call = [".blocking", "_pick_file("].concat();
        let async_pick_file_call = [".pick", "_file(move"].concat();

        assert!(!source.contains(&blocking_pick_file_call));
        assert!(source.contains(&async_pick_file_call));
    }

    #[test]
    fn creates_renames_and_deletes_markdown_tree_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-write-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        let canonical_root = root
            .canonicalize()
            .expect("test folder should have a canonical path");

        let created = create_markdown_tree_file(
            root.to_string_lossy().to_string(),
            "Daily note".to_string(),
            None,
            None,
        )
        .expect("markdown file should be created");

        assert_markdown_folder_file(
            &created,
            MarkdownFolderEntryKind::File,
            &canonical_root.join("Daily note.md"),
            "Daily note.md",
        );
        assert_eq!(
            fs::read_to_string(root.join("Daily note.md"))
                .expect("created file should be readable"),
            ""
        );

        let templated = create_markdown_tree_file(
            root.to_string_lossy().to_string(),
            "Meeting".to_string(),
            None,
            Some("# Meeting\n\n- [ ] Follow up\n".to_string()),
        )
        .expect("templated markdown file should be created");

        assert_eq!(templated.relative_path, "Meeting.md");
        assert_eq!(
            fs::read_to_string(root.join("Meeting.md")).expect("templated file should be readable"),
            "# Meeting\n\n- [ ] Follow up\n"
        );

        let renamed = rename_markdown_tree_file(
            root.to_string_lossy().to_string(),
            created.path,
            "Journal.markdown".to_string(),
        )
        .expect("markdown file should be renamed");

        assert_markdown_folder_file(
            &renamed,
            MarkdownFolderEntryKind::File,
            &canonical_root.join("Journal.markdown"),
            "Journal.markdown",
        );
        assert!(!root.join("Daily note.md").exists());

        delete_markdown_tree_file(root.to_string_lossy().to_string(), renamed.path)
            .expect("markdown file should be deleted");

        assert!(!root.join("Journal.markdown").exists());

        let assets = root.join("assets");
        fs::create_dir_all(&assets).expect("asset folder should be created");
        let image = assets.join("pasted-image.png");
        fs::write(&image, [1_u8, 2, 3]).expect("image asset should be created");

        let renamed_image = rename_markdown_tree_file(
            root.to_string_lossy().to_string(),
            image.to_string_lossy().to_string(),
            "renamed-image.png".to_string(),
        )
        .expect("image asset should be renamed");

        assert_markdown_folder_file(
            &renamed_image,
            MarkdownFolderEntryKind::Asset,
            &canonical_root.join("assets").join("renamed-image.png"),
            "assets/renamed-image.png",
        );
        assert!(!assets.join("pasted-image.png").exists());

        delete_markdown_tree_file(root.to_string_lossy().to_string(), renamed_image.path)
            .expect("image asset should be deleted");

        assert!(!assets.join("renamed-image.png").exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn renders_pdf_html_with_browser_renderer() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let renderer = PathBuf::from("/mock/Chrome");

        fs::create_dir_all(&root).expect("test folder should be created");
        export_pdf_file_with_renderer(
            pdf.to_string_lossy().to_string(),
            "<!doctype html><html><body><h1>中文标题</h1></body></html>".to_string(),
            &renderer,
            |binary, source_path, output_path, args| {
                assert_eq!(binary, renderer.as_path());
                assert!(fs::read_to_string(source_path)
                    .expect("source html should be readable")
                    .contains("中文标题"));
                assert!(args.contains(&"--headless=new".to_string()));
                assert!(args.contains(&"--no-pdf-header-footer".to_string()));
                assert_ne!(output_path, pdf.as_path());
                assert!(args.contains(&format!("--print-to-pdf={}", output_path.display())));
                assert!(args
                    .last()
                    .expect("source file URL should be passed")
                    .starts_with("file://"));
                fs::write(output_path, b"%PDF-1.7\n").expect("mock pdf should be written");
                Ok(true)
            },
        )
        .expect("pdf should be exported");

        assert_eq!(
            fs::read(&pdf).expect("pdf file should be readable"),
            b"%PDF-1.7\n"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_empty_pdf_export_html() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-empty-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let renderer = PathBuf::from("/mock/Chrome");
        let mut renderer_called = false;

        fs::create_dir_all(&root).expect("test folder should be created");
        let result = export_pdf_file_with_renderer(
            pdf.to_string_lossy().to_string(),
            "   ".to_string(),
            &renderer,
            |_binary, _source_path, _output_path, _args| {
                renderer_called = true;
                Ok(true)
            },
        );

        assert_eq!(result, Err("PDF export HTML is empty".to_string()));
        assert!(!renderer_called);

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn parses_quoted_pandoc_arguments() {
        assert_eq!(
            parse_pandoc_extra_args("--toc --metadata title=\"Draft Notes\""),
            Ok(vec![
                "--toc".to_string(),
                "--metadata".to_string(),
                "title=Draft Notes".to_string()
            ])
        );
        assert_eq!(
            parse_pandoc_extra_args("--metadata title=\"Draft"),
            Err("Pandoc arguments contain an unterminated quote".to_string())
        );
    }

    #[test]
    fn rejects_missing_explicit_pandoc_path_before_export() {
        assert_eq!(
            check_pandoc_available_blocking("/mock/missing/pandoc".to_string()),
            Err("Pandoc executable not found: /mock/missing/pandoc".to_string())
        );
    }

    #[test]
    fn detects_first_existing_pandoc_candidate() {
        let root = std::env::temp_dir().join(format!(
            "markra-pandoc-detect-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let missing = root.join("missing-pandoc");
        let pandoc = root.join("pandoc");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&pandoc, b"mock").expect("mock pandoc should be written");

        assert_eq!(
            detect_pandoc_path_from_candidates([missing, pandoc.clone()]),
            Some(pandoc)
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn exports_markdown_with_pandoc_runner() {
        let root = std::env::temp_dir().join(format!(
            "markra-pandoc-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("notes").join("draft.md");
        let target = root.join("draft.docx");
        let pandoc = PathBuf::from("/mock/pandoc");

        fs::create_dir_all(note.parent().expect("note should have parent"))
            .expect("test folder should be created");
        export_pandoc_file_with_runner(
            target.to_string_lossy().to_string(),
            "# Draft\n\n![Chart](assets/chart.png)".to_string(),
            PandocExportFormat::Docx,
            Some(note.to_string_lossy().to_string()),
            Some(pandoc.clone()),
            "--toc --metadata title=\"Draft Notes\"".to_string(),
            |binary, input_path, output_path, working_directory, args| {
                assert_eq!(binary, pandoc.as_path());
                assert_eq!(
                    working_directory,
                    note.parent().expect("note should have parent")
                );
                assert!(fs::read_to_string(input_path)
                    .expect("source markdown should be readable")
                    .contains("![Chart](assets/chart.png)"));
                assert!(args.contains(&"--toc".to_string()));
                assert!(args.contains(&"--metadata".to_string()));
                assert!(args.contains(&"title=Draft Notes".to_string()));
                assert!(args.windows(2).any(|window| {
                    window[0] == "--from"
                        && window[1] == "gfm+tex_math_dollars+tex_math_single_backslash"
                }));
                assert!(args
                    .windows(2)
                    .any(|window| window[0] == "--to" && window[1] == "docx"));
                assert!(args
                    .windows(2)
                    .any(|window| window[0] == "--output"
                        && window[1] == output_path.to_string_lossy()));
                assert_eq!(args.last(), Some(&input_path.to_string_lossy().to_string()));
                fs::write(output_path, b"mock-docx").expect("mock export should be written");
                Ok(true)
            },
        )
        .expect("pandoc export should succeed");

        assert_eq!(
            fs::read(&target).expect("export file should be readable"),
            b"mock-docx"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn accepts_stable_pdf_output_when_renderer_keeps_running() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-renderer-hang-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let script = "printf '%s' '%PDF-1.7' > \"$1\"; while :; do :; done";
        let args = vec![
            "-c".to_string(),
            script.to_string(),
            "sh".to_string(),
            pdf.to_string_lossy().to_string(),
        ];

        fs::create_dir_all(&root).expect("test folder should be created");

        assert_eq!(
            run_pdf_renderer_process_with_timeout(
                Path::new("/bin/sh"),
                &args,
                &pdf,
                Duration::from_secs(1),
                Duration::from_millis(20),
                Duration::from_millis(80),
            ),
            Ok(true)
        );
        assert_eq!(
            fs::read(&pdf).expect("pdf file should be readable"),
            b"%PDF-1.7"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

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

    #[test]
    fn moves_markdown_tree_files_and_folders_inside_the_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-move-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        let docs = root.join("docs");
        let archive = root.join("archive");
        fs::create_dir_all(&docs).expect("source folder should be created");
        fs::create_dir_all(&archive).expect("target folder should be created");
        fs::write(docs.join("guide.md"), "# Guide").expect("markdown file should be created");
        fs::write(docs.join("notes.md"), "# Notes")
            .expect("nested markdown file should be created");
        let canonical_root = root
            .canonicalize()
            .expect("test folder should have a canonical path");

        let moved_file = move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.join("guide.md").to_string_lossy().to_string(),
            Some(archive.to_string_lossy().to_string()),
        )
        .expect("markdown file should move into the target folder");

        assert_markdown_folder_file(
            &moved_file,
            MarkdownFolderEntryKind::File,
            &canonical_root.join("archive").join("guide.md"),
            "archive/guide.md",
        );
        assert!(!docs.join("guide.md").exists());
        assert_eq!(
            fs::read_to_string(archive.join("guide.md"))
                .expect("moved markdown file should be readable"),
            "# Guide"
        );

        let moved_folder = move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.to_string_lossy().to_string(),
            Some(archive.to_string_lossy().to_string()),
        )
        .expect("markdown folder should move into the target folder");

        assert_markdown_folder_file(
            &moved_folder,
            MarkdownFolderEntryKind::Folder,
            &canonical_root.join("archive").join("docs"),
            "archive/docs",
        );
        assert!(!docs.exists());
        assert_eq!(
            fs::read_to_string(archive.join("docs").join("notes.md"))
                .expect("nested moved markdown file should be readable"),
            "# Notes"
        );

        let moved_back_to_root = move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            archive.join("guide.md").to_string_lossy().to_string(),
            None,
        )
        .expect("markdown file should move back to the root");

        assert_markdown_folder_file(
            &moved_back_to_root,
            MarkdownFolderEntryKind::File,
            &canonical_root.join("guide.md"),
            "guide.md",
        );
        assert!(!archive.join("guide.md").exists());
        assert_eq!(
            fs::read_to_string(root.join("guide.md"))
                .expect("root moved markdown file should be readable"),
            "# Guide"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_invalid_markdown_tree_moves() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-move-boundary-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let sibling = root.with_file_name(format!(
            "{}-sibling",
            root.file_name()
                .and_then(|name| name.to_str())
                .expect("root should have a file name")
        ));

        let docs = root.join("docs");
        let child = docs.join("child");
        let archive = root.join("archive");
        fs::create_dir_all(&child).expect("nested source folder should be created");
        fs::create_dir_all(&archive).expect("target folder should be created");
        fs::create_dir_all(&sibling).expect("sibling folder should be created");
        fs::write(docs.join("guide.md"), "# Guide").expect("markdown file should be created");
        fs::write(archive.join("guide.md"), "# Existing")
            .expect("conflicting file should be created");
        fs::write(sibling.join("outside.md"), "# Outside").expect("outside file should be created");

        assert!(move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            sibling.join("outside.md").to_string_lossy().to_string(),
            Some(archive.to_string_lossy().to_string())
        )
        .is_err());
        assert!(move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.to_string_lossy().to_string(),
            Some(child.to_string_lossy().to_string())
        )
        .is_err());
        assert!(move_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.join("guide.md").to_string_lossy().to_string(),
            Some(archive.to_string_lossy().to_string())
        )
        .is_err());
        assert!(docs.join("guide.md").exists());
        assert!(sibling.join("outside.md").exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
        fs::remove_dir_all(sibling).expect("sibling tree should be removed");
    }

    #[test]
    fn rejects_markdown_tree_writes_outside_the_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-write-boundary-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let sibling = root.with_file_name(format!(
            "{}-sibling",
            root.file_name()
                .and_then(|name| name.to_str())
                .expect("root should have a file name")
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::create_dir_all(&sibling).expect("sibling folder should be created");
        let outside = sibling.join("outside.md");
        fs::write(&outside, "# Outside").expect("outside file should be created");

        assert!(create_markdown_tree_file(
            root.to_string_lossy().to_string(),
            "../escape.md".to_string(),
            None,
            None
        )
        .is_err());
        assert!(rename_markdown_tree_file(
            root.to_string_lossy().to_string(),
            outside.to_string_lossy().to_string(),
            "inside.md".to_string()
        )
        .is_err());
        assert!(delete_markdown_tree_file(
            root.to_string_lossy().to_string(),
            outside.to_string_lossy().to_string()
        )
        .is_err());
        assert!(outside.exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
        fs::remove_dir_all(sibling).expect("sibling tree should be removed");
    }

    #[test]
    fn creates_markdown_tree_folders_inside_the_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-folder-write-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        let canonical_root = root
            .canonicalize()
            .expect("test folder should have a canonical path");

        let created = create_markdown_tree_folder(
            root.to_string_lossy().to_string(),
            "Research".to_string(),
            None,
        )
        .expect("markdown folder should be created");

        assert_markdown_folder_file(
            &created,
            MarkdownFolderEntryKind::Folder,
            &canonical_root.join("Research"),
            "Research",
        );
        assert!(root.join("Research").is_dir());

        let docs = root.join("docs");
        fs::create_dir_all(&docs).expect("nested parent folder should be created");
        let nested = create_markdown_tree_folder(
            root.to_string_lossy().to_string(),
            "Sprint".to_string(),
            Some(docs.to_string_lossy().to_string()),
        )
        .expect("nested markdown folder should be created");

        assert_markdown_folder_file(
            &nested,
            MarkdownFolderEntryKind::Folder,
            &canonical_root.join("docs").join("Sprint"),
            "docs/Sprint",
        );
        assert!(docs.join("Sprint").is_dir());
        assert!(create_markdown_tree_folder(
            root.to_string_lossy().to_string(),
            "../escape".to_string(),
            None
        )
        .is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn deletes_markdown_tree_folders_inside_the_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-folder-delete-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        let docs = root.join("docs");
        fs::create_dir_all(&docs).expect("test folder should be created");
        fs::write(docs.join("guide.md"), "# Guide").expect("nested file should be created");

        delete_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.to_string_lossy().to_string(),
        )
        .expect("markdown folder should be deleted");

        assert!(!docs.exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
