import { act, renderHook } from "@testing-library/react";
import {
  selectionToolbarAnchorRefreshDelayMs,
  useSelectionToolbarAnchorRefresh
} from "./useSelectionToolbarAnchorRefresh";

describe("useSelectionToolbarAnchorRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => {
        callback(0);
      }, 0)
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("refreshes the toolbar anchor when the layout signature changes and after layout transitions settle", () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(
      ({ layoutSignature }: { layoutSignature: string }) =>
        useSelectionToolbarAnchorRefresh({
          active: true,
          layoutSignature,
          refresh
        }),
      {
        initialProps: {
          layoutSignature: "agent:closed"
        }
      }
    );

    act(() => {
      vi.runAllTimers();
    });
    refresh.mockClear();

    rerender({
      layoutSignature: "agent:open"
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(selectionToolbarAnchorRefreshDelayMs);
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes the toolbar anchor when the viewport or scroll position changes", () => {
    const refresh = vi.fn();

    renderHook(() =>
      useSelectionToolbarAnchorRefresh({
        active: true,
        layoutSignature: "stable",
        refresh,
        transitionDelayMs: 0
      })
    );

    act(() => {
      vi.runAllTimers();
    });
    refresh.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(0);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(0);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh while the toolbar is inactive", () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useSelectionToolbarAnchorRefresh({
          active,
          layoutSignature: "stable",
          refresh
        }),
      {
        initialProps: {
          active: false
        }
      }
    );

    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.runAllTimers();
    });
    expect(refresh).not.toHaveBeenCalled();

    rerender({
      active: true
    });

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
