use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};

use crate::{
    language::{resolve_startup_language, AppLanguage},
    menu::remember_native_menu_webview_window,
    menu_labels,
};

#[cfg(target_os = "macos")]
use std::ops::Deref;

#[cfg(target_os = "macos")]
use dispatch2::{DispatchQueue, DispatchTime};
#[cfg(target_os = "macos")]
use objc2::Message;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowStyleMask};
use serde_json::{Map, Value};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{utils::config::Color, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const BLANK_EDITOR_WINDOW_LABEL_PREFIX: &str = "markra-editor-";
const BLANK_EDITOR_WINDOW_URL: &str = "index.html?blank=1";
const MAIN_WINDOW_LABEL: &str = "main";
const RESTORABLE_EDITOR_WINDOW_URL: &str = "index.html";
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
const SETTINGS_STORE_PATH: &str = "settings.json";
const SETTINGS_STARTUP_LANGUAGE_PARAM: &str = "startupLanguage";
const SETTINGS_STARTUP_APPEARANCE_MODE_PARAM: &str = "startupAppearanceMode";
const SETTINGS_STARTUP_LIGHT_THEME_PARAM: &str = "startupLightTheme";
const SETTINGS_STARTUP_DARK_THEME_PARAM: &str = "startupDarkTheme";
const SETTINGS_LEGACY_THEME_KEY: &str = "theme";
const SETTINGS_APPEARANCE_MODE_KEY: &str = "appearanceMode";
const SETTINGS_LIGHT_THEME_KEY: &str = "lightTheme";
const SETTINGS_DARK_THEME_KEY: &str = "darkTheme";
const SETTINGS_WINDOW_NATIVE_REVEAL_FALLBACK_MS: u64 = 1_800;
const SETTINGS_WINDOW_IDLE_DESTROY_MS: u64 = 5 * 60 * 1000;
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

#[derive(Default)]
struct SettingsWindowRuntimeState {
    creating: bool,
    idle_destroy_generation: usize,
    pending_target: Option<String>,
    ready: bool,
    show_when_ready: bool,
}

static SETTINGS_WINDOW_RUNTIME_STATE: OnceLock<Mutex<SettingsWindowRuntimeState>> = OnceLock::new();

fn settings_window_runtime_state() -> &'static Mutex<SettingsWindowRuntimeState> {
    SETTINGS_WINDOW_RUNTIME_STATE.get_or_init(|| Mutex::new(SettingsWindowRuntimeState::default()))
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SettingsWindowStartupPreferences {
    language: AppLanguage,
    appearance_mode: String,
    light_theme: String,
    dark_theme: String,
}

impl SettingsWindowStartupPreferences {
    fn default_for_language(language: AppLanguage) -> Self {
        Self {
            language,
            appearance_mode: "system".to_string(),
            light_theme: "light".to_string(),
            dark_theme: "dark".to_string(),
        }
    }
}

impl Default for SettingsWindowStartupPreferences {
    fn default() -> Self {
        Self::default_for_language(AppLanguage::En)
    }
}

const APP_APPEARANCE_MODE_OPTIONS: &[&str] = &["system", "light", "dark"];
const LIGHT_EDITOR_THEME_OPTIONS: &[&str] = &[
    "light",
    "github",
    "one-light",
    "gothic",
    "newsprint",
    "pixyll",
    "whitey",
    "sepia",
    "solarized-light",
    "catppuccin-latte",
    "academic",
    "minimal",
    "custom",
];
const DARK_EDITOR_THEME_OPTIONS: &[&str] = &[
    "dark",
    "github-dark",
    "one-dark",
    "one-dark-pro",
    "night",
    "solarized-dark",
    "nord",
    "catppuccin-mocha",
    "custom",
];

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

pub(crate) fn is_editor_window_label(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL || is_blank_editor_window_label(label)
}

pub(crate) fn is_settings_window_label(label: &str) -> bool {
    label == SETTINGS_WINDOW_LABEL
}

fn should_hide_native_menu_for_window_label_on_platform(platform: &str, label: &str) -> bool {
    if is_settings_window_label(label) {
        return true;
    }

    platform == "windows" && is_editor_window_label(label)
}

fn should_hide_native_menu_for_window_label(label: &str) -> bool {
    should_hide_native_menu_for_window_label_on_platform(current_window_chrome_platform(), label)
}

fn editor_window_decorations_for_platform(platform: &str) -> bool {
    platform != "windows"
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
pub(crate) fn apply_main_window_chrome<R>(app: &tauri::App<R>)
where
    R: tauri::Runtime,
{
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        hide_native_menu_for_settings_window(&window);
    }
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

fn append_url_query_param(url: &mut String, key: &str, value: &str) {
    url.push('&');
    url.push_str(key);
    url.push('=');
    url.push_str(&encode_url_query_component(value));
}

fn settings_store_path(identifier: &str) -> Option<PathBuf> {
    dirs::data_dir().map(|data_dir| data_dir.join(identifier).join(SETTINGS_STORE_PATH))
}

fn read_settings_object(path: &Path) -> Option<Map<String, Value>> {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok())
        .and_then(|settings| settings.as_object().cloned())
}

fn stored_settings_string<'a>(settings: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    settings.get(key).and_then(Value::as_str)
}

fn is_app_appearance_mode(value: &str) -> bool {
    APP_APPEARANCE_MODE_OPTIONS.contains(&value)
}

fn is_light_editor_theme(value: &str) -> bool {
    LIGHT_EDITOR_THEME_OPTIONS.contains(&value)
}

fn is_dark_editor_theme(value: &str) -> bool {
    DARK_EDITOR_THEME_OPTIONS.contains(&value)
}

fn legacy_theme_preferences(
    language: AppLanguage,
    theme: Option<&str>,
) -> SettingsWindowStartupPreferences {
    let mut preferences = SettingsWindowStartupPreferences::default_for_language(language);
    let Some(theme) = theme else {
        return preferences;
    };

    if theme == "system" {
        return preferences;
    }

    if is_dark_editor_theme(theme) {
        preferences.appearance_mode = "dark".to_string();
        preferences.dark_theme = theme.to_string();
        return preferences;
    }

    if is_light_editor_theme(theme) {
        preferences.appearance_mode = "light".to_string();
        preferences.light_theme = theme.to_string();
    }

    preferences
}

fn settings_window_startup_preferences(identifier: &str) -> SettingsWindowStartupPreferences {
    let language = resolve_startup_language(identifier);
    let Some(settings_path) = settings_store_path(identifier) else {
        return SettingsWindowStartupPreferences::default_for_language(language);
    };
    let Some(settings) = read_settings_object(&settings_path) else {
        return SettingsWindowStartupPreferences::default_for_language(language);
    };

    let mut preferences = legacy_theme_preferences(
        language,
        stored_settings_string(&settings, SETTINGS_LEGACY_THEME_KEY),
    );

    if let Some(appearance_mode) = stored_settings_string(&settings, SETTINGS_APPEARANCE_MODE_KEY)
        .filter(|value| is_app_appearance_mode(value))
    {
        preferences.appearance_mode = appearance_mode.to_string();
    }

    if let Some(light_theme) = stored_settings_string(&settings, SETTINGS_LIGHT_THEME_KEY)
        .filter(|value| is_light_editor_theme(value))
    {
        preferences.light_theme = light_theme.to_string();
    }

    if let Some(dark_theme) = stored_settings_string(&settings, SETTINGS_DARK_THEME_KEY)
        .filter(|value| is_dark_editor_theme(value))
    {
        preferences.dark_theme = dark_theme.to_string();
    }

    preferences
}

fn settings_window_url(
    target: Option<&str>,
    startup_preferences: &SettingsWindowStartupPreferences,
) -> String {
    let mut url = SETTINGS_WINDOW_URL.to_string();

    append_url_query_param(
        &mut url,
        SETTINGS_STARTUP_LANGUAGE_PARAM,
        startup_preferences.language.as_code(),
    );
    append_url_query_param(
        &mut url,
        SETTINGS_STARTUP_APPEARANCE_MODE_PARAM,
        &startup_preferences.appearance_mode,
    );
    append_url_query_param(
        &mut url,
        SETTINGS_STARTUP_LIGHT_THEME_PARAM,
        &startup_preferences.light_theme,
    );
    append_url_query_param(
        &mut url,
        SETTINGS_STARTUP_DARK_THEME_PARAM,
        &startup_preferences.dark_theme,
    );

    if let Some(target) = normalized_settings_window_target(target) {
        append_url_query_param(&mut url, "settingsTarget", target);
    }

    url
}

fn spawn_editor_window_with_label<R>(app: tauri::AppHandle<R>, label: String, url: String)
where
    R: tauri::Runtime,
{
    // Create editor windows off the menu/reopen event thread to avoid WebView2 deadlocks on Windows.
    std::thread::spawn(move || {
        let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
            .title("")
            .inner_size(1360.0, 800.0)
            .min_inner_size(360.0, 320.0)
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
                remember_native_menu_webview_window(&window);
                hide_native_macos_window_controls(&window);
                hide_native_menu_for_settings_window(&window);
            }
            Err(error) => {
                eprintln!("failed to create blank editor window: {error}");
            }
        }
    });
}

pub(crate) fn spawn_editor_window<R>(app: tauri::AppHandle<R>, url: String)
where
    R: tauri::Runtime,
{
    let label = next_blank_editor_window_label();
    debug_assert!(is_blank_editor_window_label(&label));
    spawn_editor_window_with_label(app, label, url);
}

pub(crate) fn spawn_restorable_editor_window<R>(app: tauri::AppHandle<R>)
where
    R: tauri::Runtime,
{
    // ?blank=1 deliberately opts out of workspace restore. App/Dock reopens need index.html
    // so the frontend can replay the saved tabs instead of starting an empty document.
    spawn_editor_window_with_label(
        app,
        MAIN_WINDOW_LABEL.to_string(),
        RESTORABLE_EDITOR_WINDOW_URL.to_string(),
    );
}

fn editor_window_transparent() -> bool {
    transparent_window_chrome_for_platform(current_window_chrome_platform())
}

fn editor_window_decorations() -> bool {
    editor_window_decorations_for_platform(current_window_chrome_platform())
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
    editor_window_decorations()
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

fn settings_window_visible() -> bool {
    false
}

fn settings_window_resolved_appearance(
    startup_preferences: &SettingsWindowStartupPreferences,
) -> &str {
    if startup_preferences.appearance_mode == "light" {
        return "light";
    }

    "dark"
}

fn settings_window_background_color_for_preferences(
    platform: &str,
    startup_preferences: &SettingsWindowStartupPreferences,
) -> Option<Color> {
    if let Some(color) = transparent_window_background_color_for_platform(platform) {
        return Some(color);
    }

    if settings_window_resolved_appearance(startup_preferences) == "light" {
        return Some(Color(255, 255, 255, 255));
    }

    Some(Color(30, 30, 30, 255))
}

fn settings_window_title(language: AppLanguage) -> String {
    menu_labels::for_language(language)
        .settings
        .trim_end_matches('.')
        .to_string()
}

fn next_settings_window_idle_destroy_generation(state: &mut SettingsWindowRuntimeState) -> usize {
    state.idle_destroy_generation = state.idle_destroy_generation.wrapping_add(1);
    state.idle_destroy_generation
}

fn begin_settings_window_creation(show_when_ready: bool, pending_target: Option<String>) -> bool {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return true;
    };

    if state.creating {
        if show_when_ready {
            state.show_when_ready = true;
            if pending_target.is_some() {
                state.pending_target = pending_target;
            }
            next_settings_window_idle_destroy_generation(&mut state);
        }
        return false;
    }

    state.creating = true;
    state.ready = false;
    state.show_when_ready = show_when_ready;
    state.pending_target = pending_target;
    next_settings_window_idle_destroy_generation(&mut state);
    true
}

fn finish_settings_window_creation() -> bool {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return false;
    };

    state.creating = false;
    state.show_when_ready
}

fn cancel_settings_window_creation() {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return;
    };

    state.creating = false;
    state.ready = false;
    state.show_when_ready = false;
    state.pending_target = None;
    next_settings_window_idle_destroy_generation(&mut state);
}

fn reset_settings_window_runtime_state() {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return;
    };

    state.creating = false;
    state.ready = false;
    state.show_when_ready = false;
    state.pending_target = None;
    next_settings_window_idle_destroy_generation(&mut state);
}

fn request_settings_window_show_when_ready(target: Option<&str>) -> bool {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return true;
    };

    next_settings_window_idle_destroy_generation(&mut state);
    if state.ready {
        return true;
    }

    state.show_when_ready = true;
    if let Some(target) = target {
        state.pending_target = Some(target.to_string());
    }
    false
}

fn mark_settings_window_runtime_ready() -> Option<Option<String>> {
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        return None;
    };

    state.creating = false;
    state.ready = true;
    if !state.show_when_ready {
        return None;
    }

    state.show_when_ready = false;
    Some(state.pending_target.take())
}

fn settings_window_should_reveal_from_fallback() -> bool {
    let Ok(state) = settings_window_runtime_state().lock() else {
        return true;
    };

    state.show_when_ready
}

fn schedule_settings_window_idle_destroy<R>(window: tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    let generation = {
        let Ok(mut state) = settings_window_runtime_state().lock() else {
            return;
        };

        state.show_when_ready = false;
        state.pending_target = None;
        next_settings_window_idle_destroy_generation(&mut state)
    };

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(SETTINGS_WINDOW_IDLE_DESTROY_MS));
        let should_destroy = {
            let Ok(mut state) = settings_window_runtime_state().lock() else {
                return;
            };

            if state.idle_destroy_generation != generation {
                return;
            }

            state.creating = false;
            state.ready = false;
            state.show_when_ready = false;
            state.pending_target = None;
            true
        };

        if should_destroy && !window.is_visible().unwrap_or(false) {
            let _ = window.close();
        }
    });
}

#[cfg(target_os = "macos")]
fn settings_window_title_bar_style() -> TitleBarStyle {
    TitleBarStyle::Overlay
}

#[cfg(target_os = "macos")]
fn settings_window_hidden_title() -> bool {
    SETTINGS_WINDOW_HIDDEN_TITLE
}

fn show_settings_window<R>(window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    let Ok(mut state) = settings_window_runtime_state().lock() else {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    };
    state.show_when_ready = false;
    state.pending_target = None;
    next_settings_window_idle_destroy_generation(&mut state);
    drop(state);

    let _ = window.show();
    let _ = window.set_focus();
}

fn emit_settings_window_target<R>(window: &tauri::WebviewWindow<R>, target: &str)
where
    R: tauri::Runtime,
{
    let _ = window.emit(
        SETTINGS_WINDOW_TARGET_EVENT,
        SettingsWindowTargetPayload {
            target: target.to_string(),
        },
    );
}

fn show_settings_window_if_hidden<R>(window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    if window.is_visible().unwrap_or(false) {
        return;
    }

    show_settings_window(window);
}

fn hide_settings_window_instance<R>(window: &tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    let _ = window.hide();
    schedule_settings_window_idle_destroy(window.clone());
}

fn should_close_hidden_settings_window(
    has_visible_user_window: bool,
    settings_window_visible: bool,
) -> bool {
    !has_visible_user_window && !settings_window_visible
}

fn close_hidden_settings_window_if_no_user_windows<R>(
    app: &tauri::AppHandle<R>,
    destroyed_window_label: &str,
) where
    R: tauri::Runtime,
{
    let windows = app.webview_windows();
    let has_visible_user_window = windows.values().any(|window| {
        let label = window.label();
        label != destroyed_window_label
            && !is_settings_window_label(label)
            && window.is_visible().unwrap_or(false)
    });
    let Some(settings_window) = windows.get(SETTINGS_WINDOW_LABEL) else {
        return;
    };
    if !should_close_hidden_settings_window(
        has_visible_user_window,
        settings_window.is_visible().unwrap_or(false),
    ) {
        return;
    }

    reset_settings_window_runtime_state();
    let _ = settings_window.close();
}

pub(crate) fn apply_settings_window_lifecycle<R>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) where
    R: tauri::Runtime,
{
    if !matches!(event, tauri::WindowEvent::Destroyed) {
        return;
    }

    if is_settings_window_label(window.label()) {
        reset_settings_window_runtime_state();
        return;
    }

    close_hidden_settings_window_if_no_user_windows(app, window.label());
}

fn spawn_settings_window_reveal_fallback<R>(window: tauri::WebviewWindow<R>)
where
    R: tauri::Runtime,
{
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(
            SETTINGS_WINDOW_NATIVE_REVEAL_FALLBACK_MS,
        ));
        if !settings_window_should_reveal_from_fallback() {
            return;
        }
        show_settings_window_if_hidden(&window);
    });
}

#[derive(Clone, serde::Serialize)]
struct SettingsWindowTargetPayload {
    target: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ExistingSettingsWindowAction {
    Hide,
    Show,
}

fn existing_settings_window_action(
    is_focused: bool,
    is_visible: bool,
) -> ExistingSettingsWindowAction {
    if is_focused && is_visible {
        return ExistingSettingsWindowAction::Hide;
    }

    ExistingSettingsWindowAction::Show
}

fn handle_existing_settings_window<R>(
    window: &tauri::WebviewWindow<R>,
    target: Option<&str>,
    action: ExistingSettingsWindowAction,
) where
    R: tauri::Runtime,
{
    match action {
        ExistingSettingsWindowAction::Hide => {
            hide_settings_window_instance(window);
        }
        ExistingSettingsWindowAction::Show => {
            hide_native_menu_for_settings_window(window);
            if request_settings_window_show_when_ready(target) {
                show_settings_window(window);
                if let Some(target) = target {
                    emit_settings_window_target(window, target);
                }
            } else {
                spawn_settings_window_reveal_fallback(window.clone());
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SettingsWindowStartupMode {
    Open,
    Prewarm,
}

fn spawn_settings_window_with_mode<R>(
    app: tauri::AppHandle<R>,
    target: Option<String>,
    mode: SettingsWindowStartupMode,
) where
    R: tauri::Runtime,
{
    let target = normalized_settings_window_target(target.as_deref()).map(str::to_string);
    let identifier = app.config().identifier.clone();

    std::thread::spawn(move || {
        if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
            if mode == SettingsWindowStartupMode::Open {
                handle_existing_settings_window(
                    &window,
                    target.as_deref(),
                    ExistingSettingsWindowAction::Show,
                );
            }
            return;
        }

        let show_when_ready = mode == SettingsWindowStartupMode::Open;
        if !begin_settings_window_creation(
            show_when_ready,
            show_when_ready.then(|| target.clone()).flatten(),
        ) {
            return;
        }

        let (width, height) = settings_window_inner_size();
        let (min_width, min_height) = settings_window_min_inner_size();
        let startup_preferences = settings_window_startup_preferences(&identifier);

        let builder = WebviewWindowBuilder::new(
            &app,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App(settings_window_url(target.as_deref(), &startup_preferences).into()),
        )
        .title(settings_window_title(startup_preferences.language))
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .visible(settings_window_visible())
        .decorations(settings_window_decorations())
        .transparent(settings_window_transparent())
        .resizable(settings_window_resizable())
        .shadow(settings_window_shadow())
        .center();

        #[cfg(not(target_os = "macos"))]
        let builder = match crate::menu::create_settings_window_menu(&app) {
            Ok(menu) => builder.menu(menu),
            Err(error) => {
                eprintln!("failed to create settings window menu: {error}");
                builder
            }
        };

        let builder = if let Some(color) = settings_window_background_color_for_preferences(
            current_window_chrome_platform(),
            &startup_preferences,
        ) {
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
                if finish_settings_window_creation() {
                    spawn_settings_window_reveal_fallback(window.clone());
                } else {
                    schedule_settings_window_idle_destroy(window.clone());
                }
            }
            Err(error) => {
                cancel_settings_window_creation();
                eprintln!("failed to create settings window: {error}");
            }
        }
    });
}

pub(crate) fn spawn_settings_window<R>(app: tauri::AppHandle<R>, target: Option<String>)
where
    R: tauri::Runtime,
{
    spawn_settings_window_with_mode(app, target, SettingsWindowStartupMode::Open);
}

pub(crate) fn toggle_settings_window<R>(app: tauri::AppHandle<R>, target: Option<String>)
where
    R: tauri::Runtime,
{
    let target = normalized_settings_window_target(target.as_deref()).map(str::to_string);

    std::thread::spawn(move || {
        if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
            handle_existing_settings_window(
                &window,
                target.as_deref(),
                existing_settings_window_action(
                    window.is_focused().unwrap_or(false),
                    window.is_visible().unwrap_or(false),
                ),
            );
            return;
        }

        spawn_settings_window(app, target);
    });
}

#[tauri::command]
pub(crate) fn open_settings_window(app: tauri::AppHandle, target: Option<String>) {
    spawn_settings_window(app, target);
}

#[tauri::command]
pub(crate) fn prewarm_settings_window(app: tauri::AppHandle) {
    spawn_settings_window_with_mode(app, None, SettingsWindowStartupMode::Prewarm);
}

#[tauri::command]
pub(crate) fn mark_settings_window_ready(window: tauri::WebviewWindow) {
    if !is_settings_window_label(window.label()) {
        return;
    }

    let Some(target) = mark_settings_window_runtime_ready() else {
        return;
    };

    show_settings_window(&window);
    if let Some(target) = target {
        emit_settings_window_target(&window, &target);
    }
}

#[tauri::command]
pub(crate) fn hide_settings_window(window: tauri::WebviewWindow) {
    if is_settings_window_label(window.label()) {
        hide_settings_window_instance(&window);
    }
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
        #[cfg(target_os = "windows")]
        {
            assert!(!editor_window_decorations());
            assert!(!settings_window_decorations());
        }

        #[cfg(not(target_os = "windows"))]
        {
            assert!(editor_window_decorations());
            assert!(settings_window_decorations());
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_settings_windows_are_self_drawn() {
        assert!(!editor_window_decorations());
        assert!(!settings_window_decorations());
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
    fn base_main_window_config_is_linux_safe() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("base Tauri config should be valid JSON");
        let window = config
            .pointer("/app/windows/0")
            .expect("base config should declare a main window");
        let decorations = window
            .pointer("/decorations")
            .and_then(serde_json::Value::as_bool);
        let transparent = window
            .pointer("/transparent")
            .and_then(serde_json::Value::as_bool);
        let visible = window
            .pointer("/visible")
            .and_then(serde_json::Value::as_bool);

        assert_eq!(decorations, Some(true));
        assert_eq!(transparent, Some(false));
        assert_eq!(visible, Some(true));
        assert!(window.pointer("/titleBarStyle").is_none());
        assert!(window.pointer("/hiddenTitle").is_none());
    }

    #[test]
    fn editor_windows_keep_current_default_size_with_small_resize_floor() {
        let config_paths = [
            "tauri.conf.json",
            "tauri.macos.conf.json",
            "tauri.windows.conf.json",
            "tauri.linux.conf.json",
        ];

        for config_path in config_paths {
            let config_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(config_path);
            let config: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&config_path).expect("Tauri config should exist"),
            )
            .expect("Tauri config should be valid JSON");
            let window = config
                .pointer("/app/windows/0")
                .expect("Tauri config should declare a main window");

            assert_eq!(
                window.pointer("/width").and_then(serde_json::Value::as_i64),
                Some(1360)
            );
            assert_eq!(
                window
                    .pointer("/height")
                    .and_then(serde_json::Value::as_i64),
                Some(800)
            );
            assert_eq!(
                window
                    .pointer("/minWidth")
                    .and_then(serde_json::Value::as_i64),
                Some(360)
            );
            assert_eq!(
                window
                    .pointer("/minHeight")
                    .and_then(serde_json::Value::as_i64),
                Some(320)
            );
        }
    }

    #[test]
    fn secondary_editor_windows_keep_current_default_size_with_small_resize_floor() {
        let windows_source = include_str!("windows.rs");
        let start = windows_source
            .find("fn spawn_editor_window_with_label")
            .expect("spawn_editor_window_with_label should exist");
        let end = windows_source
            .find("fn editor_window_transparent")
            .expect("spawn_editor_window_with_label should end before editor_window_transparent");
        let spawn_editor_window_source = &windows_source[start..end];

        assert!(spawn_editor_window_source.contains(".inner_size(1360.0, 800.0)"));
        assert!(spawn_editor_window_source.contains(".min_inner_size(360.0, 320.0)"));
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
            "core:window:allow-is-visible",
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
        let visible = config
            .pointer("/app/windows/0/visible")
            .and_then(serde_json::Value::as_bool);

        assert_eq!(transparent, Some(false));
        assert_eq!(visible, Some(true));
    }

    #[test]
    fn settings_window_uses_roomier_default_size() {
        assert_eq!(settings_window_inner_size(), (1040.0, 720.0));
        assert_eq!(settings_window_min_inner_size(), (860.0, 600.0));
        assert!(settings_window_resizable());
    }

    #[test]
    fn settings_window_starts_hidden_until_frontend_reveal() {
        assert!(!settings_window_visible());
    }

    #[test]
    fn settings_window_registers_native_reveal_fallback() {
        let windows_source = include_str!("windows.rs");

        assert_eq!(SETTINGS_WINDOW_NATIVE_REVEAL_FALLBACK_MS, 1_800);
        assert!(windows_source.contains("spawn_settings_window_reveal_fallback(window.clone())"));
        assert!(windows_source.contains("show_settings_window_if_hidden(&window)"));
    }

    #[test]
    fn settings_window_native_menu_command_toggles_only_when_focused() {
        assert_eq!(
            existing_settings_window_action(true, true),
            ExistingSettingsWindowAction::Hide
        );
        assert_eq!(
            existing_settings_window_action(false, true),
            ExistingSettingsWindowAction::Show
        );
        assert_eq!(
            existing_settings_window_action(true, false),
            ExistingSettingsWindowAction::Show
        );
    }

    #[test]
    fn settings_window_lifecycle_closes_only_hidden_cache_without_user_windows() {
        assert!(should_close_hidden_settings_window(false, false));
        assert!(!should_close_hidden_settings_window(true, false));
        assert!(!should_close_hidden_settings_window(false, true));
    }

    #[test]
    fn localizes_settings_window_native_title_from_startup_language() {
        assert_eq!(settings_window_title(AppLanguage::En), "Settings");
        assert_eq!(settings_window_title(AppLanguage::ZhCn), "设置");
    }

    #[test]
    fn windows_editor_windows_hide_native_menu() {
        assert!(should_hide_native_menu_for_window_label_on_platform(
            "windows",
            SETTINGS_WINDOW_LABEL
        ));
        assert!(should_hide_native_menu_for_window_label_on_platform(
            "macos",
            SETTINGS_WINDOW_LABEL
        ));
        assert!(should_hide_native_menu_for_window_label_on_platform(
            "windows",
            MAIN_WINDOW_LABEL
        ));
        assert!(should_hide_native_menu_for_window_label_on_platform(
            "windows",
            "markra-editor-1"
        ));
        assert!(!should_hide_native_menu_for_window_label_on_platform(
            "macos",
            MAIN_WINDOW_LABEL
        ));
    }

    #[test]
    fn windows_editor_windows_are_self_drawn() {
        assert!(!editor_window_decorations_for_platform("windows"));
        assert!(editor_window_decorations_for_platform("macos"));
        assert!(editor_window_decorations_for_platform("linux"));
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
        let startup_preferences = SettingsWindowStartupPreferences::default();

        assert_eq!(
            settings_window_background_color_for_preferences("macos", &startup_preferences),
            Some(Color(255, 255, 255, 0))
        );
        assert_eq!(
            settings_window_background_color_for_preferences("windows", &startup_preferences),
            Some(Color(30, 30, 30, 255))
        );

        let light_startup_preferences = SettingsWindowStartupPreferences {
            language: AppLanguage::En,
            appearance_mode: "light".to_string(),
            light_theme: "light".to_string(),
            dark_theme: "dark".to_string(),
        };

        assert_eq!(
            settings_window_background_color_for_preferences("windows", &light_startup_preferences),
            Some(Color(255, 255, 255, 255))
        );
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
    fn editor_window_labels_exclude_settings_window() {
        assert!(is_editor_window_label("main"));
        assert!(is_editor_window_label("markra-editor-1"));
        assert!(!is_editor_window_label("markra-settings"));
    }

    #[test]
    fn secondary_editor_windows_become_native_menu_targets_when_created() {
        let source = include_str!("windows.rs");
        let start = source
            .find("fn spawn_editor_window_with_label")
            .expect("spawn_editor_window_with_label should exist");
        let end = source[start..]
            .find("fn editor_window_transparent")
            .map(|offset| start + offset)
            .expect("spawn_editor_window_with_label should end before editor_window_transparent");
        let spawn_editor_window_source = &source[start..end];

        assert!(
            spawn_editor_window_source.contains("remember_native_menu_webview_window(&window);"),
            "secondary editor windows should become native menu targets as soon as they are created"
        );
    }

    #[test]
    fn exposes_window_command_names_for_js_menus() {
        assert_eq!(MINIMIZE_CURRENT_WINDOW_COMMAND, "minimize_current_window");
        assert_eq!(OPEN_BLANK_EDITOR_WINDOW_COMMAND, "open_blank_editor_window");
        assert_eq!(OPEN_SETTINGS_WINDOW_COMMAND, "open_settings_window");
    }

    #[test]
    fn targets_export_pandoc_settings_from_window_url() {
        let startup_preferences = SettingsWindowStartupPreferences {
            language: AppLanguage::ZhCn,
            appearance_mode: "dark".to_string(),
            light_theme: "sepia".to_string(),
            dark_theme: "night".to_string(),
        };

        assert_eq!(
            settings_window_url(Some("exportPandocPath"), &startup_preferences),
            "index.html?settings=1&startupLanguage=zh-CN&startupAppearanceMode=dark&startupLightTheme=sepia&startupDarkTheme=night&settingsTarget=exportPandocPath"
        );
    }

    #[test]
    fn settings_window_url_uses_default_startup_preferences() {
        assert_eq!(
            settings_window_url(None, &SettingsWindowStartupPreferences::default()),
            "index.html?settings=1&startupLanguage=en&startupAppearanceMode=system&startupLightTheme=light&startupDarkTheme=dark"
        );
    }

    #[test]
    fn legacy_theme_preferences_preserve_old_theme_settings() {
        assert_eq!(
            legacy_theme_preferences(AppLanguage::En, Some("night")),
            SettingsWindowStartupPreferences {
                language: AppLanguage::En,
                appearance_mode: "dark".to_string(),
                light_theme: "light".to_string(),
                dark_theme: "night".to_string(),
            }
        );
        assert_eq!(
            legacy_theme_preferences(AppLanguage::En, Some("sepia")),
            SettingsWindowStartupPreferences {
                language: AppLanguage::En,
                appearance_mode: "light".to_string(),
                light_theme: "sepia".to_string(),
                dark_theme: "dark".to_string(),
            }
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
