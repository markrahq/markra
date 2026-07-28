import { describe, expect, it } from "vitest";
import {
  canDeleteLegacyKatexFontAsset,
  isLegacyKatexFontAsset,
  keepWoff2KatexFontSources
} from "./katex-fonts";

describe("keepWoff2KatexFontSources", () => {
  it("keeps the WOFF2 source and removes legacy KaTeX font formats", () => {
    const css = [
      "@font-face {",
      '  font-family: "KaTeX_Main";',
      "  src:",
      '    url("./fonts/KaTeX_Main-Regular.woff2") format("woff2"),',
      '    url("./fonts/KaTeX_Main-Regular.woff") format("woff"),',
      '    url("./fonts/KaTeX_Main-Regular.ttf") format("truetype");',
      "}"
    ].join("\n");

    expect(keepWoff2KatexFontSources(css)).toContain(
      'src: url("./fonts/KaTeX_Main-Regular.woff2") format("woff2");'
    );
    expect(keepWoff2KatexFontSources(css)).not.toContain(".woff\"");
    expect(keepWoff2KatexFontSources(css)).not.toContain(".ttf");
  });

  it("leaves non-KaTeX font sources unchanged", () => {
    const css = [
      "@font-face {",
      '  font-family: "Synthetic Sans";',
      '  src: url("./synthetic.woff2") format("woff2"), url("./synthetic.woff") format("woff");',
      "}"
    ].join("\n");

    expect(keepWoff2KatexFontSources(css)).toBe(css);
  });

  it("keeps an inlined WOFF2 source without breaking its data URL", () => {
    const css = [
      "@font-face {",
      '  font-family: "KaTeX_Size3";',
      "  src:",
      '    url("data:font/woff2;base64,d09GMgABAAAA") format("woff2"),',
      '    url("./fonts/KaTeX_Size3-Regular.woff") format("woff"),',
      '    url("./fonts/KaTeX_Size3-Regular.ttf") format("truetype");',
      "}"
    ].join("\n");

    expect(keepWoff2KatexFontSources(css)).toContain(
      'src: url("data:font/woff2;base64,d09GMgABAAAA") format("woff2");'
    );
    expect(keepWoff2KatexFontSources(css)).not.toContain("KaTeX_Size3-Regular.woff");
    expect(keepWoff2KatexFontSources(css)).not.toContain("KaTeX_Size3-Regular.ttf");
  });
});

describe("isLegacyKatexFontAsset", () => {
  it("matches only KaTeX WOFF and TTF build assets", () => {
    expect(isLegacyKatexFontAsset("assets/fonts/KaTeX_Main-Regular-example.woff")).toBe(true);
    expect(isLegacyKatexFontAsset("assets/fonts/KaTeX_Main-Regular-example.ttf")).toBe(true);
    expect(isLegacyKatexFontAsset("assets/fonts/KaTeX_Main-Regular-example.woff2")).toBe(false);
    expect(isLegacyKatexFontAsset("assets/fonts/Synthetic-Regular-example.woff")).toBe(false);
  });
});

describe("canDeleteLegacyKatexFontAsset", () => {
  it("keeps a legacy asset while generated CSS still references it", () => {
    const fileName = "assets/fonts/KaTeX_Size3-Regular-example.woff";

    expect(canDeleteLegacyKatexFontAsset(fileName, [`src:url(/${fileName})`])).toBe(false);
    expect(canDeleteLegacyKatexFontAsset(fileName, ["src:url(data:font/woff2;base64,AAAA)"])).toBe(true);
  });
});
