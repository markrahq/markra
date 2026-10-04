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
  it("renders sanitized HTML blocks and resolves their image sources before reporting completion", async () => {
    const onRendered = vi.fn();
    const resolveImageSrc = vi.fn((src: string) => `asset://${src}`);
    const { container, rerender } = render(
      <MarkdownPreviewDocument
        markdown={'<div><table onclick="bad()"><tr><td rowspan="2" style="vertical-align: middle; position: fixed"><strong>A</strong><img src="assets/mock.png" onerror="bad()"></td><td>B</td></tr><tr><td>C</td></tr></table><script>bad()</script><iframe src="https://example.test"></iframe><a href="javascript:bad()">Unsafe</a></div>'}
        resolveImageSrc={resolveImageSrc}
        onRendered={onRendered}
      />
    );
    await waitFor(() => expect(onRendered).toHaveBeenCalled());
    const cell = container.querySelector<HTMLTableCellElement>('td[rowspan="2"]');

    expect(cell?.style.verticalAlign).toBe("middle");
    expect(cell?.style.position).toBe("");
    expect(cell?.querySelector("strong")?.textContent).toBe("A");
    expect(cell?.querySelector("img")).toHaveAttribute("src", "asset://assets/mock.png");
    expect(container.querySelector("script, iframe, [onclick], [onerror], a[href]")).toBeNull();
    expect(onRendered.mock.calls[0]![0].querySelector("table")).not.toBeNull();

    rerender(<MarkdownPreviewDocument markdown="Updated **synthetic** content" />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("synthetic");
  });

  it("renders HTML blocks inside quotes and list items while keeping fenced HTML as code", () => {
    const { container } = render(
      <MarkdownPreviewDocument markdown={[
        "> <table><tr><td>Quoted</td></tr></table>",
        "",
        "- <table><tr><td>Listed</td></tr></table>",
        "",
        "```html",
        "<table><tr><td>Code</td></tr></table>",
        "```"
      ].join("\n")} />
    );

    expect(container.querySelector("blockquote table td")?.textContent).toBe("Quoted");
    expect(container.querySelector("li table td")?.textContent).toBe("Listed");
    expect(container.querySelector("pre code")?.textContent).toContain("<table><tr><td>Code</td></tr></table>");
    expect(container.querySelector("pre table")).toBeNull();
  });

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
