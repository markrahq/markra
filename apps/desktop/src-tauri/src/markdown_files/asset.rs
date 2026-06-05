use std::path::Path;

use tauri::Manager;

pub(super) fn allow_asset_directory<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    directory: &Path,
) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(directory, true)
        .map_err(|error| error.to_string())
}
