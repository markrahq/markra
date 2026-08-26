mod acp;
mod ai_chat_attachments;
mod ai_http;
mod app_exit;
mod app_logs;
mod backup;
mod clipboard;
mod external_urls;
mod fonts;
mod image_upload;
mod language;
mod markdown_files;
mod menu;
mod menu_labels;
mod network;
mod opened_files;
mod portable_update;
mod remote_sync;
mod s3;
mod s3_text_file;
mod shell_command;
mod spellcheck_dictionary;
mod text_file;
mod watcher;
mod web_http;
mod webdav_text_file;
mod window_state;
mod windows;

use std::{path::Path, time::Duration};

use acp::{start_acp_agent, stop_acp_agent, write_acp_agent_message, AcpAgentProcessState};
use ai_chat_attachments::{
    delete_ai_chat_attachment_session, read_ai_chat_attachment, save_ai_chat_attachment,
};
use ai_http::{request_ai_provider_json, request_native_chat, request_native_chat_stream};
use app_exit::{handle_app_exit_requested, request_app_exit};
use app_logs::open_log_folder;
use backup::backup_markdown_folder;
use clipboard::{read_clipboard_content, read_clipboard_text};
use external_urls::open_external_url;
use fonts::list_system_font_families;
use image_upload::{upload_picgo_image, upload_s3_image, upload_webdav_image};
use markdown_files::{
    cancel_markdown_files_load, check_pandoc_available, create_markdown_tree_file,
    create_markdown_tree_folder, delete_markdown_template_file, delete_markdown_tree_file,
    detect_pandoc_path, export_markdown_file, export_pandoc_file, export_pdf_file,
    import_local_file, list_markdown_file_history, list_markdown_files_for_path,
    list_markdown_reference_files_for_path, load_markdown_files_for_path, move_markdown_tree_file,
    open_containing_folder, open_markdown_attachment, open_markdown_file_in_new_window,
    open_markdown_folder_in_new_window, open_markdown_path, read_local_image_file,
    read_markdown_file, read_markdown_file_history, read_markdown_image_file,
    read_markdown_template_file, rename_markdown_tree_file, resolve_markdown_path,
    save_clipboard_attachment, save_clipboard_image, search_markdown_files_for_path,
    trash_markdown_assets, write_markdown_file, write_markdown_template_file,
    MarkdownTreeLoadState,
};
use menu::{
    apply_native_application_menu_for_window_event, create_application_menu,
    emit_native_menu_command_payload, install_application_menu, is_native_new_window_command,
    is_native_settings_window_command, native_menu_command_from_id,
    remember_native_menu_webview_window, remember_native_menu_window_from_event,
    show_native_app_about, NativeApplicationMenuState, NativeMenuTargetState,
};
use opened_files::{
    opened_markdown_paths_from_args, opened_markdown_paths_from_args_with_cwd,
    opened_markdown_paths_from_urls, queue_opened_markdown_paths, take_opened_markdown_paths,
    OpenedMarkdownPathsState,
};
use portable_update::{
    check_portable_app_update, cleanup_portable_update_helpers, download_portable_app_update,
    is_native_portable_app, restart_portable_app_update, PortableUpdateState,
};
use remote_sync::sync_webdav_markdown_folder;
use s3_text_file::{read_s3_text_file, write_s3_text_file};
use shell_command::{get_shell_command_status, install_shell_command, uninstall_shell_command};
use spellcheck_dictionary::{
    delete_spellcheck_dictionary, get_spellcheck_dictionary_status, load_spellcheck_dictionary,
};
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;
use text_file::{read_text_file, write_text_file};
use watcher::{
    unwatch_markdown_file, unwatch_markdown_tree, watch_markdown_file, watch_markdown_tree,
    MarkdownFileWatcherState, MarkdownTreeWatcherState,
};
use web_http::{download_web_image, request_web_resource};
use webdav_text_file::{read_webdav_text_file, write_webdav_text_file};
use window_state::{
    list_editor_window_restore_states, remove_editor_window_restore_state,
    set_editor_window_restore_state, EditorWindowRestoreState,
};
use windows::{
    apply_main_window_chrome, apply_settings_window_lifecycle, apply_webview_window_chrome,
    apply_window_event_chrome, editor_window_url_for_folder, editor_window_url_for_path,
    hide_settings_window, is_editor_window_label, mark_settings_window_ready,
    minimize_current_window, open_blank_editor_window, open_settings_window,
    prewarm_settings_window, spawn_blank_editor_window, spawn_editor_window,
    spawn_restorable_editor_window, toggle_settings_window,
};

const STARTUP_WINDOW_NATIVE_REVEAL_FALLBACK_MS: u64 = 2400;
const DESKTOP_LOG_MAX_FILE_SIZE_BYTES: u128 = 2 * 1024 * 1024;
const DESKTOP_LOG_MAX_FILE_COUNT: usize = 5;
// tauri-plugin-log's KeepSome count applies only to archived files; the active
// log file is additional, so keep one fewer archive to cap total files.
const DESKTOP_LOG_ARCHIVED_FILE_COUNT: usize = DESKTOP_LOG_MAX_FILE_COUNT - 1;

fn window_state_restore_flags() -> StateFlags {
    StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn editor_window_urls_for_opened_markdown_paths(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter_map(|path| {
            let opened_path = Path::new(path);
            if opened_path.is_dir() {
                return Some(editor_window_url_for_folder(path));
            }

            if opened_path.is_file() {
                return Some(editor_window_url_for_path(path));
            }

            None
        })
        .collect()
}

fn reveal_or_open_markdown_paths<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    paths: Vec<String>,
    reveal_when_empty: bool,
) {
    if paths.is_empty() && !reveal_when_empty {
        return;
    }

    if app.get_webview_window("main").is_some() {
        queue_opened_markdown_paths(app, paths);
        focus_main_window(app);
        return;
    }

    let urls = editor_window_urls_for_opened_markdown_paths(&paths);
    if urls.is_empty() {
        spawn_restorable_editor_window(app.clone());
        return;
    }

    for url in urls {
        spawn_editor_window(app.clone(), url);
    }
}

fn show_main_window_if_hidden<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            return;
        }

        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn has_visible_editor_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.webview_windows().values().any(|window| {
        is_editor_window_label(window.label()) && window.is_visible().unwrap_or(false)
    })
}

fn spawn_startup_window_reveal_fallback<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(
            STARTUP_WINDOW_NATIVE_REVEAL_FALLBACK_MS,
        ));
        show_main_window_if_hidden(&app);
    });
}

pub fn run_portable_update_helper_if_requested() -> bool {
    portable_update::run_portable_update_helper_if_requested()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(MarkdownFileWatcherState::default())
        .manage(MarkdownTreeWatcherState::default())
        .manage(MarkdownTreeLoadState::default())
        .manage(OpenedMarkdownPathsState::default())
        .manage(NativeApplicationMenuState::default())
        .manage(NativeMenuTargetState::default())
        .manage(EditorWindowRestoreState::default())
        .manage(AcpAgentProcessState::default())
        .manage(PortableUpdateState::default());

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        reveal_or_open_markdown_paths(
            app,
            opened_markdown_paths_from_args_with_cwd(args, std::path::PathBuf::from(cwd)),
            true,
        );
    }));

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(window_state_restore_flags())
            .build(),
    );

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Debug)
                .max_file_size(DESKTOP_LOG_MAX_FILE_SIZE_BYTES)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(
                    DESKTOP_LOG_ARCHIVED_FILE_COUNT,
                ))
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            cleanup_portable_update_helpers();
            apply_main_window_chrome(app);
            spawn_startup_window_reveal_fallback(&app.handle());
            if let Some(window) = app.get_webview_window("main") {
                remember_native_menu_webview_window(&window);
            }
            let paths = opened_markdown_paths_from_args(std::env::args());
            reveal_or_open_markdown_paths(&app.handle(), paths, false);
            Ok(())
        })
        .on_page_load(|webview, _| {
            apply_webview_window_chrome(webview);
        })
        .on_window_event(|window, event| {
            remember_native_menu_window_from_event(window, event);
            apply_native_application_menu_for_window_event(window, event);
            apply_window_event_chrome(window, event);
            apply_settings_window_lifecycle(&window.app_handle(), window, event);
            remove_editor_window_restore_state(window, event);
        })
        .menu(create_application_menu)
        .on_menu_event(|app, event| {
            let command = event.id().as_ref();
            if is_native_new_window_command(command) {
                spawn_blank_editor_window(app.clone());
                return;
            }

            if is_native_settings_window_command(command) {
                toggle_settings_window(app.clone(), None);
                return;
            }

            let Some(payload) = native_menu_command_from_id(app, command) else {
                return;
            };

            emit_native_menu_command_payload(app, payload);
        })
        .invoke_handler(tauri::generate_handler![
            list_markdown_files_for_path,
            list_markdown_reference_files_for_path,
            load_markdown_files_for_path,
            cancel_markdown_files_load,
            search_markdown_files_for_path,
            create_markdown_tree_file,
            create_markdown_tree_folder,
            install_application_menu,
            show_native_app_about,
            rename_markdown_tree_file,
            move_markdown_tree_file,
            delete_markdown_tree_file,
            trash_markdown_assets,
            open_markdown_file_in_new_window,
            open_markdown_folder_in_new_window,
            open_containing_folder,
            open_markdown_attachment,
            open_markdown_path,
            resolve_markdown_path,
            read_markdown_file,
            read_text_file,
            list_markdown_file_history,
            read_markdown_file_history,
            read_markdown_image_file,
            import_local_file,
            read_local_image_file,
            read_markdown_template_file,
            write_markdown_template_file,
            delete_markdown_template_file,
            save_clipboard_attachment,
            save_clipboard_image,
            read_clipboard_content,
            read_clipboard_text,
            minimize_current_window,
            open_blank_editor_window,
            open_settings_window,
            prewarm_settings_window,
            mark_settings_window_ready,
            request_app_exit,
            hide_settings_window,
            open_external_url,
            request_ai_provider_json,
            request_native_chat,
            request_native_chat_stream,
            save_ai_chat_attachment,
            read_ai_chat_attachment,
            delete_ai_chat_attachment_session,
            request_web_resource,
            backup_markdown_folder,
            sync_webdav_markdown_folder,
            read_s3_text_file,
            write_s3_text_file,
            read_webdav_text_file,
            write_webdav_text_file,
            download_web_image,
            upload_picgo_image,
            upload_s3_image,
            upload_webdav_image,
            write_markdown_file,
            write_text_file,
            export_markdown_file,
            export_pdf_file,
            check_pandoc_available,
            detect_pandoc_path,
            export_pandoc_file,
            watch_markdown_file,
            unwatch_markdown_file,
            watch_markdown_tree,
            unwatch_markdown_tree,
            take_opened_markdown_paths,
            get_shell_command_status,
            install_shell_command,
            uninstall_shell_command,
            start_acp_agent,
            write_acp_agent_message,
            stop_acp_agent,
            set_editor_window_restore_state,
            list_editor_window_restore_states,
            list_system_font_families,
            delete_spellcheck_dictionary,
            get_spellcheck_dictionary_status,
            load_spellcheck_dictionary,
            is_native_portable_app,
            check_portable_app_update,
            download_portable_app_update,
            restart_portable_app_update,
            open_log_folder
        ])
        .build(tauri::generate_context!())
        .expect("error while building Markra")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                handle_app_exit_requested(app, code, api);
            }
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            tauri::RunEvent::Opened { urls } => {
                queue_opened_markdown_paths(app, opened_markdown_paths_from_urls(&urls));
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                // Settings may stay visible after prewarm. Treating that as an editor would skip
                // workspace restore when the user reopens Markra from the Dock.
                if !has_visible_editor_window(app) {
                    reveal_or_open_markdown_paths(app, Vec::new(), true);
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn exposes_native_command_classification_from_menu_module() {
        assert!(crate::menu::is_frontend_menu_command("saveDocument"));
        assert!(crate::menu::is_native_new_window_command("newDocument"));
        assert!(crate::menu::is_native_settings_window_command(
            "openSettings"
        ));
    }

    #[test]
    fn bundle_declares_markdown_file_associations() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");
        let associations = config
            .pointer("/bundle/fileAssociations")
            .and_then(serde_json::Value::as_array)
            .expect("bundle should declare file associations");
        let markdown_association = associations
            .iter()
            .find(|association| {
                association
                    .pointer("/ext")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|extensions| {
                        extensions
                            .iter()
                            .any(|extension| extension.as_str() == Some("md"))
                            && extensions
                                .iter()
                                .any(|extension| extension.as_str() == Some("markdown"))
                    })
            })
            .expect("Markdown extensions should be associated with Markra");

        assert_eq!(
            markdown_association
                .pointer("/role")
                .and_then(serde_json::Value::as_str),
            Some("Editor")
        );
    }

    #[test]
    fn windows_installers_register_explorer_context_menus() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");

        assert_eq!(
            config
                .pointer("/bundle/windows/nsis/installerHooks")
                .and_then(serde_json::Value::as_str),
            Some("./windows/explorer-menu.nsh")
        );
        assert!(
            config
                .pointer("/bundle/windows/wix/fragmentPaths")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|paths| {
                    paths
                        .iter()
                        .any(|path| path.as_str() == Some("./windows/explorer-menu.wxs"))
                }),
            "WiX should include the Explorer menu registry fragment"
        );
        assert!(
            config
                .pointer("/bundle/windows/wix/componentRefs")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|components| {
                    components
                        .iter()
                        .any(|component| component.as_str() == Some("MarkraExplorerMenu"))
                }),
            "WiX should install the Explorer menu registry component"
        );

        let windows_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows");
        let nsis_hooks = std::fs::read_to_string(windows_dir.join("explorer-menu.nsh"))
            .expect("NSIS Explorer menu hooks should exist");
        assert!(nsis_hooks.contains("NSIS_HOOK_POSTINSTALL"));
        assert!(nsis_hooks.contains("NSIS_HOOK_PREUNINSTALL"));
        assert!(nsis_hooks.contains(r"Software\Classes\${OBJECT}\shell\Markra.open"));
        assert!(nsis_hooks.contains(r#""SystemFileAssociations\.txt""#));
        assert!(nsis_hooks.contains(r#""Directory""#));
        assert!(nsis_hooks.contains(r#""Directory\Background""#));
        assert!(nsis_hooks.contains(r#"$\"${ARGUMENT}$\""#));
        assert!(nsis_hooks.contains(r#""%1""#));
        assert!(nsis_hooks.contains(r#""%V""#));
        assert!(nsis_hooks.contains("ReadRegStr"));
        assert!(nsis_hooks.contains("DeleteRegKey"));

        let wix_fragment = std::fs::read_to_string(windows_dir.join("explorer-menu.wxs"))
            .expect("WiX Explorer menu fragment should exist");
        assert!(wix_fragment.contains("MarkraExplorerMenu"));
        assert!(wix_fragment.contains(r"SystemFileAssociations\.txt\shell\Markra.open"));
        assert!(wix_fragment.contains(r"Directory\shell\Markra.open"));
        assert!(wix_fragment.contains(r"Directory\Background\shell\Markra.open"));
        assert!(wix_fragment.contains("&quot;%1&quot;"));
        assert!(wix_fragment.contains("&quot;%V&quot;"));
        assert!(
            wix_fragment.contains(r"[INSTALLDIR]{{main_binary_name}}.exe"),
            "WiX Explorer menu paths should use the install directory instead of a cross-feature file reference"
        );
        assert!(!wix_fragment.contains("[#Path]"));
        assert_eq!(wix_fragment.matches("<RemoveRegistryKey").count(), 3);
        assert_eq!(
            wix_fragment
                .matches(r#"Action="removeOnUninstall""#)
                .count(),
            3,
            "WiX registry cleanup must use the removeOnUninstall action"
        );

        let mut reader = quick_xml::Reader::from_str(&wix_fragment);
        loop {
            match reader.read_event() {
                Ok(quick_xml::events::Event::Eof) => break,
                Ok(_) => {}
                Err(error) => panic!("WiX Explorer menu fragment should be valid XML: {error}"),
            }
        }
    }

    #[test]
    fn desktop_registers_window_state_restore_plugin() {
        let manifest = include_str!("../Cargo.toml");
        assert!(
            manifest.contains("tauri-plugin-window-state"),
            "desktop manifest should include the window state plugin"
        );

        let lib_source = include_str!("lib.rs");
        assert!(
            lib_source.contains("tauri_plugin_window_state::Builder::default()")
                && lib_source.contains(".with_state_flags(window_state_restore_flags())"),
            "Tauri builder should register the window state restore plugin"
        );
    }

    #[test]
    fn desktop_window_state_restore_does_not_auto_show_window() {
        let flags = crate::window_state_restore_flags();

        assert!(
            !flags.contains(tauri_plugin_window_state::StateFlags::VISIBLE),
            "window-state should not restore visibility before the frontend startup reveal"
        );
    }

    #[test]
    fn desktop_window_state_restore_does_not_restore_decorations() {
        let flags = crate::window_state_restore_flags();

        assert!(
            !flags.contains(tauri_plugin_window_state::StateFlags::DECORATIONS),
            "window-state should not restore old native decorations over the configured window chrome"
        );
    }

    #[test]
    fn desktop_registers_native_startup_window_reveal_fallback() {
        let lib_source = include_str!("lib.rs");
        let fallback_registration =
            ["spawn_startup_window", "_reveal_fallback(&app.handle())"].concat();

        assert!(
            lib_source.contains(&fallback_registration),
            "Tauri setup should register a native startup reveal fallback so hidden dev windows cannot stay Dock-only"
        );
    }

    #[test]
    fn cli_opened_paths_can_fallback_to_editor_window_urls() {
        let root = std::env::temp_dir().join(format!(
            "markra-cli-window-fallback-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("test folder should be created");
        let markdown_file = root.join("notes.md");
        std::fs::write(&markdown_file, "# Notes").expect("markdown file should be created");

        let urls = super::editor_window_urls_for_opened_markdown_paths(&[
            root.to_string_lossy().to_string(),
            markdown_file.to_string_lossy().to_string(),
        ]);

        assert_eq!(
            urls,
            vec![
                crate::windows::editor_window_url_for_folder(&root.to_string_lossy()),
                crate::windows::editor_window_url_for_path(&markdown_file.to_string_lossy()),
            ]
        );

        std::fs::remove_dir_all(root).expect("test folder should be removed");
    }

    #[test]
    fn desktop_reveals_initial_cli_opened_paths_natively() {
        let lib_source = include_str!("lib.rs");

        assert!(
            lib_source.contains("reveal_or_open_markdown_paths(&app.handle(), paths, false);"),
            "initial CLI-opened paths should trigger a native window reveal instead of only being queued"
        );
    }

    #[test]
    fn empty_app_reopen_uses_restorable_editor_window() {
        let lib_source = include_str!("lib.rs");
        let start = lib_source
            .find("fn reveal_or_open_markdown_paths")
            .expect("reveal_or_open_markdown_paths should exist");
        let end = lib_source[start..]
            .find("fn show_main_window_if_hidden")
            .map(|offset| start + offset)
            .expect("reveal_or_open_markdown_paths should end before show_main_window_if_hidden");
        let reveal_source = &lib_source[start..end];

        assert!(
            reveal_source.contains("spawn_restorable_editor_window(app.clone());"),
            "reopening Markra without a live main window should create a restore-capable editor window"
        );
        assert!(
            !reveal_source.contains("spawn_blank_editor_window(app.clone());"),
            "empty app reopen should not use index.html?blank=1 because that skips workspace restore"
        );
    }

    #[test]
    fn desktop_handles_macos_reopen_without_visible_windows() {
        let lib_source = include_str!("lib.rs");
        let reopen_event = ["tauri::RunEvent::", "Reopen {"].concat();
        let empty_reveal = ["reveal_or_open_markdown_paths(app, Vec::new(), ", "true);"].concat();

        assert!(
            lib_source.contains(&reopen_event),
            "macOS Dock reopen should be handled when all editor windows are closed"
        );
        assert!(
            lib_source.contains("if !has_visible_editor_window(app) {"),
            "reopen handling should only create a window when no editor window is visible"
        );
        assert!(
            lib_source.contains(&empty_reveal),
            "macOS Dock reopen should use the restore-capable empty reveal path"
        );
    }

    #[test]
    fn desktop_reopen_ignores_visible_settings_windows() {
        let lib_source = include_str!("lib.rs");
        let generic_visible_window_guard = ["if !has", "_visible_windows {"].concat();

        assert!(
            lib_source.contains("if !has_visible_editor_window(app) {"),
            "macOS Dock reopen should restore an editor when the only visible window is Settings"
        );
        assert!(
            !lib_source.contains(&generic_visible_window_guard),
            "macOS Dock reopen should not treat visible Settings windows as visible editor windows"
        );
    }

    #[test]
    fn desktop_registers_native_about_command() {
        let lib_source = include_str!("lib.rs");
        let command_name = ["show", "_native_app", "_about"].concat();
        let registration = format!("{command_name},");
        let handler_source = &lib_source[lib_source
            .find("tauri::generate_handler![")
            .expect("Tauri invoke handler should be registered")..];

        assert!(
            handler_source.contains(&registration),
            "Windows self-drawn app menu should be able to open the system-native About panel"
        );
    }

    #[test]
    fn desktop_registers_single_instance_plugin_before_other_plugins() {
        let manifest = include_str!("../Cargo.toml");
        assert!(
            manifest.contains("tauri-plugin-single-instance"),
            "desktop manifest should include the single instance plugin"
        );

        let lib_source = include_str!("lib.rs");
        let single_instance_index = lib_source
            .find("tauri_plugin_single_instance::init")
            .expect("Tauri builder should register the single instance plugin");
        let store_plugin_index = lib_source
            .find("tauri_plugin_store::Builder")
            .expect("Tauri builder should register the store plugin");

        assert!(
            single_instance_index < store_plugin_index,
            "single instance plugin should be registered before other plugins"
        );
    }

    #[test]
    fn desktop_log_files_have_bounded_rotation() {
        let lib_source = include_str!("lib.rs");
        let max_size_constant = [
            "const DESKTOP_LOG_MAX",
            "_FILE_SIZE_BYTES: u128 = 2 * 1024 * 1024;",
        ]
        .concat();
        let max_count_constant = ["const DESKTOP_LOG_MAX", "_FILE_COUNT: usize = 5;"].concat();
        let archive_count_constant = [
            "const DESKTOP_LOG_ARCHIVED",
            "_FILE_COUNT: usize = DESKTOP_LOG_MAX_FILE_COUNT - 1;",
        ]
        .concat();
        let max_file_size_call = [".max", "_file_size(DESKTOP_LOG_MAX_FILE_SIZE_BYTES)"].concat();
        let rotation_strategy_type = ["tauri_plugin_log::RotationStrategy::", "KeepSome"].concat();
        let archived_count_name = ["DESKTOP_LOG_ARCHIVED", "_FILE_COUNT"].concat();
        let debug_level_call = [".level(tauri_plugin_log::log::LevelFilter::", "Debug)"].concat();

        assert_eq!(crate::DESKTOP_LOG_MAX_FILE_SIZE_BYTES, 2 * 1024 * 1024);
        assert_eq!(crate::DESKTOP_LOG_MAX_FILE_COUNT, 5);
        assert_eq!(crate::DESKTOP_LOG_ARCHIVED_FILE_COUNT, 4);
        assert!(
            lib_source.contains(&max_size_constant),
            "desktop file logs should use a conservative 2MB per-file limit"
        );
        assert!(
            lib_source.contains(&max_count_constant),
            "desktop file logs should cap total retained log files"
        );
        assert!(
            lib_source.contains(&archive_count_constant),
            "desktop archived log file count should reserve one slot for the active log file"
        );
        assert!(
            lib_source.contains(&max_file_size_call),
            "desktop log plugin should use the configured file size limit"
        );
        let rotation_strategy_index = lib_source
            .find(&rotation_strategy_type)
            .expect("desktop log plugin should use KeepSome rotation");
        assert!(
            lib_source[rotation_strategy_index..].contains(&archived_count_name),
            "desktop log plugin should keep only the configured number of archived files"
        );
        assert!(
            lib_source.contains(&debug_level_call),
            "desktop log plugin should accept debug events before the app-level filter"
        );
    }

    #[test]
    fn builds_webdav_upload_and_public_image_urls() {
        let targets = crate::image_upload::webdav_image_upload_targets(
            "https://dav.example.com/remote.php/dav/files/ada/",
            "notes/screenshots",
            "https://cdn.example.com/images/",
            "pasted-image-123.png",
        )
        .expect("WebDAV upload targets should be built");

        assert_eq!(
            targets.upload_url.as_str(),
            "https://dav.example.com/remote.php/dav/files/ada/notes/screenshots/pasted-image-123.png"
        );
        assert_eq!(
            targets.public_url,
            "https://cdn.example.com/images/notes/screenshots/pasted-image-123.png"
        );
    }

    #[test]
    fn builds_s3_upload_and_public_image_urls() {
        let targets = crate::image_upload::s3_image_upload_targets(
            "https://s3.example.com/",
            "markra-images",
            "notes/screenshots",
            "https://cdn.example.com/images/",
            "pasted-image-123.png",
        )
        .expect("S3 upload targets should be built");

        assert_eq!(
            targets.upload_url.as_str(),
            "https://s3.example.com/markra-images/notes/screenshots/pasted-image-123.png"
        );
        assert_eq!(
            targets.public_url,
            "https://cdn.example.com/images/notes/screenshots/pasted-image-123.png"
        );
    }
}
