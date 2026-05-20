import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarkdownDocument } from "./useMarkdownDocument";
import {
  openNativeMarkdownPath,
  readNativeMarkdownFile,
  saveNativeMarkdownFile,
  watchNativeMarkdownFile
} from "../lib/tauri";
import {
  consumeWelcomeDocumentState,
  getStoredWorkspaceState,
  saveStoredWorkspaceState
} from "../lib/settings/app-settings";

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
const mockedSaveNativeMarkdownFile = vi.mocked(saveNativeMarkdownFile);
const mockedWatchNativeMarkdownFile = vi.mocked(watchNativeMarkdownFile);
const mockedConsumeWelcomeDocumentState = vi.mocked(consumeWelcomeDocumentState);
const mockedGetStoredWorkspaceState = vi.mocked(getStoredWorkspaceState);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);

describe("useMarkdownDocument", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    mockedOpenNativeMarkdownPath.mockReset();
    mockedReadNativeMarkdownFile.mockReset();
    mockedSaveNativeMarkdownFile.mockReset();
    mockedWatchNativeMarkdownFile.mockReset();
    mockedConsumeWelcomeDocumentState.mockReset();
    mockedGetStoredWorkspaceState.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedWatchNativeMarkdownFile.mockResolvedValue(() => {});
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: null,
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: []
    });
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "saved.md",
      path: "/mock-files/saved.md"
    });
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

  it("opens and saves a background markdown tab without activating it", async () => {
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === "/mock-files/guide.md") {
        return {
          content: "# Guide\n\nClean",
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
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "notes.md",
      path: "/mock-files/notes.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
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

    const backgroundTabId = await act(async () =>
      result.current.openTreeMarkdownFileInBackground({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      })
    );

    expect(backgroundTabId).toBe("file:/mock-files/notes.md");
    expect(result.current.document.name).toBe("guide.md");
    expect(result.current.activeTabId).not.toBe(backgroundTabId);
    expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]);

    act(() => {
      result.current.handleMarkdownTabChange(backgroundTabId!, "# Notes\n\nDraft");
    });

    expect(result.current.tabs.find((tab) => tab.id === backgroundTabId)).toMatchObject({
      content: "# Notes\n\nDraft",
      dirty: true,
      name: "notes.md"
    });

    await act(async () => {
      await result.current.saveMarkdownTab(backgroundTabId!);
    });

    expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith({
      contents: "# Notes\n\nDraft",
      path: "/mock-files/notes.md",
      suggestedName: "notes.md"
    });
    expect(result.current.document.name).toBe("guide.md");
    expect(result.current.tabs.find((tab) => tab.id === backgroundTabId)).toMatchObject({
      dirty: false,
      name: "notes.md",
      path: "/mock-files/notes.md"
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

  it("skips a restored folder workspace when the folder no longer opens", async () => {
    const onTreeRootFromFolderPath = vi.fn(async () => null);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-missing-folder",
      filePath: null,
      fileTreeOpen: true,
      folderName: "notes",
      folderPath: "/mock-files/deleted-notes",
      openFilePaths: []
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath,
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() =>
      expect(onTreeRootFromFolderPath).toHaveBeenCalledWith(
        "/mock-files/deleted-notes",
        "notes",
        "session-missing-folder",
        true
      )
    );
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        fileTreeOpen: false,
        folderName: null,
        folderPath: null,
        openFilePaths: []
      })
    );
    expect(result.current.document).toMatchObject({
      content: "",
      dirty: false,
      name: "Untitled.md",
      open: true,
      path: null
    });
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("does not restore document tabs from a deleted folder workspace", async () => {
    const guidePath = "/mock-files/deleted-notes/guide.md";
    const notesPath = "/mock-files/deleted-notes/notes.md";
    const onTreeRootFromFolderPath = vi.fn(async () => null);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-deleted-folder-tabs",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "deleted-notes",
      folderPath: "/mock-files/deleted-notes",
      openFilePaths: [guidePath, notesPath]
    });
    mockedReadNativeMarkdownFile.mockRejectedValue(new Error("Markdown file no longer exists"));

    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath,
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        fileTreeOpen: false,
        folderName: null,
        folderPath: null,
        openFilePaths: []
      })
    );

    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalled();
    expect(result.current.tabs).toEqual([expect.objectContaining({
      name: "Untitled.md",
      path: null
    })]);
    expect(result.current.document).toMatchObject({
      content: "",
      dirty: false,
      name: "Untitled.md",
      open: true,
      path: null
    });
  });

  it("restores open markdown document tabs from the last workspace", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    const notesPath = "/mock-files/vault/notes.md";
    const onTreeRootFromFolderPath = vi.fn(async () => ({ name: "vault", path: "/mock-files/vault" }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-tabs",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [guidePath, notesPath]
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide",
          name: "guide.md",
          path
        };
      }

      return {
        content: "# Notes",
        name: "notes.md",
        path
      };
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath,
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() => expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]));

    expect(result.current.document).toMatchObject({
      content: "# Notes",
      dirty: false,
      name: "notes.md",
      open: true,
      path: notesPath
    });
    expect(result.current.tabs.map((tab) => tab.path)).toEqual([guidePath, notesPath]);
    expect(result.current.activeTabId).toBe(`file:${notesPath}`);
    expect(onTreeRootFromFolderPath).toHaveBeenCalledWith("/mock-files/vault", "vault", "session-tabs", false);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(notesPath);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });
});
