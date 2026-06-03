import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialMarkdown } from "../constants/initial-markdown";
import {
  consumeWelcomeDocumentState,
  createAiAgentSessionId,
  getStoredWorkspaceState,
  saveStoredWorkspaceState,
  type StoredWorkspaceDraftTab,
  type StoredWorkspaceWindow
} from "../lib/settings/app-settings";
import { getMarkdownOutline, getWordCount } from "@markra/markdown";
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
import { normalizeMovedPath, replaceMovedPath } from "../lib/path-move";
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

type CreateBlankDocumentOptions = {
  content?: string;
  name?: string;
};

function blankDocumentName(name: string | null | undefined) {
  const trimmedName = name?.trim();
  return trimmedName ? trimmedName : "Untitled.md";
}

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

function documentFromDraftTab(draft: StoredWorkspaceDraftTab, revision: number): DocumentState {
  return {
    path: draft.path,
    name: draft.name,
    content: draft.content,
    dirty: true,
    open: true,
    revision
  };
}

function fileTabId(path: string) {
  return `file:${path}`;
}

function normalizeOpenFilePaths(paths: readonly (string | null | undefined)[]) {
  const seenPaths = new Set<string>();
  const normalizedPaths: string[] = [];

  paths.forEach((item) => {
    const path = item?.trim();
    if (!path || seenPaths.has(path)) return;

    seenPaths.add(path);
    normalizedPaths.push(path);
  });

  return normalizedPaths;
}

function openFilePathsFromTabs(tabs: readonly MarkdownDocumentTab[]) {
  return normalizeOpenFilePaths(tabs.map((tab) => tab.open ? tab.path : null));
}

function restoreFilePathsFromWorkspace(openFilePaths: readonly string[], filePath: string | null, documentTabsEnabled: boolean) {
  if (!documentTabsEnabled) return filePath ? [filePath] : [];

  const paths = normalizeOpenFilePaths(openFilePaths);
  const activeFilePath = filePath?.trim() ?? "";

  if (activeFilePath && !paths.includes(activeFilePath)) paths.push(activeFilePath);

  return paths;
}

function activeFilePathFromWindowRestore(window: StoredWorkspaceWindow) {
  return window.filePath ?? window.openFilePaths.at(-1) ?? null;
}

function activeFilePathFromTabs(tabs: readonly MarkdownDocumentTab[], activeTabId: string | null) {
  return tabs.find((tab) => tab.id === activeTabId)?.path ?? null;
}

function isPristineUntitledDocument(document: DocumentState) {
  return document.open && document.path === null && document.content === "" && !document.dirty && document.revision === 0;
}

function draftTabFromDocumentTab(tab: MarkdownDocumentTab): StoredWorkspaceDraftTab | null {
  if (!tab.open || !tab.dirty) return null;
  if (tab.path === null && tab.content.trim().length === 0) return null;

  return {
    content: tab.content,
    id: tab.id,
    name: tab.name || (tab.path ? pathNameFromPath(tab.path) : "Untitled.md"),
    path: tab.path
  };
}

function draftWorkspacePatchFromTabs(tabs: readonly MarkdownDocumentTab[], activeTabId: string | null) {
  const draftTabs = tabs.flatMap((tab) => {
    const draft = draftTabFromDocumentTab(tab);
    return draft ? [draft] : [];
  });
  const activeDraftId = activeTabId && draftTabs.some((draft) => draft.id === activeTabId)
    ? activeTabId
    : null;

  return {
    activeDraftId,
    draftTabs
  };
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

function isDeletedDocumentPath(documentPath: string, deletedPath: string) {
  const normalizedDocumentPath = normalizeMovedPath(documentPath);
  const normalizedDeletedPath = normalizeMovedPath(deletedPath);

  return normalizedDocumentPath === normalizedDeletedPath || normalizedDocumentPath.startsWith(`${normalizedDeletedPath}/`);
}

type UseMarkdownDocumentOptions = {
  confirmDiscardUnsavedChanges?: (document: DocumentState) => boolean | Promise<boolean>;
  documentTabsEnabled?: boolean;
  editorReady?: boolean | (() => boolean);
  getCurrentMarkdown: (fallbackContent: string) => string;
  isCurrentMarkdownEquivalent?: (markdown: string) => boolean | undefined;
  onMarkdownTreeChange?: (path: string) => unknown | Promise<unknown>;
  onTreeRootFromFolderPath: (path: string, name: string, sessionId?: string | null, clearFilePath?: boolean) => unknown | Promise<unknown>;
  onTreeRootFromFilePath: (path: string) => unknown;
  onWorkspaceSessionChange?: (sessionId: string) => unknown;
  preferencesReady?: boolean;
  restoreWorkspaceOnStartup?: boolean;
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

export function useMarkdownDocument({
  confirmDiscardUnsavedChanges,
  documentTabsEnabled = false,
  editorReady = true,
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
  const startupWorkspaceRestoreAttemptedRef = useRef(false);
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

  const handleMarkdownChange = useCallback((content: string) => {
    if (!resolveEditorReady(editorReady)) return;

    const current = documentRef.current;
    if (!current.open || current.content === content) return;
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
  }, [editorReady, isActiveEditorMarkdownEquivalent, setActiveDocument]);

  const handleMarkdownTabChange = useCallback((tabId: string, content: string) => {
    if (tabId === activeTabIdRef.current) {
      handleMarkdownChange(content);
      return;
    }

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.map((tab) => {
        if (tab.id !== tabId || !tab.open || tab.content === content) return tab;

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

      let nextOpenFilePaths = [file.path];

      if (documentTabsEnabled) {
        syncActiveDocumentFromEditor();
        const currentTabs = tabsRef.current;
        const existingTab = currentTabs.find((tab) => tab.path === file.path);
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
    },
    [documentTabsEnabled, onTreeRootFromFilePath, registerWindowRestoreState, resolveWorkspaceSessionId, setActiveDocument, setActiveTabState, syncActiveDocumentFromEditor]
  );

  const loadNativeMarkdownPath = useCallback(
    async (path: string, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const file = await readNativeMarkdownFile(path);
      applyNativeMarkdownFile(file, updateTreeRoot, preferredSessionId);
    },
    [applyNativeMarkdownFile]
  );

  const restoreNativeMarkdownFiles = useCallback(
    async (paths: string[], activeFilePath: string | null, updateTreeRoot = true, preferredSessionId?: string | null) => {
      const files: NativeMarkdownFile[] = [];

      for (const path of paths) {
        try {
          files.push(await readNativeMarkdownFile(path));
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
    [documentTabsEnabled, onTreeRootFromFilePath, registerWindowRestoreState, resolveWorkspaceSessionId, setActiveDocument, setActiveTabState]
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
        const nativeFile = await readNativeMarkdownFile(file.path);
        const nextDocument = {
          path: nativeFile.path,
          name: nativeFile.name,
          content: nativeFile.content,
          dirty: false,
          open: true,
          revision: documentRef.current.revision + 1
        };

        syncActiveDocumentFromEditor();

        const currentTabs = tabsRef.current;
        const existingTab = currentTabs.find((tab) => tab.path === nativeFile.path);
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
    [registerWindowRestoreState, syncActiveDocumentFromEditor]
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

  const saveCurrentDocument = useCallback(
    async (saveAs = false) => {
      const current = documentRef.current;
      if (!current.open) return null;

      const contents = currentMarkdown();
      const savedFile = await saveNativeMarkdownFile({
        path: saveAs ? null : current.path,
        suggestedName: current.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      const nextDocument = {
        ...documentRef.current,
        path: savedFile.path,
        name: savedFile.name,
        content: contents,
        dirty: false
      };

      setActiveDocument(nextDocument);
      const nextTabs = documentTabsEnabled
        ? tabsRef.current.map((tab) => tab.id === activeTabIdRef.current ? createDocumentTab(nextDocument, tab.id) : tab)
        : [createDocumentTab(nextDocument, activeTabIdRef.current ?? fileTabId(savedFile.path))];
      const nextOpenFilePaths = documentTabsEnabled
        ? openFilePathsFromTabs(nextTabs)
        : [savedFile.path];
      if (saveAs || current.path === null) onTreeRootFromFilePath(savedFile.path);
      registerWindowRestoreState(savedFile.path, nextOpenFilePaths);
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
        filePath: savedFile.path,
        openFilePaths: nextOpenFilePaths,
        ...(saveAs || current.path === null ? { folderName: null, folderPath: null } : {})
      });
      return savedFile;
    },
    [currentMarkdown, documentTabsEnabled, onTreeRootFromFilePath, registerWindowRestoreState, setActiveDocument]
  );

  const saveMarkdownTab = useCallback(
    async (tabId: string, saveAs = false) => {
      syncActiveDocumentFromEditor();

      const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
      if (!tab?.open) return null;

      const contents = tab.id === activeTabIdRef.current ? currentMarkdown() : tab.content;
      const savedFile = await saveNativeMarkdownFile({
        path: saveAs ? null : tab.path,
        suggestedName: tab.name || "Untitled.md",
        contents
      });

      if (!savedFile) return null;

      const nextDocument = {
        ...documentFromTab(tab),
        path: savedFile.path,
        name: savedFile.name,
        content: contents,
        dirty: false
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
      registerWindowRestoreState(activeFilePathFromTabs(nextTabs, activeTabIdRef.current), openFilePathsFromTabs(nextTabs));
      persistWorkspaceState({
        ...draftWorkspacePatchFromTabs(nextTabs, activeTabIdRef.current),
        filePath: activeFilePathFromTabs(nextTabs, activeTabIdRef.current),
        openFilePaths: openFilePathsFromTabs(nextTabs),
        ...(saveAs || tab.path === null ? { folderName: null, folderPath: null } : {})
      });
      return savedFile;
    },
    [currentMarkdown, onTreeRootFromFilePath, registerWindowRestoreState, syncActiveDocumentFromEditor]
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
        clearOpenDocument({ persistWorkspace: false });
        await onTreeRootFromFolderPath(target.path, target.name, sessionId);
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
      if (canDiscard) await exitNativeApp();
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

          if (workspace.folderPath && workspace.fileTreeOpen) {
            const folderResult = await onTreeRootFromFolderPath(
              workspace.folderPath,
              workspace.folderName ?? workspace.folderPath,
              sessionId,
              restoreFilePaths.length === 0
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
    handleMarkdownTabChange,
    handleSaveClick,
    openMarkdownFile,
    openTreeMarkdownFileInBackground,
    openTreeMarkdownFile,
    outlineItems,
    replaceOpenDocumentFile,
    replaceMovedOpenDocumentFile,
    saveCurrentDocument,
    saveMarkdownTab,
    selectMarkdownTab,
    selectWorkspaceSession,
    workspaceSessionId,
    wordCount
  };
}
