import { useEffect } from "react";
import { isKeyboardShortcutModKey } from "@markra/shared";
import {
  defaultUiZoomPercent,
  normalizeUiZoomPercent,
  uiZoomPercentOptions
} from "../lib/ui-zoom";
import { setNativeUiZoom } from "../lib/tauri";

type UiZoomShortcut = "in" | "out" | "reset";

function uiZoomShortcut(event: KeyboardEvent): UiZoomShortcut | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    !isKeyboardShortcutModKey(event)
  ) {
    return null;
  }

  if (event.key === "0" || event.code === "Digit0" || event.code === "Numpad0") return "reset";
  if (event.key === "+" || event.key === "=" || event.code === "Equal" || event.code === "NumpadAdd") return "in";
  if (event.key === "-" || event.key === "_" || event.code === "Minus" || event.code === "NumpadSubtract") return "out";

  return null;
}

function nextUiZoomPercent(current: number, shortcut: UiZoomShortcut) {
  if (shortcut === "reset") return defaultUiZoomPercent;

  const normalized = normalizeUiZoomPercent(current);
  const currentIndex = uiZoomPercentOptions.indexOf(normalized as typeof uiZoomPercentOptions[number]);
  const nextIndex = shortcut === "in"
    ? Math.min(currentIndex + 1, uiZoomPercentOptions.length - 1)
    : Math.max(currentIndex - 1, 0);

  return uiZoomPercentOptions[nextIndex] ?? defaultUiZoomPercent;
}

export function useUiZoom({
  onUiZoomPercentChange,
  uiZoomPercent
}: {
  onUiZoomPercentChange: (percent: number) => unknown;
  uiZoomPercent: number;
}) {
  useEffect(() => {
    setNativeUiZoom(uiZoomPercent / 100).catch(() => {});
  }, [uiZoomPercent]);

  useEffect(() => {
    const handleUiZoomShortcut = (event: KeyboardEvent) => {
      const shortcut = uiZoomShortcut(event);
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      onUiZoomPercentChange(nextUiZoomPercent(uiZoomPercent, shortcut));
    };

    window.addEventListener("keydown", handleUiZoomShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleUiZoomShortcut, true);
    };
  }, [onUiZoomPercentChange, uiZoomPercent]);
}
