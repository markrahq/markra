import { afterEach, describe, expect, it } from "vitest";
import { formatMermaidError, renderMermaidToSvg } from "./mermaid.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Mermaid error rendering", () => {
  it("preserves the real parser diagnostic without leaving a fallback SVG in the page", async () => {
    const content = document.createElement("main");
    content.textContent = "Synthetic document";
    document.body.append(content);
    const source = "sequenceDiagram\n    A->>B";

    const error = await renderMermaidToSvg(source).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(formatMermaidError(error)).toContain("Parse error on line 2:");
    expect(formatMermaidError(error)).toContain("Expecting 'TXT', got 'NEWLINE'");
    expect([...document.body.children]).toEqual([content]);
    expect(content.textContent).toBe("Synthetic document");
  });
});
