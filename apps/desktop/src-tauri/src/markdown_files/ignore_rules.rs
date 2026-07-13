use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use ignore::gitignore::Gitignore;

pub(crate) const MARKRA_IGNORE_FILE_NAME: &str = ".markraignore";

fn is_builtin_ignored_directory_name(name: &OsStr) -> bool {
    name.to_str().is_some_and(|name| {
        matches!(
            name,
            ".codex"
                | ".git"
                | ".markra-sync"
                | ".obsidian"
                | "build"
                | "dist"
                | "node_modules"
                | "target"
        )
    })
}

pub(crate) struct MarkdownIgnoreRules {
    root: PathBuf,
    matcher: Gitignore,
}

impl MarkdownIgnoreRules {
    pub(crate) fn for_root(root: &Path) -> Self {
        // Gitignore::new keeps valid rules after partial parse errors and returns
        // an empty matcher on read errors, so a bad control file cannot block a workspace.
        let (matcher, _load_error) = Gitignore::new(root.join(MARKRA_IGNORE_FILE_NAME));

        Self {
            root: root.to_path_buf(),
            matcher,
        }
    }

    pub(crate) fn ignores(&self, path: &Path, is_directory: bool) -> bool {
        let Ok(relative_path) = path.strip_prefix(&self.root) else {
            return false;
        };

        if self.is_control_file(path) {
            return true;
        }

        let directory_path = if is_directory {
            relative_path
        } else {
            relative_path.parent().unwrap_or_else(|| Path::new(""))
        };

        // Built-in exclusions protect workspace performance and remain authoritative
        // even when a user rule attempts to negate one of them.
        if directory_path
            .components()
            .any(|component| is_builtin_ignored_directory_name(component.as_os_str()))
        {
            return true;
        }

        self.matcher
            .matched_path_or_any_parents(path, is_directory)
            .is_ignore()
    }

    pub(crate) fn is_control_file(&self, path: &Path) -> bool {
        path.parent() == Some(self.root.as_path())
            && path.file_name() == Some(OsStr::new(MARKRA_IGNORE_FILE_NAME))
    }
}
