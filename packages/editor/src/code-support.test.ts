import { describe, expect, it } from "vitest";
import { highlightMarkraCode } from "./code-support.ts";

describe("code highlighting", () => {
  it("treats missing and unsupported languages as plain text", () => {
    const source = "const syntheticValue = 42;";

    expect(highlightMarkraCode("", source)).toEqual([]);
    expect(highlightMarkraCode("synthetic-unknown-language", source)).toEqual(
      [],
    );
  });

  it("highlights explicitly supported languages", () => {
    expect(highlightMarkraCode("javascript", "const value = 42;")).not.toEqual(
      [],
    );
  });
});
