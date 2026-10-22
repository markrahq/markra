import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeMirrorTypewriterMode } from "./typewriter.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function syntheticRect(top: number): DOMRect {
  return {
    bottom: top,
    height: 0,
    left: 0,
    right: 0,
    top,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createView(
  enabled = true,
  geometry: { contentTop?: number; scrollTop?: number } = {},
) {
  const scrollContainer = document.createElement("section");
  const parent = document.createElement("div");
  scrollContainer.append(parent);
  document.body.append(scrollContainer);
  scrollContainer.scrollTop = geometry.scrollTop ?? 0;
  scrollContainer.getBoundingClientRect = () => syntheticRect(0);
  Object.defineProperty(scrollContainer, "clientHeight", {
    configurable: true,
    value: 400,
  });

  const compartment = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "first\nsecond\nthird",
      extensions: [
        EditorView.exceptionSink.of((error) => {
          throw error;
        }),
        compartment.of(
          codeMirrorTypewriterMode({
            enabled,
            getScrollContainer: (view) => {
              view.contentDOM.getBoundingClientRect = () =>
                syntheticRect(geometry.contentTop ?? 0);
              return scrollContainer;
            },
          }),
        ),
      ],
      selection: EditorSelection.cursor(0),
    }),
  });
  views.push(view);

  return { compartment, scrollContainer, view };
}

function pointerDown(view: EditorView) {
  view.contentDOM.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
}

function pointerUp() {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
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

describe("CodeMirror typewriter mode", () => {
  it("highlights the current line and moves the highlight with the cursor", () => {
    const { view } = createView();
    const lines = () =>
      [...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")];

    expect(lines()[0]?.classList.contains("cm-activeLine")).toBe(true);

    view.dispatch({
      selection: EditorSelection.cursor(8),
    });

    expect(lines()[0]?.classList.contains("cm-activeLine")).toBe(false);
    expect(lines()[1]?.classList.contains("cm-activeLine")).toBe(true);
  });

  it("adds scroll space and centers focused cursor movement", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();

    expect(view.dom.getAttribute("data-typewriter-mode")).toBe("true");
    expect(Number.parseFloat(view.contentDOM.style.paddingTop)).toBeGreaterThan(0);
    expect(Number.parseFloat(view.contentDOM.style.paddingBottom)).toBeGreaterThan(0);

    view.focus();
    view.dispatch({
      selection: EditorSelection.cursor(8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenLastCalledWith(8, { y: "center" });
  });

  it("does not center updates in an unfocused editor", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();

    view.dispatch({
      changes: { from: view.state.doc.length, insert: "!" },
      selection: EditorSelection.cursor(view.state.doc.length + 1),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not center a range selection", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    view.dispatch({
      selection: EditorSelection.range(0, 8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("cancels a pending center when a range selection starts", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    view.dispatch({
      selection: EditorSelection.cursor(8),
    });
    view.dispatch({
      selection: EditorSelection.range(0, 8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("defers centering while the pointer is down and centers after a click", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    pointerDown(view);
    view.dispatch({
      selection: EditorSelection.cursor(8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();

    pointerUp();
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenLastCalledWith(8, { y: "center" });
  });

  it("keeps a dragged range selection in place after release", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    pointerDown(view);
    view.dispatch({
      selection: EditorSelection.range(0, 8),
    });
    view.dispatch({
      selection: EditorSelection.range(0, 12),
    });
    pointerUp();
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("resumes centering when a range selection collapses to a cursor", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    view.dispatch({
      selection: EditorSelection.range(0, 8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();

    view.dispatch({
      selection: EditorSelection.cursor(12),
    });
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenLastCalledWith(12, { y: "center" });
  });

  it("clears a stale pointer gesture when the primary button is released outside", () => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const { view } = createView();
    vi.runOnlyPendingTimers();
    view.focus();

    pointerDown(view);
    view.dispatch({
      selection: EditorSelection.cursor(8),
    });
    vi.runAllTimers();

    expect(scrollIntoView).not.toHaveBeenCalled();

    window.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, buttons: 0 }),
    );
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenLastCalledWith(8, { y: "center" });
  });

  it("keeps top padding stable after the outer container scrolls", () => {
    const atTop = createView(true, {
      contentTop: 56,
      scrollTop: 0,
    }).view;
    const scrolled = createView(true, {
      contentTop: -64,
      scrollTop: 120,
    }).view;
    vi.runOnlyPendingTimers();

    expect(scrolled.contentDOM.style.paddingTop).toBe(
      atTop.contentDOM.style.paddingTop,
    );
  });

  it("removes typewriter layout when the extension is disabled", () => {
    const { compartment, view } = createView();

    expect(view.contentDOM.querySelector(".cm-activeLine")).not.toBeNull();

    view.dispatch({
      effects: compartment.reconfigure(
        codeMirrorTypewriterMode({ enabled: false }),
      ),
    });

    expect(view.dom.hasAttribute("data-typewriter-mode")).toBe(false);
    expect(view.contentDOM.querySelector(".cm-activeLine")).toBeNull();
    expect(view.contentDOM.style.paddingTop).toBe("");
    expect(view.contentDOM.style.paddingBottom).toBe("");
  });
});
