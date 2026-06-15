import { Wifi } from "lucide-react";
import type { NetworkSettings as NetworkSettingsValue } from "../../lib/settings/app-settings";
import {
  SettingsCallout,
  SettingsCheckbox,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  SettingsTextInput
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

export function NetworkSettings({
  settings,
  translate,
  onUpdateSettings
}: {
  settings: NetworkSettingsValue;
  translate: SettingsTranslate;
  onUpdateSettings: (settings: NetworkSettingsValue) => unknown;
}) {
  return (
    <>
      <SettingsSection
        label={translate("settings.sections.networkProxy")}
        intro={
          <SettingsCallout
            icon={Wifi}
            title={translate("settings.network.proxyTitle")}
            description={translate("settings.network.proxyDescription")}
          />
        }
      >
        <SettingsRow
          title={translate("settings.network.proxyEnabled")}
          description={translate("settings.network.proxyEnabledDescription")}
          action={
            <SettingsSwitch
              checked={settings.proxyEnabled}
              label={translate("settings.network.proxyEnabled")}
              onChange={() => onUpdateSettings({ ...settings, proxyEnabled: !settings.proxyEnabled })}
            />
          }
        />
        <SettingsRow
          title={translate("settings.network.proxyUrl")}
          description={translate("settings.network.proxyUrlDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.network.proxyUrl")}
              value={settings.proxyUrl}
              placeholder="socks5://127.0.0.1:1080"
              widthClassName="w-72"
              onChange={(proxyUrl) => onUpdateSettings({ ...settings, proxyUrl })}
            />
          }
        />
        <SettingsRow
          title={translate("settings.network.bypassLocal")}
          description={translate("settings.network.bypassLocalDescription")}
          action={
            <SettingsCheckbox
              checked={settings.bypassLocalAddresses}
              label={translate("settings.network.bypassLocal")}
              onChange={() =>
                onUpdateSettings({
                  ...settings,
                  bypassLocalAddresses: !settings.bypassLocalAddresses
                })
              }
            />
          }
        />
      </SettingsSection>
    </>
  );
}
