import { render, waitFor } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}" data-testid="mock-mermaid"><g></g></svg>`
    }))
  }
}));

import { MarkdownPreviewDocument } from "./MarkdownPreviewDocument";

describe("MarkdownPreviewDocument", () => {
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
