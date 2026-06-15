import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MarkdownFileTreeDrawer } from "./MarkdownFileTreeDrawer";
import { getMarkdownOutline } from "@markra/markdown";
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

async function settleFileTreeDrag() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 60);
  });
}

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

  it("switches file and outline panels in the tabbed sidebar layout", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        recentFolders={[{ name: "mock-workspace", path: "/mock-files/workspace" }]}
        rootName="Example Vault"
        sidebarLayoutMode="tabs"
        onOpenFile={() => {}}
        onOpenRecentFolder={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const layoutTabs = screen.getByRole("group", { name: "Files / Outline" });
    const recentFolders = screen.getByRole("region", { name: "Recently used directories" });

    expect(layoutTabs.compareDocumentPosition(recentFolders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(layoutTabs).toHaveClass("markdown-file-tree-panel-tabs");
    expect(layoutTabs).not.toHaveClass("rounded-md", "border", "bg-(--bg-secondary)");
    expect(layoutTabs.querySelector(".lucide-file-text")).not.toBeInTheDocument();
    expect(layoutTabs.querySelector(".lucide-table-of-contents")).not.toBeInTheDocument();
    expect(within(layoutTabs).getByRole("button", { name: "Files" })).toHaveAttribute("aria-pressed", "true");
    expect(within(layoutTabs).getByRole("button", { name: "Outline" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("Files")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Search Markdown files" })).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Document outline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize outline" })).not.toBeInTheDocument();

    fireEvent.click(within(layoutTabs).getByRole("button", { name: "Outline" }));

    expect(within(layoutTabs).getByRole("button", { name: "Files" })).toHaveAttribute("aria-pressed", "false");
    expect(within(layoutTabs).getByRole("button", { name: "Outline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("tree", { name: "Markdown files" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recently used directories" })).not.toBeInTheDocument();
    const outlineToolbar = container.querySelector(".markdown-file-tree-outline-toolbar") as HTMLElement;
    const outlineList = screen.getByRole("list", { name: "Document outline" });

    expect(outlineToolbar).toHaveClass("h-8", "justify-start", "border-b");
    expect(outlineToolbar).not.toHaveClass("h-9", "justify-end");
    expect(within(outlineToolbar).getByRole("button", { name: "Outline heading levels: All headings" })).toHaveClass(
      "markdown-file-tree-outline-filter",
      "h-6",
      "rounded-sm"
    );
    expect(outlineList).toHaveClass("markdown-file-tree-outline-list", "px-2", "py-1");
    expect(outlineList).toHaveTextContent("Intro");
    expect(outlineList).toHaveTextContent("Details");
    expect(screen.getByRole("button", { name: "Intro" })).toHaveClass("h-7");
    expect(screen.getAllByText("Outline")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse outline headings" })).toHaveClass("ml-auto");
    expect(container.querySelector(".markdown-file-tree-outline")).toHaveClass("flex-1");

    fireEvent.click(within(outlineToolbar).getByRole("button", { name: "Outline heading levels: All headings" }));

    const outlineLevelMenu = screen.getByRole("menu", { name: "Outline heading levels" });

    expect(outlineLevelMenu).toHaveClass("left-0", "top-7");
    expect(outlineLevelMenu).not.toHaveClass("right-0");

    fireEvent.click(within(layoutTabs).getByRole("button", { name: "Files" }));

    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Document outline" })).not.toBeInTheDocument();
  });

  it("shows recent folders in a dedicated sidebar section", () => {
    const openRecentFolder = vi.fn();
    const removeRecentFolder = vi.fn();
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
        onRemoveRecentFolder={removeRecentFolder}
        onOpenRecentFolder={openRecentFolder}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });
    const recentHeader = within(recentSection)
      .getByRole("heading", { name: "Recently used directories" })
      .closest("div");

    expect(recentSection).toHaveClass("markdown-file-tree-recent-folders");
    expect(recentHeader?.querySelector(".lucide-folder")).not.toBeInTheDocument();
    expect(within(recentSection).getByRole("button", { name: "notes" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Directory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Folder..." })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();

    fireEvent.click(within(recentSection).getByRole("button", { name: "notes" }));

    expect(openRecentFolder).toHaveBeenCalledWith({ name: "notes", path: "/mock-files/notes" });
    expect(removeRecentFolder).not.toHaveBeenCalled();
  });

  it("collapses recent folders and removes a recent folder without opening it", () => {
    const openRecentFolder = vi.fn();
    const removeRecentFolder = vi.fn();
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
        onRemoveRecentFolder={removeRecentFolder}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });

    expect(within(recentSection).getByRole("button", { name: "notes" })).toBeInTheDocument();

    fireEvent.click(within(recentSection).getByRole("button", { name: "Hide recent directories" }));

    expect(within(recentSection).queryByRole("button", { name: "notes" })).not.toBeInTheDocument();

    fireEvent.click(within(recentSection).getByRole("button", { name: "Show recent directories" }));
    const removeNotes = within(recentSection).getByRole("button", { name: "Remove from recent directories: notes" });
    const notesRow = removeNotes.closest(".markdown-file-tree-recent-folder");

    expect(notesRow).toBeInTheDocument();
    expect(removeNotes).toHaveStyle({ opacity: "0", pointerEvents: "none" });
    expect(removeNotes).not.toHaveClass("group-focus-within/recent-folder:opacity-100");

    fireEvent.mouseEnter(notesRow!);

    expect(removeNotes).toHaveStyle({ opacity: "1", pointerEvents: "auto" });

    fireEvent.mouseLeave(notesRow!);

    expect(removeNotes).toHaveStyle({ opacity: "0", pointerEvents: "none" });

    fireEvent.mouseEnter(notesRow!);
    fireEvent.click(removeNotes);

    expect(removeRecentFolder).toHaveBeenCalledWith({ name: "notes", path: "/mock-files/notes" });
    expect(openRecentFolder).not.toHaveBeenCalled();
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

  it("places the Windows open folder action in the sidebar header before search", () => {
    const openFolder = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        platform="windows"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenFolder={openFolder}
        onSelectOutlineItem={() => {}}
      />
    );
    const headerActions = container.querySelector(".markdown-file-tree-header-actions") as HTMLElement;

    expect(
      within(headerActions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Open Folder", "Search Markdown files"]);
    expect(screen.getByRole("button", { name: "Open Folder" })).toContainElement(
      container.querySelector(".lucide-folder-open")
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Folder" }));

    expect(openFolder).toHaveBeenCalledTimes(1);
  });

  it("keeps folder creation unavailable until a folder root is open", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        folderOpen={false}
        open
        outlineItems={[]}
        rootName="No folder"
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("No folder")).toBeInTheDocument();
    expect(container.querySelector(".file-tree-scroll")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.getByRole("menuitem", { name: "New file" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "New Folder" })).not.toBeInTheDocument();
    expect(mockedShowNativeMarkdownFileTreeContextMenu).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
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
        onCreateFile={() => {}}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More file actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand folders" })).toContainElement(container.querySelector(".lucide-list-chevrons-up-down"));
    expect(
      within(screen.getByText("Obsidian Vault").parentElement?.parentElement as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Sort files", "Expand folders", "New"]);

    fireEvent.click(screen.getByRole("button", { name: "Expand folders" }));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse folders" })).toContainElement(container.querySelector(".lucide-list-chevrons-down-up"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse folders" }));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
  });

  it("windows large expanded folder contents instead of mounting every file row", async () => {
    const manyNotes = Array.from({ length: 600 }, (_, index) => {
      const noteNumber = String(index).padStart(3, "0");

      return {
        name: `note-${noteNumber}.md`,
        path: `/vault/notes/note-${noteNumber}.md`,
        relativePath: `notes/note-${noteNumber}.md`
      };
    });
    const notesFolder = { kind: "folder" as const, name: "notes", path: "/vault/notes", relativePath: "notes" };
    const renderDrawer = (files: typeof manyNotes) => (
      <MarkdownFileTreeDrawer
        currentPath="/vault/notes/note-000.md"
        files={[notesFolder, ...files]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const { container, rerender } = render(renderDrawer(manyNotes));

    fireEvent.click(screen.getByRole("button", { name: "notes" }));

    expect(screen.getByRole("button", { name: "notes/note-000.md" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "notes/note-599.md" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^notes\/note-/ }).length).toBeLessThan(80);

    const scroll = container.querySelector(".file-tree-scroll") as HTMLElement;
    scroll.scrollTop = 590 * 32;
    fireEvent.scroll(scroll);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "notes/note-599.md" })).toBeInTheDocument();
    });

    rerender(renderDrawer(manyNotes.slice(0, 300)));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "notes/note-299.md" })).toBeInTheDocument();
    });
  });

  it("sorts file tree entries by name, modified time, and created time", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/alpha.md"
        files={[
          {
            kind: "folder",
            name: "zeta",
            path: "/vault/zeta",
            relativePath: "zeta",
            createdAt: 200,
            modifiedAt: 900
          },
          {
            kind: "folder",
            name: "alpha",
            path: "/vault/alpha",
            relativePath: "alpha",
            createdAt: 800,
            modifiedAt: 100
          },
          {
            name: "zed.md",
            path: "/vault/zed.md",
            relativePath: "zed.md",
            createdAt: 700,
            modifiedAt: 300
          },
          {
            name: "alpha.md",
            path: "/vault/alpha.md",
            relativePath: "alpha.md",
            createdAt: 100,
            modifiedAt: 600
          }
        ]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const tree = screen.getByRole("tree", { name: "Markdown files" });
    const treeRows = () => within(tree).getAllByRole("button").map((button) => button.textContent);

    expect(treeRows()).toEqual(["alpha", "zeta", "alpha.md", "zed.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort files" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Modified time" }));

    expect(screen.queryByRole("button", { name: "Descending" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Descending" })).toHaveAttribute("aria-checked", "true");
    expect(treeRows()).toEqual(["zeta", "alpha", "alpha.md", "zed.md"]);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Ascending" }));

    expect(screen.getByRole("menuitemradio", { name: "Ascending" })).toHaveAttribute("aria-checked", "true");
    expect(treeRows()).toEqual(["alpha", "zeta", "zed.md", "alpha.md"]);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Created time" }));

    expect(screen.getByRole("menuitemradio", { name: "Descending" })).toHaveAttribute("aria-checked", "true");
    expect(treeRows()).toEqual(["alpha", "zeta", "zed.md", "alpha.md"]);
  });

  it("closes sidebar option menus after clicking outside them", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Setup" }
        ]}
        rootName="Obsidian Vault"
        onCreateFile={() => {}}
        onCreateFolder={() => {}}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort files" }));
    expect(screen.getByRole("menu", { name: "Sort files" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu", { name: "Sort files" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByRole("menu", { name: "New" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu", { name: "New" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Outline heading levels: All headings" }));
    expect(screen.getByRole("menu", { name: "Outline heading levels" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu", { name: "Outline heading levels" })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
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

  it("keeps the rename input visible until an async rename finishes", async () => {
    let finishRename: (() => void) | null = null;
    const renameFile = vi.fn(() => new Promise<void>((resolve) => {
      finishRename = resolve;
    }));

    render(
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

    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "Renamed.md" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(renameFile).toHaveBeenCalledWith(markdownFiles[0], "Renamed.md");
    expect(screen.getByRole("textbox", { name: "Rename file" })).toHaveValue("Renamed.md");
    expect(screen.queryByRole("button", { name: "Untitled.md" })).not.toBeInTheDocument();

    await act(async () => {
      finishRename?.();
      await Promise.resolve();
    });

    expect(screen.queryByRole("textbox", { name: "Rename file" })).not.toBeInTheDocument();
  });

  it("supports renaming folders from the file tree context menu", () => {
    const renameFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onRenameFile={renameFile}
        onSelectOutlineItem={() => {}}
      />
    );

    const folderButton = screen.getByRole("button", { name: "deploy" });
    fireEvent.contextMenu(folderButton);
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    const folder = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[2];

    act(() => {
      if (folder) contextHandlers?.renameFile?.(folder);
    });

    const renameInput = screen.getByRole("textbox", { name: "Rename folder" });
    fireEvent.change(renameInput, { target: { value: "renamed-deploy" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(renameFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "folder",
        path: "/vault/deploy"
      }),
      "renamed-deploy"
    );
  });

  it("keeps the empty file tree available for root file creation without an open folder", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={[]}
        folderOpen={false}
        open
        outlineItems={[]}
        rootName="No folder"
        onCreateFile={createFile}
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.getByText("No Markdown files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText("No Markdown files"));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];

    expect(contextHandlers?.createFile).toEqual(expect.any(Function));
    expect(contextHandlers?.createFolder).toBeUndefined();

    act(() => {
      contextHandlers?.createFile?.();
    });
    const newFileInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(newFileInput, { target: { value: "Scratch" } });
    fireEvent.keyDown(newFileInput, { key: "Enter" });

    expect(createFile).toHaveBeenCalledWith("Scratch");
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("starts a markdown file from a lightweight template", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T09:30:00"));
    const createFile = vi.fn();

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
          files={markdownFiles}
          open
          outlineItems={[]}
          rootName="Obsidian Vault"
          onCreateFile={createFile}
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      expect(screen.getByText("New from template")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("menuitem", { name: "Daily note" }));

      const newFileInput = screen.getByRole("textbox", { name: "New file name" });

      expect(newFileInput).toHaveValue("2026-05-21");
      expect(screen.getByText("Daily note")).toBeInTheDocument();

      fireEvent.keyDown(newFileInput, { key: "Enter" });

      expect(createFile).toHaveBeenCalledWith(
        "2026-05-21",
        undefined,
        expect.stringContaining("# 2026-05-21")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts root create actions inside the current file parent folder", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T09:30:00"));
    const createFile = vi.fn();
    const createFolder = vi.fn();

    try {
      const { rerender } = render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/deploy/deploy.md"
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

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
      const newFileInput = screen.getByRole("textbox", { name: "New file name" });
      fireEvent.change(newFileInput, { target: { value: "Sprint note" } });
      fireEvent.keyDown(newFileInput, { key: "Enter" });

      expect(createFile).toHaveBeenCalledWith("Sprint note", "/vault/deploy");

      rerender(
        <MarkdownFileTreeDrawer
          currentPath="/vault/deploy/deploy.md"
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

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Daily note" }));
      const templateInput = screen.getByRole("textbox", { name: "New file name" });
      fireEvent.keyDown(templateInput, { key: "Enter" });

      expect(createFile).toHaveBeenLastCalledWith(
        "2026-05-21",
        "/vault/deploy",
        expect.stringContaining("# 2026-05-21")
      );

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "New Folder" }));
      const newFolderInput = screen.getByRole("textbox", { name: "New folder name" });
      fireEvent.change(newFolderInput, { target: { value: "Research" } });
      fireEvent.keyDown(newFolderInput, { key: "Enter" });

      expect(createFolder).toHaveBeenCalledWith("Research", "/vault/deploy");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts toolbar create actions inside the selected folder", () => {
    const createFolder = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/deploy/deploy.md"
        files={[
          ...markdownFiles,
          { name: "notes.md", path: "/vault/docs/notes.md", relativePath: "docs/notes.md" }
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onCreateFolder={createFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "docs" }));
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Folder" }));
    const newFolderInput = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(newFolderInput, { target: { value: "Research" } });
    fireEvent.keyDown(newFolderInput, { key: "Enter" });

    expect(createFolder).toHaveBeenCalledWith("Research", "/vault/docs");
  });

  it("starts root create actions at the tree root when the current file is in the root folder", () => {
    const createFile = vi.fn();
    const createFolder = vi.fn();

    render(
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

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
    const newFileInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(newFileInput, { target: { value: "Root note" } });
    fireEvent.keyDown(newFileInput, { key: "Enter" });

    expect(createFile).toHaveBeenCalledWith("Root note");

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Folder" }));
    const newFolderInput = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(newFolderInput, { target: { value: "Inbox" } });
    fireEvent.keyDown(newFolderInput, { key: "Enter" });

    expect(createFolder).toHaveBeenCalledWith("Inbox");
  });

  it("starts a markdown file from a custom template", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T09:30:00"));
    const createFile = vi.fn();

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
          customTemplates={[
            {
              id: "standup",
              name: "Standup",
              suggestedName: "{{date}} standup",
              content: "# {{title}}\n\n## Yesterday"
            }
          ]}
          files={markdownFiles}
          open
          outlineItems={[]}
          rootName="Obsidian Vault"
          onCreateFile={createFile}
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Standup" }));

      const newFileInput = screen.getByRole("textbox", { name: "New file name" });

      expect(newFileInput).toHaveValue("2026-05-21 standup");

      fireEvent.keyDown(newFileInput, { key: "Enter" });

      expect(createFile).toHaveBeenCalledWith(
        "2026-05-21 standup",
        undefined,
        expect.stringContaining("## Yesterday")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses edited built-in templates without showing the original duplicate", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        customTemplates={[
          {
            id: "daily-note",
            name: "Daily note edited",
            suggestedName: "{{date}} edited",
            content: "# Edited daily"
          }
        ]}
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onCreateFile={vi.fn()}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.getByRole("menuitem", { name: "Daily note edited" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Daily note" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Meeting note" })).toBeInTheDocument();
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

  it("commits and closes the rename input when clicking outside the sidebar", async () => {
    const renameFile = vi.fn();

    render(
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

    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "Renamed.md" } });
    fireEvent.pointerDown(document.body);

    expect(renameFile).toHaveBeenCalledWith(markdownFiles[0], "Renamed.md");
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "Rename file" })).not.toBeInTheDocument();
    });
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

  it("starts template creation from the native file tree context menu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T09:30:00"));
    const createFile = vi.fn();

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
          files={markdownFiles}
          open
          outlineItems={[]}
          rootName="Obsidian Vault"
          onCreateFile={createFile}
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );

      fireEvent.contextMenu(screen.getByText("Obsidian Vault"));
      const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];

      act(() => {
        contextHandlers?.createFileFromTemplates?.[0]?.create();
      });

      const newFileInput = screen.getByRole("textbox", { name: "New file name" });
      expect(newFileInput).toHaveValue("2026-05-21");

      fireEvent.keyDown(newFileInput, { key: "Enter" });

      expect(createFile).toHaveBeenCalledWith(
        "2026-05-21",
        undefined,
        expect.stringContaining("Date: 2026-05-21")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves a markdown file as a template from the native file tree context menu", () => {
    const saveFileAsTemplate = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSaveFileAsTemplate={saveFileAsTemplate}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "AWS.md" }));

    expect(mockedShowNativeMarkdownFileTreeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        saveFileAsTemplate: expect.any(Function)
      }),
      "en",
      markdownFiles[1]
    );

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.saveFileAsTemplate?.(markdownFiles[1]);
    });

    expect(saveFileAsTemplate).toHaveBeenCalledWith(markdownFiles[1]);
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

  it("moves folders onto other folders and nested files back to the root", async () => {
    const moveFile = vi.fn();

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { kind: "folder", name: "archive", path: "/vault/archive", relativePath: "archive" }
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onMoveFile={moveFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const deployFolder = screen.getByRole("button", { name: "deploy" });
    const archiveFolder = screen.getByRole("button", { name: "archive" });
    vi.spyOn(deployFolder, "getBoundingClientRect").mockReturnValue({
      bottom: 32,
      height: 32,
      left: 0,
      right: 260,
      top: 0,
      width: 260,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(archiveFolder, "getBoundingClientRect").mockReturnValue({
      bottom: 64,
      height: 32,
      left: 0,
      right: 260,
      top: 32,
      width: 260,
      x: 0,
      y: 32,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(deployFolder, { button: 0, clientX: 20, clientY: 16 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 28 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 48 });
    fireEvent.mouseUp(document, { clientX: 24, clientY: 48 });
    await settleFileTreeDrag();

    expect(moveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "folder",
        path: "/vault/deploy",
        relativePath: "deploy"
      }),
      "/vault/archive"
    );

    fireEvent.click(deployFolder);
    const nestedFile = screen.getByRole("button", { name: "deploy/deploy.md" });
    const scroll = container.querySelector(".file-tree-scroll") as HTMLElement;
    vi.spyOn(nestedFile, "getBoundingClientRect").mockReturnValue({
      bottom: 96,
      height: 32,
      left: 20,
      right: 260,
      top: 64,
      width: 240,
      x: 20,
      y: 64,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
      bottom: 260,
      height: 220,
      left: 0,
      right: 260,
      top: 40,
      width: 260,
      x: 0,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(nestedFile, { button: 0, clientX: 40, clientY: 80 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 44, clientY: 120 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 44, clientY: 180 });
    fireEvent.mouseUp(document, { clientX: 44, clientY: 180 });
    await settleFileTreeDrag();

    expect(moveFile).toHaveBeenLastCalledWith(
      markdownFiles[2],
      null
    );
  });

  it("moves files and folders with pointer dragging in the file tree", async () => {
    const moveFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { kind: "folder", name: "archive", path: "/vault/archive", relativePath: "archive" }
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onMoveFile={moveFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const deployFolder = screen.getByRole("button", { name: "deploy" });
    const awsFile = screen.getByRole("button", { name: "AWS.md" });
    vi.spyOn(awsFile, "getBoundingClientRect").mockReturnValue({
      bottom: 72,
      height: 32,
      left: 0,
      right: 260,
      top: 40,
      width: 260,
      x: 0,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(deployFolder, "getBoundingClientRect").mockReturnValue({
      bottom: 32,
      height: 32,
      left: 0,
      right: 260,
      top: 0,
      width: 260,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(awsFile, { button: 0, clientX: 20, clientY: 56 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 42 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 16 });

    expect(screen.getByTestId("file-tree-drag-overlay")).toHaveTextContent("AWS.md");
    expect(deployFolder).toHaveClass("bg-(--bg-active)");

    fireEvent.mouseUp(document, { clientX: 24, clientY: 16 });
    await settleFileTreeDrag();

    expect(moveFile).toHaveBeenCalledWith(markdownFiles[1], "/vault/deploy");
  });

  it("moves a file into an expanded folder when dropped over its child list", async () => {
    const moveFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onMoveFile={moveFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const deployFolder = screen.getByRole("button", { name: "deploy" });
    fireEvent.click(deployFolder);

    const deployChildren = screen.getByRole("group", { name: "deploy children" });
    const awsFile = screen.getByRole("button", { name: "AWS.md" });
    vi.spyOn(awsFile, "getBoundingClientRect").mockReturnValue({
      bottom: 128,
      height: 32,
      left: 0,
      right: 260,
      top: 96,
      width: 260,
      x: 0,
      y: 96,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(deployChildren, "getBoundingClientRect").mockReturnValue({
      bottom: 92,
      height: 60,
      left: 20,
      right: 260,
      top: 32,
      width: 240,
      x: 20,
      y: 32,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(awsFile, { button: 0, clientX: 20, clientY: 112 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 36, clientY: 96 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 36, clientY: 72 });

    expect(deployFolder).toHaveClass("bg-(--bg-active)");
    expect(deployChildren).toHaveClass("bg-(--bg-active)");

    fireEvent.mouseUp(document, { clientX: 36, clientY: 72 });
    await settleFileTreeDrag();

    expect(moveFile).toHaveBeenCalledWith(markdownFiles[1], "/vault/deploy");
  });

  it("does not move items into their current parent or themselves", async () => {
    const moveFile = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onMoveFile={moveFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const deployFolder = screen.getByRole("button", { name: "deploy" });
    const awsFile = screen.getByRole("button", { name: "AWS.md" });
    const scroll = container.querySelector(".file-tree-scroll") as HTMLElement;
    vi.spyOn(awsFile, "getBoundingClientRect").mockReturnValue({
      bottom: 72,
      height: 32,
      left: 0,
      right: 260,
      top: 40,
      width: 260,
      x: 0,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
      bottom: 260,
      height: 220,
      left: 0,
      right: 260,
      top: 40,
      width: 260,
      x: 0,
      y: 40,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(awsFile, { button: 0, clientX: 20, clientY: 56 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 100 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 24, clientY: 180 });
    fireEvent.mouseUp(document, { clientX: 24, clientY: 180 });
    await settleFileTreeDrag();

    fireEvent.click(deployFolder);
    const deployChildren = screen.getByRole("group", { name: "deploy children" });
    vi.spyOn(deployFolder, "getBoundingClientRect").mockReturnValue({
      bottom: 32,
      height: 32,
      left: 0,
      right: 260,
      top: 0,
      width: 260,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(deployChildren, "getBoundingClientRect").mockReturnValue({
      bottom: 92,
      height: 60,
      left: 20,
      right: 260,
      top: 32,
      width: 240,
      x: 20,
      y: 32,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(deployFolder, { button: 0, clientX: 20, clientY: 16 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 36, clientY: 44 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 36, clientY: 72 });
    fireEvent.mouseUp(document, { clientX: 36, clientY: 72 });
    await settleFileTreeDrag();

    expect(moveFile).not.toHaveBeenCalled();
  });

  it("uses the innermost expanded child list as the drop target", async () => {
    const moveFile = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { kind: "folder", name: "child", path: "/vault/deploy/child", relativePath: "deploy/child" },
          { name: "inside.md", path: "/vault/deploy/child/inside.md", relativePath: "deploy/child/inside.md" }
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onMoveFile={moveFile}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "deploy" }));
    fireEvent.click(screen.getByRole("button", { name: "child" }));

    const deployChildren = screen.getByRole("group", { name: "deploy children" });
    const childChildren = screen.getByRole("group", { name: "child children" });
    const awsFile = screen.getByRole("button", { name: "AWS.md" });
    vi.spyOn(awsFile, "getBoundingClientRect").mockReturnValue({
      bottom: 180,
      height: 32,
      left: 0,
      right: 260,
      top: 148,
      width: 260,
      x: 0,
      y: 148,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(deployChildren, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 108,
      left: 20,
      right: 260,
      top: 32,
      width: 240,
      x: 20,
      y: 32,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(childChildren, "getBoundingClientRect").mockReturnValue({
      bottom: 120,
      height: 56,
      left: 40,
      right: 260,
      top: 64,
      width: 220,
      x: 40,
      y: 64,
      toJSON: () => ({})
    } as DOMRect);

    fireEvent.mouseDown(awsFile, { button: 0, clientX: 20, clientY: 164 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 60, clientY: 132 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 60, clientY: 88 });
    fireEvent.mouseUp(document, { clientX: 60, clientY: 88 });
    await settleFileTreeDrag();

    expect(moveFile).toHaveBeenCalledWith(markdownFiles[1], "/vault/deploy/child");
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

  it("marks active markdown files as unavailable for side-open context actions", () => {
    const openFileToSide = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenFileToSide={openFileToSide}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));

    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    expect(contextHandlers?.openFileToSide).toBe(openFileToSide);
    expect(contextHandlers?.canOpenFileToSide?.(markdownFiles[0])).toBe(false);
    expect(contextHandlers?.canOpenFileToSide?.(markdownFiles[1])).toBe(true);
  });

  it("keeps file tree context-menu rows from selecting text", () => {
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

    expect(screen.getByText("Obsidian Vault").closest("div")).toHaveClass("select-none", "[-webkit-user-select:none]");
    expect(screen.getByRole("button", { name: "deploy" })).toHaveClass("select-none", "[-webkit-user-select:none]");
    expect(screen.getByRole("button", { name: "Untitled.md" })).toHaveClass("select-none", "[-webkit-user-select:none]");
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

  it("renders inline markdown formatting in outline titles", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          {
            level: 1,
            title: "Bold italic deleted",
            titleMarkdown: "**Bold** _italic_ ~~deleted~~"
          }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const outlineButton = screen.getByRole("button", { name: "Bold italic deleted" });
    const boldTitle = within(outlineButton).getByText("Bold");
    const italicTitle = within(outlineButton).getByText("italic");
    const deletedTitle = within(outlineButton).getByText("deleted");

    expect(boldTitle.tagName).toBe("STRONG");
    expect(boldTitle).toHaveClass("font-[760]");
    expect(italicTitle.tagName).toBe("EM");
    expect(italicTitle).toHaveClass("italic");
    expect(italicTitle.getAttribute("style")).toContain("font-style: italic");
    expect(italicTitle.getAttribute("style")).toContain("font-synthesis: style");
    expect(deletedTitle.tagName).toBe("DEL");
  });

  it("renders Markra highlight and inline math in outline titles", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          {
            level: 1,
            title: "Marked formula x^2",
            titleMarkdown: "==Marked== formula $x^2$"
          }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const outlineButton = screen.getByRole("button", { name: "Marked formula x^2" });
    const highlightedTitle = within(outlineButton).getByText("Marked");
    const mathTitle = within(outlineButton).getByText("x^2");

    expect(highlightedTitle.tagName).toBe("MARK");
    expect(highlightedTitle).toHaveClass("bg-(--accent-soft)");
    expect(mathTitle).toHaveClass("markra-outline-title-math");
  });

  it("keeps links and images as plain outline title text", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          {
            level: 1,
            title: "Linked Alt text",
            titleMarkdown: "[Linked](https://example.test) ![Alt text](asset.png)"
          }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const outlineButton = screen.getByRole("button", { name: "Linked Alt text" });

    expect(outlineButton).toHaveTextContent("Linked Alt text");
    expect(outlineButton.querySelector("a")).not.toBeInTheDocument();
    expect(outlineButton.querySelector("img")).not.toBeInTheDocument();
    expect(outlineButton.querySelector(".underline")).not.toBeInTheDocument();
  });

  it("renders combined bold and italic outline titles from markdown content", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={getMarkdownOutline("## ***Synthetic***")}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const outlineButton = screen.getByRole("button", { name: "Synthetic" });
    const strongTitle = outlineButton.querySelector("strong");
    const italicTitle = outlineButton.querySelector("em");

    expect(strongTitle).toHaveTextContent("Synthetic");
    expect(strongTitle).toHaveClass("font-[760]");
    expect(italicTitle).toHaveTextContent("Synthetic");
    expect(italicTitle).toHaveClass("italic");
    expect(italicTitle?.getAttribute("style")).toContain("font-style: italic");
    expect(italicTitle?.getAttribute("style")).toContain("font-synthesis: style");
  });

  it("collapses nested outline headings without affecting later siblings", () => {
    const selectOutlineItem = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Setup" },
          { level: 2, title: "Usage" },
          { level: 3, title: "API" },
          { level: 1, title: "Appendix" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={selectOutlineItem}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Intro" }));

    expect(selectOutlineItem).toHaveBeenCalledWith({ level: 1, title: "Intro" }, 0);
    selectOutlineItem.mockClear();
    expect(screen.getByRole("button", { name: "Collapse heading: Intro" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Collapse heading: Intro" }));

    expect(screen.getByRole("button", { name: "Intro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand heading: Intro" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "API" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appendix" })).toBeInTheDocument();
    expect(selectOutlineItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Expand heading: Intro" }));

    expect(screen.getByRole("button", { name: "Collapse heading: Intro" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API" })).toBeInTheDocument();
  });

  it("collapses and expands every collapsible outline heading from the outline controls", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Setup" },
          { level: 2, title: "Usage" },
          { level: 3, title: "API" },
          { level: 1, title: "Appendix" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse outline headings" }));

    expect(screen.getByRole("button", { name: "Intro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "API" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appendix" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand outline headings" }));

    expect(screen.getByRole("button", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API" })).toBeInTheDocument();
  });

  it("filters outline headings by visible heading depth from the outline controls", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Setup" },
          { level: 3, title: "API" },
          { level: 4, title: "Params" },
          { level: 2, title: "Usage" },
          { level: 1, title: "Appendix" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Outline heading levels: All headings" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "H1-H2" }));

    expect(screen.getByRole("button", { name: "Outline heading levels: H1-H2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Intro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Setup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "API" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Params" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appendix" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Outline heading levels: H1-H2" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "All headings" }));

    expect(screen.getByRole("button", { name: "API" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Params" })).toBeInTheDocument();
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
