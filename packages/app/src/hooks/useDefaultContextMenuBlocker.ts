import { useEffect } from "react";
import { editableTextControlFromTarget } from "../lib/editable-target";

export function shouldBlockDefaultContextMenu() {
  return import.meta.env.PROD;
}

export function useDefaultContextMenuBlocker(enabled = shouldBlockDefaultContextMenu()) {
  useEffect(() => {
    if (!enabled) return;

    const blockDefaultContextMenu = (event: MouseEvent) => {
      if (editableTextControlFromTarget(event.target)) return;

      event.preventDefault();
    };

    document.addEventListener("contextmenu", blockDefaultContextMenu, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", blockDefaultContextMenu, { capture: true });
    };
  }, [enabled]);
}
