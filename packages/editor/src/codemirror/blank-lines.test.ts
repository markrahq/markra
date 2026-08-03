import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { liveMarkdown } from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(doc: string, anchor = doc.length) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(anchor),
      extensions: [liveMarkdown()],
    }),
  });
  views.push(view);
  return view;
}

function renderedLines(view: EditorView) {
  return Array.from(
    view.dom.querySelectorAll(".cm-line"),
    (line) => line.textContent ?? "",
  );
}

function editableEmptyLines(view: EditorView) {
  return view.dom.querySelectorAll(".cm-markra-empty-line");
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("blank line rendering", () => {
  it("renders a single internal Markdown blank as an editable line", () => {
    const doc = "# Synthetic heading\n\n- Synthetic item";
    const view = createView(doc);

    expect(renderedLines(view)).toEqual([
      "Synthetic heading",
      "",
      "Synthetic item",
    ]);
    expect(editableEmptyLines(view)).toHaveLength(1);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps every internal blank line at normal editable height", () => {
    const doc = "Synthetic before\n\n\nSynthetic after";
    const view = createView(doc);

    expect(renderedLines(view)).toEqual([
      "Synthetic before",
      "",
      "",
      "Synthetic after",
    ]);
    expect(editableEmptyLines(view)).toHaveLength(2);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps a trailing blank line full height after text is entered below it", () => {
    const initialDoc = "Synthetic first\n\n";
    const view = createView(initialDoc);

    view.dispatch({
      changes: { from: initialDoc.length, insert: "Synthetic second" },
      selection: EditorSelection.cursor(
        initialDoc.length + "Synthetic second".length,
      ),
      userEvent: "input.type",
    });

    expect(view.state.doc.toString()).toBe(
      "Synthetic first\n\nSynthetic second",
    );
    expect(renderedLines(view)).toEqual([
      "Synthetic first",
      "",
      "Synthetic second",
    ]);
    expect(editableEmptyLines(view)).toHaveLength(1);
  });

  it("keeps authored blank lines between different Markdown block types", () => {
    const doc = [
      "# Synthetic heading",
      "",
      "> Synthetic quote",
      "",
      "- Synthetic item",
      "",
      "~~~js",
      "const synthetic = true;",
      "~~~",
      "",
      "Synthetic paragraph",
    ].join("\n");
    const view = createView(doc);

    expect(editableEmptyLines(view)).toHaveLength(4);
  });

  it("keeps leading and trailing blank lines editable", () => {
    const doc = "\nSynthetic content\n";
    const view = createView(doc);

    expect(renderedLines(view)).toEqual(["", "Synthetic content", ""]);
    expect(editableEmptyLines(view)).toHaveLength(2);
  });

  it("keeps whitespace-only Markdown lines visible without changing source", () => {
    const doc = "Synthetic before\n \t\nSynthetic after";
    const view = createView(doc);

    expect(renderedLines(view)).toEqual([
      "Synthetic before",
      " \t",
      "Synthetic after",
    ]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("does not collapse blank lines inside fenced code", () => {
    const doc = [
      "~~~txt",
      "synthetic-before",
      "",
      "synthetic-after",
      "~~~",
    ].join("\n");
    const view = createView(doc);

    expect(renderedLines(view)).toEqual([
      "txt",
      "synthetic-before",
      "",
      "synthetic-after",
      "",
    ]);
  });

  it("keeps blank lines around fenced blocks editable", () => {
    const doc = [
      "Synthetic before",
      "",
      "~~~mermaid",
      "flowchart TD",
      "",
      "  A --> B",
      "~~~",
      "",
      "~~~ts",
      "const synthetic = true;",
      "~~~",
    ].join("\n");
    const view = createView(doc);

    expect(editableEmptyLines(view)).toHaveLength(2);
  });

  it("keeps blank rows stable across selection, focus, and recreation", () => {
    const doc = "Synthetic before\n\nSynthetic after";
    const firstView = createView(doc, 0);

    expect(renderedLines(firstView)).toEqual([
      "Synthetic before",
      "",
      "Synthetic after",
    ]);
    expect(editableEmptyLines(firstView)).toHaveLength(1);
    firstView.focus();
    firstView.dispatch({
      selection: EditorSelection.cursor("Synthetic before\n".length),
      userEvent: "select.pointer",
    });
    firstView.contentDOM.blur();
    expect(renderedLines(firstView)).toEqual([
      "Synthetic before",
      "",
      "Synthetic after",
    ]);
    expect(editableEmptyLines(firstView)).toHaveLength(1);

    const recreatedView = createView(doc);
    expect(renderedLines(recreatedView)).toEqual([
      "Synthetic before",
      "",
      "Synthetic after",
    ]);
    expect(editableEmptyLines(recreatedView)).toHaveLength(1);
  });
});
