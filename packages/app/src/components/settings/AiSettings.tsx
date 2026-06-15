import { RotateCcw } from "lucide-react";
import { aiTranslationLanguageName, type AppLanguage } from "@markra/shared";
import {
  aiQuickActionIds,
  aiQuickActionLabelKeys,
  defaultAiQuickActionPrompt,
  defaultAiQuickActionPrompts,
  type AiQuickActionId
} from "../../lib/ai-actions";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  SettingsTextarea
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

function aiPromptInputLabel(actionId: AiQuickActionId, translate: SettingsTranslate) {
  return `${translate(aiQuickActionLabelKeys[actionId])} ${translate("settings.ai.prompt")}`;
}

function updateAiQuickActionPrompt(
  preferences: EditorPreferences,
  actionId: AiQuickActionId,
  prompt: string
): EditorPreferences {
  return {
    ...preferences,
    aiQuickActionPrompts: {
      ...(preferences.aiQuickActionPrompts ?? defaultAiQuickActionPrompts),
      [actionId]: prompt
    }
  };
}

export function AiSettings({
  language,
  onUpdatePreferences,
  preferences,
  translate
}: {
  language: AppLanguage;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const quickActionPrompts = preferences.aiQuickActionPrompts ?? defaultAiQuickActionPrompts;
  const translationTargetLanguage = aiTranslationLanguageName(language);

  return (
    <>
      <SettingsSection label={translate("settings.sections.aiAssistance")}>
        <SettingsRow
          title={translate("settings.editor.aiSelectionDisplayMode.command")}
          description={translate("settings.editor.autoOpenAiOnSelectionDescription")}
          action={
            <SettingsSwitch
              checked={preferences.showAiQuickInputOnSelection}
              label={translate("settings.editor.aiSelectionDisplayMode.useCommand")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  showAiQuickInputOnSelection: !preferences.showAiQuickInputOnSelection
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.aiSelectionDisplayMode.toolbar")}
          description={translate("settings.editor.aiSelectionDisplayModeDescription")}
          action={
            <SettingsSwitch
              checked={preferences.showAiSelectionToolbarOnSelection}
              label={translate("settings.editor.aiSelectionDisplayMode.useToolbar")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  showAiSelectionToolbarOnSelection: !preferences.showAiSelectionToolbarOnSelection
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.closeAiCommandOnAgentPanelOpen")}
          description={translate("settings.editor.closeAiCommandOnAgentPanelOpenDescription")}
          action={
            <SettingsSwitch
              checked={preferences.closeAiCommandOnAgentPanelOpen}
              label={translate("settings.editor.closeAiCommandOnAgentPanelOpen")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  closeAiCommandOnAgentPanelOpen: !preferences.closeAiCommandOnAgentPanelOpen
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.suggestAiPanelForComplexInlinePrompts")}
          description={translate("settings.editor.suggestAiPanelForComplexInlinePromptsDescription")}
          action={
            <SettingsSwitch
              checked={preferences.suggestAiPanelForComplexInlinePrompts}
              label={translate("settings.editor.suggestAiPanelForComplexInlinePrompts")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  suggestAiPanelForComplexInlinePrompts: !preferences.suggestAiPanelForComplexInlinePrompts
                })
              }
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.aiPrompts")}>
        {aiQuickActionIds.map((actionId) => {
          const actionLabel = translate(aiQuickActionLabelKeys[actionId]);
          const defaultPrompt = defaultAiQuickActionPrompt(actionId, translationTargetLanguage);
          const inputLabel = aiPromptInputLabel(actionId, translate);
          const storedPrompt = quickActionPrompts[actionId];

          return (
            <SettingsRow
              key={actionId}
              title={actionLabel}
              description={translate("settings.ai.promptDescription")}
              action={
                <div className="flex flex-col items-end gap-2 max-[760px]:w-full">
                  <SettingsTextarea
                    label={inputLabel}
                    value={storedPrompt || defaultPrompt}
                    onChange={(prompt) => onUpdatePreferences(updateAiQuickActionPrompt(preferences, actionId, prompt))}
                  />
                  <SettingsButton
                    label={`${translate("settings.ai.promptReset")} ${inputLabel}`}
                    onClick={() =>
                      onUpdatePreferences(updateAiQuickActionPrompt(preferences, actionId, defaultAiQuickActionPrompts[actionId]))
                    }
                  >
                    <RotateCcw aria-hidden="true" size={13} />
                    {translate("settings.ai.promptReset")}
                  </SettingsButton>
                </div>
              }
            />
          );
        })}
      </SettingsSection>
    </>
  );
}
