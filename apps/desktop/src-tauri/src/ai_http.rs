use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;

use crate::network::{apply_network_settings, NetworkSettings};

const AI_PROVIDER_REQUEST_TIMEOUT_SECS: u64 = 20;
const AI_CHAT_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RequestTimeoutPolicy {
    Connect(Duration),
    Total(Duration),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiProviderJsonRequest {
    headers: HashMap<String, String>,
    method: String,
    network: Option<NetworkSettings>,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatCompletionRequest {
    body: String,
    headers: HashMap<String, String>,
    network: Option<NetworkSettings>,
    url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiProviderJsonResponse {
    status: u16,
    body: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum NativeChatStreamEvent {
    Chunk { chunk: String },
    Done { status: u16 },
}

#[tauri::command]
pub(crate) async fn request_ai_provider_json(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    execute_ai_provider_json_request(request).await
}

#[tauri::command]
pub(crate) async fn request_native_chat(
    request: ChatCompletionRequest,
) -> Result<AiProviderJsonResponse, String> {
    execute_native_chat_request(request).await
}

#[tauri::command]
pub(crate) async fn request_native_chat_stream(
    request: ChatCompletionRequest,
    on_event: Channel<NativeChatStreamEvent>,
) -> Result<AiProviderJsonResponse, String> {
    execute_native_chat_stream_request(request, on_event).await
}

async fn execute_ai_provider_json_request(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    let url = validated_ai_provider_url(&request)?;
    let headers = header_map_from_request(&request)?;
    let client = apply_network_settings(
        reqwest::Client::builder().timeout(Duration::from_secs(AI_PROVIDER_REQUEST_TIMEOUT_SECS)),
        request.network.as_ref(),
    )?
    .build()
    .map_err(|error| error.to_string())?;

    let response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;
    let body = response_body_json(&text);

    Ok(AiProviderJsonResponse { status, body })
}

async fn execute_native_chat_request(
    request: ChatCompletionRequest,
) -> Result<AiProviderJsonResponse, String> {
    let url = validated_http_url(&request.url)?;
    let headers = parse_headers(&request.headers)?;
    let client = apply_network_settings(chat_client_builder(false), request.network.as_ref())?
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(url)
        .headers(headers)
        .body(request.body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;
    let body = response_body_json(&text);

    Ok(AiProviderJsonResponse { status, body })
}

async fn execute_native_chat_stream_request(
    request: ChatCompletionRequest,
    on_event: Channel<NativeChatStreamEvent>,
) -> Result<AiProviderJsonResponse, String> {
    let url = validated_http_url(&request.url)?;
    let headers = parse_headers(&request.headers)?;
    let client = apply_network_settings(chat_client_builder(true), request.network.as_ref())?
        .build()
        .map_err(|error| error.to_string())?;

    let mut response = client
        .post(url)
        .headers(headers)
        .body(request.body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();

    if !response.status().is_success() {
        let text = response.text().await.map_err(|error| error.to_string())?;
        return Ok(AiProviderJsonResponse {
            status,
            body: response_body_json(&text),
        });
    }

    let mut pending_utf8 = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        let Some(chunk) = take_utf8_text(&mut pending_utf8, &chunk) else {
            continue;
        };

        on_event
            .send(NativeChatStreamEvent::Chunk { chunk })
            .map_err(|error| error.to_string())?;
    }

    if !pending_utf8.is_empty() {
        let chunk = String::from_utf8_lossy(&pending_utf8).to_string();
        pending_utf8.clear();
        on_event
            .send(NativeChatStreamEvent::Chunk { chunk })
            .map_err(|error| error.to_string())?;
    }

    on_event
        .send(NativeChatStreamEvent::Done { status })
        .map_err(|error| error.to_string())?;

    Ok(AiProviderJsonResponse {
        status,
        body: Value::Null,
    })
}

fn chat_client_builder(streaming: bool) -> reqwest::ClientBuilder {
    let builder = reqwest::Client::builder();

    match chat_request_timeout_policy(streaming) {
        // A total timeout would abort an otherwise healthy response stream after 60 seconds.
        RequestTimeoutPolicy::Connect(timeout) => builder.connect_timeout(timeout),
        RequestTimeoutPolicy::Total(timeout) => builder.timeout(timeout),
    }
}

fn chat_request_timeout_policy(streaming: bool) -> RequestTimeoutPolicy {
    let timeout = Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS);
    if streaming {
        RequestTimeoutPolicy::Connect(timeout)
    } else {
        RequestTimeoutPolicy::Total(timeout)
    }
}

fn take_utf8_text(pending: &mut Vec<u8>, chunk: &[u8]) -> Option<String> {
    pending.extend_from_slice(chunk);

    match std::str::from_utf8(pending) {
        Ok(text) => {
            let text = text.to_string();
            pending.clear();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        Err(error) if error.error_len().is_some() => {
            let text = String::from_utf8_lossy(pending).to_string();
            pending.clear();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        Err(error) => {
            let valid_up_to = error.valid_up_to();
            if valid_up_to == 0 {
                return None;
            }

            let text = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
            let incomplete = pending[valid_up_to..].to_vec();
            *pending = incomplete;
            Some(text)
        }
    }
}

fn validated_ai_provider_url(request: &AiProviderJsonRequest) -> Result<reqwest::Url, String> {
    if !request.method.eq_ignore_ascii_case("GET") {
        return Err("Only GET requests are supported for AI provider checks.".to_string());
    }

    validated_http_url(&request.url)
}

fn validated_http_url(url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS AI provider URLs are supported.".to_string());
    }

    Ok(url)
}

fn header_map_from_request(request: &AiProviderJsonRequest) -> Result<HeaderMap, String> {
    parse_headers(&request.headers)
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

fn response_body_json(text: &str) -> Value {
    if text.trim().is_empty() {
        return Value::Null;
    }

    serde_json::from_str(text).unwrap_or_else(|_| json!({ "message": text }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(method: &str, url: &str) -> AiProviderJsonRequest {
        AiProviderJsonRequest {
            headers: HashMap::new(),
            method: method.to_string(),
            network: None,
            url: url.to_string(),
        }
    }

    #[test]
    fn accepts_http_get_requests() {
        let url = validated_ai_provider_url(&request("GET", "http://localhost:11434/v1/models"))
            .expect("url should be accepted");

        assert_eq!(url.as_str(), "http://localhost:11434/v1/models");
    }

    #[test]
    fn rejects_non_get_requests() {
        let error = validated_ai_provider_url(&request("POST", "https://api.openai.com/v1/models"))
            .expect_err("POST should be rejected");

        assert!(error.contains("Only GET"));
    }

    #[test]
    fn rejects_non_http_urls() {
        let error = validated_ai_provider_url(&request("GET", "file:///tmp/secret"))
            .expect_err("file URLs should be rejected");

        assert!(error.contains("HTTP and HTTPS"));
    }

    #[test]
    fn accepts_http_chat_post_urls() {
        let url = validated_http_url("https://api.openai.com/v1/chat/completions")
            .expect("chat completion URL should be accepted");

        assert_eq!(url.as_str(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn parses_shared_request_headers() {
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "application/json".to_string());
        headers.insert("authorization".to_string(), "Bearer test".to_string());

        let parsed = parse_headers(&headers).expect("headers should parse");

        assert_eq!(parsed.get("content-type").unwrap(), "application/json");
        assert_eq!(parsed.get("authorization").unwrap(), "Bearer test");
    }

    #[test]
    fn converts_json_and_text_response_bodies() {
        assert_eq!(response_body_json(r#"{"data":[]}"#), json!({ "data": [] }));
        assert_eq!(
            response_body_json("Unauthorized"),
            json!({ "message": "Unauthorized" })
        );
    }

    #[test]
    fn serializes_native_chat_stream_events_for_frontend_channels() {
        let event = NativeChatStreamEvent::Chunk {
            chunk: "data: test".to_string(),
        };

        assert_eq!(
            serde_json::to_value(event).expect("event should serialize"),
            json!({ "type": "chunk", "chunk": "data: test" })
        );
    }

    #[test]
    fn preserves_utf8_stream_chunks_split_across_boundaries() {
        let bytes = "你好".as_bytes();
        let mut pending = Vec::new();

        assert_eq!(take_utf8_text(&mut pending, &bytes[..1]), None);
        assert_eq!(
            take_utf8_text(&mut pending, &bytes[1..]),
            Some("你好".to_string())
        );
        assert!(pending.is_empty());
    }

    #[test]
    fn limits_only_connection_setup_for_streaming_chat_requests() {
        assert_eq!(
            chat_request_timeout_policy(true),
            RequestTimeoutPolicy::Connect(Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS))
        );
        assert_eq!(
            chat_request_timeout_policy(false),
            RequestTimeoutPolicy::Total(Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS))
        );
    }
}
