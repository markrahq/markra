use std::{
    fs, io,
    path::{Path, PathBuf},
};

use super::path::markdown_folder_file_from_metadata;
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};

#[derive(Clone, Copy)]
pub(crate) enum ScanPolicy {
    SkipUnreadable,
    RequireComplete,
}

impl ScanPolicy {
    pub(crate) fn read<T>(self, path: &Path, result: io::Result<T>) -> Result<Option<T>, String> {
        match result {
            Ok(value) => Ok(Some(value)),
            Err(error)
                if matches!(self, Self::SkipUnreadable)
                    && error.kind() == io::ErrorKind::PermissionDenied =>
            {
                tauri_plugin_log::log::warn!(
                    "Skipping unreadable workspace entry {}: {error}",
                    path.display()
                );
                Ok(None)
            }
            Err(error) => Err(format!("{}: {error}", path.display())),
        }
    }
}

pub(crate) struct DirectoryEntry {
    pub(crate) path: PathBuf,
    pub(crate) file_type: fs::FileType,
}

pub(crate) fn read_directory(
    root: &Path,
    directory: &Path,
    policy: ScanPolicy,
) -> Result<Option<Vec<DirectoryEntry>>, String> {
    // A skipped child is partial success; an unreadable root must remain an error.
    let directory_policy = if directory == root {
        ScanPolicy::RequireComplete
    } else {
        policy
    };
    let Some(entries) = directory_policy.read(directory, fs::read_dir(directory))? else {
        return Ok(None);
    };
    let mut readable = Vec::new();
    for entry in entries {
        let Some(entry) = policy.read(directory, entry)? else {
            continue;
        };
        let path = entry.path();
        let Some(file_type) = policy.read(&path, entry.file_type())? else {
            continue;
        };
        readable.push(DirectoryEntry { path, file_type });
    }
    readable.sort_by_key(|entry| {
        entry
            .path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
    });
    Ok(Some(readable))
}

pub(super) fn scan_markdown_folder_file(
    root: &Path,
    path: &Path,
    kind: MarkdownFolderEntryKind,
    policy: ScanPolicy,
) -> Result<Option<MarkdownFolderFile>, String> {
    let Some(metadata) = policy.read(path, fs::metadata(path))? else {
        return Ok(None);
    };
    markdown_folder_file_from_metadata(root, path, kind, &metadata).map(Some)
}

#[cfg(all(test, unix))]
pub(crate) mod test_support {
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::{Path, PathBuf},
    };

    pub(crate) struct DeniedDirectory {
        path: PathBuf,
        permissions: fs::Permissions,
    }

    impl DeniedDirectory {
        pub(crate) fn new(path: &Path) -> Option<Self> {
            let guard = Self {
                path: path.to_path_buf(),
                permissions: fs::metadata(path).unwrap().permissions(),
            };
            fs::set_permissions(path, fs::Permissions::from_mode(0o000)).unwrap();
            match fs::read_dir(path) {
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => Some(guard),
                Ok(_) => {
                    eprintln!("Skipping permission test: this user can read mode-000 directories");
                    None
                }
                Err(error) => panic!("Expected permission denial: {error}"),
            }
        }
    }

    impl Drop for DeniedDirectory {
        fn drop(&mut self) {
            fs::set_permissions(&self.path, self.permissions.clone()).unwrap();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_only_permission_errors_and_keeps_other_failures_visible() {
        let path = Path::new("/synthetic-workspace/entry");
        assert_eq!(
            ScanPolicy::SkipUnreadable.read(path, Ok(7)).unwrap(),
            Some(7)
        );
        assert!(ScanPolicy::SkipUnreadable
            .read::<()>(path, Err(io::ErrorKind::PermissionDenied.into()))
            .unwrap()
            .is_none());
        for kind in [
            io::ErrorKind::NotFound,
            io::ErrorKind::NotADirectory,
            io::ErrorKind::Other,
        ] {
            let error = ScanPolicy::SkipUnreadable
                .read::<()>(path, Err(kind.into()))
                .unwrap_err();
            assert!(error.contains(path.to_str().unwrap()), "{error}");
        }
        let error = ScanPolicy::RequireComplete
            .read::<()>(path, Err(io::ErrorKind::PermissionDenied.into()))
            .unwrap_err();
        assert!(error.contains(path.to_str().unwrap()), "{error}");
    }

    #[cfg(unix)]
    #[test]
    fn tolerates_unreadable_entry_metadata_only_for_partial_scans() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let denied = root.join("restricted");
        fs::create_dir(&denied).unwrap();
        let path = denied.join("synthetic.md");
        fs::write(&path, "synthetic content").unwrap();
        let Some(_denied) = test_support::DeniedDirectory::new(&denied) else {
            return;
        };
        assert!(scan_markdown_folder_file(
            root,
            &path,
            MarkdownFolderEntryKind::File,
            ScanPolicy::SkipUnreadable
        )
        .unwrap()
        .is_none());
        let error = scan_markdown_folder_file(
            root,
            &path,
            MarkdownFolderEntryKind::File,
            ScanPolicy::RequireComplete,
        )
        .unwrap_err();
        assert!(error.contains(path.to_str().unwrap()), "{error}");
    }
}
