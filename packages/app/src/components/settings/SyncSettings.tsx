import { Cloud, RefreshCw } from "lucide-react";
import {
  defaultSyncSettings,
  type SyncSettings as SyncSettingsValue
} from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsCallout,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextInput
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

export function SyncSettings({
  onRunSync = () => {},
  onUpdateSettings = () => {},
  settings = defaultSyncSettings,
  syncRunning = false,
  translate
}: {
  onRunSync?: () => unknown;
  onUpdateSettings?: (settings: SyncSettingsValue) => unknown;
  settings?: SyncSettingsValue;
  syncRunning?: boolean;
  translate: SettingsTranslate;
}) {
  const lastSyncLabel = settings.lastSyncAt === null
    ? translate("settings.sync.never")
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(settings.lastSyncAt));

  return (
    <SettingsSection
      label={translate("settings.categories.sync")}
      intro={
        <SettingsCallout
          title={translate("settings.sync.summaryTitle")}
          description={translate("settings.sync.summaryDescription")}
          icon={Cloud}
        />
      }
    >
      <SettingsRow
        title={translate("settings.sync.enabled")}
        description={translate("settings.sync.enabledDescription")}
        action={
          <SettingsSwitch
            checked={settings.enabled}
            label={translate("settings.sync.enabled")}
            onChange={() =>
              onUpdateSettings({
                ...settings,
                enabled: !settings.enabled
              })
            }
          />
        }
      />
      <SettingsRow
        title={translate("settings.sync.provider")}
        description={translate("settings.sync.providerDescription")}
        action={
          <SettingsSelect
            label={translate("settings.sync.provider")}
            options={[{ label: "WebDAV", value: "webdav" }]}
            value={settings.provider}
            onChange={() => onUpdateSettings({ ...settings, provider: "webdav" })}
          />
        }
      />
      <SettingsRow
        title={translate("settings.sync.remotePath")}
        description={translate("settings.sync.remotePathDescription")}
        action={
          <SettingsTextInput
            label={translate("settings.sync.remotePath")}
            value={settings.remotePath}
            placeholder={translate("settings.sync.remotePathPlaceholder")}
            widthClassName="w-56"
            onChange={(remotePath) =>
              onUpdateSettings({
                ...settings,
                remotePath
              })
            }
          />
        }
      />
      <SettingsRow
        title={translate("settings.sync.autoSyncOnSave")}
        description={translate("settings.sync.autoSyncOnSaveDescription")}
        action={
          <SettingsSwitch
            checked={settings.autoSyncOnSave}
            label={translate("settings.sync.autoSyncOnSave")}
            onChange={() =>
              onUpdateSettings({
                ...settings,
                autoSyncOnSave: !settings.autoSyncOnSave
              })
            }
          />
        }
      />
      <SettingsRow
        title={translate("settings.sync.intervalMinutes")}
        description={translate("settings.sync.intervalMinutesDescription")}
        action={
          <SettingsNumberInput
            label={translate("settings.sync.intervalMinutes")}
            min={0}
            max={1440}
            unit={translate("settings.sync.intervalUnit")}
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
        title={translate("settings.sync.lastSync")}
        description={lastSyncLabel}
        action={
          <SettingsButton
            disabled={syncRunning}
            label={translate("settings.sync.run")}
            onClick={onRunSync}
          >
            <RefreshCw aria-hidden="true" size={13} />
            {translate("settings.sync.run")}
          </SettingsButton>
        }
      />
    </SettingsSection>
  );
}
