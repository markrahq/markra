import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeMirrorLocationCue,
  locationCueDurationMs,
  showCodeMirrorLocationCue,
} from "./location-cue.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView() {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "first\nsecond\nthird",
      extensions: [
        EditorView.exceptionSink.of((error) => {
          throw error;
        }),
        codeMirrorLocationCue(),
      ],
    }),
  });
  views.push(view);

  return view;
}

function cueLines(view: EditorView) {
  return view.contentDOM.querySelectorAll(".cm-markra-location-cue");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CodeMirror location cue", () => {
  it("temporarily decorates the line containing the requested position", () => {
    const view = createView();

    showCodeMirrorLocationCue(view, 8);

    expect(cueLines(view)).toHaveLength(1);
    expect(cueLines(view)[0]?.textContent).toContain("second");

    vi.advanceTimersByTime(locationCueDurationMs - 1);
    expect(cueLines(view)).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(cueLines(view)).toHaveLength(0);
  });

  it("replaces the previous cue line", () => {
    const view = createView();

    showCodeMirrorLocationCue(view, 1);
    showCodeMirrorLocationCue(view, 14);

    expect(cueLines(view)).toHaveLength(1);
    expect(cueLines(view)[0]?.textContent).toContain("third");
  });

  it("restarts the cue animation and timeout when the same line is requested again", () => {
    const view = createView();

    showCodeMirrorLocationCue(view, 8);
    const firstAnimationClass = cueLines(view)[0]?.className;
    vi.advanceTimersByTime(locationCueDurationMs / 2);
    showCodeMirrorLocationCue(view, 8);
    vi.advanceTimersByTime(locationCueDurationMs / 2);

    expect(cueLines(view)).toHaveLength(1);
    expect(cueLines(view)[0]?.className).not.toBe(firstAnimationClass);

    vi.advanceTimersByTime(locationCueDurationMs / 2);
    expect(cueLines(view)).toHaveLength(0);
  });

  it("ignores non-finite requested positions", () => {
    const view = createView();

    expect(() => showCodeMirrorLocationCue(view, Number.NaN)).not.toThrow();
    expect(cueLines(view)).toHaveLength(0);
  });

  it("clears the cue when the user moves the selection or edits the document", () => {
    const view = createView();

    showCodeMirrorLocationCue(view, 8);
    view.dispatch({ selection: EditorSelection.cursor(9) });
    expect(cueLines(view)).toHaveLength(0);

    showCodeMirrorLocationCue(view, 8);
    view.dispatch({ changes: { from: 8, insert: "updated " } });
    expect(cueLines(view)).toHaveLength(0);
  });
});
