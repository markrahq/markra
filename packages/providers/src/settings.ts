import { isRecord } from "@markra/shared";

import {
  defaultApiUrlForStoredProvider,
  defaultProviderTemplateForProviderId,
  defaultProviderTemplates,
  previousDefaultModelIdsByProviderId,
  staleDefaultModelIdsByProviderId
} from "./catalog";
import { enrichAiProviderModelCapabilities, readModelCapabilities } from "./capabilities";
import { providerRequiresApiKey } from "./auth";
import { editableRequestStylesForProvider, isAiProviderRequestStyle, requestStyleForProviderType } from "./request-styles";
import {
  isAiProviderApiStyle,
  type AiProviderConfig,
  type AiProviderConfigSeed,
  type AiProviderModel,
  type AiProviderModelSeed,
  type AiProviderSettings
} from "./types";

const legacyBuiltInProviderIds = new Set(["openai-compatible"]);

export function createDefaultAiSettings(): AiProviderSettings {
  return {
    agentDefaultModelId: "gpt-5.6-sol",
    agentDefaultProviderId: "openai",
    defaultModelId: "gpt-5.6-sol",
    defaultProviderId: "openai",
    inlineDefaultModelId: "gpt-5.6-sol",
    inlineDefaultProviderId: "openai",
    providers: defaultProviderTemplates.map(cloneProvider)
  };
}

export function createCustomAiProvider(index: number): AiProviderConfig {
  const providerNumber = Math.max(1, index);

  return {
    apiKey: "",
    baseUrl: "",
    customHeaders: "",
    defaultModelId: "default",
    enabled: false,
    id: `custom-provider-${providerNumber}`,
    models: [{ capabilities: ["text"], enabled: true, id: "default", name: "Default model" }],
    name: "Custom Provider",
    apiStyle: "openai-compatible",
    type: "openai-compatible"
  };
}

export function normalizeAiSettings(value: unknown): AiProviderSettings {
  if (!isRecord(value) || !Array.isArray(value.providers)) return createDefaultAiSettings();

  const providers = value.providers.map(normalizeProvider).filter((provider): provider is AiProviderConfig => Boolean(provider));
  if (providers.length === 0) return createDefaultAiSettings();

  const defaultProviderId =
    typeof value.defaultProviderId === "string" && providers.some((provider) => provider.id === value.defaultProviderId)
      ? value.defaultProviderId
      : providers[0]?.id;
  const selectedProvider = providers.find((provider) => provider.id === defaultProviderId) ?? providers[0];
  const storedDefaultModelId = typeof value.defaultModelId === "string" ? value.defaultModelId : "";
  const defaultModelId = selectedProvider?.models.some((model) => model.id === storedDefaultModelId)
    ? storedDefaultModelId
    : selectedProvider?.defaultModelId;
  const inlineDefaultProviderId =
    typeof value.inlineDefaultProviderId === "string" && providers.some((provider) => provider.id === value.inlineDefaultProviderId)
      ? value.inlineDefaultProviderId
      : defaultProviderId;
  const inlineDefaultModelId = typeof value.inlineDefaultModelId === "string" ? value.inlineDefaultModelId : defaultModelId;
  const agentDefaultProviderId =
    typeof value.agentDefaultProviderId === "string" && providers.some((provider) => provider.id === value.agentDefaultProviderId)
      ? value.agentDefaultProviderId
      : defaultProviderId;
  const agentDefaultModelId = typeof value.agentDefaultModelId === "string" ? value.agentDefaultModelId : defaultModelId;

  return {
    agentDefaultModelId,
    agentDefaultProviderId,
    defaultModelId,
    defaultProviderId,
    inlineDefaultModelId,
    inlineDefaultProviderId,
    providers
  };
}

function normalizeProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const providerId = value.id;
  if (legacyBuiltInProviderIds.has(providerId)) return null;

  const type = isAiProviderApiStyle(value.type) ? value.type : "openai-compatible";
  const defaultProvider = defaultProviderTemplateForProviderId(providerId);
  const fallbackApiStyle = defaultProvider?.apiStyle ?? requestStyleForProviderType(type);
  const editableApiStyles = editableRequestStylesForProvider({ id: providerId, type });
  const storedApiStyle = isAiProviderRequestStyle(value.apiStyle) ? value.apiStyle : undefined;
  const canUseStoredApiStyle =
    editableApiStyles.length > 0 &&
    storedApiStyle !== undefined &&
    editableApiStyles.includes(storedApiStyle);
  const apiStyle = canUseStoredApiStyle ? storedApiStyle : fallbackApiStyle;
  const normalizedStoredModels = Array.isArray(value.models)
    ? value.models.map(normalizeModel).filter((model): model is AiProviderModel => Boolean(model))
    : [];
  const storedModels = defaultProvider
    ? normalizedStoredModels.map((model) => enrichAiProviderModelCapabilities(providerId, model))
    : normalizedStoredModels;
  const shouldRefreshDefaultModels = shouldRefreshStoredDefaultModels(providerId, storedModels);
  const models =
    shouldRefreshDefaultModels && defaultProvider
      ? mergeDefaultModels(storedModels, defaultProvider.models)
      : storedModels.length > 0
        ? storedModels
        : defaultProvider?.models.map(cloneModel) ?? [
            { capabilities: ["text"], enabled: true, id: "default", name: "Default model" }
          ];
  const storedBaseUrl = typeof value.baseUrl === "string" ? value.baseUrl : "";
  const storedDefaultModelId = typeof value.defaultModelId === "string" ? value.defaultModelId : "";
  const defaultModelId = models.some((model) => model.id === storedDefaultModelId)
    ? storedDefaultModelId
    : defaultProvider?.defaultModelId && models.some((model) => model.id === defaultProvider.defaultModelId)
      ? defaultProvider.defaultModelId
      : models[0]?.id;

  return {
    apiKey:
      providerRequiresApiKey({ id: providerId, type }) && typeof value.apiKey === "string"
        ? value.apiKey
        : "",
    baseUrl: storedBaseUrl || defaultApiUrlForStoredProvider(providerId, type),
    ...(typeof value.customHeaders === "string" && value.customHeaders.trim() ? { customHeaders: value.customHeaders } : {}),
    defaultModelId,
    enabled: value.enabled === true,
    id: providerId,
    models,
    name: value.name,
    apiStyle,
    type
  };
}

function shouldRefreshStoredDefaultModels(providerId: string, models: AiProviderModel[]) {
  const staleModelIds = staleDefaultModelIdsByProviderId[providerId];
  if (!staleModelIds || models.length === 0 || providerId.startsWith("custom-provider-")) return false;

  const staleModelIdSet = new Set(staleModelIds);
  const storedModelIdSet = new Set(models.map((model) => model.id));
  const previousDefaultModelIds = previousDefaultModelIdsByProviderId[providerId];
  const containsPreviousDefaults = previousDefaultModelIds?.every((modelId) => storedModelIdSet.has(modelId)) ?? false;

  // A complete previous seed may also contain user-added models; merging keeps those entries intact.
  return containsPreviousDefaults || models.every((model) => staleModelIdSet.has(model.id));
}

function mergeDefaultModels(storedModels: AiProviderModel[], defaultModels: AiProviderModelSeed[]) {
  const storedModelIds = new Set(storedModels.map((model) => model.id));

  // Keep stored entries and their order; only append built-in models that are missing.
  return [...storedModels, ...defaultModels.filter((model) => !storedModelIds.has(model.id)).map(cloneModel)];
}

function normalizeModel(value: unknown): AiProviderModel | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;

  return {
    capabilities: readModelCapabilities(value),
    enabled: value.enabled !== false,
    id: value.id,
    name: value.name
  };
}

function cloneProvider(provider: AiProviderConfigSeed): AiProviderConfig {
  return {
    ...provider,
    models: provider.models.map(cloneModel)
  };
}

function cloneModel(model: AiProviderModelSeed): AiProviderModel {
  return {
    capabilities: readModelCapabilities(model),
    enabled: model.enabled,
    id: model.id,
    name: model.name
  };
}
