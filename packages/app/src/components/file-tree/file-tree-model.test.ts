import { buildMarkdownFileTree } from "./file-tree-model";

describe("file tree model", () => {
  it("reuses a collator instead of calling localeCompare for every name sort comparison", () => {
    const localeCompareSpy = vi.spyOn(String.prototype, "localeCompare");

    try {
      buildMarkdownFileTree([
        { path: "/vault/note-10.md", name: "note-10.md", relativePath: "note-10.md" },
        { path: "/vault/note-2.md", name: "note-2.md", relativePath: "note-2.md" },
        { path: "/vault/docs/readme.md", name: "readme.md", relativePath: "docs/readme.md" }
      ]);

      expect(localeCompareSpy).not.toHaveBeenCalled();
    } finally {
      localeCompareSpy.mockRestore();
    }
  });
});
