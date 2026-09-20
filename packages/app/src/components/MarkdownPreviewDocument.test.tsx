import { render, waitFor } from "@testing-library/react";

const { renderMermaid } = vi.hoisted(() => ({
  renderMermaid: vi.fn(async () => '<svg data-testid="mock-mermaid"><g></g></svg>')
}));

vi.mock("@markra/editor", async (importOriginal) => ({
  ...await importOriginal<typeof import("@markra/editor")>(),
  renderMermaidToSvg: renderMermaid
}));

import { MarkdownPreviewDocument } from "./MarkdownPreviewDocument";

describe("MarkdownPreviewDocument", () => {
  it("shows Mermaid diagnostics safely without blocking other diagrams", async () => {
    const diagnostic = "Parse error on line 2:\n<img src=x onerror=alert(1)>\nExpecting 'TXT', got 'NEWLINE'";
    renderMermaid.mockRejectedValueOnce(new Error(diagnostic));
    const onRendered = vi.fn();
    const { container } = render(
      <MarkdownPreviewDocument
        markdown={[
          "```mermaid", "sequenceDiagram", "  A->>B", "```", "",
          "```mermaid", "flowchart TD", "  A --> B", "```"
        ].join("\n")}
        onRendered={onRendered}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalled());
    const error = container.querySelector(".markra-mermaid-render-invalid");
    expect(error?.textContent).toBe(`Unable to render Mermaid diagram\n\n${diagnostic}`);
    expect(error?.querySelector("img")).toBeNull();
    expect(container.querySelector(".markra-mermaid-render svg")).not.toBeNull();
  });

  it("renders a reusable visible Markdown preview with extended content", async () => {
    const onRendered = vi.fn();
    const resolveImageSrc = vi.fn((src: string) => `markra-preview://${src}`);

    const { container } = render(
      <MarkdownPreviewDocument
        markdown={[
          "> [!WARNING]",
          "> Check this synthetic preview.",
          "",
          "Inline $x^2$ formula.",
          "",
          "![Mock](assets/mock.png)",
          "",
          "```mermaid",
          "flowchart TD",
          "  A --> B",
          "```"
        ].join("\n")}
        onRendered={onRendered}
        resolveImageSrc={resolveImageSrc}
      />
    );

    const article = container.querySelector("article");
    expect(article).toHaveClass("markdown-paper", "markdown-preview-paper");
    expect(article).toHaveTextContent("Check this synthetic preview.");
    expect(article?.querySelector(".markra-callout-warning")).not.toBeNull();
    expect(article?.querySelector(".markra-math-render-inline")).not.toBeNull();
    expect(article?.querySelector("img")).toHaveAttribute("src", "markra-preview://assets/mock.png");

    await waitFor(() => expect(article?.querySelector(".markra-mermaid-render svg")).not.toBeNull());
    expect(onRendered).toHaveBeenCalledWith(article);
  });
});
