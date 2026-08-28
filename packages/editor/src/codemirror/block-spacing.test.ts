import { EditorState } from "@codemirror/state";
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
      extensions: [liveMarkdown({ paragraphSpacing })],
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
      { edge: "after", height: "16px", level: "1" },
      { edge: "before", height: "28px", level: "2" },
      { edge: "after", height: "12px", level: "2" },
      { edge: "before", height: "22px", level: "3" },
      { edge: "after", height: "4px", level: "3" },
      { edge: "before", height: "18px", level: "4" },
      { edge: "after", height: "2px", level: "4" },
      { edge: "before", height: "14px", level: "5" },
      { edge: "before", height: "14px", level: "6" },
    ]);
    expect(
      view.dom.querySelectorAll(
        ".cm-markra-heading-spacer[aria-hidden='true']",
      ),
    ).toHaveLength(spacers.length);
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
