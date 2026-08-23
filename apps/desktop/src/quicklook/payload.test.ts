import {
  applyQuickLookAppearance,
  normalizeQuickLookPayload,
  resolveQuickLookImageSrc
} from "./payload";

describe("Quick Look payload", () => {
  it("accepts structured Markdown data and rejects malformed payloads", () => {
    expect(normalizeQuickLookPayload({
      appearance: "dark",
      fileName: "mock.md",
      markdown: "# Mock preview"
    })).toEqual({
      appearance: "dark",
      fileName: "mock.md",
      markdown: "# Mock preview"
    });

    expect(normalizeQuickLookPayload({ fileName: "mock.md" })).toBeNull();
    expect(normalizeQuickLookPayload({ markdown: 42 })).toBeNull();
  });

  it("uses a visible safe placeholder for local images blocked by the extension sandbox", () => {
    expect(resolveQuickLookImageSrc("assets/mock image.png")).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/
    );
    expect(resolveQuickLookImageSrc("../outside.png")).not.toContain("markra-asset:");
  });

  it("allows web and raster data images while blocking active or local URL schemes", () => {
    expect(resolveQuickLookImageSrc("https://example.test/mock.png")).toBe(
      "https://example.test/mock.png"
    );
    expect(resolveQuickLookImageSrc("data:image/png;base64,bW9jaw==")).toBe(
      "data:image/png;base64,bW9jaw=="
    );
    expect(resolveQuickLookImageSrc("javascript:alert(1)")).toBe("");
    expect(resolveQuickLookImageSrc("file:///tmp/mock.png")).toBe("");
    expect(resolveQuickLookImageSrc("data:image/svg+xml,<svg></svg>")).toBe("");
  });

  it("applies the native effective appearance to the document root", () => {
    applyQuickLookAppearance("dark", document.documentElement);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyQuickLookAppearance("light", document.documentElement);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
