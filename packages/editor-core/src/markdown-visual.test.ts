import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  markdownVisualExtensions,
  markdownVisualFindSearchMatches,
  markdownVisualGetMarkdown,
  markdownVisualGetSelectionContext,
  markdownVisualGetSelectionFormattingState,
  markdownVisualInsertImage,
  markdownVisualInsertImages,
  markdownVisualInsertImagesAtPoint,
  markdownVisualInsertLink,
  markdownVisualInsertSnippet,
  markdownVisualInsertTable,
  markdownVisualRunShortcutAction,
  markdownVisualSetSelectionHeadingLevel,
  markdownVisualClearSelectionFormatting,
  markdownVisualToggleSelectionHighlight,
  markdownVisualReplaceAllSearchMatches,
  markdownVisualReplaceMarkdown,
  markdownVisualReplaceSearchMatch,
  markdownVisualRevealSearchMatch,
  markdownVisualShowSearchMatches
} from "./markdown-visual.ts";

function createMarkdownVisualView(content: string, onMarkdownChange = vi.fn()) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: content,
      extensions: markdownVisualExtensions({
        label: "Markdown editor",
        onMarkdownChange,
        readOnly: false
      })
    })
  });

  return {
    destroy() {
      view.destroy();
      parent.remove();
    },
    onMarkdownChange,
    parent,
    view
  };
}

describe("markdown visual extensions", () => {
  it("renders strong markdown with editable marker offsets", () => {
    const content = "alpha **bold text** omega";
    const editor = createMarkdownVisualView(content);

    try {
      const strongText = editor.parent.querySelector(".markra-cm-strong-text");
      const hiddenMarkers = Array.from(editor.parent.querySelectorAll(".markra-cm-formatting-marker-hidden"));

      expect(strongText?.textContent).toBe("bold text");
      expect(hiddenMarkers.map((marker) => marker.textContent)).toEqual(["**", "**"]);

      const openingMarkerStart = content.indexOf("**");
      const closingMarkerEnd = content.lastIndexOf("**") + 2;

      editor.view.dispatch({ selection: EditorSelection.cursor(openingMarkerStart) });
      expect(editor.view.state.selection.main.head).toBe(openingMarkerStart);
      expect(
        Array.from(editor.parent.querySelectorAll(".markra-cm-formatting-marker-active"))
          .map((marker) => marker.textContent)
      ).toEqual(["**", "**"]);

      editor.view.dispatch({
        changes: {
          from: closingMarkerEnd,
          insert: "!"
        }
      });

      expect(editor.view.state.doc.toString()).toBe("alpha **bold text**! omega");
      expect(editor.onMarkdownChange).toHaveBeenLastCalledWith("alpha **bold text**! omega");
    } finally {
      editor.destroy();
    }
  });

  it("supports document replacement and snippet insertion through the visual controller", () => {
    const editor = createMarkdownVisualView("alpha beta");

    try {
      expect(markdownVisualGetMarkdown(editor.view)).toBe("alpha beta");
      expect(markdownVisualReplaceMarkdown(editor.view, "one two")).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("one two");

      editor.view.dispatch({
        selection: EditorSelection.range(0, 3)
      });
      markdownVisualInsertSnippet(editor.view, "**", "**", "text");

      expect(markdownVisualGetMarkdown(editor.view)).toBe("**one** two");
      expect(editor.view.state.selection.main.from).toBe("**one**".length);
      expect(editor.onMarkdownChange).toHaveBeenLastCalledWith("**one** two");
    } finally {
      editor.destroy();
    }
  });

  it("supports visual search decorations and replacements", () => {
    const editor = createMarkdownVisualView("alpha beta alpha");

    try {
      const matches = markdownVisualFindSearchMatches(editor.view, "alpha");
      expect(matches).toEqual([
        { from: 0, to: 5 },
        { from: 11, to: 16 }
      ]);

      markdownVisualShowSearchMatches(editor.view, matches, 1);

      expect(editor.parent.querySelectorAll(".markra-cm-search-match")).toHaveLength(2);
      expect(editor.parent.querySelector(".markra-cm-search-match-current")?.textContent).toBe("alpha");
      expect(markdownVisualRevealSearchMatch(editor.view, matches[1])).toBe(true);
      expect(editor.view.state.selection.main.from).toBe(11);
      expect(editor.view.state.selection.main.to).toBe(16);

      expect(markdownVisualReplaceSearchMatch(editor.view, matches[1], "gamma")).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("alpha beta gamma");

      const nextMatches = markdownVisualFindSearchMatches(editor.view, "a");
      expect(markdownVisualReplaceAllSearchMatches(editor.view, nextMatches, "A")).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("AlphA betA gAmmA");
    } finally {
      editor.destroy();
    }
  });

  it("inserts markdown links, images, and tables through the visual controller", () => {
    const editor = createMarkdownVisualView("alpha beta");

    try {
      editor.view.dispatch({ selection: EditorSelection.range(0, 5) });
      markdownVisualInsertLink(editor.view);

      expect(markdownVisualGetMarkdown(editor.view)).toBe("[alpha](https://) beta");
      expect(editor.view.state.selection.main.from).toBe("[alpha](".length);
      expect(editor.view.state.selection.main.to).toBe("[alpha](https://".length);

      markdownVisualReplaceMarkdown(editor.view, "");
      markdownVisualInsertLink(editor.view);

      expect(markdownVisualGetMarkdown(editor.view)).toBe("[text](https://)");
      expect(editor.view.state.selection.main.from).toBe("[text](".length);
      expect(editor.view.state.selection.main.to).toBe("[text](https://".length);

      markdownVisualReplaceMarkdown(editor.view, "caption");
      editor.view.dispatch({ selection: EditorSelection.range(0, "caption".length) });
      markdownVisualInsertImage(editor.view);

      expect(markdownVisualGetMarkdown(editor.view)).toBe("![caption](assets/image.png)");
      expect(editor.view.state.selection.main.from).toBe("![caption](".length);
      expect(editor.view.state.selection.main.to).toBe("![caption](assets/image.png".length);

      markdownVisualReplaceMarkdown(editor.view, "");
      markdownVisualInsertImages(editor.view, [
        { alt: "first", src: "assets/first.png" },
        { alt: "second", src: "assets/second.png" }
      ]);

      expect(markdownVisualGetMarkdown(editor.view)).toBe(
        "![first](assets/first.png)\n\n![second](assets/second.png)"
      );

      vi.spyOn(editor.view, "posAtCoords").mockReturnValue(0);
      expect(markdownVisualInsertImagesAtPoint(editor.view, [
        { alt: "dropped", src: "assets/dropped.png" }
      ], { left: 12, top: 34 })).toBe(true);

      expect(markdownVisualGetMarkdown(editor.view)).toBe(
        "![dropped](assets/dropped.png)![first](assets/first.png)\n\n![second](assets/second.png)"
      );

      markdownVisualReplaceMarkdown(editor.view, "");
      markdownVisualInsertTable(editor.view);

      expect(markdownVisualGetMarkdown(editor.view)).toBe("|  |  |\n| --- | --- |\n|  |  |");
      expect(editor.onMarkdownChange).toHaveBeenLastCalledWith("|  |  |\n| --- | --- |\n|  |  |");
    } finally {
      editor.destroy();
    }
  });

  it("reads CodeMirror selection context from the active visual editor", () => {
    const editor = createMarkdownVisualView("alpha beta");

    try {
      editor.view.dispatch({ selection: EditorSelection.range(0, 5) });
      expect(markdownVisualGetSelectionContext(editor.view)).toEqual({
        from: 0,
        source: "selection",
        text: "alpha",
        to: 5
      });

      editor.view.dispatch({ selection: EditorSelection.cursor(7) });
      expect(markdownVisualGetSelectionContext(editor.view)).toEqual({
        cursor: 7,
        from: 0,
        source: "block",
        text: "alpha beta",
        to: 10
      });
    } finally {
      editor.destroy();
    }
  });

  it("runs markdown formatting actions through the visual controller", () => {
    const editor = createMarkdownVisualView("alpha\nbeta");

    try {
      editor.view.dispatch({ selection: EditorSelection.range(0, 5) });
      expect(markdownVisualRunShortcutAction(editor.view, "bold")).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("**alpha**\nbeta");
      expect(markdownVisualGetSelectionFormattingState(editor.view).actions).toContain("bold");

      expect(markdownVisualToggleSelectionHighlight(editor.view)).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("**==alpha==**\nbeta");
      expect(markdownVisualGetSelectionFormattingState(editor.view).actions).toContain("highlight");

      expect(markdownVisualClearSelectionFormatting(editor.view)).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("alpha\nbeta");

      editor.view.dispatch({ selection: EditorSelection.cursor(7) });
      expect(markdownVisualSetSelectionHeadingLevel(editor.view, 2)).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("alpha\n## beta");
      expect(markdownVisualGetSelectionFormattingState(editor.view).headingLevel).toBe(2);

      expect(markdownVisualRunShortcutAction(editor.view, "paragraph")).toBe(true);
      expect(markdownVisualGetMarkdown(editor.view)).toBe("alpha\nbeta");
    } finally {
      editor.destroy();
    }
  });
});
