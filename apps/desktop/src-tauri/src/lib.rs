mod ai_http;
mod app_exit;
mod external_urls;
mod image_upload;
mod language;
mod markdown_files;
mod menu;
mod menu_labels;
mod opened_files;
mod watcher;
mod web_http;
mod window_state;
mod windows;

use ai_http::{request_ai_provider_json, request_native_chat, request_native_chat_stream};
use app_exit::handle_app_exit_requested;
use external_urls::open_external_url;
use image_upload::{upload_picgo_image, upload_s3_image, upload_webdav_image};
use markdown_files::{
    check_pandoc_available, create_markdown_tree_file, create_markdown_tree_folder,
    delete_markdown_template_file, delete_markdown_tree_file, detect_pandoc_path,
    export_pandoc_file, export_pdf_file, list_markdown_files_for_path, move_markdown_tree_file,
    open_markdown_file_in_new_window, open_markdown_folder_in_new_window, open_markdown_path,
    read_markdown_file, read_markdown_image_file, read_markdown_template_file,
    rename_markdown_tree_file, resolve_markdown_path, save_clipboard_image, write_markdown_file,
    write_markdown_template_file,
};
use menu::{
    apply_native_application_menu_for_window_event, create_application_menu,
    emit_native_menu_command, install_application_menu, is_frontend_menu_command,
    is_native_new_window_command, is_native_settings_window_command,
    remember_native_menu_webview_window, remember_native_menu_window_from_event,
    NativeApplicationMenuState, NativeMenuTargetState,
};
use opened_files::{
    opened_markdown_paths_from_args, opened_markdown_paths_from_urls, queue_opened_markdown_paths,
    take_opened_markdown_paths, OpenedMarkdownPathsState,
};
use tauri::Manager;
use watcher::{
    unwatch_markdown_file, unwatch_markdown_tree, watch_markdown_file, watch_markdown_tree,
    MarkdownFileWatcherState, MarkdownTreeWatcherState,
};
use web_http::{download_web_image, request_web_resource};
use window_state::{
    list_editor_window_restore_states, remove_editor_window_restore_state,
    set_editor_window_restore_state, EditorWindowRestoreState,
};
use windows::{
    apply_main_window_chrome, apply_webview_window_chrome, apply_window_event_chrome,
    open_blank_editor_window, open_settings_window, spawn_blank_editor_window,
    spawn_settings_window,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MarkdownFileWatcherState::default())
        .manage(MarkdownTreeWatcherState::default())
        .manage(OpenedMarkdownPathsState::default())
        .manage(NativeApplicationMenuState::default())
        .manage(NativeMenuTargetState::default())
        .manage(EditorWindowRestoreState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            apply_main_window_chrome(app);
            if let Some(window) = app.get_webview_window("main") {
                remember_native_menu_webview_window(&window);
            }
            let paths = opened_markdown_paths_from_args(std::env::args());
            queue_opened_markdown_paths(&app.handle(), paths);
            Ok(())
        })
        .on_page_load(|webview, _| {
            apply_webview_window_chrome(webview);
        })
        .on_window_event(|window, event| {
            remember_native_menu_window_from_event(window, event);
            apply_native_application_menu_for_window_event(window, event);
            apply_window_event_chrome(window, event);
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
                spawn_settings_window(app.clone(), None);
                return;
            }

            if !is_frontend_menu_command(command) {
                return;
            }

            emit_native_menu_command(app, command.to_string());
        })
        .invoke_handler(tauri::generate_handler![
            list_markdown_files_for_path,
            create_markdown_tree_file,
            create_markdown_tree_folder,
            install_application_menu,
            rename_markdown_tree_file,
            move_markdown_tree_file,
            delete_markdown_tree_file,
            open_markdown_file_in_new_window,
            open_markdown_folder_in_new_window,
            open_markdown_path,
            resolve_markdown_path,
            read_markdown_file,
            read_markdown_image_file,
            read_markdown_template_file,
            write_markdown_template_file,
            delete_markdown_template_file,
            save_clipboard_image,
            open_blank_editor_window,
            open_settings_window,
            open_external_url,
            request_ai_provider_json,
            request_native_chat,
            request_native_chat_stream,
            request_web_resource,
            download_web_image,
            upload_picgo_image,
            upload_s3_image,
            upload_webdav_image,
            write_markdown_file,
            export_pdf_file,
            check_pandoc_available,
            detect_pandoc_path,
            export_pandoc_file,
            watch_markdown_file,
            unwatch_markdown_file,
            watch_markdown_tree,
            unwatch_markdown_tree,
            take_opened_markdown_paths,
            set_editor_window_restore_state,
            list_editor_window_restore_states
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
