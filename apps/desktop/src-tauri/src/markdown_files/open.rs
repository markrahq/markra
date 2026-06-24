use std::{
    path::{Path, PathBuf},
    process::Command,
};

use crate::windows::{
    editor_window_url_for_folder, editor_window_url_for_path, spawn_editor_window,
};

use super::path::{
    is_markdown_open_file, is_markdown_tree_attachment_file, markdown_open_path_for_path,
    markdown_tree_root_for_path,
};
use super::types::MarkdownOpenPath;

fn markdown_open_picker_title(title: Option<String>) -> String {
    title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Open Markdown File or Folder".to_string())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FileManagerPlatform {
    Linux,
    Macos,
    Windows,
}

#[derive(Debug, Eq, PartialEq)]
struct FileManagerCommand {
    program: String,
    args: Vec<String>,
}

fn current_file_manager_platform() -> FileManagerPlatform {
    if cfg!(target_os = "macos") {
        return FileManagerPlatform::Macos;
    }

    if cfg!(windows) {
        return FileManagerPlatform::Windows;
    }

    FileManagerPlatform::Linux
}

fn file_manager_command_for_path(
    path: &Path,
    path_is_directory: bool,
    platform: FileManagerPlatform,
) -> Result<FileManagerCommand, String> {
    let path_text = path.to_string_lossy().to_string();

    match platform {
        FileManagerPlatform::Macos => Ok(FileManagerCommand {
            program: "open".to_string(),
            args: vec!["-R".to_string(), path_text],
        }),
        FileManagerPlatform::Windows => Ok(FileManagerCommand {
            program: "explorer".to_string(),
            args: vec![format!("/select,{path_text}")],
        }),
        FileManagerPlatform::Linux => {
            let folder_path = if path_is_directory {
                path
            } else {
                path.parent()
                    .ok_or_else(|| "Could not resolve containing folder.".to_string())?
            };

            Ok(FileManagerCommand {
                program: "xdg-open".to_string(),
                args: vec![folder_path.to_string_lossy().to_string()],
            })
        }
    }
}

fn strip_markdown_attachment_src_suffix(src: &str) -> &str {
    let query_index = src.find('?');
    let fragment_index = src.find('#');
    let end_index = [query_index, fragment_index]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(src.len());

    &src[..end_index]
}

fn percent_decode_markdown_attachment_path(path: &str) -> Result<String, String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("Markdown attachment path has invalid percent encoding".to_string());
            }

            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| "Markdown attachment path has invalid percent encoding".to_string())?;
            let byte = u8::from_str_radix(hex, 16)
                .map_err(|_| "Markdown attachment path has invalid percent encoding".to_string())?;
            decoded.push(byte);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8(decoded)
        .map_err(|_| "Markdown attachment path has invalid UTF-8 encoding".to_string())
}

#[derive(Debug, PartialEq, Eq)]
enum MarkdownAttachmentSrc {
    Absolute(PathBuf),
    Relative(String),
}

fn file_url_markdown_attachment_src(src: &str) -> Result<PathBuf, String> {
    let local_src = strip_markdown_attachment_src_suffix(src).trim();
    let normalized_scheme = local_src.to_ascii_lowercase();
    if !normalized_scheme.starts_with("file://") {
        return Err("Markdown attachment file URL is invalid".to_string());
    }

    let encoded_path = &local_src["file://".len()..];
    if encoded_path.is_empty() {
        return Err("Markdown attachment path is empty".to_string());
    }

    let decoded_path = percent_decode_markdown_attachment_path(encoded_path)?;
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
        return Err("Markdown attachment file URL must be absolute".to_string());
    }

    Ok(path)
}

fn markdown_attachment_src(src: &str) -> Result<MarkdownAttachmentSrc, String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return Err("Markdown attachment path is empty".to_string());
    }

    let normalized_scheme = trimmed.to_ascii_lowercase();
    if normalized_scheme.starts_with("file:") {
        return Ok(MarkdownAttachmentSrc::Absolute(
            file_url_markdown_attachment_src(trimmed)?,
        ));
    }

    if normalized_scheme.starts_with("data:") || normalized_scheme.contains("://") {
        return Err("Only local workspace attachment links can be opened".to_string());
    }

    let local_src = strip_markdown_attachment_src_suffix(trimmed).trim();
    if local_src.is_empty() {
        return Err("Markdown attachment path is empty".to_string());
    }

    percent_decode_markdown_attachment_path(local_src).map(MarkdownAttachmentSrc::Relative)
}

fn resolve_markdown_attachment_path(
    root_path: &Path,
    document_path: Option<&Path>,
    src: &str,
) -> Result<PathBuf, String> {
    let root = markdown_tree_root_for_path(root_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let base = if let Some(document_path) = document_path {
        let document_path = document_path
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if !document_path.is_file() || !is_markdown_open_file(&document_path) {
            return Err("Current document must be a saved Markdown file".to_string());
        }
        document_path
            .strip_prefix(&root)
            .map_err(|_| "Current document is outside the Markdown folder".to_string())?;

        document_path
            .parent()
            .ok_or_else(|| "Current document folder is invalid".to_string())?
            .to_path_buf()
    } else {
        root.clone()
    };
    let canonical_path = match markdown_attachment_src(src)? {
        MarkdownAttachmentSrc::Absolute(path) => {
            path.canonicalize().map_err(|error| error.to_string())?
        }
        MarkdownAttachmentSrc::Relative(decoded_src) => {
            let src_path = Path::new(&decoded_src);
            if src_path.is_absolute() {
                return Err("Markdown attachment path must be relative".to_string());
            }

            let canonical_path = base
                .join(src_path)
                .canonicalize()
                .map_err(|error| error.to_string())?;
            canonical_path.strip_prefix(&root).map_err(|_| {
                "Markdown attachment is outside the current Markdown folder".to_string()
            })?;
            canonical_path
        }
    };

    if !canonical_path.is_file() || !is_markdown_tree_attachment_file(&canonical_path) {
        return Err("Path is not a supported Markdown attachment".to_string());
    }

    Ok(canonical_path)
}

fn open_default_application_command_for_path(
    path: &Path,
    platform: FileManagerPlatform,
) -> FileManagerCommand {
    let path_text = path.to_string_lossy().to_string();

    match platform {
        FileManagerPlatform::Macos => FileManagerCommand {
            program: "open".to_string(),
            args: vec![path_text],
        },
        FileManagerPlatform::Windows => FileManagerCommand {
            program: "explorer".to_string(),
            args: vec![path_text],
        },
        FileManagerPlatform::Linux => FileManagerCommand {
            program: "xdg-open".to_string(),
            args: vec![path_text],
        },
    }
}

#[tauri::command]
pub(crate) fn open_containing_folder(path: String) -> Result<(), String> {
    let target_path = PathBuf::from(path);
    if !target_path.exists() {
        return Err("Path does not exist.".to_string());
    }

    let command = file_manager_command_for_path(
        &target_path,
        target_path.is_dir(),
        current_file_manager_platform(),
    )?;

    Command::new(&command.program)
        .args(&command.args)
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) fn open_markdown_attachment(
    root_path: String,
    document_path: Option<String>,
    src: String,
) -> Result<(), String> {
    let document_path = document_path.as_deref().map(Path::new);
    let target_path = resolve_markdown_attachment_path(Path::new(&root_path), document_path, &src)?;
    let command =
        open_default_application_command_for_path(&target_path, current_file_manager_platform());

    Command::new(&command.program)
        .args(&command.args)
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
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
    use std::fs;

    use super::*;

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
    fn builds_file_manager_commands_for_common_desktop_platforms() {
        let file_path = PathBuf::from("/mock-project/docs/guide.md");
        let folder_path = PathBuf::from("/mock-project/docs");

        assert_eq!(
            file_manager_command_for_path(&file_path, false, FileManagerPlatform::Macos)
                .expect("macOS file command"),
            FileManagerCommand {
                program: "open".to_string(),
                args: vec!["-R".to_string(), "/mock-project/docs/guide.md".to_string()]
            }
        );
        assert_eq!(
            file_manager_command_for_path(&file_path, false, FileManagerPlatform::Windows)
                .expect("Windows file command"),
            FileManagerCommand {
                program: "explorer".to_string(),
                args: vec!["/select,/mock-project/docs/guide.md".to_string()]
            }
        );
        assert_eq!(
            file_manager_command_for_path(&file_path, false, FileManagerPlatform::Linux)
                .expect("Linux file command"),
            FileManagerCommand {
                program: "xdg-open".to_string(),
                args: vec!["/mock-project/docs".to_string()]
            }
        );
        assert_eq!(
            file_manager_command_for_path(&folder_path, true, FileManagerPlatform::Linux)
                .expect("Linux folder command"),
            FileManagerCommand {
                program: "xdg-open".to_string(),
                args: vec!["/mock-project/docs".to_string()]
            }
        );
    }

    #[test]
    fn builds_default_application_open_commands_for_common_desktop_platforms() {
        let file_path = PathBuf::from("/mock-project/assets/reference.docx");

        assert_eq!(
            open_default_application_command_for_path(&file_path, FileManagerPlatform::Macos),
            FileManagerCommand {
                program: "open".to_string(),
                args: vec!["/mock-project/assets/reference.docx".to_string()]
            }
        );
        assert_eq!(
            open_default_application_command_for_path(&file_path, FileManagerPlatform::Windows),
            FileManagerCommand {
                program: "explorer".to_string(),
                args: vec!["/mock-project/assets/reference.docx".to_string()]
            }
        );
        assert_eq!(
            open_default_application_command_for_path(&file_path, FileManagerPlatform::Linux),
            FileManagerCommand {
                program: "xdg-open".to_string(),
                args: vec!["/mock-project/assets/reference.docx".to_string()]
            }
        );
    }

    #[test]
    fn resolves_markdown_attachment_links_inside_the_workspace_root() {
        let root = std::env::temp_dir().join(format!(
            "markra-attachment-open-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");
        let assets = root.join("assets");
        let note = docs.join("note.md");
        let attachment = assets.join("reference doc.docx");
        let external_root = root.with_file_name(format!(
            "{}-external",
            root.file_name()
                .and_then(|name| name.to_str())
                .expect("test root should have a name")
        ));
        let external_attachment = external_root.join("absolute reference.docx");

        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::create_dir_all(&external_root).expect("external folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");
        fs::write(&attachment, [1, 2, 3]).expect("attachment should be created");
        fs::write(&external_attachment, [4, 5, 6]).expect("external attachment should be created");

        assert_eq!(
            resolve_markdown_attachment_path(&root, Some(&note), "../assets/reference%20doc.docx")
                .expect("attachment link should resolve"),
            attachment
                .canonicalize()
                .expect("attachment should canonicalize")
        );
        assert_eq!(
            resolve_markdown_attachment_path(
                &root,
                Some(&note),
                &file_url_for_test(&external_attachment)
            )
            .expect("absolute attachment link should resolve"),
            external_attachment
                .canonicalize()
                .expect("external attachment should canonicalize")
        );
        assert!(resolve_markdown_attachment_path(&root, Some(&note), "../../secret.docx").is_err());

        fs::remove_dir_all(root).expect("test tree should be removed");
        fs::remove_dir_all(external_root).expect("external test tree should be removed");
    }

    fn file_url_for_test(path: &Path) -> String {
        let path_text = path.to_string_lossy().replace('\\', "/");
        if cfg!(windows) && !path_text.starts_with('/') {
            return format!("file:///{path_text}");
        }

        format!("file://{path_text}")
    }

    #[test]
    fn non_macos_unified_open_picker_avoids_blocking_dialog_call() {
        let source = include_str!("open.rs");
        let blocking_pick_file_call = [".blocking", "_pick_file("].concat();
        let async_pick_file_call = [".pick", "_file(move"].concat();

        assert!(!source.contains(&blocking_pick_file_call));
        assert!(source.contains(&async_pick_file_call));
    }
}
