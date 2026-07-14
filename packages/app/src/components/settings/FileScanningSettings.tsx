import { useEffect, useMemo, useState } from "react";
import {
  normalizeFileIgnoreSettings,
  type FileIgnoreSettings
} from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsTextarea
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

export function FileScanningSettings({
  onApply,
  settings,
  translate
}: {
  onApply: (settings: FileIgnoreSettings) => unknown;
  settings: FileIgnoreSettings;
  translate: SettingsTranslate;
}) {
  const [draft, setDraft] = useState(settings.rules);
  const normalizedDraft = useMemo(
    () => normalizeFileIgnoreSettings({ rules: draft }),
    [draft]
  );
  const changed = normalizedDraft.rules !== settings.rules;

  useEffect(() => {
    setDraft(settings.rules);
  }, [settings.rules]);

  return (
    <SettingsSection label={translate("settings.sections.fileScanning")}>
      <SettingsRow
        title={translate("settings.files.globalIgnoreRules")}
        description={translate("settings.files.globalIgnoreRulesDescription")}
        action={
          <div className="flex w-96 max-w-full flex-col items-end gap-2">
            <SettingsTextarea
              className="min-h-32 font-mono"
              label={translate("settings.files.globalIgnoreRules")}
              value={draft}
              widthClassName="w-full"
              onChange={setDraft}
            />
            <SettingsButton
              disabled={!changed}
              label={translate("settings.files.applyLabel")}
              onClick={() => onApply(normalizedDraft)}
            >
              {translate("settings.files.apply")}
            </SettingsButton>
          </div>
        }
      />
    </SettingsSection>
  );
}
