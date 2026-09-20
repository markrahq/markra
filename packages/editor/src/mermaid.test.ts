import { describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}"><g></g></svg>`
    }))
  }
}));

import mermaid from "mermaid";
import { formatMermaidError, renderMermaidToSvg } from "./mermaid";

describe("formatMermaidError", () => {
  const summary = "Unable to render Mermaid diagram";
  const diagnostic = "Parse error on line 3:\nA->>B\n-----^\nExpecting 'TXT', got 'NEWLINE'";

  it.each([
    new Error(diagnostic),
    { message: diagnostic },
    diagnostic,
  ])("preserves the diagnostic and diagram line number", (error) => {
    expect(formatMermaidError(error)).toBe(`${summary}\n\n${diagnostic}`);
  });

  it.each([undefined, null, {}, { message: 3 }, new Error(""), "  "])(
    "keeps a useful summary when the error has no message",
    (error) => {
      expect(formatMermaidError(error)).toBe(summary);
    },
  );

  it("preserves a caller's localized summary", () => {
    expect(formatMermaidError(new Error(diagnostic), "无法渲染 Mermaid 图表"))
      .toBe(`无法渲染 Mermaid 图表\n\n${diagnostic}`);
  });
});

describe("renderMermaidToSvg", () => {
  it("renders safe HTML labels and leaves error presentation to Markra", async () => {
    await renderMermaidToSvg(["flowchart TD", "  A[Global<br/>Rules] --> B[Project]"].join("\n"), {
      theme: "neutral"
    });

    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      flowchart: expect.objectContaining({
        htmlLabels: true
      }),
      securityLevel: "antiscript",
      suppressErrorRendering: true
    }));
  });
});
