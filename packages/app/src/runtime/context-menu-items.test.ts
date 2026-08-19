import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import {
  codeMirrorClipboardAssetsPlugin,
  liveMarkdown
} from "@markra/editor/codemirror";
import {
  createEditorContextMenuEntries,
  createEditorContextMenuEntriesFromOptions,
  createMarkdownFileTreeContextMenuEntries
} from "./context-menu-items";
import type { ContextMenuEntry, ContextMenuItem } from "../components/ContextMenu";

const editorViews: EditorView[] = [];

function createEditor(
  doc: string,
  selection: EditorSelection | { anchor: number; head?: number },
  extensions: Extension[] = []
) {
  const paper = document.createElement("article");
  paper.className = "markdown-paper";
  document.body.append(paper);
  const view = new EditorView({
    parent: paper,
    state: EditorState.create({
      doc,
      extensions,
      selection
    })
  });
  editorViews.push(view);
  return { paper, view };
}

function menuItemById(entries: ContextMenuEntry[], id: string): ContextMenuItem {
  const item = entries.find((entry) => entry.kind === "item" && entry.id === id);
  if (!item || item.kind !== "item") throw new Error(`Menu item not found: ${id}`);

  return item;
}

function clipboardPasteItem(target: Element, text: string) {
  return menuItemById(
    createEditorContextMenuEntriesFromOptions(
      {},
      "en",
      { readClipboardText: () => text },
      {},
      target
    ),
    "markra:context:paste"
  );
}

function clipboardContentPasteItem(
  target: Element,
  content: { html: string; text: string }
) {
  return menuItemById(
    createEditorContextMenuEntriesFromOptions(
      {},
      "en",
      { readClipboardContent: () => content },
      {},
      target
    ),
    "markra:context:paste"
  );
}

function plainTextPasteItem(
  target: Element,
  text: string,
  shortcuts = { pastePlainText: "Mod+Alt+G" }
) {
  return menuItemById(
    createEditorContextMenuEntriesFromOptions(
      {},
      "en",
      { markdownShortcuts: shortcuts, readClipboardText: () => text },
      {},
      target
    ),
    "markra:context:paste-plain-text"
  );
}

describe("editor context menu entries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const view of editorViews.splice(0)) view.destroy();
    document.body.replaceChildren();
  });

  it("pastes through the originating editor with CodeMirror clipboard semantics", async () => {
    const main = createEditor("Main", EditorSelection.cursor(4));
    const side = createEditor(
      "one\ntwo",
      EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4)
      ]),
      [
        EditorState.allowMultipleSelections.of(true),
        EditorView.clipboardInputFilter.of((text) => text.toUpperCase())
      ]
    );

    await Promise.resolve(clipboardPasteItem(side.paper, "alpha\nbeta").onSelect?.());
    expect(main.view.state.doc.toString()).toBe("Main");
    expect(side.view.state.doc.toString()).toBe("ALPHAone\nBETAtwo");
  });

  it("keeps pasted text inside an empty live-preview list item", async () => {
    const doc = "- Alpha\n- ";
    const editor = createEditor(
      doc,
      EditorSelection.cursor(doc.length),
      [history(), liveMarkdown()]
    );

    await Promise.resolve(clipboardPasteItem(editor.paper, "Pasted item").onSelect?.());
    expect(editor.view.state.doc.toString()).toBe("- Alpha\n- Pasted item");
    expect(editor.view.state.selection.main.head).toBe("- Alpha\n- Pasted item".length);
    expect(undo(editor.view)).toBe(true);
    expect(editor.view.state.doc.toString()).toBe(doc);
  });

  it("preserves native rich clipboard content through the editor paste pipeline", async () => {
    const editor = createEditor(
      "",
      EditorSelection.cursor(0),
      [
        liveMarkdown({
          plugins: [codeMirrorClipboardAssetsPlugin()]
        })
      ]
    );

    await Promise.resolve(clipboardContentPasteItem(editor.paper, {
      html: [
        "<p>Mock summary</p>",
        "<ol><li>First <code>choice</code></li><li>Second choice</li></ol>",
        '<p>See <a href="https://example.test/mock-docs">mock docs</a>.</p>'
      ].join(""),
      text: [
        "Mock summary",
        "First choice",
        "Second choice",
        "See [mock docs](https://example.test/mock-docs)."
      ].join("\n")
    }).onSelect?.());

    expect(editor.view.state.doc.toString()).toBe([
      "Mock summary",
      "",
      "1.  First `choice`",
      "2.  Second choice",
      "",
      "See [mock docs](https://example.test/mock-docs)."
    ].join("\n"));
  });

  it("pastes plain text without rich text or code conversion", async () => {
    const code = [
      "const mockValue = items.at(0);",
      "if (mockValue) {",
      "  console.log(mockValue);",
      "}"
    ].join("\n");
    const editor = createEditor(
      "",
      EditorSelection.cursor(0),
      [liveMarkdown({ plugins: [codeMirrorClipboardAssetsPlugin()] })]
    );
    const paste = plainTextPasteItem(editor.paper, code);

    expect(paste.label).toBe("Paste as Plain Text");
    expect(paste.accelerator).toBe("CmdOrCtrl+Alt+G");
    await Promise.resolve(paste.onSelect?.());

    expect(editor.view.state.doc.toString()).toBe(code);
  });

  it("keeps context-menu plain text paste inside a nested editable target", async () => {
    const editor = createEditor("", EditorSelection.cursor(0));
    const nestedContent = document.createElement("div");
    const table = document.createElement("table");
    const cell = table.insertRow().insertCell();
    const input = vi.fn();
    table.setAttribute("contenteditable", "true");
    cell.textContent = "Before";
    nestedContent.className = "cm-content";
    nestedContent.append(table);
    editor.paper.append(nestedContent);
    table.addEventListener("input", input);
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    const paste = plainTextPasteItem(cell, "PASTED");

    await Promise.resolve(paste.onSelect?.());

    expect(cell.textContent).toBe("BeforePASTED");
    expect(input).toHaveBeenCalledTimes(1);
    expect(editor.view.state.doc.toString()).toBe("");
  });

  it("does not change a read-only editor", async () => {
    const doc = "Read only";
    const editor = createEditor(
      doc,
      EditorSelection.cursor(doc.length),
      [EditorState.readOnly.of(true)]
    );

    await Promise.resolve(clipboardPasteItem(editor.paper, " blocked").onSelect?.());
    expect(editor.view.state.doc.toString()).toBe(doc);
  });

  it("does not retarget paste after the originating editor is removed", async () => {
    const main = createEditor("Main", EditorSelection.cursor(4));
    const side = createEditor("Side", EditorSelection.cursor(4));
    const paste = clipboardPasteItem(side.paper, " clipboard text");
    side.paper.remove();

    await Promise.resolve(paste.onSelect?.());
    expect(main.view.state.doc.toString()).toBe("Main");
    expect(side.view.state.doc.toString()).toBe("Side");
  });

  it("offers local image and file import as separate editor commands", () => {
    const importLocalFiles = vi.fn();
    const importLocalImages = vi.fn();
    const entries = createEditorContextMenuEntries({ importLocalFiles, importLocalImages }, "en");
    const imageItem = menuItemById(
      entries,
      "markra:context:import-local-images"
    );
    const fileItem = menuItemById(
      entries,
      "markra:context:import-local-files"
    );

    expect(imageItem.label).toBe("Import Local Images...");
    expect(fileItem.label).toBe("Import Local Files...");

    imageItem.onSelect?.();
    fileItem.onSelect?.();

    expect(importLocalImages).toHaveBeenCalledTimes(1);
    expect(importLocalFiles).toHaveBeenCalledTimes(1);
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

  it("inserts injected clipboard text through the editor before DOM commands", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    const readText = vi.fn().mockResolvedValue("browser clipboard text");
    const readClipboardText = vi.fn().mockResolvedValue("platform clipboard text");
    const insertClipboardText = vi.fn().mockReturnValue(true);
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
        insertClipboardText,
        readClipboardText
      }),
      "markra:context:paste"
    );

    await Promise.resolve(paste.onSelect?.());

    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(insertClipboardText).toHaveBeenCalledWith("platform clipboard text");
    expect(readText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
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
});
