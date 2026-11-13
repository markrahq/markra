import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMarkdown } from "./index.ts";
import "./dom.test-support.ts";

const syntaxTreeIterations = vi.hoisted(
  (): Array<{ from: number | undefined; to: number | undefined }> => [],
);

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();

  return {
    ...actual,
    syntaxTree(state: Parameters<typeof actual.syntaxTree>[0]) {
      const tree = actual.syntaxTree(state);
      return new Proxy(tree, {
        get(target, property, receiver) {
          if (property !== "iterate") {
            return Reflect.get(target, property, receiver);
          }

          return (spec: Parameters<typeof tree.iterate>[0]) => {
            syntaxTreeIterations.push({ from: spec.from, to: spec.to });
            return target.iterate(spec);
          };
        },
      });
    },
  };
});

const views: EditorView[] = [];

function createView(doc: string, paragraphSpacing = 0) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [EditorState.allowMultipleSelections.of(true), liveMarkdown({ paragraphSpacing })],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("block spacing", () => {
  it("uses measured block spacers instead of enlarging editable heading lines", () => {
    const view = createView([
      "# Synthetic title",
      "",
      "## Synthetic section",
      "",
      "### Synthetic detail",
      "",
      "#### Synthetic topic",
      "",
      "##### Synthetic note",
      "",
      "###### Synthetic leaf",
    ].join("\n"));

    const spacers = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-markra-heading-spacer"),
      (spacer) => ({
        edge: spacer.dataset.headingEdge,
        height: spacer.style.height,
        level: spacer.dataset.headingLevel,
      }),
    );

    expect(spacers).toEqual([
      { edge: "after", height: "8px", level: "1" },
      { edge: "before", height: "12px", level: "2" },
      { edge: "after", height: "4px", level: "2" },
      { edge: "before", height: "8px", level: "3" },
      { edge: "after", height: "2px", level: "3" },
      { edge: "before", height: "6px", level: "4" },
      { edge: "before", height: "4px", level: "5" },
      { edge: "before", height: "4px", level: "6" },
    ]);
    expect(
      view.dom.querySelectorAll(
        ".cm-markra-heading-spacer[aria-hidden='true']",
      ),
    ).toHaveLength(spacers.length);
  });

  it("keeps compact heading gaps and authored blank rows stable across selection and recreation", () => {
    const doc = "## Synthetic section\n\n\nSynthetic paragraph\n\n### Synthetic detail";
    const view = createView(doc, 2);
    const snapshot = (editor: EditorView) => ({
      doc: editor.state.doc.toString(),
      lines: Array.from(editor.contentDOM.querySelectorAll(".cm-line"), (line) => line.textContent),
      gaps: Array.from(editor.contentDOM.querySelectorAll<HTMLElement>(".cm-markra-heading-spacer"), (gap) => gap.style.height),
    });
    const initial = snapshot(view);
    expect(initial.gaps).toEqual(["12px", "4px", "8px", "2px"]);
    expect(initial.lines.filter((line) => line === "")).toHaveLength(3);

    view.dispatch({ selection: EditorSelection.range(0, doc.length) });
    expect(snapshot(view)).toEqual(initial);
    view.dispatch({ selection: EditorSelection.cursor(doc.length) });
    expect(snapshot(view)).toEqual(initial);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(view.state.doc.line(2).from),
        EditorSelection.cursor(view.state.doc.line(4).to),
      ]),
    });
    expect(view.state.selection.ranges).toHaveLength(2);
    expect(snapshot(view)).toEqual(initial);
    expect(snapshot(createView(doc, 2))).toEqual(initial);
    expect(initial.doc).toBe(doc);
  });

  it("uses a measured block spacer for configurable paragraph rhythm", () => {
    const view = createView(
      "Synthetic first paragraph\n\nSynthetic second paragraph",
      14,
    );
    const spacers = view.dom.querySelectorAll<HTMLElement>(
      ".cm-markra-paragraph-spacer",
    );

    expect(spacers).toHaveLength(1);
    expect(spacers[0]?.style.height).toBe("14px");
    expect(spacers[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses a measured block spacer before separated blockquotes", () => {
    const view = createView("Synthetic lead\n\n> Synthetic quote");
    const spacers = view.dom.querySelectorAll<HTMLElement>(
      ".cm-markra-blockquote-spacer",
    );

    expect(spacers).toHaveLength(1);
    expect(spacers[0]?.style.height).toBe("10px");
    expect(spacers[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("rebuilds spacing when plain text turns a blank row into a paragraph", () => {
    const doc = "Synthetic first\n\n\n\nSynthetic last";
    const view = createView(doc, 14);
    const insertion = view.state.doc.line(3).from;

    expect(
      view.dom.querySelectorAll(".cm-markra-paragraph-spacer"),
    ).toHaveLength(1);

    view.dispatch({
      changes: { from: insertion, insert: "Synthetic middle" },
      selection: { anchor: insertion + "Synthetic middle".length },
      userEvent: "input.type",
    });

    expect(
      view.dom.querySelectorAll(".cm-markra-paragraph-spacer"),
    ).toHaveLength(2);
  });

  it("maps spacing when an inline space cannot change block structure", () => {
    const doc = "# Synthetic heading\n\nEdit here";
    const view = createView(doc, 14);
    syntaxTreeIterations.splice(0);

    view.dispatch({
      changes: { from: doc.length, insert: " " },
      selection: { anchor: doc.length + 1 },
      userEvent: "input.type",
    });

    expect(
      syntaxTreeIterations.filter(
        ({ from, to }) => from === undefined && to === undefined,
      ),
    ).toHaveLength(1);
  });
});
