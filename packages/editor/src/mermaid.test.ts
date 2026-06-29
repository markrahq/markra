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
import { renderMermaidToSvg } from "./mermaid";

describe("renderMermaidToSvg", () => {
  it("configures Mermaid to render safe HTML label line breaks", async () => {
    await renderMermaidToSvg(["flowchart TD", "  A[Global<br/>Rules] --> B[Project]"].join("\n"), {
      theme: "neutral"
    });

    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      flowchart: expect.objectContaining({
        htmlLabels: true
      }),
      securityLevel: "antiscript"
    }));
  });
});
