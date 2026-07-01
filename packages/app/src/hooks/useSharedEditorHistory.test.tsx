import { act, renderHook } from "@testing-library/react";
import { useSharedEditorHistory } from "./useSharedEditorHistory";

describe("useSharedEditorHistory", () => {
  it("does not sync source to visual just because the source pane received focus", () => {
    const replaceEditorMarkdown = vi.fn(() => true);
    const { rerender } = renderHook(
      ({ sourceSurfaceActive }) => useSharedEditorHistory({
        documentContent: "# Split\n\nEdited from visual.",
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
});
