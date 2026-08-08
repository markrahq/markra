import { render, screen } from "@testing-library/react";
import { SideDocumentPane } from "./SideDocumentPane";

const sourceEditorModule = vi.hoisted(() => ({
  loads: 0,
  pending: new Promise(() => {}),
  suspend: false
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
    MarkdownSourceEditor: ({ content }: { content: string }) => {
      if (sourceEditorModule.suspend) throw sourceEditorModule.pending;

      return (
        <div
          aria-label="Markdown source"
          role="textbox"
        >
          {content}
        </div>
      );
    }
  };
});

describe("SideDocumentPane source editor loading", () => {
  beforeEach(() => {
    sourceEditorModule.suspend = false;
  });

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

  it("shows a visible source-shaped placeholder while the editor loads", () => {
    sourceEditorModule.suspend = true;

    const { container } = render(
      <SideDocumentPane
        bodyFontSize={16}
        content="# Synthetic source"
        contentWidth="default"
        contentWidthPx={null}
        editorFontFamily={{ family: null, source: "theme" }}
        editorTheme="light"
        lineHeight={1.65}
        mode="source"
        onChange={() => {}}
        revision={0}
      />
    );

    const fallback = container.querySelector('[data-editor-engine="source-loading"]');
    expect(fallback).toBeInTheDocument();
    expect(fallback?.querySelectorAll("[data-source-loading-line]")).toHaveLength(6);
  });
});
