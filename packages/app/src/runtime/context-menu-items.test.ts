import {
  createEditorContextMenuEntries,
  createMarkdownFileTreeContextMenuEntries
} from "./context-menu-items";
import type { ContextMenuEntry, ContextMenuItem, ContextMenuSubmenu } from "../components/ContextMenu";

function menuItemById(entries: ContextMenuEntry[], id: string): ContextMenuItem {
  const item = entries.find((entry) => entry.kind === "item" && entry.id === id);
  if (!item || item.kind !== "item") throw new Error(`Menu item not found: ${id}`);

  return item;
}

function submenuById(entries: ContextMenuEntry[], id: string): ContextMenuSubmenu {
  const item = entries.find((entry) => entry.kind === "submenu" && entry.id === id);
  if (!item || item.kind !== "submenu") throw new Error(`Submenu not found: ${id}`);

  return item;
}

function querySubmenuById(entries: ContextMenuEntry[], id: string): ContextMenuSubmenu | null {
  const item = entries.find((entry) => entry.kind === "submenu" && entry.id === id);

  return item?.kind === "submenu" ? item : null;
}

describe("editor context menu entries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers local image import as a separate editor command", () => {
    const importLocalImages = vi.fn();
    const insertImage = vi.fn();
    const item = menuItemById(
      createEditorContextMenuEntries({ importLocalImages, insertImage }, "en"),
      "markra:context:import-local-images"
    );

    expect(item.label).toBe("Import Local Images...");

    item.onSelect?.();

    expect(importLocalImages).toHaveBeenCalledTimes(1);
    expect(insertImage).not.toHaveBeenCalled();
  });

  it("falls back to clipboard text insertion when the browser paste command is unavailable", async () => {
    const execCommand = vi.fn((command: string) => command !== "paste");
    const readText = vi.fn().mockResolvedValue("pasted text");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText
      }
    });

    const paste = menuItemById(createEditorContextMenuEntries({}, "en"), "markra:context:paste");

    await Promise.resolve(paste.onSelect?.());

    expect(execCommand).toHaveBeenNthCalledWith(1, "paste");
    expect(readText).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenNthCalledWith(2, "insertText", false, "pasted text");
  });

  it("falls back to clipboard text insertion when the browser paste command throws", async () => {
    const execCommand = vi.fn((command: string) => {
      if (command === "paste") throw new Error("Paste is blocked.");

      return true;
    });
    const readText = vi.fn().mockResolvedValue("blocked paste text");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText
      }
    });

    const paste = menuItemById(createEditorContextMenuEntries({}, "en"), "markra:context:paste");

    await Promise.resolve(paste.onSelect?.());

    expect(execCommand).toHaveBeenNthCalledWith(1, "paste");
    expect(readText).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenNthCalledWith(2, "insertText", false, "blocked paste text");
  });

  it("uses an injected clipboard text reader before the browser paste command", async () => {
    const execCommand = vi.fn((command: string) => command !== "paste");
    const readText = vi.fn().mockResolvedValue("browser clipboard text");
    const readClipboardText = vi.fn().mockResolvedValue("platform clipboard text");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText
      }
    });

    const paste = menuItemById(
      createEditorContextMenuEntries({}, "en", {
        readClipboardText
      }),
      "markra:context:paste"
    );

    await Promise.resolve(paste.onSelect?.());

    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(readText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenNthCalledWith(1, "insertText", false, "platform clipboard text");
  });

  it("falls back to the browser paste command when injected clipboard text is unavailable", async () => {
    const execCommand = vi.fn((command: string) => command === "paste");
    const readText = vi.fn().mockResolvedValue("browser clipboard text");
    const readClipboardText = vi.fn().mockResolvedValue(null);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText
      }
    });

    const paste = menuItemById(
      createEditorContextMenuEntries({}, "en", {
        readClipboardText
      }),
      "markra:context:paste"
    );

    await Promise.resolve(paste.onSelect?.());

    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenNthCalledWith(1, "paste");
    expect(readText).not.toHaveBeenCalled();
  });

  it("adds enabled plugin commands to an Extensions submenu", () => {
    const runPluginCommand = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected citation"
    } as Selection);
    const entries = createEditorContextMenuEntries({}, "en", {
      pluginEditorItems: [
        {
          commandId: "reference.insertCitation",
          id: "reference.insertCitation.editor",
          pluginId: "reference",
          pluginName: "Reference",
          title: "Insert citation"
        }
      ],
      runPluginCommand
    });

    const submenu = submenuById(entries, "markra:context:extensions");
    expect(submenu.label).toBe("Extension commands");

    const item = menuItemById(submenu.entries, "markra:context:plugin:reference.insertCitation.editor");
    expect(item.label).toBe("Insert citation");

    item.onSelect?.();

    expect(runPluginCommand).toHaveBeenCalledWith(
      "reference.insertCitation",
      {
        source: "editorContextMenu",
        editor: {
          selectionText: "selected citation"
        }
      },
      "reference"
    );
  });

  it("hides plugin editor context menu items that require a non-empty selection", () => {
    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => ""
    } as Selection);

    const emptySelectionEntries = createEditorContextMenuEntries({}, "en", {
      pluginEditorItems: [
        {
          commandId: "reference.insertCitation",
          id: "reference.insertCitation.editor",
          pluginId: "reference",
          pluginName: "Reference",
          title: "Insert citation",
          when: {
            selection: "nonEmpty"
          }
        }
      ],
      runPluginCommand: vi.fn()
    });

    expect(querySubmenuById(emptySelectionEntries, "markra:context:extensions")).toBeNull();

    getSelection.mockReturnValue({
      toString: () => "selected text"
    } as Selection);

    const selectedTextEntries = createEditorContextMenuEntries({}, "en", {
      pluginEditorItems: [
        {
          commandId: "reference.insertCitation",
          id: "reference.insertCitation.editor",
          pluginId: "reference",
          pluginName: "Reference",
          title: "Insert citation",
          when: {
            selection: "nonEmpty"
          }
        }
      ],
      runPluginCommand: vi.fn()
    });

    expect(submenuById(selectedTextEntries, "markra:context:extensions")).toBeTruthy();
  });
});

describe("markdown file tree context menu entries", () => {
  it("offers one containing-folder action for markdown files", () => {
    const openContainingFolder = vi.fn();
    const file = {
      name: "guide.md",
      path: "/mock-project/docs/guide.md",
      relativePath: "docs/guide.md"
    };

    const item = menuItemById(
      createMarkdownFileTreeContextMenuEntries({ openContainingFolder }, "zh-CN", file),
      "markra:file-tree:open-containing-folder"
    );

    expect(item.label).toBe("打开所在文件夹");

    item.onSelect?.();

    expect(openContainingFolder).toHaveBeenCalledWith(file);
  });

  it("offers the containing-folder action from the file tree background", () => {
    const openContainingFolder = vi.fn();

    const item = menuItemById(
      createMarkdownFileTreeContextMenuEntries({ openContainingFolder }, "zh-CN"),
      "markra:file-tree:open-containing-folder"
    );

    expect(item.label).toBe("打开所在文件夹");

    item.onSelect?.();

    expect(openContainingFolder).toHaveBeenCalledTimes(1);
    expect(openContainingFolder.mock.calls[0]).toEqual([]);
  });

  it("disables single-file actions for a multi-selected markdown file context", () => {
    const file = {
      name: "guide.md",
      path: "/mock-project/docs/guide.md",
      relativePath: "docs/guide.md"
    };
    const entries = createMarkdownFileTreeContextMenuEntries(
      {
        canOpenFileToSide: () => true,
        deleteFile: vi.fn(),
        multiSelect: true,
        openContainingFolder: vi.fn(),
        openFileToSide: vi.fn(),
        renameFile: vi.fn(),
        saveFileAsTemplate: vi.fn()
      },
      "en",
      file
    );

    expect(menuItemById(entries, "markra:file-tree:open-to-side").disabled).toBe(true);
    expect(menuItemById(entries, "markra:file-tree:delete").disabled).toBe(false);
    expect(menuItemById(entries, "markra:file-tree:save-as-template").disabled).toBe(true);
    expect(menuItemById(entries, "markra:file-tree:open-containing-folder").disabled).toBe(true);
    expect(menuItemById(entries, "markra:file-tree:rename").disabled).toBe(true);
  });

  it("adds plugin file tree commands with the clicked file target", () => {
    const runPluginCommand = vi.fn();
    const file = {
      name: "guide.md",
      path: "/mock-project/docs/guide.md",
      relativePath: "docs/guide.md"
    };
    const entries = createMarkdownFileTreeContextMenuEntries(
      {
        openContainingFolder: vi.fn()
      },
      "en",
      file,
      {},
      {
        pluginFileTreeItems: [
          {
            commandId: "reference.copyPath",
            id: "reference.copyPath.fileTree",
            pluginId: "reference",
            pluginName: "Reference",
            title: "Copy relative path",
            when: {
              file: "markdown"
            }
          }
        ],
        runPluginCommand
      }
    );

    const submenu = submenuById(entries, "markra:file-tree:extensions");
    expect(submenu.label).toBe("Extension commands");

    const item = menuItemById(submenu.entries, "markra:file-tree:plugin:reference.copyPath.fileTree");
    expect(item.label).toBe("Copy relative path");

    item.onSelect?.();

    expect(runPluginCommand).toHaveBeenCalledWith(
      "reference.copyPath",
      {
        source: "fileTreeContextMenu",
        file: {
          kind: "markdown",
          name: "guide.md",
          path: "/mock-project/docs/guide.md",
          relativePath: "docs/guide.md"
        }
      },
      "reference"
    );
  });

  it("hides plugin file tree commands when their file kind condition does not match", () => {
    const entries = createMarkdownFileTreeContextMenuEntries(
      {},
      "en",
      {
        kind: "folder",
        name: "docs",
        path: "/mock-project/docs",
        relativePath: "docs"
      },
      {},
      {
        pluginFileTreeItems: [
          {
            commandId: "reference.copyPath",
            id: "reference.copyPath.fileTree",
            pluginId: "reference",
            pluginName: "Reference",
            title: "Copy relative path",
            when: {
              file: "markdown"
            }
          }
        ],
        runPluginCommand: vi.fn()
      }
    );

    expect(querySubmenuById(entries, "markra:file-tree:extensions")).toBeNull();
  });
});
