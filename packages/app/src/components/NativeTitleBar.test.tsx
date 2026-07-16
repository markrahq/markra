import { fireEvent, render, screen, within } from "@testing-library/react";
import { NativeTitleBar } from "./NativeTitleBar";

function mockTitlebarActionRects(actionIds: string[]) {
  actionIds.forEach((id, index) => {
    const element = document.querySelector(`[data-titlebar-action="${id}"]`) as HTMLElement;
    const left = index * 28;
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      bottom: 24,
      height: 24,
      left,
      right: left + 24,
      top: 0,
      width: 24,
      x: left,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
  });
}

async function settleSortableDrag() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 60);
  });
}

describe("NativeTitleBar", () => {
  it("renders centered title and file actions inside the drag region", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );
    const titlebar = container.querySelector(".native-titlebar");

    expect(screen.getByLabelText("Window drag region")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("heading", { name: "Draft.md" })).toBeInTheDocument();
    expect(screen.getByText("Draft.md")).toHaveClass("truncate", "leading-5");
    expect(screen.getByRole("button", { name: "Open Markdown or Folder" }).closest(".titlebar-spacer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toBeInTheDocument();
    expect(container.querySelector("[data-titlebar-action='open']")).not.toBeInTheDocument();
    expect(within(container.querySelector(".document-actions") as HTMLElement).queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(titlebar).toHaveClass("grid-cols-[164px_minmax(0,1fr)_164px]");
    expect(titlebar).toHaveClass("h-10", "z-8");
    expect(container.querySelector(".windows-titlebar-corner-mask")).not.toBeInTheDocument();
    expect(container.querySelector(".document-actions")).toHaveClass("h-10");
    expect(container.querySelector(".document-actions")).toHaveClass("opacity-40");
    expect(container.querySelector("[data-titlebar-action='aiAgent']")).toHaveClass("transition-transform");
  });

  it("renders no configurable titlebar actions when the action list is empty", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[]}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Toggle Markra AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editor view mode: Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Markdown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to dark theme" })).not.toBeInTheDocument();
    expect(container.querySelector("[data-titlebar-action]")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Markdown or Folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toBeInTheDocument();
  });

  it("uses custom titlebar content instead of the centered document title", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={220}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("heading", { name: "Draft.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".native-title-slot")).not.toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("tab", { name: "Draft.md" }).closest("[data-tauri-drag-region]")).toBeNull();
    expect(container.querySelector(".native-titlebar")).toHaveClass("bg-(--bg-primary)");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("border-b");
    const sidebarSurface = container.querySelector<HTMLElement>(".native-titlebar-sidebar-surface");
    const sidebarDivider = container.querySelector<HTMLElement>(".native-titlebar-sidebar-divider");
    expect(sidebarSurface).toHaveStyle({ width: "220px" });
    expect(sidebarSurface).toContainElement(sidebarDivider);
    expect(sidebarDivider).toHaveClass("right-0", "opacity-100");
    expect(container.querySelector(".native-title-slot")).toHaveStyle({
      marginLeft: "56px"
    });
    expect(container.querySelector(".native-title-slot")).not.toHaveStyle({ transform: "translateX(110px)" });
  });

  it("keeps the titlebar sidebar surface mounted so it animates with the workspace columns", () => {
    const { container, rerender } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={288}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const surface = container.querySelector<HTMLElement>(".native-titlebar-sidebar-surface");
    const divider = container.querySelector<HTMLElement>(".native-titlebar-sidebar-divider");

    expect(surface).toBeInTheDocument();
    expect(surface).toHaveClass("transition-[width]", "duration-200", "ease-[cubic-bezier(0.22,1,0.36,1)]");
    expect(surface).toHaveStyle({ width: "288px" });
    expect(divider).toBeInTheDocument();
    expect(surface).toContainElement(divider);
    expect(divider).toHaveClass("right-0", "opacity-100");
    expect(divider).not.toHaveClass("transition-[left]");
    expect(divider).not.toHaveStyle({ left: "287px" });

    rerender(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        markdownFilesWidth={288}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar-sidebar-surface")).toHaveStyle({ width: "0px" });
    expect(container.querySelector(".native-titlebar-sidebar-divider")).not.toHaveStyle({ left: "0px" });
  });

  it("keeps the shifted titlebar sidebar gap draggable when tabs are visible", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={520}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const sidebarGap = container.querySelector(".native-titlebar-sidebar-drag-fill");

    expect(sidebarGap).toHaveAttribute("data-tauri-drag-region");
    expect(sidebarGap).toHaveStyle({
      left: "164px",
      width: "356px"
    });
    expect(screen.getByRole("tab", { name: "Draft.md" }).closest("[data-tauri-drag-region]")).toBeNull();
  });

  it("places browser window chrome over the editor area when the file tree is open", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={288}
        nativeWindowChrome={false}
        platform="linux"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );
    const titlebar = container.querySelector(".native-titlebar");
    const titleSlot = container.querySelector(".native-title-slot");

    expect(titlebar).not.toHaveAttribute("data-tauri-drag-region");
    expect(titlebar).toHaveStyle({
      gridTemplateColumns: "auto minmax(0, 1fr) auto",
      left: "289px"
    });
    expect(container.querySelector(".native-titlebar-sidebar-drag-fill")).not.toBeInTheDocument();
    expect(container.querySelector(".titlebar-spacer")).not.toHaveAttribute("data-tauri-drag-region");
    expect(titleSlot?.getAttribute("style") ?? "").not.toContain("margin-left");
    expect(titleSlot?.getAttribute("style") ?? "").not.toContain("transform");
  });

  it("uses the Windows titlebar layout for web chrome when the runtime resolves Windows", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={288}
        nativeWindowChrome={false}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr) 164px",
      left: "289px"
    });
    expect(container.querySelector(".windows-titlebar-corner-mask")).not.toBeInTheDocument();
    expect(container.querySelector(".windows-app-chrome")).not.toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveClass("top-0");
    expect(container.querySelector(".windows-titlebar-actions")).toBeInTheDocument();
    expect(container.querySelector(".windows-window-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".titlebar-spacer")).not.toBeInTheDocument();
  });

  it("keeps macOS titlebar tabs clear of transformed actions before the AI panel", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={384}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={288}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-title-slot")).toHaveStyle({
      marginLeft: "124px",
      marginRight: "384px"
    });
  });

  it("keeps Windows titlebar tabs beside the markdown files sidebar without covering it", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={220}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      left: "219px"
    });
    expect(container.querySelector(".native-titlebar")).toHaveClass("rounded-tl-md");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("overflow-hidden");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("border-t");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("border-l");
    expect(container.querySelector(".native-titlebar")).toHaveClass("transition-[left]");
    expect(container.querySelector(".windows-titlebar-top-divider")).toHaveClass(
      "absolute",
      "top-0",
      "right-0",
      "left-1.5",
      "h-px",
      "bg-(--border-default)"
    );
    expect(container.querySelector(".windows-titlebar-corner-divider")).toHaveClass(
      "absolute",
      "top-0",
      "left-0",
      "size-1.5",
      "rounded-tl-md",
      "border-t",
      "border-l",
      "border-(--border-default)"
    );
    const titlebar = container.querySelector<HTMLElement>(".native-titlebar");
    const sidebarDivider = container.querySelector<HTMLElement>(".windows-titlebar-sidebar-divider");
    expect(sidebarDivider).toBeInTheDocument();
    expect(titlebar).toContainElement(sidebarDivider);
    expect(container.querySelector(".windows-titlebar-sidebar-surface")).not.toBeInTheDocument();
    expect(sidebarDivider).toHaveClass("absolute", "top-1.5", "bottom-0", "left-0", "w-px", "bg-(--border-default)");
    expect(sidebarDivider).not.toHaveClass("right-0");
    expect(container.querySelector(".windows-titlebar-corner-mask")).toHaveStyle({
      left: "218px",
      width: "3px"
    });
    expect(container.querySelector(".native-titlebar-sidebar-spacer")).not.toBeInTheDocument();
    expect(container.querySelector(".native-title-slot")).not.toHaveStyle({ paddingLeft: "232px" });
    expect(container.querySelector(".native-title-slot")).toHaveClass("pl-2.5");
  });

  it("keeps Windows titlebar file actions outside the drag region", () => {
    const toggleSourceMode = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={384}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        sourceMode={false}
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleSourceMode={toggleSourceMode}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar")).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".document-actions")).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".native-title-slot")).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr) 164px 384px"
    });
    expect(container.querySelector(".windows-titlebar-actions")).not.toHaveStyle({ transform: "translateX(-384px)" });
    expect(container.querySelector(".windows-app-chrome .windows-window-controls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editor view mode: Preview" }));

    expect(toggleSourceMode).toHaveBeenCalledTimes(1);
  });

  it("renders Windows self-drawn window controls beside titlebar actions", () => {
    const toggleMarkdownFiles = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={toggleMarkdownFiles}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".windows-app-chrome")).toBeInTheDocument();
    expect(container.querySelector(".windows-app-chrome")).toHaveClass("bg-(--bg-chrome)");
    expect(container.querySelector(".windows-app-chrome")).not.toHaveClass("border-b");
    expect(container.querySelector(".windows-app-chrome-tools")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle workspace sidebar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go forward" })).not.toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveClass("top-10");
    expect(container.querySelector(".native-titlebar")).toHaveClass("bg-(--bg-primary)");
    expect(container.querySelector(".native-titlebar")).toHaveClass("border-t");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("border-l");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("rounded-tl-md");
    expect(container.querySelector(".native-titlebar")).not.toHaveClass("overflow-hidden");
    expect(container.querySelector(".windows-titlebar-top-divider")).not.toBeInTheDocument();
    expect(container.querySelector(".windows-titlebar-corner-divider")).not.toBeInTheDocument();
    expect(container.querySelector(".windows-titlebar-sidebar-divider")).not.toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveClass("transition-[left]");
    expect(container.querySelector(".windows-titlebar-sidebar-surface")).not.toBeInTheDocument();
    expect(container.querySelector(".native-title-slot")).toHaveClass("pl-3");
    expect(container.querySelector(".windows-titlebar-corner-mask")).not.toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr) 164px"
    });
    expect(container.querySelector(".windows-window-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize or restore window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close window" })).not.toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("button", { name: "Close window" }).closest(".windows-window-controls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle workspace sidebar" }));

    expect(toggleMarkdownFiles).toHaveBeenCalledTimes(1);
  });

  it("places the Windows folder context in the center of the top chrome instead of the centered titlebar", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentKind="folder"
        documentName="Desktop"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const workspaceContext = container.querySelector(".windows-app-chrome-context");

    expect(workspaceContext).toBeInTheDocument();
    expect(workspaceContext?.closest(".windows-app-chrome")).toBeInTheDocument();
    expect(workspaceContext?.closest(".windows-app-chrome-center")).toBeInTheDocument();
    expect(workspaceContext?.closest(".windows-app-chrome-center")).toHaveClass("absolute", "left-1/2", "-translate-x-1/2");
    expect(workspaceContext).toHaveTextContent("Desktop");
    expect(within(workspaceContext as HTMLElement).getByText("Desktop")).toHaveClass("truncate", "leading-4");
    expect(screen.queryByRole("heading", { name: "Desktop" })).not.toBeInTheDocument();
  });

  it("keeps the Windows workspace folder visible while a file title is active", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentKind="file"
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        workspaceName="Desktop"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const workspaceContext = container.querySelector(".windows-app-chrome-context");

    expect(workspaceContext).toBeInTheDocument();
    expect(workspaceContext).toHaveTextContent("Desktop");
    expect(within(workspaceContext as HTMLElement).getByText("Desktop")).toHaveClass("truncate", "leading-4");
    expect(screen.getByRole("heading", { name: "Draft.md" })).toBeInTheDocument();
    expect(screen.getByText("Draft.md")).toHaveClass("truncate", "leading-5");
  });

  it("opens self-drawn Windows app menu dropdowns from the top chrome", () => {
    const openMarkdown = vi.fn();
    const saveMarkdown = vi.fn();
    const saveMarkdownAs = vi.fn();
    const syncNow = vi.fn();
    const exportPdf = vi.fn();
    const openSettings = vi.fn();
    const showAbout = vi.fn();
    const checkForUpdates = vi.fn();
    const exitApp = vi.fn();
    const formatBold = vi.fn();
    const runAiPolish = vi.fn();
    const toggleAiCommand = vi.fn();
    const toggleAllFolds = vi.fn();
    const toggleWindowMaximized = vi.fn();
    const toggleMarkdownFiles = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={openMarkdown}
        onSaveMarkdown={saveMarkdown}
        onShowAbout={showAbout}
        onOpenSettings={openSettings}
        onExitApp={exitApp}
        onToggleMarkdownFiles={toggleMarkdownFiles}
        onToggleWindowMaximized={toggleWindowMaximized}
        onToggleTheme={() => {}}
        menuHandlers={{
          checkForUpdates,
          exportPdf,
          formatBold,
          aiPolish: runAiPolish,
          saveDocumentAs: saveMarkdownAs,
          syncNow,
          toggleAiCommand,
          toggleAllFolds
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Markra" }));

    expect(screen.getByRole("menu", { name: "Markra" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "About Markra" }));
    expect(showAbout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Markra" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings... Ctrl+," }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Markra" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Check for updates" }));
    expect(checkForUpdates).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Markra" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Quit Markra" }));
    expect(exitApp).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "File" }));

    expect(screen.getByRole("menu", { name: "File" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Open... Ctrl+O" }));
    expect(openMarkdown).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save Ctrl+S" }));
    expect(saveMarkdown).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const saveAsItem = screen.getByRole("menuitem", { name: "Save As... Ctrl+Shift+S" });
    expect(saveAsItem).not.toBeDisabled();
    fireEvent.click(saveAsItem);
    expect(saveMarkdownAs).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const syncItem = screen.getByRole("menuitem", { name: "Sync now Ctrl+Alt+R" });
    expect(syncItem).not.toBeDisabled();
    fireEvent.click(syncItem);
    expect(syncNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const exportMenuItem = screen.getByRole("menuitem", { name: "Export" });
    expect(exportMenuItem).not.toBeDisabled();
    fireEvent.pointerEnter(exportMenuItem);
    const exportPdfItem = screen.getByRole("menuitem", { name: "Export PDF Ctrl+Alt+P" });
    expect(exportPdfItem).not.toBeDisabled();
    fireEvent.click(exportPdfItem);
    expect(exportPdf).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("menu", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Undo Ctrl+Z" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Select All Ctrl+A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Format" }));

    expect(screen.getByRole("menu", { name: "Format" })).toBeInTheDocument();
    const boldItem = screen.getByRole("menuitem", { name: "Bold Ctrl+B" });
    expect(boldItem).not.toBeDisabled();
    fireEvent.click(boldItem);
    expect(formatBold).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(screen.getByRole("menuitem", { name: "Heading 1 Ctrl+Alt+1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(screen.getByRole("menu", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Enter Full Screen" })).not.toBeInTheDocument();
    const maximizeItem = screen.getByRole("menuitem", { name: "Maximize/Restore Window" });
    expect(maximizeItem).not.toBeDisabled();
    fireEvent.click(maximizeItem);
    expect(toggleWindowMaximized).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Maximize or restore window" }));
    expect(toggleWindowMaximized).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const aiCommandItem = screen.getByRole("menuitem", { name: "AI writing command Ctrl+Shift+J" });
    expect(aiCommandItem).not.toBeDisabled();
    fireEvent.click(aiCommandItem);
    expect(toggleAiCommand).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const foldsItem = screen.getByRole("menuitem", { name: "Toggle all folds Ctrl+Alt+T" });
    expect(foldsItem).not.toBeDisabled();
    fireEvent.click(foldsItem);
    expect(toggleAllFolds).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Toggle file list Ctrl+Shift+M" }));
    expect(toggleMarkdownFiles).toHaveBeenCalledTimes(1);
  });

  it("toggles the Windows window state from self-drawn titlebar double-click mouse downs", () => {
    const toggleWindowMaximized = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
        onToggleWindowMaximized={toggleWindowMaximized}
      />
    );

    fireEvent.mouseDown(container.querySelector(".windows-app-chrome") as HTMLElement, { button: 0, detail: 2 });
    fireEvent.mouseDown(container.querySelector(".native-titlebar") as HTMLElement, { button: 0, detail: 2 });

    expect(toggleWindowMaximized).toHaveBeenCalledTimes(2);
  });

  it("reserves AI panel width as a separate Windows titlebar column so action hitboxes stay narrow", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={384}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        platform="windows"
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr) 164px 384px"
    });
    expect(container.querySelector(".windows-titlebar-actions")).not.toHaveStyle({ transform: "translateX(-384px)" });
    expect(container.querySelector(".windows-app-chrome .windows-window-controls")).toBeInTheDocument();
  });

  it("keeps compact Windows file actions clear of the Markra AI panel", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={384}
        dirty
        documentName="Draft.md"
        markdownFilesOpen={false}
        quickCreateMarkdownFileVisible
        theme="light"
        platform="windows"
        onCreateMarkdownFile={() => {}}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr) 164px 384px"
    });
    expect(container.querySelector(".windows-titlebar-actions")).not.toHaveStyle({ transform: "translateX(-384px)" });
    expect(container.querySelector(".windows-app-chrome .windows-window-controls")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toBeInTheDocument();
  });

  it("toggles the right-side Markra AI panel from the file action area", () => {
    const toggleAiAgent = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={512}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={toggleAiAgent}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const button = screen.getByRole("button", { name: "Toggle Markra AI" });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toContainElement(container.querySelector(".lucide-bot"));
    expect(container.querySelector(".document-actions")).toHaveStyle({ transform: "translateX(-512px)" });

    fireEvent.click(button);

    expect(toggleAiAgent).toHaveBeenCalledTimes(1);
  });

  it("opens document history from a configurable titlebar action", () => {
    const showHistory = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "history", visible: true }
        ]}
        onShowDocumentHistory={showHistory}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));

    expect(showHistory).toHaveBeenCalledTimes(1);
  });

  it("cycles editor view modes from the titlebar action", () => {
    const selectEditorMode = vi.fn();
    const visualModeCase = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onSelectEditorMode={selectEditorMode}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const sourceModeButton = screen.getByRole("button", { name: "Editor view mode: Preview" });
    expect(sourceModeButton).toContainElement(visualModeCase.container.querySelector(".lucide-eye"));
    expect(sourceModeButton).not.toHaveAttribute("aria-pressed");
    expect(sourceModeButton).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("button", { name: "Editor view mode: Source code" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editor view mode: Preview + Source" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Preview" })).not.toBeInTheDocument();

    fireEvent.click(sourceModeButton);

    expect(selectEditorMode).toHaveBeenCalledWith("source");

    visualModeCase.unmount();

    const sourceModeCase = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        sourceMode
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onSelectEditorMode={selectEditorMode}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const sourceViewModeButton = screen.getByRole("button", { name: "Editor view mode: Source code" });
    expect(sourceViewModeButton).toContainElement(sourceModeCase.container.querySelector(".lucide-code-xml"));

    fireEvent.click(sourceViewModeButton);

    expect(selectEditorMode).toHaveBeenLastCalledWith("split");

    sourceModeCase.unmount();

    const splitModeCase = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        splitMode
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onSelectEditorMode={selectEditorMode}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const splitViewModeButton = screen.getByRole("button", { name: "Editor view mode: Preview + Source" });
    expect(splitViewModeButton.querySelector(".lucide-panel-right")).toBeInTheDocument();

    fireEvent.click(splitViewModeButton);

    expect(selectEditorMode).toHaveBeenLastCalledWith("visual");
  });

  it("opens a workspace view mode menu from a configurable titlebar action", () => {
    const selectViewMode = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "viewMode", visible: true }
        ]}
        viewMode="focus"
        onSelectViewMode={selectViewMode}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const viewModeButton = screen.getByRole("button", { name: "View mode: Focus" });

    expect(viewModeButton).toContainElement(container.querySelector(".lucide-focus"));
    expect(container.querySelector(".native-titlebar")).toHaveClass("z-8");

    fireEvent.click(viewModeButton);

    const menu = screen.getByRole("menu", { name: "View mode" });

    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass("fixed", "z-40");
    expect(menu.closest(".native-titlebar")).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: "Focus" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Immersive" }));

    expect(selectViewMode).toHaveBeenCalledWith("immersive");
    expect(screen.queryByRole("menu", { name: "View mode" })).not.toBeInTheDocument();
  });

  it("keeps the Windows workspace view mode menu outside clipped titlebar overflow", () => {
    const selectViewMode = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={220}
        platform="windows"
        theme="light"
        titlebarActions={[
          { id: "viewMode", visible: true }
        ]}
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        viewMode="focus"
        onSelectViewMode={selectViewMode}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-titlebar")).toHaveClass("z-10");

    fireEvent.click(screen.getByRole("button", { name: "View mode: Focus" }));

    const menu = screen.getByRole("menu", { name: "View mode" });

    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass("fixed", "z-40");
    expect(menu.closest(".native-titlebar")).toBeNull();
    expect(menu.closest(".native-titlebar.overflow-hidden")).toBeNull();
  });

  it("closes the workspace view mode menu when the titlebar action is hidden", () => {
    const selectViewMode = vi.fn();
    const { rerender } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "viewMode", visible: true }
        ]}
        viewMode="focus"
        onSelectViewMode={selectViewMode}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "View mode: Focus" }));
    expect(screen.getByRole("menu", { name: "View mode" })).toBeInTheDocument();

    rerender(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[]}
        viewMode="focus"
        onSelectViewMode={selectViewMode}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );
    expect(screen.queryByRole("menu", { name: "View mode" })).not.toBeInTheDocument();

    rerender(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "viewMode", visible: true }
        ]}
        viewMode="focus"
        onSelectViewMode={selectViewMode}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("menu", { name: "View mode" })).not.toBeInTheDocument();
  });

  it("hides fixed left titlebar buttons when configured", () => {
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesButtonVisible={false}
        markdownFilesOpen={false}
        openMarkdownButtonVisible={false}
        quickCreateMarkdownFileVisible={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onCreateMarkdownFile={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Markdown File" })).not.toBeInTheDocument();
  });

  it("hides the workspace view mode titlebar action when configured hidden", () => {
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "viewMode", visible: false }
        ]}
        viewMode="daily"
        onCycleViewMode={() => {}}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "View mode: Daily" })).not.toBeInTheDocument();
  });

  it("renders right-side file actions in the configured order and hides disabled actions", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "theme", visible: true },
          { id: "save", visible: false },
          { id: "splitMode", visible: true },
          { id: "aiAgent", visible: true },
          { id: "sourceMode", visible: true }
        ] as any}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleSplitMode={() => {}}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const actionLabels = within(container.querySelector(".document-actions") as HTMLElement)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));

    expect(actionLabels).toEqual([
      "Switch to dark theme",
      "Toggle Markra AI",
      "Editor view mode: Preview",
      "Show history"
    ]);
    expect(screen.getByRole("button", { name: "Open Markdown or Folder" }).closest(".titlebar-spacer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Markdown" })).not.toBeInTheDocument();
  });

  it("reorders right-side file actions by holding and dragging", async () => {
    const updateTitlebarActions = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "aiAgent", visible: true },
          { id: "sourceMode", visible: true },
          { id: "save", visible: true },
          { id: "theme", visible: true }
        ]}
        onTitlebarActionsChange={updateTitlebarActions}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const aiButton = screen.getByRole("button", { name: "Toggle Markra AI" });
    mockTitlebarActionRects(["aiAgent", "sourceMode", "save", "theme", "viewMode", "history"]);

    fireEvent.mouseDown(aiButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 20, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 65, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 65, clientY: 10 });
    await settleSortableDrag();

    expect(updateTitlebarActions).toHaveBeenCalledWith([
      { id: "sourceMode", visible: true },
      { id: "save", visible: true },
      { id: "aiAgent", visible: true },
      { id: "theme", visible: true },
      { id: "viewMode", visible: true },
      { id: "history", visible: true }
    ]);
  });

  it("reorders right-side file actions from right to left by holding and dragging", async () => {
    const updateTitlebarActions = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        titlebarActions={[
          { id: "aiAgent", visible: true },
          { id: "sourceMode", visible: true },
          { id: "save", visible: true },
          { id: "theme", visible: true }
        ]}
        onTitlebarActionsChange={updateTitlebarActions}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleSourceMode={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const saveButton = screen.getByRole("button", { name: "Save Markdown" });
    mockTitlebarActionRects(["aiAgent", "sourceMode", "save", "theme", "viewMode", "history"]);

    fireEvent.mouseDown(saveButton, { button: 0, clientX: 80, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 70, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 42, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 42, clientY: 10 });
    await settleSortableDrag();

    expect(updateTitlebarActions).toHaveBeenCalledWith([
      { id: "aiAgent", visible: true },
      { id: "save", visible: true },
      { id: "sourceMode", visible: true },
      { id: "theme", visible: true },
      { id: "viewMode", visible: true },
      { id: "history", visible: true }
    ]);
  });

  it("keeps editor width controls out of the titlebar when unavailable", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".document-actions")).not.toContainElement(
      container.querySelector('[data-icon^="editor-width-"]')
    );
    expect(screen.queryByRole("button", { name: /Content width:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Content width" })).not.toBeInTheDocument();
  });

  it("centers the document title inside the editor area when the Markra AI panel is open", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={512}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-title")).toHaveStyle({ transform: "translateX(-256px)" });
    expect(container.querySelector(".document-actions")).toHaveStyle({ transform: "translateX(-512px)" });
  });

  it("centers the document title inside the editor area when the markdown files sidebar is resized", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={220}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-title")).toHaveStyle({ transform: "translateX(110px)" });
  });

  it("balances the document title between the markdown files sidebar and Markra AI panel", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={512}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesWidth={288}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-title")).toHaveStyle({ transform: "translateX(-112px)" });
  });

  it("keeps file actions synced immediately while the Markra AI panel is resizing", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentResizing
        aiAgentWidth={448}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".document-actions")).toHaveClass("transition-none");
    expect(container.querySelector(".document-actions")).toHaveStyle({ transform: "translateX(-448px)" });
    expect(container.querySelector(".native-title")).toHaveStyle({ transform: "translateX(-224px)" });
  });

  it("keeps the document title synced immediately while the markdown files sidebar is resizing", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        markdownFilesResizing
        markdownFilesWidth={440}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".native-title")).toHaveClass("transition-none");
    expect(container.querySelector(".native-title")).toHaveStyle({ transform: "translateX(220px)" });
  });

  it("places the markdown files toggle in the traffic-light side of the titlebar", () => {
    const toggleMarkdownFiles = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={toggleMarkdownFiles}
        onToggleTheme={() => {}}
      />
    );

    const toggle = screen.getByRole("button", { name: "Toggle file list" });
    const controls = container.querySelector(".mac-window-controls");

    expect(controls).toBeInTheDocument();
    expect(toggle.closest(".titlebar-spacer")).not.toHaveClass("pl-22");
    expect(toggle.closest(".titlebar-spacer")).toHaveClass("h-10");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toContainElement(container.querySelector(".lucide-panel-left"));

    fireEvent.click(toggle);

    expect(toggleMarkdownFiles).toHaveBeenCalledTimes(1);
  });

  it("renders the full self-drawn Windows titlebar with right-aligned file actions", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={384}
        dirty
        documentName="Draft.md"
        markdownFilesOpen={false}
        quickCreateMarkdownFileVisible
        theme="light"
        platform="windows"
        onCreateMarkdownFile={() => {}}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const titlebar = container.querySelector(".native-titlebar");

    expect(screen.getAllByLabelText("Window drag region")).toHaveLength(2);
    expect(titlebar).toHaveClass("fixed", "inset-x-0", "grid", "z-10");
    expect(titlebar).not.toHaveClass("right-3.5", "w-auto");
    expect(titlebar).not.toHaveClass("grid-cols-[240px_minmax(0,1fr)_240px]");
    expect(container.querySelector(".mac-window-controls")).not.toBeInTheDocument();
    expect(container.querySelector(".windows-app-chrome .windows-window-controls")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Draft\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toBeInTheDocument();
    expect(container.querySelector(".document-actions")).toHaveClass("relative");
    expect(container.querySelector(".document-actions")).not.toHaveStyle({ transform: "translateX(-384px)" });
    expect(container.querySelector(".windows-titlebar-actions")).not.toHaveStyle({ transform: "translateX(-384px)" });
  });

  it("omits the Markdown or folder picker from the Windows titlebar", () => {
    const openMarkdown = vi.fn();
    const openMarkdownFolder = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        platform="windows"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={openMarkdown}
        onOpenMarkdownFolder={openMarkdownFolder}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(openMarkdown).not.toHaveBeenCalled();
    expect(openMarkdownFolder).not.toHaveBeenCalled();
  });

  it("keeps the unified Markdown or folder picker on macOS", () => {
    const openMarkdown = vi.fn();
    const openMarkdownFolder = vi.fn();
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        platform="macos"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={openMarkdown}
        onOpenMarkdownFolder={openMarkdownFolder}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));

    expect(openMarkdown).toHaveBeenCalledTimes(1);
    expect(openMarkdownFolder).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
  });

  it("shows a quick new file button next to the markdown files toggle when the sidebar is collapsed", () => {
    const createMarkdownFile = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        quickCreateMarkdownFileVisible
        theme="light"
        onCreateMarkdownFile={createMarkdownFile}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    const button = screen.getByRole("button", { name: "New file" });
    const toggle = screen.getByRole("button", { name: "Toggle file list" });

    expect(toggle).toContainElement(container.querySelector(".lucide-panel-right"));
    expect(button.closest(".titlebar-spacer")).toHaveClass("gap-1");
    expect(button).toContainElement(container.querySelector(".lucide-square-pen"));

    fireEvent.click(button);

    expect(createMarkdownFile).toHaveBeenCalledTimes(1);
  });

  it("hides the quick new file button when document tabs are visible", () => {
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        quickCreateMarkdownFileVisible
        theme="light"
        titleContent={(
          <div role="tablist" aria-label="Open documents">
            <button type="button" role="tab" aria-selected="true">Draft.md</button>
          </div>
        )}
        onCreateMarkdownFile={() => {}}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
  });

  it("uses an image icon for image preview titles", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentKind="image"
        documentName="pasted-image.png"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "pasted-image.png" })).toBeInTheDocument();
    expect(container.querySelector(".native-title")).toContainElement(container.querySelector(".lucide-image"));
  });

  it("hides the quick new file button while the markdown files sidebar is open", () => {
    render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen
        quickCreateMarkdownFileVisible
        theme="light"
        onCreateMarkdownFile={() => {}}
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
  });

  it("keeps the markdown files toggle above the shifted title hit area", () => {
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen
        aiAgentWidth={512}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="light"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={() => {}}
      />
    );

    expect(container.querySelector(".titlebar-spacer")).toHaveClass("relative", "z-20");
    expect(container.querySelector(".native-title")).toHaveClass("pointer-events-none");
  });

  it("shows the inverse theme action", () => {
    const toggleTheme = vi.fn();
    const { container } = render(
      <NativeTitleBar
        aiAgentOpen={false}
        dirty={false}
        documentName="Draft.md"
        markdownFilesOpen={false}
        theme="dark"
        onToggleAiAgent={() => {}}
        onOpenMarkdown={() => {}}
        onSaveMarkdown={() => {}}
        onToggleMarkdownFiles={() => {}}
        onToggleTheme={toggleTheme}
      />
    );

    const button = screen.getByRole("button", { name: "Switch to light theme" });

    expect(button).toContainElement(container.querySelector(".lucide-sun"));

    fireEvent.click(button);

    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });
});
