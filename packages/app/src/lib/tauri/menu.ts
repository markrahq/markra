import type { MarkdownShortcutMap } from "@markra/editor";
import type { AppLanguage } from "@markra/shared";
import { getAppRuntime } from "../../runtime";
import type { RecentMarkdownFile } from "../settings/app-settings";
import type { NativeMarkdownFolderFile } from "./file";

export type NativeMenuHandlers = Partial<Record<NativeStaticMenuCommand, () => unknown | Promise<unknown>>> & {
  clearRecentFiles?: () => unknown | Promise<unknown>;
  openRecentFile?: (file: RecentMarkdownFile) => unknown | Promise<unknown>;
};

export type NativeMarkdownFileTreeContextMenuHandlers = {
  canOpenFileToSide?: (file: NativeMarkdownFolderFile) => boolean;
  createFile?: () => unknown | Promise<unknown>;
  createFileFromTemplates?: Array<{
    create: () => unknown | Promise<unknown>;
    id: string;
    name: string;
  }>;
  createFolder?: () => unknown | Promise<unknown>;
  deleteFile?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  openFileToSide?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  renameFile?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  saveFileAsTemplate?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
};

export type NativeClipboardTextReader = () => string | null | undefined | Promise<string | null | undefined>;

export type NativeEditorContextMenuOptions = {
  getAiCommandsAvailable?: () => boolean;
  markdownShortcuts?: MarkdownShortcutMap;
  readClipboardText?: NativeClipboardTextReader;
};

export type NativeEditorContextMenuEntryOptions = {
  aiCommandsAvailable?: boolean;
  markdownShortcuts?: MarkdownShortcutMap;
  readClipboardText?: NativeClipboardTextReader;
};

export type NativeStaticMenuCommand =
  | "checkForUpdates"
  | "editUndo"
  | "editRedo"
  | "openDocument"
  | "openFolder"
  | "openQuickOpen"
  | "closeDocument"
  | "saveDocument"
  | "saveDocumentAs"
  | "exportPdf"
  | "exportHtml"
  | "exportDocx"
  | "exportEpub"
  | "exportLatex"
  | "formatBold"
  | "formatItalic"
  | "formatStrikethrough"
  | "formatInlineCode"
  | "formatParagraph"
  | "formatHeading1"
  | "formatHeading2"
  | "formatHeading3"
  | "formatBulletList"
  | "formatOrderedList"
  | "formatQuote"
  | "formatCodeBlock"
  | "insertLink"
  | "insertImage"
  | "insertTable"
  | "aiPolish"
  | "aiRewrite"
  | "aiContinueWriting"
  | "aiSummarize"
  | "aiTranslate"
  | "toggleFullscreen"
  | "toggleMarkdownFiles"
  | "toggleDocumentHistory"
  | "toggleAiAgent"
  | "toggleAiCommand"
  | "toggleAllFolds"
  | "toggleReadOnlyMode"
  | "toggleSourceMode";

export type NativeMenuCommand =
  | NativeStaticMenuCommand
  | "clearRecentFiles"
  | "openRecentFile";

export function listenNativeApplicationMenuCommands(handlers: NativeMenuHandlers) {
  return getAppRuntime().menu.listenApplicationMenuCommands(handlers);
}

export function installNativeApplicationMenu(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  markdownShortcuts?: MarkdownShortcutMap,
  recentFiles?: readonly RecentMarkdownFile[]
) {
  return getAppRuntime().menu.installApplicationMenu(handlers, language, markdownShortcuts, recentFiles);
}

export function createNativeEditorContextMenuItems(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: NativeEditorContextMenuEntryOptions = {}
) {
  return getAppRuntime().menu.createEditorContextMenuItems(handlers, language, options);
}

export function installNativeEditorContextMenu(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: NativeEditorContextMenuOptions = {}
) {
  return getAppRuntime().menu.installEditorContextMenu(target, handlers, language, options);
}

export function createNativeMarkdownFileTreeContextMenuItems(
  handlers: NativeMarkdownFileTreeContextMenuHandlers,
  language: AppLanguage = "en",
  file?: NativeMarkdownFolderFile
) {
  return getAppRuntime().menu.createMarkdownFileTreeContextMenuItems(handlers, language, file);
}

export function showNativeMarkdownFileTreeContextMenu(
  handlers: NativeMarkdownFileTreeContextMenuHandlers,
  language: AppLanguage = "en",
  file?: NativeMarkdownFolderFile
) {
  return getAppRuntime().menu.showMarkdownFileTreeContextMenu(handlers, language, file);
}
