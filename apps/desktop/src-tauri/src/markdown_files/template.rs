use std::fs;
use std::path::{Path, PathBuf};

use super::path::normalize_markdown_tree_single_file_name;
use super::types::MarkdownTemplateFile;
use tauri::Manager;

fn normalize_markdown_template_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_name = normalize_markdown_tree_single_file_name(file_name)?;
    let candidate = Path::new(&trimmed_name);

    if candidate
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Ok(trimmed_name);
    }

    Err("Template file must use .md".to_string())
}

fn markdown_template_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("templates"))
        .map_err(|error| error.to_string())
}

fn markdown_template_file_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(markdown_template_dir(app)?.join(normalize_markdown_template_file_name(file_name)?))
}

#[tauri::command]
pub(crate) fn read_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<MarkdownTemplateFile, String> {
    let path = markdown_template_file_path(&app, &file_name)?;
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;

    Ok(MarkdownTemplateFile { contents })
}

#[tauri::command]
pub(crate) fn write_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
    contents: String,
) -> Result<(), String> {
    let dir = markdown_template_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(
        dir.join(normalize_markdown_template_file_name(&file_name)?),
        contents,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn delete_markdown_template_file(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<(), String> {
    let path = markdown_template_file_path(&app, &file_name)?;
    if !path.exists() {
        return Ok(());
    }

    fs::remove_file(path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_markdown_template_file_names() {
        assert_eq!(
            normalize_markdown_template_file_name(" standup.md ")
                .expect("template file name should normalize"),
            "standup.md"
        );
        assert!(normalize_markdown_template_file_name("../standup.md").is_err());
        assert!(normalize_markdown_template_file_name("standup.markdown").is_err());
        assert!(normalize_markdown_template_file_name("standup").is_err());
    }
}
