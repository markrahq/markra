import { createDefaultAiSettings, normalizeAiSettings } from "./settings";

describe("AI provider settings", () => {
  it("adds disabled OrcaRouter to existing settings without changing saved providers or selections", () => {
    const saved = {
      defaultProviderId: "custom-provider-1",
      defaultModelId: "mock-writer",
      inlineDefaultProviderId: "custom-provider-1",
      inlineDefaultModelId: "mock-writer",
      agentDefaultProviderId: "custom-provider-1",
      agentDefaultModelId: "mock-agent",
      providers: [{
        apiKey: "mock-key",
        apiStyle: "openai-compatible" as const,
        baseUrl: "https://gateway.example.test/v1",
        customHeaders: '{"X-Test":"mock"}',
        defaultModelId: "mock-writer",
        enabled: true,
        id: "custom-provider-1",
        models: [
          { capabilities: ["text"], enabled: true, id: "mock-writer", name: "Mock Writer" },
          { capabilities: ["text", "tools"], enabled: true, id: "mock-agent", name: "Mock Agent" }
        ],
        name: "Mock Gateway",
        type: "openai-compatible" as const
      }]
    };

    const settings = normalizeAiSettings(saved);
    const { providers: savedProviders, ...selections } = saved;
    expect(settings).toMatchObject(selections);
    expect(settings.providers[0]).toEqual(savedProviders[0]);
    expect(settings.providers).toHaveLength(3);
    expect(settings.providers[1]).toMatchObject({
      apiKey: "",
      apiStyle: "openai-compatible",
      baseUrl: "https://api.orcarouter.ai/v1",
      defaultModelId: "orcarouter/auto",
      enabled: false,
      id: "orcarouter",
      name: "OrcaRouter",
      type: "openai-compatible"
    });
    expect(saved.providers).toHaveLength(1);
    expect(normalizeAiSettings(settings)).toEqual(settings);
  });

  it("preserves saved OrcaRouter configuration without duplicating or resetting it", () => {
    const saved = {
      defaultProviderId: "orcarouter",
      defaultModelId: "mock/model",
      providers: [{
        apiKey: "mock-orca-key",
        baseUrl: "https://orca.example.test/v1",
        defaultModelId: "mock/model",
        enabled: true,
        id: "orcarouter",
        models: [{ capabilities: ["text"], enabled: true, id: "mock/model", name: "Mock model" }],
        name: "My router",
        type: "openai-compatible"
      }]
    };
    const settings = normalizeAiSettings(saved);
    expect(settings.providers.filter((provider) => provider.id === "orcarouter")).toHaveLength(1);
    expect(settings.providers[0]).toMatchObject(saved.providers[0]);
    expect(settings.defaultModelId).toBe("mock/model");
  });

  it("includes an independent OrcaRouter configuration in each fresh settings object", () => {
    const first = createDefaultAiSettings().providers.find((provider) => provider.id === "orcarouter");
    const second = createDefaultAiSettings().providers.find((provider) => provider.id === "orcarouter");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.models).not.toBe(second?.models);
    expect(first).toMatchObject({ enabled: false, apiKey: "", defaultModelId: "orcarouter/auto" });
    expect(first?.models.some((model) => model.enabled && model.id === first.defaultModelId)).toBe(true);
  });

  it("adds disabled Requesty to existing settings without changing saved selections", () => {
    const saved = {
      defaultProviderId: "custom-provider-1",
      defaultModelId: "mock-writer",
      providers: [{
        apiKey: "mock-key",
        baseUrl: "https://gateway.example.test/v1",
        defaultModelId: "mock-writer",
        enabled: true,
        id: "custom-provider-1",
        models: [{ capabilities: ["text"], enabled: true, id: "mock-writer", name: "Mock Writer" }],
        name: "Mock Gateway",
        type: "openai-compatible" as const
      }]
    };

    const settings = normalizeAiSettings(saved);
    expect(settings.defaultProviderId).toBe("custom-provider-1");
    expect(settings.defaultModelId).toBe("mock-writer");
    expect(settings.providers.find((provider) => provider.id === "requesty")).toMatchObject({
      apiKey: "",
      apiStyle: "openai-compatible",
      baseUrl: "https://router.requesty.ai/v1",
      defaultModelId: "gpt-5.6-sol",
      enabled: false,
      name: "Requesty",
      type: "openai-compatible"
    });
    expect(normalizeAiSettings(settings)).toEqual(settings);
  });

  it("preserves saved Requesty configuration without duplicating or resetting it", () => {
    const saved = {
      defaultProviderId: "requesty",
      defaultModelId: "mock/model",
      providers: [{
        apiKey: "mock-requesty-key",
        baseUrl: "https://router.eu.requesty.ai/v1",
        defaultModelId: "mock/model",
        enabled: true,
        id: "requesty",
        models: [{ capabilities: ["text"], enabled: true, id: "mock/model", name: "Mock model" }],
        name: "My router",
        type: "openai-compatible"
      }]
    };
    const settings = normalizeAiSettings(saved);
    expect(settings.providers.filter((provider) => provider.id === "requesty")).toHaveLength(1);
    expect(settings.providers.find((provider) => provider.id === "requesty")).toMatchObject(saved.providers[0]);
    expect(settings.defaultModelId).toBe("mock/model");
  });

  it("normalizes legacy provider types into the new request API styles", () => {
    const settings = normalizeAiSettings({
      defaultProviderId: "openai",
      providers: [
        {
          enabled: true,
          id: "openai",
          models: [{ enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          enabled: true,
          id: "openrouter",
          models: [{ enabled: true, id: "openrouter/auto", name: "Auto" }],
          name: "OpenRouter",
          type: "openrouter"
        },
        {
          apiStyle: "amazon-bedrock",
          enabled: false,
          id: "custom-provider-1",
          models: [{ enabled: true, id: "anthropic.claude-sonnet-4-5-v1:0", name: "Claude Sonnet" }],
          name: "Legacy Bedrock Relay",
          type: "openai-compatible"
        }
      ]
    });

    expect(settings.providers.find((provider) => provider.id === "openai")).toMatchObject({
      apiStyle: "openai-responses",
      type: "openai"
    });
    expect(settings.providers.find((provider) => provider.id === "openrouter")).toMatchObject({
      apiStyle: "openai-compatible",
      type: "openrouter"
    });
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")).toMatchObject({
      apiStyle: "openai-compatible",
      type: "openai-compatible"
    });
  });

  it("keeps fixed built-in providers on their catalog request style", () => {
    const settings = normalizeAiSettings({
      defaultProviderId: "groq",
      providers: [
        {
          apiStyle: "anthropic",
          enabled: true,
          id: "groq",
          models: [{ enabled: true, id: "llama-3.3-70b-versatile", name: "Llama" }],
          name: "Groq",
          type: "groq"
        },
        {
          apiStyle: "google",
          enabled: true,
          id: "openai",
          models: [{ enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiStyle: "amazon-bedrock",
          enabled: true,
          id: "custom-provider-1",
          models: [{ enabled: true, id: "default", name: "Default" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    expect(settings.providers.find((provider) => provider.id === "groq")).toMatchObject({
      apiStyle: "openai-compatible"
    });
    expect(settings.providers.find((provider) => provider.id === "openai")).toMatchObject({
      apiStyle: "openai-responses"
    });
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")).toMatchObject({
      apiStyle: "openai-compatible"
    });
  });

  it("drops stored API keys for providers that do not use keys", () => {
    const settings = normalizeAiSettings({
      defaultProviderId: "ollama",
      providers: [
        {
          apiKey: "stale-local-key",
          baseUrl: "http://localhost:11434/v1",
          enabled: true,
          id: "ollama",
          models: [{ enabled: true, id: "llama3.3", name: "Llama" }],
          name: "Ollama",
          type: "ollama"
        }
      ]
    });

    expect(settings.providers.find((provider) => provider.id === "ollama")).toMatchObject({
      apiKey: "",
      baseUrl: "http://localhost:11434/v1"
    });
  });
});
