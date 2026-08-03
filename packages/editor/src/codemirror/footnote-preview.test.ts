import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { footnotePreviewPlugin, liveMarkdown } from "./index.ts";
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
          if (property !== "iterate") return Reflect.get(target, property, receiver);
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

function createView(doc: string, anchor = doc.length) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [footnotePreviewPlugin()] })],
      selection: EditorSelection.cursor(anchor),
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("footnotePreviewPlugin", () => {
  it("does not rescan footnotes when plain text changes after them", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const view = createView(doc);
    syntaxTreeIterations.splice(0);

    view.dispatch({
      changes: { from: doc.length, insert: "!" },
      selection: { anchor: doc.length + 1 },
      userEvent: "input",
    });

    expect(
      syntaxTreeIterations.filter(
        ({ from, to }) => from === undefined && to === undefined,
      ),
    ).toHaveLength(1);
  });

  it("rescans when removing a code fence exposes footnote syntax", () => {
    const doc = "```\nAlpha[^one]\n\n[^one]: Synthetic detail.\n```\n\nEdit";
    const view = createView(doc);
    const closingFenceFrom = doc.lastIndexOf("```");

    expect(view.dom.querySelector(".cm-markra-footnote-reference")).toBeNull();
    view.dispatch({
      changes: [
        { from: 0, to: "```\n".length },
        { from: closingFenceFrom, to: closingFenceFrom + "```\n".length },
      ],
    });

    expect(view.dom.querySelector(".cm-markra-footnote-reference")).not.toBeNull();
  });

  it("renders references and definition labels without changing Markdown", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const view = createView(doc);

    expect(view.dom.querySelector(".cm-markra-footnote-reference")?.textContent).toContain("one");
    expect(view.dom.querySelector(".cm-markra-footnote-definition")?.textContent).toContain("Synthetic detail.");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("shows a definition preview and navigates to its source with modifier-click", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n    Continued detail.\n\nEdit";
    const view = createView(doc);
    const reference = view.dom.querySelector<HTMLElement>(".cm-markra-footnote-reference");

    reference?.dispatchEvent(new MouseEvent("mouseenter"));
    expect(view.dom.querySelector(".markra-footnote-preview")?.textContent).toContain(
      "Synthetic detail. Continued detail.",
    );

    reference?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    }));
    expect(view.state.selection.main.head).toBe(doc.indexOf("Synthetic detail."));
    expect(view.dom.textContent).toContain("[^one]:");
  });

  it("reveals footnote reference source on an ordinary click", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const from = doc.indexOf("[^one]");
    const view = createView(doc);
    const reference = view.dom.querySelector<HTMLElement>(".cm-markra-footnote-reference");

    reference?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    }));

    expect(view.state.selection.main.head).toBeGreaterThan(from);
    expect(view.state.selection.main.head).toBeLessThan(from + "[^one]".length);
    expect(view.dom.querySelector(".cm-markra-footnote-reference")).toBeNull();
    expect(view.dom.textContent).toContain("Alpha[^one]");
  });

  it("reveals a footnote definition marker when its visual label is clicked", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const definitionFrom = doc.lastIndexOf("[^one]");
    const view = createView(doc);
    const label = view.dom.querySelector<HTMLElement>(
      ".cm-markra-footnote-definition-label",
    );

    label?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    }));

    expect(view.state.selection.main.head).toBeGreaterThan(definitionFrom);
    expect(view.dom.querySelector(".cm-markra-footnote-definition-label")).toBeNull();
    expect(view.dom.textContent).toContain("[^one]: Synthetic detail.");
  });

  it("reveals an editable reference when the selection enters it", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const from = doc.indexOf("[^one]");
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(from + 2) });

    expect(view.dom.querySelector(".cm-markra-footnote-reference")).toBeNull();
    expect(view.dom.textContent).toContain("Alpha[^one]");
  });

  it("keeps footnote source visible while dragging from inside it", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const anchor = doc.indexOf("[^one]") + 2;
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(anchor) });
    view.dispatch({ selection: EditorSelection.range(anchor, anchor + 3) });

    expect(view.dom.querySelector(".cm-markra-footnote-reference")).toBeNull();
    expect(view.dom.textContent).toContain("Alpha[^one]");
  });

  it("keeps footnotes rendered during a multi-line range selection", () => {
    const doc = "Alpha[^one]\n\n[^one]: Synthetic detail.\n\nEdit";
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.range(0, doc.length) });

    expect(view.dom.querySelector(".cm-markra-footnote-reference")).not.toBeNull();
    expect(view.dom.querySelector(".cm-markra-footnote-definition")).not.toBeNull();
  });
});
