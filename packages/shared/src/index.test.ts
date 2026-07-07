import {
  clampNumber,
  fileNameFromPath,
  firstMarkdownPath,
  folderNameFromDocumentPath,
  hasTauriRuntime,
  isMarkdownPath,
  isRecord,
  joinApiUrl,
  normalizeNullableString,
  normalizedExternalAutolinkUrl,
  parentPathFromPath,
  pathNameFromPath,
  runtimeDiagnosticEvent,
  sanitizeDiagnosticDetails,
  sanitizeDiagnosticText,
  stableTextKey
} from ".";

describe("utilities", () => {
  beforeEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("normalizes blank or non-string values to null", () => {
    expect(normalizeNullableString("")).toBeNull();
    expect(normalizeNullableString("   ")).toBeNull();
    expect(normalizeNullableString(null)).toBeNull();
    expect(normalizeNullableString(42)).toBeNull();
  });

  it("keeps non-empty strings unchanged", () => {
    expect(normalizeNullableString("/mock-files/vault")).toBe("/mock-files/vault");
  });

  it("recognizes non-null object records", () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("text")).toBe(false);
  });

  it("detects whether the app is running inside Tauri", () => {
    expect(hasTauriRuntime()).toBe(false);

    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    expect(hasTauriRuntime()).toBe(true);
  });

  it("clamps numeric values and rejects non-numeric input", () => {
    expect(clampNumber(12, 0, 10)).toBe(10);
    expect(clampNumber(-2, 0, 10)).toBe(0);
    expect(clampNumber(4, 0, 10)).toBe(4);
    expect(clampNumber(undefined, 0, 10)).toBeNull();
    expect(clampNumber(Number.NaN, 0, 10)).toBeNull();
  });

  it("reads names from POSIX and Windows-style paths", () => {
    expect(fileNameFromPath("/vault/docs/readme.md")).toBe("readme.md");
    expect(fileNameFromPath("C:\\vault\\docs\\readme.md")).toBe("readme.md");
    expect(fileNameFromPath("")).toBe("Untitled.md");
    expect(pathNameFromPath("/vault/docs")).toBe("docs");
    expect(pathNameFromPath(null)).toBe("No folder");
    expect(folderNameFromDocumentPath("/vault/docs/readme.md")).toBe("docs");
    expect(folderNameFromDocumentPath(null)).toBe("No folder");
    expect(parentPathFromPath("/vault/docs/readme.md")).toBe("/vault/docs");
    expect(parentPathFromPath("/readme.md")).toBe("/");
    expect(parentPathFromPath("C:\\vault\\docs\\readme.md")).toBe("C:\\vault\\docs");
    expect(parentPathFromPath("C:\\readme.md")).toBe("C:\\");
    expect(parentPathFromPath("readme.md")).toBeNull();
  });

  it("builds stable short text keys", () => {
    expect(stableTextKey("/vault/readme.md")).toBe(stableTextKey("/vault/readme.md"));
    expect(stableTextKey("/vault/readme.md")).not.toBe(stableTextKey("/vault/notes.md"));
  });

  it("detects supported markdown file paths", () => {
    expect(isMarkdownPath("/vault/readme.md")).toBe(true);
    expect(isMarkdownPath("/vault/readme.markdown")).toBe(true);
    expect(isMarkdownPath("/vault/notes.txt")).toBe(true);
    expect(isMarkdownPath("/vault/image.png")).toBe(false);
    expect(firstMarkdownPath(["/vault/image.png", "/vault/readme.md"])).toBe("/vault/readme.md");
    expect(firstMarkdownPath(["/vault/image.png"])).toBeNull();
  });

  it("joins API base URLs and paths without duplicate slashes", () => {
    expect(joinApiUrl("https://api.example.com/v1", "/models")).toBe("https://api.example.com/v1/models");
    expect(joinApiUrl("https://api.example.com/v1/", "models")).toBe("https://api.example.com/v1/models");
  });

  it("keeps existing query URLs untouched", () => {
    expect(joinApiUrl("https://api.example.com/openai/models?api-version=1", "/models")).toBe(
      "https://api.example.com/openai/models?api-version=1"
    );
  });

  it("appends query paths directly to host-only URLs", () => {
    expect(joinApiUrl("https://api.example.com", "?api-version=1")).toBe("https://api.example.com?api-version=1");
  });

  it("normalizes explicit external URLs for autolinking", () => {
    expect(normalizedExternalAutolinkUrl(" https://example.test/articles/about ")).toBe(
      "https://example.test/articles/about"
    );
    expect(normalizedExternalAutolinkUrl("mailto:hello@example.test")).toBe("mailto:hello@example.test");
  });

  it("rejects text that should not be autolinked", () => {
    expect(normalizedExternalAutolinkUrl("example.test/articles/about")).toBeNull();
    expect(normalizedExternalAutolinkUrl("https://example.test first")).toBeNull();
    expect(normalizedExternalAutolinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizedExternalAutolinkUrl("file:///mock-files/secret.md")).toBeNull();
  });

  it("redacts diagnostic details without losing useful context", () => {
    expect(runtimeDiagnosticEvent).toBe("markra:runtime-diagnostic");
    expect(sanitizeDiagnosticText("failed at https://s3.example.test/private /Users/example/private-note.md")).toBe(
      "failed at [redacted] [redacted]"
    );
    expect(sanitizeDiagnosticDetails({
      command: "upload_s3_image",
      endpointUrl: "https://s3.example.test/private",
      password: "synthetic-secret",
      payload: {
        fileName: "pasted-image.png",
        secretAccessKey: "synthetic-secret",
        sourcePath: "/Users/example/private-note.md"
      }
    })).toEqual({
      command: "upload_s3_image",
      endpointUrl: "[redacted]",
      password: "[redacted]",
      payload: "{\"fileName\":\"pasted-image.png\",\"secretAccessKey\":\"[redacted]\",\"sourcePath\":\"[redacted]\"}"
    });
  });
});
