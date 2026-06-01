import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type UniqueIdentifier
} from "@dnd-kit/core";
import {
  ArrowDownAZ,
  ArrowUpDown,
  ArrowUpZA,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ImageIcon,
  LayoutTemplate,
  ListChevronsDownUp,
  ListChevronsUpDown,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  TableOfContents,
  X
} from "lucide-react";
import { clampNumber, t, type AppLanguage } from "@markra/shared";
import { IconButton } from "@markra/ui";
import type { MarkdownOutlineItem } from "@markra/markdown";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import { normalizeMovedPath } from "../lib/path-move";
import { showNativeMarkdownFileTreeContextMenu } from "../lib/tauri";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import type { RecentMarkdownFolder } from "../lib/settings/app-settings";
import {
  markdownTemplateTitleFromFileName,
  mergeMarkdownTemplates,
  renderMarkdownTemplate,
  suggestedMarkdownTemplateFileName,
  type MarkdownTemplate
} from "../lib/templates";

type MarkdownFileTreeDrawerProps = {
  currentPath: string | null;
  customTemplates?: readonly MarkdownTemplate[];
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
  onCreateFile?: (fileName: string, parentPath?: string | null, contents?: string) => unknown | Promise<unknown>;
  onCreateFolder?: (folderName: string, parentPath?: string | null) => unknown | Promise<unknown>;
  onDeleteFile?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenFile: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenFileToSide?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenRecentFolder?: (folder: RecentMarkdownFolder) => unknown | Promise<unknown>;
  onOpenSettings?: () => unknown | Promise<unknown>;
  onRemoveRecentFolder?: (folder: RecentMarkdownFolder) => unknown | Promise<unknown>;
  onMoveFile?: (file: NativeMarkdownFolderFile, targetParentPath: string | null) => unknown | Promise<unknown>;
  onRenameFile?: (file: NativeMarkdownFolderFile, fileName: string) => unknown | Promise<unknown>;
  onResize?: (width: number) => unknown;
  onResizeEnd?: () => unknown;
  onResizeStart?: () => unknown;
  onSaveFileAsTemplate?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onSelectOutlineItem: (item: MarkdownOutlineItem, index: number) => unknown;
  onToggleMarkdownFiles?: () => unknown;
};

type FolderNode = {
  type: "folder";
  createdAt?: number;
  name: string;
  path: string | null;
  relativePath: string;
  modifiedAt?: number;
  children: TreeNode[];
};

type FileNode = {
  type: "file";
  file: NativeMarkdownFolderFile;
  name: string;
  relativePath: string;
};

type TreeNode = FolderNode | FileNode;
type FileTreeSortKey = "createdAt" | "modifiedAt" | "name";
type FileTreeSortDirection = "ascending" | "descending";
type FileTreeSort = {
  direction: FileTreeSortDirection;
  key: FileTreeSortKey;
};
type FileTreeDragData = {
  file: NativeMarkdownFolderFile;
};
type FileTreeDropData = {
  targetParentPath: string | null;
};
type FileTreeDragSourceRenderProps = {
  attributes: Partial<Omit<DraggableAttributes, "aria-pressed" | "role">>;
  isDragging: boolean;
  listeners: Record<string, (event: SyntheticEvent<HTMLElement>) => unknown>;
  setNodeRef: (element: HTMLElement | null) => undefined;
};
type FileTreeDragSourceProps = {
  children: (props: FileTreeDragSourceRenderProps) => ReactNode;
  disabled?: boolean;
  file: NativeMarkdownFolderFile;
};
type FileTreeDropTargetProps = {
  children: (props: { setNodeRef: (element: HTMLElement | null) => undefined }) => ReactNode;
  disabled?: boolean;
  id: UniqueIdentifier;
  targetParentPath: string | null;
};

const emptyMarkdownTemplates: readonly MarkdownTemplate[] = [];
const defaultFileTreeSort = {
  direction: "ascending",
  key: "name"
} satisfies FileTreeSort;

function nodeNameSort(left: TreeNode, right: TreeNode) {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function nodeTimestamp(node: TreeNode, key: Exclude<FileTreeSortKey, "name">) {
  const value = node.type === "folder" ? node[key] : node.file[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortTreeNodes(nodes: TreeNode[], sort: FileTreeSort) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    if (sort.key === "name") {
      return sort.direction === "ascending" ? nodeNameSort(a, b) : nodeNameSort(b, a);
    }

    const leftTimestamp = nodeTimestamp(a, sort.key);
    const rightTimestamp = nodeTimestamp(b, sort.key);
    if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
      return sort.direction === "ascending" ? leftTimestamp - rightTimestamp : rightTimestamp - leftTimestamp;
    }
    if (leftTimestamp !== null && rightTimestamp === null) return -1;
    if (leftTimestamp === null && rightTimestamp !== null) return 1;
    return nodeNameSort(a, b);
  });

  nodes.forEach((node) => {
    if (node.type === "folder") sortTreeNodes(node.children, sort);
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

function fileTreeDragId(file: NativeMarkdownFolderFile) {
  return `file-tree-drag:${file.path}`;
}

function fileTreeDropId(name: string) {
  return `file-tree-drop:${name}`;
}

function fileTreeFolderDropId(path: string | null | undefined) {
  return fileTreeDropId(path ?? "__missing__");
}

function fileTreeFolderChildrenDropId(path: string | null | undefined) {
  return fileTreeDropId(`children:${path ?? "__missing__"}`);
}

function fileTreeRootDropId(name: string) {
  return fileTreeDropId(`root:${name}`);
}

function fileTreeDragData(value: unknown): FileTreeDragData | null {
  const data = value as Partial<FileTreeDragData> | null | undefined;
  return data?.file ? { file: data.file } : null;
}

function fileTreeDropData(value: unknown): FileTreeDropData | null {
  const data = value as Partial<FileTreeDropData> | null | undefined;
  if (!data || !("targetParentPath" in data)) return null;
  return { targetParentPath: data.targetParentPath ?? null };
}

const fileTreeCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const folderCollisions = collisions.filter((collision) => {
    const dropData = fileTreeDropData(collision.data?.droppableContainer.data.current);
    return dropData?.targetParentPath !== null;
  });

  if (folderCollisions.length === 0) return collisions;

  return [...folderCollisions].sort((left, right) => {
    const leftRect = left.data?.droppableContainer.rect.current;
    const rightRect = right.data?.droppableContainer.rect.current;
    const leftArea = leftRect ? leftRect.width * leftRect.height : Number.MAX_SAFE_INTEGER;
    const rightArea = rightRect ? rightRect.width * rightRect.height : Number.MAX_SAFE_INTEGER;

    return leftArea - rightArea;
  });
};

function combineNodeRefs<T extends HTMLElement>(
  ...setNodeRefs: ((element: T | null) => unknown)[]
) {
  return (element: T | null) => {
    setNodeRefs.forEach((setNodeRef) => {
      setNodeRef(element);
    });
    return undefined;
  };
}

function fileTreeDraggableAttributes(
  attributes: DraggableAttributes,
  disabled: boolean
): FileTreeDragSourceRenderProps["attributes"] {
  if (disabled) return {};

  return {
    "aria-describedby": attributes["aria-describedby"],
    "aria-disabled": attributes["aria-disabled"],
    "aria-roledescription": attributes["aria-roledescription"],
    tabIndex: attributes.tabIndex
  };
}

function fileTreeDraggableListeners(
  listeners: DraggableSyntheticListeners,
  disabled: boolean
): FileTreeDragSourceRenderProps["listeners"] {
  if (disabled) return {};

  return Object.fromEntries(
    Object.entries(listeners ?? {}).map(([eventName, listener]) => {
      const dragListener = listener as (event: SyntheticEvent<HTMLElement>) => unknown;

      return [
        eventName,
        (event: SyntheticEvent<HTMLElement>) => dragListener(event)
      ];
    })
  );
}

function FileTreeDragSource({
  children,
  disabled = false,
  file
}: FileTreeDragSourceProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef
  } = useDraggable({
    id: fileTreeDragId(file),
    data: { file } satisfies FileTreeDragData,
    disabled
  });

  return children({
    attributes: fileTreeDraggableAttributes(attributes, disabled),
    isDragging,
    listeners: fileTreeDraggableListeners(listeners, disabled),
    setNodeRef: (element) => {
      setNodeRef(element);
      return undefined;
    }
  });
}

function FileTreeDropTarget({
  children,
  disabled = false,
  id,
  targetParentPath
}: FileTreeDropTargetProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: { targetParentPath } satisfies FileTreeDropData,
    disabled
  });

  return children({
    setNodeRef: (element) => {
      setNodeRef(element);
      return undefined;
    }
  });
}

function FileTreeDragOverlay({
  file
}: {
  file: NativeMarkdownFolderFile | null;
}) {
  if (!file) return null;

  const FileIcon = file.kind === "folder" ? Folder : file.kind === "asset" ? ImageIcon : FileText;

  return (
    <div
      className="grid h-8 min-w-44 max-w-72 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-(--border-default) bg-(--bg-primary) px-2 text-[13px] leading-none text-(--text-heading) opacity-80 shadow-[0_12px_28px_color-mix(in_srgb,var(--text-heading)_18%,transparent)]"
      data-testid="file-tree-drag-overlay"
    >
      <FileIcon aria-hidden="true" className="shrink-0" size={15} />
      <span className="min-w-0 truncate">{file.relativePath}</span>
    </div>
  );
}

function buildMarkdownFileTree(
  files: NativeMarkdownFolderFile[],
  rootPath?: string | null,
  sort: FileTreeSort = defaultFileTreeSort
) {
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
        createdAt: undefined,
        name: folderName,
        path: folderPath,
        relativePath,
        modifiedAt: undefined,
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
      const folder = ensureFolder(file.relativePath, siblings, parts.at(-1) ?? file.name, file.path);
      folder.createdAt = file.createdAt;
      folder.modifiedAt = file.modifiedAt;
      return;
    }

    siblings.push({
      type: "file",
      file,
      name: parts.at(-1) ?? file.name,
      relativePath: file.relativePath
    });
  });

  sortTreeNodes(rootNodes, sort);
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
    createdAt: node.createdAt,
    kind: "folder",
    modifiedAt: node.modifiedAt,
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
const fileTreeContextRowSelectionClassName = "select-none [-webkit-user-select:none]";
const fileTreeDropTargetClassName = "bg-(--bg-active) text-(--text-heading)";
const fileTreeDropListTargetClassName = "rounded-sm bg-(--bg-active)";

export function MarkdownFileTreeDrawer({
  currentPath,
  customTemplates = emptyMarkdownTemplates,
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
  onOpenFileToSide,
  onOpenRecentFolder,
  onOpenSettings = () => {},
  onRemoveRecentFolder,
  onMoveFile,
  onRenameFile,
  onResize,
  onResizeEnd,
  onResizeStart,
  onSaveFileAsTemplate,
  onSelectOutlineItem,
  onToggleMarkdownFiles
}: MarkdownFileTreeDrawerProps) {
  const resizeCleanupRef = useRef<(() => unknown) | null>(null);
  const outlineResizeCleanupRef = useRef<(() => unknown) | null>(null);
  const fileTreeBodyRef = useRef<HTMLDivElement | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [hoveredRecentFolderPath, setHoveredRecentFolderPath] = useState<string | null>(null);
  const [focusedRecentFolderActionPath, setFocusedRecentFolderActionPath] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentFoldersOpen, setRecentFoldersOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [outlineHeightPercent, setOutlineHeightPercent] = useState(defaultOutlineHeightPercent);
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingParentPath, setCreatingParentPath] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<MarkdownTemplate | null>(null);
  const [creatingTemplateStartedAt, setCreatingTemplateStartedAt] = useState<Date | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [fileTreeSortMenuOpen, setFileTreeSortMenuOpen] = useState(false);
  const [fileTreeSortKey, setFileTreeSortKey] = useState<FileTreeSortKey>(defaultFileTreeSort.key);
  const [fileTreeSortDirection, setFileTreeSortDirection] = useState<FileTreeSortDirection>(defaultFileTreeSort.direction);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [dragOverTargetPath, setDragOverTargetPath] = useState<string | null>(null);
  const [activeDragFile, setActiveDragFile] = useState<NativeMarkdownFolderFile | null>(null);
  const fileTreeDndSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4
      }
    })
  );
  const fileTreeSort = useMemo(
    () => ({ direction: fileTreeSortDirection, key: fileTreeSortKey }) satisfies FileTreeSort,
    [fileTreeSortDirection, fileTreeSortKey]
  );
  const fullTree = useMemo(() => buildMarkdownFileTree(files, rootPath, fileTreeSort), [files, rootPath, fileTreeSort]);
  const tree = useMemo(() => filterMarkdownFileTree(fullTree, searchQuery), [fullTree, searchQuery]);
  const folderPaths = useMemo(() => collectMarkdownFolderPaths(fullTree), [fullTree]);
  const availableMarkdownTemplates = useMemo(() => mergeMarkdownTemplates(customTemplates), [customTemplates]);
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
  const dragMoveAvailable = folderOpen && Boolean(onMoveFile);
  const normalizeTreeCreateParentPath = useCallback((path: string | null | undefined) => {
    const normalizedParentPath = normalizeCreateParentPath(path);
    if (!normalizedParentPath) return null;

    const normalizedRootPath = rootPath ? normalizeMovedPath(rootPath) : null;
    if (normalizedRootPath && normalizeMovedPath(normalizedParentPath) === normalizedRootPath) return null;

    return normalizedParentPath;
  }, [rootPath]);
  const activeCreateParentPath = useMemo(() => {
    const normalizedRootPath = rootPath ? normalizeMovedPath(rootPath) : null;
    const currentParentPath = currentPath ? parentPathFromPath(currentPath) : null;
    if (!normalizedRootPath || !currentParentPath) return null;

    const normalizedParentPath = normalizeMovedPath(currentParentPath);
    if (normalizedParentPath === normalizedRootPath || normalizedParentPath.startsWith(`${normalizedRootPath}/`)) {
      return normalizeTreeCreateParentPath(currentParentPath);
    }

    return null;
  }, [currentPath, normalizeTreeCreateParentPath, rootPath]);
  const recentFolderChoices = recentFolders.slice(0, 5);
  const recentFolderAreaVisible = recentFolderChoices.length > 0 && Boolean(onOpenRecentFolder);
  const filePanelVisible = folderOpen;
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

  const selectFileTreeSortKey = (key: FileTreeSortKey) => {
    setFileTreeSortKey(key);
    setFileTreeSortDirection(key === "name" ? "ascending" : "descending");
  };

  const selectFileTreeSortDirection = (direction: FileTreeSortDirection) => {
    setFileTreeSortDirection(direction);
  };

  const startCreatingFile = (parentPath: string | null = null, template: MarkdownTemplate | null = null) => {
    if (!fileCreationAvailable) return;

    const startedAt = new Date();
    setCreatingFolder(false);
    setNewFolderName("");
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingParentPath(normalizeTreeCreateParentPath(parentPath));
    setCreatingTemplate(template);
    setCreatingTemplateStartedAt(template ? startedAt : null);
    setCreatingFile(true);
    setNewFileName(template ? suggestedMarkdownTemplateFileName(template, { now: startedAt, title: "" }) : "");
    setCreateMenuOpen(false);
  };

  const startCreatingFolder = (parentPath: string | null = null) => {
    if (!folderCreationAvailable) return;

    setCreatingFile(false);
    setNewFileName("");
    setCreatingTemplate(null);
    setCreatingTemplateStartedAt(null);
    setRenamingPath(null);
    setRenameFileName("");
    setCreatingParentPath(normalizeTreeCreateParentPath(parentPath));
    setCreatingFolder(true);
    setNewFolderName("");
    setCreateMenuOpen(false);
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
      setCreatingTemplate(null);
      setCreatingTemplateStartedAt(null);
      return;
    }

    const contents = creatingTemplate
      ? renderMarkdownTemplate(creatingTemplate, {
        now: creatingTemplateStartedAt ?? new Date(),
        title: markdownTemplateTitleFromFileName(normalizedName)
      })
      : undefined;

    if (creatingParentPath && contents !== undefined) {
      onCreateFile?.(normalizedName, creatingParentPath, contents);
    } else if (creatingParentPath) {
      onCreateFile?.(normalizedName, creatingParentPath);
    } else if (contents !== undefined) {
      onCreateFile?.(normalizedName, undefined, contents);
    } else {
      onCreateFile?.(normalizedName);
    }
    setCreatingFile(false);
    setNewFileName("");
    setCreatingParentPath(null);
    setCreatingTemplate(null);
    setCreatingTemplateStartedAt(null);
  };

  const startRenamingFile = (file: NativeMarkdownFolderFile) => {
    setCreatingFile(false);
    setNewFileName("");
    setCreatingTemplate(null);
    setCreatingTemplateStartedAt(null);
    setCreatingFolder(false);
    setNewFolderName("");
    setCreatingParentPath(null);
    setCreateMenuOpen(false);
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
    setCreatingTemplate(null);
    setCreatingTemplateStartedAt(null);
    setCreatingFolder(false);
    setNewFolderName("");
    setCreatingParentPath(null);
    setCreateMenuOpen(false);
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
        canOpenFileToSide: (targetFile) => targetFile.path !== currentPath,
        createFile: fileCreationAvailable ? () => startCreatingFile(createTargetFolderPath) : undefined,
        createFileFromTemplates: fileCreationAvailable
          ? availableMarkdownTemplates.map((template) => ({
            create: () => startCreatingFile(createTargetFolderPath, template),
            id: template.id,
            name: template.name
          }))
          : undefined,
        createFolder: folderCreationAvailable ? () => startCreatingFolder(createTargetFolderPath) : undefined,
        deleteFile: (targetFile) => {
          onDeleteFile?.(targetFile);
        },
        openFileToSide: onOpenFileToSide,
        renameFile: startRenamingFile,
        saveFileAsTemplate: onSaveFileAsTemplate
      },
      language,
      file
    ).catch(() => {});
  };

  const dragTargetKey = (targetParentPath: string | null) => targetParentPath ?? "__root__";

  const canMoveFileToParent = (file: NativeMarkdownFolderFile, targetParentPath: string | null) => {
    const normalizedTargetParentPath = normalizeCreateParentPath(targetParentPath);
    const targetPath = normalizedTargetParentPath ?? rootPath;
    if (!targetPath) return false;

    const normalizedFilePath = normalizeMovedPath(file.path);
    const normalizedTargetPath = normalizeMovedPath(targetPath);
    const normalizedCurrentParentPath = file.path ? normalizeMovedPath(parentPathFromPath(file.path) ?? "") : "";

    if (normalizedCurrentParentPath === normalizedTargetPath) return false;
    if (file.kind !== "folder") return true;
    if (normalizedTargetPath === normalizedFilePath) return false;
    return !normalizedTargetPath.startsWith(`${normalizedFilePath}/`);
  };

  const clearFileTreeDrag = () => {
    setDragOverTargetPath(null);
    setActiveDragFile(null);
  };

  const handleFileTreeDragStart = (event: DragStartEvent) => {
    const dragData = fileTreeDragData(event.active.data.current);
    if (!dragData) {
      clearFileTreeDrag();
      return;
    }

    setActiveDragFile(dragData.file);
  };

  const handleFileTreeDragOver = (event: DragOverEvent) => {
    const dragData = fileTreeDragData(event.active.data.current);
    const dropData = fileTreeDropData(event.over?.data.current);
    if (!dragData || !dropData || !canMoveFileToParent(dragData.file, dropData.targetParentPath)) {
      setDragOverTargetPath(null);
      return;
    }

    setDragOverTargetPath(dragTargetKey(dropData.targetParentPath));
  };

  const handleFileTreeDragEnd = (event: DragEndEvent) => {
    const dragData = fileTreeDragData(event.active.data.current);
    const dropData = fileTreeDropData(event.over?.data.current);
    clearFileTreeDrag();
    if (!dragData || !dropData || !onMoveFile) return;
    if (!canMoveFileToParent(dragData.file, dropData.targetParentPath)) return;

    Promise.resolve(onMoveFile(dragData.file, normalizeCreateParentPath(dropData.targetParentPath))).catch(() => {});
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
            <div className={`relative grid h-8 ${creatingTemplate ? "grid-cols-[17px_minmax(0,1fr)_auto]" : "grid-cols-[17px_minmax(0,1fr)]"} items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}>
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
                    setCreatingTemplate(null);
                    setCreatingTemplateStartedAt(null);
                  }
                }}
              />
              {creatingTemplate ? (
                <span className="max-w-24 truncate rounded-sm bg-(--bg-active) px-1.5 text-[11px] leading-5 text-(--text-secondary)">
                  {creatingTemplate.name}
                </span>
              ) : null}
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
  ) => {
    const listDropTarget = parentPath !== null && dragOverTargetPath === dragTargetKey(parentPath);
    const nodeList = (setNodeRef?: (element: HTMLOListElement | null) => undefined) => (
      <ol
        ref={setNodeRef}
        className={depth === 0 ? "m-0 list-none p-0" : `ml-5 list-none border-l border-(--border-default) p-0 ${listDropTarget ? fileTreeDropListTargetClassName : ""}`}
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
          const folderFile = folderNodeAsFile(node);
          const dropTarget = dragOverTargetPath === dragTargetKey(node.path);
          const folderRowStateClassName = dropTarget
            ? fileTreeDropTargetClassName
            : "bg-transparent hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)";

          return (
            <li key={node.relativePath}>
              <FileTreeDropTarget
                disabled={!dragMoveAvailable || !node.path}
                id={fileTreeFolderDropId(node.path)}
                targetParentPath={node.path}
              >
                {(dropTargetProps) => (
                  <FileTreeDragSource disabled={!dragMoveAvailable} file={folderFile}>
                    {(dragSource) => (
                      <button
                        ref={combineNodeRefs<HTMLButtonElement>(
                          dropTargetProps.setNodeRef,
                          dragSource.setNodeRef
                        )}
                        className={`relative flex h-8 w-full cursor-pointer touch-none items-center gap-1 border-0 py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) focus-visible:outline-none ${folderRowStateClassName} ${dragSource.isDragging ? "opacity-70" : ""} ${fileTreeContextRowSelectionClassName} ${rowIndentClass} ${rowBranchClass}`}
                        type="button"
                        aria-expanded={expanded}
                        onContextMenu={(event) => openContextMenu(event, folderFile, node.path)}
                        onClick={() => toggleFolder(node.relativePath)}
                        {...dragSource.attributes}
                        {...dragSource.listeners}
                      >
                        {expanded ? (
                          <ChevronDown aria-hidden="true" className="shrink-0" size={13} />
                        ) : (
                          <ChevronRight aria-hidden="true" className="shrink-0" size={13} />
                        )}
                        <Folder aria-hidden="true" className="shrink-0" size={16} />
                        <span className="min-w-0 truncate">{node.name}</span>
                      </button>
                    )}
                  </FileTreeDragSource>
                )}
              </FileTreeDropTarget>
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
              <FileTreeDragSource disabled={!dragMoveAvailable} file={node.file}>
                {(dragSource) => (
                  <button
                    ref={dragSource.setNodeRef}
                    className={`relative grid h-8 w-full cursor-pointer touch-none grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 border-0 bg-transparent py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-[current=page]:border-l-[3px] aria-[current=page]:border-(--text-secondary) aria-[current=page]:bg-(--bg-active) aria-[current=page]:text-(--text-heading) ${dragSource.isDragging ? "opacity-70" : ""} ${fileTreeContextRowSelectionClassName} ${rowIndentClass} ${rowBranchClass}`}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-label={node.relativePath}
                    title={node.file.path}
                    onContextMenu={(event) => openContextMenu(event, node.file)}
                    onClick={() => {
                      onOpenFile(node.file);
                    }}
                    {...dragSource.attributes}
                    {...dragSource.listeners}
                  >
                    <FileIcon aria-hidden="true" className="shrink-0" size={15} />
                    <span className="min-w-0 truncate">{node.name}</span>
                  </button>
                )}
              </FileTreeDragSource>
            )}
          </li>
        );
      })}
      </ol>
    );

    if (depth === 0 || !parentPath) return nodeList();

    return (
      <FileTreeDropTarget
        disabled={!dragMoveAvailable}
        id={fileTreeFolderChildrenDropId(parentPath)}
        targetParentPath={parentPath}
      >
        {(dropTargetProps) => nodeList(dropTargetProps.setNodeRef)}
      </FileTreeDropTarget>
    );
  };

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

  const renderSortMenuItem = (key: FileTreeSortKey, itemLabel: string) => (
    <button
      className="flex h-7 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-checked:text-(--text-heading)"
      role="menuitemradio"
      aria-checked={fileTreeSortKey === key}
      type="button"
      onClick={() => selectFileTreeSortKey(key)}
    >
      <span className="flex w-3 justify-center" aria-hidden="true">
        {fileTreeSortKey === key ? <Check size={12} /> : null}
      </span>
      <span>{itemLabel}</span>
    </button>
  );

  const renderSortDirectionMenuItem = (
    direction: FileTreeSortDirection,
    itemLabel: string,
    icon: ReactNode
  ) => (
    <button
      className="flex h-7 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-checked:text-(--text-heading)"
      role="menuitemradio"
      aria-checked={fileTreeSortDirection === direction}
      type="button"
      onClick={() => selectFileTreeSortDirection(direction)}
    >
      <span className="flex w-3 justify-center" aria-hidden="true">
        {fileTreeSortDirection === direction ? <Check size={12} /> : null}
      </span>
      <span className="flex w-3.5 justify-center" aria-hidden="true">{icon}</span>
      <span>{itemLabel}</span>
    </button>
  );

  const renderCreateMenuItem = (itemLabel: string, icon: ReactNode, onClick: () => unknown) => (
    <button
      className="flex h-7 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <span className="flex w-3.5 justify-center" aria-hidden="true">{icon}</span>
      <span>{itemLabel}</span>
    </button>
  );

  const renderFolderAccessArea = () => (
    recentFolderAreaVisible ? (
      <div className="shrink-0 border-b border-(--border-default) bg-(--bg-secondary)">
        {recentFolderAreaVisible && onOpenRecentFolder ? (
          <section
            className="markdown-file-tree-recent-folders py-1"
            role="region"
            aria-label={label("app.recentMarkdownFolders")}
          >
            <div className="flex h-8 items-center gap-1 px-3 pr-2 text-[12px] text-(--text-secondary)">
              <h3 className="m-0 min-w-0 flex-1 truncate text-[12px] leading-none font-[560] tracking-normal text-(--text-secondary)">
                {label("app.recentMarkdownFolders")}
              </h3>
              <IconButton
                className="rounded-md"
                label={recentFoldersOpen ? label("app.hideRecentMarkdownFolders") : label("app.showRecentMarkdownFolders")}
                pressed={recentFoldersOpen}
                onClick={() => setRecentFoldersOpen((open) => !open)}
              >
                {recentFoldersOpen ? (
                  <ChevronDown aria-hidden="true" size={14} />
                ) : (
                  <ChevronRight aria-hidden="true" size={14} />
                )}
              </IconButton>
            </div>
            {recentFoldersOpen ? (
              <div className="space-y-0.5 px-2 pb-1">
                {recentFolderChoices.map((folder) => (
                  <div
                    className="markdown-file-tree-recent-folder grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-1"
                    key={folder.path}
                    onMouseEnter={() => setHoveredRecentFolderPath(folder.path)}
                    onMouseLeave={() => {
                      setHoveredRecentFolderPath((path) => (path === folder.path ? null : path));
                      setFocusedRecentFolderActionPath((path) => (path === folder.path ? null : path));
                    }}
                  >
                    <button
                      className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
                      type="button"
                      title={folder.path}
                      onClick={() => onOpenRecentFolder(folder)}
                    >
                      <Folder aria-hidden="true" className="shrink-0" size={14} />
                      <span className="min-w-0 truncate">{folder.name}</span>
                    </button>
                    {onRemoveRecentFolder ? (
                      (() => {
                        const actionVisible =
                          hoveredRecentFolderPath === folder.path || focusedRecentFolderActionPath === folder.path;

                        return (
                          <IconButton
                            className="rounded-md transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
                            label={`${label("app.removeRecentMarkdownFolder")}: ${folder.name}`}
                            style={{
                              opacity: actionVisible ? 1 : 0,
                              pointerEvents: actionVisible ? "auto" : "none"
                            }}
                            onBlur={() => setFocusedRecentFolderActionPath((path) => (path === folder.path ? null : path))}
                            onFocus={() => setFocusedRecentFolderActionPath(folder.path)}
                            onClick={() => onRemoveRecentFolder(folder)}
                          >
                            <X aria-hidden="true" size={13} />
                          </IconButton>
                        );
                      })()
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
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
          {filePanelVisible ? (
            <section
              className={`markdown-file-tree-files flex min-h-0 flex-col ${outlineOpen ? "min-h-24" : "flex-1"}`}
              style={filePanelStyle}
            >
              <DndContext
                collisionDetection={fileTreeCollisionDetection}
                sensors={fileTreeDndSensors}
                onDragCancel={clearFileTreeDrag}
                onDragEnd={handleFileTreeDragEnd}
                onDragOver={handleFileTreeDragOver}
                onDragStart={handleFileTreeDragStart}
              >
              <div className="flex h-9 shrink-0 items-center gap-1 px-4 text-[13px] text-(--text-secondary)">
                <FileTreeDropTarget
                  disabled={!dragMoveAvailable}
                  id={fileTreeRootDropId("header")}
                  targetParentPath={null}
                >
                  {(rootDropTarget) => (
                    <div
                      ref={rootDropTarget.setNodeRef}
                      className={`flex min-w-0 flex-1 items-center gap-1 rounded-sm ${dragOverTargetPath === dragTargetKey(null) ? fileTreeDropTargetClassName : ""} ${fileTreeContextRowSelectionClassName}`}
                      onContextMenu={(event) => openContextMenu(event)}
                    >
                      <Folder aria-hidden="true" size={16} />
                      <span className="min-w-0 truncate">{rootName}</span>
                    </div>
                  )}
                </FileTreeDropTarget>
                <div className="relative">
                  <IconButton
                    className="rounded-md"
                    label={label("app.sortMarkdownFiles")}
                    pressed={fileTreeSortMenuOpen}
                    onClick={() => {
                      setFileTreeSortMenuOpen((open) => {
                        const nextOpen = !open;
                        if (nextOpen) setCreateMenuOpen(false);
                        return nextOpen;
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setFileTreeSortMenuOpen(false);
                      }
                    }}
                  >
                    <ArrowUpDown aria-hidden="true" size={14} />
                  </IconButton>
                  {fileTreeSortMenuOpen ? (
                    <div
                      className="absolute top-8 right-0 z-40 min-w-40 rounded-md border border-(--border-default) bg-(--bg-primary) py-1 shadow-[0_12px_30px_color-mix(in_srgb,var(--text-heading)_14%,transparent)]"
                      role="menu"
                      aria-label={label("app.sortMarkdownFiles")}
                    >
                      {renderSortMenuItem("name", label("app.sortMarkdownFilesByName"))}
                      {renderSortMenuItem("modifiedAt", label("app.sortMarkdownFilesByModifiedTime"))}
                      {renderSortMenuItem("createdAt", label("app.sortMarkdownFilesByCreatedTime"))}
                      <div className="my-1 h-px bg-(--border-default)" role="separator" />
                      {renderSortDirectionMenuItem(
                        "ascending",
                        label("app.sortMarkdownFilesAscending"),
                        <ArrowDownAZ size={13} />
                      )}
                      {renderSortDirectionMenuItem(
                        "descending",
                        label("app.sortMarkdownFilesDescending"),
                        <ArrowUpZA size={13} />
                      )}
                    </div>
                  ) : null}
                </div>
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
                {folderActionsAvailable ? (
                  <div className="relative">
                    <IconButton
                      className="rounded-md"
                      label={label("app.newMarkdownItem")}
                      pressed={createMenuOpen}
                      onClick={() => {
                        setCreateMenuOpen((open) => {
                          const nextOpen = !open;
                          if (nextOpen) setFileTreeSortMenuOpen(false);
                          return nextOpen;
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setCreateMenuOpen(false);
                        }
                      }}
                    >
                      <Plus aria-hidden="true" size={14} />
                    </IconButton>
                    {createMenuOpen ? (
                      <div
                        className="absolute top-8 right-0 z-40 min-w-44 rounded-md border border-(--border-default) bg-(--bg-primary) py-1 shadow-[0_12px_30px_color-mix(in_srgb,var(--text-heading)_14%,transparent)]"
                        role="menu"
                        aria-label={label("app.newMarkdownItem")}
                      >
                        {fileCreationAvailable ? renderCreateMenuItem(
                          label("app.newMarkdownFile"),
                          <FileText size={13} />,
                          () => startCreatingFile(activeCreateParentPath)
                        ) : null}
                        {folderCreationAvailable ? renderCreateMenuItem(
                          label("app.newMarkdownFolder"),
                          <Folder size={13} />,
                          () => startCreatingFolder(activeCreateParentPath)
                        ) : null}
                        {fileCreationAvailable ? (
                          <>
                            <div className="my-1 h-px bg-(--border-default)" role="separator" />
                            <div className="px-2.5 pb-1 pt-0.5 text-[11px] leading-none font-[560] text-(--text-secondary)">
                              {label("app.newMarkdownFileFromTemplate")}
                            </div>
                            {availableMarkdownTemplates.map((template, index) => (
                              <button
                                key={`${template.id}-${index}`}
                                className="flex h-7 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
                                role="menuitem"
                                type="button"
                                onClick={() => startCreatingFile(activeCreateParentPath, template)}
                              >
                                <span className="flex w-3.5 justify-center" aria-hidden="true">
                                  <LayoutTemplate size={13} />
                                </span>
                                <span>{template.name}</span>
                              </button>
                            ))}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <FileTreeDropTarget
                disabled={!dragMoveAvailable}
                id={fileTreeRootDropId("scroll")}
                targetParentPath={null}
              >
                {(rootDropTarget) => (
                  <div
                    ref={rootDropTarget.setNodeRef}
                    className={`file-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4 ${dragOverTargetPath === dragTargetKey(null) ? fileTreeDropTargetClassName : ""}`}
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
                )}
              </FileTreeDropTarget>
              <DragOverlay dropAnimation={null}>
                <FileTreeDragOverlay file={activeDragFile} />
              </DragOverlay>
              </DndContext>
            </section>
          ) : null}

          {outlineOpen && filePanelVisible ? (
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
            className={`markdown-file-tree-outline flex min-h-0 flex-col ${outlineOpen ? "min-h-20" : "h-9 shrink-0 border-t border-(--border-default)"} ${filePanelVisible ? "" : "flex-1"}`}
            style={filePanelVisible ? outlinePanelStyle : undefined}
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
