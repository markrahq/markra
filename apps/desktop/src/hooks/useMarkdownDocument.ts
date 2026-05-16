import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialMarkdown } from "../constants/initial-markdown";
import {
  consumeWelcomeDocumentState,
  createAiAgentSessionId,
  getStoredWorkspaceState,
  saveStoredWorkspaceState
} from "../lib/settings/app-settings";
import { getMarkdownOutline, getWordCount } from "@markra/markdown";
import {
  openNativeMarkdownFolderInNewWindow,
  openNativeMarkdownFileInNewWindow,
  openNativeMarkdownPath,
  readNativeMarkdownFile,
  resolveNativeMarkdownPath,
  saveNativeMarkdownFile,
  listenNativeOpenedMarkdownPaths,
  takeNativeOpenedMarkdownPaths,
  watchNativeMarkdownFile,
  type NativeMarkdownDroppedTarget,
  type NativeMarkdownFile,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import { setNativeWindowTitle } from "../lib/tauri";
import { pathNameFromPath, type DocumentState } from "@markra/shared";

function isBlankEditorWindow() {
  return new URLSearchParams(window.location.search).has("blank");
}

function initialMarkdownFilePath() {
  return new URLSearchParams(window.location.search).get("path");
}

function initialMarkdownFolderPath() {
  return new URLSearchParams(window.location.search).get("folder");
}

function createInitialDocumentState(): DocumentState {
  return {
    path: null,
    name: "Untitled.md",
    content: "",
    dirty: false,
    open: true,
    revision: 0
  };
}

export type MarkdownDocumentTab = DocumentState & {
  id: string;
};

function createDocumentTab(document: DocumentState, id: string): MarkdownDocumentTab {
  return {
    ...document,
    id
  };
}

function documentFromTab(tab: MarkdownDocumentTab): DocumentState {
  return {
    path: tab.path,
    name: tab.name,
    content: tab.content,
    dirty: tab.dirty,
    open: tab.open,
    revision: tab.revision
  };
}

function fileTabId(path: string) {
  return `file:${path}`;
}

function isPristineUntitledDocument(document: DocumentState) {
  return document.open && document.path === null && document.content === "" && !document.dirty && document.revision === 0;
}

function normalizeComparableMarkdownHeadings(content: string) {
  const lines = content.replace(/\r\n?/gu, "\n").split("\n");
  const normalized: string[] = [];
  let fencedMarker: "`" | "~" | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1]!.startsWith("~") ? "~" : "`";
      if (!fencedMarker) {
        fencedMarker = marker;
      } else if (fencedMarker === marker) {
        fencedMarker = null;
      }

      normalized.push(line);
      continue;
    }

    if (!fencedMarker) {
      const atxHeadingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u);
      if (atxHeadingMatch) {
        normalized.push(`${atxHeadingMatch[1]} ${atxHeadingMatch[2]!.trim()}`);
        continue;
      }

      const setextHeadingMatch = line.match(/^\s*(=+|-+)\s*$/u);
      const previousLine = normalized.at(-1);
      if (setextHeadingMatch && previousLine?.trim()) {
        const level = setextHeadingMatch[1]!.startsWith("=") ? 1 : 2;
        normalized[normalized.length - 1] = `${"#".repeat(level)} ${previousLine.trim()}`;
        continue;
      }
    }

    normalized.push(line);
  }

  return normalized.join("\n");
}

function comparableMarkdown(content: string) {
  return normalizeComparableMarkdownHeadings(content)
    .replace(/[ \t]+$/gmu, "")
    .trim();
}

function isEquivalentEditorMarkdown(left: string, right: string) {
  return comparableMarkdown(left) === comparableMarkdown(right);
}

type UseMarkdownDocumentOptions = {
  confirmDiscardUnsavedChanges?: (document: DocumentState) => boolean | Promise<boolean>;
  documentTabsEnabled?: boolean;
  getCurrentMarkdown: (fallbackContent: string) => string;
  isCurrentMarkdownEquivalent?: (markdown: string) => boolean | undefined;
  onMarkdownTreeChange?: (path: string) => unknown | Promise<unknown>;
  onTreeRootFromFolderPath: (path: string, name: string, sessionId?: string | null) => unknown;
  onTreeRootFromFilePath: (path: string) => unknown;
  onWorkspaceSessionChange?: (sessionId: string) => unknown;
  preferencesReady?: boolean;
  restoreWorkspaceOnStartup?: boolean;
};

type OpenMarkdownFileOptions = {
  pickerTitle?: string;
};

function persistWorkspaceState(patch: Parameters<typeof saveStoredWorkspaceState>[0]) {
  saveStoredWorkspaceState(patch).catch(() => {});
}

export function useMarkdownDocument({
  confirmDiscardUnsavedChanges,
  documentTabsEnabled = false,
  getCurrentMarkdown,
  isCurrentMarkdownEquivalent,
  onMarkdownTreeChange,
  onTreeRootFromFolderPath,
  onTreeRootFromFilePath,
  onWorkspaceSessionChange,
  preferencesReady = true,
  restoreWorkspaceOnStartup = true
}: UseMarkdownDocumentOptions) {
  const [document, setDocument] = useState<DocumentState>(() => createInitialDocumentState());
  const [tabs, setTabs] = useState<MarkdownDocumentTab[]>(() => [createDocumentTab(createInitialDocumentState(), "untitled:0")]);
  const [activeTabId, setActiveTabId] = useState<string | null>("untitled:0");
  const [workspaceSessionId, setWorkspaceSessionId] = useState<string | null>(null);
  const [nativeOpenedPathsReady, setNativeOpenedPathsReady] = useState(false);
  const documentRef = useRef(document);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef<string | null>(activeTabId);
  const untitledTabIndexRef = useRef(1);
  const workspaceSessionIdRef = useRef<string | null>(null);
  const openedFromNativeRef = useRef(false);
  const outlineItems = useMemo(() => getMarkdownOutline(document.content), [document.content]);
  const wordCount = useMemo(() => getWordCount(document.content), [document.content]);

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

  const currentMarkdown = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return current.content;

    return getCurrentMarkdown(current.content);
  }, [getCurrentMarkdown]);

  const setActiveDocument = useCallback((nextDocument: DocumentState) => {
    documentRef.current = nextDocument;
    setDocument(nextDocument);

    const currentActiveTabId = activeTabIdRef.current;
    if (!currentActiveTabId) return;

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.map((tab) =>
        tab.id === currentActiveTabId ? createDocumentTab(nextDocument, tab.id) : tab
      );
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

    const editorContentEquivalent = isCurrentMarkdownEquivalent?.(current.content);
    const nextDocument =
      !current.dirty && (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };

    setActiveDocument(nextDocument);
    return nextDocument;
  }, [currentMarkdown, isCurrentMarkdownEquivalent, setActiveDocument]);

  const hasDiscardableUnsavedChanges = useCallback(() => {
    const current = documentRef.current;
    if (!current.open) return false;
    if (current.path === null && current.content.trim().length === 0) return false;

    if (!current.dirty) {
      const editorContentEquivalent = isCurrentMarkdownEquivalent?.(current.content);
      if (editorContentEquivalent) return false;
      if (editorContentEquivalent === false && current.path !== null) return true;

      const editorMarkdown = currentMarkdown();
      return !isEquivalentEditorMarkdown(editorMarkdown, current.content) && (current.path !== null || editorMarkdown.trim().length > 0);
    }
    if (current.path) return true;

    const editorMarkdown = currentMarkdown();
    return editorMarkdown.trim().length > 0;
  }, [currentMarkdown, isCurrentMarkdownEquivalent]);

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

  const handleMarkdownChange = useCallback((content: string) => {
    const current = documentRef.current;
    if (!current.open || current.content === content) return;
    const editorContentEquivalent = isCurrentMarkdownEquivalent?.(current.content);
    const nextDocument =
      !current.dirty && (editorContentEquivalent === true || isEquivalentEditorMarkdown(current.content, content))
        ? { ...current, content, dirty: false }
        : { ...current, content, dirty: true };

    setActiveDocument(nextDocument);
  }, [isCurrentMarkdownEquivalent, setActiveDocument]);

  const resetToBlankDocument = useCallback(() => {
    const nextDocument = {
      path: null,
      name: "Untitled.md",
      content: "",
      dirty: true,
      open: true,
      revision: documentRef.current.revision + 1
    };

    if (documentTabsEnabled) {
      syncActiveDocumentFromEditor();
      const tab = createDocumentTab(nextDocument, createUntitledTabId());
      setActiveTabState([...tabsRef.current, tab], tab.id);
    } else {
      setActiveDocument(nextDocument);
    }

    persistWorkspaceState({ filePath: null });
    return true;
  }, [createUntitledTabId, documentTabsEnabled, setActiveDocument, setActiveTabState, syncActiveDocumentFromEditor]);

  const createBlankDocument = useCallback(() => {
    if (documentTabsEnabled) return Promise.resolve(resetToBlankDocument());

    const canDiscard = confirmCanDiscardCurrentDocument();
    if (typeof canDiscard === "boolean") {
      if (!canDiscard) return Promise.resolve(false);

      return Promise.resolve(resetToBlankDocument());
    }

    return canDiscard.then((confirmed) => {
      if (!confirmed) return false;

      return resetToBlankDocument();
    });
  }, [confirmCanDiscardCurrentDocument, documentTabsEnabled, resetToBlankDocument]);

  const clearOpenDocument = useCallback(() => {
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
    persistWorkspaceState({ filePath: null });
  }, []);

  const applyNativeMarkdownFile = useCallback(
    (file: NativeMarkdownFile, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const sessionId = updateTreeRoot
        ? resolveWorkspaceSessionId(preferredSessionId)
        : resolveWorkspaceSessionId(preferredSessionId ?? workspaceSessionIdRef.current);
      const nextDocument = {
        path: file.path,
        name: file.name,
        content: file.content,
        dirty: false,
        open: true,
        revision: documentRef.current.revision + 1
      };

      if (documentTabsEnabled) {
        syncActiveDocumentFromEditor();
        const currentTabs = tabsRef.current;
        const existingTab = currentTabs.find((tab) => tab.path === file.path);

        if (existingTab) {
          setActiveTabState(currentTabs, existingTab.id);
        } else {
          const activeTabIsPristine = currentTabs.some((tab) =>
            tab.id === activeTabIdRef.current && isPristineUntitledDocument(documentFromTab(tab))
          );
          const nextTabId = activeTabIsPristine && activeTabIdRef.current ? activeTabIdRef.current : fileTabId(file.path);
          const nextTab = createDocumentTab(nextDocument, nextTabId);
          const nextTabs = activeTabIsPristine
            ? currentTabs.map((tab) => tab.id === activeTabIdRef.current ? nextTab : tab)
            : [...currentTabs, nextTab];

          setActiveTabState(nextTabs, nextTab.id);
        }
      } else {
        setActiveDocument(nextDocument);
      }

      if (updateTreeRoot) onTreeRootFromFilePath(file.path);
      persistWorkspaceState({
        aiAgentSessionId: sessionId,
        filePath: file.path,
        ...(updateTreeRoot ? { folderName: null, folderPath: null } : {})
      });
    },
    [documentTabsEnabled, onTreeRootFromFilePath, resolveWorkspaceSessionId, setActiveDocument, setActiveTabState, syncActiveDocumentFromEditor]
  );

  const loadNativeMarkdownPath = useCallback(
    async (path: string, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const file = await readNativeMarkdownFile(path);
      applyNativeMarkdownFile(file, updateTreeRoot, preferredSessionId);
    },
    [applyNativeMarkdownFile]
  );

  const openMarkdownFile = useCallback(async (options: OpenMarkdownFileOptions = {}) => {
    const target = await openNativeMarkdownPath(
      options.pickerTitle ? { title: options.pickerTitle } : undefined
    );
    if (!target) return;

    if (target.kind === "folder") {
      const canDiscard = await confirmCanDiscardCurrentDocument();
      if (!canDiscard) return;

      const sessionId = resolveWorkspaceSessionId();
      clearOpenDocument();
      onTreeRootFromFolderPath(target.folder.path, target.folder.name, sessionId);
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

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.map((tab) => {
        if (tab.path !== previousPath) return tab;

        return {
          ...tab,
          name: file.name,
          path: file.path
        };
      });
      tabsRef.current = nextTabs;
      return nextTabs;
    });
    persistWorkspaceState({ filePath: file.path });
    return true;
  }, [setActiveDocument]);

  const detachDeletedDocumentFile = useCallback((path: string) => {
    const currentTabs = tabsRef.current;
    const deletedTab = currentTabs.find((tab) => tab.path === path);
    if (!deletedTab && documentRef.current.path !== path) return false;

    const nextTabs = currentTabs.filter((tab) => tab.path !== path);
    const deletedActiveTab = deletedTab?.id === activeTabIdRef.current || documentRef.current.path === path;

    if (deletedActiveTab) {
      const deletedIndex = currentTabs.findIndex((tab) => tab.path === path);
      const fallbackTab = nextTabs[Math.max(0, deletedIndex - 1)] ?? nextTabs[0] ?? null;
      setActiveTabState(nextTabs, fallbackTab?.id ?? null);
    } else {
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
    }

    if (!documentTabsEnabled && documentRef.current.path === path) {
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

    persistWorkspaceState({ filePath: null });
    return true;
  }, [documentTabsEnabled, setActiveDocument, setActiveTabState]);

  const saveCurrentDocument = useCallback(
    async (saveAs = false) => {
      const current = documentRef.current;
      if (!current.open) return;

      const contents = currentMarkdown();
      const savedFile = await saveNativeMarkdownFile({
        path: saveAs ? null : current.path,
        suggestedName: current.name || "Untitled.md",
        contents
      });

      if (!savedFile) return;

      const nextDocument = {
        ...documentRef.current,
        path: savedFile.path,
        name: savedFile.name,
        content: contents,
        dirty: false
      };

      setActiveDocument(nextDocument);
      if (saveAs || current.path === null) onTreeRootFromFilePath(savedFile.path);
      persistWorkspaceState({
        filePath: savedFile.path,
        ...(saveAs || current.path === null ? { folderName: null, folderPath: null } : {})
      });
    },
    [currentMarkdown, onTreeRootFromFilePath, setActiveDocument]
  );

  const handleSaveClick = useCallback(() => {
    saveCurrentDocument(false);
  }, [saveCurrentDocument]);

  const selectMarkdownTab = useCallback((tabId: string) => {
    syncActiveDocumentFromEditor();
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab) return false;

    setActiveTabState(tabsRef.current, tab.id);
    persistWorkspaceState({ filePath: tab.path });
    return true;
  }, [setActiveTabState, syncActiveDocumentFromEditor]);

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
    persistWorkspaceState({ filePath: nextActiveTab?.path ?? null });
    return true;
  }, [confirmDiscardUnsavedChanges, hasDiscardableTabChanges, setActiveTabState, syncActiveDocumentFromEditor]);

  const handleDroppedMarkdownPath = useCallback(
    async (target: NativeMarkdownDroppedTarget) => {
      const current = documentRef.current;
      const isEmptyUntitledDocument = !current.open || (current.path === null && currentMarkdown().trim() === "");

      if (target.kind === "folder") {
        if (!isEmptyUntitledDocument) {
          await openNativeMarkdownFolderInNewWindow(target.path);
          return;
        }

        const sessionId = resolveWorkspaceSessionId();
        clearOpenDocument();
        onTreeRootFromFolderPath(target.path, target.name, sessionId);
        return;
      }

      if (isEmptyUntitledDocument) {
        await loadNativeMarkdownPath(target.path);
        return;
      }

      await openNativeMarkdownFileInNewWindow(target.path);
    },
    [clearOpenDocument, currentMarkdown, loadNativeMarkdownPath, onTreeRootFromFolderPath, resolveWorkspaceSessionId]
  );

  const handleNativeOpenedMarkdownPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return false;

    let openedPath = false;

    for (const path of paths) {
      try {
        const target = await resolveNativeMarkdownPath(path);
        await handleDroppedMarkdownPath(target);
        openedPath = true;
      } catch {
        // Unsupported or moved OS-opened paths should not block other files.
      }
    }

    if (openedPath) openedFromNativeRef.current = true;
    return openedPath;
  }, [handleDroppedMarkdownPath]);

  useEffect(() => {
    const title = document.open && document.dirty ? `${document.name} *` : document.name;
    setNativeWindowTitle(title);
  }, [document.name, document.dirty, document.open]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnsavedChanges = tabsRef.current.some((tab) => hasDiscardableTabChanges(tab));
      if (!hasUnsavedChanges) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDiscardableTabChanges]);

  useEffect(() => {
    const path = initialMarkdownFilePath();
    if (!path) return;

    let active = true;

    readNativeMarkdownFile(path).then((file) => {
      if (!active) return;
      applyNativeMarkdownFile(file);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [applyNativeMarkdownFile]);

  useEffect(() => {
    const folderPath = initialMarkdownFolderPath();
    if (!folderPath) return;

    const sessionId = resolveWorkspaceSessionId();
    clearOpenDocument();
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

    let active = true;

    (async () => {
      let restoredWorkspace = false;

      if (restoreWorkspaceOnStartup) {
        try {
          const workspace = await getStoredWorkspaceState();
          const sessionId = workspace.aiAgentSessionId ?? createAiAgentSessionId();

          assignWorkspaceSessionId(sessionId);

          if (workspace.folderPath && workspace.fileTreeOpen) {
            clearOpenDocument();
            onTreeRootFromFolderPath(workspace.folderPath, workspace.folderName ?? workspace.folderPath, sessionId);
            restoredWorkspace = true;
          }

          if (workspace.filePath) {
            try {
              const file = await readNativeMarkdownFile(workspace.filePath);
              if (!active) return;

              applyNativeMarkdownFile(file, !restoredWorkspace, sessionId);
              restoredWorkspace = true;
            } catch {
              // A deleted or moved file should not block the normal launch fallback.
            }
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
    applyNativeMarkdownFile,
    assignWorkspaceSessionId,
    clearOpenDocument,
    nativeOpenedPathsReady,
    onTreeRootFromFolderPath,
    preferencesReady,
    resolveWorkspaceSessionId,
    restoreWorkspaceOnStartup,
    setActiveDocument
  ]);

  useEffect(() => {
    if (!document.path) return;

    let active = true;
    let unwatch: (() => unknown) | null = null;

    watchNativeMarkdownFile(document.path, async (changedPath) => {
      if (!active) return;

      // External edits rebuild the editor so the visible document mirrors disk.
      const file = await readNativeMarkdownFile(changedPath);
      const current = documentRef.current;
      if (!active || current.path !== file.path || current.content === file.content) return;

      const latest = documentRef.current;
      if (latest.path !== file.path || latest.content === file.content) return;

      setActiveDocument({
        path: file.path,
        name: file.name,
        content: file.content,
        dirty: false,
        open: true,
        revision: latest.revision + 1
      });
    }, (changedPath) => {
      if (!active) return;
      onMarkdownTreeChange?.(changedPath);
    }).then((stopWatching) => {
      if (!active) {
        stopWatching();
        return;
      }

      unwatch = stopWatching;
    }).catch(() => {});

    return () => {
      active = false;
      unwatch?.();
    };
  }, [document.path, onMarkdownTreeChange, setActiveDocument]);

  return {
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
    handleSaveClick,
    openMarkdownFile,
    openTreeMarkdownFile,
    outlineItems,
    replaceOpenDocumentFile,
    saveCurrentDocument,
    selectMarkdownTab,
    selectWorkspaceSession,
    workspaceSessionId,
    wordCount
  };
}
