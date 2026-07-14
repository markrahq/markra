use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use ignore::gitignore::{Gitignore, GitignoreBuilder};

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
    global_rules: String,
    root: PathBuf,
    matcher: Gitignore,
}

impl MarkdownIgnoreRules {
    pub(crate) fn for_root(root: &Path, global_rules: Option<&str>) -> Self {
        let global_rules = global_rules.unwrap_or_default().to_string();
        let mut builder = GitignoreBuilder::new(root);

        // Parse line-by-line so one invalid global pattern cannot discard valid rules.
        for line in global_rules.lines() {
            let _ = builder.add_line(None, line);
        }
        // Workspace rules are added last so their negations can override global defaults.
        // Partial file errors are intentionally ignored to keep the workspace repairable.
        let _ = builder.add(root.join(MARKRA_IGNORE_FILE_NAME));
        let matcher = builder.build().unwrap_or_else(|_| Gitignore::empty());

        Self {
            global_rules,
            root: root.to_path_buf(),
            matcher,
        }
    }

    pub(crate) fn reload(&mut self) {
        let root = self.root.clone();
        let global_rules = self.global_rules.clone();
        *self = Self::for_root(&root, Some(&global_rules));
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "markra-ignore-rules-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ))
    }

    #[test]
    fn applies_global_rules_before_workspace_rules() {
        let root = test_root("precedence");
        fs::create_dir_all(&root).expect("test root should be created");
        fs::write(root.join(MARKRA_IGNORE_FILE_NAME), "!keep.md\n")
            .expect("workspace rules should be written");

        let rules = MarkdownIgnoreRules::for_root(&root, Some("*.md\n"));

        assert!(!rules.ignores(&root.join("keep.md"), false));
        assert!(rules.ignores(&root.join("drop.md"), false));

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn built_in_directories_remain_authoritative() {
        let root = test_root("builtins");
        let rules =
            MarkdownIgnoreRules::for_root(&root, Some("!node_modules/\n!node_modules/readme.md\n"));

        assert!(rules.ignores(&root.join("node_modules/readme.md"), false));
    }

    #[test]
    fn matches_ignore_rules_case_sensitively() {
        let root = test_root("case-sensitive");
        let rules = MarkdownIgnoreRules::for_root(&root, Some("drafts/\n"));

        assert!(rules.ignores(&root.join("drafts/note.md"), false));
        assert!(!rules.ignores(&root.join("Drafts/note.md"), false));
    }
}
