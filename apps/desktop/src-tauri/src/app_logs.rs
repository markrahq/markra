use std::{fs, path::Path, process::Command};

use tauri::Manager;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LogFolderPlatform {
    Linux,
    Macos,
    Windows,
}

#[derive(Debug, Eq, PartialEq)]
struct LogFolderCommand {
    program: String,
    args: Vec<String>,
}

fn current_log_folder_platform() -> LogFolderPlatform {
    if cfg!(target_os = "macos") {
        return LogFolderPlatform::Macos;
    }

    if cfg!(windows) {
        return LogFolderPlatform::Windows;
    }

    LogFolderPlatform::Linux
}

fn log_folder_command_for_path(path: &Path, platform: LogFolderPlatform) -> LogFolderCommand {
    let path_text = path.to_string_lossy().to_string();

    match platform {
        LogFolderPlatform::Macos => LogFolderCommand {
            program: "open".to_string(),
            args: vec!["-R".to_string(), path_text],
        },
        LogFolderPlatform::Windows => LogFolderCommand {
            program: "explorer".to_string(),
            args: vec![format!("/select,{path_text}")],
        },
        LogFolderPlatform::Linux => LogFolderCommand {
            program: "xdg-open".to_string(),
            args: vec![path_text],
        },
    }
}

#[tauri::command]
pub(crate) fn open_log_folder<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Could not resolve app log directory: {error}"))?;

    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Could not create app log directory: {error}"))?;

    let command = log_folder_command_for_path(&log_dir, current_log_folder_platform());

    Command::new(&command.program)
        .args(&command.args)
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn builds_open_log_folder_commands_for_supported_platforms() {
        let path = Path::new("/tmp/markra-logs");

        assert_eq!(
            log_folder_command_for_path(path, LogFolderPlatform::Macos),
            LogFolderCommand {
                program: "open".to_string(),
                args: vec!["-R".to_string(), "/tmp/markra-logs".to_string()],
            }
        );
        assert_eq!(
            log_folder_command_for_path(path, LogFolderPlatform::Windows),
            LogFolderCommand {
                program: "explorer".to_string(),
                args: vec!["/select,/tmp/markra-logs".to_string()],
            }
        );
        assert_eq!(
            log_folder_command_for_path(path, LogFolderPlatform::Linux),
            LogFolderCommand {
                program: "xdg-open".to_string(),
                args: vec!["/tmp/markra-logs".to_string()],
            }
        );
    }
}
