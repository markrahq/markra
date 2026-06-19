import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorContentWidth } from "../lib/editor-width";

type EditorContentWidthCommit = {
  contentWidth: EditorContentWidth;
  contentWidthPx: number;
};

type UseEditorContentWidthStateOptions = {
  contentWidth: EditorContentWidth;
  contentWidthPx: number | null;
  onCommit: (commit: EditorContentWidthCommit) => unknown;
};

export function useEditorContentWidthState({
  contentWidth,
  contentWidthPx,
  onCommit
}: UseEditorContentWidthStateOptions) {
  const [width, setWidth] = useState<EditorContentWidth>(contentWidth);
  const [widthPx, setWidthPx] = useState<number | null>(contentWidthPx);
  const pendingWidthPxRef = useRef<number | null>(contentWidthPx);

  useEffect(() => {
    setWidth(contentWidth);
    setWidthPx(contentWidthPx);
    pendingWidthPxRef.current = contentWidthPx;
  }, [contentWidth, contentWidthPx]);

  const onWidthChange = useCallback((nextWidthPx: number) => {
    pendingWidthPxRef.current = nextWidthPx;
    setWidthPx(nextWidthPx);
  }, []);

  const onResizeEnd = useCallback(() => {
    const nextWidthPx = pendingWidthPxRef.current;
    if (nextWidthPx === null) return;

    onCommit({
      contentWidth: width,
      contentWidthPx: nextWidthPx
    });
  }, [onCommit, width]);

  return {
    activeWidth: width,
    activeWidthPx: widthPx ?? contentWidthPx ?? null,
    onResizeEnd,
    onWidthChange,
    width,
    widthPx
  };
}
