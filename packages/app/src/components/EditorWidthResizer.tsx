import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { clampNumber, t, type AppLanguage } from "@markra/shared";

type EditorWidthResizerProps = {
  language?: AppLanguage;
  maxWidth: number;
  minWidth: number;
  width: number;
  onResize?: (width: number) => unknown;
  onResizeEnd?: () => unknown;
  onResizeStart?: () => unknown;
};

export function EditorWidthResizer({
  language = "en",
  maxWidth,
  minWidth,
  width,
  onResize,
  onResizeEnd,
  onResizeStart
}: EditorWidthResizerProps) {
  const resizeCleanupRef = useRef<(() => unknown) | null>(null);
  const [resizing, setResizing] = useState(false);
  const resolvedMinWidth = Math.max(480, minWidth);
  const resolvedMaxWidth = Math.max(resolvedMinWidth, maxWidth);
  const resolvedWidth = clampNumber(width, resolvedMinWidth, resolvedMaxWidth);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  if (!onResize || resolvedWidth === null) return null;

  const resizeEditor = (nextWidth: number | null) => {
    if (nextWidth === null) return;
    onResize(nextWidth);
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = resolvedWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizing(true);
    onResizeStart?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeEditor(clampNumber(startWidth + moveEvent.clientX - startX, resolvedMinWidth, resolvedMaxWidth));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
      setResizing(false);
      onResizeEnd?.();
    };

    const handlePointerUp = () => {
      cleanup();
    };

    resizeCleanupRef.current?.();
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeEditor(clampNumber(resolvedWidth - 24, resolvedMinWidth, resolvedMaxWidth));
      onResizeEnd?.();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeEditor(clampNumber(resolvedWidth + 24, resolvedMinWidth, resolvedMaxWidth));
      onResizeEnd?.();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeEditor(resolvedMinWidth);
      onResizeEnd?.();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeEditor(resolvedMaxWidth);
      onResizeEnd?.();
    }
  };
  const indicatorVisibilityClassName = resizing
    ? "bg-(--accent) opacity-100"
    : "bg-(--border-default) opacity-0 group-hover/width-resizer:bg-(--border-strong) group-hover/width-resizer:opacity-100 group-focus-within/width-resizer:bg-(--accent) group-focus-within/width-resizer:opacity-100";

  return (
    <div className="editor-width-resizer-shell group/width-resizer absolute top-8 right-0 bottom-8 z-20 w-8 translate-x-1/2">
      <div
        className="editor-width-resizer absolute inset-0 cursor-col-resize touch-none outline-none"
        role="separator"
        tabIndex={0}
        aria-label={t(language, "app.resizeEditorWidth")}
        aria-orientation="vertical"
        aria-valuemin={resolvedMinWidth}
        aria-valuemax={resolvedMaxWidth}
        aria-valuenow={resolvedWidth}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
      >
        <span
          className={`editor-width-resizer-indicator pointer-events-none absolute top-2 right-4 bottom-2 w-px transition-colors duration-150 ease-out ${indicatorVisibilityClassName}`}
        />
      </div>
    </div>
  );
}
