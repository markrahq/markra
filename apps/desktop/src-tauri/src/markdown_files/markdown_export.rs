use std::collections::HashMap;
use std::fs;
use std::ops::Range;
use std::path::{Component, Path, PathBuf};

use super::attachment::import_local_file_for_document;
use super::path::{is_markdown_tree_file, markdown_tree_root_for_path, path_to_string};

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownExportReference {
    from: usize,
    href: String,
    // The parser decodes Markdown escapes in `href`; this keeps the exact source slice for tamper-safe range validation.
    raw_href: String,
    to: usize,
}

fn strip_markdown_resource_suffix(href: &str) -> (&str, &str) {
    let suffix_start = [href.find('?'), href.find('#')]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(href.len());

    (&href[..suffix_start], &href[suffix_start..])
}

fn percent_decode_markdown_resource_path(path: &str) -> Result<String, String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("Markdown resource path has invalid percent encoding".to_string());
            }

            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| "Markdown resource path has invalid percent encoding".to_string())?;
            let byte = u8::from_str_radix(hex, 16)
                .map_err(|_| "Markdown resource path has invalid percent encoding".to_string())?;
            decoded.push(byte);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8(decoded)
        .map_err(|_| "Markdown resource path has invalid UTF-8 encoding".to_string())
}

fn is_windows_absolute_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}

fn markdown_resource_url_scheme(path: &str) -> Option<&str> {
    let colon = path.find(':')?;
    let scheme = &path[..colon];
    if scheme.is_empty()
        || !scheme.as_bytes()[0].is_ascii_alphabetic()
        || !scheme
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.'))
    {
        return None;
    }

    Some(scheme)
}

fn file_url_markdown_resource_path(href: &str) -> Result<PathBuf, String> {
    let normalized = href.to_ascii_lowercase();
    if !normalized.starts_with("file://") {
        return Err("Markdown resource file URL is invalid".to_string());
    }

    let encoded_path = &href["file://".len()..];
    if encoded_path.is_empty() {
        return Err("Markdown resource path is empty".to_string());
    }

    let decoded_path = percent_decode_markdown_resource_path(encoded_path)?;
    let path_text = if cfg!(windows)
        && decoded_path.starts_with('/')
        && decoded_path.as_bytes().get(2) == Some(&b':')
    {
        decoded_path[1..].to_string()
    } else if cfg!(windows) && !decoded_path.starts_with('/') {
        format!("//{decoded_path}")
    } else {
        decoded_path
    };
    let path = PathBuf::from(path_text);
    if !path.is_absolute() {
        return Err("Markdown resource file URL must be absolute".to_string());
    }

    Ok(path)
}

fn resolve_markdown_export_resource_path(
    root: &Path,
    document_path: &Path,
    href: &str,
) -> Result<PathBuf, String> {
    let (path_text, _) = strip_markdown_resource_suffix(href.trim());
    if path_text.is_empty() {
        return Err("Markdown resource path is empty".to_string());
    }

    let normalized = path_text.to_ascii_lowercase();
    let (candidate, restrict_to_root) = if normalized.starts_with("file:") {
        (file_url_markdown_resource_path(path_text)?, false)
    } else if is_windows_absolute_path(path_text) {
        (
            PathBuf::from(percent_decode_markdown_resource_path(path_text)?),
            false,
        )
    } else {
        if markdown_resource_url_scheme(path_text).is_some() || path_text.starts_with("//") {
            return Err("Only local Markdown resources can be exported".to_string());
        }

        let decoded_path = percent_decode_markdown_resource_path(path_text)?.replace('\\', "/");
        let candidate = if decoded_path.starts_with('/') {
            root.join(decoded_path.trim_start_matches('/'))
        } else {
            document_path
                .parent()
                .ok_or_else(|| "Current document folder is invalid".to_string())?
                .join(decoded_path)
        };
        (candidate, true)
    };
    let canonical_path = candidate
        .canonicalize()
        .map_err(|error| format!("Could not read Markdown resource \"{href}\": {error}"))?;

    if restrict_to_root {
        canonical_path.strip_prefix(root).map_err(|_| {
            format!("Markdown resource \"{href}\" is outside the current Markdown folder")
        })?;
    }
    if !canonical_path.is_file() || is_markdown_tree_file(&canonical_path) {
        return Err(format!(
            "Markdown resource \"{href}\" is not a supported local file"
        ));
    }

    Ok(canonical_path)
}

fn utf16_offset_to_byte_index(text: &str, offset: usize) -> Option<usize> {
    // Frontend offsets are JavaScript UTF-16 indices, while Rust string edits require UTF-8 byte boundaries.
    let mut utf16_offset = 0;
    for (byte_index, character) in text.char_indices() {
        if utf16_offset == offset {
            return Some(byte_index);
        }

        utf16_offset += character.len_utf16();
        if utf16_offset > offset {
            return None;
        }
    }

    (utf16_offset == offset).then_some(text.len())
}

fn markdown_export_reference_byte_range(
    markdown: &str,
    reference: &MarkdownExportReference,
) -> Result<Range<usize>, String> {
    if reference.from > reference.to {
        return Err("Markdown export resource range is invalid".to_string());
    }

    let from = utf16_offset_to_byte_index(markdown, reference.from)
        .ok_or_else(|| "Markdown export resource range is invalid".to_string())?;
    let to = utf16_offset_to_byte_index(markdown, reference.to)
        .ok_or_else(|| "Markdown export resource range is invalid".to_string())?;
    if markdown.get(from..to) != Some(reference.raw_href.as_str()) {
        return Err("Markdown export resource range does not match its href".to_string());
    }

    Ok(from..to)
}

fn encode_markdown_relative_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let mut encoded = String::new();

    for byte in normalized.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn collected_markdown_resource_path(
    target_document_path: &Path,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err("Collected Markdown resource path is invalid".to_string());
    }

    Ok(target_document_path
        .parent()
        .ok_or_else(|| "Markdown export folder is invalid".to_string())?
        .join(relative))
}

fn markdown_export_names(suggested_name: &str) -> Result<(String, String), String> {
    let file_name = suggested_name.trim();
    let candidate = Path::new(file_name);
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || candidate.components().count() != 1
        || !is_markdown_tree_file(candidate)
    {
        return Err("Markdown export file name is invalid".to_string());
    }

    let folder_name = candidate
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Markdown export folder name is invalid".to_string())?;

    Ok((file_name.to_string(), folder_name.to_string()))
}

fn create_unique_markdown_export_folder(
    parent: &Path,
    folder_name: &str,
) -> Result<PathBuf, String> {
    for attempt in 0..1000 {
        let candidate_name = if attempt == 0 {
            folder_name.to_string()
        } else {
            format!("{folder_name}-{}", attempt + 1)
        };
        let candidate = parent.join(candidate_name);
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }

    Err("Could not create a unique Markdown export folder".to_string())
}

fn rollback_markdown_export_folder(export_folder: &Path, error: String) -> String {
    match fs::remove_dir_all(export_folder) {
        Ok(()) => error,
        Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => error,
        Err(cleanup_error) => {
            format!("{error}; Markdown export cleanup failed: {cleanup_error}")
        }
    }
}

fn export_markdown_file_with_importer(
    parent_path: String,
    suggested_name: String,
    markdown: String,
    document_path: String,
    root_path: Option<String>,
    folder: String,
    references: Vec<MarkdownExportReference>,
    mut import: impl FnMut(&Path, &Path, &str) -> Result<String, String>,
) -> Result<PathBuf, String> {
    let source_document_path = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !source_document_path.is_file() || !is_markdown_tree_file(&source_document_path) {
        return Err("Current document must be a saved Markdown file".to_string());
    }

    let root_source = root_path
        .as_deref()
        .map(Path::new)
        .unwrap_or(source_document_path.as_path());
    let root = markdown_tree_root_for_path(root_source)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    source_document_path
        .strip_prefix(&root)
        .map_err(|_| "Current document is outside the Markdown folder".to_string())?;

    let export_parent = PathBuf::from(parent_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !export_parent.is_dir() {
        return Err("Markdown export parent must be a folder".to_string());
    }
    let (file_name, folder_name) = markdown_export_names(&suggested_name)?;

    let mut validated_references = references
        .into_iter()
        .map(|reference| {
            let range = markdown_export_reference_byte_range(&markdown, &reference)?;
            let source_path = resolve_markdown_export_resource_path(
                &root,
                &source_document_path,
                &reference.href,
            )?;
            Ok((reference, range, source_path))
        })
        .collect::<Result<Vec<_>, String>>()?;
    validated_references.sort_by_key(|(_, range, _)| range.start);
    if validated_references
        .windows(2)
        .any(|window| window[0].1.end > window[1].1.start)
    {
        return Err("Markdown export resource ranges overlap".to_string());
    }

    let export_folder = create_unique_markdown_export_folder(&export_parent, &folder_name)?;
    let target_path = export_folder.join(file_name);
    let result = (|| {
        // The hardened attachment importer anchors writes to an existing document inside the new export folder.
        fs::write(&target_path, &markdown).map_err(|error| error.to_string())?;

        let mut collected_by_source = HashMap::<PathBuf, String>::new();

        for (_, _, source_path) in &validated_references {
            if collected_by_source.contains_key(source_path) {
                continue;
            }

            let relative_path = import(source_path, &target_path, &folder)?;
            collected_markdown_resource_path(&target_path, &relative_path)?;
            collected_by_source.insert(source_path.clone(), relative_path);
        }

        let mut exported_markdown = markdown.clone();
        for (reference, range, source_path) in validated_references.iter().rev() {
            let relative_path = collected_by_source
                .get(source_path)
                .ok_or_else(|| "Markdown resource was not collected".to_string())?;
            let (_, suffix) = strip_markdown_resource_suffix(&reference.href);
            let replacement = format!("{}{suffix}", encode_markdown_relative_path(relative_path));
            exported_markdown.replace_range(range.clone(), &replacement);
        }

        fs::write(&target_path, exported_markdown).map_err(|error| error.to_string())?;

        Ok(())
    })();

    if let Err(error) = result {
        return Err(rollback_markdown_export_folder(&export_folder, error));
    }

    Ok(target_path)
}

#[tauri::command]
pub(crate) async fn export_markdown_file(
    app: tauri::AppHandle,
    parent_path: String,
    suggested_name: String,
    markdown: String,
    document_path: String,
    root_path: Option<String>,
    folder: String,
    references: Vec<MarkdownExportReference>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_markdown_file_with_importer(
            parent_path,
            suggested_name,
            markdown,
            document_path,
            root_path,
            folder,
            references,
            |source_path, target_document_path, target_folder| {
                import_local_file_for_document(
                    &app,
                    target_document_path,
                    target_folder,
                    source_path,
                )
                .map(|file| file.relative_path)
            },
        )
        .map(|path| path_to_string(&path))
    })
    .await
    .map_err(|error| format!("Markdown export task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn markdown_export_reference(markdown: &str, href: &str) -> MarkdownExportReference {
        markdown_export_reference_with_raw_href(markdown, href, href)
    }

    fn markdown_export_reference_with_raw_href(
        markdown: &str,
        href: &str,
        raw_href: &str,
    ) -> MarkdownExportReference {
        let byte_from = markdown
            .find(raw_href)
            .expect("synthetic href should be present in markdown");
        let from = markdown[..byte_from].encode_utf16().count();
        let to = from + raw_href.encode_utf16().count();

        MarkdownExportReference {
            from,
            href: href.to_string(),
            raw_href: raw_href.to_string(),
            to,
        }
    }

    #[test]
    fn exports_markdown_with_deduplicated_local_resources_and_rewritten_destinations() {
        let root = std::env::temp_dir().join(format!(
            "markra-markdown-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("vault/notes/draft.md");
        let image = root.join("vault/notes/assets/chart image.png");
        let attachment = root.join("vault/files/reference.pdf");
        let escaped_attachment = root.join("vault/files/reference(final).pdf");
        let export_parent = root.join("exports");
        let occupied_bundle = export_parent.join("draft");
        let target = export_parent.join("draft-2/draft.md");
        let markdown = [
            "# 中文草稿",
            "",
            "![Chart](<assets/chart image.png>)",
            "![Chart again](<assets/chart image.png>)",
            "[Reference](../files/reference.pdf?raw=1#page=2)",
            "[Escaped](../files/reference\\(final\\).pdf)",
        ]
        .join("\n");
        let references = vec![
            markdown_export_reference(&markdown, "assets/chart image.png"),
            MarkdownExportReference {
                from: markdown[..markdown
                    .rfind("assets/chart image.png")
                    .expect("second href should exist")]
                    .encode_utf16()
                    .count(),
                href: "assets/chart image.png".to_string(),
                raw_href: "assets/chart image.png".to_string(),
                to: markdown[..markdown
                    .rfind("assets/chart image.png")
                    .expect("second href should exist")]
                    .encode_utf16()
                    .count()
                    + "assets/chart image.png".encode_utf16().count(),
            },
            markdown_export_reference(&markdown, "../files/reference.pdf?raw=1#page=2"),
            markdown_export_reference_with_raw_href(
                &markdown,
                "../files/reference(final).pdf",
                "../files/reference\\(final\\).pdf",
            ),
        ];
        let mut imported_sources = Vec::new();

        fs::create_dir_all(image.parent().expect("image should have a parent"))
            .expect("image folder should be created");
        fs::create_dir_all(
            attachment
                .parent()
                .expect("attachment should have a parent"),
        )
        .expect("attachment folder should be created");
        fs::create_dir_all(&occupied_bundle).expect("occupied bundle should be created");
        fs::write(occupied_bundle.join("keep.txt"), b"keep")
            .expect("occupied bundle should remain untouched");
        fs::write(&note, &markdown).expect("source note should be written");
        fs::write(&image, b"synthetic-image").expect("image should be written");
        fs::write(&attachment, b"synthetic-pdf").expect("attachment should be written");
        fs::write(&escaped_attachment, b"synthetic-escaped-pdf")
            .expect("escaped attachment should be written");

        let exported_path = export_markdown_file_with_importer(
            export_parent.to_string_lossy().to_string(),
            "draft.md".to_string(),
            markdown,
            note.to_string_lossy().to_string(),
            Some(root.join("vault").to_string_lossy().to_string()),
            "assets".to_string(),
            references,
            |source_path, target_document_path, folder| {
                imported_sources.push(source_path.to_path_buf());
                let suffix = imported_sources.len() + 1;
                let file_name = source_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .expect("synthetic file name should be UTF-8");
                let renamed = if file_name == "chart image.png" {
                    format!("chart image-{suffix}.png")
                } else {
                    file_name.to_string()
                };
                let destination = target_document_path
                    .parent()
                    .expect("target should have a parent")
                    .join(folder)
                    .join(&renamed);
                fs::create_dir_all(destination.parent().expect("resource should have a parent"))
                    .map_err(|error| error.to_string())?;
                fs::copy(source_path, &destination).map_err(|error| error.to_string())?;
                Ok(format!("{folder}/{renamed}"))
            },
        )
        .expect("markdown bundle should be exported");

        assert_eq!(
            exported_path,
            target.canonicalize().expect("target should canonicalize")
        );
        assert_eq!(
            fs::read(occupied_bundle.join("keep.txt")).expect("occupied bundle should be readable"),
            b"keep"
        );
        assert_eq!(
            imported_sources,
            vec![
                image.canonicalize().expect("image should canonicalize"),
                attachment
                    .canonicalize()
                    .expect("attachment should canonicalize"),
                escaped_attachment
                    .canonicalize()
                    .expect("escaped attachment should canonicalize"),
            ]
        );
        assert_eq!(
            fs::read_to_string(&target).expect("exported markdown should be readable"),
            [
                "# 中文草稿",
                "",
                "![Chart](<assets/chart%20image-2.png>)",
                "![Chart again](<assets/chart%20image-2.png>)",
                "[Reference](assets/reference.pdf?raw=1#page=2)",
                "[Escaped](assets/reference%28final%29.pdf)",
            ]
            .join("\n")
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn removes_the_new_markdown_export_folder_after_failure() {
        let root = std::env::temp_dir().join(format!(
            "markra-markdown-export-rollback-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("vault/draft.md");
        let first = root.join("vault/assets/first.png");
        let second = root.join("vault/assets/second.png");
        let export_parent = root.join("exports");
        let bundle = export_parent.join("draft");
        let markdown = "![First](assets/first.png)\n![Second](assets/second.png)";
        let references = vec![
            markdown_export_reference(markdown, "assets/first.png"),
            markdown_export_reference(markdown, "assets/second.png"),
        ];
        let mut import_count = 0;

        fs::create_dir_all(first.parent().expect("asset should have a parent"))
            .expect("asset folder should be created");
        fs::create_dir_all(&export_parent).expect("export parent should be created");
        fs::write(&note, markdown).expect("source note should be written");
        fs::write(&first, b"first").expect("first resource should be written");
        fs::write(&second, b"second").expect("second resource should be written");

        let result = export_markdown_file_with_importer(
            export_parent.to_string_lossy().to_string(),
            "draft.md".to_string(),
            markdown.to_string(),
            note.to_string_lossy().to_string(),
            Some(root.join("vault").to_string_lossy().to_string()),
            "assets".to_string(),
            references,
            |source_path, target_document_path, folder| {
                import_count += 1;
                if import_count == 2 {
                    return Err("Synthetic import failure".to_string());
                }

                let destination = target_document_path
                    .parent()
                    .expect("target should have a parent")
                    .join(folder)
                    .join(
                        source_path
                            .file_name()
                            .expect("source should have a file name"),
                    );
                fs::create_dir_all(destination.parent().expect("resource should have a parent"))
                    .map_err(|error| error.to_string())?;
                fs::copy(source_path, &destination).map_err(|error| error.to_string())?;
                Ok(format!(
                    "{folder}/{}",
                    source_path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .expect("synthetic file name should be UTF-8")
                ))
            },
        );

        assert_eq!(result, Err("Synthetic import failure".to_string()));
        assert!(!bundle.exists());
        assert!(export_parent.exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_unsafe_markdown_export_names() {
        assert!(markdown_export_names("../draft.md").is_err());
        assert!(markdown_export_names("nested/draft.md").is_err());
        assert!(markdown_export_names("draft.txt").is_err());
        assert_eq!(
            markdown_export_names("中文草稿.md"),
            Ok(("中文草稿.md".to_string(), "中文草稿".to_string()))
        );
    }

    #[test]
    fn exports_markdown_without_resources_to_a_standalone_folder() {
        let root = std::env::temp_dir().join(format!(
            "markra-markdown-export-empty-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("vault/draft.md");
        let export_parent = root.join("exports");

        fs::create_dir_all(note.parent().expect("note should have a parent"))
            .expect("vault should be created");
        fs::create_dir_all(&export_parent).expect("export parent should be created");
        fs::write(&note, "# Standalone").expect("source note should be written");

        let exported_path = export_markdown_file_with_importer(
            export_parent.to_string_lossy().to_string(),
            "draft.md".to_string(),
            "# Standalone".to_string(),
            note.to_string_lossy().to_string(),
            Some(root.join("vault").to_string_lossy().to_string()),
            "assets".to_string(),
            Vec::new(),
            |_source_path, _target_document_path, _folder| {
                panic!("resource importer should not run without references")
            },
        )
        .expect("resource-free markdown should be exported");

        assert_eq!(
            fs::read_to_string(&exported_path).expect("exported markdown should be readable"),
            "# Standalone"
        );
        assert!(!exported_path
            .parent()
            .expect("export should have a parent")
            .join("assets")
            .exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn validates_missing_resources_before_creating_the_export_folder() {
        let root = std::env::temp_dir().join(format!(
            "markra-markdown-export-missing-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let markdown = "![Missing](assets/missing.png)";
        let note = root.join("vault/draft.md");
        let export_parent = root.join("exports");

        fs::create_dir_all(note.parent().expect("note should have a parent"))
            .expect("vault should be created");
        fs::create_dir_all(&export_parent).expect("export parent should be created");
        fs::write(&note, markdown).expect("source note should be written");

        let result = export_markdown_file_with_importer(
            export_parent.to_string_lossy().to_string(),
            "draft.md".to_string(),
            markdown.to_string(),
            note.to_string_lossy().to_string(),
            Some(root.join("vault").to_string_lossy().to_string()),
            "assets".to_string(),
            vec![markdown_export_reference(markdown, "assets/missing.png")],
            |_source_path, _target_document_path, _folder| {
                panic!("resource importer should not run after validation fails")
            },
        );

        assert!(result
            .expect_err("missing resource should reject export")
            .contains("Could not read Markdown resource"));
        assert!(!export_parent.join("draft").exists());

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
