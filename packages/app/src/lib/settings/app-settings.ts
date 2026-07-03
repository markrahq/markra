import {
  createAiAgentSessionTitle,
  createDefaultAiAgentSessionState,
  normalizeAiAgentSessionTitle,
  normalizeAiAgentWorkspaceKey,
  normalizeStoredAiAgentSessionState,
  normalizeStoredAiAgentSessionSummaries,
  normalizeStoredAiAgentSessionSummary,
  type StoredAiAgentSessionSummary,
  type StoredAiAgentSessionState
} from "@markra/ai";
import { defaultMarkdownShortcuts, normalizeMarkdownShortcuts, type MarkdownShortcutBindings } from "@markra/editor";
import { createDefaultAiSettings, normalizeAiSettings, type AiProviderSettings } from "@markra/providers";
import { clampNumber, isAppLanguage, normalizeNullableString, type AppLanguage } from "@markra/shared";
import {
  editorContentWidthOptions,
  normalizeEditorContentWidthPx,
  type EditorContentWidth
} from "../editor-width";
import {
  defaultEditorFontFamily,
  normalizeEditorFontFamilyPreference,
  type EditorFontFamilyPreference
} from "../editor-font";
import { normalizeMarkdownTemplateEntries, type MarkdownTemplateEntry } from "../templates";
import {
  defaultAiQuickActionPrompts,
  normalizeAiQuickActionPrompts,
  type AiQuickActionPrompts
} from "../ai-actions";
import {
  defaultSpellcheckLanguage,
  isSpellcheckLanguage,
  type SpellcheckLanguage
} from "../spellcheck-languages";
import { getAppRuntime } from "../../runtime";
import {
  defaultBackupSettings,
  normalizeBackupSettings,
  type BackupSettings
} from "./backup-settings";
import {
  defaultExportSettings,
  normalizeExportSettings,
  type ExportSettings,
  type PdfMarginPreset,
  type PdfPageSize
} from "./export-settings";
import {
  defaultNetworkSettings,
  normalizeNetworkSettings,
  type NetworkSettings
} from "./network-settings";
import {
  normalizeRecentMarkdownFiles,
  normalizeRecentMarkdownFolders,
  prependRecentMarkdownFile,
  prependRecentMarkdownFolder,
  type RecentMarkdownFile,
  type RecentMarkdownFolder
} from "./recent-markdown";
import {
  defaultSyncSettings,
  normalizeSyncSettings,
  type SyncProvider,
  type SyncSettings,
  type WebDavSyncSettings
} from "./sync-settings";
import {
  defaultWebSearchSettings,
  normalizeWebSearchSettings,
  type WebSearchProviderId,
  type WebSearchSettings
} from "./web-search-settings";
import {
  defaultWorkspaceState,
  normalizeFileTreeSortByWorkspace,
  normalizeStoredFileTreeSort,
  normalizeWorkspaceState,
  type StoredFileTreeSort,
  type StoredFileTreeSortByWorkspace,
  type StoredWorkspaceDraftTab,
  type StoredWorkspaceSideBySideGroup,
  type StoredWorkspaceState,
  type StoredWorkspaceWindowState,
  type StoredWorkspaceWindow
} from "./workspace-state";

export {
  defaultBackupSettings,
  normalizeBackupSettings
} from "./backup-settings";
export {
  defaultExportSettings,
  normalizeExportSettings
} from "./export-settings";
export {
  defaultNetworkSettings,
  normalizeNetworkSettings
} from "./network-settings";
export {
  normalizeRecentMarkdownFiles,
  normalizeRecentMarkdownFolders,
  prependRecentMarkdownFile,
  prependRecentMarkdownFolder
} from "./recent-markdown";
export {
  defaultSyncSettings,
  normalizeSyncSettings
} from "./sync-settings";
export {
  defaultWebSearchSettings,
  normalizeWebSearchSettings
} from "./web-search-settings";
export {
  defaultStoredFileTreeSort,
  defaultWorkspaceState,
  normalizeFileTreeSortByWorkspace,
  normalizeStoredFileTreeSort,
  normalizeWorkspaceState
} from "./workspace-state";
export type {
  BackupSettings
} from "./backup-settings";
export type {
  ExportSettings,
  PdfMarginPreset,
  PdfPageSize
} from "./export-settings";
export type {
  NetworkSettings
} from "./network-settings";
export type {
  RecentMarkdownFile,
  RecentMarkdownFolder
} from "./recent-markdown";
export type {
  SyncProvider,
  SyncSettings,
  WebDavSyncSettings
} from "./sync-settings";
export type {
  WebSearchProviderId,
  WebSearchSettings
} from "./web-search-settings";
export type {
  StoredFileTreeSort,
  StoredFileTreeSortByWorkspace,
  StoredWorkspaceDraftTab,
  StoredWorkspaceSideBySideGroup,
  StoredWorkspaceState,
  StoredWorkspaceWindowState,
  StoredWorkspaceWindow
} from "./workspace-state";

const settingsStorePath = "settings.json";
const aiAgentSessionIndexStorePath = "ai-agent-sessions/index.json";
const aiAgentSessionStateKey = "session";
const aiAgentSessionMetaKey = "meta";
const aiAgentSessionIndexKey = "entries";
const welcomeDocumentSeenKey = "welcomeDocumentSeen";
const themeKey = "theme";
const appearanceModeKey = "appearanceMode";
const lightThemeKey = "lightTheme";
const darkThemeKey = "darkTheme";
const customThemeCssKey = "customThemeCss";
const lightCustomThemeCssKey = "lightCustomThemeCss";
const darkCustomThemeCssKey = "darkCustomThemeCss";
const languageKey = "language";
const acpAgentSettingsKey = "acpAgentSettings";
const aiProvidersKey = "aiProviders";
const aiAgentPreferencesKey = "aiAgentPreferences";
const editorPreferencesKey = "editorPreferences";
const exportSettingsKey = "exportSettings";
const webSearchKey = "webSearch";
const networkKey = "network";
const backupSettingsKey = "backupSettings";
const syncSettingsKey = "syncSettings";
const fileTreeSortByWorkspaceKey = "fileTreeSortByWorkspace";
const workspaceKey = "workspace";
const recentMarkdownFilesKey = "recentMarkdownFiles";
const recentMarkdownFoldersKey = "recentMarkdownFolders";
const mainWorkspaceWindowLabel = "main";
const settingsWorkspaceWindowLabel = "markra-settings";
const maxFileTreeSortWorkspaceEntries = 50;
const storedAppSettingsFileFormat = "markra-settings";
const storedAppSettingsFileVersion = 1;
const invalidStoredAppSettingsFileMessage = "Invalid Markra settings file.";

type StoredWorkspaceStateOptions = {
  windowLabel?: string | null;
};

type StoredWorkspaceStore = {
  legacyState: StoredWorkspaceState;
  openWindows: StoredWorkspaceWindow[];
  windowStates: Record<string, StoredWorkspaceWindowState>;
};

type StoredWorkspaceStoreValue = Partial<StoredWorkspaceState> & {
  windowStates?: unknown;
};

export type ResolvedAppTheme = "light" | "dark";
export const appAppearanceModeOptions = ["system", "light", "dark"] as const;
export type AppAppearanceMode = typeof appAppearanceModeOptions[number];
export type AiSelectionDisplayMode = "command" | "toolbar";
export type SidebarLayoutMode = "stacked" | "tabs";
export type TableColumnWidthModePreference = "auto" | "even";
type LegacyEditorPreferences = {
  aiSelectionDisplayMode?: AiSelectionDisplayMode;
  autoOpenAiOnSelection?: boolean;
};
export const editorThemeOptions = [
  "light",
  "dark",
  "github",
  "github-dark",
  "one-dark",
  "one-light",
  "one-dark-pro",
  "gothic",
  "newsprint",
  "night",
  "pixyll",
  "whitey",
  "sepia",
  "solarized-light",
  "solarized-dark",
  "nord",
  "catppuccin-latte",
  "catppuccin-mocha",
  "academic",
  "minimal",
  "custom"
] as const;
export type EditorTheme = typeof editorThemeOptions[number];
export const appThemeOptions = ["system", ...editorThemeOptions] as const;
export type AppTheme = typeof appThemeOptions[number];
export const lightEditorThemeOptions = [
  "light",
  "github",
  "one-light",
  "gothic",
  "newsprint",
  "pixyll",
  "whitey",
  "sepia",
  "solarized-light",
  "catppuccin-latte",
  "academic",
  "minimal",
  "custom"
] as const;
export type LightEditorTheme = typeof lightEditorThemeOptions[number];
export const darkEditorThemeOptions = [
  "dark",
  "github-dark",
  "one-dark",
  "one-dark-pro",
  "night",
  "solarized-dark",
  "nord",
  "catppuccin-mocha",
  "custom"
] as const;
export type DarkEditorTheme = typeof darkEditorThemeOptions[number];
export type AppThemePreferences = {
  appearanceMode: AppAppearanceMode;
  darkTheme: DarkEditorTheme;
  lightTheme: LightEditorTheme;
};
export const defaultAppThemePreferences: AppThemePreferences = {
  appearanceMode: "system",
  darkTheme: "dark",
  lightTheme: "light"
};
export type TitlebarActionId = "aiAgent" | "sourceMode" | "history" | "save" | "theme";
export type TitlebarActionPreference = {
  id: TitlebarActionId;
  visible: boolean;
};
export type ImageUploadProvider = "local" | "picgo" | "s3" | "webdav";
export type PicGoImageUploadSettings = {
  secret: string;
  serverUrl: string;
};
export type S3ImageUploadSettings = {
  accessKeyId: string;
  bucket: string;
  endpointUrl: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
  uploadPath: string;
};
export type WebDavImageUploadSettings = {
  password: string;
  publicBaseUrl: string;
  serverUrl: string;
  uploadPath: string;
  username: string;
};
export type ImageUploadSettings = {
  fileNamePattern: string;
  picgo: PicGoImageUploadSettings;
  provider: ImageUploadProvider;
  s3: S3ImageUploadSettings;
  webdav: WebDavImageUploadSettings;
};
export type AiAgentPreferences = {
  thinkingEnabled: boolean;
  webSearchEnabled: boolean;
};
export type AcpAgentSettings = {
  args: string;
  command: string;
  cwd: string;
  enabled: boolean;
};
export type PortableStoredAppSettings = {
  acpAgentSettings: AcpAgentSettings;
  aiAgentPreferences: AiAgentPreferences;
  aiProviders: AiProviderSettings;
  appearanceMode: AppAppearanceMode;
  backupSettings: BackupSettings;
  customThemeCss: CustomThemeCssValues;
  darkTheme: DarkEditorTheme;
  editorPreferences: EditorPreferences;
  exportSettings: ExportSettings;
  language: AppLanguage;
  lightTheme: LightEditorTheme;
  network: NetworkSettings;
  syncSettings: SyncSettings;
  webSearch: WebSearchSettings;
};
export type StoredAppSettingsFile = {
  exportedAt: string;
  format: typeof storedAppSettingsFileFormat;
  settings: PortableStoredAppSettings;
  version: typeof storedAppSettingsFileVersion;
};
export type ExtendedSyntaxPreferences = {
  githubAlerts: boolean;
  highlight: boolean;
};
export type EditorPreferences = {
  aiQuickActionPrompts: AiQuickActionPrompts;
  aiWorkspaceAnimationEnabled: boolean;
  autoRevealActiveFile: boolean;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  autoUpdateEnabled: boolean;
  bodyFontSize: number;
  clipboardImageFolder: string;
  closeAiCommandOnAgentPanelOpen: boolean;
  contentWidth: EditorContentWidth;
  contentWidthPx: number | null;
  copyExternalFilesToStorage: boolean;
  documentLinksOpen: boolean;
  documentLinksVisible: boolean;
  editorFontFamily: EditorFontFamilyPreference;
  extendedSyntax: ExtendedSyntaxPreferences;
  imageUpload: ImageUploadSettings;
  lineHeight: number;
  markdownShortcuts: MarkdownShortcutBindings;
  markdownTemplates: MarkdownTemplateEntry[];
  restoreWorkspaceOnStartup: boolean;
  sidebarLayoutMode: SidebarLayoutMode;
  showAiQuickInputOnSelection: boolean;
  showAiSelectionToolbarOnSelection: boolean;
  suggestAiPanelForComplexInlinePrompts: boolean;
  showDocumentTabs: boolean;
  splitVisualPanePercent: number;
  spellcheckEnabled: boolean;
  spellcheckIgnoredWords: string[];
  spellcheckLanguage: SpellcheckLanguage;
  tableColumnWidthMode: TableColumnWidthModePreference;
  titlebarActions: TitlebarActionPreference[];
  showWordCount: boolean;
  wrapCodeBlocks: boolean;
};
export type { AppLanguage };
export type { EditorContentWidth };
export type { EditorFontFamilyPreference };

export const customThemeCssMaxLength = 50000;
export const defaultCustomThemeCss = `:root[data-theme="custom"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-code: #f6f8fa;
  --bg-hover: rgba(129, 139, 152, 0.1);
  --bg-active: #e6eaef;
  --text-primary: #1f2328;
  --text-heading: #1f2328;
  --text-secondary: #59636e;
  --text-md-char: #818b98;
  --border-default: #d1d9e0;
  --border-strong: #d1d9e0;
  --accent: #1a1c1e;
  --accent-soft: rgba(26, 28, 30, 0.1);
  --accent-hover: #0f1115;
}

:root[data-theme="custom"] .markdown-paper[data-editor-theme="custom"] {
  --editor-paper-bg: var(--bg-primary);
  --editor-text-primary: var(--text-primary);
  --editor-text-heading: var(--text-heading);
  --editor-text-secondary: var(--text-secondary);
  --editor-border: var(--border-default);
  --editor-border-strong: var(--border-strong);
  --editor-bg-secondary: var(--bg-secondary);
  --editor-inline-code-bg: var(--bg-code);
  --editor-code-bg: var(--bg-code);
  --editor-code-line-bg: var(--bg-secondary);
}`;
export type CustomThemeCssValues = {
  dark: string;
  light: string;
};
export const defaultCustomThemeCssValues: CustomThemeCssValues = {
  dark: defaultCustomThemeCss,
  light: defaultCustomThemeCss
};

export const defaultTitlebarActions: readonly TitlebarActionPreference[] = [
  { id: "aiAgent", visible: true },
  { id: "sourceMode", visible: true },
  { id: "history", visible: true },
  { id: "save", visible: true },
  { id: "theme", visible: true }
];
export const splitVisualPanePercentMin = 25;
export const splitVisualPanePercentMax = 75;
export const defaultSplitVisualPanePercent = 50;
export const autoSaveIntervalMinutesMin = 1;
export const autoSaveIntervalMinutesMax = 120;
export const defaultAutoSaveIntervalMinutes = 10;

export const defaultImageUploadSettings: ImageUploadSettings = {
  fileNamePattern: "pasted-image-{timestamp}",
  picgo: {
    secret: "",
    serverUrl: ""
  },
  provider: "local",
  s3: {
    accessKeyId: "",
    bucket: "",
    endpointUrl: "",
    publicBaseUrl: "",
    region: "",
    secretAccessKey: "",
    uploadPath: ""
  },
  webdav: {
    password: "",
    publicBaseUrl: "",
    serverUrl: "",
    uploadPath: "",
    username: ""
  }
};

export const defaultExtendedSyntaxPreferences: ExtendedSyntaxPreferences = {
  githubAlerts: true,
  highlight: true
};

export const defaultEditorPreferences: EditorPreferences = {
  aiQuickActionPrompts: { ...defaultAiQuickActionPrompts },
  aiWorkspaceAnimationEnabled: false,
  autoRevealActiveFile: false,
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: defaultAutoSaveIntervalMinutes,
  autoUpdateEnabled: true,
  bodyFontSize: 16,
  clipboardImageFolder: "assets",
  closeAiCommandOnAgentPanelOpen: false,
  contentWidth: "default",
  contentWidthPx: null,
  copyExternalFilesToStorage: true,
  documentLinksOpen: true,
  documentLinksVisible: false,
  editorFontFamily: { ...defaultEditorFontFamily },
  extendedSyntax: { ...defaultExtendedSyntaxPreferences },
  imageUpload: defaultImageUploadSettings,
  lineHeight: 1.65,
  markdownShortcuts: defaultMarkdownShortcuts,
  markdownTemplates: [],
  restoreWorkspaceOnStartup: true,
  sidebarLayoutMode: "stacked",
  showAiQuickInputOnSelection: true,
  showAiSelectionToolbarOnSelection: false,
  suggestAiPanelForComplexInlinePrompts: false,
  showDocumentTabs: true,
  splitVisualPanePercent: defaultSplitVisualPanePercent,
  spellcheckEnabled: false,
  spellcheckIgnoredWords: [],
  spellcheckLanguage: defaultSpellcheckLanguage,
  tableColumnWidthMode: "auto",
  titlebarActions: [...defaultTitlebarActions],
  showWordCount: true,
  wrapCodeBlocks: true
};

export const defaultAiAgentPreferences: AiAgentPreferences = {
  thinkingEnabled: false,
  webSearchEnabled: false
};
const legacyCodexAcpAgentArgs = "-lc 'exec env CODEX_PATH=\"$(command -v codex)\" npx -y @agentclientprotocol/codex-acp'";
const legacyCodexAcpAgentArgsWithPathFallback = [
  "-lc '",
  "CODEX_BIN=\"$(command -v codex || true)\"; ",
  "if [ -z \"$CODEX_BIN\" ] && [ -x \"/Applications/Codex.app/Contents/Resources/codex\" ]; then ",
  "CODEX_BIN=\"/Applications/Codex.app/Contents/Resources/codex\"; ",
  "fi; ",
  "if [ -n \"$CODEX_BIN\" ]; then ",
  "exec env CODEX_PATH=\"$CODEX_BIN\" npx -y @agentclientprotocol/codex-acp; ",
  "fi; ",
  "exec npx -y @agentclientprotocol/codex-acp",
  "'"
].join("");
export const codexAcpAgentArgs = [
  "-lc '",
  "CODEX_BIN=\"$(command -v codex || true)\"; ",
  "if [ -z \"$CODEX_BIN\" ] && [ -x \"/Applications/Codex.app/Contents/Resources/codex\" ]; then ",
  "CODEX_BIN=\"/Applications/Codex.app/Contents/Resources/codex\"; ",
  "fi; ",
  "if [ -n \"$CODEX_BIN\" ]; then ",
  "exec env CODEX_PATH=\"$CODEX_BIN\" INITIAL_AGENT_MODE=read-only npx -y @agentclientprotocol/codex-acp; ",
  "fi; ",
  "exec env INITIAL_AGENT_MODE=read-only npx -y @agentclientprotocol/codex-acp",
  "'"
].join("");
export const defaultAcpAgentSettings: AcpAgentSettings = {
  args: "",
  command: "",
  cwd: "",
  enabled: false
};

const editorBodyFontSizeOptions = [14, 15, 16, 17, 18, 20] as const;
const editorLineHeightOptions = [1.5, 1.65, 1.8] as const;
const sidebarLayoutModeOptions: readonly SidebarLayoutMode[] = ["stacked", "tabs"];
const tableColumnWidthModeOptions: readonly TableColumnWidthModePreference[] = ["even", "auto"];

function loadSettingsStore() {
  return getAppRuntime().settings.loadStore(settingsStorePath, { autoSave: false, defaults: {} });
}

function loadAiAgentSessionStore(sessionId: string | null) {
  return getAppRuntime().settings.loadStore(aiAgentSessionStorePath(sessionId), { autoSave: false, defaults: {} });
}

function loadAiAgentSessionIndexStore() {
  return getAppRuntime().settings.loadStore(aiAgentSessionIndexStorePath, { autoSave: false, defaults: {} });
}

function isSettingsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidStoredAppSettingsFile(): Error {
  return new Error(invalidStoredAppSettingsFileMessage);
}

function parseStoredAppSettingsFile(contents: string): PortableStoredAppSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw invalidStoredAppSettingsFile();
  }

  if (!isSettingsRecord(parsed)) throw invalidStoredAppSettingsFile();
  if (parsed.format !== storedAppSettingsFileFormat) throw invalidStoredAppSettingsFile();
  if (parsed.version !== storedAppSettingsFileVersion) throw invalidStoredAppSettingsFile();
  if (!isSettingsRecord(parsed.settings)) throw invalidStoredAppSettingsFile();

  return normalizePortableStoredAppSettings(parsed.settings);
}

function normalizePortableStoredAppSettings(value: Record<string, unknown>): PortableStoredAppSettings {
  const themePreferences = normalizeAppThemePreferences(value);

  return {
    acpAgentSettings: normalizeAcpAgentSettings(value.acpAgentSettings),
    aiAgentPreferences: normalizeAiAgentPreferences(value.aiAgentPreferences),
    aiProviders: normalizeAiSettings(value.aiProviders),
    appearanceMode: themePreferences.appearanceMode,
    backupSettings: normalizeBackupSettings(value.backupSettings),
    customThemeCss: normalizeCustomThemeCssValues(value.customThemeCss),
    darkTheme: themePreferences.darkTheme,
    editorPreferences: normalizeEditorPreferences(value.editorPreferences),
    exportSettings: normalizeExportSettings(value.exportSettings),
    language: isAppLanguage(value.language) ? value.language : "en",
    lightTheme: themePreferences.lightTheme,
    network: normalizeNetworkSettings(value.network),
    syncSettings: normalizeSyncSettings(value.syncSettings),
    webSearch: normalizeWebSearchSettings(value.webSearch)
  };
}

async function readPortableStoredAppSettings(): Promise<PortableStoredAppSettings> {
  const store = await loadSettingsStore();
  const legacyTheme = await store.get<AppTheme>(themeKey);
  const legacyPreferences = isAppTheme(legacyTheme)
    ? createThemePreferencesFromLegacyTheme(legacyTheme)
    : defaultAppThemePreferences;
  const themePreferences = normalizeAppThemePreferences({
    appearanceMode: await store.get<AppAppearanceMode>(appearanceModeKey),
    darkTheme: await store.get<DarkEditorTheme>(darkThemeKey),
    lightTheme: await store.get<LightEditorTheme>(lightThemeKey)
  }, legacyPreferences);
  const legacyCustomThemeCss = normalizeCustomThemeCss(await store.get<string>(customThemeCssKey));
  const customThemeCss = normalizeCustomThemeCssValues({
    dark: await store.get<string>(darkCustomThemeCssKey) ?? legacyCustomThemeCss,
    light: await store.get<string>(lightCustomThemeCssKey) ?? legacyCustomThemeCss
  });
  const language = await store.get<AppLanguage>(languageKey);
  const acpAgentSettings = await store.get<Partial<AcpAgentSettings>>(acpAgentSettingsKey);
  const aiProviders = await store.get<AiProviderSettings>(aiProvidersKey);
  const aiAgentPreferences = await store.get<Partial<AiAgentPreferences>>(aiAgentPreferencesKey);
  const editorPreferences = await store.get<Partial<EditorPreferences>>(editorPreferencesKey);
  const exportSettings = await store.get<Partial<ExportSettings>>(exportSettingsKey);
  const webSearch = await store.get<Partial<WebSearchSettings>>(webSearchKey);
  const network = await store.get<Partial<NetworkSettings>>(networkKey);
  const backupSettings = await store.get<Partial<BackupSettings>>(backupSettingsKey);
  const syncSettings = await store.get<Partial<SyncSettings>>(syncSettingsKey);

  return {
    acpAgentSettings: normalizeAcpAgentSettings(acpAgentSettings),
    aiAgentPreferences: normalizeAiAgentPreferences(aiAgentPreferences),
    aiProviders: aiProviders ? normalizeAiSettings(aiProviders) : createDefaultAiSettings(),
    appearanceMode: themePreferences.appearanceMode,
    backupSettings: normalizeBackupSettings(backupSettings),
    customThemeCss,
    darkTheme: themePreferences.darkTheme,
    editorPreferences: normalizeEditorPreferences(editorPreferences),
    exportSettings: normalizeExportSettings(exportSettings),
    language: isAppLanguage(language) ? language : "en",
    lightTheme: themePreferences.lightTheme,
    network: normalizeNetworkSettings(network),
    syncSettings: normalizeSyncSettings(syncSettings),
    webSearch: normalizeWebSearchSettings(webSearch)
  };
}

async function writePortableStoredAppSettings(settings: PortableStoredAppSettings) {
  const store = await loadSettingsStore();

  await store.set(acpAgentSettingsKey, settings.acpAgentSettings);
  await store.set(aiAgentPreferencesKey, settings.aiAgentPreferences);
  await store.set(aiProvidersKey, settings.aiProviders);
  await store.set(appearanceModeKey, settings.appearanceMode);
  await store.set(backupSettingsKey, settings.backupSettings);
  await store.set(darkCustomThemeCssKey, settings.customThemeCss.dark);
  await store.set(darkThemeKey, settings.darkTheme);
  await store.set(editorPreferencesKey, settings.editorPreferences);
  await store.set(exportSettingsKey, settings.exportSettings);
  await store.set(languageKey, settings.language);
  await store.set(lightCustomThemeCssKey, settings.customThemeCss.light);
  await store.set(lightThemeKey, settings.lightTheme);
  await store.set(networkKey, settings.network);
  await store.set(syncSettingsKey, settings.syncSettings);
  await store.set(webSearchKey, settings.webSearch);
  await store.save();
}

export async function exportStoredAppSettings(exportedAt: Date = new Date()) {
  const settingsFile: StoredAppSettingsFile = {
    exportedAt: exportedAt.toISOString(),
    format: storedAppSettingsFileFormat,
    settings: await readPortableStoredAppSettings(),
    version: storedAppSettingsFileVersion
  };

  return JSON.stringify(settingsFile, null, 2);
}

export async function importStoredAppSettings(contents: string) {
  const settings = parseStoredAppSettingsFile(contents);

  await writePortableStoredAppSettings(settings);

  return settings;
}

export function createAiAgentSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isAppTheme(value: unknown): value is AppTheme {
  return appThemeOptions.includes(value as AppTheme);
}

export function isEditorTheme(value: unknown): value is EditorTheme {
  return editorThemeOptions.includes(value as EditorTheme);
}

export function isAppAppearanceMode(value: unknown): value is AppAppearanceMode {
  return appAppearanceModeOptions.includes(value as AppAppearanceMode);
}

export function isLightEditorTheme(value: unknown): value is LightEditorTheme {
  return lightEditorThemeOptions.includes(value as LightEditorTheme);
}

export function isDarkEditorTheme(value: unknown): value is DarkEditorTheme {
  return darkEditorThemeOptions.includes(value as DarkEditorTheme);
}

export function normalizeCustomThemeCss(value: unknown) {
  if (typeof value !== "string") return defaultCustomThemeCss;

  return value.slice(0, customThemeCssMaxLength);
}

export function normalizeCustomThemeCssValues(value: unknown): CustomThemeCssValues {
  if (typeof value !== "object" || value === null) {
    const css = normalizeCustomThemeCss(value);

    return {
      dark: css,
      light: css
    };
  }

  const css = value as Partial<Record<keyof CustomThemeCssValues, unknown>>;

  return {
    dark: normalizeCustomThemeCss(css.dark),
    light: normalizeCustomThemeCss(css.light)
  };
}

export function normalizeAppThemePreferences(
  value: unknown,
  fallback: AppThemePreferences = defaultAppThemePreferences
): AppThemePreferences {
  if (typeof value !== "object" || value === null) return fallback;

  const preferences = value as Partial<Record<keyof AppThemePreferences, unknown>>;

  return {
    appearanceMode: isAppAppearanceMode(preferences.appearanceMode)
      ? preferences.appearanceMode
      : fallback.appearanceMode,
    darkTheme: isDarkEditorTheme(preferences.darkTheme) ? preferences.darkTheme : fallback.darkTheme,
    lightTheme: isLightEditorTheme(preferences.lightTheme) ? preferences.lightTheme : fallback.lightTheme
  };
}

export function resolveAppAppearanceTheme(theme: AppTheme, systemTheme: ResolvedAppTheme): ResolvedAppTheme {
  if (theme === "system") return systemTheme;
  if (isDarkEditorTheme(theme) && theme !== "custom") return "dark";

  return "light";
}

export function resolveAppEditorTheme(theme: AppTheme, systemTheme: ResolvedAppTheme): EditorTheme {
  if (theme === "system") return systemTheme;

  return theme;
}

export function createThemePreferencesFromLegacyTheme(theme: AppTheme): AppThemePreferences {
  if (theme === "system") return defaultAppThemePreferences;
  if (isDarkEditorTheme(theme) && theme !== "custom") {
    return {
      ...defaultAppThemePreferences,
      appearanceMode: "dark",
      darkTheme: theme
    };
  }
  if (isLightEditorTheme(theme)) {
    return {
      ...defaultAppThemePreferences,
      appearanceMode: "light",
      lightTheme: theme
    };
  }

  return defaultAppThemePreferences;
}

export function resolveAppThemePreferencesAppearance(
  preferences: AppThemePreferences,
  systemTheme: ResolvedAppTheme
): ResolvedAppTheme {
  return preferences.appearanceMode === "system" ? systemTheme : preferences.appearanceMode;
}

export function resolveAppThemePreferencesEditorTheme(
  preferences: AppThemePreferences,
  systemTheme: ResolvedAppTheme
): EditorTheme {
  return resolveAppThemePreferencesAppearance(preferences, systemTheme) === "dark"
    ? preferences.darkTheme
    : preferences.lightTheme;
}

export async function consumeWelcomeDocumentState() {
  const store = await loadSettingsStore();
  const hasSeenWelcomeDocument = await store.get<boolean>(welcomeDocumentSeenKey);

  if (hasSeenWelcomeDocument) return false;

  await store.set(welcomeDocumentSeenKey, true);
  await store.save();

  return true;
}

export async function getStoredTheme(): Promise<AppTheme> {
  const store = await loadSettingsStore();
  const theme = await store.get<AppTheme>(themeKey);

  return isAppTheme(theme) ? theme : "system";
}

export async function saveStoredTheme(theme: AppTheme) {
  const store = await loadSettingsStore();

  await store.set(themeKey, theme);
  await store.save();
}

export async function getStoredThemePreferences(): Promise<AppThemePreferences> {
  const store = await loadSettingsStore();
  const appearanceMode = await store.get<AppAppearanceMode>(appearanceModeKey);
  const lightTheme = await store.get<LightEditorTheme>(lightThemeKey);
  const darkTheme = await store.get<DarkEditorTheme>(darkThemeKey);
  const legacyTheme = await store.get<AppTheme>(themeKey);
  const legacyPreferences = isAppTheme(legacyTheme)
    ? createThemePreferencesFromLegacyTheme(legacyTheme)
    : defaultAppThemePreferences;

  return {
    appearanceMode: isAppAppearanceMode(appearanceMode) ? appearanceMode : legacyPreferences.appearanceMode,
    darkTheme: isDarkEditorTheme(darkTheme) ? darkTheme : legacyPreferences.darkTheme,
    lightTheme: isLightEditorTheme(lightTheme) ? lightTheme : legacyPreferences.lightTheme
  };
}

export async function saveStoredThemePreferences(preferences: AppThemePreferences) {
  const store = await loadSettingsStore();
  const normalizedPreferences = normalizeAppThemePreferences(preferences);

  await store.set(appearanceModeKey, normalizedPreferences.appearanceMode);
  await store.set(lightThemeKey, normalizedPreferences.lightTheme);
  await store.set(darkThemeKey, normalizedPreferences.darkTheme);
  await store.save();
}

export async function getStoredCustomThemeCss() {
  const store = await loadSettingsStore();
  const lightCss = await store.get<string>(lightCustomThemeCssKey);
  const darkCss = await store.get<string>(darkCustomThemeCssKey);
  const legacyCss = await store.get<string>(customThemeCssKey);
  const fallbackCss = normalizeCustomThemeCss(legacyCss);

  return {
    dark: typeof darkCss === "string" ? normalizeCustomThemeCss(darkCss) : fallbackCss,
    light: typeof lightCss === "string" ? normalizeCustomThemeCss(lightCss) : fallbackCss
  };
}

export async function saveStoredCustomThemeCss(css: CustomThemeCssValues) {
  const store = await loadSettingsStore();
  const normalizedCss = normalizeCustomThemeCssValues(css);

  await store.set(lightCustomThemeCssKey, normalizedCss.light);
  await store.set(darkCustomThemeCssKey, normalizedCss.dark);
  await store.save();
}

export async function getStoredLanguage(): Promise<AppLanguage> {
  const store = await loadSettingsStore();
  const language = await store.get<AppLanguage>(languageKey);

  return isAppLanguage(language) ? language : "en";
}

export async function saveStoredLanguage(language: AppLanguage) {
  const store = await loadSettingsStore();

  await store.set(languageKey, language);
  await store.save();
}

export async function getStoredAiSettings(): Promise<AiProviderSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<AiProviderSettings>(aiProvidersKey);

  return settings ? normalizeAiSettings(settings) : createDefaultAiSettings();
}

export async function getStoredAcpAgentSettings(): Promise<AcpAgentSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<AcpAgentSettings>>(acpAgentSettingsKey);

  return normalizeAcpAgentSettings(settings);
}

export async function getStoredAiAgentPreferences(): Promise<AiAgentPreferences> {
  const store = await loadSettingsStore();
  const preferences = await store.get<Partial<AiAgentPreferences>>(aiAgentPreferencesKey);

  return normalizeAiAgentPreferences(preferences);
}

export async function getStoredAiAgentSession(sessionId: string | null): Promise<StoredAiAgentSessionState> {
  if (!sessionId?.trim()) return normalizeStoredAiAgentSessionState(undefined);

  const sessionStore = await loadAiAgentSessionStore(sessionId);
  const session = await sessionStore.get<StoredAiAgentSessionState>(aiAgentSessionStateKey);

  return normalizeStoredAiAgentSessionState(session);
}

export async function getStoredAiAgentSessionSummary(sessionId: string | null) {
  if (!sessionId?.trim()) return null;

  const sessionStore = await loadAiAgentSessionStore(sessionId);
  const summary = await sessionStore.get<StoredAiAgentSessionSummary>(aiAgentSessionMetaKey);

  return normalizeStoredAiAgentSessionSummary(summary);
}

export async function listStoredAiAgentSessions(
  workspaceKey: string | null,
  options: {
    includeArchived?: boolean;
  } = {}
): Promise<StoredAiAgentSessionSummary[]> {
  const store = await loadAiAgentSessionIndexStore();
  const entries = await store.get<StoredAiAgentSessionSummary[]>(aiAgentSessionIndexKey);
  const normalizedWorkspaceKey = normalizeAiAgentWorkspaceKey(workspaceKey);

  return normalizeStoredAiAgentSessionSummaries(entries)
    .filter((entry) => entry.workspaceKey === normalizedWorkspaceKey)
    .filter((entry) => options.includeArchived || entry.archivedAt === null);
}

export async function initializeStoredAiAgentSession(
  sessionId: string,
  workspaceKey: string | null,
  options: Partial<
    Pick<StoredAiAgentSessionState, "agentModelId" | "agentProviderId" | "thinkingEnabled" | "webSearchEnabled">
  > = {}
) {
  const preferences = await getStoredAiAgentPreferences();

  await saveStoredAiAgentSession(sessionId, createDefaultAiAgentSessionState({
    agentModelId: options.agentModelId,
    agentProviderId: options.agentProviderId,
    thinkingEnabled: options.thinkingEnabled ?? preferences.thinkingEnabled,
    webSearchEnabled: options.webSearchEnabled ?? preferences.webSearchEnabled
  }), { workspaceKey });
}

export async function saveStoredAiAgentSession(
  sessionId: string | null,
  session: StoredAiAgentSessionState,
  options: {
    workspaceKey?: string | null;
  } = {}
) {
  if (!sessionId?.trim()) return;

  const normalizedSession = normalizeStoredAiAgentSessionState(session);
  const store = await loadAiAgentSessionStore(sessionId);
  const existingSummary = normalizeStoredAiAgentSessionSummary(await store.get(aiAgentSessionMetaKey));
  const now = Date.now();
  const fallbackTitle = createAiAgentSessionTitle(normalizedSession);
  const preserveManagedTitle =
    (existingSummary?.titleSource === "ai" || existingSummary?.titleSource === "manual") && existingSummary.title;
  const summary: StoredAiAgentSessionSummary = {
    archivedAt: existingSummary?.archivedAt ?? null,
    createdAt: existingSummary?.createdAt ?? now,
    id: sessionId,
    messageCount: normalizedSession.messages.length,
    title: preserveManagedTitle ? existingSummary.title : fallbackTitle,
    titleSource: preserveManagedTitle ? existingSummary?.titleSource ?? null : fallbackTitle ? "fallback" : null,
    updatedAt: now,
    workspaceKey: normalizeAiAgentWorkspaceKey(existingSummary?.workspaceKey ?? options.workspaceKey)
  };

  await store.set(aiAgentSessionStateKey, normalizedSession);
  await store.set(aiAgentSessionMetaKey, summary);
  await store.save();

  const indexStore = await loadAiAgentSessionIndexStore();
  const currentEntries = normalizeStoredAiAgentSessionSummaries(await indexStore.get(aiAgentSessionIndexKey));
  const nextEntries = [summary, ...currentEntries.filter((entry) => entry.id !== sessionId)];

  await indexStore.set(aiAgentSessionIndexKey, nextEntries);
  await indexStore.save();
}

export async function saveStoredAiAgentSessionTitle(
  sessionId: string | null,
  title: string | null,
  options: {
    source?: "ai" | "manual";
    workspaceKey?: string | null;
  } = {}
) {
  if (!sessionId?.trim()) return;

  const normalizedTitle = normalizeAiAgentSessionTitle(title);
  if (!normalizedTitle) return;

  const store = await loadAiAgentSessionStore(sessionId);
  const existingSummary = normalizeStoredAiAgentSessionSummary(await store.get(aiAgentSessionMetaKey));
  const session = normalizeStoredAiAgentSessionState(await store.get<StoredAiAgentSessionState>(aiAgentSessionStateKey));
  const now = Date.now();
  const summary: StoredAiAgentSessionSummary = {
    archivedAt: existingSummary?.archivedAt ?? null,
    createdAt: existingSummary?.createdAt ?? now,
    id: sessionId,
    messageCount: session.messages.length,
    title: normalizedTitle,
    titleSource: options.source ?? "ai",
    updatedAt: now,
    workspaceKey: normalizeAiAgentWorkspaceKey(existingSummary?.workspaceKey ?? options.workspaceKey)
  };

  await store.set(aiAgentSessionMetaKey, summary);
  await store.save();

  const indexStore = await loadAiAgentSessionIndexStore();
  const currentEntries = normalizeStoredAiAgentSessionSummaries(await indexStore.get(aiAgentSessionIndexKey));
  const nextEntries = [summary, ...currentEntries.filter((entry) => entry.id !== sessionId)];

  await indexStore.set(aiAgentSessionIndexKey, nextEntries);
  await indexStore.save();
}

export async function setStoredAiAgentSessionArchived(sessionId: string | null, archived: boolean) {
  if (!sessionId?.trim()) return;

  const store = await loadAiAgentSessionStore(sessionId);
  const existingSummary = normalizeStoredAiAgentSessionSummary(await store.get(aiAgentSessionMetaKey));
  const session = normalizeStoredAiAgentSessionState(await store.get<StoredAiAgentSessionState>(aiAgentSessionStateKey));
  const now = Date.now();
  const summary: StoredAiAgentSessionSummary = {
    archivedAt: archived ? now : null,
    createdAt: existingSummary?.createdAt ?? now,
    id: sessionId,
    messageCount: session.messages.length,
    title: existingSummary?.title ?? createAiAgentSessionTitle(session),
    titleSource: existingSummary?.titleSource ?? (createAiAgentSessionTitle(session) ? "fallback" : null),
    updatedAt: now,
    workspaceKey: normalizeAiAgentWorkspaceKey(existingSummary?.workspaceKey)
  };

  await store.set(aiAgentSessionMetaKey, summary);
  await store.save();

  const indexStore = await loadAiAgentSessionIndexStore();
  const currentEntries = normalizeStoredAiAgentSessionSummaries(await indexStore.get(aiAgentSessionIndexKey));
  const nextEntries = [summary, ...currentEntries.filter((entry) => entry.id !== sessionId)];

  await indexStore.set(aiAgentSessionIndexKey, nextEntries);
  await indexStore.save();
}

export async function deleteStoredAiAgentSession(sessionId: string | null) {
  if (!sessionId?.trim()) return;

  const store = await loadAiAgentSessionStore(sessionId);
  await store.delete(aiAgentSessionStateKey);
  await store.delete(aiAgentSessionMetaKey);
  await store.save();

  const indexStore = await loadAiAgentSessionIndexStore();
  const currentEntries = normalizeStoredAiAgentSessionSummaries(await indexStore.get(aiAgentSessionIndexKey));
  const nextEntries = currentEntries.filter((entry) => entry.id !== sessionId);

  await indexStore.set(aiAgentSessionIndexKey, nextEntries);
  await indexStore.save();
}

export async function saveStoredAiSettings(settings: AiProviderSettings) {
  const store = await loadSettingsStore();

  await store.set(aiProvidersKey, settings);
  await store.save();
}

export async function saveStoredAcpAgentSettings(settings: AcpAgentSettings) {
  const store = await loadSettingsStore();

  await store.set(acpAgentSettingsKey, normalizeAcpAgentSettings(settings));
  await store.save();
}

export async function saveStoredAiAgentPreferences(preferences: Partial<AiAgentPreferences>) {
  const store = await loadSettingsStore();
  const currentPreferences = normalizeAiAgentPreferences(await store.get<Partial<AiAgentPreferences>>(aiAgentPreferencesKey));

  await store.set(aiAgentPreferencesKey, normalizeAiAgentPreferences({ ...currentPreferences, ...preferences }));
  await store.save();
}

export async function getStoredEditorPreferences(): Promise<EditorPreferences> {
  const store = await loadSettingsStore();
  const preferences = await store.get<Partial<EditorPreferences>>(editorPreferencesKey);

  return normalizeEditorPreferences(preferences);
}

export async function saveStoredEditorPreferences(preferences: EditorPreferences) {
  const store = await loadSettingsStore();

  await store.set(editorPreferencesKey, normalizeEditorPreferences(preferences));
  await store.save();
}

export async function getStoredExportSettings(): Promise<ExportSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<ExportSettings>>(exportSettingsKey);

  return normalizeExportSettings(settings);
}

export async function saveStoredExportSettings(settings: ExportSettings) {
  const store = await loadSettingsStore();

  await store.set(exportSettingsKey, normalizeExportSettings(settings));
  await store.save();
}

export async function getStoredWebSearchSettings(): Promise<WebSearchSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<WebSearchSettings>>(webSearchKey);

  return normalizeWebSearchSettings(settings);
}

export async function saveStoredWebSearchSettings(settings: WebSearchSettings) {
  const store = await loadSettingsStore();

  await store.set(webSearchKey, normalizeWebSearchSettings(settings));
  await store.save();
}

export async function getStoredNetworkSettings(): Promise<NetworkSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<NetworkSettings>>(networkKey);

  return normalizeNetworkSettings(settings);
}

export async function saveStoredNetworkSettings(settings: NetworkSettings) {
  const store = await loadSettingsStore();

  await store.set(networkKey, normalizeNetworkSettings(settings));
  await store.save();
}

export async function getStoredBackupSettings(): Promise<BackupSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<BackupSettings>>(backupSettingsKey);

  return normalizeBackupSettings(settings);
}

export async function saveStoredBackupSettings(settings: BackupSettings) {
  const store = await loadSettingsStore();

  await store.set(backupSettingsKey, normalizeBackupSettings(settings));
  await store.save();
}

export async function getStoredSyncSettings(): Promise<SyncSettings> {
  const store = await loadSettingsStore();
  const settings = await store.get<Partial<SyncSettings>>(syncSettingsKey);

  return normalizeSyncSettings(settings);
}

export async function saveStoredSyncSettings(settings: SyncSettings) {
  const store = await loadSettingsStore();

  await store.set(syncSettingsKey, normalizeSyncSettings(settings));
  await store.save();
}

export async function getStoredFileTreeSortByWorkspace(): Promise<StoredFileTreeSortByWorkspace> {
  const store = await loadSettingsStore();
  const sortByWorkspace = await store.get<StoredFileTreeSortByWorkspace>(fileTreeSortByWorkspaceKey);

  return normalizeFileTreeSortByWorkspace(sortByWorkspace);
}

export async function saveStoredFileTreeSortForWorkspace(
  workspacePath: string | null | undefined,
  sort: StoredFileTreeSort
) {
  const normalizedWorkspacePath = normalizeNullableString(workspacePath);
  if (!normalizedWorkspacePath) return;

  const store = await loadSettingsStore();
  const current = normalizeFileTreeSortByWorkspace(
    await store.get<StoredFileTreeSortByWorkspace>(fileTreeSortByWorkspaceKey)
  );
  const nextSortByWorkspaceEntries = [
    [normalizedWorkspacePath, normalizeStoredFileTreeSort(sort)] as const,
    ...Object.entries(current).filter(([path]) => path !== normalizedWorkspacePath)
  ].slice(0, maxFileTreeSortWorkspaceEntries);

  await store.set(fileTreeSortByWorkspaceKey, Object.fromEntries(nextSortByWorkspaceEntries));
  await store.save();
}

function normalizeWorkspaceWindowLabel(label: string | null | undefined) {
  const trimmedLabel = label?.trim();
  return trimmedLabel ? trimmedLabel : mainWorkspaceWindowLabel;
}

function workspaceWindowStateFromWorkspaceState(state: StoredWorkspaceState): StoredWorkspaceWindowState {
  const { openWindows: _openWindows, ...windowState } = state;
  return windowState;
}

function workspaceWindowStateIsEmpty(state: StoredWorkspaceWindowState) {
  return (
    !state.activeDraftId &&
    !state.draftTabs?.length &&
    !state.aiAgentSessionId &&
    state.fileTreeAssetsVisible !== false &&
    !state.filePath &&
    !state.fileTreeOpen &&
    !state.folderName &&
    !state.folderPath &&
    state.openFilePaths.length === 0 &&
    state.recentFoldersOpen !== false &&
    !state.sideBySideGroup
  );
}

function normalizeWorkspaceWindowStates(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const states: Record<string, StoredWorkspaceWindowState> = {};

  Object.entries(value as Record<string, unknown>).forEach(([label, state]) => {
    states[normalizeWorkspaceWindowLabel(label)] = workspaceWindowStateFromWorkspaceState(normalizeWorkspaceState(state));
  });

  return states;
}

function normalizeWorkspaceStore(value: unknown): StoredWorkspaceStore {
  const legacyState = normalizeWorkspaceState(value);
  const candidate = typeof value === "object" && value !== null
    ? value as StoredWorkspaceStoreValue
    : {};
  const legacyWindowState = workspaceWindowStateFromWorkspaceState(legacyState);
  const legacyWindowStates: Record<string, StoredWorkspaceWindowState> = {};

  if (!workspaceWindowStateIsEmpty(legacyWindowState)) {
    legacyWindowStates[mainWorkspaceWindowLabel] = legacyWindowState;
  }

  return {
    legacyState,
    openWindows: legacyState.openWindows ?? [],
    windowStates: {
      ...legacyWindowStates,
      ...normalizeWorkspaceWindowStates(candidate.windowStates)
    }
  };
}

async function resolveStoredWorkspaceWindowLabel(options: StoredWorkspaceStateOptions = {}) {
  if ("windowLabel" in options) {
    return normalizeWorkspaceWindowLabel(options.windowLabel);
  }

  try {
    return normalizeWorkspaceWindowLabel(await getAppRuntime().window.getCurrentWindowLabel());
  } catch {
    return mainWorkspaceWindowLabel;
  }
}

function workspaceStateForWindowLabel(store: StoredWorkspaceStore, label: string): StoredWorkspaceState {
  const targetLabel = label === settingsWorkspaceWindowLabel ? mainWorkspaceWindowLabel : label;
  const windowState =
    store.windowStates[targetLabel] ??
    (targetLabel === mainWorkspaceWindowLabel
      ? workspaceWindowStateFromWorkspaceState(store.legacyState)
      : workspaceWindowStateFromWorkspaceState(defaultWorkspaceState));

  return {
    ...windowState,
    openWindows: store.openWindows
  };
}

function workspaceWindowPatchFromStatePatch(patch: Partial<StoredWorkspaceState>) {
  const { openWindows: _openWindows, ...windowPatch } = patch;
  return windowPatch;
}

function workspacePatchHasWindowState(patch: Partial<StoredWorkspaceState>) {
  return Object.keys(patch).some((key) => key !== "openWindows");
}

function serializedWorkspaceStore(store: StoredWorkspaceStore) {
  return {
    openWindows: store.openWindows,
    windowStates: store.windowStates
  };
}

export async function getStoredWorkspaceState(options: StoredWorkspaceStateOptions = {}): Promise<StoredWorkspaceState> {
  const store = await loadSettingsStore();
  const workspace = normalizeWorkspaceStore(await store.get<StoredWorkspaceStoreValue>(workspaceKey));
  const windowLabel = await resolveStoredWorkspaceWindowLabel(options);

  return workspaceStateForWindowLabel(workspace, windowLabel);
}

export async function saveStoredWorkspaceState(
  patch: Partial<StoredWorkspaceState>,
  options: StoredWorkspaceStateOptions = {}
) {
  const store = await loadSettingsStore();
  const current = normalizeWorkspaceStore(await store.get<StoredWorkspaceStoreValue>(workspaceKey));

  if (patch.openWindows !== undefined) {
    current.openWindows = normalizeWorkspaceState({ openWindows: patch.openWindows }).openWindows ?? [];
  }

  if (workspacePatchHasWindowState(patch)) {
    current.openWindows = [];

    const windowLabel = await resolveStoredWorkspaceWindowLabel(options);
    const targetLabel = windowLabel === settingsWorkspaceWindowLabel ? mainWorkspaceWindowLabel : windowLabel;
    const currentWindowState = workspaceStateForWindowLabel(current, targetLabel);
    const nextWindowState = workspaceWindowStateFromWorkspaceState(
      normalizeWorkspaceState({
        ...currentWindowState,
        ...workspaceWindowPatchFromStatePatch(patch),
        openWindows: []
      })
    );

    if (workspaceWindowStateIsEmpty(nextWindowState)) {
      delete current.windowStates[targetLabel];
    } else {
      current.windowStates[targetLabel] = nextWindowState;
    }
  }

  await store.set(workspaceKey, serializedWorkspaceStore(current));
  await store.save();
}

export async function getStoredRecentMarkdownFiles(): Promise<RecentMarkdownFile[]> {
  const store = await loadSettingsStore();
  const files = await store.get<RecentMarkdownFile[]>(recentMarkdownFilesKey);

  return normalizeRecentMarkdownFiles(files);
}

export async function saveStoredRecentMarkdownFile(file: RecentMarkdownFile) {
  const store = await loadSettingsStore();
  const current = normalizeRecentMarkdownFiles(await store.get<RecentMarkdownFile[]>(recentMarkdownFilesKey));
  const files = prependRecentMarkdownFile(current, file);

  await store.set(recentMarkdownFilesKey, files);
  await store.save();

  return files;
}

export async function removeStoredRecentMarkdownFile(path: string) {
  const normalizedPath = path.trim();
  const store = await loadSettingsStore();
  const current = normalizeRecentMarkdownFiles(await store.get<RecentMarkdownFile[]>(recentMarkdownFilesKey));
  const files = normalizedPath
    ? current.filter((file) => file.path !== normalizedPath)
    : current;

  await store.set(recentMarkdownFilesKey, files);
  await store.save();

  return files;
}

export async function clearStoredRecentMarkdownFiles() {
  const store = await loadSettingsStore();

  await store.delete(recentMarkdownFilesKey);
  await store.save();
}

export async function getStoredRecentMarkdownFolders(): Promise<RecentMarkdownFolder[]> {
  const store = await loadSettingsStore();
  const folders = await store.get<RecentMarkdownFolder[]>(recentMarkdownFoldersKey);

  return normalizeRecentMarkdownFolders(folders);
}

export async function saveStoredRecentMarkdownFolder(folder: RecentMarkdownFolder) {
  const store = await loadSettingsStore();
  const current = normalizeRecentMarkdownFolders(await store.get<RecentMarkdownFolder[]>(recentMarkdownFoldersKey));
  const folders = prependRecentMarkdownFolder(current, folder);

  await store.set(recentMarkdownFoldersKey, folders);
  await store.save();

  return folders;
}

export async function removeStoredRecentMarkdownFolder(path: string) {
  const normalizedPath = path.trim();
  const store = await loadSettingsStore();
  const current = normalizeRecentMarkdownFolders(await store.get<RecentMarkdownFolder[]>(recentMarkdownFoldersKey));
  const folders = normalizedPath
    ? current.filter((folder) => folder.path !== normalizedPath)
    : current;

  await store.set(recentMarkdownFoldersKey, folders);
  await store.save();

  return folders;
}

export async function resetWelcomeDocumentState() {
  const store = await loadSettingsStore();

  await store.delete(welcomeDocumentSeenKey);
  await store.save();
}

export type {
  AiModelCapability,
  AiProviderApiStyle,
  AiProviderConfig,
  AiProviderModel,
  AiProviderSettings
} from "@markra/providers";
export type { StoredAiAgentSessionSummary };

export function normalizeAiAgentPreferences(value: unknown): AiAgentPreferences {
  if (typeof value !== "object" || value === null) return defaultAiAgentPreferences;

  const preferences = value as Partial<AiAgentPreferences>;

  return {
    thinkingEnabled:
      typeof preferences.thinkingEnabled === "boolean"
        ? preferences.thinkingEnabled
        : defaultAiAgentPreferences.thinkingEnabled,
    webSearchEnabled:
      typeof preferences.webSearchEnabled === "boolean"
        ? preferences.webSearchEnabled
        : defaultAiAgentPreferences.webSearchEnabled
  };
}

export function normalizeAcpAgentSettings(value: unknown): AcpAgentSettings {
  if (typeof value !== "object" || value === null) return defaultAcpAgentSettings;

  const settings = value as Partial<AcpAgentSettings>;
  const args = typeof settings.args === "string" ? settings.args.trim() : defaultAcpAgentSettings.args;

  return {
    args: normalizeAcpAgentArgs(args),
    command: typeof settings.command === "string" ? settings.command.trim() : defaultAcpAgentSettings.command,
    cwd: typeof settings.cwd === "string" ? settings.cwd.trim() : defaultAcpAgentSettings.cwd,
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : defaultAcpAgentSettings.enabled
  };
}

function normalizeAcpAgentArgs(args: string) {
  if (args === legacyCodexAcpAgentArgs || args === legacyCodexAcpAgentArgsWithPathFallback) {
    return codexAcpAgentArgs;
  }

  return args;
}

function normalizeShowAiQuickInputOnSelection(preferences: Partial<EditorPreferences> & LegacyEditorPreferences) {
  if (typeof preferences.showAiQuickInputOnSelection === "boolean") {
    return preferences.showAiQuickInputOnSelection;
  }

  if (typeof preferences.autoOpenAiOnSelection === "boolean" && !preferences.autoOpenAiOnSelection) {
    return false;
  }

  if (preferences.aiSelectionDisplayMode === "toolbar") return false;

  return defaultEditorPreferences.showAiQuickInputOnSelection;
}

function normalizeShowAiSelectionToolbarOnSelection(preferences: Partial<EditorPreferences> & LegacyEditorPreferences) {
  if (typeof preferences.showAiSelectionToolbarOnSelection === "boolean") {
    return preferences.showAiSelectionToolbarOnSelection;
  }

  if (typeof preferences.autoOpenAiOnSelection === "boolean" && !preferences.autoOpenAiOnSelection) {
    return false;
  }

  if (preferences.aiSelectionDisplayMode === "toolbar") return true;
  if (preferences.aiSelectionDisplayMode === "command") return false;

  return defaultEditorPreferences.showAiSelectionToolbarOnSelection;
}

function normalizeSidebarLayoutMode(value: unknown): SidebarLayoutMode {
  return sidebarLayoutModeOptions.includes(value as SidebarLayoutMode)
    ? (value as SidebarLayoutMode)
    : defaultEditorPreferences.sidebarLayoutMode;
}

function normalizeAutoSaveIntervalMinutes(value: unknown) {
  const clamped = clampNumber(value, autoSaveIntervalMinutesMin, autoSaveIntervalMinutesMax);
  if (clamped === null) return defaultAutoSaveIntervalMinutes;

  return Math.round(clamped);
}

function normalizeTableColumnWidthMode(value: unknown): TableColumnWidthModePreference {
  return tableColumnWidthModeOptions.includes(value as TableColumnWidthModePreference)
    ? (value as TableColumnWidthModePreference)
    : defaultEditorPreferences.tableColumnWidthMode;
}

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  if (typeof value !== "object" || value === null) {
    return {
      ...defaultEditorPreferences,
      editorFontFamily: { ...defaultEditorFontFamily },
      extendedSyntax: { ...defaultExtendedSyntaxPreferences },
      titlebarActions: [...defaultTitlebarActions]
    };
  }

  const preferences = value as Partial<EditorPreferences> & LegacyEditorPreferences;

  return {
    aiQuickActionPrompts: normalizeAiQuickActionPrompts(preferences.aiQuickActionPrompts),
    aiWorkspaceAnimationEnabled:
      typeof preferences.aiWorkspaceAnimationEnabled === "boolean"
        ? preferences.aiWorkspaceAnimationEnabled
        : defaultEditorPreferences.aiWorkspaceAnimationEnabled,
    autoRevealActiveFile:
      typeof preferences.autoRevealActiveFile === "boolean"
        ? preferences.autoRevealActiveFile
        : defaultEditorPreferences.autoRevealActiveFile,
    autoSaveEnabled:
      typeof preferences.autoSaveEnabled === "boolean"
        ? preferences.autoSaveEnabled
        : defaultEditorPreferences.autoSaveEnabled,
    autoSaveIntervalMinutes: normalizeAutoSaveIntervalMinutes(preferences.autoSaveIntervalMinutes),
    autoUpdateEnabled:
      typeof preferences.autoUpdateEnabled === "boolean"
        ? preferences.autoUpdateEnabled
        : defaultEditorPreferences.autoUpdateEnabled,
    bodyFontSize: editorBodyFontSizeOptions.includes(preferences.bodyFontSize as typeof editorBodyFontSizeOptions[number])
      ? Number(preferences.bodyFontSize)
      : defaultEditorPreferences.bodyFontSize,
    clipboardImageFolder: normalizeClipboardImageFolder(preferences.clipboardImageFolder),
    closeAiCommandOnAgentPanelOpen:
      typeof preferences.closeAiCommandOnAgentPanelOpen === "boolean"
        ? preferences.closeAiCommandOnAgentPanelOpen
        : defaultEditorPreferences.closeAiCommandOnAgentPanelOpen,
    contentWidth: editorContentWidthOptions.includes(preferences.contentWidth as EditorContentWidth)
      ? (preferences.contentWidth as EditorContentWidth)
      : defaultEditorPreferences.contentWidth,
    contentWidthPx: normalizeEditorContentWidthPx(preferences.contentWidthPx),
    copyExternalFilesToStorage:
      typeof preferences.copyExternalFilesToStorage === "boolean"
        ? preferences.copyExternalFilesToStorage
        : defaultEditorPreferences.copyExternalFilesToStorage,
    documentLinksOpen:
      typeof preferences.documentLinksOpen === "boolean"
        ? preferences.documentLinksOpen
        : defaultEditorPreferences.documentLinksOpen,
    documentLinksVisible:
      typeof preferences.documentLinksVisible === "boolean"
        ? preferences.documentLinksVisible
        : defaultEditorPreferences.documentLinksVisible,
    editorFontFamily: normalizeEditorFontFamilyPreference(preferences.editorFontFamily),
    extendedSyntax: normalizeExtendedSyntaxPreferences(preferences.extendedSyntax),
    imageUpload: normalizeImageUploadSettings(preferences.imageUpload),
    lineHeight: editorLineHeightOptions.includes(preferences.lineHeight as typeof editorLineHeightOptions[number])
      ? Number(preferences.lineHeight)
      : defaultEditorPreferences.lineHeight,
    markdownShortcuts: normalizeMarkdownShortcuts(preferences.markdownShortcuts),
    markdownTemplates: normalizeMarkdownTemplateEntries(preferences.markdownTemplates),
    restoreWorkspaceOnStartup:
      typeof preferences.restoreWorkspaceOnStartup === "boolean"
        ? preferences.restoreWorkspaceOnStartup
        : defaultEditorPreferences.restoreWorkspaceOnStartup,
    sidebarLayoutMode: normalizeSidebarLayoutMode(preferences.sidebarLayoutMode),
    showAiQuickInputOnSelection: normalizeShowAiQuickInputOnSelection(preferences),
    showAiSelectionToolbarOnSelection: normalizeShowAiSelectionToolbarOnSelection(preferences),
    suggestAiPanelForComplexInlinePrompts:
      typeof preferences.suggestAiPanelForComplexInlinePrompts === "boolean"
        ? preferences.suggestAiPanelForComplexInlinePrompts
        : defaultEditorPreferences.suggestAiPanelForComplexInlinePrompts,
    showDocumentTabs:
      typeof preferences.showDocumentTabs === "boolean"
        ? preferences.showDocumentTabs
        : defaultEditorPreferences.showDocumentTabs,
    splitVisualPanePercent: normalizeSplitVisualPanePercent(preferences.splitVisualPanePercent),
    spellcheckEnabled:
      typeof preferences.spellcheckEnabled === "boolean"
        ? preferences.spellcheckEnabled
        : defaultEditorPreferences.spellcheckEnabled,
    spellcheckLanguage: isSpellcheckLanguage(preferences.spellcheckLanguage)
      ? preferences.spellcheckLanguage
      : defaultEditorPreferences.spellcheckLanguage,
    spellcheckIgnoredWords: normalizeSpellcheckIgnoredWords(preferences.spellcheckIgnoredWords),
    tableColumnWidthMode: normalizeTableColumnWidthMode(preferences.tableColumnWidthMode),
    titlebarActions: normalizeTitlebarActions(preferences.titlebarActions),
    showWordCount:
      typeof preferences.showWordCount === "boolean" ? preferences.showWordCount : defaultEditorPreferences.showWordCount,
    wrapCodeBlocks:
      typeof preferences.wrapCodeBlocks === "boolean" ? preferences.wrapCodeBlocks : defaultEditorPreferences.wrapCodeBlocks
  };
}

export function normalizeSpellcheckIgnoredWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ignoredWords: string[] = [];
  const seenWords = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const word = item.trim().toLocaleLowerCase();
    if (!word || seenWords.has(word)) continue;

    seenWords.add(word);
    ignoredWords.push(word);
  }

  return ignoredWords;
}

function normalizeExtendedSyntaxPreferences(value: unknown): ExtendedSyntaxPreferences {
  if (typeof value !== "object" || value === null) {
    return { ...defaultExtendedSyntaxPreferences };
  }

  const preferences = value as Partial<ExtendedSyntaxPreferences>;

  return {
    githubAlerts:
      typeof preferences.githubAlerts === "boolean"
        ? preferences.githubAlerts
        : defaultExtendedSyntaxPreferences.githubAlerts,
    highlight:
      typeof preferences.highlight === "boolean"
        ? preferences.highlight
        : defaultExtendedSyntaxPreferences.highlight
  };
}

export function normalizeSplitVisualPanePercent(value: unknown) {
  const percent = clampNumber(value, splitVisualPanePercentMin, splitVisualPanePercentMax);
  if (percent === null) return defaultSplitVisualPanePercent;

  return Math.round(percent);
}

export function normalizeTitlebarActions(value: unknown): TitlebarActionPreference[] {
  if (!Array.isArray(value)) return [...defaultTitlebarActions];

  const knownIds = new Set<TitlebarActionId>(defaultTitlebarActions.map((action) => action.id));
  const usedIds = new Set<TitlebarActionId>();
  const normalized: TitlebarActionPreference[] = [];

  value.forEach((item) => {
    const candidate = typeof item === "object" && item !== null ? item as Partial<TitlebarActionPreference> : null;
    const id = candidate?.id;
    if (!id || !knownIds.has(id) || usedIds.has(id)) return;

    usedIds.add(id);
    normalized.push({
      id,
      visible: typeof candidate.visible === "boolean" ? candidate.visible : true
    });
  });

  defaultTitlebarActions.forEach((action) => {
    if (usedIds.has(action.id)) return;

    normalized.push({ ...action });
  });

  return normalized;
}

export function reorderTitlebarActions(
  actions: readonly TitlebarActionPreference[],
  draggedId: TitlebarActionId,
  targetId: TitlebarActionId
): TitlebarActionPreference[] {
  const normalized = normalizeTitlebarActions(actions);
  if (draggedId === targetId) return normalized;

  const fromIndex = normalized.findIndex((action) => action.id === draggedId);
  const toIndex = normalized.findIndex((action) => action.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return normalized;

  const draggedAction = normalized[fromIndex];
  const nextActions = normalized.filter((action) => action.id !== draggedId);

  nextActions.splice(toIndex, 0, draggedAction);

  return nextActions;
}

export function normalizeImageUploadSettings(value: unknown): ImageUploadSettings {
  if (typeof value !== "object" || value === null) return defaultImageUploadSettings;

  const settings = value as Partial<ImageUploadSettings>;
  const provider = settings.provider === "webdav" || settings.provider === "s3" || settings.provider === "picgo"
    ? settings.provider
    : "local";

  return {
    fileNamePattern: normalizeImageUploadFileNamePattern(settings.fileNamePattern),
    picgo: normalizePicGoImageUploadSettings(settings.picgo),
    provider,
    s3: normalizeS3ImageUploadSettings(settings.s3),
    webdav: normalizeWebDavImageUploadSettings(settings.webdav)
  };
}

export function normalizeImageUploadFileNamePattern(value: unknown) {
  if (typeof value !== "string") return defaultImageUploadSettings.fileNamePattern;

  const pattern = value.trim();
  if (!pattern || pattern.includes("/") || pattern.includes("\\") || pattern === "." || pattern === "..") {
    return defaultImageUploadSettings.fileNamePattern;
  }

  return pattern.slice(0, 120);
}

export function normalizeS3ImageUploadSettings(value: unknown): S3ImageUploadSettings {
  if (typeof value !== "object" || value === null) return defaultImageUploadSettings.s3;

  const settings = value as Partial<S3ImageUploadSettings>;

  return {
    accessKeyId: typeof settings.accessKeyId === "string" ? settings.accessKeyId.trim() : "",
    bucket: normalizeS3Bucket(settings.bucket),
    endpointUrl: normalizeImageUploadUrl(settings.endpointUrl),
    publicBaseUrl: normalizeImageUploadUrl(settings.publicBaseUrl),
    region: typeof settings.region === "string" ? settings.region.trim() : "",
    secretAccessKey: typeof settings.secretAccessKey === "string" ? settings.secretAccessKey : "",
    uploadPath: normalizeRemoteImageUploadPath(settings.uploadPath)
  };
}

export function normalizePicGoImageUploadSettings(value: unknown): PicGoImageUploadSettings {
  if (typeof value !== "object" || value === null) return defaultImageUploadSettings.picgo;

  const settings = value as Partial<PicGoImageUploadSettings>;

  return {
    secret: typeof settings.secret === "string" ? settings.secret.trim() : "",
    serverUrl: normalizeImageUploadUrl(settings.serverUrl)
  };
}

export function normalizeWebDavImageUploadSettings(value: unknown): WebDavImageUploadSettings {
  if (typeof value !== "object" || value === null) return defaultImageUploadSettings.webdav;

  const settings = value as Partial<WebDavImageUploadSettings>;

  return {
    password: typeof settings.password === "string" ? settings.password : "",
    publicBaseUrl: normalizeImageUploadUrl(settings.publicBaseUrl),
    serverUrl: normalizeImageUploadUrl(settings.serverUrl),
    uploadPath: normalizeRemoteImageUploadPath(settings.uploadPath),
    username: typeof settings.username === "string" ? settings.username.trim() : ""
  };
}

export function normalizeClipboardImageFolder(value: unknown) {
  if (typeof value !== "string") return defaultEditorPreferences.clipboardImageFolder;

  const normalized = value.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/");
  if (normalized === ".") return ".";
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/u.test(normalized)) {
    return defaultEditorPreferences.clipboardImageFolder;
  }

  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

  if (!parts.length || parts.some((part) => part === "..")) {
    return defaultEditorPreferences.clipboardImageFolder;
  }

  return parts.join("/");
}

function normalizeImageUploadUrl(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";

    url.hash = "";
    url.search = "";

    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

export function normalizeRemoteImageUploadPath(value: unknown) {
  if (typeof value !== "string") return "";

  const normalized = value.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/");
  if (!normalized || normalized === ".") return "";
  if (normalized.startsWith("/") || /^[a-zA-Z]:/u.test(normalized)) return "";

  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

  if (parts.some((part) => part === "..")) return "";

  return parts.join("/");
}

function normalizeS3Bucket(value: unknown) {
  if (typeof value !== "string") return "";

  const bucket = value.trim();
  if (!bucket || bucket.includes("/") || bucket.includes("\\") || bucket === "." || bucket === "..") return "";

  return bucket;
}

function aiAgentSessionStorePath(sessionId: string | null) {
  return `ai-agent-sessions/${sessionId ?? "default"}.json`;
}
