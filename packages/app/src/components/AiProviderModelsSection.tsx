import { Pencil, Plus } from "lucide-react";
import { CapabilityPicker, CapabilityPills } from "./AiModelCapabilities";
import { IconButton } from "@markra/ui";
import {
  AiProviderSwitch,
  AiSettingsActionButton,
  AiSettingsSection,
  AiSettingsSelectField,
  AiSettingsTextField
} from "./AiProviderSettingsControls";
import {
  updateAiProviderSettingsProvider,
  type AiProviderActionState,
  type AiProviderModelDraft
} from "../hooks/useAiProviderSettingsPanelState";
import type { Dispatch, SetStateAction } from "react";
import type { AiProviderConfig, AiProviderModel, AiProviderSettings } from "@markra/providers";
import type { I18nKey } from "@markra/shared";

type Translate = (key: I18nKey) => string;

export function AiProviderModelsSection({
  actionState,
  canAddModel,
  canSaveEditedModel,
  editModelDraft,
  editingModelId,
  isAddingModel,
  modelDraft,
  modelOptions,
  selectedProvider,
  settings,
  translate,
  onAddModel,
  onCancelAddModel,
  onCancelEditModel,
  onFetchModels,
  onSaveEditedModel,
  onStartAddModel,
  onStartEditModel,
  onUpdateSettings,
  setEditModelDraft,
  setModelDraft,
  updateSelectedProvider
}: {
  actionState: AiProviderActionState;
  canAddModel: boolean;
  canSaveEditedModel: boolean;
  editModelDraft: AiProviderModelDraft;
  editingModelId: string | null;
  isAddingModel: boolean;
  modelDraft: AiProviderModelDraft;
  modelOptions: AiProviderModel[];
  selectedProvider: AiProviderConfig;
  settings: AiProviderSettings;
  translate: Translate;
  onAddModel: () => unknown;
  onCancelAddModel: () => unknown;
  onCancelEditModel: () => unknown;
  onFetchModels: () => unknown;
  onSaveEditedModel: () => unknown;
  onStartAddModel: () => unknown;
  onStartEditModel: (model: AiProviderModel) => unknown;
  onUpdateSettings: (settings: AiProviderSettings) => unknown;
  setEditModelDraft: Dispatch<SetStateAction<AiProviderModelDraft>>;
  setModelDraft: Dispatch<SetStateAction<AiProviderModelDraft>>;
  updateSelectedProvider: (updater: (provider: AiProviderConfig) => AiProviderConfig) => unknown;
}) {
  const allModelsEnabled = modelOptions.length > 0 && modelOptions.every((model) => model.enabled);
  const toggleAllModelsLabel = translate(
    allModelsEnabled ? "settings.ai.deselectAllModels" : "settings.ai.selectAllModels"
  );

  return (
    <AiSettingsSection label={translate("settings.sections.aiModels")}>
      <div className="grid gap-4 py-2">
        <AiSettingsSelectField
          label={translate("settings.ai.defaultModel")}
          value={selectedProvider.defaultModelId ?? modelOptions[0]?.id ?? ""}
          onChange={(defaultModelId) => {
            onUpdateSettings({
              ...updateAiProviderSettingsProvider(settings, selectedProvider.id, (provider) => ({
                ...provider,
                defaultModelId
              })),
              defaultModelId,
              defaultProviderId: selectedProvider.id
            });
          }}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </AiSettingsSelectField>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="m-0 text-[12px] leading-5 font-bold text-(--text-secondary)">
              {translate("settings.ai.availableModels")}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <AiSettingsActionButton
                label={toggleAllModelsLabel}
                disabled={modelOptions.length === 0}
                onClick={() =>
                  updateSelectedProvider((provider) => {
                    const enabled = !provider.models.every((model) => model.enabled);

                    return {
                      ...provider,
                      models: provider.models.map((model) => ({ ...model, enabled }))
                    };
                  })
                }
              >
                {toggleAllModelsLabel}
              </AiSettingsActionButton>
              <AiSettingsActionButton label={translate("settings.ai.addModel")} onClick={onStartAddModel}>
                <Plus aria-hidden="true" size={14} />
                {translate("settings.ai.addModel")}
              </AiSettingsActionButton>
              <AiSettingsActionButton
                label={translate("settings.ai.getModelList")}
                disabled={actionState.pending === "models"}
                onClick={onFetchModels}
              >
                {actionState.pending === "models"
                  ? translate("settings.ai.fetchingModels")
                  : translate("settings.ai.getModelList")}
              </AiSettingsActionButton>
            </div>
          </div>

          {isAddingModel ? (
            <div className="mb-3 grid gap-3 rounded-md bg-(--bg-secondary) p-3">
              <AiProviderModelDraftFields
                draft={modelDraft}
                translate={translate}
                onChange={setModelDraft}
              />
              <div className="flex justify-end gap-2">
                <AiSettingsActionButton label={translate("settings.ai.cancelAddModel")} onClick={onCancelAddModel}>
                  {translate("settings.ai.cancelAddModel")}
                </AiSettingsActionButton>
                <AiSettingsActionButton
                  label={translate("settings.ai.addModelToProvider")}
                  disabled={!canAddModel}
                  onClick={onAddModel}
                >
                  {translate("settings.ai.addModelToProvider")}
                </AiSettingsActionButton>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-(--border-default)">
            {modelOptions.map((model) => (
              <div className="py-2" key={model.id}>
                {editingModelId === model.id ? (
                  <div className="grid gap-3 rounded-md bg-(--bg-secondary) p-3">
                    <AiProviderModelDraftFields
                      draft={editModelDraft}
                      translate={translate}
                      onChange={setEditModelDraft}
                    />
                    <div className="flex justify-end gap-2">
                      <AiSettingsActionButton label={translate("settings.ai.cancelEditModel")} onClick={onCancelEditModel}>
                        {translate("settings.ai.cancelEditModel")}
                      </AiSettingsActionButton>
                      <AiSettingsActionButton
                        label={translate("settings.ai.saveModelChanges")}
                        disabled={!canSaveEditedModel}
                        onClick={onSaveEditedModel}
                      >
                        {translate("settings.ai.saveModelChanges")}
                      </AiSettingsActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3">
                    <AiProviderSwitch
                      checked={model.enabled}
                      label={model.name}
                      onChange={() =>
                        updateSelectedProvider((provider) => ({
                          ...provider,
                          models: provider.models.map((item) =>
                            item.id === model.id ? { ...item, enabled: !item.enabled } : item
                          )
                        }))
                      }
                    />
                    <span className="min-w-0 truncate text-[13px] leading-5 font-semibold text-(--text-heading)">
                      {model.name}
                    </span>
                    <CapabilityPills capabilities={model.capabilities} translate={translate} />
                    <IconButton
                      label={`${translate("settings.ai.editModel")} ${model.name}`}
                      size="icon-md"
                      onClick={() => onStartEditModel(model)}
                    >
                      <Pencil aria-hidden="true" size={14} />
                    </IconButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AiSettingsSection>
  );
}

function AiProviderModelDraftFields({
  draft,
  onChange,
  translate
}: {
  draft: AiProviderModelDraft;
  onChange: Dispatch<SetStateAction<AiProviderModelDraft>>;
  translate: Translate;
}) {
  return (
    <div className="grid gap-3 min-[780px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AiSettingsTextField
        label={translate("settings.ai.modelId")}
        value={draft.id}
        onChange={(id) => onChange((current) => ({ ...current, id }))}
      />
      <AiSettingsTextField
        label={translate("settings.ai.modelName")}
        value={draft.name}
        onChange={(name) => onChange((current) => ({ ...current, name }))}
      />
      <div className="min-[780px]:col-span-2">
        <CapabilityPicker
          label={translate("settings.ai.modelCapability")}
          value={draft.capabilities}
          translate={translate}
          onChange={(capabilities) => onChange((current) => ({ ...current, capabilities }))}
        />
      </div>
    </div>
  );
}
