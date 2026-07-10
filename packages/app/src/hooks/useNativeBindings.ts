import { useEffect, useMemo, useRef } from "react";
import { installNativeMarkdownFileDrop, type NativeMarkdownDroppedTarget } from "../lib/tauri";
import {
  installNativeApplicationMenu,
  installNativeEditorContextMenu,
  type NativeMenuHandlers
} from "../lib/tauri";
import type { RecentMarkdownFile } from "../lib/settings/app-settings";
import type { AiEditIntent } from "@markra/ai";
import {
  defaultMarkdownShortcuts,
  markdownShortcutToKeyboardEventInit,
  normalizeMarkdownShortcuts,
  type MarkdownShortcutAction,
  type MarkdownShortcutMap
} from "@markra/editor";
import {
  aiTranslationLanguageName,
  matchesKeyboardShortcutEvent,
  type AppLanguage
} from "@markra/shared";
import { defaultAiQuickActionPrompt } from "../lib/ai-actions";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import { focusedEditableTextInput } from "../lib/editable-target";

type NativeAiQuickActionIntent = Exclude<AiEditIntent, "custom">;

type NativeMenuHandlerOptions = {
  checkForUpdates?: () => unknown | Promise<unknown>;
  clearRecentFiles?: () => unknown | Promise<unknown>;
  closeDocument?: () => unknown | Promise<unknown>;
  exportDocx?: () => unknown | Promise<unknown>;
  exportEpub?: () => unknown | Promise<unknown>;
  exportHtml?: () => unknown | Promise<unknown>;
  exportLatex?: () => unknown | Promise<unknown>;
  exportPdf?: () => unknown | Promise<unknown>;
  importLocalFiles: () => unknown | Promise<unknown>;
  importLocalImages: () => unknown | Promise<unknown>;
  insertMarkdownImage: () => unknown;
  insertMarkdownLink: () => unknown;
  insertMarkdownSnippet: (open: string, close: string, placeholder: string) => unknown;
  insertMarkdownTable: () => unknown;
  language?: AppLanguage;
  markdownShortcuts?: MarkdownShortcutMap;
  openDocument: () => unknown | Promise<unknown>;
  openFolder: () => unknown | Promise<unknown>;
  openQuickOpen?: () => unknown | Promise<unknown>;
  openRecentFile?: (file: RecentMarkdownFile) => unknown | Promise<unknown>;
  runAiQuickAction?: (intent: NativeAiQuickActionIntent, prompt: string) => unknown | Promise<unknown>;
  runEditorShortcut: (key: string, modifiers?: Pick<KeyboardEventInit, "altKey" | "code" | "shiftKey">) => unknown;
  saveDocument: () => unknown | Promise<unknown>;
  saveDocumentAs: () => unknown | Promise<unknown>;
  toggleAiAgent?: () => unknown | Promise<unknown>;
  toggleAiCommand?: () => unknown | Promise<unknown>;
  toggleDocumentHistory?: () => unknown | Promise<unknown>;
  toggleFullscreen?: () => unknown | Promise<unknown>;
  toggleMarkdownFiles?: () => unknown | Promise<unknown>;
  toggleReadOnlyMode?: () => unknown | Promise<unknown>;
  toggleSourceMode?: () => unknown | Promise<unknown>;
};

type ApplicationShortcutOptions = {
  closeDocument?: () => unknown | Promise<unknown>;
  exportHtml?: () => unknown | Promise<unknown>;
  exportPdf?: () => unknown | Promise<unknown>;
  markdownShortcuts?: MarkdownShortcutMap;
  openDocument: () => unknown | Promise<unknown>;
  openDocumentReplace?: () => unknown | Promise<unknown>;
  openDocumentSearch?: () => unknown | Promise<unknown>;
  openSettings?: () => unknown | Promise<unknown>;
  openWorkspaceSearch?: () => unknown | Promise<unknown>;
  openFolder: () => unknown | Promise<unknown>;
  openQuickOpen?: () => unknown | Promise<unknown>;
  platform?: DesktopPlatform;
  saveDocument: () => unknown | Promise<unknown>;
  saveDocumentAs: () => unknown | Promise<unknown>;
  toggleAiAgent?: () => unknown | Promise<unknown>;
  toggleAiCommand?: () => unknown | Promise<unknown>;
  toggleDocumentHistory?: () => unknown | Promise<unknown>;
  toggleMarkdownFiles?: () => unknown | Promise<unknown>;
  toggleReadOnlyMode?: () => unknown | Promise<unknown>;
  toggleSourceMode?: () => unknown | Promise<unknown>;
};

const emptyRecentMarkdownFiles: readonly RecentMarkdownFile[] = [];

function runFocusedEditableTextCommand(command: "redo" | "undo") {
  if (typeof document === "undefined") return false;

  const control = focusedEditableTextInput(document);
  if (!control) return false;

  const documentTarget = control.ownerDocument;
  const execCommand = (documentTarget as unknown as Record<string, unknown>)["execCommand"];
  if (typeof execCommand !== "function") return true;

  try {
    execCommand.call(documentTarget, command);
  } catch {
    // Keep the command scoped to the focused text control even if the WebView refuses it.
  }

  return true;
}

function isSettingsWindowShortcutEvent(event: KeyboardEvent) {
  const isModKey = event.metaKey || event.ctrlKey;
  return isModKey && !event.altKey && !event.shiftKey && (event.key === "," || event.code === "Comma");
}

function handleSettingsWindowShortcut(event: KeyboardEvent, openSettings?: () => unknown | Promise<unknown>) {
  if (!openSettings || event.defaultPrevented || !isSettingsWindowShortcutEvent(event)) return false;

  event.preventDefault();
  event.stopPropagation();
  openSettings();
  return true;
}

export function useNativeMenuHandlers({
  checkForUpdates,
  clearRecentFiles,
  closeDocument,
  exportDocx,
  exportEpub,
  exportHtml,
  exportLatex,
  exportPdf,
  importLocalFiles,
  importLocalImages,
  insertMarkdownImage,
  insertMarkdownLink,
  insertMarkdownSnippet,
  insertMarkdownTable,
  language = "en",
  markdownShortcuts,
  openDocument,
  openFolder,
  openQuickOpen,
  openRecentFile,
  runAiQuickAction,
  runEditorShortcut,
  saveDocument,
  saveDocumentAs,
  toggleAiAgent,
  toggleAiCommand,
  toggleDocumentHistory,
  toggleFullscreen,
  toggleMarkdownFiles,
  toggleReadOnlyMode,
  toggleSourceMode
}: NativeMenuHandlerOptions) {
  const normalizedMarkdownShortcuts = useMemo(
    () => normalizeMarkdownShortcuts(markdownShortcuts ?? defaultMarkdownShortcuts),
    [markdownShortcuts]
  );
  const latestOptionsRef = useRef({
    checkForUpdates,
    clearRecentFiles,
    exportDocx,
    exportEpub,
    exportHtml,
    exportLatex,
    exportPdf,
    importLocalFiles,
    importLocalImages,
    closeDocument,
    insertMarkdownImage,
    insertMarkdownLink,
    insertMarkdownSnippet,
    insertMarkdownTable,
    language,
    normalizedMarkdownShortcuts,
    openDocument,
    openFolder,
    openQuickOpen,
    openRecentFile,
    runAiQuickAction,
    runEditorShortcut,
    saveDocument,
    saveDocumentAs,
    toggleAiAgent,
    toggleAiCommand,
    toggleDocumentHistory,
    toggleFullscreen,
    toggleMarkdownFiles,
    toggleReadOnlyMode,
    toggleSourceMode
  });
  latestOptionsRef.current = {
    checkForUpdates,
    clearRecentFiles,
    exportDocx,
    exportEpub,
    exportHtml,
    exportLatex,
    exportPdf,
    importLocalFiles,
    importLocalImages,
    closeDocument,
    insertMarkdownImage,
    insertMarkdownLink,
    insertMarkdownSnippet,
    insertMarkdownTable,
    language,
    normalizedMarkdownShortcuts,
    openDocument,
    openFolder,
    openQuickOpen,
    openRecentFile,
    runAiQuickAction,
    runEditorShortcut,
    saveDocument,
    saveDocumentAs,
    toggleAiAgent,
    toggleAiCommand,
    toggleDocumentHistory,
    toggleFullscreen,
    toggleMarkdownFiles,
    toggleReadOnlyMode,
    toggleSourceMode
  };

  return useMemo<NativeMenuHandlers>(
    () => {
      const handlers: NativeMenuHandlers = {
        openDocument: () => latestOptionsRef.current.openDocument(),
        openFolder: () => latestOptionsRef.current.openFolder(),
        saveDocument: () => latestOptionsRef.current.saveDocument(),
        saveDocumentAs: () => latestOptionsRef.current.saveDocumentAs(),
        editUndo: () => {
          if (runFocusedEditableTextCommand("undo")) return;

          latestOptionsRef.current.runEditorShortcut("z");
        },
        editRedo: () => {
          if (runFocusedEditableTextCommand("redo")) return;

          latestOptionsRef.current.runEditorShortcut("z", { shiftKey: true });
        },
        formatBold: () => runMarkdownShortcut("bold"),
        formatItalic: () => runMarkdownShortcut("italic"),
        formatStrikethrough: () => runMarkdownShortcut("strikethrough"),
        formatInlineCode: () => runMarkdownShortcut("inlineCode"),
        formatParagraph: () => runMarkdownShortcut("paragraph"),
        formatHeading1: () => runMarkdownShortcut("heading1"),
        formatHeading2: () => runMarkdownShortcut("heading2"),
        formatHeading3: () => runMarkdownShortcut("heading3"),
        formatBulletList: () => runMarkdownShortcut("bulletList"),
        formatOrderedList: () => runMarkdownShortcut("orderedList"),
        formatQuote: () => runMarkdownShortcut("quote"),
        formatCodeBlock: () => runMarkdownShortcut("codeBlock"),
        insertLink: () => latestOptionsRef.current.insertMarkdownLink(),
        insertImage: () => latestOptionsRef.current.insertMarkdownImage(),
        importLocalImages: () => latestOptionsRef.current.importLocalImages(),
        importLocalFiles: () => latestOptionsRef.current.importLocalFiles(),
        insertTable: () => latestOptionsRef.current.insertMarkdownTable(),
        toggleAllFolds: () => runMarkdownShortcut("toggleAllFolds")
      };

      if (clearRecentFiles) handlers.clearRecentFiles = () => latestOptionsRef.current.clearRecentFiles?.();
      if (checkForUpdates) handlers.checkForUpdates = () => latestOptionsRef.current.checkForUpdates?.();
      if (closeDocument) handlers.closeDocument = () => latestOptionsRef.current.closeDocument?.();
      if (exportPdf) handlers.exportPdf = () => latestOptionsRef.current.exportPdf?.();
      if (exportHtml) handlers.exportHtml = () => latestOptionsRef.current.exportHtml?.();
      if (exportDocx) handlers.exportDocx = () => latestOptionsRef.current.exportDocx?.();
      if (exportEpub) handlers.exportEpub = () => latestOptionsRef.current.exportEpub?.();
      if (exportLatex) handlers.exportLatex = () => latestOptionsRef.current.exportLatex?.();
      if (runAiQuickAction) {
        handlers.aiPolish = () => runLatestAiQuickAction("polish");
        handlers.aiRewrite = () => runLatestAiQuickAction("rewrite");
        handlers.aiContinueWriting = () => runLatestAiQuickAction("continue");
        handlers.aiSummarize = () => runLatestAiQuickAction("summarize");
        handlers.aiTranslate = () => runLatestAiQuickAction("translate");
      }
      if (openRecentFile) handlers.openRecentFile = (file) => latestOptionsRef.current.openRecentFile?.(file);
      if (openQuickOpen) handlers.openQuickOpen = () => latestOptionsRef.current.openQuickOpen?.();
      if (toggleAiAgent) handlers.toggleAiAgent = () => latestOptionsRef.current.toggleAiAgent?.();
      if (toggleAiCommand) handlers.toggleAiCommand = () => latestOptionsRef.current.toggleAiCommand?.();
      if (toggleDocumentHistory) {
        handlers.toggleDocumentHistory = () => latestOptionsRef.current.toggleDocumentHistory?.();
      }
      if (toggleFullscreen) handlers.toggleFullscreen = () => latestOptionsRef.current.toggleFullscreen?.();
      if (toggleMarkdownFiles) handlers.toggleMarkdownFiles = () => latestOptionsRef.current.toggleMarkdownFiles?.();
      if (toggleReadOnlyMode) handlers.toggleReadOnlyMode = () => latestOptionsRef.current.toggleReadOnlyMode?.();
      if (toggleSourceMode) handlers.toggleSourceMode = () => latestOptionsRef.current.toggleSourceMode?.();

      return handlers;
    },
    []
  );

  function runMarkdownShortcut(action: MarkdownShortcutAction) {
    const shortcut = markdownShortcutToKeyboardEventInit(latestOptionsRef.current.normalizedMarkdownShortcuts[action]);
    if (!shortcut) return;

    latestOptionsRef.current.runEditorShortcut(shortcut.key, {
      altKey: Boolean(shortcut.altKey),
      code: shortcut.code,
      shiftKey: Boolean(shortcut.shiftKey)
    });
  }

  function runLatestAiQuickAction(intent: NativeAiQuickActionIntent) {
    const { language: currentLanguage, runAiQuickAction: currentRunAiQuickAction } = latestOptionsRef.current;

    return currentRunAiQuickAction?.(
      intent,
      defaultAiQuickActionPrompt(intent, aiTranslationLanguageName(currentLanguage))
    );
  }
}

function hasMarkdownShortcutOverrides(shortcuts: MarkdownShortcutMap | undefined) {
  if (!shortcuts) return false;

  const normalizedShortcuts = normalizeMarkdownShortcuts(shortcuts);

  return (Object.keys(defaultMarkdownShortcuts) as MarkdownShortcutAction[]).some(
    (action) => normalizedShortcuts[action] !== defaultMarkdownShortcuts[action]
  );
}

export function useNativeMarkdownDrop(onDrop: (target: NativeMarkdownDroppedTarget) => unknown | Promise<unknown>) {
  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    installNativeMarkdownFileDrop(onDrop).then((stopListening) => {
      if (!active) {
        stopListening();
        return;
      }

      cleanup = stopListening;
    }).catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, [onDrop]);
}

export function useNativeMenus(
  handlers: NativeMenuHandlers,
  language: AppLanguage | null = "en",
  options: {
    getAiCommandsAvailable?: () => boolean;
    markdownShortcuts?: MarkdownShortcutMap;
    recentFiles?: readonly RecentMarkdownFile[];
  } = {}
) {
  const markdownShortcuts = hasMarkdownShortcutOverrides(options.markdownShortcuts)
    ? options.markdownShortcuts
    : undefined;
  const recentFiles = options.recentFiles ?? emptyRecentMarkdownFiles;

  useEffect(() => {
    if (!language) return;

    let active = true;
    let cleanup: (() => unknown) | null = null;

    const installMenu = installNativeApplicationMenu(handlers, language, markdownShortcuts, recentFiles);

    installMenu.then((stopListening) => {
      if (!active) {
        stopListening();
        return;
      }

      cleanup = stopListening;
    }).catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, [handlers, language, markdownShortcuts, recentFiles]);

  useEffect(() => {
    if (!language) return;

    let active = true;
    let cleanup: (() => unknown) | null = null;

    installNativeEditorContextMenu(globalThis.document, handlers, language, {
      getAiCommandsAvailable: options.getAiCommandsAvailable,
      markdownShortcuts
    }).then((removeContextMenu) => {
      if (!active) {
        removeContextMenu();
        return;
      }

      cleanup = removeContextMenu;
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [handlers, language, options.getAiCommandsAvailable, markdownShortcuts]);
}

export function useSettingsWindowShortcut(openSettings?: () => unknown | Promise<unknown>) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      handleSettingsWindowShortcut(event, openSettings);
    };

    window.addEventListener("keydown", handleShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleShortcut, true);
    };
  }, [openSettings]);
}

export function useApplicationShortcuts({
  closeDocument,
  exportHtml,
  exportPdf,
  markdownShortcuts,
  openDocument,
  openDocumentReplace,
  openDocumentSearch,
  openSettings,
  openWorkspaceSearch,
  openFolder,
  openQuickOpen,
  platform = resolveDesktopPlatform(),
  saveDocument,
  saveDocumentAs,
  toggleAiAgent,
  toggleAiCommand,
  toggleDocumentHistory,
  toggleMarkdownFiles,
  toggleReadOnlyMode,
  toggleSourceMode
}: ApplicationShortcutOptions) {
  const normalizedMarkdownShortcuts = useMemo(
    () => normalizeMarkdownShortcuts(markdownShortcuts ?? defaultMarkdownShortcuts),
    [markdownShortcuts]
  );

  useEffect(() => {
    const handleApplicationShortcut = (event: KeyboardEvent) => {
      const isModKey = event.metaKey || event.ctrlKey;
      if (event.defaultPrevented || !isModKey) return;

      if (handleSettingsWindowShortcut(event, openSettings)) return;

      const configurableActions: Array<[string, (() => unknown | Promise<unknown>) | undefined]> = [
        [normalizedMarkdownShortcuts.openQuickOpen, openQuickOpen],
        [normalizedMarkdownShortcuts.toggleMarkdownFiles, toggleMarkdownFiles],
        [normalizedMarkdownShortcuts.toggleDocumentHistory, toggleDocumentHistory],
        [normalizedMarkdownShortcuts.toggleAiAgent, toggleAiAgent],
        [normalizedMarkdownShortcuts.toggleAiCommand, toggleAiCommand],
        [normalizedMarkdownShortcuts.toggleSourceMode, toggleSourceMode],
        [normalizedMarkdownShortcuts.toggleReadOnlyMode, toggleReadOnlyMode]
      ];

      for (const [shortcut, handler] of configurableActions) {
        if (!handler || !matchesKeyboardShortcutEvent(event, shortcut)) continue;

        event.preventDefault();
        event.stopPropagation();
        handler();
        return;
      }

      const key = event.key.toLowerCase();
      const isPhysicalFKey = key === "f" || event.code === "KeyF";
      const isCtrlDocumentReplaceShortcut =
        platform !== "macos" && key === "h" && event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

      if (isPhysicalFKey && event.shiftKey && !event.altKey && openWorkspaceSearch) {
        event.preventDefault();
        event.stopPropagation();
        openWorkspaceSearch();
      } else if (isPhysicalFKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey) {
          openDocumentReplace?.();
        } else {
          openDocumentSearch?.();
        }
      } else if (isCtrlDocumentReplaceShortcut && openDocumentReplace) {
        event.preventDefault();
        event.stopPropagation();
        openDocumentReplace();
      } else if (event.altKey) {
        if (key === "p" && !event.shiftKey && exportPdf) {
          event.preventDefault();
          exportPdf();
        }
        return;
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        saveDocumentAs();
      } else if (key === "w" && !event.shiftKey && closeDocument) {
        event.preventDefault();
        closeDocument();
      } else if (key === "s") {
        event.preventDefault();
        saveDocument();
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        openFolder();
      } else if (key === "o") {
        event.preventDefault();
        openDocument();
      } else if (key === "p" && !event.shiftKey && exportPdf) {
        event.preventDefault();
        exportPdf();
      } else if (key === "e" && event.shiftKey && exportHtml) {
        event.preventDefault();
        exportHtml();
      }
    };

    window.addEventListener("keydown", handleApplicationShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleApplicationShortcut, true);
    };
  }, [
    exportHtml,
    exportPdf,
    closeDocument,
    normalizedMarkdownShortcuts,
    openDocument,
    openDocumentReplace,
    openDocumentSearch,
    openSettings,
    openWorkspaceSearch,
    openFolder,
    openQuickOpen,
    platform,
    saveDocument,
    saveDocumentAs,
    toggleAiAgent,
    toggleAiCommand,
    toggleDocumentHistory,
    toggleMarkdownFiles,
    toggleReadOnlyMode,
    toggleSourceMode
  ]);
}
