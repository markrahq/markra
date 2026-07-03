import { RotateCcw } from "lucide-react";
import { aiTranslationLanguageName, type AppLanguage } from "@markra/shared";
import {
  aiQuickActionIds,
  aiQuickActionLabelKeys,
  defaultAiQuickActionPrompt,
  defaultAiQuickActionPrompts,
  type AiQuickActionId
} from "../../lib/ai-actions";
import { codexAcpAgentArgs, type EditorPreferences } from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextInput,
  SettingsTextarea
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";
import type { AcpAgentSettings } from "../../lib/settings/app-settings";

const acpShellCommand = "/bin/zsh";

function acpShellArgs(command: string) {
  return `-lc 'exec ${command}'`;
}

const acpAgentPresets = [
  {
    args: codexAcpAgentArgs,
    command: acpShellCommand,
    id: "codex-acp",
    label: "Codex"
  },
  {
    args: acpShellArgs("npx -y @agentclientprotocol/claude-agent-acp"),
    command: acpShellCommand,
    id: "claude-acp",
    label: "Claude Agent"
  },
  {
    args: acpShellArgs("npx -y @google/gemini-cli --acp"),
    command: acpShellCommand,
    id: "gemini",
    label: "Gemini CLI"
  },
  {
    args: acpShellArgs("npx -y @github/copilot --acp"),
    command: acpShellCommand,
    id: "github-copilot-cli",
    label: "GitHub Copilot"
  },
  {
    args: acpShellArgs("opencode acp"),
    command: acpShellCommand,
    id: "opencode",
    label: "OpenCode"
  },
  {
    args: acpShellArgs("npx -y @qwen-code/qwen-code --acp --experimental-skills"),
    command: acpShellCommand,
    id: "qwen-code",
    label: "Qwen Code"
  },
  {
    args: acpShellArgs("npx -y cline --acp"),
    command: acpShellCommand,
    id: "cline",
    label: "Cline"
  }
] as const;

type AcpAgentPresetId = (typeof acpAgentPresets)[number]["id"] | "custom";

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

function updateAcpAgentSettings(
  settings: AcpAgentSettings,
  patch: Partial<AcpAgentSettings>
): AcpAgentSettings {
  return {
    ...settings,
    ...patch
  };
}

function acpAgentPresetId(settings: AcpAgentSettings): AcpAgentPresetId {
  const preset = acpAgentPresets.find(
    (candidate) => candidate.command === settings.command && candidate.args === settings.args
  );

  return preset?.id ?? "custom";
}

function applyAcpAgentPreset(settings: AcpAgentSettings, presetId: string): AcpAgentSettings {
  if (presetId === "custom") {
    return updateAcpAgentSettings(settings, {
      args: "",
      command: ""
    });
  }

  const preset = acpAgentPresets.find((candidate) => candidate.id === presetId);

  if (!preset) {
    return settings;
  }

  return updateAcpAgentSettings(settings, {
    args: preset.args,
    command: preset.command,
    enabled: true
  });
}

export function AiSettings({
  acpAgentSettings,
  language,
  onUpdateAcpAgentSettings,
  onUpdatePreferences,
  preferences,
  translate
}: {
  acpAgentSettings: AcpAgentSettings;
  language: AppLanguage;
  onUpdateAcpAgentSettings: (settings: AcpAgentSettings) => unknown;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const quickActionPrompts = preferences.aiQuickActionPrompts ?? defaultAiQuickActionPrompts;
  const translationTargetLanguage = aiTranslationLanguageName(language);
  const selectedAcpAgentPresetId = acpAgentPresetId(acpAgentSettings);
  const acpAgentPresetOptions = [
    { label: translate("settings.ai.acpAgentPresetCustom"), value: "custom" },
    ...acpAgentPresets.map((preset) => ({ label: preset.label, value: preset.id }))
  ];

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
          title={translate("settings.editor.aiWorkspaceAnimation")}
          description={translate("settings.editor.aiWorkspaceAnimationDescription")}
          action={
            <SettingsSwitch
              checked={preferences.aiWorkspaceAnimationEnabled}
              label={translate("settings.editor.aiWorkspaceAnimation")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  aiWorkspaceAnimationEnabled: !preferences.aiWorkspaceAnimationEnabled
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

      <SettingsSection label={translate("settings.sections.acpAgent")}>
        <SettingsRow
          title={translate("settings.ai.acpAgentEnabled")}
          description={translate("settings.ai.acpAgentEnabledDescription")}
          action={
            <SettingsSwitch
              checked={acpAgentSettings.enabled}
              label={translate("settings.ai.acpAgentEnabledLabel")}
              onChange={() =>
                onUpdateAcpAgentSettings(updateAcpAgentSettings(acpAgentSettings, {
                  enabled: !acpAgentSettings.enabled
                }))
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.ai.acpAgentPreset")}
          description={translate("settings.ai.acpAgentPresetDescription")}
          action={
            <SettingsSelect
              label={translate("settings.ai.acpAgentPreset")}
              options={acpAgentPresetOptions}
              value={selectedAcpAgentPresetId}
              onChange={(presetId) => onUpdateAcpAgentSettings(applyAcpAgentPreset(acpAgentSettings, presetId))}
            />
          }
        />
        <SettingsRow
          title={translate("settings.ai.acpAgentCommand")}
          description={translate("settings.ai.acpAgentCommandDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.ai.acpAgentCommand")}
              placeholder={translate("settings.ai.acpAgentCommandPlaceholder")}
              value={acpAgentSettings.command}
              widthClassName="w-80"
              onChange={(command) =>
                onUpdateAcpAgentSettings(updateAcpAgentSettings(acpAgentSettings, { command }))
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.ai.acpAgentArgs")}
          description={translate("settings.ai.acpAgentArgsDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.ai.acpAgentArgs")}
              placeholder={translate("settings.ai.acpAgentArgsPlaceholder")}
              value={acpAgentSettings.args}
              widthClassName="w-80"
              onChange={(args) =>
                onUpdateAcpAgentSettings(updateAcpAgentSettings(acpAgentSettings, { args }))
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.ai.acpAgentCwd")}
          description={translate("settings.ai.acpAgentCwdDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.ai.acpAgentCwd")}
              placeholder={translate("settings.ai.acpAgentCwdPlaceholder")}
              value={acpAgentSettings.cwd}
              widthClassName="w-80"
              onChange={(cwd) =>
                onUpdateAcpAgentSettings(updateAcpAgentSettings(acpAgentSettings, { cwd }))
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
