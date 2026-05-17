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
      isFocused
    } as unknown as ReturnType<typeof getCurrentWindow>);
    isFocused.mockResolvedValue(true);
  });

  it("routes native application menu commands to the current app handlers", async () => {
    const handlers: NativeMenuHandlers = {
      openDocument: vi.fn(),
      saveDocument: vi.fn()
    };

    const stopListening = await listenNativeApplicationMenuCommands(handlers);
    const listener = mockedListen.mock.calls[0]?.[1];

    expect(mockedListen).toHaveBeenCalledWith("markra://menu-command", expect.any(Function));

    await listener?.({ payload: { command: "openDocument" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "saveDocument" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "unknown" } } as Parameters<NonNullable<typeof listener>>[0]);
    await listener?.({ payload: { command: "openFolder" } } as unknown as Parameters<NonNullable<typeof listener>>[0]);

    expect(handlers.openDocument).toHaveBeenCalledTimes(1);
    expect(handlers.saveDocument).toHaveBeenCalledTimes(1);

    stopListening();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("asks Rust to install the application menu while keeping command listeners", async () => {
    const handlers: NativeMenuHandlers = {
      saveDocument: vi.fn()
    };

    await installNativeApplicationMenu(handlers, "fr", {
      bold: "Mod+Alt+B"
    });

    expect(mockedListen).toHaveBeenCalledWith("markra://menu-command", expect.any(Function));
    expect(mockedInvoke).toHaveBeenCalledWith("install_application_menu", {
      accelerators: {
        formatBold: "CmdOrCtrl+Alt+B"
      },
      language: "fr"
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

  it("shows a native context menu only inside the markdown paper", async () => {
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

    expect(popup).not.toHaveBeenCalled();

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await flushNativeMenuPopup();

    expect(mockedMenuNew).toHaveBeenCalledTimes(1);
    expect(popup).toHaveBeenCalledTimes(1);

    const table = menuItemById(latestMenuItems(), "markra:context:table");
    expect(table).toMatchObject({
      accelerator: "CmdOrCtrl+Alt+T",
      text: "Table"
    });

    table.action?.("markra:context:table");

    expect(insertTable).toHaveBeenCalledTimes(1);

    cleanup();
    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(popup).toHaveBeenCalledTimes(1);
  });

  it("shows customized markdown shortcuts in the native context menu", async () => {
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
    await flushNativeMenuPopup();

    expect(menuItemById(latestMenuItems(), "markra:context:bold")).toMatchObject({
      accelerator: "CmdOrCtrl+Alt+B",
      text: "Bold"
    });
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
      language: "en"
    });

    await installNativeEditorContextMenu(target, {}, "en", {
      markdownShortcuts: {
        image: "Mod+Alt+I",
        link: "Mod+Alt+K",
        table: "Mod+Shift+T"
      }
    });

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await flushNativeMenuPopup();

    expect(menuItemById(latestMenuItems(), "markra:context:link")).toMatchObject({
      accelerator: "CmdOrCtrl+Alt+K",
      text: "Link"
    });
    expect(menuItemById(latestMenuItems(), "markra:context:image")).toMatchObject({
      accelerator: "CmdOrCtrl+Alt+I",
      text: "Image"
    });
    expect(menuItemById(latestMenuItems(), "markra:context:table")).toMatchObject({
      accelerator: "CmdOrCtrl+Shift+T",
      text: "Table"
    });
  });

  it("passes customized app shortcuts to the native application menu", async () => {
    await installNativeApplicationMenu({}, "en", {
      toggleAiAgent: "Mod+Shift+Y",
      toggleAiCommand: "Mod+Alt+J",
      toggleMarkdownFiles: "Mod+Alt+M",
      toggleSourceMode: "Mod+Alt+U"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("install_application_menu", {
      accelerators: {
        toggleAiAgent: "CmdOrCtrl+Shift+Y",
        toggleAiCommand: "CmdOrCtrl+Alt+J",
        toggleMarkdownFiles: "CmdOrCtrl+Alt+M",
        toggleSourceMode: "CmdOrCtrl+Alt+U"
      },
      language: "en"
    });
  });

  it("groups richer editor formatting actions in the native context menu", async () => {
    const target = document.createElement("main");
    const paper = document.createElement("article");
    const handlers: NativeMenuHandlers = {
      exportHtml: vi.fn(),
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

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await flushNativeMenuPopup();

    const items = latestMenuItems();

    expect(menuItemById(items, "markra:context:format")).toMatchObject({ text: "Format" });
    expect(menuItemById(items, "markra:context:strikethrough")).toMatchObject({ text: "Strikethrough" });
    expect(menuItemById(items, "markra:context:inline-code")).toMatchObject({ text: "Inline Code" });
    expect(menuItemById(items, "markra:context:heading-2")).toMatchObject({ text: "Heading 2" });
    expect(menuItemById(items, "markra:context:ordered-list")).toMatchObject({ text: "Ordered List" });
    expect(menuItemById(items, "markra:context:quote")).toMatchObject({ text: "Quote" });
    expect(menuItemById(items, "markra:context:code-block")).toMatchObject({ text: "Code Block" });
    expect(menuItemById(items, "markra:context:image")).toMatchObject({ text: "Image" });
    const exportMenu = menuItemById(items, "markra:context:export");
    expect(exportMenu).toMatchObject({ text: "Export" });
    expect(menuItemById(menuItemChildren(exportMenu), "markra:context:export-pdf")).toMatchObject({ text: "Export PDF" });
    expect(menuItemById(menuItemChildren(exportMenu), "markra:context:export-html")).toMatchObject({ text: "Export HTML" });

    menuItemById(items, "markra:context:strikethrough").action?.("markra:context:strikethrough");
    menuItemById(items, "markra:context:code-block").action?.("markra:context:code-block");
    menuItemById(items, "markra:context:image").action?.("markra:context:image");
    menuItemById(items, "markra:context:export-pdf").action?.("markra:context:export-pdf");
    menuItemById(items, "markra:context:export-html").action?.("markra:context:export-html");

    expect(handlers.formatStrikethrough).toHaveBeenCalledTimes(1);
    expect(handlers.formatCodeBlock).toHaveBeenCalledTimes(1);
    expect(handlers.insertImage).toHaveBeenCalledTimes(1);
    expect(handlers.exportPdf).toHaveBeenCalledTimes(1);
    expect(handlers.exportHtml).toHaveBeenCalledTimes(1);
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
    await flushNativeMenuPopup();

    expect(findMenuItemById(latestMenuItems(), "markra:context:ai")).toBeNull();

    mockedMenuNew.mockClear();
    aiCommandsAvailable = true;

    paper.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await flushNativeMenuPopup();

    const items = latestMenuItems();
    const aiMenu = menuItemById(items, "markra:context:ai");
    expect(aiMenu).toMatchObject({ text: "AI toolkit" });
    expect(aiMenu).not.toHaveProperty("icon");
    const aiActionItems = [
      ["markra:context:ai-polish", "Polish"],
      ["markra:context:ai-rewrite", "Rewrite"],
      ["markra:context:ai-continue-writing", "Continue writing"],
      ["markra:context:ai-summarize", "Summarize"],
      ["markra:context:ai-translate", "Translate"]
    ] as const;

    for (const [id, text] of aiActionItems) {
      const item = menuItemById(items, id);

      expect(item).toMatchObject({ text });
      expect(item).not.toHaveProperty("icon");
    }

    menuItemById(items, "markra:context:ai-polish").action?.("markra:context:ai-polish");
    menuItemById(items, "markra:context:ai-translate").action?.("markra:context:ai-translate");

    expect(aiPolish).toHaveBeenCalledTimes(1);
    expect(aiTranslate).toHaveBeenCalledTimes(1);
  });

  it("shows native markdown file tree actions for a file target", async () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const renameFile = vi.fn();
    const deleteFile = vi.fn();
    const file = {
      name: "README.md",
      path: "/vault/README.md",
      relativePath: "README.md"
    };

    await showNativeMarkdownFileTreeContextMenu({
      createFile,
      createFolder,
      deleteFile,
      renameFile
    }, "en", file);

    const items = latestMenuItems();
    const newFile = menuItemById(items, "markra:file-tree:new");
    const newFolder = menuItemById(items, "markra:file-tree:new-folder");
    const rename = menuItemById(items, "markra:file-tree:rename");
    const deleteItem = menuItemById(items, "markra:file-tree:delete");

    expect(newFile).toMatchObject({ text: "New file" });
    expect(newFolder).toMatchObject({ text: "New Folder" });
    expect(rename).toMatchObject({ text: "Rename file" });
    expect(deleteItem).toMatchObject({ text: "Delete file" });

    newFile.action?.("markra:file-tree:new");
    newFolder.action?.("markra:file-tree:new-folder");
    rename.action?.("markra:file-tree:rename");
    deleteItem.action?.("markra:file-tree:delete");

    expect(createFile).toHaveBeenCalledTimes(1);
    expect(createFolder).toHaveBeenCalledTimes(1);
    expect(renameFile).toHaveBeenCalledWith(file);
    expect(deleteFile).toHaveBeenCalledWith(file);
    expect(popup).toHaveBeenCalledTimes(1);
  });

  it("shows a native markdown file tree delete action for a folder target", async () => {
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

    const items = latestMenuItems();
    const deleteItem = menuItemById(items, "markra:file-tree:delete");

    expect(deleteItem).toMatchObject({ text: "Delete folder" });
    expect(findMenuItemById(items, "markra:file-tree:rename")).toBeNull();

    deleteItem.action?.("markra:file-tree:delete");

    expect(deleteFile).toHaveBeenCalledWith(folder);
    expect(renameFile).not.toHaveBeenCalled();
    expect(popup).toHaveBeenCalledTimes(1);
  });

  it("only shows create actions for the markdown file tree root target", async () => {
    await showNativeMarkdownFileTreeContextMenu({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      deleteFile: vi.fn(),
      renameFile: vi.fn()
    }, "en");

    const items = latestMenuItems();

    expect(items).toEqual([
      expect.objectContaining({ id: "markra:file-tree:new", text: "New file" }),
      expect.objectContaining({ id: "markra:file-tree:new-folder", text: "New Folder" })
    ]);
  });
});
