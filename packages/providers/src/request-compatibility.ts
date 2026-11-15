import { isRecord } from "@markra/shared";

import { supportsAnthropicAdaptiveThinking } from "./compatibilities/claude";
import { getMimoCompatibleThinkingRequestOptions, mimoWebSearchTool } from "./compatibilities/mimo";
import { getDashScopeQwenChatWebSearchRequestOptions } from "./compatibilities/qwen";
import { getNativeWebSearchKind } from "./native-web-search";
import type { AiProviderConfig } from "./providers";
import {
  buildOpenAiCompatibleThinkingRequestOptions,
  buildResponsesStyleThinkingRequestOptions
} from "./thinking-format";

export { getRequestyThinkingOffEffort } from "./thinking-format";

export type ProviderRequestFeatureOptions = {
  thinkingEnabled?: boolean;
  webSearchEnabled?: boolean;
};

export type ResponsesNativeWebSearchToolType = "openrouter:web_search" | "web_search";

export type OpenAiCompatibleRequestParts = {
  extraBody: Record<string, unknown>;
  nativeTools: Record<string, unknown>[];
};

export function buildAnthropicThinkingRequestOptions(model: string, options: ProviderRequestFeatureOptions) {
  if (!options.thinkingEnabled) return {};

  if (supportsAnthropicAdaptiveThinking(model.toLowerCase())) {
    return {
      thinking: {
        display: "summarized",
        type: "adaptive"
      }
    };
  }

  return {
    thinking: {
      budget_tokens: 1024,
      type: "enabled"
    }
  };
}

export function buildDeepSeekThinkingRequestOptions(options: ProviderRequestFeatureOptions) {
  return {
    thinking: { type: options.thinkingEnabled ? "enabled" : "disabled" }
  };
}

export function buildResponsesStyleRequestOptions(
  config: AiProviderConfig,
  model: string,
  nativeWebSearchToolType: ResponsesNativeWebSearchToolType,
  options: ProviderRequestFeatureOptions
) {
  return buildResponsesStyleThinkingRequestOptions(config, model, nativeWebSearchToolType, options);
}

export function buildOpenAiCompatibleRequestParts(
  config: AiProviderConfig,
  model: string,
  options: ProviderRequestFeatureOptions
): OpenAiCompatibleRequestParts {
  return {
    extraBody: mergeProviderRequestOptions(
      buildOpenAiCompatibleThinkingRequestOptions(config, model, options),
      buildOpenAiCompatibleNativeWebSearchOptions(config, model, options)
    ),
    nativeTools: buildOpenAiCompatibleNativeTools(config, model, options)
  };
}

function buildOpenAiCompatibleNativeWebSearchOptions(
  config: AiProviderConfig,
  model: string,
  options: ProviderRequestFeatureOptions
) {
  if (options.webSearchEnabled !== true) return {};
  const qwenWebSearchOptions = getDashScopeQwenChatWebSearchRequestOptions(config, model, options.webSearchEnabled);
  if (Object.keys(qwenWebSearchOptions).length > 0) return qwenWebSearchOptions;

  return {};
}

function buildOpenAiCompatibleNativeTools(
  config: AiProviderConfig,
  model: string,
  options: ProviderRequestFeatureOptions
) {
  if (options.webSearchEnabled !== true) return [];
  if (getNativeWebSearchKind(config, model) === "mimo-web-search-tool") return [mimoWebSearchTool];

  return [];
}

function mergeProviderRequestOptions(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...left };

  for (const [key, value] of Object.entries(right)) {
    const current = result[key];
    result[key] = isPlainRecord(current) && isPlainRecord(value) ? mergeProviderRequestOptions(current, value) : value;
  }

  return result;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}
