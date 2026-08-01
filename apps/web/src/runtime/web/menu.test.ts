import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import { createWebRuntime } from "..";

function getMenu() {
  return document.querySelector("[data-markra-web-context-menu]");
}

function getMenuItem(label: string) {
  const items = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='menuitem']"));
  const item = items.find((button) => button.textContent?.includes(label));
  if (!item) throw new Error(`Menu item not found: ${label}`);

  return item;
}

function getMenuItemById(id: string) {
  const item = document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
  if (!item) throw new Error(`Menu item not found: ${id}`);

  return item;
}

function queryMenuItemById(id: string) {
  return document.querySelector<HTMLButtonElement>(`[data-menu-item-id="${id}"]`);
}

function getSubmenu(id: string) {
  const submenu = document.querySelector(`[data-menu-submenu-id="${id}"]`);
  if (!submenu) throw new Error(`Submenu not found: ${id}`);

  return submenu;
}

describe("web editor context menu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("shows a custom editor context menu on markdown paper right click", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const bold = vi.fn();
    document.body.innerHTML = "<main><article class=\"markdown-paper\"><p>Example note</p></article></main>";
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("paragraph was not rendered");

    const cleanup = await runtime.menu.installEditorContextMenu(document, {
      formatBold: bold
    }, "en");

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 32,
      clientY: 48
    });
    paragraph.dispatchEvent(event);

    const menu = getMenu();
    expect(event.defaultPrevented).toBe(true);
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute("role")).toBe("menu");
    expect((menu as HTMLElement).style.left).toBe("32px");
    expect((menu as HTMLElement).style.top).toBe("48px");
    expect(getMenuItem("Cut")).not.toBeNull();
    expect(getMenuItem("Bold")).not.toBeNull();

    getMenuItem("Bold").click();

    expect(bold).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();

    cleanup();
  });

  it("groups editor actions into native-like submenus", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const bold = vi.fn();
    const exportHtml = vi.fn();
    const aiPolish = vi.fn();
    document.body.innerHTML = "<article class=\"markdown-paper\"><p>Example note</p></article>";
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("paragraph was not rendered");

    const cleanup = await runtime.menu.installEditorContextMenu(document, {
      aiPolish,
      exportHtml,
      formatBold: bold
    }, "en", {
      getAiCommandsAvailable: () => true
    });

    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));

    const format = getMenuItemById("markra:web-context:format");
    expect(format.textContent).toContain("Format");
    expect(format.getAttribute("aria-haspopup")).toBe("menu");
    expect(getSubmenu("markra:web-context:format").textContent).toContain("Bold");

    const exportMenu = getMenuItemById("markra:web-context:export");
    expect(exportMenu.textContent).toContain("Export");
    expect(exportMenu.getAttribute("aria-haspopup")).toBe("menu");
    expect(getSubmenu("markra:web-context:export").textContent).toContain("Export HTML");

    const aiMenu = getMenuItemById("markra:web-context:ai");
    expect(aiMenu.textContent).toContain("AI toolkit");
    expect(aiMenu.getAttribute("aria-haspopup")).toBe("menu");
    expect(getSubmenu("markra:web-context:ai").textContent).toContain("Polish");

    getMenuItemById("markra:web-context:bold").click();

    expect(bold).toHaveBeenCalledTimes(1);
    expect(exportHtml).not.toHaveBeenCalled();
    expect(aiPolish).not.toHaveBeenCalled();
    expect(getMenu()).toBeNull();

    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));
    getMenuItemById("markra:web-context:export-html").click();

    expect(exportHtml).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();

    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));
    getMenuItemById("markra:web-context:ai-polish").click();

    expect(aiPolish).toHaveBeenCalledTimes(1);
    expect(getMenu()).toBeNull();

    cleanup();
  });

  it("hides the export submenu when export handlers are unavailable", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const bold = vi.fn();
    document.body.innerHTML = "<article class=\"markdown-paper\"><p>Example note</p></article>";
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("paragraph was not rendered");

    const cleanup = await runtime.menu.installEditorContextMenu(document, {
      formatBold: bold
    }, "en");

    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));

    expect(queryMenuItemById("markra:web-context:format")).not.toBeNull();
    expect(queryMenuItemById("markra:web-context:export")).toBeNull();

    cleanup();
  });

  it("does not replace the browser menu outside markdown paper", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    const cleanup = await runtime.menu.installEditorContextMenu(document, {}, "en");

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    });
    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(getMenu()).toBeNull();

    cleanup();
  });

  it("runs browser edit commands and removes listeners on cleanup", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    document.body.innerHTML = "<article class=\"markdown-paper\"><p>Example note</p></article>";
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("paragraph was not rendered");

    const cleanup = await runtime.menu.installEditorContextMenu(document, {}, "en");
    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));

    getMenuItem("Copy").click();

    expect(execCommand).toHaveBeenCalledWith("copy");

    cleanup();
    paragraph.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));

    expect(getMenu()).toBeNull();
  });

  it("pastes into the editor that opened the web context menu", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const execCommand = vi.fn().mockReturnValue(false);
    const mainPaste = vi.fn();
    const sidePaste = vi.fn((event: Event) => event.preventDefault());
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn().mockResolvedValue("side clipboard text")
      }
    });
    document.body.innerHTML = `
      <main>
        <article class="markdown-paper"><div class="cm-content" data-editor="main"></div></article>
        <article class="markdown-paper"><div class="cm-content" data-editor="side"></div></article>
      </main>
    `;
    const mainContent = document.querySelector<HTMLElement>("[data-editor='main']");
    const sideContent = document.querySelector<HTMLElement>("[data-editor='side']");
    if (!mainContent || !sideContent) throw new Error("Editor content was not rendered");
    mainContent.addEventListener("paste", mainPaste);
    sideContent.addEventListener("paste", sidePaste);

    await runtime.menu.installEditorContextMenu(document, {}, "en");

    sideContent.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));
    getMenuItem("Paste").click();
    await vi.waitFor(() => expect(sidePaste).toHaveBeenCalledTimes(1));

    expect(mainPaste).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith("paste");
  });

  it("shows file tree context actions in the browser", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const file = {
      name: "notes.md",
      path: "web-folder://vault/notes.md",
      relativePath: "notes.md"
    };
    const openFileToSide = vi.fn();
    const renameFile = vi.fn();
    const deleteFile = vi.fn();

    await runtime.menu.showMarkdownFileTreeContextMenu({
      deleteFile,
      openFileToSide,
      renameFile
    }, "en", file);

    expect(getMenu()).not.toBeNull();
    expect(getMenuItemById("markra:web-file-tree:open-to-side").textContent).toContain("Open to side");
    expect(getMenuItemById("markra:web-file-tree:rename").textContent).toContain("Rename");
    expect(getMenuItemById("markra:web-file-tree:delete").textContent).toContain("Delete");

    getMenuItemById("markra:web-file-tree:rename").click();

    expect(renameFile).toHaveBeenCalledWith(file);
    expect(openFileToSide).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
    expect(getMenu()).toBeNull();
  });

  it("keeps active file side-open context actions disabled", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const file = {
      name: "active.md",
      path: "web-folder://vault/active.md",
      relativePath: "active.md"
    };
    const openFileToSide = vi.fn();

    await runtime.menu.showMarkdownFileTreeContextMenu({
      canOpenFileToSide: () => false,
      openFileToSide
    }, "en", file);

    getMenuItemById("markra:web-file-tree:open-to-side").click();

    expect(getMenuItemById("markra:web-file-tree:open-to-side").disabled).toBe(true);
    expect(openFileToSide).not.toHaveBeenCalled();
  });
});
