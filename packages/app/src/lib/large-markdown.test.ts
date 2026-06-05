import {
  largeMarkdownVisualLimitBytes,
  largeMarkdownVisualLimitChars,
  largeMarkdownVisualLimitLines,
  shouldBlockLargeMarkdownVisual
} from "./large-markdown";

describe("large markdown visual limit", () => {
  it("uses one megabyte file size and fallback character thresholds", () => {
    expect(largeMarkdownVisualLimitBytes).toBe(1_000_000);
    expect(largeMarkdownVisualLimitChars).toBe(1_000_000);
  });

  it("blocks visual rendering by character and line count thresholds", () => {
    expect(shouldBlockLargeMarkdownVisual("# Small document")).toBe(false);
    expect(shouldBlockLargeMarkdownVisual("x".repeat(largeMarkdownVisualLimitChars - 1))).toBe(false);
    expect(shouldBlockLargeMarkdownVisual("x".repeat(largeMarkdownVisualLimitChars))).toBe(true);
    expect(
      shouldBlockLargeMarkdownVisual(Array.from({ length: largeMarkdownVisualLimitLines - 1 }, () => "Line").join("\n"))
    ).toBe(false);
    expect(
      shouldBlockLargeMarkdownVisual(Array.from({ length: largeMarkdownVisualLimitLines }, () => "Line").join("\n"))
    ).toBe(true);
  });

  it("blocks visual rendering from native file size metadata before scanning content", () => {
    expect(shouldBlockLargeMarkdownVisual("# Small document", {
      sizeBytes: largeMarkdownVisualLimitBytes
    })).toBe(true);
    expect(shouldBlockLargeMarkdownVisual("x".repeat(largeMarkdownVisualLimitChars - 1), {
      sizeBytes: largeMarkdownVisualLimitBytes - 1
    })).toBe(false);
    expect(shouldBlockLargeMarkdownVisual("x".repeat(largeMarkdownVisualLimitChars), {
      sizeBytes: largeMarkdownVisualLimitBytes - 1
    })).toBe(false);
  });
});
