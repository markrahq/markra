import { emit, listen } from "@tauri-apps/api/event";
import { platform as tauriPlatform, type Platform as TauriPlatform } from "@tauri-apps/plugin-os";
import { load } from "@tauri-apps/plugin-store";
import { hasTauriRuntime } from "@markra/shared";
import type { AppRuntime } from "@markra/app/runtime";
import * as ai from "./tauri/native-ai";
import * as dialog from "./tauri/dialog";
import * as files from "./tauri/file";
import * as menu from "./tauri/menu";
import * as updater from "./tauri/updater";
import * as webResource from "./tauri/web-resource";
import * as windowRuntime from "./tauri/window";

type DesktopPlatform = "macos" | "windows" | "linux";

function normalizeDesktopPlatform(platform: string | null | undefined): DesktopPlatform | null {
  if (platform === "windows" || platform === "macos" || platform === "linux") {
    return platform;
  }

  return null;
}

function resolveDesktopPlatform() {
  try {
    return normalizeDesktopPlatform(tauriPlatform() satisfies TauriPlatform);
  } catch {
    return null;
  }
}

export const desktopRuntime = {
  ai: {
    requestAiJson: ai.requestNativeAiJson,
    requestChat: ai.requestNativeChat,
    requestChatStream: ai.requestNativeChatStream
  },
  dialog: {
    confirmAiAgentSessionDelete: dialog.confirmNativeAiAgentSessionDelete,
    showPandocSetup: dialog.showNativePandocSetup
  },
  events: {
    emit,
    isAvailable: hasTauriRuntime,
    listen
  },
  features: {
    ai: true,
    export: true,
    nativeWindowChrome: true,
    networkProxy: true,
    pandoc: true,
    s3ImageUpload: true,
    updater: true
  },
  files: {
    backupMarkdownFolder: files.backupNativeMarkdownFolder,
    confirmMarkdownFileDelete: files.confirmNativeMarkdownFileDelete,
    confirmUnsavedMarkdownDocumentDiscard: files.confirmNativeUnsavedMarkdownDocumentDiscard,
    createMarkdownTreeFile: files.createNativeMarkdownTreeFile,
    createMarkdownTreeFolder: files.createNativeMarkdownTreeFolder,
    deleteMarkdownTemplateFile: files.deleteNativeMarkdownTemplateFile,
    deleteMarkdownTreeFile: files.deleteNativeMarkdownTreeFile,
    detectPandocPath: files.detectNativePandocPath,
    downloadWebImage: files.downloadNativeWebImage,
    installMarkdownFileDrop: files.installNativeMarkdownFileDrop,
    listenOpenedMarkdownPaths: files.listenNativeOpenedMarkdownPaths,
    listMarkdownFileHistory: files.listNativeMarkdownFileHistory,
    listMarkdownFilesForPath: files.listNativeMarkdownFilesForPath,
    moveMarkdownTreeFile: files.moveNativeMarkdownTreeFile,
    openMarkdownFile: files.openNativeMarkdownFile,
    openMarkdownFileInNewWindow: files.openNativeMarkdownFileInNewWindow,
    openMarkdownFolder: files.openNativeMarkdownFolder,
    openMarkdownFolderInNewWindow: files.openNativeMarkdownFolderInNewWindow,
    openMarkdownPath: files.openNativeMarkdownPath,
    readMarkdownFile: files.readNativeMarkdownFile,
    readMarkdownFileHistory: files.readNativeMarkdownFileHistory,
    readMarkdownImageFile: files.readNativeMarkdownImageFile,
    readMarkdownTemplateFile: files.readNativeMarkdownTemplateFile,
    renameMarkdownTreeFile: files.renameNativeMarkdownTreeFile,
    resolveMarkdownPath: files.resolveNativeMarkdownPath,
    saveClipboardImage: files.saveNativeClipboardImage,
    saveHtmlFile: files.saveNativeHtmlFile,
    saveMarkdownFile: files.saveNativeMarkdownFile,
    savePandocFile: files.saveNativePandocFile,
    savePdfFile: files.saveNativePdfFile,
    searchMarkdownFiles: files.searchNativeMarkdownFilesForPath,
    syncMarkdownFolder: files.syncNativeMarkdownFolder,
    takeOpenedMarkdownPaths: files.takeNativeOpenedMarkdownPaths,
    uploadPicGoImage: files.uploadNativePicGoImage,
    uploadS3Image: files.uploadNativeS3Image,
    uploadWebDavImage: files.uploadNativeWebDavImage,
    watchMarkdownFile: files.watchNativeMarkdownFile,
    watchMarkdownTree: files.watchNativeMarkdownTree,
    writeMarkdownTemplateFile: files.writeNativeMarkdownTemplateFile
  },
  menu: {
    createEditorContextMenuItems: menu.createNativeEditorContextMenuItems,
    createMarkdownFileTreeContextMenuItems: menu.createNativeMarkdownFileTreeContextMenuItems,
    installApplicationMenu: menu.installNativeApplicationMenu,
    installEditorContextMenu: menu.installNativeEditorContextMenu,
    listenApplicationMenuCommands: menu.listenNativeApplicationMenuCommands,
    showMarkdownFileTreeContextMenu: menu.showNativeMarkdownFileTreeContextMenu
  },
  platform: {
    resolveDesktopPlatform
  },
  settings: {
    loadStore: load
  },
  updater: {
    checkAppUpdate: updater.checkNativeAppUpdate
  },
  webResource: {
    requestWebResource: webResource.requestNativeWebResource
  },
  window: {
    closeWindow: windowRuntime.closeNativeWindow,
    exitApp: windowRuntime.exitNativeApp,
    listEditorWindowRestoreStates: windowRuntime.listNativeEditorWindowRestoreStates,
    listenAppExitRequested: windowRuntime.listenNativeAppExitRequested,
    listenSettingsWindowTarget: windowRuntime.listenNativeSettingsWindowTarget,
    listenWindowCloseRequested: windowRuntime.listenNativeWindowCloseRequested,
    minimizeWindow: windowRuntime.minimizeNativeWindow,
    openExternalUrl: windowRuntime.openNativeExternalUrl,
    openSettingsWindow: windowRuntime.openSettingsWindow,
    setEditorWindowRestoreState: windowRuntime.setNativeEditorWindowRestoreState,
    setWindowTitle: windowRuntime.setNativeWindowTitle,
    toggleWindowFullscreen: windowRuntime.toggleNativeWindowFullscreen,
    toggleWindowMaximized: windowRuntime.toggleNativeWindowMaximized
  }
} satisfies AppRuntime;
