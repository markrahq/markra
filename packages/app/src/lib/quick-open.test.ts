import type { NativeMarkdownFolderFile } from "./tauri";
import { quickOpenCommands, quickOpenFiles } from "./quick-open";

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

describe("quickOpenCommands", () => {
  const commands = [
    {
      id: "document-stats.insertSummary",
      pluginId: "document-stats",
      pluginName: "Document Stats",
      title: "Insert document stats"
    },
    {
      id: "reference.insertCitation",
      pluginId: "reference",
      pluginName: "Reference",
      title: "Insert citation"
    }
  ];

  it("keeps commands hidden for an empty query", () => {
    expect(quickOpenCommands(commands, "")).toEqual([]);
  });

  it("finds commands by title, plugin name, and id", () => {
    expect(quickOpenCommands(commands, "stats").map((result) => result.command.id)).toEqual([
      "document-stats.insertSummary"
    ]);
    expect(quickOpenCommands(commands, "reference").map((result) => result.command.id)).toEqual([
      "reference.insertCitation"
    ]);
    expect(quickOpenCommands(commands, "insertCitation").map((result) => result.command.id)).toEqual([
      "reference.insertCitation"
    ]);
  });
});
