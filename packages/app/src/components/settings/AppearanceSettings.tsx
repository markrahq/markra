import { appThemeOptions, type AppTheme } from "../../lib/settings/app-settings";
import {
  SettingsRow,
  SettingsSection,
  SettingsSelect
} from "./SettingsControls";
import {
  CustomThemeCssControl,
  ThemePreviewGrid,
  themeLabelKeys
} from "./ThemeSettingsControls";
import type { SettingsTranslate } from "./translate";

export function AppearanceSettings({
  customThemeCss,
  onSelectTheme,
  onUpdateCustomThemeCss,
  selectedTheme,
  translate
}: {
  customThemeCss: string;
  onSelectTheme: (theme: AppTheme) => unknown;
  onUpdateCustomThemeCss: (css: string) => unknown;
  selectedTheme: AppTheme;
  translate: SettingsTranslate;
}) {
  return (
    <SettingsSection label={translate("settings.sections.theme")}>
      <SettingsRow
        title={translate("settings.theme.colorTitle")}
        description={translate("settings.theme.description")}
        action={
          <SettingsSelect
            label={translate("settings.theme.colorTitle")}
            value={selectedTheme}
            options={appThemeOptions.map((theme) => ({
              label: translate(themeLabelKeys[theme]),
              value: theme
            }))}
            onChange={(value) => onSelectTheme(value as AppTheme)}
          />
        }
      />
      <SettingsRow
        title={translate("settings.theme.previewTitle")}
        description={translate("settings.theme.previewDescription")}
        action={
          <ThemePreviewGrid
            selectedTheme={selectedTheme}
            translate={translate}
            onSelectTheme={onSelectTheme}
          />
        }
      />
      {selectedTheme === "custom" ? (
        <SettingsRow
          title={translate("settings.theme.customCssTitle")}
          description={translate("settings.theme.customCssDescription")}
          action={
            <CustomThemeCssControl
              customThemeCss={customThemeCss}
              translate={translate}
              onUpdateCustomThemeCss={onUpdateCustomThemeCss}
            />
          }
        />
      ) : null}
    </SettingsSection>
  );
}
