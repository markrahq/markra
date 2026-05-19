import { buildMarkdownHtmlDocument, exportDocumentFileName, localFileUrlFromPath } from "./document-export";

describe("document export helpers", () => {
  it("derives export file names from markdown document names", () => {
    expect(exportDocumentFileName("Draft.md", "html")).toBe("Draft.html");
    expect(exportDocumentFileName("Research.markdown", "pdf")).toBe("Research.pdf");
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

  it("creates file URLs for local export assets", () => {
    expect(localFileUrlFromPath("/Users/me/notes/assets/pasted image.png")).toBe(
      "file:///Users/me/notes/assets/pasted%20image.png"
    );
    expect(localFileUrlFromPath("C:\\Users\\me\\notes\\image.png")).toBe(
      "file:///C:/Users/me/notes/image.png"
    );
  });
});
