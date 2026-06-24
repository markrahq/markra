use std::env;
use std::fs;
#[cfg(windows)]
use std::io;
use std::path::{Path, PathBuf};
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
};
#[cfg(windows)]
use winreg::{
    enums::{RegType, HKEY_CURRENT_USER, REG_EXPAND_SZ, REG_SZ},
    types::FromRegValue,
    RegKey, RegValue,
};

const COMMAND_NAME: &str = "markra";
const MANAGED_MARKER: &str = "Managed by Markra";
const TARGET_PREFIX: &str = "target: ";

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ShellCommandStatus {
    command_path: Option<String>,
    target_path: Option<String>,
    status: String,
}

fn shell_command_file_name() -> &'static str {
    if cfg!(windows) {
        "markra.cmd"
    } else {
        COMMAND_NAME
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn executable_target_path() -> Result<PathBuf, String> {
    if let Some(appimage) = env::var_os("APPIMAGE") {
        let path = PathBuf::from(appimage);
        if path.is_file() {
            return Ok(path);
        }
    }

    env::current_exe().map_err(|error| error.to_string())
}

fn path_entries() -> Vec<PathBuf> {
    env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect())
        .unwrap_or_default()
}

fn command_candidates_for_dir(dir: &Path) -> Vec<PathBuf> {
    if cfg!(windows) {
        ["markra.cmd", "markra.exe", "markra.bat", "markra"]
            .into_iter()
            .map(|file_name| dir.join(file_name))
            .collect()
    } else {
        vec![dir.join(COMMAND_NAME)]
    }
}

fn existing_command_in_path() -> Option<PathBuf> {
    path_entries()
        .into_iter()
        .flat_map(|dir| command_candidates_for_dir(&dir))
        .find(|path| path.is_file())
}

fn directory_is_writable(path: &Path) -> bool {
    path.is_dir()
        && fs::metadata(path)
            .map(|metadata| !metadata.permissions().readonly())
            .unwrap_or(false)
}

fn directory_is_installable(path: &Path) -> bool {
    if path.is_dir() {
        return directory_is_writable(path);
    }

    path.ancestors()
        .skip(1)
        .find(|ancestor| ancestor.exists())
        .is_some_and(directory_is_writable)
}

fn standard_install_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }

    if cfg!(windows) {
        #[cfg(windows)]
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local_app_data).join("Markra").join("bin"));
        }
    } else {
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join(".local/bin"));
            dirs.push(home.join("bin"));
        }

        if cfg!(target_os = "linux") {
            dirs.push(PathBuf::from("/usr/local/bin"));
        }
    }

    dirs
}

fn preferred_install_dir() -> Option<PathBuf> {
    if let Some(dir) = env::var_os("MARKRA_SHELL_COMMAND_DIR").map(PathBuf::from) {
        return Some(dir);
    }

    standard_install_dirs()
        .into_iter()
        .chain(path_entries())
        .find(|path| directory_is_installable(path))
}

fn preferred_command_path() -> Option<PathBuf> {
    preferred_install_dir().map(|dir| dir.join(shell_command_file_name()))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn command_script(target_path: &Path) -> String {
    let target = path_to_string(target_path);

    if cfg!(windows) {
        return format!(
            "@echo off\r\nREM {MANAGED_MARKER}\r\nREM {TARGET_PREFIX}{target}\r\n\"{target}\" %*\r\n"
        );
    }

    format!(
        "#!/bin/sh\n# {MANAGED_MARKER}\n# {TARGET_PREFIX}{target}\nexec {} \"$@\"\n",
        shell_quote(&target)
    )
}

fn managed_target_from_command(path: &Path) -> Option<PathBuf> {
    let content = fs::read_to_string(path).ok()?;
    if !content.contains(MANAGED_MARKER) {
        return None;
    }

    content.lines().find_map(|line| {
        let normalized = line
            .trim()
            .trim_start_matches('#')
            .trim_start_matches("REM")
            .trim();
        normalized
            .strip_prefix(TARGET_PREFIX)
            .map(|target| PathBuf::from(target.trim()))
    })
}

#[cfg(any(windows, test))]
fn normalized_windows_path_entry(value: &str) -> String {
    let trimmed = value.trim().trim_matches('"').trim_end_matches(['\\', '/']);

    trimmed.replace('/', "\\").to_ascii_lowercase()
}

#[cfg(any(windows, test))]
fn windows_path_contains_dir(path_value: &str, dir: &Path) -> bool {
    let dir = normalized_windows_path_entry(&path_to_string(dir));
    path_value
        .split(';')
        .any(|entry| normalized_windows_path_entry(entry) == dir)
}

#[cfg(any(windows, test))]
fn windows_path_with_dir(path_value: &str, dir: &Path) -> String {
    if windows_path_contains_dir(path_value, dir) {
        return path_value.to_string();
    }

    let dir = path_to_string(dir);
    let path_value = path_value.trim_end_matches(';');
    if path_value.trim().is_empty() {
        return dir;
    }

    format!("{path_value};{dir}")
}

#[cfg(windows)]
fn ensure_process_path_contains_dir(dir: &Path) {
    let path_value = env::var_os("PATH")
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();

    if windows_path_contains_dir(&path_value, dir) {
        return;
    }

    env::set_var("PATH", windows_path_with_dir(&path_value, dir));
}

#[cfg(windows)]
fn windows_user_environment_key() -> Result<RegKey, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.create_subkey("Environment")
        .map(|(key, _)| key)
        .map_err(|error| format!("Failed to open the user environment registry key: {error}"))
}

#[cfg(windows)]
fn windows_user_path_value(key: &RegKey) -> Result<Option<RegValue>, String> {
    match key
        .get_raw_value("Path")
        .or_else(|_| key.get_raw_value("PATH"))
    {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read the user PATH: {error}")),
    }
}

#[cfg(windows)]
fn registry_string_value(value: &str, vtype: RegType) -> RegValue {
    let mut bytes = Vec::new();
    for word in value.encode_utf16().chain(std::iter::once(0)) {
        bytes.extend_from_slice(&word.to_le_bytes());
    }

    RegValue { bytes, vtype }
}

#[cfg(windows)]
fn windows_user_path() -> Result<String, String> {
    let key = windows_user_environment_key()?;
    let Some(value) = windows_user_path_value(&key)? else {
        return Ok(String::new());
    };

    String::from_reg_value(&value)
        .map_err(|error| format!("Failed to decode the user PATH: {error}"))
}

#[cfg(windows)]
fn set_windows_user_path(path_value: &str) -> Result<(), String> {
    let key = windows_user_environment_key()?;
    let value_type = windows_user_path_value(&key)?
        .map(|value| match value.vtype {
            REG_SZ | REG_EXPAND_SZ => value.vtype,
            _ => REG_EXPAND_SZ,
        })
        .unwrap_or(REG_EXPAND_SZ);
    let value = registry_string_value(path_value, value_type);

    key.set_raw_value("Path", &value)
        .map_err(|error| format!("Failed to update the user PATH: {error}"))?;
    broadcast_windows_environment_change();
    Ok(())
}

#[cfg(windows)]
fn broadcast_windows_environment_change() {
    let environment = "Environment"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut result = 0usize;

    unsafe {
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            environment.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            &mut result,
        );
    }
}

#[cfg(windows)]
fn ensure_windows_user_path_contains_dir(dir: &Path) -> Result<(), String> {
    let user_path = windows_user_path()?;
    let next_user_path = windows_path_with_dir(&user_path, dir);

    if next_user_path != user_path {
        set_windows_user_path(&next_user_path)?;
    }

    ensure_process_path_contains_dir(dir);
    Ok(())
}

#[cfg(not(windows))]
fn ensure_windows_user_path_contains_dir(_dir: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn command_path_needs_shell_path_repair(command_path: &Path) -> bool {
    let Some(command_dir) = command_path.parent() else {
        return false;
    };

    let process_path = env::var_os("PATH")
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    if windows_path_contains_dir(&process_path, command_dir) {
        return false;
    }

    windows_user_path()
        .map(|user_path| !windows_path_contains_dir(&user_path, command_dir))
        .unwrap_or(true)
}

#[cfg(not(windows))]
fn command_path_needs_shell_path_repair(_command_path: &Path) -> bool {
    false
}

fn paths_match(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn status_value(
    command_path: Option<&Path>,
    target_path: Option<&Path>,
    status: &str,
) -> ShellCommandStatus {
    ShellCommandStatus {
        command_path: command_path.map(path_to_string),
        target_path: target_path.map(path_to_string),
        status: status.to_string(),
    }
}

fn managed_command_status(
    command_path: &Path,
    target_path: &Path,
    managed_target: &Path,
    needs_path_repair: bool,
) -> ShellCommandStatus {
    let status = if paths_match(managed_target, target_path) && !needs_path_repair {
        "installed"
    } else {
        "needsRepair"
    };

    status_value(Some(command_path), Some(target_path), status)
}

fn shell_command_status_for_target(target_path: &Path) -> ShellCommandStatus {
    if let Some(command_path) = existing_command_in_path() {
        if let Some(managed_target) = managed_target_from_command(&command_path) {
            return managed_command_status(&command_path, target_path, &managed_target, false);
        }

        return status_value(Some(&command_path), Some(target_path), "conflict");
    }

    let Some(command_path) = preferred_command_path() else {
        return status_value(None, Some(target_path), "unavailable");
    };

    if command_path.is_file() {
        if let Some(managed_target) = managed_target_from_command(&command_path) {
            return managed_command_status(
                &command_path,
                target_path,
                &managed_target,
                command_path_needs_shell_path_repair(&command_path),
            );
        }

        return status_value(Some(&command_path), Some(target_path), "conflict");
    }

    status_value(Some(&command_path), Some(target_path), "missing")
}

fn shell_command_status() -> ShellCommandStatus {
    match executable_target_path() {
        Ok(target_path) => shell_command_status_for_target(&target_path),
        Err(_) => status_value(None, None, "unavailable"),
    }
}

fn install_command_at(command_path: &Path, target_path: &Path) -> Result<(), String> {
    if command_path.is_file() && managed_target_from_command(command_path).is_none() {
        return Err(format!(
            "A different markra command already exists at {}.",
            path_to_string(command_path)
        ));
    }

    let parent = command_path
        .parent()
        .ok_or_else(|| "Command path is invalid.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(command_path, command_script(target_path)).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(command_path)
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(command_path, permissions).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn get_shell_command_status() -> ShellCommandStatus {
    shell_command_status()
}

#[tauri::command]
pub(crate) fn install_shell_command() -> Result<ShellCommandStatus, String> {
    let target_path = executable_target_path()?;
    let status = shell_command_status_for_target(&target_path);

    if status.status == "conflict" {
        return Err("A different markra command already exists on PATH.".to_string());
    }

    let command_path = status
        .command_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(preferred_command_path)
        .ok_or_else(|| {
            "No writable PATH directory is available for installing markra.".to_string()
        })?;

    install_command_at(&command_path, &target_path)?;
    if let Some(command_dir) = command_path.parent() {
        ensure_windows_user_path_contains_dir(command_dir)?;
    }

    Ok(shell_command_status_for_target(&target_path))
}

#[tauri::command]
pub(crate) fn uninstall_shell_command() -> Result<ShellCommandStatus, String> {
    let target_path = executable_target_path()?;
    let status = shell_command_status_for_target(&target_path);

    let Some(command_path) = status.command_path.as_deref().map(PathBuf::from) else {
        return Ok(status);
    };

    if command_path.is_file() {
        if managed_target_from_command(&command_path).is_none() {
            return Err("The markra command on PATH is not managed by Markra.".to_string());
        }

        fs::remove_file(&command_path).map_err(|error| error.to_string())?;
    }

    Ok(shell_command_status_for_target(&target_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "markra-shell-command-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root should be created");
        root
    }

    #[test]
    fn creates_a_managed_shell_script_for_the_markra_executable() {
        let target = PathBuf::from("/mock-app/Markra.app/Contents/MacOS/markra");
        let script = command_script(&target);

        assert!(script.contains(MANAGED_MARKER));
        assert!(script.contains("target: /mock-app/Markra.app/Contents/MacOS/markra"));
        if cfg!(windows) {
            assert!(script.contains("\"/mock-app/Markra.app/Contents/MacOS/markra\" %*"));
        } else {
            assert!(script.contains("exec '/mock-app/Markra.app/Contents/MacOS/markra' \"$@\""));
        }
    }

    #[test]
    fn detects_repair_when_a_managed_command_points_to_an_old_target() {
        let root = test_root("repair");
        let command_path = root.join(shell_command_file_name());
        let old_target = root.join("old-markra");
        let next_target = root.join("next-markra");
        fs::write(&old_target, "").expect("old target should be created");
        fs::write(&next_target, "").expect("next target should be created");
        install_command_at(&command_path, &old_target).expect("command should install");

        let status = if let Some(managed_target) = managed_target_from_command(&command_path) {
            let status = if paths_match(&managed_target, &next_target) {
                "installed"
            } else {
                "needsRepair"
            };
            status_value(Some(&command_path), Some(&next_target), status)
        } else {
            status_value(Some(&command_path), Some(&next_target), "conflict")
        };

        assert_eq!(status.status, "needsRepair");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn detects_repair_when_a_managed_command_is_not_available_from_the_shell() {
        let root = test_root("path-repair");
        let command_path = root.join("markra.cmd");
        let target = root.join("markra.exe");
        fs::write(&target, "").expect("target should be created");

        let status = managed_command_status(&command_path, &target, &target, true);

        assert_eq!(status.status, "needsRepair");

        fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn appends_windows_install_dir_to_user_path_once() {
        let install_dir = PathBuf::from(r"C:\Users\Mock\AppData\Local\Markra\bin");
        let original_path = r"C:\Windows\System32;C:\Tools";
        let next_path = windows_path_with_dir(original_path, &install_dir);

        assert_eq!(
            next_path,
            r"C:\Windows\System32;C:\Tools;C:\Users\Mock\AppData\Local\Markra\bin"
        );
        assert_eq!(windows_path_with_dir(&next_path, &install_dir), next_path);
        assert!(windows_path_contains_dir(
            r"C:\WINDOWS\system32;c:\users\mock\appdata\local\markra\bin\",
            &install_dir
        ));
    }

    #[test]
    fn windows_path_updates_do_not_depend_on_powershell() {
        let source = include_str!("shell_command.rs");
        let command_new = ["Command", "::new("].concat();
        let process_command = ["std::process", "::Command"].concat();

        assert!(
            !source.contains(&command_new) && !source.contains(&process_command),
            "updating the Windows user PATH should use registry APIs instead of shelling out"
        );
    }
}
