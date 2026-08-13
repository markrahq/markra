import {
  buildAiProviderModelsRequest,
  fetchAiProviderModels,
  parseAiProviderModels,
  testAiProviderConnection
} from "./requests";
import { createDefaultAiSettings, type AiProviderConfig } from "./providers";

function provider(overrides: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    apiKey: "sk-test",
    baseUrl: "",
    defaultModelId: "default",
    enabled: true,
    id: "provider",
    models: [],
    name: "Provider",
    type: "openai",
    ...overrides
  };
}

describe("AI provider requests", () => {
  it("ships mainstream providers by default", () => {
    const settings = createDefaultAiSettings();
    const providerIds = settings.providers.map((item) => item.id);
    const findModelIds = (providerId: string) =>
      settings.providers.find((item) => item.id === providerId)?.models.map((model) => model.id);
    const findModelCapabilities = (providerId: string, modelId: string) =>
      settings.providers.find((item) => item.id === providerId)?.models.find((model) => model.id === modelId)?.capabilities;

    expect(providerIds).toEqual(
      expect.arrayContaining([
        "openai",
        "anthropic",
        "google",
        "deepseek",
        "mistral",
        "groq",
        "openrouter",
        "together",
        "aliyun-bailian",
        "xiaomi-mimo",
        "volcengine",
        "xai",
        "ollama"
      ])
    );
    expect(providerIds).not.toContain("openai-compatible");
    expect(settings.defaultModelId).toBe("gpt-5.6-sol");
    expect(settings.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ defaultModelId: "gpt-5.6-sol", id: "openai" }),
        expect.objectContaining({ defaultModelId: "claude-opus-5", id: "anthropic" }),
        expect.objectContaining({ defaultModelId: "gemini-3.6-flash", id: "google" }),
        expect.objectContaining({ defaultModelId: "deepseek-v4-pro", id: "deepseek" }),
        expect.objectContaining({ defaultModelId: "mistral-medium-3-5", id: "mistral" }),
        expect.objectContaining({ defaultModelId: "groq/compound", id: "groq" }),
        expect.objectContaining({ defaultModelId: "openrouter/auto", id: "openrouter" }),
        expect.objectContaining({ defaultModelId: "moonshotai/Kimi-K2.6", id: "together" }),
        expect.objectContaining({ defaultModelId: "qwen3.8-max", id: "aliyun-bailian", type: "openai-compatible" }),
        expect.objectContaining({
          baseUrl: "https://api.xiaomimimo.com/v1",
          defaultModelId: "mimo-v2.5-pro",
          id: "xiaomi-mimo",
          type: "openai-compatible"
        }),
        expect.objectContaining({ defaultModelId: "doubao-seed-evolving", id: "volcengine", type: "openai-compatible" }),
        expect.objectContaining({ defaultModelId: "grok-4.5", id: "xai" }),
        expect.objectContaining({ defaultModelId: "gpt-5.6-sol", id: "azure-openai" }),
        expect.objectContaining({ defaultModelId: "qwen3.5", id: "ollama" })
      ])
    );
    expect(findModelIds("openai")).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-image-2"
    ]);
    expect(findModelIds("anthropic")).toEqual([
      "claude-opus-5",
      "claude-fable-5",
      "claude-sonnet-5",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-haiku-4-5"
    ]);
    expect(findModelIds("google")).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite-preview"
    ]);
    expect(findModelIds("mistral")).toEqual([
      "mistral-medium-3-5",
      "mistral-small-2603",
      "mistral-large-2512",
      "mistral-medium-latest",
      "mistral-small-latest",
      "mistral-large-latest",
      "devstral-latest"
    ]);
    expect(findModelIds("openrouter")).toEqual([
      "openrouter/auto",
      "openai/gpt-5.6-sol",
      "anthropic/claude-fable-5",
      "anthropic/claude-opus-5",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.6-flash",
      "openai/gpt-5.5",
      "anthropic/claude-opus-4.7",
      "anthropic/claude-sonnet-4.6",
      "google/gemini-3.1-pro-preview"
    ]);
    expect(findModelIds("together")).toEqual([
      "moonshotai/Kimi-K2.6",
      "zai-org/GLM-5.1",
      "openai/gpt-oss-120b",
      "deepseek-ai/DeepSeek-V4-Pro",
      "moonshotai/Kimi-K2.5",
      "deepseek-ai/DeepSeek-R1"
    ]);
    expect(findModelIds("aliyun-bailian")).toEqual([
      "qwen3.8-max",
      "qwen3.7-plus",
      "qwen3.7-flash",
      "qwen3.6-plus",
      "qwen3-max",
      "qwen3-coder-plus",
      "qwen3.5-flash"
    ]);
    expect(findModelIds("volcengine")).toEqual([
      "doubao-seed-evolving",
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-1-turbo-260628",
      "doubao-seed-1-6-flash-250715",
      "doubao-seed-1-6-thinking-250715",
      "deepseek-v3-2-250915",
      "deepseek-r1-250528"
    ]);
    expect(findModelIds("xai")).toEqual(["grok-4.5", "grok-4.3", "grok-4.3-fast"]);
    expect(findModelIds("azure-openai")).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano"
    ]);
    expect(findModelIds("ollama")).toEqual(["qwen3.5", "gemma4:12b", "gpt-oss:20b", "llama3.3", "qwen3:32b"]);
    expect(settings.providers.find((item) => item.id === "deepseek")?.models.map((model) => model.id)).not.toContain(
      "deepseek-chat"
    );
    expect(findModelCapabilities("openai", "gpt-5.6-sol")).toEqual(["text", "vision", "reasoning", "tools", "web"]);
    expect(findModelCapabilities("anthropic", "claude-haiku-4-5")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools"
    ]);
    expect(findModelCapabilities("google", "gemini-3.6-flash")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(findModelCapabilities("deepseek", "deepseek-v4-pro")).toEqual(["text", "reasoning", "tools"]);
    expect(findModelCapabilities("mistral", "mistral-large-2512")).toEqual(["text", "vision", "tools"]);
    expect(findModelCapabilities("together", "moonshotai/Kimi-K2.6")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools"
    ]);
    expect(findModelCapabilities("aliyun-bailian", "qwen3.8-max")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(findModelCapabilities("xiaomi-mimo", "mimo-v2.5")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(findModelCapabilities("xiaomi-mimo", "mimo-v2.5-pro")).toContain("web");
    expect(findModelCapabilities("xiaomi-mimo", "mimo-v2.5-flash")).toContain("web");
    expect(findModelCapabilities("volcengine", "doubao-seed-evolving")).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(settings.providers.find((item) => item.id === "xiaomi-mimo")?.models.map((model) => model.id)).toEqual([
      "mimo-v2.5-pro",
      "mimo-v2.5",
      "mimo-v2.5-flash"
    ]);
  });

  it("builds provider-specific model list requests", () => {
    expect(buildAiProviderModelsRequest(provider({ type: "openai" }))).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      url: "https://api.openai.com/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "anthropic" }))).toMatchObject({
      headers: expect.objectContaining({
        "anthropic-version": expect.any(String),
        "x-api-key": "sk-test"
      }),
      url: "https://api.anthropic.com/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "google" }))).toMatchObject({
      headers: expect.objectContaining({ "x-goog-api-key": "sk-test" }),
      url: "https://generativelanguage.googleapis.com/v1beta/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "ollama", apiKey: "", baseUrl: "" }))).toMatchObject({
      headers: {},
      url: "http://localhost:11434/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({
      apiKey: "stale-local-key",
      apiStyle: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      type: "ollama"
    }))).toMatchObject({
      headers: {},
      url: "http://localhost:11434/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "mistral" }))).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      url: "https://api.mistral.ai/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "groq" }))).toMatchObject({
      url: "https://api.groq.com/openai/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "openrouter" }))).toMatchObject({
      url: "https://openrouter.ai/api/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "together" }))).toMatchObject({
      url: "https://api.together.xyz/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "xai" }))).toMatchObject({
      url: "https://api.x.ai/v1/models"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "azure-openai", baseUrl: "https://markra.openai.azure.com" }))).toMatchObject({
      headers: expect.objectContaining({ "api-key": "sk-test" }),
      url: "https://markra.openai.azure.com/openai/models?api-version=2024-10-21"
    });
    expect(buildAiProviderModelsRequest(provider({ type: "openai-compatible", baseUrl: "https://example.test/v1" }))).toMatchObject({
      url: "https://example.test/v1/models"
    });
    expect(
      buildAiProviderModelsRequest(
        provider({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          id: "aliyun-bailian",
          type: "openai-compatible"
        })
      )
    ).toMatchObject({
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
    });
    expect(
      buildAiProviderModelsRequest(
        provider({
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          id: "xiaomi-mimo",
          type: "openai-compatible"
        })
      )
    ).toMatchObject({
      url: "https://token-plan-cn.xiaomimimo.com/v1/models"
    });
    expect(
      buildAiProviderModelsRequest(
        provider({
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          id: "volcengine",
          type: "openai-compatible"
        })
      )
    ).toMatchObject({
      url: "https://ark.cn-beijing.volces.com/api/v3/models"
    });
  });

  it("adds custom provider headers to model list requests", () => {
    expect(
      buildAiProviderModelsRequest(
        provider({
          baseUrl: "https://proxy.example.test/v1",
          customHeaders: '{"HTTP-Referer":"https://markra.app","X-Title":"Markra"}',
          type: "openai-compatible"
        } as Partial<AiProviderConfig>)
      )
    ).toMatchObject({
      headers: expect.objectContaining({
        "HTTP-Referer": "https://markra.app",
        "X-Title": "Markra"
      })
    });
  });

  it("parses common model list response shapes", () => {
    expect(
      parseAiProviderModels(provider({ type: "openai" }), {
        data: [
          { id: "gpt-5" },
          { id: "gpt-image-1", object: "model" },
          { id: "gpt-4.1-vision-preview" },
          { id: "text-embedding-3-large" },
          { id: "gpt-4o-audio-preview" }
        ]
      })
    ).toEqual([
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5", name: "gpt-5" },
      { capabilities: ["image"], enabled: true, id: "gpt-image-1", name: "gpt-image-1" },
      { capabilities: ["text", "vision"], enabled: true, id: "gpt-4.1-vision-preview", name: "gpt-4.1-vision-preview" }
    ]);

    expect(
      parseAiProviderModels(provider({ type: "google" }), {
        models: [
          {
            displayName: "Gemini 2.5 Flash",
            name: "models/gemini-2.5-flash",
            supportedGenerationMethods: ["generateContent"]
          }
        ]
      })
    ).toEqual([
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash"
      }
    ]);

    expect(
      parseAiProviderModels(provider({ type: "google" }), {
        models: [
          {
            displayName: "Gemini 3.1 Flash TTS Preview",
            name: "models/gemini-3.1-flash-tts-preview",
            supportedGenerationMethods: ["generateContent"]
          }
        ]
      })
    ).toEqual([]);

    expect(
      parseAiProviderModels(provider({ id: "google", type: "google" }), {
        models: [
          {
            displayName: "Gemini 3.1 Pro Preview",
            name: "models/gemini-3.1-pro-preview",
            supportedGenerationMethods: ["generateContent"]
          }
        ]
      })
    ).toEqual([
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro Preview"
      }
    ]);

    expect(
      parseAiProviderModels(provider({ id: "google", type: "google" }), {
        models: [
          {
            displayName: "Gemini 3.1 Flash-Lite Preview",
            name: "models/gemini-3.1-flash-lite-preview",
            supportedGenerationMethods: ["generateContent"]
          }
        ]
      })
    ).toEqual([
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash-Lite Preview"
      }
    ]);

    expect(
      parseAiProviderModels(provider({ type: "together" }), [
        { display_name: "Llama 4", id: "meta-llama/Llama-4", type: "chat" }
      ])
    ).toEqual([{ capabilities: ["text"], enabled: true, id: "meta-llama/Llama-4", name: "Llama 4" }]);

    expect(
      parseAiProviderModels(provider({ id: "together", type: "together" }), [
        { display_name: "Kimi K2.5", id: "moonshotai/Kimi-K2.5", type: "chat" },
        { display_name: "DeepSeek R1", id: "deepseek-ai/DeepSeek-R1", type: "chat" }
      ])
    ).toEqual([
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "moonshotai/Kimi-K2.5",
        name: "Kimi K2.5"
      },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" }
    ]);

    expect(
      parseAiProviderModels(provider({ type: "openrouter" }), {
        data: [
          {
            architecture: {
              modality: "text+image->text",
              output_modalities: ["text"],
              supported_parameters: ["tools", "reasoning"]
            },
            id: "anthropic/claude-sonnet-4.6"
          }
        ]
      })
    ).toEqual([
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "anthropic/claude-sonnet-4.6",
        name: "anthropic/claude-sonnet-4.6"
      }
    ]);
  });

  it("tests and fetches models through an injected native transport", async () => {
    const transport = vi.fn().mockResolvedValue({
      body: {
        data: [{ id: "gpt-5" }]
      },
      status: 200
    });

    await expect(testAiProviderConnection(provider({ type: "openai" }), transport)).resolves.toEqual({
      message: "Connected",
      ok: true
    });
    await expect(fetchAiProviderModels(provider({ type: "openai" }), transport)).resolves.toEqual([
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5", name: "gpt-5" }
    ]);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ url: "https://api.openai.com/v1/models" }));
  });
});
