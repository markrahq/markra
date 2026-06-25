import { describe, expect, it } from "vitest";
import {
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

  it("keeps custom editor content widths exact", () => {
    expect(resolveResponsiveEditorContentWidthPx({
      contentWidth: "default",
      contentWidthPx: 980,
      editorAreaWidth: 1688
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
