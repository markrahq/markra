use std::time::Duration;

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, ETAG, IF_MATCH, IF_NONE_MATCH};
use reqwest::{Client, Method, RequestBuilder, StatusCode, Url};
use serde::Deserialize;

use crate::network::{apply_network_settings, NetworkSettings};
use crate::s3::{s3_amz_timestamp, s3_authorization_header, s3_object_url, sha256_hex};

const S3_TEXT_FILE_TIMEOUT_SECS: u64 = 30;
const S3_TEXT_FILE_MAX_BYTES: usize = 2 * 1024 * 1024;
const S3_EMPTY_PAYLOAD_HASH: &str =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadS3TextFileRequest {
    access_key_id: String,
    bucket: String,
    endpoint_url: String,
    network: Option<NetworkSettings>,
    object_key: String,
    region: String,
    secret_access_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WriteS3TextFileRequest {
    access_key_id: String,
    bucket: String,
    contents: String,
    endpoint_url: String,
    network: Option<NetworkSettings>,
    object_key: String,
    region: String,
    secret_access_key: String,
}

struct S3TextFileCredentials<'a> {
    access_key_id: &'a str,
    region: &'a str,
    secret_access_key: &'a str,
}

fn required_trimmed<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }

    Ok(value)
}

fn required_untrimmed<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }

    Ok(value)
}

fn s3_text_file_key_parts(object_key: &str) -> Result<(String, String), String> {
    let normalized = object_key.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') {
        return Err("S3 text object key is invalid".to_string());
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err("S3 text object key cannot contain parent segments".to_string());
        }
        segments.push(segment);
    }
    let Some(file_name) = segments.pop() else {
        return Err("S3 text object key is invalid".to_string());
    };

    Ok((segments.join("/"), file_name.to_string()))
}

fn s3_text_file_url(endpoint_url: &str, bucket: &str, object_key: &str) -> Result<Url, String> {
    let (upload_path, file_name) = s3_text_file_key_parts(object_key)?;

    let upload_segments = if upload_path.is_empty() {
        Vec::new()
    } else {
        upload_path.split('/').map(str::to_string).collect()
    };

    s3_object_url(endpoint_url, bucket, &upload_segments, &file_name)
}

fn s3_text_file_client(network: Option<&NetworkSettings>) -> Result<Client, String> {
    apply_network_settings(
        Client::builder().timeout(Duration::from_secs(S3_TEXT_FILE_TIMEOUT_SECS)),
        network,
    )?
    .build()
    .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
fn s3_text_file_authorization_header(
    method: &str,
    object_url: &Url,
    content_type: Option<&str>,
    payload_hash: &str,
    amz_date: &str,
    date: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
) -> Result<String, String> {
    s3_authorization_header(
        method,
        object_url,
        content_type,
        payload_hash,
        amz_date,
        date,
        region,
        access_key_id,
        secret_access_key,
    )
}

fn signed_s3_text_file_request(
    client: &Client,
    method: Method,
    object_url: Url,
    content_type: Option<&str>,
    payload_hash: &str,
    credentials: &S3TextFileCredentials<'_>,
) -> Result<RequestBuilder, String> {
    let (amz_date, date) = s3_amz_timestamp();
    let authorization = s3_text_file_authorization_header(
        method.as_str(),
        &object_url,
        content_type,
        payload_hash,
        &amz_date,
        &date,
        credentials.region,
        credentials.access_key_id,
        credentials.secret_access_key,
    )?;
    let builder = client
        .request(method, object_url)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .header(AUTHORIZATION, authorization);

    Ok(match content_type {
        Some(content_type) => builder.header(CONTENT_TYPE, content_type),
        None => builder,
    })
}

fn s3_text_file_status_error(action: &str, object_key: &str, status: StatusCode) -> String {
    format!(
        "S3 settings backup {action} failed: {}: HTTP {}",
        object_key.replace(['\r', '\n'], " "),
        status.as_u16()
    )
}

fn s3_text_file_request_error(
    action: &str,
    object_key: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "S3 settings backup {action} failed: {}: {error}",
        object_key.replace(['\r', '\n'], " ")
    )
}

#[tauri::command]
pub(crate) async fn read_s3_text_file(request: ReadS3TextFileRequest) -> Result<String, String> {
    let credentials = S3TextFileCredentials {
        access_key_id: required_trimmed(&request.access_key_id, "S3 access key ID")?,
        region: required_trimmed(&request.region, "S3 region")?,
        secret_access_key: required_untrimmed(&request.secret_access_key, "S3 secret access key")?,
    };
    let client = s3_text_file_client(request.network.as_ref())?;
    let object_url = s3_text_file_url(&request.endpoint_url, &request.bucket, &request.object_key)?;
    let response = signed_s3_text_file_request(
        &client,
        Method::GET,
        object_url,
        None,
        S3_EMPTY_PAYLOAD_HASH,
        &credentials,
    )?
    .send()
    .await
    .map_err(|error| s3_text_file_request_error("download", &request.object_key, error))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Err("No S3 settings backup was found.".to_string());
    }
    if !response.status().is_success() {
        return Err(s3_text_file_status_error(
            "download",
            &request.object_key,
            response.status(),
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > S3_TEXT_FILE_MAX_BYTES as u64)
    {
        return Err("S3 settings backup is too large.".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| s3_text_file_request_error("download", &request.object_key, error))?;
    if bytes.len() > S3_TEXT_FILE_MAX_BYTES {
        return Err("S3 settings backup is too large.".to_string());
    }

    String::from_utf8(bytes.to_vec())
        .map_err(|_| "S3 settings backup is not valid UTF-8.".to_string())
}

async fn s3_text_file_write_state(
    client: &Client,
    object_url: Url,
    object_key: &str,
    credentials: &S3TextFileCredentials<'_>,
) -> Result<(bool, Option<String>), String> {
    let response = signed_s3_text_file_request(
        client,
        Method::HEAD,
        object_url,
        None,
        S3_EMPTY_PAYLOAD_HASH,
        credentials,
    )?
    .send()
    .await
    .map_err(|error| s3_text_file_request_error("metadata", object_key, error))?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok((false, None));
    }
    if !response.status().is_success() {
        return Err(s3_text_file_status_error(
            "metadata",
            object_key,
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
pub(crate) async fn write_s3_text_file(request: WriteS3TextFileRequest) -> Result<(), String> {
    if request.contents.len() > S3_TEXT_FILE_MAX_BYTES {
        return Err("S3 settings backup is too large.".to_string());
    }

    let credentials = S3TextFileCredentials {
        access_key_id: required_trimmed(&request.access_key_id, "S3 access key ID")?,
        region: required_trimmed(&request.region, "S3 region")?,
        secret_access_key: required_untrimmed(&request.secret_access_key, "S3 secret access key")?,
    };
    let client = s3_text_file_client(request.network.as_ref())?;
    let object_url = s3_text_file_url(&request.endpoint_url, &request.bucket, &request.object_key)?;
    let (remote_exists, remote_etag) = s3_text_file_write_state(
        &client,
        object_url.clone(),
        &request.object_key,
        &credentials,
    )
    .await?;
    let contents = request.contents.into_bytes();
    let payload_hash = sha256_hex(&contents);
    let mut write_request = signed_s3_text_file_request(
        &client,
        Method::PUT,
        object_url,
        Some("application/json; charset=utf-8"),
        &payload_hash,
        &credentials,
    )?
    .body(contents);
    write_request = if !remote_exists {
        write_request.header(IF_NONE_MATCH, "*")
    } else if let Some(etag) = remote_etag
        .as_deref()
        .map(str::trim)
        .filter(|etag| !etag.is_empty() && !etag.starts_with("W/"))
    {
        write_request.header(IF_MATCH, etag)
    } else {
        write_request
    };
    let response = write_request
        .send()
        .await
        .map_err(|error| s3_text_file_request_error("upload", &request.object_key, error))?;

    if response.status() == StatusCode::PRECONDITION_FAILED {
        return Err(
            "The S3 settings backup changed during upload. Retry after restoring the latest backup."
                .to_string(),
        );
    }
    if !response.status().is_success() {
        return Err(s3_text_file_status_error(
            "upload",
            &request.object_key,
            response.status(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{required_untrimmed, s3_text_file_authorization_header, s3_text_file_url};

    #[test]
    fn builds_path_style_and_virtual_hosted_s3_text_file_urls() {
        let path_style = s3_text_file_url(
            "https://s3.example.test",
            "mock-settings",
            "markra/settings/markra-settings.json",
        )
        .expect("path-style S3 URL should be built");
        let virtual_hosted = s3_text_file_url(
            "https://oss-cn-hangzhou.aliyuncs.com",
            "mock-settings",
            "markra/settings/markra-settings.json",
        )
        .expect("virtual-hosted S3 URL should be built");

        assert_eq!(
            path_style.as_str(),
            "https://s3.example.test/mock-settings/markra/settings/markra-settings.json"
        );
        assert_eq!(
            virtual_hosted.as_str(),
            "https://mock-settings.oss-cn-hangzhou.aliyuncs.com/markra/settings/markra-settings.json"
        );
    }

    #[test]
    fn signs_s3_text_file_get_requests() {
        let url = s3_text_file_url(
            "https://s3.example.test",
            "mock-settings",
            "markra/settings/markra-settings.json",
        )
        .expect("S3 URL should be built");
        let authorization = s3_text_file_authorization_header(
            "GET",
            &url,
            None,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "20300102T030405Z",
            "20300102",
            "ap-southeast-1",
            "mock-access-key",
            "mock-secret",
        )
        .expect("S3 GET request should be signed");

        assert!(authorization
            .contains("Credential=mock-access-key/20300102/ap-southeast-1/s3/aws4_request"));
        assert!(authorization.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
    }

    #[test]
    fn preserves_s3_secret_access_key_whitespace() {
        assert_eq!(
            required_untrimmed(" mock-secret ", "S3 secret access key"),
            Ok(" mock-secret ")
        );
    }
}
