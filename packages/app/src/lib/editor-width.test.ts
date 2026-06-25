import { describe, expect, it } from "vitest";
import { shouldShowEditorWidthResizer } from "./editor-width";

describe("editor width", () => {
  it("uses the fixed content width when deciding whether to show the resize handle", () => {
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
