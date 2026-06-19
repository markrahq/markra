import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

function persistWorkspaceState(patch: Parameters<typeof saveStoredWorkspaceState>[0]) {
  saveStoredWorkspaceState(patch).catch(() => {});
}

type UseMarkdownFileTreeOptions = {
  onWorkspaceSessionChange?: (sessionId: string) => unknown;
};

type OpenMarkdownFolderOptions = {
  beforeOpenFolder?: () => unknown | Promise<unknown>;
  pickerTitle?: string;
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

export function useMarkdownFileTree({ onWorkspaceSessionChange }: UseMarkdownFileTreeOptions = {}) {
  const [files, setFiles] = useState<NativeMarkdownFolderFile[]>([]);
  const [rootName, setRootName] = useState("No folder");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recentFolders, setRecentFolders] = useState<RecentMarkdownFolder[]>([]);
  const [recentFoldersOpen, setRecentFoldersOpenState] = useState(true);
  const [fileTreeSortByWorkspace, setFileTreeSortByWorkspace] = useState<StoredFileTreeSortByWorkspace>({});
  const [width, setWidth] = useState(markdownFileTreeDefaultWidth);
  const [resizing, setResizing] = useState(false);
  const loadedSourcePathRef = useRef<string | null>(null);
  const openChangedBeforeWorkspaceRestoreRef = useRef(false);
  const fileTreeWorkspacePath = fileTreeSortWorkspacePathFromSourcePath(sourcePath);
  const fileTreeSort = useMemo(
    () => fileTreeWorkspacePath
      ? fileTreeSortByWorkspace[fileTreeWorkspacePath] ?? defaultStoredFileTreeSort
      : defaultStoredFileTreeSort,
    [fileTreeSortByWorkspace, fileTreeWorkspacePath]
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
      if (!path) {
        setFiles([]);
        return;
      }

      try {
        setFiles(await listNativeMarkdownFilesForPath(path));
      } catch {
        setFiles([]);
      }
    },
    [sourcePath]
  );

  const setRootFromMarkdownFilePath = useCallback((path: string) => {
    setSourcePath(path);
    setRootName(folderNameFromDocumentPath(path));
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
    openTree = true
  ) => {
    const folderName = name || pathNameFromPath(path);
    const sessionId = preferredSessionId?.trim() ? preferredSessionId : createAiAgentSessionId();
    let nextFiles: NativeMarkdownFolderFile[];

    try {
      nextFiles = await listNativeMarkdownFilesForPath(path);
    } catch {
      forgetRecentFolder(path);

      if (!sourcePath || sourcePath === path) {
        setFiles([]);
        setSourcePath(null);
        setRootName("No folder");
        openChangedBeforeWorkspaceRestoreRef.current = true;
        setOpen(false);
      }

      return null;
    }

    setSourcePath(path);
    setRootName(folderName);
    openChangedBeforeWorkspaceRestoreRef.current = true;
    setOpen(openTree);
    loadedSourcePathRef.current = path;
    setFiles(nextFiles);
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
  }, [forgetRecentFolder, onWorkspaceSessionChange, rememberFolder, sourcePath]);

  const openMarkdownFolder = useCallback(async (options: OpenMarkdownFolderOptions = {}) => {
    const folder = await openNativeMarkdownFolder(
      options.pickerTitle ? { title: options.pickerTitle } : undefined
    );
    if (!folder) return null;

    const beforeOpenResult = await options.beforeOpenFolder?.();
    if (beforeOpenResult === false) return null;

    return openFolderPath(folder.path, folder.name);
  }, [openFolderPath]);

  const openRecentFolder = useCallback(async (folder: RecentMarkdownFolder, preferredSessionId?: string | null) => {
    return openFolderPath(folder.path, folder.name, preferredSessionId);
  }, [openFolderPath]);

  const removeRecentFolder = useCallback((folder: RecentMarkdownFolder) => {
    forgetRecentFolder(folder.path);
  }, [forgetRecentFolder]);

  const setRecentFoldersOpen = useCallback((openRecentFolders: boolean) => {
    setRecentFoldersOpenState(openRecentFolders);
    persistWorkspaceState({ recentFoldersOpen: openRecentFolders });
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
        if (nextOpen) refresh(fallbackPath);
        persistWorkspaceState({ fileTreeOpen: nextOpen });
        return nextOpen;
      });
    },
    [refresh]
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
      }
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!sourcePath) {
      loadedSourcePathRef.current = null;
      setFiles([]);
      return () => {
        active = false;
      };
    }

    if (loadedSourcePathRef.current === sourcePath) {
      return () => {
        active = false;
      };
    }

    loadedSourcePathRef.current = sourcePath;
    listNativeMarkdownFilesForPath(sourcePath).then((nextFiles) => {
      if (active) setFiles(nextFiles);
    }).catch(() => {
      if (active) {
        loadedSourcePathRef.current = null;
        setFiles([]);
      }
    });

    return () => {
      active = false;
    };
  }, [sourcePath]);

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
    files,
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
