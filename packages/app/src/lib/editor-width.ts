import { clampNumber } from "@markra/shared";

export type EditorContentWidth = "narrow" | "default" | "wide";

export const editorContentWidthOptions: EditorContentWidth[] = ["narrow", "default", "wide"];

export const editorContentWidthPixels = {
  default: 860,
  narrow: 720,
  wide: 1040
} satisfies Record<EditorContentWidth, number>;

export const editorCustomContentWidthMin = 640;
export const editorCustomContentWidthMax = 1280;
export const editorResponsiveContentWidthBaseArea = 1200;
export const editorWidthResizeGutterMin = 48;

export function normalizeEditorContentWidthPx(value: unknown) {
  const width = clampNumber(value, editorCustomContentWidthMin, editorCustomContentWidthMax);

  return width === null ? null : Math.round(width);
}

function responsiveEditorContentWidthScale(editorAreaWidth: number) {
  if (editorAreaWidth <= editorResponsiveContentWidthBaseArea) return 1;

  return editorAreaWidth / editorResponsiveContentWidthBaseArea;
}

export function resolveResponsiveEditorContentWidthPx({
  contentWidth,
  contentWidthPx,
  editorAreaWidth
}: {
  contentWidth: EditorContentWidth;
  contentWidthPx: number | null;
  editorAreaWidth: number;
}) {
  const baseWidth = contentWidthPx ?? editorContentWidthPixels[contentWidth];
  const width = normalizeEditorContentWidthPx(Math.round(
    baseWidth * responsiveEditorContentWidthScale(Math.max(0, editorAreaWidth))
  ));

  return width ?? baseWidth;
}

export function resolveEditorContentWidthBasePx({
  editorAreaWidth,
  renderedContentWidthPx
}: {
  editorAreaWidth: number;
  renderedContentWidthPx: number;
}) {
  const width = normalizeEditorContentWidthPx(Math.round(
    renderedContentWidthPx / responsiveEditorContentWidthScale(Math.max(0, editorAreaWidth))
  ));

  return width ?? renderedContentWidthPx;
}

export function shouldShowEditorWidthResizer({
  aiAgentOpen,
  editorAreaWidth,
  editorContentWidth,
  gutterMin = editorWidthResizeGutterMin
}: {
  aiAgentOpen: boolean;
  editorAreaWidth: number;
  editorContentWidth: number;
  gutterMin?: number;
}) {
  if (!aiAgentOpen) return true;

  return editorAreaWidth - editorContentWidth >= gutterMin * 2;
}
