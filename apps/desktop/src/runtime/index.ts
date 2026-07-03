import { emit, listen } from "@tauri-apps/api/event";
import { platform as tauriPlatform, version as tauriVersion, type Platform as TauriPlatform } from "@tauri-apps/plugin-os";
import { load } from "@tauri-apps/plugin-store";
import { hasTauriRuntime } from "@markra/shared";
import type { AppRuntime } from "@markra/app/runtime";
import * as acp from "./tauri/acp";
import * as ai from "./tauri/native-ai";
import * as dialog from "./tauri/dialog";
import * as files from "./tauri/file";
import * as fonts from "./tauri/fonts";
import * as menu from "./tauri/menu";
import * as shellCommand from "./tauri/shell-command";
import * as spellcheck from "./tauri/spellcheck";
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

function resolveDesktopOsVersion() {
  try {
    return tauriVersion() || null;
  } catch {
    return null;
  }
}

export const desktopRuntime = {
  acp: {
    listenAgentMessages: acp.listenNativeAcpAgentMessages,
    startAgent: acp.startNativeAcpAgent,
    stopAgent: acp.stopNativeAcpAgent,
    writeAgentMessage: acp.writeNativeAcpAgentMessage
  },
  ai: {
    requestAiJson: ai.requestNativeAiJson,
    requestChat: ai.requestNativeChat,
    requestChatStream: ai.requestNativeChatStream
  },
  dialog: {
    confirmAiAgentSessionDelete: dialog.confirmNativeAiAgentSessionDelete,
    showAppAbout: dialog.showNativeAppAbout,
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
    spellcheck: true,
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
    loadMarkdownFilesForPath: files.loadNativeMarkdownFilesForPath,
    listMarkdownFilesForPath: files.listNativeMarkdownFilesForPath,
    moveMarkdownTreeFile: files.moveNativeMarkdownTreeFile,
    openContainingFolder: files.openNativeContainingFolder,
    openLocalImages: files.openNativeLocalImages,
    openMarkdownAttachment: files.openNativeMarkdownAttachment,
    openMarkdownFile: files.openNativeMarkdownFile,
    openMarkdownFileInNewWindow: files.openNativeMarkdownFileInNewWindow,
    openMarkdownFolder: files.openNativeMarkdownFolder,
    openMarkdownFolderInNewWindow: files.openNativeMarkdownFolderInNewWindow,
    openMarkdownPath: files.openNativeMarkdownPath,
    openSettingsFile: files.openNativeSettingsFile,
    readLocalImageFile: files.readNativeLocalImageFile,
    readMarkdownFile: files.readNativeMarkdownFile,
    readMarkdownFileHistory: files.readNativeMarkdownFileHistory,
    readMarkdownImageFile: files.readNativeMarkdownImageFile,
    readMarkdownTemplateFile: files.readNativeMarkdownTemplateFile,
    renameMarkdownTreeFile: files.renameNativeMarkdownTreeFile,
    resolveMarkdownPath: files.resolveNativeMarkdownPath,
    saveClipboardAttachment: files.saveNativeClipboardAttachment,
    saveClipboardImage: files.saveNativeClipboardImage,
    saveHtmlFile: files.saveNativeHtmlFile,
    saveMarkdownFile: files.saveNativeMarkdownFile,
    savePandocFile: files.saveNativePandocFile,
    savePdfFile: files.saveNativePdfFile,
    saveSettingsFile: files.saveNativeSettingsFile,
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
    readClipboardText: menu.readNativeClipboardText,
    showMarkdownFileTreeContextMenu: menu.showNativeMarkdownFileTreeContextMenu
  },
  platform: {
    resolveDesktopOsVersion,
    resolveDesktopPlatform
  },
  settings: {
    loadStore: load
  },
  shellCommand: {
    getShellCommandStatus: shellCommand.getNativeShellCommandStatus,
    installShellCommand: shellCommand.installNativeShellCommand,
    uninstallShellCommand: shellCommand.uninstallNativeShellCommand
  },
  spellcheck: {
    deleteSpellcheckDictionary: spellcheck.deleteNativeSpellcheckDictionary,
    getSpellcheckDictionaryStatus: spellcheck.getNativeSpellcheckDictionaryStatus,
    loadSpellcheckDictionary: spellcheck.loadNativeSpellcheckDictionary
  },
  systemFonts: {
    listFontFamilies: fonts.listNativeSystemFontFamilies
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
    getCurrentWindowLabel: windowRuntime.getCurrentNativeWindowLabel,
    listEditorWindowRestoreStates: windowRuntime.listNativeEditorWindowRestoreStates,
    listenAppExitRequested: windowRuntime.listenNativeAppExitRequested,
    listenSettingsWindowTarget: windowRuntime.listenNativeSettingsWindowTarget,
    listenWindowCloseRequested: windowRuntime.listenNativeWindowCloseRequested,
    minimizeWindow: windowRuntime.minimizeNativeWindow,
    openExternalUrl: windowRuntime.openNativeExternalUrl,
    openSettingsWindow: windowRuntime.openSettingsWindow,
    prewarmSettingsWindow: windowRuntime.prewarmSettingsWindow,
    markSettingsWindowReady: windowRuntime.markSettingsWindowReady,
    hideSettingsWindow: windowRuntime.hideSettingsWindow,
    setEditorWindowRestoreState: windowRuntime.setNativeEditorWindowRestoreState,
    setWindowTitle: windowRuntime.setNativeWindowTitle,
    showWindow: windowRuntime.showNativeWindow,
    toggleWindowFullscreen: windowRuntime.toggleNativeWindowFullscreen,
    toggleWindowMaximized: windowRuntime.toggleNativeWindowMaximized
  }
} satisfies AppRuntime;
