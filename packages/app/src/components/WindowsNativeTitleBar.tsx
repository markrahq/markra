import { FileText, FolderOpen, ImageIcon, PanelLeft, PanelRight } from "lucide-react";
import type { t } from "@markra/shared";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from "react";
import type { NativeMenuHandlers } from "../lib/tauri/menu";
import {
  contextMenuItem,
  contextMenuSeparator,
  contextMenuSubmenu,
  showContextMenu,
  type ContextMenuEntry
} from "./ContextMenu";
import { WindowsWindowControls } from "./WindowsWindowControls";
import { Tooltip } from "@markra/ui";

type WindowsAppMenuId = "app" | "file" | "edit" | "format" | "view";

type WindowsAppMenuConfig = {
  id: WindowsAppMenuId;
  label: string;
};

type WindowsNativeTitleBarProps = {
  aiAgentOpen: boolean;
  aiAgentResizing: boolean;
  aiAgentWidth: number;
  dirty: boolean;
  documentKind: "file" | "folder" | "image";
  documentName: string;
  historyDisabled: boolean;
  label: (key: Parameters<typeof t>[1]) => string;
  markdownFilesOpen: boolean;
  markdownFilesResizing: boolean;
  markdownFilesWidth: number;
  menuHandlers?: NativeMenuHandlers;
  nativeWindowChrome: boolean;
  saveDisabled: boolean;
  sourceMode: boolean;
  sourceModeDisabled: boolean;
  themeActionLabel: string;
  titlebarSideSlotWidth: number;
  titleContent?: ReactNode;
  workspaceName?: string;
  renderDocumentActions: (className: string, style?: CSSProperties) => ReactNode;
  renderTitleContent: (className: string, style?: CSSProperties) => ReactNode;
  onCreateMarkdownFile?: () => unknown;
  onExitApp?: () => unknown;
  onOpenMarkdown: () => unknown;
  onOpenMarkdownFolder?: () => unknown;
  onOpenSettings?: () => unknown;
  onSaveMarkdown: () => unknown;
  onShowAbout?: () => unknown;
  onShowDocumentHistory?: () => unknown;
  onToggleAiAgent: () => unknown;
  onToggleMarkdownFiles: () => unknown;
  onToggleSourceMode?: () => unknown;
  onToggleTheme: () => unknown;
  onToggleWindowMaximized?: () => unknown;
};

function isWindowsTitlebarInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest("a, button, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [data-titlebar-action]"));
}

function runOptionalWindowsAction(action: (() => unknown | Promise<unknown>) | undefined) {
  if (!action) return;

  try {
    Promise.resolve(action()).catch(() => {});
  } catch {
    // Native window state can change while the app is closing; keep the titlebar inert.
  }
}

function runBrowserEditCommand(command: string) {
  document.execCommand(command);
}

const disabledWindowsMenuItem = (id: string, itemLabel: string, accelerator?: string) =>
  contextMenuItem(id, itemLabel, accelerator, undefined, true);

const windowsMenuItem = (
  id: string,
  itemLabel: string,
  accelerator: string | undefined,
  handler: (() => unknown | Promise<unknown>) | undefined
) => contextMenuItem(id, itemLabel, accelerator, handler);

export function WindowsNativeTitleBar({
  aiAgentOpen,
  aiAgentResizing,
  aiAgentWidth,
  dirty,
  documentKind,
  documentName,
  historyDisabled,
  label,
  markdownFilesOpen,
  markdownFilesResizing,
  markdownFilesWidth,
  menuHandlers,
  nativeWindowChrome,
  saveDisabled,
  sourceMode,
  sourceModeDisabled,
  themeActionLabel,
  titlebarSideSlotWidth,
  titleContent,
  workspaceName,
  renderDocumentActions,
  renderTitleContent,
  onCreateMarkdownFile,
  onExitApp,
  onOpenMarkdown,
  onOpenMarkdownFolder,
  onOpenSettings,
  onSaveMarkdown,
  onShowAbout,
  onShowDocumentHistory,
  onToggleAiAgent,
  onToggleMarkdownFiles,
  onToggleSourceMode,
  onToggleTheme,
  onToggleWindowMaximized
}: WindowsNativeTitleBarProps) {
  const showWindowsAppChrome = nativeWindowChrome;
  const windowsAppChromeSurfaceClassName = "bg-(--bg-chrome)";
  const windowsTitlebarSurfaceClassName = "bg-(--bg-primary)";
  const windowsTitlebarTopClassName = showWindowsAppChrome ? "top-10" : "top-0";
  const windowsTitlebarLeft = markdownFilesWidth + (showWindowsAppChrome ? -1 : 1);
  const windowsTitlebarEdgeClassName = showWindowsAppChrome
    ? markdownFilesOpen
      ? "rounded-tl-md overflow-hidden"
      : "border-t border-(--border-default)"
    : "";
  const windowsTitlebarPositionTransitionClassName = markdownFilesResizing
    ? "transition-none"
    : "transition-[left] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
  const windowsTitlebarActionsTransitionClassName = aiAgentResizing
    ? "transition-none"
    : "transition-[opacity,background-color,color,transform] duration-150 ease-out";
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
  const runToggleWindowMaximized = () => {
    runOptionalWindowsAction(onToggleWindowMaximized);
  };
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
      windowsMenuItem("toggleWindowMaximized", label("menu.maximizeWindow"), undefined, onToggleWindowMaximized ? runToggleWindowMaximized : undefined),
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
  const handleWindowsTitlebarMouseDownCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!nativeWindowChrome || !onToggleWindowMaximized || isWindowsTitlebarInteractiveTarget(event.target)) return;
    if (event.button !== 0 || event.detail !== 2) return;

    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    runToggleWindowMaximized();
  };
  const renderWindowsFolderContext = () => showWindowsFolderContext ? (
    <Tooltip content={windowsWorkspaceName} side="bottom">
      <span
        className="windows-app-chrome-context flex h-7 min-w-0 max-w-72 shrink items-center justify-center gap-1.5 text-[12px] leading-none font-[620] text-(--text-heading)"
        data-tauri-drag-region={nativeWindowChrome ? true : undefined}
      >
        <FolderOpen aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={13} />
        <span className="min-w-0 truncate leading-4" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
          {windowsWorkspaceName}
        </span>
      </span>
    </Tooltip>
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
  const renderWindowsTitlebarSidebarDivider = () => showWindowsAppChrome && markdownFilesOpen ? (
    <span
      aria-hidden="true"
      className="windows-titlebar-sidebar-divider pointer-events-none absolute top-1.5 bottom-0 left-0 w-px bg-(--border-default)"
    />
  ) : null;
  const renderWindowsTitlebarTopDivider = () => showWindowsAppChrome && markdownFilesOpen ? (
    <span
      aria-hidden="true"
      className="windows-titlebar-top-divider pointer-events-none absolute top-0 right-0 left-1.5 h-px bg-(--border-default)"
    />
  ) : null;
  const renderWindowsTitlebarCornerDivider = () => showWindowsAppChrome && markdownFilesOpen ? (
    <span
      aria-hidden="true"
      className="windows-titlebar-corner-divider pointer-events-none absolute top-0 left-0 size-1.5 rounded-tl-md border-t border-l border-(--border-default)"
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
          className={`native-titlebar group/titlebar fixed inset-x-0 ${windowsTitlebarTopClassName} z-10 grid h-10 select-none items-center ${windowsTitlebarSurfaceClassName} ${windowsTitlebarEdgeClassName} ${windowsTitlebarPositionTransitionClassName} [-webkit-user-select:none]`}
          style={windowsTitlebarStyle}
          aria-label={label("app.windowDragRegion")}
          onMouseDownCapture={handleWindowsTitlebarMouseDownCapture}
        >
          {renderWindowsTitlebarCornerDivider()}
          {renderWindowsTitlebarTopDivider()}
          {renderWindowsTitlebarSidebarDivider()}
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
        className={`native-titlebar group/titlebar fixed inset-x-0 ${windowsTitlebarTopClassName} z-10 grid h-10 select-none items-center ${windowsTitlebarSurfaceClassName} ${windowsTitlebarEdgeClassName} ${windowsTitlebarPositionTransitionClassName} [-webkit-user-select:none]`}
        style={windowsTitlebarStyle}
        aria-label={label("app.windowDragRegion")}
        data-tauri-drag-region={nativeWindowChrome ? true : undefined}
        onMouseDownCapture={handleWindowsTitlebarMouseDownCapture}
      >
        {renderWindowsTitlebarCornerDivider()}
        {renderWindowsTitlebarTopDivider()}
        {renderWindowsTitlebarSidebarDivider()}
        {showWindowsDocumentTitle ? (
          <h1
            className={`native-title pointer-events-none m-0 flex h-10 min-w-0 items-center justify-center gap-1.5 text-[14px] leading-none font-[650] tracking-normal text-(--text-primary) motion-reduce:transition-none ${
              aiAgentResizing || markdownFilesResizing ? "transition-none" : "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            }`}
            data-tauri-drag-region={nativeWindowChrome ? true : undefined}
            style={{ transform: windowsTitleTransform }}
          >
            <TitleIcon aria-hidden="true" size={15} />
            <span className="min-w-0 truncate leading-5" data-tauri-drag-region={nativeWindowChrome ? true : undefined}>
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
