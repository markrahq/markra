import { createAlibaba } from "@ai-sdk/alibaba";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { browserSearch, createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import type { AiProviderConfig } from "@markra/providers";
import {
  buildAnthropicThinkingRequestOptions,
  buildDeepSeekThinkingRequestOptions,
  getNativeWebSearchKind,
  providerRequiresApiKey,
  readAiProviderCustomHeaders,
  requestStyleForProviderType
} from "@markra/providers";
import { isRecord } from "@markra/shared";
import type { Tool as PiTool } from "@earendil-works/pi-ai";
import {
  jsonSchema,
  streamText,
  tool as aiSdkTool,
  type AssistantModelMessage,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type ProviderMetadata,
  type ToolModelMessage,
  type ToolSet,
  type UserModelMessage
} from "ai";
import type {
  ChatCompletionStreamTransport,
  ChatCompletionTransport
} from "../chat-completion";
import type {
  ChatImageAttachment,
  ChatMessage,
  ChatResponse,
  ChatThinkingMetadata,
  ChatToolCallDelta
} from "../chat/types";
import { decodeProviderMetadata, encodeProviderMetadata } from "../reasoning-metadata";
import { createNativeAiSdkFetch, type AiSdkFetch } from "./native-fetch";

type AiSdkChatCompletionOptions = {
  fallbackTransport?: ChatCompletionTransport;
  messages: ChatMessage[];
  model: string;
  onDelta?: (delta: string) => unknown;
  onThinkingDelta?: (delta: string) => unknown;
  onThinkingMetadata?: (metadata: ChatThinkingMetadata) => unknown;
  onToolCallDelta?: (delta: ChatToolCallDelta) => unknown;
  provider: AiProviderConfig;
  streamTransport?: ChatCompletionStreamTransport;
  thinkingEnabled?: boolean;
  tools?: PiTool[];
  useVercelAiSdk?: boolean;
  webSearchEnabled?: boolean;
};

type SdkToolCallState = {
  arguments: Record<string, unknown>;
  argumentsText: string;
  id: string;
  index: number;
  name: string;
  thoughtSignature?: string;
};

type AiSdkProviderOptions = Record<string, Record<string, JSONValue>>;

type AiSdkRequestFeatureOptions = {
  thinkingEnabled?: boolean;
  tools?: PiTool[];
  webSearchEnabled?: boolean;
};

type AiSdkProviderKind =
  | "alibaba"
  | "anthropic"
  | "azure-openai"
  | "deepseek"
  | "google"
  | "groq"
  | "mistral"
  | "openai-compatible"
  | "openai-responses"
  | "together"
  | "xai";

const azureApiVersion = "2024-10-21";

const defaultBaseUrlBySdkProviderKind: Partial<Record<AiSdkProviderKind, string>> = {
  alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  anthropic: "https://api.anthropic.com/v1",
  "azure-openai": "https://your-resource-name.openai.azure.com",
  deepseek: "https://api.deepseek.com",
  google: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  "openai-compatible": "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  together: "https://api.together.xyz/v1",
  xai: "https://api.x.ai/v1"
};
const sdkSupportedProviderKinds = new Set<AiSdkProviderKind>([
  "alibaba",
  "anthropic",
  "azure-openai",
  "deepseek",
  "google",
  "groq",
  "mistral",
  "openai-compatible",
  "openai-responses",
  "together",
  "xai"
]);

export function canUseVercelAiSdkChatCompletion({
  fallbackTransport,
  model,
  provider,
  streamTransport,
  thinkingEnabled,
  useVercelAiSdk,
  webSearchEnabled
}: AiSdkChatCompletionOptions) {
  const providerKind = resolveAiSdkProviderKind(provider);

  return (
    useVercelAiSdk === true &&
    // The generic compatible SDK drops reasoning_details, so OpenRouter tool loops stay on the native adapter.
    provider.type !== "openrouter" &&
    provider.id !== "openrouter" &&
    providerKind !== null &&
    streamTransport !== undefined &&
    fallbackTransport !== undefined &&
    canUseAiSdkThinking(provider, model, thinkingEnabled) &&
    canUseAiSdkWebSearch(provider, model, webSearchEnabled) &&
    sdkSupportedProviderKinds.has(providerKind)
  );
}

export async function chatCompletionStreamWithVercelAiSdk({
  fallbackTransport,
  messages,
  model,
  onDelta,
  onThinkingDelta,
  onThinkingMetadata,
  onToolCallDelta,
  provider,
  streamTransport,
  thinkingEnabled,
  tools,
  webSearchEnabled
}: AiSdkChatCompletionOptions): Promise<ChatResponse> {
  if (!streamTransport) throw new Error("AI chat stream transport is not configured.");
  const nativeFetch = createNativeAiSdkFetch({ streamTransport, transport: fallbackTransport });
  const providerKind = resolveAiSdkProviderKind(provider);
  if (!providerKind) throw new Error("AI SDK does not support this provider API style.");
  const result = streamText({
    maxRetries: 0,
    messages: buildAiSdkMessages(messages, providerKind),
    model: createAiSdkLanguageModel(provider, model, nativeFetch),
    providerOptions: buildAiSdkProviderOptions(provider, model, { thinkingEnabled, tools, webSearchEnabled }),
    tools: buildAiSdkTools(provider, model, { tools, webSearchEnabled })
  });

  let content = "";
  let finishReason: string | undefined;
  const toolCallsByIndex = new Map<number, SdkToolCallState>();
  const toolCallIndexById = new Map<string, number>();

  const emitThinkingMetadata = (
    providerMetadata: ProviderMetadata | undefined,
    blockId: string,
    phase: ChatThinkingMetadata["phase"]
  ) => {
    onThinkingMetadata?.({
      blockId,
      ...(hasAnthropicRedactedThinking(providerMetadata) ? { redacted: true } : {}),
      phase,
      ...(providerMetadata ? { signature: encodeProviderMetadata(providerMetadata) } : {})
    });
  };

  const ensureToolCall = (id: string, name = "", providerMetadata?: ProviderMetadata) => {
    const thoughtSignature = providerMetadata ? encodeProviderMetadata(providerMetadata) : undefined;
    const existingIndex = toolCallIndexById.get(id);
    if (existingIndex !== undefined) {
      const existingToolCall = toolCallsByIndex.get(existingIndex);
      if (existingToolCall && name && !existingToolCall.name) existingToolCall.name = name;
      if (existingToolCall && thoughtSignature) existingToolCall.thoughtSignature = thoughtSignature;

      return existingToolCall;
    }

    const index = toolCallsByIndex.size;
    const toolCall = { arguments: {}, argumentsText: "", id, index, name, ...(thoughtSignature ? { thoughtSignature } : {}) };
    toolCallIndexById.set(id, index);
    toolCallsByIndex.set(index, toolCall);

    return toolCall;
  };

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      content += part.text;
      onDelta?.(part.text);
      continue;
    }

    if (part.type === "reasoning-start" || part.type === "reasoning-end") {
      emitThinkingMetadata(part.providerMetadata, part.id, part.type === "reasoning-start" ? "start" : "end");
      continue;
    }

    if (part.type === "reasoning-delta") {
      onThinkingDelta?.(part.text);
      if (part.providerMetadata) emitThinkingMetadata(part.providerMetadata, part.id, "update");
      continue;
    }

    if (part.type === "tool-input-start") {
      const toolCall = ensureToolCall(part.id, part.toolName, part.providerMetadata);
      if (!toolCall) continue;

      onToolCallDelta?.({
        id: part.id,
        index: toolCall.index,
        nameDelta: part.toolName
      });
      continue;
    }

    if (part.type === "tool-input-delta") {
      const toolCall = ensureToolCall(part.id);
      if (!toolCall) continue;

      toolCall.argumentsText += part.delta;
      onToolCallDelta?.({
        argumentsDelta: part.delta,
        id: part.id,
        index: toolCall.index
      });
      continue;
    }

    if (part.type === "tool-call") {
      const toolCall = ensureToolCall(part.toolCallId, part.toolName, part.providerMetadata);
      if (!toolCall) continue;

      toolCall.arguments = isRecord(part.input) ? part.input : {};
      toolCall.argumentsText = JSON.stringify(toolCall.arguments);
      toolCall.name = part.toolName;
      onToolCallDelta?.({
        argumentsDelta: toolCall.argumentsText,
        id: part.toolCallId,
        index: toolCall.index,
        nameDelta: part.toolName,
        replaceArguments: true,
        replaceName: true
      });
      continue;
    }

    if (part.type === "finish-step" || part.type === "finish") {
      finishReason = part.finishReason ?? part.rawFinishReason;
      continue;
    }

    if (part.type === "error") {
      throw readAiSdkStreamError(part.error);
    }
  }

  return {
    content,
    finishReason,
    ...(toolCallsByIndex.size > 0
      ? {
          toolCalls: [...toolCallsByIndex.values()].map((toolCall) => ({
            arguments: toolCall.argumentsText ? parseToolArguments(toolCall.argumentsText) : toolCall.arguments,
            id: toolCall.id,
            name: toolCall.name,
            ...(toolCall.thoughtSignature ? { thoughtSignature: toolCall.thoughtSignature } : {})
          }))
        }
      : {})
  };
}

function createAiSdkLanguageModel(provider: AiProviderConfig, model: string, nativeFetch: AiSdkFetch): LanguageModel {
  const providerKind = resolveAiSdkProviderKind(provider);
  if (!providerKind) throw new Error("AI SDK does not support this provider API style.");

  const baseURL = readAiSdkBaseUrl(provider, providerKind);
  const apiKey = providerRequiresApiKey(provider) ? provider.apiKey?.trim() || undefined : undefined;
  const headers = readAiProviderCustomHeaders(provider);

  if (providerKind === "openai-responses") {
    return createOpenAI({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).responses(model);
  }
  if (providerKind === "anthropic") {
    return createAnthropic({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).messages(model);
  }
  if (providerKind === "google") {
    return createGoogleGenerativeAI({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).chat(model);
  }
  if (providerKind === "deepseek") {
    return createDeepSeek({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).chat(model);
  }
  if (providerKind === "mistral") {
    return createMistral({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).chat(model);
  }
  if (providerKind === "groq") {
    return createGroq({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).languageModel(model);
  }
  if (providerKind === "xai") {
    return createXai({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).chat(model);
  }
  if (providerKind === "together") {
    return createTogetherAI({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).languageModel(model);
  }
  if (providerKind === "alibaba") {
    return createAlibaba({
      apiKey,
      baseURL,
      fetch: nativeFetch,
      headers
    }).languageModel(model);
  }
  if (providerKind === "azure-openai") {
    return createAzure({
      apiKey,
      apiVersion: azureApiVersion,
      baseURL,
      fetch: nativeFetch,
      headers,
      useDeploymentBasedUrls: true
    }).chat(model);
  }

  return createOpenAICompatible({
    apiKey,
    baseURL,
    fetch: nativeFetch,
    headers,
    name: provider.id || provider.name || "openai-compatible"
  }).chatModel(model);
}

function resolveAiSdkProviderKind(provider: AiProviderConfig): AiSdkProviderKind | null {
  const apiStyle = provider.apiStyle ?? requestStyleForProviderType(provider.type);

  if (apiStyle !== "openai-compatible") return apiStyle;

  switch (provider.type) {
    case "azure-openai":
    case "deepseek":
    case "groq":
    case "mistral":
    case "together":
    case "xai":
      return provider.type;
    default:
      return provider.id === "aliyun-bailian" ? "alibaba" : "openai-compatible";
  }
}

function readAiSdkBaseUrl(provider: AiProviderConfig, providerKind: AiSdkProviderKind) {
  const configuredBaseUrl = provider.baseUrl?.trim();
  if (configuredBaseUrl) {
    return providerKind === "azure-openai" ? normalizeAzureOpenAiBaseUrl(configuredBaseUrl) : configuredBaseUrl;
  }
  if (provider.type === "openai") return defaultBaseUrlBySdkProviderKind["openai-responses"]!;
  const defaultBaseUrl = defaultBaseUrlBySdkProviderKind[providerKind];
  if (defaultBaseUrl) return providerKind === "azure-openai" ? normalizeAzureOpenAiBaseUrl(defaultBaseUrl) : defaultBaseUrl;

  throw new Error("API URL is required.");
}

function normalizeAzureOpenAiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const deploymentBaseUrl = trimmed.endsWith("/openai/v1") ? trimmed.slice(0, -"/v1".length) : trimmed;

  return deploymentBaseUrl.endsWith("/openai") ? deploymentBaseUrl : `${deploymentBaseUrl}/openai`;
}

function canUseAiSdkThinking(provider: AiProviderConfig, model: string, thinkingEnabled: boolean | undefined) {
  if (thinkingEnabled !== true) return true;

  return buildAiSdkThinkingProviderOptions(provider, model, thinkingEnabled) !== undefined;
}

function canUseAiSdkWebSearch(provider: AiProviderConfig, model: string, webSearchEnabled: boolean | undefined) {
  if (webSearchEnabled !== true) return true;

  const providerKind = resolveAiSdkProviderKind(provider);
  const nativeWebSearchKind = getNativeWebSearchKind(provider, model);
  if (nativeWebSearchKind === null || nativeWebSearchKind === "perplexity-sonar") return true;
  if (providerKind === "xai" && nativeWebSearchKind === "openai-responses") return true;

  return (
    (providerKind === "openai-responses" && nativeWebSearchKind === "openai-responses") ||
    (providerKind === "anthropic" && nativeWebSearchKind === "anthropic-server-tool") ||
    (providerKind === "google" && nativeWebSearchKind === "google-search-grounding") ||
    (providerKind === "groq" && nativeWebSearchKind === "groq-compound")
  );
}

function buildAiSdkProviderOptions(
  provider: AiProviderConfig,
  model: string,
  options: AiSdkRequestFeatureOptions
): AiSdkProviderOptions | undefined {
  return mergeAiSdkProviderOptions(
    buildAiSdkToolProviderOptions(provider, model, options),
    buildAiSdkThinkingProviderOptions(provider, model, options.thinkingEnabled),
    buildAiSdkWebSearchProviderOptions(provider, model, options.webSearchEnabled)
  );
}

function buildAiSdkToolProviderOptions(
  provider: AiProviderConfig,
  model: string,
  options: AiSdkRequestFeatureOptions
): AiSdkProviderOptions | undefined {
  const hasTools = Boolean(options.tools?.length || hasAiSdkNativeWebSearchTool(provider, model, options.webSearchEnabled));
  if (!hasTools) return undefined;

  const providerKind = resolveAiSdkProviderKind(provider);
  if (providerKind === "anthropic") {
    return {
      anthropic: {
        disableParallelToolUse: true
      }
    };
  }
  if (providerKind === "xai") {
    return {
      xai: {
        parallel_function_calling: false
      }
    };
  }
  if (providerKind === "alibaba") {
    return {
      alibaba: {
        parallelToolCalls: false
      }
    };
  }
  if (
    providerKind !== "openai-responses" &&
    providerKind !== "openai-compatible" &&
    providerKind !== "mistral" &&
    providerKind !== "groq"
  ) {
    return undefined;
  }
  return {
    [providerOptionsKey(provider, providerKind)]: {
      parallelToolCalls: false
    }
  };
}

function buildAiSdkThinkingProviderOptions(
  provider: AiProviderConfig,
  model: string,
  thinkingEnabled: boolean | undefined
): AiSdkProviderOptions | undefined {
  if (thinkingEnabled !== true) return undefined;

  const providerKind = resolveAiSdkProviderKind(provider);
  if (providerKind === "openai-responses") {
    return {
      openai: {
        forceReasoning: true,
        reasoningEffort: "high",
        reasoningSummary: "auto"
      }
    };
  }
  if (providerKind === "anthropic") return buildAnthropicAiSdkThinkingProviderOptions(model, thinkingEnabled);
  if (providerKind === "google") {
    return {
      google: {
        thinkingConfig: {
          includeThoughts: true
        }
      }
    };
  }
  if (providerKind === "deepseek") {
    return {
      deepseek: {
        ...buildDeepSeekThinkingRequestOptions({ thinkingEnabled }),
        reasoningEffort: "high"
      }
    };
  }
  if (providerKind === "mistral") {
    return {
      mistral: {
        reasoningEffort: "high"
      }
    };
  }
  if (providerKind === "groq") return buildGroqAiSdkThinkingProviderOptions(model);
  if (providerKind === "xai") {
    return {
      xai: {
        reasoningEffort: "high"
      }
    };
  }
  if (providerKind === "alibaba") {
    return {
      alibaba: {
        enableThinking: true
      }
    };
  }

  return undefined;
}

function buildAnthropicAiSdkThinkingProviderOptions(
  model: string,
  thinkingEnabled: boolean
): AiSdkProviderOptions | undefined {
  const thinkingOptions = buildAnthropicThinkingRequestOptions(model, { thinkingEnabled });
  if (!isRecord(thinkingOptions.thinking)) return undefined;
  const thinking = thinkingOptions.thinking;
  if (thinking.type === "adaptive") {
    return {
      anthropic: {
        thinking: {
          display: typeof thinking.display === "string" ? thinking.display : "summarized",
          type: "adaptive"
        }
      }
    };
  }
  if (thinking.type === "enabled") {
    return {
      anthropic: {
        thinking: {
          budgetTokens: typeof thinking.budget_tokens === "number" ? thinking.budget_tokens : 1024,
          type: "enabled"
        }
      }
    };
  }

  return undefined;
}

function buildGroqAiSdkThinkingProviderOptions(model: string): AiSdkProviderOptions | undefined {
  const normalizedModel = model.toLowerCase();
  if (normalizedModel.includes("gpt-oss")) {
    return {
      groq: {
        reasoningEffort: "high",
        reasoningFormat: "parsed"
      }
    };
  }
  if (normalizedModel.includes("qwen")) {
    return {
      groq: {
        reasoningEffort: "default",
        reasoningFormat: "parsed"
      }
    };
  }

  return undefined;
}

function buildAiSdkWebSearchProviderOptions(
  provider: AiProviderConfig,
  model: string,
  webSearchEnabled: boolean | undefined
): AiSdkProviderOptions | undefined {
  if (webSearchEnabled !== true) return undefined;
  if (resolveAiSdkProviderKind(provider) !== "xai") return undefined;
  if (getNativeWebSearchKind(provider, model) !== "openai-responses") return undefined;

  return {
    xai: {
      searchParameters: {
        mode: "on",
        returnCitations: true,
        sources: [{ type: "web" }]
      }
    }
  };
}

function buildAiSdkTools(
  provider: AiProviderConfig,
  model: string,
  options: Pick<AiSdkRequestFeatureOptions, "tools" | "webSearchEnabled">
): ToolSet | undefined {
  const nativeTools = buildAiSdkNativeWebSearchTools(provider, model, options.webSearchEnabled);
  const functionTools = Object.fromEntries(
    (options.tools ?? []).map((toolDefinition) => [
      toolDefinition.name,
      aiSdkTool({
        description: toolDefinition.description,
        inputSchema: jsonSchema(toolDefinition.parameters as Parameters<typeof jsonSchema>[0])
      })
    ])
  );
  const mergedTools = { ...nativeTools, ...functionTools };
  if (Object.keys(mergedTools).length === 0) return undefined;

  return mergedTools as ToolSet;
}

function buildAiSdkNativeWebSearchTools(
  provider: AiProviderConfig,
  model: string,
  webSearchEnabled: boolean | undefined
): ToolSet {
  if (webSearchEnabled !== true) return {};

  const providerKind = resolveAiSdkProviderKind(provider);
  const nativeWebSearchKind = getNativeWebSearchKind(provider, model);
  if (providerKind === "openai-responses" && nativeWebSearchKind === "openai-responses") {
    return {
      web_search: openai.tools.webSearch({})
    } as ToolSet;
  }
  if (providerKind === "anthropic" && nativeWebSearchKind === "anthropic-server-tool") {
    return {
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 5 })
    } as ToolSet;
  }
  if (providerKind === "google" && nativeWebSearchKind === "google-search-grounding") {
    return {
      google_search: google.tools.googleSearch({})
    } as ToolSet;
  }
  if (providerKind === "groq" && nativeWebSearchKind === "groq-compound" && isGroqBrowserSearchModel(model)) {
    return {
      browser_search: browserSearch({})
    } as ToolSet;
  }

  return {};
}

function hasAiSdkNativeWebSearchTool(provider: AiProviderConfig, model: string, webSearchEnabled: boolean | undefined) {
  return Object.keys(buildAiSdkNativeWebSearchTools(provider, model, webSearchEnabled)).length > 0;
}

function isGroqBrowserSearchModel(model: string) {
  return model === "openai/gpt-oss-20b" || model === "openai/gpt-oss-120b";
}

function providerOptionsKey(provider: AiProviderConfig, providerKind: AiSdkProviderKind) {
  if (providerKind === "openai-responses") return "openai";
  if (providerKind === "openai-compatible") return provider.id || "openai-compatible";

  return providerKind;
}

function mergeAiSdkProviderOptions(
  ...options: (AiSdkProviderOptions | undefined)[]
): AiSdkProviderOptions | undefined {
  const merged: AiSdkProviderOptions = {};

  for (const providerOptions of options) {
    if (!providerOptions) continue;

    for (const [providerName, providerValues] of Object.entries(providerOptions)) {
      merged[providerName] = {
        ...(merged[providerName] ?? {}),
        ...providerValues
      };
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildAiSdkMessages(messages: ChatMessage[], providerKind: AiSdkProviderKind): ModelMessage[] {
  return messages.map((message) => {
    if (message.toolResult) return buildAiSdkToolMessage(message);
    if (message.role === "assistant") return buildAiSdkAssistantMessage(message, providerKind);
    if (message.role === "system") {
      return {
        content: message.content,
        role: "system"
      };
    }

    return buildAiSdkUserMessage(message);
  });
}

function buildAiSdkAssistantMessage(message: ChatMessage, providerKind: AiSdkProviderKind): AssistantModelMessage {
  if (!message.toolCalls?.length) {
    return {
      content: message.content,
      role: "assistant"
    };
  }

  const reasoningBlocks = message.thinkingBlocks?.length
    ? message.thinkingBlocks
    : [{
        ...(message.thinkingRedacted !== undefined ? { redacted: message.thinkingRedacted } : {}),
        thinking: message.thinking ?? "",
        ...(message.thinkingSignature ? { thinkingSignature: message.thinkingSignature } : {})
      }];

  return {
    content: [
      // Signatures authenticate one exact reasoning block, so never flatten adjacent signed or redacted blocks here.
      ...reasoningBlocks.flatMap((reasoningBlock) => {
        const providerOptions = decodeProviderMetadata(reasoningBlock.thinkingSignature);
        if (
          !shouldReplayAiSdkReasoning(providerKind, providerOptions) ||
          (!reasoningBlock.thinking.trim() && reasoningBlock.redacted !== true && !providerOptions)
        ) {
          return [];
        }

        return [{
          ...(providerOptions ? { providerOptions } : {}),
          text: reasoningBlock.thinking,
          type: "reasoning" as const
        }];
      }),
      ...(message.content.trim() ? [{ text: message.content, type: "text" as const }] : []),
      ...message.toolCalls.map((toolCall) => {
        const providerOptions = decodeProviderMetadata(toolCall.thoughtSignature);

        return {
          input: toolCall.arguments,
          ...(providerOptions && hasAiSdkProviderMetadata(providerKind, providerOptions) ? { providerOptions } : {}),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          type: "tool-call" as const
        };
      })
    ],
    role: "assistant"
  };
}

function shouldReplayAiSdkReasoning(
  providerKind: AiSdkProviderKind,
  providerMetadata: ProviderMetadata | undefined
) {
  // Signed providers need original metadata; these compatible families replay the plain reasoning text they emitted.
  if (
    providerKind === "deepseek" ||
    providerKind === "groq" ||
    providerKind === "openai-compatible" ||
    providerKind === "together"
  ) {
    return true;
  }

  return providerMetadata !== undefined && hasAiSdkProviderMetadata(providerKind, providerMetadata);
}

function hasAiSdkProviderMetadata(providerKind: AiSdkProviderKind, providerMetadata: ProviderMetadata) {
  if (providerKind === "anthropic") return providerMetadata.anthropic !== undefined;
  if (providerKind === "google") return providerMetadata.google !== undefined;
  if (providerKind === "openai-responses") return providerMetadata.openai !== undefined;

  return false;
}

function hasAnthropicRedactedThinking(providerMetadata: ProviderMetadata | undefined) {
  return typeof providerMetadata?.anthropic?.redactedData === "string";
}

function buildAiSdkUserMessage(message: ChatMessage): UserModelMessage {
  if (!message.images?.length) {
    return {
      content: message.content,
      role: "user"
    };
  }

  return {
    content: [
      { text: message.content, type: "text" as const },
      ...message.images.map((image) => ({
        image: base64DataFromDataUrl(image.dataUrl),
        mediaType: image.mimeType,
        type: "image" as const
      }))
    ],
    role: "user"
  };
}

function buildAiSdkToolMessage(message: ChatMessage): ToolModelMessage {
  const toolResult = message.toolResult;
  if (!toolResult) {
    return {
      content: [],
      role: "tool"
    };
  }

  return {
    content: [
      {
        output: buildAiSdkToolResultOutput(message),
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        type: "tool-result"
      }
    ],
    role: "tool"
  };
}

function buildAiSdkToolResultOutput(message: ChatMessage) {
  const outputText = message.toolResult?.outputText ?? "";
  if (!message.images?.length) {
    return {
      type: "text" as const,
      value: outputText
    };
  }

  return {
    type: "content" as const,
    value: [
      ...(outputText ? [{ text: outputText, type: "text" as const }] : []),
      ...message.images.map((image) => ({
        data: base64DataFromDataUrl(image.dataUrl),
        mediaType: image.mimeType,
        type: "image-data" as const
      }))
    ]
  };
}

function base64DataFromDataUrl(dataUrl: ChatImageAttachment["dataUrl"]) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);

  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length) : dataUrl;
}

function parseToolArguments(rawArguments: string) {
  try {
    const parsed = JSON.parse(rawArguments) as unknown;

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readAiSdkStreamError(error: unknown) {
  if (error instanceof Error) return error;

  return new Error(typeof error === "string" ? error : "AI SDK stream error.");
}
