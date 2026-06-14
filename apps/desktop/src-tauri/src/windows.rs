use std::sync::atomic::{AtomicUsize, Ordering};

#[cfg(target_os = "macos")]
use std::{ops::Deref, time::Duration};

#[cfg(target_os = "macos")]
use dispatch2::{DispatchQueue, DispatchTime};
#[cfg(target_os = "macos")]
use objc2::Message;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowStyleMask};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{utils::config::Color, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const BLANK_EDITOR_WINDOW_LABEL_PREFIX: &str = "markra-editor-";
const BLANK_EDITOR_WINDOW_URL: &str = "index.html?blank=1";
const MAIN_WINDOW_LABEL: &str = "main";
const EDITOR_WINDOW_DECORATIONS: bool = true;
#[cfg(test)]
pub(crate) const MINIMIZE_CURRENT_WINDOW_COMMAND: &str = "minimize_current_window";
#[cfg(test)]
pub(crate) const OPEN_BLANK_EDITOR_WINDOW_COMMAND: &str = "open_blank_editor_window";
#[cfg(test)]
pub(crate) const OPEN_SETTINGS_WINDOW_COMMAND: &str = "open_settings_window";
const SETTINGS_WINDOW_LABEL: &str = "markra-settings";
const SETTINGS_WINDOW_URL: &str = "index.html?settings=1";
const SETTINGS_WINDOW_TARGET_EVENT: &str = "markra://settings-window-target";
const SETTINGS_WINDOW_TARGET_EXPORT_PANDOC_PATH: &str = "exportPandocPath";
const SETTINGS_WINDOW_DECORATIONS: bool = true;
const SETTINGS_WINDOW_WIDTH: f64 = 1040.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 720.0;
const SETTINGS_WINDOW_MIN_WIDTH: f64 = 860.0;
const SETTINGS_WINDOW_MIN_HEIGHT: f64 = 600.0;
const SETTINGS_WINDOW_RESIZABLE: bool = true;
const SETTINGS_WINDOW_SHADOW: bool = true;
#[cfg(target_os = "macos")]
const SETTINGS_WINDOW_HIDDEN_TITLE: bool = true;
#[cfg(target_os = "macos")]
const MACOS_FULLSCREEN_MINIMIZE_DELAY_MS: u64 = 700;

static NEXT_EDITOR_WINDOW_ID: AtomicUsize = AtomicUsize::new(1);

fn current_window_chrome_platform() -> &'static str {
    std::env::consts::OS
}

fn transparent_window_chrome_for_platform(platform: &str) -> bool {
    platform == "macos"
}

fn transparent_window_background_color_for_platform(platform: &str) -> Option<Color> {
    if transparent_window_chrome_for_platform(platform) {
        return Some(Color(255, 255, 255, 0));
    }

    None
}

fn next_blank_editor_window_label() -> String {
    let id = NEXT_EDITOR_WINDOW_ID.fetch_add(1, Ordering::Relaxed);
    format!("{BLANK_EDITOR_WINDOW_LABEL_PREFIX}{id}")
}

fn is_blank_editor_window_label(label: &str) -> bool {
    label.starts_with(BLANK_EDITOR_WINDOW_LABEL_PREFIX)
}

pub(crate) fn is_settings_window_label(label: &str) -> bool {
    label == SETTINGS_WINDOW_LABEL
}

fn should_hide_native_menu_for_window_label(label: &str) -> bool {
    is_settings_window_label(label)
}

pub(crate) fn hide_native_menu_for_settings_window<R>(window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    if should_hide_native_menu_for_window_label(window.label()) {
        let _ = window.hide_menu();
    }
}

pub(crate) fn hide_native_menu_for_settings_window_in_app<R>(app: &tauri::AppHandle<R>)
where
    R: tauri::Runtime,
{
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        hide_native_menu_for_settings_window(&window);
    }
}

fn encode_url_query_component(value: &str) -> String {
    let mut encoded = String::new();

    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

#[cfg(target_os = "macos")]
fn hide_native_macos_window_controls<R>(window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    schedule_hide_native_macos_window_controls(ns_window);
}

#[cfg(target_os = "macos")]
struct MainThreadSafe<T>(T);

#[cfg(target_os = "macos")]
unsafe impl<T> Send for MainThreadSafe<T> {}

#[cfg(target_os = "macos")]
impl<T> Deref for MainThreadSafe<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[cfg(not(target_os = "macos"))]
fn hide_native_macos_window_controls<R>(_window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
}

#[cfg(target_os = "macos")]
fn hide_native_macos_window_controls_for_window<R>(window: &tauri::Window<R>)
where
    R: tauri::Runtime,
{
    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    schedule_hide_native_macos_window_controls(ns_window);
}

#[cfg(target_os = "macos")]
fn schedule_hide_native_macos_window_controls(ns_window: *mut std::ffi::c_void) {
    if ns_window.is_null() {
        return;
    }

    let ns_window = ns_window as usize;

    dispatch2::run_on_main(move |_| {
        let ns_window = ns_window as *mut std::ffi::c_void;
        hide_native_macos_standard_buttons(ns_window);
    });
}

#[cfg(target_os = "macos")]
fn hide_native_macos_standard_buttons(ns_window: *mut std::ffi::c_void) {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let window = unsafe { &*ns_window.cast::<NSWindow>() };

    for button in [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ] {
        if let Some(button) = window.standardWindowButton(button) {
            button.setHidden(true);
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_webview_window_chrome<R>(webview: &tauri::Webview<R>)
where
    R: tauri::Runtime,
{
    let Ok(ns_window) = webview.window().ns_window() else {
        return;
    };
    schedule_hide_native_macos_window_controls(ns_window);
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_webview_window_chrome<R>(_webview: &tauri::Webview<R>)
where
    R: tauri::Runtime,
{
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_window_event_chrome<R>(window: &tauri::Window<R>, event: &tauri::WindowEvent)
where
    R: tauri::Runtime,
{
    match event {
        tauri::WindowEvent::Focused(true)
        | tauri::WindowEvent::Resized(_)
        | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            hide_native_macos_window_controls_for_window(window);
        }
        _ => {}
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_window_event_chrome<R>(_window: &tauri::Window<R>, _event: &tauri::WindowEvent)
where
    R: tauri::Runtime,
{
}

#[cfg(target_os = "macos")]
pub(crate) fn apply_main_window_chrome<R>(app: &tauri::App<R>)
where
    R: tauri::Runtime,
{
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        hide_native_macos_window_controls(&window);
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn apply_main_window_chrome<R>(_app: &tauri::App<R>)
where
    R: tauri::Runtime,
{
}

pub(crate) fn editor_window_url_for_path(path: &str) -> String {
    format!("index.html?path={}", encode_url_query_component(path))
}

pub(crate) fn editor_window_url_for_folder(path: &str) -> String {
    format!("index.html?folder={}", encode_url_query_component(path))
}

fn normalized_settings_window_target(target: Option<&str>) -> Option<&'static str> {
    match target {
        Some(SETTINGS_WINDOW_TARGET_EXPORT_PANDOC_PATH) => {
            Some(SETTINGS_WINDOW_TARGET_EXPORT_PANDOC_PATH)
        }
        _ => None,
    }
}

fn settings_window_url(target: Option<&str>) -> String {
    if let Some(target) = normalized_settings_window_target(target) {
        return format!(
            "{SETTINGS_WINDOW_URL}&settingsTarget={}",
            encode_url_query_component(target)
        );
    }

    SETTINGS_WINDOW_URL.to_string()
}

#[cfg(not(target_os = "macos"))]
fn create_settings_window_menu<R>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>>
where
    R: tauri::Runtime,
{
    tauri::menu::MenuBuilder::new(app).build()
}

pub(crate) fn spawn_editor_window<R>(app: tauri::AppHandle<R>, url: String)
where
    R: tauri::Runtime,
{
    // Create secondary windows off the menu event thread to avoid WebView2 deadlocks on Windows.
    std::thread::spawn(move || {
        let label = next_blank_editor_window_label();
        debug_assert!(is_blank_editor_window_label(&label));

        let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
            .title("")
            .inner_size(1360.0, 800.0)
            .min_inner_size(960.0, 640.0)
            .decorations(editor_window_decorations())
            .transparent(editor_window_transparent())
            .shadow(true)
            .center();

        #[cfg(target_os = "macos")]
        let builder = builder
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true);

        match builder.build() {
            Ok(window) => {
                hide_native_macos_window_controls(&window);
            }
            Err(error) => {
                eprintln!("failed to create blank editor window: {error}");
            }
        }
    });
}

fn editor_window_transparent() -> bool {
    transparent_window_chrome_for_platform(current_window_chrome_platform())
}

fn editor_window_decorations() -> bool {
    EDITOR_WINDOW_DECORATIONS
}

#[cfg(target_os = "macos")]
fn miniaturize_macos_window(window: &NSWindow) {
    NSWindow::miniaturize(window, Some(window));
}

#[cfg(target_os = "macos")]
fn schedule_macos_window_minimize(window: &NSWindow) {
    let ns_window = MainThreadSafe(window.retain());
    let delay = DispatchTime::try_from(Duration::from_millis(MACOS_FULLSCREEN_MINIMIZE_DELAY_MS))
        .unwrap_or(DispatchTime::NOW);

    let _ = DispatchQueue::main().after(delay, move || {
        miniaturize_macos_window(&ns_window);
    });
}

#[cfg(target_os = "macos")]
fn minimize_macos_window(ns_window: *mut std::ffi::c_void) {
    if ns_window.is_null() {
        return;
    }

    let ns_window = ns_window as usize;
    dispatch2::run_on_main(move |_| {
        let ns_window = ns_window as *mut std::ffi::c_void;
        let window = unsafe { &*ns_window.cast::<NSWindow>() };

        if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
            let retained_window = window.retain();
            window.toggleFullScreen(None);
            schedule_macos_window_minimize(&retained_window);
            return;
        }

        miniaturize_macos_window(window);
    });
}

#[cfg(target_os = "macos")]
fn minimize_window<R>(window: &tauri::Window<R>) -> tauri::Result<()>
where
    R: tauri::Runtime,
{
    let Ok(ns_window) = window.ns_window() else {
        return window.minimize();
    };

    minimize_macos_window(ns_window);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn minimize_window<R>(window: &tauri::Window<R>) -> tauri::Result<()>
where
    R: tauri::Runtime,
{
    window.minimize()
}

#[tauri::command]
pub(crate) fn minimize_current_window(window: tauri::Window) -> Result<(), String> {
    minimize_window(&window).map_err(|error| error.to_string())
}

pub(crate) fn spawn_blank_editor_window<R>(app: tauri::AppHandle<R>)
where
    R: tauri::Runtime,
{
    spawn_editor_window(app, BLANK_EDITOR_WINDOW_URL.to_string());
}

#[tauri::command]
pub(crate) fn open_blank_editor_window(app: tauri::AppHandle) {
    spawn_blank_editor_window(app);
}

fn settings_window_transparent() -> bool {
    transparent_window_chrome_for_platform(current_window_chrome_platform())
}

fn settings_window_decorations() -> bool {
    SETTINGS_WINDOW_DECORATIONS
}

fn settings_window_inner_size() -> (f64, f64) {
    (SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
}

fn settings_window_min_inner_size() -> (f64, f64) {
    (SETTINGS_WINDOW_MIN_WIDTH, SETTINGS_WINDOW_MIN_HEIGHT)
}

fn settings_window_resizable() -> bool {
    SETTINGS_WINDOW_RESIZABLE
}

fn settings_window_shadow() -> bool {
    SETTINGS_WINDOW_SHADOW
}

fn settings_window_background_color() -> Option<Color> {
    transparent_window_background_color_for_platform(current_window_chrome_platform())
}

#[cfg(target_os = "macos")]
fn settings_window_title_bar_style() -> TitleBarStyle {
    TitleBarStyle::Overlay
}

#[cfg(target_os = "macos")]
fn settings_window_hidden_title() -> bool {
    SETTINGS_WINDOW_HIDDEN_TITLE
}

#[derive(Clone, serde::Serialize)]
struct SettingsWindowTargetPayload {
    target: String,
}

pub(crate) fn spawn_settings_window<R>(app: tauri::AppHandle<R>, target: Option<String>)
where
    R: tauri::Runtime,
{
    let target = normalized_settings_window_target(target.as_deref()).map(str::to_string);

    std::thread::spawn(move || {
        if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
            let _ = window.show();
            hide_native_menu_for_settings_window(&window);
            let _ = window.set_focus();
            if let Some(target) = target.clone() {
                let _ = window.emit(
                    SETTINGS_WINDOW_TARGET_EVENT,
                    SettingsWindowTargetPayload { target },
                );
            }
            return;
        }

        let (width, height) = settings_window_inner_size();
        let (min_width, min_height) = settings_window_min_inner_size();

        let builder = WebviewWindowBuilder::new(
            &app,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App(settings_window_url(target.as_deref()).into()),
        )
        .title("Settings")
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .decorations(settings_window_decorations())
        .transparent(settings_window_transparent())
        .resizable(settings_window_resizable())
        .shadow(settings_window_shadow())
        .center();

        #[cfg(not(target_os = "macos"))]
        let builder = match create_settings_window_menu(&app) {
            Ok(menu) => builder.menu(menu),
            Err(error) => {
                eprintln!("failed to create settings window menu: {error}");
                builder
            }
        };

        let builder = if let Some(color) = settings_window_background_color() {
            builder.background_color(color)
        } else {
            builder
        };

        #[cfg(target_os = "macos")]
        let builder = builder
            .title_bar_style(settings_window_title_bar_style())
            .hidden_title(settings_window_hidden_title());

        match builder.build() {
            Ok(window) => {
                hide_native_macos_window_controls(&window);
                hide_native_menu_for_settings_window(&window);
            }
            Err(error) => {
                eprintln!("failed to create settings window: {error}");
            }
        }
    });
}

#[tauri::command]
pub(crate) fn open_settings_window(app: tauri::AppHandle, target: Option<String>) {
    spawn_settings_window(app, target);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_window_matches_editor_window_chrome() {
        assert_eq!(settings_window_transparent(), editor_window_transparent());
        assert_eq!(settings_window_decorations(), editor_window_decorations());

        #[cfg(target_os = "macos")]
        {
            assert!(matches!(
                settings_window_title_bar_style(),
                TitleBarStyle::Overlay
            ));
            assert!(settings_window_hidden_title());
        }
    }

    #[test]
    fn secondary_window_transparency_is_enabled_only_on_macos() {
        assert!(transparent_window_chrome_for_platform("macos"));
        assert!(!transparent_window_chrome_for_platform("windows"));
        assert!(!transparent_window_chrome_for_platform("linux"));
    }

    #[test]
    fn editor_window_transparency_matches_current_platform_strategy() {
        #[cfg(target_os = "macos")]
        assert!(editor_window_transparent());

        #[cfg(not(target_os = "macos"))]
        assert!(!editor_window_transparent());
    }

    #[test]
    fn settings_window_transparency_matches_current_platform_strategy() {
        #[cfg(target_os = "macos")]
        assert!(settings_window_transparent());

        #[cfg(not(target_os = "macos"))]
        assert!(!settings_window_transparent());
    }

    #[test]
    fn macos_windows_preserve_native_rounded_frame() {
        assert!(editor_window_decorations());
        assert!(settings_window_decorations());
    }

    #[test]
    fn macos_main_window_config_preserves_native_rounded_frame() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.macos.conf.json"))
                .expect("macOS Tauri config should be valid JSON");
        let decorations = config
            .pointer("/app/windows/0/decorations")
            .and_then(serde_json::Value::as_bool);
        let title_bar_style = config
            .pointer("/app/windows/0/titleBarStyle")
            .and_then(serde_json::Value::as_str);
        let hidden_title = config
            .pointer("/app/windows/0/hiddenTitle")
            .and_then(serde_json::Value::as_bool);

        assert_eq!(decorations, Some(true));
        assert_eq!(title_bar_style, Some("Overlay"));
        assert_eq!(hidden_title, Some(true));
    }

    #[test]
    fn main_capability_allows_self_drawn_window_controls() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/main.json"))
                .expect("main capability should be valid JSON");
        let permissions = capability
            .pointer("/permissions")
            .and_then(serde_json::Value::as_array)
            .expect("main capability should declare permissions");

        for permission in [
            "core:window:allow-close",
            "core:window:allow-destroy",
            "core:window:allow-minimize",
            "core:window:allow-set-fullscreen",
            "core:window:allow-toggle-maximize",
        ] {
            assert!(
                permissions
                    .iter()
                    .any(|value| value.as_str() == Some(permission)),
                "missing permission {permission}"
            );
        }
    }

    #[test]
    fn windows_main_window_config_disables_transparency() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.windows.conf.json"))
                .expect("windows Tauri config should be valid JSON");
        let transparent = config
            .pointer("/app/windows/0/transparent")
            .and_then(serde_json::Value::as_bool);

        assert_eq!(transparent, Some(false));
    }

    #[test]
    fn linux_main_window_config_disables_transparency() {
        let config_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.linux.conf.json");
        let config: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(config_path).expect("Linux Tauri config should exist"),
        )
        .expect("Linux Tauri config should be valid JSON");
        let transparent = config
            .pointer("/app/windows/0/transparent")
            .and_then(serde_json::Value::as_bool);

        assert_eq!(transparent, Some(false));
    }

    #[test]
    fn settings_window_uses_roomier_default_size() {
        assert_eq!(settings_window_inner_size(), (1040.0, 720.0));
        assert_eq!(settings_window_min_inner_size(), (860.0, 600.0));
        assert!(settings_window_resizable());
    }

    #[test]
    fn settings_window_is_the_only_window_label_that_hides_native_menu() {
        assert!(should_hide_native_menu_for_window_label(
            SETTINGS_WINDOW_LABEL
        ));
        assert!(!should_hide_native_menu_for_window_label(MAIN_WINDOW_LABEL));
        assert!(!should_hide_native_menu_for_window_label("markra-editor-1"));
    }

    #[test]
    fn secondary_window_background_matches_transparency_strategy() {
        assert_eq!(
            transparent_window_background_color_for_platform("macos"),
            Some(Color(255, 255, 255, 0))
        );
        assert_eq!(
            transparent_window_background_color_for_platform("windows"),
            None
        );
        assert_eq!(
            transparent_window_background_color_for_platform("linux"),
            None
        );
    }

    #[test]
    fn settings_window_background_matches_current_platform_strategy() {
        assert!(settings_window_shadow());

        #[cfg(target_os = "macos")]
        assert_eq!(
            settings_window_background_color(),
            Some(Color(255, 255, 255, 0))
        );

        #[cfg(not(target_os = "macos"))]
        assert_eq!(settings_window_background_color(), None);
    }

    #[test]
    fn creates_unique_blank_editor_window_labels() {
        let first = next_blank_editor_window_label();
        let second = next_blank_editor_window_label();

        assert_ne!(first, second);
        assert!(is_blank_editor_window_label(&first));
        assert!(is_blank_editor_window_label(&second));
        assert!(!is_blank_editor_window_label("main"));
    }

    #[test]
    fn exposes_window_command_names_for_js_menus() {
        assert_eq!(MINIMIZE_CURRENT_WINDOW_COMMAND, "minimize_current_window");
        assert_eq!(OPEN_BLANK_EDITOR_WINDOW_COMMAND, "open_blank_editor_window");
        assert_eq!(OPEN_SETTINGS_WINDOW_COMMAND, "open_settings_window");
    }

    #[test]
    fn targets_export_pandoc_settings_from_window_url() {
        assert_eq!(
            settings_window_url(Some("exportPandocPath")),
            "index.html?settings=1&settingsTarget=exportPandocPath"
        );
    }

    #[test]
    fn encodes_open_file_window_urls() {
        assert_eq!(
            editor_window_url_for_path("/mock files/read me.md"),
            "index.html?path=%2Fmock%20files%2Fread%20me.md"
        );
        assert_eq!(
            editor_window_url_for_folder("/mock files/vault"),
            "index.html?folder=%2Fmock%20files%2Fvault"
        );
        assert_eq!(
            editor_window_url_for_path("/mock/中文.md"),
            "index.html?path=%2Fmock%2F%E4%B8%AD%E6%96%87.md"
        );
    }
}
