import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ImageIcon,
  ListChevronsDownUp,
  ListChevronsUpDown,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  TableOfContents
} from "lucide-react";
import { clampNumber, t, type AppLanguage } from "@markra/shared";
import { IconButton } from "@markra/ui";
import type { MarkdownOutlineItem } from "@markra/markdown";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import { showNativeMarkdownFileTreeContextMenu } from "../lib/tauri";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import type { RecentMarkdownFolder } from "../lib/settings/app-settings";

type MarkdownFileTreeDrawerProps = {
  currentPath: string | null;
  files: NativeMarkdownFolderFile[];
  language?: AppLanguage;
  maxWidth?: number;
  minWidth?: number;
  folderOpen?: boolean;
  open: boolean;
  outlineItems: MarkdownOutlineItem[];
  platform?: DesktopPlatform;
  recentFolders?: readonly RecentMarkdownFolder[];
  rootPath?: string | null;
  rootName: string;
  width?: number;
  onCreateFile?: (fileName: string, parentPath?: string | null) => unknown | Promise<unknown>;
  onCreateFolder?: (folderName: string, parentPath?: string | null) => unknown | Promise<unknown>;
  onDeleteFile?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenFile: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenRecentFolder?: (folder: RecentMarkdownFolder) => unknown | Promise<unknown>;
  onOpenSettings?: () => unknown | Promise<unknown>;
  onRenameFile?: (file: NativeMarkdownFolderFile, fileName: string) => unknown | Promise<unknown>;
  onResize?: (width: number) => unknown;
  onResizeEnd?: () => unknown;
  onResizeStart?: () => unknown;
  onSelectOutlineItem: (item: MarkdownOutlineItem, index: number) => unknown;
  onToggleMarkdownFiles?: () => unknown;
};

type FolderNode = {
  type: "folder";
  name: string;
  path: string | null;
  relativePath: string;
  children: TreeNode[];
};

type FileNode = {
  type: "file";
  file: NativeMarkdownFolderFile;
  name: string;
  relativePath: string;
};

type TreeNode = FolderNode | FileNode;

function sortTreeNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  nodes.forEach((node) => {
    if (node.type === "folder") sortTreeNodes(node.children);
  });
}

function normalizeCreateParentPath(path: string | null | undefined) {
  const trimmedPath = path?.trim();
  return trimmedPath ? trimmedPath : null;
}

function nativePathSeparator(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function joinNativePath(rootPath: string | null | undefined, relativePath: string) {
  const normalizedRootPath = normalizeCreateParentPath(rootPath);
  if (!normalizedRootPath) return null;

  const pathSeparator = nativePathSeparator(normalizedRootPath);
  const normalizedRelativePath = relativePath
    .split(/[\\/]/)
    .filter(Boolean)
    .join(pathSeparator);

  if (!normalizedRelativePath) return normalizedRootPath;

  return `${normalizedRootPath.replace(/[\\/]+$/, "")}${pathSeparator}${normalizedRelativePath}`;
}

function parentPathFromPath(path: string) {
  const lastSeparatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSeparatorIndex < 0) return null;
  if (lastSeparatorIndex === 0) return path.slice(0, 1);
  return path.slice(0, lastSeparatorIndex);
}

function buildMarkdownFileTree(files: NativeMarkdownFolderFile[], rootPath?: string | null) {
  const rootNodes: TreeNode[] = [];
  const folders = new Map<string, FolderNode>();

  const ensureFolder = (
    relativePath: string,
    siblings: TreeNode[],
    folderName: string,
    folderPath = joinNativePath(rootPath, relativePath)
  ) => {
    let folder = folders.get(relativePath);

    if (!folder) {
      folder = {
        type: "folder",
        name: folderName,
        path: folderPath,
        relativePath,
        children: []
      };
      folders.set(relativePath, folder);
      siblings.push(folder);
    } else if (!folder.path && folderPath) {
      folder.path = folderPath;
    }

    return folder;
  };

  files.forEach((file) => {
    const parts = file.relativePath.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) return;

    let siblings = rootNodes;
    let parentPath = "";

    parts.slice(0, -1).forEach((folderName) => {
      const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName;
      const folder = ensureFolder(relativePath, siblings, folderName);

      siblings = folder.children;
      parentPath = relativePath;
    });

    if (file.kind === "folder") {
      ensureFolder(file.relativePath, siblings, parts.at(-1) ?? file.name, file.path);
      return;
    }

    siblings.push({
      type: "file",
      file,
      name: parts.at(-1) ?? file.name,
      relativePath: file.relativePath
    });
  });

  sortTreeNodes(rootNodes);
  return rootNodes;
}

function filterMarkdownFileTree(nodes: TreeNode[], query: string): TreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes.flatMap((node): TreeNode[] => {
    if (node.type === "file") {
      return node.relativePath.toLowerCase().includes(normalizedQuery) ? [node] : [];
    }

    const children = filterMarkdownFileTree(node.children, normalizedQuery);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

function collectMarkdownFolderPaths(nodes: TreeNode[]) {
  const paths: string[] = [];

  const collect = (treeNodes: TreeNode[]) => {
    treeNodes.forEach((node) => {
      if (node.type !== "folder") return;

      paths.push(node.relativePath);
      collect(node.children);
    });
  };

  collect(nodes);
  return paths;
}

function folderNodeAsFile(node: FolderNode): NativeMarkdownFolderFile {
  return {
    kind: "folder",
    name: node.name,
    path: node.path ?? node.relativePath,
    relativePath: node.relativePath
  };
}

const defaultOutlineHeightPercent = 40;
const minOutlineHeightPercent = 24;
const maxOutlineHeightPercent = 72;
const outlineResizeKeyboardStepPercent = 5;
const outlineResizeFallbackHeight = 320;

export function MarkdownFileTreeDrawer({
  currentPath,
  files,
  language = "en",
  maxWidth = 440,
  minWidth = 220,
  folderOpen = true,
  open,
  outlineItems,
  platform = resolveDesktopPlatform(),
  recentFolders = [],
  rootPath = null,
  rootName,
  width = 288,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onOpenFile,
  onOpenRecentFolder,
  onOpenSettings = () => {},
  onRenameFile,
  onResize,
  onResizeEnd,
  onResizeStart,
  onSelectOutlineItem,
  onToggleMarkdownFiles
}: MarkdownFileTreeDrawerProps) {
  const resizeCleanupRef = useRef<(() => unknown) | null>(null);
  const outlineResizeCleanupRef = useRef<(() => unknown) | null>(null);
  const fileTreeBodyRef = useRef<HTMLDivElement | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [outlineHeightPercent, setOutlineHeightPercent] = useState(defaultOutlineHeightPercent);
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingParentPath, setCreatingParentPath] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const fullTree = useMemo(() => buildMarkdownFileTree(files, rootPath), [files, rootPath]);
  const tree = useMemo(() => filterMarkdownFileTree(fullTree, searchQuery), [fullTree, searchQuery]);
  const folderPaths = useMemo(() => collectMarkdownFolderPaths(fullTree), [fullTree]);
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const drawerStateClass = open
    ? "translate-x-0 opacity-100"
    : "pointer-events-none -translate-x-4 opacity-0";
  const resolvedMinWidth = Math.max(160, minWidth);
  const resolvedMaxWidth = Math.max(resolvedMinWidth, maxWidth);
  const resolvedWidth = clampNumber(width, resolvedMinWidth, resolvedMaxWidth);
  const showWindowsSidebarToggle = platform === "windows" && onToggleMarkdownFiles;
  const WindowsSidebarToggleIcon = open ? PanelLeft : PanelRight;
  const drawerTopPaddingClassName = platform === "windows" ? "pt-0" : "pt-10";
  const fileCreationAvailable = folderOpen && Boolean(onCreateFile);
  const folderCreationAvailable = folderOpen && Boolean(onCreateFolder);
  const folderActionsAvailable = fileCreationAvailable || folderCreationAvailable;
  const folderExpansionAvailable = folderPaths.length > 0;
  const allFoldersExpanded = folderExpansionAvailable && folderPaths.every((folderPath) => expandedFolders.has(folderPath));
  const recentFolderChoices = recentFolders.slice(0, 5);
  const recentFolderAreaVisible = recentFolderChoices.length > 0 && Boolean(onOpenRecentFolder);
  const filePanelStyle = outlineOpen ? { flex: `0 1 ${100 - outlineHeightPercent}%` } : undefined;
  const outlinePanelStyle = outlineOpen ? { flex: `0 1 ${outlineHeightPercent}%` } : undefined;

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      outlineResizeCleanupRef.current?.();
      outlineResizeCleanupRef.current = null;
    };
  }, []);

  const toggleFolder = (relativePath: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  };

  const toggleAllFolders = () => {
    if (!folderExpansionAvailable) return;

    setExpandedFolders((current) => {
      const currentAllFoldersExpanded = folderPaths.every((folderPath) => current.has(folderPath));
      return currentAllFoldersExpanded ? new Set() : new Set(folderPaths);
    });
  };

  const startCreatingFile = (parentPath: string | null = null) => {
    if (!fileCreationAvailable) return;

    setCreatingFolder(false);
    setNewFolderName("");
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingParentPath(normalizeCreateParentPath(parentPath));
    setCreatingFile(true);
    setNewFileName("");
  };

  const startCreatingFolder = (parentPath: string | null = null) => {
    if (!folderCreationAvailable) return;

    setCreatingFile(false);
    setNewFileName("");
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingParentPath(normalizeCreateParentPath(parentPath));
    setCreatingFolder(true);
    setNewFolderName("");
  };

  const commitCreateFolder = () => {
    if (!folderCreationAvailable) return;

    const normalizedName = newFolderName.trim();
    if (!normalizedName) {
      setCreatingFolder(false);
      setNewFolderName("");
      setCreatingParentPath(null);
      return;
    }

    if (creatingParentPath) {
      onCreateFolder?.(normalizedName, creatingParentPath);
    } else {
      onCreateFolder?.(normalizedName);
    }
    setCreatingFolder(false);
    setNewFolderName("");
    setCreatingParentPath(null);
  };

  const commitCreateFile = () => {
    if (!fileCreationAvailable) return;

    const normalizedName = newFileName.trim();
    if (!normalizedName) {
      setCreatingFile(false);
      setNewFileName("");
      setCreatingParentPath(null);
      return;
    }

    if (creatingParentPath) {
      onCreateFile?.(normalizedName, creatingParentPath);
    } else {
      onCreateFile?.(normalizedName);
    }
    setCreatingFile(false);
    setNewFileName("");
    setCreatingParentPath(null);
  };

  const startRenamingFile = (file: NativeMarkdownFolderFile) => {
    setCreatingFile(false);
    setNewFileName("");
    setCreatingFolder(false);
    setNewFolderName("");
    setCreatingParentPath(null);
    setRenamingPath(file.path);
    setRenameFileName(file.name);
  };

  const commitRenameFile = (file: NativeMarkdownFolderFile) => {
    const normalizedName = renameFileName.trim();
    if (!normalizedName || normalizedName === file.name) {
      setRenamingPath(null);
      setRenameFileName("");
      return;
    }

    onRenameFile?.(file, normalizedName);
    setRenamingPath(null);
    setRenameFileName("");
  };

  const cancelFileTreeInputs = () => {
    setCreatingFile(false);
    setNewFileName("");
    setCreatingFolder(false);
    setNewFolderName("");
    setCreatingParentPath(null);
    setRenamingPath(null);
    setRenameFileName("");
  };

  const cancelFileTreeInputsFromBlankArea = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input")) return;

    cancelFileTreeInputs();
  };

  const creatingAtParentPath = (parentPath: string | null | undefined, depth = 0) => {
    const normalizedParentPath = normalizeCreateParentPath(parentPath);
    if (!normalizedParentPath && depth > 0) return false;
    return normalizedParentPath === creatingParentPath;
  };

  const targetFolderPathForFile = (file: NativeMarkdownFolderFile | undefined) => {
    if (!file) return null;
    return file.kind === "folder" ? file.path : parentPathFromPath(file.path);
  };

  const openContextMenu = (
    event: ReactMouseEvent,
    file?: NativeMarkdownFolderFile,
    targetFolderPath?: string | null
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!folderActionsAvailable && !file) return;

    const createTargetFolderPath = normalizeCreateParentPath(targetFolderPath ?? targetFolderPathForFile(file));

    showNativeMarkdownFileTreeContextMenu(
      {
        createFile: fileCreationAvailable ? () => startCreatingFile(createTargetFolderPath) : undefined,
        createFolder: folderCreationAvailable ? () => startCreatingFolder(createTargetFolderPath) : undefined,
        deleteFile: (targetFile) => {
          onDeleteFile?.(targetFile);
        },
        renameFile: startRenamingFile
      },
      language,
      file
    ).catch(() => {});
  };

  const resizeDrawer = (nextWidth: number | null) => {
    if (nextWidth === null) return;
    onResize?.(nextWidth);
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onResize || resolvedWidth === null) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = resolvedWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    onResizeStart?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeDrawer(clampNumber(startWidth + moveEvent.clientX - startX, resolvedMinWidth, resolvedMaxWidth));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
      onResizeEnd?.();
    };

    const handlePointerUp = () => {
      cleanup();
    };

    resizeCleanupRef.current?.();
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onResize || resolvedWidth === null) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeDrawer(clampNumber(resolvedWidth - 24, resolvedMinWidth, resolvedMaxWidth));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeDrawer(clampNumber(resolvedWidth + 24, resolvedMinWidth, resolvedMaxWidth));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeDrawer(resolvedMinWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeDrawer(resolvedMaxWidth);
    }
  };

  const resizeOutline = (nextPercent: number | null) => {
    const clampedPercent = clampNumber(
      nextPercent === null ? null : Math.round(nextPercent),
      minOutlineHeightPercent,
      maxOutlineHeightPercent
    );
    if (clampedPercent === null) return;

    setOutlineHeightPercent(clampedPercent);
  };

  const handleOutlineResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!outlineOpen) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const startOutlineHeightPercent = outlineHeightPercent;
    const layoutHeight = fileTreeBodyRef.current?.getBoundingClientRect().height ?? 0;
    const resolvedLayoutHeight = layoutHeight > 0 ? layoutHeight : outlineResizeFallbackHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPercent = ((moveEvent.clientY - startY) / resolvedLayoutHeight) * 100;
      resizeOutline(startOutlineHeightPercent - deltaPercent);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      outlineResizeCleanupRef.current = null;
    };

    const handlePointerUp = () => {
      cleanup();
    };

    outlineResizeCleanupRef.current?.();
    outlineResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleOutlineResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      resizeOutline(outlineHeightPercent + outlineResizeKeyboardStepPercent);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      resizeOutline(outlineHeightPercent - outlineResizeKeyboardStepPercent);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeOutline(minOutlineHeightPercent);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeOutline(maxOutlineHeightPercent);
    }
  };

  const rowBranchClassForDepth = (depth: number) => (
    depth === 0
      ? ""
      : "before:absolute before:left-[-1px] before:top-1/2 before:h-px before:w-6 before:bg-(--border-default)"
  );

  const renderCreateRows = (parentPath: string | null | undefined, depth: number) => {
    if ((!creatingFile && !creatingFolder) || !creatingAtParentPath(parentPath, depth)) return null;

    const rowIndentClass = "pl-8";
    const rowBranchClass = rowBranchClassForDepth(depth);

    return (
      <>
        {creatingFile ? (
          <li key="__creating-file">
            <div className={`relative grid h-8 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}>
              <FileText aria-hidden="true" className="shrink-0" size={15} />
              <input
                aria-label={label("app.newMarkdownFileName")}
                autoFocus
                className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-none text-(--text-primary) outline-none"
                type="text"
                value={newFileName}
                placeholder="Untitled.md"
                onChange={(event) => setNewFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitCreateFile();
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    setCreatingFile(false);
                    setNewFileName("");
                    setCreatingParentPath(null);
                  }
                }}
              />
            </div>
          </li>
        ) : null}
        {creatingFolder ? (
          <li key="__creating-folder">
            <div className={`relative grid h-8 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}>
              <Folder aria-hidden="true" className="shrink-0" size={15} />
              <input
                aria-label={label("app.newMarkdownFolderName")}
                autoFocus
                className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-none text-(--text-primary) outline-none"
                type="text"
                value={newFolderName}
                placeholder={label("app.newMarkdownFolder")}
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitCreateFolder();
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    setCreatingFolder(false);
                    setNewFolderName("");
                    setCreatingParentPath(null);
                  }
                }}
              />
            </div>
          </li>
        ) : null}
      </>
    );
  };

  const renderNodes = (
    nodes: TreeNode[],
    depth = 0,
    treeLabel = label("app.markdownFiles"),
    parentPath: string | null = null
  ) => (
    <ol
      className={depth === 0 ? "m-0 list-none p-0" : "ml-5 list-none border-l border-(--border-default) p-0"}
      role={depth === 0 ? "tree" : "group"}
      aria-label={treeLabel}
    >
      {renderCreateRows(parentPath, depth)}
      {nodes.map((node) => {
        const rowIndentClass = "pl-8";
        const rowBranchClass = rowBranchClassForDepth(depth);

        if (node.type === "folder") {
          const expanded = searchQuery.trim().length > 0 ||
            expandedFolders.has(node.relativePath) ||
            ((creatingFile || creatingFolder) && creatingAtParentPath(node.path, depth + 1));

          return (
            <li key={node.relativePath}>
              <button
                className={`relative flex h-8 w-full cursor-pointer items-center gap-1 border-0 bg-transparent py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none ${rowIndentClass} ${rowBranchClass}`}
                type="button"
                aria-expanded={expanded}
                onContextMenu={(event) => openContextMenu(event, folderNodeAsFile(node), node.path)}
                onClick={() => toggleFolder(node.relativePath)}
              >
                {expanded ? (
                  <ChevronDown aria-hidden="true" className="shrink-0" size={13} />
                ) : (
                  <ChevronRight aria-hidden="true" className="shrink-0" size={13} />
                )}
                <Folder aria-hidden="true" className="shrink-0" size={16} />
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
              {expanded ? renderNodes(node.children, depth + 1, `${node.name} children`, node.path) : null}
            </li>
          );
        }

        const active = node.file.path === currentPath;
        const renaming = renamingPath === node.file.path;
        const asset = node.file.kind === "asset";
        const FileIcon = asset ? ImageIcon : FileText;

        return (
          <li key={node.file.path}>
            {renaming ? (
              <div
                className={`relative grid h-8 w-full grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}
              >
                <FileIcon aria-hidden="true" className="shrink-0" size={15} />
                <input
                  aria-label={label("app.renameMarkdownFile")}
                  autoFocus
                  className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-none text-(--text-primary) outline-none"
                  type="text"
                  value={renameFileName}
                  onChange={(event) => setRenameFileName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRenameFile(node.file);
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingPath(null);
                      setRenameFileName("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                className={`relative grid h-8 w-full cursor-pointer grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 border-0 bg-transparent py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-[current=page]:border-l-[3px] aria-[current=page]:border-(--text-secondary) aria-[current=page]:bg-(--bg-active) aria-[current=page]:text-(--text-heading) ${rowIndentClass} ${rowBranchClass}`}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={node.relativePath}
                title={node.file.path}
                onContextMenu={(event) => openContextMenu(event, node.file)}
                onClick={() => {
                  onOpenFile(node.file);
                }}
              >
                <FileIcon aria-hidden="true" className="shrink-0" size={15} />
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );

  const renderOutline = () => (
    outlineItems.length > 0 ? (
      <ol className="m-0 list-none p-0" aria-label={label("app.documentOutline")}>
        {outlineItems.map((item, index) => (
          <li key={`${item.level}-${item.title}-${index}`}>
            <button
              className="h-8 w-full cursor-pointer truncate border-0 bg-transparent py-0 pr-3 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
              style={{ paddingLeft: `${12 + (item.level - 1) * 14}px` }}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectOutlineItem(item, index)}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ol>
    ) : (
      <p className="m-0 px-4 py-3 text-[12px] text-(--text-secondary)">{label("app.noHeadings")}</p>
    )
  );

  const renderFolderAccessArea = () => (
    recentFolderAreaVisible ? (
      <div className="shrink-0 border-b border-(--border-default) bg-(--bg-secondary) py-1">
        {recentFolderAreaVisible && onOpenRecentFolder ? (
          <section
            className="markdown-file-tree-recent-folders px-2 py-1"
            role="region"
            aria-label={label("app.recentMarkdownFolders")}
          >
            <h3 className="m-0 px-2 pb-1 text-[11px] leading-4 font-[560] tracking-normal text-(--text-secondary)">
              {label("app.recentMarkdownFolders")}
            </h3>
            <div className="space-y-0.5">
              {recentFolderChoices.map((folder) => (
                <button
                  className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
                  key={folder.path}
                  type="button"
                  title={folder.path}
                  onClick={() => onOpenRecentFolder(folder)}
                >
                  <Folder aria-hidden="true" className="shrink-0" size={14} />
                  <span className="min-w-0 truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    ) : null
  );

  return (
    <>
      {!open ? (
        <IconButton
          className="fixed bottom-3 left-3 z-30 opacity-40 hover:opacity-100 focus-visible:opacity-100"
          label={label("settings.title")}
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" size={15} />
        </IconButton>
      ) : null}

      {!open && showWindowsSidebarToggle ? (
        <IconButton
          className="fixed bottom-3 z-30 opacity-45 transition-[left,opacity,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 focus-visible:opacity-100"
          label={label("app.toggleMarkdownFiles")}
          pressed={open}
          style={{ left: "48px" }}
          onClick={onToggleMarkdownFiles}
        >
          <WindowsSidebarToggleIcon aria-hidden="true" size={15} />
        </IconButton>
      ) : null}

      <aside
        className={`markdown-file-tree relative flex h-full min-h-0 w-full flex-col border-r border-(--border-default) bg-(--bg-secondary) ${drawerTopPaddingClassName} will-change-transform transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${drawerStateClass}`}
        aria-label={label("app.markdownFileTree")}
        aria-hidden={!open}
        inert={!open}
        style={resolvedWidth === null ? undefined : { maxWidth: resolvedWidth, minWidth: resolvedWidth, width: resolvedWidth }}
      >
        {open && onResize && resolvedWidth !== null ? (
          <div
            className="markdown-file-tree-resizer absolute top-10 right-0 bottom-0 z-30 w-2 cursor-col-resize touch-none outline-none"
            role="separator"
            tabIndex={0}
            aria-label={label("app.resizeMarkdownFiles")}
            aria-orientation="vertical"
            aria-valuemin={resolvedMinWidth}
            aria-valuemax={resolvedMaxWidth}
            aria-valuenow={resolvedWidth}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizePointerDown}
          />
        ) : null}
        <div className="grid h-10 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--border-default) px-3">
          <h2 className="m-0 truncate text-[14px] font-[560] tracking-normal text-(--text-heading)">
            {label("app.files")}
          </h2>
          <div className="flex items-center gap-0.5">
            <IconButton
              className="rounded-md"
              label={label("app.searchMarkdownFiles")}
              pressed={searchOpen}
              onClick={() => {
                if (searchOpen) setSearchQuery("");
                setSearchOpen((open) => !open);
              }}
            >
              <Search aria-hidden="true" size={15} />
            </IconButton>
          </div>
        </div>

        {searchOpen ? (
          <>
            <label className="sr-only" htmlFor="markra-file-search">
              {label("app.searchMarkdownFiles")}
            </label>
            <input
              id="markra-file-search"
              className="h-8 border-0 border-b border-(--border-default) bg-transparent px-3 text-[12px] text-(--text-primary) outline-none placeholder:text-(--text-secondary) focus:border-(--border-strong)"
              type="search"
              value={searchQuery}
              placeholder={label("app.searchPlaceholder")}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </>
        ) : null}

        {renderFolderAccessArea()}

        <div ref={fileTreeBodyRef} className="markdown-file-tree-body flex min-h-0 flex-1 flex-col">
          <section
            className={`markdown-file-tree-files flex min-h-0 flex-col ${outlineOpen ? "min-h-24" : "flex-1"}`}
            style={filePanelStyle}
          >
            <div className="flex h-9 shrink-0 items-center gap-1 px-4 text-[13px] text-(--text-secondary)">
              <div
                className="flex min-w-0 flex-1 items-center gap-1"
                onContextMenu={(event) => openContextMenu(event)}
              >
                <Folder aria-hidden="true" size={16} />
                <span className="min-w-0 truncate">{rootName}</span>
              </div>
              {fileCreationAvailable ? (
                <>
                  {folderExpansionAvailable ? (
                    <IconButton
                      className="rounded-md"
                      label={allFoldersExpanded ? label("app.collapseMarkdownFolders") : label("app.expandMarkdownFolders")}
                      pressed={allFoldersExpanded}
                      onClick={toggleAllFolders}
                    >
                      {allFoldersExpanded ? (
                        <ListChevronsDownUp aria-hidden="true" size={14} />
                      ) : (
                        <ListChevronsUpDown aria-hidden="true" size={14} />
                      )}
                    </IconButton>
                  ) : null}
                  <IconButton
                    className="rounded-md"
                    label={label("app.newMarkdownFile")}
                    onClick={() => startCreatingFile()}
                  >
                    <Plus aria-hidden="true" size={14} />
                  </IconButton>
                </>
              ) : folderExpansionAvailable ? (
                <IconButton
                  className="rounded-md"
                  label={allFoldersExpanded ? label("app.collapseMarkdownFolders") : label("app.expandMarkdownFolders")}
                  pressed={allFoldersExpanded}
                  onClick={toggleAllFolders}
                >
                  {allFoldersExpanded ? (
                    <ListChevronsDownUp aria-hidden="true" size={14} />
                  ) : (
                    <ListChevronsUpDown aria-hidden="true" size={14} />
                  )}
                </IconButton>
              ) : null}
            </div>

            <div
              className="file-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4"
              onMouseDown={cancelFileTreeInputsFromBlankArea}
              onContextMenu={(event) => openContextMenu(event)}
            >
              {tree.length > 0 || creatingFile || creatingFolder ? (
                renderNodes(tree)
              ) : (
                <p className="m-0 px-4 py-3 text-[12px] text-(--text-secondary)">
                  {label("app.noMarkdownFiles")}
                </p>
              )}
            </div>
          </section>

          {outlineOpen ? (
            <div
              className="markdown-file-tree-outline-resizer group relative h-2 shrink-0 cursor-row-resize touch-none outline-none"
              role="separator"
              tabIndex={0}
              aria-label={label("app.resizeOutline")}
              aria-orientation="horizontal"
              aria-valuemin={minOutlineHeightPercent}
              aria-valuemax={maxOutlineHeightPercent}
              aria-valuenow={outlineHeightPercent}
              onKeyDown={handleOutlineResizeKeyDown}
              onPointerDown={handleOutlineResizePointerDown}
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--border-default) transition-colors duration-150 ease-out group-hover:bg-(--border-strong) group-focus-visible:bg-(--border-strong)" />
            </div>
          ) : null}

          <section
            className={`markdown-file-tree-outline flex min-h-0 flex-col ${outlineOpen ? "min-h-20" : "h-9 shrink-0 border-t border-(--border-default)"}`}
            style={outlinePanelStyle}
          >
            <div className="flex h-9 shrink-0 items-center gap-1 px-4 pr-2 text-[13px] text-(--text-secondary)">
              <TableOfContents aria-hidden="true" size={16} />
              <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] leading-none font-[560] tracking-normal text-(--text-secondary)">
                {label("app.outline")}
              </h3>
              <IconButton
                className="rounded-md"
                label={outlineOpen ? label("app.hideOutline") : label("app.showOutline")}
                pressed={outlineOpen}
                onClick={() => setOutlineOpen((open) => !open)}
              >
                {outlineOpen ? (
                  <ChevronDown aria-hidden="true" size={14} />
                ) : (
                  <ChevronRight aria-hidden="true" size={14} />
                )}
              </IconButton>
            </div>
            {outlineOpen ? (
              <div className="markdown-file-tree-outline-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4">
                {renderOutline()}
              </div>
            ) : null}
          </section>
        </div>
        {open ? (
          <div className="markdown-file-tree-footer flex h-12 shrink-0 items-center justify-between border-t border-(--border-default) bg-(--bg-secondary) px-2.5">
            <IconButton
              className="rounded-md opacity-70 hover:opacity-100 focus-visible:opacity-100"
              label={label("settings.title")}
              onClick={onOpenSettings}
            >
              <Settings aria-hidden="true" size={15} />
            </IconButton>

            {showWindowsSidebarToggle ? (
              <IconButton
                className="rounded-md bg-(--bg-active) text-(--text-heading) opacity-80 transition-[opacity,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 focus-visible:opacity-100"
                label={label("app.toggleMarkdownFiles")}
                pressed={open}
                onClick={onToggleMarkdownFiles}
              >
                <WindowsSidebarToggleIcon aria-hidden="true" size={15} />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}
