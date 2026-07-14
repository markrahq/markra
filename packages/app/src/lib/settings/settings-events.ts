import { normalizeAiSettings } from "@markra/providers";
import {
  isAppTheme,
  normalizeAppThemePreferences,
  normalizeBackupSettings,
  normalizeAcpAgentSettings,
  normalizeCustomThemeCss,
  normalizeCustomThemeCssValues,
  normalizeEditorPreferences,
  normalizeExportSettings,
  normalizeFileIgnoreSettings,
  normalizeSyncSettings,
  normalizeWebSearchSettings,
  type AiProviderSettings,
  type AcpAgentSettings,
  createThemePreferencesFromLegacyTheme,
  type AppThemePreferences,
  type BackupSettings,
  type CustomThemeCssValues,
  type EditorPreferences,
  type ExportSettings,
  type FileIgnoreSettings,
  type SyncSettings,
  type WebSearchSettings
} from "./app-settings";
import { isAppLanguage, type AppLanguage } from "@markra/shared";
import { getAppRuntime } from "../../runtime";

const themeChangedEvent = "markra://theme-changed";
const customThemeCssChangedEvent = "markra://custom-theme-css-changed";
const languageChangedEvent = "markra://language-changed";
const editorPreferencesChangedEvent = "markra://editor-preferences-changed";
const exportSettingsChangedEvent = "markra://export-settings-changed";
const fileIgnoreSettingsChangedEvent = "markra://file-ignore-settings-changed";
const webSearchSettingsChangedEvent = "markra://web-search-settings-changed";
const backupSettingsChangedEvent = "markra://backup-settings-changed";
const syncSettingsChangedEvent = "markra://sync-settings-changed";
const aiSettingsChangedEvent = "markra://ai-settings-changed";
const acpAgentSettingsChangedEvent = "markra://acp-agent-settings-changed";
const settingsEventsSourceId =
  globalThis.crypto?.randomUUID?.() ?? `markra-settings-${Math.random().toString(36).slice(2)}`;

type ThemeChangedPayload = {
  preferences?: AppThemePreferences;
  theme?: unknown;
};

type CustomThemeCssChangedPayload = {
  css?: unknown;
  customThemeCss?: CustomThemeCssValues;
};

type LanguageChangedPayload = {
  language: AppLanguage;
};

type EditorPreferencesChangedPayload = {
  preferences: EditorPreferences;
  sourceId?: string;
};

type ExportSettingsChangedPayload = {
  settings: ExportSettings;
};

type FileIgnoreSettingsChangedPayload = {
  settings: FileIgnoreSettings;
};

type WebSearchSettingsChangedPayload = {
  settings: WebSearchSettings;
};

type BackupSettingsChangedPayload = {
  settings: BackupSettings;
};

type SyncSettingsChangedPayload = {
  settings: SyncSettings;
};

type AiSettingsChangedPayload = {
  settings: AiProviderSettings;
};

type AcpAgentSettingsChangedPayload = {
  settings: AcpAgentSettings;
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

export async function notifyAppThemeChanged(preferences: AppThemePreferences) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(themeChangedEvent, { preferences: normalizeAppThemePreferences(preferences) });
}

export async function listenAppThemeChanged(onThemeChanged: (preferences: AppThemePreferences) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<ThemeChangedPayload>(themeChangedEvent, (event) => {
    if (event.payload.preferences) {
      onThemeChanged(normalizeAppThemePreferences(event.payload.preferences));
      return;
    }

    if (isAppTheme(event.payload.theme)) {
      onThemeChanged(createThemePreferencesFromLegacyTheme(event.payload.theme));
    }
  });
}

export async function notifyAppCustomThemeCssChanged(customThemeCss: CustomThemeCssValues) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(customThemeCssChangedEvent, {
    customThemeCss: normalizeCustomThemeCssValues(customThemeCss)
  });
}

export async function listenAppCustomThemeCssChanged(onCustomThemeCssChanged: (css: CustomThemeCssValues) => unknown) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<CustomThemeCssChangedPayload>(customThemeCssChangedEvent, (event) => {
    if (event.payload.customThemeCss) {
      onCustomThemeCssChanged(normalizeCustomThemeCssValues(event.payload.customThemeCss));
      return;
    }

    if (typeof event.payload.css === "string") {
      const css = normalizeCustomThemeCss(event.payload.css);

      onCustomThemeCssChanged({ dark: css, light: css });
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

  await getAppRuntime().events.emit(editorPreferencesChangedEvent, { preferences, sourceId: settingsEventsSourceId });
}

export async function listenAppEditorPreferencesChanged(
  onPreferencesChanged: (preferences: EditorPreferences) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<EditorPreferencesChangedPayload>(editorPreferencesChangedEvent, (event) => {
    // Local state was already updated before emitting; replaying our own normalized event can erase in-progress input.
    if (event.payload.sourceId === settingsEventsSourceId) return;

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

export async function notifyAppFileIgnoreSettingsChanged(settings: FileIgnoreSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(fileIgnoreSettingsChangedEvent, {
    settings: normalizeFileIgnoreSettings(settings)
  });
}

export async function listenAppFileIgnoreSettingsChanged(
  onSettingsChanged: (settings: FileIgnoreSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<FileIgnoreSettingsChangedPayload>(
    fileIgnoreSettingsChangedEvent,
    (event) => {
      onSettingsChanged(normalizeFileIgnoreSettings(event.payload.settings));
    }
  );
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

export async function notifyAppBackupSettingsChanged(settings: BackupSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(backupSettingsChangedEvent, { settings });
}

export async function listenAppBackupSettingsChanged(
  onSettingsChanged: (settings: BackupSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<BackupSettingsChangedPayload>(backupSettingsChangedEvent, (event) => {
    onSettingsChanged(normalizeBackupSettings(event.payload.settings));
  });
}

export async function notifyAppSyncSettingsChanged(settings: SyncSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(syncSettingsChangedEvent, { settings });
}

export async function listenAppSyncSettingsChanged(
  onSettingsChanged: (settings: SyncSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<SyncSettingsChangedPayload>(syncSettingsChangedEvent, (event) => {
    onSettingsChanged(normalizeSyncSettings(event.payload.settings));
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

export async function notifyAppAcpAgentSettingsChanged(settings: AcpAgentSettings) {
  if (!getAppRuntime().events.isAvailable()) return;

  await getAppRuntime().events.emit(acpAgentSettingsChangedEvent, { settings: normalizeAcpAgentSettings(settings) });
}

export async function listenAppAcpAgentSettingsChanged(
  onSettingsChanged: (settings: AcpAgentSettings) => unknown
) {
  if (!getAppRuntime().events.isAvailable()) return () => {};

  return getAppRuntime().events.listen<AcpAgentSettingsChangedPayload>(acpAgentSettingsChangedEvent, (event) => {
    onSettingsChanged(normalizeAcpAgentSettings(event.payload.settings));
  });
}
