import {
  Bot,
  Code2,
  Eye,
  FileText,
  FolderOpen,
  History,
  ImageIcon,
  Moon,
  PanelLeft,
  PanelRight,
  Save,
  SquarePen,
  Sun
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";
import {
  closestCenter,
  DndContext,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Button, IconButton, PopoverSurface } from "@markra/ui";
import {
  normalizeTitlebarActions,
  reorderTitlebarActions,
  type ResolvedAppTheme,
  type TitlebarActionId,
  type TitlebarActionPreference
} from "../lib/settings/app-settings";
import type { NativeMenuHandlers } from "../lib/tauri/menu";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import { t, type AppLanguage } from "@markra/shared";
import { MacWindowControls } from "./MacWindowControls";
import {
  SortableTitlebarAction,
  type SortableTitlebarActionRenderProps
} from "./SortableTitlebarAction";
import { WindowsWindowControls } from "./WindowsWindowControls";
import {
  contextMenuItem,
  contextMenuSeparator,
  contextMenuSubmenu,
  showContextMenu,
  type ContextMenuEntry
} from "./ContextMenu";

type NativeTitleBarProps = {
  aiAgentOpen: boolean;
  aiAgentResizing?: boolean;
  aiAgentWidth?: number;
  dirty: boolean;
  documentKind?: "file" | "folder" | "image";
  documentName: string;
  language?: AppLanguage;
  markdownFilesOpen: boolean;
  markdownFilesResizing?: boolean;
  markdownFilesWidth?: number;
  menuHandlers?: NativeMenuHandlers;
  nativeWindowChrome?: boolean;
  platform?: DesktopPlatform;
  quickCreateMarkdownFileVisible?: boolean;
  historyDisabled?: boolean;
  saveDisabled?: boolean;
  splitMode?: boolean;
  sourceMode?: boolean;
  sourceModeDisabled?: boolean;
  theme: ResolvedAppTheme;
  titlebarActions?: readonly TitlebarActionPreference[];
  titleContent?: ReactNode;
  onCreateMarkdownFile?: () => unknown;
  onExitApp?: () => unknown;
  onOpenMarkdown: () => unknown;
  onOpenMarkdownFolder?: () => unknown;
  onOpenSettings?: () => unknown;
  onSaveMarkdown: () => unknown;
  onShowDocumentHistory?: () => unknown;
  onShowAbout?: () => unknown;
  onTitlebarActionsChange?: (actions: TitlebarActionPreference[]) => unknown;
  onToggleAiAgent: () => unknown;
  onToggleMarkdownFiles: () => unknown;
  onToggleSplitMode?: () => unknown;
  onToggleSourceMode?: () => unknown;
  onToggleTheme: () => unknown;
  onToggleWindowMaximized?: () => unknown;
  workspaceName?: string;
};

type WindowsAppMenuId = "app" | "file" | "edit" | "format" | "view";

type WindowsAppMenuConfig = {
  id: WindowsAppMenuId;
  label: string;
};

const dimTitlebarIconButtonClassName =
  "opacity-55 hover:opacity-100 focus-visible:opacity-100";
const titlebarActionDragThresholdPx = 4;

function mergeClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function isWindowsTitlebarInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest("a, button, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [data-titlebar-action]"));
}

export function NativeTitleBar({
  aiAgentOpen,
  aiAgentResizing = false,
  aiAgentWidth = 384,
  dirty,
  documentKind = "file",
  documentName,
  language = "en",
  markdownFilesOpen,
  markdownFilesResizing = false,
  markdownFilesWidth = 288,
  menuHandlers,
  nativeWindowChrome = true,
  platform = resolveDesktopPlatform(),
  quickCreateMarkdownFileVisible = false,
  historyDisabled = false,
  saveDisabled = false,
  splitMode = false,
  sourceMode = false,
  sourceModeDisabled = false,
  theme,
  titlebarActions,
  titleContent,
  onCreateMarkdownFile,
  onExitApp,
  onOpenMarkdown,
  onOpenMarkdownFolder,
  onOpenSettings,
  onSaveMarkdown,
  onShowDocumentHistory,
  onShowAbout,
  onTitlebarActionsChange,
  onToggleAiAgent,
  onToggleMarkdownFiles,
  onToggleSplitMode,
  onToggleSourceMode,
  onToggleTheme,
  onToggleWindowMaximized,
  workspaceName
}: NativeTitleBarProps) {
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const draggingActionIdRef = useRef<TitlebarActionId | null>(null);
  const suppressActionClickIdsRef = useRef(new Set<TitlebarActionId>());
  const [openMenuVisible, setOpenMenuVisible] = useState(false);
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const themeActionLabel = theme === "dark" ? label("app.switchToLightTheme") : label("app.switchToDarkTheme");
  const openChoiceMenuAvailable = Boolean(onOpenMarkdownFolder) && (!nativeWindowChrome || platform !== "macos");
  const openChoiceMenuAlignmentClassName = platform === "windows" ? "right-0" : "left-0";
  const titlebarSideSlotWidth = 164;
  const normalizedTitlebarActions = useMemo(() => normalizeTitlebarActions(titlebarActions), [titlebarActions]);
  const visibleTitlebarActionIds = useMemo(
    () => normalizedTitlebarActions.filter((action) => action.visible).map((action) => action.id),
    [normalizedTitlebarActions]
  );
  const sensors = useSensors(useSensor(MouseSensor, {
    activationConstraint: {
      distance: titlebarActionDragThresholdPx
    }
  }));

  useEffect(() => {
    if (!openMenuVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!openMenuRef.current?.contains(event.target as Node)) setOpenMenuVisible(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuVisible(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuVisible]);

  const runOpenAction = (action: () => unknown) => {
    setOpenMenuVisible(false);
    action();
  };

  const titlebarActionIdFromDndId = (id: UniqueIdentifier) => {
    const actionId = id as TitlebarActionId;

    return normalizedTitlebarActions.some((action) => action.id === actionId) ? actionId : null;
  };
  const suppressActionClick = (id: TitlebarActionId) => {
    suppressActionClickIdsRef.current.add(id);
    window.setTimeout(() => {
      suppressActionClickIdsRef.current.delete(id);
    }, 0);
  };
  const handleTitlebarActionDragStart = ({ active }: DragStartEvent) => {
    draggingActionIdRef.current = titlebarActionIdFromDndId(active.id);
  };
  const handleTitlebarActionDragEnd = ({ active, over }: DragEndEvent) => {
    const draggedId = titlebarActionIdFromDndId(active.id);
    const targetId = over ? titlebarActionIdFromDndId(over.id) : null;
    draggingActionIdRef.current = null;
    if (draggedId) suppressActionClick(draggedId);
    if (targetId) suppressActionClick(targetId);
    if (!draggedId || !targetId || !onTitlebarActionsChange) return;

    const nextActions = reorderTitlebarActions(normalizedTitlebarActions, draggedId, targetId);
    const nextOrder = nextActions.map((action) => action.id).join(":");
    const currentOrder = normalizedTitlebarActions.map((action) => action.id).join(":");
    if (nextOrder === currentOrder) return;

    onTitlebarActionsChange(nextActions);
  };
  const handleTitlebarActionDragCancel = () => {
    const draggedId = draggingActionIdRef.current;
    draggingActionIdRef.current = null;
    if (draggedId) suppressActionClick(draggedId);
  };

  const handleTitlebarActionClick = (
    id: TitlebarActionId,
    event: ReactMouseEvent<HTMLElement>,
    action: () => unknown
  ) => {
    if (suppressActionClickIdsRef.current.has(id)) {
      suppressActionClickIdsRef.current.delete(id);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    action();
  };

  const handleOpenActionClick = (event: ReactMouseEvent<HTMLElement>, action: () => unknown) => {
    event.preventDefault();
    event.stopPropagation();
    runOpenAction(action);
  };
  const runBrowserEditCommand = (command: string) => {
    document.execCommand(command);
  };
  const disabledWindowsMenuItem = (id: string, itemLabel: string, accelerator?: string) =>
    contextMenuItem(id, itemLabel, accelerator, undefined, true);
  const windowsMenuItem = (
    id: string,
    itemLabel: string,
    accelerator: string | undefined,
    handler: (() => unknown | Promise<unknown>) | undefined
  ) => contextMenuItem(id, itemLabel, accelerator, handler);
  const windowsAppMenuEntries = (menuId: WindowsAppMenuId): ContextMenuEntry[] => {
    if (menuId === "app") {
      return [
        windowsMenuItem("showAbout", label("menu.aboutMarkra"), undefined, onShowAbout),
        contextMenuSeparator(),
        windowsMenuItem("openSettings", label("menu.settings"), "Ctrl+,", onOpenSettings),
        windowsMenuItem("checkForUpdates", label("settings.update.check"), undefined, menuHandlers?.checkForUpdates),
        contextMenuSeparator(),
        disabledWindowsMenuItem("hide", label("menu.hide")),
        disabledWindowsMenuItem("hideOthers", label("menu.hideOthers")),
        disabledWindowsMenuItem("showAll", label("menu.showAll")),
        contextMenuSeparator(),
        windowsMenuItem("quit", label("menu.quit"), undefined, onExitApp)
      ];
    }

    if (menuId === "file") {
      return [
        contextMenuItem("newDocument", label("menu.newDocument"), "Ctrl+N", onCreateMarkdownFile),
        contextMenuItem("openDocument", label("menu.openDocument"), "Ctrl+O", onOpenMarkdown),
        onOpenMarkdownFolder
          ? contextMenuItem("openFolder", label("app.openFolderDialog"), "Ctrl+Shift+O", onOpenMarkdownFolder)
          : disabledWindowsMenuItem("openFolder", label("app.openFolderDialog"), "Ctrl+Shift+O"),
        contextMenuSeparator(),
        contextMenuItem("saveDocument", label("menu.saveDocument"), "Ctrl+S", onSaveMarkdown, saveDisabled),
        contextMenuItem(
          "saveDocumentAs",
          label("menu.saveDocumentAs"),
          "Ctrl+Shift+S",
          menuHandlers?.saveDocumentAs,
          saveDisabled || !menuHandlers?.saveDocumentAs
        ),
        contextMenuSeparator(),
        contextMenuSubmenu("export", label("menu.export"), [
          windowsMenuItem("exportPdf", label("menu.exportPdf"), "Ctrl+Alt+P", menuHandlers?.exportPdf),
          windowsMenuItem("exportHtml", label("menu.exportHtml"), "Ctrl+Shift+E", menuHandlers?.exportHtml),
          windowsMenuItem("exportDocx", label("menu.exportDocx"), undefined, menuHandlers?.exportDocx),
          windowsMenuItem("exportEpub", label("menu.exportEpub"), undefined, menuHandlers?.exportEpub),
          windowsMenuItem("exportLatex", label("menu.exportLatex"), undefined, menuHandlers?.exportLatex)
        ])
      ];
    }

    if (menuId === "edit") {
      return [
        contextMenuItem("editUndo", label("menu.undo"), "Ctrl+Z", () => runBrowserEditCommand("undo")),
        contextMenuItem("editRedo", label("menu.redo"), "Ctrl+Shift+Z", () => runBrowserEditCommand("redo")),
        contextMenuSeparator(),
        contextMenuItem("cut", label("menu.cut"), "Ctrl+X", () => runBrowserEditCommand("cut")),
        contextMenuItem("copy", label("menu.copy"), "Ctrl+C", () => runBrowserEditCommand("copy")),
        contextMenuItem("paste", label("menu.paste"), "Ctrl+V", () => runBrowserEditCommand("paste")),
        contextMenuItem("selectAll", label("menu.selectAll"), "Ctrl+A", () => runBrowserEditCommand("selectAll"))
      ];
    }

    if (menuId === "format") {
      return [
        windowsMenuItem("formatBold", label("menu.bold"), "Ctrl+B", menuHandlers?.formatBold),
        windowsMenuItem("formatItalic", label("menu.italic"), "Ctrl+I", menuHandlers?.formatItalic),
        windowsMenuItem("formatStrikethrough", label("menu.strikethrough"), "Ctrl+Shift+X", menuHandlers?.formatStrikethrough),
        windowsMenuItem("formatInlineCode", label("menu.inlineCode"), "Ctrl+E", menuHandlers?.formatInlineCode),
        contextMenuSeparator(),
        windowsMenuItem("formatParagraph", label("menu.paragraph"), "Ctrl+Alt+0", menuHandlers?.formatParagraph),
        windowsMenuItem("formatHeading1", label("menu.heading1"), "Ctrl+Alt+1", menuHandlers?.formatHeading1),
        windowsMenuItem("formatHeading2", label("menu.heading2"), "Ctrl+Alt+2", menuHandlers?.formatHeading2),
        windowsMenuItem("formatHeading3", label("menu.heading3"), "Ctrl+Alt+3", menuHandlers?.formatHeading3),
        contextMenuSeparator(),
        windowsMenuItem("formatBulletList", label("menu.bulletList"), "Ctrl+Shift+8", menuHandlers?.formatBulletList),
        windowsMenuItem("formatOrderedList", label("menu.orderedList"), "Ctrl+Shift+7", menuHandlers?.formatOrderedList),
        windowsMenuItem("formatQuote", label("menu.quote"), "Ctrl+Shift+B", menuHandlers?.formatQuote),
        windowsMenuItem("formatCodeBlock", label("menu.codeBlock"), "Ctrl+Alt+C", menuHandlers?.formatCodeBlock),
        contextMenuSeparator(),
        windowsMenuItem("insertLink", label("menu.link"), "Ctrl+K", menuHandlers?.insertLink),
        windowsMenuItem("insertImage", label("menu.image"), "Ctrl+Shift+I", menuHandlers?.insertImage),
        windowsMenuItem("insertTable", label("menu.table"), "Ctrl+Shift+Alt+T", menuHandlers?.insertTable)
      ];
    }

    return [
      windowsMenuItem("toggleWindowMaximized", label("menu.maximizeWindow"), undefined, onToggleWindowMaximized),
      contextMenuSeparator(),
      contextMenuItem("toggleMarkdownFiles", label("app.toggleMarkdownFiles"), "Ctrl+Shift+M", menuHandlers?.toggleMarkdownFiles ?? onToggleMarkdownFiles),
      contextMenuItem(
        "toggleDocumentHistory",
        label("app.showDocumentHistory"),
        "Ctrl+Shift+H",
        menuHandlers?.toggleDocumentHistory ?? onShowDocumentHistory,
        historyDisabled || !(menuHandlers?.toggleDocumentHistory ?? onShowDocumentHistory)
      ),
      contextMenuItem("toggleAiAgent", label("app.toggleAiAgent"), "Ctrl+Alt+J", menuHandlers?.toggleAiAgent ?? onToggleAiAgent),
      windowsMenuItem("toggleAiCommand", label("app.aiCommandDialog"), "Ctrl+Shift+J", menuHandlers?.toggleAiCommand),
      windowsMenuItem("toggleAllFolds", label("editor.toggleAllFolds"), "Ctrl+Alt+T", menuHandlers?.toggleAllFolds),
      onToggleSourceMode
        ? contextMenuItem("toggleSourceMode", sourceMode ? label("app.switchToVisualMode") : label("app.switchToSourceMode"), "Ctrl+Alt+S", menuHandlers?.toggleSourceMode ?? onToggleSourceMode, sourceModeDisabled)
        : disabledWindowsMenuItem("toggleSourceMode", label("app.switchToSourceMode"), "Ctrl+Alt+S"),
      contextMenuItem("toggleTheme", themeActionLabel, undefined, onToggleTheme)
    ];
  };
  const showWindowsAppMenu = (menu: WindowsAppMenuConfig, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    showContextMenu(event.currentTarget.ownerDocument, {
      ariaLabel: menu.label,
      entries: windowsAppMenuEntries(menu.id),
      position: {
        x: rect.left,
        y: rect.bottom
      }
    });
  };
  const runToggleWindowMaximized = () => {
    if (!onToggleWindowMaximized) return;

    try {
      Promise.resolve(onToggleWindowMaximized()).catch(() => {});
    } catch {
      // Native window state can change while the app is closing; keep the titlebar inert.
    }
  };
  const handleWindowsTitlebarMouseDownCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!nativeWindowChrome || !onToggleWindowMaximized || isWindowsTitlebarInteractiveTarget(event.target)) return;
    if (event.button !== 0 || event.detail !== 2) return;

    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    runToggleWindowMaximized();
  };

  const renderFixedOpenAction = (className = dimTitlebarIconButtonClassName) => {
    if (!openChoiceMenuAvailable || !onOpenMarkdownFolder) {
      return (
        <IconButton
          label={label("app.openMarkdownOrFolder")}
          className={className}
          onClick={(event) => handleOpenActionClick(event, onOpenMarkdown)}
        >
          <FolderOpen aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    return (
      <div className="relative" ref={openMenuRef}>
        <IconButton
          className={mergeClassNames(
            openMenuVisible ? "bg-(--bg-active) text-(--text-heading)" : "",
            className
          )}
          label={label("app.openMarkdownOrFolder")}
          aria-expanded={openMenuVisible}
          aria-haspopup="menu"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenMenuVisible((current) => !current);
          }}
        >
          <FolderOpen aria-hidden="true" size={15} />
        </IconButton>
        {openMenuVisible ? (
          <PopoverSurface
            className={`absolute top-[calc(100%+6px)] ${openChoiceMenuAlignmentClassName} z-40 w-52 overflow-hidden rounded-lg p-0`}
            open
            role="menu"
            aria-label={label("app.openMarkdownOrFolder")}
          >
            <div className="px-1.5 py-1">
              <Button
                className="h-7 w-full justify-start rounded-sm border-transparent bg-transparent px-2 text-left text-[12px] font-[520] text-(--text-heading) hover:bg-(--bg-hover)"
                size="sm"
                role="menuitem"
                variant="ghost"
                onClick={() => runOpenAction(onOpenMarkdown)}
              >
                <FileText aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
                <span className="truncate">{label("app.openMarkdownFile")}</span>
              </Button>
            </div>
            <div
              className="border-t border-(--border-default) px-1.5 pt-1 pb-1.5"
              role="group"
              aria-label={label("app.markdownFolderSection")}
            >
              <div
                className="px-2 py-1 text-[11px] leading-4 font-medium text-(--text-secondary)"
                role="presentation"
              >
                {label("app.markdownFolderSection")}
              </div>
              <Button
                className="h-7 w-full justify-start rounded-sm border-transparent bg-transparent px-2 text-left text-[12px] font-[520] text-(--text-heading) hover:bg-(--bg-hover)"
                size="sm"
                role="menuitem"
                variant="ghost"
                onClick={() => runOpenAction(onOpenMarkdownFolder)}
              >
                <FolderOpen aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
                <span className="truncate">{label("app.openFolderDialog")}</span>
              </Button>
            </div>
          </PopoverSurface>
        ) : null}
      </div>
    );
  };

  const renderTitlebarAction = (id: TitlebarActionId, sortable: SortableTitlebarActionRenderProps) => {
    if (id === "aiAgent") {
      return (
        <IconButton
          className={mergeClassNames(
            aiAgentOpen
              ? "bg-(--bg-active) text-(--text-heading) opacity-100"
              : "bg-transparent text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)",
            sortable.actionClassName
          )}
          label={label("app.toggleAiAgent")}
          pressed={aiAgentOpen}
          onClick={(event) => handleTitlebarActionClick("aiAgent", event, onToggleAiAgent)}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <Bot aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    if (id === "sourceMode") {
      if (!onToggleSourceMode) return null;

      return sourceMode ? (
        <IconButton
          className={mergeClassNames(
            "bg-(--bg-active) text-(--text-heading) opacity-100 disabled:opacity-35",
            sortable.actionClassName
          )}
          disabled={sourceModeDisabled}
          label={label("app.switchToVisualMode")}
          onClick={(event) => handleTitlebarActionClick("sourceMode", event, onToggleSourceMode)}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <Eye aria-hidden="true" size={15} />
        </IconButton>
      ) : (
        <IconButton
          className={mergeClassNames("disabled:opacity-35", sortable.actionClassName)}
          disabled={sourceModeDisabled}
          label={label("app.switchToSourceMode")}
          onClick={(event) => handleTitlebarActionClick("sourceMode", event, onToggleSourceMode)}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <Code2 aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    if (id === "splitMode") {
      if (!onToggleSplitMode) return null;

      return (
        <IconButton
          className={mergeClassNames(
            splitMode ? "bg-(--bg-active) text-(--text-heading) opacity-100" : "",
            "disabled:opacity-35",
            sortable.actionClassName
          )}
          disabled={sourceModeDisabled}
          label={splitMode ? label("app.closeSplitMode") : label("app.switchToSplitMode")}
          pressed={splitMode}
          onClick={(event) => handleTitlebarActionClick("splitMode", event, onToggleSplitMode)}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <PanelRight aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    if (id === "save") {
      return (
        <IconButton
          className={mergeClassNames("disabled:opacity-35", sortable.actionClassName)}
          disabled={saveDisabled}
          label={label("app.saveMarkdown")}
          onClick={(event) => handleTitlebarActionClick("save", event, onSaveMarkdown)}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <Save aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    if (id === "history") {
      return (
        <IconButton
          className={mergeClassNames("disabled:opacity-35", sortable.actionClassName)}
          disabled={historyDisabled || !onShowDocumentHistory}
          label={label("app.showDocumentHistory")}
          onClick={(event) => {
            if (!onShowDocumentHistory) return;

            handleTitlebarActionClick("history", event, onShowDocumentHistory);
          }}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <History aria-hidden="true" size={15} />
        </IconButton>
      );
    }

    return (
      <IconButton
        className={sortable.actionClassName}
        label={themeActionLabel}
        onClick={(event) => handleTitlebarActionClick("theme", event, onToggleTheme)}
        {...sortable.actionAttributes}
        {...sortable.actionListeners}
      >
        {theme === "dark" ? <Sun aria-hidden="true" size={15} /> : <Moon aria-hidden="true" size={15} />}
      </IconButton>
    );
  };

  const renderDocumentActions = (className: string, style?: CSSProperties) => (
    <div
      className={className}
      aria-label={label("app.fileActions")}
      style={style}
    >
      <DndContext
        collisionDetection={closestCenter}
        sensors={sensors}
        onDragCancel={handleTitlebarActionDragCancel}
        onDragEnd={handleTitlebarActionDragEnd}
        onDragStart={handleTitlebarActionDragStart}
      >
        <SortableContext items={visibleTitlebarActionIds} strategy={horizontalListSortingStrategy}>
          {normalizedTitlebarActions.map((action) => action.visible ? (
            <SortableTitlebarAction
              key={action.id}
              disabled={!onTitlebarActionsChange}
              id={action.id}
            >
              {(sortable) => (
                <span
                  className={sortable.itemClassName}
                  data-titlebar-action={action.id}
                  ref={sortable.setItemRef}
                  style={sortable.itemStyle}
                >
                  {renderTitlebarAction(action.id, sortable)}
                </span>
              )}
            </SortableTitlebarAction>
          ) : null)}
        </SortableContext>
      </DndContext>
    </div>
  );

  const documentActionsClassName = `document-actions relative z-10 flex h-10 items-center justify-end gap-0.5 pr-3.5 text-(--text-secondary) opacity-10 group-hover/titlebar:opacity-100 focus-within:opacity-100 motion-reduce:transition-none ${
    aiAgentResizing
      ? "transition-none"
      : "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
  }`;
  const titlebarSurfaceClassName = "bg-(--bg-primary)";
  const windowsAppChromeSurfaceClassName = "bg-(--bg-chrome)";
  const windowsTitlebarSurfaceClassName = titlebarSurfaceClassName;
  const titlebarSidebarWidth = nativeWindowChrome && markdownFilesOpen ? markdownFilesWidth : 0;
  const titlebarSidebarWidthTransitionClassName = markdownFilesResizing
    ? "transition-none"
    : "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
  const windowsTitlebarActionsTransitionClassName = aiAgentResizing
    ? "transition-none"
    : "transition-[opacity,background-color,color,transform] duration-150 ease-out";
  const titlebarGridStyle: CSSProperties = {
    ...(!nativeWindowChrome && markdownFilesOpen ? { left: markdownFilesWidth + 1 } : {}),
    gridTemplateColumns: nativeWindowChrome
      ? `${titlebarSideSlotWidth}px minmax(0,1fr) ${titlebarSideSlotWidth}px`
      : "auto minmax(0, 1fr) auto"
  };

  const renderTitleContent = (className: string, style?: CSSProperties) => (
    <div className={className} style={style}>
      {titleContent}
    </div>
  );
  const renderTitlebarSidebarSurface = () => nativeWindowChrome ? (
    <span
      aria-hidden="true"
      className={`native-titlebar-sidebar-surface pointer-events-none absolute top-0 bottom-0 left-0 z-0 bg-(--bg-secondary) ${titlebarSidebarWidthTransitionClassName}`}
      style={{ width: titlebarSidebarWidth }}
    >
      <span
        aria-hidden="true"
        className="native-titlebar-sidebar-divider pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-(--border-default) opacity-100"
      />
    </span>
  ) : null;
  const renderTitlebarSidebarDragFill = () => {
    if (!nativeWindowChrome || !markdownFilesOpen || !titleContent) return null;

    const width = markdownFilesWidth - titlebarSideSlotWidth;
    if (width <= 0) return null;

    return (
      <span
        aria-hidden="true"
        className="native-titlebar-sidebar-drag-fill absolute top-0 bottom-0 z-0"
        data-tauri-drag-region="true"
        style={{ left: titlebarSideSlotWidth, width }}
      />
    );
  };

  if (platform === "windows") {
    const showWindowsAppChrome = nativeWindowChrome;
    const windowsTitlebarTopClassName = showWindowsAppChrome ? "top-10" : "top-0";
    const windowsTitlebarLeft = markdownFilesWidth + (showWindowsAppChrome ? -1 : 1);
    const windowsTitlebarEdgeClassName = showWindowsAppChrome
      ? `border-t border-(--border-default) ${markdownFilesOpen ? "rounded-tl-md border-l" : ""}`
      : "";
    const windowsAiReserveWidth = aiAgentOpen ? aiAgentWidth : 0;
    const WindowsSidebarIcon = markdownFilesOpen ? PanelLeft : PanelRight;
    const windowsWorkspaceName = (workspaceName ?? (documentKind === "folder" ? documentName : "")).trim();
    const showWindowsFolderContext = windowsWorkspaceName.length > 0;
    const showWindowsDocumentTitle = !(documentKind === "folder" && showWindowsFolderContext);
    const windowsChromeToolButtonClassName =
      "windows-app-chrome-tool inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-sm border-0 bg-transparent p-0 text-(--text-secondary) transition-[background-color,color] duration-100 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) disabled:pointer-events-none disabled:text-(--text-tertiary) disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)";
    const stopWindowsChromeToolMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    };
    const windowsAppMenus: WindowsAppMenuConfig[] = [
      { id: "file", label: label("menu.file") },
      { id: "edit", label: label("menu.edit") },
      { id: "format", label: label("menu.format") },
      { id: "view", label: label("menu.view") }
    ];
    const renderWindowsFolderContext = () => showWindowsFolderContext ? (
      <span
        className="windows-app-chrome-context flex h-7 min-w-0 max-w-72 shrink items-center justify-center gap-1.5 text-[12px] leading-none font-[620] text-(--text-heading)"
        data-tauri-drag-region={nativeWindowChrome ? true : undefined}
        title={windowsWorkspaceName}
      >
        <FolderOpen aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={13} />
        <span className="min-w-0 truncate" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
          {windowsWorkspaceName}
        </span>
      </span>
    ) : null;
    const renderWindowsAppChrome = () => showWindowsAppChrome ? (
      <header
        className={`windows-app-chrome fixed inset-x-0 top-0 z-20 grid h-10 grid-cols-[auto_minmax(0,1fr)_auto] select-none items-center ${windowsAppChromeSurfaceClassName} [-webkit-user-select:none]`}
        aria-label={label("app.windowDragRegion")}
        data-tauri-drag-region={nativeWindowChrome ? true : undefined}
        onMouseDownCapture={handleWindowsTitlebarMouseDownCapture}
      >
        <div
          className="relative z-20 flex h-10 min-w-0 items-center gap-1 px-2 text-[12px] leading-none text-(--text-primary)"
          data-tauri-drag-region={nativeWindowChrome ? true : undefined}
        >
          <div className="windows-app-chrome-tools flex h-10 shrink-0 items-center gap-0.5">
            <button
              aria-label="Toggle workspace sidebar"
              aria-pressed={markdownFilesOpen}
              className={windowsChromeToolButtonClassName}
              onClick={onToggleMarkdownFiles}
              onMouseDown={stopWindowsChromeToolMouseDown}
              type="button"
            >
              <WindowsSidebarIcon aria-hidden="true" size={15} />
            </button>
          </div>
          <button
            className="h-7 shrink-0 rounded-sm border-0 bg-transparent px-2 text-[12px] leading-none font-[620] text-(--text-heading) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            aria-haspopup="menu"
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => showWindowsAppMenu({ id: "app", label: "Markra" }, event)}
          >
            Markra
          </button>
          {windowsAppMenus.map((menu) => (
            <button
              className="h-7 rounded-sm border-0 bg-transparent px-2 text-[12px] leading-none text-(--text-primary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              aria-haspopup="menu"
              key={menu.id}
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => showWindowsAppMenu(menu, event)}
            >
              {menu.label}
            </button>
          ))}
        </div>
        <div className="min-w-0" data-tauri-drag-region={nativeWindowChrome ? true : undefined} />
        <WindowsWindowControls onMaximize={onToggleWindowMaximized} />
        <div
          className="windows-app-chrome-center pointer-events-none absolute top-0 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center justify-center px-6"
          data-tauri-drag-region={nativeWindowChrome ? true : undefined}
        >
          {renderWindowsFolderContext()}
        </div>
      </header>
    ) : null;
    const renderWindowsTitlebarCornerMask = () => showWindowsAppChrome && markdownFilesOpen ? (
      <span
        aria-hidden="true"
        className="windows-titlebar-corner-mask pointer-events-none fixed top-10 z-[9] h-3 bg-(--bg-chrome)"
        style={{ left: Math.max(0, windowsTitlebarLeft - 1), width: 3 }}
      />
    ) : null;

    if (titleContent) {
      const windowsTitleSlotPaddingClassName = markdownFilesOpen ? "pl-2.5" : "pl-3";
      const windowsTitlebarStyle: CSSProperties = {
        ...(markdownFilesOpen ? { left: windowsTitlebarLeft } : {}),
        gridTemplateColumns: [
          "minmax(0,1fr)",
          `${titlebarSideSlotWidth}px`,
          ...(windowsAiReserveWidth > 0 ? [`${windowsAiReserveWidth}px`] : [])
        ].join(" ")
      };

      return (
        <>
          {renderWindowsAppChrome()}
          {renderWindowsTitlebarCornerMask()}
          <header
            className={`native-titlebar group/titlebar fixed inset-x-0 ${windowsTitlebarTopClassName} z-10 grid h-10 select-none items-center ${windowsTitlebarSurfaceClassName} ${windowsTitlebarEdgeClassName} [-webkit-user-select:none]`}
            style={windowsTitlebarStyle}
            aria-label={label("app.windowDragRegion")}
            onMouseDownCapture={handleWindowsTitlebarMouseDownCapture}
          >
            {renderTitleContent(`native-title-slot min-w-0 h-10 pr-3 ${windowsTitleSlotPaddingClassName}`)}
            <div
              className={`windows-titlebar-actions relative z-10 flex h-10 items-center justify-end gap-0.5 pr-3.5 text-(--text-secondary) opacity-40 ${windowsTitlebarActionsTransitionClassName} hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none`}
            >
              {renderDocumentActions("document-actions relative flex h-10 items-center justify-end gap-0.5")}
            </div>
            {windowsAiReserveWidth > 0 ? <span aria-hidden="true" data-tauri-drag-region="true" /> : null}
          </header>
        </>
      );
    }

    const windowsTitleOffset = nativeWindowChrome
      ? ((markdownFilesOpen ? markdownFilesWidth : 0) - (aiAgentOpen ? aiAgentWidth : 0)) / 2
      : 0;
    const windowsTitleTransform = windowsTitleOffset === 0 ? undefined : `translateX(${windowsTitleOffset}px)`;
    const windowsTitlebarStyle: CSSProperties = {
      ...(markdownFilesOpen ? { left: windowsTitlebarLeft } : {}),
      gridTemplateColumns: [
        "minmax(0,1fr)",
        `${titlebarSideSlotWidth}px`,
        ...(windowsAiReserveWidth > 0 ? [`${windowsAiReserveWidth}px`] : [])
      ].join(" ")
    };
    const TitleIcon = documentKind === "folder" ? FolderOpen : documentKind === "image" ? ImageIcon : FileText;

    return (
      <>
        {renderWindowsAppChrome()}
        {renderWindowsTitlebarCornerMask()}
        <header
          className={`native-titlebar group/titlebar fixed inset-x-0 ${windowsTitlebarTopClassName} z-10 grid h-10 select-none items-center ${windowsTitlebarSurfaceClassName} ${windowsTitlebarEdgeClassName} [-webkit-user-select:none]`}
          style={windowsTitlebarStyle}
          aria-label={label("app.windowDragRegion")}
          data-tauri-drag-region={nativeWindowChrome ? true : undefined}
          onMouseDownCapture={handleWindowsTitlebarMouseDownCapture}
        >
          {showWindowsDocumentTitle ? (
            <h1
              className={`native-title pointer-events-none m-0 flex h-10 min-w-0 items-center justify-center gap-1.5 text-[14px] leading-none font-[650] tracking-normal text-(--text-primary) motion-reduce:transition-none ${
                aiAgentResizing || markdownFilesResizing ? "transition-none" : "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
              }`}
              data-tauri-drag-region={nativeWindowChrome ? true : undefined}
              style={{ transform: windowsTitleTransform }}
            >
              <TitleIcon aria-hidden="true" size={15} />
              <span className="min-w-0 truncate" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
                {documentName}
              </span>
              {dirty ? (
                <span className="save-mark size-1.25 rounded-full bg-(--accent)" aria-label={label("app.unsavedChanges")} />
              ) : null}
            </h1>
          ) : (
            <div className="h-10" data-tauri-drag-region={nativeWindowChrome ? true : undefined} />
          )}
          <div
            className={`windows-titlebar-actions flex h-10 items-center justify-end gap-0.5 text-(--text-secondary) opacity-40 ${windowsTitlebarActionsTransitionClassName} hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none`}
          >
            {renderDocumentActions("document-actions relative flex h-10 items-center justify-end gap-0.5")}
          </div>
          {windowsAiReserveWidth > 0 ? <span aria-hidden="true" data-tauri-drag-region="true" /> : null}
        </header>
      </>
    );
  }

  const editorLeftInset = nativeWindowChrome && markdownFilesOpen ? markdownFilesWidth : 0;
  const editorRightInset = nativeWindowChrome && aiAgentOpen ? aiAgentWidth : 0;
  const titleOffset = nativeWindowChrome ? (editorLeftInset - editorRightInset) / 2 : 0;
  const titleTransform = titleOffset === 0 ? undefined : `translateX(${titleOffset}px)`;
  const titleContentSlotStyle: CSSProperties | undefined = nativeWindowChrome
    ? {
      ...(editorLeftInset > titlebarSideSlotWidth ? { marginLeft: editorLeftInset - titlebarSideSlotWidth } : {}),
      ...(editorRightInset > 0 ? { marginRight: editorRightInset } : {})
    }
    : undefined;
  const titleSlotStyle: CSSProperties | undefined = nativeWindowChrome
    ? {
      transform: titleTransform,
      ...(titleOffset > 0 ? { marginRight: titleOffset } : {}),
      ...(titleOffset < 0 ? { marginLeft: -titleOffset } : {})
    }
    : undefined;
  const titleResizing = aiAgentResizing || markdownFilesResizing;
  const showQuickCreateMarkdownFile =
    quickCreateMarkdownFileVisible && !markdownFilesOpen && !titleContent && onCreateMarkdownFile;
  const TitleIcon = documentKind === "folder" ? FolderOpen : documentKind === "image" ? ImageIcon : FileText;
  const MarkdownFilesIcon = markdownFilesOpen ? PanelLeft : PanelRight;
  const showMacWindowControls = nativeWindowChrome && platform === "macos";
  const titlebarLeftPaddingClassName = showMacWindowControls ? "pl-0" : "pl-2";

  return (
    <header
      className={`native-titlebar group/titlebar fixed inset-x-0 top-0 z-8 grid h-10 grid-cols-[164px_minmax(0,1fr)_164px] select-none items-center ${titlebarSurfaceClassName} [-webkit-user-select:none]`}
      style={titlebarGridStyle}
      aria-label={label("app.windowDragRegion")}
      data-tauri-drag-region={nativeWindowChrome && !titleContent ? true : undefined}
    >
      {renderTitlebarSidebarSurface()}
      {renderTitlebarSidebarDragFill()}
      <div
        className={`titlebar-spacer relative z-20 flex h-10 items-center gap-1 ${titlebarLeftPaddingClassName}`}
        data-tauri-drag-region={nativeWindowChrome ? true : undefined}
      >
        {showMacWindowControls ? <MacWindowControls /> : null}
        <IconButton
          className={dimTitlebarIconButtonClassName}
          label={label("app.toggleMarkdownFiles")}
          pressed={markdownFilesOpen}
          onClick={onToggleMarkdownFiles}
        >
          <MarkdownFilesIcon aria-hidden="true" size={15} />
        </IconButton>
        {renderFixedOpenAction()}
        {showQuickCreateMarkdownFile ? (
          <IconButton
            className={dimTitlebarIconButtonClassName}
            label={label("app.newMarkdownFile")}
            onClick={onCreateMarkdownFile}
          >
            <SquarePen aria-hidden="true" size={15} />
          </IconButton>
        ) : null}
      </div>
      {titleContent ? (
        renderTitleContent(
          `native-title-slot flex h-10 min-w-0 items-center justify-center motion-reduce:transition-none ${
            titleResizing ? "transition-none" : "transition-[margin,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          }`,
          titleContentSlotStyle
        )
      ) : (
        <h1
          className={`native-title pointer-events-none m-0 flex h-10 min-w-0 items-center justify-center gap-1.5 text-[14px] leading-none font-[650] tracking-normal text-(--text-primary) motion-reduce:transition-none ${
            titleResizing ? "transition-none" : "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          }`}
          data-tauri-drag-region={nativeWindowChrome ? true : undefined}
          style={{ transform: titleTransform }}
        >
          <TitleIcon aria-hidden="true" size={15} />
          <span className="min-w-0 truncate" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
            {documentName}
          </span>
          {dirty ? (
            <span className="save-mark size-1.25 rounded-full bg-(--accent)" aria-label={label("app.unsavedChanges")} />
          ) : null}
        </h1>
      )}
      {renderDocumentActions(documentActionsClassName, { transform: aiAgentOpen ? `translateX(-${aiAgentWidth}px)` : undefined })}
    </header>
  );
}
