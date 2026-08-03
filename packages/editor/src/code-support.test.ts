import { describe, expect, it } from "vitest";
import { highlightMarkraCode } from "./code-support.ts";

describe("code highlighting", () => {
  it("auto-detects missing and unsupported languages", () => {
    const source = "const syntheticValue = 42;";

    expect(highlightMarkraCode("", source)).not.toEqual([]);
    expect(
      highlightMarkraCode("synthetic-unknown-language", source),
    ).not.toEqual([]);
  });

  it("highlights explicitly supported languages", () => {
    expect(highlightMarkraCode("javascript", "const value = 42;")).not.toEqual(
      [],
    );
  });
});
