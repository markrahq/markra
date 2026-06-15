import { createEditorContextMenuEntries } from "./context-menu-items";
import type { ContextMenuEntry, ContextMenuItem } from "../components/ContextMenu";

function menuItemById(entries: ContextMenuEntry[], id: string): ContextMenuItem {
  const item = entries.find((entry) => entry.kind === "item" && entry.id === id);
  if (!item || item.kind !== "item") throw new Error(`Menu item not found: ${id}`);

  return item;
}

describe("editor context menu entries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
