import {
  analyzeMarkdown,
  defaultDocumentStatsOptions,
  formatDocumentStatsMarkdown,
  normalizeDocumentStatsOptions
} from "./stats";

const syntheticMarkdown = `---
title: Synthetic
summary: Count me later
---

# Example Draft

Opening paragraph has five words.

## Notes

- Alpha beta
- Gamma delta

\`\`\`txt
ignored code words
\`\`\`
`;

describe("document stats analysis", () => {
  it("counts readable markdown while excluding frontmatter and fenced code by default", () => {
    const stats = analyzeMarkdown(syntheticMarkdown, {
      ...defaultDocumentStatsOptions,
      readingSpeed: 6
    });

    expect(stats).toEqual({
      characters: 64,
      headings: 2,
      paragraphs: 2,
      readingTimeMinutes: 1,
      words: 12
    });
  });

  it("can include frontmatter and fenced code when configured", () => {
    const stats = analyzeMarkdown(syntheticMarkdown, {
      countCodeBlocks: true,
      countFrontmatter: true,
      readingSpeed: 10
    });

    expect(stats.words).toBe(21);
    expect(stats.readingTimeMinutes).toBe(1);
  });

  it("normalizes stored options before using them", () => {
    expect(normalizeDocumentStatsOptions({
      countCodeBlocks: "yes",
      countFrontmatter: true,
      readingSpeed: 5000
    })).toEqual({
      countCodeBlocks: false,
      countFrontmatter: true,
      readingSpeed: 1000
    });
  });

  it("formats an insertable markdown summary", () => {
    expect(formatDocumentStatsMarkdown({
      characters: 17,
      headings: 1,
      paragraphs: 1,
      readingTimeMinutes: 1,
      words: 4
    }, "example.md")).toBe([
      "## Document Stats",
      "",
      "- Document: example.md",
      "- Words: 4",
      "- Characters: 17",
      "- Paragraphs: 1",
      "- Headings: 1",
      "- Reading time: 1 min"
    ].join("\n"));
  });
});
