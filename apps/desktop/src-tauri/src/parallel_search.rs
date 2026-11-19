use std::time::Duration;

use reqwest13::{redirect::Policy, Client, Proxy};
use rmcp::{
    model::{CallToolRequestParams, CallToolResult, ClientConfig, Implementation, ProtocolVersion},
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport,
    },
    ServiceExt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::network::{enabled_proxy_url, NetworkSettings};

const PARALLEL_MCP_URL: &str = "https://mcp.parallel.ai/mcp";
const MARKRA_VERSION: &str = env!("CARGO_PKG_VERSION");
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct ParallelSearchHit {
    url: String,
    title: Option<String>,
    excerpts: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct ParallelSearchResponse {
    results: Vec<ParallelSearchHit>,
}

#[tauri::command]
pub(crate) async fn search_parallel(
    query: String,
    network: Option<NetworkSettings>,
) -> Result<Vec<ParallelSearchHit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Search query cannot be empty.".into());
    }

    let client = parallel_http_client(network.as_ref())?;
    search(PARALLEL_MCP_URL, query, client).await
}

fn parallel_http_client(network: Option<&NetworkSettings>) -> Result<Client, String> {
    // Use the same bundled roots and TLS provider as Markra's other web requests.
    let provider = rustls::crypto::ring::default_provider();
    let mut tls = rustls::ClientConfig::builder_with_provider(provider.into())
        .with_safe_default_protocol_versions()
        .map_err(|err| err.to_string())?
        .with_root_certificates(rustls::RootCertStore {
            roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
        })
        .with_no_client_auth();
    tls.alpn_protocols = vec![b"http/1.1".to_vec()];
    let mut builder = Client::builder()
        .tls_backend_preconfigured(tls)
        .redirect(Policy::none())
        .pool_max_idle_per_host(0)
        .timeout(REQUEST_TIMEOUT)
        .user_agent(concat!("Markra/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy_url) = enabled_proxy_url(network)? {
        // The only search destination is public, so local-address bypass does not apply.
        builder = builder.proxy(Proxy::all(proxy_url.as_str()).map_err(|err| err.to_string())?);
    }
    builder.build().map_err(|err| err.to_string())
}

async fn search(
    endpoint: impl Into<std::sync::Arc<str>>,
    query: &str,
    http: Client,
) -> Result<Vec<ParallelSearchHit>, String> {
    let transport = StreamableHttpClientTransport::with_client(
        http,
        StreamableHttpClientTransportConfig::with_uri(endpoint).reinit_on_expired_session(false),
    );
    let client = ClientConfig::new(
        Default::default(),
        Implementation::new("Markra", MARKRA_VERSION),
    )
    .with_protocol_version(ProtocolVersion::V_2025_11_25);
    let mut service = tokio::time::timeout(REQUEST_TIMEOUT, client.serve(transport))
        .await
        .map_err(|_| "Parallel search connection timed out.".to_string())?
        .map_err(|err| format!("Could not connect to Parallel search: {err}"))?;
    let request = CallToolRequestParams::new("web_search").with_arguments(
        [
            ("objective".into(), json!(query)),
            ("search_queries".into(), json!([query])),
        ]
        .into_iter()
        .collect(),
    );
    let result = tokio::time::timeout(REQUEST_TIMEOUT, service.call_tool(request)).await;
    let _ = service.close_with_timeout(Duration::from_secs(1)).await;

    let result = result
        .map_err(|_| "Parallel search timed out.".to_string())?
        .map_err(|err| format!("Parallel search failed: {err}"))?;
    parse_search_response(result)
}

fn parse_search_response(result: CallToolResult) -> Result<Vec<ParallelSearchHit>, String> {
    if result.is_error == Some(true) {
        return Err("Parallel search returned an error.".into());
    }

    let content = result.structured_content.or_else(|| {
        result.content.iter().find_map(|item| {
            let text = item.as_text()?;
            serde_json::from_str::<Value>(&text.text).ok()
        })
    });
    content
        .and_then(|value| serde_json::from_value::<ParallelSearchResponse>(value).ok())
        .map(|response| response.results)
        .ok_or_else(|| "Parallel search returned an invalid response.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_structured_and_text_tool_results() {
        let content = json!({
            "results": [{
                "url": "https://example.com/release",
                "title": "Release notes",
                "excerpts": ["A readable passage."]
            }]
        });

        for result in [
            CallToolResult::structured(content.clone()),
            CallToolResult::success(vec![rmcp::model::ContentBlock::text(content.to_string())]),
        ] {
            let hits = parse_search_response(result).unwrap();
            assert_eq!(hits.len(), 1);
            assert_eq!(hits[0].url, "https://example.com/release");
            assert_eq!(hits[0].excerpts.as_ref().unwrap(), &["A readable passage."]);
        }
    }

    #[test]
    fn reports_server_errors_without_using_their_content_as_results() {
        let result =
            CallToolResult::error(vec![rmcp::model::ContentBlock::text("Transient error")]);
        assert_eq!(
            parse_search_response(result).unwrap_err(),
            "Parallel search returned an error."
        );
    }
}
