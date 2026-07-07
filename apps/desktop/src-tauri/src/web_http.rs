use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH, CONTENT_TYPE, LOCATION};
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};

use crate::network::{apply_network_settings, NetworkSettings};

const WEB_RESOURCE_MAX_REDIRECTS: usize = 5;
const WEB_RESOURCE_REQUEST_TIMEOUT_SECS: u64 = 30;
const WEB_IMAGE_MAX_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebResourceRequest {
    allow_localhost: Option<bool>,
    #[serde(default)]
    headers: HashMap<String, String>,
    network: Option<NetworkSettings>,
    url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebResourceResponse {
    body: String,
    content_type: Option<String>,
    final_url: String,
    status: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebImageDownloadRequest {
    network: Option<NetworkSettings>,
    url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebImageDownloadResponse {
    bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
}

#[tauri::command]
pub(crate) async fn request_web_resource(
    request: WebResourceRequest,
) -> Result<WebResourceResponse, String> {
    execute_web_resource_request(request).await
}

#[tauri::command]
pub(crate) async fn download_web_image(
    request: WebImageDownloadRequest,
) -> Result<WebImageDownloadResponse, String> {
    execute_web_image_download(request).await
}

async fn execute_web_resource_request(
    request: WebResourceRequest,
) -> Result<WebResourceResponse, String> {
    let allow_localhost = request.allow_localhost.unwrap_or(false);
    let mut url = validated_web_resource_url(&request.url, allow_localhost)?;
    let headers = parse_headers(&request.headers)?;
    let client = apply_network_settings(
        reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(WEB_RESOURCE_REQUEST_TIMEOUT_SECS)),
        request.network.as_ref(),
    )?
    .build()
    .map_err(|error| error.to_string())?;

    for _ in 0..=WEB_RESOURCE_MAX_REDIRECTS {
        let response = client
            .get(url.clone())
            .headers(headers.clone())
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let status = response.status();

        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "Web resource redirect did not include a location.".to_string())?;
            let location = location.to_str().map_err(|error| error.to_string())?;
            let next_url = url.join(location).map_err(|error| error.to_string())?;
            url = validated_web_resource_url(next_url.as_str(), allow_localhost)?;
            continue;
        }

        let status = status.as_u16();
        let final_url = response.url().to_string();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        let body = response.text().await.map_err(|error| error.to_string())?;

        return Ok(WebResourceResponse {
            body,
            content_type,
            final_url,
            status,
        });
    }

    Err("Web resource request followed too many redirects.".to_string())
}

async fn execute_web_image_download(
    request: WebImageDownloadRequest,
) -> Result<WebImageDownloadResponse, String> {
    let mut url = validated_web_resource_url(&request.url, false)?;
    let client = apply_network_settings(
        reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(WEB_RESOURCE_REQUEST_TIMEOUT_SECS)),
        request.network.as_ref(),
    )?
    .build()
    .map_err(|error| error.to_string())?;

    for _ in 0..=WEB_RESOURCE_MAX_REDIRECTS {
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|error| web_image_download_request_error("GET", "remote image", error))?;
        let status = response.status();

        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "Web image redirect did not include a location.".to_string())?;
            let location = location.to_str().map_err(|error| error.to_string())?;
            let next_url = url.join(location).map_err(|error| error.to_string())?;
            url = validated_web_resource_url(next_url.as_str(), false)?;
            continue;
        }

        if !status.is_success() {
            return Err(web_image_download_status_error(
                "GET",
                "remote image",
                status.as_u16(),
            ));
        }

        if let Some(content_length) = response.headers().get(CONTENT_LENGTH) {
            let content_length = content_length
                .to_str()
                .ok()
                .and_then(|value| value.parse::<u64>().ok());
            if content_length.is_some_and(|length| length > WEB_IMAGE_MAX_BYTES) {
                return Err("Web image is too large to paste into the document.".to_string());
            }
        }

        let mime_type = web_image_mime_type(response.headers().get(CONTENT_TYPE), &url)?;
        let file_name = web_image_file_name(&url, &mime_type);
        let bytes = response
            .bytes()
            .await
            .map_err(|error| web_image_download_request_error("GET", "remote image", error))?;
        if bytes.len() as u64 > WEB_IMAGE_MAX_BYTES {
            return Err("Web image is too large to paste into the document.".to_string());
        }

        return Ok(WebImageDownloadResponse {
            bytes: bytes.to_vec(),
            file_name,
            mime_type,
        });
    }

    Err("Web image download followed too many redirects.".to_string())
}

pub(crate) fn validated_web_resource_url(
    value: &str,
    allow_localhost: bool,
) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS web resource URLs are supported.".to_string());
    }

    if !allow_localhost && is_local_or_private_host(&url) {
        return Err(
            "Local and private network URLs are not allowed for web resources.".to_string(),
        );
    }

    Ok(url)
}

fn web_image_mime_type(content_type: Option<&HeaderValue>, url: &Url) -> Result<String, String> {
    let normalized_content_type = content_type
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .filter(|value| !value.is_empty());

    if let Some(mime_type) = normalized_content_type {
        if mime_type.starts_with("image/") {
            return Ok(mime_type);
        }

        if mime_type != "application/octet-stream" {
            return Err("Downloaded web resource is not an image.".to_string());
        }
    }

    image_mime_type_from_url(url)
        .map(str::to_string)
        .ok_or_else(|| "Downloaded web resource is not a supported image.".to_string())
}

fn web_image_file_name(url: &Url, mime_type: &str) -> String {
    let file_name = url
        .path_segments()
        .and_then(|segments| segments.filter(|segment| !segment.is_empty()).last())
        .filter(|segment| !segment.trim().is_empty())
        .unwrap_or("web-image");

    if image_extension_from_file_name(file_name).is_some() {
        return file_name.to_string();
    }

    format!(
        "{}.{}",
        file_name,
        image_extension_from_mime_type(mime_type)
    )
}

fn image_mime_type_from_url(url: &Url) -> Option<&'static str> {
    let file_name = url
        .path_segments()
        .and_then(|segments| segments.filter(|segment| !segment.is_empty()).last())?;
    let extension = image_extension_from_file_name(file_name)?;
    image_mime_type_from_extension(extension)
}

fn image_extension_from_file_name(file_name: &str) -> Option<&str> {
    let extension = file_name.rsplit_once('.')?.1;
    if is_supported_image_extension(extension) {
        Some(extension)
    } else {
        None
    }
}

fn is_supported_image_extension(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "avif" | "bmp" | "gif" | "jpeg" | "jpg" | "png" | "svg" | "webp"
    )
}

fn image_mime_type_from_extension(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "avif" => Some("image/avif"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        "jpeg" | "jpg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn image_extension_from_mime_type(mime_type: &str) -> &'static str {
    match mime_type {
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/svg+xml" => "svg",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn web_image_download_status_error(method: &str, target: &str, status: u16) -> String {
    format!(
        "Web image download failed: {method} {}: HTTP {status}",
        web_image_download_diagnostic_target(target)
    )
}

fn web_image_download_request_error(
    method: &str,
    target: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "Web image download failed: {method} {}: {error}",
        web_image_download_diagnostic_target(target)
    )
}

fn web_image_download_diagnostic_target(target: &str) -> String {
    let normalized = target
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
        "remote image".to_string()
    } else {
        normalized.to_string()
    }
}

fn is_local_or_private_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    let normalized_host = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if normalized_host == "localhost"
        || normalized_host.ends_with(".localhost")
        || normalized_host.ends_with(".local")
    {
        return true;
    }

    match normalized_host.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => is_private_ipv4(address),
        Ok(IpAddr::V6(address)) => is_private_ipv6(address),
        Err(_) => false,
    }
}

fn is_private_ipv4(address: Ipv4Addr) -> bool {
    address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_multicast()
        || address.is_broadcast()
        || address.is_unspecified()
}

fn is_private_ipv6(address: Ipv6Addr) -> bool {
    address.is_loopback()
        || address.is_unspecified()
        || address.is_multicast()
        || address.is_unique_local()
        || address.is_unicast_link_local()
}

fn parse_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut header_map = HeaderMap::new();

    for (name, value) in headers {
        let header_name =
            HeaderName::from_bytes(name.as_bytes()).map_err(|error| error.to_string())?;
        let header_value = HeaderValue::from_str(value).map_err(|error| error.to_string())?;
        header_map.insert(header_name, header_value);
    }

    Ok(header_map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_public_http_urls() {
        let url = validated_web_resource_url("https://example.com/search?q=markra", false)
            .expect("public HTTPS URL should be accepted");

        assert_eq!(url.as_str(), "https://example.com/search?q=markra");
    }

    #[test]
    fn rejects_non_http_urls() {
        let error = validated_web_resource_url("file:///tmp/secret", false)
            .expect_err("file URLs should be rejected");

        assert!(error.contains("HTTP and HTTPS"));
    }

    #[test]
    fn rejects_local_and_private_urls_by_default() {
        for url in [
            "http://localhost:8888",
            "http://127.0.0.1:8888",
            "http://10.0.0.2",
            "http://172.16.0.2",
            "http://192.168.1.2",
            "http://[::1]:8888",
            "http://[fc00::1]",
            "http://printer.local",
        ] {
            let error =
                validated_web_resource_url(url, false).expect_err("private URL should be rejected");

            assert!(error.contains("Local and private"));
        }
    }

    #[test]
    fn allows_localhost_for_configured_search_endpoints() {
        let url = validated_web_resource_url("http://localhost:8888/search?q=markra", true)
            .expect("localhost should be allowed when explicitly requested");

        assert_eq!(url.as_str(), "http://localhost:8888/search?q=markra");
    }

    #[test]
    fn accepts_image_content_types_for_web_image_downloads() {
        let url = Url::parse("https://example.com/assets/kitten").expect("URL should parse");
        let content_type = HeaderValue::from_static("image/png; charset=binary");

        assert_eq!(
            web_image_mime_type(Some(&content_type), &url).expect("image content type should pass"),
            "image/png"
        );
        assert_eq!(web_image_file_name(&url, "image/png"), "kitten.png");
    }

    #[test]
    fn infers_web_image_mime_type_from_url_for_octet_streams() {
        let url = Url::parse("https://cdn.example.com/assets/logo.svg?version=1")
            .expect("URL should parse");
        let content_type = HeaderValue::from_static("application/octet-stream");

        assert_eq!(
            web_image_mime_type(Some(&content_type), &url)
                .expect("octet stream image URLs should infer a MIME type"),
            "image/svg+xml"
        );
        assert_eq!(web_image_file_name(&url, "image/svg+xml"), "logo.svg");
    }

    #[test]
    fn rejects_non_image_content_types_for_web_image_downloads() {
        let url = Url::parse("https://example.com/page.html").expect("URL should parse");
        let content_type = HeaderValue::from_static("text/html");
        let error = web_image_mime_type(Some(&content_type), &url)
            .expect_err("non-image content type should be rejected");

        assert!(error.contains("not an image"));
    }

    #[test]
    fn formats_web_image_download_status_errors_with_request_context() {
        assert_eq!(
            web_image_download_status_error("GET", "remote image", 404),
            "Web image download failed: GET remote image: HTTP 404"
        );
        assert_eq!(
            web_image_download_request_error("GET", "remote image", "timeout"),
            "Web image download failed: GET remote image: timeout"
        );
    }

    #[test]
    fn parses_custom_headers() {
        let mut headers = HashMap::new();
        headers.insert("accept".to_string(), "text/html".to_string());
        headers.insert("user-agent".to_string(), "Markra".to_string());

        let parsed = parse_headers(&headers).expect("headers should parse");

        assert_eq!(parsed.get("accept").unwrap(), "text/html");
        assert_eq!(parsed.get("user-agent").unwrap(), "Markra");
    }
}
