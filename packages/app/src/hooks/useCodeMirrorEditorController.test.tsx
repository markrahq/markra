import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history } from "@codemirror/commands";
import {
  blocksPlugin,
  codeMirrorAiPreviewPlugin,
  codeMirrorAiSelectionHoldPlugin,
  codeMirrorSearchPlugin,
  formattingPlugin,
  liveMarkdown,
} from "@markra/editor/codemirror";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCodeMirrorEditorController } from "./useCodeMirrorEditorController";

const views: EditorView[] = [];

function createView(
  doc = "# Heading\n\nBefore text after",
  selection = EditorSelection.cursor(0),
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        liveMarkdown({ plugins: [blocksPlugin(), formattingPlugin()] }),
        codeMirrorAiPreviewPlugin(),
        codeMirrorAiSelectionHoldPlugin(),
        codeMirrorSearchPlugin(),
      ],
      selection,
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("useCodeMirrorEditorController", () => {
  it("owns ready lifecycle, Markdown replacement and anchors", () => {
    const view = createView();
    const { result } = renderHook(() => useCodeMirrorEditorController());

    act(() => result.current.handleEditorReady(view));
    expect(result.current.getCurrentMarkdown("fallback")).toBe(
      "# Heading\n\nBefore text after",
    );
    expect(result.current.getHeadingAnchors()).toEqual([
      { from: 0, level: 1, title: "Heading", to: 9 },
    ]);

    act(() => {
      expect(result.current.replaceMarkdown("# Replaced")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("# Replaced");

    act(() => result.current.handleEditorReady(null));
    expect(result.current.getCurrentMarkdown("fallback")).toBe("fallback");
  });

  it("routes formatting shortcuts and insertion commands through CodeMirror", () => {
    const doc = "Before text after";
    const view = createView(
      doc,
      EditorSelection.range(doc.indexOf("text"), doc.indexOf("text") + 4),
    );
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      expect(result.current.runEditorShortcut("b")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before **text** after");
    expect(result.current.getSelectionFormattingState().actions).toContain("bold");

    act(() => {
      expect(result.current.toggleSelectionHighlight()).toBe(true);
    });
    expect(view.state.doc.toString()).toContain("==text==");

    act(() => {
      expect(result.current.clearSelectionFormatting()).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before text after");
    expect(result.current.getSelectionFormattingState().actions).toEqual([]);
  });

  it("runs selection toolbar formatting actions as direct Markra commands", () => {
    const doc = "Before text after";
    const from = doc.indexOf("text");
    const view = createView(
      doc,
      EditorSelection.range(from, from + "text".length),
    );
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      expect(result.current.runSelectionFormattingAction("italic")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before *text* after");

    act(() => {
      expect(result.current.runSelectionFormattingAction("italic")).toBe(true);
      expect(result.current.runSelectionFormattingAction("strikethrough")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before ~~text~~ after");

    act(() => {
      expect(result.current.runSelectionFormattingAction("strikethrough")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before text after");
  });

  it("normalizes shifted letter shortcuts before passing them to CodeMirror", () => {
    const doc = "Before text after";
    const from = doc.indexOf("text");
    const view = createView(
      doc,
      EditorSelection.range(from, from + "text".length),
    );
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      expect(result.current.runEditorShortcut("X", { shiftKey: true })).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before ~~text~~ after");

    act(() => {
      expect(result.current.runEditorShortcut("X", { shiftKey: true })).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("Before text after");
  });

  it.each([
    ["bullet list", "*", "Digit8", "- "],
    ["ordered list", "&", "Digit7", "1. "],
  ])(
    "normalizes synthetic shifted-digit shortcuts for %s",
    (_label, key, code, marker) => {
      const doc = "Alpha\n";
      const view = createView(doc, EditorSelection.cursor(doc.length));
      const { result } = renderHook(() => useCodeMirrorEditorController());
      act(() => result.current.handleEditorReady(view));

      act(() => {
        expect(
          result.current.runEditorShortcut(key, {
            code,
            shiftKey: true,
          }),
        ).toBe(true);
      });

      expect(view.state.doc.toString()).toBe(`${doc}${marker}`);
    },
  );

  it("normalizes synthetic shifted-digit shortcuts on macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const parent = document.createElement("div");
    document.body.append(parent);
    let shortcutHandled = false;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        extensions: [
          keymap.of([{
            key: "Meta-Shift-8",
            run: () => {
              shortcutHandled = true;
              return true;
            },
          }]),
        ],
      }),
    });
    views.push(view);
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      expect(result.current.runEditorShortcut("*", {
        code: "Digit8",
        shiftKey: true,
      })).toBe(true);
    });

    expect(shortcutHandled).toBe(true);
  });

  it("preserves an Alt-only shortcut when dispatching a synthetic editor event", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    let shortcutHandled = false;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "Alpha",
        extensions: [
          keymap.of([{
            key: "Alt-1",
            run: () => {
              shortcutHandled = true;
              return true;
            },
          }]),
        ],
        selection: EditorSelection.cursor(0),
      }),
    });
    views.push(view);
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      expect(result.current.runEditorShortcut("1", {
        altKey: true,
        code: "Digit1",
        modKey: false,
      })).toBe(true);
    });

    expect(shortcutHandled).toBe(true);
  });

  it("normalizes native redo shortcuts across desktop platforms", () => {
    const view = createView("Before");
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "After", to: view.state.doc.length } });
      expect(result.current.runEditorShortcut("z")).toBe(true);
      expect(result.current.runEditorShortcut("z", { shiftKey: true })).toBe(true);
    });

    expect(view.state.doc.toString()).toBe("After");
  });

  it("finds, decorates and replaces search matches", () => {
    const view = createView("Alpha beta Alpha");
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));
    const matches = result.current.findSearchMatches("alpha");

    expect(matches).toEqual([
      { from: 0, to: 5 },
      { from: 11, to: 16 },
    ]);
    act(() => result.current.showSearchMatches(matches, 1));
    expect(view.dom.querySelectorAll(".cm-markra-search-match")).toHaveLength(2);

    act(() => {
      expect(result.current.replaceAllSearchMatches(matches, "A")).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("A beta A");
  });

  it("preserves the AI preview, apply and selection-hold controller contract", () => {
    const doc = "Before Original After";
    const from = doc.indexOf("Original");
    const view = createView(doc);
    const { result } = renderHook(() => useCodeMirrorEditorController());
    act(() => result.current.handleEditorReady(view));
    const preview = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const,
    };

    act(() => {
      result.current.holdAiSelection({
        from,
        source: "selection",
        text: "Original",
        to: from + "Original".length,
      });
      result.current.previewAiResult(preview, undefined, {
        previewId: "synthetic-preview",
      });
    });
    expect(view.dom.querySelector(".markra-ai-selection-hold")?.textContent).toContain("Original");
    expect(result.current.listAiPreviews()).toEqual([preview]);

    act(() => {
      expect(
        result.current.applyAiResult(preview, {
          previewId: "synthetic-preview",
        }),
      ).toBe(true);
      result.current.confirmAiResultApplied(preview, {
        previewId: "synthetic-preview",
      });
      result.current.clearAiSelection();
    });

    expect(view.state.doc.toString()).toBe("Before Improved After");
    expect(result.current.listAiPreviews()).toEqual([]);
    expect(view.dom.querySelector(".markra-ai-selection-hold")).toBeNull();
  });
});
