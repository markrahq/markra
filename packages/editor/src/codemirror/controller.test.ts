import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, redo, undo } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import {
  findCodeMirrorSearchMatches,
  insertCodeMirrorMarkdownImage,
  insertCodeMirrorMarkdownImages,
  insertCodeMirrorMarkdownLink,
  insertCodeMirrorMarkdownLinks,
  insertCodeMirrorMarkdownSnippet,
  insertCodeMirrorMarkdownTable,
  isCodeMirrorMarkdownEquivalent,
  readCodeMirrorAiSelectionContext,
  readCodeMirrorHeadingAnchors,
  readCodeMirrorSectionAnchors,
  readCodeMirrorTableAnchors,
  replaceAllCodeMirrorSearchMatches,
  replaceCodeMirrorMarkdown,
  replaceCodeMirrorSearchMatch,
  updateCodeMirrorHeadingAnchors,
} from "./controller.ts";
import { markraLanguage } from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  selection = EditorSelection.cursor(0),
  readOnly = false,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        markraLanguage,
        EditorState.readOnly.of(readOnly),
      ],
      selection,
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("CodeMirror editor controller", () => {
  it("replaces raw Markdown while preserving a bounded cursor", () => {
    const view = createView("Before", EditorSelection.cursor(5));

    expect(replaceCodeMirrorMarkdown(view, "# After", { addToHistory: false })).toBe(
      true,
    );
    expect(view.state.doc.toString()).toBe("# After");
    expect(view.state.selection.main.head).toBe(5);
  });

  it("allows application document replacement while user editing is read-only", () => {
    const view = createView("Before", EditorSelection.cursor(0), true);

    expect(replaceCodeMirrorMarkdown(view, "After")).toBe(true);
    expect(view.state.doc.toString()).toBe("After");
  });

  it("compares normalized Markdown without parsing away source syntax", () => {
    const view = createView("# Synthetic  \r\n\r\nBody\t\r\n");

    expect(isCodeMirrorMarkdownEquivalent(view, "# Synthetic\n\nBody")).toBe(true);
    expect(isCodeMirrorMarkdownEquivalent(view, "# Different\n\nBody")).toBe(false);
  });

  it("keeps external reloads out of history and explicit app edits undoable", () => {
    const view = createView("Before", EditorSelection.cursor(4));

    expect(replaceCodeMirrorMarkdown(view, "Reloaded")).toBe(true);
    expect(undo(view)).toBe(false);

    expect(replaceCodeMirrorMarkdown(view, "Edited", { addToHistory: true })).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Reloaded");
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Edited");
  });

  it("repairs a missing shared-history baseline for equivalent content", () => {
    const view = createView("Before", EditorSelection.cursor(3));

    expect(replaceCodeMirrorMarkdown(view, "After")).toBe(true);

    expect(
      replaceCodeMirrorMarkdown(view, "After", {
        addToHistory: true,
        historyBaselineMarkdown: "Before",
      }),
    ).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Before");
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("After");
  });

  it("reads selected source or the current Markdown block for AI", () => {
    const doc = "# Heading\n\nBefore **strong** after\n\nNext";
    const selectedFrom = doc.indexOf("strong");
    const selected = createView(
      doc,
      EditorSelection.range(selectedFrom, selectedFrom + "strong".length),
    );

    expect(readCodeMirrorAiSelectionContext(selected)).toEqual({
      cursor: selectedFrom + "strong".length,
      from: selectedFrom,
      source: "selection",
      text: "strong",
      to: selectedFrom + "strong".length,
    });

    const blockFrom = doc.indexOf("Before");
    const block = createView(doc, EditorSelection.cursor(blockFrom + 3));
    expect(readCodeMirrorAiSelectionContext(block)).toEqual({
      cursor: blockFrom + 3,
      from: blockFrom,
      source: "block",
      text: "Before **strong** after",
      to: blockFrom + "Before **strong** after".length,
    });
  });

  it("uses source offsets for heading and section anchors", () => {
    const doc = [
      "# **One**",
      "",
      "Intro",
      "",
      "## Two",
      "",
      "Child",
      "",
      "# Three",
      "",
      "End",
    ].join("\n");
    const state = createView(doc).state;

    expect(readCodeMirrorHeadingAnchors(state)).toEqual([
      { from: 0, level: 1, title: "One", to: "# **One**".length },
      {
        from: doc.indexOf("## Two"),
        level: 2,
        title: "Two",
        to: doc.indexOf("## Two") + "## Two".length,
      },
      {
        from: doc.indexOf("# Three"),
        level: 1,
        title: "Three",
        to: doc.indexOf("# Three") + "# Three".length,
      },
    ]);

    const sections = readCodeMirrorSectionAnchors(state);
    expect(sections.map(({ from, id, title, to }) => ({ from, id, title, to }))).toEqual([
      {
        from: 0,
        id: "section:0",
        title: "One",
        to: doc.indexOf("# Three"),
      },
      {
        from: doc.indexOf("## Two"),
        id: "section:1",
        title: "Two",
        to: doc.indexOf("# Three"),
      },
      {
        from: doc.indexOf("# Three"),
        id: "section:2",
        title: "Three",
        to: doc.length,
      },
    ]);
    expect(sections[0]?.text).toBe(doc.slice(0, doc.indexOf("# Three")));
  });

  it("omits single-character Setext underlines from heading anchors", () => {
    expect(
      readCodeMirrorHeadingAnchors(createView("Synthetic title\n-").state),
    ).toEqual([]);
    expect(
      readCodeMirrorHeadingAnchors(createView("Synthetic title\n=").state),
    ).toEqual([]);

    expect(
      readCodeMirrorHeadingAnchors(createView("Synthetic title\n--").state),
    ).toEqual([
      {
        from: 0,
        level: 2,
        title: "Synthetic title",
        to: "Synthetic title\n--".length,
      },
    ]);
  });

  it("reuses heading anchors when an edit cannot affect headings", () => {
    const doc = "# Synthetic heading\n\nBody";
    const view = createView(doc);
    const anchors = readCodeMirrorHeadingAnchors(view.state);
    const transaction = view.state.update({
      changes: { from: doc.length, insert: " text" },
    });

    const updated = updateCodeMirrorHeadingAnchors(
      anchors,
      transaction.startState,
      transaction.state,
      transaction.changes,
    );

    expect(updated).toEqual(anchors);
    expect(updated[0]).toBe(anchors[0]);
  });

  it("refreshes heading anchors when heading source changes", () => {
    const doc = "# Before\n\nBody";
    const view = createView(doc);
    const anchors = readCodeMirrorHeadingAnchors(view.state);
    const titleFrom = "# ".length;
    const transaction = view.state.update({
      changes: { from: titleFrom, to: "# Before".length, insert: "After" },
    });

    expect(
      updateCodeMirrorHeadingAnchors(
        anchors,
        transaction.startState,
        transaction.state,
        transaction.changes,
      ),
    ).toEqual([
      { from: 0, level: 1, title: "After", to: "# After".length },
    ]);
  });

  it("extracts GFM table anchors under their current heading", () => {
    const doc = [
      "# Data",
      "",
      "| Name | Value |",
      "| --- | ---: |",
      "| Alpha | 1 |",
    ].join("\n");

    expect(readCodeMirrorTableAnchors(createView(doc).state)).toEqual([
      {
        description: "Markdown table Data table: Name / Value",
        from: doc.indexOf("| Name"),
        id: "table:0",
        kind: "table",
        text: doc.slice(doc.indexOf("| Name")),
        title: "Data table",
        to: doc.length,
      },
    ]);
  });

  it("finds and replaces search matches using original document offsets", () => {
    const view = createView("Alpha beta ALPHA beta");
    const matches = findCodeMirrorSearchMatches(view.state, "alpha");

    expect(matches).toEqual([
      { from: 0, to: 5 },
      { from: 11, to: 16 },
    ]);
    expect(replaceAllCodeMirrorSearchMatches(view, matches, "A")).toBe(true);
    expect(view.state.doc.toString()).toBe("A beta A beta");

    const match = findCodeMirrorSearchMatches(view.state, "beta")[0];
    expect(replaceCodeMirrorSearchMatch(view, match, "B")).toBe(true);
    expect(view.state.doc.toString()).toBe("A B A beta");
  });

  it("does not expose hidden display-math source as visual search text", () => {
    const doc = ["# Visible c", "", "$$", String.raw`z &= csa`, "$$"].join("\n");
    const view = createView(doc);

    expect(findCodeMirrorSearchMatches(view.state, "c")).toEqual([
      { from: "# Visible ".length, to: "# Visible c".length },
    ]);
    expect(findCodeMirrorSearchMatches(view.state, "csa")).toEqual([]);
  });

  it("inserts Markdown snippets and places the caret after the placeholder", () => {
    const view = createView("Before  after", EditorSelection.cursor(7));

    expect(insertCodeMirrorMarkdownSnippet(view, "**", "**", "text")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before **text** after");
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe("Before **text".length);
  });

  it("inserts editable Markdown links and unwraps an active link", () => {
    const view = createView(
      "Synthetic label",
      EditorSelection.range(0, "Synthetic label".length),
    );

    expect(insertCodeMirrorMarkdownLink(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("[Synthetic label](https://)");
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe("Synthetic label");

    expect(insertCodeMirrorMarkdownLink(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Synthetic label");
  });

  it("uses a selected URL as both the link label and target", () => {
    const url = "https://example.test/articles/about";
    const view = createView(url, EditorSelection.range(0, url.length));

    expect(insertCodeMirrorMarkdownLink(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(`[${url}](${url})`);
  });

  it("inserts images with escaped alt text and selects the source", () => {
    const alt = String.raw`A ] bracket \ slash`;
    const view = createView(alt, EditorSelection.range(0, alt.length));

    expect(insertCodeMirrorMarkdownImage(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      String.raw`![A \] bracket \\ slash](assets/image.png)`,
    );
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe("assets/image.png");
  });

  it("inserts host-provided image and link references", () => {
    const images = createView("", EditorSelection.cursor(0));
    expect(
      insertCodeMirrorMarkdownImages(images, [
        { alt: "One", src: "./assets/one.png" },
        { alt: "Two", src: "./assets/two.png" },
      ]),
    ).toBe(true);
    expect(images.state.doc.toString()).toBe(
      "![One](./assets/one.png)![Two](./assets/two.png)",
    );

    const links = createView("", EditorSelection.cursor(0));
    expect(
      insertCodeMirrorMarkdownLinks(links, [
        { href: "./one.md", label: "One" },
        { href: "./two.md", label: "Two" },
      ]),
    ).toBe(true);
    expect(links.state.doc.toString()).toBe("[One](./one.md) [Two](./two.md)");
  });

  it("inserts the default Markdown table and places the caret in its first cell", () => {
    const view = createView("", EditorSelection.cursor(0));

    expect(insertCodeMirrorMarkdownTable(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      ["|  |  |", "| --- | --- |", "|  |  |"].join("\n"),
    );
    expect(view.state.selection.main.head).toBe(2);
  });
});
