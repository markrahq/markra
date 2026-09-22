use std::path::Path;

const FILENAME_VARIABLE: &str = "${filename}";

pub(super) fn resolve_asset_folder(folder: &str, document_path: &Path) -> Result<String, String> {
    if !folder.contains(FILENAME_VARIABLE) {
        return Ok(folder.to_string());
    }
    let filename = document_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty() && !matches!(*name, "." | ".."))
        .ok_or_else(|| "Current document file name is invalid for an asset folder".to_string())?;
    if filename.contains(['/', '\\', '\0']) {
        return Err("Current document file name is invalid for an asset folder".to_string());
    }
    // Replace once: a literal variable in the document name must not expand recursively.
    let expanded = folder.replace(FILENAME_VARIABLE, filename);
    let normalized = expanded.trim().replace('\\', "/");
    let bytes = normalized.as_bytes();
    if normalized.starts_with('/')
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
        || normalized.contains('\0')
        || normalized.split('/').any(|part| part.trim() == "..")
    {
        return Err("Asset folder must stay inside the current document folder".to_string());
    }
    Ok(expanded)
}

fn path_is_below_folder(path: &str, folder: &str) -> bool {
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

pub(super) fn asset_folder_matches_path(path: &str, folder: &str) -> bool {
    if folder == "." {
        return true;
    }
    let Some((prefix, _)) = folder.split_once(FILENAME_VARIABLE) else {
        return path_is_below_folder(path, folder);
    };
    let parts = path.split('/').collect::<Vec<_>>();
    // Keep old attachment folders visible after a rename. Never use this
    // structural match to authorize cleanup; resolve against scanned documents.
    (0..parts.len()).any(|offset| {
        let relative = parts[offset..].join("/");
        let Some(remainder) = relative.strip_prefix(prefix) else {
            return false;
        };
        let component = remainder.split('/').next().unwrap_or_default();
        component.char_indices().any(|(start, ch)| {
            let filename = &component[..start + ch.len_utf8()];
            !matches!(filename, "." | "..")
                && relative
                    .starts_with(&format!("{}/", folder.replace(FILENAME_VARIABLE, filename)))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_only_filename_variables_once() {
        for (folder, path, expected) in [
            ("${filename}.assets", "mock.note.MD", "mock.note.assets"),
            (
                "assets/${filename}",
                "测试 note.markdown",
                "assets/测试 note",
            ),
            (
                "${filename}/${filename}.assets",
                ".mock.md",
                ".mock/.mock.assets",
            ),
            ("${filename}.assets", "${filename}.md", "${filename}.assets"),
            ("${filename}.assets", "100%25.md", "100%25.assets"),
            ("assets", "mock.md", "assets"),
            (".", "mock.md", "."),
            ("${unknown}", "mock.md", "${unknown}"),
        ] {
            assert_eq!(
                resolve_asset_folder(folder, Path::new(path)).unwrap(),
                expected
            );
        }
    }

    #[test]
    fn rejects_unsafe_expanded_paths() {
        for (folder, path) in [
            ("${filename}", "...md"),
            ("${filename}/images", "..md"),
            ("../${filename}", "mock.md"),
            ("/${filename}", "mock.md"),
            ("C:/${filename}", "mock.md"),
            ("${filename}", "mock\0.md"),
        ] {
            assert!(
                resolve_asset_folder(folder, Path::new(path)).is_err(),
                "{folder}: {path}"
            );
        }
    }

    #[test]
    fn matches_template_structure_and_preserves_static_folder_behavior() {
        for (path, folder, expected) in [
            ("notes/mock.assets/file.pdf", "${filename}.assets", true),
            ("notes/media/mock/file.pdf", "media/${filename}", true),
            (
                "notes/media/mock/mock.assets/file.pdf",
                "media/${filename}/${filename}.assets",
                true,
            ),
            (
                "notes/media/mock/other.assets/file.pdf",
                "media/${filename}/${filename}.assets",
                false,
            ),
            ("notes/.assets/file.pdf", "${filename}.assets", false),
            ("notes/mockXassets/file.pdf", "${filename}.assets", false),
            ("notes/downloads/file.pdf", "${filename}.assets", false),
            ("mock.assets-extra/file.pdf", "${filename}.assets", false),
            (
                "notes/mock.assets/nested/file.pdf",
                "${filename}.assets",
                true,
            ),
            ("assets/file.pdf", "assets", true),
            ("downloads/file.pdf", "assets", false),
            ("notes/assets/file.pdf", "assets", false),
            ("file.pdf", ".", true),
            ("file.pdf", "${filename}", false),
            ("mock.assets", "${filename}.assets", false),
        ] {
            assert_eq!(
                asset_folder_matches_path(path, folder),
                expected,
                "{path}: {folder}"
            );
        }
    }
}
