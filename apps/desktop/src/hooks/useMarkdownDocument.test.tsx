import { act, renderHook } from "@testing-library/react";
import { useMarkdownDocument } from "./useMarkdownDocument";
import {
  openNativeMarkdownPath,
  readNativeMarkdownFile,
  watchNativeMarkdownFile
} from "../lib/tauri";

vi.mock("../lib/settings/app-settings", () => ({
  consumeWelcomeDocumentState: vi.fn(),
  createAiAgentSessionId: vi.fn(() => "session-test"),
  getStoredWorkspaceState: vi.fn(),
  saveStoredWorkspaceState: vi.fn(async () => {})
}));

vi.mock("../lib/tauri", () => ({
  openNativeMarkdownFolderInNewWindow: vi.fn(),
  openNativeMarkdownFileInNewWindow: vi.fn(),
  openNativeMarkdownPath: vi.fn(),
  readNativeMarkdownFile: vi.fn(),
  saveNativeMarkdownFile: vi.fn(),
  setNativeWindowTitle: vi.fn(),
  watchNativeMarkdownFile: vi.fn()
}));

const mockedOpenNativeMarkdownPath = vi.mocked(openNativeMarkdownPath);
const mockedReadNativeMarkdownFile = vi.mocked(readNativeMarkdownFile);
const mockedWatchNativeMarkdownFile = vi.mocked(watchNativeMarkdownFile);

describe("useMarkdownDocument", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    mockedOpenNativeMarkdownPath.mockReset();
    mockedReadNativeMarkdownFile.mockReset();
    mockedWatchNativeMarkdownFile.mockReset();
    mockedWatchNativeMarkdownFile.mockResolvedValue(() => {});
  });

  it("does not ask to discard an untouched blank document when the editor still exposes stale markdown", async () => {
    let editorMarkdown = "";
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedOpenNativeMarkdownPath
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# First file\n\nClean content.",
          name: "first.md",
          path: "/mock-files/first.md"
        }
      })
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# Second file\n\nClean content.",
          name: "second.md",
          path: "/mock-files/second.md"
        }
      });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openMarkdownFile();
    });
    editorMarkdown = "# First file\n\nClean content.";
    expect(result.current.document.name).toBe("first.md");

    await act(async () => {
      await result.current.createBlankDocument();
    });
    expect(result.current.document.name).toBe("Untitled.md");

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.document.name).toBe("second.md");
  });

  it("does not ask to discard a clean file after an editor-only trailing newline normalization", async () => {
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedOpenNativeMarkdownPath
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# First file\n\nClean content.",
          name: "first.md",
          path: "/mock-files/first.md"
        }
      })
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# Second file\n\nClean content.",
          name: "second.md",
          path: "/mock-files/second.md"
        }
      });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    act(() => {
      result.current.handleMarkdownChange("# First file\n\nClean content.\n");
    });

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.document.name).toBe("second.md");
  });

  it("does not ask to discard a clean file only because the editor serialized markdown differently", async () => {
    let editorMarkdown = "";
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedOpenNativeMarkdownPath
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "First file\n==========\n\n- Clean content.",
          name: "first.md",
          path: "/mock-files/first.md"
        }
      })
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# Second file\n\nClean content.",
          name: "second.md",
          path: "/mock-files/second.md"
        }
      });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: () => true,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    editorMarkdown = "# First file\n\n* Clean content.";

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.document.name).toBe("second.md");
  });

  it("keeps a clean tab unmodified when the editor reports an equivalent markdown update", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "* Clean content.",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        isCurrentMarkdownEquivalent: () => true,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("- Clean content.");
    });

    expect(result.current.document).toMatchObject({
      content: "- Clean content.",
      dirty: false,
      name: "guide.md"
    });
    expect(result.current.tabs).toContainEqual(expect.objectContaining({
      dirty: false,
      name: "guide.md"
    }));
  });

  it("opens folder files as tabs and keeps dirty tab content when switching", async () => {
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === "/mock-files/guide.md") {
        return {
          content: "# Guide\n\nOriginal",
          name: "guide.md",
          path
        };
      }

      return {
        content: "# Notes\n\nClean",
        name: "notes.md",
        path
      };
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nDraft");
    });

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]);
    expect(result.current.document.name).toBe("notes.md");

    const guideTab = result.current.tabs.find((tab) => tab.name === "guide.md");
    expect(guideTab).toBeTruthy();

    act(() => {
      result.current.selectMarkdownTab(guideTab!.id);
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nDraft",
      dirty: true,
      name: "guide.md"
    });
  });

  it("keeps dirty inactive tabs protected when the document tabs setting is disabled", async () => {
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === "/mock-files/guide.md") {
        return {
          content: "# Guide\n\nOriginal",
          name: "guide.md",
          path
        };
      }

      return {
        content: "# Notes\n\nClean",
        name: "notes.md",
        path
      };
    });
    mockedOpenNativeMarkdownPath.mockResolvedValueOnce({
      kind: "file",
      file: {
        content: "# Later\n\nClean",
        name: "later.md",
        path: "/mock-files/later.md"
      }
    });
    const { result, rerender } = renderHook(
      ({ documentTabsEnabled }) =>
        useMarkdownDocument({
          confirmDiscardUnsavedChanges,
          documentTabsEnabled,
          getCurrentMarkdown: (fallbackContent) => fallbackContent,
          onTreeRootFromFilePath: vi.fn(),
          onTreeRootFromFolderPath: vi.fn(),
          preferencesReady: false,
          restoreWorkspaceOnStartup: false
        }),
      { initialProps: { documentTabsEnabled: true } }
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nDraft");
    });

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      });
    });

    rerender({ documentTabsEnabled: false });

    expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]);

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]);
    expect(result.current.document.name).toBe("notes.md");
  });

  it("asks before closing a dirty tab", async () => {
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nDraft");
    });

    const guideTab = result.current.tabs.find((tab) => tab.name === "guide.md");
    expect(guideTab).toBeTruthy();

    await act(async () => {
      await result.current.closeMarkdownTab(guideTab!.id);
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(result.current.tabs.some((tab) => tab.id === guideTab!.id)).toBe(true);
  });

  it("closes a clean tab without prompting when the editor still exposes stale markdown", async () => {
    const editorMarkdown = "# Previous file";
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nClean",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        documentTabsEnabled: true,
        editorReady: false,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: () => false,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    const guideTab = result.current.tabs.find((tab) => tab.name === "guide.md");
    expect(guideTab).toBeTruthy();

    await act(async () => {
      await result.current.closeMarkdownTab(guideTab!.id);
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.tabs.some((tab) => tab.id === guideTab!.id)).toBe(false);
  });

  it("forwards native folder tree changes while watching an opened markdown file", async () => {
    const onMarkdownTreeChange = vi.fn();
    let emitTreeChange: (path: string) => unknown = () => {};
    mockedOpenNativeMarkdownPath.mockResolvedValueOnce({
      kind: "file",
      file: {
        content: "# First file",
        name: "first.md",
        path: "/mock-files/first.md"
      }
    });
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, _onChange, onTreeChange) => {
      emitTreeChange = (path) => onTreeChange?.(path);
      return () => {};
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onMarkdownTreeChange,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    await act(async () => {
      emitTreeChange("/mock-files/assets/pasted-image.png");
    });

    expect(onMarkdownTreeChange).toHaveBeenCalledWith("/mock-files/assets/pasted-image.png");
  });

  it("clears a deleted active tree file without turning its content into an unsaved draft", async () => {
    let editorMarkdown = "";
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedOpenNativeMarkdownPath.mockResolvedValueOnce({
      kind: "file",
      file: {
        content: "# Test 1",
        name: "test1.md",
        path: "/mock-files/test1.md"
      }
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Test 2",
      name: "test2.md",
      path: "/mock-files/test2.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openMarkdownFile();
    });

    editorMarkdown = "# Test 1\n\nDraft";
    act(() => {
      result.current.handleMarkdownChange(editorMarkdown);
    });

    act(() => {
      expect(result.current.detachDeletedDocumentFile("/mock-files/test1.md")).toBe(true);
    });

    expect(result.current.document).toMatchObject({
      content: "",
      dirty: false,
      name: "",
      open: false,
      path: null
    });

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "test2.md",
        path: "/mock-files/test2.md",
        relativePath: "test2.md"
      });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.document).toMatchObject({
      content: "# Test 2",
      dirty: false,
      name: "test2.md",
      open: true,
      path: "/mock-files/test2.md"
    });
  });

  it("clears an active tree file when its containing folder is deleted", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Nested guide",
      name: "guide.md",
      path: "/mock-files/docs/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/docs/guide.md",
        relativePath: "docs/guide.md"
      });
    });

    act(() => {
      expect(result.current.detachDeletedDocumentFile("/mock-files/docs")).toBe(true);
    });

    expect(result.current.document).toMatchObject({
      content: "",
      dirty: false,
      name: "",
      open: false,
      path: null
    });
  });
});
