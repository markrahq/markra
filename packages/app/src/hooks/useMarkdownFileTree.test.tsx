import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createNativeMarkdownTreeFile,
  createNativeMarkdownTreeFolder,
  deleteNativeMarkdownTreeFile,
  listNativeMarkdownFilesForPath,
  moveNativeMarkdownTreeFile,
  openNativeMarkdownFolder,
  renameNativeMarkdownTreeFile,
  watchNativeMarkdownTree
} from "../lib/tauri";
import {
  createAiAgentSessionId,
  getStoredRecentMarkdownFolders,
  removeStoredRecentMarkdownFolder,
  saveStoredRecentMarkdownFolder,
  saveStoredWorkspaceState,
  type RecentMarkdownFolder
} from "../lib/settings/app-settings";
import { useMarkdownFileTree } from "./useMarkdownFileTree";

vi.mock("../lib/tauri", () => ({
  createNativeMarkdownTreeFile: vi.fn(),
  createNativeMarkdownTreeFolder: vi.fn(),
  deleteNativeMarkdownTreeFile: vi.fn(),
  listNativeMarkdownFilesForPath: vi.fn(),
  moveNativeMarkdownTreeFile: vi.fn(),
  openNativeMarkdownFolder: vi.fn(),
  renameNativeMarkdownTreeFile: vi.fn(),
  watchNativeMarkdownTree: vi.fn()
}));

vi.mock("../lib/settings/app-settings", () => ({
  createAiAgentSessionId: vi.fn(),
  getStoredRecentMarkdownFolders: vi.fn(),
  prependRecentMarkdownFolder: vi.fn((folders: RecentMarkdownFolder[], folder: RecentMarkdownFolder) => [
    folder,
    ...folders.filter((item) => item.path !== folder.path)
  ].slice(0, 5)),
  removeStoredRecentMarkdownFolder: vi.fn(),
  saveStoredRecentMarkdownFolder: vi.fn(),
  saveStoredWorkspaceState: vi.fn()
}));

const mockedCreateNativeMarkdownTreeFile = vi.mocked(createNativeMarkdownTreeFile);
const mockedCreateNativeMarkdownTreeFolder = vi.mocked(createNativeMarkdownTreeFolder);
const mockedDeleteNativeMarkdownTreeFile = vi.mocked(deleteNativeMarkdownTreeFile);
const mockedListNativeMarkdownFilesForPath = vi.mocked(listNativeMarkdownFilesForPath);
const mockedMoveNativeMarkdownTreeFile = vi.mocked(moveNativeMarkdownTreeFile);
const mockedOpenNativeMarkdownFolder = vi.mocked(openNativeMarkdownFolder);
const mockedRenameNativeMarkdownTreeFile = vi.mocked(renameNativeMarkdownTreeFile);
const mockedWatchNativeMarkdownTree = vi.mocked(watchNativeMarkdownTree);
const mockedCreateAiAgentSessionId = vi.mocked(createAiAgentSessionId);
const mockedGetStoredRecentMarkdownFolders = vi.mocked(getStoredRecentMarkdownFolders);
const mockedRemoveStoredRecentMarkdownFolder = vi.mocked(removeStoredRecentMarkdownFolder);
const mockedSaveStoredRecentMarkdownFolder = vi.mocked(saveStoredRecentMarkdownFolder);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);

function FileTreeProbe({ currentPath = null }: { currentPath?: string | null }) {
  const tree = useMarkdownFileTree();

  return (
    <section>
      <p data-testid="root-name">{tree.rootNameForDocument(currentPath)}</p>
      <p data-testid="open-state">{tree.open ? "open" : "closed"}</p>
      <p data-testid="tree-width">{tree.width}</p>
      <p data-testid="tree-resizing">{tree.resizing ? "resizing" : "idle"}</p>
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
        onClick={() => tree.openFolderPath("/vault", "vault", "session-restored", false, false)}
      >
        Restore collapsed folder
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
    mockedListNativeMarkdownFilesForPath.mockReset();
    mockedMoveNativeMarkdownTreeFile.mockReset();
    mockedOpenNativeMarkdownFolder.mockReset();
    mockedRenameNativeMarkdownTreeFile.mockReset();
    mockedWatchNativeMarkdownTree.mockReset();
    mockedCreateAiAgentSessionId.mockReset();
    mockedGetStoredRecentMarkdownFolders.mockReset();
    mockedRemoveStoredRecentMarkdownFolder.mockReset();
    mockedSaveStoredRecentMarkdownFolder.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedCreateAiAgentSessionId.mockReturnValue("session-folder");
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([]);
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
    mockedWatchNativeMarkdownTree.mockResolvedValue(() => {});
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
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault");
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

  it("loads recent markdown folders from settings", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/recent/notes" }
    ]);

    render(<FileTreeProbe />);

    expect(await screen.findByText("/recent/notes")).toBeInTheDocument();
    expect(mockedGetStoredRecentMarkdownFolders).toHaveBeenCalledTimes(1);
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
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/recent/notes");
    expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
      name: "notes",
      path: "/recent/notes"
    });
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

  it("does not open a remembered markdown folder after it was deleted outside Markra", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/recent/notes" }
    ]);
    mockedListNativeMarkdownFilesForPath.mockRejectedValue(new Error("Markdown folder no longer exists"));

    render(<FileTreeProbe />);

    expect(await screen.findByText("/recent/notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open recent folder" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/recent/notes"));
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
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault");
  });

  it("refreshes from the current document path when toggled open without an explicit folder", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { path: "/vault/readme.md", name: "readme.md", relativePath: "readme.md" }
    ]);

    render(<FileTreeProbe currentPath="/vault/readme.md" />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault/readme.md"));
    expect(screen.getByTestId("root-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("open-state")).toHaveTextContent("open");
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({ fileTreeOpen: true });
  });

  it("tracks a resizable markdown tree width for the workspace layout", async () => {
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([]);

    render(<FileTreeProbe currentPath="/vault/readme.md" />);

    expect(screen.getByTestId("tree-width")).toHaveTextContent("288");
    expect(screen.getByTestId("layout-columns")).toHaveTextContent("0px minmax(0,1fr)");

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/vault/readme.md"));
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
