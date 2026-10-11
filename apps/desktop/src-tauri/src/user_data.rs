use std::{
    fs::{self, OpenOptions},
    path::{Component, Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, Runtime, WebviewWindowBuilder};

// Initialize before startup preferences or plugins read storage. A running
// process must never change profiles while stores and windows remain open.
static USER_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
const USER_DATA_ARG: &str = "--user-data-dir";

#[derive(Default, Debug)]
pub(crate) struct LaunchArgs {
    pub user_data_dir: Option<PathBuf>,
    pub paths: Vec<String>,
}

pub(crate) fn parse_launch_args(
    args: impl IntoIterator<Item = String>,
) -> Result<LaunchArgs, String> {
    let mut launch = LaunchArgs::default();
    let mut args = args.into_iter().skip(1);
    let mut positional = false;
    while let Some(arg) = args.next() {
        if !positional && arg == "--" {
            positional = true;
            continue;
        }
        let directory = if !positional && arg == USER_DATA_ARG {
            Some(
                args.next()
                    .filter(|value| !value.starts_with('-'))
                    .ok_or("--user-data-dir requires a directory")?,
            )
        } else if !positional {
            arg.strip_prefix("--user-data-dir=").map(String::from)
        } else {
            None
        };
        if let Some(directory) = directory {
            if directory.is_empty() {
                return Err("--user-data-dir requires a non-empty directory".into());
            }
            if launch.user_data_dir.replace(directory.into()).is_some() {
                return Err("--user-data-dir may only be specified once".into());
            }
        } else if positional || !arg.starts_with('-') {
            if !arg.trim().is_empty() {
                launch.paths.push(arg);
            }
        }
    }
    Ok(launch)
}

pub(crate) fn prepare_user_data_dir(path: &Path, cwd: &Path) -> Result<PathBuf, String> {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    let storage_error = |error| format!("Could not use data directory {}: {error}", path.display());
    fs::create_dir_all(&path).map_err(&storage_error)?;
    let directory = path.canonicalize().map_err(&storage_error)?;
    // Reject unavailable storage before settings can silently fall back to defaults.
    let probe = directory.join(format!(
        ".markra-write-check-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(&storage_error)?;
    drop(file);
    fs::remove_file(probe).map_err(storage_error)?;
    Ok(directory)
}

pub(crate) fn initialize_user_data_dir(
    args: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    let launch = parse_launch_args(args)?;
    if let Some(path) = launch.user_data_dir {
        let cwd = std::env::current_dir().map_err(|error| error.to_string())?;
        USER_DATA_DIR
            .set(prepare_user_data_dir(&path, &cwd)?)
            .map_err(|_| "Data directory is already initialized")?;
    }
    Ok(())
}

pub(crate) fn user_data_dir() -> Option<&'static Path> {
    USER_DATA_DIR.get().map(PathBuf::as_path)
}

pub(crate) fn app_data_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(directory) = user_data_dir() {
        return Ok(directory.to_path_buf());
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

pub(crate) fn settings_store_path(identifier: &str) -> Option<PathBuf> {
    user_data_dir()
        .map(|path| path.join("settings.json"))
        .or_else(|| dirs::data_dir().map(|path| default_settings_store_path(&path, identifier)))
}

fn default_settings_store_path(data_dir: &Path, identifier: &str) -> PathBuf {
    data_dir.join(identifier).join("settings.json")
}

pub(crate) fn log_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    if let Some(directory) = user_data_dir() {
        return Ok(directory.join("logs"));
    }
    app.path().app_log_dir().map_err(|error| error.to_string())
}

fn store_path_for(directory: Option<&Path>, path: &Path) -> Result<PathBuf, String> {
    if let Some(directory) = directory {
        if path.as_os_str().is_empty()
            || path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("Store path must be relative to the data directory".into());
        }
        return Ok(directory.join(path));
    }
    Ok(path.to_path_buf())
}

#[tauri::command]
pub(crate) fn resolve_store_path(path: String) -> Result<PathBuf, String> {
    store_path_for(user_data_dir(), Path::new(&path))
}

pub(crate) fn configure_webview<R: Runtime>(
    builder: WebviewWindowBuilder<'_, R, tauri::AppHandle<R>>,
) -> WebviewWindowBuilder<'_, R, tauri::AppHandle<R>> {
    if let Some(directory) = user_data_dir() {
        // WKWebView cannot store its cache at an arbitrary path. Keep it ephemeral
        // for custom profiles; durable Markra data is stored through native paths.
        #[cfg(target_os = "macos")]
        {
            let _ = directory;
            return builder.incognito(true);
        }
        #[cfg(not(target_os = "macos"))]
        return builder.data_directory(directory.join("webview"));
    }
    builder
}

fn check_running_directory(current: Option<&Path>, requested: Option<&Path>) -> Result<(), String> {
    if requested.is_some() && current != requested {
        return Err("Markra is already running with a different data directory. Quit Markra before starting it with --user-data-dir.".into());
    }
    Ok(())
}

pub(crate) fn check_forwarded_directory(args: &[String], cwd: &Path) -> Result<(), String> {
    let launch = parse_launch_args(args.iter().cloned())?;
    let requested = launch
        .user_data_dir
        .map(|path| prepare_user_data_dir(&path, cwd))
        .transpose()?;
    check_running_directory(user_data_dir(), requested.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::Path};

    #[test]
    fn parses_both_directory_flag_forms_and_keeps_document_arguments() {
        for args in [
            vec!["markra", "--user-data-dir=mock data", "mock.md"],
            vec!["markra", "--user-data-dir", "mock data", "mock.md"],
        ] {
            let launch = parse_launch_args(args.into_iter().map(String::from)).unwrap();
            assert_eq!(
                launch.user_data_dir.as_deref(),
                Some(Path::new("mock data"))
            );
            assert_eq!(launch.paths, vec!["mock.md"]);
        }
    }

    #[test]
    fn leaves_the_default_directory_and_ignores_other_flags() {
        let launch =
            parse_launch_args(["markra", "--ignored", "mock.md"].map(String::from)).unwrap();
        assert!(launch.user_data_dir.is_none());
        assert_eq!(launch.paths, vec!["mock.md"]);
        assert_eq!(
            default_settings_store_path(Path::new("/mock-system-data"), "dev.mock.app"),
            Path::new("/mock-system-data/dev.mock.app/settings.json")
        );
    }

    #[test]
    fn rejects_missing_empty_and_duplicate_directory_flags() {
        for args in [
            vec!["markra", "--user-data-dir"],
            vec!["markra", "--user-data-dir="],
            vec!["markra", "--user-data-dir", ""],
            vec!["markra", "--user-data-dir", "--ignored"],
            vec!["markra", "--user-data-dir=a", "--user-data-dir=b"],
        ] {
            assert!(parse_launch_args(args.into_iter().map(String::from)).is_err());
        }
    }

    #[test]
    fn honors_the_end_of_options_marker() {
        let launch = parse_launch_args(["markra", "--", "--mock.md"].map(String::from)).unwrap();
        assert!(launch.user_data_dir.is_none());
        assert_eq!(launch.paths, vec!["--mock.md"]);
    }

    #[test]
    fn creates_and_resolves_the_directory_relative_to_the_launch_cwd() {
        let root = tempfile::tempdir().unwrap();
        let resolved = prepare_user_data_dir(Path::new("mock data/nested"), root.path()).unwrap();
        assert_eq!(
            resolved,
            root.path().join("mock data/nested").canonicalize().unwrap()
        );
        assert!(resolved.is_dir());
        assert_eq!(fs::read_dir(&resolved).unwrap().count(), 0);
    }

    #[test]
    fn accepts_an_absolute_existing_directory_without_modifying_settings() {
        let root = tempfile::tempdir().unwrap();
        let settings = root.path().join("settings.json");
        fs::write(&settings, r#"{"language":"en"}"#).unwrap();
        let resolved = prepare_user_data_dir(root.path(), Path::new("/mock-cwd")).unwrap();
        assert_eq!(resolved, root.path().canonicalize().unwrap());
        assert_eq!(
            fs::read_to_string(settings).unwrap(),
            r#"{"language":"en"}"#
        );
    }

    #[test]
    fn rejects_a_file_as_the_data_directory() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("mock-file");
        fs::write(&file, "mock").unwrap();
        assert!(prepare_user_data_dir(&file, root.path()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_an_unwritable_directory_without_falling_back() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().unwrap();
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let result = prepare_user_data_dir(root.path(), root.path());
        fs::set_permissions(root.path(), fs::Permissions::from_mode(0o755)).unwrap();
        assert!(result.is_err());
    }

    #[test]
    fn resolves_settings_and_session_stores_inside_the_selected_directory() {
        let root = Path::new("/mock-data");
        assert_eq!(
            store_path_for(Some(root), Path::new("settings.json")).unwrap(),
            root.join("settings.json")
        );
        assert_eq!(
            store_path_for(Some(root), Path::new("ai-agent-sessions/mock-session.json")).unwrap(),
            root.join("ai-agent-sessions/mock-session.json")
        );
        assert_eq!(
            store_path_for(None, Path::new("settings.json")).unwrap(),
            Path::new("settings.json")
        );
        assert!(store_path_for(Some(root), Path::new("../settings.json")).is_err());
        assert!(store_path_for(Some(root), Path::new("/outside/settings.json")).is_err());
    }

    #[test]
    fn refuses_to_forward_an_explicit_directory_to_a_different_running_profile() {
        assert!(
            check_running_directory(Some(Path::new("/mock-a")), Some(Path::new("/mock-b")))
                .is_err()
        );
        assert!(check_running_directory(None, Some(Path::new("/mock-a"))).is_err());
        assert!(
            check_running_directory(Some(Path::new("/mock-a")), Some(Path::new("/mock-a"))).is_ok()
        );
        assert!(check_running_directory(Some(Path::new("/mock-a")), None).is_ok());
    }
}
