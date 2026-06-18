import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  installNativeEditorContextMenu,
  installNativeApplicationMenu,
  listenNativeApplicationMenuCommands,
  showNativeMarkdownFileTreeContextMenu,
  type NativeMenuHandlers
} from "./menu";

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: vi.fn()
  }
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn()
}));

const mockedMenuNew = vi.mocked(Menu.new);
const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);
const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);
type TestMenuItem = NonNullable<MenuOptions["items"]>[number];
type TestActionMenuItem = TestMenuItem & {
  action?: (id: string) => unknown;
  icon?: unknown;
  id?: string;
};

function latestMenuItems() {
  const menuOptions = mockedMenuNew.mock.calls[0]?.[0];
  if (!menuOptions) throw new Error("Expected a native menu to be created.");

  return menuOptions.items ?? [];
}

function menuItemById(items: TestMenuItem[], id: string) {
  const item = findMenuItemById(items, id);
  if (!item) throw new Error(`Expected menu item ${id}.`);

  return item as TestActionMenuItem;
}

function menuItemChildren(item: TestActionMenuItem) {
  if (!("items" in item) || !Array.isArray(item.items)) {
    throw new Error(`Expected menu item ${item.id ?? "unknown"} to contain child items.`);
  }

  return item.items as TestMenuItem[];
}

function findMenuItemById(items: TestMenuItem[], id: string): TestActionMenuItem | null {
  for (const candidate of items) {
    if ("id" in candidate && candidate.id === id) return candidate as TestActionMenuItem;
    if ("items" in candidate && Array.isArray(candidate.items)) {
      const child = findMenuItemById(candidate.items as TestMenuItem[], id);
      if (child) return child;
    }
  }

  return null;
}

function domMenu() {
  return document.querySelector("[data-markra-context-menu]");
}

function domMenuItemById(id: string) {
  const item = document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
  if (!item) throw new Error(`Expected DOM menu item ${id}.`);

  return item;
}

function queryDomMenuItemById(id: string) {
  return document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
}

function domSubmenuById(id: string) {
  const submenu = document.querySelector(`[data-menu-submenu-id="${id}"]`);
  if (!submenu) throw new Error(`Expected DOM submenu ${id}.`);

  return submenu;
}

async function flushNativeMenuPopup() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("native menu", () => {
  const setAsAppMenu = vi.fn();
  const popup = vi.fn();
  const unlisten = vi.fn();
  const isFocused = vi.fn();

  beforeEach(() => {
    mockedMenuNew.mockReset();
    mockedInvoke.mockReset();
    mockedListen.mockReset();
    mockedGetCurrentWindow.mockReset();
    setAsAppMenu.mockReset();
    popup.mockReset();
    unlisten.mockReset();
    isFocused.mockReset();
    mockedMenuNew.mockResolvedValue({
      popup,
      setAsAppMenu
    } as unknown as Awaited<ReturnType<typeof Menu.new>>);
    mockedInvoke.mockResolvedValue(undefined);
    mockedListen.mockResolvedValue(unlisten);
    mockedGetCurrentWindow.mockReturnValue({
      label: "main",
      isFocused
    } as unknown as ReturnType<typeof getCurrentWindow>);
    isFocused.mockResolvedValue(true);
  });

  it("routes native application menu commands to the current app handlers", async () => {
    const handlers: NativeMenuHandlers = {
      openDocument: vi.fn(),
      openRecentFile: vi.fn(),
      clearRecentFiles: vi.fn(),
      saveDocument: vi.fn()
    };
    const recentFile = {
      name: "recent.md",
      path: "/mock-files/recent.md"
    };

    const stopListening = await listenNativeApplicationMenuCommands(handlers);
    const listener = mockedListen.mock.calls[0]?.[1];

    expect(mockedListen).toHaveBeenCalledWith("markra://menu-command", expect.any(Function));

    await listener?.({ payload: { command: "openDocument" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "openRecentFile", recentFile } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "clearRecentFiles" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "saveDocument" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "unknown" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "openFolder" } } as unknown as Parameters<NonNullable<typeof listener>>[0]);

    expect(handlers.openDocument).toHaveBeenCalledTimes(1);
    expect(handlers.openRecentFile).toHaveBeenCalledWith(recentFile);
    expect(handlers.clearRecentFiles).toHaveBeenCalledTimes(1);
    expect(handlers.saveDocument).toHaveBeenCalledTimes(1);

    stopListening();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("asks Rust to install the application menu while keeping command listeners", async () => {
    const handlers: NativeMenuHandlers = {
      saveDocument: vi.fn()
    };
    const recentFiles = [
      { name: "recent.md", path: "/mock-files/recent.md" }
    ];

    await installNativeApplicationMenu(handlers, "fr", {
      bold: "Mod+Alt+B"
    }, recentFiles);

    expect(mockedListen).toHaveBeenCalledWith("markra://menu-command", expect.any(Function));
    expect(mockedInvoke).toHaveBeenCalledWith("install_application_menu", {
      accelerators: {
        formatBold: "CmdOrCtrl+Alt+B"
      },
      language: "fr",
      recentFiles
    });
    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(setAsAppMenu).not.toHaveBeenCalled();
  });

  it("routes Rust application menu commands once after Rust installs the menu", async () => {
    const handlers: NativeMenuHandlers = {
      openDocument: vi.fn()
    };

    await installNativeApplicationMenu(handlers, "en");
    const listener = mockedListen.mock.calls[0]?.[1];

    await listener?.({ payload: { command: "openDocument" } } as Parameters<NonNullable<typeof listener>>[0]);

    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(handlers.openDocument).toHaveBeenCalledTimes(1);
  });

  it("routes targeted native application menu commands even when the WebView is temporarily unfocused", async () => {
    isFocused.mockResolvedValue(false);
    const handlers: NativeMenuHandlers = {
      saveDocument: vi.fn()
    };

    await listenNativeApplicationMenuCommands(handlers);
    const listener = mockedListen.mock.calls[0]?.[1];

    await listener?.({ payload: { command: "saveDocument" } } as Parameters<NonNullable<typeof listener>>[0]);

    expect(handlers.saveDocument).toHaveBeenCalledTimes(1);
  });

  it("ignores targeted native application menu commands for another window", async () => {
    const handlers: NativeMenuHandlers = {
      toggleSourceMode: vi.fn()
    };

    await listenNativeApplicationMenuCommands(handlers);
    const listener = mockedListen.mock.calls[0]?.[1];

    await listener?.({
      payload: {
        command: "toggleSourceMode",
        targetWindowLabel: "markra-editor-1"
      }
    } as unknown as Parameters<NonNullable<typeof listener>>[0]);

    expect(handlers.toggleSourceMode).not.toHaveBeenCalled();
  });

  it("shows a self-drawn context menu only inside the markdown paper", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    const outside = document.createElement("button");
    const insertTable = vi.fn();
    paper.className = "markdown-paper";
    target.append(paper, outside);

    const cleanup = await installNativeEditorContextMenu(target, {
      formatBold: vi.fn(),
      insertTable
    }, "en", {
      markdownShortcuts: {
        bold: "Mod+Alt+B"
      }
    });

    outside.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(domMenu()).toBeNull();
    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();

    paper.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 16,
      clientY: 24
    }));

    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
    expect(domMenu()).not.toBeNull();

    const table = domMenuItemById("markra:context:table");
    expect(table.textContent).toContain("Table");
    expect(table.textContent).toContain("Cmd/Ctrl+Shift+Alt+T");

    table.click();

    expect(insertTable).toHaveBeenCalledTimes(1);

    cleanup();
    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(domMenu()).toBeNull();
    expect(popup).not.toHaveBeenCalled();
  });

  it("shows a self-drawn editor context menu inside the markdown paper", async () => {
    const bold = vi.fn();
    document.body.innerHTML = "<main><article class=\"markdown-paper\"><p>Example note</p></article></main>";
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("Expected paragraph to be rendered.");

    const cleanup = await installNativeEditorContextMenu(document, {
      formatBold: bold
    });

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 32,
      clientY: 48
    });
    paragraph.dispatchEvent(event);

    const menu = document.querySelector<HTMLElement>("[data-markra-context-menu]");
    const boldItem = document.querySelector<HTMLButtonElement>("[data-menu-item-id='markra:context:bold']");

    expect(event.defaultPrevented).toBe(true);
    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(menu).not.toBeNull();
    expect(menu?.style.left).toBe("32px");
    expect(menu?.style.top).toBe("48px");

    boldItem?.click();

    expect(bold).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-markra-context-menu]")).toBeNull();

    cleanup();
  });

  it("shows customized markdown shortcuts in the self-drawn context menu", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    paper.className = "markdown-paper";
    target.append(paper);

    await installNativeEditorContextMenu(target, {
      formatBold: vi.fn()
    }, "en", {
      markdownShortcuts: {
        bold: "Mod+Alt+B"
      }
    });

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    const bold = domMenuItemById("markra:context:bold");
    expect(bold.textContent).toContain("Bold");
    expect(bold.textContent).toContain("Cmd/Ctrl+Alt+B");
  });

  it("shows customized insert shortcuts in native menus", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    paper.className = "markdown-paper";
    target.append(paper);

    await installNativeApplicationMenu({}, "en", {
      link: "Mod+Alt+K",
      table: "Mod+Shift+T"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("install_application_menu", {
      accelerators: {
        insertLink: "CmdOrCtrl+Alt+K",
        insertTable: "CmdOrCtrl+Shift+T"
      },
      language: "en",
      recentFiles: []
    });

    await installNativeEditorContextMenu(target, {}, "en", {
      markdownShortcuts: {
        image: "Mod+Alt+I",
        link: "Mod+Alt+K",
        table: "Mod+Shift+T"
      }
    });

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(domMenuItemById("markra:context:link").textContent).toContain("Link");
    expect(domMenuItemById("markra:context:link").textContent).toContain("Cmd/Ctrl+Alt+K");
    expect(domMenuItemById("markra:context:image").textContent).toContain("Image");
    expect(domMenuItemById("markra:context:image").textContent).toContain("Cmd/Ctrl+Alt+I");
    expect(domMenuItemById("markra:context:table").textContent).toContain("Table");
    expect(domMenuItemById("markra:context:table").textContent).toContain("Cmd/Ctrl+Shift+T");
  });

  it("uses the native clipboard command for editor context menu paste", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    const execCommand = vi.fn((command: string) => command !== "paste");
    const browserReadText = vi.fn().mockResolvedValue("browser clipboard text");
    paper.className = "markdown-paper";
    target.append(paper);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: browserReadText
      }
    });
    mockedInvoke.mockImplementation(async (command) => {
      if (command === "read_clipboard_text") return "native clipboard text";

      return undefined;
    });

    await installNativeEditorContextMenu(target, {}, "en");

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    domMenuItemById("markra:context:paste").click();
    await flushNativeMenuPopup();
    await flushNativeMenuPopup();

    expect(mockedInvoke).toHaveBeenCalledWith("read_clipboard_text");
    expect(browserReadText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenNthCalledWith(1, "insertText", false, "native clipboard text");
  });

  it("passes customized app shortcuts to the native application menu", async () => {
    await installNativeApplicationMenu({}, "en", {
      openQuickOpen: "Mod+Alt+P",
      toggleAiAgent: "Mod+Shift+Y",
      toggleAiCommand: "Mod+Alt+J",
      toggleAllFolds: "Mod+Shift+Alt+F",
      toggleMarkdownFiles: "Mod+Alt+M",
      toggleReadOnlyMode: "Mod+Alt+R",
      toggleSourceMode: "Mod+Alt+U"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("install_application_menu", {
      accelerators: {
        openQuickOpen: "CmdOrCtrl+Alt+P",
        toggleAiAgent: "CmdOrCtrl+Shift+Y",
        toggleAiCommand: "CmdOrCtrl+Alt+J",
        toggleAllFolds: "CmdOrCtrl+Shift+Alt+F",
        toggleMarkdownFiles: "CmdOrCtrl+Alt+M",
        toggleReadOnlyMode: "CmdOrCtrl+Alt+R",
        toggleSourceMode: "CmdOrCtrl+Alt+U"
      },
      language: "en",
      recentFiles: []
    });
  });

  it("groups richer editor formatting actions in the self-drawn context menu", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    const handlers: NativeMenuHandlers = {
      exportDocx: vi.fn(),
      exportEpub: vi.fn(),
      exportHtml: vi.fn(),
      exportLatex: vi.fn(),
      exportPdf: vi.fn(),
      formatBold: vi.fn(),
      formatCodeBlock: vi.fn(),
      formatHeading2: vi.fn(),
      formatInlineCode: vi.fn(),
      formatOrderedList: vi.fn(),
      formatQuote: vi.fn(),
      formatStrikethrough: vi.fn(),
      insertImage: vi.fn(),
      insertLink: vi.fn(),
      insertTable: vi.fn()
    };
    paper.className = "markdown-paper";
    target.append(paper);

    await installNativeEditorContextMenu(target, handlers);

    const openMenu = () => {
      paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    };

    openMenu();

    expect(domMenuItemById("markra:context:format").textContent).toContain("Format");
    expect(domMenuItemById("markra:context:strikethrough").textContent).toContain("Strikethrough");
    expect(domMenuItemById("markra:context:inline-code").textContent).toContain("Inline Code");
    expect(domMenuItemById("markra:context:heading-2").textContent).toContain("Heading 2");
    expect(domMenuItemById("markra:context:ordered-list").textContent).toContain("Ordered List");
    expect(domMenuItemById("markra:context:quote").textContent).toContain("Quote");
    expect(domMenuItemById("markra:context:code-block").textContent).toContain("Code Block");
    expect(domMenuItemById("markra:context:image").textContent).toContain("Image");
    expect(domMenuItemById("markra:context:export").textContent).toContain("Export");
    expect(domSubmenuById("markra:context:export").textContent).toContain("Export PDF");
    expect(domSubmenuById("markra:context:export").textContent).toContain("Export HTML");
    expect(domSubmenuById("markra:context:export").textContent).toContain("Export DOCX");
    expect(domSubmenuById("markra:context:export").textContent).toContain("Export EPUB");
    expect(domSubmenuById("markra:context:export").textContent).toContain("Export LaTeX");

    domMenuItemById("markra:context:strikethrough").click();
    openMenu();
    domMenuItemById("markra:context:code-block").click();
    openMenu();
    domMenuItemById("markra:context:image").click();
    openMenu();
    domMenuItemById("markra:context:export-pdf").click();
    openMenu();
    domMenuItemById("markra:context:export-html").click();
    openMenu();
    domMenuItemById("markra:context:export-docx").click();
    openMenu();
    domMenuItemById("markra:context:export-epub").click();
    openMenu();
    domMenuItemById("markra:context:export-latex").click();

    expect(handlers.formatStrikethrough).toHaveBeenCalledTimes(1);
    expect(handlers.formatCodeBlock).toHaveBeenCalledTimes(1);
    expect(handlers.insertImage).toHaveBeenCalledTimes(1);
    expect(handlers.exportPdf).toHaveBeenCalledTimes(1);
    expect(handlers.exportHtml).toHaveBeenCalledTimes(1);
    expect(handlers.exportDocx).toHaveBeenCalledTimes(1);
    expect(handlers.exportEpub).toHaveBeenCalledTimes(1);
    expect(handlers.exportLatex).toHaveBeenCalledTimes(1);
  });

  it("shows editor AI context actions only when an AI target is available", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    const aiPolish = vi.fn();
    const aiTranslate = vi.fn();
    let aiCommandsAvailable = false;
    paper.className = "markdown-paper";
    target.append(paper);

    await installNativeEditorContextMenu(target, {
      aiPolish,
      aiTranslate
    }, "en", {
      getAiCommandsAvailable: () => aiCommandsAvailable
    });

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(queryDomMenuItemById("markra:context:ai")).toBeNull();

    aiCommandsAvailable = true;

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    const aiMenu = domMenuItemById("markra:context:ai");
    expect(aiMenu.textContent).toContain("AI toolkit");
    const aiActionItems = [
      ["markra:context:ai-polish", "Polish"],
      ["markra:context:ai-rewrite", "Rewrite"],
      ["markra:context:ai-continue-writing", "Continue writing"],
      ["markra:context:ai-summarize", "Summarize"],
      ["markra:context:ai-translate", "Translate"]
    ] as const;

    for (const [id, text] of aiActionItems) {
      expect(domMenuItemById(id).textContent).toContain(text);
    }

    domMenuItemById("markra:context:ai-polish").click();
    aiCommandsAvailable = true;
    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    domMenuItemById("markra:context:ai-translate").click();

    expect(aiPolish).toHaveBeenCalledTimes(1);
    expect(aiTranslate).toHaveBeenCalledTimes(1);
  });

  it("shows self-drawn markdown file tree actions for a file target", async () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const createDailyNote = vi.fn();
    const renameFile = vi.fn();
    const deleteFile = vi.fn();
    const openFileToSide = vi.fn();
    const saveFileAsTemplate = vi.fn();
    const file = {
      name: "README.md",
      path: "/vault/README.md",
      relativePath: "README.md"
    };

    const showMenu = async () => {
      await showNativeMarkdownFileTreeContextMenu({
        createFile,
        createFileFromTemplates: [
          { create: createDailyNote, id: "daily-note", name: "Daily note" }
        ],
        createFolder,
        deleteFile,
        openFileToSide,
        renameFile,
        saveFileAsTemplate
      }, "en", file);
    };

    await showMenu();

    expect(domMenuItemById("markra:file-tree:new").textContent).toContain("New file");
    expect(domMenuItemById("markra:file-tree:new-from-template").textContent).toContain("New from template");
    expect(domMenuItemById("markra:file-tree:new-from-template:daily-note").textContent).toContain("Daily note");
    expect(domMenuItemById("markra:file-tree:new-folder").textContent).toContain("New Folder");
    expect(domMenuItemById("markra:file-tree:open-to-side").textContent).toContain("Open to side");
    expect(domMenuItemById("markra:file-tree:save-as-template").textContent).toContain("Save as template");
    expect(domMenuItemById("markra:file-tree:rename").textContent).toContain("Rename file");
    expect(domMenuItemById("markra:file-tree:delete").textContent).toContain("Delete file");

    domMenuItemById("markra:file-tree:new").click();
    await showMenu();
    domMenuItemById("markra:file-tree:new-from-template:daily-note").click();
    await showMenu();
    domMenuItemById("markra:file-tree:new-folder").click();
    await showMenu();
    domMenuItemById("markra:file-tree:open-to-side").click();
    await showMenu();
    domMenuItemById("markra:file-tree:save-as-template").click();
    await showMenu();
    domMenuItemById("markra:file-tree:rename").click();
    await showMenu();
    domMenuItemById("markra:file-tree:delete").click();

    expect(createFile).toHaveBeenCalledTimes(1);
    expect(createDailyNote).toHaveBeenCalledTimes(1);
    expect(createFolder).toHaveBeenCalledTimes(1);
    expect(openFileToSide).toHaveBeenCalledWith(file);
    expect(saveFileAsTemplate).toHaveBeenCalledWith(file);
    expect(renameFile).toHaveBeenCalledWith(file);
    expect(deleteFile).toHaveBeenCalledWith(file);
    expect(mockedMenuNew).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();
  });

  it("hides the markdown file tree side-open action without a handler", async () => {
    const file = {
      name: "README.md",
      path: "/vault/README.md",
      relativePath: "README.md"
    };

    await showNativeMarkdownFileTreeContextMenu({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn(),
      renameFile: vi.fn()
    }, "en", file);

    expect(queryDomMenuItemById("markra:file-tree:open-to-side")).toBeNull();
  });

  it("disables the markdown file tree side-open action when unavailable for the target", async () => {
    const openFileToSide = vi.fn();
    const file = {
      name: "README.md",
      path: "/vault/README.md",
      relativePath: "README.md"
    };

    await showNativeMarkdownFileTreeContextMenu({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn(),
      openFileToSide,
      canOpenFileToSide: () => false,
      renameFile: vi.fn()
    }, "en", file);

    const openToSide = domMenuItemById("markra:file-tree:open-to-side");

    expect(openToSide.textContent).toContain("Open to side");
    expect(openToSide).toBeDisabled();

    openToSide.click();

    expect(openFileToSide).not.toHaveBeenCalled();
  });

  it("shows markdown file tree rename and delete actions for a folder target", async () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const renameFile = vi.fn();
    const deleteFile = vi.fn();
    const folder = {
      kind: "folder" as const,
      name: "docs",
      path: "/vault/docs",
      relativePath: "docs"
    };

    await showNativeMarkdownFileTreeContextMenu({
      createFile,
      createFolder,
      deleteFile,
      renameFile
    }, "en", folder);

    const renameItem = domMenuItemById("markra:file-tree:rename");

    expect(renameItem.textContent).toContain("Rename folder");
    expect(domMenuItemById("markra:file-tree:delete").textContent).toContain("Delete folder");

    renameItem.click();
    await showNativeMarkdownFileTreeContextMenu({
      createFile,
      createFolder,
      deleteFile,
      renameFile
    }, "en", folder);
    domMenuItemById("markra:file-tree:delete").click();

    expect(deleteFile).toHaveBeenCalledWith(folder);
    expect(renameFile).toHaveBeenCalledWith(folder);
    expect(popup).not.toHaveBeenCalled();
  });

  it("only shows create actions for the markdown file tree root target", async () => {
    await showNativeMarkdownFileTreeContextMenu({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn(),
      renameFile: vi.fn()
    }, "en");

    expect(domMenuItemById("markra:file-tree:new").textContent).toContain("New file");
    expect(domMenuItemById("markra:file-tree:new-folder").textContent).toContain("New Folder");
    expect(queryDomMenuItemById("markra:file-tree:delete")).toBeNull();
  });
});
