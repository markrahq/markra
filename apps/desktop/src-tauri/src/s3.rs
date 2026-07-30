use hmac::{Hmac, Mac};
use reqwest::Url;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

type HmacSha256 = Hmac<Sha256>;

pub(crate) fn normalize_s3_bucket(value: &str) -> Result<String, String> {
    let bucket = value.trim();
    if bucket.is_empty() || bucket.contains('/') || bucket.contains('\\') {
        return Err("S3 bucket is invalid".to_string());
    }

    Ok(bucket.to_string())
}

pub(crate) fn s3_object_url(
    endpoint_url: &str,
    bucket: &str,
    object_segments: &[String],
    file_name: &str,
) -> Result<Url, String> {
    let bucket = normalize_s3_bucket(bucket)?;
    let mut url = validated_s3_endpoint_url(endpoint_url)?;

    if s3_endpoint_uses_virtual_hosted_bucket(&url, &bucket) {
        return s3_url_with_segments(url, object_segments, file_name);
    }

    if s3_endpoint_requires_virtual_hosted_bucket(&url) {
        let host = url
            .host_str()
            .ok_or_else(|| "S3 endpoint host is required".to_string())?
            .to_string();
        let virtual_host = format!("{bucket}.{host}");
        url.set_host(Some(&virtual_host))
            .map_err(|_| "S3 endpoint host is invalid".to_string())?;

        return s3_url_with_segments(url, object_segments, file_name);
    }

    let path_style_segments = [vec![bucket], object_segments.to_vec()].concat();

    s3_url_with_segments(url, &path_style_segments, file_name)
}

fn validated_s3_endpoint_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("S3 endpoint URL is required".to_string());
    }

    let mut url = Url::parse(trimmed).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS S3 endpoint URLs are supported".to_string());
    }

    url.set_query(None);
    url.set_fragment(None);
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);

    Ok(url)
}

fn s3_url_with_segments(
    mut url: Url,
    object_segments: &[String],
    file_name: &str,
) -> Result<Url, String> {
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| "S3 endpoint URL cannot be used as a base URL".to_string())?;

        for segment in object_segments {
            path_segments.push(segment);
        }
        if !file_name.is_empty() {
            path_segments.push(file_name);
        }
    }

    Ok(url)
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

    // These providers reject path-style addressing, while generic self-hosted
    // S3 services such as MinIO still commonly depend on it.
    (host.ends_with(".aliyuncs.com") && host.starts_with("oss-"))
        || (host.ends_with(".myqcloud.com") && host.starts_with("cos."))
        || host.contains(".digitaloceanspaces.com")
        || host.ends_with(".cwobject.com")
        || host == "cwobject.com"
        || host.contains(".myhuaweicloud.com")
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn s3_authorization_header(
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
    let host = s3_host(object_url)?;
    let (canonical_headers, signed_headers) = match content_type {
        Some(content_type) => (
            format!(
                "content-type:{content_type}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
            ),
            "content-type;host;x-amz-content-sha256;x-amz-date",
        ),
        None => (
            format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"),
            "host;x-amz-content-sha256;x-amz-date",
        ),
    };
    let canonical_request = format!(
        "{method}\n{}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}",
        object_url.path()
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

pub(crate) fn s3_amz_timestamp() -> (String, String) {
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

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
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
