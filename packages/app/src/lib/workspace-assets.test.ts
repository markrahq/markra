import { buildWorkspaceAssetIndex, workspaceAssetIsManaged } from "./workspace-assets";

const assets = [
  {
    kind: "asset" as const,
    name: "used.png",
    path: "/mock-vault/notes/assets/used.png",
    relativePath: "notes/assets/used.png",
    sizeBytes: 10
  },
  {
    kind: "asset" as const,
    name: "dirty.png",
    path: "/mock-vault/notes/assets/dirty.png",
    relativePath: "notes/assets/dirty.png",
    sizeBytes: 20
  },
  {
    kind: "asset" as const,
    name: "unused.png",
    path: "/mock-vault/notes/assets/unused.png",
    relativePath: "notes/assets/unused.png",
    sizeBytes: 30
  },
  {
    kind: "asset" as const,
    name: "manual.png",
    path: "/mock-vault/images/manual.png",
    relativePath: "images/manual.png",
    sizeBytes: 40
  }
];

const documents = [
  {
    name: "daily.md",
    path: "/mock-vault/notes/daily.md",
    relativePath: "notes/daily.md"
  },
  {
    name: "draft.md",
    path: "/mock-vault/notes/draft.md",
    relativePath: "notes/draft.md"
  }
];

describe("workspace asset index", () => {
  it("only manages the configured folder beside a Markdown document", () => {
    const documentPaths = ["notes/daily.md"];

    expect(workspaceAssetIsManaged("notes/assets/used.png", "assets", documentPaths)).toBe(true);
    expect(workspaceAssetIsManaged("web/src/assets/logo.png", "assets", documentPaths)).toBe(false);
    expect(workspaceAssetIsManaged("notes/used.png", ".", documentPaths)).toBe(false);
  });

  it("finds unused managed images while honoring dirty document contents", async () => {
    const readFile = vi.fn(async (path: string) => ({
      content: path.endsWith("daily.md")
        ? "![Used](assets/used.png)"
        : "# Draft saved without its image",
      path
    }));

    const index = await buildWorkspaceAssetIndex({
      assets,
      dirtyDocuments: [{
        content: "![Dirty](assets/dirty.png)",
        path: "/mock-vault/notes/draft.md"
      }],
      documents,
      managedFolder: "assets",
      readFile
    });

    expect(index.candidateAssets.map((asset) => asset.name)).toEqual([
      "used.png",
      "dirty.png",
      "unused.png"
    ]);
    expect(index.referencedAssets.map((asset) => asset.name)).toEqual([
      "used.png",
      "dirty.png"
    ]);
    expect(index.unusedAssets.map((asset) => asset.name)).toEqual(["unused.png"]);
    expect(index.scannedDocumentCount).toBe(2);
    expect(index.unreadableDocuments).toEqual([]);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("conservatively resolves workspace-root, wiki, and Unicode-equivalent references", async () => {
    const rootAsset = {
      kind: "asset" as const,
      name: "root.png",
      path: "/mock-vault/assets/root.png",
      relativePath: "assets/root.png"
    };
    const localAsset = {
      kind: "asset" as const,
      name: "local.png",
      path: "/mock-vault/notes/assets/local.png",
      relativePath: "notes/assets/local.png"
    };
    const unicodeAsset = {
      kind: "asset" as const,
      name: "Café.png",
      path: "/mock-vault/assets/Café.png",
      relativePath: "assets/Café.png"
    };
    const referenceDocuments = [
      {
        name: "index.md",
        path: "/mock-vault/index.md",
        relativePath: "index.md"
      },
      {
        name: "daily.md",
        path: "/mock-vault/notes/daily.md",
        relativePath: "notes/daily.md"
      }
    ];

    const index = await buildWorkspaceAssetIndex({
      assets: [rootAsset, localAsset, unicodeAsset],
      documents: referenceDocuments,
      managedFolder: "assets",
      readFile: vi.fn(async (path: string) => ({
        content: path.endsWith("daily.md")
          ? [
              "![Workspace root](/assets/root.png)",
              "![[local.png]]",
              "![[Café.png]]"
            ].join("\n")
          : "# Index",
        path
      }))
    });

    expect(index.referencedAssets.map((asset) => asset.name)).toEqual([
      "root.png",
      "local.png",
      "Café.png"
    ]);
    expect(index.unusedAssets).toEqual([]);
  });

  it("reports unreadable Markdown files so cleanup can stay disabled", async () => {
    const readFile = vi.fn(async (path: string) => {
      if (path.endsWith("draft.md")) throw new Error("Synthetic read failure");

      return {
        content: "![Used](assets/used.png)",
        path
      };
    });

    const index = await buildWorkspaceAssetIndex({
      assets,
      documents,
      managedFolder: "assets",
      readFile
    });

    expect(index.unreadableDocuments.map((file) => file.name)).toEqual(["draft.md"]);
    expect(index.scannedDocumentCount).toBe(1);
    expect(index.unusedAssets.map((asset) => asset.name)).toEqual([
      "dirty.png",
      "unused.png"
    ]);
  });
});
