import { invokeNative } from "./invoke";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createEditorContextMenuEntries,
  createEditorContextMenuEntriesFromOptions,
  createMarkdownFileTreeContextMenuEntries,
  contextMenuPositionFromEvent,
  currentContextMenuPosition,
  nativeAcceleratorsForMarkdownShortcuts,
  showContextMenu,
  type ContextMenuEntry,
  type ContextMenuIdPrefixes,
  type RecentMarkdownFile
} from "@markra/app/runtime";
import type { MarkdownShortcutMap } from "@markra/editor";
import type { AppLanguage } from "@markra/shared";
import type { NativeMarkdownFolderFile } from "./file";
import { listenNativeEvent } from "./events";

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
  openContainingFolder?: (file?: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  openFileToSide?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  multiSelect?: boolean;
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
  | "importLocalImages"
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

type NativeMenuCommandPayload = {
  command: NativeMenuCommand;
  recentFile?: RecentMarkdownFile;
  targetWindowLabel?: string;
};

function currentNativeWindowLabel() {
  try {
    return getCurrentWindow().label;
  } catch {
    return null;
  }
}

function shouldRunNativeMenuAction(payload: NativeMenuCommandPayload) {
  const targetWindowLabel = payload.targetWindowLabel?.trim();
  if (!targetWindowLabel) return true;

  return currentNativeWindowLabel() === targetWindowLabel;
}

function runNativeMenuAction(payload: NativeMenuCommandPayload, handlers: NativeMenuHandlers) {
  if (!shouldRunNativeMenuAction(payload)) return;

  if (payload.command === "openRecentFile") {
    if (!payload.recentFile) return;

    Promise.resolve(handlers.openRecentFile?.(payload.recentFile)).catch(() => {});
    return;
  }

  const handler = handlers[payload.command];
  if (!handler) return;

  Promise.resolve(handler()).catch(() => {});
}

export async function listenNativeApplicationMenuCommands(handlers: NativeMenuHandlers) {
  return listenNativeEvent<NativeMenuCommandPayload>("markra://menu-command", (event) => {
    runNativeMenuAction(event.payload, handlers);
  });
}

export async function installNativeApplicationMenu(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  markdownShortcuts?: MarkdownShortcutMap,
  recentFiles: readonly RecentMarkdownFile[] = []
) {
  const stopListening = await listenNativeApplicationMenuCommands(handlers);

  try {
    await invokeNative("install_application_menu", {
      accelerators: nativeAcceleratorsForMarkdownShortcuts(markdownShortcuts),
      language,
      recentFiles: normalizeRecentFilesForNativeMenu(recentFiles)
    });
  } catch {
    // Keep the Rust-installed startup menu working if runtime menu refresh is unavailable.
  }

  return stopListening;
}

function normalizeRecentFilesForNativeMenu(files: readonly RecentMarkdownFile[]): RecentMarkdownFile[] {
  return files.flatMap((file) => {
    const path = file.path.trim();
    if (!path) return [];

    return [{
      name: file.name.trim() || path.split(/[\\/]/u).at(-1) || path,
      path
    }];
  });
}

export async function readNativeClipboardText() {
  try {
    const text = await invokeNative<string | null>("read_clipboard_text");

    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

function withNativeClipboardText<TOptions extends { readClipboardText?: NativeClipboardTextReader }>(options: TOptions) {
  return {
    ...options,
    readClipboardText: options.readClipboardText ?? readNativeClipboardText
  };
}

export function createNativeEditorContextMenuItems(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: NativeEditorContextMenuEntryOptions = {}
): ContextMenuEntry[] {
  return createEditorContextMenuEntries(handlers, language, withNativeClipboardText(options), desktopContextMenuIdPrefixes);
}

export async function installNativeEditorContextMenu(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: NativeEditorContextMenuOptions = {}
) {
  let closeCurrentMenu: (() => unknown) | null = null;
  const handleContextMenu = (event: Event) => {
    const documentTarget = resolveContextMenuDocument(event);
    const mouseEvent = event instanceof MouseEvent ? event : null;
    const element = event.target instanceof Element ? event.target : null;
    if (!documentTarget || !mouseEvent || !element?.closest(".markdown-paper")) return;

    event.preventDefault();
    event.stopPropagation();
    closeCurrentMenu?.();
    closeCurrentMenu = showContextMenu(documentTarget, {
      entries: createEditorContextMenuEntriesFromOptions(
        handlers,
        language,
        withNativeClipboardText(options),
        desktopContextMenuIdPrefixes
      ),
      position: contextMenuPositionFromEvent(mouseEvent)
    });
  };

  target.addEventListener("contextmenu", handleContextMenu);

  return () => {
    target.removeEventListener("contextmenu", handleContextMenu);
    closeCurrentMenu?.();
  };
}

export function createNativeMarkdownFileTreeContextMenuItems(
  handlers: NativeMarkdownFileTreeContextMenuHandlers,
  language: AppLanguage = "en",
  file?: NativeMarkdownFolderFile
): ContextMenuEntry[] {
  return createMarkdownFileTreeContextMenuEntries(handlers, language, file, desktopContextMenuIdPrefixes);
}

export async function showNativeMarkdownFileTreeContextMenu(
  handlers: NativeMarkdownFileTreeContextMenuHandlers,
  language: AppLanguage = "en",
  file?: NativeMarkdownFolderFile
) {
  const documentTarget = typeof document === "undefined" ? null : document;
  if (!documentTarget) return;

  showContextMenu(documentTarget, {
    entries: createNativeMarkdownFileTreeContextMenuItems(handlers, language, file),
    position: currentContextMenuPosition(documentTarget)
  });
}

const desktopContextMenuIdPrefixes: ContextMenuIdPrefixes = {
  editor: "markra:context",
  fileTree: "markra:file-tree"
};

function resolveContextMenuDocument(event: Event) {
  if (event.target instanceof Node) return event.target.ownerDocument;
  if (typeof document !== "undefined") return document;

  return null;
}
