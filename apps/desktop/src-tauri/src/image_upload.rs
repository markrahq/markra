use std::time::Duration;

use hmac::{Hmac, Mac};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::multipart;
use reqwest::{Client, Method, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

use crate::network::{apply_network_settings, NetworkSettings};

type HmacSha256 = Hmac<Sha256>;

const IMAGE_UPLOAD_REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebDavImageUploadRequest {
    bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
    network: Option<NetworkSettings>,
    password: String,
    public_base_url: String,
    server_url: String,
    upload_path: String,
    username: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct S3ImageUploadRequest {
    access_key_id: String,
    bucket: String,
    bytes: Vec<u8>,
    endpoint_url: String,
    file_name: String,
    mime_type: String,
    network: Option<NetworkSettings>,
    public_base_url: String,
    region: String,
    secret_access_key: String,
    upload_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PicGoImageUploadRequest {
    bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
    network: Option<NetworkSettings>,
    secret: String,
    server_url: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadedImage {
    url: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ImageUploadTargets {
    pub(crate) public_url: String,
    pub(crate) upload_url: Url,
}

#[tauri::command]
pub(crate) async fn upload_webdav_image(
    request: WebDavImageUploadRequest,
) -> Result<UploadedImage, String> {
    execute_webdav_image_upload(request).await
}

#[tauri::command]
pub(crate) async fn upload_s3_image(
    request: S3ImageUploadRequest,
) -> Result<UploadedImage, String> {
    execute_s3_image_upload(request).await
}

#[tauri::command]
pub(crate) async fn upload_picgo_image(
    request: PicGoImageUploadRequest,
) -> Result<UploadedImage, String> {
    execute_picgo_image_upload(request).await
}

async fn execute_webdav_image_upload(
    request: WebDavImageUploadRequest,
) -> Result<UploadedImage, String> {
    validate_image_bytes(&request.bytes)?;
    let extension = uploaded_image_extension(&request.mime_type)?;
    let file_name = uploaded_image_file_name(&request.file_name, extension)?;
    let targets = webdav_image_upload_targets(
        &request.server_url,
        &request.upload_path,
        &request.public_base_url,
        &file_name,
    )?;
    let client = image_upload_http_client(request.network.as_ref())?;

    for collection_url in webdav_collection_urls(&request.server_url, &request.upload_path)? {
        let response = apply_basic_auth(
            client.request(webdav_mkcol_method()?, collection_url),
            &request.username,
            &request.password,
        )
        .send()
        .await
        .map_err(|error| error.to_string())?;

        if !(response.status().is_success() || response.status().as_u16() == 405) {
            return Err(format!(
                "WebDAV collection could not be created: HTTP {}",
                response.status().as_u16()
            ));
        }
    }

    let response = apply_basic_auth(
        client
            .put(targets.upload_url.clone())
            .header(CONTENT_TYPE, request.mime_type)
            .body(request.bytes),
        &request.username,
        &request.password,
    )
    .send()
    .await
    .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "WebDAV image upload failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    Ok(UploadedImage {
        url: targets.public_url,
    })
}

async fn execute_picgo_image_upload(
    request: PicGoImageUploadRequest,
) -> Result<UploadedImage, String> {
    validate_image_bytes(&request.bytes)?;
    let extension = uploaded_image_extension(&request.mime_type)?;
    let file_name = uploaded_image_file_name(&request.file_name, extension)?;
    let upload_url = picgo_upload_endpoint_url(&request.server_url, &request.secret)?;
    let file_part = multipart::Part::bytes(request.bytes)
        .file_name(file_name)
        .mime_str(&request.mime_type)
        .map_err(|error| error.to_string())?;
    let form = multipart::Form::new().part("files", file_part);
    let client = image_upload_http_client(request.network.as_ref())?;
    let response = apply_picgo_auth(client.post(upload_url), &request.secret)
        .multipart(form)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "PicGo image upload failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    let response_body = response.text().await.map_err(|error| error.to_string())?;

    parse_picgo_upload_response(&response_body)
}

async fn execute_s3_image_upload(request: S3ImageUploadRequest) -> Result<UploadedImage, String> {
    validate_image_bytes(&request.bytes)?;
    let extension = uploaded_image_extension(&request.mime_type)?;
    let file_name = uploaded_image_file_name(&request.file_name, extension)?;
    let bucket = normalize_s3_bucket(&request.bucket)?;
    let access_key_id = required_trimmed(&request.access_key_id, "S3 access key ID")?;
    let region = required_trimmed(&request.region, "S3 region")?;
    let secret_access_key = required_untrimmed(&request.secret_access_key, "S3 secret access key")?;
    let targets = s3_image_upload_targets(
        &request.endpoint_url,
        &bucket,
        &request.upload_path,
        &request.public_base_url,
        &file_name,
    )?;
    let payload_hash = sha256_hex(&request.bytes);
    let (amz_date, date) = s3_amz_timestamp();
    let authorization = s3_authorization_header(
        &targets.upload_url,
        &request.mime_type,
        &payload_hash,
        &amz_date,
        &date,
        &region,
        &access_key_id,
        &secret_access_key,
    )?;
    let client = image_upload_http_client(request.network.as_ref())?;
    let response = client
        .put(targets.upload_url.clone())
        .header(CONTENT_TYPE, request.mime_type)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .header(AUTHORIZATION, authorization)
        .body(request.bytes)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "S3 image upload failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    Ok(UploadedImage {
        url: targets.public_url,
    })
}

pub(crate) fn webdav_image_upload_targets(
    server_url: &str,
    upload_path: &str,
    public_base_url: &str,
    file_name: &str,
) -> Result<ImageUploadTargets, String> {
    let upload_url = image_upload_url(server_url, upload_path, file_name)?;
    let public_url = if public_base_url.trim().is_empty() {
        upload_url.to_string()
    } else {
        image_upload_url(public_base_url, upload_path, file_name)?.to_string()
    };

    Ok(ImageUploadTargets {
        public_url,
        upload_url,
    })
}

pub(crate) fn s3_image_upload_targets(
    endpoint_url: &str,
    bucket: &str,
    upload_path: &str,
    public_base_url: &str,
    file_name: &str,
) -> Result<ImageUploadTargets, String> {
    let bucket = normalize_s3_bucket(bucket)?;
    let upload_segments = normalize_upload_path_segments(upload_path)?;
    let upload_url = s3_upload_url(endpoint_url, &bucket, &upload_segments, file_name)?;
    let public_url = if public_base_url.trim().is_empty() {
        upload_url.to_string()
    } else {
        image_upload_url(public_base_url, upload_path, file_name)?.to_string()
    };

    Ok(ImageUploadTargets {
        public_url,
        upload_url,
    })
}

fn s3_upload_url(
    endpoint_url: &str,
    bucket: &str,
    upload_segments: &[String],
    file_name: &str,
) -> Result<Url, String> {
    let mut url = validated_upload_base_url(endpoint_url)?;

    if s3_endpoint_uses_virtual_hosted_bucket(&url, bucket) {
        return url_with_segments(url, upload_segments, file_name);
    }

    if s3_endpoint_requires_virtual_hosted_bucket(&url) {
        let host = url
            .host_str()
            .ok_or_else(|| "S3 endpoint host is required".to_string())?
            .to_string();
        let virtual_host = format!("{bucket}.{host}");
        url.set_host(Some(&virtual_host))
            .map_err(|_| "S3 endpoint host is invalid".to_string())?;

        return url_with_segments(url, upload_segments, file_name);
    }

    let path_style_segments = [vec![bucket.to_string()], upload_segments.to_vec()].concat();

    url_with_segments(url, &path_style_segments, file_name)
}

fn s3_endpoint_uses_virtual_hosted_bucket(url: &Url, bucket: &str) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    let bucket = bucket.to_ascii_lowercase();

    host == bucket || host.starts_with(&format!("{bucket}."))
}

fn s3_endpoint_requires_virtual_hosted_bucket(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();

    // Several S3-compatible providers reject path-style addressing even though
    // generic self-hosted services such as MinIO still depend on it.
    (host.ends_with(".aliyuncs.com") && host.starts_with("oss-"))
        || (host.ends_with(".myqcloud.com") && host.starts_with("cos."))
        || host.contains(".digitaloceanspaces.com")
        || host.ends_with(".cwobject.com")
        || host == "cwobject.com"
        || host.contains(".myhuaweicloud.com")
}

fn image_upload_http_client(network: Option<&NetworkSettings>) -> Result<Client, String> {
    apply_network_settings(
        Client::builder().timeout(Duration::from_secs(IMAGE_UPLOAD_REQUEST_TIMEOUT_SECS)),
        network,
    )?
    .build()
    .map_err(|error| error.to_string())
}

fn apply_basic_auth(builder: RequestBuilder, username: &str, password: &str) -> RequestBuilder {
    if username.is_empty() && password.is_empty() {
        return builder;
    }

    builder.basic_auth(username.to_string(), Some(password.to_string()))
}

fn apply_picgo_auth(builder: RequestBuilder, secret: &str) -> RequestBuilder {
    let secret = secret.trim();
    if secret.is_empty() {
        return builder;
    }

    builder
        .bearer_auth(secret)
        .header("X-PicGo-Secret", secret.to_string())
}

fn webdav_mkcol_method() -> Result<Method, String> {
    Method::from_bytes(b"MKCOL").map_err(|error| error.to_string())
}

fn webdav_collection_urls(server_url: &str, upload_path: &str) -> Result<Vec<Url>, String> {
    let segments = normalize_upload_path_segments(upload_path)?;
    let mut urls = Vec::with_capacity(segments.len());

    for index in 0..segments.len() {
        urls.push(remote_url_with_segments(
            server_url,
            &segments[..=index],
            "",
        )?);
    }

    Ok(urls)
}

fn image_upload_url(base_url: &str, upload_path: &str, file_name: &str) -> Result<Url, String> {
    let segments = normalize_upload_path_segments(upload_path)?;

    remote_url_with_segments(base_url, &segments, file_name)
}

fn picgo_upload_endpoint_url(server_url: &str, secret: &str) -> Result<Url, String> {
    let mut url = validated_upload_base_url(server_url)?;
    let normalized_path = url.path().trim_end_matches('/').to_string();
    if normalized_path.is_empty() {
        url.set_path("/upload");
    } else if !normalized_path.ends_with("/upload") {
        url.set_path(&format!("{normalized_path}/upload"));
    }

    let secret = secret.trim();
    if !secret.is_empty() {
        let mut query = url.query_pairs_mut();
        query.append_pair("secret", secret);
        query.append_pair("key", secret);
    }

    Ok(url)
}

fn remote_url_with_segments(
    base_url: &str,
    upload_segments: &[String],
    file_name: &str,
) -> Result<Url, String> {
    let url = validated_upload_base_url(base_url)?;

    url_with_segments(url, upload_segments, file_name)
}

fn url_with_segments(
    mut url: Url,
    upload_segments: &[String],
    file_name: &str,
) -> Result<Url, String> {
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "Image upload URL cannot be used as a base URL".to_string())?;

        for segment in upload_segments {
            path_segments.push(segment);
        }

        if !file_name.is_empty() {
            path_segments.push(file_name);
        }
    }

    Ok(url)
}

fn validated_upload_base_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Image upload URL is required".to_string());
    }

    let mut url = Url::parse(trimmed).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS image upload URLs are supported".to_string());
    }

    url.set_query(None);
    url.set_fragment(None);
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);

    Ok(url)
}

fn normalize_upload_path_segments(upload_path: &str) -> Result<Vec<String>, String> {
    let normalized = upload_path.trim().replace('\\', "/");
    if normalized.is_empty() || normalized == "." {
        return Ok(Vec::new());
    }

    if normalized.starts_with('/') {
        return Err("Image upload path must be relative".to_string());
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err("Image upload path cannot contain parent directory segments".to_string());
        }

        segments.push(segment.to_string());
    }

    Ok(segments)
}

fn normalize_s3_bucket(value: &str) -> Result<String, String> {
    let bucket = value.trim();
    if bucket.is_empty() || bucket.contains('/') || bucket.contains('\\') {
        return Err("S3 bucket is invalid".to_string());
    }

    Ok(bucket.to_string())
}

fn required_trimmed(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is required"));
    }

    Ok(trimmed.to_string())
}

fn required_untrimmed<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }

    Ok(value)
}

fn validate_image_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("Image is empty".to_string());
    }

    Ok(())
}

fn uploaded_image_extension(mime_type: &str) -> Result<&'static str, String> {
    let normalized = mime_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "image/png" => Ok("png"),
        "image/jpeg" | "image/jpg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/avif" => Ok("avif"),
        "image/bmp" => Ok("bmp"),
        _ => Err("Image type is not supported".to_string()),
    }
}

fn uploaded_image_file_name(file_name: &str, extension: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || matches!(trimmed, "." | "..")
    {
        return Err("Image upload file name is invalid".to_string());
    }

    let stem = trimmed
        .rsplit_once('.')
        .map_or(trimmed, |(stem, _)| stem)
        .trim();
    if stem.is_empty() || matches!(stem, "." | "..") {
        return Err("Image upload file name is invalid".to_string());
    }

    Ok(format!("{stem}.{extension}"))
}

fn parse_picgo_upload_response(body: &str) -> Result<UploadedImage, String> {
    let value: serde_json::Value = serde_json::from_str(body).map_err(|error| error.to_string())?;
    if value.get("success").and_then(serde_json::Value::as_bool) == Some(false) {
        return Err(picgo_upload_response_message(&value)
            .unwrap_or_else(|| "PicGo image upload failed".to_string()));
    }

    let result = value
        .get("result")
        .ok_or_else(|| "PicGo image upload did not return an image URL".to_string())?;
    let url = result
        .as_array()
        .and_then(|urls| {
            urls.iter()
                .filter_map(serde_json::Value::as_str)
                .find(|url| !url.is_empty())
        })
        .or_else(|| result.as_str())
        .ok_or_else(|| "PicGo image upload did not return an image URL".to_string())?;

    validate_picgo_uploaded_url(url)?;

    Ok(UploadedImage {
        url: url.to_string(),
    })
}

fn picgo_upload_response_message(value: &serde_json::Value) -> Option<String> {
    ["message", "error"]
        .iter()
        .filter_map(|key| value.get(key).and_then(serde_json::Value::as_str))
        .find(|message| !message.trim().is_empty())
        .map(ToString::to_string)
}

fn validate_picgo_uploaded_url(value: &str) -> Result<(), String> {
    let url = Url::parse(value)
        .map_err(|_| "PicGo image upload returned an invalid image URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("PicGo image upload returned an unsupported image URL".to_string());
    }

    Ok(())
}

fn s3_authorization_header(
    upload_url: &Url,
    content_type: &str,
    payload_hash: &str,
    amz_date: &str,
    date: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
) -> Result<String, String> {
    let host = s3_host(upload_url)?;
    let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";
    let canonical_headers = format!(
        "content-type:{content_type}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    );
    let canonical_request = format!(
        "PUT\n{}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}",
        upload_url.path()
    );
    let credential_scope = format!("{date}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let signing_key = s3_signing_key(secret_access_key, date, region);
    let signature = hex_lower(&hmac_sha256(&signing_key, string_to_sign.as_bytes())?);

    Ok(format!(
        "AWS4-HMAC-SHA256 Credential={access_key_id}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    ))
}

fn s3_host(url: &Url) -> Result<String, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "S3 endpoint host is required".to_string())?;

    Ok(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    })
}

fn s3_signing_key(secret_access_key: &str, date: &str, region: &str) -> Vec<u8> {
    let date_key = hmac_sha256_unchecked(
        format!("AWS4{secret_access_key}").as_bytes(),
        date.as_bytes(),
    );
    let date_region_key = hmac_sha256_unchecked(&date_key, region.as_bytes());
    let date_region_service_key = hmac_sha256_unchecked(&date_region_key, b"s3");

    hmac_sha256_unchecked(&date_region_service_key, b"aws4_request")
}

fn s3_amz_timestamp() -> (String, String) {
    let now = OffsetDateTime::now_utc();
    let date = format!(
        "{:04}{:02}{:02}",
        now.year(),
        u8::from(now.month()),
        now.day()
    );
    let amz_date = format!(
        "{date}T{:02}{:02}{:02}Z",
        now.hour(),
        now.minute(),
        now.second()
    );

    (amz_date, date)
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex_lower(&Sha256::digest(bytes))
}

fn hmac_sha256(key: &[u8], bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|error| error.to_string())?;
    mac.update(bytes);

    Ok(mac.finalize().into_bytes().to_vec())
}

fn hmac_sha256_unchecked(key: &[u8], bytes: &[u8]) -> Vec<u8> {
    hmac_sha256(key, bytes).unwrap_or_default()
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);

    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_picgo_upload_response_urls() {
        let uploaded = parse_picgo_upload_response(
            r#"{"success":true,"result":["https://cdn.example.test/images/pasted-image.png"]}"#,
        )
        .expect("PicGo upload responses should parse");

        assert_eq!(
            uploaded,
            UploadedImage {
                url: "https://cdn.example.test/images/pasted-image.png".to_string()
            }
        );
    }

    #[test]
    fn builds_picgo_upload_endpoint_with_auth_compatibility_params() {
        let upload_url = picgo_upload_endpoint_url("http://127.0.0.1:36677", "server-secret")
            .expect("PicGo endpoint should be built");

        assert_eq!(
            upload_url.as_str(),
            "http://127.0.0.1:36677/upload?secret=server-secret&key=server-secret"
        );
    }

    #[test]
    fn builds_path_style_s3_upload_targets_for_generic_endpoints() {
        let targets = s3_image_upload_targets(
            "https://s3.example.com",
            "markra-images",
            "notes",
            "",
            "pasted-image.png",
        )
        .expect("S3 upload targets should be built");

        assert_eq!(
            targets.upload_url.as_str(),
            "https://s3.example.com/markra-images/notes/pasted-image.png"
        );
        assert_eq!(
            targets.public_url,
            "https://s3.example.com/markra-images/notes/pasted-image.png"
        );
    }

    #[test]
    fn builds_virtual_hosted_s3_upload_targets_for_aliyun_oss() {
        let targets = s3_image_upload_targets(
            "https://oss-cn-hangzhou.aliyuncs.com",
            "blocknews-dev",
            "Notes",
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com",
            "pasted-image.png",
        )
        .expect("Aliyun OSS upload targets should be built");

        assert_eq!(
            targets.upload_url.as_str(),
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com/Notes/pasted-image.png"
        );
        assert_eq!(
            targets.public_url,
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com/Notes/pasted-image.png"
        );
    }

    #[test]
    fn builds_virtual_hosted_s3_upload_targets_for_providers_that_require_it() {
        let cases = [
            (
                "https://cos.ap-beijing.myqcloud.com",
                "markra-1250000000",
                "https://markra-1250000000.cos.ap-beijing.myqcloud.com/notes/pasted-image.png",
            ),
            (
                "https://obs.cn-north-4.myhuaweicloud.com",
                "markra-images",
                "https://markra-images.obs.cn-north-4.myhuaweicloud.com/notes/pasted-image.png",
            ),
            (
                "https://cwobject.com",
                "markra-images",
                "https://markra-images.cwobject.com/notes/pasted-image.png",
            ),
            (
                "https://nyc3.digitaloceanspaces.com",
                "markra-images",
                "https://markra-images.nyc3.digitaloceanspaces.com/notes/pasted-image.png",
            ),
        ];

        for (endpoint, bucket, expected_upload_url) in cases {
            let targets =
                s3_image_upload_targets(endpoint, bucket, "notes", "", "pasted-image.png")
                    .expect("S3 upload targets should be built");

            assert_eq!(targets.upload_url.as_str(), expected_upload_url);
            assert_eq!(targets.public_url, expected_upload_url);
        }
    }

    #[test]
    fn does_not_duplicate_bucket_for_virtual_hosted_s3_endpoints() {
        let targets = s3_image_upload_targets(
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com",
            "blocknews-dev",
            "Notes",
            "",
            "pasted-image.png",
        )
        .expect("Virtual-hosted S3 upload targets should be built");

        assert_eq!(
            targets.upload_url.as_str(),
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com/Notes/pasted-image.png"
        );
        assert_eq!(
            targets.public_url,
            "https://blocknews-dev.oss-cn-hangzhou.aliyuncs.com/Notes/pasted-image.png"
        );
    }
}
