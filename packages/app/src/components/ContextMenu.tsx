import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { ChevronRight } from "lucide-react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { popoverPosition } from "@markra/shared";

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator | ContextMenuSubmenu;

export type ContextMenuItem = {
  accelerator?: string;
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  kind: "item";
  label: string;
  onSelect?: () => unknown | Promise<unknown>;
};

export type ContextMenuSeparator = {
  kind: "separator";
};

export type ContextMenuSubmenu = {
  disabled?: boolean;
  entries: ContextMenuEntry[];
  id: string;
  kind: "submenu";
  label: string;
};

export type ContextMenuPosition = {
  x: number;
  y: number;
};

export type ContextMenuProps = {
  ariaLabel?: string;
  entries: ContextMenuEntry[];
  onClose: () => unknown;
  position: ContextMenuPosition;
};

export type ShowContextMenuOptions = {
  ariaLabel?: string;
  entries: ContextMenuEntry[];
  position: ContextMenuPosition;
};

const contextMenuRootAttribute = "data-markra-context-menu-root";
const contextMenuAttribute = "data-markra-context-menu";
const legacyWebContextMenuAttribute = "data-markra-web-context-menu";
const defaultContextMenuWidth = 216;
const defaultContextMenuHeight = 320;
const contextMenuViewportMargin = 8;
const contextSubmenuWidth = 216;
const contextSubmenuGap = 8;
const contextSubmenuPreferredTop = -4;
const contextMenuRowHeight = 28;
const contextMenuSeparatorHeight = 9;
const contextMenuPaddingHeight = 8;

let activeContextMenuCleanup: (() => unknown) | null = null;

export function contextMenuItem(
  id: string,
  label: string,
  accelerator: string | undefined,
  onSelect: (() => unknown | Promise<unknown>) | undefined,
  disabled = !onSelect
): ContextMenuItem {
  return {
    accelerator,
    disabled,
    id,
    kind: "item",
    label,
    onSelect
  };
}

export function contextMenuSeparator(): ContextMenuSeparator {
  return {
    kind: "separator"
  };
}

export function contextMenuSubmenu(id: string, label: string, entries: ContextMenuEntry[]): ContextMenuSubmenu {
  const collapsedEntries = collapseContextMenuEntries(entries);

  return {
    disabled: !collapsedEntries.some((entry) => {
      if (entry.kind === "item") return !entry.disabled;
      if (entry.kind === "submenu") return !entry.disabled;

      return false;
    }),
    entries: collapsedEntries,
    id,
    kind: "submenu",
    label
  };
}

export function collapseContextMenuEntries(entries: ContextMenuEntry[]) {
  const collapsed: ContextMenuEntry[] = [];

  entries.forEach((entry) => {
    if (entry.kind === "separator" && (collapsed.length === 0 || collapsed.at(-1)?.kind === "separator")) return;
    if (entry.kind === "submenu") {
      const submenu = contextMenuSubmenu(entry.id, entry.label, entry.entries);
      if (submenu.entries.length === 0) return;

      collapsed.push(submenu);
      return;
    }

    collapsed.push(entry);
  });

  if (collapsed.at(-1)?.kind === "separator") {
    collapsed.pop();
  }

  return collapsed;
}

export function contextMenuPositionFromEvent(event: MouseEvent): ContextMenuPosition {
  return {
    x: event.clientX,
    y: event.clientY
  };
}

export function currentContextMenuPosition(documentTarget: Document): ContextMenuPosition {
  const currentEvent = (documentTarget.defaultView as (Window & { event?: Event }) | null)?.event;
  if (currentEvent instanceof MouseEvent) return contextMenuPositionFromEvent(currentEvent);

  return {
    x: contextMenuViewportMargin,
    y: contextMenuViewportMargin
  };
}

export function showContextMenu(documentTarget: Document, options: ShowContextMenuOptions) {
  closeActiveContextMenu();

  const container = documentTarget.createElement("div");
  container.setAttribute(contextMenuRootAttribute, "true");
  documentTarget.body.append(container);

  const root = createRoot(container);
  let closed = false;
  const closeMenu = () => {
    if (closed) return;

    closed = true;
    if (activeContextMenuCleanup === closeMenu) activeContextMenuCleanup = null;
    root.unmount();
    container.remove();
  };

  activeContextMenuCleanup = closeMenu;
  flushSync(() => {
    root.render(
      <ContextMenu
        ariaLabel={options.ariaLabel}
        entries={options.entries}
        position={options.position}
        onClose={closeMenu}
      />
    );
  });

  return closeMenu;
}

export function closeActiveContextMenu() {
  activeContextMenuCleanup?.();
  activeContextMenuCleanup = null;
}

function estimateContextMenuEntriesHeight(entries: ContextMenuEntry[]) {
  return entries.reduce((height, entry) => {
    if (entry.kind === "separator") return height + contextMenuSeparatorHeight;

    return height + contextMenuRowHeight;
  }, contextMenuPaddingHeight);
}

function contextSubmenuTop(anchorTop: number, submenuHeight: number, viewportHeight: number) {
  const minTop = contextMenuViewportMargin - anchorTop;
  const maxTop = viewportHeight - contextMenuViewportMargin - submenuHeight - anchorTop;
  if (maxTop < minTop) return minTop;

  return Math.max(minTop, Math.min(contextSubmenuPreferredTop, maxTop));
}

function contextSubmenuHorizontalStyle(submenuAlignLeft: boolean): CSSProperties {
  const offset = `calc(100% + ${contextSubmenuGap}px)`;

  return submenuAlignLeft ? { right: offset } : { left: offset };
}

function contextSubmenuBridgeStyle(submenuAlignLeft: boolean): CSSProperties {
  return {
    ...(submenuAlignLeft ? { right: "100%" } : { left: "100%" }),
    width: `${contextSubmenuGap}px`
  };
}

export function ContextMenu({ ariaLabel, entries, onClose, position }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    left: position.x,
    top: position.y
  });
  const [submenuAlignLeft, setSubmenuAlignLeft] = useState(false);
  const collapsedEntries = collapseContextMenuEntries(entries);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const documentTarget = menu.ownerDocument;
    const windowTarget = documentTarget.defaultView;
    const viewportWidth = windowTarget?.innerWidth ?? 1024;
    const viewportHeight = windowTarget?.innerHeight ?? 768;
    const width = menu.offsetWidth || defaultContextMenuWidth;
    const height = menu.offsetHeight || defaultContextMenuHeight;
    const positioned = popoverPosition(
      {
        bottom: position.y,
        left: position.x,
        right: position.x,
        top: position.y
      },
      {
        height,
        width
      },
      {
        height: viewportHeight,
        width: viewportWidth
      },
      {
        gap: 0,
        margin: contextMenuViewportMargin
      }
    );

    setMenuStyle({
      left: positioned.left,
      maxHeight: positioned.maxHeight,
      overflowY: "auto",
      top: positioned.top
    });
    setSubmenuAlignLeft(positioned.left + width + contextSubmenuWidth > viewportWidth - contextMenuViewportMargin);
  }, [position.x, position.y]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const documentTarget = menu.ownerDocument;
    const windowTarget = documentTarget.defaultView;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menu.contains(target)) return;

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onClose();
    };

    documentTarget.addEventListener("pointerdown", handlePointerDown, true);
    documentTarget.addEventListener("keydown", handleKeyDown, true);
    windowTarget?.addEventListener("resize", onClose);
    windowTarget?.addEventListener("scroll", onClose, true);

    return () => {
      documentTarget.removeEventListener("pointerdown", handlePointerDown, true);
      documentTarget.removeEventListener("keydown", handleKeyDown, true);
      windowTarget?.removeEventListener("resize", onClose);
      windowTarget?.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[2147483647] min-w-[216px] max-w-[min(280px,calc(100vw-16px))] rounded-lg border border-(--border-default) bg-(--bg-primary) p-1 text-[13px] leading-5 font-[520] text-(--text-primary) shadow-[0_14px_36px_color-mix(in_srgb,var(--text-heading)_16%,transparent)] outline-none select-none"
      role="menu"
      tabIndex={-1}
      aria-label={ariaLabel}
      style={menuStyle}
      {...{
        [contextMenuAttribute]: "true",
        [legacyWebContextMenuAttribute]: "true"
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ContextMenuEntries entries={collapsedEntries} submenuAlignLeft={submenuAlignLeft} onClose={onClose} />
    </div>
  );
}

type ContextMenuEntriesProps = {
  entries: ContextMenuEntry[];
  onClose: () => unknown;
  submenuAlignLeft: boolean;
};

function ContextMenuEntries({ entries, onClose, submenuAlignLeft }: ContextMenuEntriesProps) {
  return entries.map((entry, index) => {
    if (entry.kind === "separator") {
      return (
        <div
          className="my-1 h-px bg-(--border-default)"
          key={`separator-${index}`}
          role="separator"
        />
      );
    }

    if (entry.kind === "submenu") {
      return (
        <ContextSubmenu
          entry={entry}
          key={entry.id}
          submenuAlignLeft={submenuAlignLeft}
          onClose={onClose}
        />
      );
    }

    return (
      <ContextMenuButton
        entry={entry}
        key={entry.id}
        onClose={onClose}
      />
    );
  });
}

type ContextMenuButtonProps = {
  entry: ContextMenuItem;
  onClose: () => unknown;
};

function ContextMenuButton({ entry, onClose }: ContextMenuButtonProps) {
  const disabled = Boolean(entry.disabled);

  return (
    <button
      className="flex h-7 w-full items-center justify-between gap-4 rounded-md border-0 bg-transparent px-2 text-left font-inherit text-(--text-primary) outline-none transition-[background-color,color,opacity] duration-150 ease-out enabled:cursor-pointer enabled:hover:bg-(--bg-hover) enabled:hover:text-(--text-heading) enabled:focus-visible:bg-(--bg-hover) enabled:focus-visible:text-(--text-heading) disabled:opacity-45"
      data-menu-item-id={entry.id}
      disabled={disabled}
      role="menuitem"
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        if (disabled) return;

        Promise.resolve(entry.onSelect?.()).catch(() => {});
        onClose();
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {entry.icon ? <span className="shrink-0 text-(--text-secondary)">{entry.icon}</span> : null}
        <span className="min-w-0 truncate">{entry.label}</span>
      </span>
      {entry.accelerator ? (
        <span className="shrink-0 text-[12px] font-[520] text-(--text-secondary)">
          {formatAccelerator(entry.accelerator)}
        </span>
      ) : null}
    </button>
  );
}

type ContextSubmenuProps = {
  entry: ContextMenuSubmenu;
  onClose: () => unknown;
  submenuAlignLeft: boolean;
};

function ContextSubmenu({ entry, onClose, submenuAlignLeft }: ContextSubmenuProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [submenuTop, setSubmenuTop] = useState(contextSubmenuPreferredTop);
  const disabled = Boolean(entry.disabled);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const submenu = submenuRef.current;
    if (!button || !submenu) return;

    const windowTarget = button.ownerDocument.defaultView;
    const viewportHeight = windowTarget?.innerHeight ?? 768;
    const submenuHeight = submenu.offsetHeight || estimateContextMenuEntriesHeight(entry.entries);

    setSubmenuTop(contextSubmenuTop(
      button.getBoundingClientRect().top,
      submenuHeight,
      viewportHeight
    ));
  }, [entry.entries]);

  return (
    <div className="group/context-menu-submenu relative">
      <button
        ref={buttonRef}
        className="flex h-7 w-full items-center justify-between gap-4 rounded-md border-0 bg-transparent px-2 text-left font-inherit text-(--text-primary) outline-none transition-[background-color,color,opacity] duration-150 ease-out enabled:cursor-pointer enabled:hover:bg-(--bg-hover) enabled:hover:text-(--text-heading) enabled:focus-visible:bg-(--bg-hover) enabled:focus-visible:text-(--text-heading) disabled:opacity-45"
        aria-haspopup="menu"
        data-menu-item-id={entry.id}
        disabled={disabled}
        role="menuitem"
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
        }}
      >
        <span className="min-w-0 truncate">{entry.label}</span>
        <ChevronRight
          aria-hidden="true"
          className="shrink-0 text-(--text-secondary)"
          size={14}
          strokeWidth={2.25}
        />
      </button>
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0"
        data-menu-submenu-bridge-id={entry.id}
        style={contextSubmenuBridgeStyle(submenuAlignLeft)}
      />
      <div
        ref={submenuRef}
        className="invisible pointer-events-none absolute max-h-[calc(100vh-16px)] min-w-[216px] max-w-[min(280px,calc(100vw-16px))] overflow-y-auto rounded-lg border border-(--border-default) bg-(--bg-primary) p-1 text-[13px] leading-5 font-[520] text-(--text-primary) opacity-0 shadow-[0_14px_36px_color-mix(in_srgb,var(--text-heading)_16%,transparent)] outline-none group-hover/context-menu-submenu:visible group-hover/context-menu-submenu:pointer-events-auto group-hover/context-menu-submenu:opacity-100 group-focus-within/context-menu-submenu:visible group-focus-within/context-menu-submenu:pointer-events-auto group-focus-within/context-menu-submenu:opacity-100"
        data-menu-submenu-id={entry.id}
        role="menu"
        style={{
          top: submenuTop,
          ...contextSubmenuHorizontalStyle(submenuAlignLeft)
        }}
      >
        <ContextMenuEntries entries={entry.entries} submenuAlignLeft={submenuAlignLeft} onClose={onClose} />
      </div>
    </div>
  );
}

function formatAccelerator(accelerator: string) {
  return accelerator.replace(/CmdOrCtrl/gu, "Cmd/Ctrl");
}
