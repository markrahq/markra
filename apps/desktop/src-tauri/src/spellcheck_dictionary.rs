use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use reqwest::header::{CONTENT_LENGTH, LOCATION};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::network::{apply_network_settings, NetworkSettings};
use crate::web_http::validated_web_resource_url;

const SPELLCHECK_DICTIONARY_MAX_BYTES: u64 = 8 * 1024 * 1024;
const SPELLCHECK_DICTIONARY_MAX_REDIRECTS: usize = 5;
const SPELLCHECK_DICTIONARY_REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpellcheckDictionaryRequest {
    allow_download: Option<bool>,
    force_download: Option<bool>,
    id: String,
    network: Option<NetworkSettings>,
    sha256: String,
    url: String,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpellcheckDictionaryCacheRequest {
    id: String,
    sha256: String,
    version: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpellcheckDictionaryResponse {
    contents: String,
    source: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpellcheckDictionaryStatusResponse {
    downloaded: bool,
}

#[tauri::command]
pub(crate) async fn load_spellcheck_dictionary(
    app: tauri::AppHandle,
    request: SpellcheckDictionaryRequest,
) -> Result<SpellcheckDictionaryResponse, String> {
    let relative_path =
        dictionary_cache_relative_path(&request.id, &request.version, &request.sha256)?;
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(relative_path);

    if !forces_dictionary_download(&request) {
        if let Ok(bytes) = fs::read(&cache_path) {
            if sha256_hex(&bytes) == request.sha256 {
                return Ok(SpellcheckDictionaryResponse {
                    contents: String::from_utf8(bytes).map_err(|error| error.to_string())?,
                    source: "cache".to_string(),
                });
            }
            let _ = fs::remove_file(&cache_path);
        }
    }

    if !allows_dictionary_download(&request) {
        return Err("Spellcheck dictionary is not downloaded.".to_string());
    }

    let bytes = download_dictionary_bytes(&request).await?;
    if sha256_hex(&bytes) != request.sha256 {
        return Err("Downloaded spellcheck dictionary failed sha256 verification.".to_string());
    }

    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&cache_path, &bytes).map_err(|error| error.to_string())?;

    Ok(SpellcheckDictionaryResponse {
        contents: String::from_utf8(bytes).map_err(|error| error.to_string())?,
        source: "download".to_string(),
    })
}

#[tauri::command]
pub(crate) async fn delete_spellcheck_dictionary(
    app: tauri::AppHandle,
    request: SpellcheckDictionaryCacheRequest,
) -> Result<(), String> {
    let relative_path =
        dictionary_cache_relative_path(&request.id, &request.version, &request.sha256)?;
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(relative_path);

    match fs::remove_file(&cache_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn get_spellcheck_dictionary_status(
    app: tauri::AppHandle,
    request: SpellcheckDictionaryCacheRequest,
) -> Result<SpellcheckDictionaryStatusResponse, String> {
    let relative_path =
        dictionary_cache_relative_path(&request.id, &request.version, &request.sha256)?;
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(relative_path);

    Ok(SpellcheckDictionaryStatusResponse {
        downloaded: dictionary_cache_matches_sha256(&cache_path, &request.sha256)?,
    })
}

async fn download_dictionary_bytes(
    request: &SpellcheckDictionaryRequest,
) -> Result<Vec<u8>, String> {
    let mut url = validated_web_resource_url(&request.url, false)?;
    let target = dictionary_download_diagnostic_target(&request.id);
    let client = apply_network_settings(
        reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(
                SPELLCHECK_DICTIONARY_REQUEST_TIMEOUT_SECS,
            )),
        request.network.as_ref(),
    )?
    .build()
    .map_err(|error| error.to_string())?;

    for _ in 0..=SPELLCHECK_DICTIONARY_MAX_REDIRECTS {
        let response = client
            .get(url.clone())
            .send()
            .await
            .map_err(|error| dictionary_download_request_error("GET", &target, error))?;
        let status = response.status();

        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "Dictionary redirect did not include a location.".to_string())?;
            let location = location.to_str().map_err(|error| error.to_string())?;
            let next_url = url.join(location).map_err(|error| error.to_string())?;
            url = validated_web_resource_url(next_url.as_str(), false)?;
            continue;
        }

        if !status.is_success() {
            return Err(dictionary_download_status_error(
                "GET",
                &target,
                status.as_u16(),
            ));
        }

        if let Some(content_length) = response.headers().get(CONTENT_LENGTH) {
            let content_length = content_length
                .to_str()
                .ok()
                .and_then(|value| value.parse::<u64>().ok());
            if content_length.is_some_and(|length| length > SPELLCHECK_DICTIONARY_MAX_BYTES) {
                return Err("Spellcheck dictionary is too large.".to_string());
            }
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|error| dictionary_download_request_error("GET", &target, error))?;
        if bytes.len() as u64 > SPELLCHECK_DICTIONARY_MAX_BYTES {
            return Err("Spellcheck dictionary is too large.".to_string());
        }

        return Ok(bytes.to_vec());
    }

    Err("Spellcheck dictionary download followed too many redirects.".to_string())
}

fn dictionary_download_status_error(method: &str, target: &str, status: u16) -> String {
    format!(
        "Spellcheck dictionary download failed: {method} {}: HTTP {status}",
        dictionary_download_diagnostic_path(target)
    )
}

fn dictionary_download_request_error(
    method: &str,
    target: &str,
    error: impl std::fmt::Display,
) -> String {
    format!(
        "Spellcheck dictionary download failed: {method} {}: {error}",
        dictionary_download_diagnostic_path(target)
    )
}

fn dictionary_download_diagnostic_target(id: &str) -> String {
    dictionary_download_diagnostic_path(&format!("dictionary {id}"))
}

fn dictionary_download_diagnostic_path(value: &str) -> String {
    let normalized = value
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
        "dictionary".to_string()
    } else {
        normalized.to_string()
    }
}

fn dictionary_cache_matches_sha256(cache_path: &Path, sha256: &str) -> Result<bool, String> {
    match fs::read(cache_path) {
        Ok(bytes) => {
            let matches = sha256_hex(&bytes) == sha256;
            if !matches {
                let _ = fs::remove_file(cache_path);
            }

            Ok(matches)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

fn allows_dictionary_download(request: &SpellcheckDictionaryRequest) -> bool {
    request.allow_download.unwrap_or(true)
}

fn forces_dictionary_download(request: &SpellcheckDictionaryRequest) -> bool {
    request.force_download.unwrap_or(false)
}

fn dictionary_cache_relative_path(
    id: &str,
    version: &str,
    sha256: &str,
) -> Result<PathBuf, String> {
    Ok(PathBuf::from("dictionaries")
        .join(normalize_dictionary_path_segment(id)?)
        .join(normalize_dictionary_path_segment(version)?)
        .join(format!(
            "{}.trie",
            normalize_dictionary_path_segment(sha256)?
        )))
}

fn normalize_dictionary_path_segment(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("Invalid spellcheck dictionary cache key.".to_string());
    }
    if !trimmed
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | '.'))
    {
        return Err("Invalid spellcheck dictionary cache key.".to_string());
    }

    Ok(trimmed.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex_lower(&Sha256::digest(bytes))
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn builds_dictionary_cache_path_from_safe_segments() {
        assert_eq!(
            dictionary_cache_relative_path("en-US", "4.4.35", "abc123").unwrap(),
            PathBuf::from("dictionaries")
                .join("en-US")
                .join("4.4.35")
                .join("abc123.trie")
        );
    }

    #[test]
    fn rejects_dictionary_cache_path_traversal() {
        assert!(dictionary_cache_relative_path("../en-US", "4.4.35", "abc123").is_err());
        assert!(dictionary_cache_relative_path("en-US", "../4.4.35", "abc123").is_err());
        assert!(dictionary_cache_relative_path("en-US", "4.4.35", "../abc123").is_err());
    }

    #[test]
    fn computes_dictionary_sha256_hex() {
        assert_eq!(
            sha256_hex(b"dictionary"),
            "177ca70f42def1238e36da329473263ed3feadd14094c079a2230be0193436f5"
        );
    }

    #[test]
    fn detects_current_cached_dictionary_status() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "markra-spellcheck-status-test-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let cache_path = root.join("dictionary.trie");

        fs::write(&cache_path, b"dictionary").unwrap();
        assert!(dictionary_cache_matches_sha256(
            &cache_path,
            "177ca70f42def1238e36da329473263ed3feadd14094c079a2230be0193436f5"
        )
        .unwrap());

        fs::write(&cache_path, b"changed").unwrap();
        assert!(!dictionary_cache_matches_sha256(&cache_path, "abc123").unwrap());
        assert!(!cache_path.exists());
        assert!(!dictionary_cache_matches_sha256(&cache_path, "abc123").unwrap());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn formats_dictionary_download_status_errors_with_request_context() {
        assert_eq!(
            dictionary_download_status_error("GET", "dictionary en-US", 404),
            "Spellcheck dictionary download failed: GET dictionary en-US: HTTP 404"
        );
        assert_eq!(
            dictionary_download_request_error("GET", "dictionary en-US", "timeout"),
            "Spellcheck dictionary download failed: GET dictionary en-US: timeout"
        );
    }

    #[test]
    fn builds_dictionary_download_diagnostic_targets() {
        assert_eq!(
            dictionary_download_diagnostic_target("en-US\nprivate"),
            "dictionary en-US private"
        );
    }

    #[test]
    fn supports_largest_initial_language_pack_size() {
        assert!(SPELLCHECK_DICTIONARY_MAX_BYTES >= 6_042_115);
    }

    #[test]
    fn allows_dictionary_downloads_by_default() {
        let request = SpellcheckDictionaryRequest {
            allow_download: None,
            force_download: None,
            id: "en-US".to_string(),
            network: None,
            sha256: "abc123".to_string(),
            url: "https://example.test/en.trie".to_string(),
            version: "4.4.35".to_string(),
        };
        assert!(allows_dictionary_download(&request));

        let request = SpellcheckDictionaryRequest {
            allow_download: Some(false),
            force_download: None,
            id: "en-US".to_string(),
            network: None,
            sha256: "abc123".to_string(),
            url: "https://example.test/en.trie".to_string(),
            version: "4.4.35".to_string(),
        };
        assert!(!allows_dictionary_download(&request));
    }

    #[test]
    fn does_not_force_dictionary_downloads_by_default() {
        let request = SpellcheckDictionaryRequest {
            allow_download: None,
            force_download: None,
            id: "en-US".to_string(),
            network: None,
            sha256: "abc123".to_string(),
            url: "https://example.test/en.trie".to_string(),
            version: "4.4.35".to_string(),
        };
        assert!(!forces_dictionary_download(&request));

        let request = SpellcheckDictionaryRequest {
            allow_download: Some(true),
            force_download: Some(true),
            id: "en-US".to_string(),
            network: None,
            sha256: "abc123".to_string(),
            url: "https://example.test/en.trie".to_string(),
            version: "4.4.35".to_string(),
        };
        assert!(forces_dictionary_download(&request));
    }
}
