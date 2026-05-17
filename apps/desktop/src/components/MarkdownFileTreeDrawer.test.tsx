import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MarkdownFileTreeDrawer } from "./MarkdownFileTreeDrawer";
import { showNativeMarkdownFileTreeContextMenu } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  showNativeMarkdownFileTreeContextMenu: vi.fn()
}));

const mockedShowNativeMarkdownFileTreeContextMenu = vi.mocked(showNativeMarkdownFileTreeContextMenu);

const markdownFiles = [
  { name: "Untitled.md", path: "/vault/Untitled.md", relativePath: "Untitled.md" },
  { name: "AWS.md", path: "/vault/AWS.md", relativePath: "AWS.md" },
  { name: "deploy.md", path: "/vault/deploy/deploy.md", relativePath: "deploy/deploy.md" }
];

describe("MarkdownFileTreeDrawer", () => {
  beforeEach(() => {
    mockedShowNativeMarkdownFileTreeContextMenu.mockReset();
    mockedShowNativeMarkdownFileTreeContextMenu.mockResolvedValue(undefined);
  });

  it("keeps settings fixed in the lower-left", () => {
    const onOpenSettings = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        open={false}
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenSettings={onOpenSettings}
        onSelectOutlineItem={() => {}}
      />
    );

    const settings = screen.getByRole("button", { name: "Settings" });

    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(settings).toHaveClass("fixed", "bottom-3", "left-3");
    expect(settings).toContainElement(container.querySelector(".lucide-settings"));
    expect(container.querySelector(".markdown-file-tree")).toHaveClass("opacity-0", "-translate-x-4");
    expect(container.querySelector(".markdown-file-tree")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(settings);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("shows file and outline panels together", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show outline" })).not.toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByText("Obsidian Vault")).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Intro");
    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Details");
    expect(container.querySelector(".markdown-file-tree-outline")).toContainElement(container.querySelector(".lucide-table-of-contents"));
  });

  it("shows recent folders in a dedicated sidebar section", () => {
    const openRecentFolder = vi.fn();
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        recentFolders={[
          { name: "notes", path: "/mock-files/notes" },
          { name: "test", path: "/mock-files/test" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenRecentFolder={openRecentFolder}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });

    expect(recentSection).toHaveClass("markdown-file-tree-recent-folders");
    expect(within(recentSection).getByRole("button", { name: "notes" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Directory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Folder..." })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();

    fireEvent.click(within(recentSection).getByRole("button", { name: "notes" }));

    expect(openRecentFolder).toHaveBeenCalledWith({ name: "notes", path: "/mock-files/notes" });
  });

  it("collapses and restores the outline panel", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide outline" }));

    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Document outline" })).not.toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(container.querySelector(".markdown-file-tree-outline-scroll")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show outline" }));

    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Intro");
    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Details");
  });

  it("resizes the file and outline panels from the divider", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const body = container.querySelector(".markdown-file-tree-body") as HTMLElement;
    const filesPanel = container.querySelector(".markdown-file-tree-files") as HTMLElement;
    const outlinePanel = container.querySelector(".markdown-file-tree-outline") as HTMLElement;
    const resizeOutline = screen.getByRole("separator", { name: "Resize outline" });
    const rectSpy = vi.spyOn(body, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 0,
      right: 288,
      top: 100,
      width: 288,
      x: 0,
      y: 100,
      toJSON: () => ({})
    } as DOMRect);

    expect(resizeOutline).toHaveAttribute("aria-valuenow", "40");
    expect(filesPanel).toHaveStyle({ flex: "0 1 60%" });
    expect(outlinePanel).toHaveStyle({ flex: "0 1 40%" });
    expect(outlinePanel).not.toHaveClass("border-t");

    fireEvent.pointerDown(resizeOutline, { clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 120 });
    fireEvent.pointerUp(window);

    expect(resizeOutline).toHaveAttribute("aria-valuenow", "60");
    expect(filesPanel).toHaveStyle({ flex: "0 1 40%" });
    expect(outlinePanel).toHaveStyle({ flex: "0 1 60%" });

    fireEvent.keyDown(resizeOutline, { key: "ArrowDown" });

    expect(resizeOutline).toHaveAttribute("aria-valuenow", "55");
    expect(filesPanel).toHaveStyle({ flex: "0 1 45%" });
    expect(outlinePanel).toHaveStyle({ flex: "0 1 55%" });

    rectSpy.mockRestore();
  });

  it("does not duplicate open file or folder actions in the sidebar header", () => {
    const openMarkdown = vi.fn();
    const openFolder = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Open Markdown File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Folder" })).not.toBeInTheDocument();
    expect(openMarkdown).not.toHaveBeenCalled();
    expect(openFolder).not.toHaveBeenCalled();
  });

  it("keeps create actions unavailable until a folder root is open", () => {
    const createFile = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        folderOpen={false}
        open
        outlineItems={[]}
        rootName="No folder"
        onCreateFile={createFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();

    fireEvent.contextMenu(container.querySelector(".file-tree-scroll") as HTMLElement);

    expect(mockedShowNativeMarkdownFileTreeContextMenu).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });

  it("places open Windows sidebar controls inside a separated drawer footer", () => {
    const toggleMarkdownFiles = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        platform="windows"
        rootName="Obsidian Vault"
        width={288}
        onOpenFile={() => {}}
        onToggleMarkdownFiles={toggleMarkdownFiles}
        onSelectOutlineItem={() => {}}
      />
    );

    const toggle = screen.getByRole("button", { name: "Toggle file list" });
    const settings = screen.getByRole("button", { name: "Settings" });
    const footer = container.querySelector(".markdown-file-tree-footer");

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(footer).toHaveClass("shrink-0", "border-t");
    expect(settings.closest(".markdown-file-tree-footer")).toBe(footer);
    expect(toggle.closest(".markdown-file-tree-footer")).toBe(footer);
    expect(settings).not.toHaveClass("fixed", "bottom-3", "left-3");
    expect(toggle).not.toHaveClass("fixed", "bottom-3");
    expect(toggle).not.toHaveStyle({ left: "300px" });
    expect(toggle).toContainElement(container.querySelector(".lucide-panel-left"));
    expect(container.querySelector(".markdown-file-tree")).toHaveClass("pt-0");
    expect(container.querySelector(".markdown-file-tree")).not.toHaveClass("pt-10");

    fireEvent.click(toggle);

    expect(toggleMarkdownFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps the resize handle below the Windows titlebar tab strip", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        open
        outlineItems={[]}
        platform="windows"
        rootName="Obsidian Vault"
        width={288}
        onOpenFile={() => {}}
        onResize={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const resizeHandle = container.querySelector(".markdown-file-tree-resizer");

    expect(resizeHandle).toHaveClass("top-10", "bottom-0");
    expect(container.querySelector(".markdown-file-tree-resizer-indicator")).not.toBeInTheDocument();
  });

  it("keeps the Windows sidebar toggle reachable when the drawer is collapsed", () => {
    const toggleMarkdownFiles = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        open={false}
        outlineItems={[]}
        platform="windows"
        rootName="Obsidian Vault"
        width={288}
        onOpenFile={() => {}}
        onToggleMarkdownFiles={toggleMarkdownFiles}
        onSelectOutlineItem={() => {}}
      />
    );

    const toggle = screen.getByRole("button", { name: "Toggle file list" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveStyle({ left: "48px" });
    expect(toggle).toContainElement(container.querySelector(".lucide-panel-right"));
  });

  it("renders a folder-style markdown file tree with folders collapsed by default", () => {
    const openFile = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={openFile}
        onSelectOutlineItem={() => {}}
      />
    );

    const sidebar = screen.getByRole("complementary", { name: "Markdown file tree" });
    const folder = screen.getByRole("button", { name: "deploy" });

    expect(sidebar).toBeInTheDocument();
    expect(sidebar).not.toHaveClass("fixed");
    expect(sidebar).toHaveClass("transition-[transform,opacity]", "translate-x-0", "opacity-100");
    expect(sidebar).toHaveClass("bg-(--bg-secondary)");
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Obsidian Vault")).toBeInTheDocument();
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Untitled.md" })).toHaveClass("aria-[current=page]:border-l-[3px]");
    expect(screen.getByRole("button", { name: "Untitled.md" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelector('[role="tree"]')).toBeInTheDocument();

    fireEvent.click(folder);
    fireEvent.click(screen.getByRole("button", { name: "deploy/deploy.md" }));

    expect(openFile).toHaveBeenCalledWith(markdownFiles[2]);
  });

  it("toggles all folders from the root file row", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand folders" })).toContainElement(container.querySelector(".lucide-list-chevrons-up-down"));

    fireEvent.click(screen.getByRole("button", { name: "Expand folders" }));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse folders" })).toContainElement(container.querySelector(".lucide-list-chevrons-down-up"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse folders" }));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
  });

  it("opens image assets from the file tree and supports renaming them", () => {
    const openFile = vi.fn();
    const renameFile = vi.fn();
    const asset = {
      kind: "asset" as const,
      name: "pasted-image.png",
      path: "/vault/assets/pasted-image.png",
      relativePath: "assets/pasted-image.png"
    };
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
        ]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={openFile}
        onRenameFile={renameFile}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "assets" }));

    const assetButton = screen.getByRole("button", { name: "assets/pasted-image.png" });
    expect(assetButton).toContainElement(container.querySelector(".lucide-image"));

    fireEvent.click(assetButton);
    fireEvent.contextMenu(assetButton);

    expect(openFile).toHaveBeenCalledWith(asset);
    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenCalledWith(expect.anything(), "en", asset);

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.renameFile?.(asset);
    });

    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "renamed-image.png" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(renameFile).toHaveBeenCalledWith(asset, "renamed-image.png");
  });

  it("supports creating and renaming markdown files from the file tree", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const renameFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onRenameFile={renameFile}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    const newFileInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(newFileInput, { target: { value: "Daily note" } });
    fireEvent.keyDown(newFileInput, { key: "Enter" });

    expect(createFile).toHaveBeenCalledWith("Daily note");

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.renameFile?.(markdownFiles[0]);
    });

    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "Renamed.md" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(renameFile).toHaveBeenCalledWith(markdownFiles[0], "Renamed.md");
  });

  it("cancels the rename input when the blank file tree area is clicked", () => {
    const renameFile = vi.fn();

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onRenameFile={renameFile}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.renameFile?.(markdownFiles[0]);
    });

    expect(screen.getByRole("textbox", { name: "Rename file" })).toBeInTheDocument();

    fireEvent.mouseDown(container.querySelector(".file-tree-scroll") as HTMLElement);

    expect(screen.queryByRole("textbox", { name: "Rename file" })).not.toBeInTheDocument();
    expect(renameFile).not.toHaveBeenCalled();
  });

  it("opens the blank file tree area context menu and creates folders", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(container.querySelector(".file-tree-scroll") as HTMLElement);

    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        createFile: expect.any(Function),
        createFolder: expect.any(Function)
      }),
      "en",
      undefined
    );

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.createFolder?.();
    });

    const newFolderInput = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(newFolderInput, { target: { value: "Research" } });
    fireEvent.keyDown(newFolderInput, { key: "Enter" });

    expect(createFolder).toHaveBeenCalledWith("Research");
  });

  it("creates folders inside the folder selected from the context menu", () => {
    const createFolder = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "deploy" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.createFolder?.();
    });

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    const deployChildren = screen.getByRole("group", { name: "deploy children" });
    const newFolderInput = within(deployChildren).getByRole("textbox", { name: "New folder name" });
    fireEvent.change(newFolderInput, { target: { value: "Research" } });
    fireEvent.keyDown(newFolderInput, { key: "Enter" });

    expect(createFolder).toHaveBeenCalledWith("Research", "/vault/deploy");
  });

  it("opens a folder context menu with a delete action for that folder", () => {
    const deleteFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onDeleteFile={deleteFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "deploy" }));

    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        deleteFile: expect.any(Function)
      }),
      "en",
      expect.objectContaining({
        kind: "folder",
        name: "deploy",
        path: "/vault/deploy",
        relativePath: "deploy"
      })
    );

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.deleteFile?.({
        kind: "folder",
        name: "deploy",
        path: "/vault/deploy",
        relativePath: "deploy"
      });
    });

    expect(deleteFile).toHaveBeenCalledWith({
      kind: "folder",
      name: "deploy",
      path: "/vault/deploy",
      relativePath: "deploy"
    });
  });

  it("opens native context menus for root and markdown files", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const deleteFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onDeleteFile={deleteFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByText("Obsidian Vault"));
    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        createFile: expect.any(Function),
        createFolder: expect.any(Function)
      }),
      "en",
      undefined
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({
        createFile: expect.any(Function),
        createFolder: expect.any(Function),
        deleteFile: expect.any(Function),
        renameFile: expect.any(Function)
      }),
      "en",
      markdownFiles[0]
    );

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    contextHandlers?.deleteFile?.(markdownFiles[0]);

    expect(deleteFile).toHaveBeenCalledWith(markdownFiles[0]);
  });

  it("keeps child branches visually connected when a folder is expanded", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "deploy" }));

    expect(screen.getByRole("group", { name: "deploy children" })).toHaveClass("border-l");
  });

  it("keeps nested files visually deeper than their parent folder", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "deploy" }));

    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toHaveClass("pl-8");
  });

  it("uses compact semantic icons for file and outline panels", () => {
    const selectOutlineItem = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={selectOutlineItem}
      />
    );

    expect(container.querySelector(".markdown-file-tree-files")).not.toContainElement(container.querySelector(".lucide-folder-tree"));
    expect(container.querySelector(".markdown-file-tree-files")).toContainElement(container.querySelector(".lucide-folder"));
    expect(container.querySelector(".markdown-file-tree-outline")).toContainElement(container.querySelector(".lucide-table-of-contents"));
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Obsidian Vault")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(selectOutlineItem).toHaveBeenCalledWith({ level: 2, title: "Details" }, 1);
  });

  it("selects outline headings while keeping the file tree visible", () => {
    const selectOutlineItem = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={selectOutlineItem}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Obsidian Vault")).toBeInTheDocument();
    expect(selectOutlineItem).toHaveBeenCalledWith({ level: 2, title: "Details" }, 1);
  });

  it("keeps outline clicks from stealing focus before navigation runs", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[{ level: 1, title: "A" }]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "A" }).dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
  });
});
