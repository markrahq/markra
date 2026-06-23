import {
  Archive,
  Cloud,
  Download,
  Globe2,
  HardDrive,
  Keyboard,
  KeyRound,
  LayoutTemplate,
  Palette,
  PenLine,
  SlidersHorizontal,
  SpellCheck,
  Sparkles,
  Wifi,
  X,
  type LucideIcon
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { SettingsCategory } from "../hooks/useSettingsWindowState";
import type { DesktopPlatform } from "../lib/platform";
import type { I18nKey } from "@markra/shared";

type Translate = (key: I18nKey) => string;

type SettingsCategoryDefinition = {
  icon: LucideIcon;
  id: SettingsCategory;
  labelKey: I18nKey;
};

const settingsCategories: SettingsCategoryDefinition[] = [
  {
    icon: SlidersHorizontal,
    id: "general",
    labelKey: "settings.categories.general"
  },
  {
    icon: Sparkles,
    id: "ai",
    labelKey: "settings.categories.ai"
  },
  {
    icon: KeyRound,
    id: "providers",
    labelKey: "settings.categories.providers"
  },
  {
    icon: Globe2,
    id: "web",
    labelKey: "settings.categories.web"
  },
  {
    icon: HardDrive,
    id: "storage",
    labelKey: "settings.categories.storage"
  },
  {
    icon: Archive,
    id: "backup",
    labelKey: "settings.categories.backup"
  },
  {
    icon: Cloud,
    id: "sync",
    labelKey: "settings.categories.sync"
  },
  {
    icon: Palette,
    id: "appearance",
    labelKey: "settings.categories.appearance"
  },
  {
    icon: PenLine,
    id: "editor",
    labelKey: "settings.categories.editor"
  },
  {
    icon: SpellCheck,
    id: "spellcheck",
    labelKey: "settings.categories.spellcheck"
  },
  {
    icon: LayoutTemplate,
    id: "templates",
    labelKey: "settings.categories.templates"
  },
  {
    icon: Keyboard,
    id: "keyboardShortcuts",
    labelKey: "settings.sections.keyboardShortcuts"
  },
  {
    icon: Download,
    id: "export",
    labelKey: "settings.categories.export"
  },
  {
    icon: Wifi,
    id: "network",
    labelKey: "settings.categories.network"
  }
];

function categoryLabel(categoryId: SettingsCategory, translate: Translate) {
  const category = settingsCategories.find((item) => item.id === categoryId);

  return category ? translate(category.labelKey) : translate("settings.title");
}

export function SettingsSidebar({
  activeCategory,
  appVersion,
  hiddenCategories = [],
  onCategoryChange,
  platform,
  translate
}: {
  activeCategory: SettingsCategory;
  appVersion: string;
  hiddenCategories?: readonly SettingsCategory[];
  onCategoryChange: (category: SettingsCategory) => unknown;
  platform: DesktopPlatform;
  translate: Translate;
}) {
  const headerClassName = platform === "windows"
    ? "settings-sidebar-header flex h-14 items-center px-7"
    : "settings-sidebar-header px-7 pt-14 pb-5";
  const sidebarSurfaceClassName = platform === "windows"
    ? "border-r-0 bg-(--bg-chrome)"
    : "border-r border-(--border-default) bg-(--bg-secondary)";
  const visibleCategories = settingsCategories.filter((category) => !hiddenCategories.includes(category.id));

  return (
    <aside className={`settings-sidebar flex min-h-0 flex-col ${sidebarSurfaceClassName}`}>
      <div className={headerClassName}>
        <h1 className="settings-sidebar-title m-0 text-[17px] leading-6 font-bold tracking-normal text-(--text-heading)">
          {translate("settings.title")}
        </h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label={translate("settings.aria.categories")}>
        {visibleCategories.map((category) => (
          <SettingsNavButton
            key={category.id}
            category={category}
            active={category.id === activeCategory}
            translate={translate}
            onClick={() => onCategoryChange(category.id)}
          />
        ))}
      </nav>

      <div className="border-t border-(--border-default) px-7 py-4 text-[12px] leading-5 font-[560] text-(--text-secondary)">
        Markra v{appVersion}
      </div>
    </aside>
  );
}

function SettingsNavButton({
  active,
  category,
  onClick,
  translate
}: {
  active: boolean;
  category: SettingsCategoryDefinition;
  onClick: () => unknown;
  translate: Translate;
}) {
  const Icon = category.icon;
  const label = translate(category.labelKey);

  return (
    <button
      className="group inline-flex h-9 w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 text-left text-[13px] leading-5 font-[620] tracking-normal text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) aria-current:bg-(--bg-active) aria-current:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={15} />
      <span>{label}</span>
    </button>
  );
}

export function SettingsContent({
  activeCategory,
  children,
  onClose,
  platform,
  translate
}: {
  activeCategory: SettingsCategory;
  children: ReactNode;
  onClose?: () => unknown;
  platform?: DesktopPlatform;
  translate: Translate;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentSurfaceClassName = platform === "windows"
    ? "border-t border-l border-(--border-default) rounded-tl-md"
    : "";
  const contentHeaderDragRegion = platform === "linux" ? undefined : true;

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.scrollTop = 0;
  }, [activeCategory]);

  return (
    <section className={`settings-content flex min-h-0 min-w-0 flex-col bg-(--bg-primary) ${contentSurfaceClassName}`}>
      <header
        className="settings-content-header relative z-20 flex h-14 shrink-0 items-center border-b border-(--border-default) px-7"
        data-tauri-drag-region={contentHeaderDragRegion}
      >
        <h2 className="settings-panel-title m-0 text-[16px] leading-6 font-bold tracking-normal text-(--text-heading)">
          {categoryLabel(activeCategory, translate)}
        </h2>
        {onClose ? (
          <button
            className="ml-auto inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            type="button"
            aria-label={translate("menu.closeWindow")}
            onClick={onClose}
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className={
          activeCategory === "providers"
            ? "settings-scroll min-h-0 flex-1 overflow-hidden overscroll-none p-0"
            : "settings-scroll min-h-0 flex-1 overflow-auto overscroll-none px-8 py-7"
        }
      >
        {children}
      </div>
    </section>
  );
}
