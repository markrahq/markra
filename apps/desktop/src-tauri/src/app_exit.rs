use crate::windows::is_settings_window_label;
use tauri::{Emitter, Manager, Runtime};

const APP_EXIT_REQUESTED_EVENT: &str = "markra://app-exit-requested";

#[derive(Clone)]
struct AppExitWindowInfo {
    focused: bool,
    label: String,
    visible: bool,
}

fn is_app_exit_user_window(window: &AppExitWindowInfo) -> bool {
    window.visible && !is_settings_window_label(&window.label)
}

fn collect_app_exit_window_infos<R: Runtime>(app: &tauri::AppHandle<R>) -> Vec<AppExitWindowInfo> {
    let windows = app.webview_windows();
    windows
        .values()
        .map(|window| AppExitWindowInfo {
            focused: window.is_focused().unwrap_or(false),
            label: window.label().to_string(),
            visible: window.is_visible().unwrap_or(false),
        })
        .collect::<Vec<_>>()
}

fn count_app_exit_user_windows<R: Runtime>(app: &tauri::AppHandle<R>) -> usize {
    let window_infos = collect_app_exit_window_infos(app);
    window_infos
        .iter()
        .filter(|window| is_app_exit_user_window(window))
        .count()
}

fn app_exit_target_label(windows: &[AppExitWindowInfo]) -> Option<String> {
    windows
        .iter()
        .filter(|window| is_app_exit_user_window(window))
        .find(|window| window.focused)
        .or_else(|| {
            windows
                .iter()
                .find(|window| is_app_exit_user_window(window))
        })
        .map(|window| window.label.clone())
}

fn should_intercept_app_exit(code: Option<i32>, user_window_count: usize) -> bool {
    code.is_none() && user_window_count > 0
}

/// Emits the app-exit-requested event to the focused (or first) user window so
/// the frontend can run its discard/save confirmation flow. No-op when there
/// is no visible user window to confirm with. This does not call
/// `ExitRequestApi::prevent_exit`; that is the caller's responsibility for the
/// `RunEvent::ExitRequested` path, and the self-drawn Quit menu path does not
/// have an exit request to prevent.
fn emit_app_exit_requested<R: Runtime>(app: &tauri::AppHandle<R>) {
    let window_infos = collect_app_exit_window_infos(app);
    let user_window_count = window_infos
        .iter()
        .filter(|window| is_app_exit_user_window(window))
        .count();
    if user_window_count == 0 {
        return;
    }

    if let Some(label) =
        app_exit_target_label(&window_infos).and_then(|label| app.get_webview_window(&label))
    {
        let _ = label.emit(APP_EXIT_REQUESTED_EVENT, ());
    }
}

/// Triggers the app-wide exit confirmation flow from the self-drawn menu Quit
/// item. Routes through the same frontend listener as a native window-close
/// exit request so discard/save confirmation and `exitNativeApp()` run once.
#[tauri::command]
pub(crate) fn request_app_exit(app: tauri::AppHandle) {
    emit_app_exit_requested(&app);
}

pub(crate) fn handle_app_exit_requested<R: Runtime>(
    app: &tauri::AppHandle<R>,
    code: Option<i32>,
    api: tauri::ExitRequestApi,
) {
    if !should_intercept_app_exit(code, count_app_exit_user_windows(app)) {
        return;
    }

    api.prevent_exit();
    emit_app_exit_requested(app);
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

    #[test]
    fn ignores_settings_windows_for_app_exit_interception() {
        let windows = [AppExitWindowInfo {
            focused: true,
            label: "markra-settings".to_string(),
            visible: false,
        }];
        let user_window_count = windows
            .iter()
            .filter(|window| is_app_exit_user_window(window))
            .count();

        assert_eq!(user_window_count, 0);
        assert!(!should_intercept_app_exit(None, user_window_count));
        assert_eq!(app_exit_target_label(&windows), None);
    }

    #[test]
    fn targets_visible_non_settings_windows_for_app_exit_confirmation() {
        let windows = [
            AppExitWindowInfo {
                focused: true,
                label: "markra-settings".to_string(),
                visible: false,
            },
            AppExitWindowInfo {
                focused: false,
                label: "main".to_string(),
                visible: true,
            },
        ];

        assert_eq!(app_exit_target_label(&windows).as_deref(), Some("main"));
    }
}
