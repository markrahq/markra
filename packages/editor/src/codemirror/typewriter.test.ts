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
