use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt, OpenOptionsExt, OpenOptionsFollowExt};
use cap_std::fs::Dir;
use tauri::Manager;

use super::asset::allow_asset_directory;
use super::path::{is_markdown_open_file, markdown_tree_relative_path};
use super::types::ClipboardAttachmentFile;

static ATTACHMENT_STAGING_SEQUENCE: AtomicUsize = AtomicUsize::new(0);
const STAGED_ATTACHMENT_NAME: &str = "content";
const QUARANTINED_ATTACHMENT_NAME: &str = "published";

fn normalize_clipboard_attachment_folder(folder: &str) -> Result<PathBuf, String> {
    let normalized = folder.trim().replace('\\', "/");
    if normalized == "." {
        return Ok(PathBuf::new());
    }

    let candidate = Path::new(&normalized);
    if normalized.is_empty() || candidate.is_absolute() {
        return Err("Clipboard attachment folder must be relative".to_string());
    }

    let mut target = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            _ => {
                return Err(
                    "Clipboard attachment folder cannot leave the current folder".to_string(),
                )
            }
        }
    }

    if target.as_os_str().is_empty() {
        return Err("Clipboard attachment folder is invalid".to_string());
    }

    Ok(target)
}

fn requested_clipboard_attachment_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || matches!(trimmed, "." | "..")
    {
        return Err("Clipboard attachment file name is invalid".to_string());
    }

    let candidate = Path::new(trimmed);
    if candidate.components().count() != 1 {
        return Err("Clipboard attachment file name cannot include folders".to_string());
    }

    let Some(stem) = candidate.file_stem().and_then(|stem| stem.to_str()) else {
        return Err("Clipboard attachment file name is invalid".to_string());
    };

    if stem.trim().is_empty() || matches!(stem.trim(), "." | "..") {
        return Err("Clipboard attachment file name is invalid".to_string());
    }

    Ok(trimmed.to_string())
}

fn clipboard_attachment_file_name(file_name: &str, attempt: usize) -> Result<String, String> {
    let requested_name = requested_clipboard_attachment_file_name(file_name)?;
    if attempt == 0 {
        return Ok(requested_name);
    }

    let path = Path::new(&requested_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Clipboard attachment file name is invalid".to_string())?;
    let suffix = format!("-{}", attempt + 1);

    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        return Ok(format!("{stem}{suffix}.{extension}"));
    }

    Ok(format!("{stem}{suffix}"))
}

fn ensure_attachment_folder(root: &Dir, folder: &Path) -> Result<Dir, String> {
    let mut current = root.try_clone().map_err(|error| error.to_string())?;

    for component in folder.components() {
        let Component::Normal(part) = component else {
            return Err("Attachment folder is invalid".to_string());
        };

        match current.symlink_metadata(part) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Attachment folder cannot contain symbolic links".to_string());
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err("Attachment folder component is not a directory".to_string());
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                if let Err(error) = current.create_dir(part) {
                    if error.kind() != io::ErrorKind::AlreadyExists {
                        return Err(error.to_string());
                    }

                    let metadata = current
                        .symlink_metadata(part)
                        .map_err(|error| error.to_string())?;
                    if metadata.file_type().is_symlink() {
                        return Err("Attachment folder cannot contain symbolic links".to_string());
                    }
                    if !metadata.is_dir() {
                        return Err("Attachment folder component is not a directory".to_string());
                    }
                }
            }
            Err(error) => return Err(error.to_string()),
        }

        current = current
            .open_dir_nofollow(part)
            .map_err(|error| error.to_string())?;
    }

    Ok(current)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileIdentity {
    device: u64,
    inode: u64,
}

fn file_identity<T: MetadataExt>(metadata: &T) -> FileIdentity {
    FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    }
}

fn nonfollowing_read_options() -> cap_std::fs::OpenOptions {
    let mut options = cap_std::fs::OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    options.custom_flags(rustix::fs::OFlags::NONBLOCK.bits() as i32);
    options
}

fn open_existing_attachment_folder(root: &Dir, folder: &Path) -> Result<Dir, String> {
    let mut current = root.try_clone().map_err(|error| error.to_string())?;
    for component in folder.components() {
        let Component::Normal(part) = component else {
            return Err("Attachment folder is invalid".to_string());
        };
        current = current
            .open_dir_nofollow(part)
            .map_err(|error| error.to_string())?;
    }
    Ok(current)
}

fn verify_directory_path_identity(
    path: &Path,
    expected: FileIdentity,
    description: &str,
) -> Result<(), String> {
    let directory = Dir::open_ambient_dir(path, cap_std::ambient_authority())
        .map_err(|error| format!("{description} changed: {error}"))?;
    let actual = file_identity(
        &directory
            .dir_metadata()
            .map_err(|error| format!("{description} changed: {error}"))?,
    );
    if actual != expected {
        return Err(format!("{description} changed during attachment import"));
    }
    Ok(())
}

fn root_identity_error_with_revocation(
    root: &Path,
    error: String,
    forbid_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> String {
    match forbid_root_assets(root) {
        Ok(()) => error,
        Err(forbid_error) => {
            format!("{error}; failed to revoke changed asset root authorization: {forbid_error}")
        }
    }
}

struct AttachmentStaging {
    directory: Dir,
    name: String,
}

fn create_attachment_staging(target_folder: &Dir) -> Result<AttachmentStaging, String> {
    for _ in 0..1000 {
        let sequence = ATTACHMENT_STAGING_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!(".markra-attachment-{}-{sequence}", std::process::id());
        match target_folder.create_dir(&name) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }

        let expected_identity = file_identity(
            &target_folder
                .symlink_metadata(&name)
                .map_err(|error| error.to_string())?,
        );
        let directory = target_folder
            .open_dir_nofollow(&name)
            .map_err(|error| error.to_string())?;
        let retained_identity = file_identity(
            &directory
                .dir_metadata()
                .map_err(|error| error.to_string())?,
        );
        if retained_identity != expected_identity {
            return Err("Attachment staging directory changed during creation".to_string());
        }

        return Ok(AttachmentStaging { directory, name });
    }

    Err("Could not create an attachment staging directory".to_string())
}

fn cleanup_staging_after_error(staging: AttachmentStaging, error: String) -> String {
    match staging.directory.remove_open_dir_all() {
        Ok(()) => error,
        Err(cleanup_error) => format!(
            "{error}; could not clean up partial attachment staging '{}': {cleanup_error}",
            staging.name
        ),
    }
}

fn rollback_published_attachment(
    target_folder: &Dir,
    target_name: &str,
    target_identity: FileIdentity,
    staging: AttachmentStaging,
) -> Result<(), String> {
    // Quarantine atomically before checking identity; check-then-unlink would recreate the race.
    match target_folder.rename(target_name, &staging.directory, QUARANTINED_ATTACHMENT_NAME) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return staging
                .directory
                .remove_open_dir_all()
                .map_err(|cleanup_error| cleanup_error.to_string());
        }
        Err(error) => {
            return Err(format!(
                "could not quarantine the published attachment: {error}; staging '{}' was retained",
                staging.name
            ));
        }
    }

    let quarantined_identity = file_identity(
        &staging
            .directory
            .symlink_metadata(QUARANTINED_ATTACHMENT_NAME)
            .map_err(|error| error.to_string())?,
    );
    if quarantined_identity != target_identity {
        if let Err(error) =
            staging
                .directory
                .hard_link(QUARANTINED_ATTACHMENT_NAME, target_folder, target_name)
        {
            return Err(format!(
                "destination replacement could not be restored: {error}; staging '{}' was retained",
                staging.name
            ));
        }
    }

    staging
        .directory
        .remove_open_dir_all()
        .map_err(|error| error.to_string())
}

fn write_unique_attachment(
    root: &Path,
    relative_folder: &Path,
    target_folder: &Dir,
    file_name: &str,
    validate_addressability: impl Fn(Option<(&str, FileIdentity)>) -> Result<(), String>,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<ClipboardAttachmentFile, String> {
    // Check the destination before allocating or streaming a staging file.
    validate_addressability(None)?;
    // Writer failures stay private until a no-clobber hard link publishes complete contents.
    let staging = create_attachment_staging(target_folder)?;
    let mut options = cap_std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    let staged_file = match staging
        .directory
        .open_with(STAGED_ATTACHMENT_NAME, &options)
    {
        Ok(file) => file,
        Err(error) => return Err(cleanup_staging_after_error(staging, error.to_string())),
    };
    let target_identity = match staged_file.metadata() {
        Ok(metadata) => file_identity(&metadata),
        Err(error) => return Err(cleanup_staging_after_error(staging, error.to_string())),
    };
    if let Err(error) = validate_addressability(None) {
        drop(staged_file);
        return Err(cleanup_staging_after_error(staging, error));
    }
    let mut target = staged_file.into_std();

    if let Err(error) = write_contents(&mut target) {
        drop(target);
        return Err(cleanup_staging_after_error(staging, error.to_string()));
    }
    drop(target);

    let target_name = match (0..1000).find_map(|attempt| {
        let target_name = match clipboard_attachment_file_name(file_name, attempt) {
            Ok(name) => name,
            Err(error) => return Some(Err(error)),
        };
        if let Err(error) = validate_addressability(None) {
            return Some(Err(error));
        }
        match staging
            .directory
            .hard_link(STAGED_ATTACHMENT_NAME, target_folder, &target_name)
        {
            Ok(()) => Some(Ok(target_name)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => None,
            Err(error) => Some(Err(error.to_string())),
        }
    }) {
        Some(Ok(name)) => name,
        Some(Err(error)) => return Err(cleanup_staging_after_error(staging, error)),
        None => {
            return Err(cleanup_staging_after_error(
                staging,
                "Could not create a unique attachment file".to_string(),
            ))
        }
    };

    if let Err(error) = validate_addressability(Some((&target_name, target_identity))) {
        return match rollback_published_attachment(
            target_folder,
            &target_name,
            target_identity,
            staging,
        ) {
            Ok(()) => Err(error),
            Err(cleanup_error) => Err(format!(
                "{error}; attachment cleanup failed: {cleanup_error}"
            )),
        };
    }

    if let Err(error) = staging.directory.remove_open_dir_all() {
        return Err(format!(
            "Attachment was published but staging cleanup failed for '{}': {error}",
            staging.name
        ));
    }

    Ok(ClipboardAttachmentFile {
        relative_path: markdown_tree_relative_path(
            root,
            &root.join(relative_folder).join(target_name),
        )?,
    })
}

#[cfg(test)]
#[cfg(test)]
#[allow(dead_code)]
fn write_attachment_file(
    document_path: String,
    folder: String,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<ClipboardAttachmentFile, String> {
    write_attachment_file_with_hook(
        document_path,
        folder,
        file_name,
        allow_root_assets,
        || Ok(()),
        write_contents,
    )
}

#[cfg(test)]
#[cfg(test)]
#[allow(dead_code)]
fn write_attachment_file_with_hook(
    document_path: String,
    folder: String,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    before_destination_open: impl FnOnce() -> Result<(), String>,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<ClipboardAttachmentFile, String> {
    write_attachment_file_with_scope_hooks_internal(
        document_path,
        folder,
        file_name,
        allow_root_assets,
        |_| Ok(()),
        || Ok(()),
        before_destination_open,
        write_contents,
    )
}

fn write_attachment_file_with_scope_hooks_internal(
    document_path: String,
    folder: String,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    forbid_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    after_root_authorization: impl FnOnce() -> Result<(), String>,
    before_destination_open: impl FnOnce() -> Result<(), String>,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<ClipboardAttachmentFile, String> {
    let document_path = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !document_path.is_file() || !is_markdown_open_file(&document_path) {
        return Err("Current document must be a saved Markdown file".to_string());
    }

    let root = document_path
        .parent()
        .ok_or_else(|| "Current document folder is invalid".to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let root_dir = Dir::open_ambient_dir(&root, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    let root_identity = file_identity(&root_dir.dir_metadata().map_err(|error| error.to_string())?);
    allow_root_assets(&root)?;
    if let Err(error) = after_root_authorization() {
        return match verify_directory_path_identity(&root, root_identity, "Attachment root") {
            Ok(()) => Err(error),
            Err(identity_error) => Err(root_identity_error_with_revocation(
                &root,
                format!("{error}; {identity_error}"),
                forbid_root_assets,
            )),
        };
    }
    let folder = normalize_clipboard_attachment_folder(&folder)?;
    // Keep this handle through creation; resolving the folder again would allow a symlink swap.
    let mut forbid_root_assets = Some(forbid_root_assets);
    if let Err(error) = verify_directory_path_identity(&root, root_identity, "Attachment root") {
        if let Some(forbid) = forbid_root_assets.take() {
            return Err(root_identity_error_with_revocation(&root, error, forbid));
        }
        return Err(error);
    }
    let target_folder = ensure_attachment_folder(&root_dir, &folder)?;
    let target_identity = file_identity(
        &target_folder
            .dir_metadata()
            .map_err(|error| error.to_string())?,
    );
    before_destination_open()?;
    let root_identity_changed = std::cell::Cell::new(false);
    let result = write_unique_attachment(
        &root,
        &folder,
        &target_folder,
        &file_name,
        |published| {
            if let Err(error) =
                verify_directory_path_identity(&root, root_identity, "Attachment root")
            {
                root_identity_changed.set(true);
                return Err(error);
            }

            let lexical_folder = open_existing_attachment_folder(&root_dir, &folder)
                .map_err(|error| format!("Attachment folder changed: {error}"))?;
            let lexical_identity = file_identity(
                &lexical_folder
                    .dir_metadata()
                    .map_err(|error| error.to_string())?,
            );
            if lexical_identity != target_identity {
                return Err("Attachment folder changed during attachment import".to_string());
            }

            if let Some((target_name, expected_identity)) = published {
                let target = lexical_folder
                    .open_with(target_name, &nonfollowing_read_options())
                    .map_err(|error| format!("Published attachment changed: {error}"))?;
                let metadata = target.metadata().map_err(|error| error.to_string())?;
                if !metadata.is_file() || file_identity(&metadata) != expected_identity {
                    return Err("Published attachment changed during attachment import".to_string());
                }
            }

            Ok(())
        },
        write_contents,
    );

    if root_identity_changed.get() {
        if let Some(forbid) = forbid_root_assets.take() {
            let error = result
                .err()
                .unwrap_or_else(|| "Attachment root changed during attachment import".to_string());
            return Err(root_identity_error_with_revocation(&root, error, forbid));
        }
    }

    result
}

#[cfg(test)]
fn write_attachment_file_with_scope_hooks(
    document_path: String,
    folder: String,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    forbid_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    after_root_authorization: impl FnOnce() -> Result<(), String>,
    before_destination_open: impl FnOnce() -> Result<(), String>,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<ClipboardAttachmentFile, String> {
    write_attachment_file_with_scope_hooks_internal(
        document_path,
        folder,
        file_name,
        allow_root_assets,
        forbid_root_assets,
        after_root_authorization,
        before_destination_open,
        write_contents,
    )
}

#[cfg(test)]
#[allow(dead_code)]
fn save_clipboard_attachment_file(
    document_path: String,
    folder: String,
    bytes: Vec<u8>,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    save_clipboard_attachment_file_with_scope(
        document_path,
        folder,
        bytes,
        file_name,
        allow_root_assets,
        |_| Ok(()),
    )
}

fn save_clipboard_attachment_file_with_scope(
    document_path: String,
    folder: String,
    bytes: Vec<u8>,
    file_name: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    forbid_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    if bytes.is_empty() {
        return Err("Clipboard attachment is empty".to_string());
    }

    write_attachment_file_with_scope_hooks_internal(
        document_path,
        folder,
        file_name,
        allow_root_assets,
        forbid_root_assets,
        || Ok(()),
        || Ok(()),
        move |target| {
            let mut contents = io::Cursor::new(bytes.as_slice());
            io::copy(&mut contents, target).map(|_| ())
        },
    )
}

#[cfg(test)]
#[allow(dead_code)]
fn import_local_file_with_scope(
    document_path: String,
    folder: String,
    source_path: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    import_local_file_with_scope_and_hook(
        document_path,
        folder,
        source_path,
        allow_root_assets,
        || Ok(()),
    )
}

#[cfg(test)]
#[allow(dead_code)]
fn import_local_file_with_scope_and_hook(
    document_path: String,
    folder: String,
    source_path: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    before_source_open: impl FnOnce() -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    import_local_file_with_asset_scope_and_hook(
        document_path,
        folder,
        source_path,
        allow_root_assets,
        |_| Ok(()),
        before_source_open,
    )
}

fn import_local_file_with_asset_scope_and_hook(
    document_path: String,
    folder: String,
    source_path: String,
    allow_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    forbid_root_assets: impl FnOnce(&Path) -> Result<(), String>,
    before_source_open: impl FnOnce() -> Result<(), String>,
) -> Result<ClipboardAttachmentFile, String> {
    let source_path = PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Local file name is invalid".to_string())?
        .to_string();
    let source_parent = source_path
        .parent()
        .ok_or_else(|| "Local file folder is invalid".to_string())?;
    let source_directory = Dir::open_ambient_dir(source_parent, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    let expected_metadata = source_directory
        .symlink_metadata(&file_name)
        .map_err(|error| error.to_string())?;
    if !expected_metadata.is_file() {
        return Err("Path is not a file".to_string());
    }
    let expected_identity = file_identity(&expected_metadata);

    before_source_open()?;
    // Nofollow plus nonblocking on Unix lets handle metadata reject symlink/FIFO substitutions.
    let source = source_directory
        .open_with(&file_name, &nonfollowing_read_options())
        .map_err(|error| error.to_string())?;
    let source_metadata = source.metadata().map_err(|error| error.to_string())?;
    if !source_metadata.is_file() {
        return Err("Path is not a file".to_string());
    }
    if file_identity(&source_metadata) != expected_identity {
        return Err("Source file changed during attachment import".to_string());
    }
    let mut source = source.into_std();

    write_attachment_file_with_scope_hooks_internal(
        document_path,
        folder,
        file_name,
        allow_root_assets,
        forbid_root_assets,
        || Ok(()),
        || Ok(()),
        |target| io::copy(&mut source, target).map(|_| ()),
    )
}

fn forbid_asset_directory(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .forbid_directory(root, true)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn save_clipboard_attachment(
    app: tauri::AppHandle,
    document_path: String,
    folder: String,
    bytes: Vec<u8>,
    file_name: String,
) -> Result<ClipboardAttachmentFile, String> {
    save_clipboard_attachment_file_with_scope(
        document_path,
        folder,
        bytes,
        file_name,
        |root| allow_asset_directory(&app, root),
        |root| forbid_asset_directory(&app, root),
    )
}

#[tauri::command]
pub(crate) async fn import_local_file(
    app: tauri::AppHandle,
    document_path: String,
    folder: String,
    source_path: String,
) -> Result<ClipboardAttachmentFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_local_file_with_asset_scope_and_hook(
            document_path,
            folder,
            source_path,
            |root| allow_asset_directory(&app, root),
            |root| forbid_asset_directory(&app, root),
            || Ok(()),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static ATTACHMENT_FIXTURE_SEQUENCE: AtomicUsize = AtomicUsize::new(0);

    struct AttachmentFixture {
        root: PathBuf,
        note: PathBuf,
    }

    impl AttachmentFixture {
        fn new() -> Self {
            let sequence = ATTACHMENT_FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "markra-attachment-test-{}-{sequence}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("system clock should be after epoch")
                    .as_nanos()
            ));
            let note = root.join("note.md");

            fs::create_dir_all(&root).expect("test folder should be created");
            fs::write(&note, "# Note").expect("markdown file should be created");

            Self { root, note }
        }
    }

    impl Drop for AttachmentFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn creates_empty_files_without_overwriting_existing_attachments() {
        let fixture = AttachmentFixture::new();
        fs::create_dir_all(fixture.root.join("assets")).expect("assets should be created");
        fs::write(fixture.root.join("assets/empty.txt"), b"existing")
            .expect("collision should be created");

        let saved = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "empty.txt".to_string(),
            |_| Ok(()),
            |_| Ok(()),
        )
        .expect("empty writer output should be saved");

        assert_eq!(saved.relative_path, "assets/empty-2.txt");
        assert_eq!(
            fs::read(fixture.root.join(saved.relative_path)).unwrap(),
            Vec::<u8>::new()
        );
        assert_eq!(
            fs::read(fixture.root.join("assets/empty.txt")).unwrap(),
            b"existing"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_attachment_folders_with_existing_parent_symlinks() {
        use std::os::unix::fs::symlink;

        let fixture = AttachmentFixture::new();
        let outside = std::env::temp_dir().join(format!(
            "markra-attachment-outside-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&outside).expect("outside directory should be created");
        symlink(&outside, fixture.root.join("assets")).expect("parent symlink should be created");

        let error = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets/files".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            |_| Ok(()),
        )
        .expect_err("parent symlink should be rejected");

        assert!(error.contains("symbolic links"));
        assert!(!outside.join("files/attachment.txt").exists());

        fs::remove_dir_all(outside).expect("outside directory should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn preserves_dangling_destination_symlinks_when_creating_unique_attachments() {
        use std::os::unix::fs::symlink;

        let fixture = AttachmentFixture::new();
        let assets = fixture.root.join("assets");
        fs::create_dir_all(&assets).expect("assets should be created");
        let dangling_target = fixture.root.join("missing.txt");
        symlink(&dangling_target, assets.join("attachment.txt"))
            .expect("dangling destination symlink should be created");

        let saved = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            |target| std::io::Write::write_all(target, b"new"),
        )
        .expect("writer should use a unique destination");

        assert_eq!(saved.relative_path, "assets/attachment-2.txt");
        assert!(fs::symlink_metadata(assets.join("attachment.txt"))
            .expect("destination symlink should remain")
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(assets.join("attachment-2.txt")).unwrap(), b"new");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_root_replacement_during_asset_authorization() {
        use std::cell::Cell;
        use std::os::unix::fs::symlink;

        let fixture = AttachmentFixture::new();
        let outside_fixture = AttachmentFixture::new();
        let original_root = fixture.root.clone();
        let retained_root = fixture.root.with_extension("retained");
        let authorized = Cell::new(false);

        let result = write_attachment_file_with_scope_hooks(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| {
                authorized.set(true);
                Ok(())
            },
            |_| {
                authorized.set(false);
                Ok(())
            },
            || {
                fs::rename(&original_root, &retained_root).map_err(|error| error.to_string())?;
                symlink(&outside_fixture.root, &original_root)
                    .map_err(|error| error.to_string())?;
                Ok(())
            },
            || Ok(()),
            |target| std::io::Write::write_all(target, b"new"),
        );

        fs::remove_file(&original_root).expect("replacement root symlink should be removed");
        fs::rename(&retained_root, &original_root).expect("original root should be restored");

        let error = result.expect_err("a replaced root must not redirect the attachment write");
        assert!(error.contains("changed"));
        assert!(
            !authorized.get(),
            "swapped root authorization should be revoked"
        );
        assert!(!outside_fixture.root.join("assets/attachment.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_root_replacement_before_streaming_attachment_contents() {
        use std::cell::Cell;
        use std::os::unix::fs::symlink;

        let fixture = AttachmentFixture::new();
        let outside_fixture = AttachmentFixture::new();
        let original_root = fixture.root.clone();
        let retained_root = fixture.root.with_extension("retained");
        let authorized = Cell::new(false);
        let writer_called = Cell::new(false);

        let result = write_attachment_file_with_scope_hooks(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| {
                authorized.set(true);
                Ok(())
            },
            |_| {
                authorized.set(false);
                Ok(())
            },
            || Ok(()),
            || {
                fs::rename(&original_root, &retained_root).map_err(|error| error.to_string())?;
                symlink(&outside_fixture.root, &original_root).map_err(|error| error.to_string())
            },
            |target| {
                writer_called.set(true);
                std::io::Write::write_all(target, b"new")
            },
        );

        fs::remove_file(&original_root).expect("replacement root symlink should be removed");
        fs::rename(&retained_root, &original_root).expect("original root should be restored");

        let error = result.expect_err("a replaced root must be rejected before streaming");
        assert!(error.contains("changed"));
        assert!(
            !authorized.get(),
            "swapped root authorization should be revoked"
        );
        assert!(
            !writer_called.get(),
            "contents must not stream after root replacement"
        );
        assert!(!outside_fixture.root.join("assets/attachment.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn keeps_destination_writes_bound_to_verified_attachment_directory() {
        use std::os::unix::fs::symlink;

        let fixture = AttachmentFixture::new();
        let outside_fixture = AttachmentFixture::new();
        let outside = outside_fixture.root.join("outside");
        fs::create_dir_all(&outside).expect("outside directory should be created");
        let target_folder = fixture.root.join("assets");
        let retained_folder = fixture.root.join("retained-assets");

        let error = write_attachment_file_with_hook(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            || {
                fs::rename(&target_folder, &retained_folder).map_err(|error| error.to_string())?;
                symlink(&outside, &target_folder).map_err(|error| error.to_string())?;
                Ok(())
            },
            |target| std::io::Write::write_all(target, b"new"),
        )
        .expect_err("a replaced attachment folder must not return a broken link");

        assert!(error.contains("changed"));
        assert!(!outside.join("attachment.txt").exists());
        assert!(!retained_folder.join("attachment.txt").exists());
    }

    #[test]
    fn removes_new_attachment_when_writer_returns_an_error() {
        let fixture = AttachmentFixture::new();

        let error = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            |_| Err(io::Error::other("stream failed")),
        )
        .expect_err("writer failure should be returned");

        assert!(error.contains("stream failed"));
        assert!(!fixture.root.join("assets/attachment.txt").exists());
    }

    #[test]
    fn preserves_replacement_attachment_when_writer_returns_an_error() {
        let fixture = AttachmentFixture::new();
        let target_path = fixture.root.join("assets/attachment.txt");

        let error = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            |target| {
                std::io::Write::write_all(target, b"partial")?;
                if let Err(error) = fs::remove_file(&target_path) {
                    if error.kind() != io::ErrorKind::NotFound {
                        return Err(error);
                    }
                }
                fs::write(&target_path, b"replacement")?;
                Err(io::Error::other("stream failed"))
            },
        )
        .expect_err("writer failure should be returned");

        assert!(error.contains("stream failed"));
        assert_eq!(
            fs::read(target_path).expect("replacement attachment should remain"),
            b"replacement"
        );
    }

    #[cfg(unix)]
    #[test]
    fn reports_cleanup_failure_after_a_writer_error() {
        use std::os::unix::fs::PermissionsExt;

        let fixture = AttachmentFixture::new();
        let assets = fixture.root.join("assets");

        let error = write_attachment_file(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            "attachment.txt".to_string(),
            |_| Ok(()),
            |target| {
                std::io::Write::write_all(target, b"partial")?;
                fs::set_permissions(&assets, fs::Permissions::from_mode(0o500))?;
                Err(io::Error::other("stream failed"))
            },
        )
        .expect_err("writer failure should be returned");

        fs::set_permissions(&assets, fs::Permissions::from_mode(0o700))
            .expect("test folder permissions should be restored");

        assert!(error.contains("stream failed"));
        assert!(error.contains("clean"));
        assert!(!assets.join("attachment.txt").exists());
    }

    #[test]
    fn saves_clipboard_attachments_below_the_current_markdown_file_directory() {
        let root = std::env::temp_dir().join(format!(
            "markra-clipboard-attachment-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "# Note").expect("markdown file should be created");

        let saved = save_clipboard_attachment_file(
            note.to_string_lossy().to_string(),
            "assets/files".to_string(),
            vec![4, 5, 6],
            "Reference Doc.docx".to_string(),
            |_| Ok(()),
        )
        .expect("clipboard attachment should be saved");

        assert_eq!(saved.relative_path, "assets/files/Reference Doc.docx");
        assert_eq!(
            fs::read(root.join(saved.relative_path)).expect("saved attachment should be readable"),
            vec![4, 5, 6]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn creates_unique_clipboard_attachment_file_names() {
        assert_eq!(
            clipboard_attachment_file_name("Reference Doc.docx", 0)
                .expect("initial name should be valid"),
            "Reference Doc.docx"
        );
        assert_eq!(
            clipboard_attachment_file_name("Reference Doc.docx", 1)
                .expect("second name should be valid"),
            "Reference Doc-2.docx"
        );
    }

    #[test]
    fn imports_local_files_by_path() {
        let fixture = AttachmentFixture::new();
        let source_fixture = AttachmentFixture::new();
        let source = source_fixture.root.join("Reference Doc.pdf");
        fs::write(&source, [4, 5, 6]).expect("source attachment should be created");

        let imported = import_local_file_with_scope(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            source.to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .expect("source attachment should be imported");

        assert_eq!(imported.relative_path, "assets/Reference Doc.pdf");
        assert_eq!(
            fs::read(fixture.root.join(imported.relative_path))
                .expect("imported attachment should be readable"),
            [4, 5, 6]
        );

        let empty_source = source_fixture.root.join("empty.txt");
        fs::write(&empty_source, []).expect("empty source attachment should be created");

        let imported_empty = import_local_file_with_scope(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            empty_source.to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .expect("empty source attachment should be imported");

        assert_eq!(imported_empty.relative_path, "assets/empty.txt");
        assert_eq!(
            fs::read(fixture.root.join(imported_empty.relative_path))
                .expect("imported empty attachment should be readable"),
            Vec::<u8>::new()
        );

        let existing_source = fixture.root.join("assets/Reference Doc.pdf");
        fs::write(&existing_source, [7, 8, 9])
            .expect("existing source attachment should be created");

        let imported_collision = import_local_file_with_scope(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            existing_source.to_string_lossy().to_string(),
            |_| Ok(()),
        )
        .expect("same-name source attachment should be imported uniquely");

        assert_eq!(
            imported_collision.relative_path,
            "assets/Reference Doc-2.pdf"
        );
        assert_eq!(
            fs::read(&existing_source).expect("source attachment should remain readable"),
            [7, 8, 9]
        );
        assert_eq!(
            fs::read(fixture.root.join(imported_collision.relative_path))
                .expect("collision attachment should be readable"),
            [7, 8, 9]
        );
    }

    #[test]
    fn local_file_import_command_is_async() {
        fn assert_async_command<F, FutureResult>(_command: F)
        where
            F: Fn(tauri::AppHandle, String, String, String) -> FutureResult,
            FutureResult: std::future::Future<Output = Result<ClipboardAttachmentFile, String>>,
        {
        }

        assert_async_command(import_local_file);
    }

    #[test]
    fn rejects_a_source_file_replaced_before_open() {
        let fixture = AttachmentFixture::new();
        let source_fixture = AttachmentFixture::new();
        let source = source_fixture.root.join("Reference.txt");
        let retained_source = source_fixture.root.join("retained.txt");
        fs::write(&source, b"selected").expect("source attachment should be created");

        let error = import_local_file_with_scope_and_hook(
            fixture.note.to_string_lossy().to_string(),
            "assets".to_string(),
            source.to_string_lossy().to_string(),
            |_| Ok(()),
            || {
                fs::rename(&source, &retained_source).map_err(|error| error.to_string())?;
                fs::write(&source, b"replacement").map_err(|error| error.to_string())
            },
        )
        .expect_err("a replacement source must not be imported");

        assert!(error.contains("changed"));
        assert!(!fixture.root.join("assets/Reference.txt").exists());
        assert_eq!(fs::read(retained_source).unwrap(), b"selected");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_fifo_replaced_before_source_open_without_blocking() {
        use std::sync::mpsc;
        use std::time::Duration;

        let fixture = AttachmentFixture::new();
        let source_fixture = AttachmentFixture::new();
        let source = source_fixture.root.join("Reference.txt");
        fs::write(&source, b"selected").expect("source attachment should be created");

        let note = fixture.note.to_string_lossy().to_string();
        let source_path = source.to_string_lossy().to_string();
        let thread_source = source.clone();
        let (result_sender, result_receiver) = mpsc::channel();
        let import_thread = std::thread::spawn(move || {
            let result = import_local_file_with_scope_and_hook(
                note,
                "assets".to_string(),
                source_path,
                |_| Ok(()),
                || {
                    fs::remove_file(&thread_source).map_err(|error| error.to_string())?;
                    let status = std::process::Command::new("mkfifo")
                        .arg(&thread_source)
                        .status()
                        .map_err(|error| error.to_string())?;
                    if !status.success() {
                        return Err("mkfifo failed".to_string());
                    }
                    Ok(())
                },
            );
            result_sender
                .send(result)
                .expect("test receiver should remain");
        });

        let result = match result_receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let writer = fs::OpenOptions::new()
                    .write(true)
                    .open(&source)
                    .expect("FIFO writer should release the blocked source open");
                drop(writer);
                let _ = result_receiver.recv_timeout(Duration::from_secs(1));
                import_thread.join().expect("import thread should finish");
                panic!("source open blocked on a FIFO replacement");
            }
            Err(error) => panic!("source import channel failed: {error}"),
        };

        import_thread.join().expect("import thread should finish");
        let error = result.expect_err("a FIFO source must be rejected");
        assert!(error.contains("file"));
        assert!(!fixture.root.join("assets/Reference.txt").exists());
    }
}
