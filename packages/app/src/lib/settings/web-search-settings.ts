import type {
  WebSearchProviderId,
  WebSearchSettings
} from "@markra/ai";

export type { WebSearchProviderId, WebSearchSettings };

export const defaultWebSearchSettings: WebSearchSettings = {
  contentMaxChars: 12_000,
  enabled: true,
  maxResults: 5,
  providerId: "local-bing",
  searxngApiHost: ""
};

export function normalizeWebSearchSettings(value: unknown): WebSearchSettings {
  if (typeof value !== "object" || value === null) return defaultWebSearchSettings;

  const settings = value as Partial<WebSearchSettings>;

  return {
    contentMaxChars: normalizeWebSearchInteger(settings.contentMaxChars, {
      defaultValue: defaultWebSearchSettings.contentMaxChars,
      max: 40_000,
      min: 2_000
    }),
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : defaultWebSearchSettings.enabled,
    maxResults: normalizeWebSearchInteger(settings.maxResults, {
      defaultValue: defaultWebSearchSettings.maxResults,
      max: 20,
      min: 1
    }),
    providerId: settings.providerId === "searxng" ? "searxng" : defaultWebSearchSettings.providerId,
    searxngApiHost: normalizeWebSearchApiHost(settings.searxngApiHost)
  };
}

function normalizeWebSearchInteger(
  value: unknown,
  {
    defaultValue,
    max,
    min
  }: {
    defaultValue: number;
    max: number;
    min: number;
  }
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultValue;

  return Math.min(Math.max(Math.round(value), min), max);
}

function normalizeWebSearchApiHost(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";

    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/u, "");

    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}
