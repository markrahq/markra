import {
  findSearchRanges,
  isValidSearchQuery,
  resolveSearchReplacement
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

  it("matches regular expressions with multiline and case-sensitive options", () => {
    const text = "Alpha-12\nalpha-345\nbeta-9";

    expect(findSearchRanges(text, "^alpha-\\d+$", { regularExpression: true })).toEqual([
      { from: 0, to: 8 },
      { from: 9, to: 18 }
    ]);
    expect(findSearchRanges(text, "^alpha-\\d+$", {
      caseSensitive: true,
      regularExpression: true
    })).toEqual([{ from: 9, to: 18 }]);
  });

  it("handles zero-width regular expression matches without looping", () => {
    expect(findSearchRanges("alpha\nbeta", "^", { regularExpression: true })).toEqual([
      { from: 0, to: 0 },
      { from: 6, to: 6 }
    ]);
  });

  it("reports invalid regular expressions without affecting literal queries", () => {
    expect(isValidSearchQuery("[", { regularExpression: true })).toBe(false);
    expect(isValidSearchQuery("[", { regularExpression: false })).toBe(true);
    expect(findSearchRanges("[", "[", { regularExpression: true })).toEqual([]);
  });

  it("expands numbered and named capture groups in replacements", () => {
    const text = "first:last";
    const [range] = findSearchRanges(text, "(?<first>\\w+):(?<last>\\w+)", {
      caseSensitive: true,
      regularExpression: true
    });

    expect(resolveSearchReplacement(
      text,
      range,
      "(?<first>\\w+):(?<last>\\w+)",
      "$<last>, $1 ($$)",
      { caseSensitive: true, regularExpression: true }
    )).toBe("last, first ($)");
  });
});
