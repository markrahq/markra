import type { NativeMarkdownFolderFile } from "./tauri";
import { quickOpenFiles } from "./quick-open";

const files = [
  {
    name: "alpha.md",
    path: "/mock-vault/notes/alpha.md",
    relativePath: "notes/alpha.md"
  },
  {
    name: "project.md",
    path: "/mock-vault/alpha/project.md",
    relativePath: "alpha/project.md"
  },
  {
    kind: "asset",
    name: "alpha.png",
    path: "/mock-vault/assets/alpha.png",
    relativePath: "assets/alpha.png"
  },
  {
    kind: "folder",
    name: "alpha",
    path: "/mock-vault/alpha",
    relativePath: "alpha"
  }
] satisfies NativeMarkdownFolderFile[];

describe("quickOpenFiles", () => {
  it("filters unsupported entries and ranks file-name matches ahead of path-only matches", () => {
    expect(quickOpenFiles(files, "alpha").map((result) => result.file.relativePath)).toEqual([
      "notes/alpha.md",
      "alpha/project.md"
    ]);
  });

  it("shows the current file before other open files when the query is empty", () => {
    expect(quickOpenFiles(files, "", {
      currentPath: "/mock-vault/alpha/project.md",
      openFilePaths: ["/mock-vault/notes/alpha.md", "/mock-vault/alpha/project.md"]
    }).map((result) => result.file.relativePath)).toEqual([
      "alpha/project.md",
      "notes/alpha.md"
    ]);
  });
});
