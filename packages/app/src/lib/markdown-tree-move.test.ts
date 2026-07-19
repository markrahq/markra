import { moveMarkdownTreeFileWithLinks } from "./markdown-tree-move";

const sourceFile = {
  name: "daily.md",
  path: "/mock-vault/notes/daily.md",
  relativePath: "notes/daily.md"
};

const movedFile = {
  name: "daily.md",
  path: "/mock-vault/archive/daily.md",
  relativePath: "archive/daily.md"
};

describe("Markdown tree moves", () => {
  it("rewrites local links after moving a Markdown file", async () => {
    const readFile = vi.fn().mockResolvedValue({
      ...sourceFile,
      content: "![Diagram](assets/diagram.png)"
    });
    const moveFile = vi.fn().mockResolvedValue(movedFile);
    const saveFile = vi.fn().mockResolvedValue({
      ...movedFile,
      content: "![Diagram](../notes/assets/diagram.png)"
    });

    await expect(moveMarkdownTreeFileWithLinks(sourceFile, "/mock-vault/archive", {
      moveFile,
      readFile,
      saveFile
    })).resolves.toEqual({
      document: {
        content: "![Diagram](../notes/assets/diagram.png)",
        dirty: false
      },
      file: movedFile
    });

    expect(moveFile).toHaveBeenCalledWith(sourceFile, "/mock-vault/archive");
    expect(readFile).toHaveBeenCalledWith(movedFile.path);
    expect(saveFile).toHaveBeenCalledWith({
      contents: "![Diagram](../notes/assets/diagram.png)",
      path: movedFile.path,
      suggestedName: movedFile.name
    });
  });

  it("moves folders without reading or rewriting their contents", async () => {
    const folder = {
      kind: "folder" as const,
      name: "notes",
      path: "/mock-vault/notes",
      relativePath: "notes"
    };
    const movedFolder = {
      ...folder,
      path: "/mock-vault/archive/notes",
      relativePath: "archive/notes"
    };
    const readFile = vi.fn();
    const moveFile = vi.fn().mockResolvedValue(movedFolder);
    const saveFile = vi.fn();

    await expect(moveMarkdownTreeFileWithLinks(folder, "/mock-vault/archive", {
      moveFile,
      readFile,
      saveFile
    })).resolves.toEqual({ file: movedFolder });

    expect(readFile).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("rebases the latest disk content after the move completes", async () => {
    let diskContent = "![Original](assets/original.png)";
    const moveFile = vi.fn().mockImplementation(async () => {
      diskContent = "![External](assets/external.png)";
      return movedFile;
    });
    const readFile = vi.fn().mockImplementation(async () => ({
      ...movedFile,
      content: diskContent
    }));
    const saveFile = vi.fn().mockResolvedValue({
      ...movedFile,
      content: "![External](../notes/assets/external.png)"
    });

    await expect(moveMarkdownTreeFileWithLinks(sourceFile, "/mock-vault/archive", {
      moveFile,
      readFile,
      saveFile
    })).resolves.toEqual({
      document: {
        content: "![External](../notes/assets/external.png)",
        dirty: false
      },
      file: movedFile
    });

    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({
      contents: "![External](../notes/assets/external.png)"
    }));
  });

  it("rebases a dirty open document without saving its unsaved content", async () => {
    const readFile = vi.fn().mockResolvedValue({
      ...movedFile,
      content: "![Saved](assets/saved.png)"
    });
    const moveFile = vi.fn().mockResolvedValue(movedFile);
    const saveFile = vi.fn().mockResolvedValue({
      ...movedFile,
      content: "![Saved](../notes/assets/saved.png)"
    });

    await expect(moveMarkdownTreeFileWithLinks(sourceFile, "/mock-vault/archive", {
      dirtyContent: "![Draft](assets/draft.png)",
      moveFile,
      readFile,
      saveFile
    })).resolves.toEqual({
      document: {
        content: "![Draft](../notes/assets/draft.png)",
        dirty: true
      },
      file: movedFile
    });

    expect(saveFile).toHaveBeenCalledOnce();
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({
      contents: "![Saved](../notes/assets/saved.png)"
    }));
  });

  it("restores the original location when rewritten content cannot be saved", async () => {
    const readFile = vi.fn().mockResolvedValue({
      ...sourceFile,
      content: "![Diagram](assets/diagram.png)"
    });
    const moveFile = vi.fn()
      .mockResolvedValueOnce(movedFile)
      .mockResolvedValueOnce(sourceFile);
    const saveFile = vi.fn().mockRejectedValue(new Error("Synthetic save failure"));

    await expect(moveMarkdownTreeFileWithLinks(sourceFile, "/mock-vault/archive", {
      moveFile,
      readFile,
      saveFile
    })).rejects.toThrow("Synthetic save failure");

    expect(moveFile).toHaveBeenNthCalledWith(2, movedFile, "/mock-vault/notes");
  });

  it("restores the original location when moved content cannot be read", async () => {
    const readFile = vi.fn().mockRejectedValue(new Error("Synthetic read failure"));
    const moveFile = vi.fn()
      .mockResolvedValueOnce(movedFile)
      .mockResolvedValueOnce(sourceFile);
    const saveFile = vi.fn();

    await expect(moveMarkdownTreeFileWithLinks(sourceFile, "/mock-vault/archive", {
      moveFile,
      readFile,
      saveFile
    })).rejects.toThrow("Synthetic read failure");

    expect(moveFile).toHaveBeenNthCalledWith(2, movedFile, "/mock-vault/notes");
    expect(saveFile).not.toHaveBeenCalled();
  });
});
