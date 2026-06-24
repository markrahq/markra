use std::fs;
use std::path::{Path, PathBuf};

use super::asset::allow_asset_directory;
use super::path::{
    is_markdown_tree_asset_file, is_markdown_tree_attachment_file, is_markdown_tree_file,
    markdown_folder_file, markdown_tree_file_kind, markdown_tree_root_for_path,
    normalize_markdown_tree_single_file_name, should_skip_markdown_tree_directory,
};
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};

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
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Vec<MarkdownFolderFile>, String> {
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?;
    let mut files = Vec::new();
    let normalized_managed_attachment_folder =
        normalize_managed_attachment_folder(managed_attachment_folder);

    allow_root_assets(&root)?;
    collect_markdown_tree_files(&root, &root, &mut files)?;
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
) -> Result<Vec<MarkdownFolderFile>, String> {
    list_markdown_files_for_path_with_asset_scope(
        path,
        managed_attachment_folder.as_deref(),
        |root| allow_asset_directory(&app, root),
    )
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
                (&MarkdownFolderEntryKind::Folder, "build"),
                (&MarkdownFolderEntryKind::File, "build/output.md"),
                (&MarkdownFolderEntryKind::Folder, "dist"),
                (&MarkdownFolderEntryKind::File, "dist/bundle.md"),
                (&MarkdownFolderEntryKind::Folder, "docs"),
                (&MarkdownFolderEntryKind::File, "docs/guide.markdown"),
                (&MarkdownFolderEntryKind::Folder, "empty"),
                (&MarkdownFolderEntryKind::Attachment, "notes.txt"),
                (&MarkdownFolderEntryKind::Folder, "target"),
                (&MarkdownFolderEntryKind::File, "target/cache.md"),
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
