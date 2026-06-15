import { render } from "@testing-library/react";

vi.mock("./MarkdownPaperSurface", () => ({
  MarkdownPaperSurface: () => {
    throw new Promise(() => {});
  }
}));

import { MarkdownPaper } from "./MarkdownPaper";

describe("MarkdownPaper lazy loading", () => {
  it("keeps the paper shell visible while the visual editor surface loads", () => {
    const { container } = render(
      <MarkdownPaper
        initialContent=""
        onEditorReady={() => {}}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    expect(container.querySelector('[data-editor-engine="milkdown"]')).toBeInTheDocument();
    expect(container.querySelector('[data-editor-engine="milkdown-loading"]')).toBeInTheDocument();
  });
});
