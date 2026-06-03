import {
  createAiAgentSessionTitle,
  createDefaultAiAgentSessionState,
  normalizeAiAgentSessionTitle,
  normalizeAiAgentWorkspaceKey,
  normalizeStoredAiAgentSessionState,
  normalizeStoredAiAgentSessionSummaries,
  normalizeStoredAiAgentSessionSummary,
  type StoredAiAgentSessionSummary,
  type StoredAiAgentSessionState,
  type WebSearchProviderId,
  type WebSearchSettings
} from "@markra/ai";
import { defaultMarkdownShortcuts, normalizeMarkdownShortcuts, type MarkdownShortcutBindings } from "@markra/editor";
import { createDefaultAiSettings, normalizeAiSettings, type AiProviderSettings } from "@markra/providers";
import { clampNumber, isAppLanguage, normalizeNullableString, pathNameFromPath, type AppLanguage } from "@markra/shared";
import {
  editorContentWidthOptions,
  normalizeEditorContentWidthPx,
  type EditorContentWidth
} from "../editor-width";
import { normalizeMarkdownTemplateEntries, type MarkdownTemplateEntry } from "../templates";
import {
  defaultAiQuickActionPrompts,
  normalizeAiQuickActionPrompts,
  type AiQuickActionPrompts
} from "../ai-actions";
import { getAppRuntime } from "../../runtime";

const settingsStorePath = "settings.json";
const aiAgentSessionIndexStorePath = "ai-agent-sessions/index.json";
const aiAgentSessionStateKey = "session";
const aiAgentSessionMetaKey = "meta";
const aiAgentSessionIndexKey = "entries";
const welcomeDocumentSeenKey = "welcomeDocumentSeen";
const themeKey = "theme";
const customThemeCssKey = "customThemeCss";
const languageKey = "language";
const aiProvidersKey = "aiProviders";
const aiAgentPreferencesKey = "aiAgentPreferences";
const editorPreferencesKey = "editorPreferences";
const exportSettingsKey = "exportSettings";
const webSearchKey = "webSearch";
const workspaceKey = "workspace";
const recentMarkdownFoldersKey = "recentMarkdownFolders";

export type ResolvedAppTheme = "light" | "dark";
export type AiSelectionDisplayMode = "command" | "toolbar";
type LegacyEditorPreferences = {
  aiSelectionDisplayMode?: AiSelectionDisplayMode;
  autoOpenAiOnSelection?: boolean;
};
export const editorThemeOptions = [
  "light",
  "dark",
  "github",
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
export type PdfMarginPreset = "custom" | "default" | "narrow" | "none" | "normal" | "wide";
export type PdfPageSize = "a4" | "custom" | "default" | "letter";
export type TitlebarActionId = "aiAgent" | "sourceMode" | "splitMode" | "save" | "theme";
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
export type ExtendedSyntaxPreferences = {
  githubAlerts: boolean;
  highlight: boolean;
};
export type EditorPreferences = {
  aiQuickActionPrompts: AiQuickActionPrompts;
  autoUpdateEnabled: boolean;
  bodyFontSize: number;
  clipboardImageFolder: string;
  closeAiCommandOnAgentPanelOpen: boolean;
  contentWidth: EditorContentWidth;
  contentWidthPx: number | null;
  extendedSyntax: ExtendedSyntaxPreferences;
  imageUpload: ImageUploadSettings;
  lineHeight: number;
  markdownShortcuts: MarkdownShortcutBindings;
  markdownTemplates: MarkdownTemplateEntry[];
  restoreWorkspaceOnStartup: boolean;
  showAiQuickInputOnSelection: boolean;
  showAiSelectionToolbarOnSelection: boolean;
  suggestAiPanelForComplexInlinePrompts: boolean;
  showDocumentTabs: boolean;
  splitVisualPanePercent: number;
  titlebarActions: TitlebarActionPreference[];
  showWordCount: boolean;
};
export type ExportSettings = {
  pandocArgs: string;
  pandocPath: string;
  pdfAuthor: string;
  pdfFooter: string;
  pdfHeader: string;
  pdfHeightMm: number;
  pdfMarginMm: number;
  pdfMarginPreset: PdfMarginPreset;
  pdfPageBreakOnH1: boolean;
  pdfPageSize: PdfPageSize;
  pdfWidthMm: number;
};
export type StoredWorkspaceState = {
  activeDraftId?: string | null;
  aiAgentSessionId: string | null;
  draftTabs?: StoredWorkspaceDraftTab[];
  filePath: string | null;
  fileTreeOpen: boolean;
  folderName: string | null;
  folderPath: string | null;
  openFilePaths: string[];
  openWindows?: StoredWorkspaceWindow[];
  sideBySideGroup?: StoredWorkspaceSideBySideGroup | null;
};
export type StoredWorkspaceDraftTab = {
  content: string;
  id: string;
  name: string;
  path: string | null;
};
export type StoredWorkspaceWindow = {
  filePath: string | null;
  label: string;
  openFilePaths: string[];
};
export type StoredWorkspaceSideBySideGroup = {
  primaryFilePath: string;
  sideFilePath: string;
};
export type RecentMarkdownFolder = {
  name: string;
  path: string;
};
export type { AppLanguage };
export type { EditorContentWidth };
export type { WebSearchProviderId, WebSearchSettings };

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

export const defaultTitlebarActions: readonly TitlebarActionPreference[] = [
  { id: "aiAgent", visible: true },
  { id: "sourceMode", visible: true },
  { id: "splitMode", visible: true },
  { id: "save", visible: true },
  { id: "theme", visible: true }
];
export const splitVisualPanePercentMin = 25;
export const splitVisualPanePercentMax = 75;
export const defaultSplitVisualPanePercent = 50;

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
  autoUpdateEnabled: true,
  bodyFontSize: 16,
  clipboardImageFolder: "assets",
  closeAiCommandOnAgentPanelOpen: false,
  contentWidth: "default",
  contentWidthPx: null,
  extendedSyntax: { ...defaultExtendedSyntaxPreferences },
  imageUpload: defaultImageUploadSettings,
  lineHeight: 1.65,
  markdownShortcuts: defaultMarkdownShortcuts,
  markdownTemplates: [],
  restoreWorkspaceOnStartup: true,
  showAiQuickInputOnSelection: true,
  showAiSelectionToolbarOnSelection: false,
  suggestAiPanelForComplexInlinePrompts: false,
  showDocumentTabs: true,
  splitVisualPanePercent: defaultSplitVisualPanePercent,
  titlebarActions: [...defaultTitlebarActions],
  showWordCount: true
};

export const defaultExportSettings: ExportSettings = {
  pandocArgs: "",
  pandocPath: "",
  pdfAuthor: "",
  pdfFooter: "",
  pdfHeader: "",
  pdfHeightMm: 297,
  pdfMarginMm: 18,
  pdfMarginPreset: "default",
  pdfPageBreakOnH1: false,
  pdfPageSize: "default",
  pdfWidthMm: 210
};

export const defaultAiAgentPreferences: AiAgentPreferences = {
  thinkingEnabled: false,
  webSearchEnabled: false
};

export const defaultWebSearchSettings: WebSearchSettings = {
  contentMaxChars: 12_000,
  enabled: true,
  maxResults: 5,
  providerId: "local-bing",
  searxngApiHost: ""
};
export const recentMarkdownFoldersMaxLength = 5;

const editorBodyFontSizeOptions = [14, 15, 16, 17, 18, 20] as const;
const editorLineHeightOptions = [1.5, 1.65, 1.8] as const;
const exportPageSizeOptions: PdfPageSize[] = ["default", "a4", "letter", "custom"];
const exportMarginPresetOptions: PdfMarginPreset[] = ["default", "none", "narrow", "normal", "wide", "custom"];
const exportPageSizeDimensions: Record<Exclude<PdfPageSize, "custom">, { heightMm: number; widthMm: number }> = {
  a4: { heightMm: 297, widthMm: 210 },
  default: { heightMm: 297, widthMm: 210 },
  letter: { heightMm: 279, widthMm: 216 }
};
const exportMarginPresetMm: Record<Exclude<PdfMarginPreset, "custom">, number> = {
  default: 18,
  narrow: 10,
  none: 0,
  normal: 18,
  wide: 25
};

export const defaultWorkspaceState: StoredWorkspaceState = {
  aiAgentSessionId: null,
  filePath: null,
  fileTreeOpen: false,
  folderName: null,
  folderPath: null,
  openFilePaths: [],
  openWindows: []
};

function loadSettingsStore() {
  return getAppRuntime().settings.loadStore(settingsStorePath, { autoSave: false, defaults: {} });
}

function loadAiAgentSessionStore(sessionId: string | null) {
  return getAppRuntime().settings.loadStore(aiAgentSessionStorePath(sessionId), { autoSave: false, defaults: {} });
}

function loadAiAgentSessionIndexStore() {
  return getAppRuntime().settings.loadStore(aiAgentSessionIndexStorePath, { autoSave: false, defaults: {} });
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

export function normalizeCustomThemeCss(value: unknown) {
  if (typeof value !== "string") return defaultCustomThemeCss;

  return value.slice(0, customThemeCssMaxLength);
}

export function resolveAppAppearanceTheme(theme: AppTheme, systemTheme: ResolvedAppTheme): ResolvedAppTheme {
  if (theme === "system") return systemTheme;
  if (
    theme === "dark" ||
    theme === "night" ||
    theme === "solarized-dark" ||
    theme === "nord" ||
    theme === "catppuccin-mocha"
  ) return "dark";

  return "light";
}

export function resolveAppEditorTheme(theme: AppTheme, systemTheme: ResolvedAppTheme): EditorTheme {
  if (theme === "system") return systemTheme;

  return theme;
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

export async function getStoredCustomThemeCss() {
  const store = await loadSettingsStore();
  const css = await store.get<string>(customThemeCssKey);

  return normalizeCustomThemeCss(css);
}

export async function saveStoredCustomThemeCss(css: string) {
  const store = await loadSettingsStore();

  await store.set(customThemeCssKey, normalizeCustomThemeCss(css));
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

export async function getStoredWorkspaceState(): Promise<StoredWorkspaceState> {
  const store = await loadSettingsStore();
  const workspace = await store.get<StoredWorkspaceState>(workspaceKey);

  return normalizeWorkspaceState(workspace);
}

export async function saveStoredWorkspaceState(patch: Partial<StoredWorkspaceState>) {
  const store = await loadSettingsStore();
  const current = normalizeWorkspaceState(await store.get<StoredWorkspaceState>(workspaceKey));
  const workspace = normalizeWorkspaceState({ ...current, ...patch });

  await store.set(workspaceKey, workspace);
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

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  if (typeof value !== "object" || value === null) {
    return {
      ...defaultEditorPreferences,
      extendedSyntax: { ...defaultExtendedSyntaxPreferences },
      titlebarActions: [...defaultTitlebarActions]
    };
  }

  const preferences = value as Partial<EditorPreferences> & LegacyEditorPreferences;

  return {
    aiQuickActionPrompts: normalizeAiQuickActionPrompts(preferences.aiQuickActionPrompts),
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
    titlebarActions: normalizeTitlebarActions(preferences.titlebarActions),
    showWordCount:
      typeof preferences.showWordCount === "boolean" ? preferences.showWordCount : defaultEditorPreferences.showWordCount
  };
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

export function normalizeRecentMarkdownFolders(value: unknown): RecentMarkdownFolder[] {
  if (!Array.isArray(value)) return [];

  const seenPaths = new Set<string>();
  const folders: RecentMarkdownFolder[] = [];

  value.forEach((item) => {
    if (folders.length >= recentMarkdownFoldersMaxLength) return;
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<RecentMarkdownFolder>;
    const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
    if (!path || seenPaths.has(path)) return;

    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    seenPaths.add(path);
    folders.push({
      name: name || pathNameFromPath(path),
      path
    });
  });

  return folders;
}

export function prependRecentMarkdownFolder(
  folders: readonly RecentMarkdownFolder[],
  folder: RecentMarkdownFolder
) {
  return normalizeRecentMarkdownFolders([folder, ...folders]);
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

export function normalizeExportSettings(value: unknown): ExportSettings {
  if (typeof value !== "object" || value === null) return defaultExportSettings;

  const settings = value as Partial<ExportSettings>;
  const pdfPageSize = exportPageSizeOptions.includes(settings.pdfPageSize as PdfPageSize)
    ? (settings.pdfPageSize as PdfPageSize)
    : defaultExportSettings.pdfPageSize;
  const pdfMarginMm = normalizeExportMarginMm(settings.pdfMarginMm);
  const pdfMarginPreset = normalizeExportMarginPreset(settings.pdfMarginPreset, pdfMarginMm);
  const dimensions = pdfPageSize === "custom"
    ? {
        heightMm: normalizeExportPageDimension(settings.pdfHeightMm, defaultExportSettings.pdfHeightMm),
        widthMm: normalizeExportPageDimension(settings.pdfWidthMm, defaultExportSettings.pdfWidthMm)
      }
    : exportPageSizeDimensions[pdfPageSize];

  return {
    pandocArgs: normalizeExportText(settings.pandocArgs, 1000),
    pandocPath: normalizeExportText(settings.pandocPath, 500),
    pdfAuthor: normalizeExportText(settings.pdfAuthor),
    pdfFooter: normalizeExportText(settings.pdfFooter),
    pdfHeader: normalizeExportText(settings.pdfHeader),
    pdfHeightMm: dimensions.heightMm,
    pdfMarginMm: pdfMarginPreset === "custom" ? pdfMarginMm : exportMarginPresetMm[pdfMarginPreset],
    pdfMarginPreset,
    pdfPageBreakOnH1: typeof settings.pdfPageBreakOnH1 === "boolean" ? settings.pdfPageBreakOnH1 : false,
    pdfPageSize,
    pdfWidthMm: dimensions.widthMm
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

function normalizeExportMarginMm(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultExportSettings.pdfMarginMm;

  return Math.min(Math.max(Math.round(value), 0), 60);
}

function normalizeExportMarginPreset(value: unknown, marginMm: number): PdfMarginPreset {
  if (exportMarginPresetOptions.includes(value as PdfMarginPreset)) {
    return value as PdfMarginPreset;
  }

  return marginMm === defaultExportSettings.pdfMarginMm ? "default" : "custom";
}

function normalizeExportPageDimension(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(Math.round(value), 50), 2000);
}

function normalizeExportText(value: unknown, maxLength = 200) {
  if (typeof value !== "string") return "";

  return value.trim().slice(0, maxLength);
}

export function normalizeWebSearchSettings(value: unknown): WebSearchSettings {
  if (typeof value !== "object" || value === null) return defaultWebSearchSettings;

  const settings = value as Partial<WebSearchSettings>;

  return {
    contentMaxChars: normalizeWebSearchInteger(settings.contentMaxChars, {
      defaultValue: defaultWebSearchSettings.contentMaxChars,
      max: 40_000,
      min: 2_000
    }),
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : defaultWebSearchSettings.enabled,
    maxResults: normalizeWebSearchInteger(settings.maxResults, {
      defaultValue: defaultWebSearchSettings.maxResults,
      max: 20,
      min: 1
    }),
    providerId: settings.providerId === "searxng" ? "searxng" : defaultWebSearchSettings.providerId,
    searxngApiHost: normalizeWebSearchApiHost(settings.searxngApiHost)
  };
}

function normalizeWebSearchInteger(
  value: unknown,
  limits: {
    defaultValue: number;
    max: number;
    min: number;
  }
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.defaultValue;

  return Math.min(Math.max(Math.round(value), limits.min), limits.max);
}

function normalizeWebSearchApiHost(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim().replace(/\/+$/u, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";

    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}

export function normalizeWorkspaceState(value: unknown): StoredWorkspaceState {
  if (typeof value !== "object" || value === null) return defaultWorkspaceState;

  const workspace = value as Partial<StoredWorkspaceState>;
  const openFilePaths = normalizeWorkspaceOpenFilePaths(workspace.openFilePaths);
  const openFilePathSet = new Set(openFilePaths);
  const draftTabs = normalizeWorkspaceDraftTabs(workspace.draftTabs);
  const activeDraftId = normalizeNullableString(workspace.activeDraftId);
  const persistedActiveDraftId = activeDraftId && draftTabs.some((draft) => draft.id === activeDraftId)
    ? activeDraftId
    : null;
  const sideBySideGroup = normalizeWorkspaceSideBySideGroup(workspace.sideBySideGroup);
  const persistedSideBySideGroup =
    sideBySideGroup &&
    openFilePathSet.has(sideBySideGroup.primaryFilePath) &&
    openFilePathSet.has(sideBySideGroup.sideFilePath)
      ? sideBySideGroup
      : null;

  return {
    ...(draftTabs.length > 0 ? { activeDraftId: persistedActiveDraftId, draftTabs } : {}),
    aiAgentSessionId: normalizeNullableString(workspace.aiAgentSessionId),
    filePath: normalizeNullableString(workspace.filePath),
    fileTreeOpen: typeof workspace.fileTreeOpen === "boolean" ? workspace.fileTreeOpen : false,
    folderName: normalizeNullableString(workspace.folderName),
    folderPath: normalizeNullableString(workspace.folderPath),
    openFilePaths,
    openWindows: normalizeWorkspaceWindows(workspace.openWindows),
    ...(persistedSideBySideGroup ? { sideBySideGroup: persistedSideBySideGroup } : {})
  };
}

function normalizeWorkspaceDraftTabs(value: unknown): StoredWorkspaceDraftTab[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const draftTabs: StoredWorkspaceDraftTab[] = [];
  const normalizeDraftString = (item: unknown) => {
    if (typeof item !== "string") return null;

    const trimmed = item.trim();
    return trimmed ? trimmed : null;
  };

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<StoredWorkspaceDraftTab>;
    const id = normalizeDraftString(candidate.id);
    if (!id || seenIds.has(id) || typeof candidate.content !== "string") return;

    const path = normalizeDraftString(candidate.path);
    if (!path && candidate.content.trim().length === 0) return;

    const name = normalizeDraftString(candidate.name) ?? (path ? pathNameFromPath(path) : "Untitled.md");
    seenIds.add(id);
    draftTabs.push({
      content: candidate.content,
      id,
      name,
      path
    });
  });

  return draftTabs;
}

function normalizeWorkspaceOpenFilePaths(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seenPaths = new Set<string>();
  const paths: string[] = [];

  value.forEach((item) => {
    const path = normalizeNullableString(item);
    if (!path || seenPaths.has(path)) return;

    seenPaths.add(path);
    paths.push(path);
  });

  return paths;
}

function normalizeWorkspaceWindows(value: unknown): StoredWorkspaceWindow[] {
  if (!Array.isArray(value)) return [];

  const seenLabels = new Set<string>();
  const windows: StoredWorkspaceWindow[] = [];

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<StoredWorkspaceWindow>;
    const label = normalizeNullableString(candidate.label);
    if (!label || seenLabels.has(label)) return;

    const filePath = normalizeNullableString(candidate.filePath);
    const openFilePaths = normalizeWorkspaceOpenFilePaths(candidate.openFilePaths);
    if (filePath && !openFilePaths.includes(filePath)) openFilePaths.push(filePath);
    if (!filePath && openFilePaths.length === 0) return;

    seenLabels.add(label);
    windows.push({
      filePath,
      label,
      openFilePaths
    });
  });

  return windows;
}

function normalizeWorkspaceSideBySideGroup(value: unknown): StoredWorkspaceSideBySideGroup | null {
  if (typeof value !== "object" || value === null) return null;

  const group = value as Partial<StoredWorkspaceSideBySideGroup>;
  const primaryFilePath = normalizeNullableString(group.primaryFilePath);
  const sideFilePath = normalizeNullableString(group.sideFilePath);
  if (!primaryFilePath || !sideFilePath || primaryFilePath === sideFilePath) return null;

  return {
    primaryFilePath,
    sideFilePath
  };
}

function aiAgentSessionStorePath(sessionId: string | null) {
  return `ai-agent-sessions/${sessionId ?? "default"}.json`;
}
