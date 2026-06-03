import type { AppLanguage } from "@markra/shared";
import type { MarkdownShortcutMap } from "@markra/editor";
import type { DesktopPlatform } from "../lib/platform";
import type {
  NativeAiChatRequest,
  NativeAiHttpRequest,
  NativeAiHttpResponse,
  NativeAiStreamResponse
} from "../lib/tauri/native-ai";
import type { NativeAppUpdate } from "../lib/tauri/updater";
import type {
  CreateNativeMarkdownTreeFileOptions,
  DownloadNativeWebImageInput,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFileChangeHandler,
  NativeMarkdownFileDropHandler,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  NativeMarkdownPickerLabels,
  NativeMarkdownTreeChangeHandler,
  NativePandocExportFormat,
  ReadNativeMarkdownImageInput,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePandocFile,
  SavedNativePdfFile,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePandocFileInput,
  SaveNativePdfFileInput,
  UploadNativePicGoImageInput,
  UploadNativeS3ImageInput,
  UploadNativeWebDavImageInput
} from "../lib/tauri/file";
import type {
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuHandlers
} from "../lib/tauri/menu";
import type {
  NativeEditorWindowRestoreState,
  NativeSettingsWindowTarget,
  NativeWindowCloseRequestEvent,
  SetNativeEditorWindowRestoreStateInput
} from "../lib/tauri/window";
import type { NativePandocSetupAction } from "../lib/tauri/dialog";
import type { NativeWebResourceRequest, NativeWebResourceResponse } from "../lib/tauri/web-resource";

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
  resolveDesktopPlatform: () => DesktopPlatform | null;
};

export type AppDialogRuntime = {
  confirmAiAgentSessionDelete: (
    sessionTitle: string,
    labels: { cancelLabel: string; message: string; okLabel: string }
  ) => Promise<boolean>;
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
  listMarkdownFilesForPath: (path: string) => Promise<NativeMarkdownFolderFile[]>;
  moveMarkdownTreeFile: (
    rootPath: string,
    path: string,
    targetParentPath?: string | null
  ) => Promise<NativeMarkdownFolderFile>;
  openMarkdownFile: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownFile | null>;
  openMarkdownFileInNewWindow: (path: string) => Promise<unknown>;
  openMarkdownFolder: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownFolder | null>;
  openMarkdownFolderInNewWindow: (path: string) => Promise<unknown>;
  openMarkdownPath: (labels?: NativeMarkdownPickerLabels) => Promise<NativeMarkdownOpenTarget | null>;
  readMarkdownFile: (path: string) => Promise<NativeMarkdownFile>;
  readMarkdownImageFile: (input: ReadNativeMarkdownImageInput) => Promise<NativeMarkdownImageFile>;
  readMarkdownTemplateFile: (fileName: string) => Promise<string>;
  renameMarkdownTreeFile: (
    rootPath: string,
    path: string,
    fileName: string
  ) => Promise<NativeMarkdownFolderFile>;
  resolveMarkdownPath: (path: string) => Promise<NativeMarkdownDroppedTarget>;
  saveClipboardImage: (input: SaveNativeClipboardImageInput) => Promise<SavedNativeClipboardImage>;
  saveHtmlFile: (input: SaveNativeHtmlFileInput) => Promise<SavedNativeHtmlFile | null>;
  saveMarkdownFile: (input: SaveNativeMarkdownFileInput) => Promise<SavedNativeMarkdownFile | null>;
  savePandocFile: (input: SaveNativePandocFileInput) => Promise<SavedNativePandocFile | null>;
  savePdfFile: (input: SaveNativePdfFileInput) => Promise<SavedNativePdfFile | null>;
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
    options?: { aiCommandsAvailable?: boolean; markdownShortcuts?: MarkdownShortcutMap }
  ) => unknown[];
  createMarkdownFileTreeContextMenuItems: (
    handlers: NativeMarkdownFileTreeContextMenuHandlers,
    language?: AppLanguage,
    file?: NativeMarkdownFolderFile
  ) => unknown[];
  installApplicationMenu: (
    handlers: NativeMenuHandlers,
    language?: AppLanguage,
    markdownShortcuts?: MarkdownShortcutMap
  ) => Promise<RuntimeCleanup>;
  installEditorContextMenu: (
    target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
    handlers: NativeMenuHandlers,
    language?: AppLanguage,
    options?: NativeEditorContextMenuOptions
  ) => Promise<RuntimeCleanup>;
  listenApplicationMenuCommands: (handlers: NativeMenuHandlers) => Promise<RuntimeCleanup>;
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

export type AppUpdaterRuntime = {
  checkAppUpdate: () => Promise<NativeAppUpdate | null>;
};

export type AppWebResourceRuntime = {
  requestWebResource: (request: NativeWebResourceRequest) => Promise<NativeWebResourceResponse>;
};

export type AppFeatureRuntime = {
  ai: boolean;
  export: boolean;
  nativeWindowChrome: boolean;
  pandoc: boolean;
  s3ImageUpload: boolean;
  updater: boolean;
};

export type AppWindowRuntime = {
  closeWindow: () => Promise<unknown>;
  exitApp: () => Promise<unknown>;
  listEditorWindowRestoreStates: () => Promise<NativeEditorWindowRestoreState[]>;
  listenAppExitRequested: (onExitRequested: () => unknown | Promise<unknown>) => Promise<RuntimeCleanup>;
  listenSettingsWindowTarget: (onTarget: (target: NativeSettingsWindowTarget) => unknown) => Promise<RuntimeCleanup>;
  listenWindowCloseRequested: (
    onCloseRequested: (event: NativeWindowCloseRequestEvent) => unknown | Promise<unknown>
  ) => Promise<RuntimeCleanup>;
  minimizeWindow: () => Promise<unknown>;
  openExternalUrl: (url: string) => Promise<unknown>;
  openSettingsWindow: (target?: NativeSettingsWindowTarget) => Promise<unknown>;
  setEditorWindowRestoreState: (input: SetNativeEditorWindowRestoreStateInput) => Promise<unknown>;
  setWindowTitle: (title: string) => Promise<unknown>;
  toggleWindowMaximized: () => Promise<unknown>;
};

export type AppRuntime = {
  ai: AppAiRuntime;
  dialog: AppDialogRuntime;
  events: AppEventsRuntime;
  features: AppFeatureRuntime;
  files: AppFileRuntime;
  menu: AppMenuRuntime;
  platform: AppPlatformRuntime;
  settings: AppSettingsRuntime;
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

function createDefaultFileRuntime(): AppFileRuntime {
  return {
    confirmMarkdownFileDelete: async () => false,
    confirmUnsavedMarkdownDocumentDiscard: async () => false,
    createMarkdownTreeFile: () => unsupportedFeature("createMarkdownTreeFile"),
    createMarkdownTreeFolder: () => unsupportedFeature("createMarkdownTreeFolder"),
    deleteMarkdownTemplateFile: () => unsupportedFeature("deleteMarkdownTemplateFile"),
    deleteMarkdownTreeFile: () => unsupportedFeature("deleteMarkdownTreeFile"),
    detectPandocPath: async () => null,
    downloadWebImage: () => unsupportedFeature("downloadWebImage"),
    installMarkdownFileDrop: async () => () => undefined,
    listenOpenedMarkdownPaths: async () => () => undefined,
    listMarkdownFilesForPath: async () => [],
    moveMarkdownTreeFile: () => unsupportedFeature("moveMarkdownTreeFile"),
    openMarkdownFile: async () => null,
    openMarkdownFileInNewWindow: () => unsupportedFeature("openMarkdownFileInNewWindow"),
    openMarkdownFolder: async () => null,
    openMarkdownFolderInNewWindow: () => unsupportedFeature("openMarkdownFolderInNewWindow"),
    openMarkdownPath: async () => null,
    readMarkdownFile: () => unsupportedFeature("readMarkdownFile"),
    readMarkdownImageFile: () => unsupportedFeature("readMarkdownImageFile"),
    readMarkdownTemplateFile: () => unsupportedFeature("readMarkdownTemplateFile"),
    renameMarkdownTreeFile: () => unsupportedFeature("renameMarkdownTreeFile"),
    resolveMarkdownPath: () => unsupportedFeature("resolveMarkdownPath"),
    saveClipboardImage: () => unsupportedFeature("saveClipboardImage"),
    saveHtmlFile: async () => null,
    saveMarkdownFile: async () => null,
    savePandocFile: async () => null,
    savePdfFile: async () => null,
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
    ai: {
      requestAiJson: () => unsupportedFeature("requestAiJson"),
      requestChat: () => unsupportedFeature("requestChat"),
      requestChatStream: () => unsupportedFeature("requestChatStream")
    },
    dialog: {
      confirmAiAgentSessionDelete: async () => false,
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
      pandoc: true,
      s3ImageUpload: true,
      updater: true
    },
    files: createDefaultFileRuntime(),
    menu: {
      createEditorContextMenuItems: () => [],
      createMarkdownFileTreeContextMenuItems: () => [],
      installApplicationMenu: async () => () => undefined,
      installEditorContextMenu: async () => () => undefined,
      listenApplicationMenuCommands: async () => () => undefined,
      showMarkdownFileTreeContextMenu: async () => undefined
    },
    platform: {
      resolveDesktopPlatform: () => null
    },
    settings: createMemorySettingsRuntime(),
    updater: {
      checkAppUpdate: async () => null
    },
    webResource: {
      requestWebResource: () => unsupportedFeature("requestWebResource")
    },
    window: {
      closeWindow: async () => undefined,
      exitApp: async () => undefined,
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
      setEditorWindowRestoreState: async () => undefined,
      setWindowTitle: async (title) => {
        if (typeof document !== "undefined") {
          document.title = title;
        }
      },
      toggleWindowMaximized: async () => undefined
    }
  };
}

let appRuntime = createDefaultAppRuntime();

export function configureAppRuntime(runtime: AppRuntime) {
  appRuntime = runtime;
}

export function getAppRuntime() {
  return appRuntime;
}

export function resetAppRuntimeForTests() {
  appRuntime = createDefaultAppRuntime();
}

export type {
  AiProviderSettings,
  AppTheme,
  EditorPreferences,
  ExportSettings,
  PicGoImageUploadSettings,
  S3ImageUploadSettings,
  WebDavImageUploadSettings,
  WebSearchSettings
} from "../lib/settings/app-settings";
export type {
  CreateNativeMarkdownTreeFileOptions,
  DownloadNativeWebImageInput,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFileChangeHandler,
  NativeMarkdownFileDropHandler,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  NativeMarkdownPickerLabels,
  NativeMarkdownTreeChangeHandler,
  NativePandocExportFormat,
  ReadNativeMarkdownImageInput,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePandocFile,
  SavedNativePdfFile,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePandocFileInput,
  SaveNativePdfFileInput,
  UploadNativePicGoImageInput,
  UploadNativeS3ImageInput,
  UploadNativeWebDavImageInput
} from "../lib/tauri/file";
export type {
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuCommand,
  NativeMenuHandlers
} from "../lib/tauri/menu";
export type { NativeAiChatRequest, NativeAiHttpRequest, NativeAiHttpResponse, NativeAiStreamResponse } from "../lib/tauri/native-ai";
export type { NativeAppUpdate, NativeAppUpdateProgress } from "../lib/tauri/updater";
export type { NativePandocSetupAction } from "../lib/tauri/dialog";
export type { NativeWebResourceRequest, NativeWebResourceResponse } from "../lib/tauri/web-resource";
export type {
  NativeEditorWindowRestoreState,
  NativeSettingsWindowTarget,
  SetNativeEditorWindowRestoreStateInput
} from "../lib/tauri/window";
