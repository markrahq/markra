use crate::language::{resolve_startup_language, AppLanguage};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

pub(crate) const NATIVE_MENU_COMMAND_EVENT: &str = "markra://menu-command";

const NEW_DOCUMENT_COMMAND: &str = "newDocument";
const SETTINGS_WINDOW_COMMAND: &str = "openSettings";
const CHECK_FOR_UPDATES_COMMAND: &str = "checkForUpdates";
const MARKRA_GITHUB_URL: &str = "https://github.com/murongg/markra";

#[derive(Clone, serde::Serialize)]
pub(crate) struct NativeMenuCommand {
    pub(crate) command: String,
}

#[derive(Default)]
pub(crate) struct NativeMenuTargetState(Mutex<Option<String>>);

impl NativeMenuTargetState {
    fn remember(&self, label: impl Into<String>) {
        let mut target = self.0.lock().expect("native menu target lock poisoned");
        *target = Some(label.into());
    }

    fn label(&self) -> Option<String> {
        self.0
            .lock()
            .expect("native menu target lock poisoned")
            .clone()
    }
}

pub(crate) fn remember_native_menu_window_label<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    label: impl Into<String>,
) {
    let state = manager.state::<NativeMenuTargetState>();
    state.remember(label);
}

pub(crate) fn remember_native_menu_window<R: tauri::Runtime>(window: &tauri::Window<R>) {
    remember_native_menu_window_label(window, window.label());
}

pub(crate) fn remember_native_menu_webview_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) {
    let state = window.state::<NativeMenuTargetState>();
    state.remember(window.label());
}

pub(crate) fn remember_native_menu_window_from_event<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) {
    if matches!(event, tauri::WindowEvent::Focused(true)) {
        remember_native_menu_window(window);
    }
}

pub(crate) fn emit_native_menu_command<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    command: String,
) {
    let payload = NativeMenuCommand { command };
    let target_label = app.state::<NativeMenuTargetState>().label();

    if let Some(window) = target_label.and_then(|label| app.get_webview_window(&label)) {
        let _ = window.emit(NATIVE_MENU_COMMAND_EVENT, payload);
        return;
    }

    let _ = app.emit(NATIVE_MENU_COMMAND_EVENT, payload);
}

fn app_menu_item<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    id: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    MenuItemBuilder::with_id(id, text)
        .accelerator(accelerator)
        .build(manager)
}

fn app_menu_item_without_accelerator<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    id: &str,
    text: &str,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    MenuItemBuilder::with_id(id, text).build(manager)
}

fn application_about_metadata() -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("Markra".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        website: Some(MARKRA_GITHUB_URL.into()),
        website_label: Some("GitHub".into()),
        credits: Some(format!("GitHub: {MARKRA_GITHUB_URL}")),
        ..Default::default()
    }
}

pub(crate) fn create_application_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    let language = resolve_startup_language(&app.config().identifier);
    create_application_menu_for_language(app, language, None)
}

fn create_application_menu_for_language<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    language: AppLanguage,
    accelerators: Option<&HashMap<String, String>>,
) -> tauri::Result<Menu<R>> {
    let labels = crate::menu_labels::for_language(language);

    let new = app_menu_item(
        app,
        NEW_DOCUMENT_COMMAND,
        labels.new_document,
        "CmdOrCtrl+N",
    )?;
    let open = app_menu_item(app, "openDocument", labels.open_document, "CmdOrCtrl+O")?;
    let open_folder = app_menu_item(app, "openFolder", labels.open_folder, "CmdOrCtrl+Shift+O")?;
    let close = app_menu_item(app, "closeDocument", labels.close_document, "CmdOrCtrl+W")?;
    let save = app_menu_item(app, "saveDocument", labels.save_document, "CmdOrCtrl+S")?;
    let save_as = app_menu_item(
        app,
        "saveDocumentAs",
        labels.save_document_as,
        "CmdOrCtrl+Shift+S",
    )?;
    let export_pdf = app_menu_item(app, "exportPdf", labels.export_pdf, "CmdOrCtrl+P")?;
    let export_html = app_menu_item(app, "exportHtml", labels.export_html, "CmdOrCtrl+Shift+E")?;
    let export_menu = SubmenuBuilder::with_id(app, "markra:file:export", labels.export)
        .items(&[&export_pdf, &export_html])
        .build()?;
    let settings = app_menu_item(app, SETTINGS_WINDOW_COMMAND, labels.settings, "CmdOrCtrl+,")?;
    let check_updates =
        app_menu_item_without_accelerator(app, CHECK_FOR_UPDATES_COMMAND, labels.check_updates)?;

    let bold = app_menu_item(
        app,
        "formatBold",
        labels.bold,
        &menu_accelerator(accelerators, "formatBold", "CmdOrCtrl+B"),
    )?;
    let italic = app_menu_item(
        app,
        "formatItalic",
        labels.italic,
        &menu_accelerator(accelerators, "formatItalic", "CmdOrCtrl+I"),
    )?;
    let strikethrough = app_menu_item(
        app,
        "formatStrikethrough",
        labels.strikethrough,
        &menu_accelerator(accelerators, "formatStrikethrough", "CmdOrCtrl+Shift+X"),
    )?;
    let inline_code = app_menu_item(
        app,
        "formatInlineCode",
        labels.inline_code,
        &menu_accelerator(accelerators, "formatInlineCode", "CmdOrCtrl+E"),
    )?;
    let paragraph = app_menu_item(
        app,
        "formatParagraph",
        labels.paragraph,
        &menu_accelerator(accelerators, "formatParagraph", "CmdOrCtrl+Alt+0"),
    )?;
    let heading_1 = app_menu_item(
        app,
        "formatHeading1",
        labels.heading_1,
        &menu_accelerator(accelerators, "formatHeading1", "CmdOrCtrl+Alt+1"),
    )?;
    let heading_2 = app_menu_item(
        app,
        "formatHeading2",
        labels.heading_2,
        &menu_accelerator(accelerators, "formatHeading2", "CmdOrCtrl+Alt+2"),
    )?;
    let heading_3 = app_menu_item(
        app,
        "formatHeading3",
        labels.heading_3,
        &menu_accelerator(accelerators, "formatHeading3", "CmdOrCtrl+Alt+3"),
    )?;
    let bullet_list = app_menu_item(
        app,
        "formatBulletList",
        labels.bullet_list,
        &menu_accelerator(accelerators, "formatBulletList", "CmdOrCtrl+Shift+8"),
    )?;
    let ordered_list = app_menu_item(
        app,
        "formatOrderedList",
        labels.ordered_list,
        &menu_accelerator(accelerators, "formatOrderedList", "CmdOrCtrl+Shift+7"),
    )?;
    let quote = app_menu_item(
        app,
        "formatQuote",
        labels.quote,
        &menu_accelerator(accelerators, "formatQuote", "CmdOrCtrl+Shift+B"),
    )?;
    let code_block = app_menu_item(
        app,
        "formatCodeBlock",
        labels.code_block,
        &menu_accelerator(accelerators, "formatCodeBlock", "CmdOrCtrl+Alt+C"),
    )?;
    let link = app_menu_item(
        app,
        "insertLink",
        labels.link,
        &menu_accelerator(accelerators, "insertLink", "CmdOrCtrl+K"),
    )?;
    let image = app_menu_item(
        app,
        "insertImage",
        labels.image,
        &menu_accelerator(accelerators, "insertImage", "CmdOrCtrl+Shift+I"),
    )?;
    let table = app_menu_item(
        app,
        "insertTable",
        labels.table,
        &menu_accelerator(accelerators, "insertTable", "CmdOrCtrl+Alt+T"),
    )?;
    let toggle_file_list = app_menu_item(
        app,
        "toggleMarkdownFiles",
        labels.toggle_file_list,
        &menu_accelerator(accelerators, "toggleMarkdownFiles", "CmdOrCtrl+Shift+M"),
    )?;
    let toggle_markra_ai = app_menu_item(
        app,
        "toggleAiAgent",
        labels.toggle_markra_ai,
        &menu_accelerator(accelerators, "toggleAiAgent", "CmdOrCtrl+Alt+J"),
    )?;
    let ai_writing_command = app_menu_item(
        app,
        "toggleAiCommand",
        labels.ai_writing_command,
        &menu_accelerator(accelerators, "toggleAiCommand", "CmdOrCtrl+Shift+J"),
    )?;
    let toggle_source_mode = app_menu_item(
        app,
        "toggleSourceMode",
        labels.toggle_source_mode,
        &menu_accelerator(accelerators, "toggleSourceMode", "CmdOrCtrl+Alt+S"),
    )?;

    let app_menu = SubmenuBuilder::with_id(app, "markra:app", "Markra")
        .about(Some(application_about_metadata()))
        .separator()
        .items(&[&settings, &check_updates])
        .separator()
        .hide_with_text(labels.hide)
        .hide_others_with_text(labels.hide_others)
        .show_all_with_text(labels.show_all)
        .separator()
        .quit_with_text(labels.quit)
        .build()?;

    let file_menu = SubmenuBuilder::with_id(app, "markra:file", labels.file)
        .items(&[&new, &open, &open_folder, &close])
        .separator()
        .items(&[&save, &save_as])
        .separator()
        .items(&[&export_menu])
        .build()?;

    let edit_menu = SubmenuBuilder::with_id(app, "markra:edit", labels.edit)
        .undo_with_text(labels.undo)
        .redo_with_text(labels.redo)
        .separator()
        .cut_with_text(labels.cut)
        .copy_with_text(labels.copy)
        .paste_with_text(labels.paste)
        .select_all_with_text(labels.select_all)
        .build()?;

    let format_menu = SubmenuBuilder::with_id(app, "markra:format", labels.format)
        .items(&[&bold, &italic, &strikethrough, &inline_code])
        .separator()
        .items(&[&paragraph, &heading_1, &heading_2, &heading_3])
        .separator()
        .items(&[&bullet_list, &ordered_list, &quote, &code_block])
        .separator()
        .items(&[&link, &image, &table])
        .build()?;

    let view_menu = SubmenuBuilder::with_id(app, "markra:view", labels.view)
        .fullscreen_with_text(labels.fullscreen)
        .separator()
        .items(&[
            &toggle_file_list,
            &toggle_markra_ai,
            &ai_writing_command,
            &toggle_source_mode,
        ])
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &format_menu, &view_menu])
        .build()
}

fn menu_accelerator(
    accelerators: Option<&HashMap<String, String>>,
    command: &str,
    fallback: &str,
) -> String {
    accelerators
        .and_then(|items| items.get(command))
        .filter(|accelerator| !accelerator.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| fallback.to_string())
}

#[tauri::command]
pub(crate) fn install_application_menu(
    app: tauri::AppHandle,
    language: String,
    accelerators: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let language = AppLanguage::from_code(&language)
        .ok_or_else(|| format!("Unsupported application menu language: {language}"))?;
    let menu = create_application_menu_for_language(&app, language, accelerators.as_ref())
        .map_err(|error| error.to_string())?;

    app.set_menu(menu)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub(crate) fn is_native_new_window_command(command: &str) -> bool {
    command == NEW_DOCUMENT_COMMAND
}

pub(crate) fn is_native_settings_window_command(command: &str) -> bool {
    command == SETTINGS_WINDOW_COMMAND
}

pub(crate) fn is_frontend_menu_command(command: &str) -> bool {
    matches!(
        command,
        CHECK_FOR_UPDATES_COMMAND
            | "openDocument"
            | "openFolder"
            | "closeDocument"
            | "saveDocument"
            | "saveDocumentAs"
            | "exportPdf"
            | "exportHtml"
            | "formatBold"
            | "formatItalic"
            | "formatStrikethrough"
            | "formatInlineCode"
            | "formatParagraph"
            | "formatHeading1"
            | "formatHeading2"
            | "formatHeading3"
            | "formatBulletList"
            | "formatOrderedList"
            | "formatQuote"
            | "formatCodeBlock"
            | "insertLink"
            | "insertImage"
            | "insertTable"
            | "toggleMarkdownFiles"
            | "toggleAiAgent"
            | "toggleAiCommand"
            | "toggleSourceMode"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language::AppLanguage;

    #[test]
    fn menu_labels_follow_the_selected_startup_language() {
        let english = crate::menu_labels::for_language(AppLanguage::En);
        let simplified_chinese = crate::menu_labels::for_language(AppLanguage::ZhCn);

        assert_ne!(simplified_chinese.file, english.file);
        assert_ne!(simplified_chinese.new_document, english.new_document);
    }

    #[test]
    fn recognizes_frontend_menu_commands() {
        assert!(!is_frontend_menu_command("newDocument"));
        assert!(is_frontend_menu_command("checkForUpdates"));
        assert!(is_frontend_menu_command("openDocument"));
        assert!(is_frontend_menu_command("openFolder"));
        assert!(is_frontend_menu_command("closeDocument"));
        assert!(is_frontend_menu_command("saveDocument"));
        assert!(is_frontend_menu_command("exportPdf"));
        assert!(is_frontend_menu_command("exportHtml"));
        assert!(is_frontend_menu_command("formatBold"));
        assert!(is_frontend_menu_command("insertImage"));
        assert!(is_frontend_menu_command("insertTable"));
        assert!(is_frontend_menu_command("toggleMarkdownFiles"));
        assert!(is_frontend_menu_command("toggleAiAgent"));
        assert!(is_frontend_menu_command("toggleAiCommand"));
        assert!(is_frontend_menu_command("toggleSourceMode"));
        assert!(!is_frontend_menu_command("markra:file"));
        assert!(!is_frontend_menu_command("copy"));
    }

    #[test]
    fn about_metadata_includes_version_and_github_link() {
        let metadata = application_about_metadata();

        assert_eq!(metadata.name.as_deref(), Some("Markra"));
        assert_eq!(metadata.version.as_deref(), Some(env!("CARGO_PKG_VERSION")));
        assert_eq!(
            metadata.website.as_deref(),
            Some("https://github.com/murongg/markra")
        );
        assert_eq!(metadata.website_label.as_deref(), Some("GitHub"));
        assert!(metadata
            .credits
            .as_deref()
            .is_some_and(|credits| credits.contains("https://github.com/murongg/markra")));
    }

    #[test]
    fn recognizes_native_new_window_menu_command() {
        assert!(is_native_new_window_command("newDocument"));
        assert!(!is_native_new_window_command("saveDocument"));
    }

    #[test]
    fn recognizes_native_settings_window_menu_command() {
        assert!(is_native_settings_window_command("openSettings"));
        assert!(!is_native_settings_window_command("saveDocument"));
        assert!(!is_frontend_menu_command("openSettings"));
    }

    #[test]
    fn native_menu_target_state_remembers_latest_window_label() {
        let state = NativeMenuTargetState::default();

        assert_eq!(state.label(), None);

        state.remember("main");
        state.remember("markra-editor-1");

        assert_eq!(state.label().as_deref(), Some("markra-editor-1"));
    }
}
