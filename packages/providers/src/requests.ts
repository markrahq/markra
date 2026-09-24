import type { AiModelCapability, AiProviderApiStyle, AiProviderConfig, AiProviderModel, AiProviderRequestStyle } from "./providers";
import {
  enrichAiProviderModelCapabilities,
  normalizeAiModelCapabilities,
  providerRequiresApiKey,
  readAiProviderCustomHeaders
} from "./providers";
import { isRecord, joinApiUrl } from "@markra/shared";

type NativeAiHttpRequest = {
  headers: Record<string, string>;
  method: "GET";
  url: string;
};

type NativeAiHttpResponse = {
  body: unknown;
  status: number;
};

export type AiProviderHttpRequest = NativeAiHttpRequest;
export type AiProviderHttpResponse = NativeAiHttpResponse;
export type AiProviderTransport = (request: AiProviderHttpRequest) => Promise<AiProviderHttpResponse>;

type ProviderEndpoint = {
  auth: "anthropic" | "azure" | "bearer" | "google" | "none";
  baseUrl: string;
  path: string;
};

const anthropicVersion = "2023-06-01";

const endpointByApiStyle: Record<AiProviderApiStyle, ProviderEndpoint> = {
  anthropic: {
    auth: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    path: "/models"
  },
  "azure-openai": {
    auth: "azure",
    baseUrl: "",
    path: "/openai/models?api-version=2024-10-21"
  },
  deepseek: {
    auth: "bearer",
    baseUrl: "https://api.deepseek.com",
    path: "/models"
  },
  google: {
    auth: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    path: "/models"
  },
  groq: {
    auth: "bearer",
    baseUrl: "https://api.groq.com/openai/v1",
    path: "/models"
  },
  mistral: {
    auth: "bearer",
    baseUrl: "https://api.mistral.ai/v1",
    path: "/models"
  },
  ollama: {
    auth: "none",
    baseUrl: "http://localhost:11434/v1",
    path: "/models"
  },
  openai: {
    auth: "bearer",
    baseUrl: "https://api.openai.com/v1",
    path: "/models"
  },
  "openai-compatible": {
    auth: "bearer",
    baseUrl: "",
    path: "/models"
  },
  openrouter: {
    auth: "bearer",
    baseUrl: "https://openrouter.ai/api/v1",
    path: "/models"
  },
  together: {
    auth: "bearer",
    baseUrl: "https://api.together.xyz/v1",
    path: "/models"
  },
  xai: {
    auth: "bearer",
    baseUrl: "https://api.x.ai/v1",
    path: "/models"
  }
};

const endpointByRequestStyle: Record<AiProviderRequestStyle, ProviderEndpoint | null> = {
  anthropic: endpointByApiStyle.anthropic,
  google: endpointByApiStyle.google,
  "openai-compatible": endpointByApiStyle["openai-compatible"],
  "openai-responses": endpointByApiStyle.openai
};

// Requesty lists its curated managed models here; any id from the full /models catalog still works in chat.
const modelsPathByProviderId: Partial<Record<string, string>> = {
  requesty: "/models/managed"
};

export function buildAiProviderModelsRequest(provider: AiProviderConfig): AiProviderHttpRequest {
  const endpoint = provider.apiStyle ? endpointByRequestStyle[provider.apiStyle] : endpointByApiStyle[provider.type];
  if (!endpoint) throw new Error("Model list is not available for this API style.");
  const baseUrl = provider.baseUrl?.trim() || endpoint.baseUrl;
  if (!baseUrl) throw new Error("API URL is required.");

  return {
    headers: {
      ...buildAuthHeaders(endpoint.auth, readProviderApiKey(provider)),
      ...readAiProviderCustomHeaders(provider)
    },
    method: "GET",
    url: joinApiUrl(baseUrl, modelsPathByProviderId[provider.id] ?? endpoint.path)
  };
}

export async function testAiProviderConnection(
  provider: AiProviderConfig,
  transport: AiProviderTransport = missingAiProviderTransport
) {
  const response = await transport(buildAiProviderModelsRequest(provider));
  if (!isSuccessfulStatus(response.status)) throw new Error(readResponseError(response));

  return {
    message: "Connected",
    ok: true
  };
}

export async function fetchAiProviderModels(
  provider: AiProviderConfig,
  transport: AiProviderTransport = missingAiProviderTransport
): Promise<AiProviderModel[]> {
  const response = await transport(buildAiProviderModelsRequest(provider));
  if (!isSuccessfulStatus(response.status)) throw new Error(readResponseError(response));

  const models = parseAiProviderModels(provider, response.body);
  if (models.length === 0) throw new Error("No models returned.");

  return models;
}

function missingAiProviderTransport(): never {
  throw new Error("AI provider transport is not configured.");
}

export function parseAiProviderModels(provider: AiProviderConfig, body: unknown): AiProviderModel[] {
  const apiStyle = provider.apiStyle ?? provider.type;
  const records = readModelRecords(apiStyle, body);
  const seenIds = new Set<string>();
  const models: AiProviderModel[] = [];

  for (const record of records) {
    const id = readModelId(apiStyle, record);
    if (!id || seenIds.has(id)) continue;

    const capabilities =
      provider.id === "requesty" ? inferRequestyCapabilities(record, id) : inferModelCapabilities(apiStyle, record, id);
    if (capabilities.length === 0) continue;

    seenIds.add(id);
    models.push(enrichAiProviderModelCapabilities(provider.id, {
      capabilities,
      enabled: true,
      id,
      name: readModelName(apiStyle, record, id)
    }));
  }

  return models;
}

function buildAuthHeaders(auth: ProviderEndpoint["auth"], apiKey: string): Record<string, string> {
  if (auth === "none" || !apiKey) return {};
  if (auth === "anthropic") return { "anthropic-version": anthropicVersion, "x-api-key": apiKey };
  if (auth === "azure") return { "api-key": apiKey };
  if (auth === "google") return { "x-goog-api-key": apiKey };

  return { Authorization: `Bearer ${apiKey}` };
}

function readProviderApiKey(provider: AiProviderConfig) {
  return providerRequiresApiKey(provider) ? provider.apiKey?.trim() ?? "" : "";
}

function readModelRecords(apiStyle: AiProviderApiStyle | AiProviderRequestStyle, body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (!isRecord(body)) return [];

  if (Array.isArray(body.data)) return body.data.filter(isRecord);
  if (Array.isArray(body.models)) return body.models.filter(isRecord);
  if (apiStyle === "xai" && Array.isArray(body.language_models)) return body.language_models.filter(isRecord);

  return [];
}

function readModelId(apiStyle: AiProviderApiStyle | AiProviderRequestStyle, record: Record<string, unknown>) {
  const id = typeof record.id === "string" ? record.id : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;

  if (apiStyle === "google" && name?.startsWith("models/")) return name.slice("models/".length);

  return id ?? name;
}

function readModelName(apiStyle: AiProviderApiStyle | AiProviderRequestStyle, record: Record<string, unknown>, id: string) {
  if (typeof record.displayName === "string") return record.displayName;
  if (typeof record.display_name === "string") return record.display_name;
  if (typeof record.name === "string" && !(apiStyle === "google" && record.name.startsWith("models/"))) return record.name;

  return id;
}

// Converts provider-specific model metadata into Markra's internal capability flags.
function inferModelCapabilities(apiStyle: AiProviderApiStyle | AiProviderRequestStyle, record: Record<string, unknown>, id: string): AiModelCapability[] {
  if (apiStyle === "google") return inferGoogleCapabilities(record, id);
  if (apiStyle === "openrouter") return inferOpenRouterCapabilities(record, id);

  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  if (type.includes("image")) return ["image"];
  if (isUnsupportedModelCapability(type)) return [];

  const capabilities = inferCapabilitiesFromId(id);
  if (type.includes("vision")) capabilities.push("vision");

  return normalizeAiModelCapabilities(capabilities, []);
}

// Infers capabilities from Google's model-list shape.
function inferGoogleCapabilities(record: Record<string, unknown>, id: string): AiModelCapability[] {
  const normalizedId = id.toLowerCase();
  const methods = Array.isArray(record.supportedGenerationMethods)
    ? record.supportedGenerationMethods.filter((method): method is string => typeof method === "string")
    : [];

  if (methods.some((method) => method.toLowerCase().includes("embed"))) return [];
  if (isUnsupportedModelCapability(normalizedId)) return [];
  if (normalizedId.includes("gemini")) {
    const capabilities: AiModelCapability[] = [...inferCapabilitiesFromId(id), "vision", "reasoning", "tools"];
    capabilities.push("web");

    return normalizeAiModelCapabilities(capabilities, []);
  }

  return ["text"];
}

// Infers capabilities from OpenRouter architecture metadata.
function inferOpenRouterCapabilities(record: Record<string, unknown>, id: string): AiModelCapability[] {
  const architecture = isRecord(record.architecture) ? record.architecture : undefined;
  const modality = typeof architecture?.modality === "string" ? architecture.modality.toLowerCase() : "";
  const outputModalities = Array.isArray(architecture?.output_modalities)
    ? architecture.output_modalities.filter((modality): modality is string => typeof modality === "string")
    : [];
  const supportedParameters = Array.isArray(architecture?.supported_parameters)
    ? architecture.supported_parameters.filter((parameter): parameter is string => typeof parameter === "string")
    : Array.isArray(record.supported_parameters)
      ? record.supported_parameters.filter((parameter): parameter is string => typeof parameter === "string")
      : [];

  if (outputModalities.some((modality) => modality.toLowerCase() === "audio") || modality.includes("audio")) return [];
  if (isUnsupportedModelCapability(modality)) return [];

  const capabilities = inferCapabilitiesFromId(id);
  if (outputModalities.some((modality) => modality.toLowerCase() === "image") || modality.includes("->image")) {
    capabilities.push("image");
  }
  if (modality.includes("image")) capabilities.push("vision");
  if (supportedParameters.some((parameter) => parameter.toLowerCase().includes("reasoning"))) capabilities.push("reasoning");
  if (supportedParameters.some((parameter) => parameter.toLowerCase().includes("tool"))) capabilities.push("tools");
  if (supportedParameters.some((parameter) => parameter.toLowerCase().includes("web"))) capabilities.push("web");

  return normalizeAiModelCapabilities(capabilities, []);
}

// Infers capabilities from Requesty's supports_* model metadata.
function inferRequestyCapabilities(record: Record<string, unknown>, id: string): AiModelCapability[] {
  if (typeof record.api === "string" && record.api !== "chat") return [];

  const capabilities = inferCapabilitiesFromId(id);
  if (capabilities.length === 0) return [];
  if (record.supports_vision === true) capabilities.push("vision");
  if (record.supports_reasoning === true) capabilities.push("reasoning");
  if (record.supports_tool_calling === true) capabilities.push("tools");

  return normalizeAiModelCapabilities(capabilities, []);
}

// Infers capabilities from a model id when provider metadata is sparse.
function inferCapabilitiesFromId(id: string): AiModelCapability[] {
  const normalizedId = id.toLowerCase();
  if (normalizedId.includes("image") || normalizedId.includes("dall")) return ["image"];
  if (isUnsupportedModelCapability(normalizedId)) return [];

  const capabilities: AiModelCapability[] = ["text"];
  if (normalizedId.includes("vision")) capabilities.push("vision");
  if (normalizedId.includes("gpt-5")) capabilities.push("vision", "reasoning", "tools", "web");
  if (normalizedId.includes("kimi-k2.5")) capabilities.push("vision", "reasoning", "tools");
  if (normalizedId.includes("deepseek-v4") || normalizedId.includes("deepseek-v3.2") || normalizedId.includes("deepseek-v3-2")) {
    capabilities.push("reasoning", "tools");
  }
  if (normalizedId.includes("qwen3.6-plus") || normalizedId.includes("qwen3.5-flash")) {
    capabilities.push("vision", "reasoning", "tools", "web");
  }
  if (normalizedId.includes("qwen3-max")) capabilities.push("reasoning", "tools", "web");
  if (normalizedId.includes("reasoning") || normalizedId.includes("thinking") || /(^|[-/:])r1($|[-/:])/.test(normalizedId)) {
    capabilities.push("reasoning");
  }
  if (/(^|[-/:])r1($|[-/:])/.test(normalizedId) && normalizedId.includes("deepseek")) capabilities.push("tools");

  return normalizeAiModelCapabilities(capabilities, []);
}

// Identifies model-list entries that are not useful for Markra chat/image workflows.
function isUnsupportedModelCapability(value: string) {
  return (
    value.includes("audio") ||
    value.includes("embed") ||
    value.includes("moderation") ||
    value.includes("rerank") ||
    value.includes("sora") ||
    value.includes("tts") ||
    value.includes("video") ||
    value.includes("whisper")
  );
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300;
}

function readResponseError(response: AiProviderHttpResponse) {
  if (isRecord(response.body)) {
    const message = readNestedMessage(response.body);
    if (message) return message;
  }

  return `Request failed with HTTP ${response.status}.`;
}

function readNestedMessage(body: Record<string, unknown>): string | undefined {
  if (typeof body.message === "string") return body.message;
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  if (typeof body.error === "string") return body.error;

  return undefined;
}
