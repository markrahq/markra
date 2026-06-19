import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getStoredAiSettings,
  type AiProviderApiStyle,
  saveStoredAiSettings,
  type AiModelCapability,
  type AiProviderConfig,
  type AiProviderModel,
  type AiProviderSettings
} from "../lib/settings/app-settings";
import { listenAppAiSettingsChanged, notifyAppAiSettingsChanged } from "../lib/settings/settings-events";

export type AvailableAiTextModel = {
  capabilities: AiModelCapability[];
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  providerType: AiProviderApiStyle;
};

export function useAiSettings() {
  const [settings, setSettings] = useState<AiProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const liveSettingsReceivedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredAiSettings()
      .then((nextSettings) => {
        if (alive && !liveSettingsReceivedRef.current) setSettings(nextSettings);
      })
      .catch(() => {
        if (alive && !liveSettingsReceivedRef.current) setSettings(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppAiSettingsChanged((nextSettings) => {
      if (alive) {
        liveSettingsReceivedRef.current = true;
        setSettings(nextSettings);
        setLoading(false);
      }
    }).then((cleanup) => {
      if (!alive) {
        cleanup();
        return;
      }

      stopListening = cleanup;
    });

    return () => {
      alive = false;
      stopListening?.();
    };
  }, []);

  const selectInlineModel = useCallback(
    async (providerId: string, modelId: string) => {
      if (!settings) return;

      const selectedProvider = settings.providers.find((provider) => provider.enabled && provider.id === providerId);
      const selectedModel = selectedProvider?.models.find((model) => isEnabledTextModel(model) && model.id === modelId);

      if (!selectedProvider || !selectedModel) return;
      if (settings.agentDefaultProviderId === providerId && settings.agentDefaultModelId === modelId) return;

      const nextSettings: AiProviderSettings = {
        ...settings,
        inlineDefaultModelId: modelId,
        inlineDefaultProviderId: providerId
      };

      setSettings(nextSettings);
      liveSettingsReceivedRef.current = true;
      await saveStoredAiSettings(nextSettings);
      await notifyAppAiSettingsChanged(nextSettings);
    },
    [settings]
  );

  const selectAgentModel = useCallback(
    async (providerId: string, modelId: string) => {
      if (!settings) return;

      const selectedProvider = settings.providers.find((provider) => provider.enabled && provider.id === providerId);
      const selectedModel = selectedProvider?.models.find((model) => isEnabledTextModel(model) && model.id === modelId);

      if (!selectedProvider || !selectedModel) return;

      const nextSettings: AiProviderSettings = {
        ...settings,
        agentDefaultModelId: modelId,
        agentDefaultProviderId: providerId
      };

      setSettings(nextSettings);
      liveSettingsReceivedRef.current = true;
      await saveStoredAiSettings(nextSettings);
      await notifyAppAiSettingsChanged(nextSettings);
    },
    [settings]
  );

  return useMemo(() => {
    const enabledProviders = settings?.providers.filter(hasEnabledTextModel) ?? [];
    const availableTextModels = enabledProviders.flatMap((provider) =>
      provider.models.filter(isEnabledTextModel).map((model) => ({
        capabilities: [...model.capabilities],
        id: model.id,
        name: model.name,
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type
      }))
    );
    const inlineSelection = resolveTextSelection({
      globalModelId: settings?.defaultModelId,
      globalProviderId: settings?.defaultProviderId,
      preferredModelId: settings?.inlineDefaultModelId,
      preferredProviderId: settings?.inlineDefaultProviderId,
      providers: enabledProviders
    });
    const agentSelection = resolveTextSelection({
      globalModelId: settings?.defaultModelId,
      globalProviderId: settings?.defaultProviderId,
      preferredModelId: settings?.agentDefaultModelId,
      preferredProviderId: settings?.agentDefaultProviderId,
      providers: enabledProviders
    });

    return {
      activeProvider: inlineSelection.provider,
      agentModelId: agentSelection.modelId,
      agentProvider: agentSelection.provider,
      agentProviderId: agentSelection.provider?.id ?? null,
      availableTextModels,
      defaultModelId: inlineSelection.modelId,
      inlineModelId: inlineSelection.modelId,
      inlineProvider: inlineSelection.provider,
      inlineProviderId: inlineSelection.provider?.id ?? null,
      loading,
      selectAgentModel,
      selectEditorModel: selectInlineModel,
      selectInlineModel,
      settings
    };
  }, [loading, selectAgentModel, selectInlineModel, settings]);
}

function hasEnabledTextModel(provider: AiProviderConfig) {
  return provider.enabled && provider.models.some(isEnabledTextModel);
}

function isEnabledTextModel(model: AiProviderModel) {
  return model.enabled && model.capabilities.includes("text");
}

function readDefaultTextModelId(provider: AiProviderConfig, globalDefaultModelId?: string) {
  const enabledTextModels = provider.models.filter(isEnabledTextModel);
  const providerDefaultModel = enabledTextModels.find((model) => model.id === provider.defaultModelId);
  const globalDefaultModel = enabledTextModels.find((model) => model.id === globalDefaultModelId);

  return providerDefaultModel?.id ?? globalDefaultModel?.id ?? enabledTextModels[0]?.id ?? null;
}

function resolveTextSelection({
  globalModelId,
  globalProviderId,
  preferredModelId,
  preferredProviderId,
  providers
}: {
  globalModelId?: string;
  globalProviderId?: string;
  preferredModelId?: string;
  preferredProviderId?: string;
  providers: AiProviderConfig[];
}) {
  const preferredProvider = providers.find((provider) => provider.id === preferredProviderId) ?? null;
  const globalProvider = providers.find((provider) => provider.id === globalProviderId) ?? null;
  const provider = preferredProvider ?? globalProvider ?? providers[0] ?? null;
  if (!provider) return { modelId: null, provider: null };

  const modelId = resolveTextModelId(provider, preferredModelId, globalModelId);

  return {
    modelId,
    provider
  };
}

function resolveTextModelId(provider: AiProviderConfig, preferredModelId?: string, globalModelId?: string) {
  const enabledTextModels = provider.models.filter(isEnabledTextModel);
  const preferredModel = enabledTextModels.find((model) => model.id === preferredModelId);
  const globalModel = enabledTextModels.find((model) => model.id === globalModelId);
  const providerDefaultModel = enabledTextModels.find((model) => model.id === provider.defaultModelId);

  return preferredModel?.id ?? globalModel?.id ?? providerDefaultModel?.id ?? enabledTextModels[0]?.id ?? null;
}
