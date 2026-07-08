import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarkdownDocument } from "./useMarkdownDocument";
import {
  destroyNativeWindow,
  listNativeEditorWindowRestoreStates,
  openNativeMarkdownFileInNewWindow,
  openNativeMarkdownPath,
  readNativeMarkdownFile,
  saveNativeMarkdownFile,
  exitNativeApp,
  listenNativeAppExitRequested,
  listenNativeWindowCloseRequested,
  setNativeEditorWindowRestoreState,
  watchNativeMarkdownFile
} from "../lib/tauri";
import {
  clearStoredRecentMarkdownFiles,
  consumeWelcomeDocumentState,
  getStoredRecentMarkdownFiles,
  getStoredWorkspaceState,
  removeStoredRecentMarkdownFile,
  saveStoredRecentMarkdownFile,
  saveStoredWorkspaceState
} from "../lib/settings/app-settings";

const markdownHelperMocks = vi.hoisted(() => ({
  getMarkdownOutline: vi.fn((): Array<{ level: number; title: string }> => []),
  getWordCount: vi.fn((): number => 0)
}));

vi.mock("@markra/markdown", () => markdownHelperMocks);

vi.mock("../lib/settings/app-settings", () => ({
  clearStoredRecentMarkdownFiles: vi.fn(async () => {}),
  consumeWelcomeDocumentState: vi.fn(),
  createAiAgentSessionId: vi.fn(() => "session-test"),
  getStoredRecentMarkdownFiles: vi.fn(),
  getStoredWorkspaceState: vi.fn(),
  prependRecentMarkdownFile: vi.fn((files: Array<{ path: string }>, file: { path: string }) => [
    file,
    ...files.filter((item: { path: string }) => item.path !== file.path)
  ].slice(0, 10)),
  removeStoredRecentMarkdownFile: vi.fn(async () => []),
  saveStoredRecentMarkdownFile: vi.fn(async () => []),
  saveStoredWorkspaceState: vi.fn(async () => {})
}));

vi.mock("../lib/tauri", () => ({
  openNativeMarkdownFolderInNewWindow: vi.fn(),
  destroyNativeWindow: vi.fn(),
  listNativeEditorWindowRestoreStates: vi.fn(),
  openNativeMarkdownFileInNewWindow: vi.fn(),
  openNativeMarkdownPath: vi.fn(),
  readNativeMarkdownFile: vi.fn(),
  saveNativeMarkdownFile: vi.fn(),
  exitNativeApp: vi.fn(),
  listenNativeAppExitRequested: vi.fn(),
  listenNativeWindowCloseRequested: vi.fn(),
  setNativeEditorWindowRestoreState: vi.fn(),
  setNativeWindowTitle: vi.fn(),
  watchNativeMarkdownFile: vi.fn()
}));

type MockWindowCloseRequestEvent = {
  preventDefault: () => unknown;
};

const mockedOpenNativeMarkdownFileInNewWindow = vi.mocked(openNativeMarkdownFileInNewWindow);
const mockedDestroyNativeWindow = vi.mocked(destroyNativeWindow);
const mockedListNativeEditorWindowRestoreStates = vi.mocked(listNativeEditorWindowRestoreStates);
const mockedOpenNativeMarkdownPath = vi.mocked(openNativeMarkdownPath);
const mockedReadNativeMarkdownFile = vi.mocked(readNativeMarkdownFile);
const mockedSaveNativeMarkdownFile = vi.mocked(saveNativeMarkdownFile);
const mockedExitNativeApp = vi.mocked(exitNativeApp);
const mockedListenNativeAppExitRequested = vi.mocked(listenNativeAppExitRequested);
const mockedListenNativeWindowCloseRequested = vi.mocked(listenNativeWindowCloseRequested);
const mockedSetNativeEditorWindowRestoreState = vi.mocked(setNativeEditorWindowRestoreState);
const mockedWatchNativeMarkdownFile = vi.mocked(watchNativeMarkdownFile);
const mockedClearStoredRecentMarkdownFiles = vi.mocked(clearStoredRecentMarkdownFiles);
const mockedConsumeWelcomeDocumentState = vi.mocked(consumeWelcomeDocumentState);
const mockedGetStoredRecentMarkdownFiles = vi.mocked(getStoredRecentMarkdownFiles);
const mockedGetStoredWorkspaceState = vi.mocked(getStoredWorkspaceState);
const mockedRemoveStoredRecentMarkdownFile = vi.mocked(removeStoredRecentMarkdownFile);
const mockedSaveStoredRecentMarkdownFile = vi.mocked(saveStoredRecentMarkdownFile);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);
type NativeMarkdownFileResult = Awaited<ReturnType<typeof readNativeMarkdownFile>>;

function createDeferredNativeMarkdownFile() {
  let resolve!: (file: NativeMarkdownFileResult) => undefined;
  const promise = new Promise<NativeMarkdownFileResult>((resolvePromise) => {
    resolve = (file) => {
      resolvePromise(file);
      return undefined;
    };
  });

  return { promise, resolve };
}

describe("useMarkdownDocument", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    mockedDestroyNativeWindow.mockReset();
    mockedListNativeEditorWindowRestoreStates.mockReset();
    mockedOpenNativeMarkdownPath.mockReset();
    mockedOpenNativeMarkdownFileInNewWindow.mockReset();
    mockedReadNativeMarkdownFile.mockReset();
    mockedSaveNativeMarkdownFile.mockReset();
    mockedExitNativeApp.mockReset();
    mockedListenNativeAppExitRequested.mockReset();
    mockedListenNativeWindowCloseRequested.mockReset();
    mockedSetNativeEditorWindowRestoreState.mockReset();
    mockedWatchNativeMarkdownFile.mockReset();
    mockedClearStoredRecentMarkdownFiles.mockReset();
    mockedConsumeWelcomeDocumentState.mockReset();
    mockedGetStoredRecentMarkdownFiles.mockReset();
    mockedGetStoredWorkspaceState.mockReset();
    mockedRemoveStoredRecentMarkdownFile.mockReset();
    mockedSaveStoredRecentMarkdownFile.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    markdownHelperMocks.getMarkdownOutline.mockReset();
    markdownHelperMocks.getMarkdownOutline.mockReturnValue([]);
    markdownHelperMocks.getWordCount.mockReset();
    markdownHelperMocks.getWordCount.mockReturnValue(0);
    mockedWatchNativeMarkdownFile.mockResolvedValue(() => {});
    mockedClearStoredRecentMarkdownFiles.mockResolvedValue(undefined);
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredRecentMarkdownFiles.mockResolvedValue([]);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: null,
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: []
    });
    mockedRemoveStoredRecentMarkdownFile.mockResolvedValue([]);
    mockedSaveStoredRecentMarkdownFile.mockResolvedValue([]);
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "saved.md",
      path: "/mock-files/saved.md"
    });
    mockedDestroyNativeWindow.mockResolvedValue(undefined);
    mockedListNativeEditorWindowRestoreStates.mockResolvedValue([]);
    mockedExitNativeApp.mockResolvedValue(undefined);
    mockedListenNativeAppExitRequested.mockResolvedValue(() => {});
    mockedListenNativeWindowCloseRequested.mockResolvedValue(() => {});
    mockedSetNativeEditorWindowRestoreState.mockResolvedValue(undefined);
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

  it("does not ask to discard a clean file when the visual editor tightens loose list spacing", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorMarkdown = [
      "# Guide",
      "",
      "- First point.",
      "",
      "- Second point."
    ].join("\n");
    const visualMarkdown = [
      "# Guide",
      "",
      "- First point.",
      "- Second point."
    ].join("\n");
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: editorMarkdown,
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });

    editorMarkdown = visualMarkdown;
    act(() => {
      result.current.handleMarkdownChange(visualMarkdown, { surface: "visual" });
    });

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
    expect(result.current.document).toMatchObject({
      content: visualMarkdown,
      dirty: false,
      name: "guide.md"
    });
  });

  it("does not ask to discard a clean file when the visual editor escapes intraword underscores", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorMarkdown = "Token sequence x_1 reaches x_T.";
    const visualMarkdown = "Token sequence x\\_1 reaches x\\_T.";
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: editorMarkdown,
      name: "tokens.md",
      path: "/mock-files/tokens.md"
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "tokens.md",
        path: "/mock-files/tokens.md",
        relativePath: "tokens.md"
      });
    });

    editorMarkdown = visualMarkdown;
    act(() => {
      result.current.handleMarkdownChange(visualMarkdown, { surface: "visual" });
    });

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
    expect(result.current.document).toMatchObject({
      content: visualMarkdown,
      dirty: false,
      name: "tokens.md"
    });
  });

  it("uses fallback markdown equivalence before treating a live editor mismatch as unsaved", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorMarkdown = "Workspace user_info entry.";
    const visualMarkdown = "Workspace user\\_info entry.";
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: editorMarkdown,
      name: "workspace.md",
      path: "/mock-files/workspace.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: () => false,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "workspace.md",
        path: "/mock-files/workspace.md",
        relativePath: "workspace.md"
      });
    });

    editorMarkdown = visualMarkdown;
    act(() => {
      result.current.handleMarkdownChange(visualMarkdown, { surface: "visual" });
    });

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
    expect(result.current.document).toMatchObject({
      content: visualMarkdown,
      dirty: false,
      name: "workspace.md"
    });
  });

  it("uses a clean visual baseline when checking close prompts", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorMarkdown = "Serialized clean baseline.";
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "Original clean source.",
      name: "baseline.md",
      path: "/mock-files/baseline.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: () => false,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "baseline.md",
        path: "/mock-files/baseline.md",
        relativePath: "baseline.md"
      });
    });

    act(() => {
      result.current.rememberMarkdownTabVisualBaseline(result.current.activeTabId!, editorMarkdown);
    });

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));

    editorMarkdown = "User edited content.";
    act(() => {
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });

    await act(async () => {
      const canDiscard = await result.current.confirmCanDiscardCurrentDocument();
      expect(canDiscard).toBe(false);
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "baseline.md" }));
  });

  it("clears a clean visual baseline after an undoable disk reload", async () => {
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });
    mockedReadNativeMarkdownFile
      .mockResolvedValueOnce({
        content: "Original clean source.",
        name: "baseline.md",
        path: "/mock-files/baseline.md"
      })
      .mockResolvedValueOnce({
        content: "Changed on disk.",
        name: "baseline.md",
        path: "/mock-files/baseline.md"
      });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onActiveDiskFileContentChange: () => true,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "baseline.md",
        path: "/mock-files/baseline.md",
        relativePath: "baseline.md"
      });
    });
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalled());

    act(() => {
      result.current.rememberMarkdownTabVisualBaseline(result.current.activeTabId!, "Original clean source.");
    });
    await act(async () => {
      await emitExternalChange("/mock-files/baseline.md");
    });

    act(() => {
      result.current.handleMarkdownChange("Original clean source.", { surface: "visual" });
    });

    expect(result.current.document).toMatchObject({
      content: "Original clean source.",
      dirty: true,
      name: "baseline.md"
    });
  });

  it("keeps source edits dirty even when markdown renders equivalently", async () => {
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "Source token x_p.",
      name: "source.md",
      path: "/mock-files/source.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        isCurrentMarkdownEquivalent: () => false,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "source.md",
        path: "/mock-files/source.md",
        relativePath: "source.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("Source token x\\_p.", { surface: "source" });
    });

    expect(result.current.document).toMatchObject({
      content: "Source token x\\_p.",
      dirty: true,
      name: "source.md"
    });

    await act(async () => {
      const canDiscard = await result.current.confirmCanDiscardCurrentDocument();
      expect(canDiscard).toBe(false);
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "source.md" }));
  });

  it("does not ask to discard a clean file when the visual editor tightens callout list spacing", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorMarkdown = [
      "> [!NOTE]",
      ">",
      "> - First point.",
      ">",
      "> - Second point."
    ].join("\n");
    const visualMarkdown = [
      "> [!NOTE]",
      ">",
      "> - First point.",
      "> - Second point."
    ].join("\n");
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: editorMarkdown,
      name: "callout.md",
      path: "/mock-files/callout.md"
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "callout.md",
        path: "/mock-files/callout.md",
        relativePath: "callout.md"
      });
    });

    editorMarkdown = visualMarkdown;
    act(() => {
      result.current.handleMarkdownChange(visualMarkdown, { surface: "visual" });
    });

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
    expect(result.current.document).toMatchObject({
      content: visualMarkdown,
      dirty: false,
      name: "callout.md"
    });
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

  it("uses native file size metadata to skip expensive large document summaries", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Big file\n\nSynthetic content.",
      name: "big.md",
      path: "/mock-files/big.md",
      sizeBytes: 1_000_001
    } as Awaited<ReturnType<typeof readNativeMarkdownFile>>);
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );
    markdownHelperMocks.getMarkdownOutline.mockClear();
    markdownHelperMocks.getWordCount.mockClear();

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "big.md",
        path: "/mock-files/big.md",
        relativePath: "big.md"
      });
    });

    expect(result.current.document).toMatchObject({
      name: "big.md",
      sizeBytes: 1_000_001
    });
    expect(result.current.outlineItems).toEqual([]);
    expect(result.current.wordCount).toBe(0);
    expect(markdownHelperMocks.getMarkdownOutline).not.toHaveBeenCalled();
    expect(markdownHelperMocks.getWordCount).not.toHaveBeenCalled();
  });

  it("moves an existing recent file to the top when reopening it", async () => {
    const recentFiles = [
      { name: "guide.md", path: "/mock-files/guide.md" },
      { name: "notes.md", path: "/mock-files/notes.md" }
    ];
    mockedGetStoredRecentMarkdownFiles.mockResolvedValue(recentFiles);
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Notes",
      name: "notes.md",
      path: "/mock-files/notes.md"
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

    await waitFor(() => expect(result.current.recentFiles).toEqual(recentFiles));
    mockedSaveStoredRecentMarkdownFile.mockClear();

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      });
    });

    expect(result.current.recentFiles).toEqual([
      { name: "notes.md", path: "/mock-files/notes.md" },
      { name: "guide.md", path: "/mock-files/guide.md" }
    ]);
    expect(mockedSaveStoredRecentMarkdownFile).toHaveBeenCalledWith({
      name: "notes.md",
      path: "/mock-files/notes.md"
    });
  });

  it("defers medium document summaries until idle time", async () => {
    const mediumContent = "# Medium file\n\nSynthetic content.";
    const outlineItems = [{ level: 1, title: "Medium file" }];
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: mediumContent,
      name: "medium.md",
      path: "/mock-files/medium.md",
      sizeBytes: 300_000
    } as Awaited<ReturnType<typeof readNativeMarkdownFile>>);
    markdownHelperMocks.getMarkdownOutline.mockReturnValue(outlineItems);
    markdownHelperMocks.getWordCount.mockReturnValue(4);
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );
    markdownHelperMocks.getMarkdownOutline.mockClear();
    markdownHelperMocks.getWordCount.mockClear();

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "medium.md",
        path: "/mock-files/medium.md",
        relativePath: "medium.md"
      });
    });

    expect(result.current.outlineItems).toEqual([]);
    expect(result.current.wordCount).toBe(0);
    expect(markdownHelperMocks.getMarkdownOutline).not.toHaveBeenCalled();
    expect(markdownHelperMocks.getWordCount).not.toHaveBeenCalled();

    await waitFor(() => expect(markdownHelperMocks.getMarkdownOutline).toHaveBeenCalledWith(mediumContent));

    expect(markdownHelperMocks.getWordCount).toHaveBeenCalledWith(mediumContent);
    expect(result.current.outlineItems).toEqual(outlineItems);
    expect(result.current.wordCount).toBe(4);
  });

  it("restores historical content into the active document as an unsaved edit", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nCurrent",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    act(() => {
      result.current.restoreDocumentContent("# Guide\n\nEarlier");
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nEarlier",
      dirty: true,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    expect(result.current.tabs).toContainEqual(expect.objectContaining({
      content: "# Guide\n\nEarlier",
      dirty: true,
      name: "guide.md"
    }));
    expect(mockedSaveStoredWorkspaceState).toHaveBeenLastCalledWith(expect.objectContaining({
      draftTabs: [
        expect.objectContaining({
          content: "# Guide\n\nEarlier",
          name: "guide.md",
          path: "/mock-files/guide.md"
        })
      ]
    }));
  });

  it("ignores stale editor changes emitted after restoring historical content", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nCurrent",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    const staleEditorRevision = result.current.document.revision;

    act(() => {
      result.current.restoreDocumentContent("# Guide\n\nEarlier");
    });
    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nCurrent", {
        documentRevision: staleEditorRevision
      });
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nEarlier",
      dirty: true,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("keeps restored history content when a delayed native watcher event reports disk contents", async () => {
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });
    mockedReadNativeMarkdownFile
      .mockResolvedValueOnce({
        content: "# Guide\n\nCurrent",
        name: "guide.md",
        path: "/mock-files/guide.md"
      })
      .mockResolvedValueOnce({
        content: "# Guide\n\nCurrent",
        name: "guide.md",
        path: "/mock-files/guide.md"
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
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalled());

    act(() => {
      result.current.restoreDocumentContent("# Guide\n\nEarlier");
    });
    await act(async () => {
      await emitExternalChange("/mock-files/guide.md");
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nEarlier",
      dirty: true,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("coalesces repeated native watcher file events while a disk read is in flight", async () => {
    const path = "/mock-files/guide.md";
    const firstWatcherRead = createDeferredNativeMarkdownFile();
    const secondWatcherRead = createDeferredNativeMarkdownFile();
    const thirdWatcherRead = createDeferredNativeMarkdownFile();
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });
    mockedReadNativeMarkdownFile
      .mockResolvedValueOnce({
        content: "# Guide\n\nCurrent",
        name: "guide.md",
        path
      })
      .mockReturnValueOnce(firstWatcherRead.promise)
      .mockReturnValueOnce(secondWatcherRead.promise)
      .mockReturnValueOnce(thirdWatcherRead.promise);
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
        path,
        relativePath: "guide.md"
      });
    });
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalled());

    await act(async () => {
      emitExternalChange(path);
      emitExternalChange(path);
      emitExternalChange(path);
      await Promise.resolve();
    });

    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstWatcherRead.resolve({
        content: "# Guide\n\nIntermediate",
        name: "guide.md",
        path
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(mockedReadNativeMarkdownFile).toHaveBeenCalledTimes(3));

    await act(async () => {
      secondWatcherRead.resolve({
        content: "# Guide\n\nLatest",
        name: "guide.md",
        path
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.document.content).toBe("# Guide\n\nLatest"));
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledTimes(3);
  });

  it("does not overwrite the active tab when restored history save resolves after switching tabs", async () => {
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === "/mock-files/guide.md") {
        return {
          content: "# Guide\n\nCurrent",
          name: "guide.md",
          path
        };
      }

      return {
        content: "# Notes\n\nCurrent",
        name: "notes.md",
        path
      };
    });
    let resolveSave: (savedFile: { name: string; path: string }) => unknown = () => {};
    mockedSaveNativeMarkdownFile.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
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
    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      });
    });

    const guideTab = result.current.tabs.find((tab) => tab.name === "guide.md");
    const notesTab = result.current.tabs.find((tab) => tab.name === "notes.md");
    expect(guideTab).toBeTruthy();
    expect(notesTab).toBeTruthy();

    act(() => {
      result.current.selectMarkdownTab(guideTab!.id);
    });
    act(() => {
      result.current.restoreDocumentContent("# Guide\n\nEarlier");
    });
    const savePromise = result.current.saveCurrentDocumentContent("# Guide\n\nEarlier", {
      historyCursorId: "history-guide",
      skipHistorySnapshot: true
    });

    act(() => {
      result.current.selectMarkdownTab(notesTab!.id);
    });
    await act(async () => {
      resolveSave({
        name: "guide.md",
        path: "/mock-files/guide.md"
      });
      await savePromise;
    });

    expect(result.current.document).toMatchObject({
      content: "# Notes\n\nCurrent",
      dirty: false,
      name: "notes.md",
      path: "/mock-files/notes.md"
    });
    expect(result.current.tabs.find((tab) => tab.id === guideTab!.id)).toMatchObject({
      content: "# Guide\n\nEarlier",
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("keeps later edits dirty when restored history save resolves after more typing", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nCurrent",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    let resolveSave: (savedFile: { name: string; path: string }) => unknown = () => {};
    mockedSaveNativeMarkdownFile.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
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

    act(() => {
      result.current.restoreDocumentContent("# Guide\n\nEarlier");
    });
    const savePromise = result.current.saveCurrentDocumentContent("# Guide\n\nEarlier", {
      historyCursorId: "history-guide",
      skipHistorySnapshot: true
    });
    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nEarlier\n\nNew edit");
    });
    await act(async () => {
      resolveSave({
        name: "guide.md",
        path: "/mock-files/guide.md"
      });
      await savePromise;
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nEarlier\n\nNew edit",
      dirty: true,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("clears dirty state when save resolves after equivalent visual serialization", async () => {
    let editorMarkdown = "# Guide\n\nSaved";
    let resolveSave: (savedFile: { name: string; path: string }) => unknown = () => {};
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    mockedSaveNativeMarkdownFile.mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) =>
          markdown === editorMarkdown ||
          (markdown === "# Guide\n\nSaved" && editorMarkdown === "Guide\n=====\n\nSaved"),
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
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });
    const savePromise = result.current.saveCurrentDocument();
    act(() => {
      editorMarkdown = "Guide\n=====\n\nSaved";
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });
    await act(async () => {
      resolveSave({
        name: "guide.md",
        path: "/mock-files/guide.md"
      });
      await savePromise;
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nSaved",
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
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

  it("keeps a visual editor tab available after opening a folder with document tabs disabled", async () => {
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nSynthetic content",
      name: "guide.md",
      path: "/mock-files/vault/docs/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: false,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    act(() => {
      result.current.clearOpenDocument({ persistWorkspace: false });
    });

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/vault/docs/guide.md",
        relativePath: "docs/guide.md"
      });
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nSynthetic content",
      name: "guide.md",
      path: "/mock-files/vault/docs/guide.md"
    });
    expect(result.current.activeTabId).toBe("file:/mock-files/vault/docs/guide.md");
    expect(result.current.tabs).toEqual([
      expect.objectContaining({
        content: "# Guide\n\nSynthetic content",
        id: "file:/mock-files/vault/docs/guide.md",
        name: "guide.md",
        path: "/mock-files/vault/docs/guide.md"
      })
    ]);
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

  it("prevents native window close when dirty document discard is cancelled", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

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

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("allows native window close when dirty document discard is confirmed", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

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

    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
  });

  it("keeps the native window open until the latest clean tab workspace state is persisted", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    const filePath = "/mock-files/guide.md";
    let resolveWorkspaceSave!: () => undefined;
    const workspaceSavePromise = new Promise<undefined>((resolve) => {
      resolveWorkspaceSave = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedSaveStoredWorkspaceState.mockImplementation(async (patch) => {
      if (patch.filePath === filePath && patch.openFilePaths?.includes(filePath)) {
        return workspaceSavePromise;
      }

      return undefined;
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide",
      name: "guide.md",
      path: filePath
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

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: filePath,
        relativePath: "guide.md"
      });
    });

    let closeResolved = false;
    const preventDefault = vi.fn();
    const registeredCloseRequestHandler = closeRequestHandler as ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null;
    if (!registeredCloseRequestHandler) throw new Error("native close request handler was not registered");
    const closePromise = Promise.resolve(registeredCloseRequestHandler({ preventDefault })).then(() => {
      closeResolved = true;
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(closeResolved).toBe(false);
    expect(mockedDestroyNativeWindow).not.toHaveBeenCalled();

    await act(async () => {
      resolveWorkspaceSave();
      await closePromise;
    });

    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
  });

  it("returns from native close requests without waiting for the programmatic close to settle", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let settleNativeClose!: () => undefined;
    const nativeClosePromise = new Promise<undefined>((resolve) => {
      settleNativeClose = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedDestroyNativeWindow.mockReturnValue(nativeClosePromise);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    let closeRequestResolved = false;
    const preventDefault = vi.fn();
    const registeredCloseRequestHandler = closeRequestHandler as ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null;
    if (!registeredCloseRequestHandler) throw new Error("native close request handler was not registered");
    const closeRequestPromise = Promise.resolve(registeredCloseRequestHandler({ preventDefault })).then(() => {
      closeRequestResolved = true;
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(closeRequestResolved).toBe(true));
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));

    settleNativeClose();
    await closeRequestPromise;
  });

  it("waits for dirty draft persistence before allowing native window close", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    const editorMarkdown = "# Scratch\n\nClose draft.";
    let resolveWorkspaceSave!: () => undefined;
    const workspaceSavePromise = new Promise<undefined>((resolve) => {
      resolveWorkspaceSave = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedSaveStoredWorkspaceState.mockImplementation(async (patch) => {
      if (patch.draftTabs?.some((draft) => draft.content === editorMarkdown)) {
        return workspaceSavePromise;
      }

      return undefined;
    });
    renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    let closeResolved = false;
    const preventDefault = vi.fn();
    const registeredCloseRequestHandler = closeRequestHandler as ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null;
    if (!registeredCloseRequestHandler) throw new Error("native close request handler was not registered");
    const closePromise = Promise.resolve(registeredCloseRequestHandler({ preventDefault })).then(() => {
      closeResolved = true;
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(closeResolved).toBe(false);

    await act(async () => {
      resolveWorkspaceSave();
      await closePromise;
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
  });

  it("prompts before web unload when the editor has unsaved markdown", () => {
    const editorMarkdown = "# Scratch\n\nUnsaved web draft.";
    renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );
    mockedSaveStoredWorkspaceState.mockClear();

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      activeDraftId: "untitled:0",
      draftTabs: [
        {
          content: editorMarkdown,
          id: "untitled:0",
          name: "Untitled.md",
          path: null
        }
      ]
    });
  });

  it("keeps the app open when native app exit discard is cancelled", async () => {
    let appExitHandler: (() => unknown | Promise<unknown>) | null = null;
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeAppExitRequested.mockImplementation(async (handler) => {
      appExitHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    await waitFor(() => expect(mockedListenNativeAppExitRequested).toHaveBeenCalled());

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
      if (!appExitHandler) throw new Error("native app exit handler was not registered");
      await appExitHandler();
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(mockedExitNativeApp).not.toHaveBeenCalled();
  });

  it("exits the app when native app exit discard is confirmed", async () => {
    let appExitHandler: (() => unknown | Promise<unknown>) | null = null;
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedListenNativeAppExitRequested.mockImplementation(async (handler) => {
      appExitHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
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

    await waitFor(() => expect(mockedListenNativeAppExitRequested).toHaveBeenCalled());

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
      if (!appExitHandler) throw new Error("native app exit handler was not registered");
      await appExitHandler();
    });

    expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.md" }));
    expect(mockedExitNativeApp).toHaveBeenCalledTimes(1);
  });

  it("persists native editor window restore snapshots before exiting the app", async () => {
    let appExitHandler: (() => unknown | Promise<unknown>) | null = null;
    const openWindows = [
      {
        filePath: "/mock-files/secondary.md",
        label: "markra-editor-1",
        openFilePaths: ["/mock-files/secondary.md"]
      }
    ];
    mockedListenNativeAppExitRequested.mockImplementation(async (handler) => {
      appExitHandler = handler;
      return () => {};
    });
    mockedListNativeEditorWindowRestoreStates.mockResolvedValue(openWindows);
    renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeAppExitRequested).toHaveBeenCalled());

    await act(async () => {
      if (!appExitHandler) throw new Error("native app exit handler was not registered");
      await appExitHandler();
    });

    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({ openWindows });
    expect(mockedExitNativeApp).toHaveBeenCalledTimes(1);
  });

  it("waits for dirty draft persistence before exiting the native app", async () => {
    let appExitHandler: (() => unknown | Promise<unknown>) | null = null;
    const editorMarkdown = "# Scratch\n\nExit draft.";
    let resolveWorkspaceSave!: () => undefined;
    const workspaceSavePromise = new Promise<undefined>((resolve) => {
      resolveWorkspaceSave = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedListenNativeAppExitRequested.mockImplementation(async (handler) => {
      appExitHandler = handler;
      return () => {};
    });
    mockedSaveStoredWorkspaceState.mockImplementation(async (patch) => {
      if (patch.draftTabs?.some((draft) => draft.content === editorMarkdown)) {
        return workspaceSavePromise;
      }

      return undefined;
    });
    renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeAppExitRequested).toHaveBeenCalled());

    let exitResolved = false;
    const registeredAppExitHandler = appExitHandler as (() => unknown | Promise<unknown>) | null;
    if (!registeredAppExitHandler) throw new Error("native app exit handler was not registered");
    const exitPromise = Promise.resolve(registeredAppExitHandler()).then(() => {
      exitResolved = true;
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(exitResolved).toBe(false);
    expect(mockedExitNativeApp).not.toHaveBeenCalled();

    await act(async () => {
      resolveWorkspaceSave();
      await exitPromise;
    });

    expect(mockedExitNativeApp).toHaveBeenCalledTimes(1);
  });

  it("waits for native app exit work before exiting the app", async () => {
    let appExitHandler: (() => unknown | Promise<unknown>) | null = null;
    let finishBeforeExit: (() => unknown) | null = null;
    const beforeNativeAppExit = vi.fn(() => new Promise<undefined>((resolve) => {
      finishBeforeExit = () => resolve(undefined);
    }));
    mockedListenNativeAppExitRequested.mockImplementation(async (handler) => {
      appExitHandler = handler;
      return () => {};
    });

    renderHook(() =>
      useMarkdownDocument({
        beforeNativeAppExit,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeAppExitRequested).toHaveBeenCalled());

    const registeredAppExitHandler = appExitHandler as (() => unknown | Promise<unknown>) | null;
    if (!registeredAppExitHandler) throw new Error("native app exit handler was not registered");
    const exitPromise = registeredAppExitHandler();

    await waitFor(() => expect(beforeNativeAppExit).toHaveBeenCalledTimes(1));
    expect(mockedExitNativeApp).not.toHaveBeenCalled();

    await act(async () => {
      if (!finishBeforeExit) throw new Error("native app exit work was not started");
      finishBeforeExit();
      await exitPromise;
    });

    expect(mockedExitNativeApp).toHaveBeenCalledTimes(1);
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

  it("marks an externally deleted active document tab without closing it", async () => {
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};
    let deletedExternally = false;
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (deletedExternally) throw new Error("No such file or directory");

      return {
        content: "# Guide",
        name: "guide.md",
        path
      };
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
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalled());
    const activeTabId = result.current.activeTabId;

    deletedExternally = true;
    await act(async () => {
      await emitExternalChange("/mock-files/guide.md");
    });

    expect(result.current.activeTabId).toBe(activeTabId);
    expect(result.current.document).toMatchObject({
      deleted: true,
      name: "guide.md",
      open: true,
      path: "/mock-files/guide.md"
    });
    expect(result.current.tabs).toMatchObject([
      {
        deleted: true,
        name: "guide.md",
        path: "/mock-files/guide.md"
      }
    ]);
  });

  it("saves an externally deleted active document through a new target path", async () => {
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};
    let deletedExternally = false;
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (deletedExternally) throw new Error("No such file or directory");

      return {
        content: "# Guide",
        name: "guide.md",
        path
      };
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "guide-restored.md",
      path: "/mock-files/restored/guide-restored.md"
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
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalled());

    deletedExternally = true;
    await act(async () => {
      await emitExternalChange("/mock-files/guide.md");
    });
    mockedSaveNativeMarkdownFile.mockClear();

    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
      contents: "# Guide",
      path: null,
      suggestedName: "guide.md"
    }));
    expect(result.current.document).toMatchObject({
      deleted: false,
      name: "guide-restored.md",
      path: "/mock-files/restored/guide-restored.md"
    });
  });

  it("updates open tree document paths when their containing folder is moved", async () => {
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => ({
      content: path.endsWith("guide.md") ? "# Guide" : "# Notes",
      name: path.endsWith("guide.md") ? "guide.md" : "notes.md",
      path
    }));
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
        path: "/mock-files/docs/guide.md",
        relativePath: "docs/guide.md"
      });
    });
    await act(async () => {
      await result.current.openTreeMarkdownFileInBackground({
        name: "notes.md",
        path: "/mock-files/docs/notes.md",
        relativePath: "docs/notes.md"
      });
    });

    act(() => {
      expect(result.current.replaceMovedOpenDocumentFile("/mock-files/docs", {
        kind: "folder",
        name: "docs",
        path: "/mock-files/archive/docs",
        relativePath: "archive/docs"
      })).toBe(true);
    });

    expect(result.current.document).toMatchObject({
      name: "guide.md",
      path: "/mock-files/archive/docs/guide.md"
    });
    expect(result.current.tabs.map((tab) => tab.path)).toEqual([
      "/mock-files/archive/docs/guide.md",
      "/mock-files/archive/docs/notes.md"
    ]);
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
        true,
        true
      )
    );
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        fileTreeOpen: false,
        folderName: null,
        folderPath: null
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

  it("keeps a blank document when the restored folder and files no longer open", async () => {
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
        folderPath: null
      })
    );

    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(notesPath);
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

  it("restores saved files when the saved folder root no longer opens", async () => {
    const guidePath = "/mock-files/metadata-root/guide.md";
    const notesPath = "/mock-files/metadata-root/notes.md";
    const onTreeRootFromFilePath = vi.fn();
    const onTreeRootFromFolderPath = vi.fn(async () => null);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-skipped-folder-tabs",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "metadata-root",
      folderPath: "/mock-files/metadata-root",
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
        onTreeRootFromFilePath,
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
    expect(onTreeRootFromFolderPath).toHaveBeenCalledWith(
      "/mock-files/metadata-root",
      "metadata-root",
      "session-skipped-folder-tabs",
      false,
      true
    );
    expect(onTreeRootFromFilePath).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      fileTreeOpen: false,
      folderName: null,
      folderPath: null
    });
  });

  it("restores saved files without waiting for the saved folder root to finish opening", async () => {
    const guidePath = "/mock-files/slow-root/guide.md";
    const notesPath = "/mock-files/slow-root/notes.md";
    const onTreeRootFromFolderPath = vi.fn(() => new Promise<null>(() => {}));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-slow-folder-tabs",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "slow-root",
      folderPath: "/mock-files/slow-root",
      openFilePaths: [guidePath, notesPath]
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => ({
      content: path === notesPath ? "# Notes" : "# Guide",
      name: path === notesPath ? "notes.md" : "guide.md",
      path
    }));

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
      name: "notes.md",
      path: notesPath
    });
    expect(onTreeRootFromFolderPath).toHaveBeenCalledWith(
      "/mock-files/slow-root",
      "slow-root",
      "session-slow-folder-tabs",
      false,
      true
    );
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
    expect(onTreeRootFromFolderPath).toHaveBeenCalledWith("/mock-files/vault", "vault", "session-tabs", false, true);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(notesPath);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("prefers the current window tabs over a stale update-restart snapshot", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    const notesPath = "/mock-files/vault/notes.md";
    const stalePath = "/mock-files/vault/stale.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-current-tabs",
      filePath: notesPath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [guidePath, notesPath],
      openWindows: [
        {
          filePath: stalePath,
          label: "main",
          openFilePaths: [stalePath]
        }
      ]
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide",
          name: "guide.md",
          path
        };
      }
      if (path === notesPath) {
        return {
          content: "# Notes",
          name: "notes.md",
          path
        };
      }

      return {
        content: "# Stale",
        name: "stale.md",
        path
      };
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() => expect(result.current.tabs.map((tab) => tab.name)).toEqual(["guide.md", "notes.md"]));

    expect(result.current.document).toMatchObject({
      content: "# Notes",
      dirty: false,
      name: "notes.md",
      path: notesPath
    });
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(notesPath);
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalledWith(stalePath);
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({ openWindows: [] });
  });

  it("keeps the saved folder root when restoring tabs with the file tree collapsed", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const onTreeRootFromFilePath = vi.fn();
    const onTreeRootFromFolderPath = vi.fn(async () => ({ name: "vault", path: "/mock-files/vault" }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-collapsed-tree",
      filePath: guidePath,
      fileTreeOpen: false,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [guidePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide",
      name: "guide.md",
      path: guidePath
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath,
        onTreeRootFromFolderPath,
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() => expect(result.current.document.name).toBe("guide.md"));

    expect(onTreeRootFromFolderPath).toHaveBeenCalledWith(
      "/mock-files/vault",
      "vault",
      "session-collapsed-tree",
      false,
      false
    );
    expect(onTreeRootFromFilePath).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith(expect.objectContaining({
      folderName: null,
      folderPath: null
    }));
  });

  it("restores dirty draft tabs from the last workspace", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      activeDraftId: "untitled:1",
      aiAgentSessionId: "session-drafts",
      draftTabs: [
        {
          content: "# Guide\n\nRecovered file edits.",
          id: `file:${guidePath}`,
          name: "guide.md",
          path: guidePath
        },
        {
          content: "# Scratch\n\nRecovered untitled edits.",
          id: "untitled:1",
          name: "Scratch.md",
          path: null
        }
      ],
      filePath: guidePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [guidePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nSaved content.",
      name: "guide.md",
      path: guidePath
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        documentTabsEnabled: true,
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() => expect(result.current.document.name).toBe("Scratch.md"));

    expect(result.current.document).toMatchObject({
      content: "# Scratch\n\nRecovered untitled edits.",
      dirty: true,
      name: "Scratch.md",
      path: null
    });
    expect(result.current.tabs).toEqual([
      expect.objectContaining({
        content: "# Guide\n\nRecovered file edits.",
        dirty: true,
        id: `file:${guidePath}`,
        name: "guide.md",
        path: guidePath
      }),
      expect.objectContaining({
        content: "# Scratch\n\nRecovered untitled edits.",
        dirty: true,
        id: "untitled:1",
        name: "Scratch.md",
        path: null
      })
    ]);
    expect(result.current.activeTabId).toBe("untitled:1");
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("persists dirty untitled drafts as markdown changes", async () => {
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    act(() => {
      result.current.handleMarkdownChange("# Scratch\n\nUnsaved local draft.");
    });

    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      activeDraftId: "untitled:0",
      draftTabs: [
        {
          content: "# Scratch\n\nUnsaved local draft.",
          id: "untitled:0",
          name: "Untitled.md",
          path: null
        }
      ]
    });
  });

  it("keeps an untitled edit visible when save starts before the tab state flushes", async () => {
    const savedPath = "/mock-files/scratch.md";
    const savedContent = "# Scratch\n\nSaved immediately.";
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "scratch.md",
      path: savedPath
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => savedContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      result.current.handleMarkdownChange(savedContent);
      await result.current.saveCurrentDocument();
    });

    expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith({
      contents: savedContent,
      path: null,
      suggestedName: "Untitled.md"
    });
    expect(result.current.document).toMatchObject({
      content: savedContent,
      dirty: false,
      name: "scratch.md",
      path: savedPath
    });
    expect(result.current.tabs).toEqual([
      expect.objectContaining({
        content: savedContent,
        dirty: false,
        name: "scratch.md",
        path: savedPath
      })
    ]);
  });

  it("ignores stale clean editor changes emitted after saving", async () => {
    let editorMarkdown = "# Guide\n\nSaved";
    const confirmDiscardUnsavedChanges = vi.fn(() => true);
    mockedOpenNativeMarkdownPath.mockResolvedValueOnce({
      kind: "file",
      file: {
        content: "# Notes\n\nClean",
        name: "notes.md",
        path: "/mock-files/notes.md"
      }
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
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
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });
    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nOriginal", { surface: "visual" });
    });
    await act(async () => {
      await result.current.openMarkdownFile();
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.document).toMatchObject({
      content: "# Notes\n\nClean",
      dirty: false,
      name: "notes.md",
      path: "/mock-files/notes.md"
    });
  });

  it("does not advance the document revision when saving only clears dirty state", async () => {
    let editorMarkdown = "# Guide\n\nSaved";
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
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
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });

    const revisionBeforeSave = result.current.document.revision;
    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nSaved",
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    expect(result.current.document.revision).toBe(revisionBeforeSave);
  });

  it("does not advance the document revision when saving assigns an untitled document path", async () => {
    const editorMarkdown = "# Scratch\n\nSaved immediately.";
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
      name: "scratch.md",
      path: "/mock-files/scratch.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    act(() => {
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });

    const revisionBeforeSave = result.current.document.revision;
    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    expect(result.current.document).toMatchObject({
      content: editorMarkdown,
      dirty: false,
      name: "scratch.md",
      path: "/mock-files/scratch.md"
    });
    expect(result.current.document.revision).toBe(revisionBeforeSave);
  });

  it("does not advance the document revision when saving fresher editor content", async () => {
    const editorMarkdown = "# Guide\n\nSaved from editor.";
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
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

    const revisionBeforeSave = result.current.document.revision;
    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    expect(result.current.document).toMatchObject({
      content: editorMarkdown,
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    expect(result.current.document.revision).toBe(revisionBeforeSave);
  });

  it("ignores stale clean visual editor contents during native close after saving", async () => {
    let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
    let editorReady = true;
    let editorMarkdown = "# Guide\n\nSaved";
    const confirmDiscardUnsavedChanges = vi.fn(() => false);
    mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
      closeRequestHandler = handler;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValueOnce({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        confirmDiscardUnsavedChanges,
        editorReady: () => editorReady,
        getCurrentMarkdown: () => editorMarkdown,
        isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await waitFor(() => expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled());

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: "/mock-files/guide.md",
        relativePath: "guide.md"
      });
    });
    act(() => {
      result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
    });
    const revisionBeforeSave = result.current.document.revision;
    await act(async () => {
      await result.current.saveCurrentDocument();
    });
    expect(result.current.document.revision).toBe(revisionBeforeSave);

    editorMarkdown = "# Guide\n\nOriginal";
    editorReady = false;
    const preventDefault = vi.fn();
    await act(async () => {
      if (!closeRequestHandler) throw new Error("native close request handler was not registered");
      await closeRequestHandler({ preventDefault });
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1));
    expect(result.current.document).toMatchObject({
      content: "# Guide\n\nSaved",
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("ignores stale clean visual editor changes emitted by an inactive tab after saving", async () => {
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
    mockedSaveNativeMarkdownFile.mockResolvedValueOnce({
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
      result.current.handleMarkdownChange("# Guide\n\nSaved", { surface: "visual" });
    });
    await act(async () => {
      await result.current.saveCurrentDocument();
    });
    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "notes.md",
        path: "/mock-files/notes.md",
        relativePath: "notes.md"
      });
    });

    const guideTab = result.current.tabs.find((tab) => tab.name === "guide.md");
    expect(guideTab).toBeTruthy();

    act(() => {
      result.current.handleMarkdownTabChange(guideTab!.id, "# Guide\n\nOriginal", {
        documentRevision: guideTab!.revision,
        surface: "visual"
      });
    });

    await act(async () => {
      const canDiscard = await result.current.confirmCanDiscardCurrentDocument();
      expect(canDiscard).toBe(true);
    });

    expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
    expect(result.current.tabs.find((tab) => tab.id === guideTab!.id)).toMatchObject({
      content: "# Guide\n\nSaved",
      dirty: false,
      name: "guide.md",
      path: "/mock-files/guide.md"
    });
  });

  it("clears a saved file draft after saving the document", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nSaved content.",
      name: "guide.md",
      path: guidePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "guide.md",
      path: guidePath
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
        path: guidePath,
        relativePath: "guide.md"
      });
    });

    act(() => {
      result.current.handleMarkdownChange("# Guide\n\nUnsaved edits.");
    });

    mockedSaveStoredWorkspaceState.mockClear();

    await act(async () => {
      await result.current.saveCurrentDocument();
    });

    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith(expect.objectContaining({
      activeDraftId: null,
      draftTabs: []
    }));
  });

  it("automatically saves dirty existing files on the configured interval", async () => {
    vi.useFakeTimers();

    try {
      const guidePath = "/mock-files/vault/guide.md";
      let editorMarkdown = "# Guide\n\nOriginal";
      mockedReadNativeMarkdownFile.mockResolvedValue({
        content: "# Guide\n\nOriginal",
        name: "guide.md",
        path: guidePath
      });
      mockedSaveNativeMarkdownFile.mockResolvedValue({
        name: "guide.md",
        path: guidePath
      });
      const { result } = renderHook(() =>
        useMarkdownDocument({
          autoSaveEnabled: true,
          autoSaveIntervalMinutes: 1,
          getCurrentMarkdown: () => editorMarkdown,
          onTreeRootFromFilePath: vi.fn(),
          onTreeRootFromFolderPath: vi.fn(),
          preferencesReady: false,
          restoreWorkspaceOnStartup: false
        })
      );

      await act(async () => {
        await result.current.openTreeMarkdownFile({
          name: "guide.md",
          path: guidePath,
          relativePath: "guide.md"
        });
      });

      mockedSaveNativeMarkdownFile.mockClear();
      editorMarkdown = "# Guide\n\nAutosaved edit.";
      act(() => {
        result.current.handleMarkdownChange(editorMarkdown);
      });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
        contents: editorMarkdown,
        path: guidePath,
        skipHistorySnapshot: true,
        suggestedName: "guide.md"
      }));
      expect(result.current.document).toMatchObject({
        content: editorMarkdown,
        dirty: false,
        name: "guide.md",
        path: guidePath
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows native close after automatic save when the visual editor exposes previous clean content", async () => {
    vi.useFakeTimers();

    try {
      let closeRequestHandler: ((event: MockWindowCloseRequestEvent) => unknown | Promise<unknown>) | null = null;
      const guidePath = "/mock-files/vault/guide.md";
      let editorMarkdown = "# Guide\n\nOriginal";
      const confirmDiscardUnsavedChanges = vi.fn(() => false);
      mockedListenNativeWindowCloseRequested.mockImplementation(async (handler) => {
        closeRequestHandler = handler;
        return () => {};
      });
      mockedReadNativeMarkdownFile.mockResolvedValue({
        content: "# Guide\n\nOriginal",
        name: "guide.md",
        path: guidePath
      });
      mockedSaveNativeMarkdownFile.mockResolvedValue({
        name: "guide.md",
        path: guidePath
      });
      const { result } = renderHook(() =>
        useMarkdownDocument({
          autoSaveEnabled: true,
          autoSaveIntervalMinutes: 1,
          confirmDiscardUnsavedChanges,
          getCurrentMarkdown: () => editorMarkdown,
          isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
          onTreeRootFromFilePath: vi.fn(),
          onTreeRootFromFolderPath: vi.fn(),
          preferencesReady: false,
          restoreWorkspaceOnStartup: false
        })
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedListenNativeWindowCloseRequested).toHaveBeenCalled();

      await act(async () => {
        await result.current.openTreeMarkdownFile({
          name: "guide.md",
          path: guidePath,
          relativePath: "guide.md"
        });
      });

      editorMarkdown = "# Guide\n\nAutosaved edit.";
      act(() => {
        result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
      });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      expect(result.current.document).toMatchObject({
        content: "# Guide\n\nAutosaved edit.",
        dirty: false,
        name: "guide.md",
        path: guidePath
      });

      editorMarkdown = "# Guide\n\nOriginal";
      const preventDefault = vi.fn();
      await act(async () => {
        if (!closeRequestHandler) throw new Error("native close request handler was not registered");
        await closeRequestHandler({ preventDefault });
      });

      expect(confirmDiscardUnsavedChanges).not.toHaveBeenCalled();
      expect(preventDefault).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(0);
        await Promise.resolve();
      });
      expect(mockedDestroyNativeWindow).toHaveBeenCalledTimes(1);
      expect(result.current.document).toMatchObject({
        content: "# Guide\n\nAutosaved edit.",
        dirty: false,
        name: "guide.md",
        path: guidePath
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("prompts after automatic save when the visual editor explicitly changes back to previous content", async () => {
    vi.useFakeTimers();

    try {
      const guidePath = "/mock-files/vault/guide.md";
      const confirmDiscardUnsavedChanges = vi.fn(() => false);
      mockedReadNativeMarkdownFile.mockResolvedValue({
        content: "# Guide\n\nOriginal",
        name: "guide.md",
        path: guidePath
      });
      mockedSaveNativeMarkdownFile.mockResolvedValue({
        name: "guide.md",
        path: guidePath
      });
      const { result } = renderHook(() =>
        useMarkdownDocument({
          autoSaveEnabled: true,
          autoSaveIntervalMinutes: 1,
          confirmDiscardUnsavedChanges,
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
          path: guidePath,
          relativePath: "guide.md"
        });
      });

      act(() => {
        result.current.handleMarkdownChange("# Guide\n\nAutosaved edit.", { surface: "visual" });
      });
      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      act(() => {
        result.current.handleMarkdownChange("# Guide\n\nOriginal", { surface: "visual" });
      });

      await act(async () => {
        const canDiscard = await result.current.confirmCanDiscardCurrentDocument();
        expect(canDiscard).toBe(false);
      });

      expect(confirmDiscardUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({
        content: "# Guide\n\nOriginal",
        dirty: true,
        name: "guide.md",
        path: guidePath
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the clean document state when saving while the visual editor exposes previous clean content", async () => {
    vi.useFakeTimers();

    try {
      const guidePath = "/mock-files/vault/guide.md";
      let editorMarkdown = "# Guide\n\nOriginal";
      mockedReadNativeMarkdownFile.mockResolvedValue({
        content: "# Guide\n\nOriginal",
        name: "guide.md",
        path: guidePath
      });
      mockedSaveNativeMarkdownFile.mockResolvedValue({
        name: "guide.md",
        path: guidePath
      });
      const { result } = renderHook(() =>
        useMarkdownDocument({
          autoSaveEnabled: true,
          autoSaveIntervalMinutes: 1,
          getCurrentMarkdown: () => editorMarkdown,
          isCurrentMarkdownEquivalent: (markdown) => markdown === editorMarkdown,
          onTreeRootFromFilePath: vi.fn(),
          onTreeRootFromFolderPath: vi.fn(),
          preferencesReady: false,
          restoreWorkspaceOnStartup: false
        })
      );

      await act(async () => {
        await result.current.openTreeMarkdownFile({
          name: "guide.md",
          path: guidePath,
          relativePath: "guide.md"
        });
      });

      editorMarkdown = "# Guide\n\nAutosaved edit.";
      act(() => {
        result.current.handleMarkdownChange(editorMarkdown, { surface: "visual" });
      });
      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      mockedSaveNativeMarkdownFile.mockClear();
      editorMarkdown = "# Guide\n\nOriginal";
      await act(async () => {
        await result.current.saveCurrentDocument();
      });

      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
        contents: "# Guide\n\nAutosaved edit.",
        path: guidePath,
        suggestedName: "guide.md"
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not automatically prompt to save untitled documents", async () => {
    vi.useFakeTimers();

    try {
      const editorMarkdown = "# Scratch\n\nUnsaved local draft.";
      const { result } = renderHook(() =>
        useMarkdownDocument({
          autoSaveEnabled: true,
          autoSaveIntervalMinutes: 1,
          getCurrentMarkdown: () => editorMarkdown,
          onTreeRootFromFilePath: vi.fn(),
          onTreeRootFromFolderPath: vi.fn(),
          preferencesReady: false,
          restoreWorkspaceOnStartup: false
        })
      );

      act(() => {
        result.current.handleMarkdownChange(editorMarkdown);
      });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
        await Promise.resolve();
      });

      expect(mockedSaveNativeMarkdownFile).not.toHaveBeenCalled();
      expect(result.current.document).toMatchObject({
        content: editorMarkdown,
        dirty: true,
        name: "Untitled.md",
        path: null
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves dirty existing files when preparing for an update restart", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    let editorMarkdown = "# Guide\n\nOriginal";
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOriginal",
      name: "guide.md",
      path: guidePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "guide.md",
      path: guidePath
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    await act(async () => {
      await result.current.openTreeMarkdownFile({
        name: "guide.md",
        path: guidePath,
        relativePath: "guide.md"
      });
    });

    mockedSaveNativeMarkdownFile.mockClear();
    editorMarkdown = "# Guide\n\nSaved before restart.";
    act(() => {
      result.current.handleMarkdownChange(editorMarkdown);
    });

    await act(async () => {
      await result.current.saveDirtyMarkdownFiles();
    });

    expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
      contents: editorMarkdown,
      path: guidePath,
      skipHistorySnapshot: true,
      suggestedName: "guide.md"
    }));
    expect(result.current.document).toMatchObject({
      content: editorMarkdown,
      dirty: false,
      name: "guide.md",
      path: guidePath
    });
  });

  it("waits for dirty untitled drafts when preparing for an update restart", async () => {
    const editorMarkdown = "# Scratch\n\nUnsaved restart draft.";
    let resolveWorkspaceSave!: () => undefined;
    const workspaceSavePromise = new Promise<undefined>((resolve) => {
      resolveWorkspaceSave = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedSaveStoredWorkspaceState.mockImplementation(async (patch) => {
      if (patch.draftTabs?.some((draft) => draft.content === editorMarkdown)) {
        return workspaceSavePromise;
      }

      return undefined;
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    let prepared = false;
    let preparePromise!: Promise<unknown>;
    act(() => {
      preparePromise = result.current.saveDirtyMarkdownFiles().then(() => {
        prepared = true;
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(prepared).toBe(false);

    await act(async () => {
      resolveWorkspaceSave();
      await preparePromise;
    });

    expect(mockedSaveNativeMarkdownFile).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      activeDraftId: "untitled:0",
      draftTabs: [
        {
          content: editorMarkdown,
          id: "untitled:0",
          name: "Untitled.md",
          path: null
        }
      ]
    });
  });

  it("waits for pending draft persistence before preparing for an update restart", async () => {
    const firstMarkdown = "# Scratch\n\nFirst draft.";
    const latestMarkdown = "# Scratch\n\nLatest restart draft.";
    const savedDraftContents: string[] = [];
    let editorMarkdown = firstMarkdown;
    let resolveFirstWorkspaceSave!: () => undefined;
    const firstWorkspaceSavePromise = new Promise<undefined>((resolve) => {
      resolveFirstWorkspaceSave = () => {
        resolve(undefined);
        return undefined;
      };
    });
    mockedSaveStoredWorkspaceState.mockImplementation(async (patch) => {
      const draftContent = patch.draftTabs?.[0]?.content;
      if (draftContent) savedDraftContents.push(draftContent);
      if (draftContent === firstMarkdown) return firstWorkspaceSavePromise;

      return undefined;
    });
    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: () => editorMarkdown,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: false,
        restoreWorkspaceOnStartup: false
      })
    );

    act(() => {
      result.current.handleMarkdownChange(firstMarkdown);
    });
    await waitFor(() => expect(savedDraftContents).toEqual([firstMarkdown]));

    editorMarkdown = latestMarkdown;
    let prepared = false;
    let preparePromise!: Promise<unknown>;
    act(() => {
      preparePromise = result.current.saveDirtyMarkdownFiles().then(() => {
        prepared = true;
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(prepared).toBe(false);

    await act(async () => {
      resolveFirstWorkspaceSave();
      await preparePromise;
    });

    expect(savedDraftContents.at(-1)).toBe(latestMarkdown);
  });

  it("restores additional editor windows from the saved update-restart snapshot", async () => {
    const firstPath = "/mock-files/vault/first.md";
    const secondPath = "/mock-files/vault/second.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-window-restore",
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [],
      openWindows: [
        {
          filePath: firstPath,
          label: "main",
          openFilePaths: [firstPath]
        },
        {
          filePath: secondPath,
          label: "markra-editor-1",
          openFilePaths: [secondPath]
        }
      ]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# First",
      name: "first.md",
      path: firstPath
    });

    const { result } = renderHook(() =>
      useMarkdownDocument({
        getCurrentMarkdown: (fallbackContent) => fallbackContent,
        onTreeRootFromFilePath: vi.fn(),
        onTreeRootFromFolderPath: vi.fn(),
        preferencesReady: true,
        restoreWorkspaceOnStartup: true
      })
    );

    await waitFor(() => expect(result.current.document.name).toBe("first.md"));

    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(firstPath);
    expect(mockedOpenNativeMarkdownFileInNewWindow).toHaveBeenCalledWith(secondPath);
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({ openWindows: [] });
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("registers the current editor window restore state when a markdown file opens", async () => {
    const filePath = "/mock-files/vault/current.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "file",
      file: {
        content: "# Current",
        name: "current.md",
        path: filePath
      }
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
      await result.current.openMarkdownFile();
    });

    expect(mockedSetNativeEditorWindowRestoreState).toHaveBeenCalledWith({
      filePath,
      openFilePaths: [filePath]
    });
  });
});
