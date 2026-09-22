import { assetFolderMatchesPath, resolveAssetFolder } from "./asset-folder";

describe("document asset folders", () => {
  it.each([
    ["${filename}.assets", "/mock-vault/mock.md", "mock.assets"],
    ["assets/${filename}", String.raw`C:\mock-vault\测试 note.v2.MD`, "assets/测试 note.v2"],
    ["${filename}/${filename}.assets", "mock.markdown", "mock/mock.assets"],
    ["${filename}.assets", ".mock.md", ".mock.assets"],
    ["${filename}.assets", "100%25.md", "100%25.assets"],
    ["${filename}.assets", "${filename}.md", "${filename}.assets"],
    ["assets", "mock.md", "assets"],
    [".", "mock.md", "."],
    ["${unknown}", "mock.md", "${unknown}"]
  ])("resolves %s for %s", (folder, documentPath, expected) => {
    expect(resolveAssetFolder(folder, documentPath)).toBe(expected);
  });

  it.each([
    ["${filename}", "...md"],
    ["${filename}/images", "..md"],
    ["../${filename}", "mock.md"],
    ["/${filename}", "mock.md"],
    ["C:/${filename}", "mock.md"],
    ["${filename}", "mock\u0000.md"]
  ])("rejects unsafe expanded folder %s for %s", (folder, path) => {
    expect(() => resolveAssetFolder(folder, path)).toThrow();
  });

  it.each([
    ["notes/mock.assets/file.pdf", "${filename}.assets", true],
    ["notes/media/mock/file.pdf", "media/${filename}", true],
    ["notes/media/mock/mock.assets/file.pdf", "media/${filename}/${filename}.assets", true],
    ["notes/media/mock/other.assets/file.pdf", "media/${filename}/${filename}.assets", false],
    ["notes/.assets/file.pdf", "${filename}.assets", false],
    ["notes/mockXassets/file.pdf", "${filename}.assets", false],
    ["notes/downloads/file.pdf", "${filename}.assets", false],
    ["mock.assets-extra/file.pdf", "${filename}.assets", false],
    ["notes/mock.assets/nested/file.pdf", "${filename}.assets", true],
    ["assets/file.pdf", "assets", true],
    ["downloads/file.pdf", "assets", false],
    ["notes/assets/file.pdf", "assets", false],
    ["file.pdf", ".", true],
    ["file.pdf", "${filename}", false],
    ["mock.assets", "${filename}.assets", false]
  ])("matches %s against %s", (path, folder, expected) => {
    expect(assetFolderMatchesPath(path, folder)).toBe(expected);
  });
});
