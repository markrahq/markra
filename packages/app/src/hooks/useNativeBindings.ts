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
  insertMarkdownSnippet: (open: string, close: string, placeholder: string) => unknown;
  insertMarkdownTable: () => unknown;
  language?: AppLanguage;
  markdownShortcuts?: MarkdownShortcutMap;
  openDocument: () => unknown | Promise<unknown>;
  openFolder: () => unknown | Promise<unknown>;
  openRecentFile?: (file: RecentMarkdownFile) => unknown | Promise<unknown>;
  runAiQuickAction?: (intent: NativeAiQuickActionIntent, prompt: string) => unknown | Promise<unknown>;
  runEditorShortcut: (key: string, modifiers?: Pick<KeyboardEventInit, "altKey" | "shiftKey">) => unknown;
  saveDocument: () => unknown | Promise<unknown>;
  saveDocumentAs: () => unknown | Promise<unknown>;
  toggleAiAgent?: () => unknown | Promise<unknown>;
  toggleAiCommand?: () => unknown | Promise<unknown>;
  toggleDocumentHistory?: () => unknown | Promise<unknown>;
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
  openWorkspaceSearch?: () => unknown | Promise<unknown>;
  openFolder: () => unknown | Promise<unknown>;
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

export function useNativeMenuHandlers({
  checkForUpdates,
  clearRecentFiles,
  closeDocument,
  exportDocx,
  exportEpub,
  exportHtml,
  exportLatex,
  exportPdf,
  insertMarkdownSnippet,
  insertMarkdownTable,
  language = "en",
  markdownShortcuts,
  openDocument,
  openFolder,
  openRecentFile,
  runAiQuickAction,
  runEditorShortcut,
  saveDocument,
  saveDocumentAs,
  toggleAiAgent,
  toggleAiCommand,
  toggleDocumentHistory,
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
    closeDocument,
    insertMarkdownSnippet,
    insertMarkdownTable,
    language,
    normalizedMarkdownShortcuts,
    openDocument,
    openFolder,
    openRecentFile,
    runAiQuickAction,
    runEditorShortcut,
    saveDocument,
    saveDocumentAs,
    toggleAiAgent,
    toggleAiCommand,
    toggleDocumentHistory,
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
    closeDocument,
    insertMarkdownSnippet,
    insertMarkdownTable,
    language,
    normalizedMarkdownShortcuts,
    openDocument,
    openFolder,
    openRecentFile,
    runAiQuickAction,
    runEditorShortcut,
    saveDocument,
    saveDocumentAs,
    toggleAiAgent,
    toggleAiCommand,
    toggleDocumentHistory,
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
        insertLink: () => latestOptionsRef.current.insertMarkdownSnippet("[", "](https://)", "text"),
        insertImage: () => latestOptionsRef.current.insertMarkdownSnippet("![", "](https://)", "alt"),
        insertTable: () => latestOptionsRef.current.insertMarkdownTable()
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
      if (toggleAiAgent) handlers.toggleAiAgent = () => latestOptionsRef.current.toggleAiAgent?.();
      if (toggleAiCommand) handlers.toggleAiCommand = () => latestOptionsRef.current.toggleAiCommand?.();
      if (toggleDocumentHistory) {
        handlers.toggleDocumentHistory = () => latestOptionsRef.current.toggleDocumentHistory?.();
      }
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

export function useApplicationShortcuts({
  closeDocument,
  exportHtml,
  exportPdf,
  markdownShortcuts,
  openDocument,
  openDocumentReplace,
  openDocumentSearch,
  openWorkspaceSearch,
  openFolder,
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

      const configurableActions: Array<[string, (() => unknown | Promise<unknown>) | undefined]> = [
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
      if (key === "f" && event.shiftKey && !event.altKey && openWorkspaceSearch) {
        event.preventDefault();
        event.stopPropagation();
        openWorkspaceSearch();
      } else if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey) {
          openDocumentReplace?.();
        } else {
          openDocumentSearch?.();
        }
      } else if (event.altKey) {
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
    openWorkspaceSearch,
    openFolder,
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
