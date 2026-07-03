import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createAiAgentSessionId,
  defaultStoredFileTreeSort,
  getStoredFileTreeSortByWorkspace,
  getStoredRecentMarkdownFolders,
  getStoredWorkspaceState,
  normalizeStoredFileTreeSort,
  prependRecentMarkdownFolder,
  removeStoredRecentMarkdownFolder,
  saveStoredFileTreeSortForWorkspace,
  saveStoredRecentMarkdownFolder,
  saveStoredWorkspaceState,
  type RecentMarkdownFolder,
  type StoredFileTreeSort,
  type StoredFileTreeSortByWorkspace
} from "../lib/settings/app-settings";
import {
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTreeFile,
  listNativeMarkdownFilesForPath,
  moveNativeMarkdownTreeFile,
  openNativeMarkdownFolder,
  renameNativeMarkdownTreeFile,
  watchNativeMarkdownTree,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import { clampNumber, folderNameFromDocumentPath, isMarkdownPath, parentPathFromPath, pathNameFromPath } from "@markra/shared";

export const markdownFileTreeDefaultWidth = 288;
export const markdownFileTreeMinWidth = 220;
export const markdownFileTreeMaxWidth = 440;
const openFolderLoadCoalesceMs = 120;

function persistWorkspaceState(patch: Parameters<typeof saveStoredWorkspaceState>[0]) {
  saveStoredWorkspaceState(patch).catch(() => {});
}

type UseMarkdownFileTreeOptions = {
  managedAttachmentFolder?: string | null;
  onWorkspaceSessionChange?: (sessionId: string) => unknown;
};

type OpenMarkdownFolderOptions = {
  beforeOpenFolder?: () => unknown | Promise<unknown>;
  pickerTitle?: string;
};
type OpenFolderPathOptions = {
  coalesce?: boolean;
};

function normalizeTreeParentPath(path: string | null | undefined) {
  const trimmedPath = path?.trim();
  return trimmedPath ? trimmedPath : null;
}

function fileTreeSortWorkspacePathFromSourcePath(path: string | null | undefined) {
  const normalizedPath = normalizeTreeParentPath(path);
  if (!normalizedPath) return null;

  return isMarkdownPath(normalizedPath) ? parentPathFromPath(normalizedPath) : normalizedPath;
}

function normalizeManagedAttachmentFolder(folder: string | null | undefined) {
  const normalized = folder?.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/") ?? "";
  if (!normalized || normalized === ".") return ".";

  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

  return parts.length ? parts.join("/") : ".";
}

function normalizedTreeRelativePath(path: string) {
  return path.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/").replace(/^\.\/+/u, "");
}

function treePathIsBelowFolder(path: string, folder: string) {
  if (folder === ".") return true;

  const normalizedPath = normalizedTreeRelativePath(path);
  return normalizedPath === folder || normalizedPath.startsWith(`${folder}/`);
}

type LoadedFileTreeRequest = {
  managedAttachmentFolder: string;
  path: string;
};
type PendingOpenFolderLoad = {
  cancel: () => undefined;
  timeoutId: number;
};
type FileTreeRefreshState = {
  managedAttachmentFolder: string;
  path: string;
  pending: boolean;
  promise: Promise<unknown> | null;
  requestId: number;
};

function filterManagedAttachmentFiles(
  files: readonly NativeMarkdownFolderFile[],
  managedAttachmentFolder: string | null | undefined
) {
  const normalizedManagedAttachmentFolder = normalizeManagedAttachmentFolder(managedAttachmentFolder);
  const entries = files.map((file) => ({
    file,
    relativePath: normalizedTreeRelativePath(file.relativePath)
  }));

  return entries
    .filter(({ file, relativePath }) => {
      if (file.kind === "attachment") {
        return treePathIsBelowFolder(relativePath, normalizedManagedAttachmentFolder);
      }

      return true;
    })
    .map(({ file }) => file);
}

export function useMarkdownFileTree({
  managedAttachmentFolder = "assets",
  onWorkspaceSessionChange
}: UseMarkdownFileTreeOptions = {}) {
  const [files, setFiles] = useState<NativeMarkdownFolderFile[]>([]);
  const [rootName, setRootName] = useState("No folder");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recentFolders, setRecentFolders] = useState<RecentMarkdownFolder[]>([]);
  const [recentFoldersOpen, setRecentFoldersOpenState] = useState(true);
  const [fileTreeSortByWorkspace, setFileTreeSortByWorkspace] = useState<StoredFileTreeSortByWorkspace>({});
  const [fileTreeAssetsVisible, setFileTreeAssetsVisibleState] = useState(true);
  const [width, setWidth] = useState(markdownFileTreeDefaultWidth);
  const [resizing, setResizing] = useState(false);
  const loadedFileTreeRequestRef = useRef<LoadedFileTreeRequest | null>(null);
  const openFolderRequestIdRef = useRef(0);
  const openingFolderPathRef = useRef<string | null>(null);
  const pendingOpenFolderLoadRef = useRef<PendingOpenFolderLoad | null>(null);
  const fileTreeRefreshStateRef = useRef<FileTreeRefreshState | null>(null);
  const openChangedBeforeWorkspaceRestoreRef = useRef(false);
  const normalizedManagedAttachmentFolder = useMemo(
    () => normalizeManagedAttachmentFolder(managedAttachmentFolder),
    [managedAttachmentFolder]
  );
  const fileTreeWorkspacePath = fileTreeSortWorkspacePathFromSourcePath(sourcePath);
  const fileTreeSort = useMemo(
    () => fileTreeWorkspacePath
      ? fileTreeSortByWorkspace[fileTreeWorkspacePath] ?? defaultStoredFileTreeSort
      : defaultStoredFileTreeSort,
    [fileTreeSortByWorkspace, fileTreeWorkspacePath]
  );
  const visibleFiles = useMemo(
    () => filterManagedAttachmentFiles(files, normalizedManagedAttachmentFolder),
    [files, normalizedManagedAttachmentFolder]
  );
  const workspaceLayoutClassName = `workspace-layout grid h-full min-h-0 overflow-hidden ${
    resizing
      ? "transition-none"
      : "transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
  }`;
  const workspaceLayoutStyle = {
    gridTemplateColumns: open ? `${width}px minmax(0,1fr)` : "0px minmax(0,1fr)"
  } satisfies CSSProperties;

  const resize = useCallback((nextWidth: number) => {
    const clampedWidth = clampNumber(nextWidth, markdownFileTreeMinWidth, markdownFileTreeMaxWidth);
    if (clampedWidth === null) return;

    setWidth(clampedWidth);
  }, []);

  const startResize = useCallback(() => {
    setResizing(true);
  }, []);

  const endResize = useCallback(() => {
    setResizing(false);
  }, []);

  const refresh = useCallback(
    async (fallbackPath: string | null = null) => {
      const path = sourcePath ?? fallbackPath;
      const requestId = openFolderRequestIdRef.current;
      if (!path) {
        setFiles([]);
        return;
      }

      const existingRefresh = fileTreeRefreshStateRef.current;
      if (
        existingRefresh?.path === path &&
        existingRefresh.managedAttachmentFolder === normalizedManagedAttachmentFolder &&
        existingRefresh.requestId === requestId
      ) {
        existingRefresh.pending = true;
        return existingRefresh.promise ?? undefined;
      }

      const refreshState: FileTreeRefreshState = {
        managedAttachmentFolder: normalizedManagedAttachmentFolder,
        path,
        pending: false,
        promise: null,
        requestId
      };
      fileTreeRefreshStateRef.current = refreshState;

      const refreshPromise = (async () => {
        try {
          while (true) {
            refreshState.pending = false;
            try {
              const nextFiles = await listNativeMarkdownFilesForPath(refreshState.path, {
                managedAttachmentFolder: refreshState.managedAttachmentFolder
              });
              if (fileTreeRefreshStateRef.current !== refreshState) return;
              if (openFolderRequestIdRef.current !== refreshState.requestId) return;
              if (openingFolderPathRef.current && openingFolderPathRef.current !== refreshState.path) return;

              loadedFileTreeRequestRef.current = {
                managedAttachmentFolder: refreshState.managedAttachmentFolder,
                path: refreshState.path
              };
              startTransition(() => {
                setFiles(nextFiles);
              });
            } catch {
              if (fileTreeRefreshStateRef.current !== refreshState) return;
              if (openFolderRequestIdRef.current !== refreshState.requestId) return;
              if (openingFolderPathRef.current && openingFolderPathRef.current !== refreshState.path) return;

              setFiles([]);
            }

            if (!refreshState.pending) return;
          }
        } finally {
          if (fileTreeRefreshStateRef.current === refreshState) {
            fileTreeRefreshStateRef.current = null;
          }
        }
      })();

      refreshState.promise = refreshPromise;
      return refreshPromise;
    },
    [normalizedManagedAttachmentFolder, sourcePath]
  );

  const setRootFromMarkdownFilePath = useCallback((path: string) => {
    openFolderRequestIdRef.current += 1;
    openingFolderPathRef.current = null;
    pendingOpenFolderLoadRef.current?.cancel();
    pendingOpenFolderLoadRef.current = null;
    setSourcePath(path);
    setRootName(folderNameFromDocumentPath(path));
  }, []);

  const waitForLatestOpenFolderLoad = useCallback((requestId: number) => {
    pendingOpenFolderLoadRef.current?.cancel();

    return new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingOpenFolderLoadRef.current?.timeoutId === timeoutId) {
          pendingOpenFolderLoadRef.current = null;
        }

        resolve(openFolderRequestIdRef.current === requestId);
      }, openFolderLoadCoalesceMs);

      pendingOpenFolderLoadRef.current = {
        cancel: () => {
          window.clearTimeout(timeoutId);
          resolve(false);
          return undefined;
        },
        timeoutId
      };
    });
  }, []);

  const rememberFolder = useCallback((folder: RecentMarkdownFolder) => {
    setRecentFolders((current) => prependRecentMarkdownFolder(current, folder));
    saveStoredRecentMarkdownFolder(folder).catch(() => {});
  }, []);

  const forgetRecentFolder = useCallback((path: string) => {
    setRecentFolders((current) => current.filter((folder) => folder.path !== path));
    removeStoredRecentMarkdownFolder(path).catch(() => {});
  }, []);

  const openFolderPath = useCallback(async (
    path: string,
    name = pathNameFromPath(path),
    preferredSessionId?: string | null,
    clearFilePath = true,
    openTree = true,
    options: OpenFolderPathOptions = {}
  ) => {
    const folderName = name || pathNameFromPath(path);
    const sessionId = preferredSessionId?.trim() ? preferredSessionId : createAiAgentSessionId();
    const requestId = openFolderRequestIdRef.current + 1;
    let nextFiles: NativeMarkdownFolderFile[];

    openFolderRequestIdRef.current = requestId;
    openingFolderPathRef.current = path;

    if (options.coalesce) {
      setRootName(folderName);
      openChangedBeforeWorkspaceRestoreRef.current = true;

      const latestRequestStillActive = await waitForLatestOpenFolderLoad(requestId);
      if (!latestRequestStillActive) {
        if (openingFolderPathRef.current === path) openingFolderPathRef.current = null;
        return null;
      }
    } else {
      pendingOpenFolderLoadRef.current?.cancel();
      pendingOpenFolderLoadRef.current = null;
    }

    try {
      nextFiles = await listNativeMarkdownFilesForPath(path, {
        managedAttachmentFolder: normalizedManagedAttachmentFolder
      });
    } catch {
      if (openFolderRequestIdRef.current !== requestId) return null;

      openingFolderPathRef.current = null;
      forgetRecentFolder(path);

      if (!sourcePath || sourcePath === path) {
        setFiles([]);
        setSourcePath(null);
        setRootName("No folder");
        loadedFileTreeRequestRef.current = null;
        openChangedBeforeWorkspaceRestoreRef.current = true;
        setOpen(false);
      } else {
        setRootName(rootName);
        setOpen(open);
      }

      return null;
    }

    if (openFolderRequestIdRef.current !== requestId) return null;

    openingFolderPathRef.current = null;
    setSourcePath(path);
    setRootName(folderName);
    openChangedBeforeWorkspaceRestoreRef.current = true;
    setOpen(openTree);
    loadedFileTreeRequestRef.current = { managedAttachmentFolder: normalizedManagedAttachmentFolder, path };
    startTransition(() => {
      setFiles(nextFiles);
    });
    rememberFolder({ name: folderName, path });
    onWorkspaceSessionChange?.(sessionId);
    // Opening a folder replaces the startup workspace, so clear the previous file path in the same write.
    persistWorkspaceState({
      aiAgentSessionId: sessionId,
      ...(clearFilePath ? { filePath: null, openFilePaths: [] } : {}),
      fileTreeOpen: openTree,
      folderName,
      folderPath: path
    });
    return { name: folderName, path };
  }, [
    forgetRecentFolder,
    normalizedManagedAttachmentFolder,
    onWorkspaceSessionChange,
    open,
    rememberFolder,
    rootName,
    sourcePath,
    waitForLatestOpenFolderLoad
  ]);

  useEffect(() => {
    return () => {
      openingFolderPathRef.current = null;
      pendingOpenFolderLoadRef.current?.cancel();
      pendingOpenFolderLoadRef.current = null;
    };
  }, []);

  const openMarkdownFolder = useCallback(async (options: OpenMarkdownFolderOptions = {}) => {
    const folder = await openNativeMarkdownFolder(
      options.pickerTitle ? { title: options.pickerTitle } : undefined
    );
    if (!folder) return null;

    const beforeOpenResult = await options.beforeOpenFolder?.();
    if (beforeOpenResult === false) return null;

    return openFolderPath(folder.path, folder.name, undefined, true, true, { coalesce: true });
  }, [openFolderPath]);

  const openRecentFolder = useCallback(async (folder: RecentMarkdownFolder, preferredSessionId?: string | null) => {
    return openFolderPath(folder.path, folder.name, preferredSessionId, true, true, { coalesce: true });
  }, [openFolderPath]);

  const removeRecentFolder = useCallback((folder: RecentMarkdownFolder) => {
    forgetRecentFolder(folder.path);
  }, [forgetRecentFolder]);

  const setRecentFoldersOpen = useCallback((openRecentFolders: boolean) => {
    setRecentFoldersOpenState(openRecentFolders);
    persistWorkspaceState({ recentFoldersOpen: openRecentFolders });
  }, []);

  const setFileTreeAssetsVisible = useCallback((assetsVisible: boolean) => {
    setFileTreeAssetsVisibleState(assetsVisible);
    persistWorkspaceState({ fileTreeAssetsVisible: assetsVisible });
  }, []);

  const setFileTreeSort = useCallback((sort: StoredFileTreeSort) => {
    const normalizedSort = normalizeStoredFileTreeSort(sort);
    const workspacePath = fileTreeSortWorkspacePathFromSourcePath(sourcePath);
    if (!workspacePath) return;

    setFileTreeSortByWorkspace((current) => {
      const remainingSorts = { ...current };
      delete remainingSorts[workspacePath];

      return {
        [workspacePath]: normalizedSort,
        ...remainingSorts
      };
    });
    saveStoredFileTreeSortForWorkspace(workspacePath, normalizedSort).catch(() => {});
  }, [sourcePath]);

  const createFile = useCallback(async (fileName: string, parentPath: string | null = null, contents?: string) => {
    if (!sourcePath) return null;

    const normalizedParentPath = normalizeTreeParentPath(parentPath);
    let file: NativeMarkdownFolderFile;

    if (normalizedParentPath && contents !== undefined) {
      file = await createNativeMarkdownTreeFile(sourcePath, fileName, { contents, parentPath: normalizedParentPath });
    } else if (normalizedParentPath) {
      file = await createNativeMarkdownTreeFile(sourcePath, fileName, normalizedParentPath);
    } else if (contents === undefined) {
      file = await createNativeMarkdownTreeFile(sourcePath, fileName);
    } else {
      file = await createNativeMarkdownTreeFile(sourcePath, fileName, { contents, parentPath: null });
    }

    await refresh(sourcePath);
    return file;
  }, [refresh, sourcePath]);

  const createFolder = useCallback(async (folderName: string, parentPath: string | null = null) => {
    if (!sourcePath) return null;

    const normalizedParentPath = normalizeTreeParentPath(parentPath);
    const folder = normalizedParentPath
      ? await createNativeMarkdownTreeFolder(sourcePath, folderName, normalizedParentPath)
      : await createNativeMarkdownTreeFolder(sourcePath, folderName);
    await refresh(sourcePath);
    return folder;
  }, [refresh, sourcePath]);

  const renameFile = useCallback(async (file: NativeMarkdownFolderFile, fileName: string) => {
    if (!sourcePath) return null;

    const renamedFile = await renameNativeMarkdownTreeFile(sourcePath, file.path, fileName);
    await refresh(sourcePath);
    return renamedFile;
  }, [refresh, sourcePath]);

  const moveFile = useCallback(async (file: NativeMarkdownFolderFile, targetParentPath: string | null = null) => {
    if (!sourcePath) return null;

    const movedFile = await moveNativeMarkdownTreeFile(sourcePath, file.path, normalizeTreeParentPath(targetParentPath));
    await refresh(sourcePath);
    return movedFile;
  }, [refresh, sourcePath]);

  const deleteFile = useCallback(async (file: NativeMarkdownFolderFile) => {
    if (!sourcePath) return false;

    await deleteNativeMarkdownTreeFile(sourcePath, file.path);
    await refresh(sourcePath);
    return true;
  }, [refresh, sourcePath]);

  const toggle = useCallback(
    (fallbackPath: string | null = null) => {
      openChangedBeforeWorkspaceRestoreRef.current = true;
      setOpen((currentOpen) => {
        const nextOpen = !currentOpen;
        const refreshPath = sourcePath ?? fallbackPath;
        const treeAlreadyLoaded =
          Boolean(refreshPath) &&
          loadedFileTreeRequestRef.current?.path === refreshPath &&
          loadedFileTreeRequestRef.current.managedAttachmentFolder === normalizedManagedAttachmentFolder;

        if (nextOpen && !treeAlreadyLoaded) refresh(fallbackPath);
        persistWorkspaceState({ fileTreeOpen: nextOpen });
        return nextOpen;
      });
    },
    [normalizedManagedAttachmentFolder, refresh, sourcePath]
  );

  const rootNameForDocument = useCallback(
    (path: string | null) => (sourcePath ? rootName : folderNameFromDocumentPath(path)),
    [rootName, sourcePath]
  );

  useEffect(() => {
    let active = true;

    getStoredFileTreeSortByWorkspace().then((sorts) => {
      if (active) setFileTreeSortByWorkspace(sorts);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getStoredRecentMarkdownFolders().then((folders) => {
      if (active) setRecentFolders(folders);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getStoredWorkspaceState().then((workspace) => {
      if (active) {
        if (!openChangedBeforeWorkspaceRestoreRef.current) setOpen(workspace.fileTreeOpen);
        setRecentFoldersOpenState(workspace.recentFoldersOpen ?? true);
        setFileTreeAssetsVisibleState(workspace.fileTreeAssetsVisible ?? true);
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!sourcePath) {
      loadedFileTreeRequestRef.current = null;
      setFiles([]);
      return () => {
        active = false;
      };
    }

    if (
      loadedFileTreeRequestRef.current?.path === sourcePath &&
      loadedFileTreeRequestRef.current.managedAttachmentFolder === normalizedManagedAttachmentFolder
    ) {
      return () => {
        active = false;
      };
    }

    loadedFileTreeRequestRef.current = { managedAttachmentFolder: normalizedManagedAttachmentFolder, path: sourcePath };
    listNativeMarkdownFilesForPath(sourcePath, {
      managedAttachmentFolder: normalizedManagedAttachmentFolder
    }).then((nextFiles) => {
      if (active) setFiles(nextFiles);
    }).catch(() => {
      if (active) {
        loadedFileTreeRequestRef.current = null;
        setFiles([]);
      }
    });

    return () => {
      active = false;
    };
  }, [normalizedManagedAttachmentFolder, sourcePath]);

  useEffect(() => {
    if (!sourcePath) return;

    let active = true;
    let unwatch: (() => unknown) | null = null;

    watchNativeMarkdownTree(sourcePath, async () => {
      if (!active) return;

      await refresh(sourcePath);
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
  }, [refresh, sourcePath]);

  return {
    createFile,
    createFolder,
    deleteFile,
    files: visibleFiles,
    fileTreeAssetsVisible,
    fileTreeSort,
    recentFolders,
    recentFoldersOpen,
    resizing,
    width,
    maxWidth: markdownFileTreeMaxWidth,
    minWidth: markdownFileTreeMinWidth,
    open,
    openFolderPath,
    openRecentFolder,
    removeRecentFolder,
    setRecentFoldersOpen,
    setFileTreeAssetsVisible,
    setFileTreeSort,
    moveFile,
    rootNameForDocument,
    refresh,
    setRootFromMarkdownFilePath,
    sourcePath,
    openMarkdownFolder,
    renameFile,
    resize,
    endResize,
    startResize,
    toggle,
    workspaceLayoutClassName,
    workspaceLayoutStyle
  };
}
