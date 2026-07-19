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
  type StoredWorkspaceDraftTab,
  type StoredWorkspaceState,
  type StoredWorkspaceWindow
} from "../lib/settings/app-settings";
import { getMarkdownOutline, getWordCount, type MarkdownOutlineItem } from "@markra/markdown";
import {
  destroyNativeWindow,
  exitNativeApp,
  listNativeEditorWindowRestoreStates,
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
import { createEditorSyncState, type EditorSyncState } from "./markdown-document/editor-sync";

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

type MovedMarkdownDocumentUpdate = {
  content: string;
  dirty: boolean;
};

export type ActiveDiskFileContentChange = {
  content: string;
  path: string;
  previousContent: string;
  revision: number;
  source: string;
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

function isMissingMarkdownFileReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:cannot find|no longer exists|no such file|not found)/iu.test(message);
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
  autoSaveEnabled?: boolean;
  autoSaveIntervalMinutes?: number;
  beforeNativeAppExit?: () => unknown | Promise<unknown>;
  confirmDiscardUnsavedChanges?: (document: DocumentState) => boolean | Promise<boolean>;
  defaultSaveDirectory?: string | null;
  documentTabsEnabled?: boolean;
  editorReady?: boolean | (() => boolean);
  getCurrentMarkdown: (fallbackContent: string) => string;
  globalIgnoreRules?: string;
  isCurrentMarkdownEquivalent?: (markdown: string) => boolean | undefined;
  onActiveDiskFileContentChange?: (change: ActiveDiskFileContentChange) => boolean | undefined;
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

type WatchedMarkdownFileReadState = {
  changedPath: string;
  pending: boolean;
  promise: Promise<unknown> | null;
};

type OpenMarkdownFileOptions = {
  pickerTitle?: string;
};

let pendingWorkspaceStateSave: Promise<unknown> | null = null;

function persistWorkspaceState(patch: Parameters<typeof saveStoredWorkspaceState>[0]) {
  // Workspace writes are read-modify-write operations; keep draft snapshots ordered.
  const save = () => saveStoredWorkspaceState(patch).catch(() => {});
  const savePromise = pendingWorkspaceStateSave
    ? pendingWorkspaceStateSave.then(save, save)
    : save();
  const queuedPromise = savePromise.finally(() => {
    if (pendingWorkspaceStateSave === queuedPromise) pendingWorkspaceStateSave = null;
  });
  pendingWorkspaceStateSave = queuedPromise;
  return queuedPromise;
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

function workspaceHasCurrentWindowRestoreState(workspace: StoredWorkspaceState) {
  return Boolean(
    workspace.filePath ||
    workspace.folderPath ||
    workspace.openFilePaths.length > 0 ||
    workspace.draftTabs?.length
  );
}

function additionalEditorWindowsForRestore(
  restoreWindows: readonly StoredWorkspaceWindow[],
  currentWindowHasRestoreState: boolean
) {
  return currentWindowHasRestoreState
    ? restoreWindows.filter((window) => window.label !== "main")
    : restoreWindows.slice(1);
}

export function useMarkdownDocument({
  autoSaveEnabled = false,
  autoSaveIntervalMinutes = 10,
  beforeNativeAppExit,
  confirmDiscardUnsavedChanges,
  defaultSaveDirectory,
  documentTabsEnabled = false,
  editorReady = true,
  getCurrentMarkdown,
  globalIgnoreRules = "",
  isCurrentMarkdownEquivalent,
  onActiveDiskFileContentChange,
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
  const nativeWindowCloseAllowedRef = useRef(false);
  const nativeWindowCloseScheduledRef = useRef(false);
  const dirtyFileSavePromiseRef = useRef<Promise<unknown> | null>(null);
  const editorSyncStateRef = useRef<EditorSyncState | null>(null);
  if (editorSyncStateRef.current === null) editorSyncStateRef.current = createEditorSyncState();
  const editorSyncState = editorSyncStateRef.current;
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
  const watchedMarkdownFilePathsKey = useMemo(() => openFilePathsFromTabs(tabs).join("\n"), [tabs]);

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
        deleted: false,
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
    const currentActiveTabId = activeTabIdRef.current;
    if (
      !current.dirty &&
      editorSyncState.isSavedVisualEditorStaleContent(currentActiveTabId, current.content, content)
    ) {
      return current;
    }
    if (!current.dirty && editorSyncState.isCleanVisualMarkdownBaseline(currentActiveTabId, content)) return current;

    const editorContentEquivalent = isActiveEditorMarkdownEquivalent(current.content);
    const nextDocument =
      !current.dirty && (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };
    if (!current.dirty && nextDocument.dirty) editorSyncState.clearCleanVisualMarkdownBaseline(currentActiveTabId);

    const nextTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : tabsRef.current;
    setActiveDocument(nextDocument);
    persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, currentActiveTabId));
    return nextDocument;
  }, [currentMarkdown, editorSyncState, isActiveEditorMarkdownEquivalent, setActiveDocument]);

  const syncActiveDocumentDraftSnapshot = useCallback(() => {
    const syncedDocument = syncActiveDocumentFromEditor();
    const currentActiveTabId = activeTabIdRef.current;
    const syncedTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(syncedDocument, tab.id) : tab)
      : tabsRef.current;
    tabsRef.current = syncedTabs;

    return {
      activeTabId: currentActiveTabId,
      tabs: syncedTabs
    };
  }, [syncActiveDocumentFromEditor]);

  const persistActiveDocumentDraftSnapshot = useCallback(() => {
    const snapshot = syncActiveDocumentDraftSnapshot();
    return persistWorkspaceState(draftWorkspacePatchFromTabs(snapshot.tabs, snapshot.activeTabId));
  }, [syncActiveDocumentDraftSnapshot]);

  const getDirtyMarkdownFileContent = useCallback((path: string) => {
    const snapshot = syncActiveDocumentDraftSnapshot();
    const tab = snapshot.tabs.find((candidate) => sameNativePath(candidate.path, path));

    return tab?.dirty ? tab.content : null;
  }, [syncActiveDocumentDraftSnapshot]);

  const persistNativeEditorWindowRestoreSnapshot = useCallback(async () => {
    try {
      // The native window list only lives in the current process. Copy it into settings
      // before an app-driven exit so secondary editor windows survive restart.
      const openWindows = await listNativeEditorWindowRestoreStates();
      await persistWorkspaceState({ openWindows });
    } catch {
      // Snapshot persistence is best-effort; the current window state is still saved independently.
    }
  }, []);

  const hasDiscardableUnsavedChanges = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return false;
    if (current.path === null && current.content.trim().length === 0) return false;

    if (!current.dirty) {
      const editorContentEquivalent = isActiveEditorMarkdownEquivalent(current.content);
      if (editorContentEquivalent) return false;

      const editorMarkdown = currentMarkdown();
      if (editorSyncState.isSavedVisualEditorStaleContent(activeTabIdRef.current, current.content, editorMarkdown)) return false;
      if (editorSyncState.isCleanVisualMarkdownBaseline(activeTabIdRef.current, editorMarkdown)) return false;
      if (isEquivalentEditorMarkdown(editorMarkdown, current.content)) return false;
      if (editorContentEquivalent === false && current.path !== null) return true;

      return current.path !== null || editorMarkdown.trim().length > 0;
    }
    if (current.path) return true;

    const editorMarkdown = currentMarkdown();
    return editorMarkdown.trim().length > 0;
  }, [currentMarkdown, editorSyncState, isActiveEditorMarkdownEquivalent]);

  const hasDiscardableTabChanges = useCallback((tab: MarkdownDocumentTab) => {
    if (tab.id === activeTabIdRef.current) return hasDiscardableUnsavedChanges();
    if (!tab.open) return false;
    if (tab.path === null && tab.content.trim().length === 0) return false;
    if (tab.dirty) return tab.path !== null || tab.content.trim().length > 0;

    return false;
  }, [hasDiscardableUnsavedChanges]);

  const currentMarkdownForSave = useCallback((current: DocumentState, tabId: string | null | undefined) => {
    const content = currentMarkdown();
    if (!current.dirty && editorSyncState.isSavedVisualEditorStaleContent(tabId, current.content, content)) {
      return current.content;
    }
    if (!current.dirty && editorSyncState.isCleanVisualMarkdownBaseline(tabId, content)) {
      return current.content;
    }

    return content;
  }, [currentMarkdown, editorSyncState]);

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
    const currentActiveTabId = activeTabIdRef.current;
    if (
      !current.dirty &&
      options.surface === "visual" &&
      editorSyncState.isCleanVisualMarkdownBaseline(currentActiveTabId, content)
    ) {
      return;
    }
    const canKeepEquivalentMarkdownClean = options.surface !== "source";
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
    if (!current.dirty) {
      editorSyncState.rememberCleanVisualContentBeforeDirty(currentActiveTabId, current.content, content, options.surface);
    }
    const nextDocument =
      !current.dirty &&
      canKeepEquivalentMarkdownClean &&
      (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };
    if (!current.dirty && nextDocument.dirty) editorSyncState.clearCleanVisualMarkdownBaseline(currentActiveTabId);

    const nextTabs = currentActiveTabId
      ? tabsRef.current.map((tab) => tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : tabsRef.current;
    setActiveDocument(nextDocument);
    persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, currentActiveTabId));
  }, [
    editorSyncState,
    editorReady,
    isActiveEditorMarkdownEquivalent,
    setActiveDocument
  ]);

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
          editorSyncState.isCleanVisualMarkdownBaseline(tab.id, content)
        ) {
          return tab;
        }
        if (
          !tab.dirty &&
          options.surface === "visual" &&
          options.documentRevision !== undefined &&
          !isEquivalentEditorMarkdown(tab.content, content)
        ) {
          return tab;
        }
        if (!tab.dirty) editorSyncState.rememberCleanVisualContentBeforeDirty(tab.id, tab.content, content, options.surface);
        const canKeepEquivalentMarkdownClean = options.surface !== "source";
        const contentEquivalent = canKeepEquivalentMarkdownClean && isEquivalentEditorMarkdown(tab.content, content);
        if (!tab.dirty && !contentEquivalent) {
          editorSyncState.clearCleanVisualMarkdownBaseline(tab.id);
        }

        return {
          ...tab,
          content,
          dirty: tab.dirty || !contentEquivalent
        };
      });

      tabsRef.current = nextTabs;
      persistWorkspaceState(draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current));
      return nextTabs;
    });
  }, [editorSyncState, handleMarkdownChange]);

  const rememberMarkdownTabVisualBaseline = useCallback((tabId: string, content: string) => {
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab || !tab.open || tab.dirty) return false;

    editorSyncState.rememberCleanVisualMarkdownBaseline(tabId, content);
    return true;
  }, [editorSyncState]);

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
      deleted: false,
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
      deleted: false,
      dirty: false,
      open: false,
      revision: documentRef.current.revision + 1
    };
    tabsRef.current = [];
    activeTabIdRef.current = null;
    editorSyncState.clearAll();
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
  }, [editorSyncState, registerWindowRestoreState]);

  const readMarkdownFileWithPerformance = useCallback(
    (path: string, reason: string) =>
      measureAppPerformanceAsync("markdown-file-read", () => readNativeMarkdownFile(path), {
        path,
        reason
      }),
    []
  );

  const applyDiskFileToCleanOpenTab = useCallback((
    file: NativeMarkdownFile,
    reason: string,
    expectedTab?: { content: string; id: string; revision: number }
  ) => {
    const currentTabs = tabsRef.current;
    const targetTab = currentTabs.find((tab) => tab.path !== null && sameNativePath(tab.path, file.path));
    // Tab-selection refreshes are async; ignore disk reads if the tab changed while the read was in flight.
    const staleRequest =
      expectedTab &&
      (
        targetTab?.id !== expectedTab.id ||
        targetTab.revision !== expectedTab.revision ||
        targetTab.content !== expectedTab.content
      );
    if (!targetTab || staleRequest || targetTab.dirty || (!targetTab.deleted && targetTab.content === file.content)) {
      debug(() => ["[markra-history] disk file event ignored", {
        diskPath: file.path,
        reason: !targetTab
          ? "tab missing"
          : staleRequest
            ? "stale request"
            : targetTab.dirty
              ? "tab dirty"
              : !targetTab.deleted && targetTab.content === file.content
                ? "contents unchanged"
                : "unknown",
        source: reason,
        tabId: targetTab?.id ?? null
      }]);
      return false;
    }

    const activeTabChanged = targetTab.id === activeTabIdRef.current;
    const activeEditorUpdated =
      activeTabChanged &&
      onActiveDiskFileContentChange?.({
        content: file.content,
        path: file.path,
        previousContent: targetTab.content,
        revision: targetTab.revision,
        source: reason
      }) === true;

    // Keep the active editor mounted when it already accepted the disk update as an undoable transaction.
    const nextDocument = {
      path: file.path,
      name: file.name,
      content: file.content,
      sizeBytes: file.sizeBytes,
      deleted: false,
      dirty: false,
      open: true,
      revision: activeEditorUpdated ? targetTab.revision : targetTab.revision + 1
    };
    const nextTabs = currentTabs.map((tab) =>
      tab.id === targetTab.id ? createDocumentTab(nextDocument, tab.id) : tab
    );

    // A disk reload moves the clean reference forward; an old visual baseline would hide
    // undoing back to the previous disk content as a real unsaved edit.
    editorSyncState.clearCleanVisualMarkdownBaseline(targetTab.id);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (activeTabChanged) {
      documentRef.current = nextDocument;
      setDocument(nextDocument);
    }

    debug(() => ["[markra-history] disk file content applied", {
      contentsChars: file.content.length,
      diskPath: file.path,
      nextRevision: nextDocument.revision,
      source: reason,
      tabId: targetTab.id
    }]);
    return true;
  }, [editorSyncState, onActiveDiskFileContentChange]);

  const refreshCleanOpenTabFromDisk = useCallback((path: string, reason: string) => {
    const currentTab = tabsRef.current.find((tab) => tab.path !== null && sameNativePath(tab.path, path));
    if (!currentTab || currentTab.dirty) return;

    const expectedTab = {
      content: currentTab.content,
      id: currentTab.id,
      revision: currentTab.revision
    };

    readMarkdownFileWithPerformance(path, reason)
      .then((file) => {
        applyDiskFileToCleanOpenTab(file, reason, expectedTab);
      })
      .catch(() => {});
  }, [applyDiskFileToCleanOpenTab, readMarkdownFileWithPerformance]);

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
          deleted: false,
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
            deleted: false,
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
          deleted: false,
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
          deleted: false,
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
        deleted: false,
        name: file.name,
        path: file.path
      });
    }

    const nextTabs = tabsRef.current.map((tab) => {
      if (tab.path !== previousPath) return tab;

      return {
        ...tab,
        deleted: false,
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

  const replaceMovedOpenDocumentFile = useCallback((
    previousPath: string,
    file: NativeMarkdownFolderFile,
    documentUpdate?: MovedMarkdownDocumentUpdate
  ) => {
    const movedPathFor = (path: string | null) => (path ? replaceMovedPath(path, previousPath, file.path) : path);
    const affected =
      tabsRef.current.some((tab) => tab.path !== null && movedPathFor(tab.path) !== tab.path) ||
      (documentRef.current.path !== null && movedPathFor(documentRef.current.path) !== documentRef.current.path);
    if (!affected) return false;

    const current = documentRef.current;
    if (current.path !== null) {
      const nextPath = movedPathFor(current.path);
      if (nextPath !== current.path) {
        const contentRebased = documentUpdate !== undefined && sameNativePath(current.path, previousPath);
        setActiveDocument({
          ...current,
          ...(contentRebased
            ? {
                content: documentUpdate.content,
                dirty: documentUpdate.dirty,
                revision: current.revision + 1
              }
            : {}),
          deleted: false,
          name: current.path === previousPath ? file.name : current.name,
          path: nextPath
        });
      }
    }

    const nextTabs = tabsRef.current.map((tab) => {
      const nextPath = movedPathFor(tab.path);
      if (nextPath === tab.path) return tab;

      const contentRebased = documentUpdate !== undefined && sameNativePath(tab.path, previousPath);
      if (contentRebased) editorSyncState.clearCleanVisualMarkdownBaseline(tab.id);
      return {
        ...tab,
        ...(contentRebased
          ? {
              content: documentUpdate.content,
              dirty: documentUpdate.dirty,
              revision: tab.revision + 1
            }
          : {}),
        deleted: false,
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
  }, [editorSyncState, registerWindowRestoreState, setActiveDocument]);

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

  const markExternallyDeletedDocumentFile = useCallback((path: string) => {
    const matchesDeletedPath = (documentPath: string | null) =>
      documentPath !== null && isDeletedDocumentPath(documentPath, path);
    const currentTabs = tabsRef.current;
    const current = documentRef.current;
    const activeTabId = activeTabIdRef.current;
    const affectsCurrent = matchesDeletedPath(current.path);
    const affectsTabs = currentTabs.some((tab) => matchesDeletedPath(tab.path));

    if (!affectsCurrent && !affectsTabs) return false;

    const nextDocument = affectsCurrent ? { ...current, deleted: true } : current;
    const nextTabs = currentTabs.map((tab) => {
      if (affectsCurrent && tab.id === activeTabId) return createDocumentTab(nextDocument, tab.id);
      if (matchesDeletedPath(tab.path)) return { ...tab, deleted: true };
      return tab;
    });

    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (affectsCurrent) {
      documentRef.current = nextDocument;
      setDocument(nextDocument);
    }
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, activeTabId),
      filePath: activeFilePathFromTabs(nextTabs, activeTabId),
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabId), openFilePathsFromTabs(nextTabs));
    return true;
  }, [registerWindowRestoreState]);

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
    const activeEditorMatchesSavedContent =
      targetTabId === activeTabIdRef.current && isActiveEditorMarkdownEquivalent(contents) === true;
    const contentChangedAfterSaveStarted =
      targetDocument.content !== sourceContent &&
      targetDocument.content !== contents &&
      !activeEditorMatchesSavedContent;
    const nextDocument = {
      ...targetDocument,
      path: savedFile.path,
      name: savedFile.name,
      content: contentChangedAfterSaveStarted ? targetDocument.content : contents,
      deleted: false,
      dirty: contentChangedAfterSaveStarted ? true : false,
      revision: targetDocument.revision
    };

    const nextTabs = documentTabsEnabled
      ? currentTabs.map((tab) => tab.id === fallbackTabId ? createDocumentTab(nextDocument, tab.id) : tab)
      : [createDocumentTab(nextDocument, fallbackTabId)];
    if (nextDocument.dirty) {
      editorSyncState.clear(fallbackTabId);
    } else {
      editorSyncState.rememberSavedVisualEditorStaleContent(fallbackTabId, contents);
    }
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
  }, [
    documentTabsEnabled,
    editorSyncState,
    isActiveEditorMarkdownEquivalent,
    onTreeRootFromFilePath,
    registerWindowRestoreState,
    rememberRecentMarkdownFile
  ]);

  const saveCurrentDocument = useCallback(
    async (saveAs = false) => {
      const current = documentRef.current;
      if (!current.open) return null;

      const targetTabId = activeTabIdRef.current;
      const contents = currentMarkdownForSave(current, targetTabId);
      const savePath = saveAs || current.deleted ? null : current.path;
      const savedFile = await saveNativeMarkdownFile({
        ...defaultSaveDirectoryInput(defaultSaveDirectory, savePath),
        path: savePath,
        suggestedName: current.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      applySavedCurrentDocument(savedFile, contents, {
        retargetWorkspaceRoot: saveAs || current.path === null || current.deleted === true,
        sourceContent: current.content,
        targetTabId
      });
      return savedFile;
    },
    [applySavedCurrentDocument, currentMarkdownForSave, defaultSaveDirectory]
  );

  const saveMarkdownTabContent = useCallback(
    async (
      tab: MarkdownDocumentTab,
      contents: string,
      options: SaveCurrentDocumentContentOptions = {}
    ) => {
      const savePath = tab.deleted ? null : tab.path;
      const savedFile = await saveNativeMarkdownFile({
        ...defaultSaveDirectoryInput(defaultSaveDirectory, savePath),
        historyCursorId: options.historyCursorId,
        path: savePath,
        skipHistorySnapshot: options.skipHistorySnapshot,
        suggestedName: tab.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      applySavedCurrentDocument(savedFile, contents, {
        retargetWorkspaceRoot: tab.path === null || tab.deleted === true,
        sourceContent: tab.content,
        targetTabId: tab.id
      });
      return savedFile;
    },
    [applySavedCurrentDocument, defaultSaveDirectory]
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

      const savePath = current.deleted ? null : current.path;
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
        retargetWorkspaceRoot: current.path === null || current.deleted === true,
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

      const contents = tab.id === activeTabIdRef.current
        ? currentMarkdownForSave(documentFromTab(tab), tab.id)
        : tab.content;
      const savePath = saveAs || tab.deleted ? null : tab.path;
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
        deleted: false,
        dirty: false,
        revision: sourceDocument.revision
      };
      const nextTabs = tabsRef.current.map((candidate) =>
        candidate.id === tabId ? createDocumentTab(nextDocument, candidate.id) : candidate
      );
      if (nextDocument.dirty) {
        editorSyncState.clear(tabId);
      } else {
        editorSyncState.rememberSavedVisualEditorStaleContent(tabId, contents);
      }

      tabsRef.current = nextTabs;
      setTabs(nextTabs);

      if (tab.id === activeTabIdRef.current) {
        documentRef.current = nextDocument;
        setDocument(nextDocument);
      }

      if (saveAs || tab.path === null || tab.deleted) onTreeRootFromFilePath(savedFile.path);
      rememberRecentMarkdownFile(savedFile);
      registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
        filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
        openFilePaths: openFilePathsFromTabs(nextTabs),
        ...(saveAs || tab.path === null || tab.deleted ? { folderName: null, folderPath: null } : {})
      });
      return savedFile;
    },
    [
      currentMarkdownForSave,
      defaultSaveDirectory,
      editorSyncState,
      onTreeRootFromFilePath,
      registerWindowRestoreState,
      rememberRecentMarkdownFile,
      syncActiveDocumentFromEditor
    ]
  );

  const handleSaveClick = useCallback(() => {
    saveCurrentDocument(false);
  }, [saveCurrentDocument]);

  const saveDirtyMarkdownFiles = useCallback(() => {
    if (dirtyFileSavePromiseRef.current) return dirtyFileSavePromiseRef.current;

    const savePromise = (async () => {
      const snapshot = syncActiveDocumentDraftSnapshot();
      // Update relaunches can happen immediately; wait so untitled drafts survive the restart.
      await persistWorkspaceState(draftWorkspacePatchFromTabs(snapshot.tabs, snapshot.activeTabId));

      const dirtyTabs = snapshot.tabs.filter((tab) => tab.open && tab.dirty && tab.path !== null && !tab.deleted);
      for (const tab of dirtyTabs) {
        await saveMarkdownTabContent(tab, tab.content, { skipHistorySnapshot: true });
      }
    })().finally(() => {
      if (dirtyFileSavePromiseRef.current === savePromise) dirtyFileSavePromiseRef.current = null;
    });

    dirtyFileSavePromiseRef.current = savePromise;
    return savePromise;
  }, [saveMarkdownTabContent, syncActiveDocumentDraftSnapshot]);

  const autoSaveDirtyMarkdownTabs = useCallback(async () => {
    try {
      await saveDirtyMarkdownFiles();
    } catch (error: unknown) {
      debug(() => ["[markra-autosave] save failed", {
        error: error instanceof Error ? error.message : String(error)
      }]);
    }
  }, [saveDirtyMarkdownFiles]);

  const selectMarkdownTab = useCallback((tabId: string) => {
    syncActiveDocumentFromEditor();
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab) return false;

    setActiveTabState(tabsRef.current, tab.id);
    if (tab.path && !tab.dirty) refreshCleanOpenTabFromDisk(tab.path, "select-tab");
    registerWindowRestoreState(tab.path, openFilePathsFromTabs(tabsRef.current));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(tabsRef.current, tab.id),
      filePath: tab.path,
      openFilePaths: openFilePathsFromTabs(tabsRef.current)
    });
    return true;
  }, [refreshCleanOpenTabFromDisk, registerWindowRestoreState, setActiveTabState, syncActiveDocumentFromEditor]);

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

    editorSyncState.clear(tabId);
    setActiveTabState(nextTabs, nextActiveTab?.id ?? null);
    registerWindowRestoreState(nextActiveTab?.path ?? null, openFilePathsFromTabs(nextTabs));
    persistWorkspaceState({
      ...draftWorkspacePatchFromTabs(nextTabs, nextActiveTab?.id ?? null),
      filePath: nextActiveTab?.path ?? null,
      openFilePaths: openFilePathsFromTabs(nextTabs)
    });
    return true;
  }, [
    confirmDiscardUnsavedChanges,
    editorSyncState,
    hasDiscardableTabChanges,
    registerWindowRestoreState,
    setActiveTabState,
    syncActiveDocumentFromEditor
  ]);

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
    if (!autoSaveEnabled) return;

    const intervalMinutes = Number.isFinite(autoSaveIntervalMinutes)
      ? Math.max(1, Math.round(autoSaveIntervalMinutes))
      : 10;
    const intervalMs = intervalMinutes * 60_000;
    const timer = window.setInterval(() => {
      autoSaveDirtyMarkdownTabs().catch(() => {});
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoSaveDirtyMarkdownTabs, autoSaveEnabled, autoSaveIntervalMinutes]);

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
      if (nativeWindowCloseAllowedRef.current) {
        nativeWindowCloseAllowedRef.current = false;
        nativeWindowCloseScheduledRef.current = false;
        return;
      }

      event.preventDefault();
      if (nativeWindowCloseScheduledRef.current) return;

      const draftPersistence = persistActiveDocumentDraftSnapshot();
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (!canDiscard) return;

      await draftPersistence;
      nativeWindowCloseScheduledRef.current = true;
      window.setTimeout(() => {
        // The close request was already intercepted for persistence. Destroy the window after
        // saving so Tauri does not re-enter the same close confirmation path.
        nativeWindowCloseAllowedRef.current = true;
        destroyNativeWindow().catch(() => {
          nativeWindowCloseAllowedRef.current = false;
          nativeWindowCloseScheduledRef.current = false;
        });
      }, 0);
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
  }, [confirmCanDiscardCurrentDocument, persistActiveDocumentDraftSnapshot]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenNativeAppExitRequested(async () => {
      const draftPersistence = persistActiveDocumentDraftSnapshot();
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (canDiscard) {
        await draftPersistence;
        await persistNativeEditorWindowRestoreSnapshot();
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
  }, [beforeNativeAppExit, confirmCanDiscardCurrentDocument, persistActiveDocumentDraftSnapshot, persistNativeEditorWindowRestoreSnapshot]);

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
          const currentWindowHasRestoreState = workspaceHasCurrentWindowRestoreState(workspace);
          const primaryRestoreWindow = currentWindowHasRestoreState ? null : restoreWindows[0] ?? null;
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
            additionalEditorWindowsForRestore(restoreWindows, currentWindowHasRestoreState)
              .map(activeFilePathFromWindowRestore)
          ).filter((path) => !restoreFilePaths.includes(path));

          assignWorkspaceSessionId(sessionId);

          if (workspace.folderPath) {
            const folderPath = workspace.folderPath;
            const folderName = workspace.folderName ?? folderPath;
            const handleRestoredFolderResult = (folderResult: unknown) => {
              if (folderResult === null || folderResult === false) {
                persistWorkspaceState({
                  fileTreeOpen: false,
                  folderName: null,
                  folderPath: null
                });
                return;
              }

              if (restoreFilePaths.length === 0) clearOpenDocument({ persistWorkspace: false });
            };
            const restoreFolderRoot = () => onTreeRootFromFolderPath(
              folderPath,
              folderName,
              sessionId,
              restoreFilePaths.length === 0,
              workspace.fileTreeOpen
            );

            // Some saved roots, such as metadata folders, can make tree loading stall. Restoring
            // files independently prevents the app from staying on Untitled.md while the tree waits.
            restoredWorkspace = true;

            if (restoreFilePaths.length > 0) {
              // File restoration should not wait for potentially slow or skipped tree roots.
              Promise.resolve()
                .then(restoreFolderRoot)
                .then((folderResult) => {
                  if (active) handleRestoredFolderResult(folderResult);
                })
                .catch(() => {
                  if (active) handleRestoredFolderResult(null);
                });
            } else {
              const folderResult = await Promise.resolve().then(restoreFolderRoot);
              if (!active) return;
              handleRestoredFolderResult(folderResult);
            }
          }

          if (restoreFilePaths.length > 0) {
            const restoredFiles = await restoreNativeMarkdownFiles(
              restoreFilePaths,
              activeRestoreFilePath,
              !workspace.folderPath && !restoredWorkspace,
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
    const watchedPaths = watchedMarkdownFilePathsKey.split("\n").filter((path) => path.trim().length > 0);
    if (watchedPaths.length === 0) return;
    const ignoreRootPath = workspaceRootForSource(workspaceSourcePath, document.path);

    let active = true;
    const stopWatchers: Array<() => unknown> = [];
    const watchedFileReadStates = new Map<string, WatchedMarkdownFileReadState>();

    const readAndApplyWatchedFile = async (changedPath: string, watchedPath: string) => {
      debug(() => ["[markra-history] watcher file event", {
        changedPath,
        watchedPath
      }]);
      let file: NativeMarkdownFile;
      try {
        file = await readMarkdownFileWithPerformance(changedPath, "watcher");
      } catch (error: unknown) {
        if (active && isMissingMarkdownFileReadError(error)) {
          const markedDeleted = markExternallyDeletedDocumentFile(changedPath);
          debug(() => ["[markra-history] watcher marked missing file", {
            changedPath,
            markedDeleted,
            watchedPath
          }]);
          onMarkdownTreeChange?.(changedPath);
          return;
        }

        debug(() => ["[markra-history] watcher read failed", {
          changedPath,
          error: error instanceof Error ? error.message : String(error),
          watchedPath
        }]);
        return;
      }
      if (!active) return;

      applyDiskFileToCleanOpenTab(file, "watcher");
    };

    const drainWatchedFileRead = async (watchedPath: string, state: WatchedMarkdownFileReadState) => {
      try {
        while (active) {
          state.pending = false;
          await readAndApplyWatchedFile(state.changedPath, watchedPath);
          if (!state.pending) break;
        }
      } finally {
        if (watchedFileReadStates.get(watchedPath) === state) {
          watchedFileReadStates.delete(watchedPath);
        }
      }
    };

    const requestWatchedFileRead = (changedPath: string, watchedPath: string) => {
      const existingState = watchedFileReadStates.get(watchedPath);
      if (existingState) {
        existingState.changedPath = changedPath;
        existingState.pending = true;
        debug(() => ["[markra-history] watcher file event coalesced", {
          changedPath,
          watchedPath
        }]);
        return existingState.promise ?? Promise.resolve();
      }

      const state: WatchedMarkdownFileReadState = {
        changedPath,
        pending: false,
        promise: null
      };
      watchedFileReadStates.set(watchedPath, state);
      const promise = drainWatchedFileRead(watchedPath, state);
      state.promise = promise;
      return promise;
    };

    watchedPaths.forEach((watchedPath) => {
      debug(() => ["[markra-history] watcher start", {
        path: watchedPath
      }]);

      const treeChangeHandler = sameNativePath(watchedPath, document.path)
        ? (changedPath: string) => {
            if (!active) return;
            debug(() => ["[markra-history] watcher tree event", {
              changedPath,
              watchedPath
            }]);
            onMarkdownTreeChange?.(changedPath);
          }
        : undefined;

      watchNativeMarkdownFile(watchedPath, async (changedPath) => {
        if (!active) return;

        await requestWatchedFileRead(changedPath, watchedPath);
      }, treeChangeHandler, { globalIgnoreRules, ignoreRootPath }).then((stopWatching) => {
        if (!active) {
          stopWatching();
          return;
        }

        stopWatchers.push(stopWatching);
        debug(() => ["[markra-history] watcher ready", {
          path: watchedPath
        }]);
      }).catch((error: unknown) => {
        debug(() => ["[markra-history] watcher failed", {
          error: error instanceof Error ? error.message : String(error),
          path: watchedPath
        }]);
      });
    });

    return () => {
      active = false;
      watchedPaths.forEach((watchedPath) => {
        debug(() => ["[markra-history] watcher stop", {
          path: watchedPath
        }]);
      });
      stopWatchers.forEach((stopWatching) => stopWatching());
    };
  }, [
    applyDiskFileToCleanOpenTab,
    document.path,
    globalIgnoreRules,
    markExternallyDeletedDocumentFile,
    onMarkdownTreeChange,
    readMarkdownFileWithPerformance,
    workspaceSourcePath,
    watchedMarkdownFilePathsKey
  ]);

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
    getDirtyMarkdownFileContent,
    handleMarkdownChange,
    handleMarkdownTabChange,
    handleSaveClick,
    rememberMarkdownTabVisualBaseline,
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
    saveDirtyMarkdownFiles,
    saveMarkdownTab,
    selectMarkdownTab,
    selectWorkspaceSession,
    workspaceSessionId,
    wordCount
  };
}
