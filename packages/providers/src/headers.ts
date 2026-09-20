import { isRecord } from "@markra/shared";

import type { AiProviderConfig } from "./types";

const perplexityIntegrationHeader = "X-Pplx-Integration";

export function readAiProviderCustomHeaders(
  provider: Pick<AiProviderConfig, "baseUrl" | "customHeaders">
): Record<string, string> {
  const customHeaders = provider.customHeaders?.trim();
  if (!customHeaders) return addPerplexityIntegrationHeader({}, provider.baseUrl);

  let parsed: unknown;
  try {
    parsed = JSON.parse(customHeaders) as unknown;
  } catch {
    throw new Error("Custom headers must be a JSON object.");
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    throw new Error("Custom headers must be a JSON object.");
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    const normalizedName = name.trim();
    if (!normalizedName) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error("Custom header values must be strings, numbers, or booleans.");
    }

    headers[normalizedName] = String(value);
  }

  return addPerplexityIntegrationHeader(headers, provider.baseUrl);
}

function addPerplexityIntegrationHeader(headers: Record<string, string>, baseUrl?: string) {
  if (
    isDirectPerplexityBaseUrl(baseUrl) &&
    !Object.keys(headers).some((name) => name.toLowerCase() === perplexityIntegrationHeader.toLowerCase())
  ) {
    headers[perplexityIntegrationHeader] = "markra";
  }

  return headers;
}

function isDirectPerplexityBaseUrl(baseUrl?: string) {
  try {
    return new URL(baseUrl ?? "").hostname.toLowerCase() === "api.perplexity.ai";
  } catch {
    return false;
  }
}
