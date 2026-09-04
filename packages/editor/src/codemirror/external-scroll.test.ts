import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codeMirrorExternalScroll } from "./external-scroll.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function syntheticRect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createView(targetRect: DOMRect, scrollTop = 200) {
  const scrollContainer = document.createElement("section");
  const parent = document.createElement("div");
  scrollContainer.append(parent);
  document.body.append(scrollContainer);
  scrollContainer.scrollTop = scrollTop;
  scrollContainer.getBoundingClientRect = () => syntheticRect(100, 500);
  Object.defineProperties(scrollContainer, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, value: 1_000 },
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "first\nsecond\nthird",
      extensions: [
        codeMirrorExternalScroll({
          getScrollContainer: () => scrollContainer,
        }),
      ],
      selection: EditorSelection.cursor(8),
    }),
  });
  vi.spyOn(view, "coordsAtPos").mockReturnValue(targetRect);
  views.push(view);

  return { scrollContainer, view };
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CodeMirror external scroll", () => {
  it("restores the external viewport after a focused document input", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "!",
    }));
    scrollContainer.scrollTop = 330;
    view.contentDOM.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      data: "!",
      inputType: "insertText",
    }));

    view.dispatch({
      changes: { from: 8, insert: "!" },
      selection: EditorSelection.cursor(9),
      scrollIntoView: true,
      userEvent: "input.type",
    });
    scrollContainer.scrollTop = 480;
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(200);
  });

  it("minimally reveals a cursor that moves below the restored viewport", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(520, 540));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }));

    view.dispatch({
      changes: { from: 8, insert: "\n" },
      selection: EditorSelection.cursor(9),
      scrollIntoView: true,
      userEvent: "input.type",
    });
    scrollContainer.scrollTop = 480;
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(245);
  });

  it("captures the viewport before IME composition changes the DOM", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      data: "",
    }));
    scrollContainer.scrollTop = 330;
    view.contentDOM.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      data: "示",
      inputType: "insertCompositionText",
    }));

    view.dispatch({
      changes: { from: 8, insert: "示" },
      selection: EditorSelection.cursor(9),
      scrollIntoView: true,
      userEvent: "input.type.compose",
    });
    scrollContainer.scrollTop = 480;
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(200);
  });

  it("does not reuse a stale snapshot from a navigation key", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowDown",
    }));
    scrollContainer.scrollTop = 300;
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "!",
    }));
    view.contentDOM.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      data: "!",
      inputType: "insertText",
    }));

    view.dispatch({
      changes: { from: 8, insert: "!" },
      selection: EditorSelection.cursor(9),
      scrollIntoView: true,
      userEvent: "input.type",
    });
    scrollContainer.scrollTop = 480;
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(300);
  });

  it("restores the viewport after a keyboard deletion", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Backspace",
    }));

    view.dispatch({
      changes: { from: 7, to: 8 },
      selection: EditorSelection.cursor(7),
      scrollIntoView: true,
      userEvent: "delete.backward",
    });
    scrollContainer.scrollTop = 480;
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(200);
  });
});
