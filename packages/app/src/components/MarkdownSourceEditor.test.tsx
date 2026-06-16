import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redo, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";

function getMarkdownSourceView(container: HTMLElement) {
  const shell = container.querySelector<HTMLElement>('[data-testid="markdown-source-editor"]');
  expect(shell).toBeInTheDocument();

  const view = EditorView.findFromDOM(shell!);
  if (!view) {
    throw new Error("Expected the markdown source editor to use CodeMirror.");
  }

  return view;
}

function replaceCodeMirrorDoc(view: EditorView, value: string) {
  act(() => {
    view.dispatch({
      changes: {
        from: 0,
        insert: value,
        to: view.state.doc.length
      }
    });
  });
}

describe("MarkdownSourceEditor", () => {
  it("renders editable markdown with lightweight CodeMirror source highlighting", async () => {
    const content = [
      "# Title",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "- Item"
    ].join("\n");
    const handleChange = vi.fn();

    const { container } = render(
      <MarkdownSourceEditor
        content={content}
        onChange={handleChange}
      />
    );
    const view = getMarkdownSourceView(container);
    const sourceEditor = screen.getByRole("textbox", { name: "Markdown source" });

    expect(sourceEditor.tagName).not.toBe("TEXTAREA");
    expect(view.state.doc.toString()).toBe(content);
    expect(container.querySelector(".cm-editor")).toBeInTheDocument();
    expect(container.querySelector(".cm-content")).toHaveTextContent("const answer = 42;");
    await waitFor(() => {
      expect(container.querySelector(".cm-line span[class]")).toBeInTheDocument();
    });

    replaceCodeMirrorDoc(view, "# Changed");

    expect(handleChange).toHaveBeenCalledWith("# Changed");
  });

  it("keeps source scrolling vertical without pane-level horizontal scroll", () => {
    const { container } = render(
      <MarkdownSourceEditor
        content="# Source"
        onChange={() => {}}
      />
    );

    expect(container.querySelector(".paper-scroll")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-x-hidden",
      "overflow-y-auto"
    );
  });

  it("keeps literal markdown punctuation unchanged while editing", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <MarkdownSourceEditor
        content=""
        onChange={handleChange}
      />
    );
    const view = getMarkdownSourceView(container);

    replaceCodeMirrorDoc(view, "**");

    expect(view.state.doc.toString()).toBe("**");
    expect(handleChange).toHaveBeenLastCalledWith("**");
    expect(handleChange).not.toHaveBeenCalledWith("\\*\\*");
  });

  it("updates CodeMirror when content changes outside the editor", () => {
    const handleChange = vi.fn();
    const { container, rerender } = render(
      <MarkdownSourceEditor
        content="# First"
        onChange={handleChange}
      />
    );
    const view = getMarkdownSourceView(container);

    replaceCodeMirrorDoc(view, "# Local");
    expect(view.state.doc.toString()).toBe("# Local");

    rerender(
      <MarkdownSourceEditor
        content="# External"
        onChange={handleChange}
      />
    );

    expect(view.state.doc.toString()).toBe("# External");
  });

  it("keeps source edits undoable and redoable", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <MarkdownSourceEditor
        content=""
        onChange={handleChange}
      />
    );
    const view = getMarkdownSourceView(container);

    replaceCodeMirrorDoc(view, "# Changed");
    expect(view.state.doc.toString()).toBe("# Changed");

    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("");

    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("# Changed");
    expect(handleChange).toHaveBeenLastCalledWith("# Changed");
  });

  it("routes undo and redo shortcuts to shared history handlers when provided", () => {
    const handleRedo = vi.fn();
    const handleUndo = vi.fn();
    const { container } = render(
      <MarkdownSourceEditor
        content="# Shared history"
        onChange={() => {}}
        onRedo={handleRedo}
        onUndo={handleUndo}
      />
    );
    const view = getMarkdownSourceView(container);

    fireEvent.keyDown(view.contentDOM, { ctrlKey: true, key: "z" });
    expect(handleUndo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(view.contentDOM, { ctrlKey: true, key: "y" });
    expect(handleRedo).toHaveBeenCalledTimes(1);
  });

  it("keeps source mode read-only when requested", () => {
    const { container } = render(
      <MarkdownSourceEditor
        content="# Read-only"
        onChange={() => {}}
        readOnly
      />
    );
    getMarkdownSourceView(container);
    const sourceEditor = screen.getByRole("textbox", { name: "Markdown source" });

    expect(sourceEditor).toHaveAttribute("aria-readonly", "true");
    expect(sourceEditor).toHaveAttribute("contenteditable", "false");
  });

  it("selects exact search matches in source mode", async () => {
    const { container } = render(
      <MarkdownSourceEditor
        content="alpha, beta，gamma"
        searchMatches={[{ from: 5, to: 6 }]}
        searchActiveIndex={0}
        onChange={() => {}}
      />
    );
    const view = getMarkdownSourceView(container);

    await waitFor(() => {
      expect(view.state.selection.main.from).toBe(5);
      expect(view.state.selection.main.to).toBe(6);
    });
  });

  it("updates the selected source search match when active index changes", async () => {
    const { container, rerender } = render(
      <MarkdownSourceEditor
        content="alpha beta gamma"
        searchMatches={[{ from: 0, to: 5 }, { from: 11, to: 16 }]}
        searchActiveIndex={0}
        onChange={() => {}}
      />
    );
    const view = getMarkdownSourceView(container);

    await waitFor(() => {
      expect(view.state.selection.main.from).toBe(0);
      expect(view.state.selection.main.to).toBe(5);
    });

    rerender(
      <MarkdownSourceEditor
        content="alpha beta gamma"
        searchMatches={[{ from: 0, to: 5 }, { from: 11, to: 16 }]}
        searchActiveIndex={1}
        onChange={() => {}}
      />
    );

    await waitFor(() => {
      expect(view.state.selection.main.from).toBe(11);
      expect(view.state.selection.main.to).toBe(16);
    });
  });
});
