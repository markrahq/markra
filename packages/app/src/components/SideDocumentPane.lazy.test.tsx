import { render, screen } from "@testing-library/react";
import { SideDocumentPane } from "./SideDocumentPane";

const sourceEditorModule = vi.hoisted(() => ({
  loads: 0
}));

vi.mock("./LargeMarkdownNotice", () => ({
  LargeMarkdownNotice: () => <div data-testid="large-markdown-notice" />
}));

vi.mock("./MarkdownPaper", () => ({
  MarkdownPaper: () => <div data-testid="visual-editor" />
}));

vi.mock("./MarkdownSourceEditor", () => {
  sourceEditorModule.loads += 1;

  return {
    MarkdownSourceEditor: ({ content }: { content: string }) => (
      <div
        aria-label="Markdown source"
        role="textbox"
      >
        {content}
      </div>
    )
  };
});

describe("SideDocumentPane source editor loading", () => {
  it("loads the source editor module only when source mode is rendered", async () => {
    const props = {
      bodyFontSize: 16,
      content: "# Source",
      contentWidth: "default" as const,
      contentWidthPx: null,
      editorFontFamily: { family: null, source: "theme" } as const,
      editorTheme: "light" as const,
      lineHeight: 1.65,
      mode: "visual" as const,
      onChange: vi.fn(),
      revision: 0
    };
    const { rerender } = render(<SideDocumentPane {...props} />);

    expect(screen.getByTestId("visual-editor")).toBeInTheDocument();
    expect(sourceEditorModule.loads).toBe(0);

    rerender(<SideDocumentPane {...props} mode="source" />);

    expect(await screen.findByRole("textbox", { name: "Markdown source" })).toHaveTextContent("# Source");
    expect(sourceEditorModule.loads).toBe(1);
  });
});
