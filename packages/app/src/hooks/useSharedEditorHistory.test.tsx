import { act, renderHook } from "@testing-library/react";
import { useSharedEditorHistory } from "./useSharedEditorHistory";

describe("useSharedEditorHistory", () => {
  it("does not sync source to visual just because the source pane received focus", () => {
    const replaceEditorMarkdown = vi.fn(() => true);
    const { rerender } = renderHook(
      ({ sourceSurfaceActive }) => useSharedEditorHistory({
        documentContent: "# Split\n\nEdited from visual.",
        documentKey: "file:/mock-files/split.md",
        documentRevision: 1,
        largeMarkdownVisualBlocked: false,
        replaceEditorMarkdown,
        sourceSurfaceActive,
        syncSourceToVisual: sourceSurfaceActive,
        visualEditorReadySequence: 1
      }),
      { initialProps: { sourceSurfaceActive: false } }
    );

    rerender({ sourceSurfaceActive: true });

    expect(replaceEditorMarkdown).not.toHaveBeenCalled();
  });

  it("syncs pending source edits to visual history when the source pane is active", () => {
    const replaceEditorMarkdown = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ documentContent, sourceSurfaceActive }) => useSharedEditorHistory({
        documentContent,
        documentKey: "file:/mock-files/split.md",
        documentRevision: 1,
        largeMarkdownVisualBlocked: false,
        replaceEditorMarkdown,
        sourceSurfaceActive,
        syncSourceToVisual: sourceSurfaceActive,
        visualEditorReadySequence: 1
      }),
      {
        initialProps: {
          documentContent: "# Split\n\nOriginal.",
          sourceSurfaceActive: false
        }
      }
    );

    act(() => {
      result.current.markSourceEditForHistory("# Split\n\nEdited from source.", { documentRevision: 1 });
    });
    rerender({
      documentContent: "# Split\n\nEdited from source.",
      sourceSurfaceActive: true
    });

    expect(replaceEditorMarkdown).toHaveBeenCalledWith("# Split\n\nEdited from source.", {
      addToHistory: true,
      historyBaselineMarkdown: "# Split\n\nOriginal."
    });
  });

  it("clears pending source history when the active document changes", () => {
    const replaceEditorMarkdown = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ documentContent, documentKey }) => useSharedEditorHistory({
        documentContent,
        documentKey,
        documentRevision: 1,
        largeMarkdownVisualBlocked: false,
        replaceEditorMarkdown,
        sourceSurfaceActive: true,
        syncSourceToVisual: false,
        visualEditorReadySequence: 1
      }),
      {
        initialProps: {
          documentContent: "# First\n\nOriginal.",
          documentKey: "file:/mock-files/first.md"
        }
      }
    );

    act(() => {
      result.current.markSourceEditForHistory("# First\n\nEdited.", { documentRevision: 1 });
    });
    rerender({
      documentContent: "# Second\n\nOriginal.",
      documentKey: "file:/mock-files/second.md"
    });

    act(() => {
      expect(result.current.syncSourceEditsToVisualHistory()).toBe(false);
    });
    expect(replaceEditorMarkdown).not.toHaveBeenCalled();
  });
});
