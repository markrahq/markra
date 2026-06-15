fn clipboard_text_from_result(
    result: Result<String, arboard::Error>,
) -> Result<Option<String>, String> {
    match result {
        Ok(text) => Ok(Some(text)),
        Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(format!("Could not read clipboard text: {error}")),
    }
}

#[tauri::command]
pub(crate) fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("Could not access clipboard: {error}"))?;

    clipboard_text_from_result(clipboard.get_text())
}

#[cfg(test)]
mod tests {
    use super::clipboard_text_from_result;

    #[test]
    fn returns_none_when_clipboard_text_is_unavailable() {
        assert_eq!(
            clipboard_text_from_result(Err(arboard::Error::ContentNotAvailable)),
            Ok(None)
        );
    }

    #[test]
    fn returns_clipboard_text() {
        assert_eq!(
            clipboard_text_from_result(Ok("mock clipboard".to_string())),
            Ok(Some("mock clipboard".to_string()))
        );
    }
}
