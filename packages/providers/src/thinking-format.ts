import { getClaudeCompatibleThinkingRequestOptions } from "./compatibilities/claude";
import { getDeepSeekCompatibleThinkingRequestOptions } from "./compatibilities/deepseek";
import { getDoubaoCompatibleThinkingRequestOptions } from "./compatibilities/doubao";
import { getGeminiCompatibleThinkingRequestOptions } from "./compatibilities/gemini";
import { getGroqThinkingRequestOptions } from "./compatibilities/groq";
import { getKimiCompatibleThinkingRequestOptions } from "./compatibilities/kimi";
import { getMimoCompatibleThinkingRequestOptions } from "./compatibilities/mimo";
import { getQwenThinkingRequestOptions } from "./compatibilities/qwen";
import { getTogetherThinkingRequestOptions } from "./compatibilities/together";
import { getZhipuCompatibleThinkingRequestOptions } from "./compatibilities/zhipu";
import type { AiProviderConfig } from "./providers";

type ThinkingRequestOptions = {
  thinkingEnabled?: boolean;
};

type ResponsesNativeWebSearchToolType = "openrouter:web_search" | "web_search";

export type OpenAiCompatibleThinkingFormat =
  | "claude-thinking-type"
  | "dashscope-enable-thinking"
  | "gemini-extra-body"
  | "groq-reasoning"
  | "ollama-think"
  | "openrouter-reasoning"
  | "qwen-chat-template"
  | "reasoning-effort"
  | "thinking-type"
  | "together-reasoning";

export type ResponsesStyleThinkingFormat =
  | "dashscope-enable-thinking"
  | "openrouter-reasoning"
  | "reasoning"
  | "thinking-type"
  | "xai-reasoning";

export function getOpenAiCompatibleThinkingFormat(
  config: AiProviderConfig,
  model: string,
  thinkingEnabled: boolean | undefined
): OpenAiCompatibleThinkingFormat | null {
  const thinkingState = getThinkingRequestState(thinkingEnabled);
  if (thinkingState === "unspecified") return null;

  // OrcaRouter translates effort itself; upstream model-name fallbacks send incompatible native fields.
  // Omit effort when off: the gateway does not document a portable "none" value across upstreams.
  if (config.id === "orcarouter") return thinkingState === "enabled" ? "reasoning-effort" : null;

  const normalizedModel = model.toLowerCase();
  if (config.type === "ollama") return "ollama-think";

  const qwenRequestOptions = getQwenThinkingRequestOptions(config, normalizedModel, thinkingEnabled);
  if (hasRequestOptions(qwenRequestOptions)) {
    return Object.hasOwn(qwenRequestOptions, "enable_thinking") ? "dashscope-enable-thinking" : "qwen-chat-template";
  }

  if (config.type === "together") return "together-reasoning";

  if (config.type === "groq") return "groq-reasoning";

  if (config.type === "mistral" || config.type === "xai") {
    return "reasoning-effort";
  }

  if (thinkingState === "disabled") {
    return hasRequestOptions(getThinkingTypeRequestOptions(normalizedModel, thinkingEnabled)) ? "thinking-type" : null;
  }

  if (config.type === "openrouter" || config.id === "openrouter") return "openrouter-reasoning";

  if (config.type === "openai" || config.type === "azure-openai") return "reasoning-effort";

  if (hasRequestOptions(getGeminiCompatibleThinkingRequestOptions(normalizedModel, thinkingEnabled))) {
    return "gemini-extra-body";
  }

  if (hasRequestOptions(getThinkingTypeRequestOptions(normalizedModel, thinkingEnabled))) return "thinking-type";

  if (hasRequestOptions(getClaudeCompatibleThinkingRequestOptions(normalizedModel, thinkingEnabled))) {
    return "claude-thinking-type";
  }

  return null;
}

export function buildOpenAiCompatibleThinkingRequestOptions(
  config: AiProviderConfig,
  model: string,
  options: ThinkingRequestOptions
) {
  const thinkingFormat = getOpenAiCompatibleThinkingFormat(config, model, options.thinkingEnabled);
  if (!thinkingFormat) return {};

  const normalizedModel = model.toLowerCase();
  const thinkingEnabled = options.thinkingEnabled === true;

  switch (thinkingFormat) {
    case "ollama-think":
      return { think: thinkingEnabled };
    case "dashscope-enable-thinking":
    case "qwen-chat-template":
      return getQwenThinkingRequestOptions(config, normalizedModel, options.thinkingEnabled);
    case "together-reasoning":
      return getTogetherThinkingRequestOptions(normalizedModel, options.thinkingEnabled);
    case "groq-reasoning":
      return getGroqThinkingRequestOptions(normalizedModel, options.thinkingEnabled);
    case "reasoning-effort":
      return { reasoning_effort: thinkingEnabled ? "high" : "none" };
    case "openrouter-reasoning":
      return { reasoning: { effort: "high" } };
    case "gemini-extra-body":
      return getGeminiCompatibleThinkingRequestOptions(normalizedModel, options.thinkingEnabled);
    case "thinking-type":
      return getThinkingTypeRequestOptions(normalizedModel, options.thinkingEnabled) ?? {};
    case "claude-thinking-type":
      return getClaudeCompatibleThinkingRequestOptions(normalizedModel, options.thinkingEnabled);
  }
}

export function getResponsesStyleThinkingFormat(
  config: AiProviderConfig,
  model: string,
  nativeWebSearchToolType: ResponsesNativeWebSearchToolType,
  thinkingEnabled: boolean | undefined
): ResponsesStyleThinkingFormat | null {
  const thinkingState = getThinkingRequestState(thinkingEnabled);
  if (thinkingState === "unspecified") return null;

  const normalizedModel = model.toLowerCase();
  const qwenRequestOptions = getQwenThinkingRequestOptions({
    baseUrl: config.baseUrl?.trim() || "",
    id: config.id
  }, normalizedModel, thinkingEnabled);
  if (hasRequestOptions(qwenRequestOptions)) return "dashscope-enable-thinking";

  if (hasRequestOptions(getDoubaoCompatibleThinkingRequestOptions(normalizedModel, thinkingEnabled))) return "thinking-type";

  if (config.type === "xai") return "xai-reasoning";
  if (thinkingState === "disabled") return null;
  if (nativeWebSearchToolType === "openrouter:web_search") return "openrouter-reasoning";

  return "reasoning";
}

export function buildResponsesStyleThinkingRequestOptions(
  config: AiProviderConfig,
  model: string,
  nativeWebSearchToolType: ResponsesNativeWebSearchToolType,
  options: ThinkingRequestOptions
) {
  const thinkingFormat = getResponsesStyleThinkingFormat(config, model, nativeWebSearchToolType, options.thinkingEnabled);
  if (!thinkingFormat) return {};

  const normalizedModel = model.toLowerCase();
  switch (thinkingFormat) {
    case "dashscope-enable-thinking":
      return getQwenThinkingRequestOptions({
        baseUrl: config.baseUrl?.trim() || "",
        id: config.id
      }, normalizedModel, options.thinkingEnabled);
    case "thinking-type":
      return getDoubaoCompatibleThinkingRequestOptions(normalizedModel, options.thinkingEnabled);
    case "xai-reasoning":
      return { reasoning: { effort: options.thinkingEnabled === true ? "high" : "none" } };
    case "openrouter-reasoning":
      return { reasoning: { effort: "high" } };
    case "reasoning":
      return { reasoning: { effort: "high" } };
  }
}

function getThinkingRequestState(thinkingEnabled: boolean | undefined) {
  if (thinkingEnabled === true) return "enabled";
  if (thinkingEnabled === false) return "disabled";

  return "unspecified";
}

function getThinkingTypeRequestOptions(model: string, thinkingEnabled: boolean | undefined) {
  return firstDefinedRequestOptions([
    getDeepSeekCompatibleThinkingRequestOptions(model, thinkingEnabled),
    getDoubaoCompatibleThinkingRequestOptions(model, thinkingEnabled),
    getKimiCompatibleThinkingRequestOptions(model, thinkingEnabled),
    getMimoCompatibleThinkingRequestOptions(model, thinkingEnabled),
    getZhipuCompatibleThinkingRequestOptions(model, thinkingEnabled)
  ]);
}

function firstDefinedRequestOptions(candidates: Record<string, unknown>[]) {
  return candidates.find(hasRequestOptions);
}

function hasRequestOptions(candidate: Record<string, unknown> | undefined): candidate is Record<string, unknown> {
  return candidate !== undefined && Object.keys(candidate).length > 0;
}
