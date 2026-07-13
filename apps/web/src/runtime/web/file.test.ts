import {
  FakeDirectoryHandle,
  FakeFileHandle,
  FakeIndexedDbFactory
} from "../../test/web-runtime-fakes";
import { strFromU8, unzipSync } from "fflate";
import { createWebRuntime } from "..";
import type { NativeMarkdownDroppedTarget } from "@markra/app/runtime";
import type { WebDownloadFile } from "./types";
import { createWebFileRuntime } from "./file";
import { createIndexedDbSettingsRuntime } from "./settings";
import {
  createWorkspaceRepository,
  WorkspaceNamespaceConflictError,
  type WorkspaceRepository
} from "./workspace";

function createDirectoryUploadFile(relativePath: string, contents: BlobPart, type = "text/markdown") {
  const file = new File([contents], relativePath.split("/").pop() ?? relativePath, { type });

  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: relativePath
  });

  return file;
}

async function seedWorkspace(runtime: ReturnType<typeof createWebRuntime>) {
  const folder = await runtime.files.openMarkdownFolder();
  expect(folder).not.toBeNull();

  return folder!;
}

function withCompetingFileCreate(
  repository: WorkspaceRepository,
  targetPath: string,
  competingContents: string
): WorkspaceRepository {
  let competed = false;
  let targetReads = 0;

  return {
    ...repository,
    async read(workspaceId, path) {
      if (!competed && path === targetPath) {
        targetReads += 1;
        if (targetReads === 3) {
          competed = true;
          await repository.writeFile(
            workspaceId,
            path,
            new Blob([competingContents]),
            { mode: "create" }
          );
        }
      }

      return repository.read(workspaceId, path);
    },
    async writeFile(workspaceId, path, body, options) {
      if (!competed && path === targetPath && options?.mode === "create") {
        competed = true;
        await repository.writeFile(
          workspaceId,
          path,
          new Blob([competingContents]),
          { mode: "create" }
        );
        throw new WorkspaceNamespaceConflictError(path);
      }

      return repository.writeFile(workspaceId, path, body, options);
    }
  };
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
      { kind: "folder", relativePath: "build" },
      { kind: undefined, relativePath: "build/output.md" },
      { kind: "folder", relativePath: "dist" },
      { kind: undefined, relativePath: "dist/bundle.md" },
      { kind: "folder", relativePath: "downloads" },
      { kind: "attachment", relativePath: "downloads/export.docx" },
      { kind: "folder", relativePath: "notes" },
      { kind: undefined, relativePath: "notes/daily.md" },
      { kind: "folder", relativePath: "target" },
      { kind: undefined, relativePath: "target/cache.md" },
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

  it("imports an uploaded directory into a persistent writable workspace when directory handles are unavailable", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const runtime = createWebRuntime({
      indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide"),
        createDirectoryUploadFile("notes/assets/pixel.png", "png", "image/png")
      ]
    });

    const folder = await runtime.files.openMarkdownFolder();

    expect(folder).toEqual({ name: "notes", path: "web-workspace://default/notes" });
    const files = await runtime.files.listMarkdownFilesForPath(folder!.path);
    expect(files.filter((file) => file.kind !== "folder").map((file) => file.relativePath))
      .toEqual(["assets/pixel.png", "guide.md"]);
    expect(files).toContainEqual(expect.objectContaining({
      kind: "folder",
      relativePath: "assets"
    }));

    const reloaded = createWebRuntime({ indexedDB });
    await reloaded.files.saveMarkdownFile({
      contents: "# Updated",
      path: "web-workspace://default/notes/guide.md",
      suggestedName: "guide.md"
    });
    await expect(reloaded.files.readMarkdownFile("web-workspace://default/notes/guide.md"))
      .resolves.toMatchObject({ content: "# Updated" });
  });

  it("keeps direct directory access when showDirectoryPicker is available", async () => {
    const external = new FakeDirectoryHandle("external", {});
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      showDirectoryPicker: async () => external
    });

    await expect(runtime.files.openMarkdownFolder()).resolves.toMatchObject({
      name: "external",
      path: expect.stringMatching(/^web-folder:\/\//u)
    });
  });

  it("exports the current virtual root as a ZIP and preserves binary bytes", async () => {
    const downloads: WebDownloadFile[] = [];
    const runtime = createWebRuntime({
      downloadFile: async (download) => downloads.push(download),
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide"),
        createDirectoryUploadFile(
          "notes/assets/pixel.png",
          new Uint8Array([1, 2, 3]),
          "image/png"
        )
      ]
    });
    const folder = await seedWorkspace(runtime);

    await runtime.files.exportMarkdownFolder(folder.path);

    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ name: "notes.zip", type: "application/zip" });
    const archive = unzipSync(new Uint8Array(
      await (downloads[0].contents as Blob).arrayBuffer()
    ));
    expect(strFromU8(archive["guide.md"])).toBe("# Guide");
    expect(archive["assets/pixel.png"]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("preserves empty workspace directories in ZIP exports", async () => {
    const downloads: WebDownloadFile[] = [];
    const runtime = createWebRuntime({
      downloadFile: async (download) => downloads.push(download),
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });
    const folder = await runtime.files.getDefaultMarkdownFolder();
    await runtime.files.createMarkdownTreeFolder(folder!.path, "empty");

    await runtime.files.exportMarkdownFolder(folder!.path);

    const archive = unzipSync(new Uint8Array(
      await (downloads[0].contents as Blob).arrayBuffer()
    ));
    expect(archive).toHaveProperty("empty/");
    expect(archive["empty/"]).toEqual(new Uint8Array());
  });

  it("saves an untitled document into the current virtual workspace instead of downloading it", async () => {
    const downloadFile = vi.fn();
    const runtime = createWebRuntime({
      downloadFile,
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    await expect(runtime.files.saveMarkdownFile({
      contents: "# New",
      defaultDirectory: "web-workspace://default",
      path: null,
      suggestedName: "new.md"
    })).resolves.toEqual({ name: "new.md", path: "web-workspace://default/new.md" });
    await expect(runtime.files.readMarkdownFile("web-workspace://default/new.md"))
      .resolves.toMatchObject({ content: "# New" });
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("chooses a unique workspace name instead of overwriting an existing pathless save", async () => {
    const runtime = createWebRuntime({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await runtime.files.saveMarkdownFile({
      contents: "# Original",
      defaultDirectory: "web-workspace://default",
      path: null,
      suggestedName: "Untitled.md"
    });

    await expect(runtime.files.saveMarkdownFile({
      contents: "# New",
      defaultDirectory: "web-workspace://default",
      path: null,
      suggestedName: "Untitled.md"
    })).resolves.toEqual({
      name: "Untitled-2.md",
      path: "web-workspace://default/Untitled-2.md"
    });
    await expect(runtime.files.readMarkdownFile("web-workspace://default/Untitled.md"))
      .resolves.toMatchObject({ content: "# Original" });
    await expect(runtime.files.readMarkdownFile("web-workspace://default/Untitled-2.md"))
      .resolves.toMatchObject({ content: "# New" });
  });

  it("retries a pathless save when another tab wins the exclusive create race", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const storedRepository = createWorkspaceRepository({ indexedDB });
    const repository = withCompetingFileCreate(
      storedRepository,
      "Untitled.md",
      "# Other tab"
    );
    const files = createWebFileRuntime(
      createIndexedDbSettingsRuntime({ indexedDB }),
      repository,
      { indexedDB }
    );

    await expect(files.saveMarkdownFile({
      contents: "# This tab",
      defaultDirectory: "web-workspace://default",
      path: null,
      suggestedName: "Untitled.md"
    })).resolves.toEqual({
      name: "Untitled-2.md",
      path: "web-workspace://default/Untitled-2.md"
    });
    await expect(files.readMarkdownFile("web-workspace://default/Untitled.md"))
      .resolves.toMatchObject({ content: "# Other tab" });
    await expect(files.readMarkdownFile("web-workspace://default/Untitled-2.md"))
      .resolves.toMatchObject({ content: "# This tab" });
  });

  it("rejects duplicate tree-file creation without changing the existing file", async () => {
    const runtime = createWebRuntime({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    const folder = await runtime.files.getDefaultMarkdownFolder();
    await runtime.files.createMarkdownTreeFile(folder!.path, "note.md", { contents: "# Original" });

    await expect(
      runtime.files.createMarkdownTreeFile(folder!.path, "note.md", { contents: "# Replacement" })
    ).rejects.toThrow("already exists");
    await expect(runtime.files.readMarkdownFile("web-workspace://default/note.md"))
      .resolves.toMatchObject({ content: "# Original" });
  });

  it("does not overwrite a tree file created concurrently by another tab", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const storedRepository = createWorkspaceRepository({ indexedDB });
    const repository = withCompetingFileCreate(storedRepository, "note.md", "# Other tab");
    const files = createWebFileRuntime(
      createIndexedDbSettingsRuntime({ indexedDB }),
      repository,
      { indexedDB }
    );
    const folder = await files.getDefaultMarkdownFolder();

    await expect(files.createMarkdownTreeFile(folder!.path, "note.md", {
      contents: "# This tab"
    })).rejects.toThrow("already exists");
    await expect(files.readMarkdownFile("web-workspace://default/note.md"))
      .resolves.toMatchObject({ content: "# Other tab" });
  });

  it("rejects duplicate tree-folder creation instead of reopening the existing folder", async () => {
    const runtime = createWebRuntime({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    const folder = await runtime.files.getDefaultMarkdownFolder();
    await runtime.files.createMarkdownTreeFolder(folder!.path, "notes");

    await expect(runtime.files.createMarkdownTreeFolder(folder!.path, "notes"))
      .rejects.toThrow("already exists");
    await expect(runtime.files.listMarkdownFilesForPath(folder!.path)).resolves.toEqual([
      expect.objectContaining({ kind: "folder", relativePath: "notes" })
    ]);
  });

  it("rejects saving through a stale workspace file path", async () => {
    const runtime = createWebRuntime({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    const folder = await runtime.files.getDefaultMarkdownFolder();
    const created = await runtime.files.createMarkdownTreeFile(folder!.path, "note.md", {
      contents: "# Saved"
    });
    await runtime.files.deleteMarkdownTreeFile(folder!.path, created.path);

    await expect(runtime.files.saveMarkdownFile({
      contents: "# Stale",
      path: created.path,
      suggestedName: created.name
    })).rejects.toThrow("not found");
    await expect(runtime.files.listMarkdownFilesForPath(folder!.path)).resolves.toEqual([]);
  });

  it("supports tree CRUD across restored virtual workspace paths", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide")
      ]
    });
    const folder = await seedWorkspace(runtime);
    const drafts = await runtime.files.createMarkdownTreeFolder(folder.path, "drafts");
    const draft = await runtime.files.createMarkdownTreeFile(folder.path, "draft.md", {
      contents: "# Draft",
      parentPath: drafts.path
    });

    const renamed = await runtime.files.renameMarkdownTreeFile(folder.path, draft.path, "renamed.md");
    const moved = await runtime.files.moveMarkdownTreeFile(folder.path, renamed.path);

    await expect(runtime.files.readMarkdownFile(moved.path)).resolves.toMatchObject({
      content: "# Draft",
      name: "renamed.md"
    });
    await runtime.files.deleteMarkdownTreeFile(folder.path, drafts.path);
    await expect(runtime.files.listMarkdownFilesForPath(folder.path)).resolves.toEqual([
      expect.objectContaining({ relativePath: "guide.md" }),
      expect.objectContaining({ relativePath: "renamed.md" })
    ]);
  });

  it("routes workspace renames and moves through the repository transaction", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });
    const move = vi.spyOn(repository, "move");
    const files = createWebFileRuntime(
      createIndexedDbSettingsRuntime({ indexedDB }),
      repository,
      { indexedDB }
    );
    const folder = await files.getDefaultMarkdownFolder();
    const drafts = await files.createMarkdownTreeFolder(folder!.path, "drafts");
    const note = await files.createMarkdownTreeFile(folder!.path, "note.md", {
      contents: "# Draft",
      parentPath: drafts.path
    });

    const renamed = await files.renameMarkdownTreeFile(folder!.path, note.path, "ready.md");
    await files.moveMarkdownTreeFile(folder!.path, renamed.path);

    expect(move).toHaveBeenNthCalledWith(1, "default", "drafts/note.md", "drafts/ready.md");
    expect(move).toHaveBeenNthCalledWith(2, "default", "drafts/ready.md", "ready.md");
  });

  it("stores images and attachments beside a restored virtual workspace document", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide")
      ]
    });
    await seedWorkspace(runtime);
    const documentPath = "web-workspace://default/notes/guide.md";
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot.png", { type: "image/png" });
    const attachment = new File(["reference"], "reference.txt", { type: "text/plain" });

    const savedImage = await runtime.files.saveClipboardImage({
      documentPath,
      fileName: "粘贴 图.png",
      folder: "assets",
      image
    });
    const savedAttachment = await runtime.files.saveClipboardAttachment({
      attachment,
      documentPath,
      folder: "downloads"
    });

    expect(savedImage).toEqual({
      alt: "Screenshot",
      src: "assets/%E7%B2%98%E8%B4%B4%20%E5%9B%BE.png"
    });
    expect(savedAttachment).toEqual({ label: "reference.txt", src: "downloads/reference.txt" });
    await expect(runtime.files.readMarkdownImageFile({
      documentPath,
      src: savedImage.src
    })).resolves.toMatchObject({
      mimeType: "image/png",
      path: "web-workspace://default/notes/assets/%E7%B2%98%E8%B4%B4%20%E5%9B%BE.png"
    });
    await expect(runtime.files.listMarkdownFilesForPath("web-workspace://default/notes"))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "asset", relativePath: "assets/粘贴 图.png" }),
        expect.objectContaining({ kind: "attachment", relativePath: "downloads/reference.txt" })
      ]));
  });

  it("reads a saved virtual workspace image whose name contains a reserved URL character", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide")
      ]
    });
    await seedWorkspace(runtime);
    const documentPath = "web-workspace://default/notes/guide.md";

    const saved = await runtime.files.saveClipboardImage({
      documentPath,
      fileName: "chart#1.png",
      folder: "assets",
      image: new File([new Uint8Array([1, 2, 3])], "chart#1.png", { type: "image/png" })
    });

    expect(saved.src).toBe("assets/chart%231.png");
    await expect(runtime.files.readMarkdownImageFile({
      documentPath,
      src: saved.src
    })).resolves.toMatchObject({
      mimeType: "image/png",
      path: "web-workspace://default/notes/assets/chart%231.png"
    });
  });

  it("opens a saved virtual workspace attachment whose name contains a reserved URL character", async () => {
    const runtime = createWebRuntime({
      indexedDB: new FakeIndexedDbFactory().indexedDB,
      pickDirectoryFiles: async () => [
        createDirectoryUploadFile("notes/guide.md", "# Guide")
      ]
    });
    await seedWorkspace(runtime);
    const documentPath = "web-workspace://default/notes/guide.md";
    const saved = await runtime.files.saveClipboardAttachment({
      attachment: new File(["synthetic reference"], "chart#1.png", { type: "image/png" }),
      documentPath,
      folder: "downloads"
    });
    const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    let openedFile: File | null = null;
    const createObjectUrl = vi.fn((file: Blob) => {
      openedFile = file as File;
      return "blob:synthetic-attachment";
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);

    try {
      expect(saved.src).toBe("downloads/chart%231.png");
      await runtime.files.openMarkdownAttachment({
        documentPath,
        rootPath: "web-workspace://default/notes",
        src: saved.src
      });

      expect(createObjectUrl).toHaveBeenCalledOnce();
      expect(openedFile).toMatchObject({ name: "chart#1.png", type: "image/png" });
      await expect(openedFile!.text()).resolves.toBe("synthetic reference");
      expect(openWindow).toHaveBeenCalledWith(
        "blob:synthetic-attachment",
        "_blank",
        "noopener,noreferrer"
      );
    } finally {
      openWindow.mockRestore();
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
    }
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
