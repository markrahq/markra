import { searchWorkspaceFiles, type WorkspaceSearchFile } from "./workspace-search";

const workspaceFiles = [
  { name: "guide.md", path: "/mock-vault/guide.md", relativePath: "guide.md" },
  { name: "media", path: "/mock-vault/media", relativePath: "media", kind: "folder" },
  { name: "diagram.png", path: "/mock-vault/media/diagram.png", relativePath: "media/diagram.png", kind: "asset" },
  { name: "release.md", path: "/mock-vault/release.md", relativePath: "release.md" }
] satisfies WorkspaceSearchFile[];

describe("workspace search", () => {
  it("searches markdown file content and ignores folders and assets", async () => {
    const readFile = vi.fn(async (path: string) => ({
      content: path.endsWith("guide.md")
        ? "# Alpha guide\nbeta notes\nanother alpha marker"
        : "release plan\nALPHA rollout",
      path
    }));

    const search = await searchWorkspaceFiles(workspaceFiles, "alpha", {
      maxMatches: 10,
      maxMatchesPerFile: 5,
      readFile
    });

    expect(readFile).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenNthCalledWith(1, "/mock-vault/guide.md");
    expect(readFile).toHaveBeenNthCalledWith(2, "/mock-vault/release.md");
    expect(search.searchedFileCount).toBe(2);
    expect(search.unreadableFileCount).toBe(0);
    expect(search.results.map((result) => ({
      columnNumber: result.columnNumber,
      lineNumber: result.lineNumber,
      lineText: result.lineText,
      matchIndex: result.matchIndex,
      relativePath: result.file.relativePath
    }))).toEqual([
      {
        columnNumber: 3,
        lineNumber: 1,
        lineText: "# Alpha guide",
        matchIndex: 0,
        relativePath: "guide.md"
      },
      {
        columnNumber: 9,
        lineNumber: 3,
        lineText: "another alpha marker",
        matchIndex: 1,
        relativePath: "guide.md"
      },
      {
        columnNumber: 1,
        lineNumber: 2,
        lineText: "ALPHA rollout",
        matchIndex: 0,
        relativePath: "release.md"
      }
    ]);
  });

  it("honors case-sensitive search", async () => {
    const search = await searchWorkspaceFiles(workspaceFiles, "alpha", {
      caseSensitive: true,
      maxMatches: 10,
      maxMatchesPerFile: 5,
      readFile: async (path) => ({
        content: path.endsWith("guide.md") ? "Alpha\nalpha" : "ALPHA",
        path
      })
    });

    expect(search.results.map((result) => ({
      lineText: result.lineText,
      relativePath: result.file.relativePath
    }))).toEqual([
      {
        lineText: "alpha",
        relativePath: "guide.md"
      }
    ]);
  });

  it("centers snippets around late matches before the line is visually truncated", async () => {
    const lateMatchLine = [
      "opening segment with unrelated setup",
      "then another unrelated phrase",
      "and one more plain section",
      "finally alpha appears near the end"
    ].join(" | ");
    const search = await searchWorkspaceFiles([workspaceFiles[0]], "alpha", {
      maxMatches: 10,
      maxMatchesPerFile: 5,
      readFile: async (path) => ({
        content: lateMatchLine,
        path
      })
    });

    expect(lateMatchLine.length).toBeLessThan(160);
    expect(search.results[0]?.snippet).toContain("alpha");
    expect(search.results[0]?.snippet).toMatch(/^\.\.\./);
    expect(search.results[0]?.snippet).not.toContain("opening segment");
  });

  it("counts unreadable files even after the result limit is reached", async () => {
    const search = await searchWorkspaceFiles(workspaceFiles, "alpha", {
      maxMatches: 1,
      maxMatchesPerFile: 5,
      readFile: async (path) => {
        if (path.endsWith("release.md")) throw new Error("mock unreadable file");

        return {
          content: "alpha",
          path
        };
      }
    });

    expect(search.results).toHaveLength(1);
    expect(search.unreadableFileCount).toBe(1);
  });
});
