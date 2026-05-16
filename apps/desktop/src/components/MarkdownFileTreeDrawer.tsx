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
  FolderTree,
  ImageIcon,
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

type MarkdownFileTreeDrawerProps = {
  currentPath: string | null;
  files: NativeMarkdownFolderFile[];
  language?: AppLanguage;
  maxWidth?: number;
  minWidth?: number;
  open: boolean;
  outlineItems: MarkdownOutlineItem[];
  platform?: DesktopPlatform;
  rootName: string;
  width?: number;
  onCreateFile?: (fileName: string) => unknown | Promise<unknown>;
  onCreateFolder?: (folderName: string) => unknown | Promise<unknown>;
  onDeleteFile?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenFile: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
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

function buildMarkdownFileTree(files: NativeMarkdownFolderFile[]) {
  const rootNodes: TreeNode[] = [];
  const folders = new Map<string, FolderNode>();

  const ensureFolder = (relativePath: string, siblings: TreeNode[], folderName: string) => {
    let folder = folders.get(relativePath);

    if (!folder) {
      folder = {
        type: "folder",
        name: folderName,
        relativePath,
        children: []
      };
      folders.set(relativePath, folder);
      siblings.push(folder);
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
      ensureFolder(file.relativePath, siblings, parts.at(-1) ?? file.name);
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

export function MarkdownFileTreeDrawer({
  currentPath,
  files,
  language = "en",
  maxWidth = 440,
  minWidth = 220,
  open,
  outlineItems,
  platform = resolveDesktopPlatform(),
  rootName,
  width = 288,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onOpenFile,
  onOpenSettings = () => {},
  onRenameFile,
  onResize,
  onResizeEnd,
  onResizeStart,
  onSelectOutlineItem,
  onToggleMarkdownFiles
}: MarkdownFileTreeDrawerProps) {
  const resizeCleanupRef = useRef<(() => unknown) | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<"files" | "outline">("files");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const tree = useMemo(() => filterMarkdownFileTree(buildMarkdownFileTree(files), searchQuery), [files, searchQuery]);
  const showingOutline = viewMode === "outline";
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const drawerStateClass = open
    ? "translate-x-0 opacity-100"
    : "pointer-events-none -translate-x-4 opacity-0";
  const resolvedMinWidth = Math.max(160, minWidth);
  const resolvedMaxWidth = Math.max(resolvedMinWidth, maxWidth);
  const resolvedWidth = clampNumber(width, resolvedMinWidth, resolvedMaxWidth);
  const showWindowsSidebarToggle = platform === "windows" && onToggleMarkdownFiles;
  const WindowsSidebarToggleIcon = open ? PanelLeft : PanelRight;
  const windowsSidebarToggleLeft = open && resolvedWidth !== null ? `${resolvedWidth + 12}px` : "48px";
  const drawerTopPaddingClassName = platform === "windows" ? "pt-0" : "pt-10";

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
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

  const startCreatingFile = () => {
    setCreatingFolder(false);
    setNewFolderName("");
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingFile(true);
    setNewFileName("");
  };

  const startCreatingFolder = () => {
    setCreatingFile(false);
    setNewFileName("");
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingFolder(true);
    setNewFolderName("");
  };

  const commitCreateFolder = () => {
    const normalizedName = newFolderName.trim();
    if (!normalizedName) {
      setCreatingFolder(false);
      setNewFolderName("");
      return;
    }

    onCreateFolder?.(normalizedName);
    setCreatingFolder(false);
    setNewFolderName("");
  };

  const commitCreateFile = () => {
    const normalizedName = newFileName.trim();
    if (!normalizedName) {
      setCreatingFile(false);
      setNewFileName("");
      return;
    }

    onCreateFile?.(normalizedName);
    setCreatingFile(false);
    setNewFileName("");
  };

  const startRenamingFile = (file: NativeMarkdownFolderFile) => {
    setCreatingFile(false);
    setNewFileName("");
    setCreatingFolder(false);
    setNewFolderName("");
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
    setRenamingPath(null);
    setRenameFileName("");
  };

  const cancelFileTreeInputsFromBlankArea = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input")) return;

    cancelFileTreeInputs();
  };

  const openContextMenu = (event: ReactMouseEvent, file?: NativeMarkdownFolderFile) => {
    event.preventDefault();
    event.stopPropagation();

    showNativeMarkdownFileTreeContextMenu(
      {
        createFile: startCreatingFile,
        createFolder: startCreatingFolder,
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

  const renderNodes = (nodes: TreeNode[], depth = 0, treeLabel = label("app.markdownFiles")) => (
    <ol
      className={depth === 0 ? "m-0 list-none p-0" : "ml-5 list-none border-l border-(--border-default) p-0"}
      role={depth === 0 ? "tree" : "group"}
      aria-label={treeLabel}
    >
      {nodes.map((node) => {
        const rowIndentClass = "pl-8";
        const rowBranchClass =
          depth === 0
            ? ""
            : "before:absolute before:left-[-1px] before:top-1/2 before:h-px before:w-6 before:bg-(--border-default)";

        if (node.type === "folder") {
          const expanded = searchQuery.trim().length > 0 || expandedFolders.has(node.relativePath);

          return (
            <li key={node.relativePath}>
              <button
                className={`relative flex h-8 w-full cursor-pointer items-center gap-1 border-0 bg-transparent py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none ${rowIndentClass} ${rowBranchClass}`}
                type="button"
                aria-expanded={expanded}
                onContextMenu={(event) => openContextMenu(event)}
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
              {expanded ? renderNodes(node.children, depth + 1, `${node.name} children`) : null}
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

  return (
    <>
      <IconButton
        className="fixed bottom-3 left-3 z-30 opacity-40 hover:opacity-100 focus-visible:opacity-100"
        label={label("settings.title")}
        onClick={onOpenSettings}
      >
        <Settings aria-hidden="true" size={15} />
      </IconButton>

      {showWindowsSidebarToggle ? (
        <IconButton
          className={`fixed bottom-3 z-30 transition-[left,opacity,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 focus-visible:opacity-100 ${
            open ? "bg-(--bg-active) text-(--text-heading) opacity-80" : "opacity-45"
          }`}
          label={label("app.toggleMarkdownFiles")}
          pressed={open}
          style={{ left: windowsSidebarToggleLeft }}
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
            className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none outline-none hover:[&>span]:bg-(--accent) focus-visible:[&>span]:bg-(--accent)"
            role="separator"
            tabIndex={0}
            aria-label={label("app.resizeMarkdownFiles")}
            aria-orientation="vertical"
            aria-valuemin={resolvedMinWidth}
            aria-valuemax={resolvedMaxWidth}
            aria-valuenow={resolvedWidth}
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizePointerDown}
          >
            <span className="pointer-events-none absolute top-2 right-0 bottom-2 w-px rounded-full bg-transparent transition-colors duration-150 ease-out" />
          </div>
        ) : null}
        <div className="grid h-10 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b border-(--border-default)">
          <IconButton
            className="rounded-none"
            label={showingOutline ? label("app.showFiles") : label("app.showOutline")}
            size="icon-lg"
            onClick={() => setViewMode((mode) => (mode === "files" ? "outline" : "files"))}
          >
            {showingOutline ? (
              <FolderTree aria-hidden="true" size={16} />
            ) : (
              <TableOfContents aria-hidden="true" size={16} />
            )}
          </IconButton>
          <h2 className="m-0 truncate text-center text-[14px] font-[560] tracking-normal text-(--text-heading)">
            {showingOutline ? label("app.outline") : label("app.files")}
          </h2>
          <IconButton
            className="rounded-none"
            disabled={showingOutline}
            label={label("app.searchMarkdownFiles")}
            pressed={searchOpen}
            size="icon-lg"
            onClick={() => {
              if (searchOpen) setSearchQuery("");
              setSearchOpen((open) => !open);
            }}
          >
            <Search aria-hidden="true" size={16} />
          </IconButton>
        </div>

        {!showingOutline && searchOpen ? (
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

        {showingOutline ? (
          <div className="file-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4">
            {outlineItems.length > 0 ? (
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
            )}
          </div>
        ) : (
          <>
            <div className="flex h-9 items-center gap-1 px-4 text-[13px] text-(--text-secondary)">
              <div
                className="flex min-w-0 flex-1 items-center gap-1"
                onContextMenu={(event) => openContextMenu(event)}
              >
                <Folder aria-hidden="true" size={16} />
                <span className="min-w-0 truncate">{rootName}</span>
              </div>
              <IconButton
                className="rounded-md"
                label={label("app.newMarkdownFile")}
                onClick={startCreatingFile}
              >
                <Plus aria-hidden="true" size={14} />
              </IconButton>
            </div>

            <div
              className="file-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4"
              onMouseDown={cancelFileTreeInputsFromBlankArea}
              onContextMenu={(event) => openContextMenu(event)}
            >
              {creatingFile ? (
                <div className="grid h-8 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 pl-8 text-[13px] leading-none text-(--text-secondary)">
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
                      }
                    }}
                  />
                </div>
              ) : null}
              {creatingFolder ? (
                <div className="grid h-8 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 pl-8 text-[13px] leading-none text-(--text-secondary)">
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
                      }
                    }}
                  />
                </div>
              ) : null}
              {tree.length > 0 ? (
                renderNodes(tree)
              ) : (
                <p className="m-0 px-4 py-3 text-[12px] text-(--text-secondary)">
                  {label("app.noMarkdownFiles")}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
