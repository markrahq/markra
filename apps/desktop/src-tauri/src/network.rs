use reqwest::{ClientBuilder, NoProxy, Proxy, Url};
use serde::Deserialize;

const LOCAL_ADDRESS_NO_PROXY: &str =
    "localhost,.localhost,.local,127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NetworkSettings {
    bypass_local_addresses: bool,
    proxy_enabled: bool,
    proxy_url: String,
}

pub(crate) fn apply_network_settings(
    builder: ClientBuilder,
    network: Option<&NetworkSettings>,
) -> Result<ClientBuilder, String> {
    let Some(proxy_url) = enabled_proxy_url(network)? else {
        return Ok(builder);
    };

    let mut proxy = Proxy::all(proxy_url.as_str()).map_err(|error| error.to_string())?;

    if network.is_some_and(|settings| settings.bypass_local_addresses) {
        proxy = proxy.no_proxy(NoProxy::from_string(LOCAL_ADDRESS_NO_PROXY));
    }

    Ok(builder.proxy(proxy))
}

pub(crate) fn enabled_proxy_url(network: Option<&NetworkSettings>) -> Result<Option<Url>, String> {
    network
        .filter(|settings| settings.proxy_enabled && !settings.proxy_url.trim().is_empty())
        .map(|settings| validated_proxy_url(&settings.proxy_url))
        .transpose()
}

fn validated_proxy_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h") {
        return Err("Only HTTP, HTTPS, SOCKS5, and SOCKS5H proxy URLs are supported.".to_string());
    }

    if url.host_str().is_none() {
        return Err("Proxy URL must include a host.".to_string());
    }

    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_http_and_socks_proxy_urls() {
        assert_eq!(
            validated_proxy_url("http://127.0.0.1:7890")
                .expect("http proxy should parse")
                .scheme(),
            "http"
        );
        assert_eq!(
            validated_proxy_url("socks5://127.0.0.1:1080")
                .expect("socks5 proxy should parse")
                .scheme(),
            "socks5"
        );
        assert_eq!(
            validated_proxy_url("socks5h://proxy.example.test:1080")
                .expect("socks5h proxy should parse")
                .scheme(),
            "socks5h"
        );
    }

    #[test]
    fn rejects_unsupported_proxy_urls() {
        let error = validated_proxy_url("ftp://proxy.example.test:21")
            .expect_err("ftp proxy should be rejected");

        assert!(error.contains("HTTP, HTTPS, SOCKS5"));
    }

    #[test]
    fn builds_clients_with_and_without_network_settings() {
        apply_network_settings(ClientBuilder::new(), None)
            .expect("missing network settings should keep client builder usable")
            .build()
            .expect("direct client should build");
        apply_network_settings(
            ClientBuilder::new(),
            Some(&NetworkSettings {
                bypass_local_addresses: true,
                proxy_enabled: true,
                proxy_url: "socks5://127.0.0.1:1080".to_string(),
            }),
        )
        .expect("socks proxy should be accepted")
        .build()
        .expect("proxied client should build");
    }
}
