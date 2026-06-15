import { Languages, RefreshCw, RotateCcw } from "lucide-react";
import { supportedLanguages, type AppLanguage } from "@markra/shared";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsSwitch
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

function LanguageSelect({
  language,
  label,
  onSelectLanguage
}: {
  language: AppLanguage;
  label: string;
  onSelectLanguage: (language: AppLanguage) => unknown;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Languages aria-hidden="true" className="pointer-events-none absolute left-2.5 text-(--text-secondary)" size={13} />
      <select
        className="h-8 min-w-42 appearance-none rounded-md border border-(--border-default) bg-(--bg-primary) px-8 text-[12px] leading-5 font-[560] text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        aria-label={label}
        value={language}
        onChange={(event) => onSelectLanguage(event.currentTarget.value as AppLanguage)}
      >
        {supportedLanguages.map((supportedLanguage) => (
          <option key={supportedLanguage.code} value={supportedLanguage.code}>
            {supportedLanguage.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GeneralSettings({
  appVersion,
  language,
  onCheckForUpdates,
  onResetWelcomeDocument,
  onSelectLanguage,
  onUpdatePreferences,
  preferences,
  translate,
  updatesEnabled = true,
  welcomeReset
}: {
  appVersion: string;
  language: AppLanguage;
  onCheckForUpdates: () => unknown;
  onResetWelcomeDocument: () => unknown;
  onSelectLanguage: (language: AppLanguage) => unknown;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
  updatesEnabled?: boolean;
  welcomeReset: boolean;
}) {
  return (
    <>
      <SettingsSection label={translate("settings.sections.language")}>
        <SettingsRow
          title={translate("settings.language.title")}
          description={translate("settings.language.description")}
          action={
            <LanguageSelect
              language={language}
              label={translate("settings.language.title")}
              onSelectLanguage={onSelectLanguage}
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.startup")}>
        <SettingsRow
          title={translate("settings.startup.restoreWorkspace")}
          description={translate("settings.startup.restoreWorkspaceDescription")}
          action={
            <SettingsSwitch
              checked={preferences.restoreWorkspaceOnStartup}
              label={translate("settings.startup.restoreWorkspace")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  restoreWorkspaceOnStartup: !preferences.restoreWorkspaceOnStartup
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.welcome.title")}
          description={translate("settings.welcome.description")}
          action={
            <SettingsButton label={translate("settings.welcome.buttonLabel")} onClick={onResetWelcomeDocument}>
              <RotateCcw aria-hidden="true" size={13} />
              {translate("settings.welcome.button")}
            </SettingsButton>
          }
        />
      </SettingsSection>

      {welcomeReset ? (
        <p className="-mt-6 mb-8 text-[12px] leading-5 text-(--accent)" role="status">
          {translate("settings.welcome.status")}
        </p>
      ) : null}

      {updatesEnabled ? (
        <SettingsSection label={translate("settings.sections.updates")}>
          <SettingsRow
            title={translate("settings.update.currentVersion")}
            description={`Markra ${appVersion}`}
          />
          <SettingsRow
            title={translate("settings.update.autoCheck")}
            description={translate("settings.update.autoCheckDescription")}
            action={
              <SettingsSwitch
                checked={preferences.autoUpdateEnabled}
                label={translate("settings.update.autoCheck")}
                onChange={() =>
                  onUpdatePreferences({
                    ...preferences,
                    autoUpdateEnabled: !preferences.autoUpdateEnabled
                  })
                }
              />
            }
          />
          <SettingsRow
            title={translate("settings.update.title")}
            description={translate("settings.update.description")}
            action={
              <SettingsButton label={translate("settings.update.check")} onClick={onCheckForUpdates}>
                <RefreshCw aria-hidden="true" size={13} />
                {translate("settings.update.check")}
              </SettingsButton>
            }
          />
        </SettingsSection>
      ) : null}
    </>
  );
}
