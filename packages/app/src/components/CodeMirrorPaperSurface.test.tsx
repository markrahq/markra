import {
  defineMarkraPlugin,
  getMarkraDocumentLinksState,
  getMarkraSlashMenuState,
  runMarkraCommand,
  showCodeMirrorAiPreview,
  showCodeMirrorAiSelectionHold,
} from "@markra/editor/codemirror";
import { EditorSelection, Transaction } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { markraEditorReactBridge } from "@markra/editor-react";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeMirrorPaperSurface } from "./CodeMirrorPaperSurface";

describe("CodeMirrorPaperSurface", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("owns Markdown as CodeMirror text and reports document updates", () => {
    const onEditorReady = vi.fn();
    const onMarkdownChange = vi.fn();
    const { container, unmount } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={"# Synthetic\n\nBefore **strong** after"}
        onEditorReady={onEditorReady}
        onMarkdownChange={onMarkdownChange}
        readOnly={false}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0];

    expect(view).toBeInstanceOf(EditorView);
    expect(view.plugin(markraEditorReactBridge)).not.toBeNull();
    expect(container.querySelector(".cm-editor")).not.toBeNull();
    expect(container.querySelector(".cm-markra-strong")?.textContent).toBe(
      "strong",
    );
    expect(view.state.doc.toString()).toBe(
      "# Synthetic\n\nBefore **strong** after",
    );

    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "!" },
      });
    });
    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      "# Synthetic\n\nBefore **strong** after!",
    );

    unmount();
    expect(onEditorReady).toHaveBeenLastCalledWith(null, view);
  });

  it("uses the configured shortcut to paste clipboard text without formatting", async () => {
    const code = [
      "const mockValue = items.at(0);",
      "if (mockValue) {",
      "  console.log(mockValue);",
      "}",
    ].join("\n");
    const onEditorReady = vi.fn();
    const readClipboardText = vi.fn().mockResolvedValue(code);
    render(
      <CodeMirrorPaperSurface
        initialContent=""
        markdownShortcuts={{
          ...defaultMarkdownShortcuts,
          pastePlainText: "Mod+Alt+G",
        }}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        readClipboardText={readClipboardText}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    const handled = fireEvent.keyDown(view.contentDOM, {
      altKey: true,
      code: "KeyG",
      ctrlKey: true,
      key: "g",
    });

    expect(handled).toBe(false);
    await waitFor(() => expect(view.state.doc.toString()).toBe(code));
    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector(".markra-math-render")).toBeNull();
    expect(view.contentDOM.textContent).toContain("const mockValue = items.at(0);");
  });

  it("lets the native V paste event provide plain text without rich conversion", async () => {
    const onEditorReady = vi.fn();
    const readClipboardText = vi.fn().mockResolvedValue(
      "### Mock heading\n\nClick test: after heading",
    );
    render(
      <CodeMirrorPaperSurface
        initialContent=""
        markdownShortcuts={defaultMarkdownShortcuts}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        readClipboardText={readClipboardText}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    const handled = fireEvent.keyDown(view.contentDOM, {
      code: "KeyV",
      ctrlKey: true,
      key: "V",
      shiftKey: true,
    });
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        files: Object.assign([], { item: () => null }),
        getData: (type: string) => {
          if (type === "text/html") return "<h3>Mock heading</h3><p>Click test: after heading</p>";
          if (type === "text/plain") return "### Mock heading\n\nClick test: after heading";

          return "";
        },
        types: ["text/html", "text/plain"],
      },
    });
    view.contentDOM.dispatchEvent(pasteEvent);

    expect(handled).toBe(true);
    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(readClipboardText).not.toHaveBeenCalled();
    await waitFor(() => expect(view.state.doc.toString()).toBe(
      "\\#\\#\\# Mock heading\n\nClick test: after heading",
    ));
    expect(view.dom.querySelector('[role="heading"]')).toBeNull();
    expect(view.contentDOM.textContent).toContain("### Mock heading");
  });

  it("reconfigures read-only state without recreating the editor view", () => {
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="Synthetic"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        readOnly={false}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    expect(view.state.readOnly).toBe(false);
    rerender(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="Synthetic"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        readOnly
      />,
    );

    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
  });

  it("reconfigures automatic heading marker hiding without recreating the editor view", () => {
    const content = "# Synthetic heading";
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    act(() => {
      view.focus();
      view.dispatch({ selection: { anchor: content.indexOf("heading") } });
    });
    expect(view.dom.querySelector(".cm-line")?.textContent).toBe(content);

    rerender(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        hideHeadingMarkersOnFocus
      />,
    );

    act(() => {
      view.focus();
      view.dispatch({ selection: { anchor: content.indexOf("Synthetic") + 2 } });
    });
    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector(".cm-line")?.textContent).toBe(
      "Synthetic heading",
    );
  });

  it("reconfigures code block line numbers without recreating the editor view", () => {
    const content = "```ts\nconst synthetic = true;\n```";
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        showCodeBlockLineNumbers={false}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    expect(
      view.dom.querySelector(".cm-markra-code-content-line"),
    ).not.toHaveAttribute("data-code-line-number");

    rerender(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        showCodeBlockLineNumbers
      />,
    );

    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(
      view.dom.querySelector(".cm-markra-code-content-line"),
    ).toHaveAttribute("data-code-line-number", "1");
  });

  it("reconfigures typewriter mode without recreating the editor view", () => {
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        initialContent={"first\nsecond\nthird"}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        typewriterModeEnabled={false}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    expect(view.dom).not.toHaveAttribute("data-typewriter-mode");

    rerender(
      <CodeMirrorPaperSurface
        initialContent={"first\nsecond\nthird"}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        typewriterModeEnabled
      />,
    );

    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(view.dom).toHaveAttribute("data-typewriter-mode", "true");
  });

  it("reconfigures Vim mode without recreating the editor view", async () => {
    const content = "alpha\nbeta";
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled={false}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    expect(view.scrollDOM).not.toHaveClass("cm-vimMode");

    rerender(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );

    await waitFor(() => {
      expect(view.scrollDOM).toHaveClass("cm-vimMode");
    });
    expect(onEditorReady).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(view.contentDOM, { code: "KeyL", key: "l" });

    expect(view.state.doc.toString()).toBe(content);
    expect(view.state.selection.main.head).toBe(1);

    rerender(
      <CodeMirrorPaperSurface
        initialContent={content}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled={false}
      />,
    );

    await waitFor(() => {
      expect(view.scrollDOM).not.toHaveClass("cm-vimMode");
    });
    expect(onEditorReady).toHaveBeenCalledTimes(1);
  });

  it("shows the active Vim mode in the editor", async () => {
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        initialContent="Synthetic text"
        language="zh-CN"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
      expect(view.dom.querySelector(".markra-vim-hint")).toHaveTextContent(
        "i/a 输入 · # 搜索上一处",
      );
    });

    fireEvent.keyDown(view.contentDOM, { code: "KeyI", key: "i" });
    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--INSERT--",
      );
      expect(view.dom.querySelector(".markra-vim-hint")).toHaveTextContent(
        "Esc 返回普通模式",
      );
    });

    fireEvent.keyDown(view.contentDOM, { code: "Escape", key: "Escape" });
    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
    });

    fireEvent.keyDown(view.contentDOM, { code: "KeyV", key: "v" });
    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--VISUAL--",
      );
      expect(view.dom.querySelector(".markra-vim-hint")).toHaveTextContent(
        "y 复制 · d 删除",
      );
    });
  });

  it("explains a successful Vim previous-word search", async () => {
    const content = "# Synthetic target\n\nSynthetic target";
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent={content}
        language="zh-CN"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
    });

    act(() => {
      view.dispatch({ selection: { anchor: content.indexOf("Synthetic") } });
    });
    fireEvent.keyDown(view.contentDOM, {
      code: "Digit3",
      key: "#",
      shiftKey: true,
    });

    expect(view.state.selection.main.head).toBe(
      content.lastIndexOf("Synthetic"),
    );
    expect(view.dom.querySelector(".markra-vim-feedback")).toHaveTextContent(
      "已跳到上一处“Synthetic” · 按 i 编辑",
    );
  });

  it("names the heading word when Vim searches from a hidden marker", async () => {
    const content = "# Synthetic target\n\nSynthetic target";
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent={content}
        language="zh-CN"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
    });

    act(() => {
      view.dispatch({ selection: { anchor: 0 } });
    });
    fireEvent.keyDown(view.contentDOM, {
      code: "Digit3",
      key: "#",
      shiftKey: true,
    });

    expect(view.state.selection.main.head).toBe(
      content.lastIndexOf("Synthetic"),
    );
    expect(view.dom.querySelector(".markra-vim-feedback")).toHaveTextContent(
      "已跳到上一处“Synthetic” · 按 i 编辑",
    );
  });

  it("replaces raw Vim regex errors with a friendly search message", async () => {
    const content = "# Synthetic target";
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent={content}
        language="zh-CN"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
    });

    act(() => {
      view.dispatch({ selection: { anchor: content.indexOf("Synthetic") } });
    });
    fireEvent.keyDown(view.contentDOM, {
      code: "Digit3",
      key: "#",
      shiftKey: true,
    });

    expect(view.state.selection.main.head).toBe(content.indexOf("Synthetic"));
    expect(view.dom.querySelector(".markra-vim-feedback")).toHaveTextContent(
      "未找到上一处“Synthetic” · 按 i 编辑",
    );
    expect(view.dom.querySelector(".cm-vim-panel")).not.toHaveTextContent(
      "set nopcre",
    );
  });

  it("keeps a heading marker insertion at the Vim insert caret", async () => {
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent="# Synthetic heading"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
    });

    fireEvent.keyDown(view.contentDOM, { code: "KeyI", key: "i" });
    expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
      "--INSERT--",
    );

    act(() => {
      view.dispatch({
        annotations: Transaction.userEvent.of("input.type"),
        changes: { from: 0, insert: "#" },
        selection: { anchor: 1 },
      });
    });

    expect(view.state.doc.toString()).toBe("## Synthetic heading");
    expect(view.state.selection.main.head).toBe(1);
    expect(view.contentDOM).toHaveTextContent("## Synthetic heading");
  });

  it("reveals preview source under the initial Vim normal cursor", async () => {
    const onEditorReady = vi.fn();
    const { container, rerender } = render(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent="$x^2$"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toHaveTextContent(
        "--NORMAL--",
      );
      expect(container.querySelector(".markra-math-render-inline")).toBeNull();
      expect(view.contentDOM).toHaveTextContent("$x^2$");
    });

    rerender(
      <CodeMirrorPaperSurface
        autoFocus
        initialContent="$x^2$"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        vimModeEnabled={false}
      />,
    );

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-vim-panel")).toBeNull();
      expect(
        container.querySelector(".markra-math-render-inline"),
      ).not.toBeNull();
    });
  });

  it("synchronizes host Markdown changes without recreating the editor view", () => {
    const onEditorReady = vi.fn();
    const onMarkdownChange = vi.fn();
    const { rerender } = render(
      <CodeMirrorPaperSurface
        initialContent="Before"
        onEditorReady={onEditorReady}
        onMarkdownChange={onMarkdownChange}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    rerender(
      <CodeMirrorPaperSurface
        initialContent="After"
        onEditorReady={onEditorReady}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    expect(onEditorReady).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("After");
  });

  it("adapts Markra workspace files into plugin-driven document links", () => {
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        documentPath="/synthetic/current.md"
        initialContent="Open [[plug"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        workspaceFiles={[
          {
            name: "Plugins.md",
            path: "/synthetic/docs/Plugins.md",
            relativePath: "docs/Plugins.md",
          },
        ]}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    act(() => {
      view.dispatch({
        selection: EditorSelection.cursor(view.state.doc.length),
      });
    });
    const completion = getMarkraDocumentLinksState(view);

    expect(completion.items.map((item) => item.label)).toEqual(["Plugins"]);
    act(() => completion.items[0]?.run());
    expect(view.state.doc.toString()).toBe(
      "Open [Plugins](./docs/Plugins.md)",
    );
  });

  it("exposes plugin-contributed slash commands", () => {
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="/"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(1) });
    });

    expect(getMarkraSlashMenuState(view)).toMatchObject({
      open: true,
      query: "",
    });
    expect(
      getMarkraSlashMenuState(view).actions.map((action) => action.command),
    ).toEqual(
      expect.arrayContaining([
        "block.callout",
        "block.table",
        "block.task-list",
        "insert.today",
      ]),
    );
  });

  it("inserts today's local date from the slash command", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2031, 4, 6, 10, 30));
    const onEditorReady = vi.fn();

    try {
      render(
        <CodeMirrorPaperSurface
          autoFocus={false}
          initialContent="Published: "
          onEditorReady={onEditorReady}
          onMarkdownChange={() => {}}
        />,
      );
      const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
      act(() => {
        view.dispatch({
          selection: EditorSelection.cursor(view.state.doc.length),
        });
      });

      expect(runMarkraCommand(view, "insert.today")).toBe(true);
      expect(view.state.doc.toString()).toBe("Published: 2031-05-06");
      expect(view.state.selection.main.head).toBe(view.state.doc.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts host plugins and renders their toolbar actions", () => {
    const onEditorReady = vi.fn();
    const plugin = defineMarkraPlugin({
      id: "synthetic.host-plugin",
      commands: [
        {
          id: "synthetic.append",
          label: "Append synthetic marker",
          run(view) {
            view.dispatch({
              changes: { from: view.state.doc.length, insert: "!" },
            });
            return true;
          },
        },
      ],
      ui: [{ command: "synthetic.append", placement: "toolbar" }],
    });
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="Synthetic"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        plugins={[plugin]}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    fireEvent.click(
      screen.getByRole("button", { name: "Append synthetic marker" }),
    );

    expect(view.state.doc.toString()).toBe("Synthetic!");
  });

  it("keeps a host plugin context menu open while its action is pressed", () => {
    const onEditorReady = vi.fn();
    const plugin = defineMarkraPlugin({
      id: "synthetic.context-plugin",
      commands: [
        {
          id: "synthetic.context-append",
          label: "Append from context",
          run(view) {
            view.dispatch({
              changes: { from: view.state.doc.length, insert: "?" },
            });
            return true;
          },
        },
      ],
      ui: [
        { command: "synthetic.context-append", placement: "context-menu" },
      ],
    });
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="Synthetic"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        plugins={[plugin]}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    fireEvent.contextMenu(view.dom, { clientX: 40, clientY: 50 });
    const action = screen.getByRole("menuitem", {
      name: "Append from context",
    });

    fireEvent.pointerDown(action);
    expect(action).toBeInTheDocument();
    fireEvent.click(action);

    expect(view.state.doc.toString()).toBe("Synthetic?");
  });

  it("mounts per-block add and drag controls and opens the shortcut menu", async () => {
    const onEditorReady = vi.fn();
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={"First\n\nSecond"}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const addButtons = container.querySelectorAll<HTMLButtonElement>(
      ".markra-block-add-button",
    );
    const dragHandles = container.querySelectorAll<HTMLButtonElement>(
      ".markra-block-drag-handle",
    );

    expect(addButtons).toHaveLength(2);
    expect(dragHandles).toHaveLength(2);
    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 40,
      left: 24,
      right: 24,
      top: 20,
    });
    fireEvent.click(addButtons[0]!);
    expect(getMarkraSlashMenuState(view)).toMatchObject({
      open: true,
      source: "virtual",
    });
    expect(view.state.doc.toString()).toBe("First\n\n\n\nSecond");
    expect(
      await screen.findByRole("menu", { name: "Slash commands" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Callout" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Table" })).toBeInTheDocument();
  });

  it("keeps block controls before the heading-level control while editing", () => {
    const onEditorReady = vi.fn();
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="## Synthetic heading"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    act(() => {
      view.focus();
      view.dispatch({
        selection: EditorSelection.cursor(view.state.doc.length),
      });
    });

    const line = container.querySelector<HTMLElement>(".cm-markra-h2");
    const toolbar = line?.querySelector<HTMLElement>(
      ":scope > .cm-markra-block-toolbar",
    );
    const levelControl = line?.querySelector<HTMLElement>(
      ":scope > .markra-heading-level-control",
    );

    expect(toolbar).not.toBeNull();
    expect(levelControl).not.toBeNull();
    expect(
      toolbar!.compareDocumentPosition(levelControl!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("enables Markra extended Markdown previews without rewriting source", () => {
    const onEditorReady = vi.fn();
    const doc = [
      "---",
      "title: Synthetic",
      "---",
      "",
      "> [!NOTE]",
      "> Synthetic detail",
      "",
      "Formula $x^2$ and footnote[^one].",
      "",
      "[^one]: Synthetic footnote.",
      "",
      "<kbd>Mod</kbd>",
      "",
      "Edit",
    ].join("\n");
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    expect(container.querySelector(".markra-callout-header")).not.toBeNull();
    expect(container.querySelector(".cm-markra-frontmatter")).not.toBeNull();
    expect(container.querySelector(".markra-math-render-inline .katex")).not.toBeNull();
    expect(container.querySelector(".cm-markra-footnote-reference")).not.toBeNull();
    expect(container.querySelector(".cm-markra-inline-html")?.tagName).toBe("KBD");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("honors the GitHub alert preference and resolves HTML image assets", () => {
    const onEditorReady = vi.fn();
    const resolveImageSrc = vi.fn((source: string) =>
      source === "./mock.png" ? "https://assets.example.test/mock.png" : source,
    );
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        extendedSyntax={{ githubAlerts: false, highlight: true }}
        initialContent={'> [!NOTE]\n> Detail\n\n<div><img src="./mock.png"></div>\n\nEdit'}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        resolveImageSrc={resolveImageSrc}
      />,
    );

    expect(container.querySelector(".markra-callout-header")).toBeNull();
    expect(container.querySelector(".markra-html-node img")?.getAttribute("src")).toBe(
      "https://assets.example.test/mock.png",
    );
    expect(resolveImageSrc).toHaveBeenCalledWith("./mock.png");
  });

  it("resolves image assets inside visual table cells", () => {
    const resolveImageSrc = vi.fn((source: string) =>
      source === "./mock.png" ? "https://assets.example.test/mock.png" : source,
    );
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={[
          "| Name | Media |",
          "| --- | --- |",
          "| Row | ![Synthetic image](./mock.png) |",
          "",
          "Edit",
        ].join("\n")}
        onEditorReady={() => {}}
        onMarkdownChange={() => {}}
        resolveImageSrc={resolveImageSrc}
      />,
    );

    expect(
      container.querySelector(".cm-markra-table img")?.getAttribute("src"),
    ).toBe("https://assets.example.test/mock.png");
    expect(resolveImageSrc).toHaveBeenCalledWith("./mock.png");
  });

  it("hot-reconfigures the table width preference", () => {
    const onEditorReady = vi.fn();
    const doc = "| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n\nEdit";
    const { container, rerender } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        tableColumnWidthMode="even"
      />,
    );

    expect(container.querySelector(".cm-markra-table")?.getAttribute("data-width-mode")).toBe("even");
    rerender(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        tableColumnWidthMode="auto"
      />,
    );
    expect(container.querySelector(".cm-markra-table")?.getAttribute("data-width-mode")).toBe("auto");
  });

  it("reports text selections and the active outline index", () => {
    const onActiveOutlineIndexChange = vi.fn();
    const onEditorReady = vi.fn();
    const onTextSelectionChange = vi.fn();
    const doc = "# One\n\nAlpha\n\n## Two\n\nBeta";
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onActiveOutlineIndexChange={onActiveOutlineIndexChange}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        onTextSelectionChange={onTextSelectionChange}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const alpha = doc.indexOf("Alpha");

    act(() => {
      view.dispatch({
        selection: EditorSelection.range(alpha, alpha + "Alpha".length),
      });
    });
    expect(onTextSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: alpha,
        source: "selection",
        text: "Alpha",
        to: alpha + "Alpha".length,
      }),
    );
    expect(onActiveOutlineIndexChange).toHaveBeenLastCalledWith(0);

    act(() => {
      view.dispatch({
        selection: EditorSelection.cursor(doc.indexOf("Beta")),
      });
    });
    expect(onTextSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: doc.indexOf("Beta"),
        source: "block",
        text: "Beta",
        to: doc.indexOf("Beta") + "Beta".length,
      }),
    );
    expect(onActiveOutlineIndexChange).toHaveBeenLastCalledWith(1);
  });

  it("does not publish transient AI selections during IME composition", async () => {
    const onEditorReady = vi.fn();
    const onTextSelectionChange = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="Synthetic IME text"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        onTextSelectionChange={onTextSelectionChange}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    view.focus();
    const inputLine = view.dom.querySelector<HTMLElement>(".cm-line");
    if (!inputLine) throw new Error("Expected a CodeMirror input line");
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      data: "",
    }));
    inputLine.append("测");
    view.contentDOM.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "测",
      inputType: "insertCompositionText",
    }));
    await waitFor(() => expect(view.composing).toBe(true));
    onTextSelectionChange.mockClear();

    act(() => {
      view.dispatch({ selection: EditorSelection.range(10, 13) });
    });

    expect(onTextSelectionChange).not.toHaveBeenCalled();
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      data: "测",
    }));
  });

  it("publishes IME text once after composition ends", async () => {
    const onEditorReady = vi.fn();
    const onMarkdownChange = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={"Edit\n\n## Stable block"}
        onEditorReady={onEditorReady}
        onMarkdownChange={onMarkdownChange}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    view.focus();
    const inputLine = view.dom.querySelector<HTMLElement>(".cm-line");
    if (!inputLine) throw new Error("Expected a CodeMirror input line");

    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      data: "",
    }));
    inputLine.append("测");
    view.contentDOM.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "测",
      inputType: "insertCompositionText",
    }));

    await waitFor(() => {
      expect(view.composing).toBe(true);
      expect(view.state.doc.toString()).toBe("Edit测\n\n## Stable block");
    });
    expect(onMarkdownChange).not.toHaveBeenCalled();

    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      data: "测",
    }));

    await waitFor(() => {
      expect(onMarkdownChange).toHaveBeenCalledTimes(1);
      expect(onMarkdownChange).toHaveBeenLastCalledWith(
        "Edit测\n\n## Stable block",
      );
    });
  });

  it("keeps an image mounted while controlled Markdown accepts IME text", async () => {
    const onEditorReady = vi.fn();
    const initialContent = [
      "Compose",
      "",
      "![Synthetic image](https://example.test/image.png)",
    ].join("\n");

    function ControlledSurface() {
      const [content, setContent] = useState(initialContent);
      return (
        <CodeMirrorPaperSurface
          autoFocus={false}
          initialContent={content}
          onEditorReady={onEditorReady}
          onMarkdownChange={setContent}
          resolveImageSrc={(source) => source}
        />
      );
    }

    const { container } = render(<ControlledSurface />);
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const inputLine = view.dom.querySelector<HTMLElement>(".cm-line");
    const image = container.querySelector<HTMLImageElement>(
      ".cm-markra-image",
    );
    if (!inputLine || !image) {
      throw new Error("Expected the input line and rendered image");
    }

    await Promise.resolve();
    view.focus();
    let composedText = "";
    for (const character of ["中", "文"]) {
      composedText += character;
      const currentInputLine =
        view.dom.querySelector<HTMLElement>(".cm-line");
      if (!currentInputLine) throw new Error("Expected the input line");
      await act(async () => {
        view.contentDOM.dispatchEvent(new CompositionEvent(
          "compositionstart",
          { bubbles: true, data: "" },
        ));
        currentInputLine.append(character);
        view.contentDOM.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: character,
          inputType: "insertCompositionText",
        }));
      });
      await waitFor(() => {
        expect(view.composing).toBe(true);
        expect(view.state.doc.toString()).toContain(
          `Compose${composedText}`,
        );
      });
      expect(container.querySelector(".cm-markra-image")).toBe(image);
      expect(image.isConnected).toBe(true);
      await act(async () => {
        view.contentDOM.dispatchEvent(new CompositionEvent(
          "compositionend",
          { bubbles: true, data: character },
        ));
      });
      await waitFor(() => expect(view.composing).toBe(false));
      expect(container.querySelector(".cm-markra-image")).toBe(image);
      expect(image.isConnected).toBe(true);
    }

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("Compose中文");
    });
    expect(container.querySelector(".cm-markra-image")).toBe(image);
  });

  it("keeps AI selection context out of editable fenced code", () => {
    const onEditorReady = vi.fn();
    const onTextSelectionChange = vi.fn();
    const source = "```ts\nconst synthetic = true;\n```\n\nEdit";
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={source}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        onTextSelectionChange={onTextSelectionChange}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    view.focus();
    onTextSelectionChange.mockClear();

    act(() => {
      const from = source.indexOf("synthetic");
      view.dispatch({ selection: EditorSelection.range(from, from + 9) });
    });

    expect(onTextSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it("hosts AI previews and held selections on source positions", () => {
    const onEditorReady = vi.fn();
    const doc = "Before Original After";
    const { container } = render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const from = doc.indexOf("Original");

    act(() => {
      showCodeMirrorAiSelectionHold(view, {
        from,
        source: "selection",
        text: "Original",
        to: from + "Original".length,
      });
      showCodeMirrorAiPreview(view, {
        from,
        original: "Original",
        replacement: "Improved",
        to: from + "Original".length,
        type: "replace",
      });
    });

    expect(container.querySelector(".markra-ai-selection-hold")?.textContent).toContain("Original");
    expect(container.querySelector(".markra-ai-preview-insert")?.textContent).toContain("Improved");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("routes pasted image files through Markra's existing save callback", async () => {
    const onEditorReady = vi.fn();
    const onSaveClipboardImage = vi.fn().mockResolvedValue({
      alt: "Synthetic image",
      src: "assets/synthetic.png",
    });
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent=""
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        onSaveClipboardImage={onSaveClipboardImage}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const image = new File([new Uint8Array([1])], "Synthetic.png", {
      type: "image/png",
    });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: Object.assign([image], { item: () => image }),
        getData: () => "",
      },
    });

    act(() => {
      view.contentDOM.dispatchEvent(event);
    });

    await waitFor(() => expect(onSaveClipboardImage).toHaveBeenCalledWith(image));
    await waitFor(() => {
      expect(view.state.doc.toString()).toBe(
        "![Synthetic image](assets/synthetic.png)",
      );
    });
  });

  it("routes local attachments and external URLs through Markra host callbacks", () => {
    const onEditorReady = vi.fn();
    const openExternalUrl = vi.fn();
    const openLocalAttachment = vi.fn();
    const doc = [
      "[Attachment](assets/synthetic.pdf)",
      "[Website](https://example.test/docs)",
      "[Unsafe](javascript:alert%281%29)",
    ].join("\n\n");
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        openExternalUrl={openExternalUrl}
        openLocalAttachment={openLocalAttachment}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    act(() => {
      view.dispatch({
        selection: EditorSelection.cursor(doc.indexOf("Attachment")),
      });
      expect(runMarkraCommand(view, "link.open")).toBe(true);
    });
    expect(openLocalAttachment).toHaveBeenCalledWith("assets/synthetic.pdf");
    expect(openExternalUrl).not.toHaveBeenCalled();

    act(() => {
      view.dispatch({
        selection: EditorSelection.cursor(doc.indexOf("Website")),
      });
      expect(runMarkraCommand(view, "link.open")).toBe(true);
    });
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.test/docs");

    act(() => {
      view.dispatch({
        selection: EditorSelection.cursor(doc.indexOf("Unsafe")),
      });
      expect(runMarkraCommand(view, "link.open")).toBe(false);
    });
    expect(openExternalUrl).toHaveBeenCalledTimes(1);
  });

  it("routes modifier-clicked visual table links through the same host callback", () => {
    const onEditorReady = vi.fn();
    const openExternalUrl = vi.fn();
    const doc = [
      "| Name | Link |",
      "| --- | --- |",
      "| Row | [Synthetic alt](https://example.test/guide) |",
    ].join("\n");
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent={doc}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        openExternalUrl={openExternalUrl}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;
    const link = view.dom.querySelector<HTMLAnchorElement>(
      ".cm-markra-table tbody a",
    );

    expect(link).not.toBeNull();
    act(() => {
      link?.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        ctrlKey: true,
      }));
    });

    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://example.test/guide",
    );
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("opens and applies CodeMirror spellcheck suggestions with the configured shortcut", async () => {
    const onEditorReady = vi.fn();
    const spellchecker = {
      check: (word: string) => word !== "mispell",
      suggest: (word: string) => word === "mispell" ? ["misspell"] : [],
    };
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="A mispell here"
        language="en"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        spellcheckEnabled
        spellchecker={spellchecker}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-markra-spellcheck-error")).not.toBeNull();
    });
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(4) });
    });
    const shortcut = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: ".",
    });
    act(() => {
      expect(runScopeHandlers(view, shortcut, "editor")).toBe(true);
    });

    expect(screen.getByRole("menu", { name: "Spelling suggestions" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace with misspell" }));
    expect(view.state.doc.toString()).toBe("A misspell here");
    expect(screen.queryByRole("menu", { name: "Spelling suggestions" })).toBeNull();
  });

  it("adds a CodeMirror spellcheck word to Markra's ignored-word preferences", async () => {
    const onAddSpellcheckIgnoredWord = vi.fn();
    const onEditorReady = vi.fn();
    render(
      <CodeMirrorPaperSurface
        autoFocus={false}
        initialContent="mispell"
        language="en"
        onAddSpellcheckIgnoredWord={onAddSpellcheckIgnoredWord}
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        spellcheckEnabled
        spellchecker={{
          check: () => false,
          suggest: () => [],
        }}
      />,
    );
    const view = onEditorReady.mock.calls[0]?.[0] as EditorView;

    await waitFor(() => {
      expect(view.dom.querySelector(".cm-markra-spellcheck-error")).not.toBeNull();
    });
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(2) });
      expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
        bubbles: true,
        ctrlKey: true,
        key: ".",
      }), "editor")).toBe(true);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: 'Add "mispell" to whitelist' }));

    expect(onAddSpellcheckIgnoredWord).toHaveBeenCalledWith("mispell");
    expect(view.dom.querySelector(".cm-markra-spellcheck-error")).toBeNull();
  });
});
