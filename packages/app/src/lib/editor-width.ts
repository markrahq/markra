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
export const editorWidthResizeGutterMin = 48;

export function normalizeEditorContentWidthPx(value: unknown) {
  const width = clampNumber(value, editorCustomContentWidthMin, editorCustomContentWidthMax);

  return width === null ? null : Math.round(width);
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
