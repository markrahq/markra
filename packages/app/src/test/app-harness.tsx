import { fireEvent, render } from "@testing-library/react";
import { AI_EDITOR_PREVIEW_ACTION_EVENT, defaultMarkdownShortcuts, type AiEditorPreviewActionDetail } from "@markra/editor";
import App from "../App";
import {
  confirmNativeMarkdownFileDelete,
  confirmNativeUnsavedMarkdownDocumentDiscard,
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTreeFile,
  detectNativePandocPath,
  downloadNativeWebImage,
  getNativeShellCommandStatus,
  installNativeShellCommand,
  closeNativeWindow,
  exitNativeApp,
  openNativeContainingFolder,
  openNativeLocalImages,
  openNativeMarkdownFolder,
  openNativeMarkdownFolderInNewWindow,
  openNativeMarkdownFileInNewWindow,
  openNativeMarkdownPath,
  listenNativeAppExitRequested,
  listenNativeWindowCloseRequested,
  listenNativeOpenedMarkdownPaths,
  listNativeMarkdownFileHistory,
  readNativeLocalImageFile,
  readNativeMarkdownImageFile,
  readNativeMarkdownFile,
  readNativeMarkdownFileHistory,
  readNativeMarkdownTemplateFile,
  resolveNativeMarkdownPath,
  saveNativeClipboardImage,
  saveNativeHtmlFile,
  saveNativeMarkdownFile,
  saveNativePandocFile,
  saveNativePdfFile,
  searchNativeMarkdownFilesForPath,
  setNativeEditorWindowRestoreState,
  showNativeWindow,
  showNativeAppAbout,
  showNativePandocSetup,
  showNativeMarkdownFileTreeContextMenu,
  syncNativeMarkdownFolder,
  uninstallNativeShellCommand,
  installNativeMarkdownFileDrop,
  listNativeMarkdownFilesForPath,
  takeNativeOpenedMarkdownPaths,
  toggleNativeWindowFullscreen,
  toggleNativeWindowMaximized,
  renameNativeMarkdownTreeFile,
  watchNativeMarkdownFile,
  writeNativeMarkdownTemplateFile,
  watchNativeMarkdownTree
} from "../lib/tauri";
import {
  installNativeApplicationMenu,
  installNativeEditorContextMenu
} from "../lib/tauri";
import { openNativeExternalUrl, openSettingsWindow } from "../lib/tauri";
import { checkNativeAppUpdate } from "../lib/tauri/updater";
import {
  createAiAgentSessionId,
  clearStoredRecentMarkdownFiles,
  consumeWelcomeDocumentState,
  deleteStoredAiAgentSession,
  getStoredBackupSettings,
  getStoredSyncSettings,
  getStoredAiAgentPreferences,
  getStoredAiAgentSession,
  getStoredAiAgentSessionSummary,
  getStoredAiSettings,
  getStoredCustomThemeCss,
  getStoredEditorPreferences,
  getStoredExportSettings,
  getStoredLanguage,
  getStoredNetworkSettings,
  getStoredRecentMarkdownFiles,
  getStoredRecentMarkdownFolders,
  getStoredTheme,
  getStoredThemePreferences,
  getStoredWebSearchSettings,
  getStoredWorkspaceState,
  initializeStoredAiAgentSession,
  listStoredAiAgentSessions,
  removeStoredRecentMarkdownFolder,
  removeStoredRecentMarkdownFile,
  resetWelcomeDocumentState,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle,
  saveStoredAiSettings,
  saveStoredBackupSettings,
  saveStoredSyncSettings,
  saveStoredCustomThemeCss,
  saveStoredEditorPreferences,
  saveStoredExportSettings,
  saveStoredLanguage,
  saveStoredNetworkSettings,
  saveStoredRecentMarkdownFile,
  saveStoredRecentMarkdownFolder,
  saveStoredTheme,
  saveStoredThemePreferences,
  saveStoredWorkspaceState,
  setStoredAiAgentSessionArchived,
  normalizeBackupSettings,
  normalizeNetworkSettings,
  normalizeSyncSettings,
  type RecentMarkdownFile,
  type RecentMarkdownFolder
} from "../lib/settings/app-settings";
import {
  listenAppAiSettingsChanged,
  listenAppBackupSettingsChanged,
  listenAppSyncSettingsChanged,
  listenAppCustomThemeCssChanged,
  listenAppEditorPreferencesChanged,
  listenAppExportSettingsChanged,
  listenAppLanguageChanged,
  listenAppThemeChanged,
  listenAppWebSearchSettingsChanged,
  notifyAppAiSettingsChanged,
  notifyAppBackupSettingsChanged,
  notifyAppSyncSettingsChanged,
  notifyAppCustomThemeCssChanged,
  notifyAppEditorPreferencesChanged,
  notifyAppExportSettingsChanged,
  notifyAppLanguageChanged,
  notifyAppThemeChanged,
  notifyAppWebSearchSettingsChanged
} from "../lib/settings/settings-events";
import { fetchAiProviderModels, testAiProviderConnection } from "@markra/providers";
import { chatCompletion, generateAiAgentSessionTitle } from "@markra/ai";
import { resolveDesktopOsVersion, resolveDesktopPlatform } from "../lib/platform";

const testAiQuickActionPrompts = vi.hoisted(() => ({
  continue: "",
  polish: "",
  rewrite: "",
  summarize: "",
  translate: ""
}));

vi.mock("../lib/tauri", () => ({
  confirmNativeMarkdownFileDelete: vi.fn(),
  confirmNativeUnsavedMarkdownDocumentDiscard: vi.fn(),
  createNativeMarkdownTreeFile: vi.fn(),
  createNativeMarkdownTreeFolder: vi.fn(),
  deleteNativeMarkdownTreeFile: vi.fn(),
  detectNativePandocPath: vi.fn(),
  downloadNativeWebImage: vi.fn(),
  getNativeShellCommandStatus: vi.fn(),
  installNativeShellCommand: vi.fn(),
  installNativeMarkdownFileDrop: vi.fn(),
  openNativeContainingFolder: vi.fn(),
  openNativeLocalImages: vi.fn(),
  openNativeMarkdownFolder: vi.fn(),
  openNativeMarkdownFolderInNewWindow: vi.fn(),
  openNativeMarkdownFileInNewWindow: vi.fn(),
  openNativeMarkdownPath: vi.fn(),
  listenNativeOpenedMarkdownPaths: vi.fn(),
  listNativeMarkdownFileHistory: vi.fn(),
  readNativeLocalImageFile: vi.fn(),
  readNativeMarkdownImageFile: vi.fn(),
  readNativeMarkdownFile: vi.fn(),
  readNativeMarkdownFileHistory: vi.fn(),
  readNativeMarkdownTemplateFile: vi.fn(),
  requestNativeAiJson: vi.fn(),
  requestNativeChat: vi.fn(),
  requestNativeChatStream: vi.fn(),
  requestNativeWebResource: vi.fn(),
  resolveNativeMarkdownPath: vi.fn(),
  renameNativeMarkdownTreeFile: vi.fn(),
  saveNativeClipboardImage: vi.fn(),
  saveNativeHtmlFile: vi.fn(),
  saveNativeMarkdownFile: vi.fn(),
  saveNativePandocFile: vi.fn(),
  saveNativePdfFile: vi.fn(),
  searchNativeMarkdownFilesForPath: vi.fn(),
  setNativeEditorWindowRestoreState: vi.fn(),
  showNativePandocSetup: vi.fn(),
  showNativeMarkdownFileTreeContextMenu: vi.fn(),
  syncNativeMarkdownFolder: vi.fn(),
  uninstallNativeShellCommand: vi.fn(),
  uploadNativePicGoImage: vi.fn(),
  uploadNativeS3Image: vi.fn(),
  uploadNativeWebDavImage: vi.fn(),
  watchNativeMarkdownFile: vi.fn(),
  writeNativeMarkdownTemplateFile: vi.fn(),
  watchNativeMarkdownTree: vi.fn(),
  listNativeMarkdownFilesForPath: vi.fn(),
  takeNativeOpenedMarkdownPaths: vi.fn(),
  installNativeApplicationMenu: vi.fn(),
  installNativeEditorContextMenu: vi.fn(),
  openNativeExternalUrl: vi.fn(),
  closeNativeWindow: vi.fn(),
  exitNativeApp: vi.fn(),
  listenNativeAppExitRequested: vi.fn(),
  listenNativeWindowCloseRequested: vi.fn(),
  openSettingsWindow: vi.fn(),
  setNativeWindowTitle: vi.fn(),
  showNativeWindow: vi.fn(),
  showNativeAppAbout: vi.fn(),
  toggleNativeWindowFullscreen: vi.fn(),
  toggleNativeWindowMaximized: vi.fn()
}));

vi.mock("../lib/tauri/updater", () => ({
  checkNativeAppUpdate: vi.fn()
}));

vi.mock("../lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/platform")>();

  return {
    ...actual,
    resolveDesktopOsVersion: vi.fn(() => null),
    resolveDesktopPlatform: vi.fn(() => "macos")
  };
});

vi.mock("../lib/settings/app-settings", () => ({
  createAiAgentSessionId: vi.fn(),
  consumeWelcomeDocumentState: vi.fn(),
  deleteStoredAiAgentSession: vi.fn(),
  defaultBackupSettings: {
    backupOnExit: false,
    intervalMinutes: 0,
    lastBackupAt: null,
    targetPath: ""
  },
  defaultSyncSettings: {
    autoSyncOnSave: false,
    enabled: false,
    intervalMinutes: 0,
    lastSyncAt: null,
    provider: "webdav",
    remotePath: "markra"
  },
  defaultStoredFileTreeSort: {
    direction: "ascending",
    key: "name"
  },
  defaultSplitVisualPanePercent: 50,
  splitVisualPanePercentMin: 25,
  splitVisualPanePercentMax: 75,
  defaultEditorPreferences: {
    aiQuickActionPrompts: testAiQuickActionPrompts,
    autoUpdateEnabled: true,
    bodyFontSize: 16,
    clipboardImageFolder: "assets",
    closeAiCommandOnAgentPanelOpen: false,
    contentWidth: "default",
    contentWidthPx: null,
    editorFontFamily: { family: null, source: "theme" },
    extendedSyntax: {
      githubAlerts: true,
      highlight: true
    },
    imageUpload: {
      fileNamePattern: "pasted-image-{timestamp}",
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
    },
    lineHeight: 1.65,
    markdownShortcuts: {
      bold: "Mod+B",
      bulletList: "Mod+Shift+8",
      codeBlock: "Mod+Alt+C",
      heading1: "Mod+Alt+1",
      heading2: "Mod+Alt+2",
      heading3: "Mod+Alt+3",
      inlineCode: "Mod+E",
      italic: "Mod+I",
      orderedList: "Mod+Shift+7",
      paragraph: "Mod+Alt+0",
      quote: "Mod+Shift+B",
      strikethrough: "Mod+Shift+X"
    },
    restoreWorkspaceOnStartup: true,
    showAiQuickInputOnSelection: true,
    showAiSelectionToolbarOnSelection: false,
    suggestAiPanelForComplexInlinePrompts: false,
    showDocumentTabs: true,
    splitVisualPanePercent: 50,
    titlebarActions: [
      { id: "aiAgent", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "history", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ],
    showWordCount: true,
    wrapCodeBlocks: true
  },
  appThemeOptions: [
    "system",
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
  ],
  appAppearanceModeOptions: ["system", "light", "dark"],
  editorThemeOptions: [
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
  ],
  lightEditorThemeOptions: [
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
  ],
  darkEditorThemeOptions: [
    "dark",
    "github-dark",
    "one-dark",
    "one-dark-pro",
    "night",
    "solarized-dark",
    "nord",
    "catppuccin-mocha",
    "custom"
  ],
  defaultAppThemePreferences: {
    appearanceMode: "system",
    darkTheme: "dark",
    lightTheme: "light"
  },
  normalizeAppThemePreferences: vi.fn((preferences) => {
    const value = typeof preferences === "object" && preferences !== null
      ? preferences as Record<string, unknown>
      : {};
    const appearanceMode = ["system", "light", "dark"].includes(String(value.appearanceMode))
      ? value.appearanceMode
      : "system";
    const lightTheme = [
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
    ].includes(String(value.lightTheme)) ? value.lightTheme : "light";
    const darkTheme = [
      "dark",
      "github-dark",
      "one-dark",
      "one-dark-pro",
      "night",
      "solarized-dark",
      "nord",
      "catppuccin-mocha",
      "custom"
    ].includes(String(value.darkTheme)) ? value.darkTheme : "dark";

    return {
      appearanceMode,
      darkTheme,
      lightTheme
    };
  }),
  resolveAppAppearanceTheme: vi.fn((theme, systemTheme) => {
    const resolvedTheme = theme === "system" ? systemTheme : theme;
    return [
      "dark",
      "github-dark",
      "night",
      "one-dark",
      "one-dark-pro",
      "solarized-dark",
      "nord",
      "catppuccin-mocha"
    ].includes(resolvedTheme) ? "dark" : "light";
  }),
  resolveAppEditorTheme: vi.fn((theme, systemTheme) => theme === "system" ? systemTheme : theme),
  resolveAppThemePreferencesAppearance: vi.fn((preferences, systemTheme) =>
    preferences.appearanceMode === "system" ? systemTheme : preferences.appearanceMode
  ),
  resolveAppThemePreferencesEditorTheme: vi.fn((preferences, systemTheme) => {
    const appearance = preferences.appearanceMode === "system" ? systemTheme : preferences.appearanceMode;

    return appearance === "dark" ? preferences.darkTheme : preferences.lightTheme;
  }),
  defaultTitlebarActions: [
    { id: "aiAgent", visible: true },
    { id: "sourceMode", visible: true },
    { id: "splitMode", visible: true },
    { id: "history", visible: true },
    { id: "save", visible: true },
    { id: "theme", visible: true }
  ],
  defaultWebSearchSettings: {
    contentMaxChars: 12000,
    enabled: true,
    maxResults: 5,
    providerId: "local-bing",
    searxngApiHost: ""
  },
  defaultNetworkSettings: {
    bypassLocalAddresses: true,
    proxyEnabled: false,
    proxyUrl: ""
  },
  defaultExportSettings: {
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
  },
  defaultCustomThemeCss: ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }",
  defaultCustomThemeCssValues: {
    dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
    light: ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"
  },
  getStoredAiAgentSession: vi.fn(),
  getStoredAiAgentSessionSummary: vi.fn(),
  getStoredAiAgentPreferences: vi.fn(),
  getStoredBackupSettings: vi.fn(),
  getStoredSyncSettings: vi.fn(),
  getStoredAiSettings: vi.fn(),
  getStoredCustomThemeCss: vi.fn(),
  getStoredEditorPreferences: vi.fn(),
  getStoredExportSettings: vi.fn(),
  getStoredFileTreeSortByWorkspace: vi.fn(async () => ({})),
  getStoredLanguage: vi.fn(),
  getStoredNetworkSettings: vi.fn(),
  getStoredRecentMarkdownFiles: vi.fn(),
  getStoredRecentMarkdownFolders: vi.fn(),
  getStoredTheme: vi.fn(),
  getStoredThemePreferences: vi.fn(),
  getStoredWebSearchSettings: vi.fn(),
  getStoredWorkspaceState: vi.fn(),
  initializeStoredAiAgentSession: vi.fn(),
  listStoredAiAgentSessions: vi.fn(),
  normalizeEditorPreferences: vi.fn((preferences) => ({
    aiQuickActionPrompts: testAiQuickActionPrompts,
    autoUpdateEnabled: true,
    bodyFontSize: 16,
    clipboardImageFolder: "assets",
    closeAiCommandOnAgentPanelOpen: false,
    contentWidth: "default",
    contentWidthPx: null,
    editorFontFamily: { family: null, source: "theme" },
    extendedSyntax: {
      githubAlerts: true,
      highlight: true
    },
    imageUpload: {
      fileNamePattern: "pasted-image-{timestamp}",
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
    },
    lineHeight: 1.65,
    markdownShortcuts: {
      bold: "Mod+B",
      bulletList: "Mod+Shift+8",
      codeBlock: "Mod+Alt+C",
      heading1: "Mod+Alt+1",
      heading2: "Mod+Alt+2",
      heading3: "Mod+Alt+3",
      inlineCode: "Mod+E",
      italic: "Mod+I",
      orderedList: "Mod+Shift+7",
      paragraph: "Mod+Alt+0",
      quote: "Mod+Shift+B",
      strikethrough: "Mod+Shift+X"
    },
    restoreWorkspaceOnStartup: true,
    showAiQuickInputOnSelection: true,
    showAiSelectionToolbarOnSelection: false,
    suggestAiPanelForComplexInlinePrompts: false,
    showDocumentTabs: true,
    splitVisualPanePercent: 50,
    titlebarActions: [
      { id: "aiAgent", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "history", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ],
    showWordCount: true,
    ...preferences,
    wrapCodeBlocks: preferences?.wrapCodeBlocks ?? true
  })),
  normalizeStoredFileTreeSort: vi.fn((sort) => {
    const value = typeof sort === "object" && sort !== null
      ? sort as Record<string, unknown>
      : {};
    const key = ["createdAt", "modifiedAt", "name"].includes(String(value.key)) ? value.key : "name";
    const direction = ["ascending", "descending"].includes(String(value.direction)) ? value.direction : "ascending";

    return { direction, key };
  }),
  normalizeTitlebarActions: vi.fn((actions) => Array.isArray(actions) ? actions : [
    { id: "aiAgent", visible: true },
    { id: "sourceMode", visible: true },
    { id: "splitMode", visible: true },
    { id: "save", visible: true },
    { id: "theme", visible: true }
  ]),
  prependRecentMarkdownFolder: vi.fn((folders: RecentMarkdownFolder[], folder: RecentMarkdownFolder) => [
    folder,
    ...folders.filter((item) => item.path !== folder.path)
  ].slice(0, 5)),
  reorderTitlebarActions: vi.fn((actions, draggedId, targetId) => {
    const normalized = Array.isArray(actions) ? actions : [
      { id: "aiAgent", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ];
    const fromIndex = normalized.findIndex((action) => action.id === draggedId);
    const toIndex = normalized.findIndex((action) => action.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return normalized;

    const draggedAction = normalized[fromIndex];
    const nextActions = normalized.filter((action) => action.id !== draggedId);

    nextActions.splice(toIndex, 0, draggedAction);

    return nextActions;
  }),
  normalizeExportSettings: vi.fn((settings) => ({
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
    pdfWidthMm: 210,
    ...settings
  })),
  normalizeWebSearchSettings: vi.fn((settings) => ({
    contentMaxChars: 12000,
    enabled: true,
    maxResults: 5,
    providerId: "local-bing",
    searxngApiHost: "",
    ...settings
  })),
  normalizeNetworkSettings: vi.fn((settings) => ({
    bypassLocalAddresses: true,
    proxyEnabled: false,
    proxyUrl: "",
    ...(typeof settings === "object" && settings !== null ? settings : {})
  })),
  normalizeBackupSettings: vi.fn((settings) => ({
    backupOnExit: false,
    intervalMinutes: 0,
    lastBackupAt: null,
    targetPath: "",
    ...(typeof settings === "object" && settings !== null ? settings : {})
  })),
  normalizeSyncSettings: vi.fn((settings) => {
    const value = typeof settings === "object" && settings !== null ? settings as Record<string, unknown> : {};
    const webdav = typeof value.webdav === "object" && value.webdav !== null
      ? value.webdav as Record<string, unknown>
      : {};
    const remotePath = typeof value.remotePath === "string"
      ? value.remotePath
      : typeof webdav.remotePath === "string"
        ? webdav.remotePath
        : "";

    return {
      autoSyncOnSave: typeof value.autoSyncOnSave === "boolean" ? value.autoSyncOnSave : false,
      enabled: typeof value.enabled === "boolean" ? value.enabled : false,
      intervalMinutes: typeof value.intervalMinutes === "number" ? value.intervalMinutes : 0,
      lastSyncAt: typeof value.lastSyncAt === "number" ? value.lastSyncAt : null,
      provider: "webdav",
      remotePath
    };
  }),
  normalizeCustomThemeCss: vi.fn((css) => typeof css === "string" ? css.slice(0, 50000) : ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"),
  normalizeCustomThemeCssValues: vi.fn((css) => {
    if (typeof css === "object" && css !== null) {
      const value = css as Record<string, unknown>;

      return {
        dark: typeof value.dark === "string" ? value.dark.slice(0, 50000) : ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
        light: typeof value.light === "string" ? value.light.slice(0, 50000) : ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"
      };
    }

    const value = typeof css === "string" ? css.slice(0, 50000) : ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";

    return {
      dark: value,
      light: value
    };
  }),
  prependRecentMarkdownFile: vi.fn((files: RecentMarkdownFile[], file: RecentMarkdownFile) => [
    file,
    ...files.filter((item) => item.path !== file.path)
  ].slice(0, 10)),
  resetWelcomeDocumentState: vi.fn(),
  removeStoredRecentMarkdownFolder: vi.fn(),
  removeStoredRecentMarkdownFile: vi.fn(),
  saveStoredAiAgentPreferences: vi.fn(),
  saveStoredAiAgentSession: vi.fn(),
  saveStoredAiAgentSessionTitle: vi.fn(),
  saveStoredAiSettings: vi.fn(),
  saveStoredBackupSettings: vi.fn(),
  saveStoredSyncSettings: vi.fn(),
  saveStoredCustomThemeCss: vi.fn(),
  saveStoredEditorPreferences: vi.fn(),
  saveStoredExportSettings: vi.fn(),
  saveStoredFileTreeSortForWorkspace: vi.fn(async () => {}),
  saveStoredLanguage: vi.fn(),
  saveStoredNetworkSettings: vi.fn(),
  saveStoredRecentMarkdownFile: vi.fn(),
  saveStoredRecentMarkdownFolder: vi.fn(),
  saveStoredTheme: vi.fn(),
  saveStoredThemePreferences: vi.fn(),
  saveStoredWorkspaceState: vi.fn(),
  setStoredAiAgentSessionArchived: vi.fn(),
  clearStoredRecentMarkdownFiles: vi.fn()
}));

vi.mock("../lib/settings/settings-events", () => ({
  listenAppAiSettingsChanged: vi.fn(),
  listenAppBackupSettingsChanged: vi.fn(),
  listenAppSyncSettingsChanged: vi.fn(),
  listenAppCustomThemeCssChanged: vi.fn(),
  listenAppEditorPreferencesChanged: vi.fn(),
  listenAppExportSettingsChanged: vi.fn(),
  listenAppLanguageChanged: vi.fn(),
  listenAppThemeChanged: vi.fn(),
  listenAppWebSearchSettingsChanged: vi.fn(),
  notifyAppAiSettingsChanged: vi.fn(),
  notifyAppBackupSettingsChanged: vi.fn(),
  notifyAppSyncSettingsChanged: vi.fn(),
  notifyAppCustomThemeCssChanged: vi.fn(),
  notifyAppEditorPreferencesChanged: vi.fn(),
  notifyAppExportSettingsChanged: vi.fn(),
  notifyAppLanguageChanged: vi.fn(),
  notifyAppThemeChanged: vi.fn(),
  notifyAppWebSearchSettingsChanged: vi.fn()
}));

vi.mock("@markra/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@markra/ai")>();

  return {
    ...actual,
    chatCompletion: vi.fn(),
    generateAiAgentSessionTitle: vi.fn()
  };
});

vi.mock("@markra/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@markra/providers")>();

  return {
    ...actual,
    fetchAiProviderModels: vi.fn(),
    testAiProviderConnection: vi.fn()
  };
});

export const mockedOpenNativeMarkdownFolder = vi.mocked(openNativeMarkdownFolder);
export const mockedOpenNativeContainingFolder = vi.mocked(openNativeContainingFolder);
export const mockedOpenNativeLocalImages = vi.mocked(openNativeLocalImages);
export const mockedOpenNativeMarkdownFolderInNewWindow = vi.mocked(openNativeMarkdownFolderInNewWindow);
export const mockedConfirmNativeMarkdownFileDelete = vi.mocked(confirmNativeMarkdownFileDelete);
export const mockedConfirmNativeUnsavedMarkdownDocumentDiscard = vi.mocked(confirmNativeUnsavedMarkdownDocumentDiscard);
export const mockedCreateNativeMarkdownTreeFile = vi.mocked(createNativeMarkdownTreeFile);
export const mockedCreateNativeMarkdownTreeFolder = vi.mocked(createNativeMarkdownTreeFolder);
export const mockedDeleteNativeMarkdownTreeFile = vi.mocked(deleteNativeMarkdownTreeFile);
export const mockedDetectNativePandocPath = vi.mocked(detectNativePandocPath);
export const mockedDownloadNativeWebImage = vi.mocked(downloadNativeWebImage);
export const mockedGetNativeShellCommandStatus = vi.mocked(getNativeShellCommandStatus);
export const mockedInstallNativeShellCommand = vi.mocked(installNativeShellCommand);
export const mockedOpenNativeMarkdownFileInNewWindow = vi.mocked(openNativeMarkdownFileInNewWindow);
export const mockedOpenNativeMarkdownPath = vi.mocked(openNativeMarkdownPath);
export const mockedListenNativeOpenedMarkdownPaths = vi.mocked(listenNativeOpenedMarkdownPaths);
export const mockedReadNativeLocalImageFile = vi.mocked(readNativeLocalImageFile);
export const mockedReadNativeMarkdownImageFile = vi.mocked(readNativeMarkdownImageFile);
export const mockedReadNativeMarkdownFile = vi.mocked(readNativeMarkdownFile);
export const mockedReadNativeMarkdownFileHistory = vi.mocked(readNativeMarkdownFileHistory);
export const mockedReadNativeMarkdownTemplateFile = vi.mocked(readNativeMarkdownTemplateFile);
export const mockedResolveNativeMarkdownPath = vi.mocked(resolveNativeMarkdownPath);
export const mockedSaveNativeClipboardImage = vi.mocked(saveNativeClipboardImage);
export const mockedSaveNativeHtmlFile = vi.mocked(saveNativeHtmlFile);
export const mockedSaveNativeMarkdownFile = vi.mocked(saveNativeMarkdownFile);
export const mockedSaveNativePandocFile = vi.mocked(saveNativePandocFile);
export const mockedSaveNativePdfFile = vi.mocked(saveNativePdfFile);
export const mockedSearchNativeMarkdownFilesForPath = vi.mocked(searchNativeMarkdownFilesForPath);
export const mockedSetNativeEditorWindowRestoreState = vi.mocked(setNativeEditorWindowRestoreState);
export const mockedShowNativeWindow = vi.mocked(showNativeWindow);
export const mockedShowNativeAppAbout = vi.mocked(showNativeAppAbout);
export const mockedShowNativePandocSetup = vi.mocked(showNativePandocSetup);
export const mockedShowNativeMarkdownFileTreeContextMenu = vi.mocked(showNativeMarkdownFileTreeContextMenu);
export const mockedSyncNativeMarkdownFolder = vi.mocked(syncNativeMarkdownFolder);
export const mockedUninstallNativeShellCommand = vi.mocked(uninstallNativeShellCommand);
export const mockedInstallNativeMarkdownFileDrop = vi.mocked(installNativeMarkdownFileDrop);
export const mockedListNativeMarkdownFileHistory = vi.mocked(listNativeMarkdownFileHistory);
export const mockedListNativeMarkdownFilesForPath = vi.mocked(listNativeMarkdownFilesForPath);
export const mockedTakeNativeOpenedMarkdownPaths = vi.mocked(takeNativeOpenedMarkdownPaths);
export const mockedRenameNativeMarkdownTreeFile = vi.mocked(renameNativeMarkdownTreeFile);
export const mockedWatchNativeMarkdownFile = vi.mocked(watchNativeMarkdownFile);
export const mockedWriteNativeMarkdownTemplateFile = vi.mocked(writeNativeMarkdownTemplateFile);
export const mockedWatchNativeMarkdownTree = vi.mocked(watchNativeMarkdownTree);
export const mockedInstallNativeApplicationMenu = vi.mocked(installNativeApplicationMenu);
export const mockedInstallNativeEditorContextMenu = vi.mocked(installNativeEditorContextMenu);
export const mockedOpenSettingsWindow = vi.mocked(openSettingsWindow);
export const mockedOpenNativeExternalUrl = vi.mocked(openNativeExternalUrl);
export const mockedCloseNativeWindow = vi.mocked(closeNativeWindow);
export const mockedToggleNativeWindowFullscreen = vi.mocked(toggleNativeWindowFullscreen);
export const mockedExitNativeApp = vi.mocked(exitNativeApp);
export const mockedListenNativeAppExitRequested = vi.mocked(listenNativeAppExitRequested);
export const mockedListenNativeWindowCloseRequested = vi.mocked(listenNativeWindowCloseRequested);
export const mockedCheckNativeAppUpdate = vi.mocked(checkNativeAppUpdate);
export const mockedResolveDesktopOsVersion = vi.mocked(resolveDesktopOsVersion);
export const mockedResolveDesktopPlatform = vi.mocked(resolveDesktopPlatform);
export const mockedConsumeWelcomeDocumentState = vi.mocked(consumeWelcomeDocumentState);
export const mockedCreateAiAgentSessionId = vi.mocked(createAiAgentSessionId);
export const mockedDeleteStoredAiAgentSession = vi.mocked(deleteStoredAiAgentSession);
export const mockedGetStoredBackupSettings = vi.mocked(getStoredBackupSettings);
export const mockedGetStoredSyncSettings = vi.mocked(getStoredSyncSettings);
export const mockedGetStoredAiAgentPreferences = vi.mocked(getStoredAiAgentPreferences);
export const mockedGetStoredAiAgentSession = vi.mocked(getStoredAiAgentSession);
export const mockedGetStoredAiAgentSessionSummary = vi.mocked(getStoredAiAgentSessionSummary);
export const mockedGetStoredAiSettings = vi.mocked(getStoredAiSettings);
export const mockedGetStoredCustomThemeCss = vi.mocked(getStoredCustomThemeCss);
export const mockedGetStoredEditorPreferences = vi.mocked(getStoredEditorPreferences);
export const mockedGetStoredExportSettings = vi.mocked(getStoredExportSettings);
export const mockedGetStoredLanguage = vi.mocked(getStoredLanguage);
export const mockedGetStoredNetworkSettings = vi.mocked(getStoredNetworkSettings);
export const mockedGetStoredRecentMarkdownFiles = vi.mocked(getStoredRecentMarkdownFiles);
export const mockedGetStoredRecentMarkdownFolders = vi.mocked(getStoredRecentMarkdownFolders);
export const mockedGetStoredTheme = vi.mocked(getStoredTheme);
export const mockedGetStoredThemePreferences = vi.mocked(getStoredThemePreferences);
export const mockedGetStoredWebSearchSettings = vi.mocked(getStoredWebSearchSettings);
export const mockedGetStoredWorkspaceState = vi.mocked(getStoredWorkspaceState);
export const mockedInitializeStoredAiAgentSession = vi.mocked(initializeStoredAiAgentSession);
export const mockedListStoredAiAgentSessions = vi.mocked(listStoredAiAgentSessions);
export const mockedClearStoredRecentMarkdownFiles = vi.mocked(clearStoredRecentMarkdownFiles);
export const mockedRemoveStoredRecentMarkdownFile = vi.mocked(removeStoredRecentMarkdownFile);
export const mockedRemoveStoredRecentMarkdownFolder = vi.mocked(removeStoredRecentMarkdownFolder);
export const mockedResetWelcomeDocumentState = vi.mocked(resetWelcomeDocumentState);
export const mockedSaveStoredAiAgentSession = vi.mocked(saveStoredAiAgentSession);
export const mockedSaveStoredAiAgentPreferences = vi.mocked(saveStoredAiAgentPreferences);
export const mockedSaveStoredAiAgentSessionTitle = vi.mocked(saveStoredAiAgentSessionTitle);
export const mockedSaveStoredAiSettings = vi.mocked(saveStoredAiSettings);
export const mockedSaveStoredBackupSettings = vi.mocked(saveStoredBackupSettings);
export const mockedSaveStoredSyncSettings = vi.mocked(saveStoredSyncSettings);
export const mockedSaveStoredCustomThemeCss = vi.mocked(saveStoredCustomThemeCss);
export const mockedSaveStoredEditorPreferences = vi.mocked(saveStoredEditorPreferences);
export const mockedSaveStoredExportSettings = vi.mocked(saveStoredExportSettings);
export const mockedSaveStoredLanguage = vi.mocked(saveStoredLanguage);
export const mockedSaveStoredNetworkSettings = vi.mocked(saveStoredNetworkSettings);
export const mockedSaveStoredRecentMarkdownFile = vi.mocked(saveStoredRecentMarkdownFile);
export const mockedSaveStoredRecentMarkdownFolder = vi.mocked(saveStoredRecentMarkdownFolder);
export const mockedSaveStoredTheme = vi.mocked(saveStoredTheme);
export const mockedSaveStoredThemePreferences = vi.mocked(saveStoredThemePreferences);
export const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);
export const mockedSetStoredAiAgentSessionArchived = vi.mocked(setStoredAiAgentSessionArchived);
export const mockedNormalizeBackupSettings = vi.mocked(normalizeBackupSettings);
export const mockedNormalizeNetworkSettings = vi.mocked(normalizeNetworkSettings);
export const mockedNormalizeSyncSettings = vi.mocked(normalizeSyncSettings);
export const mockedListenAppAiSettingsChanged = vi.mocked(listenAppAiSettingsChanged);
export const mockedListenAppBackupSettingsChanged = vi.mocked(listenAppBackupSettingsChanged);
export const mockedListenAppSyncSettingsChanged = vi.mocked(listenAppSyncSettingsChanged);
export const mockedListenAppCustomThemeCssChanged = vi.mocked(listenAppCustomThemeCssChanged);
export const mockedListenAppEditorPreferencesChanged = vi.mocked(listenAppEditorPreferencesChanged);
export const mockedListenAppExportSettingsChanged = vi.mocked(listenAppExportSettingsChanged);
export const mockedListenAppLanguageChanged = vi.mocked(listenAppLanguageChanged);
export const mockedListenAppThemeChanged = vi.mocked(listenAppThemeChanged);
export const mockedListenAppWebSearchSettingsChanged = vi.mocked(listenAppWebSearchSettingsChanged);
export const mockedNotifyAppAiSettingsChanged = vi.mocked(notifyAppAiSettingsChanged);
export const mockedNotifyAppBackupSettingsChanged = vi.mocked(notifyAppBackupSettingsChanged);
export const mockedNotifyAppSyncSettingsChanged = vi.mocked(notifyAppSyncSettingsChanged);
export const mockedNotifyAppCustomThemeCssChanged = vi.mocked(notifyAppCustomThemeCssChanged);
export const mockedNotifyAppEditorPreferencesChanged = vi.mocked(notifyAppEditorPreferencesChanged);
export const mockedNotifyAppExportSettingsChanged = vi.mocked(notifyAppExportSettingsChanged);
export const mockedNotifyAppLanguageChanged = vi.mocked(notifyAppLanguageChanged);
export const mockedNotifyAppThemeChanged = vi.mocked(notifyAppThemeChanged);
export const mockedNotifyAppWebSearchSettingsChanged = vi.mocked(notifyAppWebSearchSettingsChanged);
export const mockedFetchAiProviderModels = vi.mocked(fetchAiProviderModels);
export const mockedTestAiProviderConnection = vi.mocked(testAiProviderConnection);
export const mockedChatCompletion = vi.mocked(chatCompletion);
export const mockedGenerateAiAgentSessionTitle = vi.mocked(generateAiAgentSessionTitle);

export const mockNativePath = "/mock-files/native.md";
export const mockDroppedPath = "/mock-files/dropped.md";
export const mockFolderPath = "/mock-files/vault";
export const mockUntitledPath = "/mock-files/Untitled.md";

export function mockSystemColorScheme(initiallyDark: boolean) {
  let matches = initiallyDark;
  const listeners = new Set<(event: MediaQueryListEvent) => unknown>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_event: "change", listener: (event: MediaQueryListEvent) => unknown) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: "change", listener: (event: MediaQueryListEvent) => unknown) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => unknown) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => unknown) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQueryList)
  });

  return {
    setSystemDark(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    }
  };
}

export function mockOpenMarkdownFile(file: { content: string; name: string; path: string }) {
  mockedOpenNativeMarkdownPath.mockResolvedValue({
    kind: "file",
    file
  });
}

export type { NativeMenuHandlers } from "../lib/tauri";
export { AI_EDITOR_PREVIEW_ACTION_EVENT, AI_EDITOR_PREVIEW_RESTORE_EVENT } from "@markra/editor";

export function renderApp() {
  return render(<App />);
}

export function dispatchAiEditorPreviewAction(detail: Partial<AiEditorPreviewActionDetail>) {
  fireEvent(window, new CustomEvent(AI_EDITOR_PREVIEW_ACTION_EVENT, { detail }));
}

export function installAppTestHarness() {
  afterAll(async () => {
    // Milkdown ctx leaves 3s listener cleanup timers pending after editor teardown.
    await new Promise((resolve) => {
      window.setTimeout(resolve, 3200);
    });
  });

  beforeEach(() => {
    window.history.pushState({}, "", "/");
    mockedConsumeWelcomeDocumentState.mockReset();
    mockedCreateAiAgentSessionId.mockReset();
    mockedDeleteStoredAiAgentSession.mockReset();
    mockedConfirmNativeMarkdownFileDelete.mockReset();
    mockedConfirmNativeUnsavedMarkdownDocumentDiscard.mockReset();
    mockedCreateNativeMarkdownTreeFile.mockReset();
    mockedCreateNativeMarkdownTreeFolder.mockReset();
    mockedDeleteNativeMarkdownTreeFile.mockReset();
    mockedDetectNativePandocPath.mockReset();
    mockedInstallNativeMarkdownFileDrop.mockReset();
    mockedOpenNativeContainingFolder.mockReset();
    mockedOpenNativeMarkdownFolder.mockReset();
    mockedOpenNativeMarkdownFolderInNewWindow.mockReset();
    mockedOpenNativeMarkdownFileInNewWindow.mockReset();
    mockedOpenNativeMarkdownPath.mockReset();
    mockedListenNativeOpenedMarkdownPaths.mockReset();
    mockedListNativeMarkdownFileHistory.mockReset();
    mockedReadNativeMarkdownImageFile.mockReset();
    mockedReadNativeMarkdownFile.mockReset();
    mockedReadNativeMarkdownFileHistory.mockReset();
    mockedReadNativeMarkdownTemplateFile.mockReset();
    mockedResolveNativeMarkdownPath.mockReset();
    mockedSaveNativeHtmlFile.mockReset();
    mockedSaveNativePandocFile.mockReset();
    mockedSaveNativePdfFile.mockReset();
    mockedSearchNativeMarkdownFilesForPath.mockReset();
    mockedShowNativePandocSetup.mockReset();
    mockedRenameNativeMarkdownTreeFile.mockReset();
    mockedSaveNativeMarkdownFile.mockReset();
    mockedShowNativeMarkdownFileTreeContextMenu.mockReset();
    mockedSyncNativeMarkdownFolder.mockReset();
    mockedSetNativeEditorWindowRestoreState.mockReset();
    mockedListNativeMarkdownFileHistory.mockReset();
    mockedListNativeMarkdownFilesForPath.mockReset();
    mockedTakeNativeOpenedMarkdownPaths.mockReset();
    mockedWatchNativeMarkdownFile.mockReset();
    mockedWriteNativeMarkdownTemplateFile.mockReset();
    mockedWatchNativeMarkdownTree.mockReset();
    mockedInstallNativeApplicationMenu.mockReset();
    mockedInstallNativeEditorContextMenu.mockReset();
    mockedOpenNativeExternalUrl.mockReset();
    mockedCloseNativeWindow.mockReset();
    mockedShowNativeWindow.mockReset();
    mockedShowNativeAppAbout.mockReset();
    mockedExitNativeApp.mockReset();
    mockedListenNativeAppExitRequested.mockReset();
    mockedListenNativeWindowCloseRequested.mockReset();
    mockedCheckNativeAppUpdate.mockReset();
    mockedResolveDesktopOsVersion.mockReset();
    mockedResolveDesktopPlatform.mockReset();
    mockedOpenSettingsWindow.mockReset();
    mockedGetStoredLanguage.mockReset();
    mockedGetStoredRecentMarkdownFiles.mockReset();
    mockedGetStoredRecentMarkdownFolders.mockReset();
    mockedGetStoredBackupSettings.mockReset();
    mockedGetStoredSyncSettings.mockReset();
    mockedGetStoredAiSettings.mockReset();
    mockedGetStoredAiAgentPreferences.mockReset();
    mockedGetStoredAiAgentSession.mockReset();
    mockedGetStoredAiAgentSessionSummary.mockReset();
    mockedGetStoredCustomThemeCss.mockReset();
    mockedGetStoredEditorPreferences.mockReset();
    mockedGetStoredExportSettings.mockReset();
    mockedGetStoredNetworkSettings.mockReset();
    mockedGetStoredTheme.mockReset();
    mockedGetStoredThemePreferences.mockReset();
    mockedGetStoredWorkspaceState.mockReset();
    mockedInitializeStoredAiAgentSession.mockReset();
    mockedListStoredAiAgentSessions.mockReset();
    mockedClearStoredRecentMarkdownFiles.mockReset();
    mockedRemoveStoredRecentMarkdownFile.mockReset();
    mockedRemoveStoredRecentMarkdownFolder.mockReset();
    mockedResetWelcomeDocumentState.mockReset();
    mockedNormalizeBackupSettings.mockReset();
    mockedNormalizeNetworkSettings.mockReset();
    mockedNormalizeSyncSettings.mockReset();
    mockedSaveStoredAiAgentPreferences.mockReset();
    mockedSaveStoredAiAgentSession.mockReset();
    mockedSaveStoredAiAgentSessionTitle.mockReset();
    mockedSaveStoredAiSettings.mockReset();
    mockedSaveStoredBackupSettings.mockReset();
    mockedSaveStoredSyncSettings.mockReset();
    mockedSaveStoredCustomThemeCss.mockReset();
    mockedSaveStoredEditorPreferences.mockReset();
    mockedSaveStoredExportSettings.mockReset();
    mockedSaveStoredLanguage.mockReset();
    mockedSaveStoredNetworkSettings.mockReset();
    mockedSaveStoredRecentMarkdownFile.mockReset();
    mockedSaveStoredRecentMarkdownFolder.mockReset();
    mockedSaveStoredTheme.mockReset();
    mockedSaveStoredThemePreferences.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedSetStoredAiAgentSessionArchived.mockReset();
    mockedListenAppAiSettingsChanged.mockReset();
    mockedListenAppCustomThemeCssChanged.mockReset();
    mockedListenAppEditorPreferencesChanged.mockReset();
    mockedListenAppBackupSettingsChanged.mockReset();
    mockedListenAppSyncSettingsChanged.mockReset();
    mockedListenAppExportSettingsChanged.mockReset();
    mockedListenAppLanguageChanged.mockReset();
    mockedListenAppThemeChanged.mockReset();
    mockedNotifyAppAiSettingsChanged.mockReset();
    mockedNotifyAppCustomThemeCssChanged.mockReset();
    mockedNotifyAppEditorPreferencesChanged.mockReset();
    mockedNotifyAppBackupSettingsChanged.mockReset();
    mockedNotifyAppSyncSettingsChanged.mockReset();
    mockedNotifyAppExportSettingsChanged.mockReset();
    mockedNotifyAppLanguageChanged.mockReset();
    mockedNotifyAppThemeChanged.mockReset();
    mockedFetchAiProviderModels.mockReset();
    mockedTestAiProviderConnection.mockReset();
    mockedChatCompletion.mockReset();
    mockedGenerateAiAgentSessionTitle.mockReset();
    mockedDownloadNativeWebImage.mockReset();
    mockedOpenNativeLocalImages.mockReset();
    mockedSaveNativeClipboardImage.mockReset();
    mockedGetNativeShellCommandStatus.mockReset();
    mockedInstallNativeShellCommand.mockReset();
    mockedUninstallNativeShellCommand.mockReset();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-webkit-scroll-workaround");
    document.documentElement.removeAttribute("data-window");
    document.getElementById("markra-custom-theme-style")?.remove();
    mockedWatchNativeMarkdownFile.mockResolvedValue(() => {});
    mockedWatchNativeMarkdownTree.mockResolvedValue(() => {});
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);
    mockedReadNativeMarkdownFileHistory.mockRejectedValue(new Error("markdown history file is not mocked"));
    mockedReadNativeLocalImageFile.mockRejectedValue(new Error("local image file is not mocked"));
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([]);
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue(null);
    mockedTakeNativeOpenedMarkdownPaths.mockResolvedValue([]);
    mockedInstallNativeMarkdownFileDrop.mockResolvedValue(() => {});
    mockedOpenNativeContainingFolder.mockResolvedValue(undefined);
    mockedListenNativeOpenedMarkdownPaths.mockResolvedValue(() => {});
    mockedInstallNativeApplicationMenu.mockResolvedValue(() => {});
    mockedInstallNativeEditorContextMenu.mockResolvedValue(() => {});
    mockedOpenNativeExternalUrl.mockResolvedValue(undefined);
    mockedCloseNativeWindow.mockResolvedValue(undefined);
    mockedShowNativeWindow.mockResolvedValue(undefined);
    mockedShowNativeAppAbout.mockResolvedValue(undefined);
    mockedExitNativeApp.mockResolvedValue(undefined);
    mockedListenNativeAppExitRequested.mockResolvedValue(() => {});
    mockedListenNativeWindowCloseRequested.mockResolvedValue(() => {});
    mockedDownloadNativeWebImage.mockResolvedValue(new File([new Uint8Array([1, 2, 3])], "web-image.png", {
      type: "image/png"
    }));
    mockedOpenNativeLocalImages.mockResolvedValue([]);
    mockedSaveNativeClipboardImage.mockResolvedValue({
      alt: "Imported image",
      src: "assets/imported-image.png"
    });
    mockedGetNativeShellCommandStatus.mockResolvedValue({
      commandPath: "/mock-bin/markra",
      targetPath: "/mock-app/markra",
      status: "missing"
    });
    mockedInstallNativeShellCommand.mockResolvedValue({
      commandPath: "/mock-bin/markra",
      targetPath: "/mock-app/markra",
      status: "installed"
    });
    mockedUninstallNativeShellCommand.mockResolvedValue({
      commandPath: "/mock-bin/markra",
      targetPath: "/mock-app/markra",
      status: "missing"
    });
    mockedCheckNativeAppUpdate.mockResolvedValue(null);
    mockedResolveDesktopOsVersion.mockReturnValue(null);
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedOpenSettingsWindow.mockResolvedValue(undefined);
    mockedReadNativeMarkdownImageFile.mockResolvedValue({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: "/mock-files/assets/image.png",
      src: "assets/image.png"
    });
    mockedReadNativeMarkdownTemplateFile.mockRejectedValue(new Error("template file is not mocked"));
    mockedWriteNativeMarkdownTemplateFile.mockResolvedValue(undefined);
    mockedResolveNativeMarkdownPath.mockImplementation(async (path) => ({
      kind: path === mockFolderPath ? "folder" : "file",
      name: path === mockFolderPath ? "vault" : path.split("/").pop() ?? path,
      path
    }));
    mockedSaveStoredEditorPreferences.mockResolvedValue(undefined);
    mockedSaveStoredCustomThemeCss.mockResolvedValue(undefined);
    mockedSaveStoredExportSettings.mockResolvedValue(undefined);
    mockedSaveNativeHtmlFile.mockResolvedValue({
      name: "Untitled.html",
      path: "/mock-files/Untitled.html"
    });
    mockedSaveNativePdfFile.mockResolvedValue({
      name: "Untitled.pdf",
      path: "/mock-files/Untitled.pdf"
    });
    mockedSaveNativePandocFile.mockResolvedValue({
      name: "Untitled.docx",
      path: "/mock-files/Untitled.docx"
    });
    mockedShowNativePandocSetup.mockResolvedValue("cancel");
    mockedShowNativeMarkdownFileTreeContextMenu.mockResolvedValue(undefined);
    mockedSetNativeEditorWindowRestoreState.mockResolvedValue(undefined);
    mockedSyncNativeMarkdownFolder.mockResolvedValue({
      bytesDownloaded: 0,
      bytesUploaded: 0,
      conflictFiles: 0,
      downloadedFiles: 0,
      scannedFiles: 0,
      skippedFiles: 0,
      uploadedFiles: 0
    });
    mockedListenAppAiSettingsChanged.mockResolvedValue(() => {});
    mockedListenAppBackupSettingsChanged.mockResolvedValue(() => {});
    mockedListenAppSyncSettingsChanged.mockResolvedValue(() => {});
    mockedListenAppCustomThemeCssChanged.mockResolvedValue(() => {});
    mockedListenAppEditorPreferencesChanged.mockResolvedValue(() => {});
    mockedListenAppExportSettingsChanged.mockResolvedValue(() => {});
    mockedListenAppWebSearchSettingsChanged.mockResolvedValue(() => {});
    mockedConsumeWelcomeDocumentState.mockResolvedValue(true);
    mockedCreateAiAgentSessionId.mockReturnValue("session-app");
    mockedConfirmNativeMarkdownFileDelete.mockResolvedValue(true);
    mockedConfirmNativeUnsavedMarkdownDocumentDiscard.mockResolvedValue(true);
    mockedCreateNativeMarkdownTreeFile.mockResolvedValue({
      name: "Daily note.md",
      path: "/mock-files/vault/Daily note.md",
      relativePath: "Daily note.md"
    });
    mockedCreateNativeMarkdownTreeFolder.mockResolvedValue({
      kind: "folder",
      name: "Research",
      path: "/mock-files/vault/Research",
      relativePath: "Research"
    });
    mockedDeleteNativeMarkdownTreeFile.mockResolvedValue(undefined);
    mockedDetectNativePandocPath.mockResolvedValue(null);
    mockedRenameNativeMarkdownTreeFile.mockResolvedValue({
      name: "Renamed.md",
      path: "/mock-files/vault/Renamed.md",
      relativePath: "Renamed.md"
    });
    mockedGetStoredAiAgentSession.mockResolvedValue({
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [],
      panelOpen: false,
      panelWidth: null,
      thinkingEnabled: false,
      webSearchEnabled: false
    });
    mockedGetStoredAiAgentPreferences.mockResolvedValue({
      thinkingEnabled: false,
      webSearchEnabled: false
    });
    mockedGetStoredWebSearchSettings.mockResolvedValue({
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    });
    mockedGetStoredNetworkSettings.mockResolvedValue({
      bypassLocalAddresses: true,
      proxyEnabled: false,
      proxyUrl: ""
    });
    mockedGetStoredAiAgentSessionSummary.mockResolvedValue(null);
    mockedGetStoredEditorPreferences.mockResolvedValue({
      aiQuickActionPrompts: testAiQuickActionPrompts,
      autoRevealActiveFile: true,
      autoSaveEnabled: true,
      autoSaveIntervalMinutes: 10,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "assets",
      closeAiCommandOnAgentPanelOpen: false,
      contentWidth: "default",
      contentWidthPx: null,
      editorFontFamily: { family: null, source: "theme" },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      },
      imageUpload: {
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
      },
      lineHeight: 1.65,
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "history", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      showWordCount: true,
      wrapCodeBlocks: true
    });
    mockedGetStoredExportSettings.mockResolvedValue({
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
    });
    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: false,
          id: "openai",
          models: [
            {
              capabilities: ["text", "reasoning", "tools"],
              enabled: true,
              id: "gpt-5.5",
              name: "GPT-5.5"
            }
          ],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "https://api.anthropic.com/v1",
          defaultModelId: "claude-opus-4-7",
          enabled: false,
          id: "anthropic",
          models: [
            {
              capabilities: ["text", "vision"],
              enabled: true,
              id: "claude-opus-4-7",
              name: "Claude Opus 4.7"
            }
          ],
          name: "Anthropic",
          type: "anthropic"
        }
      ]
    });
    mockedGetStoredLanguage.mockResolvedValue("en");
    mockedGetStoredRecentMarkdownFiles.mockResolvedValue([]);
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([]);
    mockedGetStoredBackupSettings.mockResolvedValue({
      backupOnExit: false,
      intervalMinutes: 0,
      lastBackupAt: null,
      targetPath: ""
    });
    mockedGetStoredSyncSettings.mockResolvedValue({
      autoSyncOnSave: false,
      enabled: false,
      intervalMinutes: 0,
      lastSyncAt: null,
      provider: "webdav",
      remotePath: "markra"
    });
    mockedGetStoredCustomThemeCss.mockResolvedValue({
      dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
      light: ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"
    });
    mockedGetStoredTheme.mockResolvedValue("light");
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "light",
      darkTheme: "dark",
      lightTheme: "light"
    });
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: []
    });
    mockedResetWelcomeDocumentState.mockResolvedValue(undefined);
    mockedNormalizeBackupSettings.mockImplementation((settings) => ({
      backupOnExit: false,
      intervalMinutes: 0,
      lastBackupAt: null,
      targetPath: "",
      ...(typeof settings === "object" && settings !== null ? settings : {})
    }));
    mockedNormalizeNetworkSettings.mockImplementation((settings) => ({
      bypassLocalAddresses: true,
      proxyEnabled: false,
      proxyUrl: "",
      ...(typeof settings === "object" && settings !== null ? settings : {})
    }));
    mockedNormalizeSyncSettings.mockImplementation((settings) => {
      const value = typeof settings === "object" && settings !== null ? settings as Record<string, unknown> : {};
      const webdav = typeof value.webdav === "object" && value.webdav !== null
        ? value.webdav as Record<string, unknown>
        : {};
      const remotePath = typeof value.remotePath === "string"
        ? value.remotePath
        : typeof webdav.remotePath === "string"
          ? webdav.remotePath
          : "";

      return {
        autoSyncOnSave: typeof value.autoSyncOnSave === "boolean" ? value.autoSyncOnSave : false,
        enabled: typeof value.enabled === "boolean" ? value.enabled : false,
        intervalMinutes: typeof value.intervalMinutes === "number" ? value.intervalMinutes : 0,
        lastSyncAt: typeof value.lastSyncAt === "number" ? value.lastSyncAt : null,
        provider: "webdav",
        remotePath
      };
    });
    mockedSaveStoredBackupSettings.mockResolvedValue(undefined);
    mockedSaveStoredSyncSettings.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentPreferences.mockResolvedValue(undefined);
    mockedInitializeStoredAiAgentSession.mockResolvedValue(undefined);
    mockedListStoredAiAgentSessions.mockResolvedValue([]);
    mockedClearStoredRecentMarkdownFiles.mockResolvedValue(undefined);
    mockedRemoveStoredRecentMarkdownFile.mockResolvedValue([]);
    mockedRemoveStoredRecentMarkdownFolder.mockResolvedValue([]);
    mockedDeleteStoredAiAgentSession.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSession.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSessionTitle.mockResolvedValue(undefined);
    mockedSaveStoredAiSettings.mockResolvedValue(undefined);
    mockedSaveStoredLanguage.mockResolvedValue(undefined);
    mockedSaveStoredNetworkSettings.mockResolvedValue(undefined);
    mockedSaveStoredRecentMarkdownFile.mockResolvedValue([]);
    mockedSaveStoredRecentMarkdownFolder.mockResolvedValue([]);
    mockedSaveStoredTheme.mockResolvedValue(undefined);
    mockedSaveStoredThemePreferences.mockResolvedValue(undefined);
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
    mockedSetStoredAiAgentSessionArchived.mockResolvedValue(undefined);
    mockedListenAppLanguageChanged.mockResolvedValue(() => {});
    mockedListenAppThemeChanged.mockResolvedValue(() => {});
    mockedNotifyAppLanguageChanged.mockResolvedValue(undefined);
    mockedNotifyAppCustomThemeCssChanged.mockResolvedValue(undefined);
    mockedNotifyAppThemeChanged.mockResolvedValue(undefined);
    mockedNotifyAppSyncSettingsChanged.mockResolvedValue(undefined);
    mockedFetchAiProviderModels.mockResolvedValue([
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "gpt-5", name: "GPT-5" },
      { capabilities: ["image"], enabled: true, id: "gpt-image-1", name: "GPT Image 1" }
    ]);
    mockedTestAiProviderConnection.mockResolvedValue({ message: "Connected", ok: true });
    mockedChatCompletion.mockResolvedValue({ content: "Improved AI draft", finishReason: "stop" });
    mockedGenerateAiAgentSessionTitle.mockResolvedValue(null);
    mockSystemColorScheme(false);
  });
}
