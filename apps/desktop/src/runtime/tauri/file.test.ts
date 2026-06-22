import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { getStoredNetworkSettings } from "@markra/app/settings";
import {
  confirmNativeMarkdownFileDelete,
  confirmNativeUnsavedMarkdownDocumentDiscard,
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTemplateFile,
  deleteNativeMarkdownTreeFile,
  detectNativePandocPath,
  downloadNativeWebImage,
  installNativeMarkdownFileDrop,
  listenNativeOpenedMarkdownPaths,
  listNativeMarkdownFileHistory,
  listNativeMarkdownFilesForPath,
  moveNativeMarkdownTreeFile,
  openNativeLocalImages,
  takeNativeOpenedMarkdownPaths,
  openNativeContainingFolder,
  openNativeMarkdownFolder,
  openNativeMarkdownFile,
  openNativeMarkdownFolderInNewWindow,
  openNativeMarkdownFileInNewWindow,
  openNativeMarkdownPath,
  readNativeMarkdownImageFile,
  readNativeMarkdownFileHistory,
  readNativeMarkdownFile,
  readNativeMarkdownTemplateFile,
  resolveNativeMarkdownPath,
  backupNativeMarkdownFolder,
  syncNativeMarkdownFolder,
  saveNativeClipboardImage,
  saveNativeHtmlFile,
  saveNativePandocFile,
  saveNativePdfFile,
  renameNativeMarkdownTreeFile,
  saveNativeMarkdownFile,
  writeNativeMarkdownTemplateFile,
  uploadNativePicGoImage,
  uploadNativeS3Image,
  uploadNativeWebDavImage,
  watchNativeMarkdownFile,
  watchNativeMarkdownTree
} from "./file";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  open: vi.fn(),
  save: vi.fn()
}));

vi.mock("@markra/app/settings", () => ({
  getStoredNetworkSettings: vi.fn()
}));

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);
const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockedConfirm = vi.mocked(confirm);
const mockedOpen = vi.mocked(open);
const mockedSave = vi.mocked(save);
const mockedGetStoredNetworkSettings = vi.mocked(getStoredNetworkSettings);

const mockReadmePath = "/mock-files/readme.md";
const mockDraftPath = "/mock-files/draft.md";
const mockFolderPath = "/mock-files/vault";
const mockUntitledPath = "/mock-files/Untitled.md";

describe("native file access", () => {
  const onDragDropEvent = vi.fn();

  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedListen.mockReset();
    mockedGetCurrentWindow.mockReset();
    mockedConfirm.mockReset();
    mockedOpen.mockReset();
    mockedSave.mockReset();
    mockedGetStoredNetworkSettings.mockReset();
    mockedGetStoredNetworkSettings.mockResolvedValue({
      bypassLocalAddresses: true,
      proxyEnabled: false,
      proxyUrl: ""
    });
    onDragDropEvent.mockReset();
    mockedGetCurrentWindow.mockReturnValue({
      onDragDropEvent
    } as unknown as ReturnType<typeof getCurrentWindow>);
  });

  it("opens a markdown file through the native dialog and Tauri command", async () => {
    mockedOpen.mockResolvedValue(mockReadmePath);
    mockedInvoke.mockResolvedValue({
      path: mockReadmePath,
      contents: "# Native"
    });

    await expect(openNativeMarkdownFile()).resolves.toEqual({
      path: mockReadmePath,
      name: "readme.md",
      content: "# Native"
    });

    expect(mockedOpen).toHaveBeenCalledWith({
      multiple: false,
      fileAccessMode: "scoped",
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }]
    });
    expect(mockedInvoke).toHaveBeenCalledWith("read_markdown_file", {
      path: mockReadmePath
    });
  });

  it("takes markdown paths queued by native file-open requests", async () => {
    mockedInvoke.mockResolvedValue([mockReadmePath, mockDraftPath]);

    await expect(takeNativeOpenedMarkdownPaths()).resolves.toEqual([mockReadmePath, mockDraftPath]);

    expect(mockedInvoke).toHaveBeenCalledWith("take_opened_markdown_paths");
  });

  it("listens for markdown paths opened by the operating system", async () => {
    const unlisten = vi.fn();
    const onPaths = vi.fn();
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenNativeOpenedMarkdownPaths(onPaths);
    const listener = mockedListen.mock.calls[0]?.[1];

    listener?.({ payload: { paths: [mockReadmePath] } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { paths: [] } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://opened-markdown-paths", expect.any(Function));
    expect(onPaths).toHaveBeenCalledTimes(1);
    expect(onPaths).toHaveBeenCalledWith([mockReadmePath]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("passes localized titles to native markdown pickers", async () => {
    mockedOpen
      .mockResolvedValueOnce(mockReadmePath)
      .mockResolvedValueOnce(mockFolderPath);
    mockedInvoke
      .mockResolvedValueOnce({
        path: mockReadmePath,
        contents: "# Native"
      })
      .mockResolvedValueOnce({ kind: "folder", path: mockFolderPath });

    await openNativeMarkdownFile({ title: "Open Markdown file" });
    await openNativeMarkdownFolder({ title: "Open folder" });
    await openNativeMarkdownPath({ title: "Open Markdown or folder" });

    expect(mockedOpen).toHaveBeenNthCalledWith(1, {
      multiple: false,
      fileAccessMode: "scoped",
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      title: "Open Markdown file"
    });
    expect(mockedOpen).toHaveBeenNthCalledWith(2, {
      multiple: false,
      directory: true,
      recursive: true,
      fileAccessMode: "scoped",
      title: "Open folder"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "open_markdown_path", {
      title: "Open Markdown or folder"
    });
  });

  it("does not read from disk when the native open dialog is canceled", async () => {
    mockedOpen.mockResolvedValue(null);

    await expect(openNativeMarkdownFile()).resolves.toBeNull();

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("opens local images through the native picker and reads them as files", async () => {
    mockedOpen.mockResolvedValue([
      "/mock-files/Local Diagram.png",
      "/mock-files/chart.svg"
    ]);
    mockedInvoke
      .mockResolvedValueOnce({
        bytes: [1, 2, 3],
        mimeType: "image/png",
        path: "/mock-files/Local Diagram.png"
      })
      .mockResolvedValueOnce({
        bytes: [60, 115, 118, 103, 62],
        mimeType: "image/svg+xml",
        path: "/mock-files/chart.svg"
      });

    const images = await openNativeLocalImages({ title: "Import local images" });

    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({
      name: "Local Diagram.png",
      type: "image/png"
    });
    expect(images[1]).toMatchObject({
      name: "chart.svg",
      type: "image/svg+xml"
    });
    await expect(images[0]?.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);

    expect(mockedOpen).toHaveBeenCalledWith({
      multiple: true,
      fileAccessMode: "scoped",
      filters: [{ name: "Images", extensions: ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"] }],
      title: "Import local images"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "read_local_image_file", {
      path: "/mock-files/Local Diagram.png"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "read_local_image_file", {
      path: "/mock-files/chart.svg"
    });
  });

  it("returns an empty image list when local image import is canceled", async () => {
    mockedOpen.mockResolvedValue(null);

    await expect(openNativeLocalImages()).resolves.toEqual([]);

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("opens a markdown file or folder through the unified native picker", async () => {
    mockedInvoke
      .mockResolvedValueOnce({ kind: "file", path: mockReadmePath })
      .mockResolvedValueOnce({
        path: mockReadmePath,
        contents: "# Native"
      })
      .mockResolvedValueOnce({ kind: "folder", path: mockFolderPath });

    await expect(openNativeMarkdownPath()).resolves.toEqual({
      kind: "file",
      file: {
        path: mockReadmePath,
        name: "readme.md",
        content: "# Native"
      }
    });

    await expect(openNativeMarkdownPath()).resolves.toEqual({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "open_markdown_path");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "read_markdown_file", {
      path: mockReadmePath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "open_markdown_path");
  });

  it("returns null when the unified native picker is canceled", async () => {
    mockedInvoke.mockResolvedValue(null);

    await expect(openNativeMarkdownPath()).resolves.toBeNull();

    expect(mockedInvoke).toHaveBeenCalledWith("open_markdown_path");
  });

  it("resolves dropped markdown file or folder paths without opening a picker", async () => {
    mockedInvoke
      .mockResolvedValueOnce({ kind: "folder", path: mockFolderPath })
      .mockResolvedValueOnce({ kind: "file", path: mockReadmePath });

    await expect(resolveNativeMarkdownPath(mockFolderPath)).resolves.toEqual({
      kind: "folder",
      name: "vault",
      path: mockFolderPath
    });

    await expect(resolveNativeMarkdownPath(mockReadmePath)).resolves.toEqual({
      kind: "file",
      name: "readme.md",
      path: mockReadmePath
    });

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "resolve_markdown_path", {
      path: mockFolderPath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "resolve_markdown_path", {
      path: mockReadmePath
    });
  });

  it("opens a markdown folder through the native directory dialog", async () => {
    mockedOpen.mockResolvedValue(mockFolderPath);

    await expect(openNativeMarkdownFolder()).resolves.toEqual({
      path: mockFolderPath,
      name: "vault"
    });

    expect(mockedOpen).toHaveBeenCalledWith({
      multiple: false,
      directory: true,
      recursive: true,
      fileAccessMode: "scoped"
    });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("reads the current markdown file without opening a dialog", async () => {
    mockedInvoke.mockResolvedValue({
      path: mockReadmePath,
      contents: "# External",
      sizeBytes: 10
    });

    await expect(readNativeMarkdownFile(mockReadmePath)).resolves.toEqual({
      path: mockReadmePath,
      name: "readme.md",
      content: "# External",
      sizeBytes: 10
    });

    expect(mockedInvoke).toHaveBeenCalledWith("read_markdown_file", {
      path: mockReadmePath
    });
  });

  it("lists and reads saved markdown history through native commands", async () => {
    mockedInvoke
      .mockResolvedValueOnce([
        {
          id: "history-2",
          createdAt: 1_700_000_001_000,
          sizeBytes: 32
        },
        {
          id: "history-1",
          createdAt: 1_700_000_000_000,
          sizeBytes: 24
        }
      ])
      .mockResolvedValueOnce({
        id: "history-1",
        contents: "# Previous\n\nSynthetic content."
      });

    await expect(listNativeMarkdownFileHistory(mockReadmePath)).resolves.toEqual([
      {
        id: "history-2",
        createdAt: 1_700_000_001_000,
        sizeBytes: 32
      },
      {
        id: "history-1",
        createdAt: 1_700_000_000_000,
        sizeBytes: 24
      }
    ]);
    await expect(readNativeMarkdownFileHistory(mockReadmePath, "history-1")).resolves.toEqual({
      id: "history-1",
      contents: "# Previous\n\nSynthetic content."
    });

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "list_markdown_file_history", {
      path: mockReadmePath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "read_markdown_file_history", {
      id: "history-1",
      path: mockReadmePath
    });
  });

  it("reads, writes, and deletes markdown template files from the native template directory", async () => {
    mockedInvoke.mockResolvedValueOnce({
      contents: "# Template"
    });

    await expect(readNativeMarkdownTemplateFile("standup.md")).resolves.toBe("# Template");
    await writeNativeMarkdownTemplateFile("standup.md", "# Updated");
    await deleteNativeMarkdownTemplateFile("standup.md");

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "read_markdown_template_file", {
      fileName: "standup.md"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "write_markdown_template_file", {
      contents: "# Updated",
      fileName: "standup.md"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "delete_markdown_template_file", {
      fileName: "standup.md"
    });
  });

  it("reads a local markdown image as a data URL for vision models", async () => {
    mockedInvoke.mockResolvedValue({
      bytes: [104, 101, 108, 108, 111],
      mimeType: "image/png",
      path: "/mock-files/assets/arch.png"
    });

    await expect(
      readNativeMarkdownImageFile({
        documentPath: mockReadmePath,
        src: "assets/arch.png"
      })
    ).resolves.toEqual({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: "/mock-files/assets/arch.png",
      src: "assets/arch.png"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("read_markdown_image_file", {
      documentPath: mockReadmePath,
      src: "assets/arch.png"
    });
  });

  it("lists markdown files below the current file folder", async () => {
    mockedInvoke.mockResolvedValue([
      { path: "/mock-files/docs", relativePath: "docs", createdAt: 10, modifiedAt: 20 },
      { kind: "asset", path: "/mock-files/assets/pasted-image.png", relativePath: "assets/pasted-image.png", createdAt: 30, modifiedAt: 40 },
      { path: "/mock-files/readme.md", relativePath: "readme.md", createdAt: 50, modifiedAt: 60 },
      { path: "/mock-files/docs/guide.md", relativePath: "docs/guide.md", createdAt: 70, modifiedAt: 80 }
    ]);

    await expect(listNativeMarkdownFilesForPath(mockReadmePath)).resolves.toEqual([
      { kind: "folder", path: "/mock-files/docs", name: "docs", relativePath: "docs", createdAt: 10, modifiedAt: 20 },
      {
        kind: "asset",
        path: "/mock-files/assets/pasted-image.png",
        name: "pasted-image.png",
        relativePath: "assets/pasted-image.png",
        createdAt: 30,
        modifiedAt: 40
      },
      { path: "/mock-files/readme.md", name: "readme.md", relativePath: "readme.md", createdAt: 50, modifiedAt: 60 },
      { path: "/mock-files/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md", createdAt: 70, modifiedAt: 80 }
    ]);

    expect(mockedInvoke).toHaveBeenCalledWith("list_markdown_files_for_path", {
      path: mockReadmePath
    });
  });

  it("creates folders, creates files, moves files, renames files, and deletes files through Tauri commands", async () => {
    mockedInvoke
      .mockResolvedValueOnce({ kind: "folder", path: "/mock-files/Research", relativePath: "Research" })
      .mockResolvedValueOnce({ kind: "folder", path: "/mock-files/docs/Sprint", relativePath: "docs/Sprint" })
      .mockResolvedValueOnce({ path: "/mock-files/Daily note.md", relativePath: "Daily note.md" })
      .mockResolvedValueOnce({ path: "/mock-files/Template note.md", relativePath: "Template note.md" })
      .mockResolvedValueOnce({ path: "/mock-files/docs/readme.md", relativePath: "docs/readme.md" })
      .mockResolvedValueOnce({ path: "/mock-files/Renamed.md", relativePath: "Renamed.md" })
      .mockResolvedValueOnce(undefined);

    await expect(createNativeMarkdownTreeFolder(mockFolderPath, "Research")).resolves.toEqual({
      kind: "folder",
      name: "Research",
      path: "/mock-files/Research",
      relativePath: "Research"
    });
    await expect(createNativeMarkdownTreeFolder(mockFolderPath, "Sprint", "/mock-files/docs")).resolves.toEqual({
      kind: "folder",
      name: "Sprint",
      path: "/mock-files/docs/Sprint",
      relativePath: "docs/Sprint"
    });
    await expect(createNativeMarkdownTreeFile(mockFolderPath, "Daily note")).resolves.toEqual({
      name: "Daily note.md",
      path: "/mock-files/Daily note.md",
      relativePath: "Daily note.md"
    });
    await createNativeMarkdownTreeFile(mockFolderPath, "Template note", {
      contents: "# Template note\n\nFrom template."
    });
    await expect(moveNativeMarkdownTreeFile(mockFolderPath, mockReadmePath, "/mock-files/docs")).resolves.toEqual({
      name: "readme.md",
      path: "/mock-files/docs/readme.md",
      relativePath: "docs/readme.md"
    });
    await expect(renameNativeMarkdownTreeFile(mockFolderPath, mockReadmePath, "Renamed.md")).resolves.toEqual({
      name: "Renamed.md",
      path: "/mock-files/Renamed.md",
      relativePath: "Renamed.md"
    });
    await expect(deleteNativeMarkdownTreeFile(mockFolderPath, "/mock-files/Renamed.md")).resolves.toBeUndefined();

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "create_markdown_tree_folder", {
      folderName: "Research",
      parentPath: null,
      rootPath: mockFolderPath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "create_markdown_tree_folder", {
      folderName: "Sprint",
      parentPath: "/mock-files/docs",
      rootPath: mockFolderPath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "create_markdown_tree_file", {
      fileName: "Daily note",
      parentPath: null,
      rootPath: mockFolderPath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(4, "create_markdown_tree_file", {
      fileName: "Template note",
      parentPath: null,
      rootPath: mockFolderPath,
      contents: "# Template note\n\nFrom template."
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(5, "move_markdown_tree_file", {
      path: mockReadmePath,
      rootPath: mockFolderPath,
      targetParentPath: "/mock-files/docs"
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(6, "rename_markdown_tree_file", {
      fileName: "Renamed.md",
      path: mockReadmePath,
      rootPath: mockFolderPath
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(7, "delete_markdown_tree_file", {
      path: "/mock-files/Renamed.md",
      rootPath: mockFolderPath
    });
  });

  it("asks for native confirmation before deleting a markdown tree file", async () => {
    mockedConfirm.mockResolvedValue(true);

    await expect(
      confirmNativeMarkdownFileDelete("README.md", {
        cancelLabel: "Cancel",
        message: "Delete this file?",
        okLabel: "Confirm"
      })
    ).resolves.toBe(true);

    expect(mockedConfirm).toHaveBeenCalledWith("Delete this file?", {
      cancelLabel: "Cancel",
      kind: "warning",
      okLabel: "Confirm",
      title: "README.md"
    });
  });

  it("asks for native confirmation before discarding unsaved markdown changes", async () => {
    mockedConfirm.mockResolvedValue(true);

    await expect(
      confirmNativeUnsavedMarkdownDocumentDiscard("draft.md", {
        cancelLabel: "Cancel",
        message: "Discard unsaved changes?",
        okLabel: "Discard"
      })
    ).resolves.toBe(true);

    expect(mockedConfirm).toHaveBeenCalledWith("Discard unsaved changes?", {
      cancelLabel: "Cancel",
      kind: "warning",
      okLabel: "Discard",
      title: "draft.md"
    });
  });

  it("saves an existing markdown file in place through Tauri", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativeMarkdownFile({
        path: mockDraftPath,
        suggestedName: "draft.md",
        contents: "# Draft"
      })
    ).resolves.toEqual({
      path: mockDraftPath,
      name: "draft.md"
    });

    expect(mockedSave).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledWith("write_markdown_file", {
      path: mockDraftPath,
      contents: "# Draft"
    });
  });

  it("can save an existing markdown file without creating a history snapshot", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativeMarkdownFile({
        path: mockDraftPath,
        suggestedName: "draft.md",
        contents: "# Earlier",
        historyCursorId: "history-older",
        skipHistorySnapshot: true
      })
    ).resolves.toEqual({
      path: mockDraftPath,
      name: "draft.md"
    });

    expect(mockedSave).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledWith("write_markdown_file", {
      path: mockDraftPath,
      contents: "# Earlier",
      historyCursorId: "history-older",
      skipHistorySnapshot: true
    });
  });

  it("asks for a native save path before writing an untitled document", async () => {
    mockedSave.mockResolvedValue(mockUntitledPath);
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativeMarkdownFile({
        path: null,
        suggestedName: "Untitled.md",
        contents: "# Untitled"
      })
    ).resolves.toEqual({
      path: mockUntitledPath,
      name: "Untitled.md"
    });

    expect(mockedSave).toHaveBeenCalledWith({
      defaultPath: "Untitled.md",
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }]
    });
    expect(mockedInvoke).toHaveBeenCalledWith("write_markdown_file", {
      path: mockUntitledPath,
      contents: "# Untitled"
    });
  });

  it("starts the native save dialog in the open markdown folder for an untitled document", async () => {
    mockedSave.mockResolvedValue("/mock-files/vault/Untitled.md");
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativeMarkdownFile({
        defaultDirectory: "/mock-files/vault",
        path: null,
        suggestedName: "Untitled.md",
        contents: "# Untitled"
      })
    ).resolves.toEqual({
      path: "/mock-files/vault/Untitled.md",
      name: "Untitled.md"
    });

    expect(mockedSave).toHaveBeenCalledWith({
      defaultPath: "/mock-files/vault/Untitled.md",
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }]
    });
    expect(mockedInvoke).toHaveBeenCalledWith("write_markdown_file", {
      path: "/mock-files/vault/Untitled.md",
      contents: "# Untitled"
    });
  });

  it("exports rendered HTML through the native save dialog", async () => {
    mockedSave.mockResolvedValue("/mock-files/draft.html");
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativeHtmlFile({
        suggestedName: "draft.html",
        contents: "<!doctype html><html><body><h1>Draft</h1></body></html>"
      })
    ).resolves.toEqual({
      path: "/mock-files/draft.html",
      name: "draft.html"
    });

    expect(mockedSave).toHaveBeenCalledWith({
      defaultPath: "draft.html",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }]
    });
    expect(mockedInvoke).toHaveBeenCalledWith("write_markdown_file", {
      path: "/mock-files/draft.html",
      contents: "<!doctype html><html><body><h1>Draft</h1></body></html>"
    });
  });

  it("does not write an HTML export when the save dialog is canceled", async () => {
    mockedSave.mockResolvedValue(null);

    await expect(
      saveNativeHtmlFile({
        suggestedName: "draft.html",
        contents: "<!doctype html><html></html>"
      })
    ).resolves.toBeNull();

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("exports rendered PDF HTML through the native save dialog", async () => {
    mockedSave.mockResolvedValue("/mock-files/draft.pdf");
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativePdfFile({
        suggestedName: "draft.pdf",
        contents: "<!doctype html><html><body><h1>Draft</h1></body></html>"
      })
    ).resolves.toEqual({
      path: "/mock-files/draft.pdf",
      name: "draft.pdf"
    });

    expect(mockedSave).toHaveBeenCalledWith({
      defaultPath: "draft.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    expect(mockedInvoke).toHaveBeenCalledWith("export_pdf_file", {
      path: "/mock-files/draft.pdf",
      html: "<!doctype html><html><body><h1>Draft</h1></body></html>"
    });
  });

  it("does not write a PDF export when the save dialog is canceled", async () => {
    mockedSave.mockResolvedValue(null);

    await expect(
      saveNativePdfFile({
        suggestedName: "draft.pdf",
        contents: "<!doctype html><html></html>"
      })
    ).resolves.toBeNull();

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("exports markdown through Pandoc with the selected native save dialog filter", async () => {
    mockedSave.mockResolvedValue("/mock-files/draft.docx");
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativePandocFile({
        documentPath: "/mock-files/draft.md",
        format: "docx",
        markdown: "# Draft\n\nReady.",
        pandocArgs: "--toc",
        pandocPath: "/opt/homebrew/bin/pandoc",
        suggestedName: "draft.docx"
      })
    ).resolves.toEqual({
      path: "/mock-files/draft.docx",
      name: "draft.docx"
    });

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "check_pandoc_available", {
      pandocPath: "/opt/homebrew/bin/pandoc"
    });
    expect(mockedSave).toHaveBeenCalledWith({
      defaultPath: "draft.docx",
      filters: [{ name: "Word document", extensions: ["docx"] }]
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "export_pandoc_file", {
      documentPath: "/mock-files/draft.md",
      format: "docx",
      markdown: "# Draft\n\nReady.",
      pandocArgs: "--toc",
      pandocPath: "/opt/homebrew/bin/pandoc",
      path: "/mock-files/draft.docx"
    });
  });

  it("checks Pandoc availability before opening the native save dialog", async () => {
    mockedInvoke.mockRejectedValue(new Error("Pandoc export requires Pandoc."));

    await expect(
      saveNativePandocFile({
        documentPath: null,
        format: "docx",
        markdown: "# Draft",
        pandocArgs: "",
        pandocPath: "",
        suggestedName: "draft.docx"
      })
    ).rejects.toThrow("Pandoc export requires Pandoc.");

    expect(mockedInvoke).toHaveBeenCalledWith("check_pandoc_available", {
      pandocPath: ""
    });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("detects the native Pandoc executable path", async () => {
    mockedInvoke.mockResolvedValue("/opt/homebrew/bin/pandoc");

    await expect(detectNativePandocPath()).resolves.toBe("/opt/homebrew/bin/pandoc");

    expect(mockedInvoke).toHaveBeenCalledWith("detect_pandoc_path");
  });

  it("returns null when native Pandoc detection finds no executable", async () => {
    mockedInvoke.mockResolvedValue(null);

    await expect(detectNativePandocPath()).resolves.toBeNull();
  });

  it("uses EPUB and LaTeX save filters for Pandoc exports", async () => {
    mockedSave.mockResolvedValueOnce("/mock-files/book.epub").mockResolvedValueOnce("/mock-files/paper.tex");
    mockedInvoke.mockResolvedValue(undefined);

    await saveNativePandocFile({
      documentPath: null,
      format: "epub",
      markdown: "# Book",
      pandocArgs: "",
      pandocPath: "",
      suggestedName: "book.epub"
    });
    await saveNativePandocFile({
      documentPath: null,
      format: "latex",
      markdown: "# Paper",
      pandocArgs: "",
      pandocPath: "",
      suggestedName: "paper.tex"
    });

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "check_pandoc_available", {
      pandocPath: ""
    });
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, "check_pandoc_available", {
      pandocPath: ""
    });
    expect(mockedSave).toHaveBeenNthCalledWith(1, {
      defaultPath: "book.epub",
      filters: [{ name: "EPUB", extensions: ["epub"] }]
    });
    expect(mockedSave).toHaveBeenNthCalledWith(2, {
      defaultPath: "paper.tex",
      filters: [{ name: "LaTeX", extensions: ["tex"] }]
    });
  });

  it("does not run Pandoc export when the save dialog is canceled", async () => {
    mockedSave.mockResolvedValue(null);
    mockedInvoke.mockResolvedValue(undefined);

    await expect(
      saveNativePandocFile({
        documentPath: null,
        format: "epub",
        markdown: "# Draft",
        pandocArgs: "",
        pandocPath: "",
        suggestedName: "draft.epub"
      })
    ).resolves.toBeNull();

    expect(mockedInvoke).toHaveBeenCalledWith("check_pandoc_available", {
      pandocPath: ""
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "export_pandoc_file",
      expect.any(Object)
    );
  });

  it("saves a clipboard image next to the current markdown file through Tauri", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot 1.png", { type: "image/png" });
    mockedInvoke.mockResolvedValue({
      relativePath: "assets/pasted-image-123.png"
    });

    await expect(
      saveNativeClipboardImage({
        documentPath: mockReadmePath,
        fileName: "custom-image.png",
        folder: "assets",
        image
      })
    ).resolves.toEqual({
      alt: "Screenshot 1",
      src: "assets/pasted-image-123.png"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("save_clipboard_image", {
      bytes: [1, 2, 3],
      documentPath: mockReadmePath,
      fileName: "custom-image.png",
      folder: "assets",
      mimeType: "image/png"
    });
  });

  it("downloads a web image through Tauri and returns a File", async () => {
    mockedInvoke.mockResolvedValue({
      bytes: [1, 2, 3],
      fileName: "kitten.png",
      mimeType: "image/png"
    });

    const image = await downloadNativeWebImage({ src: "https://images.example.com/kitten.png" });

    expect(image).toBeInstanceOf(File);
    expect(image.name).toBe("kitten.png");
    expect(image.type).toBe("image/png");
    await expect(image.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(mockedInvoke).toHaveBeenCalledWith("download_web_image", {
      request: {
        url: "https://images.example.com/kitten.png"
      }
    });
  });

  it("passes app network proxy settings to native web image downloads", async () => {
    mockedGetStoredNetworkSettings.mockResolvedValueOnce({
      bypassLocalAddresses: true,
      proxyEnabled: true,
      proxyUrl: "socks5://127.0.0.1:1080"
    });
    mockedInvoke.mockResolvedValue({
      bytes: [1, 2, 3],
      fileName: "kitten.png",
      mimeType: "image/png"
    });

    await downloadNativeWebImage({ src: "https://images.example.com/kitten.png" });

    expect(mockedInvoke).toHaveBeenCalledWith("download_web_image", {
      request: {
        network: {
          bypassLocalAddresses: true,
          proxyEnabled: true,
          proxyUrl: "socks5://127.0.0.1:1080"
        },
        url: "https://images.example.com/kitten.png"
      }
    });
  });

  it("uploads a clipboard image to WebDAV through Tauri", async () => {
    const image = new File([new Uint8Array([4, 5, 6])], "Diagram.png", { type: "image/png" });
    mockedInvoke.mockResolvedValue({
      url: "https://cdn.example.com/images/notes/pasted-image-123.png"
    });

    await expect(
      uploadNativeWebDavImage({
        fileName: "custom-image.png",
        image,
        settings: {
          password: "secret",
          publicBaseUrl: "https://cdn.example.com/images",
          serverUrl: "https://dav.example.com/images",
          uploadPath: "notes",
          username: "ada"
        }
      })
    ).resolves.toEqual({
      alt: "Diagram",
      src: "https://cdn.example.com/images/notes/pasted-image-123.png"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("upload_webdav_image", {
      request: {
        bytes: [4, 5, 6],
        fileName: "custom-image.png",
        mimeType: "image/png",
        password: "secret",
        publicBaseUrl: "https://cdn.example.com/images",
        serverUrl: "https://dav.example.com/images",
        uploadPath: "notes",
        username: "ada"
      }
    });
  });

  it("uploads a clipboard image through a PicGo or PicList server via Tauri", async () => {
    const image = new File([new Uint8Array([4, 5, 6])], "Diagram.png", { type: "image/png" });
    mockedInvoke.mockResolvedValue({
      url: "https://cdn.example.test/images/pasted-image-123.png"
    });

    await expect(
      uploadNativePicGoImage({
        fileName: "custom-image.png",
        image,
        settings: {
          secret: "server-secret",
          serverUrl: "http://127.0.0.1:36677/upload"
        }
      })
    ).resolves.toEqual({
      alt: "Diagram",
      src: "https://cdn.example.test/images/pasted-image-123.png"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("upload_picgo_image", {
      request: {
        bytes: [4, 5, 6],
        fileName: "custom-image.png",
        mimeType: "image/png",
        secret: "server-secret",
        serverUrl: "http://127.0.0.1:36677/upload"
      }
    });
  });

  it("uploads a clipboard image to S3-compatible object storage through Tauri", async () => {
    const image = new File([new Uint8Array([7, 8, 9])], "Object.png", { type: "image/png" });
    mockedInvoke.mockResolvedValue({
      url: "https://cdn.example.com/images/notes/pasted-image-123.png"
    });

    await expect(
      uploadNativeS3Image({
        fileName: "custom-image.png",
        image,
        settings: {
          accessKeyId: "access-key",
          bucket: "markra-images",
          endpointUrl: "https://s3.example.com",
          publicBaseUrl: "https://cdn.example.com/images",
          region: "us-east-1",
          secretAccessKey: "secret",
          uploadPath: "notes"
        }
      })
    ).resolves.toEqual({
      alt: "Object",
      src: "https://cdn.example.com/images/notes/pasted-image-123.png"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("upload_s3_image", {
      request: {
        accessKeyId: "access-key",
        bucket: "markra-images",
        bytes: [7, 8, 9],
        endpointUrl: "https://s3.example.com",
        fileName: "custom-image.png",
        mimeType: "image/png",
        publicBaseUrl: "https://cdn.example.com/images",
        region: "us-east-1",
        secretAccessKey: "secret",
        uploadPath: "notes"
      }
    });
  });

  it("backs up the selected markdown folder through Tauri", async () => {
    mockedInvoke.mockResolvedValue({
      bytesCopied: 12,
      copiedFiles: 2,
      deletedFiles: 0,
      deletedFolders: 0,
      scannedFiles: 3,
      skippedFiles: 1
    });

    await expect(backupNativeMarkdownFolder({
      sourcePath: mockFolderPath,
      targetPath: "/mock-files/backups"
    })).resolves.toEqual({
      bytesCopied: 12,
      copiedFiles: 2,
      deletedFiles: 0,
      deletedFolders: 0,
      scannedFiles: 3,
      skippedFiles: 1
    });

    expect(mockedInvoke).toHaveBeenCalledWith("backup_markdown_folder", {
      sourcePath: mockFolderPath,
      targetPath: "/mock-files/backups"
    });
  });

  it("syncs the selected markdown folder to WebDAV through Tauri", async () => {
    mockedInvoke.mockResolvedValue({
      bytesDownloaded: 8,
      bytesUploaded: 12,
      conflictFiles: 1,
      downloadedFiles: 1,
      scannedFiles: 3,
      skippedFiles: 1,
      uploadedFiles: 1
    });

    await expect(syncNativeMarkdownFolder({
      provider: "webdav",
      sourcePath: mockFolderPath,
      webdav: {
        password: "secret",
        remotePath: "notes",
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
        username: "ada"
      }
    })).resolves.toEqual({
      bytesDownloaded: 8,
      bytesUploaded: 12,
      conflictFiles: 1,
      downloadedFiles: 1,
      scannedFiles: 3,
      skippedFiles: 1,
      uploadedFiles: 1
    });

    expect(mockedInvoke).toHaveBeenCalledWith("sync_webdav_markdown_folder", {
      request: {
        password: "secret",
        remotePath: "notes",
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
        sourcePath: mockFolderPath,
        username: "ada"
      }
    });
  });

  it("passes app network proxy settings to native WebDAV sync", async () => {
    mockedGetStoredNetworkSettings.mockResolvedValueOnce({
      bypassLocalAddresses: true,
      proxyEnabled: true,
      proxyUrl: "http://127.0.0.1:7890"
    });
    mockedInvoke.mockResolvedValue({
      bytesDownloaded: 0,
      bytesUploaded: 0,
      conflictFiles: 0,
      downloadedFiles: 0,
      scannedFiles: 0,
      skippedFiles: 0,
      uploadedFiles: 0
    });

    await syncNativeMarkdownFolder({
      provider: "webdav",
      sourcePath: mockFolderPath,
      webdav: {
        password: "secret",
        remotePath: "notes",
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
        username: "ada"
      }
    });

    expect(mockedInvoke).toHaveBeenCalledWith("sync_webdav_markdown_folder", {
      request: {
        network: {
          bypassLocalAddresses: true,
          proxyEnabled: true,
          proxyUrl: "http://127.0.0.1:7890"
        },
        password: "secret",
        remotePath: "notes",
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
        sourcePath: mockFolderPath,
        username: "ada"
      }
    });
  });

  it("starts and stops a native watcher for the selected markdown path and tree", async () => {
    const unlistenFile: () => unknown = vi.fn();
    const unlistenTree: () => unknown = vi.fn();
    const onChange = vi.fn();
    const onTreeChange = vi.fn();
    let emitFileChange: (path: string) => unknown = () => {};
    let emitTreeChange: (payload: { path: string; rootPath: string }) => unknown = () => {};

    mockedListen.mockImplementation(async (event, handler) => {
      if (event === "markra://tree-changed") {
        emitTreeChange = (payload) => {
          handler({ payload } as never);
        };
        return unlistenTree;
      }

      emitFileChange = (path) => {
        handler({ payload: { path } } as never);
      };
      return unlistenFile;
    });
    mockedInvoke.mockResolvedValue(undefined);

    const unwatch = await watchNativeMarkdownFile(mockReadmePath, onChange, onTreeChange);

    expect(mockedListen).toHaveBeenCalledWith("markra://file-changed", expect.any(Function));
    expect(mockedListen).toHaveBeenCalledWith("markra://tree-changed", expect.any(Function));
    expect(mockedInvoke).toHaveBeenCalledWith("watch_markdown_file", {
      path: mockReadmePath
    });

    emitFileChange(mockReadmePath);
    emitFileChange("/mock-files/other.md");
    emitTreeChange({ path: "/mock-files/assets/pasted-image.png", rootPath: "/mock-files" });
    emitTreeChange({ path: "/other-vault/assets/pasted-image.png", rootPath: "/other-vault" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(mockReadmePath);
    expect(onTreeChange).toHaveBeenCalledTimes(1);
    expect(onTreeChange).toHaveBeenCalledWith("/mock-files/assets/pasted-image.png");

    unwatch();

    expect(unlistenFile).toHaveBeenCalledTimes(1);
    expect(unlistenTree).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("unwatch_markdown_file", {
      path: mockReadmePath
    });
  });

  it("starts and stops a native watcher for a selected markdown tree root", async () => {
    const unlistenTree: () => unknown = vi.fn();
    const onTreeChange = vi.fn();
    let emitTreeChange: (payload: { path: string; rootPath: string }) => unknown = () => {};

    mockedListen.mockImplementation(async (_event, handler) => {
      emitTreeChange = (payload) => {
        handler({ payload } as never);
      };
      return unlistenTree;
    });
    mockedInvoke.mockResolvedValue(undefined);

    const unwatch = await watchNativeMarkdownTree(mockFolderPath, onTreeChange);

    expect(mockedListen).toHaveBeenCalledWith("markra://tree-changed", expect.any(Function));
    expect(mockedInvoke).toHaveBeenCalledWith("watch_markdown_tree", {
      rootPath: mockFolderPath
    });

    emitTreeChange({ path: "/mock-files/vault/docs/added.md", rootPath: mockFolderPath });
    emitTreeChange({ path: "/other-vault/docs/added.md", rootPath: "/other-vault" });

    expect(onTreeChange).toHaveBeenCalledTimes(1);
    expect(onTreeChange).toHaveBeenCalledWith("/mock-files/vault/docs/added.md");

    unwatch();

    expect(unlistenTree).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("unwatch_markdown_tree", {
      rootPath: mockFolderPath
    });
  });

  it("routes dropped markdown files and folders from the native window event", async () => {
    const unlisten = vi.fn();
    const onDrop = vi.fn();
    let emitDragDrop: (event: unknown) => unknown = () => {};
    onDragDropEvent.mockImplementation(async (handler) => {
      emitDragDrop = handler;
      return unlisten;
    });
    mockedInvoke
      .mockRejectedValueOnce(new Error("Unsupported path"))
      .mockResolvedValueOnce({ kind: "file", path: mockReadmePath })
      .mockResolvedValueOnce({ kind: "folder", path: mockFolderPath });

    const cleanup = await installNativeMarkdownFileDrop(onDrop);

    emitDragDrop({ payload: { type: "enter", paths: [mockReadmePath] } });
    emitDragDrop({ payload: { type: "drop", paths: ["/mock-files/archive.zip", mockReadmePath] } });
    emitDragDrop({ payload: { type: "drop", paths: [mockFolderPath] } });

    await vi.waitFor(() => expect(onDrop).toHaveBeenCalledTimes(2));
    expect(onDrop).toHaveBeenNthCalledWith(1, {
      kind: "file",
      name: "readme.md",
      path: mockReadmePath
    });
    expect(onDrop).toHaveBeenNthCalledWith(2, {
      kind: "folder",
      name: "vault",
      path: mockFolderPath
    });

    cleanup();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("routes dropped image files with their native drop position", async () => {
    const unlisten = vi.fn();
    const onDrop = vi.fn();
    let emitDragDrop: (event: unknown) => unknown = () => {};
    onDragDropEvent.mockImplementation(async (handler) => {
      emitDragDrop = handler;
      return unlisten;
    });
    mockedInvoke.mockRejectedValueOnce(new Error("Unsupported path"));

    const cleanup = await installNativeMarkdownFileDrop(onDrop);

    emitDragDrop({
      payload: {
        type: "drop",
        paths: ["/mock-files/Diagram.png"],
        position: { x: 340, y: 160 }
      }
    });

    await vi.waitFor(() => expect(onDrop).toHaveBeenCalledTimes(1));
    expect(onDrop).toHaveBeenCalledWith({
      kind: "image",
      name: "Diagram.png",
      path: "/mock-files/Diagram.png",
      point: {
        left: 340,
        top: 160
      }
    });

    cleanup();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("opens markdown file and folder paths in a new native window", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await openNativeMarkdownFileInNewWindow(mockReadmePath);
    await openNativeMarkdownFolderInNewWindow(mockFolderPath);

    expect(mockedInvoke).toHaveBeenCalledWith("open_markdown_file_in_new_window", {
      path: mockReadmePath
    });
    expect(mockedInvoke).toHaveBeenCalledWith("open_markdown_folder_in_new_window", {
      path: mockFolderPath
    });
  });

  it("opens the native containing folder for a path", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await openNativeContainingFolder(mockReadmePath);

    expect(mockedInvoke).toHaveBeenCalledWith("open_containing_folder", {
      path: mockReadmePath
    });
  });
});
