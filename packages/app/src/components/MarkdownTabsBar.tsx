import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { Columns2, FileText, ImageIcon, Pencil, Plus, X } from "lucide-react";
import { IconButton } from "@markra/ui";
import { t, type AppLanguage } from "@markra/shared";
import type { MarkdownDocumentTab } from "../hooks/useMarkdownDocument";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

export type MarkdownTabsBarDocumentItem = Pick<MarkdownDocumentTab, "dirty" | "id" | "name"> & {
  displayKind?: "image" | "markdown";
  path?: string | null;
};

export type MarkdownTabsBarItem = MarkdownTabsBarDocumentItem | MarkdownTabsBarDocumentItem[];

type MarkdownTabsBarProps = {
  activeTabId: string | null;
  items: MarkdownTabsBarItem[];
  language?: AppLanguage;
  nativeDragRegionEnabled?: boolean;
  placement?: "editor" | "titlebar";
  onCancelSideBySide?: (tabId: string) => unknown;
  onCloseTab: (tabId: string) => unknown;
  onNewTab: () => unknown;
  onOpenTabToSide?: (tabId: string, primaryTabId?: string) => unknown;
  onRenameTab?: (tab: MarkdownTabsBarDocumentItem, name: string) => unknown;
  onSelectTab: (tabId: string) => unknown;
};

type TabContextMenuState = {
  tabId: string;
  x: number;
  y: number;
};

type PointerTabDragState = {
  dragging: boolean;
  startX: number;
  startY: number;
  tabId: string;
};

type PointerTabDragPreview = {
  tabId: string;
  x: number;
  y: number;
};

export const markdownTabDragDataType = "application/x-markra-document-tab";
const pointerTabDragThresholdPx = 6;
const pointerTabDragPreviewOffsetPx = 12;

export function MarkdownTabsBar({
  activeTabId,
  items,
  language = "en",
  nativeDragRegionEnabled = true,
  placement = "editor",
  onCancelSideBySide,
  onCloseTab,
  onNewTab,
  onOpenTabToSide,
  onRenameTab,
  onSelectTab
}: MarkdownTabsBarProps) {
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCancelledRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [pointerTabDragPreview, setPointerTabDragPreview] = useState<PointerTabDragPreview | null>(null);
  const pointerTabDragRef = useRef<PointerTabDragState | null>(null);
  const pointerDragCleanupRef = useRef<(() => unknown) | null>(null);
  const pointerEditorDropTargetRef = useRef<HTMLElement | null>(null);
  const suppressClickTabIdRef = useRef<string | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  const setPageDocumentTabDragging = () => {
    document.documentElement.setAttribute("data-document-tab-dragging", "true");
  };
  const clearPageDocumentTabDragging = () => {
    document.documentElement.removeAttribute("data-document-tab-dragging");
  };

  useEffect(() => {
    if (!renameInputRef.current) return;

    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renamingTabId]);

  useEffect(() => () => {
    pointerDragCleanupRef.current?.();
    pointerDragCleanupRef.current = null;
    clearPageDocumentTabDragging();
  }, []);

  const tabItemGroups = items.map((item) => Array.isArray(item) ? item : [item]);
  const documentItems = tabItemGroups.flatMap((item) => item);
  const documentTabIdsKey = documentItems.map((tab) => tab.id).join("\n");
  const sideGroupedTabIds = new Set(
    items.flatMap((item) => Array.isArray(item) ? item.slice(1).map((tab) => tab.id) : [])
  );

  useEffect(() => {
    if (!activeTabId) return;

    const activeTabElement = Array.from(
      tabListRef.current?.querySelectorAll<HTMLElement>("[data-document-tab-id]") ?? []
    ).find((element) => element.dataset.documentTabId === activeTabId);

    activeTabElement?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest"
    });
  }, [activeTabId, documentTabIdsKey]);

  if (documentItems.length === 0) return null;

  const titlebarPlacement = placement === "titlebar";
  const pointerTabDragPreviewTab = pointerTabDragPreview
    ? documentItems.find((tab) => tab.id === pointerTabDragPreview.tabId) ?? null
    : null;
  const PointerTabDragPreviewIcon = pointerTabDragPreviewTab?.displayKind === "image" ? ImageIcon : FileText;
  const contextMenuTab = contextMenu ? documentItems.find((tab) => tab.id === contextMenu.tabId) ?? null : null;
  const contextMenuTabItemIndex = contextMenuTab
    ? tabItemGroups.findIndex((item) => item.some((tab) => tab.id === contextMenuTab.id))
    : -1;
  const contextMenuOtherTabIds = contextMenuTab
    ? tabItemGroups
      .filter((_, index) => index !== contextMenuTabItemIndex)
      .flatMap((item) => item.map((tab) => tab.id))
    : [];
  const contextMenuRightTabIds = contextMenuTabItemIndex >= 0
    ? tabItemGroups.slice(contextMenuTabItemIndex + 1).flatMap((item) => item.map((tab) => tab.id))
    : [];
  const contextMenuTabIsSideBySide = contextMenuTab
    ? tabItemGroups.some((item) => item.length > 1 && item.some((tab) => tab.id === contextMenuTab.id))
    : false;
  const tabCanParticipateInSideBySide = (tab: MarkdownTabsBarDocumentItem | null | undefined) =>
    Boolean(onOpenTabToSide) &&
    Boolean(tab?.path) &&
    tab?.displayKind !== "image";
  const tabCanOpenToSideFromMenu = (tab: MarkdownTabsBarDocumentItem | null | undefined) =>
    tabCanParticipateInSideBySide(tab) &&
    tab?.id !== activeTabId &&
    !sideGroupedTabIds.has(tab?.id ?? "");
  const tabCanDragToSide = (tab: MarkdownTabsBarDocumentItem | null | undefined) =>
    tabCanParticipateInSideBySide(tab) && !sideGroupedTabIds.has(tab?.id ?? "");
  const tabCanAcceptSideDrop = (tab: MarkdownTabsBarDocumentItem | null | undefined) =>
    tabCanParticipateInSideBySide(tab) && !sideGroupedTabIds.has(tab?.id ?? "");
  const contextMenuTabCanOpenToSide = tabCanOpenToSideFromMenu(contextMenuTab);
  const tabAcceptsSideDrop = (targetTab: MarkdownTabsBarDocumentItem, draggedTab: MarkdownTabsBarDocumentItem | null) => {
    return draggedTab?.id !== targetTab.id && tabCanDragToSide(draggedTab) && tabCanAcceptSideDrop(targetTab);
  };
  const clearPointerEditorDropTarget = () => {
    if (!pointerEditorDropTargetRef.current) return;

    pointerEditorDropTargetRef.current.removeAttribute("data-document-tab-pointer-drop-target");
    pointerEditorDropTargetRef.current = null;
  };
  const setPointerEditorDropTarget = (target: HTMLElement | null) => {
    if (pointerEditorDropTargetRef.current === target) return;

    clearPointerEditorDropTarget();
    if (!target) return;

    target.setAttribute("data-document-tab-pointer-drop-target", "true");
    pointerEditorDropTargetRef.current = target;
  };
  const hitTestPointerDropTarget = (event: PointerEvent) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const tabTarget = target?.closest<HTMLElement>("[data-document-tab-id]");
    const editorTarget = target?.closest<HTMLElement>("[data-document-tab-editor-drop-target='true']");

    return {
      editorTarget,
      targetTabId: tabTarget?.dataset.documentTabId ?? null
    };
  };
  const updatePointerDropFeedback = (event: PointerEvent, draggedTab: MarkdownTabsBarDocumentItem) => {
    const { editorTarget, targetTabId } = hitTestPointerDropTarget(event);
    const targetTab = targetTabId ? documentItems.find((tab) => tab.id === targetTabId) ?? null : null;

    if (targetTab && tabAcceptsSideDrop(targetTab, draggedTab)) {
      setDragOverTabId(targetTab.id);
      setPointerEditorDropTarget(null);
      return;
    }

    if (editorTarget && draggedTab.id !== activeTabId) {
      setDragOverTabId(null);
      setPointerEditorDropTarget(editorTarget);
      return;
    }

    setDragOverTabId(null);
    setPointerEditorDropTarget(null);
  };
  const finishPointerTabDrag = (event: PointerEvent | null, commit: boolean) => {
    const pointerDrag = pointerTabDragRef.current;
    pointerTabDragRef.current = null;
    pointerDragCleanupRef.current?.();
    pointerDragCleanupRef.current = null;
    clearPageDocumentTabDragging();
    clearPointerEditorDropTarget();
    setDraggingTabId(null);
    setDragOverTabId(null);
    setPointerTabDragPreview(null);

    if (!pointerDrag?.dragging) return;

    suppressClickTabIdRef.current = pointerDrag.tabId;
    window.setTimeout(() => {
      if (suppressClickTabIdRef.current === pointerDrag.tabId) suppressClickTabIdRef.current = null;
    }, 0);
    if (!commit || !event) return;

    const draggedTab = documentItems.find((tab) => tab.id === pointerDrag.tabId) ?? null;
    if (!draggedTab || !tabCanDragToSide(draggedTab)) return;

    const { editorTarget, targetTabId } = hitTestPointerDropTarget(event);
    const targetTab = targetTabId ? documentItems.find((tab) => tab.id === targetTabId) ?? null : null;

    if (targetTab && tabAcceptsSideDrop(targetTab, draggedTab)) {
      onOpenTabToSide?.(draggedTab.id, targetTab.id);
      return;
    }

    if (editorTarget && draggedTab.id !== activeTabId) onOpenTabToSide?.(draggedTab.id);
  };
  const handleWindowPointerMove = (event: PointerEvent) => {
    const pointerDrag = pointerTabDragRef.current;
    if (!pointerDrag) return;

    const draggedTab = documentItems.find((tab) => tab.id === pointerDrag.tabId) ?? null;
    if (!draggedTab || !tabCanDragToSide(draggedTab)) return;

    const movedDistance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.dragging && movedDistance < pointerTabDragThresholdPx) return;
    if (!pointerDrag.dragging) {
      pointerTabDragRef.current = {
        ...pointerDrag,
        dragging: true
      };
      setPageDocumentTabDragging();
      setDraggingTabId(pointerDrag.tabId);
    }

    setPointerTabDragPreview({
      tabId: pointerDrag.tabId,
      x: event.clientX,
      y: event.clientY
    });
    event.preventDefault();
    updatePointerDropFeedback(event, draggedTab);
  };
  const handleWindowPointerUp = (event: PointerEvent) => {
    finishPointerTabDrag(event, true);
  };
  const handleWindowPointerCancel = (event: PointerEvent) => {
    finishPointerTabDrag(event, false);
  };
  const handleWindowBlur = () => {
    finishPointerTabDrag(null, false);
  };
  const handleTabPointerDown = (event: ReactPointerEvent, tab: MarkdownTabsBarDocumentItem) => {
    if (event.button !== 0 || !tabCanDragToSide(tab)) return;

    pointerDragCleanupRef.current?.();
    clearPageDocumentTabDragging();
    pointerTabDragRef.current = {
      dragging: false,
      startX: event.clientX,
      startY: event.clientY,
      tabId: tab.id
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    pointerDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  };
  const startRenamingTab = (tab: MarkdownTabsBarDocumentItem) => {
    if (!tab.path || !onRenameTab) return;

    renameCancelledRef.current = false;
    setRenamingTabId(tab.id);
    setRenameFileName(tab.name || "Untitled.md");
  };
  const cancelRenamingTab = () => {
    renameCancelledRef.current = true;
    setRenamingTabId(null);
    setRenameFileName("");
  };
  const commitRenamingTab = (tab: MarkdownTabsBarDocumentItem, value = renameFileName) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }

    const normalizedName = value.trim();
    setRenamingTabId(null);
    setRenameFileName("");
    if (!normalizedName || normalizedName === tab.name) return;

    onRenameTab?.(tab, normalizedName);
  };
  const closeTabs = (tabIds: string[]) => {
    let closeSequence: Promise<unknown> = Promise.resolve(null);

    for (const tabId of tabIds) {
      closeSequence = closeSequence.then(() => onCloseTab(tabId));
    }

    closeSequence.catch(() => {});
  };
  const openTabContextMenu = (event: ReactMouseEvent, tab: MarkdownTabsBarDocumentItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      tabId: tab.id,
      x: Math.max(8, event.clientX),
      y: Math.max(8, event.clientY)
    });
  };
  const runTabContextMenuAction = (action: () => unknown) => {
    setContextMenu(null);
    action();
  };
  const contextMenuEntries: ContextMenuEntry[] = contextMenuTab ? [
    ...(onRenameTab && contextMenuTab.path
      ? [
          {
            icon: <Pencil aria-hidden="true" size={14} />,
            id: "markra:tab:rename",
            kind: "item" as const,
            label: label("app.renameMarkdownFile"),
            onSelect: () => runTabContextMenuAction(() => startRenamingTab(contextMenuTab))
          }
        ]
      : []),
    ...(onOpenTabToSide && contextMenuTab.path && contextMenuTab.displayKind !== "image"
      ? [
          {
            disabled: !contextMenuTabCanOpenToSide,
            icon: <Columns2 aria-hidden="true" size={14} />,
            id: "markra:tab:open-to-side",
            kind: "item" as const,
            label: label("app.openDocumentToSide"),
            onSelect: () => runTabContextMenuAction(() => onOpenTabToSide(contextMenuTab.id))
          }
        ]
      : []),
    ...(onCancelSideBySide && contextMenuTabIsSideBySide
      ? [
          {
            icon: <Columns2 aria-hidden="true" size={14} />,
            id: "markra:tab:cancel-side-by-side",
            kind: "item" as const,
            label: label("app.cancelSideBySideDocuments"),
            onSelect: () => runTabContextMenuAction(() => onCancelSideBySide(contextMenuTab.id))
          }
        ]
      : []),
    {
      icon: <X aria-hidden="true" size={14} />,
      id: "markra:tab:close",
      kind: "item",
      label: label("app.closeDocumentTab"),
      onSelect: () => runTabContextMenuAction(() => closeTabs([contextMenuTab.id]))
    },
    {
      disabled: contextMenuOtherTabIds.length === 0,
      icon: <X aria-hidden="true" size={14} />,
      id: "markra:tab:close-other",
      kind: "item",
      label: label("app.closeOtherDocumentTabs"),
      onSelect: () => runTabContextMenuAction(() => closeTabs(contextMenuOtherTabIds))
    },
    {
      disabled: contextMenuRightTabIds.length === 0,
      icon: <X aria-hidden="true" size={14} />,
      id: "markra:tab:close-right",
      kind: "item",
      label: label("app.closeDocumentTabsToRight"),
      onSelect: () => runTabContextMenuAction(() => closeTabs(contextMenuRightTabIds))
    }
  ] : [];
  const handlePreventNativeTabDrag = (event: ReactDragEvent) => {
    event.preventDefault();
  };
  const handleTabsWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const tabList = event.currentTarget;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || event.deltaY === 0) return;

    const maxScrollLeft = tabList.scrollWidth - tabList.clientWidth;
    if (maxScrollLeft <= 0) return;

    const wheelUnitMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? tabList.clientWidth : 1;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, tabList.scrollLeft + event.deltaY * wheelUnitMultiplier));

    if (nextScrollLeft === tabList.scrollLeft) return;

    tabList.scrollLeft = nextScrollLeft;
    event.preventDefault();
  };
  const handleSelectTabClick = (tab: MarkdownTabsBarDocumentItem, selectTabId: string) => {
    if (suppressClickTabIdRef.current === tab.id) {
      suppressClickTabIdRef.current = null;
      return;
    }

    onSelectTab(selectTabId);
  };
  const renderTabButton = (tab: MarkdownTabsBarDocumentItem, active: boolean, selectTabId = tab.id) => {
    const TabIcon = tab.displayKind === "image" ? ImageIcon : FileText;
    const renaming = tab.id === renamingTabId;

    return renaming ? (
      <div className="flex h-full min-w-0 items-center gap-1.5 rounded-l-md px-2">
        <TabIcon aria-hidden="true" className="shrink-0 opacity-65" size={13} />
        <input
          ref={renameInputRef}
          aria-label={label("app.renameMarkdownFile")}
          className="min-w-0 flex-1 rounded-sm border border-(--accent) bg-(--bg-primary) px-1 text-[12px] leading-5 font-[560] text-(--text-heading) outline-none"
          type="text"
          value={renameFileName}
          onBlur={(event) => commitRenamingTab(tab, event.currentTarget.value)}
          onChange={(event) => setRenameFileName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelRenamingTab();
            }
          }}
        />
      </div>
    ) : (
      <button
        className={`flex h-full min-w-0 items-center gap-1.5 rounded-l-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
          active ? "text-(--text-heading)" : "text-(--text-secondary)"
        }`}
        draggable={false}
        type="button"
        role="tab"
        aria-selected={active}
        data-document-tab-id={tab.id}
        onClick={() => handleSelectTabClick(tab, selectTabId)}
        onDoubleClick={() => startRenamingTab(tab)}
        onDragStart={handlePreventNativeTabDrag}
        onPointerDown={(event) => handleTabPointerDown(event, tab)}
      >
        <TabIcon aria-hidden="true" className="shrink-0 opacity-65" size={13} />
        <span className="min-w-0 truncate">{tab.name || "Untitled.md"}</span>
        {tab.dirty ? (
          <span className="size-1.25 shrink-0 rounded-full bg-(--accent)" aria-label={label("app.unsavedChanges")} />
        ) : null}
      </button>
    );
  };
  const renderCloseTabButton = (tab: MarkdownTabsBarDocumentItem, active: boolean, alwaysVisible = false) => (
    <button
      className={`mr-1 flex size-5 items-center justify-center rounded text-(--text-secondary) transition-[opacity,background-color,color] duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
        alwaysVisible ? "opacity-100" : active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
      }`}
      type="button"
      aria-label={`${label("app.closeDocumentTab")} ${tab.name || "Untitled.md"}`}
      onClick={() => closeTabs([tab.id])}
    >
      <X aria-hidden="true" size={12} />
    </button>
  );
  const renderDocumentTab = (tab: MarkdownTabsBarDocumentItem) => {
    const active = tab.id === activeTabId;
    const dragged = tab.id === draggingTabId;
    const sideDropTarget = tab.id === dragOverTabId;

    return (
      <div
        className={`group/tab grid h-7 max-w-52 min-w-28 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border transition-colors duration-150 ease-out ${
          titlebarPlacement ? "" : "mb-1"
        } ${
          sideDropTarget
            ? "border-(--accent) bg-(--bg-active) text-(--text-heading)"
            : active
            ? "border-(--border-default) bg-(--bg-active) text-(--text-heading)"
            : "border-transparent bg-transparent text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
        } ${dragged ? "opacity-60" : ""}`}
        data-document-tab-id={tab.id}
        draggable={false}
        key={tab.id}
        onContextMenu={(event) => openTabContextMenu(event, tab)}
        onDragStart={handlePreventNativeTabDrag}
      >
        {renderTabButton(tab, active)}
        {renderCloseTabButton(tab, active)}
      </div>
    );
  };
  const renderDocumentTabGroup = (group: MarkdownTabsBarDocumentItem[], index: number) => {
    if (group.length === 0) return null;
    const groupPrimaryTabId = group[0]!.id;

    return (
      <div
        className={`document-tabs-side-by-side-group flex h-7 max-w-120 min-w-60 overflow-hidden rounded-md border border-(--border-default) bg-(--bg-active) text-(--text-heading) ${
          titlebarPlacement ? "" : "mb-1"
        }`}
        key={`group-${index}-${group.map((tab) => tab.id).join(":")}`}
      >
        {group.map((tab, tabIndex) => {
          const active = tab.id === activeTabId;
          const dragged = tab.id === draggingTabId;
          const sideDropTarget = tab.id === dragOverTabId;

          return (
            <div
              className={`group/tab grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center transition-colors duration-150 ease-out ${
                tabIndex > 0 ? "border-l border-(--border-default)" : ""
              } ${sideDropTarget || active ? "bg-(--bg-active)" : "bg-transparent"} ${sideDropTarget ? "outline outline-(--accent) -outline-offset-1" : ""} ${dragged ? "opacity-60" : ""}`}
              data-document-tab-id={tab.id}
              draggable={false}
              key={tab.id}
              onContextMenu={(event) => openTabContextMenu(event, tab)}
              onDragStart={handlePreventNativeTabDrag}
            >
              {renderTabButton(tab, active, groupPrimaryTabId)}
              {renderCloseTabButton(tab, active, true)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section
      className={
        titlebarPlacement
          ? "document-tabs document-tabs-titlebar h-10 min-w-0 w-full bg-transparent"
          : "document-tabs absolute inset-x-0 top-10 z-7 h-9 border-b border-(--border-default) bg-(--bg-primary)"
      }
      aria-label={label("app.documentTabs")}
    >
      <div
        className={`document-tabs-row flex h-full min-w-0 gap-1 text-[12px] leading-5 font-[560] text-(--text-secondary) ${
          titlebarPlacement ? "items-center px-1.5" : "items-end px-3"
        }`}
      >
        <div
          ref={tabListRef}
          className={`document-tabs-scroll flex h-full min-w-0 flex-[0_1_auto] gap-1 overflow-x-auto ${
            titlebarPlacement ? "items-center" : "items-end"
          }`}
          role="tablist"
          aria-label={label("app.documentTabs")}
          onWheel={handleTabsWheel}
        >
          {items.map((item, index) => Array.isArray(item) ? renderDocumentTabGroup(item, index) : renderDocumentTab(item))}
        </div>
        <div className="document-tabs-controls flex h-full shrink-0 items-center">
          <IconButton
            className={`${titlebarPlacement ? "" : "mb-1"} rounded-md opacity-70 hover:opacity-100 focus-visible:opacity-100`}
            label={label("app.newDocumentTab")}
            size="icon-xs"
            onClick={onNewTab}
          >
            <Plus aria-hidden="true" size={13} />
          </IconButton>
        </div>
        {titlebarPlacement && nativeDragRegionEnabled ? (
          <span
            aria-hidden="true"
            className="document-tabs-drag-spacer min-w-4 flex-1 self-stretch"
            data-tauri-drag-region="true"
          />
        ) : null}
      </div>
      {pointerTabDragPreview && pointerTabDragPreviewTab ? (
        <div
          aria-hidden="true"
          className="document-tab-drag-preview pointer-events-none fixed top-0 left-0 z-50 flex h-7 max-w-52 min-w-28 items-center gap-1.5 rounded-md border border-(--border-default) bg-(--bg-primary)/96 px-2 text-[12px] leading-5 font-[560] text-(--text-heading) shadow-[0_12px_28px_color-mix(in_srgb,var(--text-heading)_18%,transparent)] backdrop-blur-[2px] will-change-transform"
          style={{
            transform: `translate3d(${pointerTabDragPreview.x + pointerTabDragPreviewOffsetPx}px, ${pointerTabDragPreview.y + pointerTabDragPreviewOffsetPx}px, 0)`
          }}
        >
          <PointerTabDragPreviewIcon aria-hidden="true" className="shrink-0 opacity-65" size={13} />
          <span className="min-w-0 truncate">{pointerTabDragPreviewTab.name || "Untitled.md"}</span>
          {pointerTabDragPreviewTab.dirty ? (
            <span className="size-1.25 shrink-0 rounded-full bg-(--accent)" aria-hidden="true" />
          ) : null}
        </div>
      ) : null}
      {contextMenu && contextMenuTab ? (
        <ContextMenu
          ariaLabel={contextMenuTab.name || "Untitled.md"}
          entries={contextMenuEntries}
          position={{
            x: contextMenu.x,
            y: contextMenu.y
          }}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </section>
  );
}
