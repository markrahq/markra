import { Download, RotateCcw, Upload } from "lucide-react";
import { type ChangeEvent, type CSSProperties, useRef } from "react";
import {
  appThemeOptions,
  defaultCustomThemeCss,
  type AppTheme
} from "../../lib/settings/app-settings";
import type { I18nKey } from "@markra/shared";
import { mergeClassNames } from "./class-names";
import { SettingsButton, SettingsTextarea } from "./SettingsControls";

type Translate = (key: I18nKey) => string;

export const themeLabelKeys: Record<AppTheme, I18nKey> = {
  system: "settings.theme.system",
  light: "settings.theme.light",
  dark: "settings.theme.dark",
  github: "settings.theme.github",
  "github-dark": "settings.theme.githubDark",
  "one-dark": "settings.theme.oneDark",
  "one-light": "settings.theme.oneLight",
  "one-dark-pro": "settings.theme.oneDarkPro",
  gothic: "settings.theme.gothic",
  newsprint: "settings.theme.newsprint",
  night: "settings.theme.night",
  pixyll: "settings.theme.pixyll",
  whitey: "settings.theme.whitey",
  sepia: "settings.theme.sepia",
  "solarized-light": "settings.theme.solarizedLight",
  "solarized-dark": "settings.theme.solarizedDark",
  nord: "settings.theme.nord",
  "catppuccin-latte": "settings.theme.catppuccinLatte",
  "catppuccin-mocha": "settings.theme.catppuccinMocha",
  academic: "settings.theme.academic",
  minimal: "settings.theme.minimal",
  custom: "settings.theme.custom"
};

type ThemePreviewSwatch = {
  accent: string;
  background: string;
  border: string;
  muted: string;
  panel: string;
  text: string;
};

type ThemePreviewStyle = CSSProperties & {
  "--theme-preview-accent": string;
  "--theme-preview-bg": string;
  "--theme-preview-border": string;
  "--theme-preview-muted": string;
  "--theme-preview-panel": string;
  "--theme-preview-text": string;
};

const themePreviewSwatches: Record<AppTheme, ThemePreviewSwatch> = {
  system: {
    accent: "#1a1c1e",
    background: "linear-gradient(135deg, #f6f8fa 0 49%, #1f2328 50% 100%)",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#ffffff",
    text: "#1f2328"
  },
  light: {
    accent: "#1a1c1e",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  },
  dark: {
    accent: "#f4f4f5",
    background: "#0d1117",
    border: "#30363d",
    muted: "#8b949e",
    panel: "#161b22",
    text: "#f0f6fc"
  },
  github: {
    accent: "#0969da",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  },
  "github-dark": {
    accent: "#2f81f7",
    background: "#0d1117",
    border: "#30363d",
    muted: "#7d8590",
    panel: "#161b22",
    text: "#e6edf3"
  },
  "one-dark": {
    accent: "#61afef",
    background: "#282c34",
    border: "#3b4048",
    muted: "#5c6370",
    panel: "#21252b",
    text: "#abb2bf"
  },
  "one-light": {
    accent: "#4078f2",
    background: "#fafafa",
    border: "#d7dae0",
    muted: "#a0a1a7",
    panel: "#f0f0f0",
    text: "#383a42"
  },
  "one-dark-pro": {
    accent: "#61afef",
    background: "#282c34",
    border: "#3e4451",
    muted: "#7f848e",
    panel: "#21252b",
    text: "#abb2bf"
  },
  gothic: {
    accent: "#7f1d1d",
    background: "#f7f1e5",
    border: "#d8ccb5",
    muted: "#736451",
    panel: "#efe5d2",
    text: "#2b2118"
  },
  newsprint: {
    accent: "#175c63",
    background: "#fbf7ef",
    border: "#d7cabb",
    muted: "#6f6358",
    panel: "#f3eadb",
    text: "#241f1a"
  },
  night: {
    accent: "#f4f4f5",
    background: "#111827",
    border: "#374151",
    muted: "#9ca3af",
    panel: "#1f2937",
    text: "#f9fafb"
  },
  pixyll: {
    accent: "#d9480f",
    background: "#fffaf0",
    border: "#e7d5b7",
    muted: "#7d6b57",
    panel: "#f8ecd7",
    text: "#33261a"
  },
  whitey: {
    accent: "#2563eb",
    background: "#fdfdfd",
    border: "#e5e7eb",
    muted: "#6b7280",
    panel: "#f7f7f8",
    text: "#111827"
  },
  sepia: {
    accent: "#8b5e34",
    background: "#fbf0d9",
    border: "#dec69f",
    muted: "#7b684e",
    panel: "#f3e3c4",
    text: "#3b2f22"
  },
  "solarized-light": {
    accent: "#268bd2",
    background: "#fdf6e3",
    border: "#d9cda9",
    muted: "#657b83",
    panel: "#eee8d5",
    text: "#586e75"
  },
  "solarized-dark": {
    accent: "#2aa198",
    background: "#002b36",
    border: "#073642",
    muted: "#93a1a1",
    panel: "#073642",
    text: "#eee8d5"
  },
  nord: {
    accent: "#88c0d0",
    background: "#2e3440",
    border: "#4c566a",
    muted: "#d8dee9",
    panel: "#3b4252",
    text: "#eceff4"
  },
  "catppuccin-latte": {
    accent: "#8839ef",
    background: "#eff1f5",
    border: "#ccd0da",
    muted: "#6c6f85",
    panel: "#e6e9ef",
    text: "#4c4f69"
  },
  "catppuccin-mocha": {
    accent: "#cba6f7",
    background: "#1e1e2e",
    border: "#45475a",
    muted: "#a6adc8",
    panel: "#313244",
    text: "#cdd6f4"
  },
  academic: {
    accent: "#1d4ed8",
    background: "#fffffb",
    border: "#d7d2c5",
    muted: "#5f5a51",
    panel: "#f4f1ea",
    text: "#1f1b16"
  },
  minimal: {
    accent: "#3f3f46",
    background: "#fafafa",
    border: "#e4e4e7",
    muted: "#71717a",
    panel: "#f4f4f5",
    text: "#27272a"
  },
  custom: {
    accent: "#1a1c1e",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  }
};

function createThemePreviewStyle(swatch: ThemePreviewSwatch): ThemePreviewStyle {
  return {
    "--theme-preview-accent": swatch.accent,
    "--theme-preview-bg": swatch.background,
    "--theme-preview-border": swatch.border,
    "--theme-preview-muted": swatch.muted,
    "--theme-preview-panel": swatch.panel,
    "--theme-preview-text": swatch.text
  };
}

export function ThemePreviewGrid({
  onSelectTheme,
  selectedTheme,
  translate
}: {
  onSelectTheme: (theme: AppTheme) => unknown;
  selectedTheme: AppTheme;
  translate: Translate;
}) {
  return (
    <div
      className="grid w-fit max-w-90 grid-cols-9 gap-1.5 max-[860px]:grid-cols-6"
      role="radiogroup"
      aria-label={translate("settings.theme.previewTitle")}
    >
      {appThemeOptions.map((theme) => {
        const label = translate(themeLabelKeys[theme]);
        const selected = theme === selectedTheme;

        return (
          <button
            key={theme}
            className={mergeClassNames(
              "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-(--bg-primary) p-0 transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
              selected ? "border-(--accent) bg-(--accent-soft)" : "border-(--border-default)"
            )}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            style={createThemePreviewStyle(themePreviewSwatches[theme])}
            onClick={() => onSelectTheme(theme)}
          >
            <span
              className="relative h-6 w-6 overflow-hidden rounded-[5px] border"
              style={{
                background: "var(--theme-preview-bg)",
                borderColor: "var(--theme-preview-border)"
              }}
              aria-hidden="true"
            >
              <span
                className="absolute top-1 left-1 h-1 w-3 rounded-full"
                style={{ background: "var(--theme-preview-text)" }}
              />
              <span
                className="absolute top-2.5 left-1 h-1 w-3.5 rounded-full"
                style={{ background: "var(--theme-preview-muted)" }}
              />
              <span
                className="absolute right-1 bottom-1 h-2 w-2 rounded-full"
                style={{ background: "var(--theme-preview-accent)" }}
              />
              <span
                className="absolute bottom-1 left-1 h-1.5 w-3.5 rounded-sm"
                style={{ background: "var(--theme-preview-panel)" }}
              />
            </span>
            {selected ? <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-(--accent)" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function exportCustomThemeCss(css: string) {
  const exportCss = css.trim().length > 0 ? css : defaultCustomThemeCss;
  const objectUrl = URL.createObjectURL(new Blob([exportCss], { type: "text/css;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = "markra-custom-theme.css";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function CustomThemeCssControl({
  customThemeCss,
  onUpdateCustomThemeCss,
  translate
}: {
  customThemeCss: string;
  onUpdateCustomThemeCss: (css: string) => unknown;
  translate: Translate;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLabel = translate("settings.theme.importCustomCss");
  const exportLabel = translate("settings.theme.exportCustomCss");
  const resetLabel = translate("settings.theme.resetCustomCss");

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";
    if (!file) return;

    file.text()
      .then((css) => onUpdateCustomThemeCss(css))
      .catch(() => {});
  }

  return (
    <div className="flex w-80 max-w-full flex-col items-stretch gap-2">
      <SettingsTextarea
        label={translate("settings.theme.customCssTitle")}
        value={customThemeCss}
        onChange={onUpdateCustomThemeCss}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <SettingsButton label={importLabel} onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden="true" size={13} />
          {importLabel}
        </SettingsButton>
        <SettingsButton label={exportLabel} onClick={() => exportCustomThemeCss(customThemeCss)}>
          <Download aria-hidden="true" size={13} />
          {exportLabel}
        </SettingsButton>
        <SettingsButton label={resetLabel} onClick={() => onUpdateCustomThemeCss(defaultCustomThemeCss)}>
          <RotateCcw aria-hidden="true" size={13} />
          {resetLabel}
        </SettingsButton>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".css,text/css"
        hidden
        onChange={handleImportFile}
      />
    </div>
  );
}
