import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import type { AiDiffResult } from "@markra/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCodeMirrorAiResult,
  clearCodeMirrorAiPreview,
  clearCodeMirrorAiSelectionHold,
  codeMirrorAiPreviewPlugin,
  codeMirrorAiSelectionHoldPlugin,
  listCodeMirrorAiPreviewResults,
  liveMarkdown,
  scrollCodeMirrorAiPreviewIntoView,
  showCodeMirrorAiPreview,
  showCodeMirrorAiSelectionHold,
  tablePreviewPlugin,
} from "./index.ts";
import {
  AI_EDITOR_PREVIEW_ACTION_EVENT,
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
} from "../ai-preview-events.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];
type ReplacementResult = Exclude<AiDiffResult, { type: "error" }> & {
  from: number;
  to: number;
  type: "replace";
};

function createView(
  doc = "Before Original After",
  markdownExtension: Extension = liveMarkdown(),
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdownExtension,
        history(),
        codeMirrorAiPreviewPlugin(),
        codeMirrorAiSelectionHoldPlugin(),
      ],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

function replacementResult(
  doc: string,
  original: string,
  replacement: string,
): ReplacementResult {
  const from = doc.indexOf(original);
  return {
    from,
    original,
    replacement,
    to: from + original.length,
    type: "replace",
  };
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("CodeMirror AI preview", () => {
  it("shows a non-destructive replacement preview and lists it", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);

    showCodeMirrorAiPreview(view, result, { apply: "Apply", copy: "Copy", copied: "Copied", reject: "Reject" });

    expect(view.dom.querySelector(".markra-ai-preview-delete")?.textContent).toContain("Original");
    expect(view.dom.querySelector(".markra-ai-preview-insert")?.textContent).toContain("Improved");
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([result]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("updates the same preview slot while a streamed replacement grows", () => {
    const doc = "Before Original After";
    const initial = replacementResult(doc, "Original", "I");
    const streamed = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);

    showCodeMirrorAiPreview(view, initial);
    showCodeMirrorAiPreview(view, streamed);

    expect(listCodeMirrorAiPreviewResults(view)).toEqual([streamed]);
    expect(view.dom.querySelectorAll(".markra-ai-preview-insert")).toHaveLength(1);
    expect(
      view.dom.querySelector(".markra-ai-preview-insert")?.textContent,
    ).toBe("Improved");
  });

  it("shows localized impact scope and table target details", () => {
    const doc = "Before Original After";
    const base = replacementResult(doc, "Original", "Improved");
    const result: AiDiffResult = {
      ...base,
      target: {
        from: base.from,
        id: "table:0",
        kind: "table",
        title: "Synthetic costs",
        to: base.to,
      },
    };
    const view = createView(doc);

    showCodeMirrorAiPreview(view, result, {
      apply: "Apply",
      chars: "chars",
      copied: "Copied",
      copy: "Copy",
      insertScope: "Insert",
      reject: "Reject",
      replaceDocumentScope: "Replace entire document",
      replaceRegionScope: "Replace region",
      replaceSelectionScope: "Replace selection",
    });

    expect(
      view.dom.querySelector(".markra-ai-preview-scope")?.textContent,
    ).toBe("Replace selection - table: Synthetic costs | 8 chars | 7-15");
  });

  it("marks apply busy and dispatches it once from pointer activation", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    const onAction = vi.fn();
    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);
    showCodeMirrorAiPreview(view, result);
    const apply = view.dom.querySelector<HTMLButtonElement>(
      ".markra-ai-preview-apply",
    );

    apply?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
    }));
    apply?.click();

    expect(onAction).toHaveBeenCalledOnce();
    expect(apply?.disabled).toBe(true);
    expect(apply?.getAttribute("aria-busy")).toBe("true");
    expect(apply?.querySelector(".markra-ai-preview-spinner")).not.toBeNull();
    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);
  });

  it("keeps a table replacement preview outside hidden table source lines", () => {
    const doc = [
      "| Field | Old |",
      "| --- | --- |",
      "| Value | 1 |",
      "",
      "Tail",
    ].join("\n");
    const tableEnd = doc.indexOf("\n\nTail");
    const result: AiDiffResult = {
      from: 0,
      original: doc.slice(0, tableEnd),
      replacement: [
        "| Field | New |",
        "| --- | --- |",
        "| Value | 2 |",
      ].join("\n"),
      target: {
        from: 0,
        id: "table:0",
        kind: "table",
        title: "Synthetic table",
        to: tableEnd,
      },
      to: tableEnd,
      type: "replace",
    };
    const view = createView(
      doc,
      liveMarkdown({ plugins: [tablePreviewPlugin()] }),
    );

    showCodeMirrorAiPreview(view, result);

    const preview = view.dom.querySelector<HTMLElement>(
      ".markra-ai-preview-widget",
    );
    expect(preview).not.toBeNull();
    expect(preview?.closest(".cm-markra-table-hidden-line")).toBeNull();
    expect(preview?.classList.contains("markra-ai-preview-widget-block")).toBe(true);
    expect(preview?.textContent).toContain("| Field | New |");
  });

  it("scrolls the matching preview widget itself into view", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "preview-1" });
    const preview = view.dom.querySelector<HTMLElement>(
      ".markra-ai-preview-widget",
    );
    const scrollIntoView = vi.fn();
    if (preview) preview.scrollIntoView = scrollIntoView;

    expect(
      scrollCodeMirrorAiPreviewIntoView(view, result, {
        previewId: "preview-1",
      }),
    ).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
    });
  });

  it("emits action events from preview controls", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    const onAction = vi.fn();
    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);

    showCodeMirrorAiPreview(view, result, undefined, { previewId: "synthetic-preview" });
    view.dom.querySelector<HTMLButtonElement>(".markra-ai-preview-apply")?.click();

    expect(onAction).toHaveBeenCalledOnce();
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      action: "apply",
      previewId: "synthetic-preview",
      result,
    });
    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);
  });

  it("emits an append action from the preview controls", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    const onAction = vi.fn();
    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);

    showCodeMirrorAiPreview(view, result, {
      append: "Append",
      apply: "Apply",
      copied: "Copied",
      copy: "Copy",
      reject: "Reject",
    }, { previewId: "synthetic-preview" });
    const append = view.dom.querySelector<HTMLButtonElement>(
      ".markra-ai-preview-append",
    );
    append?.click();

    expect(append?.title).toBe("Append");
    expect(onAction).toHaveBeenCalledOnce();
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      action: "append",
      previewId: "synthetic-preview",
      result,
    });
    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onAction);
  });

  it("does not offer append when applying the AI result already inserts text", () => {
    const doc = "# Synthetic";
    const result: AiDiffResult = {
      from: doc.length,
      original: "",
      replacement: "\n\nContinuation",
      to: doc.length,
      type: "insert",
    };
    const view = createView(doc);

    showCodeMirrorAiPreview(view, result);

    expect(view.dom.querySelector(".markra-ai-preview-append")).toBeNull();
    expect(view.dom.querySelector(".markra-ai-preview-apply")).not.toBeNull();
  });

  it("appends an AI result after the selection's Markdown block", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "append" });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe("Before Original After\n\nImproved");
    expect(view.state.selection.main.head).toBe(
      "Before Original After\n\nImproved".length,
    );
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([]);
  });

  it.each([
    {
      doc: "Before Original, After",
      expected: "Before Original, After\n\nImproved",
      name: "punctuation",
      original: "Original",
      replacement: "Improved",
    },
    {
      doc: "原文，后文",
      expected: "原文，后文\n\n译文",
      name: "CJK text",
      original: "原文",
      replacement: "译文",
    },
  ])(
    "keeps the original $name block unchanged",
    ({ doc, expected, original, replacement }) => {
      const result = replacementResult(doc, original, replacement);
      const view = createView(doc);
      showCodeMirrorAiPreview(view, result, undefined, {
        previewId: "append-block",
      });

      expect(
        applyCodeMirrorAiResult(view, result, {
          mode: "append",
          previewId: "append-block",
        }),
      ).toBe(true);

      expect(view.state.doc.toString()).toBe(expected);
    },
  );

  it("separates an appended result from an adjacent Markdown block", () => {
    const doc = "Original\n# After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, {
      previewId: "append-adjacent",
    });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append-adjacent",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe("Original\n\nImproved\n\n# After");
  });

  it("appends multiline output after the containing paragraph", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "- First\n- Second");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "append-list" });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append-list",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe(
      "Before Original After\n\n- First\n- Second",
    );
  });

  it("appends after a complete list instead of splitting a list item", () => {
    const doc = "- Original\n- After\n\nTail";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, {
      previewId: "append-after-list",
    });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append-after-list",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe(
      "- Original\n- After\n\nImproved\n\nTail",
    );
  });

  it("appends after a complete table instead of splitting a table cell", () => {
    const doc = [
      "| Field | Value |",
      "| --- | --- |",
      "| Original | After |",
      "",
      "Tail",
    ].join("\n");
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, {
      previewId: "append-after-table",
    });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append-after-table",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe(
      [
        "| Field | Value |",
        "| --- | --- |",
        "| Original | After |",
        "",
        "Improved",
        "",
        "Tail",
      ].join("\n"),
    );
  });

  it("appends a block AI result as a separate Markdown block", () => {
    const doc = "# Synthetic\n\nOriginal\n\nAfter";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "append-block" });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append-block",
      }),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe(
      "# Synthetic\n\nOriginal\n\nImproved\n\nAfter",
    );
  });

  it("applies one preview and rebases later previews through the same transaction", () => {
    const doc = "One Original Two Summary";
    const first = replacementResult(doc, "Original", "Much better");
    const second = replacementResult(doc, "Summary", "Conclusion");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, first, undefined, { previewId: "first" });
    showCodeMirrorAiPreview(view, second, undefined, { previewId: "second" });

    expect(applyCodeMirrorAiResult(view, first, { previewId: "first" })).toBe(true);

    expect(view.state.doc.toString()).toBe("One Much better Two Summary");
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([
      expect.objectContaining({
        from: "One Much better Two ".length,
        replacement: "Conclusion",
        to: "One Much better Two Summary".length,
      }),
    ]);
    expect(view.dom.querySelectorAll(".markra-ai-preview-insert")).toHaveLength(1);
  });

  it("drops a pending preview that conflicts with the applied replacement", () => {
    const doc = "Before Original After";
    const first = replacementResult(doc, "Original", "Improved");
    const second: AiDiffResult = {
      from: first.from + 2,
      original: "iginal",
      replacement: "ther",
      to: first.to,
      type: "replace",
    };
    const view = createView(doc);
    showCodeMirrorAiPreview(view, first, undefined, { previewId: "first" });
    showCodeMirrorAiPreview(view, second, undefined, { previewId: "second" });

    expect(applyCodeMirrorAiResult(view, first, { previewId: "first" })).toBe(true);

    expect(listCodeMirrorAiPreviewResults(view)).toEqual([]);
    expect(view.dom.querySelector(".markra-ai-preview-insert")).toBeNull();
  });

  it("rebases the original text when the user edits a pending target", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "pending" });

    view.dispatch({
      changes: {
        from: result.from,
        insert: "Edited",
        to: result.to,
      },
    });

    expect(listCodeMirrorAiPreviewResults(view)).toEqual([
      expect.objectContaining({
        from: result.from,
        original: "Edited",
        to: result.from + "Edited".length,
      }),
    ]);
  });

  it("clears previews and keeps held selections mapped through edits", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result);
    showCodeMirrorAiSelectionHold(view, {
      from: doc.indexOf("Original"),
      source: "selection",
      text: "Original",
      to: doc.indexOf("Original") + "Original".length,
    });

    expect(view.dom.querySelector(".markra-ai-selection-hold")?.textContent).toContain("Original");
    view.dispatch({ changes: { from: 0, insert: "Draft " } });
    expect(view.dom.querySelector(".markra-ai-selection-hold")?.textContent).toContain("Original");

    clearCodeMirrorAiPreview(view);
    clearCodeMirrorAiSelectionHold(view);
    expect(view.dom.querySelector(".markra-ai-preview-insert")).toBeNull();
    expect(view.dom.querySelector(".markra-ai-selection-hold")).toBeNull();
  });

  it("does not dispatch while clearing an already empty selection hold", () => {
    const view = createView("Synthetic selection");
    const dispatch = vi.spyOn(view, "dispatch");

    expect(clearCodeMirrorAiSelectionHold(view)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    expect(showCodeMirrorAiSelectionHold(view, {
      from: 0,
      source: "selection",
      text: "Synthetic",
      to: "Synthetic".length,
    })).toBe(true);
    dispatch.mockClear();

    expect(clearCodeMirrorAiSelectionHold(view)).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    dispatch.mockClear();

    expect(clearCodeMirrorAiSelectionHold(view)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("restores an applied comparison when undo returns to the original text", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "A much better phrase");
    const view = createView(doc);
    const onRestore = vi.fn();
    window.addEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "replacement" });

    expect(applyCodeMirrorAiResult(view, result, { previewId: "replacement" })).toBe(true);
    expect(view.state.doc.toString()).toBe("Before A much better phrase After");
    expect(undo(view)).toBe(true);

    expect(view.state.doc.toString()).toBe(doc);
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([result]);
    expect(view.dom.querySelector(".markra-ai-preview-delete")?.textContent).toContain("Original");
    expect(view.dom.querySelector(".markra-ai-preview-insert")?.textContent).toContain("A much better phrase");
    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ previewId: "replacement", result }),
      }),
    );
    window.removeEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
  });

  it("restores an appended comparison when undo removes the appended text", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    const onRestore = vi.fn();
    window.addEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "append" });

    expect(
      applyCodeMirrorAiResult(view, result, {
        mode: "append",
        previewId: "append",
      }),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe("Before Original After\n\nImproved");
    expect(undo(view)).toBe(true);

    expect(view.state.doc.toString()).toBe(doc);
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([result]);
    expect(view.dom.querySelector(".markra-ai-preview-delete")?.textContent).toContain("Original");
    expect(view.dom.querySelector(".markra-ai-preview-insert")?.textContent).toContain("Improved");
    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ previewId: "append", result }),
      }),
    );
    window.removeEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
  });

  it("restores a rejected comparison through editor history", () => {
    const doc = "Before Original After";
    const result = replacementResult(doc, "Original", "Improved");
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "rejected" });

    clearCodeMirrorAiPreview(view, result, { previewId: "rejected" });
    expect(listCodeMirrorAiPreviewResults(view)).toEqual([]);
    expect(undo(view)).toBe(true);

    expect(listCodeMirrorAiPreviewResults(view)).toEqual([result]);
    expect(view.dom.querySelector(".markra-ai-preview-insert")?.textContent).toContain("Improved");
  });

  it("does not restore an insert preview merely because a later edit occurs", () => {
    const doc = "# Alpha\n\nBody";
    const result: AiDiffResult = {
      from: doc.length,
      original: "",
      replacement: "\n\n## Follow-up",
      to: doc.length,
      type: "insert",
    };
    const view = createView(doc);
    showCodeMirrorAiPreview(view, result, undefined, { previewId: "insert" });

    expect(applyCodeMirrorAiResult(view, result, { previewId: "insert" })).toBe(true);
    view.dispatch({ changes: { from: 0, insert: "Draft " } });

    expect(listCodeMirrorAiPreviewResults(view)).toEqual([]);
    expect(view.dom.querySelector(".markra-ai-preview-insert")).toBeNull();
  });
});
