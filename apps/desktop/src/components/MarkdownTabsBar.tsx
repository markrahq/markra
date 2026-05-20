import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Columns2, FileText, ImageIcon, Pencil, Plus, X } from "lucide-react";
import { Button, IconButton, PopoverSurface } from "@markra/ui";
import { t, type AppLanguage } from "@markra/shared";
import type { MarkdownDocumentTab } from "../hooks/useMarkdownDocument";

export type MarkdownTabsBarDocumentItem = Pick<MarkdownDocumentTab, "dirty" | "id" | "name"> & {
  displayKind?: "image" | "markdown";
  path?: string | null;
};

export type MarkdownTabsBarItem = MarkdownTabsBarDocumentItem | MarkdownTabsBarDocumentItem[];

type MarkdownTabsBarProps = {
  activeTabId: string | null;
  items: MarkdownTabsBarItem[];
  language?: AppLanguage;
  placement?: "editor" | "titlebar";
  onCloseTab: (tabId: string) => unknown;
  onNewTab: () => unknown;
  onOpenTabToSide?: (tabId: string) => unknown;
  onRenameTab?: (tab: MarkdownTabsBarDocumentItem, name: string) => unknown;
  onSelectTab: (tabId: string) => unknown;
};

type TabContextMenuState = {
  tabId: string;
  x: number;
  y: number;
};

export function MarkdownTabsBar({
  activeTabId,
  items,
  language = "en",
  placement = "editor",
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);

  useEffect(() => {
    if (!renameInputRef.current) return;

    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renamingTabId]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const tabItemGroups = items.map((item) => Array.isArray(item) ? item : [item]);
  const documentItems = tabItemGroups.flatMap((item) => item);
  const sideGroupedTabIds = new Set(
    items.flatMap((item) => Array.isArray(item) ? item.slice(1).map((tab) => tab.id) : [])
  );

  if (documentItems.length === 0) return null;

  const titlebarPlacement = placement === "titlebar";
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
  const contextMenuTabCanOpenToSide =
    Boolean(onOpenTabToSide) &&
    Boolean(contextMenuTab?.path) &&
    contextMenuTab?.displayKind !== "image" &&
    contextMenuTab?.id !== activeTabId &&
    !sideGroupedTabIds.has(contextMenuTab?.id ?? "");
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
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onSelectTab(selectTabId)}
        onDoubleClick={() => startRenamingTab(tab)}
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

    return (
      <div
        className={`group/tab grid h-7 max-w-52 min-w-28 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border transition-colors duration-150 ease-out ${
          titlebarPlacement ? "" : "mb-1"
        } ${
          active
            ? "border-(--border-default) bg-(--bg-active) text-(--text-heading)"
            : "border-transparent bg-transparent text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
        }`}
        key={tab.id}
        onContextMenu={(event) => openTabContextMenu(event, tab)}
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
        className={`document-tabs-side-by-side-group flex h-7 max-w-[30rem] min-w-60 overflow-hidden rounded-md border border-(--border-default) bg-(--bg-active) text-(--text-heading) ${
          titlebarPlacement ? "" : "mb-1"
        }`}
        key={`group-${index}-${group.map((tab) => tab.id).join(":")}`}
      >
        {group.map((tab, tabIndex) => {
          const active = tab.id === activeTabId;

          return (
            <div
              className={`group/tab grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center transition-colors duration-150 ease-out ${
                tabIndex > 0 ? "border-l border-(--border-default)" : ""
              } ${active ? "bg-(--bg-active)" : "bg-transparent"}`}
              key={tab.id}
              onContextMenu={(event) => openTabContextMenu(event, tab)}
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
      data-tauri-drag-region={titlebarPlacement ? "true" : undefined}
      className={
        titlebarPlacement
          ? "document-tabs document-tabs-titlebar h-10 min-w-0 w-full bg-transparent"
          : "document-tabs absolute inset-x-0 top-10 z-7 h-9 border-b border-(--border-default) bg-(--bg-primary)"
      }
      aria-label={label("app.documentTabs")}
    >
      <div
        className={`flex h-full min-w-0 gap-1 overflow-x-auto text-[12px] leading-5 font-[560] text-(--text-secondary) ${
          titlebarPlacement ? "items-center px-1.5" : "items-end px-3"
        }`}
        role="tablist"
        aria-label={label("app.documentTabs")}
      >
        {items.map((item, index) => Array.isArray(item) ? renderDocumentTabGroup(item, index) : renderDocumentTab(item))}
        <IconButton
          className={`${titlebarPlacement ? "" : "mb-1"} rounded-md opacity-70 hover:opacity-100 focus-visible:opacity-100`}
          label={label("app.newDocumentTab")}
          size="icon-xs"
          onClick={onNewTab}
        >
          <Plus aria-hidden="true" size={13} />
        </IconButton>
        {titlebarPlacement ? (
          <span
            aria-hidden="true"
            className="document-tabs-drag-spacer min-w-4 flex-1 self-stretch"
            data-tauri-drag-region="true"
          />
        ) : null}
      </div>
      {contextMenu && contextMenuTab ? (
        <div
          ref={contextMenuRef}
          className="fixed z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          <PopoverSurface
            className="grid w-52 gap-1 rounded-lg p-1 text-[12px] leading-5 font-[560]"
            open
            role="menu"
            aria-label={contextMenuTab.name || "Untitled.md"}
            onContextMenu={(event) => event.preventDefault()}
          >
            {onRenameTab && contextMenuTab.path ? (
              <Button
                className="w-full justify-start rounded-md text-left"
                size="sm"
                variant="ghost"
                role="menuitem"
                onClick={() => runTabContextMenuAction(() => startRenamingTab(contextMenuTab))}
              >
                <Pencil aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
                <span className="truncate">{label("app.renameMarkdownFile")}</span>
              </Button>
            ) : null}
            {onOpenTabToSide && contextMenuTab.path && contextMenuTab.displayKind !== "image" ? (
              <Button
                className="w-full justify-start rounded-md text-left"
                disabled={!contextMenuTabCanOpenToSide}
                size="sm"
                variant="ghost"
                role="menuitem"
                onClick={() => runTabContextMenuAction(() => onOpenTabToSide(contextMenuTab.id))}
              >
                <Columns2 aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
                <span className="truncate">{label("app.openDocumentToSide")}</span>
              </Button>
            ) : null}
            <Button
              className="w-full justify-start rounded-md text-left"
              size="sm"
              variant="ghost"
              role="menuitem"
              onClick={() => runTabContextMenuAction(() => closeTabs([contextMenuTab.id]))}
            >
              <X aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
              <span className="truncate">{label("app.closeDocumentTab")}</span>
            </Button>
            <Button
              className="w-full justify-start rounded-md text-left"
              disabled={contextMenuOtherTabIds.length === 0}
              size="sm"
              variant="ghost"
              role="menuitem"
              onClick={() => runTabContextMenuAction(() => closeTabs(contextMenuOtherTabIds))}
            >
              <X aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
              <span className="truncate">{label("app.closeOtherDocumentTabs")}</span>
            </Button>
            <Button
              className="w-full justify-start rounded-md text-left"
              disabled={contextMenuRightTabIds.length === 0}
              size="sm"
              variant="ghost"
              role="menuitem"
              onClick={() => runTabContextMenuAction(() => closeTabs(contextMenuRightTabIds))}
            >
              <X aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
              <span className="truncate">{label("app.closeDocumentTabsToRight")}</span>
            </Button>
          </PopoverSurface>
        </div>
      ) : null}
    </section>
  );
}
