import { EditorSelection, EditorState, StateEffect } from "@codemirror/state";
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
  view.focus();
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
  it("leaves background document updates at their current scroll position", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.blur();
    scrollContainer.scrollTop = 420;
    view.dispatch({ changes: { from: 8, insert: "!" }, userEvent: "input.type" });
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(420);
  });

  it("does not restore when typewriter mode is enabled before the pending frame", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "!" }));
    view.dispatch({ changes: { from: 8, insert: "!" }, userEvent: "input.type" });
    await Promise.resolve();
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.editorAttributes.of({ "data-typewriter-mode": "true" })) });
    scrollContainer.scrollTop = 350;
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(350);
  });

  it("converts viewport pixels into scroll offsets when the UI is zoomed", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(310, 330));
    scrollContainer.getBoundingClientRect = () => syntheticRect(100, 300);
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    view.dispatch({ changes: { from: 8, insert: "\n" }, userEvent: "input.type" });
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(270);
  });

  it("lets an intentional scroll supersede a pending input restore", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "!" }));
    view.dispatch({ changes: { from: 8, insert: "!" }, userEvent: "input.type" });
    await Promise.resolve();

    view.contentDOM.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    scrollContainer.scrollTop = 420;
    scrollContainer.dispatchEvent(new Event("scroll"));
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(420);
  });

  it("does not replay an input restore after a later selection navigation", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "!" }));
    view.dispatch({ changes: { from: 8, insert: "!" }, userEvent: "input.type" });
    await Promise.resolve();
    view.dispatch({ selection: EditorSelection.cursor(0), userEvent: "select" });
    scrollContainer.scrollTop = 50;
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(50);
  });

  it("uses the last observed viewport when native input scrolls before a transaction", async () => {
    vi.useFakeTimers();
    const { scrollContainer, view } = createView(syntheticRect(280, 300));
    scrollContainer.scrollTop = 300;
    scrollContainer.dispatchEvent(new Event("scroll"));

    // Native text replacement may scroll before CodeMirror observes the edit,
    // without delivering a preceding keydown/beforeinput to the editor.
    scrollContainer.scrollTop = 480;
    view.dispatch({
      changes: { from: 8, insert: "!" },
      selection: EditorSelection.cursor(9),
      scrollIntoView: true,
      userEvent: "input.type",
    });
    await Promise.resolve();
    vi.runAllTimers();

    expect(scrollContainer.scrollTop).toBe(300);
  });

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
