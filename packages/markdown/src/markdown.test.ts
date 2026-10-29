import { getMarkdownOutline, getWordCount } from "./markdown";

describe("markdown helpers", () => {
  it("counts words in mixed prose", () => {
    expect(getWordCount("Markra writes local Markdown notes 123")).toBe(6);
  });

  it("counts plain English words and numbers", () => {
    expect(getWordCount("Spring notes bring clear fresh air into Markra drafts 2026")).toBe(10);
    expect(getWordCount("Write Markdown notes 2026")).toBe(4);
  });

  it("extracts a simple markdown heading outline", () => {
    expect(getMarkdownOutline("# Intro\n\nBody\n\n### Details\n\n```\n# ignored\n```\n\n## Next")).toEqual([
      { level: 1, title: "Intro" },
      { level: 3, title: "Details" },
      { level: 2, title: "Next" }
    ]);
  });

  it("extracts readable titles from formatted markdown headings", () => {
    expect(
      getMarkdownOutline(
        [
          "# **Synthetic** heading",
          "## _Linked_ [label](https://example.test)",
          "### `Code` and ~~old text~~"
        ].join("\n\n")
      )
    ).toEqual([
      { level: 1, title: "Synthetic heading", titleMarkdown: "**Synthetic** heading" },
      { level: 2, title: "Linked label", titleMarkdown: "_Linked_ [label](https://example.test)" },
      { level: 3, title: "Code and old text", titleMarkdown: "`Code` and ~~old text~~" }
    ]);
  });

  it("extracts readable titles from Markra highlight and math headings", () => {
    expect(getMarkdownOutline("# ==Marked== formula $x^2$")).toEqual([
      { level: 1, title: "Marked formula x^2", titleMarkdown: "==Marked== formula $x^2$" }
    ]);
  });

  it("keeps numeric chapter prefixes in heading titles", () => {
    expect(
      getMarkdownOutline(["## 1. Overview", "### 2) Details", "## 10. **Final** chapter"].join("\n\n"))
    ).toEqual([
      { level: 2, title: "1. Overview" },
      { level: 3, title: "2) Details" },
      { level: 2, title: "10. Final chapter", titleMarkdown: "10. **Final** chapter" }
    ]);
  });

  it("keeps non-numeric leading marker prefixes in heading titles", () => {
    expect(
      getMarkdownOutline(["## - Dash heading", "### > Quoted heading"].join("\n\n"))
    ).toEqual([
      { level: 2, title: "- Dash heading" },
      { level: 3, title: "> Quoted heading" }
    ]);
  });

  it("includes Setext and quoted headings in document order", () => {
    const doc = [
      "# Start",
      "",
      "[42]",
      "---",
      "",
      "> ### **Quoted**",
      "",
      "# End"
    ].join("\n");

    expect(getMarkdownOutline(doc)).toEqual([
      { level: 1, title: "Start" },
      { level: 2, title: "[42]" },
      { level: 3, title: "Quoted", titleMarkdown: "**Quoted**" },
      { level: 1, title: "End" }
    ]);
  });

  it("keeps the full title of multiline and nested Setext headings", () => {
    const doc = [
      "Alpha",
      "**Beta**",
      "===",
      "",
      "> Gamma",
      "> **Delta**",
      "> ---",
      "",
      "- Epsilon",
      "  Zeta",
      "  ---"
    ].join("\n");

    expect(getMarkdownOutline(doc)).toEqual([
      { level: 1, title: "Alpha Beta", titleMarkdown: "Alpha **Beta**" },
      { level: 2, title: "Gamma Delta", titleMarkdown: "Gamma **Delta**" },
      { level: 2, title: "Epsilon Zeta" }
    ]);
  });

  it("follows Markdown heading boundaries and preserves literal trailing hashes", () => {
    expect(getMarkdownOutline(" # Indented\n\n# C#\n\n## Closed ##\n\n#\n\n# End")).toEqual([
      { level: 1, title: "Indented" },
      { level: 1, title: "C#" },
      { level: 2, title: "Closed" },
      { level: 1, title: "End" }
    ]);
  });

  it("ignores unfinished top-level underlines, rules, and headings inside code or HTML", () => {
    const doc = [
      "Unfinished dash", "-", "",
      "Unfinished equals", "=", "",
      "Plain text", "", "---", "",
      "````", "```", "# Fenced", "````", "",
      "    # Indented code", "",
      "<div>", "# HTML content", "</div>", "",
      "> Nested title", "> -", "",
      "# End"
    ].join("\n");

    expect(getMarkdownOutline(doc)).toEqual([
      { level: 2, title: "Nested title" },
      { level: 1, title: "End" }
    ]);
  });

  it.each([
    "---\ntitle: Synthetic\n---",
    '+++\ntitle = "Synthetic"\n# Hidden comment\n+++',
    '{\n  "title": "Synthetic"\n}'
  ])("omits frontmatter from the heading outline: %s", (frontmatter) => {
    expect(getMarkdownOutline(`${frontmatter}\n---\n\n# End`)).toEqual([
      { level: 1, title: "End" }
    ]);
  });
});
