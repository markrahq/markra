import {
  FakeDirectoryHandle,
  FakeFileHandle,
  FakeIndexedDbFactory
} from "../../test/web-runtime-fakes";
import { createWebRuntime } from "..";
import type { NativeMarkdownDroppedTarget } from "@markra/app/runtime";
import type { WebDownloadFile } from "./types";

function createDirectoryUploadFile(relativePath: string, contents: string, type = "text/markdown") {
  const file = new File([contents], relativePath.split("/").pop() ?? relativePath, { type });

  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: relativePath
  });

  return file;
}

function createDropEvent(dataTransfer: Partial<DataTransfer>) {
  const event = new Event("drop", { bubbles: true, cancelable: true });

  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer
  });

  return event;
}

function createDragOverEvent(dataTransfer: Partial<DataTransfer>) {
  const event = new Event("dragover", { bubbles: true, cancelable: true });

  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer
  });

  return event;
}

function captureNextDrop() {
  const drops: NativeMarkdownDroppedTarget[] = [];
  let resolveDrop: (target: NativeMarkdownDroppedTarget) => void = () => undefined;
  const nextDrop = new Promise<NativeMarkdownDroppedTarget>((resolve) => {
    resolveDrop = resolve;
  });

  return {
    drops,
    nextDrop,
    onDrop: (target: NativeMarkdownDroppedTarget) => {
      drops.push(target);
      resolveDrop(target);
    }
  };
}

describe("web file runtime", () => {
  it("opens and saves markdown files through the browser file system API", async () => {
    const fileHandle = new FakeFileHandle("note.md", "# Draft");
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const runtime = createWebRuntime({
      eventTarget: new EventTarget(),
      indexedDB,
      showOpenFilePicker: async () => [fileHandle]
    });

    const file = await runtime.files.openMarkdownFile();

    expect(file).toMatchObject({
      content: "# Draft",
      name: "note.md"
    });
    expect(file?.path).toMatch(/^web-file:\/\//);

    await expect(runtime.files.readMarkdownFile(file!.path)).resolves.toMatchObject({
      content: "# Draft",
      name: "note.md"
    });

    await runtime.files.saveMarkdownFile({
      contents: "# Saved",
      path: file!.path,
      suggestedName: "note.md"
    });

    expect(fileHandle.writes).toEqual(["# Saved"]);

    const nextRuntime = createWebRuntime({ indexedDB });
    await expect(nextRuntime.files.readMarkdownFile(file!.path)).resolves.toMatchObject({
      content: "# Saved",
      name: "note.md"
    });
  });

  it("opens and saves Markra settings JSON files through the browser file system API", async () => {
    const settingsHandle = new FakeFileHandle(
      "markra-settings.json",
      "{\"format\":\"markra-settings\"}",
      "application/json"
    );
    const savedHandle = new FakeFileHandle("markra-settings.json", "", "application/json");
    let openOptions: unknown;
    let saveOptions: unknown;
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showOpenFilePicker: async (options) => {
        openOptions = options;
        return [settingsHandle];
      },
      showSaveFilePicker: async (options) => {
        saveOptions = options;
        return savedHandle;
      }
    });

    await expect(runtime.files.openSettingsFile({ title: "Import Markra settings" })).resolves.toEqual({
      content: "{\"format\":\"markra-settings\"}",
      name: "markra-settings.json",
      path: expect.stringMatching(/^web-file:\/\//u)
    });
    await expect(
      runtime.files.saveSettingsFile({
        contents: "{\"version\":1}",
        suggestedName: "markra-settings.json"
      })
    ).resolves.toEqual({
      name: "markra-settings.json",
      path: expect.stringMatching(/^web-file:\/\//u)
    });

    expect(openOptions).toEqual({
      multiple: false,
      types: [{
        accept: {
          "application/json": [".json"]
        },
        description: "Markra settings"
      }]
    });
    expect(saveOptions).toEqual({
      suggestedName: "markra-settings.json",
      types: [{
        accept: {
          "application/json": [".json"]
        },
        description: "Markra settings"
      }]
    });
    expect(savedHandle.writes).toEqual(["{\"version\":1}"]);
  });

  it("opens dropped Markdown files through the shared file drop runtime hook", async () => {
    const runtime = createWebRuntime({
      document,
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const droppedFile = new File(["# Dropped"], "dropped.md", { type: "text/markdown" });
    const dropCapture = captureNextDrop();

    const cleanup = await runtime.files.installMarkdownFileDrop(dropCapture.onDrop);
    const dragOverEvent = createDragOverEvent({
      files: [droppedFile] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });
    document.dispatchEvent(dragOverEvent);

    expect(dragOverEvent.defaultPrevented).toBe(true);

    const dropEvent = createDropEvent({
      files: [droppedFile] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });
    document.dispatchEvent(dropEvent);
    const target = await dropCapture.nextDrop;

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(target).toMatchObject({
      kind: "file",
      name: "dropped.md",
      path: expect.stringMatching(/^web-file:\/\//u)
    });
    await expect(runtime.files.readMarkdownFile(target.path)).resolves.toMatchObject({
      content: "# Dropped",
      name: "dropped.md"
    });

    cleanup();
    document.dispatchEvent(createDropEvent({
      files: [droppedFile] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    }));
    expect(dropCapture.drops).toHaveLength(1);
  });

  it("opens dropped browser directory handles through the shared file drop runtime hook", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      "note.md": new FakeFileHandle("note.md", "# Note")
    });
    const runtime = createWebRuntime({
      document,
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const dropCapture = captureNextDrop();
    const item = {
      getAsFileSystemHandle: async () => directory,
      kind: "file"
    } as unknown as DataTransferItem;

    const cleanup = await runtime.files.installMarkdownFileDrop(dropCapture.onDrop);
    const dropEvent = createDropEvent({
      files: [] as unknown as FileList,
      items: [item] as unknown as DataTransferItemList
    });
    document.dispatchEvent(dropEvent);
    const target = await dropCapture.nextDrop;

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(target).toMatchObject({
      kind: "folder",
      name: "mock-vault",
      path: expect.stringMatching(/^web-folder:\/\//u)
    });
    await expect(runtime.files.listMarkdownFilesForPath(target.path)).resolves.toContainEqual(
      expect.objectContaining({
        name: "note.md",
        relativePath: "note.md"
      })
    );

    cleanup();
  });

  it("opens web file and folder paths in a new browser window route", async () => {
    const openedUrls: string[] = [];
    const runtime = createWebRuntime({
      document,
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      openExternalUrl: async (url) => {
        openedUrls.push(url);
      }
    });

    await runtime.files.openMarkdownFileInNewWindow("web-file://file-id/note.md");
    await runtime.files.openMarkdownFolderInNewWindow("web-folder://folder-id");

    const fileUrl = new URL(openedUrls[0]);
    const folderUrl = new URL(openedUrls[1]);

    expect(fileUrl.searchParams.get("path")).toBe("web-file://file-id/note.md");
    expect(fileUrl.searchParams.has("folder")).toBe(false);
    expect(folderUrl.searchParams.get("folder")).toBe("web-folder://folder-id");
    expect(folderUrl.searchParams.has("path")).toBe(false);
  });

  it("reports containing-folder actions as desktop-only", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.files.openContainingFolder("web-file://file-id/note.md"))
      .rejects.toThrow("Opening containing folders requires the desktop runtime.");
  });

  it("opens browser directories and lists Markdown tree entries", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      ".git": new FakeDirectoryHandle(".git", {
        "ignored.md": new FakeFileHandle("ignored.md", "ignored")
      }),
      "assets": new FakeDirectoryHandle("assets", {
        "image.png": new FakeFileHandle("image.png", "png", "image/png")
      }),
      "build": new FakeDirectoryHandle("build", {
        "output.md": new FakeFileHandle("output.md", "# Build")
      }),
      "dist": new FakeDirectoryHandle("dist", {
        "bundle.md": new FakeFileHandle("bundle.md", "# Dist")
      }),
      "downloads": new FakeDirectoryHandle("downloads", {
        "export.docx": new FakeFileHandle("export.docx", "docx")
      }),
      "notes": new FakeDirectoryHandle("notes", {
        "daily.md": new FakeFileHandle("daily.md", "# Daily")
      }),
      "node_modules": new FakeDirectoryHandle("node_modules", {
        "ignored.md": new FakeFileHandle("ignored.md", "ignored")
      }),
      "target": new FakeDirectoryHandle("target", {
        "cache.md": new FakeFileHandle("cache.md", "# Target")
      }),
      "todo.txt": new FakeFileHandle("todo.txt", "skip")
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);

    expect(folder).toMatchObject({
      name: "mock-vault"
    });
    expect(entries.map((entry) => ({ kind: entry.kind, relativePath: entry.relativePath }))).toEqual([
      { kind: "folder", relativePath: "assets" },
      { kind: "asset", relativePath: "assets/image.png" },
      { kind: "folder", relativePath: "downloads" },
      { kind: "attachment", relativePath: "downloads/export.docx" },
      { kind: "folder", relativePath: "notes" },
      { kind: undefined, relativePath: "notes/daily.md" },
      { kind: "attachment", relativePath: "todo.txt" }
    ]);

    const dailyEntry = entries.find((entry) => entry.relativePath === "notes/daily.md");
    expect(dailyEntry).toBeDefined();
    await expect(runtime.files.readMarkdownFile(dailyEntry!.path)).resolves.toMatchObject({
      content: "# Daily",
      name: "daily.md"
    });
    await expect(runtime.files.listMarkdownFilesForPath(folder!.path, {
      managedAttachmentFolder: "assets"
    })).resolves.toEqual(entries.filter((entry) =>
      entry.kind !== "attachment" || entry.relativePath.startsWith("assets/")
    ));
  });

  it("uses desktop ignore defaults when listing browser directories", async () => {
    const ignoredDirectoryNames = [
      ".codex",
      ".git",
      ".markra-sync",
      ".obsidian",
      "build",
      "dist",
      "node_modules",
      "target"
    ];
    const ignoredEntries = Object.fromEntries(ignoredDirectoryNames.map((name) => [
      name,
      new FakeDirectoryHandle(name, {
        "hidden.md": new FakeFileHandle("hidden.md", "# Hidden")
      })
    ]));
    const directory = new FakeDirectoryHandle("mock-vault", {
      ...ignoredEntries,
      "visible.md": new FakeFileHandle("visible.md", "# Visible")
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);

    expect(entries.map((entry) => entry.relativePath)).toEqual(["visible.md"]);
  });

  it("uses root markraignore when listing browser directories", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      ".markraignore": new FakeFileHandle(
        ".markraignore",
        "generated/\n*.tmp\n*.md\n!keep.md\n"
      ),
      "draft.tmp": new FakeFileHandle("draft.tmp", "temporary"),
      "drop.md": new FakeFileHandle("drop.md", "# Drop"),
      "generated": new FakeDirectoryHandle("generated", {
        "page.md": new FakeFileHandle("page.md", "# Generated")
      }),
      "keep.md": new FakeFileHandle("keep.md", "# Keep")
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);

    expect(entries.map((entry) => entry.relativePath)).toEqual(["keep.md"]);
  });

  it("merges global ignore rules before root markraignore rules", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      ".markraignore": new FakeFileHandle(
        ".markraignore",
        "!drafts/\n!drafts/restored.md\n!keep.md\n"
      ),
      "drop.md": new FakeFileHandle("drop.md", "# Drop"),
      "drafts": new FakeDirectoryHandle("drafts", {
        "restored.md": new FakeFileHandle("restored.md", "# Restored")
      }),
      "keep.md": new FakeFileHandle("keep.md", "# Keep"),
      "node_modules": new FakeDirectoryHandle("node_modules", {
        "readme.md": new FakeFileHandle("readme.md", "# Dependency")
      })
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path, {
      globalIgnoreRules: "*.md\ndrafts/\n!node_modules/readme.md\n"
    });

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "drafts",
      "drafts/restored.md",
      "keep.md"
    ]);
  });

  it("matches ignore rules case-sensitively", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      Drafts: new FakeDirectoryHandle("Drafts", {
        "visible.md": new FakeFileHandle("visible.md", "# Visible")
      }),
      drafts: new FakeDirectoryHandle("drafts", {
        "hidden.md": new FakeFileHandle("hidden.md", "# Hidden")
      })
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path, {
      globalIgnoreRules: "drafts/\n"
    });

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "Drafts",
      "Drafts/visible.md"
    ]);
  });

  it("falls back to directory upload when the browser file system picker is unavailable", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("mock-vault/assets/image.png", "png", "image/png"),
        createDirectoryUploadFile("mock-vault/notes/daily.md", "# Daily"),
        createDirectoryUploadFile("mock-vault/todo.txt", "skip", "text/plain")
      ]
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);

    expect(folder).toMatchObject({
      name: "mock-vault"
    });
    expect(entries.map((entry) => ({ kind: entry.kind, relativePath: entry.relativePath }))).toEqual([
      { kind: "folder", relativePath: "assets" },
      { kind: "asset", relativePath: "assets/image.png" },
      { kind: "folder", relativePath: "notes" },
      { kind: undefined, relativePath: "notes/daily.md" },
      { kind: "attachment", relativePath: "todo.txt" }
    ]);
    await expect(runtime.files.readMarkdownFile(entries[3].path)).resolves.toMatchObject({
      content: "# Daily",
      name: "daily.md"
    });
  });

  it("rejects stale web folder paths instead of returning an empty tree", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.files.listMarkdownFilesForPath("web-folder://missing-handle")).rejects.toThrow(
      "Web folder handle is no longer available."
    );
  });

  it("stores markdown templates in IndexedDB-backed web settings", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await runtime.files.writeMarkdownTemplateFile("standup.md", "# Standup");

    await expect(runtime.files.readMarkdownTemplateFile("standup.md")).resolves.toBe("# Standup");

    await runtime.files.deleteMarkdownTemplateFile("standup.md");

    await expect(runtime.files.readMarkdownTemplateFile("standup.md")).resolves.toBe("");
  });

  it("rejects local folder backups in the web runtime", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.files.backupMarkdownFolder({
      sourcePath: "web-folder://source",
      targetPath: "/mock-backups"
    })).rejects.toThrow("Local folder backups require the desktop runtime.");
  });

  it("downloads Markdown and rendered HTML exports when no writable file handle is available", async () => {
    const downloads: WebDownloadFile[] = [];
    const runtime = createWebRuntime({
      downloadFile: async (download) => {
        downloads.push(download);
      },
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await runtime.files.saveMarkdownFile({
      contents: "# Export",
      path: null,
      suggestedName: "export.md"
    });
    await runtime.files.saveHtmlFile({
      contents: "<h1>Export</h1>",
      suggestedName: "export.html"
    });

    expect(downloads).toEqual([
      { contents: "# Export", name: "export.md", type: "text/markdown;charset=utf-8" },
      { contents: "<h1>Export</h1>", name: "export.html", type: "text/html;charset=utf-8" }
    ]);
  });

  it("prints rendered PDF exports instead of downloading HTML with a PDF extension", async () => {
    const downloads: WebDownloadFile[] = [];
    const prints: WebDownloadFile[] = [];
    const runtime = createWebRuntime({
      downloadFile: async (download) => {
        downloads.push(download);
      },
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      printFile: async (download) => {
        prints.push(download);
      }
    });

    await runtime.files.savePdfFile({
      contents: "<h1>Printable</h1>",
      suggestedName: "export.pdf"
    });

    expect(downloads).toEqual([]);
    expect(prints).toEqual([
      { contents: "<h1>Printable</h1>", name: "export.pdf", type: "text/html;charset=utf-8" }
    ]);
  });

  it("renames and moves browser directory tree entries", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      archive: new FakeDirectoryHandle("archive", {}),
      notes: new FakeDirectoryHandle("notes", {
        "draft.md": new FakeFileHandle("draft.md", "# Draft")
      })
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);
    const draft = entries.find((entry) => entry.relativePath === "notes/draft.md")!;
    const archive = entries.find((entry) => entry.relativePath === "archive")!;

    const renamed = await runtime.files.renameMarkdownTreeFile(folder!.path, draft.path, "renamed.md");

    expect(renamed).toMatchObject({
      name: "renamed.md",
      relativePath: "notes/renamed.md"
    });
    await expect(runtime.files.readMarkdownFile(renamed.path)).resolves.toMatchObject({
      content: "# Draft",
      name: "renamed.md"
    });
    await expect(runtime.files.readMarkdownFile(draft.path)).rejects.toThrow("File not found");

    const moved = await runtime.files.moveMarkdownTreeFile(folder!.path, renamed.path, archive.path);

    expect(moved).toMatchObject({
      name: "renamed.md",
      relativePath: "archive/renamed.md"
    });
    await expect(runtime.files.readMarkdownFile(moved.path)).resolves.toMatchObject({
      content: "# Draft",
      name: "renamed.md"
    });
  });

  it("saves pasted images into the current browser directory document folder", async () => {
    const directory = new FakeDirectoryHandle("mock-vault", {
      notes: new FakeDirectoryHandle("notes", {
        "daily.md": new FakeFileHandle("daily.md", "# Daily")
      })
    });
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => directory
    });

    const folder = await runtime.files.openMarkdownFolder();
    const entries = await runtime.files.listMarkdownFilesForPath(folder!.path);
    const daily = entries.find((entry) => entry.relativePath === "notes/daily.md")!;
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot 1.png", { type: "image/png" });

    const saved = await runtime.files.saveClipboardImage({
      documentPath: daily.path,
      fileName: "pasted-image.png",
      folder: "assets",
      image
    });

    expect(saved).toEqual({
      alt: "Screenshot 1",
      src: "assets/pasted-image.png"
    });

    await expect(runtime.files.readMarkdownImageFile({
      documentPath: daily.path,
      src: saved.src
    })).resolves.toMatchObject({
      path: expect.stringContaining("/notes/assets/pasted-image.png"),
      src: "assets/pasted-image.png"
    });
    await expect(runtime.files.listMarkdownFilesForPath(folder!.path)).resolves.toContainEqual(
      expect.objectContaining({
        kind: "asset",
        relativePath: "notes/assets/pasted-image.png"
      })
    );
  });

  it("uses browser confirmation for file delete and unsaved changes prompts", async () => {
    const confirm = vi.fn(() => true);
    const runtime = createWebRuntime({
      confirm,
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.files.confirmMarkdownFileDelete("note.md", {
      cancelLabel: "Cancel",
      message: "Delete file?",
      okLabel: "Delete"
    })).resolves.toBe(true);
    await expect(runtime.files.confirmUnsavedMarkdownDocumentDiscard("note.md", {
      cancelLabel: "Cancel",
      message: "Discard?",
      okLabel: "Discard"
    })).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledWith("Delete file?");
    expect(confirm).toHaveBeenCalledWith("Discard?");
  });
});
