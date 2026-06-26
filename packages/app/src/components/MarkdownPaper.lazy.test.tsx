import { render } from "@testing-library/react";
import { act } from "react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { MarkdownPaper } from "./MarkdownPaper";

describe("MarkdownPaper visual editor", () => {
  it("renders the CodeMirror visual editor surface", () => {
    const { container } = render(
      <MarkdownPaper
        initialContent=""
        onEditorReady={() => {}}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    expect(container.querySelector('[data-editor-engine="codemirror"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="markdown-codemirror-editor"]')).toBeInTheDocument();
    expect(container.querySelector('[data-editor-engine="codemirror-loading"]')).not.toBeInTheDocument();
  });

  it("keeps markdown markers editable while rendering strong text visually", () => {
    const content = "alpha **bold text** omega";
    const handleMarkdownChange = vi.fn();
    const { container } = render(
      <MarkdownPaper
        initialContent={content}
        onEditorReady={() => {}}
        onMarkdownChange={handleMarkdownChange}
        revision={0}
      />
    );
    const shell = container.querySelector<HTMLElement>('[data-testid="markdown-codemirror-editor"]');

    expect(shell).toBeInTheDocument();

    const view = EditorView.findFromDOM(shell!);
    if (!view) throw new Error("Expected the CodeMirror visual editor to mount an editor view.");

    expect(shell!.querySelector(".markra-cm-strong-text")?.textContent).toBe("bold text");
    expect(
      Array.from(shell!.querySelectorAll(".markra-cm-formatting-marker-hidden"))
        .map((marker) => marker.textContent)
    ).toEqual(["**", "**"]);

    const openingMarkerStart = content.indexOf("**");
    const closingMarkerEnd = content.lastIndexOf("**") + 2;

    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(openingMarkerStart) });
    });
    expect(view.state.selection.main.head).toBe(openingMarkerStart);
    expect(
      Array.from(shell!.querySelectorAll(".markra-cm-formatting-marker-active"))
        .map((marker) => marker.textContent)
    ).toEqual(["**", "**"]);

    act(() => {
      view.dispatch({
        changes: {
          from: closingMarkerEnd,
          insert: "!"
        }
      });
    });

    expect(view.state.doc.toString()).toBe("alpha **bold text**! omega");
    expect(handleMarkdownChange).toHaveBeenLastCalledWith("alpha **bold text**! omega");
  });
});
