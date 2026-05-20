import { renderHook, waitFor } from "@testing-library/react";
import { useSideBySideTabs } from "./useSideBySideTabs";
import type { MarkdownTabsBarDocumentItem } from "../components/MarkdownTabsBar";
import type { MarkdownDocumentTab } from "./useMarkdownDocument";

function documentTab(id: string, path: string): MarkdownDocumentTab {
  return {
    content: `# ${path}`,
    dirty: false,
    id,
    name: path.split("/").at(-1) ?? path,
    open: true,
    revision: 0,
    path
  };
}

describe("useSideBySideTabs", () => {
  const firstTab = documentTab("file:/vault/1.md", "/vault/1.md");
  const secondTab = documentTab("file:/vault/2.md", "/vault/2.md");

  const baseOptions = {
    activeImageFileOpen: false,
    activeTabId: firstTab.id,
    documentTabs: [firstTab, secondTab],
    hasOpenDocument: true,
    loadStoredWorkspaceState: vi.fn(),
    persistSideDocumentGroup: vi.fn(),
    restoreReady: true,
    restoreWorkspaceOnStartup: true,
    titlebarTabs: [firstTab, secondTab] satisfies MarkdownTabsBarDocumentItem[]
  };

  it("does not read a saved side-by-side group when document tabs are disabled", () => {
    const loadStoredWorkspaceState = vi.fn(async () => ({
      openFilePaths: [firstTab.path!, secondTab.path!],
      sideBySideGroup: {
        primaryFilePath: firstTab.path!,
        sideFilePath: secondTab.path!
      }
    }));

    const { result } = renderHook(() =>
      useSideBySideTabs({
        ...baseOptions,
        documentTabsEnabled: false,
        loadStoredWorkspaceState
      })
    );

    expect(loadStoredWorkspaceState).not.toHaveBeenCalled();
    expect(result.current.sideDocumentGroup).toBeNull();
    expect(result.current.sideDocumentOpen).toBe(false);
  });

  it("restores a saved side-by-side group only when document tabs are enabled", async () => {
    const loadStoredWorkspaceState = vi.fn(async () => ({
      openFilePaths: [firstTab.path!, secondTab.path!],
      sideBySideGroup: {
        primaryFilePath: firstTab.path!,
        sideFilePath: secondTab.path!
      }
    }));

    const { result } = renderHook(() =>
      useSideBySideTabs({
        ...baseOptions,
        documentTabsEnabled: true,
        loadStoredWorkspaceState
      })
    );

    await waitFor(() =>
      expect(result.current.sideDocumentGroup).toEqual({
        primaryTabId: firstTab.id,
        sideTabId: secondTab.id
      })
    );
    expect(result.current.sideDocumentOpen).toBe(true);
    expect(loadStoredWorkspaceState).toHaveBeenCalledTimes(1);
  });
});
