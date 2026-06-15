import { FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import {
  defaultBackupSettings,
  type BackupSettings as BackupSettingsValue
} from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsCallout,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  SettingsTextInput
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

export function BackupSettings({
  backupRunning = false,
  onChooseTargetPath = () => {},
  onRunBackup = () => {},
  onUpdateSettings = () => {},
  settings = defaultBackupSettings,
  translate
}: {
  backupRunning?: boolean;
  onChooseTargetPath?: () => unknown;
  onRunBackup?: () => unknown;
  onUpdateSettings?: (settings: BackupSettingsValue) => unknown;
  settings?: BackupSettingsValue;
  translate: SettingsTranslate;
}) {
  const lastBackupLabel = settings.lastBackupAt === null
    ? translate("settings.backup.never")
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(settings.lastBackupAt));

  return (
    <SettingsSection
      label={translate("settings.categories.backup")}
      intro={
        <SettingsCallout
          title={translate("settings.backup.summaryTitle")}
          description={translate("settings.backup.summaryDescription")}
          icon={HardDrive}
        />
      }
    >
      <SettingsRow
        title={translate("settings.backup.targetPath")}
        description={translate("settings.backup.targetPathDescription")}
        action={
          <div className="flex items-center gap-2">
            <SettingsTextInput
              label={translate("settings.backup.targetPath")}
              value={settings.targetPath}
              placeholder="/Users/example/markra-backups"
              widthClassName="w-72"
              onChange={(targetPath) =>
                onUpdateSettings({
                  ...settings,
                  targetPath
                })
              }
            />
            <SettingsButton
              label={translate("settings.backup.targetPickerTitle")}
              onClick={onChooseTargetPath}
            >
              <FolderOpen aria-hidden="true" size={13} />
              {translate("settings.backup.chooseTargetPath")}
            </SettingsButton>
          </div>
        }
      />
      <SettingsRow
        title={translate("settings.backup.backupOnExit")}
        description={translate("settings.backup.backupOnExitDescription")}
        action={
          <SettingsSwitch
            checked={settings.backupOnExit}
            label={translate("settings.backup.backupOnExit")}
            onChange={() =>
              onUpdateSettings({
                ...settings,
                backupOnExit: !settings.backupOnExit
              })
            }
          />
        }
      />
      <SettingsRow
        title={translate("settings.backup.intervalMinutes")}
        description={translate("settings.backup.intervalMinutesDescription")}
        action={
          <SettingsNumberInput
            label={translate("settings.backup.intervalMinutes")}
            min={0}
            max={1440}
            unit={translate("settings.backup.intervalUnit")}
            value={settings.intervalMinutes}
            onChange={(intervalMinutes) =>
              onUpdateSettings({
                ...settings,
                intervalMinutes
              })
            }
          />
        }
      />
      <SettingsRow
        title={translate("settings.backup.lastBackup")}
        description={lastBackupLabel}
        action={
          <SettingsButton
            disabled={backupRunning}
            label={translate("settings.backup.run")}
            onClick={onRunBackup}
          >
            <RefreshCw aria-hidden="true" size={13} />
            {translate("settings.backup.run")}
          </SettingsButton>
        }
      />
    </SettingsSection>
  );
}
