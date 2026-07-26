import { describe, expect, it, vi } from "vitest";
import {
  createEditorSyncState,
  routeMarkdownChangeToTab
} from "./editor-sync";

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

  it("routes a delayed visual editor change to the tab that produced it", () => {
    const handleMarkdownTabChange = vi.fn();

    routeMarkdownChangeToTab({
      content: "# First document\n\nLate IME update.",
      documentRevision: 7,
      handleMarkdownTabChange,
      surface: "visual",
      tabId: "file:/mock-files/first.md"
    });

    expect(handleMarkdownTabChange).toHaveBeenCalledWith(
      "file:/mock-files/first.md",
      "# First document\n\nLate IME update.",
      {
        documentRevision: 7,
        surface: "visual"
      }
    );
  });

  it("routes a delayed source editor change to the tab that produced it", () => {
    const handleMarkdownTabChange = vi.fn();

    routeMarkdownChangeToTab({
      content: "# First document\n\nLate source update.",
      documentRevision: 8,
      handleMarkdownTabChange,
      surface: "source",
      tabId: "file:/mock-files/first.md"
    });

    expect(handleMarkdownTabChange).toHaveBeenCalledWith(
      "file:/mock-files/first.md",
      "# First document\n\nLate source update.",
      {
        documentRevision: 8,
        surface: "source"
      }
    );
  });
});
