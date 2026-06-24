import type { AgentWorkspaceFile } from "@markra/ai";
import { createWorkspaceChangePlanOperations } from "./workspace-plan-apply";

const rootFile = {
  name: "alpha.md",
  path: "/mock-vault/alpha.md",
  relativePath: "alpha.md"
} satisfies AgentWorkspaceFile;

describe("createWorkspaceChangePlanOperations", () => {
  it("creates missing parent folders before creating a planned note", async () => {
    const createFolder = vi.fn(async (folderName: string, parentPath: string | null) => ({
      kind: "folder" as const,
      name: folderName,
      path: parentPath ? `${parentPath}/${folderName}` : `/mock-vault/${folderName}`,
      relativePath: parentPath ? `topics/${folderName}` : folderName
    }));
    const createFile = vi.fn(async (fileName: string, parentPath: string | null, contents: string) => ({
      name: fileName,
      path: `${parentPath}/${fileName}`,
      relativePath: `topics/${fileName}`,
      contents
    }));
    const operations = createWorkspaceChangePlanOperations({
      createFile,
      createFolder,
      moveFile: vi.fn(),
      readFile: vi.fn(),
      renameFile: vi.fn(),
      workspaceFiles: [rootFile],
      writeFile: vi.fn()
    });

    await operations.createFile("topics/beta.md", "# Beta");

    expect(createFolder).toHaveBeenCalledWith("topics", null);
    expect(createFile).toHaveBeenCalledWith("beta.md", "/mock-vault/topics", "# Beta");
  });

  it("moves a note to the target folder and renames it when the target path changes both", async () => {
    const docsFolder = {
      kind: "folder" as const,
      name: "docs",
      path: "/mock-vault/docs",
      relativePath: "docs"
    };
    const movedFile = {
      name: "alpha.md",
      path: "/mock-vault/docs/alpha.md",
      relativePath: "docs/alpha.md"
    };
    const renamedFile = {
      name: "beta.md",
      path: "/mock-vault/docs/beta.md",
      relativePath: "docs/beta.md"
    };
    const moveFile = vi.fn(async () => movedFile);
    const renameFile = vi.fn(async () => renamedFile);
    const operations = createWorkspaceChangePlanOperations({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      moveFile,
      readFile: vi.fn(),
      renameFile,
      workspaceFiles: [rootFile, docsFolder],
      writeFile: vi.fn()
    });

    await operations.moveFile(rootFile, "docs/beta.md");

    expect(moveFile).toHaveBeenCalledWith(rootFile, "/mock-vault/docs");
    expect(renameFile).toHaveBeenCalledWith(movedFile, "beta.md");
  });

  it("writes through the native markdown save operation for existing notes", async () => {
    const readFile = vi.fn(async () => "# Alpha");
    const writeFile = vi.fn(async () => {});
    const operations = createWorkspaceChangePlanOperations({
      createFile: vi.fn(),
      createFolder: vi.fn(),
      moveFile: vi.fn(),
      readFile,
      renameFile: vi.fn(),
      workspaceFiles: [rootFile],
      writeFile
    });

    await expect(operations.readFile(rootFile)).resolves.toBe("# Alpha");
    await operations.writeFile(rootFile, "# Updated");

    expect(readFile).toHaveBeenCalledWith("/mock-vault/alpha.md");
    expect(writeFile).toHaveBeenCalledWith(rootFile, "# Updated");
  });
});
