use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE, ETAG, IF_NONE_MATCH, LAST_MODIFIED};
use reqwest::{Client, Method, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

use crate::network::{apply_network_settings, NetworkSettings};

const REMOTE_SYNC_TIMEOUT_SECS: u64 = 60;
const SYNC_METADATA_DIR: &str = ".markra-sync";
const WEBDAV_MANIFEST_FILE: &str = "webdav-manifest.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebDavSyncRequest {
    network: Option<NetworkSettings>,
    password: String,
    remote_path: String,
    server_url: String,
    source_path: String,
    username: String,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebDavSyncSummary {
    bytes_downloaded: u64,
    bytes_uploaded: u64,
    conflict_files: u64,
    downloaded_files: u64,
    scanned_files: u64,
    skipped_files: u64,
    uploaded_files: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
struct SyncManifestEntry {
    local_hash: String,
    remote_etag: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct SyncManifest {
    entries: BTreeMap<String, SyncManifestEntry>,
}

#[derive(Debug)]
struct LocalSyncFile {
    hash: String,
    path: PathBuf,
    size: u64,
}

#[derive(Clone, Debug)]
struct RemoteSyncFile {
    identity: String,
    size: u64,
}

#[derive(Debug, Default)]
struct WebDavPropResponse {
    content_length: Option<u64>,
    etag: Option<String>,
    href: String,
    is_collection: bool,
    last_modified: Option<String>,
}

#[derive(Debug)]
struct WebDavCollectionTarget {
    relative_path: String,
    url: Url,
}

#[derive(Debug, PartialEq, Eq)]
enum WebDavFileSyncAction {
    Conflict,
    DeleteLocal,
    DeleteRemote,
    Download,
    Skip,
    Upload,
}

#[tauri::command]
pub(crate) async fn sync_webdav_markdown_folder(
    request: WebDavSyncRequest,
) -> Result<WebDavSyncSummary, String> {
    execute_webdav_sync(request).await
}

async fn execute_webdav_sync(request: WebDavSyncRequest) -> Result<WebDavSyncSummary, String> {
    let source_root = sync_source_root(&PathBuf::from(&request.source_path))?;
    let root_url = webdav_sync_root_url(&request.server_url, &request.remote_path)?;
    let client = remote_sync_http_client(request.network.as_ref())?;

    ensure_webdav_root_collections(&client, &request).await?;

    let local_files = collect_local_sync_files(&source_root)?;
    let remote_files = list_webdav_remote_files(&client, &request, &root_url).await?;
    let mut manifest = load_sync_manifest(&source_root)?;
    let mut summary = WebDavSyncSummary::default();
    let timestamp = sync_timestamp();
    let paths = local_files
        .keys()
        .chain(remote_files.keys())
        .cloned()
        .collect::<BTreeSet<_>>();

    for relative_path in paths {
        let local_file = local_files.get(&relative_path);
        let remote_file = remote_files.get(&relative_path);
        summary.scanned_files += 1;

        let action = plan_webdav_file_sync(
            local_file.map(|file| file.hash.as_str()),
            remote_file.map(|file| file.identity.as_str()),
            manifest.entries.get(&relative_path),
        );

        match action {
            WebDavFileSyncAction::Upload => {
                let local = local_file
                    .ok_or_else(|| sync_file_missing_error("Local", "upload", &relative_path))?;
                let remote_identity = upload_webdav_file(
                    &client,
                    &request,
                    &root_url,
                    &relative_path,
                    local,
                    remote_file.map(|file| file.identity.as_str()),
                )
                .await?;
                summary.uploaded_files += 1;
                summary.bytes_uploaded += local.size;
                manifest.entries.insert(
                    relative_path,
                    SyncManifestEntry {
                        local_hash: local.hash.clone(),
                        remote_etag: remote_identity,
                    },
                );
            }
            WebDavFileSyncAction::Download => {
                let remote = remote_file
                    .ok_or_else(|| sync_file_missing_error("Remote", "download", &relative_path))?;
                let hash = download_webdav_file(
                    &client,
                    &request,
                    &root_url,
                    &relative_path,
                    &source_root.join(path_from_relative(&relative_path)),
                    local_file.map(|file| file.hash.as_str()),
                    &remote.identity,
                )
                .await?;
                summary.downloaded_files += 1;
                summary.bytes_downloaded += remote.size;
                manifest.entries.insert(
                    relative_path,
                    SyncManifestEntry {
                        local_hash: hash,
                        remote_etag: remote.identity.clone(),
                    },
                );
            }
            WebDavFileSyncAction::DeleteLocal => {
                let local = local_file
                    .ok_or_else(|| sync_file_missing_error("Local", "delete", &relative_path))?;
                delete_local_sync_file(&local.path, &local.hash, &relative_path)?;
                manifest.entries.remove(&relative_path);
            }
            WebDavFileSyncAction::DeleteRemote => {
                let remote = remote_file
                    .ok_or_else(|| sync_file_missing_error("Remote", "delete", &relative_path))?;
                delete_webdav_file(
                    &client,
                    &request,
                    &root_url,
                    &relative_path,
                    &remote.identity,
                )
                .await?;
                manifest.entries.remove(&relative_path);
            }
            WebDavFileSyncAction::Skip => {
                let local = local_file
                    .ok_or_else(|| sync_file_missing_error("Local", "skip", &relative_path))?;
                let remote = remote_file
                    .ok_or_else(|| sync_file_missing_error("Remote", "skip", &relative_path))?;
                summary.skipped_files += 1;
                manifest.entries.insert(
                    relative_path,
                    SyncManifestEntry {
                        local_hash: local.hash.clone(),
                        remote_etag: remote.identity.clone(),
                    },
                );
            }
            WebDavFileSyncAction::Conflict => {
                let local = local_file
                    .ok_or_else(|| sync_file_missing_error("Local", "conflict", &relative_path))?;
                let remote = remote_file
                    .ok_or_else(|| sync_file_missing_error("Remote", "conflict", &relative_path))?;
                let conflict_path = local.path.with_file_name(remote_conflict_file_name(
                    local
                        .path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .ok_or_else(|| {
                            format!(
                                "Local sync file name is invalid: {}",
                                webdav_diagnostic_relative_path(&relative_path)
                            )
                        })?,
                    &timestamp,
                ));
                download_webdav_file(
                    &client,
                    &request,
                    &root_url,
                    &relative_path,
                    &unique_conflict_path(conflict_path),
                    None,
                    &remote.identity,
                )
                .await?;
                summary.conflict_files += 1;
                summary.bytes_downloaded += remote.size;
                record_webdav_conflict_manifest(
                    &mut manifest,
                    relative_path,
                    &local.hash,
                    &remote.identity,
                );
            }
        }
    }

    manifest
        .entries
        .retain(|path, _| local_files.contains_key(path) || remote_files.contains_key(path));
    save_sync_manifest(&source_root, &manifest)?;

    Ok(summary)
}

fn remote_sync_http_client(network: Option<&NetworkSettings>) -> Result<Client, String> {
    apply_network_settings(
        Client::builder().timeout(Duration::from_secs(REMOTE_SYNC_TIMEOUT_SECS)),
        network,
    )?
    .build()
    .map_err(|error| error.to_string())
}

fn sync_source_root(path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;

    if canonical_path.is_dir() {
        return Ok(canonical_path);
    }

    if canonical_path.is_file() {
        return canonical_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Sync source file parent is invalid".to_string());
    }

    Err("Sync source must be a file or folder".to_string())
}

fn webdav_sync_root_url(server_url: &str, remote_path: &str) -> Result<Url, String> {
    let segments = normalize_remote_path_segments(remote_path)?;
    let mut url = validated_webdav_base_url(server_url)?;
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "WebDAV sync URL cannot be used as a base URL".to_string())?;

        for segment in segments {
            path_segments.push(&segment);
        }
        path_segments.push("");
    }

    Ok(url)
}

fn validated_webdav_base_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("WebDAV sync URL is required".to_string());
    }

    let mut url = Url::parse(trimmed).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS WebDAV sync URLs are supported".to_string());
    }

    url.set_query(None);
    url.set_fragment(None);
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);

    Ok(url)
}

fn normalize_remote_path_segments(remote_path: &str) -> Result<Vec<String>, String> {
    let normalized = remote_path.trim().replace('\\', "/");
    let normalized = normalized.trim_matches('/');
    if normalized.is_empty() || normalized == "." {
        return Err("Remote sync path cannot be the WebDAV root".to_string());
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err("Remote sync path cannot contain parent directory segments".to_string());
        }

        segments.push(segment.to_string());
    }

    Ok(segments)
}

fn path_from_relative(relative_path: &str) -> PathBuf {
    relative_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn relative_path_from_local(source_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(source_root)
        .map_err(|_| "Sync file is outside the source folder".to_string())?;
    let mut segments = Vec::new();

    for component in relative.components() {
        let segment = component
            .as_os_str()
            .to_str()
            .ok_or_else(|| "Sync file path is invalid Unicode".to_string())?;
        segments.push(segment.to_string());
    }

    Ok(segments.join("/"))
}

fn collect_local_sync_files(source_root: &Path) -> Result<BTreeMap<String, LocalSyncFile>, String> {
    let mut files = BTreeMap::new();
    collect_local_sync_files_in(source_root, source_root, &mut files)?;

    Ok(files)
}

fn collect_local_sync_files_in(
    source_root: &Path,
    directory: &Path,
    files: &mut BTreeMap<String, LocalSyncFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if !is_ignored_sync_directory(&path) {
                collect_local_sync_files_in(source_root, &path, files)?;
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let relative_path = relative_path_from_local(source_root, &path)?;
        files.insert(
            relative_path,
            LocalSyncFile {
                hash: sha256_hex(&bytes),
                path,
                size: bytes.len() as u64,
            },
        );
    }

    Ok(())
}

fn is_ignored_sync_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            matches!(
                name,
                ".git" | SYNC_METADATA_DIR | "build" | "dist" | "node_modules" | "target"
            )
        })
}

async fn ensure_webdav_root_collections(
    client: &Client,
    request: &WebDavSyncRequest,
) -> Result<(), String> {
    for target in webdav_collection_targets(&request.server_url, &request.remote_path)? {
        let response = apply_basic_auth(
            client.request(webdav_mkcol_method()?, target.url),
            &request.username,
            &request.password,
        )
        .send()
        .await
        .map_err(|error| {
            webdav_request_error("folder creation", "MKCOL", &target.relative_path, error)
        })?;

        if !(response.status().is_success() || response.status().as_u16() == 405) {
            return Err(webdav_status_error(
                "folder creation",
                "MKCOL",
                &target.relative_path,
                response.status().as_u16(),
            ));
        }
    }

    Ok(())
}

fn webdav_collection_targets(
    server_url: &str,
    remote_path: &str,
) -> Result<Vec<WebDavCollectionTarget>, String> {
    let segments = normalize_remote_path_segments(remote_path)?;
    let mut targets = Vec::with_capacity(segments.len());

    for index in 0..segments.len() {
        targets.push(WebDavCollectionTarget {
            relative_path: segments[..=index].join("/"),
            url: webdav_url_with_segments(server_url, &segments[..=index], true)?,
        });
    }

    Ok(targets)
}

fn webdav_url_with_segments(
    server_url: &str,
    upload_segments: &[String],
    trailing_slash: bool,
) -> Result<Url, String> {
    let mut url = validated_webdav_base_url(server_url)?;
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "WebDAV sync URL cannot be used as a base URL".to_string())?;

        for segment in upload_segments {
            path_segments.push(segment);
        }
        if trailing_slash {
            path_segments.push("");
        }
    }

    Ok(url)
}

async fn list_webdav_remote_files(
    client: &Client,
    request: &WebDavSyncRequest,
    root_url: &Url,
) -> Result<BTreeMap<String, RemoteSyncFile>, String> {
    let mut files = BTreeMap::new();
    let mut directories = vec![(root_url.clone(), String::new())];

    while let Some((directory_url, directory_path)) = directories.pop() {
        let responses =
            propfind_webdav_directory(client, request, &directory_url, &directory_path).await?;

        for response in responses {
            if response.href.trim().is_empty() {
                continue;
            }
            let Some(relative_path) =
                remote_relative_path(root_url, &response.href).map_err(|error| {
                    webdav_request_error("listing", "PROPFIND depth=1", &directory_path, error)
                })?
            else {
                continue;
            };
            if should_skip_webdav_listing_path(&relative_path, &directory_path) {
                continue;
            }
            if relative_path
                .split('/')
                .any(|segment| matches!(segment, ".git" | SYNC_METADATA_DIR))
            {
                continue;
            }

            if response.is_collection {
                directories.push((
                    webdav_child_url(root_url, &relative_path, true).map_err(|error| {
                        webdav_request_error("listing", "PROPFIND depth=1", &relative_path, error)
                    })?,
                    relative_path.clone(),
                ));
            } else {
                let size = response.content_length.unwrap_or(0);
                files.insert(
                    relative_path,
                    RemoteSyncFile {
                        identity: remote_identity(
                            response.etag.as_deref(),
                            response.last_modified.as_deref(),
                            size,
                        ),
                        size,
                    },
                );
            }
        }
    }

    Ok(files)
}

fn should_skip_webdav_listing_path(relative_path: &str, directory_path: &str) -> bool {
    relative_path.is_empty() || relative_path == directory_path
}

async fn propfind_webdav_directory(
    client: &Client,
    request: &WebDavSyncRequest,
    directory_url: &Url,
    relative_path: &str,
) -> Result<Vec<WebDavPropResponse>, String> {
    let response = apply_basic_auth(
        client
            .request(webdav_propfind_method()?, directory_url.clone())
            .header("Depth", "1")
            .header(CONTENT_TYPE, "application/xml; charset=utf-8")
            .body(
                r#"<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype />
    <getetag />
    <getcontentlength />
    <getlastmodified />
  </prop>
</propfind>"#,
            ),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| webdav_request_error("listing", "PROPFIND depth=1", relative_path, error))?;

    if !(response.status().is_success() || response.status().as_u16() == 207) {
        return Err(webdav_status_error(
            "listing",
            "PROPFIND depth=1",
            relative_path,
            response.status().as_u16(),
        ));
    }

    let body = response.text().await.map_err(|error| {
        webdav_request_error("listing", "PROPFIND depth=1", relative_path, error)
    })?;

    parse_webdav_propfind_response(&body)
        .map_err(|error| webdav_request_error("listing", "PROPFIND depth=1", relative_path, error))
}

fn parse_webdav_propfind_response(body: &str) -> Result<Vec<WebDavPropResponse>, String> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);
    let mut responses = Vec::new();
    let mut current: Option<WebDavPropResponse> = None;
    let mut current_field: Option<String> = None;

    loop {
        match reader.read_event().map_err(|error| error.to_string())? {
            Event::Start(element) => {
                let name = xml_local_name(element.local_name().as_ref());
                match name.as_str() {
                    "response" => current = Some(WebDavPropResponse::default()),
                    "href" | "getetag" | "getcontentlength" | "getlastmodified" => {
                        current_field = Some(name)
                    }
                    "collection" => {
                        if let Some(response) = current.as_mut() {
                            response.is_collection = true;
                        }
                    }
                    _ => {}
                }
            }
            Event::Empty(element) => {
                if xml_local_name(element.local_name().as_ref()) == "collection" {
                    if let Some(response) = current.as_mut() {
                        response.is_collection = true;
                    }
                }
            }
            Event::Text(text) => {
                if let (Some(response), Some(field)) = (current.as_mut(), current_field.as_deref())
                {
                    let value = text
                        .decode()
                        .map_err(|error| error.to_string())?
                        .into_owned();
                    match field {
                        "href" => response.href = value,
                        "getetag" => response.etag = Some(value),
                        "getcontentlength" => response.content_length = value.parse::<u64>().ok(),
                        "getlastmodified" => response.last_modified = Some(value),
                        _ => {}
                    }
                }
            }
            Event::End(element) => {
                let name = xml_local_name(element.local_name().as_ref());
                if name == "response" {
                    if let Some(response) = current.take() {
                        responses.push(response);
                    }
                }
                if current_field.as_deref() == Some(name.as_str()) {
                    current_field = None;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }

    Ok(responses)
}

fn xml_local_name(name: &[u8]) -> String {
    String::from_utf8_lossy(name).into_owned()
}

fn remote_relative_path(root_url: &Url, href: &str) -> Result<Option<String>, String> {
    let href_url = match Url::parse(href) {
        Ok(url) => url,
        Err(_) => root_url.join(href).map_err(|error| error.to_string())?,
    };
    if href_url.scheme() != root_url.scheme() || href_url.host_str() != root_url.host_str() {
        return Ok(None);
    }

    let root_path = root_url.path().trim_end_matches('/');
    let href_path = href_url.path();
    if href_path.trim_end_matches('/') == root_path {
        return Ok(Some(String::new()));
    }

    let prefix = if root_path.is_empty() {
        "/".to_string()
    } else {
        format!("{root_path}/")
    };
    let Some(relative_path) = href_path.strip_prefix(&prefix) else {
        return Ok(None);
    };

    Ok(Some(percent_decode_path(relative_path)?))
}

fn percent_decode_path(path: &str) -> Result<String, String> {
    let mut decoded_segments = Vec::new();

    for segment in path.split('/') {
        let decoded_segment = percent_decode_segment(segment);
        if decoded_segment.is_empty() || decoded_segment == "." {
            continue;
        }
        if decoded_segment == ".."
            || decoded_segment.contains('/')
            || decoded_segment.contains('\\')
        {
            return Err(
                "Remote sync path cannot contain parent directory segments or encoded path separators"
                    .to_string(),
            );
        }

        decoded_segments.push(decoded_segment);
    }

    Ok(decoded_segments.join("/"))
}

fn percent_decode_segment(segment: &str) -> String {
    let bytes = segment.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&segment[index + 1..index + 3], 16) {
                output.push(hex);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).into_owned()
}

fn webdav_child_url(
    root_url: &Url,
    relative_path: &str,
    trailing_slash: bool,
) -> Result<Url, String> {
    let mut url = root_url.clone();
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "WebDAV sync URL cannot be used as a base URL".to_string())?;
        // The sync root ends with `/`; remove its empty segment so appending does not create `//`.
        path_segments.pop_if_empty();
        for segment in relative_path
            .split('/')
            .filter(|segment| !segment.is_empty())
        {
            path_segments.push(segment);
        }
        if trailing_slash {
            path_segments.push("");
        }
    }

    Ok(url)
}

async fn ensure_webdav_parent_collections(
    client: &Client,
    request: &WebDavSyncRequest,
    root_url: &Url,
    relative_path: &str,
) -> Result<(), String> {
    let mut parent_segments = relative_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    parent_segments.pop();

    for index in 0..parent_segments.len() {
        let collection_path = parent_segments[..=index].join("/");
        let collection_url =
            webdav_child_url(root_url, &collection_path, true).map_err(|error| {
                webdav_request_error("folder creation", "MKCOL", &collection_path, error)
            })?;
        let response = apply_basic_auth(
            client.request(webdav_mkcol_method()?, collection_url),
            &request.username,
            &request.password,
        )
        .send()
        .await
        .map_err(|error| {
            webdav_request_error("folder creation", "MKCOL", &collection_path, error)
        })?;

        if !(response.status().is_success() || response.status().as_u16() == 405) {
            return Err(webdav_status_error(
                "folder creation",
                "MKCOL",
                &collection_path,
                response.status().as_u16(),
            ));
        }
    }

    Ok(())
}

async fn upload_webdav_file(
    client: &Client,
    request: &WebDavSyncRequest,
    root_url: &Url,
    relative_path: &str,
    local_file: &LocalSyncFile,
    expected_remote_identity: Option<&str>,
) -> Result<String, String> {
    ensure_webdav_parent_collections(client, request, root_url, relative_path).await?;
    let file_url = webdav_child_url(root_url, relative_path, false)
        .map_err(|error| webdav_request_error("upload", "PUT", relative_path, error))?;
    let bytes = fs::read(&local_file.path)
        .map_err(|error| local_sync_file_error("read", relative_path, error))?;
    if sha256_hex(&bytes) != local_file.hash {
        return Err(sync_file_changed_error("Local", relative_path));
    }
    ensure_remote_sync_identity(
        client,
        request,
        relative_path,
        &file_url,
        expected_remote_identity,
    )
    .await?;
    let response = apply_basic_auth(
        apply_webdav_remote_precondition(
            client
                .put(file_url.clone())
                .header(CONTENT_TYPE, "application/octet-stream")
                .body(bytes),
            expected_remote_identity,
        ),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| webdav_request_error("upload", "PUT", relative_path, error))?;

    if !response.status().is_success() {
        return Err(webdav_status_error(
            "upload",
            "PUT",
            relative_path,
            response.status().as_u16(),
        ));
    }

    let headers = response.headers();
    if let Some(etag) = headers
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(remote_identity(Some(etag), None, local_file.size));
    }

    webdav_file_identity(client, request, relative_path, &file_url, local_file.size)
        .await
        .or_else(|_| Ok(format!("sha256:{}", local_file.hash)))
}

async fn delete_webdav_file(
    client: &Client,
    request: &WebDavSyncRequest,
    root_url: &Url,
    relative_path: &str,
    expected_remote_identity: &str,
) -> Result<(), String> {
    let file_url = webdav_child_url(root_url, relative_path, false)
        .map_err(|error| webdav_request_error("delete", "DELETE", relative_path, error))?;
    ensure_remote_sync_identity(
        client,
        request,
        relative_path,
        &file_url,
        Some(expected_remote_identity),
    )
    .await?;
    let response = apply_basic_auth(
        client.request(webdav_delete_method()?, file_url),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| webdav_request_error("delete", "DELETE", relative_path, error))?;

    if response.status().is_success() || response.status().as_u16() == 404 {
        return Ok(());
    }

    Err(webdav_status_error(
        "delete",
        "DELETE",
        relative_path,
        response.status().as_u16(),
    ))
}

async fn webdav_file_identity(
    client: &Client,
    request: &WebDavSyncRequest,
    relative_path: &str,
    file_url: &Url,
    fallback_size: u64,
) -> Result<String, String> {
    let response = apply_basic_auth(
        client.head(file_url.clone()),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| webdav_request_error("metadata", "HEAD", relative_path, error))?;

    if !response.status().is_success() {
        return Err(webdav_status_error(
            "metadata",
            "HEAD",
            relative_path,
            response.status().as_u16(),
        ));
    }

    Ok(remote_identity(
        response
            .headers()
            .get(ETAG)
            .and_then(|value| value.to_str().ok()),
        response
            .headers()
            .get(LAST_MODIFIED)
            .and_then(|value| value.to_str().ok()),
        response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(fallback_size),
    ))
}

async fn webdav_file_identity_optional(
    client: &Client,
    request: &WebDavSyncRequest,
    relative_path: &str,
    file_url: &Url,
) -> Result<Option<String>, String> {
    let response = apply_basic_auth(
        client
            .request(webdav_propfind_method()?, file_url.clone())
            .header("Depth", "0")
            .header(CONTENT_TYPE, "application/xml; charset=utf-8")
            .body(
                r#"<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype />
    <getetag />
    <getcontentlength />
    <getlastmodified />
  </prop>
</propfind>"#,
            ),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| webdav_request_error("metadata", "PROPFIND depth=0", relative_path, error))?;

    if response.status().as_u16() == 404 {
        return Ok(None);
    }

    if !(response.status().is_success() || response.status().as_u16() == 207) {
        return Err(webdav_status_error(
            "metadata",
            "PROPFIND depth=0",
            relative_path,
            response.status().as_u16(),
        ));
    }

    let body = response.text().await.map_err(|error| {
        webdav_request_error("metadata", "PROPFIND depth=0", relative_path, error)
    })?;
    let responses = parse_webdav_propfind_response(&body).map_err(|error| {
        webdav_request_error("metadata", "PROPFIND depth=0", relative_path, error)
    })?;
    let Some(response) = responses
        .into_iter()
        .find(|response| !response.is_collection)
    else {
        return Ok(None);
    };

    Ok(Some(remote_identity(
        response.etag.as_deref(),
        response.last_modified.as_deref(),
        response.content_length.unwrap_or(0),
    )))
}

async fn ensure_remote_sync_identity(
    client: &Client,
    request: &WebDavSyncRequest,
    relative_path: &str,
    file_url: &Url,
    expected_identity: Option<&str>,
) -> Result<(), String> {
    let actual_identity =
        webdav_file_identity_optional(client, request, relative_path, file_url).await?;
    if same_optional_remote_identity(actual_identity.as_deref(), expected_identity) {
        return Ok(());
    }

    Err(sync_file_changed_error("Remote", relative_path))
}

async fn download_webdav_file(
    client: &Client,
    request: &WebDavSyncRequest,
    root_url: &Url,
    relative_path: &str,
    target_path: &Path,
    expected_local_hash: Option<&str>,
    expected_remote_identity: &str,
) -> Result<String, String> {
    let file_url = webdav_child_url(root_url, relative_path, false)
        .map_err(|error| webdav_request_error("download", "GET", relative_path, error))?;
    ensure_remote_sync_identity(
        client,
        request,
        relative_path,
        &file_url,
        Some(expected_remote_identity),
    )
    .await?;
    let response = apply_basic_auth(client.get(file_url), &request.username, &request.password)
        .send()
        .await
        .map_err(|error| webdav_request_error("download", "GET", relative_path, error))?;

    if !response.status().is_success() {
        return Err(webdav_status_error(
            "download",
            "GET",
            relative_path,
            response.status().as_u16(),
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| webdav_request_error("download", "GET", relative_path, error))?;
    ensure_local_sync_identity(target_path, expected_local_hash, relative_path)?;
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| local_sync_file_error("folder creation", relative_path, error))?;
    }
    fs::write(target_path, &bytes)
        .map_err(|error| local_sync_file_error("write", relative_path, error))?;

    Ok(sha256_hex(&bytes))
}

fn ensure_local_sync_identity(
    path: &Path,
    expected_hash: Option<&str>,
    relative_path: &str,
) -> Result<(), String> {
    match expected_hash {
        Some(expected_hash) => {
            let bytes = fs::read(path)
                .map_err(|error| local_sync_file_error("read", relative_path, error))?;
            if sha256_hex(&bytes) == expected_hash {
                return Ok(());
            }
        }
        None => {
            if !path
                .try_exists()
                .map_err(|error| local_sync_file_error("stat", relative_path, error))?
            {
                return Ok(());
            }
        }
    }

    Err(sync_file_changed_error("Local", relative_path))
}

fn delete_local_sync_file(
    path: &Path,
    expected_hash: &str,
    relative_path: &str,
) -> Result<(), String> {
    ensure_local_sync_identity(path, Some(expected_hash), relative_path)?;
    fs::remove_file(path).map_err(|error| local_sync_file_error("delete", relative_path, error))
}

fn plan_webdav_file_sync(
    local_hash: Option<&str>,
    remote_etag: Option<&str>,
    manifest: Option<&SyncManifestEntry>,
) -> WebDavFileSyncAction {
    match (local_hash, remote_etag) {
        (Some(local), None) => {
            let Some(manifest) = manifest else {
                return WebDavFileSyncAction::Upload;
            };
            if local == manifest.local_hash {
                WebDavFileSyncAction::DeleteLocal
            } else {
                WebDavFileSyncAction::Upload
            }
        }
        (None, Some(remote)) => {
            let Some(manifest) = manifest else {
                return WebDavFileSyncAction::Download;
            };
            if same_remote_identity(remote, &manifest.remote_etag) {
                WebDavFileSyncAction::DeleteRemote
            } else {
                WebDavFileSyncAction::Download
            }
        }
        (None, None) => WebDavFileSyncAction::Skip,
        (Some(local), Some(remote)) => {
            let Some(manifest) = manifest else {
                return WebDavFileSyncAction::Conflict;
            };
            let local_changed = local != manifest.local_hash;
            let remote_changed = !same_remote_identity(remote, &manifest.remote_etag);

            match (local_changed, remote_changed) {
                (false, false) => WebDavFileSyncAction::Skip,
                (true, false) => WebDavFileSyncAction::Upload,
                (false, true) => WebDavFileSyncAction::Download,
                (true, true) => WebDavFileSyncAction::Conflict,
            }
        }
    }
}

fn record_webdav_conflict_manifest(
    manifest: &mut SyncManifest,
    relative_path: String,
    local_hash: &str,
    remote_identity: &str,
) {
    manifest.entries.insert(
        relative_path,
        SyncManifestEntry {
            local_hash: local_hash.to_string(),
            remote_etag: remote_identity.to_string(),
        },
    );
}

fn apply_webdav_remote_precondition(
    builder: RequestBuilder,
    expected_remote_identity: Option<&str>,
) -> RequestBuilder {
    if expected_remote_identity.is_none() {
        return builder.header(IF_NONE_MATCH, "*");
    }

    // Some WebDAV servers expose weak/strong ETag variants across methods, so rely on the explicit identity probe above.
    builder
}

fn webdav_status_error(action: &str, method: &str, relative_path: &str, status: u16) -> String {
    format!(
        "WebDAV sync {action} failed: {method} {}: HTTP {status}",
        webdav_diagnostic_relative_path(relative_path)
    )
}

fn webdav_request_error(
    action: &str,
    method: &str,
    relative_path: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "WebDAV sync {action} failed: {method} {}: {error}",
        webdav_diagnostic_relative_path(relative_path)
    )
}

fn sync_file_changed_error(side: &str, relative_path: &str) -> String {
    format!(
        "{side} sync file changed during sync: {}",
        webdav_diagnostic_relative_path(relative_path)
    )
}

fn sync_file_missing_error(side: &str, action: &str, relative_path: &str) -> String {
    format!(
        "{side} sync file is missing during {action}: {}",
        webdav_diagnostic_relative_path(relative_path)
    )
}

fn local_sync_file_error(
    action: &str,
    relative_path: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "Local sync file {action} failed: {}: {error}",
        webdav_diagnostic_relative_path(relative_path)
    )
}

fn webdav_diagnostic_relative_path(relative_path: &str) -> String {
    let normalized = relative_path
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let normalized = normalized.trim();

    if normalized.is_empty() {
        "<root>".to_string()
    } else {
        normalized.to_string()
    }
}

fn same_optional_remote_identity(actual: Option<&str>, expected: Option<&str>) -> bool {
    match (actual, expected) {
        (Some(actual), Some(expected)) => same_remote_identity(actual, expected),
        (None, None) => true,
        _ => false,
    }
}

fn same_remote_identity(left: &str, right: &str) -> bool {
    canonical_webdav_etag_identity(left) == canonical_webdav_etag_identity(right)
}

fn canonical_webdav_etag_identity(identity: &str) -> &str {
    let trimmed = identity.trim();
    let weak_value = trimmed
        .strip_prefix("W/")
        .or_else(|| trimmed.strip_prefix("w/"));

    if let Some(value) = weak_value {
        let value = value.trim_start();
        if value.starts_with('"') {
            return value;
        }
    }

    trimmed
}

fn remote_identity(etag: Option<&str>, last_modified: Option<&str>, size: u64) -> String {
    if let Some(etag) = etag.map(str::trim).filter(|value| !value.is_empty()) {
        return canonical_webdav_etag_identity(etag).to_string();
    }

    if let Some(last_modified) = last_modified
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return format!("modified:{last_modified};len:{size}");
    }

    format!("len:{size}")
}

fn remote_conflict_file_name(file_name: &str, timestamp: &str) -> String {
    if let Some((stem, extension)) = file_name.rsplit_once('.') {
        if !stem.is_empty() && !extension.is_empty() {
            return format!("{stem}.remote-conflict-{timestamp}.{extension}");
        }
    }

    format!("{file_name}.remote-conflict-{timestamp}")
}

fn unique_conflict_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("remote-conflict");

    for attempt in 2..1000 {
        let candidate = parent.join(format!("{file_name}-{attempt}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    path
}

fn manifest_path(source_root: &Path) -> PathBuf {
    source_root
        .join(SYNC_METADATA_DIR)
        .join(WEBDAV_MANIFEST_FILE)
}

fn load_sync_manifest(source_root: &Path) -> Result<SyncManifest, String> {
    let path = manifest_path(source_root);
    if !path.exists() {
        return Ok(SyncManifest::default());
    }

    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;

    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn save_sync_manifest(source_root: &Path, manifest: &SyncManifest) -> Result<(), String> {
    let path = manifest_path(source_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let contents = serde_json::to_string_pretty(manifest).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn apply_basic_auth(builder: RequestBuilder, username: &str, password: &str) -> RequestBuilder {
    if username.is_empty() && password.is_empty() {
        return builder;
    }

    builder.basic_auth(username.to_string(), Some(password.to_string()))
}

fn webdav_mkcol_method() -> Result<Method, String> {
    Method::from_bytes(b"MKCOL").map_err(|error| error.to_string())
}

fn webdav_propfind_method() -> Result<Method, String> {
    Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())
}

fn webdav_delete_method() -> Result<Method, String> {
    Method::from_bytes(b"DELETE").map_err(|error| error.to_string())
}

fn sync_timestamp() -> String {
    let now = OffsetDateTime::now_utc();

    format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

fn sha256_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);

    for byte in digest {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_webdav_sync_root_url_from_relative_remote_path() {
        let url = webdav_sync_root_url(
            "https://dav.example.test/remote.php/dav/files/ada/",
            "notes/2026",
        )
        .expect("sync root URL should be built");

        assert_eq!(
            url.as_str(),
            "https://dav.example.test/remote.php/dav/files/ada/notes/2026/"
        );
    }

    #[test]
    fn builds_webdav_child_urls_without_duplicate_separators() {
        let root_url = webdav_sync_root_url("https://dav.example.test/base/", "notes")
            .expect("sync root URL should be built");

        assert_eq!(
            webdav_child_url(&root_url, "draft.md", false)
                .expect("file URL should be built")
                .as_str(),
            "https://dav.example.test/base/notes/draft.md"
        );
        assert_eq!(
            webdav_child_url(&root_url, "assets/images", true)
                .expect("directory URL should be built")
                .as_str(),
            "https://dav.example.test/base/notes/assets/images/"
        );
    }

    #[test]
    fn rejects_webdav_sync_parent_segments() {
        let error = webdav_sync_root_url("https://dav.example.test/base/", "../notes")
            .expect_err("parent segments should be rejected");

        assert!(error.contains("Remote sync path cannot contain parent directory segments"));
    }

    #[test]
    fn rejects_webdav_sync_root_remote_paths() {
        for remote_path in ["", "/", ".", " ./ "] {
            let error = webdav_sync_root_url("https://dav.example.test/base/", remote_path)
                .expect_err("root remote paths should be rejected");

            assert!(error.contains("Remote sync path cannot be the WebDAV root"));
        }
    }

    #[test]
    fn rejects_remote_href_parent_segments_after_percent_decoding() {
        let root_url = webdav_sync_root_url("https://dav.example.test/base/", "notes")
            .expect("sync root URL should be built");
        let error = remote_relative_path(
            &root_url,
            "https://dav.example.test/base/notes/folder%2f..%2fsecrets.md",
        )
        .expect_err("encoded parent segments should be rejected");

        assert!(error.contains("Remote sync path cannot contain parent directory segments"));
    }

    #[test]
    fn plans_conflict_when_local_and_remote_changed_since_manifest() {
        let action = plan_webdav_file_sync(
            Some("local-new"),
            Some("remote-new"),
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::Conflict);
    }

    #[test]
    fn plans_download_when_only_remote_changed_since_manifest() {
        let action = plan_webdav_file_sync(
            Some("local-old"),
            Some("remote-new"),
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::Download);
    }

    #[test]
    fn plans_remote_delete_when_local_file_was_deleted() {
        let action = plan_webdav_file_sync(
            None,
            Some("remote-old"),
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::DeleteRemote);
    }

    #[test]
    fn plans_local_delete_when_remote_file_was_deleted() {
        let action = plan_webdav_file_sync(
            Some("local-old"),
            None,
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::DeleteLocal);
    }

    #[test]
    fn preserves_remote_change_when_local_file_was_deleted() {
        let action = plan_webdav_file_sync(
            None,
            Some("remote-new"),
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::Download);
    }

    #[test]
    fn preserves_local_change_when_remote_file_was_deleted() {
        let action = plan_webdav_file_sync(
            Some("local-new"),
            None,
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "remote-old".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::Upload);
    }

    #[test]
    fn records_conflict_baseline_to_avoid_repeated_conflicts() {
        let mut manifest = SyncManifest::default();

        record_webdav_conflict_manifest(
            &mut manifest,
            "draft.md".to_string(),
            "local-new",
            "remote-new",
        );

        let action = plan_webdav_file_sync(
            Some("local-new"),
            Some("remote-new"),
            manifest.entries.get("draft.md"),
        );

        assert_eq!(action, WebDavFileSyncAction::Skip);
    }

    #[test]
    fn rejects_local_write_when_file_changed_since_scan() {
        let root = temp_root("remote-sync-local-guard");
        let target = root.join("draft.md");
        write_test_file(&target, "current contents");

        let error =
            ensure_local_sync_identity(&target, Some(&sha256_hex(b"old contents")), "draft.md")
                .expect_err("changed local file should be rejected");

        assert_eq!(error, "Local sync file changed during sync: draft.md");
    }

    #[test]
    fn uses_remote_last_modified_when_etag_is_missing() {
        assert_eq!(
            remote_identity(None, Some("Sun, 07 Jun 2026 02:00:00 GMT"), 128),
            "modified:Sun, 07 Jun 2026 02:00:00 GMT;len:128"
        );
    }

    #[test]
    fn normalizes_webdav_weak_etags_for_remote_identity() {
        assert_eq!(
            remote_identity(Some(" W/\"8-656032d37efc2\" "), None, 8),
            "\"8-656032d37efc2\""
        );
    }

    #[test]
    fn treats_weak_and_strong_webdav_etag_variants_as_same_remote_identity() {
        let action = plan_webdav_file_sync(
            Some("local-old"),
            Some("\"8-656032d37efc2\""),
            Some(&SyncManifestEntry {
                local_hash: "local-old".to_string(),
                remote_etag: "W/\"8-656032d37efc2\"".to_string(),
            }),
        );

        assert_eq!(action, WebDavFileSyncAction::Skip);
    }

    #[test]
    fn omits_webdav_if_match_after_explicit_remote_identity_check() {
        let client = Client::new();
        let request = apply_webdav_remote_precondition(
            client
                .put("https://dav.example.test/base/draft.md")
                .body("hello"),
            Some("\"8-656032d37efc2\""),
        )
        .build()
        .expect("request should be built");

        assert!(request.headers().get("if-match").is_none());
    }

    #[test]
    fn formats_webdav_http_errors_with_request_context() {
        assert_eq!(
            webdav_status_error("folder creation", "MKCOL", "notes", 409),
            "WebDAV sync folder creation failed: MKCOL notes: HTTP 409"
        );
        assert_eq!(
            webdav_status_error("listing", "PROPFIND depth=1", "", 400),
            "WebDAV sync listing failed: PROPFIND depth=1 <root>: HTTP 400"
        );
        assert_eq!(
            webdav_status_error("metadata", "PROPFIND depth=0", "notes/draft.md", 400),
            "WebDAV sync metadata failed: PROPFIND depth=0 notes/draft.md: HTTP 400"
        );
        assert_eq!(
            webdav_status_error("metadata", "HEAD", "folder/image.png", 405),
            "WebDAV sync metadata failed: HEAD folder/image.png: HTTP 405"
        );
        assert_eq!(
            webdav_status_error("upload", "PUT", "folder/image.png", 507),
            "WebDAV sync upload failed: PUT folder/image.png: HTTP 507"
        );
        assert_eq!(
            webdav_status_error("download", "GET", "folder/image.png", 503),
            "WebDAV sync download failed: GET folder/image.png: HTTP 503"
        );
        assert_eq!(
            webdav_status_error("delete", "DELETE", "folder/image.png", 423),
            "WebDAV sync delete failed: DELETE folder/image.png: HTTP 423"
        );
    }

    #[test]
    fn formats_webdav_transport_and_file_guard_errors_with_context() {
        assert_eq!(
            webdav_request_error(
                "listing",
                "PROPFIND depth=1",
                "folder\nbad",
                "mock transport"
            ),
            "WebDAV sync listing failed: PROPFIND depth=1 folder bad: mock transport"
        );
        assert_eq!(
            sync_file_changed_error("Remote", "notes/draft.md"),
            "Remote sync file changed during sync: notes/draft.md"
        );
        assert_eq!(
            sync_file_changed_error("Local", ""),
            "Local sync file changed during sync: <root>"
        );
    }

    #[test]
    fn builds_webdav_collection_targets_with_diagnostic_paths() {
        let targets = webdav_collection_targets("https://dav.example.test/base/", "notes/2026")
            .expect("collection targets should be built");
        let diagnostic_paths = targets
            .iter()
            .map(|target| target.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(diagnostic_paths, vec!["notes", "notes/2026"]);
    }

    #[test]
    fn skips_current_collection_href_when_listing_nested_webdav_directory() {
        assert!(should_skip_webdav_listing_path("", ""));
        assert!(should_skip_webdav_listing_path("notes", "notes"));
        assert!(!should_skip_webdav_listing_path("notes/draft.md", "notes"));
        assert!(!should_skip_webdav_listing_path("notes/child", "notes"));
    }

    #[test]
    fn creates_remote_conflict_file_name_without_losing_extension() {
        assert_eq!(
            remote_conflict_file_name("draft.md", "20260607T091500Z"),
            "draft.remote-conflict-20260607T091500Z.md"
        );
    }

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "markra-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("test root should be created");

        root
    }

    fn write_test_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("test parent should be created");
        }
        fs::write(path, contents).expect("test file should be written");
    }
}
