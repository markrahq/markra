import { act, render, screen, waitFor } from "@testing-library/react";
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
  it("renders editable markdown with CodeMirror source highlighting", () => {
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

    replaceCodeMirrorDoc(view, "# Changed");

    expect(handleChange).toHaveBeenCalledWith("# Changed");
  });

  it("applies visible Markra token classes to common Markdown syntax", async () => {
    const content = [
      "# Title",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "- Item",
      "Text with `code`, [link](https://example.test), and **strong text**."
    ].join("\n");

    const { container } = render(
      <MarkdownSourceEditor
        content={content}
        onChange={() => {}}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".markdown-source-token-heading")).toHaveTextContent("Title");
      expect(container.querySelector(".markdown-source-token-code-fence")).toHaveTextContent("```");
      expect(container.querySelector(".markdown-source-token-code")).toHaveTextContent("const answer = 42;");
      expect(container.querySelector(".markdown-source-token-list-marker")).toHaveTextContent("-");
      expect(container.querySelector(".markdown-source-token-inline-code")).toHaveTextContent("code");
      expect(container.querySelector(".markdown-source-token-link")).toHaveTextContent("link");
      expect(container.querySelector(".markdown-source-token-emphasis")).toHaveTextContent("strong text");
    });
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

  it("highlights GitHub-style alert markers in CodeMirror source mode", async () => {
    const { container } = render(
      <MarkdownSourceEditor
        content="> [!TIP]\n> Keep notes portable."
        onChange={() => {}}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".markdown-source-token-callout")).toHaveTextContent("[!TIP]");
      expect(container.querySelector(".markdown-source-token-quote-marker")).toHaveTextContent(">");
    });
  });

  it("leaves GitHub-style alert markers plain when the extension is disabled", () => {
    const { container } = render(
      <MarkdownSourceEditor
        content="> [!TIP]\n> Keep notes portable."
        extendedSyntax={{
          githubAlerts: false,
          highlight: true
        }}
        onChange={() => {}}
      />
    );

    expect(container.querySelector(".markdown-source-token-callout")).not.toBeInTheDocument();
    expect(container.querySelector(".markdown-source-token-quote-marker")).toHaveTextContent(">");
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
});
