import { describe, expect, it } from "vitest";
import { createEditorSyncState } from "./editor-sync";

describe("editor sync state", () => {
  it("recognizes previous clean visual content as stale only after the newer content is saved", () => {
    const state = createEditorSyncState();

    state.rememberCleanVisualContentBeforeDirty("file:/mock/guide.md", "# Guide\n\nOriginal", "# Guide\n\nDraft", "visual");
    state.rememberSavedVisualEditorStaleContent("file:/mock/guide.md", "# Guide\n\nDraft");

    expect(state.isSavedVisualEditorStaleContent(
      "file:/mock/guide.md",
      "# Guide\n\nDraft",
      "# Guide\n\nOriginal"
    )).toBe(true);
    expect(state.isSavedVisualEditorStaleContent(
      "file:/mock/guide.md",
      "# Guide\n\nDraft",
      "# Guide\n\nDifferent"
    )).toBe(false);
  });

  it("does not treat source edits as stale visual editor content", () => {
    const state = createEditorSyncState();

    state.rememberCleanVisualContentBeforeDirty("file:/mock/guide.md", "# Guide\n\nOriginal", "# Guide\n\nDraft", "source");
    state.rememberSavedVisualEditorStaleContent("file:/mock/guide.md", "# Guide\n\nDraft");

    expect(state.isSavedVisualEditorStaleContent(
      "file:/mock/guide.md",
      "# Guide\n\nDraft",
      "# Guide\n\nOriginal"
    )).toBe(false);
  });
});
