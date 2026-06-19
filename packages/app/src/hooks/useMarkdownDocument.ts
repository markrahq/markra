import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialMarkdown } from "../constants/initial-markdown";
import {
  clearStoredRecentMarkdownFiles,
  consumeWelcomeDocumentState,
  createAiAgentSessionId,
  getStoredRecentMarkdownFiles,
  getStoredWorkspaceState,
  prependRecentMarkdownFile,
  removeStoredRecentMarkdownFile,
  saveStoredRecentMarkdownFile,
  saveStoredWorkspaceState,
  type RecentMarkdownFile,
  type StoredWorkspaceDraftTab
} from "../lib/settings/app-settings";
import { getMarkdownOutline, getWordCount, type MarkdownOutlineItem } from "@markra/markdown";
import {
  exitNativeApp,
  openNativeMarkdownFolderInNewWindow,
  openNativeMarkdownFileInNewWindow,
  openNativeMarkdownPath,
  readNativeMarkdownFile,
  resolveNativeMarkdownPath,
  saveNativeMarkdownFile,
  setNativeEditorWindowRestoreState,
  listenNativeAppExitRequested,
  listenNativeWindowCloseRequested,
  listenNativeOpenedMarkdownPaths,
  takeNativeOpenedMarkdownPaths,
  watchNativeMarkdownFile,
  type NativeMarkdownDroppedTarget,
  type NativeMarkdownFile,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import { shouldBlockLargeMarkdownVisual } from "../lib/large-markdown";
import { scheduleMarkdownSummaryIdle, shouldDeferMarkdownSummary } from "../lib/markdown-summary";
import {
  measureAppPerformance,
  measureAppPerformanceAsync
} from "../lib/performance-marks";
import { normalizeComparablePath, replaceMovedPath, sameNativePath } from "../lib/path-move";
import { setNativeWindowTitle } from "../lib/tauri";
import { debug, isMarkdownPath, parentPathFromPath, pathNameFromPath, type DocumentState } from "@markra/shared";
import {
  activeFilePathFromTabs,
  activeFilePathFromWindowRestore,
  blankDocumentName,
  createDocumentTab,
  createInitialDocumentState,
  defaultSaveDirectoryInput,
  documentFromDraftTab,
  documentFromTab,
  draftWorkspacePatchFromTabs,
  fileTabId,
  isDeletedDocumentPath,
  isEquivalentEditorMarkdown,
  isPristineUntitledDocument,
  normalizeOpenFilePaths,
  openFilePathsFromTabs,
  restoreFilePathsFromWorkspace,
  type MarkdownDocumentTab
} from "./markdown-document/document-model";

export type { MarkdownDocumentTab } from "./markdown-document/document-model";

function isBlankEditorWindow() {
  return new URLSearchParams(window.location.search).has("blank");
}

function initialMarkdownFilePath() {
  return new URLSearchParams(window.location.search).get("path");
}

function initialMarkdownFolderPath() {
  return new URLSearchParams(window.location.search).get("folder");
}

type CreateBlankDocumentOptions = {
  content?: string;
  name?: string;
};

type MarkdownChangeOptions = {
  documentRevision?: number;
  surface?: "source" | "visual";
};

type SaveCurrentDocumentContentOptions = {
  historyCursorId?: string;
  skipHistorySnapshot?: boolean;
};

type ApplySavedCurrentDocumentOptions = {
  retargetWorkspaceRoot?: boolean;
  sourceContent?: string;
  targetTabId?: string | null;
};

type MarkdownDocumentSummary = {
  key: string;
  outlineItems: MarkdownOutlineItem[];
  wordCount: number;
};

const emptyMarkdownDocumentSummary: Omit<MarkdownDocumentSummary, "key"> = {
  outlineItems: [],
  wordCount: 0
};

function markdownDocumentSummaryKey(document: DocumentState) {
  return [
    document.revision,
    document.content.length,
    document.sizeBytes ?? "unknown-size"
  ].join(":");
}

function calculateMarkdownDocumentSummary(
  content: string,
  detail: Record<string, unknown>
): Omit<MarkdownDocumentSummary, "key"> {
  return measureAppPerformance("markdown-summary", () => ({
    outlineItems: getMarkdownOutline(content),
    wordCount: getWordCount(content)
  }), detail);
}

type UseMarkdownDocumentOptions = {
  beforeNativeAppExit?: () => unknown | Promise<unknown>;
  confirmDiscardUnsavedChanges?: (document: DocumentState) => boolean | Promise<boolean>;
  defaultSaveDirectory?: string | null;
  documentTabsEnabled?: boolean;
  editorReady?: boolean | (() => boolean);
  getCurrentMarkdown: (fallbackContent: string) => string;
  isCurrentMarkdownEquivalent?: (markdown: string) => boolean | undefined;
  onMarkdownTreeChange?: (path: string) => unknown | Promise<unknown>;
  onTreeRootFromFolderPath: (
    path: string,
    name: string,
    sessionId?: string | null,
    clearFilePath?: boolean,
    openTree?: boolean
  ) => unknown | Promise<unknown>;
  onTreeRootFromFilePath: (path: string) => unknown;
  onWorkspaceSessionChange?: (sessionId: string) => unknown;
  preferencesReady?: boolean;
  restoreWorkspaceOnStartup?: boolean;
  workspaceSourcePath?: string | null;
};

type ClearOpenDocumentOptions = {
  persistWorkspace?: boolean;
};

type OpenMarkdownFileOptions = {
  pickerTitle?: string;
};

function persistWorkspaceState(patch: Parameters<typeof saveStoredWorkspaceState>[0]) {
  saveStoredWorkspaceState(patch).catch(() => {});
}

function resolveEditorReady(editorReady: boolean | (() => boolean)) {
  return typeof editorReady === "function" ? editorReady() : editorReady;
}

function isPathWithinRoot(path: string, rootPath: string | null) {
  const normalizedPath = normalizeComparablePath(path);
  const normalizedRootPath = normalizeComparablePath(rootPath);
  if (!normalizedPath || !normalizedRootPath) return false;
  if (normalizedPath === normalizedRootPath) return true;

  const rootWithSeparator = normalizedRootPath.endsWith("/")
    ? normalizedRootPath
    : `${normalizedRootPath}/`;
  return normalizedPath.startsWith(rootWithSeparator);
}

function workspaceRootForSource(sourcePath: string | null | undefined, currentFilePath: string | null) {
  const normalizedSourcePath = normalizeComparablePath(sourcePath);
  if (normalizedSourcePath) {
    return isMarkdownPath(normalizedSourcePath)
      ? parentPathFromPath(normalizedSourcePath)
      : normalizedSourcePath;
  }

  const normalizedCurrentFilePath = normalizeComparablePath(currentFilePath);
  return normalizedCurrentFilePath ? parentPathFromPath(normalizedCurrentFilePath) : null;
}

export function useMarkdownDocument({
  beforeNativeAppExit,
  confirmDiscardUnsavedChanges,
  defaultSaveDirectory,
  documentTabsEnabled = false,
  editorReady = true,
  getCurrentMarkdown,
  isCurrentMarkdownEquivalent,
  onMarkdownTreeChange,
  onTreeRootFromFolderPath,
  onTreeRootFromFilePath,
  onWorkspaceSessionChange,
  preferencesReady = true,
  restoreWorkspaceOnStartup = true,
  workspaceSourcePath
}: UseMarkdownDocumentOptions) {
  const [document, setDocument] = useState<DocumentState>(() => createInitialDocumentState());
  const [tabs, setTabs] = useState<MarkdownDocumentTab[]>(() => [createDocumentTab(createInitialDocumentState(), "untitled:0")]);
  const [activeTabId, setActiveTabId] = useState<string | null>("untitled:0");
  const [workspaceSessionId, setWorkspaceSessionId] = useState<string | null>(null);
  const [nativeOpenedPathsReady, setNativeOpenedPathsReady] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentMarkdownFile[]>([]);
  const [deferredMarkdownSummary, setDeferredMarkdownSummary] = useState<MarkdownDocumentSummary | null>(null);
  const documentRef = useRef(document);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef<string | null>(activeTabId);
  const untitledTabIndexRef = useRef(1);
  const workspaceSessionIdRef = useRef<string | null>(null);
  const openedFromNativeRef = useRef(false);
  const startupWorkspaceRestoreAttemptedRef = useRef(false);
  const largeDocumentSummariesBlocked = useMemo(
    () => shouldBlockLargeMarkdownVisual(document.content, { sizeBytes: document.sizeBytes }),
    [document.content, document.sizeBytes]
  );
  const markdownSummaryDeferred = useMemo(
    () =>
      !largeDocumentSummariesBlocked &&
      shouldDeferMarkdownSummary(document.content, { sizeBytes: document.sizeBytes }),
    [document.content, document.sizeBytes, largeDocumentSummariesBlocked]
  );
  const markdownSummaryKey = useMemo(() => markdownDocumentSummaryKey(document), [
    document.content.length,
    document.revision,
    document.sizeBytes
  ]);
  const immediateMarkdownSummary = useMemo(
    () =>
      largeDocumentSummariesBlocked || markdownSummaryDeferred
        ? emptyMarkdownDocumentSummary
        : calculateMarkdownDocumentSummary(document.content, {
          chars: document.content.length,
          deferred: false,
          name: document.name,
          path: document.path,
          sizeBytes: document.sizeBytes ?? null
        }),
    [
      document.content,
      document.name,
      document.path,
      document.sizeBytes,
      largeDocumentSummariesBlocked,
      markdownSummaryDeferred
    ]
  );
  const currentDeferredMarkdownSummary =
    deferredMarkdownSummary?.key === markdownSummaryKey ? deferredMarkdownSummary : null;
  const outlineItems = markdownSummaryDeferred
    ? currentDeferredMarkdownSummary?.outlineItems ?? emptyMarkdownDocumentSummary.outlineItems
    : immediateMarkdownSummary.outlineItems;
  const wordCount = markdownSummaryDeferred
    ? currentDeferredMarkdownSummary?.wordCount ?? emptyMarkdownDocumentSummary.wordCount
    : immediateMarkdownSummary.wordCount;

  useEffect(() => {
    if (!markdownSummaryDeferred) return;

    let active = true;
    const summaryContent = document.content;
    const summaryKey = markdownSummaryKey;
    const cancel = scheduleMarkdownSummaryIdle(() => {
      if (!active) return;

      const summary = calculateMarkdownDocumentSummary(summaryContent, {
        chars: summaryContent.length,
        deferred: true,
        name: document.name,
        path: document.path,
        sizeBytes: document.sizeBytes ?? null
      });
      if (!active) return;

      setDeferredMarkdownSummary({
        key: summaryKey,
        ...summary
      });
    });

    return () => {
      active = false;
      cancel();
    };
  }, [
    document.content,
    document.name,
    document.path,
    document.sizeBytes,
    markdownSummaryDeferred,
    markdownSummaryKey
  ]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    workspaceSessionIdRef.current = workspaceSessionId;
  }, [workspaceSessionId]);

  const assignWorkspaceSessionId = useCallback((sessionId: string) => {
    workspaceSessionIdRef.current = sessionId;
    setWorkspaceSessionId(sessionId);
    onWorkspaceSessionChange?.(sessionId);
    return sessionId;
  }, [onWorkspaceSessionChange]);

  const resolveWorkspaceSessionId = useCallback((preferredSessionId?: string | null) => {
    return assignWorkspaceSessionId(preferredSessionId?.trim() ? preferredSessionId : createAiAgentSessionId());
  }, [assignWorkspaceSessionId]);

  const selectWorkspaceSession = useCallback((sessionId: string) => {
    const nextSessionId = assignWorkspaceSessionId(sessionId);
    persistWorkspaceState({ aiAgentSessionId: nextSessionId });
    return nextSessionId;
  }, [assignWorkspaceSessionId]);

  const createWorkspaceSession = useCallback(() => {
    return selectWorkspaceSession(createAiAgentSessionId());
  }, [selectWorkspaceSession]);

  const rememberRecentMarkdownFile = useCallback((file: RecentMarkdownFile) => {
    const path = file.path.trim();
    if (!path) return;

    const recentFile = {
      name: file.name.trim() || pathNameFromPath(path),
      path
    };
    setRecentFiles((current) => prependRecentMarkdownFile(current, recentFile));
    saveStoredRecentMarkdownFile(recentFile).catch(() => {});
  }, []);

  const forgetRecentMarkdownFile = useCallback((path: string) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) return;

    setRecentFiles((current) => current.filter((file) => file.path !== normalizedPath));
    removeStoredRecentMarkdownFile(normalizedPath).catch(() => {});
  }, []);

  const clearRecentMarkdownFiles = useCallback(() => {
    setRecentFiles([]);
    clearStoredRecentMarkdownFiles().catch(() => {});
  }, []);

  const currentMarkdown = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return current.content;
    if (!resolveEditorReady(editorReady)) return current.content;

    return getCurrentMarkdown(current.content);
  }, [editorReady, getCurrentMarkdown]);

  const isActiveEditorMarkdownEquivalent = useCallback((markdown: string) => {
    if (!resolveEditorReady(editorReady)) return undefined;

    return isCurrentMarkdownEquivalent?.(markdown);
  }, [editorReady, isCurrentMarkdownEquivalent]);

  const registerWindowRestoreState = useCallback((filePath: string | null, openFilePaths: string[]) => {
    setNativeEditorWindowRestoreState({ filePath, openFilePaths }).catch(() => {});
  }, []);

  const setActiveDocument = useCallback((nextDocument: DocumentState) => {
    documentRef.current = nextDocument;
    setDocument(nextDocument);

    const fallbackActiveTabId = nextDocument.open
      ? nextDocument.path ? fileTabId(nextDocument.path) : "untitled:0"
      : null;
    const currentActiveTabId = activeTabIdRef.current ?? fallbackActiveTabId;
    if (!currentActiveTabId) return;

    activeTabIdRef.current = currentActiveTabId;
    setActiveTabId(currentActiveTabId);

    setTabs((currentTabs) => {
      const nextTab = createDocumentTab(nextDocument, currentActiveTabId);
      const tabExists = currentTabs.some((tab) => tab.id === currentActiveTabId);
      const nextTabs = tabExists
        ? currentTabs.map((tab) => tab.id === currentActiveTabId ? nextTab : tab)
        : [...currentTabs, nextTab];
      tabsRef.current = nextTabs;
      return nextTabs;
    });
  }, []);

  const setActiveTabState = useCallback((nextTabs: MarkdownDocumentTab[], nextActiveTabId: string | null) => {
    const activeTab = nextTabs.find((tab) => tab.id === nextActiveTabId) ?? null;
    const nextDocument = activeTab
      ? documentFromTab(activeTab)
      : {
        path: null,
        name: "",
        content: "",
        dirty: false,
        open: false,
        revision: documentRef.current.revision + 1
      };

    tabsRef.current = nextTabs;
    activeTabIdRef.current = nextActiveTabId;
    documentRef.current = nextDocument;
    setTabs(nextTabs);
    setActiveTabId(nextActiveTabId);
    setDocument(nextDocument);
  }, []);

  const createUntitledTabId = useCallback(() => {
    const tabId = `untitled:${untitledTabIndexRef.current}`;
    untitledTabIndexRef.current += 1;
    return tabId;
  }, []);

  const syncActiveDocumentFromEditor = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return current;

    const content = currentMarkdown();
    if (current.content === content) return current;

    const editorContentEquivalent = isActiveEditorMarkdownEquivalent(current.content);
    const nextDocument =
      !current.dirty && (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };

    const currentActiveTabId = activeTabIdRef.current;
    const nextTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : tabsRef.current;
    setActiveDocument(nextDocument);
    persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, currentActiveTabId));
    return nextDocument;
  }, [currentMarkdown, isActiveEditorMarkdownEquivalent, setActiveDocument]);

  const hasDiscardableUnsavedChanges = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return false;
    if (current.path === null && current.content.trim().length === 0) return false;

    if (!current.dirty) {
      const editorContentEquivalent = isActiveEditorMarkdownEquivalent(current.content);
      if (editorContentEquivalent) return false;
      if (editorContentEquivalent === false && current.path !== null) return true;

      const editorMarkdown = currentMarkdown();
      return !isEquivalentEditorMarkdown(editorMarkdown, current.content) && (current.path !== null || editorMarkdown.trim().length > 0);
    }
    if (current.path) return true;

    const editorMarkdown = currentMarkdown();
    return editorMarkdown.trim().length > 0;
  }, [currentMarkdown, isActiveEditorMarkdownEquivalent]);

  const hasDiscardableTabChanges = useCallback((tab: MarkdownDocumentTab) => {
    if (tab.id === activeTabIdRef.current) return hasDiscardableUnsavedChanges();
    if (!tab.open) return false;
    if (tab.path === null && tab.content.trim().length === 0) return false;
    if (tab.dirty) return tab.path !== null || tab.content.trim().length > 0;

    return false;
  }, [hasDiscardableUnsavedChanges]);

  const confirmCanDiscardCurrentDocument = useCallback(() => {
    const dirtyTab = tabsRef.current.find((tab) => hasDiscardableTabChanges(tab));
    if (!dirtyTab) return true;

    return confirmDiscardUnsavedChanges?.(documentFromTab(dirtyTab)) ?? true;
  }, [
    confirmDiscardUnsavedChanges,
    hasDiscardableTabChanges
  ]);

  const handleMarkdownChange = useCallback((content: string, options: MarkdownChangeOptions = {}) => {
    if (!resolveEditorReady(editorReady)) return;

    const current = documentRef.current;
    if (options.documentRevision !== undefined && options.documentRevision !== current.revision) return;
    if (!current.open || current.content === content) return;
    const editorContentEquivalent = isActiveEditorMarkdownEquivalent(current.content);
    if (
      !current.dirty &&
      options.surface === "visual" &&
      editorContentEquivalent === true &&
      !isEquivalentEditorMarkdown(current.content, content) &&
      isActiveEditorMarkdownEquivalent(content) === false
    ) {
      return;
    }
    const nextDocument =
      !current.dirty && (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };

    const currentActiveTabId = activeTabIdRef.current;
    const nextTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : tabsRef.current;
    setActiveDocument(nextDocument);
    persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, currentActiveTabId));
  }, [editorReady, isActiveEditorMarkdownEquivalent, setActiveDocument]);

  const handleMarkdownTabChange = useCallback((tabId: string, content: string, options: MarkdownChangeOptions = {}) => {
    if (tabId === activeTabIdRef.current) {
      handleMarkdownChange(content, options);
      return;
    }

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.map((tab) => {
        if (tab.id !== tabId || !tab.open || tab.content === content) return tab;
        if (options.documentRevision !== undefined && options.documentRevision !== tab.revision) return tab;
        if (
          !tab.dirty &&
          options.surface === "visual" &&
          options.documentRevision !== undefined &&
          !isEquivalentEditorMarkdown(tab.content, content)
        ) {
          return tab;
        }

        return {
          ...tab,
          content,
          dirty: tab.dirty || !isEquivalentEditorMarkdown(tab.content, content)
        };
      });

      tabsRef.current = nextTabs;
      persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current));
      return nextTabs;
    });
  }, [handleMarkdownChange]);

  const restoreDocumentContent = useCallback((content: string) => {
    const current = documentRef.current;
    if (!current.open) {
      debug(() => ["[markra-history] document restore ignored", {
        reason: "document closed"
      }]);
      return false;
    }

    const nextDocument = {
      ...current,
      content,
      dirty: true,
      revision: current.revision + 1
    };
    const currentActiveTabId = activeTabIdRef.current;
    const nextTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : tabsRef.current;

    setActiveDocument(nextDocument);
    debug(() => ["[markra-history] document restore state updated", {
      activeTabId: currentActiveTabId,
      contentsChars: content.length,
      dirty: nextDocument.dirty,
      nextRevision: nextDocument.revision,
      path: nextDocument.path,
      previousRevision: current.revision
    }]);
    persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, currentActiveTabId));
    return true;
  }, [setActiveDocument]);

  const resetToBlankDocument = useCallback((options: CreateBlankDocumentOptions = {}) => {
    const nextDocument = {
      path: null,
      name: blankDocumentName(options.name),
      content: options.content ?? "",
      dirty: true,
      open: true,
      revision: documentRef.current.revision + 1
    };

    if (documentTabsEnabled) {
      syncActiveDocumentFromEditor();
      const tab = createDocumentTab(nextDocument, createUntitledTabId());
      const nextTabs = [...tabsRef.current, tab];
      setActiveTabState(nextTabs, tab.id);
      registerWindowRestoreState(activeFilePathFromTabs(nextTabs, tab.id), openFilePathsFromTabs(nextTabs));
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, tab.id),
        filePath: null,
        openFilePaths: openFilePathsFromTabs(nextTabs)
      });
    } else {
      setActiveDocument(nextDocument);
      registerWindowRestoreState(null, []);
      const nextTabs = [createDocumentTab(nextDocument, activeTabIdRef.current ?? "untitled:0")];
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
        filePath: null,
        openFilePaths: []
      });
    }
    return true;
  }, [createUntitledTabId, documentTabsEnabled, registerWindowRestoreState, setActiveDocument, setActiveTabState, syncActiveDocumentFromEditor]);

  const createBlankDocument = useCallback((options: CreateBlankDocumentOptions = {}) => {
    if (documentTabsEnabled) return Promise.resolve(resetToBlankDocument(options));

    const canDiscard = confirmCanDiscardCurrentDocument();
    if (typeof canDiscard === "boolean") {
      if (!canDiscard) return Promise.resolve(false);

      return Promise.resolve(resetToBlankDocument(options));
    }

    return canDiscard.then((confirmed) => {
      if (!confirmed) return false;

      return resetToBlankDocument(options);
    });
  }, [confirmCanDiscardCurrentDocument, documentTabsEnabled, resetToBlankDocument]);

  const clearOpenDocument = useCallback((options: ClearOpenDocumentOptions = {}) => {
    const nextDocument = {
      path: null,
      name: "",
      content: "",
      dirty: false,
      open: false,
      revision: documentRef.current.revision + 1
    };
    tabsRef.current = [];
    activeTabIdRef.current = null;
    setTabs([]);
    setActiveTabId(null);
    setDocument(nextDocument);
    documentRef.current = nextDocument;
    registerWindowRestoreState(null, []);
    if (options.persistWorkspace !== false) {
      persistWorkspaceState({
        activeDraftId: null,
        draftTabs: [],
        filePath: null,
        openFilePaths: []
      });
    }
  }, [registerWindowRestoreState]);

  const readMarkdownFileWithPerformance = useCallback(
    (path: string, reason: string) =>
      measureAppPerformanceAsync("markdown-file-read", () => readNativeMarkdownFile(path), {
        path,
        reason
      }),
    []
  );

  const applyNativeMarkdownFile = useCallback(
    (file: NativeMarkdownFile, updateTreeRoot = true, preferredSessionId?: string | null) => {
      return measureAppPerformance("markdown-document-apply", () => {
        const sessionId = updateTreeRoot
          ? resolveWorkspaceSessionId(preferredSessionId)
          : resolveWorkspaceSessionId(preferredSessionId ?? workspaceSessionIdRef.current);
        const nextDocument = {
          path: file.path,
          name: file.name,
          content: file.content,
          sizeBytes: file.sizeBytes,
          dirty: false,
          open: true,
          revision: documentRef.current.revision + 1
        };

        let nextOpenFilePaths = [file.path];

        if (documentTabsEnabled) {
          syncActiveDocumentFromEditor();
          const currentTabs = tabsRef.current;
          const existingTab = currentTabs.find((tab) => sameNativePath(tab.path, file.path));
          let nextTabs: MarkdownDocumentTab[];
          let nextActiveTabId: string;

          if (existingTab) {
            nextTabs = currentTabs;
            nextActiveTabId = existingTab.id;
          } else {
            const activeTabIsPristine = currentTabs.some((tab) =>
              tab.id === activeTabIdRef.current && isPristineUntitledDocument(documentFromTab(tab))
            );
            const nextTabId = activeTabIsPristine && activeTabIdRef.current ? activeTabIdRef.current : fileTabId(file.path);
            const nextTab = createDocumentTab(nextDocument, nextTabId);
            nextTabs = activeTabIsPristine
              ? currentTabs.map((tab) => tab.id === activeTabIdRef.current ? nextTab : tab)
              : [...currentTabs, nextTab];
            nextActiveTabId = nextTab.id;
          }

          setActiveTabState(nextTabs, nextActiveTabId);
          nextOpenFilePaths = openFilePathsFromTabs(nextTabs);
        } else {
          setActiveDocument(nextDocument);
        }

        if (updateTreeRoot) onTreeRootFromFilePath(file.path);
        rememberRecentMarkdownFile({ name: file.name, path: file.path });
        registerWindowRestoreState(file.path, nextOpenFilePaths);
        const nextDraftTabs = documentTabsEnabled
          ? tabsRef.current
          : [createDocumentTab(nextDocument, activeTabIdRef.current ?? fileTabId(file.path))];
        persistWorkspaceState({
          ...draftWorkspacePatchFromTabs(nextDraftTabs, activeTabIdRef.current),
          aiAgentSessionId: sessionId,
          filePath: file.path,
          openFilePaths: nextOpenFilePaths,
          ...(updateTreeRoot ? { folderName: null, folderPath: null } : {})
        });
      }, {
        name: file.name,
        path: file.path,
        sizeBytes: file.sizeBytes ?? null,
        updateTreeRoot
      });
    },
    [documentTabsEnabled, onTreeRootFromFilePath, registerWindowRestoreState, rememberRecentMarkdownFile, resolveWorkspaceSessionId, setActiveDocument, setActiveTabState, syncActiveDocumentFromEditor]
  );

  const loadNativeMarkdownPath = useCallback(
    async (path: string, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const file = await readMarkdownFileWithPerformance(path, "load-path");
      applyNativeMarkdownFile(file, updateTreeRoot, preferredSessionId);
    },
    [applyNativeMarkdownFile, readMarkdownFileWithPerformance]
  );

  const openRecentMarkdownFile = useCallback(
    async (file: RecentMarkdownFile) => {
      const path = file.path.trim();
      if (!path) return false;

      try {
        if (!documentTabsEnabled) {
          const canDiscard = await confirmCanDiscardCurrentDocument();
          if (!canDiscard) return false;
        }

        await loadNativeMarkdownPath(path);
        return true;
      } catch {
        forgetRecentMarkdownFile(path);
        return false;
      }
    },
    [confirmCanDiscardCurrentDocument, documentTabsEnabled, forgetRecentMarkdownFile, loadNativeMarkdownPath]
  );

  const restoreNativeMarkdownFiles = useCallback(
    async (paths: string[], activeFilePath: string | null, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const files: NativeMarkdownFile[] = [];

      for (const path of paths) {
        try {
          files.push(await readMarkdownFileWithPerformance(path, "restore-workspace"));
        } catch {
          // Missing or moved files should not block restoring the rest of the workspace.
        }
      }

      if (files.length === 0) return false;

      const sessionId = updateTreeRoot
        ? resolveWorkspaceSessionId(preferredSessionId)
        : resolveWorkspaceSessionId(preferredSessionId ?? workspaceSessionIdRef.current);
      const activeFile =
        files.find((file) => file.path === activeFilePath) ??
        files.at(-1) ??
        null;

      if (documentTabsEnabled) {
        const nextTabs = files.map((file) =>
          createDocumentTab({
            path: file.path,
            name: file.name,
            content: file.content,
            sizeBytes: file.sizeBytes,
            dirty: false,
            open: true,
            revision: documentRef.current.revision + 1
          }, fileTabId(file.path))
        );

        setActiveTabState(nextTabs, activeFile ? fileTabId(activeFile.path) : nextTabs[0]?.id ?? null);
      } else if (activeFile) {
        setActiveDocument({
          path: activeFile.path,
          name: activeFile.name,
          content: activeFile.content,
          sizeBytes: activeFile.sizeBytes,
          dirty: false,
          open: true,
          revision: documentRef.current.revision + 1
        });
      }

      if (updateTreeRoot && activeFile) onTreeRootFromFilePath(activeFile.path);
      registerWindowRestoreState(activeFile?.path ?? null, files.map((file) => file.path));
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(tabsRef.current, activeTabIdRef.current),
        aiAgentSessionId: sessionId,
        filePath: activeFile?.path ?? null,
        openFilePaths: files.map((file) => file.path),
        ...(updateTreeRoot ? { folderName: null, folderPath: null } : {})
      });
      return true;
    },
    [documentTabsEnabled, onTreeRootFromFilePath, readMarkdownFileWithPerformance, registerWindowRestoreState, resolveWorkspaceSessionId, setActiveDocument, setActiveTabState]
  );

  const restoreWorkspaceDraftTabs = useCallback((
    draftTabs: readonly StoredWorkspaceDraftTab[] | undefined,
    activeDraftId: string | null | undefined,
    preferredSessionId?: string | null
  ) => {
    if (!draftTabs?.length) return false;

    const draftDocumentTabs = draftTabs.map((draft, index) =>
      createDocumentTab(documentFromDraftTab(draft, documentRef.current.revision + index + 1), draft.id)
    );
    const currentTabs = tabsRef.current.filter((tab) =>
      !isPristineUntitledDocument(documentFromTab(tab)) &&
      !draftDocumentTabs.some((draftTab) => draftTab.id === tab.id || (draftTab.path !== null && draftTab.path === tab.path))
    );
    const nextTabs = [...currentTabs, ...draftDocumentTabs];
    const nextActiveTabId =
      activeDraftId && nextTabs.some((tab) => tab.id === activeDraftId)
        ? activeDraftId
        : activeTabIdRef.current && nextTabs.some((tab) => tab.id === activeTabIdRef.current)
          ? activeTabIdRef.current
          : draftDocumentTabs.at(-1)?.id ?? nextTabs.at(-1)?.id ?? null;
    const nextActiveFilePath = activeFilePathFromTabs(nextTabs, nextActiveTabId);
    const sessionId = resolveWorkspaceSessionId(preferredSessionId ?? workspaceSessionIdRef.current);

    setActiveTabState(nextTabs, nextActiveTabId);
    registerWindowRestoreState(nextActiveFilePath, openFilePathsFromTabs(nextTabs));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, nextActiveTabId),
      aiAgentSessionId: sessionId,
      filePath: nextActiveFilePath,
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });

    if (nextActiveFilePath) onTreeRootFromFilePath(nextActiveFilePath);
    return true;
  }, [onTreeRootFromFilePath, registerWindowRestoreState, resolveWorkspaceSessionId, setActiveTabState]);

  const openMarkdownFile = useCallback(async (options: OpenMarkdownFileOptions = {}) => {
    const target = await openNativeMarkdownPath(
      options.pickerTitle ? { title: options.pickerTitle } : undefined
    );
    if (!target) return;

    if (target.kind === "folder") {
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (!canDiscard) return;

      const sessionId = resolveWorkspaceSessionId();
      clearOpenDocument({ persistWorkspace: false });
      await onTreeRootFromFolderPath(target.folder.path, target.folder.name, sessionId);
      return;
    }

    if (!documentTabsEnabled) {
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (!canDiscard) return;
    }

    applyNativeMarkdownFile(target.file);
  }, [applyNativeMarkdownFile, clearOpenDocument, confirmCanDiscardCurrentDocument, documentTabsEnabled, onTreeRootFromFolderPath, resolveWorkspaceSessionId]);

  const openTreeMarkdownFile = useCallback(
    async (file: NativeMarkdownFolderFile) => {
      try {
        if (!documentTabsEnabled) {
          const canDiscard = await confirmCanDiscardCurrentDocument();
          if (!canDiscard) return;
        }

        await loadNativeMarkdownPath(file.path, false);
      } catch {
        // Missing or moved files should leave the tree available for another choice.
      }
    },
    [confirmCanDiscardCurrentDocument, documentTabsEnabled, loadNativeMarkdownPath]
  );

  const openTreeMarkdownFileInBackground = useCallback(
    async (file: NativeMarkdownFolderFile) => {
      try {
        const nativeFile = await readMarkdownFileWithPerformance(file.path, "background-tab");
        const nextDocument = {
          path: nativeFile.path,
          name: nativeFile.name,
          content: nativeFile.content,
          sizeBytes: nativeFile.sizeBytes,
          dirty: false,
          open: true,
          revision: documentRef.current.revision + 1
        };

        syncActiveDocumentFromEditor();

        const currentTabs = tabsRef.current;
        const existingTab = currentTabs.find((tab) => sameNativePath(tab.path, nativeFile.path));
        if (existingTab) return existingTab.id;

        const nextTab = createDocumentTab(nextDocument, fileTabId(nativeFile.path));
        const nextTabs = [...currentTabs, nextTab];

        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
        persistWorkspaceState({
          ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
          filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
          openFilePaths: openFilePathsFromTabs(nextTabs)
        });

        return nextTab.id;
      } catch {
        return null;
      }
    },
    [readMarkdownFileWithPerformance, registerWindowRestoreState, syncActiveDocumentFromEditor]
  );

  const replaceOpenDocumentFile = useCallback((previousPath: string, file: NativeMarkdownFolderFile) => {
    const affected = tabsRef.current.some((tab) => tab.path === previousPath) || documentRef.current.path === previousPath;
    if (!affected) return false;

    const current = documentRef.current;
    if (current.path === previousPath) {
      setActiveDocument({
        ...current,
        name: file.name,
        path: file.path
      });
    }

    const nextTabs = tabsRef.current.map((tab) => {
      if (tab.path !== previousPath) return tab;

      return {
        ...tab,
        name: file.name,
        path: file.path
      };
    });
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
      filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    return true;
  }, [registerWindowRestoreState, setActiveDocument]);

  const replaceMovedOpenDocumentFile = useCallback((previousPath: string, file: NativeMarkdownFolderFile) => {
    const movedPathFor = (path: string | null) => (path ? replaceMovedPath(path, previousPath, file.path) : path);
    const affected =
      tabsRef.current.some((tab) => tab.path !== null && movedPathFor(tab.path) !== tab.path) ||
      (documentRef.current.path !== null && movedPathFor(documentRef.current.path) !== documentRef.current.path);
    if (!affected) return false;

    const current = documentRef.current;
    if (current.path !== null) {
      const nextPath = movedPathFor(current.path);
      if (nextPath !== current.path) {
        setActiveDocument({
          ...current,
          name: current.path === previousPath ? file.name : current.name,
          path: nextPath
        });
      }
    }

    const nextTabs = tabsRef.current.map((tab) => {
      const nextPath = movedPathFor(tab.path);
      if (nextPath === tab.path) return tab;

      return {
        ...tab,
        name: tab.path === previousPath ? file.name : tab.name,
        path: nextPath
      };
    });
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
      filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    return true;
  }, [registerWindowRestoreState, setActiveDocument]);

  const detachDeletedDocumentFile = useCallback((path: string) => {
    const currentTabs = tabsRef.current;
    const deletedTab = currentTabs.find((tab) => tab.path !== null && isDeletedDocumentPath(tab.path, path));
    const currentDocumentPath = documentRef.current.path;
    if (!deletedTab && (!currentDocumentPath || !isDeletedDocumentPath(currentDocumentPath, path))) return false;

    const nextTabs = currentTabs.filter((tab) => tab.path === null || !isDeletedDocumentPath(tab.path, path));
    const deletedActiveTab =
      deletedTab?.id === activeTabIdRef.current ||
      (currentDocumentPath !== null && isDeletedDocumentPath(currentDocumentPath, path));

    if (deletedActiveTab) {
      const deletedIndex = currentTabs.findIndex((tab) => tab.path !== null && isDeletedDocumentPath(tab.path, path));
      const fallbackTab = nextTabs[Math.max(0, deletedIndex - 1)] ?? nextTabs[0] ?? null;
      setActiveTabState(nextTabs, fallbackTab?.id ?? null);
    } else {
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
    }

    const nextDocumentPath = documentRef.current.path;
    if (!documentTabsEnabled && nextDocumentPath !== null && isDeletedDocumentPath(nextDocumentPath, path)) {
      const nextDocument = {
        content: "",
        dirty: false,
        name: "",
        open: false,
        path: null,
        revision: documentRef.current.revision + 1
      };
      setActiveDocument(nextDocument);
    }

    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
      filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
    return true;
  }, [documentTabsEnabled, registerWindowRestoreState, setActiveDocument, setActiveTabState]);

  const applySavedCurrentDocument = useCallback((
    savedFile: { name: string; path: string },
    contents: string,
    options: ApplySavedCurrentDocumentOptions = {}
  ) => {
    const currentTabs = tabsRef.current;
    const targetTabId = options.targetTabId ?? activeTabIdRef.current;
    const targetTab = targetTabId
      ? currentTabs.find((tab) => tab.id === targetTabId)
      : null;
    if (documentTabsEnabled && targetTabId && !targetTab) return;

    const fallbackTabId = targetTabId ?? activeTabIdRef.current ?? fileTabId(savedFile.path);
    const targetDocument =
      targetTabId === activeTabIdRef.current
        ? documentRef.current
        : targetTab
          ? documentFromTab(targetTab)
          : documentRef.current;
    const sourceContent = options.sourceContent ?? contents;
    const contentChangedAfterSaveStarted =
      targetDocument.content !== sourceContent && targetDocument.content !== contents;
    const nextDocument = {
      ...targetDocument,
      path: savedFile.path,
      name: savedFile.name,
      content: contentChangedAfterSaveStarted ? targetDocument.content : contents,
      dirty: contentChangedAfterSaveStarted ? true : false,
      revision: targetDocument.revision
    };

    const nextTabs = documentTabsEnabled
      ? currentTabs.map((tab) => tab.id === fallbackTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : [createDocumentTab(nextDocument, fallbackTabId)];
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (fallbackTabId === activeTabIdRef.current) {
      documentRef.current = nextDocument;
      setDocument(nextDocument);
    }

    const nextOpenFilePaths = documentTabsEnabled
      ? openFilePathsFromTabs(nextTabs)
      : [savedFile.path];
    const nextActiveFilePath = activeFilePathFromTabs(nextTabs, activeTabIdRef.current);
    if (options.retargetWorkspaceRoot) onTreeRootFromFilePath(savedFile.path);
    rememberRecentMarkdownFile(savedFile);
    registerWindowRestoreState(nextActiveFilePath, nextOpenFilePaths);
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
      filePath: nextActiveFilePath,
      openFilePaths: nextOpenFilePaths,
      ...(options.retargetWorkspaceRoot ? { folderName: null, folderPath: null } : {})
    });
  }, [documentTabsEnabled, onTreeRootFromFilePath, registerWindowRestoreState, rememberRecentMarkdownFile]);

  const saveCurrentDocument = useCallback(
    async (saveAs = false) => {
      const current = documentRef.current;
      if (!current.open) return null;

      const targetTabId = activeTabIdRef.current;
      const contents = currentMarkdown();
      const savePath = saveAs ? null : current.path;
      const savedFile = await saveNativeMarkdownFile({
        ...defaultSaveDirectoryInput(defaultSaveDirectory, savePath),
        path: savePath,
        suggestedName: current.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      applySavedCurrentDocument(savedFile, contents, {
        retargetWorkspaceRoot: saveAs || current.path === null,
        sourceContent: current.content,
        targetTabId
      });
      return savedFile;
    },
    [applySavedCurrentDocument, currentMarkdown, defaultSaveDirectory]
  );

  const saveCurrentDocumentContent = useCallback(
    async (contents: string, options: SaveCurrentDocumentContentOptions = {}) => {
      const current = documentRef.current;
      if (!current.open) {
        debug(() => ["[markra-history] save restored document ignored", {
          reason: "document closed"
        }]);
        return null;
      }

      const targetTabId = activeTabIdRef.current;
      debug(() => ["[markra-history] save restored document start", {
        contentsChars: contents.length,
        currentDirty: current.dirty,
        currentPath: current.path,
        currentRevision: current.revision,
        historyCursorId: options.historyCursorId ?? null,
        skipHistorySnapshot: options.skipHistorySnapshot === true,
        suggestedName: current.name || "Untitled.md"
      }]);

      const savePath = current.path;
      let savedFile: Awaited<ReturnType<typeof saveNativeMarkdownFile>>;
      try {
        savedFile = await saveNativeMarkdownFile({
          ...defaultSaveDirectoryInput(defaultSaveDirectory, savePath),
          historyCursorId: options.historyCursorId,
          path: savePath,
          skipHistorySnapshot: options.skipHistorySnapshot,
          suggestedName: current.name || "Untitled.md",
          contents
        });
      } catch (error: unknown) {
        debug(() => ["[markra-history] save restored document native error", {
          currentPath: current.path,
          error: error instanceof Error ? error.message : String(error)
        }]);
        throw error;
      }

      if (!savedFile) {
        debug(() => ["[markra-history] save restored document canceled", {
          currentPath: current.path
        }]);
        return null;
      }

      applySavedCurrentDocument(savedFile, contents, {
        retargetWorkspaceRoot: current.path === null,
        sourceContent: current.content,
        targetTabId
      });
      debug(() => ["[markra-history] save restored document applied", {
        contentsChars: contents.length,
        savedPath: savedFile.path
      }]);
      return savedFile;
    },
    [applySavedCurrentDocument, defaultSaveDirectory]
  );

  const saveMarkdownTab = useCallback(
    async (tabId: string, saveAs = false) => {
      syncActiveDocumentFromEditor();

      const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
      if (!tab?.open) return null;

      const contents = tab.id === activeTabIdRef.current ? currentMarkdown() : tab.content;
      const savePath = saveAs ? null : tab.path;
      const savedFile = await saveNativeMarkdownFile({
        ...defaultSaveDirectoryInput(defaultSaveDirectory, savePath),
        path: savePath,
        suggestedName: tab.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      const sourceDocument = documentFromTab(tab);
      const nextDocument = {
        ...sourceDocument,
        path: savedFile.path,
        name: savedFile.name,
        content: contents,
        dirty: false,
        revision: sourceDocument.revision
      };
      const nextTabs = tabsRef.current.map((candidate) =>
        candidate.id === tabId ? createDocumentTab(nextDocument, candidate.id) : candidate
      );

      tabsRef.current = nextTabs;
      setTabs(nextTabs);

      if (tab.id === activeTabIdRef.current) {
        documentRef.current = nextDocument;
        setDocument(nextDocument);
      }

      if (saveAs || tab.path === null) onTreeRootFromFilePath(savedFile.path);
      rememberRecentMarkdownFile(savedFile);
      registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
        filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
        openFilePaths: openFilePathsFromTabs(nextTabs),
        ...(saveAs || tab.path === null ? { folderName: null, folderPath: null } : {})
      });
      return savedFile;
    },
    [
      currentMarkdown,
      defaultSaveDirectory,
      onTreeRootFromFilePath,
      registerWindowRestoreState,
      rememberRecentMarkdownFile,
      syncActiveDocumentFromEditor
    ]
  );

  const handleSaveClick = useCallback(() => {
    saveCurrentDocument(false);
  }, [saveCurrentDocument]);

  const selectMarkdownTab = useCallback((tabId: string) => {
    syncActiveDocumentFromEditor();
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab) return false;

    setActiveTabState(tabsRef.current, tab.id);
    registerWindowRestoreState(tab.path, openFilePathsFromTabs(tabsRef.current));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(tabsRef.current, tab.id),
      filePath: tab.path,
      openFilePaths: openFilePathsFromTabs(tabsRef.current)
    });
    return true;
  }, [registerWindowRestoreState, setActiveTabState, syncActiveDocumentFromEditor]);

  const closeMarkdownTab = useCallback(async (tabId: string) => {
    syncActiveDocumentFromEditor();
    const currentTabs = tabsRef.current;
    const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    const tab = currentTabs[tabIndex];
    if (!tab) return false;

    if (hasDiscardableTabChanges(tab)) {
      const confirmed = await confirmDiscardUnsavedChanges?.(documentFromTab(tab));
      if (!confirmed) return false;
    }

    const nextTabs = currentTabs.filter((candidate) => candidate.id !== tabId);
    const nextActiveTab =
      tab.id === activeTabIdRef.current
        ? nextTabs[Math.max(0, tabIndex - 1)] ?? nextTabs[0] ?? null
        : nextTabs.find((candidate) => candidate.id === activeTabIdRef.current) ?? null;

    setActiveTabState(nextTabs, nextActiveTab?.id ?? null);
    registerWindowRestoreState(nextActiveTab?.path ?? null, openFilePathsFromTabs(nextTabs));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, nextActiveTab?.id ?? null),
      filePath: nextActiveTab?.path ?? null,
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    return true;
  }, [confirmDiscardUnsavedChanges, hasDiscardableTabChanges, registerWindowRestoreState, setActiveTabState, syncActiveDocumentFromEditor]);

  const isCurrentDocumentEmptyUntitled = useCallback(() => {
    const current = documentRef.current;
    return !current.open || (current.path === null && currentMarkdown().trim() === "");
  }, [currentMarkdown]);

  const isFileInCurrentWorkspace = useCallback((path: string) => {
    const workspaceRootPath = workspaceRootForSource(workspaceSourcePath, documentRef.current.path);
    return isPathWithinRoot(path, workspaceRootPath);
  }, [workspaceSourcePath]);

  const handleDroppedMarkdownPath = useCallback(
    async (target: NativeMarkdownDroppedTarget) => {
      if (target.kind === "folder") {
        if (!isCurrentDocumentEmptyUntitled()) {
          await openNativeMarkdownFolderInNewWindow(target.path);
          return;
        }

        const sessionId = resolveWorkspaceSessionId();
        clearOpenDocument({ persistWorkspace: false });
        await onTreeRootFromFolderPath(target.path, target.name, sessionId);
        return;
      }

      if (isCurrentDocumentEmptyUntitled()) {
        await loadNativeMarkdownPath(target.path);
        return;
      }

      await openNativeMarkdownFileInNewWindow(target.path);
    },
    [clearOpenDocument, isCurrentDocumentEmptyUntitled, loadNativeMarkdownPath, onTreeRootFromFolderPath, resolveWorkspaceSessionId]
  );

  const handleNativeOpenedMarkdownPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return false;

    let openedPath = false;

    for (const path of paths) {
      try {
        const target = await resolveNativeMarkdownPath(path);

        if (target.kind === "folder") {
          await handleDroppedMarkdownPath(target);
        } else if (isCurrentDocumentEmptyUntitled() || (documentTabsEnabled && isFileInCurrentWorkspace(target.path))) {
          await loadNativeMarkdownPath(target.path);
        } else {
          await openNativeMarkdownFileInNewWindow(target.path);
        }

        openedPath = true;
      } catch {
        // Unsupported or moved OS-opened paths should not block other files.
      }
    }

    if (openedPath) openedFromNativeRef.current = true;
    return openedPath;
  }, [documentTabsEnabled, handleDroppedMarkdownPath, isCurrentDocumentEmptyUntitled, isFileInCurrentWorkspace, loadNativeMarkdownPath]);

  useEffect(() => {
    const title = document.open && document.dirty ? `${document.name} *` : document.name;
    setNativeWindowTitle(title);
  }, [document.name, document.dirty, document.open]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      syncActiveDocumentFromEditor();
      const hasUnsavedChanges = tabsRef.current.some((tab) => hasDiscardableTabChanges(tab));
      if (!hasUnsavedChanges) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDiscardableTabChanges, syncActiveDocumentFromEditor]);

  useEffect(() => {
    let active = true;

    getStoredRecentMarkdownFiles().then((files) => {
      if (active) setRecentFiles(files);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenNativeWindowCloseRequested(async (event) => {
      syncActiveDocumentFromEditor();
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (!canDiscard) event.preventDefault();
    }).then((nextCleanup) => {
      if (active) {
        cleanup = nextCleanup;
        return;
      }

      nextCleanup();
    }).catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, [confirmCanDiscardCurrentDocument, syncActiveDocumentFromEditor]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenNativeAppExitRequested(async () => {
      syncActiveDocumentFromEditor();
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (canDiscard) {
        await beforeNativeAppExit?.();
        await exitNativeApp();
      }
    }).then((nextCleanup) => {
      if (active) {
        cleanup = nextCleanup;
        return;
      }

      nextCleanup();
    }).catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, [beforeNativeAppExit, confirmCanDiscardCurrentDocument, syncActiveDocumentFromEditor]);

  useEffect(() => {
    const path = initialMarkdownFilePath();
    if (!path) return;

    let active = true;

    readMarkdownFileWithPerformance(path, "initial-path").then((file) => {
      if (!active) return;
      applyNativeMarkdownFile(file);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [applyNativeMarkdownFile, readMarkdownFileWithPerformance]);

  useEffect(() => {
    const folderPath = initialMarkdownFolderPath();
    if (!folderPath) return;

    const sessionId = resolveWorkspaceSessionId();
    clearOpenDocument({ persistWorkspace: false });
    onTreeRootFromFolderPath(folderPath, pathNameFromPath(folderPath), sessionId);
  }, [clearOpenDocument, onTreeRootFromFolderPath, resolveWorkspaceSessionId]);

  useEffect(() => {
    if (isBlankEditorWindow() || initialMarkdownFilePath() || initialMarkdownFolderPath()) {
      setNativeOpenedPathsReady(true);
      return;
    }

    let active = true;
    let cleanupNativeListener: (() => unknown) | null = null;

    (async () => {
      try {
        const paths = await takeNativeOpenedMarkdownPaths();
        if (active) await handleNativeOpenedMarkdownPaths(paths);
      } catch {
        // Native launch state is opportunistic; the normal startup path remains available.
      } finally {
        if (active) setNativeOpenedPathsReady(true);
      }

      try {
        const cleanup = await listenNativeOpenedMarkdownPaths((paths) => {
          takeNativeOpenedMarkdownPaths()
            .then((queuedPaths) => handleNativeOpenedMarkdownPaths(queuedPaths.length > 0 ? queuedPaths : paths))
            .catch(() => handleNativeOpenedMarkdownPaths(paths));
        });

        if (!active) {
          cleanup();
          return;
        }

        cleanupNativeListener = cleanup;
      } catch {
        // If event registration fails, manual open and drag/drop still work.
      }
    })().catch(() => {
      if (active) setNativeOpenedPathsReady(true);
    });

    return () => {
      active = false;
      cleanupNativeListener?.();
    };
  }, [handleNativeOpenedMarkdownPaths]);

  useEffect(() => {
    if (isBlankEditorWindow() || initialMarkdownFilePath() || initialMarkdownFolderPath()) return;
    if (!nativeOpenedPathsReady) return;
    if (openedFromNativeRef.current) return;
    if (!preferencesReady) return;
    if (startupWorkspaceRestoreAttemptedRef.current) return;

    startupWorkspaceRestoreAttemptedRef.current = true;

    let active = true;

    (async () => {
      let restoredWorkspace = false;

      if (restoreWorkspaceOnStartup) {
        try {
          const workspace = await getStoredWorkspaceState();
          const sessionId = workspace.aiAgentSessionId ?? createAiAgentSessionId();
          const restoreWindows = workspace.openWindows ?? [];
          const primaryRestoreWindow = restoreWindows[0] ?? null;
          const primaryRestoreWindowFilePath = primaryRestoreWindow
            ? activeFilePathFromWindowRestore(primaryRestoreWindow)
            : null;
          let restoreFilePaths = primaryRestoreWindow
            ? restoreFilePathsFromWorkspace(
              primaryRestoreWindow.openFilePaths,
              primaryRestoreWindowFilePath,
              documentTabsEnabled
            )
            : restoreFilePathsFromWorkspace(
              workspace.openFilePaths,
              workspace.filePath,
              documentTabsEnabled
            );
          const activeRestoreFilePath = primaryRestoreWindow ? primaryRestoreWindowFilePath : workspace.filePath;
          const additionalRestoreWindowFilePaths = normalizeOpenFilePaths(
            restoreWindows
              .slice(1)
              .map(activeFilePathFromWindowRestore)
          ).filter((path) => !restoreFilePaths.includes(path));

          assignWorkspaceSessionId(sessionId);

          if (workspace.folderPath) {
            const folderResult = await onTreeRootFromFolderPath(
              workspace.folderPath,
              workspace.folderName ?? workspace.folderPath,
              sessionId,
              restoreFilePaths.length === 0,
              workspace.fileTreeOpen
            );
            if (!active) return;

            if (folderResult === null || folderResult === false) {
              persistWorkspaceState({
                fileTreeOpen: false,
                folderName: null,
                folderPath: null,
                openFilePaths: []
              });
              restoreFilePaths = [];
              restoredWorkspace = true;
            } else {
              if (restoreFilePaths.length === 0) clearOpenDocument({ persistWorkspace: false });
              restoredWorkspace = true;
            }
          }

          if (restoreFilePaths.length > 0) {
            const restoredFiles = await restoreNativeMarkdownFiles(
              restoreFilePaths,
              activeRestoreFilePath,
              !restoredWorkspace,
              sessionId
            );
            if (!active) return;
            if (restoredFiles) restoredWorkspace = true;
          }

          if (workspace.draftTabs?.length) {
            const restoredDrafts = restoreWorkspaceDraftTabs(
              workspace.draftTabs,
              workspace.activeDraftId,
              sessionId
            );
            if (!active) return;
            if (restoredDrafts) restoredWorkspace = true;
          }

          for (const path of additionalRestoreWindowFilePaths) {
            await openNativeMarkdownFileInNewWindow(path);
            if (!active) return;
            restoredWorkspace = true;
          }

          if (restoreWindows.length > 0) {
            persistWorkspaceState({ openWindows: [] });
          }

          if (workspace.aiAgentSessionId !== sessionId) {
            persistWorkspaceState({ aiAgentSessionId: sessionId });
          }
        } catch {
          // Store issues should not prevent Markra from opening a usable document.
        }
      }

      if (!active || restoredWorkspace) return;

      const sessionId = resolveWorkspaceSessionId();
      persistWorkspaceState({ aiAgentSessionId: sessionId });

      const shouldShowWelcomeDocument = await consumeWelcomeDocumentState();
      if (!active || !shouldShowWelcomeDocument) return;

      if (!isPristineUntitledDocument(documentRef.current)) return;

      setActiveDocument({
        ...documentRef.current,
        content: initialMarkdown,
        revision: documentRef.current.revision + 1
      });
    })().catch(() => {});

    return () => {
      active = false;
    };
  }, [
    assignWorkspaceSessionId,
    clearOpenDocument,
    documentTabsEnabled,
    nativeOpenedPathsReady,
    onTreeRootFromFolderPath,
    preferencesReady,
    restoreNativeMarkdownFiles,
    restoreWorkspaceDraftTabs,
    resolveWorkspaceSessionId,
    restoreWorkspaceOnStartup,
    setActiveDocument
  ]);

  useEffect(() => {
    if (!document.path) return;

    let active = true;
    let unwatch: (() => unknown) | null = null;
    const watchedDocumentPath = document.path;

    debug(() => ["[markra-history] watcher start", {
      path: watchedDocumentPath
    }]);

    watchNativeMarkdownFile(document.path, async (changedPath) => {
      if (!active) return;

      debug(() => ["[markra-history] watcher file event", {
        changedPath
      }]);
      // External edits rebuild the editor so the visible document mirrors disk.
      const file = await readMarkdownFileWithPerformance(changedPath, "watcher");
      const current = documentRef.current;
      if (!active || current.path !== file.path || current.dirty || current.content === file.content) {
        debug(() => ["[markra-history] watcher file event ignored", {
          active,
          changedPath,
          currentDirty: current.dirty,
          currentPath: current.path,
          diskPath: file.path,
          reason: !active
            ? "inactive"
            : current.path !== file.path
              ? "path mismatch"
              : current.dirty
                ? "current dirty"
                : "contents unchanged"
        }]);
        return;
      }

      const latest = documentRef.current;
      if (latest.path !== file.path || latest.dirty || latest.content === file.content) {
        debug(() => ["[markra-history] watcher latest event ignored", {
          changedPath,
          diskPath: file.path,
          latestDirty: latest.dirty,
          latestPath: latest.path,
          reason: latest.path !== file.path
            ? "path mismatch"
            : latest.dirty
              ? "latest dirty"
              : "contents unchanged"
        }]);
        return;
      }

      setActiveDocument({
        path: file.path,
        name: file.name,
        content: file.content,
        sizeBytes: file.sizeBytes,
        dirty: false,
        open: true,
        revision: latest.revision + 1
      });
      debug(() => ["[markra-history] watcher applied disk content", {
        changedPath,
        contentsChars: file.content.length,
        nextRevision: latest.revision + 1
      }]);
    }, (changedPath) => {
      if (!active) return;
      debug(() => ["[markra-history] watcher tree event", {
        changedPath
      }]);
      onMarkdownTreeChange?.(changedPath);
    }).then((stopWatching) => {
      if (!active) {
        stopWatching();
        return;
      }

      unwatch = stopWatching;
      debug(() => ["[markra-history] watcher ready", {
        path: watchedDocumentPath
      }]);
    }).catch((error: unknown) => {
      debug(() => ["[markra-history] watcher failed", {
        error: error instanceof Error ? error.message : String(error),
        path: watchedDocumentPath
      }]);
    });

    return () => {
      active = false;
      debug(() => ["[markra-history] watcher stop", {
        path: watchedDocumentPath
      }]);
      unwatch?.();
    };
  }, [document.path, onMarkdownTreeChange, readMarkdownFileWithPerformance, setActiveDocument]);

  return {
    clearRecentMarkdownFiles,
    clearOpenDocument,
    closeMarkdownTab,
    createBlankDocument,
    createWorkspaceSession,
    confirmCanDiscardCurrentDocument,
    detachDeletedDocumentFile,
    document,
    tabs,
    activeTabId,
    handleDroppedMarkdownPath,
    handleMarkdownChange,
    handleMarkdownTabChange,
    handleSaveClick,
    openMarkdownFile,
    openRecentMarkdownFile,
    openTreeMarkdownFileInBackground,
    openTreeMarkdownFile,
    outlineItems,
    replaceOpenDocumentFile,
    replaceMovedOpenDocumentFile,
    recentFiles,
    restoreDocumentContent,
    saveCurrentDocumentContent,
    saveCurrentDocument,
    saveMarkdownTab,
    selectMarkdownTab,
    selectWorkspaceSession,
    workspaceSessionId,
    wordCount
  };
}
