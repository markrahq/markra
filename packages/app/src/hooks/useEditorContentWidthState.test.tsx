import { act, renderHook } from "@testing-library/react";
import type { EditorContentWidth } from "../lib/editor-width";
import { useEditorContentWidthState } from "./useEditorContentWidthState";

describe("useEditorContentWidthState", () => {
  it("syncs local state from stored editor preferences", () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ contentWidth, contentWidthPx }) => useEditorContentWidthState({
        contentWidth,
        contentWidthPx,
        onCommit
      }),
      {
        initialProps: {
          contentWidth: "default" as EditorContentWidth,
          contentWidthPx: null as number | null
        }
      }
    );

    expect(result.current.width).toBe("default");
    expect(result.current.widthPx).toBeNull();

    rerender({
      contentWidth: "wide",
      contentWidthPx: 1040
    });

    expect(result.current.width).toBe("wide");
    expect(result.current.widthPx).toBe(1040);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("tracks a pending resized width and commits it on resize end", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEditorContentWidthState({
      contentWidth: "default",
      contentWidthPx: null,
      onCommit
    }));

    act(() => result.current.onWidthChange(960));

    expect(result.current.widthPx).toBe(960);
    expect(result.current.activeWidthPx).toBe(960);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => result.current.onResizeEnd());

    expect(onCommit).toHaveBeenCalledWith({
      contentWidth: "default",
      contentWidthPx: 960
    });
  });

  it("does not commit when no resized width is pending", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useEditorContentWidthState({
      contentWidth: "narrow",
      contentWidthPx: null,
      onCommit
    }));

    act(() => result.current.onResizeEnd());

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("uses the stored pixel width as the active fallback", () => {
    const { result } = renderHook(() => useEditorContentWidthState({
      contentWidth: "wide",
      contentWidthPx: 1120,
      onCommit: () => {}
    }));

    expect(result.current.activeWidth).toBe("wide");
    expect(result.current.activeWidthPx).toBe(1120);
  });
});
