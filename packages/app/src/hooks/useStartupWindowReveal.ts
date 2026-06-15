import { useEffect, useRef } from "react";
import { showNativeWindow } from "../lib/tauri";

export const startupWindowRevealFallbackMs = 1800;
export const startupWindowRevealPaintFallbackMs = 120;

type UseStartupWindowRevealOptions = {
  fallbackMs?: number;
  ready: boolean;
  revealWindow?: () => Promise<unknown>;
};

function scheduleAfterNextPaint(callback: () => unknown) {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    const timeout = setTimeout(callback, 0);
    return () => clearTimeout(timeout);
  }

  let completed = false;
  let secondFrameId: number | null = null;
  let paintFallbackTimeout: number | null = null;
  const runCallback = () => {
    if (completed) return;

    completed = true;
    if (paintFallbackTimeout !== null) {
      window.clearTimeout(paintFallbackTimeout);
    }
    callback();
  };
  const firstFrameId = window.requestAnimationFrame(() => {
    secondFrameId = window.requestAnimationFrame(runCallback);
  });
  paintFallbackTimeout = window.setTimeout(runCallback, startupWindowRevealPaintFallbackMs);

  return () => {
    completed = true;
    if (paintFallbackTimeout !== null) {
      window.clearTimeout(paintFallbackTimeout);
    }
    window.cancelAnimationFrame(firstFrameId);
    if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
  };
}

export function useStartupWindowReveal({
  fallbackMs = startupWindowRevealFallbackMs,
  ready,
  revealWindow = showNativeWindow
}: UseStartupWindowRevealOptions) {
  const revealedRef = useRef(false);

  useEffect(() => {
    if (revealedRef.current) return;

    let cancelPaintReveal: (() => unknown) | null = null;
    const reveal = () => {
      if (revealedRef.current) return;

      revealedRef.current = true;
      cancelPaintReveal = scheduleAfterNextPaint(() => {
        try {
          Promise.resolve(revealWindow()).catch(() => {});
        } catch {
          // Revealing the native window is best-effort; a failure should not break app startup.
        }
      });
    };

    if (ready) {
      reveal();
      return () => {
        cancelPaintReveal?.();
      };
    }

    const timeout = window.setTimeout(reveal, fallbackMs);

    return () => {
      window.clearTimeout(timeout);
      cancelPaintReveal?.();
    };
  }, [fallbackMs, ready, revealWindow]);
}
