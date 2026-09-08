import type { AiProviderConfig } from "./providers";
import {
  buildOpenAiCompatibleThinkingRequestOptions,
  getOpenAiCompatibleThinkingFormat,
  getResponsesStyleThinkingFormat
} from "./thinking-format";

function provider(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    apiKey: "secret",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "model",
    enabled: true,
    id: "openai",
    models: [],
    name: "OpenAI",
    type: "openai",
    ...overrides
  };
}

describe("provider thinking formats", () => {
  it.each(["mock/writer", "anthropic/claude-test", "google/gemini-test", "qwen/qwen3-test", "deepseek/deepseek-v4-test"])(
    "uses OrcaRouter reasoning effort for %s without upstream-specific thinking fields",
    (model) => {
      const config = provider({ id: "orcarouter", type: "openai-compatible", baseUrl: "https://orca.example.test/v1" });
      expect(buildOpenAiCompatibleThinkingRequestOptions(config, model, { thinkingEnabled: true })).toEqual({ reasoning_effort: "high" });
      // The gateway documents positive effort values, but no portable way to disable upstream reasoning.
      expect(buildOpenAiCompatibleThinkingRequestOptions(config, model, { thinkingEnabled: false })).toEqual({});
      expect(buildOpenAiCompatibleThinkingRequestOptions(config, model, {})).toEqual({});
    }
  );

  it("resolves OpenAI-compatible thinking formats before request shaping", () => {
    expect(getOpenAiCompatibleThinkingFormat(provider({ type: "ollama" }), "llama3.3", true)).toBe("ollama-think");
    expect(getOpenAiCompatibleThinkingFormat(provider({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      id: "aliyun-bailian",
      type: "openai-compatible"
    }), "qwen3.6-plus", true)).toBe("dashscope-enable-thinking");
    expect(getOpenAiCompatibleThinkingFormat(provider({
      baseUrl: "https://proxy.example.test/v1",
      id: "custom-compatible",
      type: "openai-compatible"
    }), "qwen/qwen3-32b", true)).toBe("qwen-chat-template");
    expect(getOpenAiCompatibleThinkingFormat(provider({ id: "openrouter", type: "openrouter" }), "openai/gpt-oss-120b", true)).toBe("openrouter-reasoning");
    expect(getOpenAiCompatibleThinkingFormat(provider({ type: "openai" }), "gpt-5.2", true)).toBe("reasoning-effort");
    expect(getOpenAiCompatibleThinkingFormat(provider({ type: "openai-compatible" }), "deepseek-v4-pro", false)).toBe("thinking-type");
    expect(getOpenAiCompatibleThinkingFormat(provider({ type: "openai-compatible" }), "google/gemini-3.1-pro-preview", true)).toBe("gemini-extra-body");
    expect(getOpenAiCompatibleThinkingFormat(provider({ type: "openai-compatible" }), "plain-model", true)).toBeNull();
  });

  it("builds OpenAI-compatible thinking request options from the resolved format", () => {
    expect(buildOpenAiCompatibleThinkingRequestOptions(provider({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      id: "aliyun-bailian",
      type: "openai-compatible"
    }), "qwen3.6-plus", { thinkingEnabled: true })).toEqual({ enable_thinking: true });
    expect(buildOpenAiCompatibleThinkingRequestOptions(provider({ type: "ollama" }), "llama3.3", { thinkingEnabled: false })).toEqual({ think: false });
    expect(buildOpenAiCompatibleThinkingRequestOptions(provider({ type: "openai-compatible" }), "google/gemini-3.1-pro-preview", { thinkingEnabled: true })).toEqual({
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_budget: -1
          }
        }
      }
    });
  });

  it("keeps provider-owned thinking formats from falling through to model-name fallbacks", () => {
    expect(buildOpenAiCompatibleThinkingRequestOptions(provider({ type: "together" }), "deepseek-v3.2-preview", { thinkingEnabled: true })).toEqual({});
    expect(buildOpenAiCompatibleThinkingRequestOptions(provider({ type: "groq" }), "deepseek-v3.2-preview", { thinkingEnabled: true })).toEqual({});
  });

  it("resolves Responses-style thinking formats", () => {
    expect(getResponsesStyleThinkingFormat(provider({ id: "openrouter", type: "openrouter" }), "openai/gpt-oss-120b", "openrouter:web_search", true)).toBe("openrouter-reasoning");
    expect(getResponsesStyleThinkingFormat(provider({ type: "xai" }), "grok-4.3", "web_search", false)).toBe("xai-reasoning");
    expect(getResponsesStyleThinkingFormat(provider({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      id: "volcengine",
      type: "openai-compatible"
    }), "doubao-seed-1-6-flash-250715", "web_search", true)).toBe("thinking-type");
  });
});
