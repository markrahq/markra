import type { AppLanguage } from "@markra/shared";
import type { MarkdownShortcutMap } from "@markra/editor";
import type { DesktopPlatform } from "../lib/platform";
import type { ContextMenuEntry } from "../components/ContextMenu";
import type {
  NativeAiChatRequest,
  NativeAiHttpRequest,
  NativeAiHttpResponse,
  NativeAiStreamResponse
} from "../lib/tauri/native-ai";
import type { NativeAppUpdate } from "../lib/tauri/updater";
import type {
  CreateNativeMarkdownTreeFileOptions,
  BackupNativeMarkdownFolderInput,
  DownloadNativeWebImageInput,
  LoadNativeMarkdownFilesForPathOptions,
  ListNativeMarkdownFilesOptions,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFileChangeHandler,
  NativeMarkdownFileDropHandler,
  NativeMarkdownFileHistoryEntry,
  NativeMarkdownFileHistoryFile,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  NativeMarkdownBackupSummary,
  NativeMarkdownSyncSummary,
  NativeMarkdownPickerLabels,
  NativeSettingsFile,
  NativeMarkdownTreeChangeHandler,
  NativePandocExportFormat,
  OpenNativeMarkdownAttachmentInput,
  ReadNativeMarkdownImageInput,
  SavedNativeClipboardAttachment,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePandocFile,
  SavedNativePdfFile,
  SavedNativeSettingsFile,
  SaveNativeClipboardAttachmentInput,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePandocFileInput,
  SaveNativePdfFileInput,
  SaveNativeSettingsFileInput,
  SyncNativeMarkdownFolderInput,
  UploadNativePicGoImageInput,
  UploadNativeS3ImageInput,
  UploadNativeWebDavImageInput
} from "../lib/tauri/file";
import type {
  NativeEditorContextMenuEntryOptions,
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuHandlers
} from "../lib/tauri/menu";
import type { RecentMarkdownFile } from "../lib/settings/app-settings";
import type {
  NativeEditorWindowRestoreState,
  NativeSettingsWindowTarget,
  NativeWindowCloseRequestEvent,
  SetNativeEditorWindowRestoreStateInput
} from "../lib/tauri/window";
import type { NativePandocSetupAction } from "../lib/tauri/dialog";
import type { NativeShellCommandStatus } from "../lib/tauri/shell-command";
import type {
  NativeSpellcheckDictionary,
  NativeSpellcheckDictionaryLoadOptions,
  NativeSpellcheckDictionaryManifest,
  NativeSpellcheckDictionaryStatus
} from "../lib/tauri/spellcheck";
import type { NativeWebResourceRequest, NativeWebResourceResponse } from "../lib/tauri/web-resource";
import type { WorkspaceSearchRequest, WorkspaceSearchResponse } from "../lib/workspace-search";
import type { AcpJsonRpcMessage } from "@markra/ai";
import { setAppLogBackendWriter, type AppLogEvent, type AppLogWriter } from "../lib/app-logger";

export type { WorkspaceSearchRequest, WorkspaceSearchResponse } from "../lib/workspace-search";
export type { AppLogArea, AppLogEvent, AppLogLevel, AppLogWriter } from "../lib/app-logger";
export { appLogger } from "../lib/app-logger";

export type RuntimeCleanup = () => unknown;

export type RuntimeStore = {
  delete: (key: string) => Promise<unknown>;
  get: <T>(key: string) => Promise<T | undefined>;
  save: () => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

export type RuntimeStoreLoadOptions = {
  autoSave: boolean;
  defaults: Record<string, unknown>;
};

export type RuntimeEvent<TPayload> = {
  payload: TPayload;
};

export type AppSettingsRuntime = {
  loadStore: (path: string, options: RuntimeStoreLoadOptions) => Promise<RuntimeStore>;
};

export type AppEventsRuntime = {
  emit: <TPayload>(event: string, payload: TPayload) => Promise<unknown>;
  isAvailable: () => boolean;
  listen: <TPayload>(
    event: string,
    handler: (event: RuntimeEvent<TPayload>) => unknown
  ) => Promise<RuntimeCleanup>;
};

export type AppPlatformRuntime = {
  resolveDesktopOsVersion: () => string | null;
  resolveDesktopPlatform: () => DesktopPlatform | null;
};

export type AppDialogRuntime = {
  confirmAiAgentSessionDelete: (
    sessionTitle: string,
    labels: { cancelLabel: string; message: string; okLabel: string }
  ) => Promise<boolean>;
  showAppAbout: () => Promise<unknown>;
  showPandocSetup: (
    labels: {
      cancelLabel: string;
      installLabel: string;
      message: string;
      setPathLabel: string;
      title: string;
    }
  ) => Promise<NativePandocSetupAction>;
};

export type AppFileRuntime = {
  confirmMarkdownFileDelete: (
    fileName: string,
    labels: { cancelLabel: string; message: string; okLabel: string }
  ) => Promise<boolean>;
  confirmUnsavedMarkdownDocumentDiscard: (
    fileName: string,
    labels: { cancelLabel: string; message: string; okLabel: string }
  ) => Promise<boolean>;
  backupMarkdownFolder: (input: BackupNativeMarkdownFolderInput) => Promise<NativeMarkdownBackupSummary>;
  createMarkdownTreeFile: (
    rootPath: string,
    fileName: string,
    optionsOrParentPath?: CreateNativeMarkdownTreeFileOptions | string | null
  ) => Promise<NativeMarkdownFolderFile>;
  createMarkdownTreeFolder: (
    rootPath: string,
    folderName: string,
    parentPath?: string | null
  ) => Promise<NativeMarkdownFolderFile>;
  deleteMarkdownTemplateFile: (fileName: string) => Promise<unknown>;
  deleteMarkdownTreeFile: (rootPath: string, path: string) => Promise<unknown>;
  detectPandocPath: () => Promise<string | null>;
  downloadWebImage: (input: DownloadNativeWebImageInput) => Promise<File>;
  installMarkdownFileDrop: (onDrop: NativeMarkdownFileDropHandler) => Promise<RuntimeCleanup>;
  listenOpenedMarkdownPaths: (
    onPaths: (paths: string[]) => unknown | Promise<unknown>
  ) => Promise<RuntimeCleanup>;
  listMarkdownFileHistory: (path: string) => Promise<NativeMarkdownFileHistoryEntry[]>;
  listMarkdownFilesForPath: (
    path: string,
    options?: ListNativeMarkdownFilesOptions
  ) => Promise<NativeMarkdownFolderFile[]>;
  loadMarkdownFilesForPath?: (
    path: string,
    options?: LoadNativeMarkdownFilesForPathOptions
  ) => Promise<NativeMarkdownFolderFile[]>;
  moveMarkdownTreeFile: (
    rootPath: string,
    path: string,
    targetParentPath?: string | null
  ) => Promise<NativeMarkdownFolderFile>;
  openContainingFolder: (path: string) => Promise<unknown>;
  openLocalImages: (labels?: NativeMarkdownPickerLabels) => Promise<File[]>;
  openMarkdownAttachment: (input: OpenNativeMarkdownAttachmentInput) => Promise<unknown>;
  openMarkdownFile: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownFile | null>;
  openMarkdownFileInNewWindow: (path: string) => Promise<unknown>;
  openMarkdownFolder: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownFolder | null>;
  openMarkdownFolderInNewWindow: (path: string) => Promise<unknown>;
  openMarkdownPath: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownOpenTarget | null>;
  openSettingsFile: (labels?: NativeMarkdownPickerLabels) => Promise<NativeSettingsFile | null>;
  readLocalImageFile: (path: string) => Promise<File>;
  readMarkdownFile: (path: string) => Promise<NativeMarkdownFile>;
  readMarkdownFileHistory: (path: string, id: string) => Promise<NativeMarkdownFileHistoryFile>;
  readMarkdownImageFile: (input: ReadNativeMarkdownImageInput) => Promise<NativeMarkdownImageFile>;
  readMarkdownTemplateFile: (fileName: string) => Promise<string>;
  renameMarkdownTreeFile: (
    rootPath: string,
    path: string,
    fileName: string
  ) => Promise<NativeMarkdownFolderFile>;
  resolveMarkdownPath: (path: string) => Promise<NativeMarkdownDroppedTarget>;
  saveClipboardImage: (input: SaveNativeClipboardImageInput) => Promise<SavedNativeClipboardImage>;
  saveClipboardAttachment: (input: SaveNativeClipboardAttachmentInput) => Promise<SavedNativeClipboardAttachment>;
  saveHtmlFile: (input: SaveNativeHtmlFileInput) => Promise<SavedNativeHtmlFile | null>;
  saveMarkdownFile: (input: SaveNativeMarkdownFileInput) => Promise<SavedNativeMarkdownFile | null>;
  savePandocFile: (input: SaveNativePandocFileInput) => Promise<SavedNativePandocFile | null>;
  savePdfFile: (input: SaveNativePdfFileInput) => Promise<SavedNativePdfFile | null>;
  saveSettingsFile: (input: SaveNativeSettingsFileInput) => Promise<SavedNativeSettingsFile | null>;
  searchMarkdownFiles?: (request: WorkspaceSearchRequest) => Promise<WorkspaceSearchResponse>;
  syncMarkdownFolder: (input: SyncNativeMarkdownFolderInput) => Promise<NativeMarkdownSyncSummary>;
  takeOpenedMarkdownPaths: () => Promise<string[]>;
  uploadPicGoImage: (input: UploadNativePicGoImageInput) => Promise<SavedNativeClipboardImage>;
  uploadS3Image: (input: UploadNativeS3ImageInput) => Promise<SavedNativeClipboardImage>;
  uploadWebDavImage: (input: UploadNativeWebDavImageInput) => Promise<SavedNativeClipboardImage>;
  watchMarkdownFile: (
    path: string,
    onChange: NativeMarkdownFileChangeHandler,
    onTreeChange?: NativeMarkdownTreeChangeHandler
  ) => Promise<RuntimeCleanup>;
  watchMarkdownTree: (
    path: string,
    onTreeChange: NativeMarkdownTreeChangeHandler
  ) => Promise<RuntimeCleanup>;
  writeMarkdownTemplateFile: (fileName: string, contents: string) => Promise<unknown>;
};

export type AppMenuRuntime = {
  createEditorContextMenuItems: (
    handlers: NativeMenuHandlers,
    language?: AppLanguage,
    options?: NativeEditorContextMenuEntryOptions
  ) => ContextMenuEntry[];
  createMarkdownFileTreeContextMenuItems: (
    handlers: NativeMarkdownFileTreeContextMenuHandlers,
    language?: AppLanguage,
    file?: NativeMarkdownFolderFile
  ) => ContextMenuEntry[];
  installApplicationMenu: (
    handlers: NativeMenuHandlers,
    language?: AppLanguage,
    markdownShortcuts?: MarkdownShortcutMap,
    recentFiles?: readonly RecentMarkdownFile[]
  ) => Promise<RuntimeCleanup>;
  installEditorContextMenu: (
    target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
    handlers: NativeMenuHandlers,
    language?: AppLanguage,
    options?: NativeEditorContextMenuOptions
  ) => Promise<RuntimeCleanup>;
  listenApplicationMenuCommands: (handlers: NativeMenuHandlers) => Promise<RuntimeCleanup>;
  readClipboardText: () => Promise<string | null>;
  showMarkdownFileTreeContextMenu: (
    handlers: NativeMarkdownFileTreeContextMenuHandlers,
    language?: AppLanguage,
    file?: NativeMarkdownFolderFile
  ) => Promise<unknown>;
};

export type AppAiRuntime = {
  requestAiJson: (request: NativeAiHttpRequest) => Promise<NativeAiHttpResponse>;
  requestChat: (request: NativeAiChatRequest) => Promise<NativeAiHttpResponse>;
  requestChatStream: (
    request: NativeAiChatRequest,
    onChunk: (chunk: string) => unknown
  ) => Promise<NativeAiStreamResponse>;
};

export type AppAcpAgentStartConfig = {
  args?: string[];
  command: string;
  cwd?: string | null;
  env?: Array<{ name: string; value: string }>;
};

export type AppAcpAgentConnection = {
  connectionId: string;
};

export type AppAcpAgentMessageEvent = {
  connectionId: string;
  message: string;
  type: "exit" | "message" | "stderr";
};

export type AppAcpRuntime = {
  listenAgentMessages: (handler: (event: AppAcpAgentMessageEvent) => unknown) => Promise<RuntimeCleanup>;
  startAgent: (config: AppAcpAgentStartConfig) => Promise<AppAcpAgentConnection>;
  stopAgent: (connectionId: string) => Promise<unknown>;
  writeAgentMessage: (connectionId: string, message: AcpJsonRpcMessage) => Promise<unknown>;
};

export type AppUpdaterRuntime = {
  checkAppUpdate: () => Promise<NativeAppUpdate | null>;
};

export type AppLogsRuntime = {
  isAvailable: () => boolean;
  openLogFolder: () => Promise<unknown>;
  writeLog: AppLogWriter;
};

export type AppShellCommandRuntime = {
  getShellCommandStatus: () => Promise<NativeShellCommandStatus>;
  installShellCommand: () => Promise<NativeShellCommandStatus>;
  uninstallShellCommand: () => Promise<NativeShellCommandStatus>;
};

export type AppSystemFontFamily = {
  family: string;
  label: string;
};

export type AppSystemFontsRuntime = {
  listFontFamilies: () => Promise<AppSystemFontFamily[]>;
};

export type AppWebResourceRuntime = {
  requestWebResource: (request: NativeWebResourceRequest) => Promise<NativeWebResourceResponse>;
};

export type AppSpellcheckRuntime = {
  deleteSpellcheckDictionary: (manifest: NativeSpellcheckDictionaryManifest) => Promise<unknown>;
  getSpellcheckDictionaryStatus: (
    manifest: NativeSpellcheckDictionaryManifest
  ) => Promise<NativeSpellcheckDictionaryStatus>;
  loadSpellcheckDictionary: (
    manifest: NativeSpellcheckDictionaryManifest,
    options?: NativeSpellcheckDictionaryLoadOptions
  ) => Promise<NativeSpellcheckDictionary>;
};

export type AppFeatureRuntime = {
  ai: boolean;
  export: boolean;
  nativeWindowChrome: boolean;
  networkProxy: boolean;
  pandoc: boolean;
  s3ImageUpload: boolean;
  spellcheck: boolean;
  updater: boolean;
};

export type AppWindowRuntime = {
  closeWindow: () => Promise<unknown>;
  destroyWindow: () => Promise<unknown>;
  exitApp: () => Promise<unknown>;
  getCurrentWindowLabel: () => Promise<string | null>;
  listEditorWindowRestoreStates: () => Promise<NativeEditorWindowRestoreState[]>;
  listenAppExitRequested: (onExitRequested: () => unknown | Promise<unknown>) => Promise<RuntimeCleanup>;
  listenSettingsWindowTarget: (onTarget: (target: NativeSettingsWindowTarget) => unknown) => Promise<RuntimeCleanup>;
  listenWindowCloseRequested: (
    onCloseRequested: (event: NativeWindowCloseRequestEvent) => unknown | Promise<unknown>
  ) => Promise<RuntimeCleanup>;
  minimizeWindow: () => Promise<unknown>;
  openExternalUrl: (url: string) => Promise<unknown>;
  openSettingsWindow: (target?: NativeSettingsWindowTarget) => Promise<unknown>;
  prewarmSettingsWindow: () => Promise<unknown>;
  markSettingsWindowReady: () => Promise<unknown>;
  hideSettingsWindow: () => Promise<unknown>;
  setEditorWindowRestoreState: (input: SetNativeEditorWindowRestoreStateInput) => Promise<unknown>;
  setWindowTitle: (title: string) => Promise<unknown>;
  showWindow: () => Promise<unknown>;
  toggleWindowFullscreen: () => Promise<unknown>;
  toggleWindowMaximized: () => Promise<unknown>;
};

export type AppRuntime = {
  acp: AppAcpRuntime;
  ai: AppAiRuntime;
  dialog: AppDialogRuntime;
  events: AppEventsRuntime;
  features: AppFeatureRuntime;
  files: AppFileRuntime;
  logs: AppLogsRuntime;
  menu: AppMenuRuntime;
  platform: AppPlatformRuntime;
  settings: AppSettingsRuntime;
  shellCommand: AppShellCommandRuntime;
  spellcheck: AppSpellcheckRuntime;
  systemFonts: AppSystemFontsRuntime;
  updater: AppUpdaterRuntime;
  webResource: AppWebResourceRuntime;
  window: AppWindowRuntime;
};

function createMemorySettingsRuntime(): AppSettingsRuntime {
  const stores = new Map<string, Map<string, unknown>>();

  return {
    async loadStore(path, options) {
      if (!stores.has(path)) {
        stores.set(path, new Map(Object.entries(options.defaults)));
      }
      const store = stores.get(path)!;

      return {
        async delete(key) {
          store.delete(key);
        },
        async get<T>(key: string) {
          return store.get(key) as T | undefined;
        },
        async save() {
          return undefined;
        },
        async set(key, value) {
          store.set(key, value);
        }
      };
    }
  };
}

function unsupportedFeature(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is unavailable without a configured app runtime.`));
}

async function readBrowserClipboardText() {
  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
  const readText = clipboard?.readText;
  if (typeof readText !== "function") return null;

  try {
    return await readText.call(clipboard);
  } catch {
    return null;
  }
}

function createDefaultFileRuntime(): AppFileRuntime {
  return {
    confirmMarkdownFileDelete: async () => false,
    confirmUnsavedMarkdownDocumentDiscard: async () => false,
    backupMarkdownFolder: () => unsupportedFeature("backupMarkdownFolder"),
    createMarkdownTreeFile: () => unsupportedFeature("createMarkdownTreeFile"),
    createMarkdownTreeFolder: () => unsupportedFeature("createMarkdownTreeFolder"),
    deleteMarkdownTemplateFile: () => unsupportedFeature("deleteMarkdownTemplateFile"),
    deleteMarkdownTreeFile: () => unsupportedFeature("deleteMarkdownTreeFile"),
    detectPandocPath: async () => null,
    downloadWebImage: () => unsupportedFeature("downloadWebImage"),
    installMarkdownFileDrop: async () => () => undefined,
    listenOpenedMarkdownPaths: async () => () => undefined,
    listMarkdownFileHistory: async () => [],
    listMarkdownFilesForPath: async () => [],
    moveMarkdownTreeFile: () => unsupportedFeature("moveMarkdownTreeFile"),
    openContainingFolder: () => unsupportedFeature("openContainingFolder"),
    openLocalImages: async () => [],
    openMarkdownAttachment: () => unsupportedFeature("openMarkdownAttachment"),
    openMarkdownFile: async () => null,
    openMarkdownFileInNewWindow: () => unsupportedFeature("openMarkdownFileInNewWindow"),
    openMarkdownFolder: async () => null,
    openMarkdownFolderInNewWindow: () => unsupportedFeature("openMarkdownFolderInNewWindow"),
    openMarkdownPath: async () => null,
    openSettingsFile: async () => null,
    readLocalImageFile: () => unsupportedFeature("readLocalImageFile"),
    readMarkdownFile: () => unsupportedFeature("readMarkdownFile"),
    readMarkdownFileHistory: () => unsupportedFeature("readMarkdownFileHistory"),
    readMarkdownImageFile: () => unsupportedFeature("readMarkdownImageFile"),
    readMarkdownTemplateFile: () => unsupportedFeature("readMarkdownTemplateFile"),
    renameMarkdownTreeFile: () => unsupportedFeature("renameMarkdownTreeFile"),
    resolveMarkdownPath: () => unsupportedFeature("resolveMarkdownPath"),
    saveClipboardAttachment: () => unsupportedFeature("saveClipboardAttachment"),
    saveClipboardImage: () => unsupportedFeature("saveClipboardImage"),
    saveHtmlFile: async () => null,
    saveMarkdownFile: async () => null,
    savePandocFile: async () => null,
    savePdfFile: async () => null,
    saveSettingsFile: async () => null,
    syncMarkdownFolder: () => unsupportedFeature("syncMarkdownFolder"),
    takeOpenedMarkdownPaths: async () => [],
    uploadPicGoImage: () => unsupportedFeature("uploadPicGoImage"),
    uploadS3Image: () => unsupportedFeature("uploadS3Image"),
    uploadWebDavImage: () => unsupportedFeature("uploadWebDavImage"),
    watchMarkdownFile: async () => () => undefined,
    watchMarkdownTree: async () => () => undefined,
    writeMarkdownTemplateFile: () => unsupportedFeature("writeMarkdownTemplateFile")
  };
}

export function createDefaultAppRuntime(): AppRuntime {
  return {
    acp: {
      listenAgentMessages: () => unsupportedFeature("listenAgentMessages"),
      startAgent: () => unsupportedFeature("startAgent"),
      stopAgent: () => unsupportedFeature("stopAgent"),
      writeAgentMessage: () => unsupportedFeature("writeAgentMessage")
    },
    ai: {
      requestAiJson: () => unsupportedFeature("requestAiJson"),
      requestChat: () => unsupportedFeature("requestChat"),
      requestChatStream: () => unsupportedFeature("requestChatStream")
    },
    dialog: {
      confirmAiAgentSessionDelete: async () => false,
      showAppAbout: async () => undefined,
      showPandocSetup: async () => "cancel"
    },
    events: {
      emit: async () => undefined,
      isAvailable: () => false,
      listen: async () => () => undefined
    },
    features: {
      ai: true,
      export: true,
      nativeWindowChrome: true,
      networkProxy: true,
      pandoc: true,
      s3ImageUpload: true,
      spellcheck: true,
      updater: true
    },
    files: createDefaultFileRuntime(),
    logs: {
      isAvailable: () => false,
      openLogFolder: () => unsupportedFeature("openLogFolder"),
      writeLog: async (_event: AppLogEvent) => undefined
    },
    menu: {
      createEditorContextMenuItems: () => [],
      createMarkdownFileTreeContextMenuItems: () => [],
      installApplicationMenu: async () => () => undefined,
      installEditorContextMenu: async () => () => undefined,
      listenApplicationMenuCommands: async () => () => undefined,
      readClipboardText: readBrowserClipboardText,
      showMarkdownFileTreeContextMenu: async () => undefined
    },
    platform: {
      resolveDesktopOsVersion: () => null,
      resolveDesktopPlatform: () => null
    },
    settings: createMemorySettingsRuntime(),
    shellCommand: {
      getShellCommandStatus: async () => ({ commandPath: null, targetPath: null, status: "unavailable" }),
      installShellCommand: async () => ({ commandPath: null, targetPath: null, status: "unavailable" }),
      uninstallShellCommand: async () => ({ commandPath: null, targetPath: null, status: "unavailable" })
    },
    spellcheck: {
      deleteSpellcheckDictionary: () => unsupportedFeature("deleteSpellcheckDictionary"),
      getSpellcheckDictionaryStatus: async () => ({ downloaded: false }),
      loadSpellcheckDictionary: () => unsupportedFeature("loadSpellcheckDictionary")
    },
    systemFonts: {
      listFontFamilies: async () => []
    },
    updater: {
      checkAppUpdate: async () => null
    },
    webResource: {
      requestWebResource: () => unsupportedFeature("requestWebResource")
    },
    window: {
      closeWindow: async () => undefined,
      destroyWindow: async () => undefined,
      exitApp: async () => undefined,
      getCurrentWindowLabel: async () => "main",
      listEditorWindowRestoreStates: async () => [],
      listenAppExitRequested: async () => () => undefined,
      listenSettingsWindowTarget: async () => () => undefined,
      listenWindowCloseRequested: async () => () => undefined,
      minimizeWindow: async () => undefined,
      openExternalUrl: async (url) => {
        if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      },
      openSettingsWindow: async () => undefined,
      prewarmSettingsWindow: async () => undefined,
      markSettingsWindowReady: async () => undefined,
      hideSettingsWindow: async () => undefined,
      setEditorWindowRestoreState: async () => undefined,
      setWindowTitle: async (title) => {
        if (typeof document !== "undefined") {
          document.title = title;
        }
      },
      showWindow: async () => undefined,
      toggleWindowFullscreen: async () => undefined,
      toggleWindowMaximized: async () => undefined
    }
  };
}

let appRuntime = createDefaultAppRuntime();

export function configureAppRuntime(runtime: AppRuntime) {
  appRuntime = runtime;
  setAppLogBackendWriter(runtime.logs.writeLog);
}

export function getAppRuntime() {
  return appRuntime;
}

export function resetAppRuntimeForTests() {
  appRuntime = createDefaultAppRuntime();
  setAppLogBackendWriter(appRuntime.logs.writeLog);
}

export type {
  AiProviderSettings,
  AppTheme,
  EditorPreferences,
  ExportSettings,
  NetworkSettings,
  PicGoImageUploadSettings,
  RecentMarkdownFile,
  S3ImageUploadSettings,
  SyncSettings,
  WebDavImageUploadSettings,
  WebDavSyncSettings,
  WebSearchSettings
} from "../lib/settings/app-settings";
export type {
  CreateNativeMarkdownTreeFileOptions,
  DownloadNativeWebImageInput,
  ListNativeMarkdownFilesOptions,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFileChangeHandler,
  NativeMarkdownFileDropHandler,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  NativeMarkdownSyncSummary,
  NativeMarkdownPickerLabels,
  NativeSettingsFile,
  NativeMarkdownTreeChangeHandler,
  NativePandocExportFormat,
  OpenNativeMarkdownAttachmentInput,
  ReadNativeMarkdownImageInput,
  SavedNativeClipboardAttachment,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePandocFile,
  SavedNativePdfFile,
  SavedNativeSettingsFile,
  SaveNativeClipboardAttachmentInput,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePandocFileInput,
  SaveNativePdfFileInput,
  SaveNativeSettingsFileInput,
  SyncNativeMarkdownFolderInput,
  UploadNativePicGoImageInput,
  UploadNativeS3ImageInput,
  UploadNativeWebDavImageInput
} from "../lib/tauri/file";
export type {
  ContextMenuEntry,
  ContextMenuPosition,
  ContextMenuProps,
  ShowContextMenuOptions
} from "../components/ContextMenu";
export {
  closeActiveContextMenu,
  contextMenuItem,
  contextMenuPositionFromEvent,
  contextMenuSeparator,
  contextMenuSubmenu,
  currentContextMenuPosition,
  showContextMenu
} from "../components/ContextMenu";
export {
  createEditorContextMenuEntries,
  createEditorContextMenuEntriesFromOptions,
  createMarkdownFileTreeContextMenuEntries,
  nativeAcceleratorsForMarkdownShortcuts,
  type ContextMenuIdPrefixes
} from "./context-menu-items";
export type {
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuCommand,
  NativeMenuHandlers
} from "../lib/tauri/menu";
export type { NativeAiChatRequest, NativeAiHttpRequest, NativeAiHttpResponse, NativeAiStreamResponse } from "../lib/tauri/native-ai";
export type { NativeAppUpdate, NativeAppUpdateProgress } from "../lib/tauri/updater";
export type { NativePandocSetupAction } from "../lib/tauri/dialog";
export type { NativeShellCommandStatus } from "../lib/tauri/shell-command";
export type { NativeSpellcheckDictionary, NativeSpellcheckDictionaryManifest } from "../lib/tauri/spellcheck";
export type { NativeSpellcheckDictionaryLoadOptions, NativeSpellcheckDictionaryStatus } from "../lib/tauri/spellcheck";
export type { NativeWebResourceRequest, NativeWebResourceResponse } from "../lib/tauri/web-resource";
export type {
  NativeEditorWindowRestoreState,
  NativeSettingsWindowTarget,
  SetNativeEditorWindowRestoreStateInput
} from "../lib/tauri/window";
