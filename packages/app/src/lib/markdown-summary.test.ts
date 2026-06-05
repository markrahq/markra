import {
  markdownSummaryDeferredLimitBytes,
  markdownSummaryDeferredLimitChars,
  shouldDeferMarkdownSummary
} from "./markdown-summary";

describe("markdown summary scheduling", () => {
  it("defers summaries for medium documents below the visual rendering limit", () => {
    expect(markdownSummaryDeferredLimitBytes).toBe(256_000);
    expect(markdownSummaryDeferredLimitChars).toBe(256_000);
    expect(shouldDeferMarkdownSummary("# Small", {
      sizeBytes: markdownSummaryDeferredLimitBytes - 1
    })).toBe(false);
    expect(shouldDeferMarkdownSummary("# Medium", {
      sizeBytes: markdownSummaryDeferredLimitBytes
    })).toBe(true);
    expect(shouldDeferMarkdownSummary("x".repeat(markdownSummaryDeferredLimitChars))).toBe(true);
  });

  it("does not defer summaries for documents blocked from visual rendering", () => {
    expect(shouldDeferMarkdownSummary("# Large", {
      sizeBytes: 1_000_000
    })).toBe(false);
  });
});
