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
});
