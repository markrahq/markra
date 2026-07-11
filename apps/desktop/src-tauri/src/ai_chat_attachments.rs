use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

const ATTACHMENT_ROOT_FOLDER: &str = "ai-agent-sessions";
const MAX_IDENTIFIER_BYTES: usize = 128;

fn safe_identifier(value: &str) -> Result<&str, String> {
    if value.is_empty() || value.len() > MAX_IDENTIFIER_BYTES {
        return Err("AI chat attachment identifier is invalid.".to_string());
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("AI chat attachment identifier is invalid.".to_string());
    }

    Ok(value)
}

fn extension_for_mime_type(mime_type: &str) -> Result<&'static str, String> {
    match mime_type {
        "image/gif" => Ok("gif"),
        "image/jpeg" => Ok("jpg"),
        "image/png" => Ok("png"),
        "image/webp" => Ok("webp"),
        _ => Err("AI chat attachment image type is unsupported.".to_string()),
    }
}

fn attachment_path(
    root: &Path,
    session_id: &str,
    attachment_id: &str,
    mime_type: &str,
) -> Result<PathBuf, String> {
    let session_id = safe_identifier(session_id)?;
    let attachment_id = safe_identifier(attachment_id)?;
    let extension = extension_for_mime_type(mime_type)?;

    Ok(root
        .join(session_id)
        .join("attachments")
        .join(format!("{attachment_id}.{extension}")))
}

fn save_attachment(
    root: &Path,
    session_id: &str,
    attachment_id: &str,
    mime_type: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let path = attachment_path(root, session_id, attachment_id, mime_type)?;
    let parent = path
        .parent()
        .ok_or_else(|| "AI chat attachment path is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create AI chat attachment storage: {error}"))?;
    fs::write(path, bytes).map_err(|error| format!("Could not save AI chat attachment: {error}"))
}

fn read_attachment(
    root: &Path,
    session_id: &str,
    attachment_id: &str,
    mime_type: &str,
) -> Result<Vec<u8>, String> {
    let path = attachment_path(root, session_id, attachment_id, mime_type)?;

    fs::read(path).map_err(|error| format!("Could not read AI chat attachment: {error}"))
}

fn delete_attachment_session(root: &Path, session_id: &str) -> Result<(), String> {
    let session_path = root.join(safe_identifier(session_id)?);
    match fs::remove_dir_all(session_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not delete AI chat attachment storage: {error}"
        )),
    }
}

fn attachment_root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(ATTACHMENT_ROOT_FOLDER))
        .map_err(|error| format!("Could not resolve AI chat attachment storage: {error}"))
}

#[tauri::command]
pub fn save_ai_chat_attachment<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
    attachment_id: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    save_attachment(
        &attachment_root(&app)?,
        &session_id,
        &attachment_id,
        &mime_type,
        &bytes,
    )
}

#[tauri::command]
pub fn read_ai_chat_attachment<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
    attachment_id: String,
    mime_type: String,
) -> Result<Vec<u8>, String> {
    read_attachment(
        &attachment_root(&app)?,
        &session_id,
        &attachment_id,
        &mime_type,
    )
}

#[tauri::command]
pub fn delete_ai_chat_attachment_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session_id: String,
) -> Result<(), String> {
    delete_attachment_session(&attachment_root(&app)?, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should follow Unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("markra-ai-chat-attachment-{name}-{nanos}"))
    }

    #[test]
    fn validates_storage_identifiers_and_image_mime_types() {
        assert!(safe_identifier("session-1").is_ok());
        assert!(safe_identifier("attachment_1").is_ok());
        assert!(safe_identifier("").is_err());
        assert!(safe_identifier("../unsafe").is_err());
        assert!(safe_identifier("nested/path").is_err());
        assert!(safe_identifier("nested\\path").is_err());

        assert_eq!(extension_for_mime_type("image/png").unwrap(), "png");
        assert_eq!(extension_for_mime_type("image/jpeg").unwrap(), "jpg");
        assert_eq!(extension_for_mime_type("image/webp").unwrap(), "webp");
        assert_eq!(extension_for_mime_type("image/gif").unwrap(), "gif");
        assert!(extension_for_mime_type("image/svg+xml").is_err());
    }

    #[test]
    fn saves_reads_and_deletes_session_attachments() {
        let root = test_root("round-trip");
        let bytes = vec![1, 2, 3, 4];

        save_attachment(&root, "session-1", "attachment-1", "image/png", &bytes).unwrap();
        assert_eq!(
            read_attachment(&root, "session-1", "attachment-1", "image/png").unwrap(),
            bytes
        );

        delete_attachment_session(&root, "session-1").unwrap();
        assert!(!root.join("session-1").exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
