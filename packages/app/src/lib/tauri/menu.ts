import type { MarkdownShortcutMap } from "@markra/editor";
import type { AppLanguage } from "@markra/shared";
import { getAppRuntime } from "../../runtime";
import type { NativeMarkdownFolderFile } from "./file";

export type NativeMenuHandlers = Partial<Record<NativeMenuCommand, () => unknown | Promise<unknown>>>;

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

export type NativeEditorContextMenuOptions = {
  getAiCommandsAvailable?: () => boolean;
  markdownShortcuts?: MarkdownShortcutMap;
};

export type NativeMenuCommand =
  | "checkForUpdates"
  | "openDocument"
  | "openFolder"
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
  | "toggleMarkdownFiles"
  | "toggleDocumentHistory"
  | "toggleAiAgent"
  | "toggleAiCommand"
  | "toggleReadOnlyMode"
  | "toggleSourceMode";

export function listenNativeApplicationMenuCommands(handlers: NativeMenuHandlers) {
  return getAppRuntime().menu.listenApplicationMenuCommands(handlers);
}

export function installNativeApplicationMenu(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  markdownShortcuts?: MarkdownShortcutMap
) {
  return getAppRuntime().menu.installApplicationMenu(handlers, language, markdownShortcuts);
}

export function createNativeEditorContextMenuItems(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: { aiCommandsAvailable?: boolean; markdownShortcuts?: MarkdownShortcutMap } = {}
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
