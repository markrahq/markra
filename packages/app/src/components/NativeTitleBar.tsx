import {
  Bot,
  Check,
  Code2,
  Eye,
  FileText,
  Focus,
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
import { viewModeOptions, type ViewMode } from "../lib/view-mode";
import type { NativeMenuHandlers } from "../lib/tauri/menu";
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import { t, type AppLanguage } from "@markra/shared";
import { MacWindowControls } from "./MacWindowControls";
import {
  SortableTitlebarAction,
  type SortableTitlebarActionRenderProps
} from "./SortableTitlebarAction";
import { WindowsNativeTitleBar } from "./WindowsNativeTitleBar";

type EditorViewMode = "visual" | "source" | "split";

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
  syncNowShortcut?: string;
  markdownFilesButtonVisible?: boolean;
  nativeWindowChrome?: boolean;
  openMarkdownButtonVisible?: boolean;
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
  viewMode?: ViewMode;
  onCycleViewMode?: () => unknown;
  onSelectViewMode?: (mode: ViewMode) => unknown;
  onCreateMarkdownFile?: () => unknown;
  onExitApp?: () => unknown;
  onOpenMarkdown: () => unknown;
  onOpenMarkdownFolder?: () => unknown;
  onOpenSettings?: () => unknown;
  onSaveMarkdown: () => unknown;
  onSelectEditorMode?: (mode: EditorViewMode) => unknown;
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

const dimTitlebarIconButtonClassName =
  "opacity-55 hover:opacity-100 focus-visible:opacity-100";
const titlebarActionDragThresholdPx = 4;

function mergeClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
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
  syncNowShortcut,
  markdownFilesButtonVisible = true,
  nativeWindowChrome = true,
  openMarkdownButtonVisible = true,
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
  viewMode = "daily",
  onCycleViewMode,
  onSelectViewMode,
  onCreateMarkdownFile,
  onExitApp,
  onOpenMarkdown,
  onOpenMarkdownFolder,
  onOpenSettings,
  onSaveMarkdown,
  onSelectEditorMode,
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
  const viewModeMenuRef = useRef<HTMLDivElement | null>(null);
  const draggingActionIdRef = useRef<TitlebarActionId | null>(null);
  const suppressActionClickIdsRef = useRef(new Set<TitlebarActionId>());
  const [openMenuVisible, setOpenMenuVisible] = useState(false);
  const [viewModeMenuVisible, setViewModeMenuVisible] = useState(false);
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const themeActionLabel = theme === "dark" ? label("app.switchToLightTheme") : label("app.switchToDarkTheme");
  const editorViewMode = splitMode ? "split" : sourceMode ? "source" : "visual";
  const openChoiceMenuAvailable = Boolean(onOpenMarkdownFolder) && (!nativeWindowChrome || platform !== "macos");
  const openChoiceMenuAlignmentClassName = platform === "windows" ? "right-0" : "left-0";
  const titlebarSideSlotWidth = 164;
  const normalizedTitlebarActions = useMemo(
    () => titlebarActions?.length === 0 ? [] : normalizeTitlebarActions(titlebarActions),
    [titlebarActions]
  );
  const visibleTitlebarActionIds = useMemo(
    () => normalizedTitlebarActions.filter((action) => action.visible).map((action) => action.id),
    [normalizedTitlebarActions]
  );
  const viewModeActionVisible = visibleTitlebarActionIds.includes("viewMode");
  const sensors = useSensors(useSensor(MouseSensor, {
    activationConstraint: {
      distance: titlebarActionDragThresholdPx
    }
  }));

  useEffect(() => {
    if (!openMarkdownButtonVisible) setOpenMenuVisible(false);
  }, [openMarkdownButtonVisible]);

  useEffect(() => {
    if (!viewModeActionVisible) setViewModeMenuVisible(false);
  }, [viewModeActionVisible]);

  useEffect(() => {
    if (!openMenuVisible && !viewModeMenuVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (openMenuVisible && !openMenuRef.current?.contains(target)) setOpenMenuVisible(false);
      if (viewModeMenuVisible && !viewModeMenuRef.current?.contains(target)) setViewModeMenuVisible(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuVisible(false);
        setViewModeMenuVisible(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuVisible, viewModeMenuVisible]);

  const runOpenAction = (action: () => unknown) => {
    setOpenMenuVisible(false);
    action();
  };
  const runViewModeAction = (mode: ViewMode) => {
    setViewModeMenuVisible(false);
    if (mode === viewMode) return;

    onSelectViewMode?.(mode);
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
  const selectEditorViewMode = (mode: EditorViewMode) => {
    if (mode === editorViewMode) return;

    if (onSelectEditorMode) {
      onSelectEditorMode(mode);
      return;
    }

    if (mode === "visual") {
      if (splitMode) onToggleSplitMode?.();
      else if (sourceMode) onToggleSourceMode?.();
      return;
    }

    if (mode === "source") {
      if (splitMode) onToggleSplitMode?.();
      if (!sourceMode) onToggleSourceMode?.();
      return;
    }

    if (!splitMode) onToggleSplitMode?.();
  };
  const renderFixedOpenAction = (className = dimTitlebarIconButtonClassName) => {
    if (!openMarkdownButtonVisible) return null;

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

    if (id === "viewMode") {
      if (!onSelectViewMode && !onCycleViewMode) return null;

      const currentViewModeLabel = label(`settings.editor.viewMode.${viewMode}` as Parameters<typeof t>[1]);

      return (
        <div className="relative" ref={viewModeMenuRef}>
          <IconButton
            className={mergeClassNames(
              viewMode === "daily" && !viewModeMenuVisible ? "" : "bg-(--bg-active) text-(--text-heading) opacity-100",
              sortable.actionClassName
            )}
            label={`${label("settings.editor.viewMode")}: ${currentViewModeLabel}`}
            aria-expanded={onSelectViewMode ? viewModeMenuVisible : undefined}
            aria-haspopup={onSelectViewMode ? "menu" : undefined}
            onClick={(event) => {
              handleTitlebarActionClick("viewMode", event, () => {
                if (!onSelectViewMode) {
                  onCycleViewMode?.();
                  return;
                }

                setOpenMenuVisible(false);
                setViewModeMenuVisible((current) => !current);
              });
            }}
            {...sortable.actionAttributes}
            {...sortable.actionListeners}
          >
            <Focus aria-hidden="true" size={15} />
          </IconButton>
          {onSelectViewMode && viewModeMenuVisible ? (
            <PopoverSurface
              className="absolute top-[calc(100%+6px)] right-0 z-40 w-44 overflow-hidden rounded-lg p-1"
              open
              role="menu"
              aria-label={label("settings.editor.viewMode")}
            >
              {viewModeOptions.map((mode) => {
                const selected = mode === viewMode;
                const optionLabel = label(`settings.editor.viewMode.${mode}` as Parameters<typeof t>[1]);

                return (
                  <button
                    key={mode}
                    className="flex h-8 w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] leading-5 font-[560] text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none aria-checked:text-(--text-heading)"
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => runViewModeAction(mode)}
                  >
                    <span className="truncate">{optionLabel}</span>
                    {selected ? <Check aria-hidden="true" className="shrink-0 text-(--accent)" size={14} /> : null}
                  </button>
                );
              })}
            </PopoverSurface>
          ) : null}
        </div>
      );
    }

    if (id === "sourceMode") {
      if (!onSelectEditorMode && !onToggleSourceMode && !onToggleSplitMode) return null;

      const editorViewModeOptions = [
        { Icon: Eye, label: label("app.editorViewPreview"), mode: "visual" as const },
        { Icon: Code2, label: label("app.editorViewSource"), mode: "source" as const },
        { Icon: PanelRight, label: label("app.editorViewSplit"), mode: "split" as const }
      ];
      const currentEditorViewModeOption =
        editorViewModeOptions.find((option) => option.mode === editorViewMode) ?? editorViewModeOptions[0]!;
      const CurrentIcon = currentEditorViewModeOption.Icon;
      const nextEditorViewMode = editorViewMode === "visual" ? "source" : editorViewMode === "source" ? "split" : "visual";
      return (
        <IconButton
          className={mergeClassNames(
            editorViewMode === "visual" ? "" : "bg-(--bg-active) text-(--text-heading) opacity-100",
            "disabled:opacity-35",
            sortable.actionClassName
          )}
          disabled={sourceModeDisabled}
          label={`${label("app.editorViewMode")}: ${currentEditorViewModeOption.label}`}
          onClick={(event) => {
            handleTitlebarActionClick("sourceMode", event, () => selectEditorViewMode(nextEditorViewMode));
          }}
          {...sortable.actionAttributes}
          {...sortable.actionListeners}
        >
          <CurrentIcon aria-hidden="true" size={15} />
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
  const titlebarSidebarWidth = nativeWindowChrome && markdownFilesOpen ? markdownFilesWidth : 0;
  const titlebarSidebarWidthTransitionClassName = markdownFilesResizing
    ? "transition-none"
    : "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
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
    return (
      <WindowsNativeTitleBar
        aiAgentOpen={aiAgentOpen}
        aiAgentResizing={aiAgentResizing}
        aiAgentWidth={aiAgentWidth}
        dirty={dirty}
        documentKind={documentKind}
        documentName={documentName}
        historyDisabled={historyDisabled}
        label={label}
        markdownFilesOpen={markdownFilesOpen}
        markdownFilesResizing={markdownFilesResizing}
        markdownFilesWidth={markdownFilesWidth}
        menuHandlers={menuHandlers}
        syncNowShortcut={syncNowShortcut}
        nativeWindowChrome={nativeWindowChrome}
        markdownFilesButtonVisible={markdownFilesButtonVisible}
        saveDisabled={saveDisabled}
        sourceMode={sourceMode}
        sourceModeDisabled={sourceModeDisabled}
        themeActionLabel={themeActionLabel}
        titlebarSideSlotWidth={titlebarSideSlotWidth}
        titleContent={titleContent}
        workspaceName={workspaceName}
        renderDocumentActions={renderDocumentActions}
        renderTitleContent={renderTitleContent}
        onCreateMarkdownFile={onCreateMarkdownFile}
        onExitApp={onExitApp}
        onOpenMarkdown={onOpenMarkdown}
        onOpenMarkdownFolder={onOpenMarkdownFolder}
        onOpenSettings={onOpenSettings}
        onSaveMarkdown={onSaveMarkdown}
        onShowAbout={onShowAbout}
        onShowDocumentHistory={onShowDocumentHistory}
        onToggleAiAgent={onToggleAiAgent}
        onToggleMarkdownFiles={onToggleMarkdownFiles}
        onToggleSourceMode={onToggleSourceMode}
        onToggleTheme={onToggleTheme}
        onToggleWindowMaximized={onToggleWindowMaximized}
      />
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
        {markdownFilesButtonVisible ? (
          <IconButton
            className={dimTitlebarIconButtonClassName}
            label={label("app.toggleMarkdownFiles")}
            pressed={markdownFilesOpen}
            onClick={onToggleMarkdownFiles}
          >
            <MarkdownFilesIcon aria-hidden="true" size={15} />
          </IconButton>
        ) : null}
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
          <span className="min-w-0 truncate leading-5" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
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
