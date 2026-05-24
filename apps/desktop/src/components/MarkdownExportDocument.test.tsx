import { render, waitFor } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}" data-testid="mock-mermaid"><g></g></svg>`
    }))
  }
}));

import { MarkdownExportDocument } from "./MarkdownExportDocument";

describe("MarkdownExportDocument", () => {
  it("renders ordinary Markdown line breaks without explicit br tags", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: "First line\nSecond line",
          title: "line-breaks.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("First line<br");
    expect(bodyHtml).toContain("Second line");
    expect(bodyHtml).not.toContain("&lt;br");
  });

  it("renders inline and display math before exporting HTML", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "pdf",
          markdown: "Inline $x^2$ formula.\n\n$$\n\\int_0^1 x \\, dx\n$$",
          title: "math.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("markra-math-render-inline");
    expect(bodyHtml).toContain("markra-math-render-display");
    expect(bodyHtml).toContain("katex");
    expect(bodyHtml).not.toContain("language-math");
  });

  it("renders Hugo-style inline and display math before exporting HTML", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "pdf",
          markdown: [
            String.raw`Inline \(x^2\) formula.`,
            "",
            String.raw`\[`,
            String.raw`\begin{aligned}`,
            String.raw`x &= a \\`,
            String.raw`- y &= b`,
            String.raw`\end{aligned}`,
            String.raw`\]`
          ].join("\n"),
          title: "hugo-math.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("markra-math-render-inline");
    expect(bodyHtml).toContain("markra-math-render-display");
    expect(bodyHtml).toContain("katex");
    expect(bodyHtml).not.toContain("<ul>");
    expect(bodyHtml).not.toContain("language-math");
  });

  it("applies display math macro definitions before exporting HTML", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: [
            "$$",
            String.raw`\newcommand{\RR}{\mathbb{R}}`,
            String.raw`\newcommand{\vect}[1]{\mathbf{#1}}`,
            "$$",
            "",
            String.raw`The domain is $\RR$.`,
            "",
            String.raw`Vector $\vect{x}$.`
          ].join("\n"),
          title: "macro-math.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain('class="mord mathbb">R</span>');
    expect(bodyHtml).toContain('class="mord mathbf">x</span>');
    expect(bodyHtml).not.toContain(String.raw`\newcommand`);
    expect(bodyHtml).not.toContain('style="color:#cc0000;">\\RR');
  });

  it("renders Mermaid code blocks before exporting HTML", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n"),
          title: "diagram.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("markra-mermaid-render");
    expect(bodyHtml).toContain("<svg");
    expect(bodyHtml).not.toContain("language-mermaid");
  });

  it("renders GitHub-style alert blockquotes as callouts before exporting HTML", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: "> [!WARNING]\n> Check this before publishing.",
          title: "callout.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("markra-callout");
    expect(bodyHtml).toContain("markra-callout-warning");
    expect(bodyHtml).toContain('data-callout-type="warning"');
    expect(bodyHtml).toContain("Warning");
    expect(bodyHtml).toContain("Check this before publishing.");
  });

  it("exports GitHub-style alert blockquotes as plain blockquotes when the extension is disabled", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        extendedSyntax={{
          githubAlerts: false,
          highlight: true
        }}
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: "> [!WARNING]\n> Check this before publishing.",
          title: "callout.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).not.toContain("markra-callout");
    expect(bodyHtml).toContain("[!WARNING]");
    expect(bodyHtml).toContain("Check this before publishing.");
  });

  it("omits empty marker paragraphs from exported callouts", async () => {
    const onRendered = vi.fn();

    render(
      <MarkdownExportDocument
        onRendered={onRendered}
        snapshot={{
          id: 1,
          kind: "html",
          markdown: "> [!NOTE]\n>\n> Keep this in mind.",
          title: "callout.md"
        }}
      />
    );

    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));

    const bodyHtml = onRendered.mock.calls[0]?.[0].bodyHtml as string;
    expect(bodyHtml).toContain("markra-callout-note");
    expect(bodyHtml).toContain("Keep this in mind.");
    expect(bodyHtml).not.toContain("<p></p>");
  });
});
