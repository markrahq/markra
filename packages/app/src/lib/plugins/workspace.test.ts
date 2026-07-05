import type { AppFileRuntime } from "../../runtime";
import { createPluginWorkspace } from "./workspace";

function createFileRuntime(overrides: Partial<AppFileRuntime> = {}): AppFileRuntime {
  return {
    async confirmMarkdownFileDelete() {
      return false;
    },
    async confirmUnsavedMarkdownDocumentDiscard() {
      return false;
    },
    async backupMarkdownFolder() {
      throw new Error("not implemented");
    },
    async createMarkdownTreeFile() {
      throw new Error("not implemented");
    },
    async createMarkdownTreeFolder() {
      throw new Error("not implemented");
    },
    async deleteMarkdownTemplateFile() {
      throw new Error("not implemented");
    },
    async deleteMarkdownTreeFile() {
      throw new Error("not implemented");
    },
    async detectPandocPath() {
      return null;
    },
    async downloadWebImage() {
      throw new Error("not implemented");
    },
    async installMarkdownFileDrop() {
      return () => undefined;
    },
    async listenOpenedMarkdownPaths() {
      return () => undefined;
    },
    async listMarkdownFileHistory() {
      return [];
    },
    async listMarkdownFilesForPath() {
      return [];
    },
    async moveMarkdownTreeFile() {
      throw new Error("not implemented");
    },
    async openContainingFolder() {
      throw new Error("not implemented");
    },
    async openLocalImages() {
      return [];
    },
    async openMarkdownAttachment() {
      throw new Error("not implemented");
    },
    async openMarkdownFile() {
      return null;
    },
    async openMarkdownFileInNewWindow() {
      throw new Error("not implemented");
    },
    async openMarkdownFolder() {
      return null;
    },
    async openMarkdownFolderInNewWindow() {
      throw new Error("not implemented");
    },
    async openMarkdownPath() {
      return null;
    },
    async openSettingsFile() {
      return null;
    },
    async readLocalImageFile() {
      throw new Error("not implemented");
    },
    async readMarkdownFile(path) {
      return {
        content: `# ${path}`,
        name: "note.md",
        path
      };
    },
    async readMarkdownFileHistory() {
      throw new Error("not implemented");
    },
    async readMarkdownImageFile() {
      throw new Error("not implemented");
    },
    async readMarkdownTemplateFile() {
      throw new Error("not implemented");
    },
    async renameMarkdownTreeFile() {
      throw new Error("not implemented");
    },
    async resolveMarkdownPath() {
      throw new Error("not implemented");
    },
    async saveClipboardAttachment() {
      throw new Error("not implemented");
    },
    async saveClipboardImage() {
      throw new Error("not implemented");
    },
    async saveHtmlFile() {
      return null;
    },
    async saveMarkdownFile() {
      return null;
    },
    async savePandocFile() {
      return null;
    },
    async savePdfFile() {
      return null;
    },
    async saveSettingsFile() {
      return null;
    },
    async syncMarkdownFolder() {
      throw new Error("not implemented");
    },
    async takeOpenedMarkdownPaths() {
      return [];
    },
    async uploadPicGoImage() {
      throw new Error("not implemented");
    },
    async uploadS3Image() {
      throw new Error("not implemented");
    },
    async uploadWebDavImage() {
      throw new Error("not implemented");
    },
    async watchMarkdownFile() {
      return () => undefined;
    },
    async watchMarkdownTree() {
      return () => undefined;
    },
    async writeMarkdownTemplateFile() {
      throw new Error("not implemented");
    },
    ...overrides
  };
}

describe("plugin workspace adapter", () => {
  it("opens a user-selected text file with Markra file metadata", async () => {
    const openMarkdownFile = vi.fn(async () => ({
      content: "@book{example}",
      name: "refs.bib",
      path: "/mock-workspace/refs.bib",
      sizeBytes: 14
    }));
    const workspace = createPluginWorkspace({
      files: createFileRuntime({ openMarkdownFile }),
      rootPath: "/mock-workspace"
    });

    await expect(workspace.openTextFile({ title: "Choose bibliography" })).resolves.toEqual({
      content: "@book{example}",
      name: "refs.bib",
      path: "/mock-workspace/refs.bib",
      sizeBytes: 14
    });
    expect(openMarkdownFile).toHaveBeenCalledWith({ title: "Choose bibliography" });
  });

  it("lists workspace files and filters by extension", async () => {
    const loadMarkdownFilesForPath = vi.fn(async () => [
      {
        name: "notes",
        path: "/mock-workspace/notes",
        relativePath: "notes",
        kind: "folder" as const
      },
      {
        name: "topic.md",
        path: "/mock-workspace/notes/topic.md",
        relativePath: "notes/topic.md",
        sizeBytes: 12
      },
      {
        name: "refs.bib",
        path: "/mock-workspace/refs.bib",
        relativePath: "refs.bib",
        sizeBytes: 14
      }
    ]);
    const workspace = createPluginWorkspace({
      files: createFileRuntime({ loadMarkdownFilesForPath }),
      rootPath: "/mock-workspace"
    });

    await expect(workspace.listFiles({ extensions: ["bib"] })).resolves.toEqual([
      {
        name: "refs.bib",
        path: "/mock-workspace/refs.bib",
        relativePath: "refs.bib",
        sizeBytes: 14
      }
    ]);
    expect(loadMarkdownFilesForPath).toHaveBeenCalledWith("/mock-workspace", {});
  });

  it("reads workspace text from the native markdown runtime", async () => {
    const readMarkdownFile = vi.fn(async (path: string) => ({
      content: "@article{example}",
      name: "refs.bib",
      path
    }));
    const workspace = createPluginWorkspace({
      files: createFileRuntime({ readMarkdownFile }),
      rootPath: "/mock-workspace"
    });

    await expect(workspace.readTextFile("/mock-workspace/refs.bib")).resolves.toBe("@article{example}");
    expect(readMarkdownFile).toHaveBeenCalledWith("/mock-workspace/refs.bib");
  });

  it("rejects reads outside the active workspace root", async () => {
    const workspace = createPluginWorkspace({
      files: createFileRuntime(),
      rootPath: "/mock-workspace"
    });

    await expect(workspace.readTextFile("/other-workspace/refs.bib")).rejects.toThrow(
      "Plugin workspace file reads are only available inside the active workspace."
    );
  });

  it("requires an active workspace before listing or reading workspace files", async () => {
    const workspace = createPluginWorkspace({
      files: createFileRuntime(),
      rootPath: null
    });

    await expect(workspace.listFiles()).rejects.toThrow("Plugin workspace file access requires an active workspace.");
    await expect(workspace.readTextFile("/mock-workspace/refs.bib")).rejects.toThrow(
      "Plugin workspace file access requires an active workspace."
    );
  });
});
