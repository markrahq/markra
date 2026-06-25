import { describe, expect, it } from "vitest";
import {
  resolveEditorContentWidthBasePx,
  resolveResponsiveEditorContentWidthPx,
  shouldShowEditorWidthResizer
} from "./editor-width";

describe("editor width", () => {
  it("scales preset editor content widths when the editor area has extra horizontal room", () => {
    expect(resolveResponsiveEditorContentWidthPx({
      contentWidth: "default",
      contentWidthPx: null,
      editorAreaWidth: 1024
    })).toBe(860);
    expect(resolveResponsiveEditorContentWidthPx({
      contentWidth: "default",
      contentWidthPx: null,
      editorAreaWidth: 1688
    })).toBe(1210);
    expect(resolveResponsiveEditorContentWidthPx({
      contentWidth: "wide",
      contentWidthPx: null,
      editorAreaWidth: 1688
    })).toBe(1280);
  });

  it("scales custom editor content widths from their stored base width", () => {
    expect(resolveResponsiveEditorContentWidthPx({
      contentWidth: "default",
      contentWidthPx: 980,
      editorAreaWidth: 1688
    })).toBe(1280);
  });

  it("converts the displayed editor content width back to the stored base width", () => {
    expect(resolveEditorContentWidthBasePx({
      editorAreaWidth: 1688,
      renderedContentWidthPx: 1210
    })).toBe(860);
    expect(resolveEditorContentWidthBasePx({
      editorAreaWidth: 1024,
      renderedContentWidthPx: 980
    })).toBe(980);
  });

  it("uses the responsive content width when deciding whether to show the resize handle", () => {
    expect(shouldShowEditorWidthResizer({
      aiAgentOpen: true,
      editorAreaWidth: 1216,
      editorContentWidth: 872
    })).toBe(true);
    expect(shouldShowEditorWidthResizer({
      aiAgentOpen: true,
      editorAreaWidth: 928,
      editorContentWidth: 860
    })).toBe(false);
  });
});
