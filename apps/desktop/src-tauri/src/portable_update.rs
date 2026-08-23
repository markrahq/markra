use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    env,
    ffi::{OsStr, OsString},
    fs,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use zip::ZipArchive;

pub(crate) const PORTABLE_MANIFEST_NAME: &str = "markra-portable.json";
const PORTABLE_ARCHIVE_ROOT: &str = "Markra";
const PORTABLE_UPDATE_TARGET: &str = "windows-portable-x86_64";
const PORTABLE_UPDATE_WORK_DIR: &str = ".markra-update";
const PORTABLE_UPDATE_HELPER_PREFIX: &str = "markra-portable-helper-";
pub(crate) const PORTABLE_UPDATE_HELPER_ARG: &str = "--apply-portable-update";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableManifest {
    format_version: u32,
    executable: String,
    files: Vec<String>,
}

#[derive(Debug)]
struct PortableHelperRequest {
    parent_process_id: u32,
    staged_dir: PathBuf,
    install_dir: PathBuf,
    backup_dir: PathBuf,
}

#[derive(Debug)]
struct StagedPortableUpdate {
    staged_dir: PathBuf,
    install_dir: PathBuf,
    backup_dir: PathBuf,
    work_dir: PathBuf,
}

#[derive(Default)]
struct PortableUpdateSession {
    pending: Option<Update>,
    staged: Option<StagedPortableUpdate>,
}

#[derive(Default)]
pub(crate) struct PortableUpdateState(Mutex<PortableUpdateSession>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PortableUpdateMetadata {
    body: Option<String>,
    current_version: String,
    date: Option<String>,
    version: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub(crate) enum PortableDownloadEvent {
    Started {
        #[serde(rename = "contentLength")]
        content_length: Option<u64>,
    },
    Progress {
        #[serde(rename = "chunkLength")]
        chunk_length: usize,
    },
    Finished,
}

fn portable_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

fn validate_portable_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.contains('\\') || path.contains(':') {
        return Err(format!("unsafe portable path: {path}"));
    }

    let relative = PathBuf::from(path);
    if !relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(format!("unsafe portable path: {path}"));
    }

    Ok(relative)
}

fn validate_manifest(manifest: &PortableManifest) -> Result<Vec<PathBuf>, String> {
    if manifest.format_version != 1 {
        return Err(format!(
            "unsupported portable manifest format: {}",
            manifest.format_version
        ));
    }

    let executable = validate_portable_path(&manifest.executable)?;
    let mut unique_files = BTreeSet::new();
    let mut files = Vec::with_capacity(manifest.files.len());

    for file in &manifest.files {
        let relative = validate_portable_path(file)?;
        if !unique_files.insert(relative.clone()) {
            return Err(format!("duplicate portable path: {file}"));
        }
        files.push(relative);
    }

    if !unique_files.contains(&executable) {
        return Err("portable manifest does not manage its executable".to_string());
    }
    if !unique_files.contains(Path::new(PORTABLE_MANIFEST_NAME)) {
        return Err("portable manifest does not manage itself".to_string());
    }

    Ok(files)
}

fn read_manifest(path: &Path) -> Result<PortableManifest, String> {
    let contents = fs::read_to_string(path)
        .map_err(|error| portable_error("failed to read portable manifest", error))?;
    let manifest = serde_json::from_str::<PortableManifest>(&contents)
        .map_err(|error| portable_error("failed to parse portable manifest", error))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn manifest_for_root(root: &Path) -> Result<PortableManifest, String> {
    read_manifest(&root.join(PORTABLE_MANIFEST_NAME))
}

fn is_portable_executable(executable: &Path) -> bool {
    let Some(root) = executable.parent() else {
        return false;
    };
    let Ok(manifest) = manifest_for_root(root) else {
        return false;
    };

    executable.file_name().is_some_and(|file_name| {
        file_name
            .to_string_lossy()
            .eq_ignore_ascii_case(&manifest.executable)
    })
}

fn archive_entry_name(relative: &Path) -> String {
    format!(
        "{PORTABLE_ARCHIVE_ROOT}/{}",
        relative.to_string_lossy().replace('\\', "/")
    )
}

fn extract_portable_package(bytes: &[u8], output_dir: &Path) -> Result<PortableManifest, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| portable_error("failed to open portable update archive", error))?;
    let manifest_entry_name = format!("{PORTABLE_ARCHIVE_ROOT}/{PORTABLE_MANIFEST_NAME}");
    let manifest = {
        let mut entry = archive
            .by_name(&manifest_entry_name)
            .map_err(|error| portable_error("portable update manifest is missing", error))?;
        let mut contents = String::new();
        entry
            .read_to_string(&mut contents)
            .map_err(|error| portable_error("failed to read portable update manifest", error))?;
        serde_json::from_str::<PortableManifest>(&contents)
            .map_err(|error| portable_error("failed to parse portable update manifest", error))?
    };
    let files = validate_manifest(&manifest)?;

    for relative in files {
        let archive_name = archive_entry_name(&relative);
        let mut entry = archive.by_name(&archive_name).map_err(|error| {
            portable_error(
                &format!("portable update file is missing: {archive_name}"),
                error,
            )
        })?;
        if entry.is_dir() {
            return Err(format!(
                "portable update file is a directory: {archive_name}"
            ));
        }

        let output_path = output_dir.join(&relative);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                portable_error("failed to create portable staging directory", error)
            })?;
        }
        let mut output = fs::File::create(&output_path)
            .map_err(|error| portable_error("failed to create staged portable file", error))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| portable_error("failed to extract staged portable file", error))?;
    }

    Ok(manifest)
}

fn restore_backup_files(
    moved_files: &[PathBuf],
    install_dir: &Path,
    backup_dir: &Path,
) -> Result<(), String> {
    for relative in moved_files.iter().rev() {
        let backup_path = backup_dir.join(relative);
        if !backup_path.exists() {
            continue;
        }
        let install_path = install_dir.join(relative);
        if install_path.exists() {
            fs::remove_file(&install_path).map_err(|error| {
                portable_error("failed to remove incomplete portable file", error)
            })?;
        }
        if let Some(parent) = install_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                portable_error("failed to recreate portable install directory", error)
            })?;
        }
        fs::rename(&backup_path, &install_path)
            .map_err(|error| portable_error("failed to restore portable update backup", error))?;
    }
    Ok(())
}

fn apply_staged_update(
    staged_dir: &Path,
    install_dir: &Path,
    backup_dir: &Path,
) -> Result<(), String> {
    let old_manifest = manifest_for_root(install_dir)?;
    let new_manifest = manifest_for_root(staged_dir)?;
    let old_files = validate_manifest(&old_manifest)?;
    let new_files = validate_manifest(&new_manifest)?;
    let old_file_set = old_files.iter().cloned().collect::<BTreeSet<_>>();

    for relative in &new_files {
        if !staged_dir.join(relative).is_file() {
            return Err(format!(
                "staged portable file is missing: {}",
                relative.display()
            ));
        }
        if !old_file_set.contains(relative) && install_dir.join(relative).exists() {
            return Err(format!(
                "new package file would replace an unmanaged portable file: {}",
                relative.display()
            ));
        }
    }

    let managed_files = old_files
        .iter()
        .chain(new_files.iter())
        .cloned()
        .collect::<BTreeSet<_>>();
    fs::create_dir_all(backup_dir)
        .map_err(|error| portable_error("failed to create portable update backup", error))?;

    let mut moved_files = Vec::new();
    for relative in managed_files {
        let install_path = install_dir.join(&relative);
        if !install_path.is_file() {
            continue;
        }
        let backup_path = backup_dir.join(&relative);
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                portable_error("failed to create portable backup directory", error)
            })?;
        }
        if let Err(error) = fs::rename(&install_path, &backup_path) {
            restore_backup_files(&moved_files, install_dir, backup_dir)?;
            return Err(portable_error("failed to back up portable file", error));
        }
        moved_files.push(relative);
    }

    let mut installed_files = Vec::new();
    for relative in &new_files {
        let staged_path = staged_dir.join(relative);
        let install_path = install_dir.join(relative);
        if let Some(parent) = install_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                for installed in installed_files.iter().rev() {
                    let _ = fs::remove_file(install_dir.join(installed));
                }
                restore_backup_files(&moved_files, install_dir, backup_dir)?;
                return Err(portable_error(
                    "failed to create portable install directory",
                    error,
                ));
            }
        }
        if let Err(error) = fs::rename(&staged_path, &install_path) {
            for installed in installed_files.iter().rev() {
                let _ = fs::remove_file(install_dir.join(installed));
            }
            restore_backup_files(&moved_files, install_dir, backup_dir)?;
            return Err(portable_error("failed to install portable file", error));
        }
        installed_files.push(relative.clone());
    }

    fs::remove_dir_all(backup_dir)
        .map_err(|error| portable_error("failed to remove portable update backup", error))?;
    Ok(())
}

fn parse_portable_update_helper_request<I>(args: I) -> Option<PortableHelperRequest>
where
    I: IntoIterator<Item = OsString>,
{
    let mut args = args.into_iter();
    args.next()?;
    if args.next()?.as_os_str() != OsStr::new(PORTABLE_UPDATE_HELPER_ARG) {
        return None;
    }

    let parent_process_id = args.next()?.to_string_lossy().parse().ok()?;
    let request = PortableHelperRequest {
        parent_process_id,
        staged_dir: PathBuf::from(args.next()?),
        install_dir: PathBuf::from(args.next()?),
        backup_dir: PathBuf::from(args.next()?),
    };
    if args.next().is_some() {
        return None;
    }
    Some(request)
}

#[cfg(windows)]
fn wait_for_parent_process(parent_process_id: u32) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_FAILED, WAIT_OBJECT_0},
        System::Threading::{OpenProcess, WaitForSingleObject, SYNCHRONIZE},
    };

    let handle = unsafe { OpenProcess(SYNCHRONIZE, 0, parent_process_id) };
    if handle.is_null() {
        return Ok(());
    }
    let result = unsafe { WaitForSingleObject(handle, 60_000) };
    unsafe { CloseHandle(handle) };

    if result == WAIT_OBJECT_0 {
        Ok(())
    } else if result == WAIT_FAILED {
        Err(portable_error(
            "failed to wait for Markra to exit",
            std::io::Error::last_os_error(),
        ))
    } else {
        Err("timed out waiting for Markra to exit".to_string())
    }
}

#[cfg(not(windows))]
fn wait_for_parent_process(_parent_process_id: u32) -> Result<(), String> {
    Ok(())
}

fn run_portable_update_helper_with<W, R>(
    request: PortableHelperRequest,
    wait_for_parent: W,
    restart_app: R,
) -> Result<(), String>
where
    W: FnOnce(u32) -> Result<(), String>,
    R: FnOnce(&Path) -> Result<(), String>,
{
    wait_for_parent(request.parent_process_id)?;
    let update_result = apply_staged_update(
        &request.staged_dir,
        &request.install_dir,
        &request.backup_dir,
    );
    let restart_result = manifest_for_root(&request.install_dir)
        .and_then(|manifest| restart_app(&request.install_dir.join(&manifest.executable)));

    if update_result.is_ok() {
        if let Some(work_dir) = request.staged_dir.parent() {
            let _ = fs::remove_dir_all(work_dir);
        }
    }

    match (update_result, restart_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(update_error), Ok(())) => Err(update_error),
        (Ok(()), Err(restart_error)) => Err(restart_error),
        (Err(update_error), Err(restart_error)) => Err(format!(
            "{update_error}; failed to restart the existing portable app: {restart_error}"
        )),
    }
}

fn run_portable_update_helper(request: PortableHelperRequest) -> Result<(), String> {
    run_portable_update_helper_with(request, wait_for_parent_process, |executable| {
        Command::new(executable)
            .spawn()
            .map(|_| ())
            .map_err(|error| portable_error("failed to restart portable app", error))
    })
}

pub fn run_portable_update_helper_if_requested() -> bool {
    let Some(request) = parse_portable_update_helper_request(env::args_os()) else {
        return false;
    };
    if let Err(error) = run_portable_update_helper(request) {
        eprintln!("Portable update failed: {error}");
    }
    true
}

fn unique_suffix() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("{}-{timestamp}", std::process::id())
}

fn create_staging_paths(install_dir: &Path) -> Result<StagedPortableUpdate, String> {
    // Keep staging beside the app so every final rename stays atomic even when the
    // portable folder lives on a different drive than the system temp directory.
    let work_dir = install_dir
        .join(PORTABLE_UPDATE_WORK_DIR)
        .join(unique_suffix());
    let staged_dir = work_dir.join("staged");
    let backup_dir = work_dir.join("backup");
    fs::create_dir_all(&staged_dir).map_err(|error| {
        portable_error("failed to create portable update staging directory", error)
    })?;
    Ok(StagedPortableUpdate {
        staged_dir,
        install_dir: install_dir.to_path_buf(),
        backup_dir,
        work_dir,
    })
}

fn current_portable_executable() -> Result<PathBuf, String> {
    let executable = env::current_exe()
        .map_err(|error| portable_error("failed to locate the Markra executable", error))?;
    if !cfg!(windows) || !is_portable_executable(&executable) {
        return Err("Markra is not running from a supported portable package".to_string());
    }
    Ok(executable)
}

#[tauri::command]
pub(crate) fn is_native_portable_app() -> bool {
    current_portable_executable().is_ok()
}

#[tauri::command]
pub(crate) async fn check_portable_app_update(
    app: AppHandle,
    state: State<'_, PortableUpdateState>,
    proxy: Option<String>,
) -> Result<Option<PortableUpdateMetadata>, String> {
    current_portable_executable()?;
    {
        let mut session = state
            .0
            .lock()
            .map_err(|error| portable_error("portable updater state is unavailable", error))?;
        session.pending = None;
    }

    let mut builder = app.updater_builder().target(PORTABLE_UPDATE_TARGET);
    if let Some(proxy) = proxy {
        let proxy = proxy
            .parse()
            .map_err(|error| portable_error("invalid portable updater proxy", error))?;
        builder = builder.proxy(proxy);
    }
    let update = builder
        .build()
        .map_err(|error| portable_error("failed to configure portable updater", error))?
        .check()
        .await
        .map_err(|error| portable_error("failed to check for portable updates", error))?;
    let metadata = update.as_ref().map(|update| PortableUpdateMetadata {
        body: update.body.clone(),
        current_version: update.current_version.clone(),
        date: update.date.map(|date| date.to_string()),
        version: update.version.clone(),
    });
    let mut session = state
        .0
        .lock()
        .map_err(|error| portable_error("portable updater state is unavailable", error))?;
    session.pending = update;
    Ok(metadata)
}

#[tauri::command]
pub(crate) async fn download_portable_app_update(
    state: State<'_, PortableUpdateState>,
    on_event: Channel<PortableDownloadEvent>,
) -> Result<(), String> {
    let update = {
        let mut session = state
            .0
            .lock()
            .map_err(|error| portable_error("portable updater state is unavailable", error))?;
        session
            .pending
            .take()
            .ok_or_else(|| "there is no pending portable update".to_string())?
    };
    let progress_events = on_event.clone();
    let finished_events = on_event.clone();
    let mut started = false;
    // Tauri verifies the signed portable target before returning these bytes. Do not
    // replace this with an unsigned direct download.
    let bytes = update
        .download(
            move |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = progress_events.send(PortableDownloadEvent::Started { content_length });
                }
                let _ = progress_events.send(PortableDownloadEvent::Progress { chunk_length });
            },
            move || {
                let _ = finished_events.send(PortableDownloadEvent::Finished);
            },
        )
        .await
        .map_err(|error| portable_error("failed to download or verify portable update", error))?;

    let executable = current_portable_executable()?;
    let install_dir = executable
        .parent()
        .ok_or_else(|| "portable executable has no parent directory".to_string())?;
    let staged = create_staging_paths(install_dir)?;
    if let Err(error) = extract_portable_package(&bytes, &staged.staged_dir) {
        let _ = fs::remove_dir_all(&staged.work_dir);
        return Err(error);
    }

    let mut session = state
        .0
        .lock()
        .map_err(|error| portable_error("portable updater state is unavailable", error))?;
    if let Some(previous) = session.staged.replace(staged) {
        let _ = fs::remove_dir_all(previous.work_dir);
    }
    Ok(())
}

#[cfg(windows)]
fn parent_process_id() -> u32 {
    unsafe { windows_sys::Win32::System::Threading::GetCurrentProcessId() }
}

#[cfg(not(windows))]
fn parent_process_id() -> u32 {
    std::process::id()
}

fn spawn_portable_update_helper(staged: &StagedPortableUpdate) -> Result<(), String> {
    let executable = current_portable_executable()?;
    let helper_dir = env::temp_dir().join(format!(
        "{PORTABLE_UPDATE_HELPER_PREFIX}{}",
        unique_suffix()
    ));
    fs::create_dir_all(&helper_dir).map_err(|error| {
        portable_error("failed to create portable update helper directory", error)
    })?;
    let helper_path = helper_dir.join("MarkraPortableUpdate.exe");
    // Windows locks the running executable. A temporary copy can wait for this
    // process to exit, replace the original files, and then launch the new version.
    fs::copy(&executable, &helper_path)
        .map_err(|error| portable_error("failed to prepare portable update helper", error))?;
    Command::new(&helper_path)
        .arg(PORTABLE_UPDATE_HELPER_ARG)
        .arg(parent_process_id().to_string())
        .arg(&staged.staged_dir)
        .arg(&staged.install_dir)
        .arg(&staged.backup_dir)
        .spawn()
        .map_err(|error| portable_error("failed to launch portable update helper", error))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn restart_portable_app_update(
    app: AppHandle,
    state: State<'_, PortableUpdateState>,
) -> Result<(), String> {
    let staged = {
        let mut session = state
            .0
            .lock()
            .map_err(|error| portable_error("portable updater state is unavailable", error))?;
        session
            .staged
            .take()
            .ok_or_else(|| "there is no staged portable update".to_string())?
    };
    spawn_portable_update_helper(&staged)?;
    app.exit(0);
    Ok(())
}

pub(crate) fn cleanup_portable_update_helpers() {
    let Ok(entries) = fs::read_dir(env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(PORTABLE_UPDATE_HELPER_PREFIX)
        {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::{Cursor, Write},
        path::Path,
    };
    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn manifest(executable: &str, files: &[&str]) -> String {
        serde_json::json!({
            "formatVersion": 1,
            "executable": executable,
            "files": files,
        })
        .to_string()
    }

    fn write_manifest(root: &Path, executable: &str, files: &[&str]) {
        fs::write(
            root.join(PORTABLE_MANIFEST_NAME),
            manifest(executable, files),
        )
        .expect("portable manifest should be written");
    }

    fn portable_archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();

        for (name, bytes) in entries {
            archive
                .start_file(*name, options)
                .expect("archive entry should start");
            archive
                .write_all(bytes)
                .expect("archive entry should be written");
        }

        archive
            .finish()
            .expect("archive should finish")
            .into_inner()
    }

    #[test]
    fn detects_portable_installations_from_the_managed_manifest() {
        let root = tempdir().expect("temporary directory should exist");
        let executable = root.path().join("Markra.exe");
        fs::write(&executable, b"binary").expect("executable should be written");
        write_manifest(
            root.path(),
            "Markra.exe",
            &["Markra.exe", PORTABLE_MANIFEST_NAME],
        );

        assert!(is_portable_executable(&executable));
        assert!(!is_portable_executable(&root.path().join("Other.exe")));
    }

    #[test]
    fn detects_portable_executable_names_case_insensitively_like_windows() {
        let root = tempdir().expect("temporary directory should exist");
        let executable = root.path().join("markra.exe");
        fs::write(&executable, b"binary").expect("executable should be written");
        write_manifest(
            root.path(),
            "Markra.exe",
            &["Markra.exe", PORTABLE_MANIFEST_NAME],
        );

        assert!(is_portable_executable(&executable));
    }

    #[test]
    fn extracts_a_valid_portable_package_into_the_staging_directory() {
        let root = tempdir().expect("temporary directory should exist");
        let archive = portable_archive(&[
            ("Markra/Markra.exe", b"new-binary"),
            ("Markra/support.dll", b"new-library"),
            (
                "Markra/markra-portable.json",
                manifest(
                    "Markra.exe",
                    &["Markra.exe", "support.dll", PORTABLE_MANIFEST_NAME],
                )
                .as_bytes(),
            ),
        ]);

        let extracted = extract_portable_package(&archive, root.path())
            .expect("portable package should extract");

        assert_eq!(extracted.executable, "Markra.exe");
        assert_eq!(
            fs::read(root.path().join("Markra.exe")).unwrap(),
            b"new-binary"
        );
        assert_eq!(
            fs::read(root.path().join("support.dll")).unwrap(),
            b"new-library"
        );
    }

    #[test]
    fn rejects_unsafe_paths_before_extracting_portable_files() {
        let root = tempdir().expect("temporary directory should exist");
        let archive = portable_archive(&[
            ("Markra/Markra.exe", b"new-binary"),
            (
                "Markra/markra-portable.json",
                manifest(
                    "Markra.exe",
                    &["Markra.exe", "../outside.dll", PORTABLE_MANIFEST_NAME],
                )
                .as_bytes(),
            ),
        ]);

        let error = extract_portable_package(&archive, root.path())
            .expect_err("unsafe portable paths should be rejected");

        assert!(error.contains("unsafe portable path"));
        assert!(!root.path().join("Markra.exe").exists());
    }

    #[test]
    fn applies_managed_files_and_preserves_user_files() {
        let root = tempdir().expect("temporary directory should exist");
        let install = root.path().join("install");
        let staged = root.path().join("staged");
        let backup = root.path().join("backup");
        fs::create_dir_all(&install).unwrap();
        fs::create_dir_all(&staged).unwrap();

        fs::write(install.join("Markra.exe"), b"old-binary").unwrap();
        fs::write(install.join("support.dll"), b"old-library").unwrap();
        fs::write(install.join("obsolete.dll"), b"obsolete-library").unwrap();
        fs::write(install.join("notes.md"), b"user-file").unwrap();
        write_manifest(
            &install,
            "Markra.exe",
            &[
                "Markra.exe",
                "support.dll",
                "obsolete.dll",
                PORTABLE_MANIFEST_NAME,
            ],
        );

        fs::write(staged.join("Markra.exe"), b"new-binary").unwrap();
        fs::write(staged.join("support.dll"), b"new-library").unwrap();
        write_manifest(
            &staged,
            "Markra.exe",
            &["Markra.exe", "support.dll", PORTABLE_MANIFEST_NAME],
        );

        apply_staged_update(&staged, &install, &backup)
            .expect("staged portable update should apply");

        assert_eq!(fs::read(install.join("Markra.exe")).unwrap(), b"new-binary");
        assert_eq!(
            fs::read(install.join("support.dll")).unwrap(),
            b"new-library"
        );
        assert!(!install.join("obsolete.dll").exists());
        assert_eq!(fs::read(install.join("notes.md")).unwrap(), b"user-file");
    }

    #[test]
    fn refuses_to_replace_an_unmanaged_file_with_a_new_package_file() {
        let root = tempdir().expect("temporary directory should exist");
        let install = root.path().join("install");
        let staged = root.path().join("staged");
        let backup = root.path().join("backup");
        fs::create_dir_all(&install).unwrap();
        fs::create_dir_all(&staged).unwrap();

        fs::write(install.join("Markra.exe"), b"old-binary").unwrap();
        fs::write(install.join("future.dll"), b"user-library").unwrap();
        write_manifest(
            &install,
            "Markra.exe",
            &["Markra.exe", PORTABLE_MANIFEST_NAME],
        );
        fs::write(staged.join("Markra.exe"), b"new-binary").unwrap();
        fs::write(staged.join("future.dll"), b"package-library").unwrap();
        write_manifest(
            &staged,
            "Markra.exe",
            &["Markra.exe", "future.dll", PORTABLE_MANIFEST_NAME],
        );

        let error = apply_staged_update(&staged, &install, &backup)
            .expect_err("unmanaged files should not be overwritten");

        assert!(error.contains("unmanaged portable file"));
        assert_eq!(fs::read(install.join("Markra.exe")).unwrap(), b"old-binary");
        assert_eq!(
            fs::read(install.join("future.dll")).unwrap(),
            b"user-library"
        );
    }

    #[test]
    fn rolls_back_managed_files_when_installing_a_staged_file_fails() {
        let root = tempdir().expect("temporary directory should exist");
        let install = root.path().join("install");
        let staged = root.path().join("staged");
        let backup = root.path().join("backup");
        fs::create_dir_all(install.join("blocked.dll")).unwrap();
        fs::create_dir_all(&staged).unwrap();

        fs::write(install.join("Markra.exe"), b"old-binary").unwrap();
        write_manifest(
            &install,
            "Markra.exe",
            &["Markra.exe", "blocked.dll", PORTABLE_MANIFEST_NAME],
        );
        fs::write(staged.join("Markra.exe"), b"new-binary").unwrap();
        fs::write(staged.join("blocked.dll"), b"new-library").unwrap();
        write_manifest(
            &staged,
            "Markra.exe",
            &["Markra.exe", "blocked.dll", PORTABLE_MANIFEST_NAME],
        );

        apply_staged_update(&staged, &install, &backup)
            .expect_err("the blocked destination should fail the update");

        assert_eq!(fs::read(install.join("Markra.exe")).unwrap(), b"old-binary");
        assert!(install.join("blocked.dll").is_dir());
        assert!(manifest_for_root(&install).is_ok());
    }

    #[test]
    fn restarts_the_existing_portable_app_after_a_rolled_back_update() {
        let root = tempdir().expect("temporary directory should exist");
        let install = root.path().join("install");
        let work = root.path().join("work");
        let staged = work.join("staged");
        let backup = work.join("backup");
        fs::create_dir_all(install.join("blocked.dll")).unwrap();
        fs::create_dir_all(&staged).unwrap();
        fs::write(install.join("Markra.exe"), b"old-binary").unwrap();
        write_manifest(
            &install,
            "Markra.exe",
            &["Markra.exe", "blocked.dll", PORTABLE_MANIFEST_NAME],
        );
        fs::write(staged.join("Markra.exe"), b"new-binary").unwrap();
        fs::write(staged.join("blocked.dll"), b"new-library").unwrap();
        write_manifest(
            &staged,
            "Markra.exe",
            &["Markra.exe", "blocked.dll", PORTABLE_MANIFEST_NAME],
        );
        let restarted = std::cell::Cell::new(false);
        let request = PortableHelperRequest {
            parent_process_id: 42,
            staged_dir: staged,
            install_dir: install.clone(),
            backup_dir: backup,
        };

        run_portable_update_helper_with(
            request,
            |_| Ok(()),
            |executable| {
                restarted.set(true);
                assert_eq!(executable, install.join("Markra.exe"));
                Ok(())
            },
        )
        .expect_err("the failed update should still be reported");

        assert!(restarted.get());
        assert_eq!(fs::read(install.join("Markra.exe")).unwrap(), b"old-binary");
    }

    #[test]
    fn parses_only_complete_portable_update_helper_requests() {
        let args = [
            "Markra.exe",
            PORTABLE_UPDATE_HELPER_ARG,
            "42",
            "/mock/staged",
            "/mock/install",
            "/mock/backup",
        ];

        let request = parse_portable_update_helper_request(args.iter().map(Into::into))
            .expect("complete helper request should parse");

        assert_eq!(request.parent_process_id, 42);
        assert_eq!(request.staged_dir, Path::new("/mock/staged"));
        assert_eq!(request.install_dir, Path::new("/mock/install"));
        assert_eq!(request.backup_dir, Path::new("/mock/backup"));
        assert!(parse_portable_update_helper_request(
            ["Markra.exe", PORTABLE_UPDATE_HELPER_ARG]
                .iter()
                .map(Into::into)
        )
        .is_none());
    }
}
