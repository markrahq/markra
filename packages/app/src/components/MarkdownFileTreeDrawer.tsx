import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  type UIEvent as ReactUIEvent
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
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
  FolderOpen,
  ImageIcon,
  ImageOff,
  LayoutTemplate,
  Link2,
  ListChevronsDownUp,
  ListChevronsUpDown,
  Plus,
  Search,
  Settings,
  TableOfContents,
  X
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  clampNumber,
  markdownImageDragPayloadForFile,
  t,
  writeMarkdownImageDragPayload,
  type AppLanguage
} from "@markra/shared";
import { IconButton, Tooltip } from "@markra/ui";
import { markraHighlightRemarkPlugin, type MarkdownOutlineItem } from "@markra/markdown";
import { DocumentLinksPanel } from "./DocumentLinksPanel";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import { normalizeMovedPath, sameNativePath } from "../lib/path-move";
import { readNativeClipboardText, showNativeMarkdownFileTreeContextMenu } from "../lib/tauri";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import type { RecentMarkdownFolder, SidebarLayoutMode } from "../lib/settings/app-settings";
import {
  workspaceBacklinksForPath,
  workspaceUnlinkedMentionsForPath,
  type WorkspaceLinkIndex
} from "../lib/workspace-links";
import {
  markdownTemplateTitleFromFileName,
  mergeMarkdownTemplates,
  renderMarkdownTemplate,
  suggestedMarkdownTemplateFileName,
  type MarkdownTemplate
} from "../lib/templates";
import {
  FileTreeDragOverlay,
  FileTreeDragSource,
  FileTreeDropTarget,
  combineNodeRefs,
  fileTreeCollisionDetection,
  fileTreeDragData,
  fileTreeDropData,
  fileTreeFolderChildrenDropId,
  fileTreeFolderDropId,
  fileTreeRootDropId
} from "./file-tree/FileTreeDnd";
import {
  buildMarkdownFileTree,
  buildVisibleFileTreeRows,
  collectMarkdownFolderPaths,
  collectMarkdownFolderTargetPaths,
  creatingAtFileTreeParentPath,
  defaultFileTreeSort,
  expandedFolderPathsForFileTreeTarget,
  expandedFolderPathsForFileTreePath,
  fallbackFileTreeViewportHeight,
  fileTreeRowHeight,
  fileTreeRowIndentClass,
  fileTreeRowIndentStyle,
  fileTreeVirtualizationThreshold,
  filterMarkdownFileTreeAssets,
  filterMarkdownFileTree,
  folderExpandedForFileTreeRows,
  folderNodeAsFile,
  normalizeCreateParentPath,
  parentPathFromPath,
  virtualFileTreeRowsForOffset,
  type FileNode,
  type FileTreeCreateRowKind,
  type FileTreeRenderItem,
  type FileTreeRowRenderMode,
  type FileTreeSort,
  type FileTreeSortDirection,
  type FileTreeSortKey,
  type FolderNode,
  type TreeNode
} from "./file-tree/file-tree-model";
import {
  buildOutlineRenderItems,
  visibleOutlineRenderItems
} from "./file-tree/outline-model";
import {
  contextMenuItem,
  contextMenuPositionFromEvent,
  contextMenuSeparator,
  showContextMenu
} from "./ContextMenu";

type MarkdownFileTreeDrawerProps = {
  activeOutlineIndex?: number | null;
  autoRevealActiveFile?: boolean;
  currentPath: string | null;
  customTemplates?: readonly MarkdownTemplate[];
  documentLinksOpen?: boolean;
  documentLinksVisible?: boolean;
  fileTreeSort?: FileTreeSort;
  fileTreeAssetsVisible?: boolean;
  files: NativeMarkdownFolderFile[];
  language?: AppLanguage;
  linkIndex?: WorkspaceLinkIndex | null;
  linkIndexLoading?: boolean;
  maxWidth?: number;
  minWidth?: number;
  folderOpen?: boolean;
  open: boolean;
  operationRevealPaths?: readonly string[];
  outlineItems: MarkdownOutlineItem[];
  platform?: DesktopPlatform;
  recentFolders?: readonly RecentMarkdownFolder[];
  recentFoldersOpen?: boolean;
  revealPathRequest?: { id: number; path: string | null } | null;
  resizing?: boolean;
  rootPath?: string | null;
  rootName: string;
  sidebarLayoutMode?: SidebarLayoutMode;
  width?: number;
  onCreateFile?: (fileName: string, parentPath?: string | null, contents?: string) => unknown | Promise<unknown>;
  onCreateFolder?: (folderName: string, parentPath?: string | null) => unknown | Promise<unknown>;
  onDeleteFile?: (
    file: NativeMarkdownFolderFile,
    context?: { files: readonly NativeMarkdownFolderFile[] }
  ) => unknown | Promise<unknown>;
  onFileTreeSortChange?: (sort: FileTreeSort) => unknown;
  onFileTreeAssetsVisibleChange?: (visible: boolean) => unknown;
  onDocumentLinksOpenChange?: (open: boolean) => unknown;
  onInsertImageAsset?: (
    file: NativeMarkdownFolderFile,
    point: { left: number; top: number }
  ) => unknown | Promise<unknown>;
  onOpenFile: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenContainingFolder?: (path: string) => unknown | Promise<unknown>;
  onOpenFileToSide?: (file: NativeMarkdownFolderFile) => unknown | Promise<unknown>;
  onOpenFolder?: () => unknown | Promise<unknown>;
  onOpenRecentFolder?: (folder: RecentMarkdownFolder) => unknown | Promise<unknown>;
  onOpenSettings?: () => unknown | Promise<unknown>;
  onRecentFoldersOpenChange?: (open: boolean) => unknown;
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

type SidebarPanel = "files" | "outline" | "links";
type ImageAssetDragTracker = {
  cleanup: () => undefined;
  file: NativeMarkdownFolderFile;
  nativeDropHandled: boolean;
};
const outlineLevelFilters = ["all", 1, 2, 3] as const;
type OutlineLevelFilter = typeof outlineLevelFilters[number];

const emptyMarkdownTemplates: readonly MarkdownTemplate[] = [];

const defaultOutlineHeightPercent = 40;
const minOutlineHeightPercent = 24;
const maxOutlineHeightPercent = 72;
const outlineResizeKeyboardStepPercent = 5;
const outlineResizeFallbackHeight = 320;
const defaultDocumentLinksHeightPercent = 28;
const minDocumentLinksHeightPercent = 16;
const maxDocumentLinksHeightPercent = 60;
const documentLinksResizeKeyboardStepPercent = 5;
const recentFolderPathDisplayMaxLength = 48;
const fileTreeContextRowSelectionClassName = "select-none [-webkit-user-select:none]";
const fileTreeDropTargetClassName = "bg-(--bg-active) text-(--text-heading)";
const fileTreeDropListTargetClassName = "rounded-sm bg-(--bg-active)";
const sidebarPanelTabBaseClassName = "relative -mb-px h-10 cursor-pointer border-0 border-b border-transparent bg-transparent px-2 text-[13px] leading-none font-[560] transition-colors duration-150 ease-out focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)";
const sidebarPanelTabActiveClassName = "border-(--text-secondary) text-(--text-heading)";
const sidebarPanelTabInactiveClassName = "text-(--text-secondary) hover:text-(--text-heading)";
const outlineTitleMarkdownPlugins = [remarkGfm, remarkMath, markraHighlightRemarkPlugin];
const outlineTitleMarkdownComponents = {
  a: ({ children }) => <>{children}</>,
  code: ({ children, className }) => {
    const isMath = typeof className === "string" && className.split(/\s+/u).includes("math-inline");
    if (isMath) {
      return <span className="markra-outline-title-math font-mono text-[0.92em] text-(--text-heading)">{children}</span>;
    }

    return (
      <code className="rounded-sm bg-(--bg-active) px-0.75 py-px font-mono text-[0.92em] text-(--text-heading)">
        {children}
      </code>
    );
  },
  del: ({ children }) => <del className="line-through decoration-(--text-tertiary) decoration-1">{children}</del>,
  em: ({ children }) => (
    <em className="italic text-(--text-primary)" style={{ fontStyle: "italic", fontSynthesis: "style" }}>
      {children}
    </em>
  ),
  img: ({ alt }) => <>{alt}</>,
  mark: ({ children }) => (
    <mark className="rounded-sm bg-(--accent-soft) px-0.5 text-(--text-heading)">
      {children}
    </mark>
  ),
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-[760] text-(--text-heading)">{children}</strong>
} satisfies Components;

function sidebarPanelTabClassName(selected: boolean) {
  return `${sidebarPanelTabBaseClassName} ${selected ? sidebarPanelTabActiveClassName : sidebarPanelTabInactiveClassName}`;
}

function recentFolderNameKey(folder: RecentMarkdownFolder) {
  return folder.name.trim().toLocaleLowerCase();
}

function duplicateRecentFolderNameKeys(folders: readonly RecentMarkdownFolder[]) {
  const counts = new Map<string, number>();

  folders.forEach((folder) => {
    const key = recentFolderNameKey(folder);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

function compactRecentFolderPath(path: string, maxLength = recentFolderPathDisplayMaxLength) {
  if (path.length <= maxLength) return path;

  const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  const hasLeadingSeparator = path.startsWith("/") || path.startsWith("\\");
  const segments = path.split(/[\\/]/u).filter(Boolean);

  if (segments.length >= 4) {
    const leadingPath = segments.slice(0, 2).join(separator);
    const trailingPath = segments.slice(-2).join(separator);
    const candidate = `${hasLeadingSeparator ? separator : ""}${leadingPath}${separator}...${separator}${trailingPath}`;
    if (candidate.length <= maxLength) return candidate;
  }

  const remainingLength = Math.max(2, maxLength - 3);
  const leadingLength = Math.ceil(remainingLength / 2);
  const trailingLength = Math.floor(remainingLength / 2);

  return `${path.slice(0, leadingLength)}...${path.slice(-trailingLength)}`;
}

function OutlineTitle({ item }: { item: MarkdownOutlineItem }) {
  if (!item.titleMarkdown || item.titleMarkdown === item.title) return item.title;

  return (
    <ReactMarkdown
      allowedElements={["a", "br", "code", "del", "em", "img", "mark", "p", "strong"]}
      components={outlineTitleMarkdownComponents}
      remarkPlugins={outlineTitleMarkdownPlugins}
      unwrapDisallowed
    >
      {item.titleMarkdown}
    </ReactMarkdown>
  );
}

type EditableTextInput = HTMLInputElement | HTMLTextAreaElement;
type TextInputValueSetter = Dispatch<SetStateAction<string>>;

function textInputSelection(input: EditableTextInput) {
  const valueLength = input.value.length;
  const start = input.selectionStart ?? valueLength;
  const end = input.selectionEnd ?? start;
  const normalizedStart = clampNumber(start, 0, valueLength) ?? valueLength;
  const normalizedEnd = clampNumber(end, normalizedStart, valueLength) ?? normalizedStart;

  return {
    end: normalizedEnd,
    start: normalizedStart
  };
}

function selectedTextInputText(input: EditableTextInput) {
  const { end, start } = textInputSelection(input);

  return input.value.slice(start, end);
}

async function writeBrowserClipboardText(input: EditableTextInput, text: string) {
  const clipboard = input.ownerDocument.defaultView?.navigator.clipboard;
  const writeText = clipboard?.writeText;
  if (typeof writeText !== "function") return false;

  try {
    await writeText.call(clipboard, text);
    return true;
  } catch {
    return false;
  }
}

function runTextInputDocumentCommand(input: EditableTextInput, command: string, value?: string) {
  const documentTarget = input.ownerDocument;
  const execCommand = (documentTarget as unknown as Record<string, unknown>)["execCommand"];
  if (typeof execCommand !== "function") return false;

  try {
    input.focus({ preventScroll: true });
    if (value !== undefined) return Boolean(execCommand.call(documentTarget, command, false, value));

    return Boolean(execCommand.call(documentTarget, command));
  } catch {
    return false;
  }
}

function restoreTextInputSelection(input: EditableTextInput, start: number, end = start) {
  const restoreSelection = () => {
    input.focus({ preventScroll: true });
    input.setSelectionRange(start, end);
  };

  input.ownerDocument.defaultView?.setTimeout(restoreSelection, 0);
}

function fileNameSelectionEndBeforeExtension(fileName: string) {
  const extensionSeparatorIndex = fileName.lastIndexOf(".");

  return extensionSeparatorIndex > 0 && extensionSeparatorIndex < fileName.length - 1
    ? extensionSeparatorIndex
    : fileName.length;
}

function closestElementFromNode(node: Node | null) {
  if (node instanceof Element) return node;

  return node?.parentElement ?? null;
}

function isSelfDrawnContextMenuTarget(node: Node | null) {
  return Boolean(
    closestElementFromNode(node)?.closest("[data-markra-context-menu-root], [data-markra-context-menu]")
  );
}

function replaceTextInputSelection(
  input: EditableTextInput,
  setValue: TextInputValueSetter,
  replacement: string
) {
  const { end, start } = textInputSelection(input);
  const nextValue = `${input.value.slice(0, start)}${replacement}${input.value.slice(end)}`;
  const nextSelectionStart = start + replacement.length;

  setValue(nextValue);
  restoreTextInputSelection(input, nextSelectionStart);
}

async function copyTextInputSelection(input: EditableTextInput) {
  const selectedText = selectedTextInputText(input);
  if (!selectedText) return false;

  const wroteClipboardText = await writeBrowserClipboardText(input, selectedText);
  if (wroteClipboardText) return true;

  return runTextInputDocumentCommand(input, "copy");
}

async function cutTextInputSelection(input: EditableTextInput, setValue: TextInputValueSetter) {
  if (input.readOnly || input.disabled) return false;
  const selectedText = selectedTextInputText(input);
  if (!selectedText) return false;
  if (runTextInputDocumentCommand(input, "cut")) return true;

  const copied = await copyTextInputSelection(input);
  if (!copied) return false;

  replaceTextInputSelection(input, setValue, "");
  return true;
}

async function pasteTextInputSelection(input: EditableTextInput, setValue: TextInputValueSetter) {
  if (input.readOnly || input.disabled) return false;

  const clipboardText = await readNativeClipboardText();
  if (!clipboardText) return false;

  if (runTextInputDocumentCommand(input, "insertText", clipboardText)) return true;

  replaceTextInputSelection(input, setValue, clipboardText);
  return true;
}

export function MarkdownFileTreeDrawer({
  activeOutlineIndex = null,
  autoRevealActiveFile = false,
  currentPath,
  customTemplates = emptyMarkdownTemplates,
  documentLinksOpen: controlledDocumentLinksOpen,
  documentLinksVisible = false,
  fileTreeSort: controlledFileTreeSort,
  fileTreeAssetsVisible: controlledFileTreeAssetsVisible,
  files,
  language = "en",
  linkIndex = null,
  linkIndexLoading = false,
  maxWidth = 440,
  minWidth = 220,
  folderOpen = true,
  open,
  operationRevealPaths = [],
  outlineItems,
  platform = resolveDesktopPlatform(),
  recentFolders = [],
  recentFoldersOpen: controlledRecentFoldersOpen,
  revealPathRequest = null,
  resizing = false,
  rootPath = null,
  rootName,
  sidebarLayoutMode = "stacked",
  width = 288,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDocumentLinksOpenChange,
  onFileTreeAssetsVisibleChange,
  onFileTreeSortChange,
  onInsertImageAsset,
  onOpenFile,
  onOpenContainingFolder,
  onOpenFileToSide,
  onOpenFolder,
  onOpenRecentFolder,
  onOpenSettings = () => {},
  onRecentFoldersOpenChange,
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
  const documentLinksResizeCleanupRef = useRef<(() => unknown) | null>(null);
  const activeOutlineButtonRefs = useRef(new Map<number, HTMLButtonElement>());
  const fileTreeBodyRef = useRef<HTMLDivElement | null>(null);
  const fileTreeScrollNodeRef = useRef<HTMLDivElement | null>(null);
  const fileTreeSortMenuRef = useRef<HTMLDivElement | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const outlineLevelMenuRef = useRef<HTMLDivElement | null>(null);
  const imageAssetDragImageRef = useRef<HTMLDivElement | null>(null);
  const imageAssetDragTrackerRef = useRef<ImageAssetDragTracker | null>(null);
  const [fileTreeScrollElement, setFileTreeScrollElement] = useState<HTMLDivElement | null>(null);
  const [fileTreeScrollOffset, setFileTreeScrollOffset] = useState(0);
  const [fileTreeViewportHeight, setFileTreeViewportHeight] = useState(fallbackFileTreeViewportHeight);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [hoveredRecentFolderPath, setHoveredRecentFolderPath] = useState<string | null>(null);
  const [focusedRecentFolderActionPath, setFocusedRecentFolderActionPath] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [localRecentFoldersOpen, setLocalRecentFoldersOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [localDocumentLinksOpen, setLocalDocumentLinksOpen] = useState(true);
  const [outlineHeightPercent, setOutlineHeightPercent] = useState(defaultOutlineHeightPercent);
  const [documentLinksHeightPercent, setDocumentLinksHeightPercent] = useState(defaultDocumentLinksHeightPercent);
  const [creatingFile, setCreatingFile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingParentPath, setCreatingParentPath] = useState<string | null>(null);
  const [selectedCreateParentPath, setSelectedCreateParentPath] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<MarkdownTemplate | null>(null);
  const [creatingTemplateStartedAt, setCreatingTemplateStartedAt] = useState<Date | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [fileTreeSortMenuOpen, setFileTreeSortMenuOpen] = useState(false);
  const [localFileTreeSort, setLocalFileTreeSort] = useState<FileTreeSort>(defaultFileTreeSort);
  const [localFileTreeAssetsVisible, setLocalFileTreeAssetsVisible] = useState(true);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SidebarPanel>("files");
  const [outlineLevelMenuOpen, setOutlineLevelMenuOpen] = useState(false);
  const [outlineLevelFilter, setOutlineLevelFilter] = useState<OutlineLevelFilter>("all");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const renamingPathRef = useRef<string | null>(null);
  const renamingFileRef = useRef<NativeMarkdownFolderFile | null>(null);
  const [dragOverTargetPath, setDragOverTargetPath] = useState<string | null>(null);
  const [activeDragFile, setActiveDragFile] = useState<NativeMarkdownFolderFile | null>(null);
  const [collapsedOutlineKeys, setCollapsedOutlineKeys] = useState<Set<string>>(() => new Set());
  const [pendingRevealPath, setPendingRevealPath] = useState<string | null>(null);
  const [selectedFileTreePaths, setSelectedFileTreePaths] = useState<Set<string>>(() => new Set());
  const [fileTreeSelectionAnchorPath, setFileTreeSelectionAnchorPath] = useState<string | null>(null);
  const lastRevealRequestIdRef = useRef<number | null>(null);
  const lastAutoRevealedPathRef = useRef<string | null>(null);
  const operationOpenedFolderPathsRef = useRef<Set<string>>(new Set());
  renamingPathRef.current = renamingPath;
  const fileTreeDndSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 4
      }
    })
  );
  const clearImageAssetDragTracking = useCallback(() => {
    const tracker = imageAssetDragTrackerRef.current;
    imageAssetDragTrackerRef.current = null;
    tracker?.cleanup();
  }, []);
  const selectAllPrefilledFileTreeInput = useCallback((input: HTMLInputElement | null) => {
    if (!input || !input.value) return;

    input.focus({ preventScroll: true });
    input.select();
  }, []);
  const selectPrefilledFileNameInput = useCallback((input: HTMLInputElement | null) => {
    if (!input || !input.value) return;

    input.focus({ preventScroll: true });
    input.setSelectionRange(0, fileNameSelectionEndBeforeExtension(input.value));
  }, []);
  const fileTreeSort = controlledFileTreeSort ?? localFileTreeSort;
  const fileTreeSortKey = fileTreeSort.key;
  const fileTreeSortDirection = fileTreeSort.direction;
  const fileTreeAssetsVisible = controlledFileTreeAssetsVisible ?? localFileTreeAssetsVisible;
  const updateFileTreeSort = useCallback((sort: FileTreeSort) => {
    if (controlledFileTreeSort === undefined) setLocalFileTreeSort(sort);
    onFileTreeSortChange?.(sort);
  }, [controlledFileTreeSort, onFileTreeSortChange]);
  const updateFileTreeAssetsVisible = useCallback((visible: boolean) => {
    if (controlledFileTreeAssetsVisible === undefined) setLocalFileTreeAssetsVisible(visible);
    onFileTreeAssetsVisibleChange?.(visible);
  }, [controlledFileTreeAssetsVisible, onFileTreeAssetsVisibleChange]);
  const fullTree = useMemo(() => buildMarkdownFileTree(files, rootPath, fileTreeSort), [files, rootPath, fileTreeSort]);
  const assetFilteredTree = useMemo(
    () => fileTreeAssetsVisible ? fullTree : filterMarkdownFileTreeAssets(fullTree),
    [fileTreeAssetsVisible, fullTree]
  );
  const tree = useMemo(() => filterMarkdownFileTree(assetFilteredTree, searchQuery), [assetFilteredTree, searchQuery]);
  const recentFoldersOpen = controlledRecentFoldersOpen ?? localRecentFoldersOpen;
  const setRecentFoldersExpanded = useCallback((openRecentFolders: boolean) => {
    if (controlledRecentFoldersOpen === undefined) {
      setLocalRecentFoldersOpen(openRecentFolders);
    }

    onRecentFoldersOpenChange?.(openRecentFolders);
  }, [controlledRecentFoldersOpen, onRecentFoldersOpenChange]);
  const toggleRecentFoldersExpanded = useCallback(() => {
    setRecentFoldersExpanded(!recentFoldersOpen);
  }, [recentFoldersOpen, setRecentFoldersExpanded]);
  const handleRecentFoldersHeaderKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    toggleRecentFoldersExpanded();
  }, [toggleRecentFoldersExpanded]);
  const visibleFileTreeRows = useMemo(
    () => buildVisibleFileTreeRows(
      tree,
      expandedFolders,
      searchQuery,
      creatingFile,
      creatingFolder,
      creatingParentPath
    ),
    [creatingFile, creatingFolder, creatingParentPath, expandedFolders, searchQuery, tree]
  );
  const virtualFileTreeEnabled = visibleFileTreeRows.length > fileTreeVirtualizationThreshold;
  const getFileTreeRowKey = useCallback(
    (index: number) => visibleFileTreeRows[index]?.key ?? index,
    [visibleFileTreeRows]
  );
  const virtualFileTreeRows = useMemo(
    () => virtualFileTreeRowsForOffset(
      visibleFileTreeRows,
      getFileTreeRowKey,
      fileTreeScrollOffset,
      fileTreeViewportHeight
    ),
    [fileTreeScrollOffset, fileTreeViewportHeight, getFileTreeRowKey, visibleFileTreeRows]
  );
  const virtualFileTreeHeight = visibleFileTreeRows.length * fileTreeRowHeight;
  const visibleFileTreeFilePaths = useMemo(
    () => visibleFileTreeRows.flatMap((row) =>
      row.type === "node" && row.node.type === "file" ? [row.node.file.path] : []
    ),
    [visibleFileTreeRows]
  );
  const allFileTreeFilePaths = useMemo(
    () => files.filter((file) => file.kind !== "folder").map((file) => file.path),
    [files]
  );
  const pathInFileTree = useCallback((path: string | null | undefined, paths: readonly string[]) => (
    paths.some((candidatePath) => sameNativePath(candidatePath, path))
  ), []);
  const fileTreePathSelected = useCallback((path: string) => (
    Array.from(selectedFileTreePaths).some((selectedPath) => sameNativePath(selectedPath, path))
  ), [selectedFileTreePaths]);
  const clearFileTreeSelection = useCallback(() => {
    setSelectedFileTreePaths((current) => current.size === 0 ? current : new Set());
  }, []);
  const clearFileTreeMultiSelection = useCallback(() => {
    clearFileTreeSelection();
    setFileTreeSelectionAnchorPath(null);
  }, [clearFileTreeSelection]);
  const fileTreeSelectionRange = useCallback((anchorPath: string, targetPath: string) => {
    const anchorIndex = visibleFileTreeFilePaths.findIndex((path) => sameNativePath(path, anchorPath));
    const targetIndex = visibleFileTreeFilePaths.findIndex((path) => sameNativePath(path, targetPath));
    if (anchorIndex < 0 || targetIndex < 0) return [targetPath];

    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    return visibleFileTreeFilePaths.slice(startIndex, endIndex + 1);
  }, [visibleFileTreeFilePaths]);
  const setFileTreeScrollRef = useCallback((element: HTMLDivElement | null) => {
    fileTreeScrollNodeRef.current = element;
    if (!element) return undefined;

    setFileTreeScrollElement((current) => current === element ? current : element);
    return undefined;
  }, []);
  const measureFileTreeViewport = useCallback(() => {
    if (!fileTreeScrollElement) return;

    const rectHeight = fileTreeScrollElement.getBoundingClientRect().height;
    const nextHeight = Math.max(
      fileTreeRowHeight,
      fileTreeScrollElement.clientHeight || rectHeight || fallbackFileTreeViewportHeight
    );

    setFileTreeViewportHeight((current) => current === nextHeight ? current : nextHeight);
  }, [fileTreeScrollElement]);
  const handleFileTreeScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const nextOffset = Math.max(0, event.currentTarget.scrollTop);
    setFileTreeScrollOffset((current) => current === nextOffset ? current : nextOffset);
  }, []);
  const folderPaths = useMemo(() => collectMarkdownFolderPaths(assetFilteredTree), [assetFilteredTree]);
  const folderTargetPaths = useMemo(() => collectMarkdownFolderTargetPaths(assetFilteredTree), [assetFilteredTree]);
  const availableMarkdownTemplates = useMemo(() => mergeMarkdownTemplates(customTemplates), [customTemplates]);
  const outlineMaxLevel = outlineLevelFilter === "all" ? null : outlineLevelFilter;
  const outlineRenderItems = useMemo(() => buildOutlineRenderItems(outlineItems, outlineMaxLevel), [outlineItems, outlineMaxLevel]);
  const collapsibleOutlineKeys = useMemo(
    () => outlineRenderItems.filter((item) => item.hasChildren).map((item) => item.key),
    [outlineRenderItems]
  );
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const drawerStateClass = open ? "" : "pointer-events-none";
  const drawerContentStateClass = open ? "opacity-100" : "opacity-0";
  const drawerWidthTransitionClassName = resizing
    ? "transition-none"
    : "transition-[width,min-width,max-width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";
  const resolvedMinWidth = Math.max(160, minWidth);
  const resolvedMaxWidth = Math.max(resolvedMinWidth, maxWidth);
  const resolvedWidth = clampNumber(width, resolvedMinWidth, resolvedMaxWidth);
  const drawerWidth = resolvedWidth === null ? null : open ? resolvedWidth : 0;
  const showWindowsOpenFolderAction = platform === "windows" && onOpenFolder;
  const drawerTopPaddingClassName = platform === "windows" ? "pt-0" : "pt-10";
  const fileCreationAvailable = Boolean(onCreateFile);
  const folderCreationAvailable = folderOpen && Boolean(onCreateFolder);
  const folderActionsAvailable = fileCreationAvailable || folderCreationAvailable;
  const backgroundContextMenuAvailable = folderActionsAvailable || Boolean(onOpenContainingFolder && rootPath);
  const folderExpansionAvailable = folderPaths.length > 0;
  const assetVisibilityToggleAvailable = files.some((file) => file.kind === "asset");
  const allFoldersExpanded = folderExpansionAvailable && folderPaths.every((folderPath) => expandedFolders.has(folderPath));
  const outlineExpansionAvailable = collapsibleOutlineKeys.length > 0;
  const allOutlineItemsCollapsed = outlineExpansionAvailable &&
    collapsibleOutlineKeys.every((outlineKey) => collapsedOutlineKeys.has(outlineKey));
  const operationRevealPathKey = operationRevealPaths
    .map((path) => path.trim())
    .filter(Boolean)
    .join("\n");
  const visibleOutlineItems = useMemo(
    () => visibleOutlineRenderItems(outlineRenderItems, collapsedOutlineKeys),
    [collapsedOutlineKeys, outlineRenderItems]
  );
  const dragMoveAvailable = folderOpen && Boolean(onMoveFile);
  const normalizeTreeCreateParentPath = useCallback((path: string | null | undefined) => {
    const normalizedParentPath = normalizeCreateParentPath(path);
    if (!normalizedParentPath) return null;

    const normalizedRootPath = rootPath ? normalizeMovedPath(rootPath) : null;
    if (normalizedRootPath && normalizeMovedPath(normalizedParentPath) === normalizedRootPath) return null;

    return normalizedParentPath;
  }, [rootPath]);
  const currentDocumentCreateParentPath = useMemo(() => {
    const normalizedRootPath = rootPath ? normalizeMovedPath(rootPath) : null;
    const currentParentPath = currentPath ? parentPathFromPath(currentPath) : null;
    if (!normalizedRootPath || !currentParentPath) return null;

    const normalizedParentPath = normalizeMovedPath(currentParentPath);
    if (normalizedParentPath === normalizedRootPath || normalizedParentPath.startsWith(`${normalizedRootPath}/`)) {
      return normalizeTreeCreateParentPath(currentParentPath);
    }

    return null;
  }, [currentPath, normalizeTreeCreateParentPath, rootPath]);
  const activeCreateParentPath = selectedCreateParentPath ?? currentDocumentCreateParentPath;
  const recentFolderChoices = useMemo(() => recentFolders.slice(0, 5), [recentFolders]);
  const duplicateRecentFolderNames = useMemo(
    () => duplicateRecentFolderNameKeys(recentFolderChoices),
    [recentFolderChoices]
  );
  const documentLinksOpen = controlledDocumentLinksOpen ?? localDocumentLinksOpen;
  const recentFolderAreaVisible = recentFolderChoices.length > 0 && Boolean(onOpenRecentFolder);
  const tabbedSidebarLayout = sidebarLayoutMode === "tabs";
  const activeFileInLinkIndex = Boolean(
    linkIndex && currentPath && linkIndex.files.some((file) => file.file.path === currentPath)
  );
  const linkPanelAvailable = Boolean(documentLinksVisible && currentPath && (
    activeFileInLinkIndex ||
    linkIndexLoading ||
    (!tabbedSidebarLayout && !documentLinksOpen)
  ));
  const activeBacklinks = linkIndex && currentPath ? workspaceBacklinksForPath(linkIndex, currentPath) : [];
  const activeUnlinkedMentions = linkIndex && currentPath ? workspaceUnlinkedMentionsForPath(linkIndex, currentPath) : [];
  const filePanelAvailable = folderOpen || (open && fileCreationAvailable);
  const filePanelVisible = filePanelAvailable && (!tabbedSidebarLayout || activeSidebarPanel === "files");
  const filePanelClassName = tabbedSidebarLayout || !outlineOpen ? "flex-1" : "min-h-24";
  const filePanelStyle = !tabbedSidebarLayout && outlineOpen ? { flex: `0 1 ${100 - outlineHeightPercent}%` } : undefined;
  const outlinePanelVisible = !tabbedSidebarLayout || activeSidebarPanel === "outline";
  const linksPanelVisible = linkPanelAvailable && (!tabbedSidebarLayout || activeSidebarPanel === "links");
  const linksPanelOpen = tabbedSidebarLayout || documentLinksOpen;
  const linksPanelClassName = tabbedSidebarLayout
    ? "markdown-file-tree-links flex min-h-0 flex-1"
    : documentLinksOpen
      ? "markdown-file-tree-links flex min-h-20 flex-1 flex-col border-t border-(--border-default)"
      : "markdown-file-tree-links h-9 shrink-0 border-t border-(--border-default)";
  const linksPanelStyle = !tabbedSidebarLayout && documentLinksOpen
    ? { flex: `0 1 ${documentLinksHeightPercent}%` }
    : undefined;
  const outlinePanelOpen = tabbedSidebarLayout || outlineOpen;
  const outlinePanelStyle =
    !tabbedSidebarLayout && filePanelAvailable && outlineOpen ? { flex: `0 1 ${outlineHeightPercent}%` } : undefined;
  const outlinePanelFlexible = tabbedSidebarLayout || !filePanelAvailable;
  const outlineResizerVisible = !tabbedSidebarLayout && outlineOpen && filePanelAvailable;
  const documentLinksResizerVisible = !tabbedSidebarLayout && linkPanelAvailable && documentLinksOpen;
  const fileSearchVisible = !tabbedSidebarLayout || activeSidebarPanel === "files";
  const folderAccessVisible = !tabbedSidebarLayout || activeSidebarPanel === "files";
  const fileTreeSurfaceClassName = platform === "windows" ? "bg-(--bg-chrome)" : "bg-(--bg-secondary)";
  const outlineToolbarVisible = !tabbedSidebarLayout ||
    (outlinePanelOpen && (outlineItems.length > 0 || outlineExpansionAvailable));
  const setDocumentLinksExpanded = useCallback((openDocumentLinks: boolean) => {
    if (controlledDocumentLinksOpen === undefined) {
      setLocalDocumentLinksOpen(openDocumentLinks);
    }

    onDocumentLinksOpenChange?.(openDocumentLinks);
  }, [controlledDocumentLinksOpen, onDocumentLinksOpenChange]);
  useEffect(() => {
    if (!outlinePanelOpen || !outlinePanelVisible || activeOutlineIndex === null) return;

    const activeOutlineButton = activeOutlineButtonRefs.current.get(activeOutlineIndex);
    if (typeof activeOutlineButton?.scrollIntoView !== "function") return;

    activeOutlineButton.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest"
    });
  }, [activeOutlineIndex, outlinePanelOpen, outlinePanelVisible, visibleOutlineItems]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      outlineResizeCleanupRef.current?.();
      outlineResizeCleanupRef.current = null;
      documentLinksResizeCleanupRef.current?.();
      documentLinksResizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedCreateParentPath) return;

    const normalizedSelectedParentPath = normalizeMovedPath(selectedCreateParentPath);
    const selectedFolderStillExists = folderTargetPaths.some((folderPath) =>
      normalizeMovedPath(folderPath) === normalizedSelectedParentPath
    );
    if (!selectedFolderStillExists) setSelectedCreateParentPath(null);
  }, [folderTargetPaths, selectedCreateParentPath]);

  useEffect(() => {
    if (filePanelVisible) return;

    fileTreeScrollNodeRef.current = null;
    setFileTreeScrollElement(null);
    setFileTreeScrollOffset(0);
  }, [filePanelVisible]);

  useEffect(() => {
    if (activeSidebarPanel !== "links" || linkPanelAvailable) return;

    setActiveSidebarPanel("files");
  }, [activeSidebarPanel, linkPanelAvailable]);

  useEffect(() => {
    if (!fileTreeScrollElement) return;

    measureFileTreeViewport();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureFileTreeViewport);

      return () => {
        window.removeEventListener("resize", measureFileTreeViewport);
      };
    }

    const resizeObserver = new ResizeObserver(measureFileTreeViewport);
    resizeObserver.observe(fileTreeScrollElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fileTreeScrollElement, measureFileTreeViewport]);

  useEffect(() => {
    setSelectedFileTreePaths((current) => {
      const next = new Set(Array.from(current).filter((path) => pathInFileTree(path, allFileTreeFilePaths)));
      return next.size === current.size ? current : next;
    });
    setFileTreeSelectionAnchorPath((current) => (
      pathInFileTree(current, allFileTreeFilePaths) ? current : null
    ));
  }, [allFileTreeFilePaths, pathInFileTree]);

  useEffect(() => {
    if (selectedFileTreePaths.size === 0) return;

    const handlePointerDown = (event: PointerEvent) => {
      const eventTarget = event.target;
      const target = eventTarget instanceof Element
        ? eventTarget
        : eventTarget instanceof Node
          ? eventTarget.parentElement
          : null;
      if (!target) return;
      if (target.closest("[data-file-tree-path]") || isSelfDrawnContextMenuTarget(target)) return;

      clearFileTreeMultiSelection();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearFileTreeMultiSelection, selectedFileTreePaths.size]);

  useEffect(() => {
    if (!fileTreeSortMenuOpen && !createMenuOpen && !outlineLevelMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const openMenuRoots = [
        fileTreeSortMenuOpen ? fileTreeSortMenuRef.current : null,
        createMenuOpen ? createMenuRef.current : null,
        outlineLevelMenuOpen ? outlineLevelMenuRef.current : null
      ];

      if (openMenuRoots.some((root) => root?.contains(target))) return;

      setFileTreeSortMenuOpen(false);
      setCreateMenuOpen(false);
      setOutlineLevelMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [createMenuOpen, fileTreeSortMenuOpen, outlineLevelMenuOpen]);

  useEffect(() => {
    const validKeys = new Set(collapsibleOutlineKeys);

    setCollapsedOutlineKeys((current) => {
      const next = new Set(Array.from(current).filter((outlineKey) => validKeys.has(outlineKey)));
      return next.size === current.size ? current : next;
    });
  }, [collapsibleOutlineKeys]);

  useEffect(() => {
    return () => {
      clearImageAssetDragTracking();
      imageAssetDragImageRef.current?.remove();
      imageAssetDragImageRef.current = null;
    };
  }, [clearImageAssetDragTracking]);

  const toggleFolder = (relativePath: string) => {
    operationOpenedFolderPathsRef.current.delete(relativePath);
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

    operationOpenedFolderPathsRef.current.clear();
    setExpandedFolders((current) => {
      const currentAllFoldersExpanded = folderPaths.every((folderPath) => current.has(folderPath));
      return currentAllFoldersExpanded ? new Set() : new Set(folderPaths);
    });
  };

  const revealFileTreePath = useCallback((path: string | null | undefined) => {
    if (!path?.trim()) return false;

    const revealFolderPaths = expandedFolderPathsForFileTreePath(assetFilteredTree, path);
    if (revealFolderPaths === null) return false;

    setActiveSidebarPanel("files");
    setSearchQuery("");
    setFileTreeSortMenuOpen(false);
    setCreateMenuOpen(false);
    setOutlineLevelMenuOpen(false);
    setExpandedFolders((current) => {
      let changed = false;
      const next = new Set(current);

      for (const folderPath of revealFolderPaths) {
        if (next.has(folderPath)) continue;

        next.add(folderPath);
        changed = true;
      }

      return changed ? next : current;
    });
    setPendingRevealPath(path);
    return true;
  }, [assetFilteredTree]);

  useEffect(() => {
    if (!open || !revealPathRequest || lastRevealRequestIdRef.current === revealPathRequest.id) return;

    if (revealFileTreePath(revealPathRequest.path)) {
      lastRevealRequestIdRef.current = revealPathRequest.id;
    }
  }, [open, revealFileTreePath, revealPathRequest]);

  useEffect(() => {
    if (!autoRevealActiveFile || !open || !currentPath) return;
    if (lastAutoRevealedPathRef.current === currentPath) return;

    if (revealFileTreePath(currentPath)) {
      lastAutoRevealedPathRef.current = currentPath;
    }
  }, [autoRevealActiveFile, currentPath, open, revealFileTreePath]);

  useEffect(() => {
    const requestedPaths = operationRevealPathKey.split("\n").filter(Boolean);

    if (requestedPaths.length === 0) {
      const folderPathsToRestore = operationOpenedFolderPathsRef.current;
      if (folderPathsToRestore.size === 0) return;

      operationOpenedFolderPathsRef.current = new Set();
      setExpandedFolders((current) => {
        let changed = false;
        const next = new Set(current);

        for (const folderPath of folderPathsToRestore) {
          if (!next.has(folderPath)) continue;

          next.delete(folderPath);
          changed = true;
        }

        return changed ? next : current;
      });
      return;
    }

    const revealFolderPaths = Array.from(new Set(requestedPaths.flatMap((path) =>
      expandedFolderPathsForFileTreeTarget(assetFilteredTree, path) ?? []
    )));
    if (revealFolderPaths.length === 0) return;

    setActiveSidebarPanel("files");
    setSearchQuery("");
    setFileTreeSortMenuOpen(false);
    setCreateMenuOpen(false);
    setOutlineLevelMenuOpen(false);
    setExpandedFolders((current) => {
      let changed = false;
      const next = new Set(current);

      for (const folderPath of revealFolderPaths) {
        if (next.has(folderPath)) continue;

        next.add(folderPath);
        operationOpenedFolderPathsRef.current.add(folderPath);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [assetFilteredTree, operationRevealPathKey]);

  useEffect(() => {
    if (!pendingRevealPath || !filePanelVisible) return;

    const rowIndex = visibleFileTreeRows.findIndex((row) =>
      row.type === "node" && row.node.type === "file" && sameNativePath(row.node.file.path, pendingRevealPath)
    );
    if (rowIndex < 0) return;

    const scrollElement = fileTreeScrollNodeRef.current;
    if (scrollElement) {
      const rowTop = rowIndex * fileTreeRowHeight;
      const rowBottom = rowTop + fileTreeRowHeight;
      const viewportHeight = scrollElement.clientHeight || fileTreeViewportHeight;
      const viewportTop = scrollElement.scrollTop;
      const viewportBottom = viewportTop + viewportHeight;

      if (rowTop < viewportTop) {
        scrollElement.scrollTop = rowTop;
      } else if (rowBottom > viewportBottom) {
        scrollElement.scrollTop = Math.max(0, rowBottom - viewportHeight);
      }

      setFileTreeScrollOffset(scrollElement.scrollTop);
    }

    if (!virtualFileTreeEnabled) {
      const activeFileTreeRow =
        fileTreeBodyRef.current?.querySelector<HTMLElement>("[data-reveal-file-tree-row='true']") ??
        fileTreeBodyRef.current?.querySelector<HTMLElement>("[data-active-file-tree-row='true']");

      if (typeof activeFileTreeRow?.scrollIntoView === "function") {
        activeFileTreeRow.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    setPendingRevealPath(null);
  }, [
    filePanelVisible,
    fileTreeViewportHeight,
    pendingRevealPath,
    virtualFileTreeEnabled,
    visibleFileTreeRows
  ]);

  const toggleCollapsedOutlineItem = (outlineKey: string) => {
    setCollapsedOutlineKeys((current) => {
      const next = new Set(current);
      if (next.has(outlineKey)) {
        next.delete(outlineKey);
      } else {
        next.add(outlineKey);
      }
      return next;
    });
  };

  const toggleAllOutlineItems = () => {
    if (!outlineExpansionAvailable) return;

    setCollapsedOutlineKeys((current) => {
      const currentAllCollapsed = collapsibleOutlineKeys.every((outlineKey) => current.has(outlineKey));
      return currentAllCollapsed ? new Set() : new Set(collapsibleOutlineKeys);
    });
  };

  const outlineLevelFilterLabel = (filter: OutlineLevelFilter) => {
    if (filter === "all") return label("app.outlineHeadingLevelsAll");
    if (filter === 1) return "H1";
    return `H1-H${filter}`;
  };

  const outlineLevelFilterCompactLabel = (filter: OutlineLevelFilter) => (
    filter === "all" ? label("app.outlineHeadingLevelsAllShort") : outlineLevelFilterLabel(filter)
  );

  const selectOutlineLevelFilter = (filter: OutlineLevelFilter) => {
    setOutlineLevelFilter(filter);
    setOutlineLevelMenuOpen(false);
  };

  const selectFileTreeSortKey = (key: FileTreeSortKey) => {
    updateFileTreeSort({
      direction: key === "name" ? "ascending" : "descending",
      key
    });
  };

  const selectFileTreeSortDirection = (direction: FileTreeSortDirection) => {
    updateFileTreeSort({
      direction,
      key: fileTreeSortKey
    });
  };

  const toggleFileTreeAssetsVisible = () => {
    updateFileTreeAssetsVisible(!fileTreeAssetsVisible);
  };

  const startCreatingFile = (parentPath: string | null = null, template: MarkdownTemplate | null = null) => {
    if (!fileCreationAvailable) return;

    const startedAt = new Date();
    setCreatingFolder(false);
    setNewFolderName("");
    setRenamingPath(null);
    renamingFileRef.current = null;
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
    renamingFileRef.current = null;
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
    renamingFileRef.current = file;
    setRenamingPath(file.path);
    setRenameFileName(file.name);
  };

  const commitRenameFile = (file: NativeMarkdownFolderFile) => {
    const normalizedName = renameFileName.trim();
    if (!normalizedName || normalizedName === file.name) {
      renamingFileRef.current = null;
      setRenamingPath(null);
      setRenameFileName("");
      return;
    }

    Promise.resolve(onRenameFile?.(file, normalizedName))
      .catch(() => {})
      .then(() => {
        if (renamingPathRef.current !== file.path) return;

        renamingFileRef.current = null;
        setRenamingPath(null);
        setRenameFileName("");
      });
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
    renamingFileRef.current = null;
    setRenamingPath(null);
    setRenameFileName("");
  };

  const finishFileTreeInputsBeforeRowNavigation = () => {
    const renamingFile = renamingFileRef.current;
    if (renamingFile) {
      commitRenameFile(renamingFile);
      return;
    }

    cancelFileTreeInputs();
  };

  const cancelFileTreeInputsFromBlankArea = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input")) return;

    cancelFileTreeInputs();
    clearFileTreeMultiSelection();
  };

  useEffect(() => {
    if (!renamingPath) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const fileTreeRoot = fileTreeBodyRef.current?.closest(".markdown-file-tree");
      if (fileTreeRoot?.contains(target)) return;
      if (isSelfDrawnContextMenuTarget(target)) return;

      const renamingFile = renamingFileRef.current;
      if (!renamingFile) return;

      commitRenameFile(renamingFile);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [renamingPath, commitRenameFile]);

  useEffect(() => {
    if (!creatingFile && !creatingFolder) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const fileTreeRoot = fileTreeBodyRef.current?.closest(".markdown-file-tree");
      if (fileTreeRoot?.contains(target)) return;
      if (isSelfDrawnContextMenuTarget(target)) return;

      cancelFileTreeInputs();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [creatingFile, creatingFolder, cancelFileTreeInputs]);

  const creatingAtParentPath = (parentPath: string | null | undefined, depth = 0) => {
    return creatingAtFileTreeParentPath(parentPath, depth, creatingParentPath);
  };

  const targetFolderPathForFile = (file: NativeMarkdownFolderFile | undefined) => {
    if (!file) return null;
    return file.kind === "folder" ? file.path : parentPathFromPath(file.path);
  };

  const fileTreeContextTargets = (targetFile: NativeMarkdownFolderFile | undefined) => {
    if (!targetFile) return [];
    if (targetFile.kind === "folder" || !fileTreePathSelected(targetFile.path)) return [targetFile];

    const selectedTargets = visibleFileTreeFilePaths
      .filter((path) => fileTreePathSelected(path))
      .map((path) => files.find((candidate) => candidate.kind !== "folder" && sameNativePath(candidate.path, path)) ?? null)
      .filter((candidate): candidate is NativeMarkdownFolderFile => candidate !== null);

    return selectedTargets.length > 0 ? selectedTargets : [targetFile];
  };

  const canOpenFileTreeContextTargetToSide = (targetFile: NativeMarkdownFolderFile) => (
    targetFile.kind !== "asset" && targetFile.kind !== "attachment" && !sameNativePath(targetFile.path, currentPath)
  );

  const openContextMenu = (
    event: ReactMouseEvent,
    file?: NativeMarkdownFolderFile,
    targetFolderPath?: string | null
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!backgroundContextMenuAvailable && !file) return;

    const createTargetFolderPath = normalizeCreateParentPath(targetFolderPath ?? targetFolderPathForFile(file));
    const contextTargets = fileTreeContextTargets(file);
    const multiSelect = contextTargets.length > 1;

    showNativeMarkdownFileTreeContextMenu(
      {
        canOpenFileToSide: (targetFile) =>
          Boolean(onOpenFileToSide && fileTreeContextTargets(targetFile).some(canOpenFileTreeContextTargetToSide)),
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
          const targetFiles = fileTreeContextTargets(targetFile);
          if (targetFiles.length > 1) return onDeleteFile?.(targetFile, { files: targetFiles });

          return onDeleteFile?.(targetFile);
        },
        openContainingFolder: onOpenContainingFolder
          ? (targetFile) => {
            const path = targetFile?.path ?? rootPath;
            if (!path) return;

            return onOpenContainingFolder(path);
          }
          : undefined,
        openFileToSide: onOpenFileToSide
          ? (targetFile) =>
            Promise.all(
              fileTreeContextTargets(targetFile)
                .filter(canOpenFileTreeContextTargetToSide)
                .map((target) => Promise.resolve(onOpenFileToSide(target)))
            )
          : undefined,
        multiSelect,
        renameFile: startRenamingFile,
        saveFileAsTemplate: onSaveFileAsTemplate
      },
      language,
      file
    ).catch(() => {});
  };

  const openTextInputContextMenu = (
    event: ReactMouseEvent<HTMLInputElement>,
    setValue: TextInputValueSetter
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const input = event.currentTarget;
    const selectedText = selectedTextInputText(input);
    const canEditInput = !input.readOnly && !input.disabled;

    showContextMenu(input.ownerDocument, {
      entries: [
        contextMenuItem(
          "markra:file-tree-input:cut",
          label("menu.cut"),
          "CmdOrCtrl+X",
          () => cutTextInputSelection(input, setValue),
          !canEditInput || !selectedText
        ),
        contextMenuItem(
          "markra:file-tree-input:copy",
          label("menu.copy"),
          "CmdOrCtrl+C",
          () => copyTextInputSelection(input),
          !selectedText
        ),
        contextMenuItem(
          "markra:file-tree-input:paste",
          label("menu.paste"),
          "CmdOrCtrl+V",
          () => pasteTextInputSelection(input, setValue),
          !canEditInput
        ),
        contextMenuSeparator(),
        contextMenuItem(
          "markra:file-tree-input:select-all",
          label("menu.selectAll"),
          "CmdOrCtrl+A",
          () => {
            input.focus({ preventScroll: true });
            input.setSelectionRange(0, input.value.length);
          },
          input.value.length === 0
        )
      ],
      position: contextMenuPositionFromEvent(event.nativeEvent)
    });
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

  const resizeDocumentLinks = (nextPercent: number | null) => {
    const clampedPercent = clampNumber(
      nextPercent === null ? null : Math.round(nextPercent),
      minDocumentLinksHeightPercent,
      maxDocumentLinksHeightPercent
    );
    if (clampedPercent === null) return;

    setDocumentLinksHeightPercent(clampedPercent);
  };

  const handleDocumentLinksResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!documentLinksOpen) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const startDocumentLinksHeightPercent = documentLinksHeightPercent;
    const layoutHeight = fileTreeBodyRef.current?.getBoundingClientRect().height ?? 0;
    const resolvedLayoutHeight = layoutHeight > 0 ? layoutHeight : outlineResizeFallbackHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPercent = ((moveEvent.clientY - startY) / resolvedLayoutHeight) * 100;
      resizeDocumentLinks(startDocumentLinksHeightPercent - deltaPercent);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      documentLinksResizeCleanupRef.current = null;
    };

    const handlePointerUp = () => {
      cleanup();
    };

    documentLinksResizeCleanupRef.current?.();
    documentLinksResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleDocumentLinksResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      resizeDocumentLinks(documentLinksHeightPercent + documentLinksResizeKeyboardStepPercent);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      resizeDocumentLinks(documentLinksHeightPercent - documentLinksResizeKeyboardStepPercent);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeDocumentLinks(minDocumentLinksHeightPercent);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeDocumentLinks(maxDocumentLinksHeightPercent);
    }
  };

  const toggleFileSearch = () => {
    if (searchOpen) setSearchQuery("");
    setSearchOpen((open) => !open);
  };

  const rowBranchClassForDepth = (depth: number) => (
    depth === 0
      ? ""
      : "before:absolute before:left-[-1px] before:top-1/2 before:h-px before:w-6 before:bg-(--border-default)"
  );

  const renderCreateRowContent = (createType: FileTreeCreateRowKind, depth: number, mode: FileTreeRowRenderMode) => {
    const rowIndentClass = fileTreeRowIndentClass(mode);
    const rowBranchClass = mode === "nested" ? rowBranchClassForDepth(depth) : "";
    const rowIndentStyle = fileTreeRowIndentStyle(depth, mode);

    if (createType === "file") {
      return (
        <div
          className={`relative grid h-8 ${creatingTemplate ? "grid-cols-[17px_minmax(0,1fr)_auto]" : "grid-cols-[17px_minmax(0,1fr)]"} items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}
          style={rowIndentStyle}
        >
          <FileText aria-hidden="true" className="shrink-0" size={15} />
          <input
            aria-label={label("app.newMarkdownFileName")}
            autoFocus
            className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-5 text-(--text-primary) outline-none"
            ref={selectPrefilledFileNameInput}
            type="text"
            value={newFileName}
            placeholder="Untitled.md"
            onChange={(event) => setNewFileName(event.target.value)}
            onContextMenu={(event) => openTextInputContextMenu(event, setNewFileName)}
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
      );
    }

    return (
      <div
        className={`relative grid h-8 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${rowIndentClass} ${rowBranchClass}`}
        style={rowIndentStyle}
      >
        <Folder aria-hidden="true" className="shrink-0" size={15} />
        <input
          aria-label={label("app.newMarkdownFolderName")}
          autoFocus
          className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-5 text-(--text-primary) outline-none"
          type="text"
          value={newFolderName}
          placeholder={label("app.newMarkdownFolder")}
          onChange={(event) => setNewFolderName(event.target.value)}
          onContextMenu={(event) => openTextInputContextMenu(event, setNewFolderName)}
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
    );
  };

  const renderCreateRows = (parentPath: string | null | undefined, depth: number) => {
    if ((!creatingFile && !creatingFolder) || !creatingAtParentPath(parentPath, depth)) return null;

    return (
      <>
        {creatingFile ? (
          <li key="__creating-file">
            {renderCreateRowContent("file", depth, "nested")}
          </li>
        ) : null}
        {creatingFolder ? (
          <li key="__creating-folder">
            {renderCreateRowContent("folder", depth, "nested")}
          </li>
        ) : null}
      </>
    );
  };

  const folderExpandedForRender = (node: FolderNode, depth: number) => (
    folderExpandedForFileTreeRows(
      node,
      depth,
      expandedFolders,
      searchQuery.trim().length > 0,
      creatingFile,
      creatingFolder,
      creatingParentPath
    )
  );

  const renderRenameRowContent = (
    file: NativeMarkdownFolderFile,
    depth: number,
    mode: FileTreeRowRenderMode
  ) => {
    const folder = file.kind === "folder";
    const FileIcon = folder ? Folder : file.kind === "asset" ? ImageIcon : FileText;
    const rowIndentClass = fileTreeRowIndentClass(mode);
    const rowBranchClass = mode === "nested" ? rowBranchClassForDepth(depth) : "";
    const rowIndentStyle = fileTreeRowIndentStyle(depth, mode);

    return (
      <div
        className={`relative grid h-8 w-full items-center py-0 pr-2 text-[13px] leading-none text-(--text-secondary) ${folder ? "grid-cols-[13px_16px_minmax(0,1fr)] gap-1" : "grid-cols-[17px_minmax(0,1fr)] gap-1.5"} ${rowIndentClass} ${rowBranchClass}`}
        style={rowIndentStyle}
      >
        {folder ? <span aria-hidden="true" /> : null}
        <FileIcon aria-hidden="true" className="shrink-0" size={folder ? 16 : 15} />
        <input
          aria-label={folder ? label("app.renameMarkdownFolder") : label("app.renameMarkdownFile")}
          autoFocus
          className="h-6 min-w-0 rounded-md border border-(--accent) bg-(--bg-primary) px-1.5 text-[13px] leading-5 text-(--text-primary) outline-none"
          ref={folder ? selectAllPrefilledFileTreeInput : selectPrefilledFileNameInput}
          type="text"
          value={renameFileName}
          onChange={(event) => setRenameFileName(event.target.value)}
          onContextMenu={(event) => openTextInputContextMenu(event, setRenameFileName)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRenameFile(file);
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
    );
  };

  const renderFolderRowContent = (
    node: FolderNode,
    depth: number,
    expanded: boolean,
    mode: FileTreeRowRenderMode
  ) => {
    const folderFile = folderNodeAsFile(node);
    const renaming = renamingPath === folderFile.path;
    const dropTarget = dragOverTargetPath === dragTargetKey(node.path);
    const folderRowStateClassName = dropTarget
      ? fileTreeDropTargetClassName
      : "bg-transparent hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)";
    const rowIndentClass = fileTreeRowIndentClass(mode);
    const rowBranchClass = mode === "nested" ? rowBranchClassForDepth(depth) : "";
    const rowIndentStyle = fileTreeRowIndentStyle(depth, mode);

    if (renaming) return renderRenameRowContent(folderFile, depth, mode);

    return (
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
                style={rowIndentStyle}
                type="button"
                aria-expanded={expanded}
                data-ai-workspace-folder-path={folderFile.path}
                data-ai-workspace-folder-relative-path={node.relativePath}
                onContextMenu={(event) => openContextMenu(event, folderFile, node.path)}
                onClick={() => {
                  finishFileTreeInputsBeforeRowNavigation();
                  setSelectedCreateParentPath(normalizeTreeCreateParentPath(node.path));
                  toggleFolder(node.relativePath);
                }}
                {...dragSource.attributes}
                {...dragSource.listeners}
              >
                {expanded ? (
                  <ChevronDown aria-hidden="true" className="shrink-0" size={13} />
                ) : (
                  <ChevronRight aria-hidden="true" className="shrink-0" size={13} />
                )}
                <Folder aria-hidden="true" className="shrink-0" size={16} />
                <span
                  className="min-w-0 truncate leading-5"
                  data-ai-workspace-folder-label-path={folderFile.path}
                  data-ai-workspace-folder-label-relative-path={node.relativePath}
                >
                  {node.name}
                </span>
              </button>
            )}
          </FileTreeDragSource>
        )}
      </FileTreeDropTarget>
    );
  };

  const handleFileRowClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    file: NativeMarkdownFolderFile
  ) => {
    const additiveSelection = event.metaKey || event.ctrlKey;
    const rangeSelection = event.shiftKey;

    finishFileTreeInputsBeforeRowNavigation();
    setSelectedCreateParentPath(null);

    if (!additiveSelection && !rangeSelection) {
      clearFileTreeSelection();
      setFileTreeSelectionAnchorPath(file.path);
      onOpenFile(file);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (rangeSelection) {
      const anchorPath =
        fileTreeSelectionAnchorPath && pathInFileTree(fileTreeSelectionAnchorPath, visibleFileTreeFilePaths)
          ? fileTreeSelectionAnchorPath
          : currentPath && pathInFileTree(currentPath, visibleFileTreeFilePaths)
            ? currentPath
            : file.path;
      const rangePaths = fileTreeSelectionRange(anchorPath, file.path);

      setSelectedFileTreePaths((current) => {
        if (!additiveSelection) return new Set(rangePaths);

        const next = new Set(current);
        rangePaths.forEach((path) => next.add(path));
        return next;
      });
      setFileTreeSelectionAnchorPath(anchorPath);
      return;
    }

    setSelectedFileTreePaths((current) => {
      const next = new Set(current);
      const selectedPath = Array.from(next).find((path) => sameNativePath(path, file.path));

      if (selectedPath) {
        next.delete(selectedPath);
      } else {
        next.add(file.path);
      }

      return next;
    });
    setFileTreeSelectionAnchorPath(file.path);
  };

  const lightweightImageAssetDragImage = () => {
    let dragImage = imageAssetDragImageRef.current;
    if (dragImage) return dragImage;

    dragImage = document.createElement("div");
    dragImage.setAttribute("aria-hidden", "true");
    Object.assign(dragImage.style, {
      height: "1px",
      left: "-1000px",
      opacity: "0",
      pointerEvents: "none",
      position: "fixed",
      top: "-1000px",
      width: "1px"
    });
    document.body.append(dragImage);
    imageAssetDragImageRef.current = dragImage;
    return dragImage;
  };

  const imageAssetDragPointFromEvent = (event: Pick<DragEvent, "clientX" | "clientY">) => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;

    return {
      left: event.clientX,
      top: event.clientY
    };
  };

  const startImageAssetDragTracking = (file: NativeMarkdownFolderFile) => {
    clearImageAssetDragTracking();

    const trackDropHandled = (dragEvent: DragEvent) => {
      if (dragEvent.defaultPrevented && imageAssetDragTrackerRef.current) {
        imageAssetDragTrackerRef.current.nativeDropHandled = true;
      }
    };
    const finishDrag = (dragEvent: DragEvent) => {
      const point = imageAssetDragPointFromEvent(dragEvent);
      const tracker = imageAssetDragTrackerRef.current;
      clearImageAssetDragTracking();
      if (!tracker || tracker.nativeDropHandled || !point) return;

      Promise.resolve(onInsertImageAsset?.(tracker.file, point)).catch(() => {});
    };

    document.addEventListener("drop", trackDropHandled);
    document.addEventListener("dragend", finishDrag, true);
    imageAssetDragTrackerRef.current = {
      cleanup: () => {
        document.removeEventListener("drop", trackDropHandled);
        document.removeEventListener("dragend", finishDrag, true);
        return undefined;
      },
      file,
      nativeDropHandled: false
    };
  };

  const handleFileRowDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    file: NativeMarkdownFolderFile
  ) => {
    if (file.kind !== "asset") return;

    const payload = markdownImageDragPayloadForFile(file);
    writeMarkdownImageDragPayload(event.dataTransfer, payload, { documentPath: currentPath });
    startImageAssetDragTracking(file);
    try {
      event.dataTransfer.setDragImage(lightweightImageAssetDragImage(), 0, 0);
    } catch {
      // Native image asset dragging still works without a custom preview.
    }
  };

  const renderFileRowContent = (node: FileNode, depth: number, mode: FileTreeRowRenderMode) => {
    const active = sameNativePath(node.file.path, currentPath);
    const selected = fileTreePathSelected(node.file.path);
    const renaming = renamingPath === node.file.path;
    const asset = node.file.kind === "asset";
    const FileIcon = asset ? ImageIcon : FileText;
    const rowIndentClass = fileTreeRowIndentClass(mode);
    const rowBranchClass = mode === "nested" ? rowBranchClassForDepth(depth) : "";
    const rowIndentStyle = fileTreeRowIndentStyle(depth, mode);

    if (renaming) return renderRenameRowContent(node.file, depth, mode);

    return (
      <FileTreeDragSource disabled={!dragMoveAvailable || asset} file={node.file}>
        {(dragSource) => (
          <Tooltip content={node.file.path}>
          <button
            ref={dragSource.setNodeRef}
            className={`relative grid h-8 w-full cursor-pointer touch-none grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 border-0 bg-transparent py-0 pr-2 text-left text-[13px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-[current=page]:border-l-[3px] aria-[current=page]:border-(--text-secondary) aria-[current=page]:bg-(--bg-active) aria-[current=page]:text-(--text-heading) aria-selected:bg-(--accent-soft) aria-selected:text-(--text-heading) aria-selected:shadow-[inset_3px_0_0_var(--accent)] ${dragSource.isDragging ? "opacity-70" : ""} ${fileTreeContextRowSelectionClassName} ${rowIndentClass} ${rowBranchClass}`}
            style={rowIndentStyle}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-selected={selected ? "true" : undefined}
            aria-label={node.relativePath}
            data-active-file-tree-row={active ? "true" : undefined}
            data-ai-workspace-file-path={node.file.path}
            data-ai-workspace-file-relative-path={node.relativePath}
            data-file-tree-path={node.file.path}
            data-reveal-file-tree-row={
              pendingRevealPath && sameNativePath(node.file.path, pendingRevealPath) ? "true" : undefined
            }
            onContextMenu={(event) => openContextMenu(event, node.file)}
            onClick={(event) => handleFileRowClick(event, node.file)}
            {...dragSource.attributes}
            {...dragSource.listeners}
            draggable={asset}
            onDragStart={(event) => handleFileRowDragStart(event, node.file)}
          >
            <FileIcon aria-hidden="true" className="shrink-0" size={15} />
            <span
              className="min-w-0 truncate leading-5"
              data-ai-workspace-file-label-path={node.file.path}
              data-ai-workspace-file-label-relative-path={node.relativePath}
            >
              {node.name}
            </span>
          </button>
          </Tooltip>
        )}
      </FileTreeDragSource>
    );
  };

  const renderFileTreeRowContent = (row: FileTreeRenderItem, mode: FileTreeRowRenderMode) => {
    if (row.type === "create") return renderCreateRowContent(row.createType, row.depth, mode);
    if (row.node.type === "folder") {
      return renderFolderRowContent(row.node, row.depth, row.expanded ?? false, mode);
    }

    return renderFileRowContent(row.node, row.depth, mode);
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
        aria-multiselectable={depth === 0 ? "true" : undefined}
      >
        {renderCreateRows(parentPath, depth)}
        {nodes.map((node) => {
          if (node.type === "folder") {
            const expanded = folderExpandedForRender(node, depth);

            return (
              <li key={node.relativePath}>
                {renderFolderRowContent(node, depth, expanded, "nested")}
                {expanded ? renderNodes(node.children, depth + 1, `${node.name} children`, node.path) : null}
              </li>
            );
          }

          return (
            <li key={node.file.path}>
              {renderFileRowContent(node, depth, "nested")}
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

  const renderVirtualFileTreeRows = () => (
    <ol
      className="relative m-0 list-none p-0"
      role="tree"
      aria-label={label("app.markdownFiles")}
      aria-multiselectable="true"
      style={{ height: `${virtualFileTreeHeight}px` }}
    >
      {virtualFileTreeRows.map((virtualRow) => {
        const row = visibleFileTreeRows[virtualRow.index];
        if (!row) return null;

        return (
          <li
            className="absolute left-0 top-0 w-full"
            data-index={virtualRow.index}
            key={virtualRow.key}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            {renderFileTreeRowContent(row, "virtual")}
          </li>
        );
      })}
    </ol>
  );

  const renderOutline = () => (
    outlineItems.length > 0 ? (
      <ol className="markdown-file-tree-outline-list m-0 list-none px-2 py-1" aria-label={label("app.documentOutline")}>
        {visibleOutlineItems.map(({ hasChildren, index, item, key }) => {
          const collapsed = collapsedOutlineKeys.has(key);
          const outlineIndent = (item.level - 1) * 12;
          const active = activeOutlineIndex === index;
          const outlineButtonClassName = active
            ? "h-7 min-w-0 cursor-pointer truncate rounded-sm border-0 bg-(--bg-active) px-1 text-left text-[13px] leading-5 font-[620] text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            : "h-7 min-w-0 cursor-pointer truncate rounded-sm border-0 bg-transparent px-1 text-left text-[13px] leading-5 text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none";

          return (
            <li key={key}>
              <div
                className="grid h-7 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-1 py-0 pr-1 text-[13px] leading-none"
                style={{ paddingLeft: `${outlineIndent}px` }}
              >
                {hasChildren ? (
                  <IconButton
                    className="rounded-sm"
                    label={`${collapsed ? label("app.expandOutlineHeading") : label("app.collapseOutlineHeading")}: ${item.title}`}
                    pressed={collapsed}
                    size="icon-xs"
                    aria-expanded={!collapsed}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleCollapsedOutlineItem(key)}
                  >
                    {collapsed ? (
                      <ChevronRight aria-hidden="true" size={13} />
                    ) : (
                      <ChevronDown aria-hidden="true" size={13} />
                    )}
                  </IconButton>
                ) : (
                  <span className="size-6 shrink-0" aria-hidden="true" />
                )}
                <button
                  className={outlineButtonClassName}
                  type="button"
                  aria-current={active ? "location" : undefined}
                  ref={(element) => {
                    if (element) {
                      activeOutlineButtonRefs.current.set(index, element);
                    } else {
                      activeOutlineButtonRefs.current.delete(index);
                    }
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectOutlineItem(item, index)}
                >
                  <OutlineTitle item={item} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    ) : (
      <p className="m-0 px-4 py-3 text-[12px] text-(--text-secondary)">{label("app.noHeadings")}</p>
    )
  );

  const renderOutlineLevelMenuItem = (filter: OutlineLevelFilter) => {
    const itemLabel = outlineLevelFilterLabel(filter);

    return (
      <button
        key={String(filter)}
        className="flex h-7 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[12px] leading-none text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-checked:text-(--text-heading)"
        role="menuitemradio"
        aria-checked={outlineLevelFilter === filter}
        type="button"
        onClick={() => selectOutlineLevelFilter(filter)}
      >
        <span className="flex w-3 justify-center" aria-hidden="true">
          {outlineLevelFilter === filter ? <Check size={12} /> : null}
        </span>
        <span>{itemLabel}</span>
      </button>
    );
  };

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
      <div className={`shrink-0 border-b border-(--border-default) ${fileTreeSurfaceClassName}`}>
        {recentFolderAreaVisible && onOpenRecentFolder ? (
          <section
            className="markdown-file-tree-recent-folders py-1"
            role="region"
            aria-label={label("app.recentMarkdownFolders")}
          >
            <div
              aria-expanded={recentFoldersOpen}
              aria-label={recentFoldersOpen ? label("app.hideRecentMarkdownFolders") : label("app.showRecentMarkdownFolders")}
              className="flex h-8 cursor-pointer items-center gap-1 px-3 pr-2 text-[12px] text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
              role="button"
              tabIndex={0}
              onClick={toggleRecentFoldersExpanded}
              onKeyDown={handleRecentFoldersHeaderKeyDown}
            >
              <h3 className="m-0 min-w-0 flex-1 truncate text-[12px] leading-5 font-[560] tracking-normal text-(--text-secondary)">
                {label("app.recentMarkdownFolders")}
              </h3>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" aria-hidden="true">
                {recentFoldersOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
            </div>
            {recentFoldersOpen ? (
              <div className="space-y-0.5 px-2 pb-1">
                {recentFolderChoices.map((folder) => {
                  const duplicateName = duplicateRecentFolderNames.has(recentFolderNameKey(folder));
                  const currentRecentFolder = Boolean(rootPath && sameNativePath(folder.path, rootPath));
                  const folderActionLabel = duplicateName ? `${folder.name} ${folder.path}` : folder.name;
                  const folderPathLabel = compactRecentFolderPath(folder.path);
                  const RecentFolderIcon = currentRecentFolder ? FolderOpen : Folder;
                  const recentFolderButtonStateClassName = currentRecentFolder
                    ? "bg-(--bg-active) text-(--text-heading) hover:bg-(--bg-active) focus-visible:bg-(--bg-active)"
                    : "bg-transparent text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)";

                  return (
                    <div
                      className={`markdown-file-tree-recent-folder grid ${duplicateName ? "h-10" : "h-7"} grid-cols-[minmax(0,1fr)_auto] items-center gap-1`}
                      key={folder.path}
                      onMouseEnter={() => setHoveredRecentFolderPath(folder.path)}
                      onMouseLeave={() => {
                        setHoveredRecentFolderPath((path) => (path === folder.path ? null : path));
                        setFocusedRecentFolderActionPath((path) => (path === folder.path ? null : path));
                      }}
                    >
                      <Tooltip content={folder.path}>
                        <button
                          aria-label={folderActionLabel}
                          aria-current={currentRecentFolder ? "page" : undefined}
                          className={`flex ${duplicateName ? "h-10 items-center" : "h-7 items-center"} min-w-0 cursor-pointer gap-2 rounded-sm border-0 px-2 text-left text-[12px] leading-none focus-visible:outline-none ${recentFolderButtonStateClassName}`}
                          type="button"
                          onClick={() => onOpenRecentFolder(folder)}
                        >
                          <RecentFolderIcon aria-hidden="true" className="shrink-0" size={14} />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="min-w-0 truncate leading-4">{folder.name}</span>
                            {duplicateName ? (
                              <span className="min-w-0 truncate text-[10px] leading-4 text-(--text-tertiary)">
                                {folderPathLabel}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </Tooltip>
                      {onRemoveRecentFolder ? (
                        (() => {
                          const actionVisible =
                            hoveredRecentFolderPath === folder.path || focusedRecentFolderActionPath === folder.path;

                          return (
                            <IconButton
                              className="rounded-md transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
                              label={`${label("app.removeRecentMarkdownFolder")}: ${folderActionLabel}`}
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
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    ) : null
  );

  const renderSidebarPanelTabs = () => (
    tabbedSidebarLayout ? (
      <div
        className={`markdown-file-tree-panel-tabs grid h-10 shrink-0 border-b border-(--border-default) px-3 ${linkPanelAvailable ? "grid-cols-3" : "grid-cols-2"}`}
        role="group"
        aria-label={linkPanelAvailable
          ? `${label("app.files")} / ${label("app.outline")} / ${label("app.links")}`
          : `${label("app.files")} / ${label("app.outline")}`}
      >
        <button
          className={sidebarPanelTabClassName(activeSidebarPanel === "files")}
          type="button"
          aria-label={label("app.files")}
          aria-pressed={activeSidebarPanel === "files"}
          onClick={() => {
            setActiveSidebarPanel("files");
            setOutlineLevelMenuOpen(false);
          }}
        >
          {label("app.files")}
        </button>
        <button
          className={sidebarPanelTabClassName(activeSidebarPanel === "outline")}
          type="button"
          aria-label={label("app.outline")}
          aria-pressed={activeSidebarPanel === "outline"}
          onClick={() => {
            setActiveSidebarPanel("outline");
            setCreateMenuOpen(false);
            setFileTreeSortMenuOpen(false);
          }}
        >
          {label("app.outline")}
        </button>
        {linkPanelAvailable ? (
          <button
            className={sidebarPanelTabClassName(activeSidebarPanel === "links")}
            type="button"
            aria-label={label("app.links")}
            aria-pressed={activeSidebarPanel === "links"}
            onClick={() => {
              setActiveSidebarPanel("links");
              setCreateMenuOpen(false);
              setFileTreeSortMenuOpen(false);
              setOutlineLevelMenuOpen(false);
            }}
          >
            {label("app.links")}
          </button>
        ) : null}
      </div>
    ) : null
  );

  const renderFileSearchInput = () => (
    searchOpen && fileSearchVisible ? (
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

      <aside
        className={`markdown-file-tree relative flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-(--border-default) ${fileTreeSurfaceClassName} ${drawerTopPaddingClassName} will-change-[width,min-width,max-width] ${drawerWidthTransitionClassName} ${drawerStateClass}`}
        aria-label={label("app.markdownFileTree")}
        aria-hidden={!open}
        inert={!open}
        style={drawerWidth === null ? undefined : { maxWidth: drawerWidth, minWidth: drawerWidth, width: drawerWidth }}
      >
        <div className={`markdown-file-tree-content flex min-h-0 flex-1 flex-col transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${drawerContentStateClass}`}>
        {renderSidebarPanelTabs()}
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
        {!tabbedSidebarLayout ? (
          <div className="grid h-10 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--border-default) px-3">
            <h2 className="m-0 truncate text-[14px] leading-5 font-[560] tracking-normal text-(--text-heading)">
              {label("app.files")}
            </h2>
            <div className="markdown-file-tree-header-actions flex items-center gap-0.5">
              {showWindowsOpenFolderAction ? (
                <IconButton
                  className="rounded-md"
                  label={label("app.openFolder")}
                  onClick={onOpenFolder}
                >
                  <FolderOpen aria-hidden="true" size={15} />
                </IconButton>
              ) : null}
              {fileSearchVisible ? (
                <IconButton
                  className="rounded-md"
                  label={label("app.searchMarkdownFiles")}
                  pressed={searchOpen}
                  onClick={toggleFileSearch}
                >
                  <Search aria-hidden="true" size={15} />
                </IconButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {!tabbedSidebarLayout ? renderFileSearchInput() : null}

        {folderAccessVisible ? renderFolderAccessArea() : null}

        <div ref={fileTreeBodyRef} className="markdown-file-tree-body flex min-h-0 flex-1 flex-col">
          {filePanelVisible ? (
            <section
              className={`markdown-file-tree-files flex min-h-0 flex-col ${filePanelClassName}`}
              data-ai-workspace-file-tree="true"
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
                        <span className="min-w-0 truncate leading-5">{rootName}</span>
                      </div>
                    )}
                  </FileTreeDropTarget>
                  {tabbedSidebarLayout && showWindowsOpenFolderAction ? (
                    <IconButton
                      className="rounded-md"
                      label={label("app.openFolder")}
                      onClick={onOpenFolder}
                    >
                      <FolderOpen aria-hidden="true" size={14} />
                    </IconButton>
                  ) : null}
                  {tabbedSidebarLayout && fileSearchVisible ? (
                    <IconButton
                      className="rounded-md"
                      label={label("app.searchMarkdownFiles")}
                      pressed={searchOpen}
                      onClick={toggleFileSearch}
                    >
                      <Search aria-hidden="true" size={14} />
                    </IconButton>
                  ) : null}
                  <div className="relative" ref={fileTreeSortMenuRef}>
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
                {assetVisibilityToggleAvailable ? (
                  <IconButton
                    className="rounded-md"
                    label={fileTreeAssetsVisible ? label("app.hideImageAssets") : label("app.showImageAssets")}
                    pressed={!fileTreeAssetsVisible}
                    onClick={toggleFileTreeAssetsVisible}
                  >
                    {fileTreeAssetsVisible ? (
                      <ImageOff aria-hidden="true" size={14} />
                    ) : (
                      <ImageIcon aria-hidden="true" size={14} />
                    )}
                  </IconButton>
                ) : null}
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
                  <div className="relative" ref={createMenuRef}>
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

              {tabbedSidebarLayout ? renderFileSearchInput() : null}

              <FileTreeDropTarget
                disabled={!dragMoveAvailable}
                id={fileTreeRootDropId("scroll")}
                targetParentPath={null}
              >
                {(rootDropTarget) => (
                  <div
                    ref={combineNodeRefs<HTMLDivElement>(rootDropTarget.setNodeRef, setFileTreeScrollRef)}
                    className={`file-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4 ${dragOverTargetPath === dragTargetKey(null) ? fileTreeDropTargetClassName : ""}`}
                    onScroll={handleFileTreeScroll}
                    onMouseDown={cancelFileTreeInputsFromBlankArea}
                    onContextMenu={(event) => openContextMenu(event)}
                  >
                    {tree.length > 0 || creatingFile || creatingFolder ? (
                      virtualFileTreeEnabled ? renderVirtualFileTreeRows() : renderNodes(tree)
                    ) : (
                      <div className="min-h-full" role="tree" aria-label={label("app.markdownFiles")}>
                        <p className="m-0 px-4 py-3 text-[12px] text-(--text-secondary)">
                          {label("app.noMarkdownFiles")}
                        </p>
                      </div>
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

          {outlineResizerVisible ? (
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

          {outlinePanelVisible ? (
            <section
              className={`markdown-file-tree-outline flex min-h-0 flex-col ${outlinePanelOpen ? "min-h-20" : "h-9 shrink-0 border-t border-(--border-default)"} ${outlinePanelFlexible ? "flex-1" : ""}`}
              style={outlinePanelStyle}
            >
              {outlineToolbarVisible ? (
                <div className={`markdown-file-tree-outline-toolbar flex shrink-0 items-center gap-1 text-[13px] text-(--text-secondary) ${tabbedSidebarLayout ? "h-8 justify-start border-b border-(--border-default) px-3" : "h-9 px-4 pr-2"}`}>
                  {!tabbedSidebarLayout ? (
                    <>
                      <TableOfContents aria-hidden="true" size={16} />
                      <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] leading-5 font-[560] tracking-normal text-(--text-secondary)">
                        {label("app.outline")}
                      </h3>
                    </>
                  ) : null}
                  {outlinePanelOpen && outlineItems.length > 0 ? (
                    <div className="relative" ref={outlineLevelMenuRef}>
                      <button
                        className="markdown-file-tree-outline-filter inline-flex h-6 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-sm border border-transparent bg-transparent px-1.5 text-[12px] leading-none font-[560] text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                        type="button"
                        aria-expanded={outlineLevelMenuOpen}
                        aria-haspopup="menu"
                        aria-label={`${label("app.outlineHeadingLevels")}: ${outlineLevelFilterLabel(outlineLevelFilter)}`}
                        onClick={() => setOutlineLevelMenuOpen((open) => !open)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setOutlineLevelMenuOpen(false);
                          }
                        }}
                      >
                        <span>{outlineLevelFilterCompactLabel(outlineLevelFilter)}</span>
                        <ChevronDown aria-hidden="true" size={12} />
                      </button>
                      {outlineLevelMenuOpen ? (
                        <div
                          className={`absolute z-40 min-w-32 rounded-md border border-(--border-default) bg-(--bg-primary) py-1 shadow-[0_12px_30px_color-mix(in_srgb,var(--text-heading)_14%,transparent)] ${tabbedSidebarLayout ? "top-7 left-0" : "top-8 right-0"}`}
                          role="menu"
                          aria-label={label("app.outlineHeadingLevels")}
                        >
                          {outlineLevelFilters.map(renderOutlineLevelMenuItem)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {outlinePanelOpen && outlineExpansionAvailable ? (
                    <IconButton
                      className={tabbedSidebarLayout ? "ml-auto rounded-md" : "rounded-md"}
                      label={allOutlineItemsCollapsed ? label("app.expandOutlineHeadings") : label("app.collapseOutlineHeadings")}
                      pressed={allOutlineItemsCollapsed}
                      onClick={toggleAllOutlineItems}
                    >
                      {allOutlineItemsCollapsed ? (
                        <ListChevronsUpDown aria-hidden="true" size={14} />
                      ) : (
                        <ListChevronsDownUp aria-hidden="true" size={14} />
                      )}
                    </IconButton>
                  ) : null}
                  {!tabbedSidebarLayout ? (
                    <IconButton
                      className="rounded-md"
                      label={outlineOpen ? label("app.hideOutline") : label("app.showOutline")}
                      pressed={outlineOpen}
                      onClick={() => {
                        setOutlineOpen((open) => {
                          const nextOpen = !open;
                          if (!nextOpen) setOutlineLevelMenuOpen(false);
                          return nextOpen;
                        });
                      }}
                    >
                      {outlineOpen ? (
                        <ChevronDown aria-hidden="true" size={14} />
                      ) : (
                        <ChevronRight aria-hidden="true" size={14} />
                      )}
                    </IconButton>
                  ) : null}
                </div>
              ) : null}
            {outlinePanelOpen ? (
              <div className="markdown-file-tree-outline-scroll min-h-0 flex-1 overflow-y-auto overscroll-none pb-4">
                {renderOutline()}
              </div>
            ) : null}
          </section>
          ) : null}

          {documentLinksResizerVisible ? (
            <div
              className="markdown-file-tree-document-links-resizer group relative h-2 shrink-0 cursor-row-resize touch-none outline-none"
              role="separator"
              tabIndex={0}
              aria-label={label("app.resizeDocumentLinks")}
              aria-orientation="horizontal"
              aria-valuemin={minDocumentLinksHeightPercent}
              aria-valuemax={maxDocumentLinksHeightPercent}
              aria-valuenow={documentLinksHeightPercent}
              onKeyDown={handleDocumentLinksResizeKeyDown}
              onPointerDown={handleDocumentLinksResizePointerDown}
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--border-default) transition-colors duration-150 ease-out group-hover:bg-(--border-strong) group-focus-visible:bg-(--border-strong)" />
            </div>
          ) : null}

          {linksPanelVisible ? (
            <div className={linksPanelClassName} style={linksPanelStyle}>
              {!tabbedSidebarLayout ? (
                <button
                  className="flex h-9 w-full shrink-0 cursor-pointer items-center gap-2 border-0 bg-transparent px-4 pr-2 text-left text-[13px] leading-none text-(--text-secondary) transition-colors duration-150 hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
                  type="button"
                  aria-label={label("app.documentLinks")}
                  aria-expanded={documentLinksOpen}
                  onClick={() => setDocumentLinksExpanded(!documentLinksOpen)}
                >
                  <Link2 aria-hidden="true" size={16} />
                  <span className="min-w-0 flex-1 truncate font-[560]">{label("app.documentLinks")}</span>
                  <span className="shrink-0 text-[11px] font-[650] text-(--text-tertiary)">
                    {activeBacklinks.length + activeUnlinkedMentions.length}
                  </span>
                  {documentLinksOpen ? (
                    <ChevronDown aria-hidden="true" size={14} />
                  ) : (
                    <ChevronRight aria-hidden="true" size={14} />
                  )}
                </button>
              ) : null}
              {linksPanelOpen ? (
                <DocumentLinksPanel
                  backlinks={activeBacklinks}
                  language={language}
                  unlinkedMentions={activeUnlinkedMentions}
                  onOpenFile={onOpenFile}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {open ? (
          <div className={`markdown-file-tree-footer flex h-12 shrink-0 items-center justify-between border-t border-(--border-default) ${fileTreeSurfaceClassName} px-2.5`}>
            <IconButton
              className="rounded-md opacity-70 hover:opacity-100 focus-visible:opacity-100"
              label={label("settings.title")}
              onClick={onOpenSettings}
            >
              <Settings aria-hidden="true" size={15} />
            </IconButton>

          </div>
        ) : null}
        </div>
      </aside>
    </>
  );
}
