use std::time::Duration;

use reqwest::header::{CONTENT_TYPE, ETAG, IF_MATCH, IF_NONE_MATCH};
use reqwest::{Client, Method, RequestBuilder, StatusCode, Url};
use serde::Deserialize;

use crate::network::{apply_network_settings, NetworkSettings};

const WEBDAV_TEXT_FILE_TIMEOUT_SECS: u64 = 30;
const WEBDAV_TEXT_FILE_MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadWebDavTextFileRequest {
    network: Option<NetworkSettings>,
    password: String,
    remote_path: String,
    server_url: String,
    username: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WriteWebDavTextFileRequest {
    contents: String,
    network: Option<NetworkSettings>,
    password: String,
    remote_path: String,
    server_url: String,
    username: String,
}

#[derive(Debug)]
struct WebDavCollectionTarget {
    diagnostic_path: String,
    url: Url,
}

fn webdav_text_file_client(network: Option<&NetworkSettings>) -> Result<Client, String> {
    apply_network_settings(
        Client::builder().timeout(Duration::from_secs(WEBDAV_TEXT_FILE_TIMEOUT_SECS)),
        network,
    )?
    .build()
    .map_err(|error| error.to_string())
}

fn validated_webdav_text_file_base_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("WebDAV text file server URL is required".to_string());
    }

    let mut url = Url::parse(trimmed).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("WebDAV text files only support HTTP and HTTPS URLs".to_string());
    }

    url.set_query(None);
    url.set_fragment(None);
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);

    Ok(url)
}

fn webdav_text_file_path_segments(remote_path: &str) -> Result<Vec<String>, String> {
    let normalized = remote_path.trim().replace('\\', "/");
    let normalized = normalized.trim_matches('/');
    if normalized.is_empty() || normalized == "." {
        return Err("WebDAV text file path is required".to_string());
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err("WebDAV text file path cannot contain parent segments".to_string());
        }

        segments.push(segment.to_string());
    }

    if segments.is_empty() {
        return Err("WebDAV text file path is required".to_string());
    }

    Ok(segments)
}

fn webdav_url_with_segments(
    server_url: &str,
    segments: &[String],
    trailing_slash: bool,
) -> Result<Url, String> {
    let mut url = validated_webdav_text_file_base_url(server_url)?;
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "WebDAV text file URL cannot be used as a base URL".to_string())?;

        for segment in segments {
            path_segments.push(segment);
        }
        if trailing_slash {
            path_segments.push("");
        }
    }

    Ok(url)
}

fn webdav_text_file_url(server_url: &str, remote_path: &str) -> Result<Url, String> {
    webdav_url_with_segments(
        server_url,
        &webdav_text_file_path_segments(remote_path)?,
        false,
    )
}

fn webdav_text_file_collection_targets(
    server_url: &str,
    remote_path: &str,
) -> Result<Vec<WebDavCollectionTarget>, String> {
    let segments = webdav_text_file_path_segments(remote_path)?;
    let collection_segments = &segments[..segments.len().saturating_sub(1)];
    let mut targets = Vec::with_capacity(collection_segments.len());

    for index in 0..collection_segments.len() {
        let target_segments = &collection_segments[..=index];
        targets.push(WebDavCollectionTarget {
            diagnostic_path: target_segments.join("/"),
            url: webdav_url_with_segments(server_url, target_segments, true)?,
        });
    }

    Ok(targets)
}

fn apply_basic_auth(builder: RequestBuilder, username: &str, password: &str) -> RequestBuilder {
    if username.is_empty() && password.is_empty() {
        return builder;
    }

    builder.basic_auth(username.to_string(), Some(password.to_string()))
}

fn apply_webdav_write_precondition(
    builder: RequestBuilder,
    remote_etag: Option<&str>,
    remote_exists: bool,
) -> RequestBuilder {
    if !remote_exists {
        return builder.header(IF_NONE_MATCH, "*");
    }

    let Some(etag) = remote_etag.map(str::trim).filter(|etag| !etag.is_empty()) else {
        return builder;
    };
    // Weak ETags cannot satisfy HTTP If-Match, so WebDAV servers that only
    // expose weak validators must fall back to the explicit user overwrite.
    if etag.starts_with("W/") {
        return builder;
    }

    builder.header(IF_MATCH, etag)
}

fn webdav_mkcol_method() -> Result<Method, String> {
    Method::from_bytes(b"MKCOL").map_err(|error| error.to_string())
}

fn diagnostic_webdav_text_file_path(remote_path: &str) -> String {
    let normalized = remote_path
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let normalized = normalized.trim().trim_matches('/');

    if normalized.is_empty() {
        "<root>".to_string()
    } else {
        normalized.to_string()
    }
}

fn webdav_text_file_status_error(action: &str, remote_path: &str, status: StatusCode) -> String {
    format!(
        "WebDAV text file {action} failed: {}: HTTP {}",
        diagnostic_webdav_text_file_path(remote_path),
        status.as_u16()
    )
}

fn webdav_text_file_request_error(
    action: &str,
    remote_path: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "WebDAV text file {action} failed: {}: {error}",
        diagnostic_webdav_text_file_path(remote_path)
    )
}

async fn ensure_webdav_text_file_collections(
    client: &Client,
    server_url: &str,
    remote_path: &str,
    username: &str,
    password: &str,
) -> Result<(), String> {
    for target in webdav_text_file_collection_targets(server_url, remote_path)? {
        let response = apply_basic_auth(
            client.request(webdav_mkcol_method()?, target.url),
            username,
            password,
        )
        .send()
        .await
        .map_err(|error| {
            webdav_text_file_request_error("folder creation", &target.diagnostic_path, error)
        })?;

        if !(response.status().is_success() || response.status() == StatusCode::METHOD_NOT_ALLOWED)
        {
            return Err(webdav_text_file_status_error(
                "folder creation",
                &target.diagnostic_path,
                response.status(),
            ));
        }
    }

    Ok(())
}

async fn webdav_text_file_write_state(
    client: &Client,
    url: Url,
    remote_path: &str,
    username: &str,
    password: &str,
) -> Result<(bool, Option<String>), String> {
    let response = apply_basic_auth(client.head(url), username, password)
        .send()
        .await
        .map_err(|error| webdav_text_file_request_error("metadata", remote_path, error))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok((false, None));
    }
    if matches!(
        response.status(),
        StatusCode::METHOD_NOT_ALLOWED | StatusCode::NOT_IMPLEMENTED
    ) {
        return Ok((true, None));
    }
    if !response.status().is_success() {
        return Err(webdav_text_file_status_error(
            "metadata",
            remote_path,
            response.status(),
        ));
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    Ok((true, etag))
}

#[tauri::command]
pub(crate) async fn read_webdav_text_file(
    request: ReadWebDavTextFileRequest,
) -> Result<String, String> {
    let client = webdav_text_file_client(request.network.as_ref())?;
    let target_url = webdav_text_file_url(&request.server_url, &request.remote_path)?;
    let response = apply_basic_auth(client.get(target_url), &request.username, &request.password)
        .send()
        .await
        .map_err(|error| webdav_text_file_request_error("download", &request.remote_path, error))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Err("No WebDAV settings backup was found.".to_string());
    }
    if !response.status().is_success() {
        return Err(webdav_text_file_status_error(
            "download",
            &request.remote_path,
            response.status(),
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > WEBDAV_TEXT_FILE_MAX_BYTES as u64)
    {
        return Err("WebDAV settings backup is too large.".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| webdav_text_file_request_error("download", &request.remote_path, error))?;
    if bytes.len() > WEBDAV_TEXT_FILE_MAX_BYTES {
        return Err("WebDAV settings backup is too large.".to_string());
    }

    String::from_utf8(bytes.to_vec())
        .map_err(|_| "WebDAV settings backup is not valid UTF-8.".to_string())
}

#[tauri::command]
pub(crate) async fn write_webdav_text_file(
    request: WriteWebDavTextFileRequest,
) -> Result<(), String> {
    if request.contents.len() > WEBDAV_TEXT_FILE_MAX_BYTES {
        return Err("WebDAV settings backup is too large.".to_string());
    }

    let client = webdav_text_file_client(request.network.as_ref())?;
    let target_url = webdav_text_file_url(&request.server_url, &request.remote_path)?;
    ensure_webdav_text_file_collections(
        &client,
        &request.server_url,
        &request.remote_path,
        &request.username,
        &request.password,
    )
    .await?;
    let (remote_exists, remote_etag) = webdav_text_file_write_state(
        &client,
        target_url.clone(),
        &request.remote_path,
        &request.username,
        &request.password,
    )
    .await?;
    let write_request = apply_webdav_write_precondition(
        client
            .put(target_url)
            .header(CONTENT_TYPE, "application/json; charset=utf-8")
            .body(request.contents),
        remote_etag.as_deref(),
        remote_exists,
    );
    let response = apply_basic_auth(write_request, &request.username, &request.password)
        .send()
        .await
        .map_err(|error| webdav_text_file_request_error("upload", &request.remote_path, error))?;

    if response.status() == StatusCode::PRECONDITION_FAILED {
        return Err(
            "The WebDAV settings backup changed during upload. Retry after restoring the latest backup."
                .to_string(),
        );
    }
    if !response.status().is_success() {
        return Err(webdav_text_file_status_error(
            "upload",
            &request.remote_path,
            response.status(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use reqwest::Client;

    use super::{apply_webdav_write_precondition, webdav_text_file_url};

    #[test]
    fn builds_nested_webdav_text_file_urls() {
        let url = webdav_text_file_url(
            "https://dav.example.test/base/",
            "markra/settings/markra-settings.json",
        )
        .expect("WebDAV settings URL should be built");

        assert_eq!(
            url.as_str(),
            "https://dav.example.test/base/markra/settings/markra-settings.json"
        );
    }

    #[test]
    fn rejects_unsafe_webdav_text_file_paths() {
        for remote_path in ["", "/", ".", "../settings.json", "markra/../settings.json"] {
            let error = webdav_text_file_url("https://dav.example.test/base/", remote_path)
                .expect_err("unsafe paths should be rejected");

            assert!(error.contains("WebDAV text file path"));
        }
    }

    #[test]
    fn applies_conditional_webdav_write_headers() {
        let client = Client::new();
        let missing = apply_webdav_write_precondition(
            client.put("https://dav.example.test/settings.json"),
            None,
            false,
        )
        .build()
        .expect("missing request should build");
        let existing = apply_webdav_write_precondition(
            client.put("https://dav.example.test/settings.json"),
            Some("\"mock-etag\""),
            true,
        )
        .build()
        .expect("existing request should build");

        assert_eq!(
            missing
                .headers()
                .get("if-none-match")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
        assert_eq!(
            existing
                .headers()
                .get("if-match")
                .and_then(|value| value.to_str().ok()),
            Some("\"mock-etag\"")
        );
    }
}
