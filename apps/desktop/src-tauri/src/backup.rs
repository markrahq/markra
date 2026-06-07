use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug)]
pub(crate) struct LocalBackupRequest {
    pub(crate) source_path: String,
    pub(crate) target_path: String,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalBackupSummary {
    pub(crate) bytes_copied: u64,
    pub(crate) copied_files: u64,
    pub(crate) deleted_files: u64,
    pub(crate) deleted_folders: u64,
    pub(crate) scanned_files: u64,
    pub(crate) skipped_files: u64,
}

#[tauri::command]
pub(crate) fn backup_markdown_folder(
    source_path: String,
    target_path: String,
) -> Result<LocalBackupSummary, String> {
    execute_local_backup(LocalBackupRequest {
        source_path,
        target_path,
    })
}

fn execute_local_backup(request: LocalBackupRequest) -> Result<LocalBackupSummary, String> {
    let source_root = backup_source_root(&PathBuf::from(request.source_path))?;
    let target_root = backup_target_root(&PathBuf::from(request.target_path))?;

    if target_root == source_root || target_root.starts_with(&source_root) {
        return Err("Backup target cannot be inside the source folder".to_string());
    }

    fs::create_dir_all(&target_root).map_err(|error| error.to_string())?;

    let mut summary = LocalBackupSummary::default();
    copy_backup_directory(&source_root, &target_root, &source_root, &mut summary)?;

    Ok(summary)
}

fn backup_source_root(path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;

    if canonical_path.is_dir() {
        return Ok(canonical_path);
    }

    if canonical_path.is_file() {
        return canonical_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Source file parent is invalid".to_string());
    }

    Err("Backup source must be a file or folder".to_string())
}

fn backup_target_root(path: &Path) -> Result<PathBuf, String> {
    let absolute_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(path)
    };

    if absolute_path.exists() {
        if !absolute_path.is_dir() {
            return Err("Backup target must be a folder".to_string());
        }

        return absolute_path
            .canonicalize()
            .map_err(|error| error.to_string());
    }

    let parent = absolute_path
        .parent()
        .ok_or_else(|| "Backup target parent is invalid".to_string())?;
    let file_name = absolute_path
        .file_name()
        .ok_or_else(|| "Backup target folder name is invalid".to_string())?;
    let canonical_parent = parent.canonicalize().map_err(|error| error.to_string())?;

    Ok(canonical_parent.join(file_name))
}

fn is_ignored_backup_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            matches!(
                name,
                ".git" | ".markra-sync" | "build" | "dist" | "node_modules" | "target"
            )
        })
}

fn should_copy_backup_file(
    source_metadata: &fs::Metadata,
    target_path: &Path,
) -> Result<bool, String> {
    if !target_path.exists() {
        return Ok(true);
    }

    let target_metadata = target_path.metadata().map_err(|error| error.to_string())?;
    if !target_metadata.is_file() {
        return Ok(true);
    }

    if source_metadata.len() != target_metadata.len() {
        return Ok(true);
    }

    let Ok(source_modified) = source_metadata.modified() else {
        return Ok(false);
    };
    let Ok(target_modified) = target_metadata.modified() else {
        return Ok(true);
    };

    Ok(source_modified > target_modified)
}

fn copy_backup_directory(
    source_root: &Path,
    target_root: &Path,
    directory: &Path,
    summary: &mut LocalBackupSummary,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if !is_ignored_backup_directory(&path) {
                let relative_path = path
                    .strip_prefix(source_root)
                    .map_err(|_| "Backup directory is outside the source folder".to_string())?;
                let target_path = target_root.join(relative_path);

                if !target_path.exists() {
                    fs::create_dir_all(&target_path).map_err(|error| error.to_string())?;
                }
                copy_backup_directory(source_root, target_root, &path, summary)?;
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let relative_path = path
            .strip_prefix(source_root)
            .map_err(|_| "Backup file is outside the source folder".to_string())?;
        let target_path = target_root.join(relative_path);
        let source_metadata = entry.metadata().map_err(|error| error.to_string())?;
        summary.scanned_files += 1;

        if !should_copy_backup_file(&source_metadata, &target_path)? {
            summary.skipped_files += 1;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(&path, &target_path).map_err(|error| error.to_string())?;
        summary.copied_files += 1;
        summary.bytes_copied += source_metadata.len();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("markra-{name}-{nanos}"));
        fs::create_dir_all(&root).expect("test root should be created");
        root
    }

    fn write_file(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().expect("test file should have a parent"))
            .expect("test file parent should be created");
        fs::write(path, contents).expect("test file should be written");
    }

    #[test]
    fn copies_changed_files_and_skips_unchanged_targets() {
        let root = temp_root("local-backup");
        let source = root.join("notes");
        let target = root.join("backup");
        write_file(&source.join("daily.md"), "# Daily");
        write_file(&source.join("assets").join("image.txt"), "fake-image");

        let first = execute_local_backup(LocalBackupRequest {
            source_path: source.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
        })
        .expect("first backup should succeed");

        assert_eq!(first.scanned_files, 2);
        assert_eq!(first.copied_files, 2);
        assert_eq!(first.skipped_files, 0);
        assert_eq!(
            fs::read_to_string(target.join("daily.md")).expect("daily note should be backed up"),
            "# Daily"
        );
        assert_eq!(
            fs::read_to_string(target.join("assets").join("image.txt"))
                .expect("asset should be backed up"),
            "fake-image"
        );

        let second = execute_local_backup(LocalBackupRequest {
            source_path: source.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
        })
        .expect("second backup should succeed");

        assert_eq!(second.scanned_files, 2);
        assert_eq!(second.copied_files, 0);
        assert_eq!(second.skipped_files, 2);
    }

    #[test]
    fn rejects_backup_targets_inside_the_source_folder() {
        let root = temp_root("nested-backup");
        let source = root.join("notes");
        let target = source.join("backup");
        fs::create_dir_all(&source).expect("source should be created");

        let error = execute_local_backup(LocalBackupRequest {
            source_path: source.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
        })
        .expect_err("nested backup target should be rejected");

        assert!(error.contains("Backup target cannot be inside the source folder"));
    }

    #[test]
    fn backup_command_keeps_extra_target_files() {
        let root = temp_root("command-backup");
        let source = root.join("notes");
        let target = root.join("backup");
        write_file(&source.join("daily.md"), "# Daily");
        write_file(&target.join("stale.md"), "# Stale");

        let summary = backup_markdown_folder(
            source.to_string_lossy().to_string(),
            target.to_string_lossy().to_string(),
        )
        .expect("backup command should succeed");

        assert_eq!(summary.deleted_files, 0);
        assert!(target.join("stale.md").exists());
    }
}
