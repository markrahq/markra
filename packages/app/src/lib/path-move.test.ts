import { normalizeComparablePath, replaceMovedPath, sameNativePath } from "./path-move";

describe("path move helpers", () => {
  it("compares Windows verbatim paths with regular native paths", () => {
    expect(normalizeComparablePath("\\\\?\\C:\\mock-vault\\Created.md")).toBe("c:/mock-vault/created.md");
    expect(sameNativePath("\\\\?\\C:\\mock-vault\\Created.md", "c:/mock-vault/created.md")).toBe(true);
  });

  it("replaces moved paths when the current path uses a Windows verbatim prefix", () => {
    expect(replaceMovedPath(
      "\\\\?\\C:\\mock-vault\\docs\\note.md",
      "C:\\mock-vault",
      "D:\\archive"
    )).toBe("D:\\archive\\docs\\note.md");
  });
});
