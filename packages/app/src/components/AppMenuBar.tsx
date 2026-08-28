import { Menu } from "@base-ui/react/menu";
import { Menubar } from "@base-ui/react/menubar";
import { ChevronRight } from "lucide-react";
import type { ContextMenuEntry, ContextMenuItem, ContextMenuSubmenu } from "./ContextMenu";

export type AppMenuConfig = {
  id: string;
  label: string;
  /** Extra classes for this menu's trigger, e.g. app-name weight or per-menu color. */
  triggerClassName?: string;
};

export type AppMenuBarProps = {
  menus: AppMenuConfig[];
  getEntries: (menuId: string) => ContextMenuEntry[];
  triggerClassName?: string;
};

const positionerClassName = "z-[2147483647]";

const popupClassName =
  "min-w-[216px] max-w-[min(280px,calc(100vw-16px))] rounded-lg border border-(--border-default) bg-(--bg-primary) p-1 text-[13px] leading-5 font-[520] text-(--text-primary) shadow-[0_14px_36px_color-mix(in_srgb,var(--text-heading)_16%,transparent)] outline-none select-none";

const itemClassName =
  "flex h-7 w-full items-center justify-between gap-4 rounded-md border-0 bg-transparent px-2 text-left font-inherit text-(--text-primary) outline-none transition-[background-color,color,opacity] duration-150 ease-out cursor-pointer hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none data-disabled:opacity-45 data-disabled:cursor-default data-disabled:pointer-events-none";

const separatorClassName = "my-1 h-px bg-(--border-default)";

const acceleratorClassName =
  "shrink-0 text-[12px] font-[520] text-(--text-secondary)";

const submenuTriggerClassName =
  "flex h-7 w-full items-center justify-between gap-4 rounded-md border-0 bg-transparent px-2 text-left font-inherit text-(--text-primary) outline-none transition-[background-color,color,opacity] duration-150 ease-out cursor-pointer hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none data-disabled:opacity-45 data-disabled:cursor-default data-disabled:pointer-events-none";

function formatAccelerator(accelerator: string) {
  return accelerator.replace(/CmdOrCtrl/gu, "Cmd/Ctrl");
}

export function AppMenuBar({ menus, getEntries, triggerClassName }: AppMenuBarProps) {
  return (
    <Menubar className="flex h-10 items-center gap-1">
      {menus.map((menu) => (
        <Menu.Root key={menu.id}>
          <Menu.Trigger
            className={`${triggerClassName ?? ""} ${menu.triggerClassName ?? ""}`.trim() || undefined}
          >
            {menu.label}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={positionerClassName} side="bottom" align="start" sideOffset={0}>
              <Menu.Popup className={popupClassName} aria-label={menu.label}>
                <AppMenuEntries entries={getEntries(menu.id)} />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ))}
    </Menubar>
  );
}

function AppMenuEntries({ entries }: { entries: ContextMenuEntry[] }) {
  return entries.map((entry, index) => {
    if (entry.kind === "separator") {
      return <div className={separatorClassName} key={`separator-${index}`} role="separator" />;
    }

    if (entry.kind === "submenu") {
      return <AppSubmenu key={entry.id} entry={entry} />;
    }

    return <AppMenuItem key={entry.id} entry={entry} />;
  });
}

function AppMenuItem({ entry }: { entry: ContextMenuItem }) {
  const disabled = Boolean(entry.disabled);
  const acceleratorLabel = entry.accelerator ? formatAccelerator(entry.accelerator) : null;
  const accessibleLabel = acceleratorLabel ? `${entry.label} ${acceleratorLabel}` : entry.label;

  return (
    <Menu.Item
      className={itemClassName}
      disabled={disabled}
      aria-label={accessibleLabel}
      data-menu-item-id={entry.id}
      onClick={() => {
        if (disabled) return;
        Promise.resolve(entry.onSelect?.()).catch(() => {});
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {entry.icon ? <span className="shrink-0 text-(--text-secondary)">{entry.icon}</span> : null}
        <span className="min-w-0 truncate">{entry.label}</span>
      </span>
      {entry.accelerator ? (
        <span className={acceleratorClassName}>{acceleratorLabel}</span>
      ) : null}
    </Menu.Item>
  );
}

function AppSubmenu({ entry }: { entry: ContextMenuSubmenu }) {
  const disabled = Boolean(entry.disabled);

  return (
    <Menu.SubmenuRoot disabled={disabled}>
      <Menu.SubmenuTrigger className={submenuTriggerClassName}>
        <span className="min-w-0 truncate">{entry.label}</span>
        <ChevronRight aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} strokeWidth={2.25} />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner alignOffset={-4} className={positionerClassName} side="right" align="start" sideOffset={8}>
          <Menu.Popup className={popupClassName}>
            <AppMenuEntries entries={entry.entries} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}
