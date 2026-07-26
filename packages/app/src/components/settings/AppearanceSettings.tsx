import { Code2, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useId } from "react";
import {
  appAppearanceModeOptions,
  darkEditorThemeOptions,
  lightEditorThemeOptions,
  type AppAppearanceMode,
  type DarkEditorTheme,
  type LightEditorTheme
} from "../../lib/settings/app-settings";
import {
  SettingsRow,
  SettingsSection,
  SettingsSwitch
} from "./SettingsControls";
import {
  CustomThemeCssControl,
  ThemePreviewGrid
} from "./ThemeSettingsControls";
import { mergeClassNames } from "./class-names";
import type { SettingsTranslate } from "./translate";
import { Tooltip } from "@markra/ui";

const appearanceModeIcons: Record<AppAppearanceMode, LucideIcon> = {
  dark: Moon,
  light: Sun,
  system: Monitor
};

function AppearanceModeControl({
  onSelectAppearanceMode,
  selectedAppearanceMode,
  translate
}: {
  onSelectAppearanceMode: (mode: AppAppearanceMode) => unknown;
  selectedAppearanceMode: AppAppearanceMode;
  translate: SettingsTranslate;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md border border-(--border-default) bg-(--bg-primary)"
      role="radiogroup"
      aria-label={translate("settings.theme.appearanceModeTitle")}
    >
      {appAppearanceModeOptions.map((mode) => {
        const Icon = appearanceModeIcons[mode];
        const selected = mode === selectedAppearanceMode;
        const tooltipLabel = translate(mode === "system"
          ? "settings.theme.useSystemLabel"
          : mode === "dark"
            ? "settings.theme.useDarkLabel"
            : "settings.theme.useLightLabel");

        return (
          <Tooltip key={mode} content={tooltipLabel}>
          <button
            className={mergeClassNames(
              "inline-flex h-8 min-w-20 cursor-pointer items-center justify-center gap-1.5 border-0 border-r border-(--border-default) bg-transparent px-3 text-[12px] leading-5 font-[620] text-(--text-secondary) transition-colors duration-150 ease-out last:border-r-0 hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-inset",
              selected ? "bg-(--bg-active) text-(--text-heading)" : ""
            )}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelectAppearanceMode(mode)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(mode === "system"
              ? "settings.theme.system"
              : mode === "dark"
                ? "settings.theme.dark"
                : "settings.theme.light")}
          </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function CustomThemeCssPanel({
  customThemeCss,
  onUpdateCustomThemeCss,
  title,
  translate
}: {
  customThemeCss: string;
  onUpdateCustomThemeCss: (css: string) => unknown;
  title: string;
  translate: SettingsTranslate;
}) {
  const titleId = useId();

  return (
    <section
      className="custom-theme-css-panel py-3"
      aria-labelledby={titleId}
    >
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <Code2 className="shrink-0 text-(--text-secondary)" aria-hidden="true" size={13} strokeWidth={2} />
        <h4
          className="m-0 text-[12px] leading-5 font-[650] tracking-normal text-(--text-heading)"
          id={titleId}
        >
          {title}
        </h4>
      </div>
      <CustomThemeCssControl
        customThemeCss={customThemeCss}
        label={title}
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
      />
    </section>
  );
}

export function AppearanceSettings({
  customThemeEnabled,
  selectedAppearanceMode,
  darkCustomThemeCss,
  lightCustomThemeCss,
  onSelectAppearanceMode,
  onSelectDarkTheme,
  onSelectLightTheme,
  onToggleCustomTheme,
  onUpdateDarkCustomThemeCss,
  onUpdateLightCustomThemeCss,
  selectedDarkTheme,
  selectedLightTheme,
  translate
}: {
  customThemeEnabled: boolean;
  darkCustomThemeCss: string;
  lightCustomThemeCss: string;
  onSelectAppearanceMode: (mode: AppAppearanceMode) => unknown;
  onSelectDarkTheme: (theme: DarkEditorTheme) => unknown;
  onSelectLightTheme: (theme: LightEditorTheme) => unknown;
  onToggleCustomTheme: () => unknown;
  onUpdateDarkCustomThemeCss: (css: string) => unknown;
  onUpdateLightCustomThemeCss: (css: string) => unknown;
  selectedAppearanceMode: AppAppearanceMode;
  selectedDarkTheme: DarkEditorTheme;
  selectedLightTheme: LightEditorTheme;
  translate: SettingsTranslate;
}) {
  return (
    <SettingsSection label={translate("settings.sections.theme")}>
      <SettingsRow
        title={translate("settings.theme.appearanceModeTitle")}
        description={translate("settings.theme.description")}
        action={
          <AppearanceModeControl
            selectedAppearanceMode={selectedAppearanceMode}
            translate={translate}
            onSelectAppearanceMode={onSelectAppearanceMode}
          />
        }
      />
      <SettingsRow
        title={translate("settings.theme.customThemeTitle")}
        description={translate("settings.theme.customCssDescription")}
        action={
          <SettingsSwitch
            checked={customThemeEnabled}
            label={translate("settings.theme.customThemeTitle")}
            onChange={onToggleCustomTheme}
          />
        }
      />
      <SettingsRow
        title={translate("settings.theme.lightPaletteTitle")}
        action={
          <ThemePreviewGrid
            ariaLabel={translate("settings.theme.lightPaletteTitle")}
            selectedTheme={customThemeEnabled ? "custom" : selectedLightTheme}
            themes={lightEditorThemeOptions}
            translate={translate}
            onSelectTheme={onSelectLightTheme}
          />
        }
      />
      <SettingsRow
        title={translate("settings.theme.darkPaletteTitle")}
        action={
          <ThemePreviewGrid
            ariaLabel={translate("settings.theme.darkPaletteTitle")}
            selectedTheme={customThemeEnabled ? "custom" : selectedDarkTheme}
            themes={darkEditorThemeOptions}
            translate={translate}
            onSelectTheme={onSelectDarkTheme}
          />
        }
      />
      {customThemeEnabled ? (
        <>
          <CustomThemeCssPanel
            customThemeCss={lightCustomThemeCss}
            title={translate("settings.theme.lightCustomCssTitle")}
            translate={translate}
            onUpdateCustomThemeCss={onUpdateLightCustomThemeCss}
          />
          <CustomThemeCssPanel
            customThemeCss={darkCustomThemeCss}
            title={translate("settings.theme.darkCustomCssTitle")}
            translate={translate}
            onUpdateCustomThemeCss={onUpdateDarkCustomThemeCss}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
