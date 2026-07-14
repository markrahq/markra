use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use super::asset::allow_asset_directory;
use super::ignore_rules::MarkdownIgnoreRules;
use super::path::{
    is_markdown_tree_asset_file, is_markdown_tree_attachment_file, is_markdown_tree_file,
    markdown_folder_file, markdown_tree_file_kind, markdown_tree_root_for_path,
    normalize_markdown_tree_single_file_name,
};
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};
use tauri::Emitter;

const MARKDOWN_TREE_LOAD_EVENT: &str = "markra://markdown-tree-load";
const MARKDOWN_TREE_INITIAL_LOAD_BATCH_SIZE: usize = 128;
const MARKDOWN_TREE_LOAD_BATCH_SIZE: usize = 1024;

fn is_false(value: &bool) -> bool {
    !*value
}

fn markdown_tree_load_batch_size(first_batch_sent: bool) -> usize {
    if first_batch_sent {
        MARKDOWN_TREE_LOAD_BATCH_SIZE
    } else {
        MARKDOWN_TREE_INITIAL_LOAD_BATCH_SIZE
    }
}

#[derive(Clone, Default)]
pub(crate) struct MarkdownTreeLoadState(Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>);

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownTreeLoadEvent {
    request_id: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    files: Vec<MarkdownFolderFile>,
    #[serde(skip_serializing_if = "is_false")]
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl MarkdownTreeLoadState {
    fn remember(&self, request_id: String, cancel: Arc<AtomicBool>) -> Result<(), String> {
        let mut loads = self
            .0
            .lock()
            .map_err(|_| "markdown tree load state lock is poisoned".to_string())?;

        if let Some(existing_cancel) = loads.insert(request_id, cancel) {
            existing_cancel.store(true, Ordering::Relaxed);
        }

        Ok(())
    }

    fn cancel(&self, request_id: &str) -> Result<(), String> {
        let mut loads = self
            .0
            .lock()
            .map_err(|_| "markdown tree load state lock is poisoned".to_string())?;

        if let Some(cancel) = loads.remove(request_id) {
            cancel.store(true, Ordering::Relaxed);
        }

        Ok(())
    }

    fn forget(&self, request_id: &str) {
        if let Ok(mut loads) = self.0.lock() {
            loads.remove(request_id);
        }
    }
}

fn collect_markdown_tree_files(
    root: &Path,
    directory: &Path,
    ignore_rules: &MarkdownIgnoreRules,
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
            if !ignore_rules.ignores(&path, true) {
                files.push(markdown_folder_file(
                    root,
                    &path,
                    MarkdownFolderEntryKind::Folder,
                )?);
                collect_markdown_tree_files(root, &path, ignore_rules, files)?;
            }
            continue;
        }

        if file_type.is_file() {
            if ignore_rules.ignores(&path, false) {
                continue;
            }

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
            } else if is_markdown_tree_attachment_file(&path) {
                files.push(markdown_folder_file(
                    root,
                    &path,
                    MarkdownFolderEntryKind::Attachment,
                )?);
            }
        }
    }

    Ok(())
}

fn emit_markdown_tree_load_event(
    app: &tauri::AppHandle,
    request_id: &str,
    files: Vec<MarkdownFolderFile>,
    done: bool,
    error: Option<String>,
) -> Result<(), String> {
    app.emit(
        MARKDOWN_TREE_LOAD_EVENT,
        MarkdownTreeLoadEvent {
            request_id: request_id.to_string(),
            files,
            done,
            error,
        },
    )
    .map_err(|emit_error| emit_error.to_string())
}

fn flush_markdown_tree_load_batch(
    app: &tauri::AppHandle,
    request_id: &str,
    batch: &mut Vec<MarkdownFolderFile>,
    done: bool,
) -> Result<(), String> {
    if batch.is_empty() && !done {
        return Ok(());
    }

    emit_markdown_tree_load_event(app, request_id, std::mem::take(batch), done, None)
}

fn push_markdown_tree_load_file(
    app: &tauri::AppHandle,
    request_id: &str,
    batch: &mut Vec<MarkdownFolderFile>,
    first_batch_sent: &mut bool,
    file: MarkdownFolderFile,
) -> Result<(), String> {
    batch.push(file);
    if batch.len() >= markdown_tree_load_batch_size(*first_batch_sent) {
        flush_markdown_tree_load_batch(app, request_id, batch, false)?;
        *first_batch_sent = true;
    }

    Ok(())
}

fn collect_markdown_tree_files_incrementally(
    app: &tauri::AppHandle,
    request_id: &str,
    cancel: &AtomicBool,
    root: &Path,
    directory: &Path,
    ignore_rules: &MarkdownIgnoreRules,
    managed_attachment_folder: Option<&str>,
    batch: &mut Vec<MarkdownFolderFile>,
    first_batch_sent: &mut bool,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Ok(());
    }

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
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if !ignore_rules.ignores(&path, true) {
                push_markdown_tree_load_file(
                    app,
                    request_id,
                    batch,
                    first_batch_sent,
                    markdown_folder_file(root, &path, MarkdownFolderEntryKind::Folder)?,
                )?;
                collect_markdown_tree_files_incrementally(
                    app,
                    request_id,
                    cancel,
                    root,
                    &path,
                    ignore_rules,
                    managed_attachment_folder,
                    batch,
                    first_batch_sent,
                )?;
            }
            continue;
        }

        if file_type.is_file() {
            if ignore_rules.ignores(&path, false) {
                continue;
            }

            let kind = markdown_tree_file_kind(&path)?;
            let file = markdown_folder_file(root, &path, kind)?;
            if should_include_markdown_tree_file(&file, managed_attachment_folder) {
                push_markdown_tree_load_file(app, request_id, batch, first_batch_sent, file)?;
            }
        }
    }

    Ok(())
}

fn normalize_managed_attachment_folder(folder: Option<&str>) -> Option<String> {
    let normalized = folder?.trim().replace('\\', "/");
    let parts = normalized
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>();

    Some(if parts.is_empty() {
        ".".to_string()
    } else {
        parts.join("/")
    })
}

fn normalize_tree_relative_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn tree_relative_path_is_below_folder(path: &str, folder: &str) -> bool {
    if folder == "." {
        return true;
    }

    let normalized_path = normalize_tree_relative_path(path);
    normalized_path == folder || normalized_path.starts_with(&format!("{folder}/"))
}

fn should_include_markdown_tree_file(
    file: &MarkdownFolderFile,
    managed_attachment_folder: Option<&str>,
) -> bool {
    if !matches!(&file.kind, MarkdownFolderEntryKind::Attachment) {
        return true;
    }

    match managed_attachment_folder {
        Some(folder) => tree_relative_path_is_below_folder(&file.relative_path, folder),
        None => true,
    }
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
    if source_path.is_dir() {
        return normalize_markdown_tree_folder_name(file_name);
    }

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
    } else if is_markdown_tree_attachment_file(source_path) {
        match source_path
            .extension()
            .and_then(|extension| extension.to_str())
        {
            Some(extension) => format!("{trimmed_name}.{extension}"),
            None => trimmed_name,
        }
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

    if is_markdown_tree_attachment_file(source_path)
        && !is_markdown_tree_attachment_file(normalized_candidate)
    {
        return Err("Attachment file must not use a Markdown or image extension".to_string());
    }

    Ok(normalized_name)
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
        || (canonical_path.is_file() && is_markdown_tree_attachment_file(&canonical_path))
    {
        return Ok(canonical_path);
    }

    Err("Path is not a Markdown file, supported image asset, attachment, or folder".to_string())
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
        || (canonical_path.is_file() && is_markdown_tree_attachment_file(&canonical_path))
    {
        return Ok(canonical_path);
    }

    Err("Path is not a Markdown file, supported image asset, attachment, or folder".to_string())
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

fn list_markdown_files_for_path_with_asset_scope(
    path: String,
    managed_attachment_folder: Option<&str>,
    global_ignore_rules: Option<&str>,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Vec<MarkdownFolderFile>, String> {
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?;
    let mut files = Vec::new();
    let normalized_managed_attachment_folder =
        normalize_managed_attachment_folder(managed_attachment_folder);
    let ignore_rules = MarkdownIgnoreRules::for_root(&root, global_ignore_rules);

    allow_root_assets(&root)?;
    collect_markdown_tree_files(&root, &root, &ignore_rules, &mut files)?;
    files.retain(|file| {
        should_include_markdown_tree_file(file, normalized_managed_attachment_folder.as_deref())
    });
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
    managed_attachment_folder: Option<String>,
    global_ignore_rules: Option<String>,
) -> Result<Vec<MarkdownFolderFile>, String> {
    list_markdown_files_for_path_with_asset_scope(
        path,
        managed_attachment_folder.as_deref(),
        global_ignore_rules.as_deref(),
        |root| allow_asset_directory(&app, root),
    )
}

#[tauri::command]
pub(crate) fn load_markdown_files_for_path(
    app: tauri::AppHandle,
    load_state: tauri::State<'_, MarkdownTreeLoadState>,
    path: String,
    managed_attachment_folder: Option<String>,
    global_ignore_rules: Option<String>,
    request_id: String,
) -> Result<(), String> {
    let trimmed_request_id = request_id.trim().to_string();
    if trimmed_request_id.is_empty() {
        return Err("Markdown tree load request id is required".to_string());
    }

    let cancel = Arc::new(AtomicBool::new(false));
    let task_load_state = load_state.inner().clone();
    task_load_state.remember(trimmed_request_id.clone(), cancel.clone())?;

    std::thread::spawn(move || {
        let result = load_markdown_files_for_path_in_background(
            &app,
            path,
            managed_attachment_folder,
            global_ignore_rules,
            trimmed_request_id.clone(),
            cancel,
        );
        if let Err(error) = result {
            let _ = emit_markdown_tree_load_event(
                &app,
                &trimmed_request_id,
                Vec::new(),
                false,
                Some(error),
            );
        }
        task_load_state.forget(&trimmed_request_id);
    });

    Ok(())
}

fn load_markdown_files_for_path_in_background(
    app: &tauri::AppHandle,
    path: String,
    managed_attachment_folder: Option<String>,
    global_ignore_rules: Option<String>,
    request_id: String,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?;
    let normalized_managed_attachment_folder =
        normalize_managed_attachment_folder(managed_attachment_folder.as_deref());
    let ignore_rules = MarkdownIgnoreRules::for_root(&root, global_ignore_rules.as_deref());
    let mut batch = Vec::new();
    let mut first_batch_sent = false;

    allow_asset_directory(app, &root)?;
    collect_markdown_tree_files_incrementally(
        app,
        &request_id,
        &cancel,
        &root,
        &root,
        &ignore_rules,
        normalized_managed_attachment_folder.as_deref(),
        &mut batch,
        &mut first_batch_sent,
    )?;

    if cancel.load(Ordering::Relaxed) {
        return Ok(());
    }

    flush_markdown_tree_load_batch(app, &request_id, &mut batch, true)
}

#[tauri::command]
pub(crate) fn cancel_markdown_files_load(
    load_state: tauri::State<'_, MarkdownTreeLoadState>,
    request_id: String,
) -> Result<(), String> {
    load_state.cancel(&request_id)
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
    let source_path = canonical_movable_markdown_tree_entry(&root, &PathBuf::from(path))?;
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

    markdown_folder_file(&root, &target_path, markdown_tree_entry_kind(&target_path)?)
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
    fn uses_a_small_first_load_batch_then_larger_followup_batches() {
        assert_eq!(markdown_tree_load_batch_size(false), 128);
        assert_eq!(markdown_tree_load_batch_size(true), 1024);
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
        let build = root.join("build");
        let dist = root.join("dist");
        let ignored = root.join("node_modules").join("package");
        let target = root.join("target");

        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::create_dir_all(&build).expect("build folder should be created");
        fs::create_dir_all(&dist).expect("dist folder should be created");
        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::create_dir_all(root.join("empty")).expect("empty folder should be created");
        fs::create_dir_all(&ignored).expect("ignored folder should be created");
        fs::create_dir_all(&target).expect("target folder should be created");
        fs::write(root.join("Untitled.md"), "# Untitled").expect("root markdown should be created");
        fs::write(root.join("AWS.md"), "# AWS").expect("root markdown should be created");
        fs::write(assets.join("pasted-image.png"), [1, 2, 3])
            .expect("asset image should be created");
        fs::write(assets.join("reference.docx"), [4, 5, 6]).expect("attachment should be created");
        fs::write(assets.join("raw.txt"), "raw").expect("attachment should be created");
        fs::write(build.join("output.md"), "# Build output")
            .expect("build markdown should be created");
        fs::write(dist.join("bundle.md"), "# Dist bundle")
            .expect("dist markdown should be created");
        fs::write(root.join("notes.txt"), "notes").expect("non-markdown should be created");
        fs::write(docs.join("guide.markdown"), "# Guide")
            .expect("nested markdown should be created");
        fs::write(ignored.join("dependency.md"), "# Dependency")
            .expect("ignored markdown should be created");
        fs::write(target.join("cache.md"), "# Target cache")
            .expect("target markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.join("Untitled.md").to_string_lossy().to_string(),
            None,
            None,
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
                (&MarkdownFolderEntryKind::Attachment, "assets/raw.txt"),
                (
                    &MarkdownFolderEntryKind::Attachment,
                    "assets/reference.docx",
                ),
                (&MarkdownFolderEntryKind::File, "AWS.md"),
                (&MarkdownFolderEntryKind::Folder, "docs"),
                (&MarkdownFolderEntryKind::File, "docs/guide.markdown"),
                (&MarkdownFolderEntryKind::Folder, "empty"),
                (&MarkdownFolderEntryKind::Attachment, "notes.txt"),
                (&MarkdownFolderEntryKind::File, "Untitled.md"),
            ]
        );
        assert!(files.iter().all(|file| file.created_at.is_some()));
        assert!(files.iter().all(|file| file.modified_at.is_some()));
        assert_eq!(
            files
                .iter()
                .find(|file| file.relative_path == "Untitled.md")
                .and_then(|file| file.size_bytes),
            Some("# Untitled".len() as u64)
        );
        assert_eq!(
            files
                .iter()
                .find(|file| file.relative_path == "assets")
                .and_then(|file| file.size_bytes),
            None
        );

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
            None,
            None,
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
    fn filters_managed_attachments_without_hiding_folders() {
        let root = std::env::temp_dir().join(format!(
            "markra-managed-attachment-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let assets = root.join("assets");
        let downloads = root.join("downloads");

        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::create_dir_all(&downloads).expect("downloads folder should be created");
        fs::write(assets.join("reference.docx"), [1, 2, 3])
            .expect("managed attachment should be created");
        fs::write(downloads.join("export.docx"), [4, 5, 6])
            .expect("external attachment should be created");
        fs::write(root.join("index.md"), "# Index").expect("markdown file should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            Some("assets"),
            None,
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
                (
                    &MarkdownFolderEntryKind::Attachment,
                    "assets/reference.docx",
                ),
                (&MarkdownFolderEntryKind::Folder, "downloads"),
                (&MarkdownFolderEntryKind::File, "index.md"),
            ]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn skips_tool_metadata_directories_when_listing_markdown_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-tool-metadata-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let obsidian_plugin = root.join(".obsidian").join("plugins").join("mock-plugin");
        let codex_sessions = root.join(".codex").join("sessions");
        let sync_metadata = root.join(".markra-sync").join("objects");

        fs::create_dir_all(&obsidian_plugin).expect("obsidian plugin folder should be created");
        fs::create_dir_all(&codex_sessions).expect("codex sessions folder should be created");
        fs::create_dir_all(&sync_metadata).expect("sync metadata folder should be created");
        fs::write(root.join("index.md"), "# Index").expect("markdown file should be created");
        fs::write(obsidian_plugin.join("data.json"), "{}")
            .expect("obsidian plugin data should be created");
        fs::write(obsidian_plugin.join("readme.md"), "# Plugin")
            .expect("obsidian plugin markdown should be created");
        fs::write(codex_sessions.join("session.json"), "{}")
            .expect("codex session should be created");
        fs::write(sync_metadata.join("entry.md"), "# Metadata")
            .expect("sync metadata markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            Some("assets"),
            None,
            |_| Ok(()),
        )
        .expect("markdown tree should be listed");

        assert_eq!(
            files
                .iter()
                .map(|file| (&file.kind, file.relative_path.as_str()))
                .collect::<Vec<_>>(),
            vec![(&MarkdownFolderEntryKind::File, "index.md")]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn skips_build_artifact_directories_when_listing_markdown_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-build-artifact-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let rust_target_deps = root
            .join("src-tauri")
            .join("target")
            .join("debug")
            .join("deps");
        let vite_dist_assets = root.join("web").join("dist").join("assets");
        let generated_build = root.join("site").join("build").join("static");

        fs::create_dir_all(&rust_target_deps).expect("target folder should be created");
        fs::create_dir_all(&vite_dist_assets).expect("dist folder should be created");
        fs::create_dir_all(&generated_build).expect("build folder should be created");
        fs::write(root.join("index.md"), "# Index").expect("markdown file should be created");
        fs::write(rust_target_deps.join("compiled-artifact.d"), "compiled")
            .expect("target artifact should be created");
        fs::write(vite_dist_assets.join("bundle.js"), "compiled")
            .expect("dist artifact should be created");
        fs::write(generated_build.join("page.md"), "# Generated")
            .expect("build artifact markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            Some("assets"),
            None,
            |_| Ok(()),
        )
        .expect("markdown tree should be listed");

        let relative_paths = files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();

        assert!(relative_paths.contains(&"index.md"));
        assert!(relative_paths.contains(&"site"));
        assert!(relative_paths.contains(&"src-tauri"));
        assert!(relative_paths.contains(&"web"));
        assert!(!relative_paths.iter().any(|path| path
            .split('/')
            .any(|part| matches!(part, "build" | "dist" | "target"))));

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn uses_root_markraignore_when_listing_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-ignore-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let drafts = root.join("drafts");
        let generated = root.join("generated");
        let git = root.join(".git");

        fs::create_dir_all(&drafts).expect("drafts folder should be created");
        fs::create_dir_all(&generated).expect("generated folder should be created");
        fs::create_dir_all(&git).expect("git folder should be created");
        fs::write(
            root.join(".markraignore"),
            "generated/\n*.tmp\n!drafts/\n!drafts/restored.md\n!keep.md\n!.git/\n",
        )
        .expect("ignore rules should be created");
        fs::write(root.join("keep.md"), "# Keep").expect("kept markdown should be created");
        fs::write(root.join("drop.md"), "# Drop").expect("ignored markdown should be created");
        fs::write(root.join("draft.tmp"), "temporary")
            .expect("ignored attachment should be created");
        fs::write(drafts.join("restored.md"), "# Restored")
            .expect("restored markdown should be created");
        fs::write(generated.join("page.md"), "# Generated")
            .expect("generated markdown should be created");
        fs::write(git.join("readme.md"), "# Git metadata").expect("git markdown should be created");

        let files = list_markdown_files_for_path_with_asset_scope(
            root.to_string_lossy().to_string(),
            None,
            Some("*.md\ndrafts/\n"),
            |_| Ok(()),
        )
        .expect("markdown tree should be listed");

        assert_eq!(
            files
                .iter()
                .map(|file| file.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["drafts", "drafts/restored.md", "keep.md"]
        );

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
            None,
            None,
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
            None,
            None,
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
    fn renames_markdown_tree_folders_inside_the_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-tree-folder-rename-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");

        fs::create_dir_all(&docs).expect("source folder should be created");
        fs::write(docs.join("readme.md"), "# Readme")
            .expect("nested markdown file should be created");
        let canonical_root = root
            .canonicalize()
            .expect("test folder should have a canonical path");

        let renamed = rename_markdown_tree_file(
            root.to_string_lossy().to_string(),
            docs.to_string_lossy().to_string(),
            "notes".to_string(),
        )
        .expect("markdown folder should be renamed");

        assert_markdown_folder_file(
            &renamed,
            MarkdownFolderEntryKind::Folder,
            &canonical_root.join("notes"),
            "notes",
        );
        assert!(!docs.exists());
        assert!(root.join("notes").join("readme.md").exists());

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
