import { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMarkdown, markraRenderer } from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];
const syntheticDocument = "Before **synthetic** after\n\nEdit";

function createView(extensions = [liveMarkdown()]) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: syntheticDocument,
      extensions,
      selection: { anchor: syntheticDocument.length },
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("Markra renderers", () => {
  it("runs contributed node renderers inside the shared preview pass", () => {
    const render = vi.fn((context) => {
      context.add(
        Decoration.mark({ class: "cm-synthetic-renderer" }).range(
          context.node.from,
          context.node.to,
        ),
      );
    });
    const view = createView([
      liveMarkdown(),
      markraRenderer({
        id: "synthetic.strong",
        nodeNames: ["StrongEmphasis"],
        render,
      }),
    ]);

    expect(render).toHaveBeenCalledOnce();
    expect(view.dom.querySelector(".cm-synthetic-renderer")?.textContent).toBe(
      "synthetic",
    );
  });

  it("reruns a contributed paragraph renderer when its text changes", () => {
    const render = vi.fn();
    const view = createView([
      liveMarkdown(),
      markraRenderer({
        id: "synthetic.paragraph",
        nodeNames: ["Paragraph"],
        render,
      }),
    ]);
    render.mockClear();

    view.dispatch({
      changes: { from: syntheticDocument.length, insert: "字" },
      selection: { anchor: syntheticDocument.length + 1 },
      userEvent: "input.type",
    });

    expect(render).toHaveBeenCalled();
  });

  it("reruns a contributed inline renderer when typing inside its node", () => {
    const render = vi.fn();
    const view = createView([
      liveMarkdown(),
      markraRenderer({
        id: "synthetic.strong-update",
        nodeNames: ["StrongEmphasis"],
        render,
      }),
    ]);
    const insertionPosition = syntheticDocument.indexOf("synthetic") + 3;
    view.dispatch({ selection: { anchor: insertionPosition } });
    render.mockClear();

    view.dispatch({
      changes: { from: insertionPosition, insert: "字" },
      selection: { anchor: insertionPosition + 1 },
      userEvent: "input.type",
    });

    expect(render).toHaveBeenCalled();
  });

  it("rejects duplicate renderer identifiers", () => {
    const renderer = {
      id: "synthetic.duplicate",
      nodeNames: ["Emphasis"],
      render() {
        return true;
      },
    };

    expect(() =>
      createView([
        liveMarkdown(),
        markraRenderer(renderer),
        markraRenderer(renderer),
      ]),
    ).toThrow('Duplicate Markra renderer id "synthetic.duplicate"');
  });

  it("requires renderers to declare stable identifiers and node names", () => {
    expect(() =>
      markraRenderer({ id: " ", nodeNames: ["Image"], render: () => true }),
    ).toThrow("Markra renderer id must not be empty");
    expect(() =>
      markraRenderer({
        id: "synthetic.empty",
        nodeNames: [],
        render: () => true,
      }),
    ).toThrow('Markra renderer "synthetic.empty" must declare a node name');
  });
});
