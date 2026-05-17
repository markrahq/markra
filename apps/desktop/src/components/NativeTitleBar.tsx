import {
  Bot,
  Code2,
  Eye,
  FileText,
  FolderOpen,
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
import { resolveDesktopPlatform, type DesktopPlatform } from "../lib/platform";
import { t, type AppLanguage } from "@markra/shared";
import { MacWindowControls } from "./MacWindowControls";
import {
  SortableTitlebarAction,
  type SortableTitlebarActionRenderProps
} from "./SortableTitlebarAction";

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
  platform?: DesktopPlatform;
  quickCreateMarkdownFileVisible?: boolean;
  saveDisabled?: boolean;
  splitMode?: boolean;
  sourceMode?: boolean;
  sourceModeDisabled?: boolean;
  theme: ResolvedAppTheme;
  titlebarActions?: readonly TitlebarActionPreference[];
  titleContent?: ReactNode;
  onCreateMarkdownFile?: () => unknown;
  onOpenMarkdown: () => unknown;
  onOpenMarkdownFolder?: () => unknown;
  onSaveMarkdown: () => unknown;
  onTitlebarActionsChange?: (actions: TitlebarActionPreference[]) => unknown;
  onToggleAiAgent: () => unknown;
  onToggleMarkdownFiles: () => unknown;
  onToggleSplitMode?: () => unknown;
  onToggleSourceMode?: () => unknown;
  onToggleTheme: () => unknown;
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
  platform = resolveDesktopPlatform(),
  quickCreateMarkdownFileVisible = false,
  saveDisabled = false,
  splitMode = false,
  sourceMode = false,
  sourceModeDisabled = false,
  theme,
  titlebarActions,
  titleContent,
  onCreateMarkdownFile,
  onOpenMarkdown,
  onOpenMarkdownFolder,
  onSaveMarkdown,
  onTitlebarActionsChange,
  onToggleAiAgent,
  onToggleMarkdownFiles,
  onToggleSplitMode,
  onToggleSourceMode,
  onToggleTheme
}: NativeTitleBarProps) {
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const draggingActionIdRef = useRef<TitlebarActionId | null>(null);
  const suppressActionClickIdsRef = useRef(new Set<TitlebarActionId>());
  const [openMenuVisible, setOpenMenuVisible] = useState(false);
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const themeActionLabel = theme === "dark" ? label("app.switchToLightTheme") : label("app.switchToDarkTheme");
  const openChoiceMenuAvailable = Boolean(onOpenMarkdownFolder) && platform !== "macos";
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
  const titlebarSurfaceStyle: CSSProperties | undefined = markdownFilesOpen
    ? {
      background: `linear-gradient(to right, var(--bg-secondary) 0 ${markdownFilesWidth}px, var(--bg-primary) ${markdownFilesWidth}px 100%)`
    }
    : undefined;
  const titlebarGridStyle: CSSProperties = {
    ...(titlebarSurfaceStyle ?? {}),
    gridTemplateColumns: `${titlebarSideSlotWidth}px minmax(0,1fr) ${titlebarSideSlotWidth}px`
  };

  const renderTitleContent = (className: string, style?: CSSProperties) => (
    <div className={className} style={style} data-tauri-drag-region>
      {titleContent}
    </div>
  );
  const renderMarkdownFilesDivider = () => markdownFilesOpen ? (
    <span
      aria-hidden="true"
      className="native-titlebar-sidebar-divider pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-(--border-default)"
      style={{ left: Math.max(0, markdownFilesWidth - 1) }}
    />
  ) : null;

  if (platform === "windows") {
    if (titleContent) {
      const windowsTitlebarStyle: CSSProperties = {
        ...(markdownFilesOpen ? { left: markdownFilesWidth + 1 } : {}),
        gridTemplateColumns: `minmax(0,1fr) ${titlebarSideSlotWidth}px`
      };

      return (
        <header
          className={`native-titlebar group/titlebar fixed inset-x-0 top-0 z-10 grid h-10 grid-cols-[minmax(0,1fr)_164px] select-none items-center ${titlebarSurfaceClassName} [-webkit-user-select:none]`}
          style={windowsTitlebarStyle}
          aria-label={label("app.windowDragRegion")}
        >
          {renderTitleContent("native-title-slot min-w-0 h-10 pr-3 pl-4")}
          <div className="relative z-10 flex h-10 items-center justify-end gap-0.5 pr-3.5 text-(--text-secondary) opacity-40 transition-[opacity,background-color,color] duration-150 ease-out hover:opacity-100 focus-within:opacity-100">
            {renderFixedOpenAction("")}
            {renderDocumentActions("document-actions relative flex h-10 items-center justify-end gap-0.5")}
          </div>
        </header>
      );
    }

    return (
      <header
        className="native-titlebar fixed top-0 right-3.5 z-10 flex h-10 w-auto select-none items-center justify-end [-webkit-user-select:none]"
        aria-label={label("app.windowDragRegion")}
      >
        <div className="flex h-10 items-center justify-end gap-0.5 text-(--text-secondary) opacity-40 transition-[opacity,background-color,color] duration-150 ease-out hover:opacity-100 focus-within:opacity-100">
          {renderFixedOpenAction("")}
          {renderDocumentActions("document-actions relative flex h-10 items-center justify-end gap-0.5")}
        </div>
      </header>
    );
  }

  const editorLeftInset = markdownFilesOpen ? markdownFilesWidth : 0;
  const editorRightInset = aiAgentOpen ? aiAgentWidth : 0;
  const titleOffset = (editorLeftInset - editorRightInset) / 2;
  const titleTransform = titleOffset === 0 ? undefined : `translateX(${titleOffset}px)`;
  const titleContentSlotStyle: CSSProperties = {
    ...(editorLeftInset > titlebarSideSlotWidth ? { marginLeft: editorLeftInset - titlebarSideSlotWidth } : {}),
    ...(editorRightInset > titlebarSideSlotWidth ? { marginRight: editorRightInset - titlebarSideSlotWidth } : {})
  };
  const titleSlotStyle: CSSProperties = {
    transform: titleTransform,
    ...(titleOffset > 0 ? { marginRight: titleOffset } : {}),
    ...(titleOffset < 0 ? { marginLeft: -titleOffset } : {})
  };
  const titleResizing = aiAgentResizing || markdownFilesResizing;
  const showQuickCreateMarkdownFile =
    quickCreateMarkdownFileVisible && !markdownFilesOpen && !titleContent && onCreateMarkdownFile;
  const TitleIcon = documentKind === "folder" ? FolderOpen : documentKind === "image" ? ImageIcon : FileText;
  const MarkdownFilesIcon = markdownFilesOpen ? PanelLeft : PanelRight;
  const showMacWindowControls = platform === "macos";
  const titlebarLeftPaddingClassName = showMacWindowControls ? "pl-0" : "pl-2";

  return (
    <header
      className={`native-titlebar group/titlebar fixed inset-x-0 top-0 z-8 grid h-10 grid-cols-[164px_minmax(0,1fr)_164px] select-none items-center ${titlebarSurfaceClassName} [-webkit-user-select:none]`}
      style={titlebarGridStyle}
      aria-label={label("app.windowDragRegion")}
      data-tauri-drag-region
    >
      {renderMarkdownFilesDivider()}
      <div
        className={`titlebar-spacer relative z-20 flex h-10 items-center gap-1 ${titlebarLeftPaddingClassName}`}
        data-tauri-drag-region
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
          data-tauri-drag-region
          style={{ transform: titleTransform }}
        >
          <TitleIcon aria-hidden="true" size={15} />
          <span className="min-w-0 truncate" data-tauri-drag-region>
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
