export type NetworkSettings = {
  bypassLocalAddresses: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
};

export const defaultNetworkSettings: NetworkSettings = {
  bypassLocalAddresses: true,
  proxyEnabled: false,
  proxyUrl: ""
};

export function normalizeNetworkSettings(value: unknown): NetworkSettings {
  if (typeof value !== "object" || value === null) return { ...defaultNetworkSettings };

  const settings = value as Partial<NetworkSettings>;
  const proxyUrl = normalizeProxyUrl(settings.proxyUrl);
  if (settings.proxyEnabled === true && !proxyUrl) return { ...defaultNetworkSettings };

  const proxyEnabled = typeof settings.proxyEnabled === "boolean"
    ? settings.proxyEnabled && proxyUrl.length > 0
    : defaultNetworkSettings.proxyEnabled;

  return {
    bypassLocalAddresses:
      typeof settings.bypassLocalAddresses === "boolean"
        ? settings.bypassLocalAddresses
        : defaultNetworkSettings.bypassLocalAddresses,
    proxyEnabled,
    proxyUrl
  };
}

function normalizeProxyUrl(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol)) return "";
    if (!url.hostname) return "";

    url.pathname = "";
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/u, "");
  } catch {
    return "";
  }
}
