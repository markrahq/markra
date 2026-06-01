import { normalizeAiSettings } from "@markra/providers";
import {
  isAppTheme,
  normalizeCustomThemeCss,
  normalizeEditorPreferences,
  normalizeExportSettings,
  normalizeWebSearchSettings,
  type AiProviderSettings,
  type AppTheme,
  type EditorPreferences,
  type ExportSettings,
  type WebSearchSettings
} from "./app-settings";
import { isAppLanguage, type AppLanguage } from "@markra/shared";
import { getAppRuntime } from "../../runtime";

const themeChangedEvent = "markra://theme-changed";
const customThemeCssChangedEvent = "markra://custom-theme-css-changed";
const languageChangedEvent = "markra://language-changed";
const editorPreferencesChangedEvent = "markra://editor-preferences-changed";
const exportSettingsChangedEvent = "markra://export-settings-changed";
const webSearchSettingsChangedEvent = "markra://web-search-settings-changed";
const aiSettingsChangedEvent = "markra://ai-settings-changed";

type ThemeChangedPayload = {
  theme: AppTheme;
};

type CustomThemeCssChangedPayload = {
  css: string;
};

type LanguageChangedPayload = {
  language: AppLanguage;
};

type EditorPreferencesChangedPayload = {
  preferences: EditorPreferences;
};

type ExportSettingsChangedPayload = {
  settings: ExportSettings;
};

type WebSearchSettingsChangedPayload = {
  settings: WebSearchSettings;
};

type AiSettingsChangedPayload = {
  settings: AiProviderSettings;
};

function isEditorPreferencesPayload(value: unknown) {
  if (typeof value !== "object" || value === null) return false;

  const preferences = value as Record<string, unknown>;
  const hasCurrentSelectionPreferences =
    typeof preferences.showAiQuickInputOnSelection === "boolean" &&
    typeof preferences.showAiSelectionToolbarOnSelection === "boolean";
  const hasLegacySelectionPreferences = typeof preferences.autoOpenAiOnSelection === "boolean";

  return (
    typeof preferences.closeAiCommandOnAgentPanelOpen === "boolean" &&
    (hasCurrentSelectionPreferences || hasLegacySelectionPreferences)
  );
}

export async function notifyAppThemeChanged(theme: AppTheme) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(themeChangedEvent, { theme });
}

export async function listenAppThemeChanged(onThemeChanged: (theme: AppTheme) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<ThemeChangedPayload>(themeChangedEvent, (event) => {
    if (isAppTheme(event.payload.theme)) {
      onThemeChanged(event.payload.theme);
    }
  });
}

export async function notifyAppCustomThemeCssChanged(css: string) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(customThemeCssChangedEvent, { css: normalizeCustomThemeCss(css) });
}

export async function listenAppCustomThemeCssChanged(onCustomThemeCssChanged: (css: string) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<CustomThemeCssChangedPayload>(customThemeCssChangedEvent, (event) => {
    if (typeof event.payload.css === "string") {
      onCustomThemeCssChanged(normalizeCustomThemeCss(event.payload.css));
    }
  });
}

export async function notifyAppLanguageChanged(language: AppLanguage) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(languageChangedEvent, { language });
}

export async function listenAppLanguageChanged(onLanguageChanged: (language: AppLanguage) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<LanguageChangedPayload>(languageChangedEvent, (event) => {
    if (isAppLanguage(event.payload.language)) {
      onLanguageChanged(event.payload.language);
    }
  });
}

export async function notifyAppEditorPreferencesChanged(preferences: EditorPreferences) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(editorPreferencesChangedEvent, { preferences });
}

export async function listenAppEditorPreferencesChanged(
  onPreferencesChanged: (preferences: EditorPreferences) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<EditorPreferencesChangedPayload>(editorPreferencesChangedEvent, (event) => {
    if (isEditorPreferencesPayload(event.payload.preferences)) {
      onPreferencesChanged(normalizeEditorPreferences(event.payload.preferences));
    }
  });
}

export async function notifyAppExportSettingsChanged(settings: ExportSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(exportSettingsChangedEvent, { settings });
}

export async function listenAppExportSettingsChanged(
  onSettingsChanged: (settings: ExportSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<ExportSettingsChangedPayload>(exportSettingsChangedEvent, (event) => {
    onSettingsChanged(normalizeExportSettings(event.payload.settings));
  });
}

export async function notifyAppWebSearchSettingsChanged(settings: WebSearchSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(webSearchSettingsChangedEvent, { settings });
}

export async function listenAppWebSearchSettingsChanged(
  onSettingsChanged: (settings: WebSearchSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<WebSearchSettingsChangedPayload>(webSearchSettingsChangedEvent, (event) => {
    onSettingsChanged(normalizeWebSearchSettings(event.payload.settings));
  });
}

export async function notifyAppAiSettingsChanged(settings: AiProviderSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(aiSettingsChangedEvent, { settings });
}

export async function listenAppAiSettingsChanged(onAiSettingsChanged: (settings: AiProviderSettings) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<AiSettingsChangedPayload>(aiSettingsChangedEvent, (event) => {
    onAiSettingsChanged(normalizeAiSettings(event.payload.settings));
  });
}
