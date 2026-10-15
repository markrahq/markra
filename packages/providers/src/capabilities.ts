import { defaultProviderTemplateForProviderId } from "./catalog";
import type { AiModelCapability, AiProviderModel, AiProviderModelSeed } from "./types";

const aiModelCapabilityOrder: AiModelCapability[] = ["text", "vision", "image", "reasoning", "tools", "web"];

// These providers report per-model capabilities, so seed capabilities must not override what they deny.
const providersWithModelMetadata = new Set(["requesty"]);

export function enrichAiProviderModelCapabilities(providerId: string, model: AiProviderModel): AiProviderModel {
  if (providersWithModelMetadata.has(providerId)) return model;

  const defaultProvider = defaultProviderTemplateForProviderId(providerId);
  const defaultModel = defaultProvider?.models.find((item) => item.id === model.id);
  if (!defaultModel) return model;

  return {
    ...model,
    capabilities: normalizeAiModelCapabilities([...model.capabilities, ...readModelCapabilities(defaultModel)])
  };
}

export function readModelCapabilities(value: Record<string, unknown> | AiProviderModelSeed): AiModelCapability[] {
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  const legacyCapability = isAiModelCapability(value.capability) ? [value.capability] : [];

  return normalizeAiModelCapabilities(capabilities.length > 0 ? capabilities : legacyCapability);
}

export function normalizeAiModelCapabilities(values: readonly unknown[], fallback: AiModelCapability[] = ["text"]): AiModelCapability[] {
  const selected = new Set<AiModelCapability>();
  for (const value of values) {
    if (isAiModelCapability(value)) selected.add(value);
  }

  if (selected.has("vision")) selected.add("text");
  if (selected.size === 0) {
    for (const capability of fallback) selected.add(capability);
  }

  return aiModelCapabilityOrder.filter((capability) => selected.has(capability));
}

function isAiModelCapability(value: unknown): value is AiModelCapability {
  return value === "image" || value === "reasoning" || value === "text" || value === "tools" || value === "vision" || value === "web";
}
