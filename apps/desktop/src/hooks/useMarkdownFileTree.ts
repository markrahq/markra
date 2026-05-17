import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  createAiAgentSessionId,
  getStoredRecentMarkdownFolders,
  prependRecentMarkdownFolder,
  saveStoredRecentMarkdownFolder,
  saveStoredWorkspaceState,
  type RecentMarkdownFolder
} from "../lib/settings/app-settings";
import {
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTreeFile,
  listNativeMarkdownFilesForPath,
  openNativeMarkdownFolder,
  renameNativeMarkdownTreeFile,
  watchNativeMarkdownTree,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import { clampNumber, folderNameFromDocumentPath, pathNameFromPath } from "@markra/shared";

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

export function useMarkdownFileTree({ onWorkspaceSessionChange }: UseMarkdownFileTreeOptions = {}) {
  const [files, setFiles] = useState<NativeMarkdownFolderFile[]>([]);
  const [rootName, setRootName] = useState("No folder");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recentFolders, setRecentFolders] = useState<RecentMarkdownFolder[]>([]);
  const [width, setWidth] = useState(markdownFileTreeDefaultWidth);
  const [resizing, setResizing] = useState(false);
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

  const openFolderPath = useCallback((
    path: string,
    name = pathNameFromPath(path),
    preferredSessionId?: string | null,
    clearFilePath = true
  ) => {
    const folderName = name || pathNameFromPath(path);
    const sessionId = preferredSessionId?.trim() ? preferredSessionId : createAiAgentSessionId();
    setSourcePath(path);
    setRootName(folderName);
    setOpen(true);
    rememberFolder({ name: folderName, path });
    onWorkspaceSessionChange?.(sessionId);
    // Opening a folder replaces the startup workspace, so clear the previous file path in the same write.
    persistWorkspaceState({
      aiAgentSessionId: sessionId,
      ...(clearFilePath ? { filePath: null } : {}),
      fileTreeOpen: true,
      folderName,
      folderPath: path
    });
  }, [onWorkspaceSessionChange, rememberFolder]);

  const openMarkdownFolder = useCallback(async (options: OpenMarkdownFolderOptions = {}) => {
    const folder = await openNativeMarkdownFolder(
      options.pickerTitle ? { title: options.pickerTitle } : undefined
    );
    if (!folder) return null;

    await options.beforeOpenFolder?.();
    openFolderPath(folder.path, folder.name);
    return folder;
  }, [openFolderPath]);

  const openRecentFolder = useCallback((folder: RecentMarkdownFolder, preferredSessionId?: string | null) => {
    openFolderPath(folder.path, folder.name, preferredSessionId);
    return folder;
  }, [openFolderPath]);

  const createFile = useCallback(async (fileName: string, parentPath: string | null = null) => {
    if (!sourcePath) return null;

    const normalizedParentPath = normalizeTreeParentPath(parentPath);
    const file = normalizedParentPath
      ? await createNativeMarkdownTreeFile(sourcePath, fileName, normalizedParentPath)
      : await createNativeMarkdownTreeFile(sourcePath, fileName);
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

  const deleteFile = useCallback(async (file: NativeMarkdownFolderFile) => {
    if (!sourcePath) return false;

    await deleteNativeMarkdownTreeFile(sourcePath, file.path);
    await refresh(sourcePath);
    return true;
  }, [refresh, sourcePath]);

  const toggle = useCallback(
    (fallbackPath: string | null = null) => {
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

    getStoredRecentMarkdownFolders().then((folders) => {
      if (active) setRecentFolders(folders);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!sourcePath) {
      setFiles([]);
      return () => {
        active = false;
      };
    }

    listNativeMarkdownFilesForPath(sourcePath).then((nextFiles) => {
      if (active) setFiles(nextFiles);
    }).catch(() => {
      if (active) setFiles([]);
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
    recentFolders,
    resizing,
    width,
    maxWidth: markdownFileTreeMaxWidth,
    minWidth: markdownFileTreeMinWidth,
    open,
    openFolderPath,
    openRecentFolder,
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
