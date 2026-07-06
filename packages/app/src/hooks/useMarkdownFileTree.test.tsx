import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTreeFile,
  loadNativeMarkdownFilesForPath,
  listNativeMarkdownFilesForPath,
  moveNativeMarkdownTreeFile,
  openNativeMarkdownFolder,
  renameNativeMarkdownTreeFile,
  watchNativeMarkdownTree
} from "../lib/tauri";
import {
  createAiAgentSessionId,
  getStoredFileTreeSortByWorkspace,
  getStoredRecentMarkdownFolders,
  getStoredWorkspaceState,
  removeStoredRecentMarkdownFolder,
  saveStoredFileTreeSortForWorkspace,
  saveStoredRecentMarkdownFolder,
  saveStoredWorkspaceState,
  type RecentMarkdownFolder
} from "../lib/settings/app-settings";
import { useMarkdownFileTree } from "./useMarkdownFileTree";

vi.mock("../lib/tauri", () => ({
  createNativeMarkdownTreeFile: vi.fn(),
  createNativeMarkdownTreeFolder: vi.fn(),
  deleteNativeMarkdownTreeFile: vi.fn(),
  loadNativeMarkdownFilesForPath: vi.fn(),
  listNativeMarkdownFilesForPath: vi.fn(),
  moveNativeMarkdownTreeFile: vi.fn(),
  openNativeMarkdownFolder: vi.fn(),
  renameNativeMarkdownTreeFile: vi.fn(),
  watchNativeMarkdownTree: vi.fn()
}));

vi.mock("../lib/settings/app-settings", () => ({
  createAiAgentSessionId: vi.fn(),
  defaultStoredFileTreeSort: {
    direction: "ascending",
    key: "name"
  },
  getStoredFileTreeSortByWorkspace: vi.fn(),
  getStoredRecentMarkdownFolders: vi.fn(),
  getStoredWorkspaceState: vi.fn(),
  normalizeStoredFileTreeSort: vi.fn((sort) => sort),
  prependRecentMarkdownFolder: vi.fn((folders: RecentMarkdownFolder[], folder: RecentMarkdownFolder) => [
    folder,
    ...folders.filter((item) => item.path !== folder.path)
  ].slice(0, 5)),
  removeStoredRecentMarkdownFolder: vi.fn(),
  saveStoredFileTreeSortForWorkspace: vi.fn(),
  saveStoredRecentMarkdownFolder: vi.fn(),
  saveStoredWorkspaceState: vi.fn()
}));

const mockedCreateNativeMarkdownTreeFile = vi.mocked(createNativeMarkdownTreeFile);
const mockedCreateNativeMarkdownTreeFolder = vi.mocked(createNativeMarkdownTreeFolder);
const mockedDeleteNativeMarkdownTreeFile = vi.mocked(deleteNativeMarkdownTreeFile);
const mockedLoadNativeMarkdownFilesForPath = vi.mocked(loadNativeMarkdownFilesForPath);
const mockedListNativeMarkdownFilesForPath = vi.mocked(listNativeMarkdownFilesForPath);
const mockedMoveNativeMarkdownTreeFile = vi.mocked(moveNativeMarkdownTreeFile);
const mockedOpenNativeMarkdownFolder = vi.mocked(openNativeMarkdownFolder);
const mockedRenameNativeMarkdownTreeFile = vi.mocked(renameNativeMarkdownTreeFile);
const mockedWatchNativeMarkdownTree = vi.mocked(watchNativeMarkdownTree);
const mockedCreateAiAgentSessionId = vi.mocked(createAiAgentSessionId);
const mockedGetStoredFileTreeSortByWorkspace = vi.mocked(getStoredFileTreeSortByWorkspace);
const mockedGetStoredRecentMarkdownFolders = vi.mocked(getStoredRecentMarkdownFolders);
const mockedGetStoredWorkspaceState = vi.mocked(getStoredWorkspaceState);
const mockedRemoveStoredRecentMarkdownFolder = vi.mocked(removeStoredRecentMarkdownFolder);
const mockedSaveStoredFileTreeSortForWorkspace = vi.mocked(saveStoredFileTreeSortForWorkspace);
const mockedSaveStoredRecentMarkdownFolder = vi.mocked(saveStoredRecentMarkdownFolder);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);
type ListedMarkdownFiles = Awaited<ReturnType<typeof listNativeMarkdownFilesForPath>>;

function createDeferredMarkdownFileList() {
  let resolve!: (files: ListedMarkdownFiles) => undefined;
  const promise = new Promise<ListedMarkdownFiles>((resolvePromise) => {
    resolve = (files) => {
      resolvePromise(files);
      return undefined;
    };
  });

  return { promise, resolve };
}

function mockWorkspaceState(
  patch: Partial<Awaited<ReturnType<typeof getStoredWorkspaceState>>> = {}
): Awaited<ReturnType<typeof getStoredWorkspaceState>> {
  return {
    aiAgentSessionId: null,
    filePath: null,
    fileTreeOpen: false,
    folderName: null,
    folderPath: null,
    openFilePaths: [],
    openWindows: [],
    ...patch
  };
}

function FileTreeProbe({
  currentPath = null,
  managedAttachmentFolder,
  onFilesChange
}: {
  currentPath?: string | null;
  managedAttachmentFolder?: string;
  onFilesChange?: (files: ReturnType<typeof useMarkdownFileTree>["files"]) => unknown;
}) {
  const tree = useMarkdownFileTree({ managedAttachmentFolder });

  useEffect(() => {
    onFilesChange?.(tree.files);
  }, [onFilesChange, tree.files]);

  return (
    <section>
      <p data-testid="root-name">{tree.rootNameForDocument(currentPath)}</p>
      <p data-testid="open-state">{tree.open ? "open" : "closed"}</p>
      <p data-testid="tree-width">{tree.width}</p>
      <p data-testid="tree-resizing">{tree.resizing ? "resizing" : "idle"}</p>
      <p data-testid="recent-folders-open-state">{tree.recentFoldersOpen ? "open" : "closed"}</p>
      <p data-testid="assets-visible-state">{tree.fileTreeAssetsVisible ? "visible" : "hidden"}</p>
      <p data-testid="file-tree-sort">{`${tree.fileTreeSort.key}:${tree.fileTreeSort.direction}`}</p>
      <p data-testid="layout-class">{tree.workspaceLayoutClassName}</p>
      <p data-testid="layout-columns">{tree.workspaceLayoutStyle.gridTemplateColumns}</p>
      <button type="button" onClick={() => tree.openMarkdownFolder()}>
        Open folder
      </button>
      <button type="button" onClick={() => tree.openMarkdownFolder({ beforeOpenFolder: () => false })}>
        Cancel folder
      </button>
      <button
        type="button"
        onClick={() => tree.openRecentFolder?.({ name: "notes", path: "/recent/notes" })}
      >
        Open recent folder
      </button>
      <button
        type="button"
        onClick={() => tree.openRecentFolder?.({ name: "docs", path: "/mock-workspaces/beta/docs" })}
      >
        Open second docs folder
      </button>
      <button
        type="button"
        onClick={() => tree.openFolderPath("/vault", "vault", "session-restored", false, false)}
      >
        Restore collapsed folder
      </button>
      <button
        type="button"
        onClick={() => tree.openFolderPath("/vault", "vault")}
      >
        Open vault path
      </button>
      <button type="button" onClick={() => tree.setRootFromMarkdownFilePath("/mock-workspaces/notes/daily.md")}>
        Use file root
      </button>
      <button
        type="button"
        onClick={() => tree.removeRecentFolder?.({ name: "notes", path: "/recent/notes" })}
      >
        Remove recent folder
      </button>
      <button type="button" onClick={() => tree.toggle(currentPath)}>
        Toggle
      </button>
      <button type="button" onClick={() => tree.resize(512)}>
        Resize wide
      </button>
      <button type="button" onClick={() => tree.resize(120)}>
        Resize narrow
      </button>
      <button type="button" onClick={tree.startResize}>
        Start resize
      </button>
      <button type="button" onClick={tree.endResize}>
        End resize
      </button>
      <button type="button" onClick={() => tree.setRecentFoldersOpen?.(false)}>
        Collapse recent folders
      </button>
      <button type="button" onClick={() => tree.setRecentFoldersOpen?.(true)}>
        Expand recent folders
      </button>
      <button type="button" onClick={() => tree.setFileTreeAssetsVisible?.(!tree.fileTreeAssetsVisible)}>
        Toggle image assets
      </button>
      <button
        type="button"
        onClick={() => tree.setFileTreeSort({ direction: "descending", key: "createdAt" })}
      >
        Sort created descending
      </button>
      <button type="button" onClick={() => tree.createFile("Daily note")}>
        Create
      </button>
      <button type="button" onClick={() => tree.createFile("Daily note", null, "# Daily note\n")}>
        Create from template
      </button>
      <button type="button" onClick={() => tree.createFolder("Research")}>
        Create folder
      </button>
      <button type="button" onClick={() => tree.createFolder("Sprint", "/vault/docs")}>
        Create nested folder
      </button>
      <button
        type="button"
        onClick={() => tree.renameFile({ name: "readme.md", path: "/vault/readme.md", relativePath: "readme.md" }, "renamed.md")}
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() =>
          tree.moveFile(
            { name: "readme.md", path: "/vault/readme.md", relativePath: "readme.md" },
            "/vault/docs"
          )}
      >
        Move
      </button>
      <button
        type="button"
        onClick={() => tree.deleteFile({ name: "renamed.md", path: "/vault/renamed.md", relativePath: "renamed.md" })}
      >
        Delete
      </button>
      <ol>
        {tree.files.map((file) => (
          <li key={file.path}>{file.relativePath}</li>
        ))}
      </ol>
      <ol aria-label="Recent folders">
        {(tree.recentFolders ?? []).map((folder) => (
          <li key={folder.path}>{folder.path}</li>
        ))}
      </ol>
    </section>
  );
}

describe("useMarkdownFileTree", () => {
  beforeEach(() => {
    mockedCreateNativeMarkdownTreeFile.mockReset();
    mockedCreateNativeMarkdownTreeFolder.mockReset();
    mockedDeleteNativeMarkdownTreeFile.mockReset();
    mockedLoadNativeMarkdownFilesForPath.mockReset();
    mockedListNativeMarkdownFilesForPath.mockReset();
    mockedMoveNativeMarkdownTreeFile.mockReset();
    mockedOpenNativeMarkdownFolder.mockReset();
    mockedRenameNativeMarkdownTreeFile.mockReset();
    mockedWatchNativeMarkdownTree.mockReset();
    mockedCreateAiAgentSessionId.mockReset();
    mockedGetStoredFileTreeSortByWorkspace.mockReset();
    mockedGetStoredRecentMarkdownFolders.mockReset();
    mockedGetStoredWorkspaceState.mockReset();
    mockedRemoveStoredRecentMarkdownFolder.mockReset();
    mockedSaveStoredFileTreeSortForWorkspace.mockReset();
    mockedSaveStoredRecentMarkdownFolder.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedCreateAiAgentSessionId.mockReturnValue("session-folder");
    mockedGetStoredFileTreeSortByWorkspace.mockResolvedValue({});
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([]);
    mockedGetStoredWorkspaceState.mockResolvedValue(mockWorkspaceState({
      recentFoldersOpen: true
    }));
    mockedRemoveStoredRecentMarkdownFolder.mockResolvedValue([]);
    mockedSaveStoredRecentMarkdownFolder.mockResolvedValue([]);
    mockedCreateNativeMarkdownTreeFile.mockResolvedValue({
      name: "Daily note.md",
      path: "/vault/Daily note.md",
      relativePath: "Daily note.md"
    });
    mockedCreateNativeMarkdownTreeFolder.mockResolvedValue({
      kind: "folder",
      name: "Research",
      path: "/vault/Research",
      relativePath: "Research"
    });
    mockedDeleteNativeMarkdownTreeFile.mockResolvedValue(undefined);
    mockedRenameNativeMarkdownTreeFile.mockResolvedValue({
      name: "renamed.md",
      path: "/vault/renamed.md",
      relativePath: "renamed.md"
    });
    mockedMoveNativeMarkdownTreeFile.mockResolvedValue({
      name: "readme.md",
      path: "/vault/docs/readme.md",
      relativePath: "docs/readme.md"
    });
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
    mockedSaveStoredFileTreeSortForWorkspace.mockResolvedValue(undefined);
    mockedWatchNativeMarkdownTree.mockResolvedValue(() => {});
    mockedLoadNativeMarkdownFilesForPath.mockImplementation((path, options = {}) => {
      return mockedListNativeMarkdownFilesForPath(path, {
        managedAttachmentFolder: options.managedAttachmentFolder
      });
    });
  });

  it("opens a selected markdown folder as the tree root", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
    ]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault", {
      managedAttachmentFolder: "assets"
    });
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      aiAgentSessionId: "session-folder",
      filePath: null,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/vault",
      openFilePaths: []
    });
    expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
      name: "vault",
      path: "/vault"
    });
  });

  it("streams selected folder files before the full tree load resolves", async () => {
    const folderLoad = createDeferredMarkdownFileList();
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedLoadNativeMarkdownFilesForPath.mockImplementation((_path, options = {}) => {
      options.onBatch?.([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ]);
      return folderLoad.promise;
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");

    await act(async () => {
      folderLoad.resolve([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
        { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
  });

  it("buffers follow-up folder load batches before refreshing the tree again", async () => {
    vi.useFakeTimers();

    const folderLoad = createDeferredMarkdownFileList();
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedLoadNativeMarkdownFilesForPath.mockImplementation((_path, options = {}) => {
      options.onBatch?.([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ]);
      options.onBatch?.([
        { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
      ]);
      options.onBatch?.([
        { path: "/vault/docs/reference.md", name: "reference.md", relativePath: "docs/reference.md" }
      ]);
      return folderLoad.promise;
    });

    try {
      render(<FileTreeProbe />);

      fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        vi.runOnlyPendingTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("index.md")).toBeInTheDocument();
      expect(screen.queryByText("docs/guide.md")).not.toBeInTheDocument();
      expect(screen.queryByText("docs/reference.md")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(179);
        await Promise.resolve();
      });

      expect(screen.queryByText("docs/guide.md")).not.toBeInTheDocument();
      expect(screen.queryByText("docs/reference.md")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });

      expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
      expect(screen.getByText("docs/reference.md")).toBeInTheDocument();

      await act(async () => {
        folderLoad.resolve([
          { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
          { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" },
          { path: "/vault/docs/reference.md", name: "reference.md", relativePath: "docs/reference.md" }
        ]);
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the final file tree update when streamed batches already match the resolved files", async () => {
    const files = [
      { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
      { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
    ];
    const folderLoad = createDeferredMarkdownFileList();
    const onFilesChange = vi.fn();

    mockedLoadNativeMarkdownFilesForPath.mockImplementation((_path, options = {}) => {
      options.onBatch?.(files);
      return folderLoad.promise;
    });

    render(<FileTreeProbe onFilesChange={onFilesChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();

    await act(async () => {
      folderLoad.resolve(files);
      await Promise.resolve();
    });

    const nonEmptyFileUpdates = onFilesChange.mock.calls.filter(([nextFiles]) => nextFiles.length > 0);
    expect(nonEmptyFileUpdates).toHaveLength(1);
  });

  it("aborts the previous native file tree load when switching folders", async () => {
    const firstLoad = createDeferredMarkdownFileList();
    const secondLoad = createDeferredMarkdownFileList();
    const firstSignalRef: { current: AbortSignal | null } = { current: null };

    mockedLoadNativeMarkdownFilesForPath
      .mockImplementationOnce((_path, options = {}) => {
        firstSignalRef.current = options.signal ?? null;
        return firstLoad.promise;
      })
      .mockImplementationOnce(() => secondLoad.promise);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

    await waitFor(() => expect(firstSignalRef.current).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));

    expect(firstSignalRef.current?.aborted).toBe(true);
  });

  it("keeps the first selected folder load alive when switching from a file root", async () => {
    const fileRootLoad = createDeferredMarkdownFileList();
    const folderLoad = createDeferredMarkdownFileList();
    const folderSignalRef: { current: AbortSignal | null } = { current: null };

    mockedLoadNativeMarkdownFilesForPath.mockImplementation((path, options = {}) => {
      if (path === "/mock-workspaces/notes/daily.md") {
        options.signal?.addEventListener("abort", () => {
          fileRootLoad.resolve([]);
        });
        return fileRootLoad.promise;
      }

      if (path === "/vault") {
        folderSignalRef.current = options.signal ?? null;
        options.signal?.addEventListener("abort", () => {
          folderLoad.resolve([]);
        });
        return folderLoad.promise;
      }

      return Promise.resolve([]);
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Use file root" }));
    await waitFor(() =>
      expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalledWith(
        "/mock-workspaces/notes/daily.md",
        expect.objectContaining({
          managedAttachmentFolder: "assets",
          signal: expect.any(AbortSignal)
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Open vault path" }));

    await waitFor(() =>
      expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalledWith(
        "/vault",
        expect.objectContaining({
          managedAttachmentFolder: "assets",
          signal: expect.any(AbortSignal)
        })
      )
    );
    expect(folderSignalRef.current?.aborted).toBe(false);

    await act(async () => {
      folderLoad.resolve([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("index.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
  });

  it("hides attachment files outside the managed attachment folder while keeping folders visible", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { kind: "folder", path: "/vault/assets", name: "assets", relativePath: "assets" },
      { kind: "asset", path: "/vault/assets/image.png", name: "image.png", relativePath: "assets/image.png" },
      { kind: "attachment", path: "/vault/assets/reference.docx", name: "reference.docx", relativePath: "assets/reference.docx" },
      { kind: "folder", path: "/vault/downloads", name: "downloads", relativePath: "downloads" },
      { kind: "attachment", path: "/vault/downloads/export.docx", name: "export.docx", relativePath: "downloads/export.docx" },
      { kind: "folder", path: "/vault/empty", name: "empty", relativePath: "empty" },
      { kind: "folder", path: "/vault/notes", name: "notes", relativePath: "notes" },
      { path: "/vault/notes/daily.md", name: "daily.md", relativePath: "notes/daily.md" },
      { kind: "attachment", path: "/vault/todo.txt", name: "todo.txt", relativePath: "todo.txt" }
    ]);

    render(<FileTreeProbe managedAttachmentFolder="assets" />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("assets/reference.docx")).toBeInTheDocument();
    expect(screen.getByText("assets/image.png")).toBeInTheDocument();
    expect(screen.getByText("downloads")).toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("notes/daily.md")).toBeInTheDocument();
    expect(screen.queryByText("downloads/export.docx")).not.toBeInTheDocument();
    expect(screen.queryByText("todo.txt")).not.toBeInTheDocument();
  });

  it("uses the configured managed attachment folder when filtering attachments", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { kind: "folder", path: "/vault/assets", name: "assets", relativePath: "assets" },
      { kind: "attachment", path: "/vault/assets/reference.docx", name: "reference.docx", relativePath: "assets/reference.docx" },
      { kind: "folder", path: "/vault/media", name: "media", relativePath: "media" },
      { kind: "folder", path: "/vault/media/files", name: "files", relativePath: "media/files" },
      { kind: "attachment", path: "/vault/media/files/spec.pdf", name: "spec.pdf", relativePath: "media/files/spec.pdf" }
    ]);

    render(<FileTreeProbe managedAttachmentFolder="media/files" />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("media/files/spec.pdf")).toBeInTheDocument();
    expect(screen.getByText("media")).toBeInTheDocument();
    expect(screen.getByText("media/files")).toBeInTheDocument();
    expect(screen.getByText("assets")).toBeInTheDocument();
    expect(screen.queryByText("assets/reference.docx")).not.toBeInTheDocument();
  });

  it("refreshes files when the managed attachment folder changes", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { kind: "folder", path: "/vault/assets", name: "assets", relativePath: "assets" },
        { kind: "attachment", path: "/vault/assets/reference.docx", name: "reference.docx", relativePath: "assets/reference.docx" },
        { kind: "folder", path: "/vault/media", name: "media", relativePath: "media" },
        { kind: "folder", path: "/vault/media/files", name: "files", relativePath: "media/files" }
      ])
      .mockResolvedValueOnce([
        { kind: "folder", path: "/vault/assets", name: "assets", relativePath: "assets" },
        { kind: "folder", path: "/vault/media", name: "media", relativePath: "media" },
        { kind: "folder", path: "/vault/media/files", name: "files", relativePath: "media/files" },
        { kind: "attachment", path: "/vault/media/files/spec.pdf", name: "spec.pdf", relativePath: "media/files/spec.pdf" }
      ]);

    const { rerender } = render(<FileTreeProbe managedAttachmentFolder="assets" />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("assets/reference.docx")).toBeInTheDocument();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/vault", {
      managedAttachmentFolder: "assets"
    });

    rerender(<FileTreeProbe managedAttachmentFolder="media/files" />);

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/vault", {
      managedAttachmentFolder: "media/files"
    }));
    expect(await screen.findByText("media/files/spec.pdf")).toBeInTheDocument();
    expect(screen.queryByText("assets/reference.docx")).not.toBeInTheDocument();
  });

  it("does not switch the tree root when the pre-open hook rejects the selected folder", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel folder" }));

    await waitFor(() => expect(mockedOpenNativeMarkdownFolder).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("root-name")).toHaveTextContent("No folder");
    expect(screen.getByTestId("open-state")).toHaveTextContent("closed");
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "/vault"
    }));
  });

  it("refreshes the selected folder when its native tree watcher reports a nested change", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ])
      .mockResolvedValue([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
        { path: "/vault/docs/added.md", name: "added.md", relativePath: "docs/added.md" }
      ]);
    mockedWatchNativeMarkdownTree.mockImplementation(async (_rootPath, onTreeChange) => {
      emitTreeChange = onTreeChange;
      return () => {};
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    await waitFor(() => expect(mockedWatchNativeMarkdownTree).toHaveBeenCalledWith("/vault", expect.any(Function)));

    const callsBeforeTreeChange = mockedListNativeMarkdownFilesForPath.mock.calls.length;
    await emitTreeChange("/vault/docs/added.md");

    await waitFor(() => {
      expect(mockedListNativeMarkdownFilesForPath.mock.calls.length).toBeGreaterThan(callsBeforeTreeChange);
    });
    expect(screen.getByText("docs/added.md")).toBeInTheDocument();
  });

  it("preserves the loaded file tree when a native watcher refresh rejects", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedLoadNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
        { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
      ])
      .mockImplementationOnce((_path, options = {}) => {
        options.onBatch?.([
          { path: "/vault/docs/partial.md", name: "partial.md", relativePath: "docs/partial.md" }
        ]);

        return Promise.reject(new Error("transient file tree load failure"));
      });
    mockedWatchNativeMarkdownTree.mockImplementation(async (_rootPath, onTreeChange) => {
      emitTreeChange = onTreeChange;
      return () => {};
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    await waitFor(() => expect(mockedWatchNativeMarkdownTree).toHaveBeenCalledWith("/vault", expect.any(Function)));

    await act(async () => {
      await emitTreeChange("/vault/docs/partial.md");
    });

    expect(screen.getByText("index.md")).toBeInTheDocument();
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.queryByText("docs/partial.md")).not.toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
  });

  it("coalesces native tree watcher refreshes while a refresh is in flight", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};
    const firstRefresh = createDeferredMarkdownFileList();
    const secondRefresh = createDeferredMarkdownFileList();
    const thirdRefresh = createDeferredMarkdownFileList();
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ])
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise)
      .mockReturnValueOnce(thirdRefresh.promise);
    mockedWatchNativeMarkdownTree.mockImplementation(async (_rootPath, onTreeChange) => {
      emitTreeChange = onTreeChange;
      return () => {};
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    await waitFor(() => expect(mockedWatchNativeMarkdownTree).toHaveBeenCalledWith("/vault", expect.any(Function)));

    await act(async () => {
      emitTreeChange("/vault/docs/first.md");
      emitTreeChange("/vault/docs/second.md");
      emitTreeChange("/vault/docs/third.md");
      await Promise.resolve();
    });

    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstRefresh.resolve([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
        { path: "/vault/docs/intermediate.md", name: "intermediate.md", relativePath: "docs/intermediate.md" }
      ]);
      await Promise.resolve();
    });

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledTimes(3));

    await act(async () => {
      secondRefresh.resolve([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" },
        { path: "/vault/docs/latest.md", name: "latest.md", relativePath: "docs/latest.md" }
      ]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("docs/latest.md")).toBeInTheDocument());
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledTimes(3);
  });

  it("ignores stale native tree refreshes after switching folders", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};
    const staleVaultRefresh = createDeferredMarkdownFileList();
    const docsLoad = createDeferredMarkdownFileList();

    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ])
      .mockReturnValueOnce(staleVaultRefresh.promise)
      .mockReturnValueOnce(docsLoad.promise);
    mockedWatchNativeMarkdownTree.mockImplementation(async (_rootPath, onTreeChange) => {
      emitTreeChange = onTreeChange;
      return () => {};
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    await waitFor(() => expect(mockedWatchNativeMarkdownTree).toHaveBeenCalledWith("/vault", expect.any(Function)));

    const staleRefreshPromise = emitTreeChange("/vault/index.md");
    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/vault", {
      managedAttachmentFolder: "assets"
    }));

    fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/mock-workspaces/beta/docs", {
      managedAttachmentFolder: "assets"
    }));

    await act(async () => {
      docsLoad.resolve([
        { path: "/mock-workspaces/beta/docs/current.md", name: "current.md", relativePath: "current.md" }
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("current.md")).toBeInTheDocument();

    await act(async () => {
      staleVaultRefresh.resolve([
        { path: "/vault/stale.md", name: "stale.md", relativePath: "stale.md" }
      ]);
      await staleRefreshPromise;
      await Promise.resolve();
    });

    expect(screen.queryByText("stale.md")).not.toBeInTheDocument();
    expect(screen.getByText("current.md")).toBeInTheDocument();
  });

  it("ignores previous-folder refreshes while a new folder is loading", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};
    const staleVaultRefresh = createDeferredMarkdownFileList();
    const docsLoad = createDeferredMarkdownFileList();

    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([
        { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
      ])
      .mockReturnValueOnce(staleVaultRefresh.promise)
      .mockReturnValueOnce(docsLoad.promise);
    mockedWatchNativeMarkdownTree.mockImplementation(async (_rootPath, onTreeChange) => {
      emitTreeChange = onTreeChange;
      return () => {};
    });

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    await waitFor(() => expect(mockedWatchNativeMarkdownTree).toHaveBeenCalledWith("/vault", expect.any(Function)));

    fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));
    const staleRefreshPromise = emitTreeChange("/vault/index.md");

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/vault", {
      managedAttachmentFolder: "assets"
    }));

    await act(async () => {
      staleVaultRefresh.resolve([
        { path: "/vault/stale.md", name: "stale.md", relativePath: "stale.md" }
      ]);
      await staleRefreshPromise;
      await Promise.resolve();
    });

    expect(screen.queryByText("stale.md")).not.toBeInTheDocument();

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith("/mock-workspaces/beta/docs", {
      managedAttachmentFolder: "assets"
    }));

    await act(async () => {
      docsLoad.resolve([
        { path: "/mock-workspaces/beta/docs/current.md", name: "current.md", relativePath: "current.md" }
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("current.md")).toBeInTheDocument();
    expect(screen.queryByText("stale.md")).not.toBeInTheDocument();
  });

  it("loads recent markdown folders from settings", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/recent/notes" }
    ]);

    render(<FileTreeProbe />);

    expect(await screen.findByText("/recent/notes")).toBeInTheDocument();
    expect(mockedGetStoredRecentMarkdownFolders).toHaveBeenCalledTimes(1);
  });

  it("restores and persists the recent folder section expansion state", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue(mockWorkspaceState({
      recentFoldersOpen: false
    }));

    render(<FileTreeProbe />);

    await waitFor(() => expect(screen.getByTestId("recent-folders-open-state")).toHaveTextContent("closed"));

    fireEvent.click(screen.getByRole("button", { name: "Expand recent folders" }));

    expect(screen.getByTestId("recent-folders-open-state")).toHaveTextContent("open");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      recentFoldersOpen: true
    });

    fireEvent.click(screen.getByRole("button", { name: "Collapse recent folders" }));

    expect(screen.getByTestId("recent-folders-open-state")).toHaveTextContent("closed");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      recentFoldersOpen: false
    });
  });

  it("restores and persists file tree image asset visibility", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue(mockWorkspaceState({
      fileTreeAssetsVisible: false
    }));

    render(<FileTreeProbe />);

    await waitFor(() => expect(screen.getByTestId("assets-visible-state")).toHaveTextContent("hidden"));

    fireEvent.click(screen.getByRole("button", { name: "Toggle image assets" }));

    expect(screen.getByTestId("assets-visible-state")).toHaveTextContent("visible");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      fileTreeAssetsVisible: true
    });
  });

  it("restores and persists file tree sort per selected workspace folder", async () => {
    mockedGetStoredFileTreeSortByWorkspace.mockResolvedValue({
      "/recent/notes": {
        direction: "descending",
        key: "modifiedAt"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/recent/notes/index.md", name: "index.md", relativePath: "index.md" }
    ]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("file-tree-sort")).toHaveTextContent("modifiedAt:descending")
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort created descending" }));

    expect(screen.getByTestId("file-tree-sort")).toHaveTextContent("createdAt:descending");
    expect(mockedSaveStoredFileTreeSortForWorkspace).toHaveBeenCalledWith("/recent/notes", {
      direction: "descending",
      key: "createdAt"
    });
  });

  it("uses the containing folder as the file tree sort workspace for a markdown file root", async () => {
    mockedGetStoredFileTreeSortByWorkspace.mockResolvedValue({
      "/mock-workspaces/notes": {
        direction: "descending",
        key: "modifiedAt"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/mock-workspaces/notes/daily.md", name: "daily.md", relativePath: "daily.md" }
    ]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Use file root" }));

    await waitFor(() =>
      expect(screen.getByTestId("file-tree-sort")).toHaveTextContent("modifiedAt:descending")
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort created descending" }));

    expect(mockedSaveStoredFileTreeSortForWorkspace).toHaveBeenCalledWith("/mock-workspaces/notes", {
      direction: "descending",
      key: "createdAt"
    });
  });

  it("restores the main file tree expansion state from workspace settings", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue(mockWorkspaceState({
      fileTreeOpen: true
    }));

    render(<FileTreeProbe />);

    await waitFor(() => expect(screen.getByTestId("open-state")).toHaveTextContent("open"));
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("288px minmax(0,1fr)");
  });

  it("opens a remembered markdown folder without showing the native picker", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/recent/notes/index.md", name: "index.md", relativePath: "index.md" }
    ]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("notes");
    expect(mockedOpenNativeMarkdownFolder).not.toHaveBeenCalled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/recent/notes", {
      managedAttachmentFolder: "assets"
    });
    expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
      name: "notes",
      path: "/recent/notes"
    });
  });

  it("moves an opened recent folder to the top of the recent list", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "docs", path: "/mock-workspaces/alpha/docs" },
      { name: "docs", path: "/mock-workspaces/beta/docs" }
    ]);
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/mock-workspaces/beta/docs/index.md", name: "index.md", relativePath: "index.md" }
    ]);

    render(<FileTreeProbe />);

    const recentList = await screen.findByRole("list", { name: "Recent folders" });
    expect(within(recentList).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "/mock-workspaces/alpha/docs",
      "/mock-workspaces/beta/docs"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("docs");
    expect(within(recentList).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "/mock-workspaces/beta/docs",
      "/mock-workspaces/alpha/docs"
    ]);
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/mock-workspaces/beta/docs", {
      managedAttachmentFolder: "assets"
    });
    expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
      name: "docs",
      path: "/mock-workspaces/beta/docs"
    });
  });

  it("coalesces rapid folder selections before starting a native folder load", async () => {
    vi.useFakeTimers();

    try {
      mockedListNativeMarkdownFilesForPath.mockResolvedValue([
        { path: "/mock-workspaces/beta/docs/current.md", name: "current.md", relativePath: "current.md" }
      ]);

      render(<FileTreeProbe />);

      fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));
      fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));

      expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(150);
        await Promise.resolve();
      });

      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledTimes(1);
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/mock-workspaces/beta/docs", {
        managedAttachmentFolder: "assets"
      });
      expect(screen.getByText("current.md")).toBeInTheDocument();
      expect(screen.getByTestId("root-name")).toHaveTextContent("docs");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the latest folder selection when folder loads finish out of order", async () => {
    vi.useFakeTimers();
    const notesLoad = createDeferredMarkdownFileList();
    const docsLoad = createDeferredMarkdownFileList();

    try {
      mockedListNativeMarkdownFilesForPath
        .mockReturnValueOnce(notesLoad.promise)
        .mockReturnValueOnce(docsLoad.promise);

      render(<FileTreeProbe />);

      fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));

      await act(async () => {
        vi.advanceTimersByTime(150);
        await Promise.resolve();
      });

      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/recent/notes", {
        managedAttachmentFolder: "assets"
      });

      fireEvent.click(screen.getByRole("button", { name: "Open second docs folder" }));

      await act(async () => {
        vi.advanceTimersByTime(150);
        await Promise.resolve();
      });

      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/mock-workspaces/beta/docs", {
        managedAttachmentFolder: "assets"
      });

      await act(async () => {
        docsLoad.resolve([
          { path: "/mock-workspaces/beta/docs/current.md", name: "current.md", relativePath: "current.md" }
        ]);
        await Promise.resolve();
      });

      expect(screen.getByText("current.md")).toBeInTheDocument();
      expect(screen.getByTestId("root-name")).toHaveTextContent("docs");

      await act(async () => {
        notesLoad.resolve([
          { path: "/recent/notes/stale.md", name: "stale.md", relativePath: "stale.md" }
        ]);
        await Promise.resolve();
      });

      expect(screen.queryByText("stale.md")).not.toBeInTheDocument();
      expect(screen.getByText("current.md")).toBeInTheDocument();
      expect(screen.getByTestId("root-name")).toHaveTextContent("docs");
      expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
        name: "docs",
        path: "/mock-workspaces/beta/docs"
      });
      expect(mockedSaveStoredRecentMarkdownFolder).not.toHaveBeenCalledWith({
        name: "notes",
        path: "/recent/notes"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores a markdown folder root without reopening a collapsed tree", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
    ]);

    render(<FileTreeProbe currentPath="/vault/docs/guide.md" />);

    fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

    expect(await screen.findByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("closed");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      aiAgentSessionId: "session-restored",
      fileTreeOpen: false,
      folderName: "vault",
      folderPath: "/vault"
    });
  });

  it("loads an explicit folder path immediately for workspace restoration", () => {
    vi.useFakeTimers();

    try {
      mockedListNativeMarkdownFilesForPath.mockResolvedValue([
        { path: "/vault/docs/guide.md", name: "guide.md", relativePath: "docs/guide.md" }
      ]);

      render(<FileTreeProbe currentPath="/vault/docs/guide.md" />);

      fireEvent.click(screen.getByRole("button", { name: "Restore collapsed folder" }));

      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault", {
        managedAttachmentFolder: "assets"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not open a remembered markdown folder after it was deleted outside Markra", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/recent/notes" }
    ]);
    mockedListNativeMarkdownFilesForPath.mockRejectedValue(new Error("Markdown folder no longer exists"));

    render(<FileTreeProbe />);

    expect(await screen.findByText("/recent/notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/recent/notes", {
      managedAttachmentFolder: "assets"
    }));
    await waitFor(() => expect(screen.queryByText("/recent/notes")).not.toBeInTheDocument());
    expect(screen.getByTestId("root-name")).toHaveTextContent("No folder");
    expect(screen.getByTestId("open-state")).toHaveTextContent("closed");
    expect(mockedSaveStoredRecentMarkdownFolder).not.toHaveBeenCalled();
    expect(mockedRemoveStoredRecentMarkdownFolder).toHaveBeenCalledWith("/recent/notes");
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "/recent/notes"
    }));
  });

  it("removes a recent markdown folder without opening it", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/recent/notes" },
      { name: "test", path: "/recent/test" }
    ]);

    render(<FileTreeProbe />);

    expect(await screen.findByText("/recent/notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove recent folder" }));

    await waitFor(() => expect(screen.queryByText("/recent/notes")).not.toBeInTheDocument());
    expect(screen.getByText("/recent/test")).toBeInTheDocument();
    expect(mockedRemoveStoredRecentMarkdownFolder).toHaveBeenCalledWith("/recent/notes");
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
    expect(mockedSaveStoredRecentMarkdownFolder).not.toHaveBeenCalled();
  });

  it("creates folders inside a selected nested folder", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedCreateNativeMarkdownTreeFolder.mockResolvedValue({
      kind: "folder",
      path: "/vault/docs/Sprint",
      name: "Sprint",
      relativePath: "docs/Sprint"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    await waitFor(() => expect(screen.getByTestId("open-state")).toHaveTextContent("open"));

    fireEvent.click(screen.getByRole("button", { name: "Create nested folder" }));

    await waitFor(() =>
      expect(mockedCreateNativeMarkdownTreeFolder).toHaveBeenCalledWith("/vault", "Sprint", "/vault/docs")
    );
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault", {
      managedAttachmentFolder: "assets"
    });
  });

  it("refreshes from the current document path when toggled open without an explicit folder", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/vault/readme.md", name: "readme.md", relativePath: "readme.md" }
    ]);

    render(<FileTreeProbe currentPath="/vault/readme.md" />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault/readme.md", {
      managedAttachmentFolder: "assets"
    }));
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({ fileTreeOpen: true });
  });

  it("reopens an already loaded file tree without immediately rescanning the folder", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/vault/index.md", name: "index.md", relativePath: "index.md" }
    ]);

    render(<FileTreeProbe currentPath="/vault/index.md" />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(await screen.findByText("index.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("open-state")).toHaveTextContent("closed");

    mockedListNativeMarkdownFilesForPath.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
  });

  it("tracks a resizable markdown tree width for the workspace layout", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([]);

    render(<FileTreeProbe currentPath="/vault/readme.md" />);

    expect(screen.getByTestId("tree-width")).toHaveTextContent("288");
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("0px minmax(0,1fr)");

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault/readme.md", {
      managedAttachmentFolder: "assets"
    }));
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("288px minmax(0,1fr)");

    fireEvent.click(screen.getByRole("button", { name: "Resize wide" }));

    expect(screen.getByTestId("tree-width")).toHaveTextContent("440");
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("440px minmax(0,1fr)");

    fireEvent.click(screen.getByRole("button", { name: "Resize narrow" }));

    expect(screen.getByTestId("tree-width")).toHaveTextContent("220");
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("220px minmax(0,1fr)");
  });

  it("disables layout transitions while the markdown tree is being resized", () => {
    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Start resize" }));

    expect(screen.getByTestId("tree-resizing")).toHaveTextContent("resizing");
    expect(screen.getByTestId("layout-class")).toHaveTextContent("transition-none");

    fireEvent.click(screen.getByRole("button", { name: "End resize" }));

    expect(screen.getByTestId("tree-resizing")).toHaveTextContent("idle");
    expect(screen.getByTestId("layout-class")).toHaveTextContent("transition-[grid-template-columns]");
  });

  it("creates folders, creates files, moves files, renames files, and deletes files through native markdown tree operations", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: "/vault",
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([{ path: "/vault/readme.md", name: "readme.md", relativePath: "readme.md" }])
      .mockResolvedValue([
        { path: "/vault/renamed.md", name: "renamed.md", relativePath: "renamed.md" },
        { path: "/vault/Daily note.md", name: "Daily note.md", relativePath: "Daily note.md" }
      ]);

    render(<FileTreeProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await screen.findByText("readme.md");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mockedCreateNativeMarkdownTreeFile).toHaveBeenCalledWith("/vault", "Daily note"));

    fireEvent.click(screen.getByRole("button", { name: "Create from template" }));
    await waitFor(() =>
      expect(mockedCreateNativeMarkdownTreeFile).toHaveBeenCalledWith("/vault", "Daily note", {
        contents: "# Daily note\n",
        parentPath: null
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() => expect(mockedCreateNativeMarkdownTreeFolder).toHaveBeenCalledWith("/vault", "Research"));

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() =>
      expect(mockedRenameNativeMarkdownTreeFile).toHaveBeenCalledWith("/vault", "/vault/readme.md", "renamed.md")
    );

    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(mockedMoveNativeMarkdownTreeFile).toHaveBeenCalledWith("/vault", "/vault/readme.md", "/vault/docs")
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockedDeleteNativeMarkdownTreeFile).toHaveBeenCalledWith("/vault", "/vault/renamed.md"));
  });
});
