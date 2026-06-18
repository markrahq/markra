use std::{
    path::{Path, PathBuf},
    process::Command,
};

use crate::windows::{
    editor_window_url_for_folder, editor_window_url_for_path, spawn_editor_window,
};

use super::path::markdown_open_path_for_path;
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
    fn non_macos_unified_open_picker_avoids_blocking_dialog_call() {
        let source = include_str!("open.rs");
        let blocking_pick_file_call = [".blocking", "_pick_file("].concat();
        let async_pick_file_call = [".pick", "_file(move"].concat();

        assert!(!source.contains(&blocking_pick_file_call));
        assert!(source.contains(&async_pick_file_call));
    }
}
