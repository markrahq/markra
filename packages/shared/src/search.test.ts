import {
  describeWorkspaceSearchQuery,
  findSearchRanges,
  parseWorkspaceSearchQuery
} from "./search";

describe("document search", () => {
  it("matches punctuation exactly without width normalization", () => {
    const text = "alpha, beta，gamma, delta";

    expect(findSearchRanges(text, ",")).toEqual([
      { from: 5, to: 6 },
      { from: 17, to: 18 }
    ]);
    expect(findSearchRanges(text, "，")).toEqual([{ from: 11, to: 12 }]);
  });

  it("supports case-sensitive matching", () => {
    const text = "Markra markra MARKRA";

    expect(findSearchRanges(text, "markra")).toEqual([
      { from: 0, to: 6 },
      { from: 7, to: 13 },
      { from: 14, to: 20 }
    ]);
    expect(findSearchRanges(text, "markra", { caseSensitive: true })).toEqual([{ from: 7, to: 13 }]);
  });

  it("keeps original offsets when case folding changes string length", () => {
    expect(findSearchRanges("İ, exact", ",")).toEqual([{ from: 1, to: 2 }]);
  });

  it("stops collecting ranges once the match limit is reached", () => {
    expect(findSearchRanges("alpha beta alpha gamma alpha", "alpha", { maxMatches: 2 })).toEqual([
      { from: 0, to: 5 },
      { from: 11, to: 16 }
    ]);
  });
});

describe("workspace search query", () => {
  it("parses Obsidian-style field filters and exclusions", () => {
    const plan = parseWorkspaceSearchQuery("file:guide path:docs content:Alpha -draft", {
      caseSensitive: false
    });

    expect(plan?.groups).toEqual([
      {
        include: [
          { caseSensitive: false, query: "guide", scope: "file" },
          { caseSensitive: false, query: "docs", scope: "path" },
          { caseSensitive: false, query: "Alpha", scope: "content" }
        ],
        exclude: [
          { caseSensitive: false, query: "draft", scope: "content" }
        ]
      }
    ]);
  });

  it("supports OR groups and inline case operators", () => {
    const plan = parseWorkspaceSearchQuery("match-case:Alpha OR ignore-case:beta", {
      caseSensitive: false
    });

    expect(plan?.groups).toEqual([
      {
        include: [{ caseSensitive: true, query: "Alpha", scope: "content" }],
        exclude: []
      },
      {
        include: [{ caseSensitive: false, query: "beta", scope: "content" }],
        exclude: []
      }
    ]);
  });

  it("keeps unknown colon tokens as content terms", () => {
    const plan = parseWorkspaceSearchQuery("https://example.test", {
      caseSensitive: false
    });

    expect(plan?.groups[0]?.include).toEqual([
      { caseSensitive: false, query: "https://example.test", scope: "content" }
    ]);
  });

  it("describes the parsed query without hardcoded UI copy", () => {
    expect(describeWorkspaceSearchQuery("file:guide -draft OR path:docs", {
      caseSensitive: false
    })).toEqual([
      { kind: "include", query: "guide", scope: "file" },
      { kind: "exclude", query: "draft", scope: "content" },
      { kind: "or" },
      { kind: "include", query: "docs", scope: "path" }
    ]);
  });
});
