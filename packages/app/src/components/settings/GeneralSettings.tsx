import { Languages, RefreshCw, RotateCcw, Terminal, Trash2, Wrench } from "lucide-react";
import { supportedLanguages, type AppLanguage } from "@markra/shared";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import type { NativeShellCommandStatus } from "../../lib/tauri/shell-command";
import {
  SettingsButton,
  SettingsNumberInput,
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

function shellCommandDescription(
  status: NativeShellCommandStatus | null | undefined,
  translate: SettingsTranslate
) {
  if (!status) return translate("settings.shellCommand.descriptionChecking");

  if (status.status === "installed") {
    return `${translate("settings.shellCommand.descriptionInstalled")} ${status.commandPath ?? "markra"}`;
  }

  if (status.status === "needsRepair") {
    return `${translate("settings.shellCommand.descriptionNeedsRepair")} ${status.commandPath ?? "markra"}`;
  }

  if (status.status === "conflict") {
    return `${translate("settings.shellCommand.descriptionConflict")} ${status.commandPath ?? "markra"}`;
  }

  if (status.status === "unavailable") {
    return translate("settings.shellCommand.descriptionUnavailable");
  }

  return translate("settings.shellCommand.descriptionMissing");
}

function ShellCommandActions({
  busy,
  onInstall,
  onRefresh,
  onUninstall,
  status,
  translate
}: {
  busy: boolean;
  onInstall: () => unknown;
  onRefresh: () => unknown;
  onUninstall: () => unknown;
  status: NativeShellCommandStatus | null | undefined;
  translate: SettingsTranslate;
}) {
  const disabled = busy || !status || status.status === "unavailable" || status.status === "conflict";

  if (status?.status === "installed") {
    return (
      <div className="flex items-center gap-2">
        <SettingsButton
          disabled={busy}
          label={translate("settings.shellCommand.uninstallLabel")}
          onClick={onUninstall}
        >
          <Trash2 aria-hidden="true" size={13} />
          {translate("settings.shellCommand.uninstall")}
        </SettingsButton>
        <SettingsButton disabled={busy} label={translate("settings.shellCommand.refreshLabel")} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" size={13} />
          {translate("settings.shellCommand.refresh")}
        </SettingsButton>
      </div>
    );
  }

  const installLabel = status?.status === "needsRepair"
    ? translate("settings.shellCommand.repairLabel")
    : translate("settings.shellCommand.installLabel");
  const installText = status?.status === "needsRepair"
    ? translate("settings.shellCommand.repair")
    : translate("settings.shellCommand.install");
  const InstallIcon = status?.status === "needsRepair" ? Wrench : Terminal;

  return (
    <div className="flex items-center gap-2">
      <SettingsButton disabled={disabled} label={installLabel} onClick={onInstall}>
        <InstallIcon aria-hidden="true" size={13} />
        {installText}
      </SettingsButton>
      <SettingsButton disabled={busy} label={translate("settings.shellCommand.refreshLabel")} onClick={onRefresh}>
        <RefreshCw aria-hidden="true" size={13} />
        {translate("settings.shellCommand.refresh")}
      </SettingsButton>
    </div>
  );
}

export function GeneralSettings({
  appVersion,
  language,
  onCheckForUpdates,
  onInstallShellCommand,
  onRefreshShellCommand,
  onResetWelcomeDocument,
  onSelectLanguage,
  onUninstallShellCommand,
  onUpdatePreferences,
  preferences,
  shellCommandRunning = false,
  shellCommandStatus,
  translate,
  updatesEnabled = true,
  welcomeReset
}: {
  appVersion: string;
  language: AppLanguage;
  onCheckForUpdates: () => unknown;
  onInstallShellCommand?: () => unknown;
  onRefreshShellCommand?: () => unknown;
  onResetWelcomeDocument: () => unknown;
  onSelectLanguage: (language: AppLanguage) => unknown;
  onUninstallShellCommand?: () => unknown;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  shellCommandRunning?: boolean;
  shellCommandStatus?: NativeShellCommandStatus | null;
  translate: SettingsTranslate;
  updatesEnabled?: boolean;
  welcomeReset: boolean;
}) {
  const shellCommandEnabled = Boolean(onInstallShellCommand && onRefreshShellCommand && onUninstallShellCommand);

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

      <SettingsSection label={translate("settings.sections.saving")}>
        <SettingsRow
          title={translate("settings.editor.autoSave")}
          description={translate("settings.editor.autoSaveDescription")}
          action={
            <SettingsSwitch
              checked={preferences.autoSaveEnabled}
              label={translate("settings.editor.autoSave")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  autoSaveEnabled: !preferences.autoSaveEnabled
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.autoSaveInterval")}
          description={translate("settings.editor.autoSaveIntervalDescription")}
          action={
            <SettingsNumberInput
              label={translate("settings.editor.autoSaveInterval")}
              min={1}
              max={120}
              unit={translate("settings.editor.autoSaveIntervalUnit")}
              value={preferences.autoSaveIntervalMinutes}
              onChange={(autoSaveIntervalMinutes) =>
                onUpdatePreferences({
                  ...preferences,
                  autoSaveIntervalMinutes
                })
              }
            />
          }
        />
      </SettingsSection>

      {shellCommandEnabled ? (
        <SettingsSection label={translate("settings.sections.commandLine")}>
          <SettingsRow
            title={translate("settings.shellCommand.title")}
            description={shellCommandDescription(shellCommandStatus, translate)}
            action={
              <ShellCommandActions
                busy={shellCommandRunning}
                status={shellCommandStatus}
                translate={translate}
                onInstall={onInstallShellCommand!}
                onRefresh={onRefreshShellCommand!}
                onUninstall={onUninstallShellCommand!}
              />
            }
          />
        </SettingsSection>
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
