import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredAiSettings, saveStoredAiSettings, type AiProviderSettings } from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("AI settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads default AI provider settings when none are stored", async () => {
    store.get.mockResolvedValue(undefined);

    const settings = await getStoredAiSettings();

    expect(store.get).toHaveBeenCalledWith("aiProviders");
    expect(settings.providers.map((provider) => provider.id)).toContain("openai");
    expect(settings.providers.find((provider) => provider.id === "azure-openai")?.baseUrl).toBe(
      "https://your-resource-name.openai.azure.com"
    );
    expect(settings.providers.find((provider) => provider.id === "aliyun-bailian")).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      type: "openai-compatible"
    });
    expect(settings.providers.find((provider) => provider.id === "xiaomi-mimo")).toMatchObject({
      baseUrl: "https://api.xiaomimimo.com/v1",
      type: "openai-compatible"
    });
    expect(settings.providers.find((provider) => provider.id === "volcengine")).toMatchObject({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      type: "openai-compatible"
    });
    expect(settings.providers[0]?.models[0]?.capabilities).toEqual(["text", "vision", "reasoning", "tools", "web"]);
  });

  it("fills default API URLs for stored built-in AI providers without one", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gpt-4o",
          enabled: false,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-4o", name: "GPT-4o" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "qwen3.6-plus",
          enabled: false,
          id: "aliyun-bailian",
          models: [{ capability: "text", enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
          name: "Qwen",
          type: "openai-compatible"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "default",
          enabled: false,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "default", name: "Default model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers.find((provider) => provider.id === "openai")?.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.providers.find((provider) => provider.id === "aliyun-bailian")?.baseUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")?.baseUrl).toBe("");
  });

  it("preserves Xiaomi MiMo Token Plan API URLs because they are valid non-native-search endpoints", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "mimo-v2.5",
      defaultProviderId: "xiaomi-mimo",
      providers: [
        {
          apiKey: "sk-test",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          defaultModelId: "mimo-v2.5",
          enabled: true,
          id: "xiaomi-mimo",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "mimo-v2.5", name: "MiMo V2.5" }],
          name: "Xiaomi MiMo",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers.find((provider) => provider.id === "xiaomi-mimo")?.baseUrl).toBe(
      "https://token-plan-cn.xiaomimimo.com/v1"
    );
  });

  it("removes the legacy OpenAI Compatible built-in provider while preserving custom compatible providers", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "default",
      defaultProviderId: "openai-compatible",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "default",
          enabled: false,
          id: "openai-compatible",
          models: [{ capability: "text", enabled: true, id: "default", name: "Default model" }],
          name: "OpenAI Compatible",
          type: "openai-compatible"
        },
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          customHeaders: '{"HTTP-Referer":"https://markra.app"}',
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.defaultProviderId).toBe("custom-provider-1");
    expect(settings.providers.map((provider) => provider.id)).toEqual(["custom-provider-1"]);
    expect(settings.providers[0]?.type).toBe("openai-compatible");
  });

  it("refreshes stale built-in AI provider model defaults from stored settings", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gpt-4o",
          enabled: false,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-4o", name: "GPT-4o" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "deepseek-chat",
          enabled: false,
          id: "deepseek",
          models: [
            { capability: "text", enabled: true, id: "deepseek-chat", name: "DeepSeek Chat" },
            { capability: "text", enabled: true, id: "deepseek-reasoner", name: "DeepSeek Reasoner" }
          ],
          name: "DeepSeek",
          type: "deepseek"
        }
      ]
    });

    const settings = await getStoredAiSettings();
    const openai = settings.providers.find((provider) => provider.id === "openai");
    const deepseek = settings.providers.find((provider) => provider.id === "deepseek");

    expect(settings.defaultModelId).toBe("gpt-5.5");
    expect(openai?.defaultModelId).toBe("gpt-5.5");
    expect(openai?.models.map((model) => model.id)).toEqual(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-image-2"]);
    expect(deepseek?.defaultModelId).toBe("deepseek-v4-pro");
    expect(deepseek?.models.map((model) => model.id)).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
  });

  it("preserves user-added AI provider models during normalization", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-custom",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          defaultModelId: "gpt-custom",
          enabled: true,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-custom", name: "GPT Custom" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.defaultModelId).toBe("gpt-custom");
    expect(settings.providers.find((provider) => provider.id === "openai")?.models.map((model) => model.id)).toEqual(["gpt-custom"]);
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")?.models.map((model) => model.id)).toEqual([
      "writer-model"
    ]);
  });

  it("preserves custom headers for AI providers", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "writer-model",
      defaultProviderId: "custom-provider-1",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          customHeaders: '{"HTTP-Referer":"https://markra.app"}',
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "reasoning", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers[0]).toMatchObject({
      customHeaders: '{"HTTP-Referer":"https://markra.app"}'
    });
  });

  it("enriches stored built-in AI models with current built-in capabilities", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gemini-3.1-pro-preview",
      defaultProviderId: "google",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gemini-3.1-pro-preview",
          enabled: true,
          id: "google",
          models: [
            { capabilities: ["text"], enabled: true, id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
            { capability: "text", enabled: true, id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
            { capabilities: ["text"], enabled: true, id: "custom-gemini", name: "Custom Gemini" }
          ],
          name: "Google",
          type: "google"
        }
      ]
    });

    const settings = await getStoredAiSettings();
    const google = settings.providers.find((provider) => provider.id === "google");

    expect(google?.models.find((model) => model.id === "gemini-3.1-pro-preview")?.capabilities).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(google?.models.find((model) => model.id === "gemini-3-flash-preview")?.capabilities).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(google?.models.find((model) => model.id === "custom-gemini")?.capabilities).toEqual(["text"]);
  });

  it("normalizes legacy single-capability AI models into multi-capability models", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "legacy-vision",
      defaultProviderId: "custom-provider-1",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          defaultModelId: "legacy-vision",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "vision", enabled: true, id: "legacy-vision", name: "Legacy Vision" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers[0]?.models[0]).toMatchObject({
      capabilities: ["text", "vision"],
      id: "legacy-vision"
    });
  });

  it("persists AI provider settings in the app settings store", async () => {
    const settings: AiProviderSettings = {
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-4o",
          enabled: true,
          id: "openai",
          models: [
            {
              capabilities: ["text", "reasoning", "tools"],
              enabled: true,
              id: "gpt-4o",
              name: "GPT-4o"
            }
          ],
          name: "OpenAI",
          type: "openai" as const
        }
      ]
    };

    await saveStoredAiSettings(settings);

    expect(store.set).toHaveBeenCalledWith("aiProviders", settings);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
