import { findSearchRanges } from "./search";

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
