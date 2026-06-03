import { useEffect, useRef } from "react";

export const selectionToolbarAnchorRefreshDelayMs = 240;

type SelectionToolbarAnchorRefreshInput = {
  active: boolean;
  layoutSignature: string;
  refresh: () => unknown;
  transitionDelayMs?: number;
};

function requestRefreshFrame(callback: FrameRequestCallback) {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => {
    callback(Date.now());
  }, 16);
}

function cancelRefreshFrame(handle: number) {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
    return;
  }

  window.clearTimeout(handle);
}

export function useSelectionToolbarAnchorRefresh({
  active,
  layoutSignature,
  refresh,
  transitionDelayMs = selectionToolbarAnchorRefreshDelayMs
}: SelectionToolbarAnchorRefreshInput) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let frame: number | null = null;
    let transitionTimeout: number | null = null;

    const scheduleFrame = () => {
      if (frame !== null) return;

      frame = requestRefreshFrame(() => {
        frame = null;
        if (disposed) return;

        refreshRef.current();
      });
    };

    const scheduleRefresh = () => {
      scheduleFrame();

      if (transitionDelayMs <= 0) return;
      if (transitionTimeout !== null) window.clearTimeout(transitionTimeout);

      transitionTimeout = window.setTimeout(() => {
        transitionTimeout = null;
        scheduleFrame();
      }, transitionDelayMs);
    };

    scheduleRefresh();
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("scroll", scheduleRefresh, true);

    return () => {
      disposed = true;
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("scroll", scheduleRefresh, true);

      if (frame !== null) cancelRefreshFrame(frame);
      if (transitionTimeout !== null) window.clearTimeout(transitionTimeout);
    };
  }, [active, layoutSignature, transitionDelayMs]);
}
