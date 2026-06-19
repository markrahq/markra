import { act, renderHook, waitFor } from "@testing-library/react";
import { getStoredAiSettings, saveStoredAiSettings, type AiProviderConfig } from "../lib/settings/app-settings";
import { listenAppAiSettingsChanged, notifyAppAiSettingsChanged } from "../lib/settings/settings-events";
import { useAiSettings } from "./useAiSettings";

vi.mock("../lib/settings/app-settings", () => ({
  getStoredAiSettings: vi.fn(),
  saveStoredAiSettings: vi.fn()
}));

vi.mock("../lib/settings/settings-events", () => ({
  listenAppAiSettingsChanged: vi.fn(),
  notifyAppAiSettingsChanged: vi.fn()
}));

const mockedGetStoredAiSettings = vi.mocked(getStoredAiSettings);
const mockedSaveStoredAiSettings = vi.mocked(saveStoredAiSettings);
const mockedListenAppAiSettingsChanged = vi.mocked(listenAppAiSettingsChanged);
const mockedNotifyAppAiSettingsChanged = vi.mocked(notifyAppAiSettingsChanged);

describe("useAiSettings", () => {
  beforeEach(() => {
    mockedGetStoredAiSettings.mockReset();
    mockedSaveStoredAiSettings.mockReset();
    mockedListenAppAiSettingsChanged.mockReset();
    mockedNotifyAppAiSettingsChanged.mockReset();
    mockedSaveStoredAiSettings.mockResolvedValue(undefined);
    mockedListenAppAiSettingsChanged.mockResolvedValue(() => {});
  });

  it("selects the enabled default provider and a text-capable default model", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "secret",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-image-2",
          enabled: true,
          id: "openai",
          models: [
            { capabilities: ["image"], enabled: true, id: "gpt-image-2", name: "GPT Image 2" },
            { capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }
          ],
          name: "OpenAI",
          type: "openai"
        }
      ]
    });

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeProvider?.id).toBe("openai");
    expect(result.current.defaultModelId).toBe("gpt-5.5");
    expect(result.current.availableTextModels).toEqual([
      {
        capabilities: ["text", "vision"],
        id: "gpt-5.5",
        name: "GPT-5.5",
        providerId: "openai",
        providerName: "OpenAI",
        providerType: "openai"
      }
    ]);
  });

  it("returns null provider/model when no enabled text provider exists", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: false,
          id: "openai",
          models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        }
      ]
    });

    const { result } = renderHook(() => useAiSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeProvider).toBeNull();
    expect(result.current.defaultModelId).toBeNull();
    expect(result.current.availableTextModels).toEqual([]);
  });

  it("persists the editor AI model selection", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "openai-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "anthropic-key",
          baseUrl: "https://api.anthropic.com/v1",
          defaultModelId: "claude-opus-4-6",
          enabled: true,
          id: "anthropic",
          models: [
            { capabilities: ["text"], enabled: true, id: "claude-opus-4-6", name: "Claude Opus 4.6" },
            { capabilities: ["text", "reasoning"], enabled: true, id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }
          ],
          name: "Anthropic",
          type: "anthropic"
        }
      ]
    });

    const { result } = renderHook(() => useAiSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.selectEditorModel("anthropic", "claude-sonnet-4-6");
    });

    expect(result.current.activeProvider?.id).toBe("anthropic");
    expect(result.current.defaultModelId).toBe("claude-sonnet-4-6");
    expect(result.current.inlineProviderId).toBe("anthropic");
    expect(result.current.inlineModelId).toBe("claude-sonnet-4-6");
    expect(mockedSaveStoredAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModelId: "gpt-5.5",
        defaultProviderId: "openai",
        inlineDefaultModelId: "claude-sonnet-4-6",
        inlineDefaultProviderId: "anthropic"
      })
    );
    expect(mockedNotifyAppAiSettingsChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps inline AI and agent panel model choices independent", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      agentDefaultModelId: "gpt-5.5",
      agentDefaultProviderId: "openai",
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      inlineDefaultModelId: "gpt-5.5",
      inlineDefaultProviderId: "openai",
      providers: [
        {
          apiKey: "openai-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "deepseek-key",
          baseUrl: "https://api.deepseek.com/v1",
          defaultModelId: "deepseek-v4-flash",
          enabled: true,
          id: "deepseek",
          models: [{ capabilities: ["text", "reasoning"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
          name: "DeepSeek",
          type: "deepseek"
        }
      ]
    });

    const { result } = renderHook(() => useAiSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.selectAgentModel("deepseek", "deepseek-v4-flash");
    });

    expect(result.current.inlineProviderId).toBe("openai");
    expect(result.current.inlineModelId).toBe("gpt-5.5");
    expect(result.current.agentProviderId).toBe("deepseek");
    expect(result.current.agentModelId).toBe("deepseek-v4-flash");
    expect(mockedSaveStoredAiSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentDefaultModelId: "deepseek-v4-flash",
        agentDefaultProviderId: "deepseek",
        inlineDefaultModelId: "gpt-5.5",
        inlineDefaultProviderId: "openai"
      })
    );
  });

  it("reacts to AI settings updates from another window", async () => {
    let handleAiSettingsChanged: ((settings: Parameters<typeof mockedNotifyAppAiSettingsChanged>[0]) => unknown) | null = null;

    mockedListenAppAiSettingsChanged.mockImplementation(async (listener) => {
      handleAiSettingsChanged = listener;
      return () => {};
    });

    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "openai-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "deepseek-key",
          baseUrl: "https://api.deepseek.com/v1",
          defaultModelId: "deepseek-v4-flash",
          enabled: false,
          id: "deepseek",
          models: [{ capabilities: ["text", "reasoning"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
          name: "DeepSeek",
          type: "deepseek"
        }
      ]
    });

    const { result } = renderHook(() => useAiSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeProvider?.id).toBe("openai");

    await act(async () => {
      handleAiSettingsChanged?.({
        defaultModelId: "deepseek-v4-flash",
        defaultProviderId: "deepseek",
        providers: [
          {
            apiKey: "openai-key",
            baseUrl: "https://api.openai.com/v1",
            defaultModelId: "gpt-5.5",
            enabled: true,
            id: "openai",
            models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
            name: "OpenAI",
            type: "openai"
          },
          {
            apiKey: "deepseek-key",
            baseUrl: "https://api.deepseek.com/v1",
            defaultModelId: "deepseek-v4-flash",
            enabled: true,
            id: "deepseek",
            models: [{ capabilities: ["text", "reasoning"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
            name: "DeepSeek",
            type: "deepseek"
          }
        ]
      });
    });

    expect(result.current.activeProvider?.id).toBe("deepseek");
    expect(result.current.defaultModelId).toBe("deepseek-v4-flash");
    expect(result.current.availableTextModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "deepseek-v4-flash",
          providerId: "deepseek",
          providerType: "deepseek"
        })
      ])
    );
  });

  it("keeps a live AI settings update when the initial stored settings resolve later", async () => {
    let handleAiSettingsChanged: ((settings: Parameters<typeof mockedNotifyAppAiSettingsChanged>[0]) => unknown) | null = null;
    let resolveStoredSettings: (settings: Awaited<ReturnType<typeof getStoredAiSettings>>) => void = () => {};

    mockedGetStoredAiSettings.mockReturnValue(new Promise((resolve) => {
      resolveStoredSettings = resolve;
    }));
    mockedListenAppAiSettingsChanged.mockImplementation(async (listener) => {
      handleAiSettingsChanged = listener;
      return () => {};
    });

    const openAiProvider: AiProviderConfig = {
      apiKey: "openai-key",
      baseUrl: "https://api.openai.com/v1",
      defaultModelId: "gpt-5.5",
      enabled: true,
      id: "openai",
      models: [{ capabilities: ["text"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
      name: "OpenAI",
      type: "openai" as const
    };
    const deepSeekProvider: AiProviderConfig = {
      apiKey: "deepseek-key",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModelId: "deepseek-v4-flash",
      enabled: true,
      id: "deepseek",
      models: [{ capabilities: ["text", "reasoning"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
      name: "DeepSeek",
      type: "deepseek" as const
    };

    const { result } = renderHook(() => useAiSettings());

    act(() => {
      handleAiSettingsChanged?.({
        defaultModelId: "deepseek-v4-flash",
        defaultProviderId: "deepseek",
        providers: [openAiProvider, deepSeekProvider]
      });
    });
    expect(result.current.activeProvider?.id).toBe("deepseek");

    await act(async () => {
      resolveStoredSettings({
        defaultModelId: "gpt-5.5",
        defaultProviderId: "openai",
        providers: [openAiProvider, deepSeekProvider]
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.activeProvider?.id).toBe("deepseek");
    expect(result.current.defaultModelId).toBe("deepseek-v4-flash");
  });
});
