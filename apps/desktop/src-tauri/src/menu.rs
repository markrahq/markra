use crate::language::{resolve_startup_language, AppLanguage};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder},
    Emitter, Manager,
};

pub(crate) const NATIVE_MENU_COMMAND_EVENT: &str = "markra://menu-command";

const NEW_DOCUMENT_COMMAND: &str = "newDocument";
const OPEN_RECENT_FILE_COMMAND: &str = "openRecentFile";
const OPEN_RECENT_FILE_COMMAND_PREFIX: &str = "openRecentFile:";
const CLEAR_RECENT_FILES_COMMAND: &str = "clearRecentFiles";
const SETTINGS_WINDOW_COMMAND: &str = "openSettings";
const CHECK_FOR_UPDATES_COMMAND: &str = "checkForUpdates";
const EDIT_UNDO_COMMAND: &str = "editUndo";
const EDIT_REDO_COMMAND: &str = "editRedo";
const MARKRA_GITHUB_URL: &str = "https://github.com/murongg/markra";

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRecentFile {
    pub(crate) name: String,
    pub(crate) path: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeMenuCommand {
    pub(crate) command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recent_file: Option<NativeRecentFile>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeApplicationMenuProfile {
    Editor,
    Settings,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeMenuPlatform {
    Macos,
    Windows,
    Linux,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NativeFullscreenMenuKind {
    System,
    FrontendCommand,
}

#[derive(Clone, Default)]
struct NativeApplicationMenuConfig {
    accelerators: Option<HashMap<String, String>>,
    language: Option<AppLanguage>,
    recent_files: Vec<NativeRecentFile>,
}

#[derive(Default)]
pub(crate) struct NativeApplicationMenuState(Mutex<NativeApplicationMenuConfig>);

impl NativeApplicationMenuState {
    fn remember(
        &self,
        language: AppLanguage,
        accelerators: Option<HashMap<String, String>>,
        recent_files: Vec<NativeRecentFile>,
    ) {
        let mut config = self
            .0
            .lock()
            .expect("native application menu config lock poisoned");
        *config = NativeApplicationMenuConfig {
            accelerators,
            language: Some(language),
            recent_files,
        };
    }

    fn config(
        &self,
        identifier: &str,
    ) -> (
        AppLanguage,
        Option<HashMap<String, String>>,
        Vec<NativeRecentFile>,
    ) {
        let config = self
            .0
            .lock()
            .expect("native application menu config lock poisoned")
            .clone();

        (
            config
                .language
                .unwrap_or_else(|| resolve_startup_language(identifier)),
            config.accelerators,
            config.recent_files,
        )
    }
}

fn native_application_menu_profile_for_window_label(label: &str) -> NativeApplicationMenuProfile {
    if crate::windows::is_settings_window_label(label) {
        return NativeApplicationMenuProfile::Settings;
    }

    NativeApplicationMenuProfile::Editor
}

fn current_native_menu_platform() -> NativeMenuPlatform {
    if cfg!(target_os = "macos") {
        NativeMenuPlatform::Macos
    } else if cfg!(target_os = "windows") {
        NativeMenuPlatform::Windows
    } else if cfg!(target_os = "linux") {
        NativeMenuPlatform::Linux
    } else {
        NativeMenuPlatform::Other
    }
}

fn fullscreen_menu_kind_for_platform(platform: NativeMenuPlatform) -> NativeFullscreenMenuKind {
    match platform {
        NativeMenuPlatform::Macos => NativeFullscreenMenuKind::System,
        NativeMenuPlatform::Windows | NativeMenuPlatform::Linux | NativeMenuPlatform::Other => {
            NativeFullscreenMenuKind::FrontendCommand
        }
    }
}

#[cfg(test)]
fn native_application_menu_profile_submenu_ids(
    profile: NativeApplicationMenuProfile,
) -> Vec<String> {
    let ids: &[&str] = match profile {
        NativeApplicationMenuProfile::Editor => &[
            "markra:app",
            "markra:file",
            "markra:edit",
            "markra:format",
            "markra:view",
        ],
        NativeApplicationMenuProfile::Settings => &["markra:app", "markra:edit"],
    };

    ids.iter().copied().map(String::from).collect()
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

pub(crate) fn emit_native_menu_command_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: NativeMenuCommand,
) {
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

fn create_markra_app_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    labels: crate::menu_labels::MenuLabels,
) -> tauri::Result<Submenu<R>> {
    let settings = app_menu_item(app, SETTINGS_WINDOW_COMMAND, labels.settings, "CmdOrCtrl+,")?;
    let check_updates =
        app_menu_item_without_accelerator(app, CHECK_FOR_UPDATES_COMMAND, labels.check_updates)?;

    SubmenuBuilder::with_id(app, "markra:app", "Markra")
        .about(Some(application_about_metadata()))
        .separator()
        .items(&[&settings, &check_updates])
        .separator()
        .hide_with_text(labels.hide)
        .hide_others_with_text(labels.hide_others)
        .show_all_with_text(labels.show_all)
        .separator()
        .quit_with_text(labels.quit)
        .build()
}

fn create_edit_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    labels: crate::menu_labels::MenuLabels,
) -> tauri::Result<Submenu<R>> {
    let undo = app_menu_item(app, EDIT_UNDO_COMMAND, labels.undo, "CmdOrCtrl+Z")?;
    let redo = app_menu_item(app, EDIT_REDO_COMMAND, labels.redo, "CmdOrCtrl+Shift+Z")?;

    SubmenuBuilder::with_id(app, "markra:edit", labels.edit)
        .items(&[&undo, &redo])
        .separator()
        .cut_with_text(labels.cut)
        .copy_with_text(labels.copy)
        .paste_with_text(labels.paste)
        .select_all_with_text(labels.select_all)
        .build()
}

fn create_open_recent_file_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    labels: crate::menu_labels::MenuLabels,
    recent_files: &[NativeRecentFile],
) -> tauri::Result<Submenu<R>> {
    let mut builder =
        SubmenuBuilder::with_id(app, "markra:file:open-recent", labels.open_recent_file);

    if recent_files.is_empty() {
        let empty =
            MenuItemBuilder::with_id("markra:file:open-recent:empty", labels.no_recent_files)
                .enabled(false)
                .build(app)?;

        return builder.item(&empty).build();
    }

    let mut items = Vec::new();
    for (index, file) in recent_files.iter().enumerate() {
        let label = if file.name.trim().is_empty() {
            file.path.as_str()
        } else {
            file.name.as_str()
        };
        items.push(app_menu_item_without_accelerator(
            app,
            &format!("{OPEN_RECENT_FILE_COMMAND_PREFIX}{index}"),
            label,
        )?);
    }

    for item in &items {
        builder = builder.item(item);
    }

    let clear = app_menu_item_without_accelerator(
        app,
        CLEAR_RECENT_FILES_COMMAND,
        labels.clear_recent_files,
    )?;

    builder.separator().item(&clear).build()
}

pub(crate) fn create_application_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    let language = resolve_startup_language(&app.config().identifier);
    create_application_menu_for_language(app, language, None, &[])
}

fn create_settings_menu_for_language<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    language: AppLanguage,
) -> tauri::Result<Menu<R>> {
    let labels = crate::menu_labels::for_language(language);
    let app_menu = create_markra_app_submenu(app, labels)?;
    let edit_menu = create_edit_submenu(app, labels)?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &edit_menu])
        .build()
}

fn create_application_menu_for_profile<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    profile: NativeApplicationMenuProfile,
    language: AppLanguage,
    accelerators: Option<&HashMap<String, String>>,
    recent_files: &[NativeRecentFile],
) -> tauri::Result<Menu<R>> {
    match profile {
        NativeApplicationMenuProfile::Editor => {
            create_application_menu_for_language(app, language, accelerators, recent_files)
        }
        NativeApplicationMenuProfile::Settings => create_settings_menu_for_language(app, language),
    }
}

fn current_native_application_menu_profile<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> NativeApplicationMenuProfile {
    app.state::<NativeMenuTargetState>()
        .label()
        .as_deref()
        .map(native_application_menu_profile_for_window_label)
        .unwrap_or(NativeApplicationMenuProfile::Editor)
}

pub(crate) fn native_menu_command_from_id<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    command: &str,
) -> Option<NativeMenuCommand> {
    if let Some(index) = recent_file_index_from_command(command) {
        let (_, _, recent_files) = app
            .state::<NativeApplicationMenuState>()
            .config(&app.config().identifier);
        return recent_files
            .get(index)
            .cloned()
            .map(|recent_file| NativeMenuCommand {
                command: OPEN_RECENT_FILE_COMMAND.to_string(),
                recent_file: Some(recent_file),
            });
    }

    if is_frontend_menu_command(command) {
        return Some(NativeMenuCommand {
            command: command.to_string(),
            recent_file: None,
        });
    }

    None
}

pub(crate) fn apply_native_application_menu_for_window_event<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    event: &tauri::WindowEvent,
) {
    if !matches!(event, tauri::WindowEvent::Focused(true)) {
        return;
    }

    apply_native_application_menu_for_window_label(&window.app_handle(), window.label());
}

fn apply_native_application_menu_for_window_label<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) {
    #[cfg(target_os = "macos")]
    {
        let profile = native_application_menu_profile_for_window_label(label);
        let (language, accelerators, recent_files) = app
            .state::<NativeApplicationMenuState>()
            .config(&app.config().identifier);
        match create_application_menu_for_profile(
            app,
            profile,
            language,
            accelerators.as_ref(),
            &recent_files,
        ) {
            Ok(menu) => {
                let _ = app.set_menu(menu);
            }
            Err(error) => {
                eprintln!("failed to apply native application menu: {error}");
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, label);
    }
}

fn create_application_menu_for_language<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    language: AppLanguage,
    accelerators: Option<&HashMap<String, String>>,
    recent_files: &[NativeRecentFile],
) -> tauri::Result<Menu<R>> {
    let labels = crate::menu_labels::for_language(language);

    let new = app_menu_item(
        app,
        NEW_DOCUMENT_COMMAND,
        labels.new_document,
        "CmdOrCtrl+N",
    )?;
    let open = app_menu_item(app, "openDocument", labels.open_document, "CmdOrCtrl+O")?;
    let open_recent_files = create_open_recent_file_submenu(app, labels, recent_files)?;
    let open_folder = app_menu_item(app, "openFolder", labels.open_folder, "CmdOrCtrl+Shift+O")?;
    let quick_open = app_menu_item(
        app,
        "openQuickOpen",
        labels.quick_open,
        &menu_accelerator(accelerators, "openQuickOpen", "CmdOrCtrl+P"),
    )?;
    let close = app_menu_item(app, "closeDocument", labels.close_document, "CmdOrCtrl+W")?;
    let save = app_menu_item(app, "saveDocument", labels.save_document, "CmdOrCtrl+S")?;
    let save_as = app_menu_item(
        app,
        "saveDocumentAs",
        labels.save_document_as,
        "CmdOrCtrl+Shift+S",
    )?;
    let export_pdf = app_menu_item(app, "exportPdf", labels.export_pdf, "CmdOrCtrl+Alt+P")?;
    let export_html = app_menu_item(app, "exportHtml", labels.export_html, "CmdOrCtrl+Shift+E")?;
    let export_docx = app_menu_item_without_accelerator(app, "exportDocx", labels.export_docx)?;
    let export_epub = app_menu_item_without_accelerator(app, "exportEpub", labels.export_epub)?;
    let export_latex = app_menu_item_without_accelerator(app, "exportLatex", labels.export_latex)?;
    let export_menu = SubmenuBuilder::with_id(app, "markra:file:export", labels.export)
        .items(&[
            &export_pdf,
            &export_html,
            &export_docx,
            &export_epub,
            &export_latex,
        ])
        .build()?;

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
        &menu_accelerator(accelerators, "insertTable", "CmdOrCtrl+Shift+Alt+T"),
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
    let toggle_all_folds = app_menu_item(
        app,
        "toggleAllFolds",
        labels.toggle_all_folds,
        &menu_accelerator(accelerators, "toggleAllFolds", "CmdOrCtrl+Alt+T"),
    )?;
    let toggle_read_only_mode = app_menu_item(
        app,
        "toggleReadOnlyMode",
        labels.toggle_read_only_mode,
        &menu_accelerator(accelerators, "toggleReadOnlyMode", "CmdOrCtrl+Alt+L"),
    )?;
    let toggle_source_mode = app_menu_item(
        app,
        "toggleSourceMode",
        labels.toggle_source_mode,
        &menu_accelerator(accelerators, "toggleSourceMode", "CmdOrCtrl+Alt+S"),
    )?;
    let toggle_fullscreen =
        app_menu_item_without_accelerator(app, "toggleFullscreen", labels.fullscreen)?;

    let app_menu = create_markra_app_submenu(app, labels)?;

    let file_menu = SubmenuBuilder::with_id(app, "markra:file", labels.file)
        .items(&[
            &new,
            &open,
            &open_recent_files,
            &open_folder,
            &quick_open,
            &close,
        ])
        .separator()
        .items(&[&save, &save_as])
        .separator()
        .items(&[&export_menu])
        .build()?;

    let edit_menu = create_edit_submenu(app, labels)?;

    let format_menu = SubmenuBuilder::with_id(app, "markra:format", labels.format)
        .items(&[&bold, &italic, &strikethrough, &inline_code])
        .separator()
        .items(&[&paragraph, &heading_1, &heading_2, &heading_3])
        .separator()
        .items(&[&bullet_list, &ordered_list, &quote, &code_block])
        .separator()
        .items(&[&link, &image, &table])
        .build()?;

    let view_menu_builder = SubmenuBuilder::with_id(app, "markra:view", labels.view);
    let view_menu_builder = match fullscreen_menu_kind_for_platform(current_native_menu_platform())
    {
        NativeFullscreenMenuKind::System => {
            view_menu_builder.fullscreen_with_text(labels.fullscreen)
        }
        NativeFullscreenMenuKind::FrontendCommand => view_menu_builder.item(&toggle_fullscreen),
    };
    let view_menu = view_menu_builder
        .separator()
        .items(&[
            &toggle_file_list,
            &toggle_markra_ai,
            &ai_writing_command,
            &toggle_all_folds,
            &toggle_read_only_mode,
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

fn recent_file_index_from_command(command: &str) -> Option<usize> {
    command
        .strip_prefix(OPEN_RECENT_FILE_COMMAND_PREFIX)?
        .parse::<usize>()
        .ok()
}

fn normalize_recent_files(files: Vec<NativeRecentFile>) -> Vec<NativeRecentFile> {
    let mut seen_paths = std::collections::HashSet::new();
    let mut normalized = Vec::new();

    for file in files {
        if normalized.len() >= 10 {
            break;
        }

        let path = file.path.trim();
        if path.is_empty() || !seen_paths.insert(path.to_string()) {
            continue;
        }

        let name = file.name.trim();
        normalized.push(NativeRecentFile {
            name: if name.is_empty() {
                path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
            } else {
                name.to_string()
            },
            path: path.to_string(),
        });
    }

    normalized
}

#[tauri::command]
pub(crate) fn install_application_menu(
    app: tauri::AppHandle,
    language: String,
    accelerators: Option<HashMap<String, String>>,
    recent_files: Option<Vec<NativeRecentFile>>,
) -> Result<(), String> {
    let language = AppLanguage::from_code(&language)
        .ok_or_else(|| format!("Unsupported application menu language: {language}"))?;
    let recent_files = normalize_recent_files(recent_files.unwrap_or_default());
    app.state::<NativeApplicationMenuState>().remember(
        language,
        accelerators.clone(),
        recent_files.clone(),
    );

    #[cfg(target_os = "macos")]
    let profile = current_native_application_menu_profile(&app);
    #[cfg(not(target_os = "macos"))]
    let profile = NativeApplicationMenuProfile::Editor;

    let menu = create_application_menu_for_profile(
        &app,
        profile,
        language,
        accelerators.as_ref(),
        &recent_files,
    )
    .map_err(|error| error.to_string())?;

    app.set_menu(menu)
        .map(|_| {
            crate::windows::hide_native_menu_for_settings_window_in_app(&app);
        })
        .map_err(|error| error.to_string())
}

pub(crate) fn is_native_new_window_command(command: &str) -> bool {
    command == NEW_DOCUMENT_COMMAND
}

pub(crate) fn is_native_settings_window_command(command: &str) -> bool {
    command == SETTINGS_WINDOW_COMMAND
}

pub(crate) fn is_frontend_menu_command(command: &str) -> bool {
    if recent_file_index_from_command(command).is_some() {
        return true;
    }

    matches!(
        command,
        CHECK_FOR_UPDATES_COMMAND
            | CLEAR_RECENT_FILES_COMMAND
            | EDIT_UNDO_COMMAND
            | EDIT_REDO_COMMAND
            | "openDocument"
            | "openFolder"
            | "openQuickOpen"
            | "closeDocument"
            | "saveDocument"
            | "saveDocumentAs"
            | "exportPdf"
            | "exportHtml"
            | "exportDocx"
            | "exportEpub"
            | "exportLatex"
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
            | "toggleFullscreen"
            | "toggleMarkdownFiles"
            | "toggleAiAgent"
            | "toggleAiCommand"
            | "toggleAllFolds"
            | "toggleReadOnlyMode"
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
        assert!(is_frontend_menu_command("openRecentFile:0"));
        assert!(is_frontend_menu_command("clearRecentFiles"));
        assert!(is_frontend_menu_command("editUndo"));
        assert!(is_frontend_menu_command("editRedo"));
        assert!(is_frontend_menu_command("openFolder"));
        assert!(is_frontend_menu_command("openQuickOpen"));
        assert!(is_frontend_menu_command("closeDocument"));
        assert!(is_frontend_menu_command("saveDocument"));
        assert!(is_frontend_menu_command("exportPdf"));
        assert!(is_frontend_menu_command("exportHtml"));
        assert!(is_frontend_menu_command("exportDocx"));
        assert!(is_frontend_menu_command("exportEpub"));
        assert!(is_frontend_menu_command("exportLatex"));
        assert!(is_frontend_menu_command("formatBold"));
        assert!(is_frontend_menu_command("insertImage"));
        assert!(is_frontend_menu_command("insertTable"));
        assert!(is_frontend_menu_command("toggleFullscreen"));
        assert!(is_frontend_menu_command("toggleMarkdownFiles"));
        assert!(is_frontend_menu_command("toggleAiAgent"));
        assert!(is_frontend_menu_command("toggleAiCommand"));
        assert!(is_frontend_menu_command("toggleAllFolds"));
        assert!(is_frontend_menu_command("toggleReadOnlyMode"));
        assert!(is_frontend_menu_command("toggleSourceMode"));
        assert!(!is_frontend_menu_command("markra:file"));
        assert!(!is_frontend_menu_command("copy"));
    }

    #[test]
    fn fullscreen_menu_uses_system_role_on_macos() {
        assert_eq!(
            fullscreen_menu_kind_for_platform(NativeMenuPlatform::Macos),
            NativeFullscreenMenuKind::System
        );
    }

    #[test]
    fn fullscreen_menu_uses_frontend_command_outside_macos() {
        for platform in [NativeMenuPlatform::Windows, NativeMenuPlatform::Linux] {
            assert_eq!(
                fullscreen_menu_kind_for_platform(platform),
                NativeFullscreenMenuKind::FrontendCommand
            );
        }
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

    #[test]
    fn focused_settings_window_uses_settings_menu_profile() {
        assert_eq!(
            native_application_menu_profile_for_window_label("markra-settings"),
            NativeApplicationMenuProfile::Settings
        );
        assert_eq!(
            native_application_menu_profile_for_window_label("main"),
            NativeApplicationMenuProfile::Editor
        );
        assert_eq!(
            native_application_menu_profile_for_window_label("markra-editor-1"),
            NativeApplicationMenuProfile::Editor
        );
    }

    #[test]
    fn settings_application_menu_omits_editor_only_submenus() {
        let submenu_ids =
            native_application_menu_profile_submenu_ids(NativeApplicationMenuProfile::Settings);

        assert_eq!(submenu_ids, vec!["markra:app", "markra:edit"]);
        assert!(!submenu_ids.contains(&"markra:file".to_string()));
        assert!(!submenu_ids.contains(&"markra:format".to_string()));
        assert!(!submenu_ids.contains(&"markra:view".to_string()));
    }
}
