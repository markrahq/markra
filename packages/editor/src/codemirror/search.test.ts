import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codeMirrorSearchPlugin,
  getCodeMirrorSearchState,
  scrollCodeMirrorSearchMatchIntoView,
  updateCodeMirrorSearchDecorations,
} from "./search.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(doc = "Alpha beta Alpha") {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [codeMirrorSearchPlugin()],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("CodeMirror search decorations", () => {
  it("renders matches and distinguishes the active result", () => {
    const view = createView();

    updateCodeMirrorSearchDecorations(
      view,
      [
        { from: 0, to: 5 },
        { from: 11, to: 16 },
      ],
      1,
    );

    expect(view.dom.querySelectorAll(".cm-markra-search-match")).toHaveLength(2);
    expect(
      view.dom.querySelector(".cm-markra-search-match-current")?.textContent,
    ).toBe("Alpha");
    expect(getCodeMirrorSearchState(view.state)).toMatchObject({
      activeIndex: 1,
      matches: [
        { from: 0, to: 5 },
        { from: 11, to: 16 },
      ],
    });
  });

  it("drops invalid ranges and clears stale results after document edits", () => {
    const view = createView();

    updateCodeMirrorSearchDecorations(
      view,
      [
        { from: -1, to: 2 },
        { from: 0, to: 5 },
        { from: 99, to: 100 },
      ],
      0,
    );
    expect(getCodeMirrorSearchState(view.state).matches).toEqual([
      { from: 0, to: 5 },
    ]);

    view.dispatch({ changes: { from: 0, insert: "!" } });
    expect(getCodeMirrorSearchState(view.state).matches).toEqual([]);
    expect(view.dom.querySelector(".cm-markra-search-match")).toBeNull();
  });

  it("reveals an offscreen match in the outer paper when editor coordinates are unavailable", () => {
    const doc = Array.from({ length: 100 }, () => "Line").join("\n") + "\nNeedle";
    const view = createView(doc);
    const paper = document.createElement("div");
    paper.className = "paper-scroll";
    document.body.append(paper);
    paper.append(view.dom.parentElement!);
    Object.defineProperty(paper, "clientHeight", { value: 100 });
    Object.defineProperty(view, "documentTop", { value: 20 });
    vi.spyOn(view, "lineBlockAt").mockReturnValue({
      top: 500,
      height: 20,
    } as ReturnType<EditorView["lineBlockAt"]>);
    const frame = vi.spyOn(window, "requestAnimationFrame");
    try {
      const match = { from: doc.indexOf("Needle"), to: doc.length };
      updateCodeMirrorSearchDecorations(view, [match], 0);
      expect(scrollCodeMirrorSearchMatchIntoView(view, match)).toBe(true);
      for (const [callback] of frame.mock.calls.slice()) callback(0);
      expect(paper.scrollTop).toBe(480);
    } finally {
      frame.mockRestore();
    }
  });

  it("requests scrolling only for a valid match", () => {
    const view = createView();

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 11, to: 16 })).toBe(
      true,
    );
    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 20, to: 30 })).toBe(
      false,
    );
  });
});
