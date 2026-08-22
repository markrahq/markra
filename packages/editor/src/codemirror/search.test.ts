import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
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

  it("renders zero-width regular expression matches", () => {
    const view = createView("alpha\nbeta");

    updateCodeMirrorSearchDecorations(
      view,
      [
        { from: 0, to: 0 },
        { from: 6, to: 6 },
      ],
      1,
    );

    expect(view.dom.querySelectorAll(".cm-markra-search-zero-width")).toHaveLength(2);
    expect(view.dom.querySelectorAll(".cm-markra-search-match-current")).toHaveLength(1);
    expect(getCodeMirrorSearchState(view.state).matches).toEqual([
      { from: 0, to: 0 },
      { from: 6, to: 6 },
    ]);
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

  it("requests scrolling only for a valid match", () => {
    const view = createView();

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 11, to: 16 })).toBe(
      true,
    );
    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 6, to: 6 })).toBe(
      true,
    );
    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 20, to: 30 })).toBe(
      false,
    );
  });
});
