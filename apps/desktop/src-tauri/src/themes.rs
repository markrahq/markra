#[cfg(unix)]
use cap_fs_ext::OpenOptionsExt;
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::fs::{Dir, OpenOptions};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

const MAX_THEME_BYTES: u64 = 1024 * 1024;
const LIGHT_TEMPLATE: &str = include_str!("../../../../packages/app/src/themes/light.css");
const DARK_TEMPLATE: &str = include_str!("../../../../packages/app/src/themes/dark.css");
const THEME_GUIDE: &str = include_str!("../../../../packages/app/src/themes/README.md");

#[derive(Serialize)]
pub(crate) struct ThemeDirectory {
    directory: String,
    files: Vec<String>,
}

fn theme_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("themes"))
        .map_err(|error| error.to_string())
}

fn initialize_theme_directory(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    if root
        .join(".initialized")
        .try_exists()
        .map_err(|error| error.to_string())?
    {
        return Ok(());
    }
    // Seed once, with exclusive creates: upgrades must never replace edits or deleted templates.
    for (name, contents) in [
        ("starter-light.css", LIGHT_TEMPLATE),
        ("starter-dark.css", DARK_TEMPLATE),
        ("README.md", THEME_GUIDE),
    ] {
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join(name))
        {
            Ok(mut file) => file
                .write_all(contents.as_bytes())
                .map_err(|error| error.to_string())?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(root.join(".initialized"))
        .or_else(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                fs::File::open(root.join(".initialized"))
            } else {
                Err(error)
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn valid_theme_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
        && Path::new(name)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("css"))
}

fn list_theme_files(root: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if valid_theme_file_name(&name)
            && entry
                .file_type()
                .map_err(|error| error.to_string())?
                .is_file()
        {
            files.push(name);
        }
    }
    files.sort_by(|a, b| {
        a.to_lowercase()
            .cmp(&b.to_lowercase())
            .then_with(|| a.cmp(b))
    });
    Ok(files)
}

fn read_theme_css(root: &Path, name: &str) -> Result<String, String> {
    if !valid_theme_file_name(name) {
        return Err("Theme must be a CSS file in the theme directory".into());
    }
    let directory = Dir::open_ambient_dir(root, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    options.custom_flags(rustix::fs::OFlags::NONBLOCK.bits() as i32);
    // Open relative to the managed directory without following links; check the opened file itself.
    let file = directory
        .open_with(name, &options)
        .map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_THEME_BYTES {
        return Err("Theme must be a regular CSS file of at most 1 MiB".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_THEME_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_THEME_BYTES {
        return Err("Theme exceeds 1 MiB".into());
    }
    String::from_utf8(bytes).map_err(|_| "Theme must use UTF-8 encoding".into())
}

#[tauri::command]
pub(crate) async fn list_themes(app: tauri::AppHandle) -> Result<ThemeDirectory, String> {
    let root = theme_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        initialize_theme_directory(&root)?;
        Ok(ThemeDirectory {
            files: list_theme_files(&root)?,
            directory: root.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn read_theme(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let root = theme_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_theme_css(&root, &file_name))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn open_theme_folder(app: tauri::AppHandle) -> Result<(), String> {
    let root = theme_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        initialize_theme_directory(&root)?;
        let program = if cfg!(target_os = "macos") {
            "open"
        } else if cfg!(windows) {
            "explorer"
        } else {
            "xdg-open"
        };
        Command::new(program)
            .arg(root)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn initializes_templates_once_and_preserves_edits_and_deletions() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("themes");
        initialize_theme_directory(&root).unwrap();
        assert!(root.join("starter-light.css").is_file());
        assert!(root.join("starter-dark.css").is_file());
        assert!(root.join("README.md").is_file());
        fs::write(root.join("starter-light.css"), "/* edited */").unwrap();
        fs::remove_file(root.join("starter-dark.css")).unwrap();
        initialize_theme_directory(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("starter-light.css")).unwrap(),
            "/* edited */"
        );
        assert!(!root.join("starter-dark.css").exists());
    }

    #[test]
    fn lists_only_top_level_css_files_in_stable_order() {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("b.CSS"), "").unwrap();
        fs::write(temp.path().join("a.css"), "").unwrap();
        fs::write(temp.path().join("README.md"), "").unwrap();
        fs::create_dir(temp.path().join("nested.css")).unwrap();
        assert_eq!(
            list_theme_files(temp.path()).unwrap(),
            vec!["a.css", "b.CSS"]
        );
    }

    #[test]
    fn reads_whole_utf8_stylesheets_and_rejects_invalid_paths_and_large_files() {
        let temp = tempdir().unwrap();
        let css = format!("/* {} */", "x".repeat(60_000));
        fs::write(temp.path().join("mock.css"), &css).unwrap();
        assert_eq!(read_theme_css(temp.path(), "mock.css").unwrap(), css);
        for name in [
            "../mock.css",
            "/mock.css",
            "a/b.css",
            "a\\b.css",
            "mock.txt",
            "mock\0.css",
        ] {
            assert!(read_theme_css(temp.path(), name).is_err(), "{name}");
        }
        fs::write(
            temp.path().join("large.css"),
            vec![b' '; MAX_THEME_BYTES as usize + 1],
        )
        .unwrap();
        assert!(read_theme_css(temp.path(), "large.css").is_err());
        fs::write(temp.path().join("invalid.css"), [0xff, 0xfe]).unwrap();
        assert!(read_theme_css(temp.path(), "invalid.css").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_to_files_outside_the_theme_directory() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("themes");
        fs::create_dir(&root).unwrap();
        fs::write(temp.path().join("outside.css"), "/* outside */").unwrap();
        std::os::unix::fs::symlink(temp.path().join("outside.css"), root.join("linked.css"))
            .unwrap();
        assert!(read_theme_css(&root, "linked.css").is_err());
        assert!(list_theme_files(&root).unwrap().is_empty());
    }
}
