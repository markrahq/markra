import { buildMarkdownHtmlDocument, exportDocumentFileName, localFileUrlFromPath } from "./document-export";

describe("document export helpers", () => {
  it("derives export file names from markdown document names", () => {
    expect(exportDocumentFileName("Draft.md", "html")).toBe("Draft.html");
    expect(exportDocumentFileName("Research.markdown", "pdf")).toBe("Research.pdf");
    expect(exportDocumentFileName("Manuscript.md", "docx")).toBe("Manuscript.docx");
    expect(exportDocumentFileName("Book.md", "epub")).toBe("Book.epub");
    expect(exportDocumentFileName("Paper.md", "latex")).toBe("Paper.tex");
    expect(exportDocumentFileName("Notes.txt", "html")).toBe("Notes.html");
    expect(exportDocumentFileName("", "html")).toBe("Untitled.html");
  });

  it("wraps rendered markdown HTML in a standalone document", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: "<h1>Draft</h1><p>Ready.</p><h1>Next</h1>",
      pdfAuthor: "Ada & Co",
      pdfFooter: "Footer <Two>",
      pdfHeader: "Header & One",
      pdfHeightMm: 210,
      pdfMarginMm: 12,
      pdfPageBreakOnH1: true,
      pdfWidthMm: 148,
      title: "Draft & Notes"
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Draft &amp; Notes</title>");
    expect(html).toContain('<meta name="author" content="Ada &amp; Co">');
    expect(html).toContain('<main class="markdown-export">');
    expect(html).toContain('<header class="markdown-export-page-header">Header &amp; One</header>');
    expect(html).toContain('<footer class="markdown-export-page-footer">Footer &lt;Two&gt;</footer>');
    expect(html).toContain("<h1>Draft</h1><p>Ready.</p><h1>Next</h1>");
    expect(html).toContain(".katex");
    expect(html).toContain("@page {\n  size: 148mm 210mm;\n  margin: 12mm;\n}");
    expect(html).toContain(".markdown-export h1 {\n    break-before: page;\n  }");
    expect(html).toContain(".markdown-export {\n    max-width: none;\n    margin: 0;\n    padding: 0;\n  }");
  });

  it("adds print pagination rules for wide and block content", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: [
        "<h1>Mock export</h1>",
        "<pre><code>const syntheticValue = 'mock';</code></pre>",
        "<table><tbody><tr><td>Mock cell</td></tr></tbody></table>"
      ].join(""),
      title: "Mock Export"
    });

    expect(html).toMatch(/\.markdown-export h1,[\s\S]*break-after: avoid-page;[\s\S]*page-break-after: avoid;/u);
    expect(html).toMatch(/\.markdown-export pre,[\s\S]*\.markdown-export table,[\s\S]*break-inside: avoid-page;[\s\S]*page-break-inside: avoid;/u);
    expect(html).toMatch(/\.markdown-export tr,[\s\S]*\.markdown-export img,[\s\S]*break-inside: avoid-page;[\s\S]*page-break-inside: avoid;/u);
    expect(html).toContain(".markdown-export pre,\n  .markdown-export pre code {\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n  }");
  });

  it("uses lining figures so exported digits have a consistent height", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: "<p>Mock IDs A64, A064, A55, A054, A39, and A039.</p>",
      title: "Mock numeric export"
    });
    const exportRule = html.match(/\.markdown-export \{([^}]*)\}/u)?.[1];

    expect(exportRule).toContain("font-variant-numeric: lining-nums;");
  });

  it("uses a unified CJK serif stack for Simplified Chinese exports", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: "<p>示例12345</p>",
      language: "zh-CN",
      title: "Mock CJK export"
    });
    const simplifiedChineseRule = html.match(/:root:lang\(zh-CN\),[\s\S]*?\{([^}]*)\}/u)?.[1] ?? "";

    expect(simplifiedChineseRule).toMatch(
      /font-family: "Noto Serif CJK SC",[\s\S]*"Songti SC",[\s\S]*ui-serif/u
    );
  });

  it("removes rendered pure LaTeX macro definition blocks from standalone documents", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: [
        '<span class="markra-math-render markra-math-render-display">',
        '<span class="katex"><span class="katex-mathml"><math><semantics>',
        "<mrow></mrow>",
        '<annotation encoding="application/x-tex">\\newcommand{\\RR}{\\mathbb{R}} \\newcommand{\\vect}[1]{\\mathbf{#1}}</annotation>',
        "</semantics></math></span><span class=\"katex-html\"></span></span>",
        "</span>",
        "<p>The domain is rendered.</p>"
      ].join(""),
      title: "Macro export"
    });

    expect(html).not.toContain(String.raw`\newcommand`);
    expect(html).toContain("<p>The domain is rendered.</p>");
  });

  it("removes inline LaTeX macro definition markers from standalone documents", () => {
    const html = buildMarkdownHtmlDocument({
      bodyHtml: [
        '<p><span data-markra-math-macro-definition="" hidden=""></span></p>',
        '<p>Text before ',
        '<span class="markra-math-render markra-math-render-inline">',
        '<span class="katex"><span class="katex-mathml"><math><semantics>',
        "<mrow></mrow>",
        '<annotation encoding="application/x-tex">\\newcommand{\\b}{\\mathbb{b}}</annotation>',
        "</semantics></math></span><span class=\"katex-html\"></span></span>",
        "</span>",
        " text after.</p>"
      ].join(""),
      title: "Inline macro export"
    });

    expect(html).not.toContain(String.raw`\newcommand`);
    expect(html).not.toContain("data-markra-math-macro-definition");
    expect(html).not.toContain("<p></p>");
    expect(html).toContain("<p>Text before  text after.</p>");
  });

  it("creates file URLs for local export assets", () => {
    expect(localFileUrlFromPath("/Users/me/notes/assets/pasted image.png")).toBe(
      "file:///Users/me/notes/assets/pasted%20image.png"
    );
    expect(localFileUrlFromPath("C:\\Users\\me\\notes\\image.png")).toBe(
      "file:///C:/Users/me/notes/image.png"
    );
  });
});
