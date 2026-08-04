use serde::Serialize;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardContent {
    html: Option<String>,
    text: Option<String>,
}

fn clipboard_text_from_result(
    result: Result<String, arboard::Error>,
) -> Result<Option<String>, String> {
    match result {
        Ok(text) => Ok(Some(text)),
        Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(format!("Could not read clipboard text: {error}")),
    }
}

fn clipboard_content_from_results(
    text_result: Result<String, arboard::Error>,
    html_result: Result<String, arboard::Error>,
) -> Result<Option<ClipboardContent>, String> {
    let text = clipboard_text_from_result(text_result);
    let html = clipboard_text_from_result(html_result);
    match (text, html) {
        (Ok(text), Ok(html)) => {
            Ok((text.is_some() || html.is_some()).then_some(ClipboardContent { html, text }))
        }
        (Ok(Some(text)), Err(_)) => Ok(Some(ClipboardContent {
            html: None,
            text: Some(text),
        })),
        (Err(_), Ok(Some(html))) => Ok(Some(ClipboardContent {
            html: Some(html),
            text: None,
        })),
        (Err(error), Ok(None)) | (Ok(None), Err(error)) | (Err(error), Err(_)) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("Could not access clipboard: {error}"))?;

    clipboard_text_from_result(clipboard.get_text())
}

#[tauri::command]
pub(crate) fn read_clipboard_content() -> Result<Option<ClipboardContent>, String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("Could not access clipboard: {error}"))?;
    let text = clipboard.get().text();
    let html = clipboard.get().html();

    clipboard_content_from_results(text, html)
}

#[cfg(test)]
mod tests {
    use super::{clipboard_content_from_results, clipboard_text_from_result, ClipboardContent};

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

    #[test]
    fn returns_rich_clipboard_content() {
        assert_eq!(
            clipboard_content_from_results(
                Ok("mock text".to_string()),
                Ok("<p><strong>mock text</strong></p>".to_string()),
            ),
            Ok(Some(ClipboardContent {
                html: Some("<p><strong>mock text</strong></p>".to_string()),
                text: Some("mock text".to_string()),
            }))
        );
    }

    #[test]
    fn keeps_plain_text_when_html_is_unavailable() {
        assert_eq!(
            clipboard_content_from_results(
                Ok("mock text".to_string()),
                Err(arboard::Error::ContentNotAvailable),
            ),
            Ok(Some(ClipboardContent {
                html: None,
                text: Some("mock text".to_string()),
            }))
        );
    }
}
