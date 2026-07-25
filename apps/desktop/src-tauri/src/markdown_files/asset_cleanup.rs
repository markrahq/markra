use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::path::{
    is_markdown_tree_asset_file, is_markdown_tree_file, markdown_tree_root_for_path, path_to_string,
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownAssetCleanupFileSnapshot {
    path: String,
    size_bytes: Option<u64>,
    modified_at: Option<u64>,
}

#[derive(Clone, Debug)]
struct ValidatedFileSnapshot {
    path: PathBuf,
    size_bytes: u64,
    modified_at: u64,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownAssetTrashFailure {
    path: String,
    error: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownAssetTrashSummary {
    trashed_paths: Vec<String>,
    failures: Vec<MarkdownAssetTrashFailure>,
}

fn managed_asset_folder(folder: &str) -> Result<PathBuf, String> {
    let normalized = folder.trim().replace('\\', "/");
    if normalized.is_empty() || normalized == "." {
        return Err("Image cleanup requires a dedicated managed folder".to_string());
    }

    let mut managed_folder = PathBuf::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => managed_folder.push(part),
            Component::CurDir => {}
            _ => return Err("Managed image folder must stay inside the workspace".to_string()),
        }
    }

    if managed_folder.as_os_str().is_empty() {
        return Err("Managed image folder is invalid".to_string());
    }

    Ok(managed_folder)
}

fn metadata_modified_at(metadata: &fs::Metadata) -> Result<u64, String> {
    metadata
        .modified()
        .map_err(|error| error.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis()
        .try_into()
        .map_err(|_| "File modification time is out of range".to_string())
}

fn validated_file_snapshot(
    root: &Path,
    snapshot: &MarkdownAssetCleanupFileSnapshot,
) -> Result<ValidatedFileSnapshot, String> {
    let expected_size = snapshot
        .size_bytes
        .ok_or_else(|| "Cleanup requires a complete file snapshot".to_string())?;
    let expected_modified_at = snapshot
        .modified_at
        .ok_or_else(|| "Cleanup requires a complete file snapshot".to_string())?;
    let source_path = PathBuf::from(&snapshot.path);
    let symlink_metadata = fs::symlink_metadata(&source_path).map_err(|error| error.to_string())?;
    if symlink_metadata.file_type().is_symlink() {
        return Err("Symbolic links cannot be cleaned as image assets".to_string());
    }

    let canonical_path = source_path
        .canonicalize()
        .map_err(|error| error.to_string())?;
    canonical_path
        .strip_prefix(root)
        .map_err(|_| "Cleanup snapshot is outside the current Markdown folder".to_string())?;

    let metadata = fs::metadata(&canonical_path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("Cleanup snapshot is not a file".to_string());
    }
    if metadata.len() != expected_size || metadata_modified_at(&metadata)? != expected_modified_at {
        return Err("A cleanup file changed after it was scanned".to_string());
    }

    Ok(ValidatedFileSnapshot {
        path: canonical_path,
        size_bytes: expected_size,
        modified_at: expected_modified_at,
    })
}

fn verify_validated_snapshot(snapshot: &ValidatedFileSnapshot) -> Result<(), String> {
    let metadata = fs::metadata(&snapshot.path).map_err(|error| error.to_string())?;
    if !metadata.is_file()
        || metadata.len() != snapshot.size_bytes
        || metadata_modified_at(&metadata)? != snapshot.modified_at
    {
        return Err("A cleanup file changed after it was scanned".to_string());
    }

    Ok(())
}

fn validated_asset_cleanup_targets(
    root_path: &str,
    targets: Vec<MarkdownAssetCleanupFileSnapshot>,
    documents: Vec<MarkdownAssetCleanupFileSnapshot>,
    managed_folder: &str,
) -> Result<(Vec<ValidatedFileSnapshot>, Vec<ValidatedFileSnapshot>), String> {
    let root = markdown_tree_root_for_path(Path::new(root_path))?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let managed_folder = managed_asset_folder(managed_folder)?;
    if documents.is_empty() {
        return Err("Cleanup requires scanned Markdown file snapshots".to_string());
    }

    let mut validated_documents = Vec::new();
    let mut managed_directories = HashSet::new();
    for document in documents {
        let validated_document = validated_file_snapshot(&root, &document)?;
        if !is_markdown_tree_file(&validated_document.path) {
            return Err("Cleanup document snapshot is not a Markdown file".to_string());
        }

        if let Some(document_directory) = validated_document.path.parent() {
            let managed_directory = document_directory.join(&managed_folder);
            if managed_directory.is_dir() {
                managed_directories.insert(
                    managed_directory
                        .canonicalize()
                        .map_err(|error| error.to_string())?,
                );
            }
        }
        validated_documents.push(validated_document);
    }

    let mut seen = HashSet::new();
    let mut validated_targets = Vec::new();
    for target in targets {
        let validated_target = validated_file_snapshot(&root, &target)?;
        if !is_markdown_tree_asset_file(&validated_target.path) {
            return Err("Cleanup target is not a supported image asset".to_string());
        }
        if !validated_target
            .path
            .parent()
            .is_some_and(|parent| managed_directories.contains(parent))
        {
            return Err(
                "Image asset is not in a managed folder beside a scanned Markdown file".to_string(),
            );
        }
        if seen.insert(validated_target.path.clone()) {
            validated_targets.push(validated_target);
        }
    }

    Ok((validated_targets, validated_documents))
}

fn trash_markdown_assets_with(
    root_path: String,
    targets: Vec<MarkdownAssetCleanupFileSnapshot>,
    documents: Vec<MarkdownAssetCleanupFileSnapshot>,
    managed_folder: String,
    mut trash_file: impl FnMut(&Path) -> Result<(), String>,
) -> Result<MarkdownAssetTrashSummary, String> {
    // Validate the whole batch before mutating anything so a stale or forged path
    // cannot make an otherwise rejected cleanup partially succeed.
    let (targets, documents) =
        validated_asset_cleanup_targets(&root_path, targets, documents, &managed_folder)?;
    for document in &documents {
        verify_validated_snapshot(document)?;
    }

    let mut trashed_paths = Vec::new();
    let mut failures = Vec::new();

    for target in targets {
        let path = path_to_string(&target.path);
        if let Err(error) = verify_validated_snapshot(&target) {
            failures.push(MarkdownAssetTrashFailure { path, error });
            continue;
        }

        match trash_file(&target.path) {
            Ok(()) => trashed_paths.push(path),
            Err(error) => failures.push(MarkdownAssetTrashFailure { path, error }),
        }
    }

    Ok(MarkdownAssetTrashSummary {
        trashed_paths,
        failures,
    })
}

#[tauri::command]
pub(crate) fn trash_markdown_assets(
    root_path: String,
    targets: Vec<MarkdownAssetCleanupFileSnapshot>,
    documents: Vec<MarkdownAssetCleanupFileSnapshot>,
    managed_folder: String,
) -> Result<MarkdownAssetTrashSummary, String> {
    trash_markdown_assets_with(root_path, targets, documents, managed_folder, |path| {
        trash::delete(path).map_err(|error| error.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "markra-asset-cleanup-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ))
    }

    fn snapshot(path: &Path) -> MarkdownAssetCleanupFileSnapshot {
        let metadata = fs::metadata(path).expect("snapshot target should be readable");
        MarkdownAssetCleanupFileSnapshot {
            modified_at: Some(
                metadata
                    .modified()
                    .expect("snapshot target should have a modification time")
                    .duration_since(UNIX_EPOCH)
                    .expect("modification time should follow the Unix epoch")
                    .as_millis()
                    .try_into()
                    .expect("modification time should fit into u64"),
            ),
            path: path.to_string_lossy().to_string(),
            size_bytes: Some(metadata.len()),
        }
    }

    #[test]
    fn trashes_unique_images_inside_managed_asset_folders() {
        let root = test_root("managed");
        let notes = root.join("notes");
        let assets = notes.join("assets");
        let document = notes.join("daily.md");
        let used = assets.join("unused.png");
        fs::create_dir_all(&assets).expect("asset folder should be created");
        fs::write(&document, "# Daily").expect("synthetic Markdown should be created");
        fs::write(&used, [1, 2, 3]).expect("synthetic image should be created");
        let canonical_used = used
            .canonicalize()
            .expect("synthetic image path should canonicalize");

        let mut trashed = Vec::new();
        let summary = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![snapshot(&used), snapshot(&used)],
            vec![snapshot(&document)],
            "assets".to_string(),
            |path: &Path| {
                trashed.push(path.to_path_buf());
                fs::remove_file(path).map_err(|error| error.to_string())
            },
        )
        .expect("managed image should be moved to trash");

        assert_eq!(trashed, vec![canonical_used.clone()]);
        assert_eq!(
            summary.trashed_paths,
            vec![canonical_used.to_string_lossy().to_string()]
        );
        assert!(summary.failures.is_empty());
        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_unmanaged_or_non_image_targets_before_trashing_anything() {
        let root = test_root("reject");
        let assets = root.join("assets");
        let unrelated_assets = root.join("web").join("src").join("assets");
        let document = root.join("note.md");
        fs::create_dir_all(&assets).expect("asset folder should be created");
        fs::create_dir_all(&unrelated_assets).expect("unmanaged folder should be created");
        let valid = assets.join("valid.png");
        let outside_scope = unrelated_assets.join("code.png");
        fs::write(&document, "# Note").expect("synthetic Markdown should be created");
        fs::write(&valid, [1]).expect("managed image should be created");
        fs::write(&outside_scope, [2]).expect("unmanaged image should be created");

        let mut trash_call_count = 0;
        let result = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![snapshot(&valid), snapshot(&outside_scope)],
            vec![snapshot(&document)],
            "assets".to_string(),
            |_path: &Path| {
                trash_call_count += 1;
                Ok(())
            },
        );

        assert!(result.is_err());
        assert_eq!(trash_call_count, 0);
        assert!(valid.exists());
        assert!(outside_scope.exists());
        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_changed_snapshots_and_workspace_root_cleanup() {
        let root = test_root("changed");
        let assets = root.join("assets");
        let document = root.join("note.md");
        let image = assets.join("unused.png");
        fs::create_dir_all(&assets).expect("asset folder should be created");
        fs::write(&document, "# Note").expect("synthetic Markdown should be created");
        fs::write(&image, [1]).expect("synthetic image should be created");

        let stale_image = snapshot(&image);
        fs::write(&image, [1, 2]).expect("synthetic image should change");
        let changed_result = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![stale_image],
            vec![snapshot(&document)],
            "assets".to_string(),
            |_path: &Path| Ok(()),
        );
        assert!(changed_result.is_err());

        let stale_document = snapshot(&document);
        fs::write(&document, "# Note changed").expect("synthetic Markdown should change");
        let changed_document_result = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![snapshot(&image)],
            vec![stale_document],
            "assets".to_string(),
            |_path: &Path| Ok(()),
        );
        assert!(changed_document_result.is_err());

        let root_scope_result = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![snapshot(&image)],
            vec![snapshot(&document)],
            ".".to_string(),
            |_path: &Path| Ok(()),
        );
        assert!(root_scope_result.is_err());
        assert!(image.exists());
        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn reports_mid_batch_changes_without_trashing_stale_targets() {
        let root = test_root("mid-batch-change");
        let assets = root.join("assets");
        let document = root.join("note.md");
        let first = assets.join("first.png");
        let second = assets.join("second.png");
        fs::create_dir_all(&assets).expect("asset folder should be created");
        fs::write(&document, "# Note").expect("synthetic Markdown should be created");
        fs::write(&first, [1]).expect("first synthetic image should be created");
        fs::write(&second, [2]).expect("second synthetic image should be created");
        let canonical_first = first
            .canonicalize()
            .expect("first synthetic image should canonicalize");
        let canonical_second = second
            .canonicalize()
            .expect("second synthetic image should canonicalize");

        let summary = trash_markdown_assets_with(
            root.to_string_lossy().to_string(),
            vec![snapshot(&first), snapshot(&second)],
            vec![snapshot(&document)],
            "assets".to_string(),
            |path: &Path| {
                fs::remove_file(path).map_err(|error| error.to_string())?;
                if path.file_name() == first.file_name() {
                    fs::write(&second, [2, 3]).map_err(|error| error.to_string())?;
                }
                Ok(())
            },
        )
        .expect("a changed target should be reported as an item failure");

        assert_eq!(
            summary.trashed_paths,
            vec![canonical_first.to_string_lossy().to_string()]
        );
        assert_eq!(summary.failures.len(), 1);
        assert_eq!(summary.failures[0].path, canonical_second.to_string_lossy());
        assert!(second.exists());
        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
