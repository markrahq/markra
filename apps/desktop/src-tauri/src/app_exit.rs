use tauri::{Emitter, Manager, Runtime};

const APP_EXIT_REQUESTED_EVENT: &str = "markra://app-exit-requested";

fn should_intercept_app_exit(code: Option<i32>, open_window_count: usize) -> bool {
    code.is_none() && open_window_count > 0
}

pub(crate) fn handle_app_exit_requested<R: Runtime>(
    app: &tauri::AppHandle<R>,
    code: Option<i32>,
    api: tauri::ExitRequestApi,
) {
    let windows = app.webview_windows();
    if !should_intercept_app_exit(code, windows.len()) {
        return;
    }

    api.prevent_exit();
    let target_window = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next());

    if let Some(window) = target_window {
        let _ = window.emit(APP_EXIT_REQUESTED_EVENT, ());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intercepts_user_exit_when_windows_are_open() {
        assert!(should_intercept_app_exit(None, 1));
    }

    #[test]
    fn allows_programmatic_or_windowless_exit() {
        assert!(!should_intercept_app_exit(Some(0), 1));
        assert!(!should_intercept_app_exit(None, 0));
    }
}
