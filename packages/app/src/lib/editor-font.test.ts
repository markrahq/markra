import { describe, expect, it } from "vitest";
import { editorFontFamilyCssValue } from "./editor-font";

describe("editor font", () => {
  it("falls back to the shared UI font when a selected system font is unavailable", () => {
    expect(
      editorFontFamilyCssValue({
        family: "Example Sans",
        source: "system"
      })
    ).toBe('"Example Sans", var(--font-ui)');
  });
});
