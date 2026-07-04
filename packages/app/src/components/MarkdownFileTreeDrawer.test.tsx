import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MarkdownFileTreeDrawer } from "./MarkdownFileTreeDrawer";
import { fileTreeRowHeight } from "./file-tree/file-tree-model";
import { getMarkdownOutline } from "@markra/markdown";
import { readNativeClipboardText, showNativeMarkdownFileTreeContextMenu } from "../lib/tauri";
import type { WorkspaceLinkIndex } from "../lib/workspace-links";

vi.mock("../lib/tauri", () => ({
  readNativeClipboardText: vi.fn(),
  showNativeMarkdownFileTreeContextMenu: vi.fn()
}));

const mockedShowNativeMarkdownFileTreeContextMenu = vi.mocked(showNativeMarkdownFileTreeContextMenu);
const mockedReadNativeClipboardText = vi.mocked(readNativeClipboardText);

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

function createDragDataTransfer() {
  const data = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value)
  } as unknown as DataTransfer;
}

function createPartiallyUnsupportedDragDataTransfer() {
  const data = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      if (type === "application/x-markra-markdown-image") throw new Error("custom drag data unavailable");

      data.set(type, value);
    },
    setDragImage: vi.fn(() => {
      throw new Error("custom drag image unavailable");
    })
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element | Document,
  type: string,
  options: { clientX: number; clientY: number; dataTransfer: DataTransfer }
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  }) as DragEvent;

  Object.defineProperty(event, "clientX", { value: options.clientX });
  Object.defineProperty(event, "clientY", { value: options.clientY });
  Object.defineProperty(event, "dataTransfer", { value: options.dataTransfer });
  target.dispatchEvent(event);

  return event;
}

function dispatchDragEventWithoutPoint(
  target: Element | Document,
  type: string,
  dataTransfer: DataTransfer
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  }) as DragEvent;

  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(event);

  return event;
}

describe("MarkdownFileTreeDrawer", () => {
  beforeEach(() => {
    mockedShowNativeMarkdownFileTreeContextMenu.mockReset();
    mockedShowNativeMarkdownFileTreeContextMenu.mockResolvedValue(undefined);
    mockedReadNativeClipboardText.mockReset();
    mockedReadNativeClipboardText.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(container.querySelector(".markdown-file-tree")).toHaveStyle({
      maxWidth: "0px",
      minWidth: "0px",
      width: "0px"
    });
    expect(container.querySelector(".markdown-file-tree")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(settings);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("collapses its own width so the drawer contents clip with the workspace animation", () => {
    const { container, rerender } = render(
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

    const drawer = container.querySelector(".markdown-file-tree");

    expect(drawer).toHaveClass("transition-[width,min-width,max-width]");
    expect(drawer).not.toHaveClass("opacity-100", "opacity-0");
    expect(container.querySelector(".markdown-file-tree-content")).toHaveClass("transition-opacity", "opacity-100");
    expect(drawer).toHaveStyle({
      maxWidth: "288px",
      minWidth: "288px",
      width: "288px"
    });
    expect(container.querySelector(".markdown-file-tree-content")).toHaveStyle({
      minWidth: "288px",
      width: "288px"
    });

    rerender(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open={false}
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(container.querySelector(".markdown-file-tree")).toHaveStyle({
      maxWidth: "0px",
      minWidth: "0px",
      width: "0px"
    });
    expect(container.querySelector(".markdown-file-tree")).not.toHaveClass("opacity-0");
    expect(container.querySelector(".markdown-file-tree-content")).toHaveClass("opacity-0");
    expect(container.querySelector(".markdown-file-tree-content")).toHaveStyle({
      minWidth: "288px",
      width: "288px"
    });
  });

  it("marks file rows as AI workspace operation targets", () => {
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

    const awsFileRow = screen.getByRole("button", { name: "AWS.md" });
    const awsFileLabel = within(awsFileRow).getByText("AWS.md");

    expect(awsFileRow).toHaveAttribute("data-ai-workspace-file-path", "/vault/AWS.md");
    expect(awsFileRow).toHaveAttribute("data-ai-workspace-file-relative-path", "AWS.md");
    expect(awsFileLabel).toHaveAttribute("data-ai-workspace-file-label-path", "/vault/AWS.md");
    expect(awsFileLabel).toHaveAttribute("data-ai-workspace-file-label-relative-path", "AWS.md");
  });

  it("marks folder rows as AI workspace operation fallback targets", () => {
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

    const deployFolderRow = screen.getByRole("button", { name: "deploy" });
    const deployFolderLabel = within(deployFolderRow).getByText("deploy");

    expect(deployFolderRow).toHaveAttribute("data-ai-workspace-folder-path", "deploy");
    expect(deployFolderRow).toHaveAttribute("data-ai-workspace-folder-relative-path", "deploy");
    expect(deployFolderLabel).toHaveAttribute("data-ai-workspace-folder-label-path", "deploy");
    expect(deployFolderLabel).toHaveAttribute("data-ai-workspace-folder-label-relative-path", "deploy");
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

  it("hides recent folders, file list, and outline independently for view mode chrome", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        fileListVisible={false}
        open
        outlineItems={[
          { level: 1, title: "Intro" },
          { level: 2, title: "Details" }
        ]}
        outlineVisible={false}
        recentFolders={[{ name: "mock-workspace", path: "/mock-files/workspace" }]}
        recentFoldersVisible={false}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenRecentFolder={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.queryByRole("region", { name: "Recently used directories" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tree", { name: "Markdown files" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Document outline" })).not.toBeInTheDocument();
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();
  });

  it("uses safe line height for truncated compact labels", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[
          { level: 1, title: "plugin gap" }
        ]}
        recentFolders={[
          { name: "docs", path: "/mock-workspaces/alpha/docs" },
          { name: "docs", path: "/mock-workspaces/beta/docs" }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenRecentFolder={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const fileButton = screen.getByRole("button", { name: "Untitled.md" });
    const folderButton = screen.getByRole("button", { name: "deploy" });
    const outlineButton = screen.getByRole("button", { name: "plugin gap" });
    const recentSection = screen.getByRole("region", { name: "Recently used directories" });
    const recentHeader = within(recentSection).getByRole("heading", { name: "Recently used directories" });
    const recentFolder = within(recentSection).getByRole("button", {
      name: "docs /mock-workspaces/alpha/docs"
    });

    expect(within(fileButton).getByText("Untitled.md")).toHaveClass("truncate", "leading-5");
    expect(within(folderButton).getByText("deploy")).toHaveClass("truncate", "leading-5");
    expect(outlineButton).toHaveClass("truncate", "leading-5");
    expect(outlineButton).not.toHaveClass("leading-none");
    expect(recentHeader).toHaveClass("truncate", "leading-5");
    expect(within(recentFolder).getByText("docs")).toHaveClass("truncate", "leading-4");
    expect(within(recentFolder).getByText("/mock-workspaces/alpha/docs")).toHaveClass("truncate", "leading-4");
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

  it("hides document links unless the feature is enabled", () => {
    const linkIndex = {
      backlinks: [{
        columnNumber: 5,
        from: 4,
        href: "./Untitled.md",
        lineNumber: 4,
        lineText: "See Untitled from AWS.",
        sourceFile: markdownFiles[1],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 12
      }],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[]}
        rootName="Example Vault"
        sidebarLayoutMode="tabs"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const layoutTabs = screen.getByRole("group", { name: "Files / Outline" });

    expect(within(layoutTabs).queryByRole("button", { name: "Links" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();
    expect(container.querySelector(".markdown-file-tree-links")).not.toBeInTheDocument();
  });

  it("shows document links in the existing sidebar position when enabled", () => {
    const openFile = vi.fn();
    const linkIndex = {
      backlinks: [{
        columnNumber: 5,
        from: 4,
        href: "./Untitled.md",
        lineNumber: 4,
        lineText: "See Untitled from AWS.",
        sourceFile: markdownFiles[1],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 12
      }],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [{
        columnNumber: 9,
        from: 8,
        lineNumber: 2,
        lineText: "Mention Untitled before linking.",
        sourceFile: markdownFiles[2],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 16
      }],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        documentLinksVisible
        linkIndex={linkIndex}
        open
        outlineItems={[]}
        rootName="Example Vault"
        sidebarLayoutMode="tabs"
        onOpenFile={openFile}
        onSelectOutlineItem={() => {}}
      />
    );
    const layoutTabs = screen.getByRole("group", { name: "Files / Outline / Links" });

    expect(within(layoutTabs).getByRole("button", { name: "Links" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();

    fireEvent.click(within(layoutTabs).getByRole("button", { name: "Links" }));

    const links = screen.getByRole("region", { name: "Document links" });
    expect(container.querySelector(".markdown-file-tree-links")).toBeInTheDocument();
    expect(links).toHaveTextContent("Backlinks");
    expect(links).toHaveTextContent("Unlinked mentions");
    expect(links).toHaveTextContent("AWS.md");
    expect(links).toHaveTextContent("See Untitled from AWS.");
    expect(links).toHaveTextContent("deploy.md");
    expect(links).toHaveTextContent("Mention Untitled before linking.");

    fireEvent.click(within(links).getByRole("button", { name: /AWS\.md/ }));

    expect(openFile).toHaveBeenCalledWith(markdownFiles[1]);
  });

  it("keeps stacked sidebar document links hidden by default", () => {
    const linkIndex = {
      backlinks: [],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [{
        columnNumber: 9,
        from: 8,
        lineNumber: 2,
        lineText: "Mention Untitled before linking.",
        sourceFile: markdownFiles[2],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 16
      }],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[{ level: 1, title: "Intro" }]}
        rootName="Example Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Links" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Document links" })).not.toBeInTheDocument();
    expect(container.querySelector(".markdown-file-tree-links")).not.toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toBeInTheDocument();
  });

  it("shows stacked sidebar document links in the existing position when enabled", () => {
    const linkIndex = {
      backlinks: [],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [{
        columnNumber: 9,
        from: 8,
        lineNumber: 2,
        lineText: "Mention Untitled before linking.",
        sourceFile: markdownFiles[2],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 16
      }],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        documentLinksVisible
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[{ level: 1, title: "Intro" }]}
        rootName="Example Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const links = screen.getByRole("region", { name: "Document links" });
    const linksToggle = screen.getByRole("button", { name: "Document links" });

    expect(screen.queryByRole("button", { name: "Links" })).not.toBeInTheDocument();
    expect(container.querySelector(".markdown-file-tree-links")).toBeInTheDocument();
    expect(linksToggle).toHaveAttribute("aria-expanded", "true");
    expect(links).toHaveTextContent("Unlinked mentions");
    expect(links).toHaveTextContent("deploy.md");
    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toBeInTheDocument();

    fireEvent.click(linksToggle);

    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();
    expect(linksToggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".markdown-file-tree-links")).toBeInTheDocument();

    fireEvent.click(linksToggle);

    expect(screen.getByRole("region", { name: "Document links" })).toHaveTextContent("deploy.md");
    expect(linksToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("remembers stacked sidebar document links collapse state through controlled props", () => {
    const changeDocumentLinksOpen = vi.fn();
    const linkIndex = {
      backlinks: [],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [{
        columnNumber: 9,
        from: 8,
        lineNumber: 2,
        lineText: "Mention Untitled before linking.",
        sourceFile: markdownFiles[2],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 16
      }],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { rerender } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        documentLinksOpen={false}
        documentLinksVisible
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[{ level: 1, title: "Intro" }]}
        rootName="Example Vault"
        onDocumentLinksOpenChange={changeDocumentLinksOpen}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const linksToggle = screen.getByRole("button", { name: "Document links" });

    expect(linksToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();

    fireEvent.click(linksToggle);

    expect(changeDocumentLinksOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("region", { name: "Document links" })).not.toBeInTheDocument();

    rerender(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        documentLinksOpen
        documentLinksVisible
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[{ level: 1, title: "Intro" }]}
        rootName="Example Vault"
        onDocumentLinksOpenChange={changeDocumentLinksOpen}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Document links" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Document links" })).toHaveTextContent("deploy.md");
  });

  it("resizes stacked sidebar document links from the divider", () => {
    const linkIndex = {
      backlinks: [],
      fileCount: 3,
      files: [{
        file: markdownFiles[0],
        mentionRanges: [],
        titleCandidates: ["Untitled"]
      }],
      unlinkedMentions: [{
        columnNumber: 9,
        from: 8,
        lineNumber: 2,
        lineText: "Mention Untitled before linking.",
        sourceFile: markdownFiles[2],
        targetFile: markdownFiles[0],
        text: "Untitled",
        to: 16
      }],
      unreadableFileCount: 0
    } satisfies WorkspaceLinkIndex;

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        documentLinksVisible
        files={markdownFiles}
        linkIndex={linkIndex}
        open
        outlineItems={[{ level: 1, title: "Intro" }]}
        rootName="Example Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const body = container.querySelector(".markdown-file-tree-body") as HTMLElement;
    const linksPanel = container.querySelector(".markdown-file-tree-links") as HTMLElement;
    const resizeDocumentLinks = screen.getByRole("separator", { name: "Resize document links" });
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

    expect(resizeDocumentLinks).toHaveAttribute("aria-valuenow", "28");
    expect(linksPanel).toHaveStyle({ flex: "0 1 28%" });

    fireEvent.pointerDown(resizeDocumentLinks, { clientY: 240, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 160 });
    fireEvent.pointerUp(window);

    expect(resizeDocumentLinks).toHaveAttribute("aria-valuenow", "48");
    expect(linksPanel).toHaveStyle({ flex: "0 1 48%" });

    fireEvent.keyDown(resizeDocumentLinks, { key: "ArrowDown" });

    expect(resizeDocumentLinks).toHaveAttribute("aria-valuenow", "43");
    expect(linksPanel).toHaveStyle({ flex: "0 1 43%" });

    fireEvent.click(screen.getByRole("button", { name: "Document links" }));

    expect(screen.queryByRole("separator", { name: "Resize document links" })).not.toBeInTheDocument();

    rectSpy.mockRestore();
  });

  it("shows recent folders in a dedicated sidebar section", () => {
    const openRecentFolder = vi.fn();
    const removeRecentFolder = vi.fn();
    const { container } = render(
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

  it("toggles recent folders when clicking the full section header row", () => {
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
        onOpenRecentFolder={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });
    const recentHeader = within(recentSection)
      .getByRole("heading", { name: "Recently used directories" })
      .closest("div");

    expect(recentHeader).toBeInTheDocument();
    expect(within(recentSection).getByRole("button", { name: "notes" })).toBeInTheDocument();

    fireEvent.click(recentHeader!);

    expect(within(recentSection).queryByRole("button", { name: "notes" })).not.toBeInTheDocument();

    fireEvent.click(recentHeader!);

    expect(within(recentSection).getByRole("button", { name: "notes" })).toBeInTheDocument();
  });

  it("disambiguates recent folders with the same name by path", () => {
    const openRecentFolder = vi.fn();

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        recentFolders={[
          { name: "docs", path: "/mock-workspaces/alpha/docs" },
          { name: "docs", path: "/mock-workspaces/beta/docs" }
        ]}
        rootPath="/mock-workspaces/beta/docs"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenRecentFolder={openRecentFolder}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });
    const alphaDocs = within(recentSection).getByRole("button", {
      name: "docs /mock-workspaces/alpha/docs"
    });
    const betaDocs = within(recentSection).getByRole("button", {
      name: "docs /mock-workspaces/beta/docs"
    });

    expect(alphaDocs).toHaveTextContent("/mock-workspaces/alpha/docs");
    expect(betaDocs).toHaveTextContent("/mock-workspaces/beta/docs");
    expect(alphaDocs).not.toHaveAttribute("aria-current");
    expect(betaDocs).toHaveAttribute("aria-current", "page");
    expect(betaDocs.querySelector(".lucide-folder-open")).toBeInTheDocument();

    fireEvent.click(betaDocs);

    expect(openRecentFolder).toHaveBeenCalledWith({
      name: "docs",
      path: "/mock-workspaces/beta/docs"
    });
  });

  it("middle-truncates long duplicate recent folder paths while keeping the full path tooltip", async () => {
    vi.useFakeTimers();

    const alphaPath = "/mock-workspaces/team-alpha/projects/handbook/content/docs";
    const betaPath = "/mock-workspaces/team-beta/projects/handbook/content/docs";

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        recentFolders={[
          { name: "docs", path: alphaPath },
          { name: "docs", path: betaPath }
        ]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onOpenRecentFolder={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const recentSection = screen.getByRole("region", { name: "Recently used directories" });
    const alphaDocs = within(recentSection).getByRole("button", {
      name: `docs ${alphaPath}`
    });
    const betaDocs = within(recentSection).getByRole("button", {
      name: `docs ${betaPath}`
    });

    expect(alphaDocs).not.toHaveAttribute("title");
    expect(betaDocs).not.toHaveAttribute("title");
    expect(within(alphaDocs).getByText("/mock-workspaces/team-alpha/.../content/docs")).toBeInTheDocument();
    expect(within(betaDocs).getByText("/mock-workspaces/team-beta/.../content/docs")).toBeInTheDocument();
    expect(alphaDocs).not.toHaveTextContent(alphaPath);
    expect(betaDocs).not.toHaveTextContent(betaPath);

    fireEvent.pointerEnter(alphaDocs);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent(alphaPath);
  });

  it("collapses recent folders and removes a recent folder without opening it", () => {
    const openRecentFolder = vi.fn();
    const removeRecentFolder = vi.fn();
    const { container } = render(
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

  it("keeps only settings inside the open Windows drawer footer", () => {
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

    const settings = screen.getByRole("button", { name: "Settings" });
    const footer = container.querySelector(".markdown-file-tree-footer");
    const sidebar = screen.getByRole("complementary", { name: "Markdown file tree" });

    expect(sidebar).toHaveClass("bg-(--bg-chrome)");
    expect(footer).toHaveClass("shrink-0", "border-t", "bg-(--bg-chrome)");
    expect(settings.closest(".markdown-file-tree-footer")).toBe(footer);
    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(settings).not.toHaveClass("fixed", "bottom-3", "left-3");
    expect(container.querySelector(".markdown-file-tree")).toHaveClass("pt-0");
    expect(container.querySelector(".markdown-file-tree")).not.toHaveClass("pt-10");
    expect(toggleMarkdownFiles).not.toHaveBeenCalled();
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

  it("keeps the file tree resize handle forgiving without covering the whole scrollbar", () => {
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath={null}
        files={markdownFiles}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        width={288}
        onOpenFile={() => {}}
        onResize={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const resizeHandle = container.querySelector(".markdown-file-tree-resizer");

    expect(resizeHandle).toHaveClass("w-1");
    expect(resizeHandle).not.toHaveClass("w-px");
    expect(resizeHandle).not.toHaveClass("w-2");
  });

  it("does not render a Windows sidebar toggle when the drawer is collapsed", () => {
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

    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-panel-right")).not.toBeInTheDocument();
    expect(toggleMarkdownFiles).not.toHaveBeenCalled();
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
    expect(sidebar).toHaveClass("transition-[width,min-width,max-width]");
    expect(sidebar).not.toHaveClass("opacity-100", "opacity-0");
    expect(container.querySelector(".markdown-file-tree-content")).toHaveClass("transition-opacity", "opacity-100");
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

  it("supports modifier-based multi-selection in the visible file tree", () => {
    const openFile = vi.fn();
    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { name: "Architecture.md", path: "/vault/Architecture.md", relativePath: "Architecture.md" }
        ]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={openFile}
        onSelectOutlineItem={() => {}}
      />
    );

    const architecture = screen.getByRole("button", { name: "Architecture.md" });
    const aws = screen.getByRole("button", { name: "AWS.md" });
    const untitled = screen.getByRole("button", { name: "Untitled.md" });
    const folder = screen.getByRole("button", { name: "deploy" });

    fireEvent.click(aws, { metaKey: true });

    expect(openFile).not.toHaveBeenCalled();
    expect(aws).toHaveAttribute("aria-selected", "true");
    expect(architecture).not.toHaveAttribute("aria-selected");

    fireEvent.click(architecture, { ctrlKey: true });

    expect(openFile).not.toHaveBeenCalled();
    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(aws).toHaveAttribute("aria-selected", "true");

    fireEvent.click(untitled, { shiftKey: true });

    expect(openFile).not.toHaveBeenCalled();
    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(aws).toHaveAttribute("aria-selected", "true");
    expect(untitled).toHaveAttribute("aria-selected", "true");
    expect(folder).not.toHaveAttribute("aria-selected");

    fireEvent.click(aws, { ctrlKey: true });

    expect(aws).not.toHaveAttribute("aria-selected");
    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(untitled).toHaveAttribute("aria-selected", "true");

    fireEvent.mouseDown(container.querySelector(".file-tree-scroll") as HTMLElement);

    expect(architecture).not.toHaveAttribute("aria-selected");
    expect(untitled).not.toHaveAttribute("aria-selected");

    fireEvent.click(architecture, { metaKey: true });
    fireEvent.click(untitled, { metaKey: true });

    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(untitled).toHaveAttribute("aria-selected", "true");

    fireEvent.click(untitled);

    expect(openFile).toHaveBeenCalledWith(markdownFiles[0]);
    expect(architecture).not.toHaveAttribute("aria-selected");
    expect(untitled).not.toHaveAttribute("aria-selected");
  });

  it("clears file multi-selection when clicking outside file rows", () => {
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[
          ...markdownFiles,
          { name: "Architecture.md", path: "/vault/Architecture.md", relativePath: "Architecture.md" }
        ]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    const architecture = screen.getByRole("button", { name: "Architecture.md" });
    const aws = screen.getByRole("button", { name: "AWS.md" });

    fireEvent.click(aws, { metaKey: true });
    fireEvent.click(architecture, { metaKey: true });

    expect(architecture).toHaveAttribute("aria-selected", "true");
    expect(aws).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerDown(screen.getByText("Files"));

    expect(architecture).not.toHaveAttribute("aria-selected");
    expect(aws).not.toHaveAttribute("aria-selected");

    fireEvent.click(aws, { metaKey: true });
    fireEvent.click(architecture, { metaKey: true });
    fireEvent.pointerDown(screen.getByRole("button", { name: "deploy" }));

    expect(architecture).not.toHaveAttribute("aria-selected");
    expect(aws).not.toHaveAttribute("aria-selected");
  });

  it("uses selected file rows for supported file tree context menu actions", () => {
    const deleteFile = vi.fn();
    const openFileToSide = vi.fn();
    const architectureFile = {
      name: "Architecture.md",
      path: "/vault/Architecture.md",
      relativePath: "Architecture.md"
    };

    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={[...markdownFiles, architectureFile]}
        open
        outlineItems={[]}
        rootName="Obsidian Vault"
        onDeleteFile={deleteFile}
        onOpenFile={() => {}}
        onOpenFileToSide={openFileToSide}
        onSelectOutlineItem={() => {}}
      />
    );

    const architecture = screen.getByRole("button", { name: "Architecture.md" });
    const aws = screen.getByRole("button", { name: "AWS.md" });
    const untitled = screen.getByRole("button", { name: "Untitled.md" });

    fireEvent.click(aws, { metaKey: true });
    fireEvent.click(architecture, { metaKey: true });
    fireEvent.contextMenu(aws);

    const selectedContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    expect(selectedContextHandlers).toEqual(expect.objectContaining({ multiSelect: true }));
    selectedContextHandlers?.openFileToSide?.(markdownFiles[1]);

    expect(openFileToSide).toHaveBeenCalledWith(markdownFiles[1]);
    expect(openFileToSide).toHaveBeenCalledWith(architectureFile);
    expect(openFileToSide).toHaveBeenCalledTimes(2);

    selectedContextHandlers?.deleteFile?.(markdownFiles[1]);

    expect(deleteFile).toHaveBeenCalledWith(markdownFiles[1], {
      files: expect.arrayContaining([markdownFiles[1], architectureFile])
    });
    expect(deleteFile.mock.calls[0]?.[1]?.files).toHaveLength(2);
    expect(deleteFile).toHaveBeenCalledTimes(1);

    deleteFile.mockClear();
    openFileToSide.mockClear();
    fireEvent.contextMenu(untitled);

    const singleContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    expect(singleContextHandlers).toEqual(expect.objectContaining({ multiSelect: false }));
    singleContextHandlers?.openFileToSide?.(markdownFiles[0]);
    singleContextHandlers?.deleteFile?.(markdownFiles[0]);

    expect(openFileToSide).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledWith(markdownFiles[0]);
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it("reveals a requested file path in the tree", () => {
    const { rerender } = render(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile={false}
        currentPath="/vault/deploy/deploy.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        revealPathRequest={null}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal active file" })).not.toBeInTheDocument();

    rerender(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile={false}
        currentPath="/vault/deploy/deploy.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        revealPathRequest={{ id: 1, path: "/vault/deploy/deploy.md" }}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toHaveAttribute("aria-current", "page");
  });

  it("scrolls the requested file into view instead of an earlier active file", async () => {
    const scrollIntoViewCalls: string[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value(this: HTMLElement) {
        scrollIntoViewCalls.push(this.dataset.fileTreePath ?? "");
      }
    });

    try {
      render(
        <MarkdownFileTreeDrawer
          autoRevealActiveFile={false}
          currentPath="/vault/docs/1.md"
          files={[
            { name: "1.md", path: "/vault/docs/1.md", relativePath: "docs/1.md" },
            { name: "2.md", path: "/vault/docs/2.md", relativePath: "docs/2.md" }
          ]}
          open
          outlineItems={[]}
          revealPathRequest={{ id: 1, path: "/vault/docs/2.md" }}
          rootPath="/vault"
          rootName="Obsidian Vault"
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );

      expect(await screen.findByRole("button", { name: "docs/1.md" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("button", { name: "docs/2.md" })).toBeInTheDocument();
      await waitFor(() => expect(scrollIntoViewCalls).toContain("/vault/docs/2.md"));
      expect(scrollIntoViewCalls).not.toContain("/vault/docs/1.md");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    }
  });

  it("automatically reveals the active file when the current path changes", () => {
    const { rerender } = render(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();

    rerender(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile
        currentPath="/vault/deploy/deploy.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toHaveAttribute("aria-current", "page");
  });

  it("defers automatic active-file reveal until after the drawer starts opening", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile
        currentPath="/vault/deploy/deploy.md"
        files={markdownFiles}
        open={false}
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    rerender(
      <MarkdownFileTreeDrawer
        autoRevealActiveFile
        currentPath="/vault/deploy/deploy.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toHaveAttribute("aria-current", "page");
  });

  it("temporarily expands parent folders for workspace operation targets", () => {
    const renderDrawer = (operationRevealPaths: readonly string[]) => (
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        operationRevealPaths={operationRevealPaths}
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const { rerender } = render(renderDrawer([]));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();

    rerender(renderDrawer(["/vault/deploy/new-note.md"]));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toBeInTheDocument();

    rerender(renderDrawer([]));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "deploy/deploy.md" })).not.toBeInTheDocument();
  });

  it("does not collapse folders the user opened before a workspace operation", () => {
    const renderDrawer = (operationRevealPaths: readonly string[]) => (
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        operationRevealPaths={operationRevealPaths}
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const { rerender } = render(renderDrawer([]));
    const deployFolder = screen.getByRole("button", { name: "deploy" });

    fireEvent.click(deployFolder);

    expect(deployFolder).toHaveAttribute("aria-expanded", "true");

    rerender(renderDrawer(["/vault/deploy/new-note.md"]));
    rerender(renderDrawer([]));

    expect(screen.getByRole("button", { name: "deploy" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "deploy/deploy.md" })).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Reveal active file" })).not.toBeInTheDocument();
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

  it("coalesces virtual file tree scroll updates into one animation frame", () => {
    const manyNotes = Array.from({ length: 600 }, (_, index) => {
      const noteNumber = String(index).padStart(3, "0");

      return {
        name: `note-${noteNumber}.md`,
        path: `/vault/notes/note-${noteNumber}.md`,
        relativePath: `notes/note-${noteNumber}.md`
      };
    });
    const notesFolder = { kind: "folder" as const, name: "notes", path: "/vault/notes", relativePath: "notes" };
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    try {
      const { container } = render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/notes/note-000.md"
          files={[notesFolder, ...manyNotes]}
          open
          outlineItems={[]}
          rootName="Obsidian Vault"
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "notes" }));

      const scroll = container.querySelector(".file-tree-scroll") as HTMLElement;
      scroll.scrollTop = 40 * fileTreeRowHeight;
      fireEvent.scroll(scroll);
      scroll.scrollTop = 120 * fileTreeRowHeight;
      fireEvent.scroll(scroll);
      scroll.scrollTop = 240 * fileTreeRowHeight;
      fireEvent.scroll(scroll);

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "notes/note-240.md" })).not.toBeInTheDocument();

      act(() => {
        animationFrames[0]?.(performance.now());
      });

      expect(screen.getByRole("button", { name: "notes/note-240.md" })).toBeInTheDocument();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
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

  it("supports controlled file tree sorting", () => {
    const onFileTreeSortChange = vi.fn();
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/alpha.md"
        fileTreeSort={{ direction: "descending", key: "modifiedAt" }}
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
        onFileTreeSortChange={onFileTreeSortChange}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );
    const tree = screen.getByRole("tree", { name: "Markdown files" });

    expect(within(tree).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "zeta",
      "alpha",
      "alpha.md",
      "zed.md"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Sort files" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Name" }));

    expect(onFileTreeSortChange).toHaveBeenCalledWith({
      direction: "ascending",
      key: "name"
    });
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

  it("toggles image assets without hiding markdown files inside the assets folder", () => {
    const asset = {
      kind: "asset" as const,
      name: "diagram.png",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    };

    function AssetVisibilityProbe() {
      const [assetsVisible, setAssetsVisible] = useState(true);

      return (
        <MarkdownFileTreeDrawer
          currentPath="/vault/index.md"
          fileTreeAssetsVisible={assetsVisible}
          files={[
            { name: "index.md", path: "/vault/index.md", relativePath: "index.md" },
            { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
            asset,
            { name: "notes.md", path: "/vault/assets/notes.md", relativePath: "assets/notes.md" }
          ]}
          open
          outlineItems={[]}
          rootName="Example Vault"
          onFileTreeAssetsVisibleChange={setAssetsVisible}
          onOpenFile={() => {}}
          onSelectOutlineItem={() => {}}
        />
      );
    }

    render(<AssetVisibilityProbe />);

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    expect(screen.getByRole("button", { name: "assets/diagram.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "assets/notes.md" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide image assets" }));

    expect(screen.queryByRole("button", { name: "assets/diagram.png" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "assets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "assets/notes.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show image assets" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show image assets" }));

    expect(screen.getByRole("button", { name: "assets/diagram.png" })).toBeInTheDocument();
  });

  it("starts native drags for image assets with a markdown image payload", () => {
    const asset = {
      kind: "asset" as const,
      name: "diagram image.png",
      path: "/vault/assets/diagram image.png",
      relativePath: "assets/diagram image.png"
    };
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/docs/note.md"
        files={[
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    const assetButton = screen.getByRole("button", { name: "assets/diagram image.png" });
    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(assetButton, { dataTransfer });

    expect(JSON.parse(dataTransfer.getData("application/x-markra-markdown-image"))).toEqual({
      alt: "diagram image",
      path: "/vault/assets/diagram image.png",
      relativePath: "assets/diagram image.png"
    });
    expect(dataTransfer.getData("text/plain")).toBe("![diagram image](../assets/diagram%20image.png)");
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("keeps image asset drags starting when optional drag APIs fail", () => {
    const asset = {
      kind: "asset" as const,
      name: "diagram image.png",
      path: "/vault/assets/diagram image.png",
      relativePath: "assets/diagram image.png"
    };
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/docs/note.md"
        files={[
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    const assetButton = screen.getByRole("button", { name: "assets/diagram image.png" });
    const dataTransfer = createPartiallyUnsupportedDragDataTransfer();

    expect(() => fireEvent.dragStart(assetButton, { dataTransfer })).not.toThrow();

    expect(dataTransfer.getData("text/plain")).toBe("![diagram image](../assets/diagram%20image.png)");
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("reports image asset native drag end points", () => {
    const insertImageAsset = vi.fn();
    const asset = {
      kind: "asset" as const,
      name: "diagram.png",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    };
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/docs/note.md"
        files={[
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onInsertImageAsset={insertImageAsset}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    const dataTransfer = createDragDataTransfer();
    const assetButton = screen.getByRole("button", { name: "assets/diagram.png" });
    fireEvent.dragStart(assetButton, {
      dataTransfer
    });
    dispatchDragEvent(assetButton, "dragend", {
      clientX: 340,
      clientY: 160,
      dataTransfer
    });

    expect(insertImageAsset).toHaveBeenCalledWith(asset, {
      left: 340,
      top: 160
    });
  });

  it("does not reuse stale image asset drag points when the final drag end has no point", () => {
    const insertImageAsset = vi.fn();
    const asset = {
      kind: "asset" as const,
      name: "diagram.png",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    };
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/docs/note.md"
        files={[
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
        ]}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onInsertImageAsset={insertImageAsset}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    const dataTransfer = createDragDataTransfer();
    const assetButton = screen.getByRole("button", { name: "assets/diagram.png" });
    fireEvent.dragStart(assetButton, {
      dataTransfer
    });
    dispatchDragEvent(document, "dragover", {
      clientX: 340,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEventWithoutPoint(assetButton, "dragend", dataTransfer);

    expect(insertImageAsset).not.toHaveBeenCalled();
  });

  it("keeps image asset pointer movement out of file tree dnd", async () => {
    const moveFile = vi.fn();
    const asset = {
      kind: "asset" as const,
      name: "diagram.png",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    };
    render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/docs/note.md"
        files={[
          { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" },
          asset
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

    fireEvent.click(screen.getByRole("button", { name: "assets" }));
    const assetButton = screen.getByRole("button", { name: "assets/diagram.png" });
    vi.spyOn(assetButton, "getBoundingClientRect").mockReturnValue({
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

    fireEvent.mouseDown(assetButton, { button: 0, clientX: 20, clientY: 48 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 340, clientY: 160 });
    fireEvent.mouseUp(document, { clientX: 340, clientY: 160 });
    await settleFileTreeDrag();

    expect(moveFile).not.toHaveBeenCalled();
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

  it("selects prefilled file tree names when creating from a template or renaming", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T09:30:00"));
    const renameFile = vi.fn();

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
          customTemplates={[
            {
              content: "# {{title}}\n",
              id: "draft-template",
              name: "Draft",
              suggestedName: "Draft.md"
            }
          ]}
          files={markdownFiles}
          open
          outlineItems={[]}
          rootPath="/vault"
          rootName="Obsidian Vault"
          onCreateFile={() => {}}
          onOpenFile={() => {}}
          onRenameFile={renameFile}
          onSelectOutlineItem={() => {}}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Daily note" }));
      const templateInput = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;

      expect(templateInput).toHaveValue("2026-05-21");
      expect(templateInput.selectionStart).toBe(0);
      expect(templateInput.selectionEnd).toBe("2026-05-21".length);

      fireEvent.keyDown(templateInput, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Draft" }));
      const templateInputWithExtension = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;

      expect(templateInputWithExtension).toHaveValue("Draft.md");
      expect(templateInputWithExtension.selectionStart).toBe(0);
      expect(templateInputWithExtension.selectionEnd).toBe("Draft".length);

      fireEvent.keyDown(templateInputWithExtension, { key: "Escape" });
      fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
      const fileContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
      act(() => {
        fileContextHandlers?.renameFile?.(markdownFiles[0]);
      });

      const fileRenameInput = screen.getByRole("textbox", { name: "Rename file" }) as HTMLInputElement;
      expect(fileRenameInput).toHaveValue("Untitled.md");
      expect(fileRenameInput.selectionStart).toBe(0);
      expect(fileRenameInput.selectionEnd).toBe("Untitled".length);

      fireEvent.keyDown(fileRenameInput, { key: "Escape" });
      fireEvent.contextMenu(screen.getByRole("button", { name: "deploy" }));
      const folderContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[1]?.[0];
      const folder = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[1]?.[2];
      act(() => {
        if (folder) folderContextHandlers?.renameFile?.(folder);
      });

      const folderRenameInput = screen.getByRole("textbox", { name: "Rename folder" }) as HTMLInputElement;
      expect(folderRenameInput).toHaveValue("deploy");
      expect(folderRenameInput.selectionStart).toBe(0);
      expect(folderRenameInput.selectionEnd).toBe("deploy".length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the containing folder from file tree context menus", () => {
    const openContainingFolder = vi.fn();

    const { container } = render(
      <MarkdownFileTreeDrawer
        currentPath="/vault/Untitled.md"
        files={markdownFiles}
        open
        outlineItems={[]}
        rootPath="/vault"
        rootName="Obsidian Vault"
        onOpenContainingFolder={openContainingFolder}
        onOpenFile={() => {}}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
    const fileContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      fileContextHandlers?.openContainingFolder?.(markdownFiles[0]);
    });

    expect(openContainingFolder).toHaveBeenCalledWith("/vault/Untitled.md");

    openContainingFolder.mockClear();
    mockedShowNativeMarkdownFileTreeContextMenu.mockClear();
    const fileTreeScroll = container.querySelector(".file-tree-scroll");
    if (!fileTreeScroll) throw new Error("file tree scroll area should render");

    fireEvent.contextMenu(fileTreeScroll);
    const backgroundContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      backgroundContextHandlers?.openContainingFolder?.();
    });

    expect(openContainingFolder).toHaveBeenCalledWith("/vault");
  });

  it("shows text editing actions when right-clicking a file name input", async () => {
    const createFile = vi.fn();
    mockedReadNativeClipboardText.mockResolvedValue("Pasted note");

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
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));

    const newFileInput = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;
    fireEvent.contextMenu(newFileInput, { clientX: 24, clientY: 36 });

    expect(mockedShowNativeMarkdownFileTreeContextMenu).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: /Cut/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Paste/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Select All/ })).toBeInTheDocument();

    const pasteItem = screen.getByRole("menuitem", { name: /Paste/ });
    fireEvent.pointerDown(pasteItem);

    expect(screen.getByRole("textbox", { name: "New file name" })).toBeInTheDocument();

    fireEvent.click(pasteItem);

    await waitFor(() => expect(newFileInput).toHaveValue("Pasted note"));

    fireEvent.keyDown(newFileInput, { key: "Enter" });

    expect(createFile).toHaveBeenCalledWith("Pasted note");
  });

  it("uses native text insertion for right-click paste so input undo remains available", async () => {
    const originalExecCommand = document.execCommand;
    const execCommand = vi.fn(() => true);
    mockedReadNativeClipboardText.mockResolvedValue("Undoable note");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
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
      fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));

      const newFileInput = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;
      fireEvent.contextMenu(newFileInput, { clientX: 24, clientY: 36 });
      fireEvent.click(screen.getByRole("menuitem", { name: /Paste/ }));

      await waitFor(() => {
        expect(execCommand).toHaveBeenCalledWith("insertText", false, "Undoable note");
      });
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand
      });
    }
  });

  it("uses native cut for right-click cut so input undo remains available", async () => {
    const originalExecCommand = document.execCommand;
    const execCommand = vi.fn((command: string) => command === "cut");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    try {
      render(
        <MarkdownFileTreeDrawer
          currentPath="/vault/Untitled.md"
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
      fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));

      const newFileInput = screen.getByRole("textbox", { name: "New file name" }) as HTMLInputElement;
      fireEvent.change(newFileInput, { target: { value: "Draft note" } });
      newFileInput.setSelectionRange(0, "Draft".length);
      fireEvent.contextMenu(newFileInput, { clientX: 24, clientY: 36 });
      fireEvent.click(screen.getByRole("menuitem", { name: /Cut/ }));

      await waitFor(() => {
        expect(execCommand).toHaveBeenCalledWith("cut");
      });
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand
      });
    }
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

  it("cancels create inputs when a pointer starts outside the file tree", () => {
    const createFile = vi.fn();

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
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
    expect(screen.getByRole("textbox", { name: "New file name" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("textbox", { name: "New file name" })).not.toBeInTheDocument();
    expect(createFile).not.toHaveBeenCalled();
  });

  it("finishes active file tree inputs when another file row is clicked", async () => {
    const openFile = vi.fn();
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
        onOpenFile={openFile}
        onRenameFile={renameFile}
        onSelectOutlineItem={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
    expect(screen.getByRole("textbox", { name: "New file name" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AWS.md" }));

    expect(screen.queryByRole("textbox", { name: "New file name" })).not.toBeInTheDocument();
    expect(openFile).toHaveBeenCalledWith(markdownFiles[1]);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Untitled.md" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls[0]?.[0];
    act(() => {
      contextHandlers?.renameFile?.(markdownFiles[0]);
    });
    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "Draft.md" } });

    fireEvent.click(screen.getByRole("button", { name: "AWS.md" }));

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "Rename file" })).not.toBeInTheDocument();
    });
    expect(renameFile).toHaveBeenCalledWith(markdownFiles[0], "Draft.md");
    expect(openFile).toHaveBeenLastCalledWith(markdownFiles[1]);
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

    const dragOverlay = screen.getByTestId("file-tree-drag-overlay");

    expect(dragOverlay).toHaveTextContent("AWS.md");
    expect(within(dragOverlay).getByText("AWS.md")).toHaveClass("truncate", "leading-5");
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
    expect(contextHandlers?.openFileToSide).toEqual(expect.any(Function));
    expect(contextHandlers?.canOpenFileToSide?.(markdownFiles[0])).toBe(false);
    expect(contextHandlers?.canOpenFileToSide?.(markdownFiles[1])).toBe(true);

    contextHandlers?.openFileToSide?.(markdownFiles[0]);
    contextHandlers?.openFileToSide?.(markdownFiles[1]);

    expect(openFileToSide).toHaveBeenCalledWith(markdownFiles[1]);
    expect(openFileToSide).toHaveBeenCalledTimes(1);
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

  it("marks the active outline heading and scrolls it into view", () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    try {
      render(
        <MarkdownFileTreeDrawer
          activeOutlineIndex={1}
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

      expect(screen.getByRole("button", { name: "Intro" })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-current", "location");
      expect(screen.getByRole("button", { name: "Details" })).toHaveClass("bg-(--bg-active)", "text-(--text-heading)");
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "nearest",
        inline: "nearest"
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    }
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
