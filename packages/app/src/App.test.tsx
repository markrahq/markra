import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { redoDepth } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { it as registerTest } from "vitest";
import desktopPackage from "../package.json";
import { defaultAiQuickActionPrompts } from "./lib/ai-actions";
import { defaultExportSettings } from "./lib/settings/app-settings";
import {
  dispatchAiEditorPreviewAction,
  installAppTestHarness,
  mockDroppedPath,
  mockFolderPath,
  mockNativePath,
  mockOpenMarkdownFile,
  mockSystemColorScheme,
  mockUntitledPath,
  mockedCloseNativeWindow,
  mockedConfirmNativeMarkdownFileDelete,
  mockedConfirmNativeUnsavedMarkdownDocumentDiscard,
  mockedConsumeWelcomeDocumentState,
  mockedCreateAiAgentSessionId,
  mockedCreateNativeMarkdownTreeFile,
  mockedCreateNativeMarkdownTreeFolder,
  mockedDetectNativePandocPath,
  mockedCheckNativeAppUpdate,
  mockedHideSettingsWindow,
  mockedImportNativeLocalFile,
  mockedMarkSettingsWindowReady,
  mockedClearStoredRecentMarkdownFiles,
  mockedDeleteNativeMarkdownTreeFile,
  mockedFetchAiProviderModels,
  mockedGetStoredCustomThemeCss,
  mockedGetStoredExportSettings,
  mockedGetStoredEditorPreferences,
  mockedGetStoredLanguage,
  mockedGetStoredRecentMarkdownFiles,
  mockedGetStoredRecentMarkdownFolders,
  mockedGetStoredBackupSettings,
  mockedGetStoredSyncSettings,
  mockedGetStoredThemePreferences,
  mockedGetStoredWorkspaceState,
  mockedInstallNativeApplicationMenu,
  mockedInstallNativeEditorContextMenu,
  mockedInstallNativeMarkdownFileDrop,
  mockedListNativeMarkdownFileHistory,
  mockedLoadNativeMarkdownFilesForPath,
  mockedListNativeMarkdownFilesForPath,
  mockedListenNativeOpenedMarkdownPaths,
  mockedListenAppEditorPreferencesChanged,
  mockedListenAppLanguageChanged,
  mockedListenAppThemeChanged,
  mockedNotifyAppEditorPreferencesChanged,
  mockedNotifyAppBackupSettingsChanged,
  mockedNotifyAppSyncSettingsChanged,
  mockedNotifyAppCustomThemeCssChanged,
  mockedNotifyAppExportSettingsChanged,
  mockedNotifyAppLanguageChanged,
  mockedNotifyAppThemeChanged,
  mockedOpenNativeMarkdownFileInNewWindow,
  mockedOpenNativeLocalImages,
  mockedOpenNativeLocalFiles,
  mockedOpenNativeMarkdownAttachment,
  mockedOpenNativeMarkdownFolder,
  mockedOpenNativeMarkdownFolderInNewWindow,
  mockedOpenNativeMarkdownPath,
  mockedOpenNativeExternalUrl,
  mockedOpenSettingsWindow,
  mockedPrewarmSettingsWindow,
  mockedReadNativeLocalImageFile,
  mockedReadNativeMarkdownFile,
  mockedReadNativeMarkdownFileHistory,
  mockedRemoveStoredRecentMarkdownFolder,
  mockedResetWelcomeDocumentState,
  mockedRenameNativeMarkdownTreeFile,
  mockedResolveDesktopOsVersion,
  mockedResolveDesktopPlatform,
  mockedSaveNativeClipboardImage,
  mockedSaveNativeClipboardAttachment,
  mockedSaveNativeHtmlFile,
  mockedSaveNativeMarkdownBundleFile,
  mockedSaveNativeMarkdownFile,
  mockedSaveNativePandocFile,
  mockedSaveNativePdfFile,
  mockedSearchNativeMarkdownFilesForPath,
  mockedShowNativePandocSetup,
  mockedSyncNativeMarkdownFolder,
  mockedSaveStoredCustomThemeCss,
  mockedSaveStoredAiSettings,
  mockedSaveStoredBackupSettings,
  mockedSaveStoredEditorPreferences,
  mockedSaveStoredExportSettings,
  mockedSaveStoredLanguage,
  mockedSaveStoredRecentMarkdownFile,
  mockedSaveStoredRecentMarkdownFolder,
  mockedSaveStoredThemePreferences,
  mockedSaveStoredWorkspaceState,
  mockedShowNativeMarkdownFileTreeContextMenu,
  mockedShowNativeWindow,
  mockedTakeNativeOpenedMarkdownPaths,
  mockedTestAiProviderConnection,
  mockedWatchNativeMarkdownFile,
  mockedWriteNativeMarkdownTemplateFile,
  renderApp
} from "./test/app-harness";
import {
  clipboardImageSaveFailureDescription,
  clipboardImageSaveFailureMessage,
  refreshImportedAttachmentTree,
  runEditorLinkCommand,
  shouldTriggerDevMockRuntimeError
} from "./App";
import type { NativeMenuHandlers } from "./test/app-harness";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "./runtime";
import { showAppToast } from "./lib/app-toast";
import { createShardedTest } from "./test/shard";

const scheduleMarkdownSourceEditorPreloadMock = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("./components/LazyMarkdownSourceEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/LazyMarkdownSourceEditor")>();

  return {
    ...actual,
    scheduleMarkdownSourceEditorPreload: scheduleMarkdownSourceEditorPreloadMock
  };
});

installAppTestHarness();

// Vitest shards files only, so CI needs a local registration boundary to split this monolithic suite by test title.
const it = createShardedTest(registerTest, process.env.MARKRA_APP_TEST_SHARD);

const defaultFileTreeListOptions = { managedAttachmentFolder: "assets" };

describe("dev mock runtime error preview", () => {
  it("enables the mock runtime error preview only in development with an explicit query param", () => {
    expect(shouldTriggerDevMockRuntimeError("?mockError=1", true)).toBe(true);
    expect(shouldTriggerDevMockRuntimeError("?mockError=true", true)).toBe(false);
    expect(shouldTriggerDevMockRuntimeError("?mockError=1", false)).toBe(false);
  });
});

describe("local attachment tree refresh", () => {
  it("does not reject successful imports when the file tree refresh fails", async () => {
    const refreshTree = vi.fn().mockRejectedValue(new Error("Synthetic tree refresh failure"));

    await expect(refreshImportedAttachmentTree(refreshTree)).resolves.toBeUndefined();

    expect(refreshTree).toHaveBeenCalledTimes(1);
  });
});

async function selectEditorViewMode(optionName: "Preview" | "Source code" | "Preview + Source") {
  const modeOrder = ["Preview", "Source code", "Preview + Source"] as const;
  const currentMode = () => {
    if (screen.queryByRole("button", { name: "Editor view mode: Preview" })) return "Preview";
    if (screen.queryByRole("button", { name: "Editor view mode: Source code" })) return "Source code";
    if (screen.queryByRole("button", { name: "Editor view mode: Preview + Source" })) return "Preview + Source";

    throw new Error("Editor view mode button was not found.");
  };
  const switchSourcePreviewDirectly = async () => {
    const mode = currentMode();
    if (
      !((mode === "Preview" && optionName === "Source code") || (mode === "Source code" && optionName === "Preview"))
    ) return false;

    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers | undefined;
    if (!menuHandlers?.toggleSourceMode) return false;

    await act(async () => {
      await menuHandlers.toggleSourceMode?.();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: `Editor view mode: ${optionName}` })).toBeInTheDocument()
    );
    return true;
  };

  if (await switchSourcePreviewDirectly()) return;

  for (let attempts = 0; attempts < modeOrder.length; attempts += 1) {
    const mode = currentMode();
    if (mode === optionName) return;

    const nextMode = modeOrder[(modeOrder.indexOf(mode) + 1) % modeOrder.length]!;
    fireEvent.click(screen.getByRole("button", { name: `Editor view mode: ${mode}` }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: `Editor view mode: ${nextMode}` })).toBeInTheDocument()
    );
  }

  throw new Error(`Editor view mode did not cycle to ${optionName}.`);
}

const defaultImageUpload = {
  fileNamePattern: "pasted-image-{timestamp}",
  picgo: {
    secret: "",
    serverUrl: ""
  },
  provider: "local" as const,
  s3: {
    accessKeyId: "",
    bucket: "",
    endpointUrl: "",
    publicBaseUrl: "",
    region: "",
    secretAccessKey: "",
    uploadPath: ""
  },
  webdav: {
    password: "",
    publicBaseUrl: "",
    serverUrl: "",
    uploadPath: "",
    username: ""
  }
};

const webKitScrollWorkaroundAttribute = "data-webkit-scroll-workaround";

function createDragDataTransfer() {
  const data = new Map<string, string>();

  return {
    clearData: () => data.clear(),
    dropEffect: "none",
    effectAllowed: "copyMove",
    files: [] as File[],
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value),
    setDragImage: vi.fn()
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element,
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

function mockElementFromPoint(element: Element) {
  const mock = vi.fn(() => element);

  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: mock
  });

  return mock;
}

function mockWindowInnerWidth(width: number) {
  const descriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");

  act(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width
    });
    window.dispatchEvent(new Event("resize"));
  });

  return () => {
    act(() => {
      if (descriptor) Object.defineProperty(window, "innerWidth", descriptor);
      window.dispatchEvent(new Event("resize"));
    });
  };
}

function getMarkdownSourceView(sourceEditor: HTMLElement) {
  const view = EditorView.findFromDOM(sourceEditor);
  if (!view) {
    throw new Error("Expected the markdown source editor to use CodeMirror.");
  }

  return view;
}

function readMarkdownSource(sourceEditor: HTMLElement) {
  return getMarkdownSourceView(sourceEditor).state.doc.toString();
}

function replaceMarkdownSource(sourceEditor: HTMLElement, value: string) {
  const view = getMarkdownSourceView(sourceEditor);

  act(() => {
    view.dispatch({
      changes: {
        from: 0,
        insert: value,
        to: view.state.doc.length
      }
    });
  });
}

function typeVisualText(view: EditorView, text: string) {
  act(() => {
    for (const char of text) {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, insert: char, to },
        selection: EditorSelection.cursor(from + char.length),
        userEvent: "input.type"
      });
    }
  });
}

function queryVisibleCodeMirrorEditor(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-editor-engine="codemirror"]')).find(
    (element) => !element.closest("[hidden]")
  ) ?? null;
}

function getVisibleCodeMirrorEditor(container: HTMLElement) {
  const editor = queryVisibleCodeMirrorEditor(container);
  if (!editor) {
    throw new Error("Expected a visible CodeMirror editor.");
  }

  return editor;
}

function getVisibleWritingSurface(container: HTMLElement) {
  const surface = Array.from(container.querySelectorAll<HTMLElement>('[aria-label="Writing surface"]')).find(
    (element) => !element.closest("[hidden]")
  );
  if (!surface) {
    throw new Error("Expected a visible writing surface.");
  }

  return surface;
}

function queryVisibleCodeMirrorTable(container: HTMLElement) {
  return getVisibleCodeMirrorEditor(container).querySelector(".cm-markra-table");
}

async function expectVisibleCodeMirrorText(container: HTMLElement, text: string) {
  await waitFor(() => {
    const view = EditorView.findFromDOM(getVisibleCodeMirrorEditor(container));
    expect(view?.state.doc.toString()).toContain(text);
  });
}

async function expectVisibleMarkdownText(text: string) {
  await waitFor(() => {
    const editors = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-editor-engine="codemirror"], [data-editor-engine="source"]'
      )
    ).filter((editor) => !editor.closest("[hidden]"));
    expect(
      editors.some((editor) => EditorView.findFromDOM(editor)?.state.doc.toString().includes(text))
    ).toBe(true);
  });
}

async function expectVisibleMarkdownWithout(text: string) {
  await waitFor(() => {
    const editors = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-editor-engine="codemirror"], [data-editor-engine="source"]'
      )
    ).filter((editor) => !editor.closest("[hidden]"));
    expect(editors.length).toBeGreaterThan(0);
    expect(
      editors.every((editor) => !EditorView.findFromDOM(editor)?.state.doc.toString().includes(text))
    ).toBe(true);
  });
}

function revealVisualPreviews(container: HTMLElement) {
  const view = getVisibleCodeMirrorView(container);
  act(() => {
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
  });
  return view;
}

function createStoredEditorPreferences(
  overrides: Partial<Parameters<typeof mockedSaveStoredEditorPreferences>[0]> = {}
): Parameters<typeof mockedSaveStoredEditorPreferences>[0] {
  return {
    aiQuickActionPrompts: defaultAiQuickActionPrompts,
    autoRevealActiveFile: true,
    autoSaveEnabled: true,
    autoSaveIntervalMinutes: 10,
    autoUpdateEnabled: true,
    bodyFontSize: 16,
    clipboardImageFolder: "assets",
    copyExternalFilesToStorage: true,
    closeAiCommandOnAgentPanelOpen: false,
    contentWidth: "default",
    contentWidthPx: null,
    documentLinksOpen: true,
    documentLinksVisible: false,
    editorFontFamily: { family: null, source: "theme" },
    extendedSyntax: {
      githubAlerts: true,
      highlight: true
    },
    imageUpload: defaultImageUpload,
    lineHeight: 1.65,
    markdownShortcuts: defaultMarkdownShortcuts,
    markdownTemplates: [],
    openDroppedFilesInTabs: overrides.openDroppedFilesInTabs ?? false,
    paragraphSpacingPx: 8,
    restoreWorkspaceOnStartup: true,
    sidebarLayoutMode: "stacked",
    showAiQuickInputOnSelection: true,
    showAiSelectionToolbarOnSelection: false,
    suggestAiPanelForComplexInlinePrompts: false,
    showDocumentTabs: true,
    splitVisualPanePercent: 50,
    spellcheckEnabled: overrides.spellcheckEnabled ?? false,
    spellcheckIgnoredWords: overrides.spellcheckIgnoredWords ?? [],
    spellcheckLanguage: overrides.spellcheckLanguage ?? "en",
    tableColumnWidthMode: overrides.tableColumnWidthMode ?? "auto",
    titlebarActions: [
      { id: "aiAgent", visible: true },
      { id: "viewMode", visible: true },
      { id: "sourceMode", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ],
    showCodeBlockLineNumbers: overrides.showCodeBlockLineNumbers ?? true,
    showLineNumbers: overrides.showLineNumbers ?? false,
    showWordCount: true,
    typewriterModeEnabled: overrides.typewriterModeEnabled ?? false,
    ...overrides,
    aiWorkspaceAnimationEnabled: overrides.aiWorkspaceAnimationEnabled ?? false,
    hideHeadingMarkersOnFocus:
      overrides.hideHeadingMarkersOnFocus ?? false,
    vimModeEnabled: overrides.vimModeEnabled ?? false,
    viewMode: overrides.viewMode ?? "daily",
    viewModeCustomizations: overrides.viewModeCustomizations ?? {
      aiPanel: "visible",
      documentLinks: "visible",
      documentTabs: "visible",
      fileList: "visible",
      fileTree: "visible",
      fileTreeButton: "visible",
      openButton: "visible",
      outline: "visible",
      quickCreateButton: "visible",
      recentFolders: "visible",
      sidebarLayout: "visible",
      statusBar: "visible",
      titlebarActions: "visible",
      viewModeToggle: "visible",
      wordCount: "visible"
    },
    wrapCodeBlocks: overrides.wrapCodeBlocks ?? true
  };
}

async function settleEditorUpdates() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve(null));
  });
}

async function settleSortableDrag() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 60);
  });
}

function mockScrollMetrics(
  element: Element,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop: number }
) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight
  });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    value: metrics.scrollTop,
    writable: true
  });
}

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

function getVisibleCodeMirrorView(
  container: HTMLElement,
  _editors?: readonly unknown[]
): EditorView {
  const visualView = EditorView.findFromDOM(getVisibleCodeMirrorEditor(container));
  if (!visualView) throw new Error("Expected a visible CodeMirror editor view.");

  return visualView;
}

function findEditorTextPosition(view: EditorView, text: string, offset = 0) {
  const result = view.state.doc.toString().indexOf(text);
  if (result < 0) throw new Error(`Text not found in editor: ${text}`);
  return result + offset;
}

describe("Markra workspace", () => {
  it("marks macOS 27 windows for the WebKit scrolling workaround", async () => {
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedResolveDesktopOsVersion.mockReturnValue("27.0");

    renderApp();

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute(webKitScrollWorkaroundAttribute, "macos-27");
    });
  });

  it("clears the WebKit scrolling workaround outside macOS 27", async () => {
    document.documentElement.setAttribute(webKitScrollWorkaroundAttribute, "macos-27");
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedResolveDesktopOsVersion.mockReturnValue("26.6");

    renderApp();

    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(webKitScrollWorkaroundAttribute);
    });
  });

  afterEach(() => {
    resetAppRuntimeForTests();
    // jsdom shares one document selection across tests. A selection left on a
    // destroyed editor makes the next CodeMirror view treat the mismatching
    // DOM selection as user input and collapse its own selection.
    document.getSelection()?.removeAllRanges();
  });

  it("syncs selection toolbar formatting after running the editor link command", () => {
    const insertMarkdownLink = vi.fn();
    const syncAiSelectionToolbarFormattingState = vi.fn();
    const syncVisualMarkdownAfterEditorCommand = vi.fn();

    expect(runEditorLinkCommand({
      insertMarkdownLink,
      readOnlyMode: false,
      syncAiSelectionToolbarFormattingState,
      syncVisualMarkdownAfterEditorCommand
    })).toBe(true);

    expect(insertMarkdownLink).toHaveBeenCalledTimes(1);
    expect(syncVisualMarkdownAfterEditorCommand).toHaveBeenCalledTimes(1);
    expect(syncAiSelectionToolbarFormattingState).toHaveBeenCalledTimes(1);
  });

  it("includes upload error details in pasted image save failures", () => {
    expect(clipboardImageSaveFailureDescription(new Error("S3 image upload failed: HTTP 403"))).toBe(
      "S3 image upload failed: HTTP 403"
    );
    expect(clipboardImageSaveFailureDescription("Connection refused")).toBe("Connection refused");
    expect(clipboardImageSaveFailureDescription("")).toBe("");
    expect(clipboardImageSaveFailureMessage("Could not save the pasted image.", new Error("S3 image upload failed: HTTP 403"))).toBe(
      "Could not save the pasted image. S3 image upload failed: HTTP 403"
    );
    expect(clipboardImageSaveFailureMessage("Could not save the pasted image.", "Connection refused")).toBe(
      "Could not save the pasted image. Connection refused"
    );
    expect(clipboardImageSaveFailureMessage("Could not save the pasted image.", "")).toBe(
      "Could not save the pasted image."
    );
  });

  it("renders a Typora-like minimal writing surface", async () => {
    const { container } = renderApp();
    const shell = container.querySelector(".app-shell");

    expect(screen.getByRole("heading", { name: "Untitled.md" })).toBeInTheDocument();
    expect(screen.getByLabelText("Window drag region")).toBeInTheDocument();
    await expectVisibleMarkdownText("Welcome to Markra");
    expect(screen.getByRole("button", { name: "Open Markdown or Folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown editor")).toHaveAttribute("data-editor-engine", "codemirror");
    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeInTheDocument());
    expect(screen.queryByText("File")).not.toBeInTheDocument();
    expect(container.querySelector(".native-title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toBeInTheDocument();
    expect(container.querySelector(".quiet-status")?.closest(".editor-content-slot")).toBeInTheDocument();
    expect(container.querySelector(".editor-content-slot")).toHaveClass("h-full", "min-h-0", "overflow-hidden");
    expect(container.querySelector(".quiet-status")).not.toHaveClass("fixed");
    expect(shell).toHaveClass("bg-(--bg-primary)");
    expect(shell).toHaveClass("grid-rows-[minmax(0,1fr)]");
    expect(shell).toHaveClass("overscroll-none");
  });

  it("schedules source editor preloading after the visual editor is ready", async () => {
    scheduleMarkdownSourceEditorPreloadMock.mockClear();

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeInTheDocument());
    await waitFor(() => expect(scheduleMarkdownSourceEditorPreloadMock).toHaveBeenCalled());
  });

  it("imports local images through the native file menu without replacing manual image insertion", async () => {
    const localImage = new File([new Uint8Array([1, 2, 3])], "Local Diagram.png", { type: "image/png" });
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalImages.mockResolvedValue([localImage]);
    mockedSaveNativeClipboardImage.mockResolvedValue({
      alt: "Local Diagram",
      src: "assets/local-diagram.png"
    });

    const { container } = renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleCodeMirrorText(container, "Native");

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers & {
      importLocalImages?: () => unknown | Promise<unknown>;
    };

    await act(async () => {
      await menuHandlers.importLocalImages?.();
    });

    revealVisualPreviews(container);
    await waitFor(() => {
      expect(container.querySelector('img[src="assets/local-diagram.png"]')).toBeInTheDocument();
    });
    expect(mockedOpenNativeLocalImages).toHaveBeenCalledWith({
      title: "Import Local Images..."
    });
    expect(mockedOpenNativeLocalFiles).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).toHaveBeenCalledWith({
      documentPath: mockNativePath,
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      folder: "assets",
      image: localImage
    });
  });

  it("does not open local import pickers while source mode is active", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await selectEditorViewMode("Source code");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.importLocalImages?.();
      await menuHandlers.importLocalFiles?.();
    });

    expect(mockedOpenNativeLocalImages).not.toHaveBeenCalled();
    expect(mockedOpenNativeLocalFiles).not.toHaveBeenCalled();
    expect(mockedImportNativeLocalFile).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).not.toHaveBeenCalled();
  });

  it("does not open local import pickers while an image preview is active", async () => {
    const imagePath = "/mock-files/assets/preview.png";
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { kind: "folder", name: "assets", path: "/mock-files/assets", relativePath: "assets" },
      { kind: "asset", name: "preview.png", path: imagePath, relativePath: "assets/preview.png" }
    ]);

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets/preview.png" }));
    expect(await screen.findByRole("img", { name: "preview.png" })).toBeInTheDocument();
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.importLocalImages?.();
      await menuHandlers.importLocalFiles?.();
    });

    expect(mockedOpenNativeLocalImages).not.toHaveBeenCalled();
    expect(mockedOpenNativeLocalFiles).not.toHaveBeenCalled();
    expect(mockedImportNativeLocalFile).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).not.toHaveBeenCalled();
  });

  it("imports local attachments through the native menu as markdown links", async () => {
    const attachment = { name: "Reference Doc.pdf", path: "/mock-files/Reference Doc.pdf" };
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalFiles.mockResolvedValue([attachment]);
    mockedImportNativeLocalFile.mockResolvedValue({
      label: "Reference Doc.pdf",
      src: "assets/Reference%20Doc.pdf"
    });

    const { container } = renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuInstallCountBeforeOpen = mockedInstallNativeApplicationMenu.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");

    await waitFor(() => {
      expect(mockedInstallNativeApplicationMenu.mock.calls.length).toBeGreaterThan(menuInstallCountBeforeOpen);
    });
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers & {
      importLocalFiles?: () => unknown | Promise<unknown>;
    };

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    expect(mockedOpenNativeLocalFiles).toHaveBeenCalledTimes(1);
    expect(mockedImportNativeLocalFile).toHaveBeenCalledTimes(1);
    revealVisualPreviews(container);
    await waitFor(() => {
      expect(container.querySelector('a[href="assets/Reference%20Doc.pdf"]')).toHaveTextContent("Reference Doc.pdf");
    });
    expect(mockedOpenNativeLocalFiles).toHaveBeenCalledWith({
      title: "Import Local Files..."
    });
    expect(mockedImportNativeLocalFile).toHaveBeenCalledWith({
      copyToStorage: true,
      documentPath: mockNativePath,
      file: attachment,
      folder: "assets"
    });
    expect(mockedSaveNativeClipboardAttachment).not.toHaveBeenCalled();
  });

  it("imports image selections from the local files menu as markdown links", async () => {
    const imageAttachment = { name: "Screenshot.png", path: "/mock-files/Screenshot.png" };
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalFiles.mockResolvedValue([imageAttachment]);
    mockedImportNativeLocalFile.mockResolvedValue({
      label: "Screenshot.png",
      src: "assets/Screenshot.png"
    });

    const { container } = renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers & {
      importLocalFiles?: () => unknown | Promise<unknown>;
      importLocalImages?: () => unknown | Promise<unknown>;
    };

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    await expectVisibleMarkdownText("[Screenshot.png](assets/Screenshot.png)");
    expect(container.querySelector('img[src="assets/Screenshot.png"]')).not.toBeInTheDocument();
    expect(mockedOpenNativeLocalFiles).toHaveBeenCalledWith({
      title: "Import Local Files..."
    });
    expect(mockedOpenNativeLocalImages).not.toHaveBeenCalled();
    expect(mockedImportNativeLocalFile).toHaveBeenCalledWith({
      copyToStorage: true,
      documentPath: mockNativePath,
      file: imageAttachment,
      folder: "assets"
    });
    expect(mockedSaveNativeClipboardAttachment).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).not.toHaveBeenCalled();
  });

  it("keeps successful local file imports when another selected file fails", async () => {
    const rejectedAttachment = { name: "Rejected.pdf", path: "/mock-files/Rejected.pdf" };
    const importedAttachment = { name: "Imported.pdf", path: "/mock-files/Imported.pdf" };
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalFiles.mockResolvedValue([rejectedAttachment, importedAttachment]);
    mockedImportNativeLocalFile
      .mockRejectedValueOnce(new Error("Synthetic import failure"))
      .mockResolvedValueOnce({
        label: "Imported.pdf",
        src: "assets/Imported.pdf"
      });

    const { container } = renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");
    await waitFor(() => expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalled());
    mockedLoadNativeMarkdownFilesForPath.mockClear();
    mockedListNativeMarkdownFilesForPath.mockClear();
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    revealVisualPreviews(container);
    await waitFor(() => {
      expect(container.querySelector('a[href="assets/Imported.pdf"]')).toHaveTextContent("Imported.pdf");
    });
    expect(container.querySelector('a[href="assets/Rejected.pdf"]')).not.toBeInTheDocument();
    expect(screen.getAllByText("Could not save the file attachment.")).toHaveLength(1);
    expect(mockedImportNativeLocalFile).toHaveBeenNthCalledWith(1, {
      copyToStorage: true,
      documentPath: mockNativePath,
      file: rejectedAttachment,
      folder: "assets"
    });
    expect(mockedImportNativeLocalFile).toHaveBeenNthCalledWith(2, {
      copyToStorage: true,
      documentPath: mockNativePath,
      file: importedAttachment,
      folder: "assets"
    });
    expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalledTimes(1);
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledTimes(1);
  });

  it("does not refresh the file tree when every copied local file import fails", async () => {
    const firstAttachment = { name: "First.pdf", path: "/mock-files/First.pdf" };
    const secondAttachment = { name: "Second.pdf", path: "/mock-files/Second.pdf" };
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalFiles.mockResolvedValue([firstAttachment, secondAttachment]);
    mockedImportNativeLocalFile.mockRejectedValue(new Error("Synthetic import failure"));

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");
    await waitFor(() => expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalled());
    mockedLoadNativeMarkdownFilesForPath.mockClear();
    mockedListNativeMarkdownFilesForPath.mockClear();
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    expect(mockedImportNativeLocalFile).toHaveBeenCalledTimes(2);
    expect(mockedLoadNativeMarkdownFilesForPath).not.toHaveBeenCalled();
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
  });

  it("imports local attachments into an unsaved document when external files are not copied", async () => {
    const attachment = { name: "Reference Doc.pdf", path: "/mock-files/Reference Doc.pdf" };
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      copyExternalFilesToStorage: false
    }));
    mockedOpenNativeLocalFiles.mockResolvedValue([attachment]);
    mockedImportNativeLocalFile.mockResolvedValue({
      label: "Reference Doc.pdf",
      src: "FILE:///mock-files/Reference%20Doc.pdf"
    });

    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers & {
      importLocalFiles?: () => unknown | Promise<unknown>;
    };

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    revealVisualPreviews(container);
    await waitFor(() => {
      expect(container.querySelector('a[href="FILE:///mock-files/Reference%20Doc.pdf"]')).toHaveTextContent("Reference Doc.pdf");
    });
    expect(mockedImportNativeLocalFile).toHaveBeenCalledWith({
      copyToStorage: false,
      documentPath: null,
      file: attachment,
      folder: "assets"
    });
    expect(mockedSaveNativeClipboardAttachment).not.toHaveBeenCalled();

    const link = container.querySelector<HTMLAnchorElement>('a[href="FILE:///mock-files/Reference%20Doc.pdf"]');
    link?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }));

    await waitFor(() => expect(mockedOpenNativeMarkdownAttachment).toHaveBeenCalledWith({
      documentPath: null,
      rootPath: null,
      src: "FILE:///mock-files/Reference%20Doc.pdf"
    }));
  });

  it("does not open a relative attachment when the document has no root path", async () => {
    const attachment = { name: "Reference Doc.pdf", path: "/mock-files/Reference Doc.pdf" };
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      copyExternalFilesToStorage: false
    }));
    mockedOpenNativeLocalFiles.mockResolvedValue([attachment]);
    mockedImportNativeLocalFile.mockResolvedValue({
      label: "Reference Doc.pdf",
      src: "assets/Reference%20Doc.pdf"
    });

    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;
    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    revealVisualPreviews(container);
    const link = await waitFor(() => {
      const importedLink = container.querySelector<HTMLAnchorElement>('a[href="assets/Reference%20Doc.pdf"]');
      expect(importedLink).toBeInTheDocument();
      return importedLink!;
    });
    link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }));

    expect(mockedOpenNativeMarkdownAttachment).not.toHaveBeenCalled();
  });

  it("does not refresh the file tree after a no-copy local file import", async () => {
    const attachment = { name: "Reference Doc.pdf", path: "/mock-files/Reference Doc.pdf" };
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      copyExternalFilesToStorage: false
    }));
    mockOpenMarkdownFile({
      content: "# Native\n\nStart here.",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalFiles.mockResolvedValue([attachment]);
    mockedImportNativeLocalFile.mockResolvedValue({
      label: "Reference Doc.pdf",
      src: "file:///mock-files/Reference%20Doc.pdf"
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Native");
    await waitFor(() => expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalled());
    mockedLoadNativeMarkdownFilesForPath.mockClear();
    mockedListNativeMarkdownFilesForPath.mockClear();
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.importLocalFiles?.();
    });

    expect(mockedImportNativeLocalFile).toHaveBeenCalledTimes(1);
    expect(mockedLoadNativeMarkdownFilesForPath).not.toHaveBeenCalled();
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
  });

  it("replaces an empty paragraph when importing a local image at the blank document cursor", async () => {
    const localImage = new File([new Uint8Array([1, 2, 3])], "Blank Import.png", { type: "image/png" });
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "",
      name: "native.md",
      path: mockNativePath
    });
    mockedOpenNativeLocalImages.mockResolvedValue([localImage]);
    mockedSaveNativeClipboardImage.mockResolvedValue({
      alt: "Blank Import",
      src: "assets/blank-import.png"
    });

    const { container } = renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuInstallCountBeforeOpen = mockedInstallNativeApplicationMenu.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await waitFor(() => expect(mockedWatchNativeMarkdownFile).toHaveBeenCalledWith(
      mockNativePath,
      expect.any(Function),
      expect.any(Function),
      {
        globalIgnoreRules: "",
        ignoreRootPath: "/mock-files"
      }
    ));

    await waitFor(() => {
      expect(mockedInstallNativeApplicationMenu.mock.calls.length).toBeGreaterThan(menuInstallCountBeforeOpen);
    });
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers & {
      importLocalImages?: () => unknown | Promise<unknown>;
    };

    await act(async () => {
      await menuHandlers.importLocalImages?.();
    });

    expect(mockedOpenNativeLocalImages).toHaveBeenCalledWith({
      title: "Import Local Images..."
    });
    const view = revealVisualPreviews(container);
    await waitFor(() => {
      expect(view.state.doc.toString()).toBe("![Blank Import](assets/blank-import.png)");
      expect(container.querySelector('img[src="assets/blank-import.png"]')).toBeInTheDocument();
    });
  });

  it("replaces the document word count with the selected word count in the quiet status line", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const view = getMarkdownSourceView(sourceEditor);
    const start = view.state.doc.toString().indexOf("Welcome");

    act(() => {
      view.dispatch({
        selection: {
          anchor: start,
          head: start + "Welcome to Markra".length
        }
      });
    });

    await waitFor(() => expect(container.querySelector(".quiet-status")).toHaveTextContent("3 words"));
    expect(container.querySelector(".quiet-status")).not.toHaveTextContent("75 words");
  });

  it("keeps the active writing surface clear of the quiet status line", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => {
      expect(container.querySelector(".markdown-paper")?.getAttribute("style")).toContain("padding-bottom: 56px");
    });

    await selectEditorViewMode("Source code");
    await waitFor(() => {
      expect(container.querySelector(".markdown-source-paper")?.getAttribute("style")).toContain(
        "padding-bottom: 56px"
      );
    });
  });

  it("restores a selected history version into the current document", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Current\n\nSynthetic body.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFileHistory.mockResolvedValue([
      {
        id: "history-current",
        createdAt: 1_700_000_001_000,
        sizeBytes: 27
      }
    ]);
    mockedReadNativeMarkdownFileHistory.mockResolvedValue({
      id: "history-current",
      contents: "# Earlier\n\nSynthetic body."
    });

    const { container } = renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    await expectVisibleMarkdownText("Current");

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "History versions" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option"));
    fireEvent.click(await screen.findByRole("button", { name: "Restore version" }));

    await waitFor(() => {
      const editor = screen.getByLabelText("Markdown editor");
      expect(within(editor).getByText("Earlier")).toBeInTheDocument();
      expect(within(editor).queryByText("Current")).not.toBeInTheDocument();
    });
    expect(getVisibleCodeMirrorView(container).state.doc.toString()).toContain("Earlier");
    expect(screen.getByRole("region", { name: "History versions" })).toBeInTheDocument();
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    expect(mockedListNativeMarkdownFileHistory).toHaveBeenCalledWith(mockNativePath);
    expect(mockedReadNativeMarkdownFileHistory).toHaveBeenCalledWith(mockNativePath, "history-current");
  });

  it("hides unavailable runtime feature surfaces", async () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      features: {
        ai: false,
        export: false,
        nativeWindowChrome: false,
        networkProxy: false,
        pandoc: false,
        s3ImageUpload: false,
        spellcheck: false,
        updater: false
      }
    });

    const { unmount } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    expect(screen.queryByRole("button", { name: "Toggle Markra AI" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "j", altKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: "j", metaKey: true, shiftKey: true });

    expect(screen.queryByRole("complementary", { name: "Markra AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "AI command" })).not.toBeInTheDocument();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    expect(menuHandlers.exportDocx).toBeUndefined();
    expect(menuHandlers.exportEpub).toBeUndefined();
    expect(menuHandlers.exportHtml).toBeUndefined();
    expect(menuHandlers.exportLatex).toBeUndefined();
    expect(menuHandlers.exportPdf).toBeUndefined();

    await act(async () => {
      await menuHandlers.checkForUpdates?.();
      await menuHandlers.toggleAiAgent?.();
      await menuHandlers.toggleAiCommand?.();
    });

    fireEvent.keyDown(window, { key: "p", metaKey: true });
    fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true });

    expect(mockedCheckNativeAppUpdate).not.toHaveBeenCalled();
    expect(mockedSaveNativeHtmlFile).not.toHaveBeenCalled();
    expect(mockedSaveNativePandocFile).not.toHaveBeenCalled();
    expect(mockedSaveNativePdfFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary", { name: "Markra AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "AI command" })).not.toBeInTheDocument();

    unmount();
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    await screen.findByRole("heading", { name: "Settings" });

    expect(screen.queryByRole("button", { name: "AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Providers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spellcheck" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Web" })).not.toBeInTheDocument();
    expect(screen.queryByText("Updates")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Automatically check for updates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));

    expect(screen.queryByRole("button", { name: "Toggle Markra AI shortcut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI writing command shortcut" })).not.toBeInTheDocument();
  });

  it("keeps browser HTML and PDF export available while hiding Pandoc export", async () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      features: {
        ai: false,
        export: true,
        nativeWindowChrome: false,
        networkProxy: false,
        pandoc: false,
        s3ImageUpload: false,
        spellcheck: false,
        updater: false
      }
    });

    const { unmount } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    expect(menuHandlers.exportHtml).toEqual(expect.any(Function));
    expect(menuHandlers.exportPdf).toEqual(expect.any(Function));
    expect(menuHandlers.exportMarkdown).toBeUndefined();
    expect(menuHandlers.exportDocx).toBeUndefined();
    expect(menuHandlers.exportEpub).toBeUndefined();
    expect(menuHandlers.exportLatex).toBeUndefined();

    unmount();
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    await screen.findByRole("heading", { name: "Settings" });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByText("PDF export")).toBeInTheDocument();
    expect(screen.queryByText("Pandoc export")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pandoc path")).not.toBeInTheDocument();
  });

  it("places browser titlebar tabs over the editor area when runtime disables native window chrome", async () => {
    mockedResolveDesktopPlatform.mockReturnValue("windows");
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      features: {
        ai: true,
        export: true,
        nativeWindowChrome: false,
        networkProxy: true,
        pandoc: true,
        s3ImageUpload: true,
        spellcheck: true,
        updater: true
      },
      platform: {
        resolveDesktopOsVersion: () => null,
        resolveDesktopPlatform: () => "windows"
      }
    });
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-browser",
      filePath: mockNativePath,
      fileTreeOpen: true,
      folderName: "mock-files",
      folderPath: mockFolderPath,
      openFilePaths: [mockNativePath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "browser.md", path: mockNativePath, relativePath: "browser.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Browser file\n\nOpened in the browser shell.",
      name: "browser.md",
      path: mockNativePath
    });

    const { container } = renderApp();

    await expectVisibleMarkdownText("Browser file");
    expect(screen.getByRole("complementary", { name: "Markdown file tree" })).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("tab", { name: /browser\.md/ })).toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveStyle({
      gridTemplateColumns: "auto minmax(0,1fr) 196px",
      left: "289px"
    });
    expect(container.querySelector(".windows-app-chrome")).not.toBeInTheDocument();
    expect(container.querySelector(".native-titlebar")).toHaveClass("top-0");
    expect(container.querySelector(".markdown-file-tree-slot")?.parentElement).not.toHaveClass("pt-10");
    expect(container.querySelector(".windows-titlebar-actions")).toBeInTheDocument();
    expect(container.querySelector(".windows-window-controls")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".document-tabs-drag-spacer")).not.toBeInTheDocument();
    expect(container.querySelector(".native-title-slot")?.getAttribute("style") ?? "").not.toContain("margin-left");
  });

  it("uses an overlay file tree instead of squeezing the editor on narrow web screens", async () => {
    const restoreViewportWidth = mockWindowInnerWidth(390);
    mockedResolveDesktopPlatform.mockReturnValue("linux");
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      features: {
        ai: true,
        export: true,
        nativeWindowChrome: false,
        networkProxy: true,
        pandoc: true,
        s3ImageUpload: true,
        spellcheck: true,
        updater: true
      },
      platform: {
        resolveDesktopOsVersion: () => null,
        resolveDesktopPlatform: () => "linux"
      }
    });
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-mobile-browser",
      filePath: mockNativePath,
      fileTreeOpen: true,
      folderName: "mock-files",
      folderPath: mockFolderPath,
      openFilePaths: [mockNativePath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "mobile.md", path: mockNativePath, relativePath: "mobile.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Mobile browser",
      name: "mobile.md",
      path: mockNativePath
    });

    try {
      const { container } = renderApp();

      await expectVisibleMarkdownText("Mobile browser");
      expect(container.querySelector(".workspace-layout")).toHaveStyle({
        gridTemplateColumns: "0px minmax(0,1fr)"
      });
      expect(container.querySelector(".markdown-file-tree-slot")).toHaveClass(
        "fixed",
        "top-10",
        "bottom-0",
        "left-0"
      );
      expect(container.querySelector(".native-titlebar")).not.toHaveStyle({
        left: "289px"
      });
      expect(screen.getByRole("button", { name: "Toggle file list" })).toBeInTheDocument();
    } finally {
      restoreViewportWidth();
    }
  });

  it("keeps the file tree docked in narrow native windows", async () => {
    const restoreViewportWidth = mockWindowInnerWidth(390);
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      }
    });
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-narrow-native",
      filePath: mockNativePath,
      fileTreeOpen: true,
      folderName: "mock-files",
      folderPath: mockFolderPath,
      openFilePaths: [mockNativePath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Narrow native window",
      name: "native.md",
      path: mockNativePath
    });

    try {
      const { container } = renderApp();

      await expectVisibleMarkdownText("Narrow native window");
      expect(container.querySelector(".workspace-layout")).not.toHaveStyle({
        gridTemplateColumns: "0px minmax(0,1fr)"
      });
      expect(container.querySelector(".markdown-file-tree-slot")).not.toHaveClass(
        "fixed"
      );
    } finally {
      restoreViewportWidth();
    }
  });

  it("persists titlebar action order changes by holding and dragging", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      suggestAiPanelForComplexInlinePrompts: true,
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "viewMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ]
    }));
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    const aiButton = screen.getByRole("button", { name: "Toggle Markra AI" });
    mockTitlebarActionRects(["aiAgent", "viewMode", "sourceMode", "save", "theme"]);

    fireEvent.mouseDown(aiButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 20, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 100, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 100, clientY: 10 });
    await settleSortableDrag();

    await waitFor(() =>
      expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith({
        aiQuickActionPrompts: defaultAiQuickActionPrompts,
        aiWorkspaceAnimationEnabled: false,
        autoRevealActiveFile: true,
        autoSaveEnabled: true,
        autoSaveIntervalMinutes: 10,
        autoUpdateEnabled: true,
        bodyFontSize: 16,
        clipboardImageFolder: "assets",
        copyExternalFilesToStorage: true,
        closeAiCommandOnAgentPanelOpen: false,
        contentWidth: "default",
        contentWidthPx: null,
        documentLinksOpen: true,
        documentLinksVisible: false,
        editorFontFamily: { family: null, source: "theme" },
        extendedSyntax: {
          githubAlerts: true,
          highlight: true
        },
        imageUpload: defaultImageUpload,
        lineHeight: 1.65,
        markdownShortcuts: defaultMarkdownShortcuts,
        markdownTemplates: [],
        openDroppedFilesInTabs: false,
        paragraphSpacingPx: 8,
        restoreWorkspaceOnStartup: true,
        sidebarLayoutMode: "stacked",
        showAiQuickInputOnSelection: true,
        showAiSelectionToolbarOnSelection: false,
        suggestAiPanelForComplexInlinePrompts: true,
        showDocumentTabs: true,
        hideHeadingMarkersOnFocus: false,
        splitVisualPanePercent: 50,
        spellcheckEnabled: false,
        spellcheckIgnoredWords: [],
        spellcheckLanguage: "en",
        tableColumnWidthMode: "even",
        titlebarActions: [
          { id: "viewMode", visible: true },
          { id: "sourceMode", visible: true },
          { id: "save", visible: true },
          { id: "aiAgent", visible: true },
          { id: "theme", visible: true }
        ],
        viewMode: "daily",
        viewModeCustomizations: {
          aiPanel: "visible",
          documentLinks: "visible",
          documentTabs: "visible",
          fileList: "visible",
          fileTree: "visible",
          fileTreeButton: "visible",
          openButton: "visible",
          outline: "visible",
          quickCreateButton: "visible",
          recentFolders: "visible",
          sidebarLayout: "visible",
          statusBar: "visible",
          titlebarActions: "visible",
          viewModeToggle: "visible",
          wordCount: "visible"
        },
        showCodeBlockLineNumbers: true,
        showLineNumbers: false,
        showWordCount: true,
        typewriterModeEnabled: false,
        vimModeEnabled: false,
        wrapCodeBlocks: true
      })
    );
    await waitFor(() =>
      expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith({
        aiQuickActionPrompts: defaultAiQuickActionPrompts,
        aiWorkspaceAnimationEnabled: false,
        autoRevealActiveFile: true,
        autoSaveEnabled: true,
        autoSaveIntervalMinutes: 10,
        autoUpdateEnabled: true,
        bodyFontSize: 16,
        clipboardImageFolder: "assets",
        copyExternalFilesToStorage: true,
        closeAiCommandOnAgentPanelOpen: false,
        contentWidth: "default",
        contentWidthPx: null,
        documentLinksOpen: true,
        documentLinksVisible: false,
        editorFontFamily: { family: null, source: "theme" },
        extendedSyntax: {
          githubAlerts: true,
          highlight: true
        },
        imageUpload: defaultImageUpload,
        lineHeight: 1.65,
        markdownShortcuts: defaultMarkdownShortcuts,
        markdownTemplates: [],
        openDroppedFilesInTabs: false,
        paragraphSpacingPx: 8,
        restoreWorkspaceOnStartup: true,
        sidebarLayoutMode: "stacked",
        showAiQuickInputOnSelection: true,
        showAiSelectionToolbarOnSelection: false,
        suggestAiPanelForComplexInlinePrompts: true,
        showDocumentTabs: true,
        hideHeadingMarkersOnFocus: false,
        splitVisualPanePercent: 50,
        spellcheckEnabled: false,
        spellcheckIgnoredWords: [],
        spellcheckLanguage: "en",
        tableColumnWidthMode: "even",
        titlebarActions: [
          { id: "viewMode", visible: true },
          { id: "sourceMode", visible: true },
          { id: "save", visible: true },
          { id: "aiAgent", visible: true },
          { id: "theme", visible: true }
        ],
        viewMode: "daily",
        viewModeCustomizations: {
          aiPanel: "visible",
          documentLinks: "visible",
          documentTabs: "visible",
          fileList: "visible",
          fileTree: "visible",
          fileTreeButton: "visible",
          openButton: "visible",
          outline: "visible",
          quickCreateButton: "visible",
          recentFolders: "visible",
          sidebarLayout: "visible",
          statusBar: "visible",
          titlebarActions: "visible",
          viewModeToggle: "visible",
          wordCount: "visible"
        },
        showCodeBlockLineNumbers: true,
        showLineNumbers: false,
        showWordCount: true,
        typewriterModeEnabled: false,
        vimModeEnabled: false,
        wrapCodeBlocks: true
      })
    );
  });

  it("opens settings from the lower-left settings launcher", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(mockedOpenSettingsWindow).toHaveBeenCalledTimes(1);
  });

  it("shows an available update in the sidebar footer without downloading until clicked", async () => {
    const downloadAndInstall = vi.fn();
    mockedCheckNativeAppUpdate.mockResolvedValue({
      body: "Release notes",
      currentVersion: "0.0.6",
      date: "2026-05-11T00:00:00Z",
      downloadAndInstall,
      restart: vi.fn(),
      version: "0.0.7"
    });
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: true,
      folderName: "mock-files",
      folderPath: mockFolderPath,
      openFilePaths: []
    });

    renderApp();

    const installUpdateButton = await screen.findByRole("button", { name: "Install and restart" });

    expect(downloadAndInstall).not.toHaveBeenCalled();

    fireEvent.click(installUpdateButton);

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1));
  });

  it("restores the last opened markdown file on app launch", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Restored file\n\nBack from last launch.",
      name: "native.md",
      path: mockNativePath
    });

    const { container } = renderApp();

    await expectVisibleMarkdownText("# Restored file");
    await expectVisibleMarkdownText("Back from last launch.");
    expect(screen.getByRole("tab", { name: /native\.md/ })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockNativePath);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("switches visual editor content after restoring multiple document tabs", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    const notesPath = "/mock-files/vault/notes.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-restored-tabs",
      filePath: notesPath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
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

    renderApp();

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /notes\.md/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));

    expect(await screen.findByRole("heading", { name: "Guide" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Notes" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  it("hides supporting workspace chrome in focus view mode", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    const notesPath = "/mock-files/vault/notes.md";
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      viewMode: "focus"
    }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-focus-view",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [guidePath, notesPath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => path === guidePath
      ? {
        content: "# Guide",
        name: "guide.md",
        path
      }
      : {
        content: "# Notes",
        name: "notes.md",
        path
      });

    const { container } = renderApp();

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /notes\.md/ })).not.toBeInTheDocument();
    expect(container.querySelector(".workspace-layout")).toHaveStyle({
      gridTemplateColumns: "0px minmax(0,1fr)"
    });
    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(container.querySelector(".quiet-status")).not.toBeInTheDocument();
  });

  it("keeps an exit control in immersive mode and exits it with Escape", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      viewMode: "daily"
    }));

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "View mode: Daily" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Immersive" }));

    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      viewMode: "immersive"
    })));
    expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      viewMode: "immersive"
    }));
    expect(await screen.findByRole("button", { name: "View mode: Immersive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();

    mockedSaveStoredEditorPreferences.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "View mode: Immersive" }));
    expect(await screen.findByRole("menu", { name: "View mode" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "View mode" })).not.toBeInTheDocument();
    });
    expect(mockedSaveStoredEditorPreferences).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "View mode: Immersive" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ viewMode: "full" })
    ));
    expect(await screen.findByRole("button", { name: "View mode: Full" })).toBeInTheDocument();
  });

  it("hides fixed titlebar buttons from custom view mode visibility", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      viewMode: "custom",
      viewModeCustomizations: {
        ...createStoredEditorPreferences().viewModeCustomizations,
        fileTreeButton: "hidden",
        openButton: "hidden",
        quickCreateButton: "hidden"
      }
    }));

    renderApp();

    expect(await screen.findByRole("button", { name: "View mode: Custom" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Markdown or Folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Markdown File" })).not.toBeInTheDocument();
  });

  it("hides sidebar content areas from custom view mode visibility", async () => {
    const notesPath = "/mock-files/vault/notes.md";
    const defaultPreferences = createStoredEditorPreferences();
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      viewMode: "custom",
      viewModeCustomizations: {
        ...defaultPreferences.viewModeCustomizations,
        fileList: "hidden",
        outline: "hidden",
        recentFolders: "hidden"
      }
    }));
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" }
    ]);
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-custom-view",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [notesPath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Notes\n\n## Details",
      name: "notes.md",
      path: notesPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "notes.md", path: notesPath, relativePath: "notes.md", sizeBytes: 10 }
    ]);

    const { container } = renderApp();

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(container.querySelector(".workspace-layout")).toHaveStyle({
      gridTemplateColumns: "0px minmax(0,1fr)"
    });
    expect(screen.queryByRole("button", { name: "Toggle file list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recently used directories" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tree", { name: "Markdown files" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Document outline" })).not.toBeInTheDocument();
  });

  it("hides top-right titlebar buttons from custom view mode visibility", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      viewMode: "custom",
      viewModeCustomizations: {
        ...createStoredEditorPreferences().viewModeCustomizations,
        titlebarActions: "hidden"
      }
    }));

    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    expect(screen.queryByRole("button", { name: "Toggle Markra AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View mode: Custom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editor view mode: Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Markdown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to dark theme" })).not.toBeInTheDocument();
  });

  it("hides document links and word count from custom view mode visibility", async () => {
    const notesPath = "/mock-files/vault/notes.md";
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      documentLinksOpen: false,
      documentLinksVisible: true,
      showWordCount: true,
      viewMode: "custom",
      viewModeCustomizations: {
        ...createStoredEditorPreferences().viewModeCustomizations,
        documentLinks: "hidden",
        wordCount: "hidden"
      }
    }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-custom-view",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [notesPath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Notes\n\nOne two three.",
      name: "notes.md",
      path: notesPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "notes.md", path: notesPath, relativePath: "notes.md", sizeBytes: 10 }
    ]);

    const { container } = renderApp();

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Document links" })).not.toBeInTheDocument();
    const quietStatus = container.querySelector(".quiet-status");
    expect(quietStatus).toBeInTheDocument();
    expect(quietStatus?.textContent ?? "").not.toContain("words");
  });

  it("keeps the editor sidebar layout outside custom view mode visibility", async () => {
    const notesPath = "/mock-files/vault/notes.md";
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      sidebarLayoutMode: "tabs",
      viewMode: "custom",
      viewModeCustomizations: {
        ...createStoredEditorPreferences().viewModeCustomizations,
        sidebarLayout: "hidden"
      }
    }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-custom-view",
      filePath: notesPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [notesPath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Notes",
      name: "notes.md",
      path: notesPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "notes.md", path: notesPath, relativePath: "notes.md", sizeBytes: 10 }
    ]);

    const { container } = renderApp();

    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(container.querySelector(".markdown-file-tree-panel-tabs")).toBeInTheDocument();
  });

  it("restores a saved side-by-side tab group on app launch", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    const thirdPath = "/mock-files/vault/docs/3.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-side-by-side",
      filePath: firstPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [firstPath, secondPath, thirdPath],
      sideBySideGroup: {
        primaryFilePath: firstPath,
        sideFilePath: secondPath
      }
    } as Awaited<ReturnType<typeof mockedGetStoredWorkspaceState>>);
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" },
      { name: "3.md", path: thirdPath, relativePath: "docs/3.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First\n\nRestored main",
          name: "1.md",
          path
        };
      }

      if (path === secondPath) {
        return {
          content: "# Second\n\nRestored side",
          name: "2.md",
          path
        };
      }

      return {
        content: "# Third\n\nRestored standalone",
        name: "3.md",
        path
      };
    });

    const { container } = renderApp();

    await expectVisibleMarkdownText("First");
    const restoredGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(restoredGroup).toBeInTheDocument();
    expect(within(restoredGroup).getByRole("tab", { name: /1\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(restoredGroup).getByRole("tab", { name: /2\.md/ })).toHaveAttribute("aria-selected", "false");
    await waitFor(() =>
      expect(within(container.querySelector(".side-document-pane") as HTMLElement).getByText("Restored side")).toBeInTheDocument()
    );
    expect(screen.getByRole("tab", { name: /3\.md/ })).toBeInTheDocument();
  });

  it("restores the last opened markdown folder on app launch", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: []
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    const { container } = renderApp();

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true")
    );
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Untitled.md" })).not.toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("does not read extra markdown contents for document links while the links panel is closed", async () => {
    const alphaPath = "/mock-files/vault/Alpha.md";
    const betaPath = "/mock-files/vault/Beta.md";
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      documentLinksOpen: false,
      documentLinksVisible: true
    }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: alphaPath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [alphaPath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Alpha\n\nCurrent document.",
      name: "Alpha.md",
      path: alphaPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "Alpha.md", path: alphaPath, relativePath: "Alpha.md", sizeBytes: 10 },
      { name: "Beta.md", path: betaPath, relativePath: "Beta.md", sizeBytes: 10 }
    ]);

    renderApp();

    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Document links" })).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions)
    );
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(alphaPath);
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalledWith(betaPath);
  });

  it("falls back to an empty document when the restored markdown folder is gone", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: true,
      folderName: "deleted-notes",
      folderPath: "/mock-files/deleted-notes",
      openFilePaths: []
    });
    mockedListNativeMarkdownFilesForPath.mockRejectedValue(new Error("Markdown folder no longer exists"));

    renderApp();

    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/mock-files/deleted-notes", defaultFileTreeListOptions)
    );
    expect(await screen.findByRole("heading", { name: "Untitled.md" })).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary", { name: "Markdown file tree" })).not.toBeInTheDocument();
    expect(screen.queryByText("No folder")).not.toBeInTheDocument();
    expect(screen.queryByText("Welcome to Markra")).not.toBeInTheDocument();
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("keeps the saved folder root when restoring a nested file from that workspace", async () => {
    const nestedFilePath = "/mock-files/vault/docs/deep/a.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: nestedFilePath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [nestedFilePath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "a.md", path: nestedFilePath, relativePath: "docs/deep/a.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Nested A\n\nRestored from a nested workspace file.",
      name: "a.md",
      path: nestedFilePath
    });

    renderApp();

    await expectVisibleMarkdownText("Nested A");
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions)
    );
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalledWith(
      "/mock-files/vault/docs/deep",
      defaultFileTreeListOptions
    );
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith({ filePath: null });
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith(expect.objectContaining({
      filePath: null,
      folderPath: mockFolderPath
    }));
    expect(mockedSaveStoredWorkspaceState).not.toHaveBeenCalledWith(expect.objectContaining({
      folderPath: "/mock-files/vault/docs/deep"
    }));
  });

  it("loads and persists the app color theme", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "dark",
      darkTheme: "dark",
      lightTheme: "light"
    });

    renderApp();

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    await waitFor(() => expect(mockedSaveStoredThemePreferences).toHaveBeenCalledWith({
      appearanceMode: "light",
      darkTheme: "dark",
      lightTheme: "light"
    }));
    await waitFor(() => expect(mockedNotifyAppThemeChanged).toHaveBeenCalledWith({
      appearanceMode: "light",
      darkTheme: "dark",
      lightTheme: "light"
    }));
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("keeps a manually selected global theme fixed across system color changes", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "light",
      darkTheme: "catppuccin-mocha",
      lightTheme: "catppuccin-latte"
    });
    const systemColorScheme = mockSystemColorScheme(true);

    const { container } = renderApp();

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "catppuccin-latte"));
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "catppuccin-latte");

    act(() => {
      systemColorScheme.setSystemDark(false);
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "catppuccin-latte");
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "catppuccin-latte");
    expect(mockedSaveStoredThemePreferences).not.toHaveBeenCalled();
  });

  it("restores the selected light palette after toggling to dark mode and back", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "light",
      darkTheme: "night",
      lightTheme: "sepia"
    });

    const { container } = renderApp();

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "sepia"));
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "sepia");

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "night"));
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "night");
    await waitFor(() => expect(mockedSaveStoredThemePreferences).toHaveBeenCalledWith({
      appearanceMode: "dark",
      darkTheme: "night",
      lightTheme: "sepia"
    }));

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "sepia"));
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "sepia");
    await waitFor(() => expect(mockedSaveStoredThemePreferences).toHaveBeenLastCalledWith({
      appearanceMode: "light",
      darkTheme: "night",
      lightTheme: "sepia"
    }));
    await waitFor(() => expect(mockedNotifyAppThemeChanged).toHaveBeenLastCalledWith({
      appearanceMode: "light",
      darkTheme: "night",
      lightTheme: "sepia"
    }));
  });

  it("updates the editor window when another window changes the theme", async () => {
    let onThemeChanged: ((preferences: {
      appearanceMode: "light" | "dark" | "system";
      darkTheme: "dark" | "night";
      lightTheme: "light" | "sepia";
    }) => unknown) | null = null;
    mockedListenAppThemeChanged.mockImplementation(async (listener) => {
      onThemeChanged = listener;
      return () => {};
    });

    const { container } = renderApp();

    await waitFor(() => expect(mockedListenAppThemeChanged).toHaveBeenCalledTimes(1));
    act(() => {
      onThemeChanged?.({
        appearanceMode: "dark",
        darkTheme: "night",
        lightTheme: "sepia"
      });
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "night");
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "night");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("applies the custom theme CSS for the active appearance mode", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "light",
      customThemeEnabled: true,
      darkTheme: "dark",
      lightTheme: "light"
    });
    mockedGetStoredCustomThemeCss.mockResolvedValue({
      dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
      light: ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"
    });

    const { container } = renderApp();

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "custom"));
    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "custom");
    expect(document.getElementById("markra-custom-theme-style")).toHaveTextContent("--bg-primary: #fdf6e3");

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "custom");
    expect(document.getElementById("markra-custom-theme-style")).toHaveTextContent("--bg-primary: #0d1117");
  });

  it("follows the system color scheme when the stored theme preference is system", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockResolvedValue({
      appearanceMode: "system",
      darkTheme: "night",
      lightTheme: "sepia"
    });
    const systemColorScheme = mockSystemColorScheme(true);

    renderApp();

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "night"));
    await waitFor(() => expect(screen.getByLabelText("Markdown editor")).toHaveAttribute("data-editor-theme", "night"));

    act(() => {
      systemColorScheme.setSystemDark(false);
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "sepia");
    expect(screen.getByLabelText("Markdown editor")).toHaveAttribute("data-editor-theme", "sepia");
    expect(mockedSaveStoredThemePreferences).not.toHaveBeenCalled();
  });

  it("reinstalls native menus when another window changes the language", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    let onLanguageChanged: ((language: "en" | "zh-CN" | "fr") => unknown) | null = null;
    mockedListenAppLanguageChanged.mockImplementation(async (listener) => {
      onLanguageChanged = listener;
      return () => {};
    });

    renderApp();

    await waitFor(() =>
      expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledWith(expect.any(Object), "en", undefined, [])
    );

    act(() => {
      onLanguageChanged?.("zh-CN");
    });

    await waitFor(() =>
      expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledWith(expect.any(Object), "zh-CN", undefined, [])
    );
  });

  it("waits for the stored language before replacing the Rust startup menu", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    let resolveLanguage: ((language: "fr") => unknown) | null = null;
    mockedGetStoredLanguage.mockReturnValue(
      new Promise((resolve) => {
        resolveLanguage = resolve;
      })
    );

    renderApp();

    await waitFor(() => expect(mockedGetStoredLanguage).toHaveBeenCalledTimes(1));
    expect(mockedInstallNativeApplicationMenu).not.toHaveBeenCalled();

    act(() => {
      resolveLanguage?.("fr");
    });

    await waitFor(() =>
      expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledWith(expect.any(Object), "fr", undefined, [])
    );
  });

  it("waits for the stored theme before revealing the workspace window", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    let resolveThemePreferences: ((preferences: {
      appearanceMode: "dark";
      darkTheme: "night";
      lightTheme: "light";
    }) => unknown) | null = null;
    mockedGetStoredThemePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolveThemePreferences = resolve;
      })
    );

    renderApp();

    await waitFor(() => expect(mockedGetStoredThemePreferences).toHaveBeenCalledTimes(1));
    expect(mockedShowNativeWindow).not.toHaveBeenCalled();

    act(() => {
      resolveThemePreferences?.({
        appearanceMode: "dark",
        darkTheme: "night",
        lightTheme: "light"
      });
    });

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "night"));
    await waitFor(() => expect(mockedShowNativeWindow).toHaveBeenCalledTimes(1));
  });

  it("prewarms the settings window after workspace startup is ready", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);

    renderApp();

    expect(await screen.findByRole("heading", { name: "Untitled.md" })).toBeInTheDocument();
    await waitFor(() => expect(mockedShowNativeWindow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedPrewarmSettingsWindow).toHaveBeenCalledTimes(1), {
      timeout: 2000
    });
  });

  it("waits for stored settings before revealing a settings route without startup preferences", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    let resolveLanguage: ((language: "fr") => unknown) | null = null;
    mockedGetStoredLanguage.mockReturnValue(
      new Promise((resolve) => {
        resolveLanguage = resolve;
      })
    );
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(mockedGetStoredLanguage).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".settings-window")).not.toBeInTheDocument();
    expect(mockedMarkSettingsWindowReady).not.toHaveBeenCalled();

    act(() => {
      resolveLanguage?.("fr");
    });

    expect(await screen.findByRole("button", { name: "Général" })).toBeInTheDocument();
    await waitFor(() => expect(mockedMarkSettingsWindowReady).toHaveBeenCalledTimes(1));
  });

  it("uses settings startup language and theme before async settings resolve", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredLanguage.mockReturnValue(new Promise<never>(() => {}));
    mockedGetStoredThemePreferences.mockReturnValue(new Promise<never>(() => {}));
    window.history.pushState(
      {},
      "",
      "/?settings=1&startupLanguage=zh-CN&startupAppearanceMode=dark&startupLightTheme=light&startupDarkTheme=night"
    );

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "通用" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "General" })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "night");
    await waitFor(() => expect(mockedMarkSettingsWindowReady).toHaveBeenCalledTimes(1));
  });

  it("removes the settings startup background once the app theme is applied", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredThemePreferences.mockReturnValue(new Promise<never>(() => {}));
    window.history.pushState(
      {},
      "",
      "/?settings=1&startupLanguage=zh-CN&startupAppearanceMode=dark&startupLightTheme=light&startupDarkTheme=night"
    );
    const startupStyle = document.createElement("style");
    startupStyle.id = "markra-startup-theme-style";
    startupStyle.textContent = "html,body,#root{background:#1e1e1e;color-scheme:dark;}";
    document.head.append(startupStyle);
    document.documentElement.style.backgroundColor = "rgb(30, 30, 30)";
    document.documentElement.style.colorScheme = "dark";

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(document.documentElement).toHaveAttribute("data-theme", "night");
    expect(document.getElementById("markra-startup-theme-style")).not.toBeInTheDocument();
    expect(document.documentElement.style.backgroundColor).toBe("");
    expect(document.documentElement.style.colorScheme).toBe("");
  });

  it("renders an independent settings window route", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(container.querySelector(".settings-drag-region")).toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".settings-window .mac-window-controls")).toBeInTheDocument();
    expect(container.querySelector(".settings-window")).not.toHaveClass("border");
    expect(container.querySelector(".settings-window")).toHaveClass("overscroll-none");
    expect(container.querySelector(".settings-scroll")).toHaveClass("overscroll-none");
    expect(container.querySelector(".settings-sidebar-title")).toBeInTheDocument();
    expect(container.querySelector(".settings-sidebar nav")).toBeInTheDocument();
    expect(container.querySelector(".settings-layout")).toHaveClass("grid-cols-[180px_minmax(0,1fr)]");
    expect(container.querySelector(".settings-sidebar")).toHaveClass("bg-(--bg-secondary)");
    expect(container.querySelector(".settings-content")).not.toHaveClass("rounded-tl-md");
    expect(container.querySelector(".settings-content-header")).toHaveClass("border-b");
    expect(container.querySelector(".settings-panel-title")).toHaveClass("text-[16px]");
    const settingsGroups = Array.from(container.querySelectorAll(".settings-list-group"));
    expect(settingsGroups.length).toBeGreaterThan(0);
    settingsGroups.forEach((group) => expect(group).not.toHaveClass("border-y"));
    expect(settingsGroups[0]).not.toHaveClass("divide-y");
    expect(settingsGroups.some((group) => group.classList.contains("divide-y"))).toBe(true);
    expect(screen.getByText(`Markra ${desktopPackage.version}`)).toBeInTheDocument();
    expect(screen.getByText(`Markra v${desktopPackage.version}`)).toBeInTheDocument();
    const categoryButtons = Array.from(container.querySelectorAll(".settings-sidebar nav button"));
    expect(categoryButtons.map((button) => button.textContent)).toEqual([
      "General",
      "AI",
      "Providers",
      "Web",
      "Storage",
      "Backups",
      "Sync",
      "Logs",
      "Appearance",
      "View",
      "Editor",
      "Spellcheck",
      "Templates",
      "Keyboard shortcuts",
      "Export",
      "Network"
    ]);
    expect(categoryButtons[0]).toHaveAttribute("aria-current", "page");
    expect(categoryButtons[1]).not.toHaveAttribute("aria-current");
    const languageSelect = container.querySelector("select");
    expect(languageSelect).toHaveValue("en");
    expect(container.querySelector('[role="group"]')).not.toBeInTheDocument();
    expect(container.querySelector(".markdown-paper")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-window", "settings");

    fireEvent.change(languageSelect!, {
      target: { value: "fr" }
    });
    await waitFor(() => expect(mockedSaveStoredLanguage).toHaveBeenCalledWith("fr"));
    await waitFor(() => expect(mockedNotifyAppLanguageChanged).toHaveBeenCalledWith("fr"));

    const appearanceCategoryButton = screen.getByRole("button", { name: "Apparence" });
    fireEvent.click(appearanceCategoryButton);
    expect(appearanceCategoryButton).toHaveAttribute("aria-current", "page");
    const appearanceMode = screen.getByRole("radiogroup", { name: "Mode d’apparence" });
    const darkPalette = screen.getByRole("radiogroup", { name: "Palette sombre" });
    const lightPalette = screen.getByRole("radiogroup", { name: "Palette claire" });

    expect(within(appearanceMode).getByRole("radio", { name: "Clair" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Night" })).toBeInTheDocument();
    fireEvent.click(within(appearanceMode).getByRole("radio", { name: "Sombre" }));
    fireEvent.click(within(darkPalette).getByRole("radio", { name: "Night" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "night");
    await waitFor(() => expect(mockedSaveStoredThemePreferences).toHaveBeenCalledWith({
      appearanceMode: "dark",
      darkTheme: "night",
      lightTheme: "light"
    }));
    await waitFor(() => expect(mockedNotifyAppThemeChanged).toHaveBeenCalledWith({
      appearanceMode: "dark",
      darkTheme: "night",
      lightTheme: "light"
    }));

    const customThemeSwitch = screen.getByRole("switch", { name: "Thème personnalisé" });
    fireEvent.click(customThemeSwitch);

    expect(customThemeSwitch).toBeChecked();
    expect(within(lightPalette).getByRole("radio", { name: "Personnalisé" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Personnalisé" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement).toHaveAttribute("data-theme", "custom");
    expect(document.getElementById("markra-custom-theme-style")).toHaveTextContent("--bg-primary: #0d1117");
    await waitFor(() => expect(mockedSaveStoredThemePreferences).toHaveBeenCalledWith({
      appearanceMode: "dark",
      customThemeEnabled: true,
      darkTheme: "night",
      lightTheme: "light"
    }));

    fireEvent.click(within(appearanceMode).getByRole("radio", { name: "Clair" }));
    const customCss = await screen.findByRole("textbox", { name: "CSS du thème personnalisé clair" });
    fireEvent.change(customCss, {
      target: { value: ":root[data-theme=\"custom\"] { --accent: #0969da; }" }
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "custom");
    expect(document.getElementById("markra-custom-theme-style")).toHaveTextContent("--accent: #0969da");
    await waitFor(() => expect(mockedSaveStoredCustomThemeCss).toHaveBeenCalledWith({
      dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
      light: ":root[data-theme=\"custom\"] { --accent: #0969da; }"
    }));
    await waitFor(() => expect(mockedNotifyAppCustomThemeCssChanged).toHaveBeenCalledWith({
      dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
      light: ":root[data-theme=\"custom\"] { --accent: #0969da; }"
    }));

    fireEvent.click(customThemeSwitch);

    expect(customThemeSwitch).not.toBeChecked();
    expect(within(lightPalette).getByRole("radio", { name: "Clair" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("textbox", { name: "CSS du thème personnalisé clair" })).not.toBeInTheDocument();

    fireEvent.click(within(lightPalette).getByRole("radio", { name: "Personnalisé" }));
    expect(customThemeSwitch).toBeChecked();
    expect(within(darkPalette).getByRole("radio", { name: "Personnalisé" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(lightPalette).getByRole("radio", { name: "Clair" }));
    expect(customThemeSwitch).not.toBeChecked();
    expect(within(darkPalette).getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");

    const templatesCategoryButton = screen.getByRole("button", { name: "Modèles" });
    fireEvent.click(templatesCategoryButton);
    expect(templatesCategoryButton).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { level: 2, name: "Modèles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un modèle" })).toBeInTheDocument();
  });

  it("renders the settings window after a browser route change", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);

    const { container } = renderApp();

    await screen.findByRole("heading", { name: "Untitled.md" });

    act(() => {
      window.history.pushState({}, "", "/?settings=1");
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(container.querySelector(".markdown-paper")).not.toBeInTheDocument();
  });

  it("chooses the backup target folder from the settings window route", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedGetStoredBackupSettings.mockResolvedValue({
      backupOnExit: false,
      intervalMinutes: 0,
      lastBackupAt: null,
      targetPath: ""
    });
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "mock-backups",
      path: "/mock-backups"
    });
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Backups" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose backup target folder" }));

    await waitFor(() =>
      expect(mockedOpenNativeMarkdownFolder).toHaveBeenCalledWith({
        title: "Choose backup target folder"
      })
    );
    await waitFor(() =>
      expect(mockedSaveStoredBackupSettings).toHaveBeenCalledWith({
        backupOnExit: false,
        intervalMinutes: 0,
        lastBackupAt: null,
        targetPath: "/mock-backups"
      })
    );
    expect(mockedNotifyAppBackupSettingsChanged).toHaveBeenCalledWith({
      backupOnExit: false,
      intervalMinutes: 0,
      lastBackupAt: null,
      targetPath: "/mock-backups"
    });
  });

  it("shows a close button in the web settings window", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedResolveDesktopPlatform.mockReturnValue("linux");
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(container.querySelector(".settings-layout")).toHaveClass(
      "max-[700px]:grid-cols-1",
      "max-[700px]:grid-rows-[auto_minmax(0,1fr)]"
    );
    expect(container.querySelector(".settings-drag-region")).not.toBeInTheDocument();
    expect(container.querySelector(".settings-content-header")).not.toHaveAttribute("data-tauri-drag-region");

    fireEvent.click(await screen.findByRole("button", { name: /close window/i }));

    expect(mockedHideSettingsWindow).toHaveBeenCalledTimes(1);
  });

  it("hides the settings window from the settings shortcut", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    fireEvent.keyDown(window, {
      code: "Comma",
      ctrlKey: true,
      key: ","
    });

    expect(mockedHideSettingsWindow).toHaveBeenCalledTimes(1);
    expect(mockedCloseNativeWindow).not.toHaveBeenCalled();
  });

  it("syncs toolbar button order in the settings window after another window changes it", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    let onEditorPreferencesChanged: ((preferences: Parameters<typeof mockedSaveStoredEditorPreferences>[0]) => unknown) | null = null;
    mockedListenAppEditorPreferencesChanged.mockImplementation(async (listener) => {
      onEditorPreferencesChanged = listener;
      return () => {};
    });
    const initialPreferences = createStoredEditorPreferences({
      suggestAiPanelForComplexInlinePrompts: true,
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "aiAgent" as const, visible: true },
        { id: "viewMode" as const, visible: true },
        { id: "sourceMode" as const, visible: true },
        { id: "save" as const, visible: true },
        { id: "theme" as const, visible: true }
      ]
    });
    mockedGetStoredEditorPreferences.mockResolvedValue(initialPreferences);
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Editor" }));
    const toolbarGroup = await screen.findByRole("group", { name: "Top-right buttons" });

    expect(within(toolbarGroup).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Toggle Markra AI",
      "View mode",
      "Editor view mode",
      "Save Markdown",
      "Switch to dark theme",
      "Reset top-right buttons"
    ]);

    act(() => {
      onEditorPreferencesChanged?.({
        ...initialPreferences,
        titlebarActions: [
          { id: "sourceMode", visible: true },
          { id: "save", visible: true },
          { id: "aiAgent", visible: true },
          { id: "viewMode", visible: true },
          { id: "theme", visible: true }
        ]
      });
    });

    expect(within(toolbarGroup).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Editor view mode",
      "Save Markdown",
      "Toggle Markra AI",
      "View mode",
      "Switch to dark theme",
      "Reset top-right buttons"
    ]);
  });

  it("removes the reserved settings drag space on Windows", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedResolveDesktopPlatform.mockReturnValue("windows");
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    expect(container.querySelector(".settings-drag-region")).not.toBeInTheDocument();
    expect(container.querySelector(".settings-window .mac-window-controls")).not.toBeInTheDocument();
    const settingsChrome = container.querySelector(".settings-window-chrome") as HTMLElement;
    expect(settingsChrome).toBeInTheDocument();
    expect(settingsChrome).toHaveClass("fixed", "top-0", "h-10", "bg-(--bg-chrome)");
    expect(settingsChrome).not.toHaveClass("border-b");
    expect(settingsChrome).toHaveAttribute("data-tauri-drag-region");
    expect(within(settingsChrome).getByText("Markra")).toBeInTheDocument();
    expect(within(settingsChrome).getByText("Settings")).toBeInTheDocument();
    expect(within(settingsChrome).getByRole("button", { name: "Minimize window" })).toBeInTheDocument();
    expect(within(settingsChrome).getByRole("button", { name: "Maximize or restore window" })).toBeInTheDocument();
    expect(within(settingsChrome).getByRole("button", { name: "Close window" })).toBeInTheDocument();
    expect(container.querySelector(".settings-layout")).toHaveClass("absolute", "top-10", "bottom-0");
    expect(container.querySelector(".settings-sidebar")).toHaveClass("border-r-0", "bg-(--bg-chrome)");
    expect(container.querySelector(".settings-content")).toHaveClass("border-t", "border-l", "rounded-tl-md");
    expect(container.querySelector(".settings-sidebar-header")).toHaveClass("h-14", "items-center");
    expect(container.querySelector(".settings-sidebar-header")).not.toHaveClass("pt-14");
    expect(container.querySelector(".settings-sidebar-title")).toBeInTheDocument();
  });

  it("stores the preference for closing inline AI when the Markra AI panel opens", async () => {
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "AI" }));
    const closeInlineAiSwitch = screen.getByRole("switch", { name: "Close inline AI when opening Markra AI" });

    expect(closeInlineAiSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(closeInlineAiSwitch);

    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      closeAiCommandOnAgentPanelOpen: true
    })));
    await waitFor(() => expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      closeAiCommandOnAgentPanelOpen: true
    })));
  });

  it("updates markdown shortcuts from the dedicated settings tab", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: true,
      autoSaveEnabled: true,
      autoSaveIntervalMinutes: 10,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "assets",
      copyExternalFilesToStorage: true,
      closeAiCommandOnAgentPanelOpen: false,
      contentWidth: "default",
      contentWidthPx: null,
      documentLinksOpen: true,
      documentLinksVisible: false,
      editorFontFamily: { family: null, source: "theme" },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      },
      imageUpload: defaultImageUpload,
      lineHeight: 1.65,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      },
      markdownTemplates: [],
      openDroppedFilesInTabs: false,
      paragraphSpacingPx: 8,
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      hideHeadingMarkersOnFocus: false,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      viewMode: "daily",
      viewModeCustomizations: {
        aiPanel: "visible",
        documentLinks: "visible",
        documentTabs: "visible",
        fileList: "visible",
        fileTree: "visible",
        fileTreeButton: "visible",
        openButton: "visible",
        outline: "visible",
        quickCreateButton: "visible",
        recentFolders: "visible",
        sidebarLayout: "visible",
        statusBar: "visible",
        titlebarActions: "visible",
        viewModeToggle: "visible",
        wordCount: "visible"
      },
      showCodeBlockLineNumbers: true,
      showLineNumbers: false,
      showWordCount: true,
      typewriterModeEnabled: false,
      vimModeEnabled: false,
      wrapCodeBlocks: true
    });
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Keyboard shortcuts" }));

    const boldShortcut = await screen.findByRole("button", { name: "Bold shortcut" });
    await waitFor(() => expect(boldShortcut).toHaveTextContent("⌘+⌥+B"));

    fireEvent.click(screen.getByRole("button", { name: "Reset keyboard shortcuts" }));

    await waitFor(() => expect(boldShortcut).toHaveTextContent("⌘+B"));
    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      markdownShortcuts: defaultMarkdownShortcuts
    })));

    fireEvent.click(boldShortcut);
    fireEvent.keyDown(boldShortcut, {
      altKey: true,
      key: "b",
      metaKey: true
    });

    await waitFor(() => expect(boldShortcut).toHaveTextContent("⌘+⌥+B"));
    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenLastCalledWith(expect.objectContaining({
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      }
    })));
  });

  it("edits and stores AI provider settings from the settings window", async () => {
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-window")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Providers" }));

    expect(await screen.findByRole("button", { name: "OpenAI" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelector(".ai-settings-layout")).toHaveClass("h-full", "min-h-0", "grid-cols-[16rem_minmax(0,1fr)]");
    expect(container.querySelector(".ai-settings-layout")?.children).toHaveLength(2);
    expect(container.querySelector(".ai-provider-list-scroll")).toHaveClass("min-h-0", "overflow-auto");
    expect(screen.getAllByRole("img", { name: "OpenAI logo" })).toHaveLength(2);
    expect(screen.getByLabelText("Search providers")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add provider" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("API style")).toHaveValue("openai-responses");
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(screen.getByLabelText("API URL")).toHaveValue("https://api.openai.com/v1");

    fireEvent.click(screen.getByRole("button", { name: "Add model" }));
    expect(screen.getByRole("group", { name: "Capability" })).toBeInTheDocument();
    expect(["Text", "Image", "Vision", "Reasoning", "Tools"].map((label) => screen.getByRole("button", { name: label }))).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Vision" }));
    expect(screen.getByRole("button", { name: "Vision" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gpt-5.5-thinking" }
    });
    fireEvent.change(screen.getByLabelText("Model name"), {
      target: { value: "GPT-5.5 Thinking" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model to provider" }));

    expect(screen.getAllByText("GPT-5.5 Thinking").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit model GPT-5.5 Thinking" }));
    expect(screen.getByLabelText("Model ID")).toHaveValue("gpt-5.5-thinking");
    expect(screen.getByLabelText("Model name")).toHaveValue("GPT-5.5 Thinking");
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gpt-5.5-thinking-updated" }
    });
    fireEvent.change(screen.getByLabelText("Model name"), {
      target: { value: "GPT-5.5 Thinking Updated" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Vision" }));
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Save model changes" }));

    expect(screen.getAllByText("GPT-5.5 Thinking Updated").length).toBeGreaterThan(0);
    expect(screen.queryByText("GPT-5.5 Thinking")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test" }
    });
    fireEvent.change(screen.getByLabelText("API URL"), {
      target: { value: "https://api.openai.com/v1" }
    });
    fireEvent.click(screen.getByRole("switch", { name: "Enable provider" }));
    fireEvent.click(screen.getByRole("button", { name: "Test API" }));

    await waitFor(() =>
      expect(mockedTestAiProviderConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
          id: "openai"
        }),
        expect.any(Function)
      )
    );
    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Connected"));
    expect(document.querySelector(".app-toaster")).toHaveStyle({ width: "fit-content" });
    expect(document.querySelector(".app-toast")).toHaveClass("app-toast-centered");
    expect(document.querySelector(".app-toast")).toHaveClass("left-1/2", "-translate-x-1/2");
    expect(document.querySelector(".app-toast")).toHaveClass(
      "w-fit",
      "max-w-[min(var(--app-toast-max-width,28rem),calc(100vw-3rem))]"
    );
    expect(document.querySelector(".app-toast")).not.toHaveClass("w-[min(var(--app-toast-width,20rem),calc(100vw-3rem))]");
    const toastTitle = document.querySelector(".app-toast [data-title]");
    expect(toastTitle).toHaveClass("whitespace-nowrap");
    expect(toastTitle).not.toHaveClass("break-words");
    expect(toastTitle).not.toHaveClass("truncate");
    expect(document.querySelector(".app-toast-close")).toBeInTheDocument();
    expect(document.querySelector(".app-toast-close")).toHaveClass("absolute", "right-2");
    expect(document.querySelector(".app-toast-close")).not.toHaveClass("ml-auto");
    expect(screen.getAllByText("Connected")).toHaveLength(1);
    fireEvent.click(document.querySelector(".app-toast-close") as HTMLElement);
    await waitFor(() => expect(document.querySelector(".app-toast")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Get model list" }));

    await waitFor(() =>
      expect(mockedFetchAiProviderModels).toHaveBeenCalledWith(expect.objectContaining({ id: "openai" }), expect.any(Function))
    );
    await waitFor(() => expect(screen.getAllByText("GPT-5").length).toBeGreaterThan(0));
    expect(screen.getAllByText("GPT Image 1").length).toBeGreaterThan(0);
    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Model list updated."));

    fireEvent.click(screen.getByRole("button", { name: "Save AI providers" }));

    await waitFor(() =>
      expect(mockedSaveStoredAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              apiKey: "sk-test",
              baseUrl: "https://api.openai.com/v1",
              enabled: true,
              id: "openai",
              models: expect.arrayContaining([
                expect.objectContaining({ id: "gpt-5" }),
                expect.objectContaining({ capabilities: ["image"], id: "gpt-image-1" }),
                expect.objectContaining({
                  capabilities: ["text", "tools"],
                  id: "gpt-5.5-thinking-updated",
                  name: "GPT-5.5 Thinking Updated"
                })
              ])
            })
          ])
        })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));

    expect(screen.getByLabelText("Provider name")).toHaveValue("Custom Provider");
    expect(screen.getByLabelText("API style")).toHaveValue("openai-compatible");
    expect(screen.getByLabelText("API URL")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete provider" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API style"), {
      target: { value: "anthropic" }
    });

    expect(screen.getByLabelText("API URL")).toHaveValue("https://api.anthropic.com/v1");

    fireEvent.click(screen.getByRole("button", { name: "Delete provider" }));

    expect(screen.queryByRole("button", { name: "Custom Provider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete provider" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OpenAI" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Provider deleted."));
  });

  it("renders long error details as a readable toast description", async () => {
    renderApp();

    act(() => {
      showAppToast({
        description: "S3 image upload failed: HTTP 403",
        message: "Could not save the pasted image.",
        status: "error"
      });
    });

    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Could not save the pasted image."));
    const toast = document.querySelector(".app-toast");
    const toastTitle = document.querySelector(".app-toast [data-title]");
    const toastDescription = document.querySelector(".app-toast [data-description]");

    expect(toast).toHaveClass("app-toast-readable-error");
    expect(toast).toHaveClass("w-fit", "[--app-toast-max-width:32rem]");
    expect(toast).not.toHaveClass("w-[min(var(--app-toast-width,20rem),calc(100vw-3rem))]");
    expect(toastTitle).toHaveTextContent("Could not save the pasted image.");
    expect(toastDescription).toHaveTextContent("S3 image upload failed: HTTP 403");
    expect(toastDescription).toHaveClass("whitespace-normal", "break-words", "text-(--text-secondary)");
    expect(toastTitle).not.toHaveTextContent("S3 image upload failed: HTTP 403");
  });

  it("shows runtime error diagnostics as a non-blocking notice", async () => {
    window.history.pushState({}, "", "/?mockError=1");

    renderApp();

    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Markra caught an error."));
    const notice = document.querySelector(".app-toast");
    expect(notice).toHaveClass("app-toast-notice");
    expect(notice).toHaveClass("w-[min(23rem,calc(100vw-1.5rem))]");
    expect(notice).toHaveClass("shadow-[0_2px_6px_rgba(15,23,42,0.08)]");
    expect(notice).not.toHaveClass("app-toast-centered");
    expect(notice).not.toHaveClass("left-1/2", "-translate-x-1/2");
    expect(screen.queryByRole("heading", { name: "Markra needs to reload" })).not.toBeInTheDocument();

    const submitIssueButton = screen.getByRole("button", { name: "Submit issue" });
    expect(submitIssueButton).toHaveClass("bg-(--accent)", "text-(--bg-primary)");
    expect(submitIssueButton).not.toHaveClass("bg-transparent", "text-(--accent)");

    fireEvent.click(submitIssueButton);

    await waitFor(() => expect(mockedOpenNativeExternalUrl).toHaveBeenCalledTimes(1));
    const issueUrl = new URL(mockedOpenNativeExternalUrl.mock.calls[0][0]);

    expect(issueUrl.pathname).toBe("/markrahq/markra/issues/new");
    expect(issueUrl.searchParams.get("title")).toBe("Runtime error report");
    expect(issueUrl.searchParams.get("body")).toContain("## Markra Crash Report");
    expect(issueUrl.searchParams.get("body")).toContain("- Error message: Mock runtime error preview");
  });

  it("resets the welcome document from settings", async () => {
    window.history.pushState({}, "", "/?settings=1");

    const { container } = renderApp();

    await waitFor(() => expect(container.querySelector(".settings-sidebar nav button")).toHaveAttribute("aria-current", "page"));
    expect(container.querySelector('[role="group"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show welcome next launch" }));

    await waitFor(() => expect(mockedResetWelcomeDocumentState).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("checks for updates from the settings window", async () => {
    window.history.pushState({}, "", "/?settings=1");
    let resolveUpdateCheck: (value: null) => void = () => {};
    mockedCheckNativeAppUpdate.mockReturnValue(new Promise((resolve) => {
      resolveUpdateCheck = resolve;
    }));

    renderApp();

    const checkUpdatesButton = await screen.findByRole("button", { name: "Check for updates" });

    fireEvent.click(checkUpdatesButton);

    await waitFor(() => expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Checking for Markra updates..."));
    expect(document.querySelector(".app-toast [data-icon]")).toHaveClass(
      "relative",
      "inline-flex",
      "size-4",
      "shrink-0",
      "items-center",
      "justify-center",
      "self-start"
    );

    await act(async () => {
      resolveUpdateCheck(null);
    });

    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Markra is up to date."));
  });

  it("stores the automatic update preference from the settings window", async () => {
    window.history.pushState({}, "", "/?settings=1");

    renderApp();

    const autoUpdateSwitch = await screen.findByRole("switch", { name: "Automatically check for updates" });

    expect(autoUpdateSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(autoUpdateSwitch);

    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      autoUpdateEnabled: false
    })));
    await waitFor(() => expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      autoUpdateEnabled: false
    })));
  });

  it("checks for updates from the native application menu", async () => {
    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1));
    mockedCheckNativeAppUpdate.mockClear();
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.checkForUpdates?.();
    });

    expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Markra is up to date."));
  });

  it("waits for stored automatic update preference before startup update checks", async () => {
    let resolveEditorPreferences: (preferences: Parameters<typeof mockedSaveStoredEditorPreferences>[0]) => void = () => {};
    mockedGetStoredEditorPreferences.mockReturnValue(new Promise((resolve) => {
      resolveEditorPreferences = resolve;
    }));

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    expect(mockedCheckNativeAppUpdate).not.toHaveBeenCalled();

    await act(async () => {
      resolveEditorPreferences(createStoredEditorPreferences({ autoUpdateEnabled: false }));
    });

    await waitFor(() => expect(mockedGetStoredEditorPreferences).toHaveBeenCalledTimes(1));
    expect(mockedCheckNativeAppUpdate).not.toHaveBeenCalled();
  });

  it("opens a folder markdown tree from the lower-left file list button", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { name: "guide.md", path: "/mock-files/docs/guide.md", relativePath: "docs/guide.md" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockNativePath, defaultFileTreeListOptions)
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("complementary", { name: "Markdown file tree" })).not.toHaveClass("fixed");
    expect(container.querySelector(".workspace-layout")).toHaveStyle({
      gridTemplateColumns: "288px minmax(0,1fr)"
    });
    expect(container.querySelector(".workspace-layout")).toHaveClass("transition-[grid-template-columns]");
    expect(container.querySelector(".file-tree-scroll")).toHaveClass("overscroll-none");
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("mock-files")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "native.md" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "docs/guide.md" })).not.toBeInTheDocument();
  });

  it("keeps the web file tree usable for new unsaved files before a folder is opened", async () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      features: {
        ai: true,
        export: true,
        nativeWindowChrome: false,
        networkProxy: true,
        pandoc: true,
        s3ImageUpload: true,
        spellcheck: true,
        updater: true
      }
    });

    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));

    expect(screen.getByRole("tree", { name: "Markdown files" })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText("No Markdown files"));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    act(() => {
      contextHandlers?.createFile?.();
    });

    const fileNameInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(fileNameInput, { target: { value: "Scratch.md" } });
    fireEvent.keyDown(fileNameInput, { key: "Enter" });

    expect(mockedCreateNativeMarkdownTreeFile).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Scratch\.md/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
  });

  it("resizes the left markdown file tree from its right edge", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));

    const resizeHandle = await screen.findByRole("separator", { name: "Resize Markdown files" });

    fireEvent.pointerDown(resizeHandle, { clientX: 288, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 360 });

    expect(container.querySelector(".workspace-layout")).toHaveStyle({
      gridTemplateColumns: "360px minmax(0,1fr)"
    });
    expect(container.querySelector(".native-titlebar-sidebar-surface")).toHaveStyle({
      width: "360px"
    });
    expect(container.querySelector(".native-title-slot")).toHaveStyle({
      marginLeft: "164px"
    });
    expect(container.querySelector(".markdown-file-tree")).toHaveStyle({
      width: "360px"
    });
    expect(container.querySelector(".markdown-file-tree")).toHaveClass("transition-none");

    fireEvent.pointerMove(window, { clientX: 680 });
    fireEvent.pointerMove(window, { clientX: 100 });
    fireEvent.pointerUp(window);

    expect(container.querySelector(".workspace-layout")).toHaveStyle({
      gridTemplateColumns: "220px minmax(0,1fr)"
    });
    expect(container.querySelector(".native-title-slot")).toHaveStyle({
      marginLeft: "24px"
    });
    expect(container.querySelector(".native-title-slot")).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".document-tabs-drag-spacer")).toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector(".native-title-slot")).not.toHaveStyle({ transform: "translateX(110px)" });
    expect(resizeHandle).toHaveAttribute("aria-valuemin", "220");
    expect(resizeHandle).toHaveAttribute("aria-valuemax", "440");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "220");
  });

  it("resizes the editor writing column and persists the custom width", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
      maxWidth: "860px"
    });

    const resizeHandle = await screen.findByRole("separator", { name: "Resize editor width" });
    const resizeShell = container.querySelector(".editor-width-resizer-shell");
    const resizeIndicator = container.querySelector(".editor-width-resizer-indicator");

    expect(resizeShell).toHaveClass("w-8");
    expect(resizeIndicator).toHaveClass("opacity-0");
    expect(resizeIndicator).toHaveClass("group-hover/width-resizer:opacity-100");

    fireEvent.pointerDown(resizeHandle, { clientX: 860, pointerId: 1 });
    await waitFor(() => expect(resizeIndicator).toHaveClass("opacity-100"));
    fireEvent.pointerMove(window, { clientX: 980 });
    fireEvent.pointerUp(window);

    expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
      maxWidth: "980px"
    });
    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      contentWidth: "default",
      contentWidthPx: 980
    })));
    await waitFor(() => expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      contentWidth: "default",
      contentWidthPx: 980
    })));

    await selectEditorViewMode("Source code");

    const sourceEditor = (await screen.findByTestId("markdown-source-editor")).closest<HTMLElement>(
      '[data-editor-engine="source"]'
    );
    expect(sourceEditor).toBeInTheDocument();
    expect(sourceEditor).toHaveAttribute("data-editor-engine", "source");
    expect(sourceEditor).toHaveStyle({
      maxWidth: "980px"
    });
    expect(screen.getByRole("separator", { name: "Resize editor width" })).toHaveAttribute("aria-valuenow", "980");
  });

  it("keeps the preset editor writing width fixed when the workspace has extra room", async () => {
    const restoreWindowInnerWidth = mockWindowInnerWidth(1688);

    try {
      renderApp();

      await expectVisibleMarkdownText("Welcome to Markra");
      expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
        maxWidth: "860px"
      });
      expect(screen.getByRole("separator", { name: "Resize editor width" })).toHaveAttribute("aria-valuenow", "860");
    } finally {
      restoreWindowInnerWidth();
    }
  });

  it("keeps saved custom editor writing widths fixed when the workspace has extra room", async () => {
    const restoreWindowInnerWidth = mockWindowInnerWidth(1688);
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      contentWidth: "default",
      contentWidthPx: 860
    }));

    try {
      renderApp();

      await expectVisibleMarkdownText("Welcome to Markra");
      expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
        maxWidth: "860px"
      });
      expect(screen.getByRole("separator", { name: "Resize editor width" })).toHaveAttribute("aria-valuenow", "860");
    } finally {
      restoreWindowInnerWidth();
    }
  });

  it("persists editor writing width resizes as fixed custom widths", async () => {
    const restoreWindowInnerWidth = mockWindowInnerWidth(1688);

    try {
      renderApp();

      await expectVisibleMarkdownText("Welcome to Markra");
      const resizeHandle = await screen.findByRole("separator", { name: "Resize editor width" });

      fireEvent.pointerDown(resizeHandle, { clientX: 860, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 980 });
      fireEvent.pointerUp(window);

      expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
        maxWidth: "980px"
      });
      await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
        contentWidth: "default",
        contentWidthPx: 980
      })));
    } finally {
      restoreWindowInnerWidth();
    }
  });

  it("hides the editor writing width handle while the right AI sidebar leaves little editor space", async () => {
    const restoreWindowInnerWidth = mockWindowInnerWidth(1120);
    const { container } = renderApp();

    try {
      await expectVisibleMarkdownText("Welcome to Markra");
      expect(screen.getByLabelText("Markdown editor")).toHaveStyle({
        maxWidth: "860px"
      });
      expect(screen.getByRole("separator", { name: "Resize editor width" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));

      expect(await screen.findByRole("complementary", { name: "Markra AI" })).toBeInTheDocument();
      expect(screen.queryByRole("separator", { name: "Resize editor width" })).not.toBeInTheDocument();
      expect(container.querySelector(".editor-width-resizer-indicator")).not.toBeInTheDocument();
    } finally {
      restoreWindowInnerWidth();
    }
  });

  it("keeps the editor writing width handle visible with the right AI sidebar when the editor has wide gutters", async () => {
    const restoreWindowInnerWidth = mockWindowInnerWidth(1600);
    const { container } = renderApp();

    try {
      await expectVisibleMarkdownText("Welcome to Markra");

      fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));

      expect(await screen.findByRole("complementary", { name: "Markra AI" })).toBeInTheDocument();
      expect(screen.getByRole("separator", { name: "Resize editor width" })).toBeInTheDocument();
      expect(container.querySelector(".editor-width-resizer-shell")).toHaveClass("w-8");
      expect(container.querySelector(".editor-width-resizer-indicator")).toHaveClass("opacity-0");
    } finally {
      restoreWindowInnerWidth();
    }
  });

  it("removes the markdown file tree hit area when the sidebar is collapsed", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    const toggle = screen.getByRole("button", { name: "Toggle file list" });
    fireEvent.click(toggle);
    expect(screen.getByRole("complementary", { name: "Markdown file tree" })).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(toggle);

    expect(container.querySelector(".markdown-file-tree")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("separator", { name: "Resize Markdown files" })).not.toBeInTheDocument();
    expect(container.querySelector('[role="separator"][aria-label="Resize Markdown files"]')).not.toBeInTheDocument();
  });

  it("opens a markdown folder from the shared Cmd+O open picker", async () => {
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "vault" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled.md" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
  });

  it("opens unused image cleanup from an open workspace", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      files: {
        ...runtime.files,
        listMarkdownReferenceFilesForPath: vi.fn().mockResolvedValue([]),
        trashMarkdownAssets: vi.fn()
      }
    });
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" }
    ]);

    renderApp();
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await screen.findByRole("button", { name: "index.md" });

    fireEvent.click(screen.getByRole("button", { name: "Clean up unused images" }));

    expect(await screen.findByRole("dialog", { name: "Clean up unused images" })).toBeInTheDocument();
  });

  it("opens a markdown folder from the Windows file tree header", async () => {
    mockedResolveDesktopPlatform.mockReturnValue("windows");
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: mockFolderPath,
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Toggle workspace sidebar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Folder" }));

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(mockedOpenNativeMarkdownFolder).toHaveBeenCalledTimes(1);
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
    expect(mockedOpenNativeMarkdownPath).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState.mock.calls.at(-1)?.[0]).toEqual({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: []
    });
  });

  it("starts the Windows file tree folder picker in the same click turn when the document is clean", async () => {
    mockedResolveDesktopPlatform.mockReturnValue("windows");
    let resolveFolder: ((folder: { name: string; path: string }) => unknown) | null = null;
    mockedOpenNativeMarkdownFolder.mockReturnValue(new Promise((resolve) => {
      resolveFolder = resolve;
    }));

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Toggle workspace sidebar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Folder" }));

    expect(mockedOpenNativeMarkdownFolder).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFolder?.({
        name: "vault",
        path: mockFolderPath
      });
    });
  });

  it("opens a remembered markdown folder from the sidebar recent folders area", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" }
    ]);
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/notes/index.md", relativePath: "index.md" }
    ]);

    renderApp();

    await waitFor(() => expect(mockedGetStoredRecentMarkdownFolders).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    const recentSection = await screen.findByRole("region", { name: "Recently used directories" });
    fireEvent.click(within(recentSection).getByRole("button", { name: "notes" }));

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getAllByText("notes").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(mockedOpenNativeMarkdownFolder).not.toHaveBeenCalled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith("/mock-files/notes", defaultFileTreeListOptions);
    expect(mockedSaveStoredRecentMarkdownFolder).toHaveBeenCalledWith({
      name: "notes",
      path: "/mock-files/notes"
    });
    expect(mockedSaveStoredWorkspaceState.mock.calls.at(-1)?.[0]).toEqual({
      aiAgentSessionId: "session-app",
      filePath: null,
      fileTreeOpen: true,
      folderName: "notes",
      folderPath: "/mock-files/notes",
      openFilePaths: []
    });
  });

  it("removes a remembered markdown folder from the sidebar recent folders area", async () => {
    mockedGetStoredRecentMarkdownFolders.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" },
      { name: "test", path: "/mock-files/test" }
    ]);

    renderApp();

    await waitFor(() => expect(mockedGetStoredRecentMarkdownFolders).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    const recentSection = await screen.findByRole("region", { name: "Recently used directories" });

    fireEvent.click(within(recentSection).getByRole("button", { name: "Remove from recent directories: notes" }));

    await waitFor(() => expect(within(recentSection).queryByRole("button", { name: "notes" })).not.toBeInTheDocument());
    expect(within(recentSection).getByRole("button", { name: "test" })).toBeInTheDocument();
    expect(mockedRemoveStoredRecentMarkdownFolder).toHaveBeenCalledWith("/mock-files/notes");
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalled();
  });

  it("opens a markdown folder from the native application menu", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: mockFolderPath,
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openFolder?.();
    });

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(mockedOpenNativeMarkdownFolder).toHaveBeenCalledTimes(1);
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
  });

  it("opens a markdown folder into the sidebar file tree", async () => {
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: mockFolderPath,
      name: "vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: "vault" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled.md" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
  });

  it("creates a folder inside the selected sidebar folder from the context menu", async () => {
    const docsPath = "/mock-files/vault/docs";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { kind: "folder", name: "docs", path: docsPath, relativePath: "docs" },
      { name: "note.md", path: `${docsPath}/note.md`, relativePath: "docs/note.md" }
    ]);
    mockedCreateNativeMarkdownTreeFolder.mockResolvedValue({
      kind: "folder",
      name: "Sprint",
      path: `${docsPath}/Sprint`,
      relativePath: "docs/Sprint"
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    const folderButton = await screen.findByRole("button", { name: "docs" });

    fireEvent.contextMenu(folderButton);
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    act(() => {
      contextHandlers?.createFolder?.();
    });

    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
    const docsChildren = screen.getByRole("group", { name: "docs children" });
    const folderNameInput = within(docsChildren).getByRole("textbox", { name: "New folder name" });
    fireEvent.change(folderNameInput, { target: { value: "Sprint" } });
    fireEvent.keyDown(folderNameInput, { key: "Enter" });

    await waitFor(() =>
      expect(mockedCreateNativeMarkdownTreeFolder).toHaveBeenCalledWith(mockFolderPath, "Sprint", docsPath)
    );
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
  });

  it("keeps a newly created Windows tree file selected without opening duplicate tabs", async () => {
    const rootPath = "C:\\mock-vault";
    const treeFilePath = "C:\\mock-vault\\Created.md";
    const createdFilePath = "\\\\?\\C:\\mock-vault\\Created.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: rootPath,
      name: "mock-vault"
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: "Created.md", path: treeFilePath, relativePath: "Created.md" }
      ]);
    mockedCreateNativeMarkdownTreeFile.mockResolvedValue({
      name: "Created.md",
      path: createdFilePath,
      relativePath: "Created.md"
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => ({
      content: "# Created\n\nSynthetic note.",
      name: "Created.md",
      path
    }));

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("heading", { name: "mock-vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
    const fileNameInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(fileNameInput, { target: { value: "Created" } });
    fireEvent.keyDown(fileNameInput, { key: "Enter" });

    const createdTreeButton = await screen.findByRole("button", { name: "Created.md" });
    expect(createdTreeButton).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("tab", { name: /Created\.md/ })).toHaveLength(1);

    fireEvent.click(createdTreeButton);

    await waitFor(() =>
      expect(screen.getAllByRole("tab", { name: /Created\.md/ })).toHaveLength(1)
    );
    expect(screen.getByRole("tab", { name: /Created\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows native file tree create and rename errors", async () => {
    const indexPath = `${mockFolderPath}/index.md`;
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      path: mockFolderPath,
      name: "mock-vault"
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: indexPath, relativePath: "index.md" },
      { name: "notes.md", path: `${mockFolderPath}/notes.md`, relativePath: "notes.md" }
    ]);
    mockedCreateNativeMarkdownTreeFile.mockRejectedValue(new Error("File already exists"));
    mockedRenameNativeMarkdownTreeFile.mockRejectedValue(new Error("File already exists"));

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("heading", { name: "mock-vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New file" }));
    const fileNameInput = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(fileNameInput, { target: { value: "index.md" } });
    fireEvent.keyDown(fileNameInput, { key: "Enter" });

    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Could not create file. File already exists"));

    fireEvent.contextMenu(screen.getByRole("button", { name: "index.md" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    act(() => {
      contextHandlers?.renameFile?.({
        name: "index.md",
        path: indexPath,
        relativePath: "index.md"
      });
    });
    const renameInput = screen.getByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "notes.md" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => expect(document.querySelector(".app-toast")).toHaveTextContent("Could not rename file. File already exists"));
  });

  it("deletes a sidebar folder from the context menu", async () => {
    const docsPath = `${mockFolderPath}/docs`;
    const docsFolder = { kind: "folder" as const, name: "docs", path: docsPath, relativePath: "docs" };
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      docsFolder,
      { name: "guide.md", path: `${docsPath}/guide.md`, relativePath: "docs/guide.md" }
    ]);
    mockedConfirmNativeMarkdownFileDelete.mockResolvedValue(true);
    mockedDeleteNativeMarkdownTreeFile.mockResolvedValue(undefined);

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    const folderButton = await screen.findByRole("button", { name: "docs" });
    fireEvent.contextMenu(folderButton);
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];

    act(() => {
      contextHandlers?.deleteFile?.(docsFolder);
    });

    await waitFor(() =>
      expect(mockedConfirmNativeMarkdownFileDelete).toHaveBeenCalledWith("docs", {
        cancelLabel: "Cancel",
        message: "Delete this folder?",
        okLabel: "Confirm"
      })
    );
    await waitFor(() => expect(mockedDeleteNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, docsPath));
  });

  it("uses plural confirmation copy when deleting selected sidebar files", async () => {
    const alphaFile = { name: "alpha.md", path: `${mockFolderPath}/alpha.md`, relativePath: "alpha.md" };
    const betaFile = { name: "beta.md", path: `${mockFolderPath}/beta.md`, relativePath: "beta.md" };
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([alphaFile, betaFile]);
    mockedConfirmNativeMarkdownFileDelete.mockResolvedValue(true);
    mockedDeleteNativeMarkdownTreeFile.mockResolvedValue(undefined);

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    const alphaButton = await screen.findByRole("button", { name: "alpha.md" });
    const betaButton = await screen.findByRole("button", { name: "beta.md" });
    fireEvent.click(alphaButton, { metaKey: true });
    fireEvent.click(betaButton, { metaKey: true });
    fireEvent.contextMenu(alphaButton);
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];

    await act(async () => {
      await contextHandlers?.deleteFile?.(alphaFile);
    });

    await waitFor(() =>
      expect(mockedConfirmNativeMarkdownFileDelete).toHaveBeenCalledWith("2 files", {
        cancelLabel: "Cancel",
        message: "Delete these 2 files?",
        okLabel: "Confirm"
      })
    );
    await waitFor(() => expect(mockedDeleteNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, alphaFile.path));
    await waitFor(() => expect(mockedDeleteNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, betaFile.path));
    expect(mockedConfirmNativeMarkdownFileDelete).toHaveBeenCalledTimes(1);
  });

  it("saves a sidebar markdown file as a custom template", async () => {
    const templatePath = `${mockFolderPath}/standup.md`;
    const templateFile = { name: "standup.md", path: templatePath, relativePath: "standup.md" };
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([templateFile]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Standup\n\n## Yesterday",
      name: "standup.md",
      path: templatePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    const fileButton = await screen.findByRole("button", { name: "standup.md" });

    fireEvent.contextMenu(fileButton);
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];

    await act(async () => {
      await contextHandlers?.saveFileAsTemplate?.(templateFile);
    });

    await waitFor(() => expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(templatePath));
    await waitFor(() =>
      expect(mockedWriteNativeMarkdownTemplateFile).toHaveBeenCalledWith("custom-template.md", "# Standup\n\n## Yesterday")
    );
    expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      markdownTemplates: [
        expect.objectContaining({
          fileName: "custom-template.md",
          id: "custom-template",
          name: "standup",
          suggestedName: "standup"
        })
      ]
    }));
    expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      markdownTemplates: [
        expect.objectContaining({
          fileName: "custom-template.md",
          id: "custom-template",
          name: "standup",
          suggestedName: "standup"
        })
      ]
    }));
  });

  it("opens a markdown file from the current folder tree", async () => {
    const guidePath = "/mock-files/docs/guide.md";
    const rootTree = [
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ];
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockImplementation(async (path) =>
      path === guidePath ? [{ name: "guide.md", path: guidePath, relativePath: "guide.md" }] : rootTree
    );
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened from the folder tree.",
      name: "guide.md",
      path: guidePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));

    await expectVisibleMarkdownText("Guide");
    expect(screen.getByText("Opened from the folder tree.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "native.md" })).toBeInTheDocument();
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalledWith(guidePath, defaultFileTreeListOptions);
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
  });

  it("closes the current markdown file from Cmd+W without closing the window", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    fireEvent.keyDown(window, { key: "w", metaKey: true });

    await waitFor(() => expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument());
    expect(screen.queryByText("Native file")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "mock-files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith(expect.objectContaining({
      activeDraftId: null,
      draftTabs: [],
      filePath: null,
      openFilePaths: []
    }));
  });

  it("previews an image asset from the current folder tree and returns to markdown files", async () => {
    const guidePath = "/mock-files/docs/guide.md";
    const imagePath = "/mock-files/assets/pasted-image.png";
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { kind: "folder", name: "assets", path: "/mock-files/assets", relativePath: "assets" },
      { kind: "asset", name: "pasted-image.png", path: imagePath, relativePath: "assets/pasted-image.png" },
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened from the folder tree.",
      name: "guide.md",
      path: guidePath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets/pasted-image.png" }));

    const previewImage = await screen.findByRole("img", { name: "pasted-image.png" });
    expect(previewImage).toHaveAttribute("src", imagePath);
    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /native\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /pasted-image\.png/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "pasted-image.png" })).not.toBeInTheDocument();
    expect(queryVisibleCodeMirrorEditor(container)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: /native\.md/ }));

    await expectVisibleMarkdownText("Native file");
    expect(getVisibleCodeMirrorEditor(container)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "pasted-image.png" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /pasted-image\.png/ }));

    expect(await screen.findByRole("img", { name: "pasted-image.png" })).toBeInTheDocument();
    expect(queryVisibleCodeMirrorEditor(container)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));

    await expectVisibleCodeMirrorText(container, "Guide");
    expect(getVisibleCodeMirrorEditor(container)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "pasted-image.png" })).not.toBeInTheDocument();
  });

  it("inserts a dragged file-tree image asset at the editor drop point", async () => {
    const imagePath = "/mock-files/assets/diagram.png";
    mockOpenMarkdownFile({
      content: "First\n\n\n\nSecond",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { kind: "folder", name: "assets", path: "/mock-files/assets", relativePath: "assets" },
      { kind: "asset", name: "diagram.png", path: imagePath, relativePath: "assets/diagram.png" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("First");
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockNativePath, defaultFileTreeListOptions)
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets" }));

    const view = getVisibleCodeMirrorView(container);
    const editorSurface = view.contentDOM;
    const dropPosition = "First\n\n".length;
    const posAtCoords = vi.spyOn(view, "posAtCoords").mockReturnValue(dropPosition);
    const assetButton = await screen.findByRole("button", { name: "assets/diagram.png" });
    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(assetButton, { dataTransfer });
    dispatchDragEvent(editorSurface, "drop", {
      clientX: 340,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(assetButton, "dragend", {
      clientX: 340,
      clientY: 160,
      dataTransfer
    });

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("First\n\n![diagram](assets/diagram.png)\n\nSecond");
    });
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    });
    const image = await waitFor(() => {
      const insertedImage = editorSurface.querySelector<HTMLImageElement>('img[src="assets/diagram.png"]');
      expect(insertedImage).toBeInTheDocument();
      return insertedImage!;
    });
    expect(image).toHaveAttribute("alt", "diagram");
    expect(editorSurface.querySelectorAll('img[src="assets/diagram.png"]')).toHaveLength(1);
    expect(posAtCoords).toHaveBeenCalledWith({ x: 340, y: 160 });
  });

  it("inserts a dragged file-tree image asset from the source drag end when editor drop is unavailable", async () => {
    const imagePath = "/mock-files/assets/diagram.png";
    mockOpenMarkdownFile({
      content: "First\n\n\n\nSecond",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { kind: "folder", name: "assets", path: "/mock-files/assets", relativePath: "assets" },
      { kind: "asset", name: "diagram.png", path: imagePath, relativePath: "assets/diagram.png" }
    ]);

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("First");
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockNativePath, defaultFileTreeListOptions)
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(await screen.findByRole("button", { name: "assets" }));

    const view = getVisibleCodeMirrorView(container);
    const editorSurface = view.contentDOM;
    const posAtCoords = vi.spyOn(view, "posAtCoords").mockReturnValue("First\n\n".length);
    const assetButton = await screen.findByRole("button", { name: "assets/diagram.png" });
    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(assetButton, { dataTransfer });
    dispatchDragEvent(assetButton, "dragend", {
      clientX: 340,
      clientY: 160,
      dataTransfer
    });

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("First\n\n![diagram](assets/diagram.png)\n\nSecond");
    });
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    });
    await waitFor(() => {
      expect(editorSurface.querySelector('img[src="assets/diagram.png"]')).toHaveAttribute("alt", "diagram");
    });
    expect(posAtCoords).toHaveBeenCalledWith({ x: 340, y: 160 });
  });

  it("inserts a system-dropped image file reference at the editor drop point", async () => {
    mockOpenMarkdownFile({
      content: "First\n\n\n\nSecond",
      name: "native.md",
      path: mockNativePath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("First");

    const view = getVisibleCodeMirrorView(container);
    const editorSurface = view.contentDOM;
    const posAtCoords = vi.spyOn(view, "posAtCoords").mockReturnValue("First\n\n".length);
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({
        kind: "image",
        name: "System Drop.png",
        path: "/mock-files/System Drop.png",
        point: {
          left: 340,
          top: 160
        }
      });
    });

    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("First\n\n![System Drop](System%20Drop.png)\n\nSecond");
    });
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    });
    await waitFor(() => {
      expect(editorSurface.querySelector<HTMLImageElement>('img[src="System%20Drop.png"]')).toHaveAttribute(
        "alt",
        "System Drop"
      );
    });
    expect(mockedReadNativeLocalImageFile).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).not.toHaveBeenCalled();
    expect(mockedOpenNativeMarkdownFileInNewWindow).not.toHaveBeenCalledWith("/mock-files/System Drop.png");
    expect(posAtCoords).toHaveBeenCalledWith({ x: 340, y: 160 });
  });

  it("falls back to the current cursor when a system image drop point cannot be resolved", async () => {
    mockOpenMarkdownFile({
      content: "",
      name: "native.md",
      path: mockNativePath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const view = getVisibleCodeMirrorView(container);
    const posAtCoords = vi.spyOn(view, "posAtCoords").mockReturnValue(null);
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({
        kind: "image",
        name: "System Drop.png",
        path: "/mock-files/System Drop.png",
        point: {
          left: -1000,
          top: -1000
        }
      });
    });

    expect(view.state.doc.toString()).toBe("![System Drop](System%20Drop.png)");
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    });
    await waitFor(() => {
      expect(view.dom.querySelector<HTMLImageElement>('img[src="System%20Drop.png"]')).toHaveAttribute(
        "alt",
        "System Drop"
      );
    });
    expect(posAtCoords).toHaveBeenCalledWith({ x: -1000, y: -1000 });
    expect(mockedReadNativeLocalImageFile).not.toHaveBeenCalled();
    expect(mockedSaveNativeClipboardImage).not.toHaveBeenCalled();
  });

  it("previews an image asset from a folder-only workspace", async () => {
    const imagePath = "/mock-files/vault/assets/pasted-image.png";
    const objectUrl = "blob:markra-image-preview";
    const imageFile = new File([new Uint8Array([1, 2, 3])], "pasted-image.png", { type: "image/png" });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { kind: "folder", name: "assets", path: "/mock-files/vault/assets", relativePath: "assets" },
      { kind: "asset", name: "pasted-image.png", path: imagePath, relativePath: "assets/pasted-image.png" }
    ]);
    mockedReadNativeLocalImageFile.mockResolvedValue(imageFile);

    try {
      renderApp();

      fireEvent.keyDown(window, { key: "o", metaKey: true });
      expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();

      fireEvent.click(await screen.findByRole("button", { name: "assets" }));
      fireEvent.click(await screen.findByRole("button", { name: "assets/pasted-image.png" }));

      const previewImage = await screen.findByRole("img", { name: "pasted-image.png" });
      await waitFor(() => expect(previewImage).toHaveAttribute("src", objectUrl));
      expect(mockedReadNativeLocalImageFile).toHaveBeenCalledWith(imagePath);
      expect(createObjectUrl).toHaveBeenCalledWith(imageFile);
      expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    } finally {
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
    }
  });

  it("switches between unmodified folder files without asking to discard changes", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide\n\nRead-only content.",
          name: "guide.md",
          path: guidePath
        };
      }

      return {
        content: "# Notes\n\nSecond read-only content.",
        name: "notes.md",
        path: notesPath
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleCodeMirrorText(container, "Guide");

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleCodeMirrorText(container, "Notes");

    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();
  });

  it("shows open markdown files in a tab strip when document tabs are enabled", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide",
          name: "guide.md",
          path: guidePath
        };
      }

      return {
        content: "# Notes",
        name: "notes.md",
        path: notesPath
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleMarkdownText("Guide");

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleMarkdownText("Notes");

    expect(screen.getByRole("tablist", { name: "Open documents" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /notes\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".native-title")).not.toBeInTheDocument();
    expect(container.querySelector(".native-title-slot .document-tabs")).toBeInTheDocument();
    expect(container.querySelector(".editor-content-slot .document-tabs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));

    await expectVisibleCodeMirrorText(container, "Guide");
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps visual undo history after switching document tabs", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide",
          name: "guide.md",
          path: guidePath
        };
      }

      return {
        content: "# Notes",
        name: "notes.md",
        path: notesPath
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleCodeMirrorText(container, "Guide");

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleCodeMirrorText(container, "Notes");

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));
    await expectVisibleCodeMirrorText(container, "Guide");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    act(() => {
      menuHandlers.insertTable?.();
    });
    revealVisualPreviews(container);
    await waitFor(() => expect(queryVisibleCodeMirrorTable(container)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /notes\.md/ }));
    await expectVisibleCodeMirrorText(container, "Notes");

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));
    await expectVisibleCodeMirrorText(container, "Guide");
    await waitFor(() => expect(queryVisibleCodeMirrorTable(container)).toBeInTheDocument());

    act(() => {
      menuHandlers.editUndo?.();
    });
    await waitFor(() => expect(queryVisibleCodeMirrorTable(container)).not.toBeInTheDocument());

    act(() => {
      menuHandlers.editRedo?.();
    });
    revealVisualPreviews(container);
    await waitFor(() => expect(queryVisibleCodeMirrorTable(container)).toBeInTheDocument());
  });

  it("refreshes a clean inactive document tab from disk when selecting it", async () => {
    const mainPath = "/mock-files/vault/main.md";
    const sidePath = "/mock-files/vault/side.md";
    const diskContent = new Map([
      [mainPath, "# Main\n\nCurrent text"],
      [sidePath, "# Side\n\nCached text"]
    ]);
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "main.md", path: mainPath, relativePath: "main.md" },
      { name: "side.md", path: sidePath, relativePath: "side.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => ({
      content: diskContent.get(path) ?? "",
      name: path === mainPath ? "main.md" : "side.md",
      path
    }));

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "main.md" }));
    await expectVisibleCodeMirrorText(container, "Current text");

    fireEvent.click(await screen.findByRole("button", { name: "side.md" }));
    await expectVisibleCodeMirrorText(container, "Cached text");

    fireEvent.click(screen.getByRole("tab", { name: /main\.md/ }));
    await expectVisibleCodeMirrorText(container, "Current text");

    diskContent.set(sidePath, "# Side\n\nFresh disk text");
    fireEvent.click(screen.getByRole("tab", { name: /side\.md/ }));

    await expectVisibleCodeMirrorText(container, "Fresh disk text");
  });

  it("shows document status for both panes in side-by-side mode", async () => {
    const mainPath = "/mock-files/vault/main.md";
    const sidePath = "/mock-files/vault/side.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "main.md", path: mainPath, relativePath: "main.md" },
      { name: "side.md", path: sidePath, relativePath: "side.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === mainPath) {
        return {
          content: "main words",
          name: "main.md",
          path: mainPath
        };
      }

      return {
        content: "side pane words",
        name: "side.md",
        path: sidePath
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "main.md" }));
    await expectVisibleCodeMirrorText(container, "main words");

    fireEvent.click(await screen.findByRole("button", { name: "side.md" }));
    await expectVisibleCodeMirrorText(container, "side pane words");

    fireEvent.click(screen.getByRole("tab", { name: /main\.md/ }));
    await expectVisibleCodeMirrorText(container, "main words");
    fireEvent.contextMenu(screen.getByRole("tab", { name: /side\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    const mainPane = container.querySelector(".editor-side-by-side-surface > div:first-child") as HTMLElement;
    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    const mainStatus = mainPane.querySelector(".quiet-status");
    const sideStatus = sidePane.querySelector(".quiet-status");

    expect(mainStatus).toHaveTextContent("2 words");
    expect(mainStatus).toHaveTextContent("saved");
    expect(sideStatus).toHaveTextContent("3 words");
    expect(sideStatus).toHaveTextContent("saved");
  });

  it("reloads a clean side document when its native watcher reports an external change", async () => {
    const mainPath = "/mock-files/vault/main.md";
    const sidePath = "/mock-files/vault/side.md";
    const diskContent = new Map([
      [mainPath, "# Main\n\nPrimary text"],
      [sidePath, "# Side\n\nBefore agent edit"]
    ]);
    const watchHandlers = new Map<string, (path: string) => unknown | Promise<unknown>>();
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "main.md", path: mainPath, relativePath: "main.md" },
      { name: "side.md", path: sidePath, relativePath: "side.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => ({
      content: diskContent.get(path) ?? "",
      name: path === mainPath ? "main.md" : "side.md",
      path
    }));
    mockedWatchNativeMarkdownFile.mockImplementation(async (path, onChange) => {
      watchHandlers.set(path, onChange);
      return () => {
        watchHandlers.delete(path);
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "main.md" }));
    await expectVisibleCodeMirrorText(container, "Primary text");

    fireEvent.click(await screen.findByRole("button", { name: "side.md" }));
    await expectVisibleCodeMirrorText(container, "Before agent edit");

    fireEvent.click(screen.getByRole("tab", { name: /main\.md/ }));
    await expectVisibleCodeMirrorText(container, "Primary text");
    fireEvent.contextMenu(screen.getByRole("tab", { name: /side\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    await waitFor(() => expect(watchHandlers.has(sidePath)).toBe(true));

    diskContent.set(sidePath, "# Side\n\nAfter agent edit");
    await act(async () => {
      await watchHandlers.get(sidePath)?.(sidePath);
    });

    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    await waitFor(() => expect(within(sidePane).getByText("After agent edit")).toBeInTheDocument());
  });

  it("opens a document tab to a side editor, toggles both panes to source mode, and closes the side tab from the titlebar", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    const thirdPath = "/mock-files/vault/docs/third.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" },
      { name: "third.md", path: thirdPath, relativePath: "docs/third.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide\n\nReference",
          name: "guide.md",
          path: guidePath
        };
      }

      if (path === thirdPath) {
        return {
          content: "# Third\n\nIndependent",
          name: "third.md",
          path: thirdPath
        };
      }

      return {
        content: "# Notes\n\nDraft",
        name: "notes.md",
        path: notesPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleCodeMirrorText(container, "Guide");

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleCodeMirrorText(container, "Notes");

    fireEvent.click(await screen.findByRole("button", { name: "docs/third.md" }));
    await expectVisibleCodeMirrorText(container, "Third");

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));
    await expectVisibleCodeMirrorText(container, "Guide");

    fireEvent.contextMenu(screen.getByRole("tab", { name: /notes\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    const sideSurface = container.querySelector(".editor-side-by-side-surface");
    expect(sideSurface).toBeInTheDocument();
    const sideBySideTabGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(sideBySideTabGroup).toBeInTheDocument();
    expect(within(sideBySideTabGroup).getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(sideBySideTabGroup).getByRole("tab", { name: /notes\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(within(sideBySideTabGroup).getByRole("button", { name: "Close tab guide.md" })).toBeInTheDocument();
    expect(within(sideBySideTabGroup).getByRole("button", { name: "Close tab notes.md" })).toBeInTheDocument();
    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    await waitFor(() => expect(within(sidePane).getByText("Notes")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /third\.md/ }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /third\.md/ })).toHaveAttribute("aria-selected", "true");
    const inactiveSideBySideTabGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(inactiveSideBySideTabGroup).toBeInTheDocument();
    expect(within(inactiveSideBySideTabGroup).getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(within(inactiveSideBySideTabGroup).getByRole("tab", { name: /notes\.md/ })).toHaveAttribute("aria-selected", "false");

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByRole("tab", { name: /notes\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /third\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    const replacedSideBySideTabGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(within(replacedSideBySideTabGroup).getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(replacedSideBySideTabGroup).queryByRole("tab", { name: /notes\.md/ })).not.toBeInTheDocument();
    expect(within(replacedSideBySideTabGroup).getByRole("tab", { name: /third\.md/ })).toHaveAttribute("aria-selected", "false");
    await waitFor(() =>
      expect(within(container.querySelector(".side-document-pane") as HTMLElement).getByText("Third")).toBeInTheDocument()
    );

    const replacedSidePane = container.querySelector(".side-document-pane") as HTMLElement;
    expect(within(replacedSidePane).queryByRole("button", { name: "Save side document" })).not.toBeInTheDocument();
    expect(within(replacedSidePane).queryByRole("button", { name: "Close side document" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox", { name: "Markdown source" })).toHaveLength(0);

    const sourceModeButton = screen.getByRole("button", { name: "Editor view mode: Preview" });
    expect(sourceModeButton).toBeEnabled();
    await selectEditorViewMode("Source code");

    const sourceEditors = await screen.findAllByRole("textbox", { name: "Markdown source" });
    expect(sourceEditors.map((editor) => readMarkdownSource(editor).trimEnd())).toEqual(
      expect.arrayContaining(["# Guide\n\nReference", "# Third\n\nIndependent"])
    );

    const sideSource = await within(replacedSidePane).findByRole("textbox", { name: "Markdown source" });
    expect(readMarkdownSource(sideSource).trimEnd()).toBe("# Third\n\nIndependent");

    replaceMarkdownSource(sideSource, "# Third\n\nIndependent update");
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");

    await selectEditorViewMode("Preview");
    expect(screen.queryAllByRole("textbox", { name: "Markdown source" })).toHaveLength(0);
    await waitFor(() => expect(within(replacedSidePane).getByText("Independent update")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Close tab third.md" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a pointer-dragged active document tab beside the tab it is released on", async () => {
    const firstPath = "/mock-files/vault/docs/alpha.md";
    const secondPath = "/mock-files/vault/docs/beta.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "alpha.md", path: firstPath, relativePath: "docs/alpha.md" },
      { name: "beta.md", path: secondPath, relativePath: "docs/beta.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# Alpha\n\nMain",
          name: "alpha.md",
          path: firstPath
        };
      }

      return {
        content: "# Beta\n\nReference",
        name: "beta.md",
        path: secondPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/alpha.md" }));
    await expectVisibleMarkdownText("Alpha");

    fireEvent.click(await screen.findByRole("button", { name: "docs/beta.md" }));
    await expectVisibleMarkdownText("Beta");

    const alphaTab = screen.getByRole("tab", { name: /alpha\.md/ });
    const betaTab = screen.getByRole("tab", { name: /beta\.md/ });
    const elementFromPoint = mockElementFromPoint(alphaTab);

    fireEvent.pointerDown(betaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 80, clientY: 12, pointerId: 1 });

    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    const groupedTabs = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(within(groupedTabs).getByRole("tab", { name: /alpha\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(groupedTabs).getByRole("tab", { name: /beta\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(await within(container.querySelector(".side-document-pane") as HTMLElement).findByText("Reference")).toBeInTheDocument();
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("opens a pointer-dragged document tab to the side when released over the editor area", async () => {
    const firstPath = "/mock-files/vault/docs/alpha.md";
    const secondPath = "/mock-files/vault/docs/beta.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "alpha.md", path: firstPath, relativePath: "docs/alpha.md" },
      { name: "beta.md", path: secondPath, relativePath: "docs/beta.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# Alpha\n\nReference",
          name: "alpha.md",
          path: firstPath
        };
      }

      return {
        content: "# Beta\n\nMain",
        name: "beta.md",
        path: secondPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/alpha.md" }));
    await expectVisibleMarkdownText("Alpha");

    fireEvent.click(await screen.findByRole("button", { name: "docs/beta.md" }));
    await expectVisibleMarkdownText("Beta");

    const alphaTab = screen.getByRole("tab", { name: /alpha\.md/ });
    const editorArea = container.querySelector(".editor-content-slot") as HTMLElement;
    const elementFromPoint = mockElementFromPoint(editorArea);

    fireEvent.pointerDown(alphaTab, { button: 0, clientX: 20, clientY: 12, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 220, pointerId: 1 });
    expect(editorArea).toHaveAttribute("data-document-tab-pointer-drop-target", "true");
    expect(editorArea.className).not.toContain("data-[document-tab-pointer-drop-target=true]:ring");
    fireEvent.pointerUp(window, { clientX: 220, clientY: 220, pointerId: 1 });

    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    const groupedTabs = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(within(groupedTabs).getByRole("tab", { name: /beta\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(groupedTabs).getByRole("tab", { name: /alpha\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(await within(container.querySelector(".side-document-pane") as HTMLElement).findByText("Reference")).toBeInTheDocument();
    expect(elementFromPoint).toHaveBeenCalled();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("cancels a side-by-side document group from the grouped tab menu", async () => {
    const firstPath = "/mock-files/vault/docs/alpha.md";
    const secondPath = "/mock-files/vault/docs/beta.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "alpha.md", path: firstPath, relativePath: "docs/alpha.md" },
      { name: "beta.md", path: secondPath, relativePath: "docs/beta.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# Alpha\n\nMain",
          name: "alpha.md",
          path: firstPath
        };
      }

      return {
        content: "# Beta\n\nReference",
        name: "beta.md",
        path: secondPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/alpha.md" }));
    await expectVisibleMarkdownText("Alpha");

    fireEvent.click(await screen.findByRole("button", { name: "docs/beta.md" }));
    await expectVisibleMarkdownText("Beta");

    fireEvent.contextMenu(screen.getByRole("tab", { name: /alpha\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    expect(container.querySelector(".document-tabs-side-by-side-group")).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("tab", { name: /alpha\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel side-by-side" }));

    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    expect(container.querySelector(".document-tabs-side-by-side-group")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /alpha\.md/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /beta\.md/ })).toBeInTheDocument();
  });

  it("keeps a side-by-side tab group while selecting a standalone clean tab", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    const thirdPath = "/mock-files/vault/docs/3.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" },
      { name: "3.md", path: thirdPath, relativePath: "docs/3.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First\n\nOriginal",
          name: "1.md",
          path: firstPath
        };
      }

      if (path === secondPath) {
        return {
          content: "<br />\n\n# Second\n\nOriginal",
          name: "2.md",
          path: secondPath
        };
      }

      return {
        content: "# Third\n\nOriginal",
        name: "3.md",
        path: thirdPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleCodeMirrorText(container, "First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleCodeMirrorText(container, "Second");

    fireEvent.click(await screen.findByRole("button", { name: "docs/3.md" }));
    await expectVisibleCodeMirrorText(container, "Third");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    await expectVisibleCodeMirrorText(container, "First");

    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    const groupedTabs = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(groupedTabs).toBeInTheDocument();
    expect(within(groupedTabs).getByRole("tab", { name: /1\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(within(groupedTabs).getByRole("tab", { name: /2\.md/ })).toHaveAttribute("aria-selected", "false");
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        sideBySideGroup: {
          primaryFilePath: firstPath,
          sideFilePath: secondPath
        }
      })
    );

    fireEvent.click(screen.getByRole("tab", { name: /3\.md/ }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    const inactiveGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(inactiveGroup).toBeInTheDocument();
    expect(within(inactiveGroup).getByRole("tab", { name: /1\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(within(inactiveGroup).getByRole("tab", { name: /2\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /3\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();

    fireEvent.click(within(inactiveGroup).getByRole("tab", { name: /2\.md/ }));
    await expectVisibleCodeMirrorText(container, "First");
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));

    const regroupedTabs = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    expect(regroupedTabs).toBeInTheDocument();

    fireEvent.click(within(regroupedTabs).getByRole("button", { name: "Close tab 2.md" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      sideBySideGroup: null
    });
  });

  it("saves the side-by-side document whose editor has focus", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First\n\nOriginal",
          name: "1.md",
          path: firstPath
        };
      }

      return {
        content: "# Second\n\nOriginal",
        name: "2.md",
        path: secondPath
      };
    });
    mockedSaveNativeMarkdownFile.mockImplementation(async ({ path, suggestedName }) => ({
      name: path ? suggestedName : `saved-${suggestedName}`,
      path: path ?? `/mock-files/vault/docs/saved-${suggestedName}`
    }));
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleMarkdownText("Second");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());
    mockedSaveStoredWorkspaceState.mockClear();

    await selectEditorViewMode("Source code");
    const groupedTabs = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    const mainPaneTab = within(groupedTabs).getByRole("tab", { name: /1\.md/ });
    const sidePaneTab = within(groupedTabs).getByRole("tab", { name: /2\.md/ });
    expect(mainPaneTab).toHaveAttribute("aria-selected", "true");
    expect(sidePaneTab).toHaveAttribute("aria-selected", "false");
    expect(mainPaneTab).toHaveAttribute("data-document-tab-pane-focus", "true");
    expect(sidePaneTab).not.toHaveAttribute("data-document-tab-pane-focus");

    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    const sideSource = await within(sidePane).findByRole("textbox", { name: "Markdown source" });
    const mainSource = (await screen.findAllByRole("textbox", { name: "Markdown source" })).find((editor) =>
      !sidePane.contains(editor)
    ) as HTMLElement;

    fireEvent.focus(sideSource);
    await waitFor(() => expect(sidePaneTab).toHaveAttribute("aria-selected", "true"));
    expect(mainPaneTab).toHaveAttribute("aria-selected", "false");

    fireEvent.focus(mainSource);
    await waitFor(() => expect(mainPaneTab).toHaveAttribute("aria-selected", "true"));
    expect(sidePaneTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(sidePaneTab);
    await waitFor(() => expect(sidePaneTab).toHaveAttribute("aria-selected", "true"));
    expect(mainPaneTab).toHaveAttribute("aria-selected", "false");
    expect(sidePaneTab).toHaveAttribute("data-document-tab-pane-focus", "true");
    expect(mainPaneTab).not.toHaveAttribute("data-document-tab-pane-focus");
    await waitFor(() => expect(document.activeElement).toBe(sideSource));
    replaceMarkdownSource(sideSource, "# Second\n\nClicked side tab edit");
    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: "# Second\n\nClicked side tab edit",
          path: secondPath,
          suggestedName: "2.md"
        })
      )
    );

    fireEvent.focus(sideSource);
    replaceMarkdownSource(sideSource, "# Second\n\nFocused side save as");
    fireEvent.keyDown(window, { key: "s", metaKey: true, shiftKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: "# Second\n\nFocused side save as",
          path: null,
          suggestedName: "2.md"
        })
      )
    );
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        sideBySideGroup: {
          primaryFilePath: firstPath,
          sideFilePath: "/mock-files/vault/docs/saved-2.md"
        }
      })
    );

    fireEvent.click(mainPaneTab);
    await waitFor(() => expect(mainPaneTab).toHaveAttribute("aria-selected", "true"));
    expect(sidePaneTab).toHaveAttribute("aria-selected", "false");
    expect(mainPaneTab).toHaveAttribute("data-document-tab-pane-focus", "true");
    expect(sidePaneTab).not.toHaveAttribute("data-document-tab-pane-focus");
    await waitFor(() => expect(document.activeElement).toBe(mainSource));
    replaceMarkdownSource(mainSource, "# First\n\nFocused main edit");
    fireEvent.keyDown(window, { key: "s", metaKey: true, shiftKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: "# First\n\nFocused main edit",
          path: null,
          suggestedName: "1.md"
        })
      )
    );
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        sideBySideGroup: {
          primaryFilePath: "/mock-files/vault/docs/saved-1.md",
          sideFilePath: "/mock-files/vault/docs/saved-2.md"
        }
      })
    );
  });

  it("uses the focused side-by-side document as the active file tree path", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First",
          name: "1.md",
          path: firstPath
        };
      }

      return {
        content: "# Second",
        name: "2.md",
        path: secondPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleMarkdownText("Second");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());

    await selectEditorViewMode("Source code");
    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    const sideSource = await within(sidePane).findByRole("textbox", { name: "Markdown source" });

    expect(screen.getByRole("button", { name: "docs/1.md" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "docs/2.md" })).not.toHaveAttribute("aria-current");

    fireEvent.focus(sideSource);

    await waitFor(() => expect(screen.getByRole("button", { name: "docs/2.md" })).toHaveAttribute("aria-current", "page"));
    expect(screen.getByRole("button", { name: "docs/1.md" })).not.toHaveAttribute("aria-current");
  });

  it("returns save actions to the main document after switching away from a focused side editor", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    const thirdPath = "/mock-files/vault/docs/3.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" },
      { name: "3.md", path: thirdPath, relativePath: "docs/3.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First\n\nOriginal",
          name: "1.md",
          path: firstPath
        };
      }

      if (path === secondPath) {
        return {
          content: "# Second\n\nOriginal",
          name: "2.md",
          path: secondPath
        };
      }

      return {
        content: "# Third\n\nOriginal",
        name: "3.md",
        path: thirdPath
      };
    });
    mockedSaveNativeMarkdownFile.mockImplementation(async ({ path, suggestedName }) => ({
      name: suggestedName,
      path: path ?? `/mock-files/vault/docs/${suggestedName}`
    }));
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleMarkdownText("Second");

    fireEvent.click(await screen.findByRole("button", { name: "docs/3.md" }));
    await expectVisibleMarkdownText("Third");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());

    await selectEditorViewMode("Source code");
    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    const sideSource = await within(sidePane).findByRole("textbox", { name: "Markdown source" });

    fireEvent.focus(sideSource);
    replaceMarkdownSource(sideSource, "# Second\n\nFocused side draft");

    fireEvent.click(screen.getByRole("tab", { name: /3\.md/ }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());

    const inactiveGroup = container.querySelector(".document-tabs-side-by-side-group") as HTMLElement;
    fireEvent.click(within(inactiveGroup).getByRole("tab", { name: /1\.md/ }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contents: "# First\n\nOriginal",
          path: firstPath,
          suggestedName: "1.md"
        })
      )
    );
  });

  it("closes the focused side-by-side document from the close shortcut", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First",
          name: "1.md",
          path: firstPath
        };
      }

      return {
        content: "# Second",
        name: "2.md",
        path: secondPath
      };
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleMarkdownText("Second");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).toBeInTheDocument());

    await selectEditorViewMode("Source code");
    const sidePane = container.querySelector(".side-document-pane") as HTMLElement;
    fireEvent.focus(await within(sidePane).findByRole("textbox", { name: "Markdown source" }));

    fireEvent.keyDown(window, { key: "w", metaKey: true });

    await waitFor(() => expect(container.querySelector(".editor-side-by-side-surface")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /1\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /2\.md/ })).not.toBeInTheDocument();
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      sideBySideGroup: null
    });
  });

  it("restores the visual editor scroll position when switching back to a document tab", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "# Guide\n\nLong guide body.",
          name: "guide.md",
          path: guidePath
        };
      }

      return {
        content: "# Notes\n\nLong notes body.",
        name: "notes.md",
        path: notesPath
      };
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleCodeMirrorText(container, "Guide");
    await waitFor(() => expect(screen.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true"));
    await settleEditorUpdates();

    const guideScroll = getVisibleWritingSurface(container);
    mockScrollMetrics(guideScroll, {
      clientHeight: 300,
      scrollHeight: 1200,
      scrollTop: 240
    });
    fireEvent.scroll(guideScroll);

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleCodeMirrorText(container, "Notes");
    await waitFor(() => expect(screen.getByRole("tab", { name: /notes\.md/ })).toHaveAttribute("aria-selected", "true"));
    await settleEditorUpdates();

    const notesScroll = getVisibleWritingSurface(container);
    mockScrollMetrics(notesScroll, {
      clientHeight: 300,
      scrollHeight: 1200,
      scrollTop: 0
    });
    fireEvent.scroll(notesScroll);

    fireEvent.click(screen.getByRole("tab", { name: /guide\.md/ }));

    await expectVisibleCodeMirrorText(container, "Guide");
    await waitFor(() => expect(getVisibleWritingSurface(container).scrollTop).toBe(240));
  });

  it("renames an opened markdown file from a titlebar tab double click", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const renamedPath = "/mock-files/vault/docs/Renamed.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath
      .mockResolvedValueOnce([{ name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }])
      .mockResolvedValue([{ name: "Renamed.md", path: renamedPath, relativePath: "docs/Renamed.md" }]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide",
      name: "guide.md",
      path: guidePath
    });
    mockedRenameNativeMarkdownTreeFile.mockResolvedValue({
      name: "Renamed.md",
      path: renamedPath,
      relativePath: "docs/Renamed.md"
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleMarkdownText("Guide");

    fireEvent.doubleClick(screen.getByRole("tab", { name: /guide\.md/ }));
    const renameInput = await screen.findByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "Renamed.md" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() =>
      expect(mockedRenameNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, guidePath, "Renamed.md")
    );
    expect(await screen.findByRole("tab", { name: /Renamed\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the saved side-by-side group in sync when a grouped tab is renamed", async () => {
    const firstPath = "/mock-files/vault/docs/1.md";
    const secondPath = "/mock-files/vault/docs/2.md";
    const renamedSecondPath = "/mock-files/vault/docs/renamed-2.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: firstPath, relativePath: "docs/1.md" },
      { name: "2.md", path: secondPath, relativePath: "docs/2.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === firstPath) {
        return {
          content: "# First",
          name: "1.md",
          path: firstPath
        };
      }

      return {
        content: "# Second",
        name: "2.md",
        path: secondPath
      };
    });
    mockedRenameNativeMarkdownTreeFile.mockResolvedValue({
      name: "renamed-2.md",
      path: renamedSecondPath,
      relativePath: "docs/renamed-2.md"
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.click(await screen.findByRole("button", { name: "docs/2.md" }));
    await expectVisibleMarkdownText("Second");

    fireEvent.click(screen.getByRole("tab", { name: /1\.md/ }));
    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open to side" }));
    await waitFor(() => expect(container.querySelector(".document-tabs-side-by-side-group")).toBeInTheDocument());
    mockedSaveStoredWorkspaceState.mockClear();

    fireEvent.contextMenu(screen.getByRole("tab", { name: /2\.md/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename file" }));
    const renameInput = await screen.findByRole("textbox", { name: "Rename file" });
    fireEvent.change(renameInput, { target: { value: "renamed-2.md" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() =>
      expect(mockedRenameNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, secondPath, "renamed-2.md")
    );
    await waitFor(() =>
      expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
        sideBySideGroup: {
          primaryFilePath: firstPath,
          sideFilePath: renamedSecondPath
        }
      })
    );
  });

  it("switches away from a clean file with normalized markdown without asking to discard changes", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    const notesPath = "/mock-files/vault/docs/notes.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" },
      { name: "notes.md", path: notesPath, relativePath: "docs/notes.md" }
    ]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === guidePath) {
        return {
          content: "Guide\n=====\n\nRead-only content.",
          name: "guide.md",
          path: guidePath
        };
      }

      return {
        content: "# Notes\n\nSecond read-only content.",
        name: "notes.md",
        path: notesPath
      };
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));
    await expectVisibleMarkdownText("Guide");

    fireEvent.click(await screen.findByRole("button", { name: "docs/notes.md" }));
    await expectVisibleMarkdownText("Notes");

    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();
  });

  it("clears a selected folder file after deleting it from the file tree", async () => {
    const test1Path = "/mock-files/vault/test1.md";
    const test2Path = "/mock-files/vault/test2.md";
    const test1File = { name: "test1.md", path: test1Path, relativePath: "test1.md" };
    const test2File = { name: "test2.md", path: test2Path, relativePath: "test2.md" };
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([test1File, test2File]);
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === test1Path) {
        return {
          content: "Original synthetic text",
          name: "test1.md",
          path: test1Path
        };
      }

      return {
        content: "# Test 2",
        name: "test2.md",
        path: test2Path
      };
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "test1.md" }));
    expect(await screen.findByText("Original synthetic text")).toBeInTheDocument();

    const eventDetail = {
      action: "apply",
      result: {
        from: 0,
        original: "Original",
        replacement: "Edited",
        to: 8,
        type: "replace"
      }
    } as const;

    dispatchAiEditorPreviewAction(eventDetail);
    await expectVisibleMarkdownText("Edited synthetic text");

    fireEvent.contextMenu(screen.getByRole("button", { name: "test1.md" }));
    const contextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];

    act(() => {
      contextHandlers?.deleteFile?.(test1File);
    });

    await waitFor(() => expect(mockedConfirmNativeMarkdownFileDelete).toHaveBeenCalledWith("test1.md", expect.any(Object)));
    await waitFor(() => expect(mockedDeleteNativeMarkdownTreeFile).toHaveBeenCalledWith(mockFolderPath, test1Path));
    await waitFor(() => expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument());
    expect(screen.queryByText("Edited synthetic text")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "test2.md" }));

    await expectVisibleMarkdownText("Test 2");
    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();
  });

  it("does not expose side-open file tree actions when document tabs are hidden", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: true,
      autoSaveEnabled: true,
      autoSaveIntervalMinutes: 10,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "assets",
      copyExternalFilesToStorage: true,
      closeAiCommandOnAgentPanelOpen: false,
      contentWidth: "default",
      contentWidthPx: null,
      documentLinksOpen: true,
      documentLinksVisible: false,
      editorFontFamily: { family: null, source: "theme" },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      },
      imageUpload: defaultImageUpload,
      lineHeight: 1.65,
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      openDroppedFilesInTabs: false,
      paragraphSpacingPx: 8,
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      hideHeadingMarkersOnFocus: false,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      viewMode: "daily",
      viewModeCustomizations: {
        aiPanel: "visible",
        documentLinks: "visible",
        documentTabs: "visible",
        fileList: "visible",
        fileTree: "visible",
        fileTreeButton: "visible",
        openButton: "visible",
        outline: "visible",
        quickCreateButton: "visible",
        recentFolders: "visible",
        sidebarLayout: "visible",
        statusBar: "visible",
        titlebarActions: "visible",
        viewModeToggle: "visible",
        wordCount: "visible"
      },
      showCodeBlockLineNumbers: true,
      showLineNumbers: false,
      showWordCount: true,
      typewriterModeEnabled: false,
      vimModeEnabled: false,
      wrapCodeBlocks: true
    });
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "1.md", path: "/mock-files/vault/docs/1.md", relativePath: "docs/1.md" },
      { name: "2.md", path: "/mock-files/vault/docs/2.md", relativePath: "docs/2.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# First",
      name: "1.md",
      path: "/mock-files/vault/docs/1.md"
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/1.md" }));
    await expectVisibleMarkdownText("First");

    fireEvent.contextMenu(screen.getByRole("button", { name: "docs/2.md" }));

    const fileTreeContextHandlers = mockedShowNativeMarkdownFileTreeContextMenu.mock.calls.at(-1)?.[0];
    expect(fileTreeContextHandlers?.openFileToSide).toBeUndefined();
  });

  it("quick opens an unsaved blank markdown document from the titlebar while the file tree is collapsed", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "Untitled.md",
      path: mockUntitledPath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleCodeMirrorText(container, "Native file");
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));

    expect(mockedCreateNativeMarkdownTreeFile).not.toHaveBeenCalled();
    expect(mockedSaveNativeMarkdownFile).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Untitled\.md/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    expect(within(getVisibleCodeMirrorEditor(container)).queryByText("Native file")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: null,
          suggestedName: "Untitled.md"
        })
      )
    );
  });

  it("opens another file from an untouched blank document without asking to discard changes", async () => {
    mockedOpenNativeMarkdownPath
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# Native file\n\nOpened from disk.",
          name: "native.md",
          path: mockNativePath
        }
      })
      .mockResolvedValueOnce({
        kind: "file",
        file: {
          content: "# Other file\n\nAlso clean.",
          name: "other.md",
          path: "/mock-files/other.md"
        }
      });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.keyDown(window, { key: "o", metaKey: true });

    await expectVisibleMarkdownText("Other file");
    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).not.toHaveBeenCalled();
  });

  it("keeps dirty editor content when opening another markdown file is cancelled", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: true,
      autoSaveEnabled: true,
      autoSaveIntervalMinutes: 10,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "assets",
      copyExternalFilesToStorage: true,
      closeAiCommandOnAgentPanelOpen: false,
      contentWidth: "default",
      contentWidthPx: null,
      documentLinksOpen: true,
      documentLinksVisible: false,
      editorFontFamily: { family: null, source: "theme" },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      },
      imageUpload: defaultImageUpload,
      lineHeight: 1.65,
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      openDroppedFilesInTabs: false,
      paragraphSpacingPx: 8,
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      hideHeadingMarkersOnFocus: false,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      viewMode: "daily",
      viewModeCustomizations: {
        aiPanel: "visible",
        documentLinks: "visible",
        documentTabs: "visible",
        fileList: "visible",
        fileTree: "visible",
        fileTreeButton: "visible",
        openButton: "visible",
        outline: "visible",
        quickCreateButton: "visible",
        recentFolders: "visible",
        sidebarLayout: "visible",
        statusBar: "visible",
        titlebarActions: "visible",
        viewModeToggle: "visible",
        wordCount: "visible"
      },
      showCodeBlockLineNumbers: true,
      showLineNumbers: false,
      showWordCount: true,
      typewriterModeEnabled: false,
      vimModeEnabled: false,
      wrapCodeBlocks: true
    });
    mockOpenMarkdownFile({
      content: "Original synthetic text",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByText("Original synthetic text")).toBeInTheDocument();

    const eventDetail = {
      action: "apply",
      result: {
        from: 0,
        original: "Original",
        replacement: "Edited",
        to: 8,
        type: "replace"
      }
    } as const;

    dispatchAiEditorPreviewAction(eventDetail);
    await expectVisibleMarkdownText("Edited synthetic text");
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "file",
      file: {
        content: "# Other synthetic file",
        name: "other.md",
        path: "/mock-files/other.md"
      }
    });
    mockedConfirmNativeUnsavedMarkdownDocumentDiscard.mockResolvedValue(false);

    fireEvent.keyDown(window, { key: "o", metaKey: true });

    await waitFor(() => expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).toHaveBeenCalledTimes(1));
    expect(mockedConfirmNativeUnsavedMarkdownDocumentDiscard).toHaveBeenCalledWith("native.md", {
      cancelLabel: "Cancel",
      message: "Discard unsaved changes?",
      okLabel: "Discard"
    });
    await expectVisibleMarkdownText("Edited synthetic text");
    expect(screen.queryByText("Other synthetic file")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /native\.md/ })).toBeInTheDocument();
  });

  it("shows a document outline alongside the sidebar file tree", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\n## Details",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));

    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Native file");
    expect(screen.getByRole("list", { name: "Document outline" })).toHaveTextContent("Details");
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
  });

  it("focuses the editor when an outline heading is selected", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nParagraph\n\n## Details\n\nTarget body",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");
    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Markdown document" })).toHaveFocus());
  });

  it("scrolls a selected outline heading below the top of the writing viewport", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nParagraph\n\n## Details\n\nTarget body",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    const view = EditorView.findFromDOM(screen.getByRole("textbox", { name: "Markdown document" }));
    await waitFor(() => {
      expect(view?.state.selection.main.from).toBe(view?.state.doc.toString().indexOf("## Details"));
      expect(view?.hasFocus).toBe(true);
    });
  });

  it("scrolls to a formatted outline heading using its readable title", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nParagraph\n\n## **Synthetic** heading\n\nTarget body",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await screen.findByRole("heading", { name: "Synthetic heading" });

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    fireEvent.click(screen.getByRole("button", { name: "Synthetic heading" }));

    const view = EditorView.findFromDOM(screen.getByRole("textbox", { name: "Markdown document" }));
    await waitFor(() => {
      expect(view?.state.selection.main.from).toBe(
        view?.state.doc.toString().indexOf("## **Synthetic** heading")
      );
      expect(view?.hasFocus).toBe(true);
    });
  });

  it("keeps outline heading navigation stable across repeated heading clicks", async () => {
    mockOpenMarkdownFile({
      content: "# A\n\nA body\n\n# B\n\nB body",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByText("A body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle file list" }));
    const view = EditorView.findFromDOM(screen.getByRole("textbox", { name: "Markdown document" }));
    const headingA = view?.state.doc.toString().indexOf("# A") ?? -1;
    const headingB = view?.state.doc.toString().indexOf("# B") ?? -1;
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(view?.state.selection.main.from).toBe(headingB));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    await waitFor(() => expect(view?.state.selection.main.from).toBe(headingA));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(view?.state.selection.main.from).toBe(headingB));
  });

  it("shows the welcome document only on the first nonblank app launch", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const firstLaunch = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    firstLaunch.unmount();
    renderApp();

    expect(screen.getByRole("heading", { name: "Untitled.md" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Markdown editor")).toHaveTextContent(/^$/);
    expect(screen.queryByText("Welcome to Markra")).not.toBeInTheDocument();
    expect(mockedConsumeWelcomeDocumentState).toHaveBeenCalledTimes(2);
  });

  it("starts a native new-document window with an empty untitled document", async () => {
    window.history.pushState({}, "", "/?blank=1");

    renderApp();

    expect(screen.getByRole("heading", { name: "Untitled.md" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Markdown editor")).toHaveTextContent(/^$/);
    expect(screen.queryByText("Welcome to Markra")).not.toBeInTheDocument();
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("focuses the editor when the default launch opens an empty document", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);

    renderApp();

    const editor = await screen.findByRole("textbox", { name: "Markdown document" });

    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("focuses the editor when a native new-document window opens", async () => {
    window.history.pushState({}, "", "/?blank=1");

    renderApp();

    const editor = await screen.findByRole("textbox", { name: "Markdown document" });

    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it("loads a markdown file when a native file window opens with an initial path", async () => {
    window.history.pushState({}, "", "/?path=%2Fmock-files%2Fdropped.md");
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Dropped file\n\nOpened in a new window.",
      name: "dropped.md",
      path: mockDroppedPath
    });

    renderApp();

    await expectVisibleMarkdownText("Dropped file");
    expect(screen.getByRole("tab", { name: /dropped\.md/ })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockDroppedPath);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("loads a markdown file when the operating system opens Markra with a file path", async () => {
    mockedTakeNativeOpenedMarkdownPaths.mockResolvedValue([mockDroppedPath]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Opened from OS\n\nDouble-clicked from Finder or Explorer.",
      name: "dropped.md",
      path: mockDroppedPath
    });

    renderApp();

    await expectVisibleMarkdownText("Opened from OS");
    expect(screen.getByRole("tab", { name: /dropped\.md/ })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockDroppedPath);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("opens a markdown file when the operating system sends a file-open event while Markra is running", async () => {
    let onOpenedPaths: ((paths: string[]) => unknown) | null = null;
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedListenNativeOpenedMarkdownPaths.mockImplementation(async (listener) => {
      onOpenedPaths = listener;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Runtime file\n\nOpened while Markra was already running.",
      name: "dropped.md",
      path: mockDroppedPath
    });

    renderApp();
    await screen.findByRole("textbox", { name: "Markdown document" });
    await waitFor(() => expect(onOpenedPaths).not.toBeNull());

    await act(async () => {
      await onOpenedPaths?.([mockDroppedPath]);
    });

    expect(await screen.findByRole("heading", { name: "Runtime file" })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockDroppedPath);
  });

  it("opens an OS-opened markdown file in a new tab when document tabs are enabled", async () => {
    let onOpenedPaths: ((paths: string[]) => unknown) | null = null;
    mockOpenMarkdownFile({
      content: "# Native file\n\nAlready open.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListenNativeOpenedMarkdownPaths.mockImplementation(async (listener) => {
      onOpenedPaths = listener;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === mockNativePath) {
        return {
          content: "# Native file\n\nAlready open.",
          name: "native.md",
          path: mockNativePath
        };
      }

      return {
        content: "# Runtime file\n\nOpened while Markra was already running.",
        name: "dropped.md",
        path: mockDroppedPath
      };
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByRole("heading", { name: "Native file" })).toBeInTheDocument();
    await waitFor(() => expect(onOpenedPaths).not.toBeNull());

    await act(async () => {
      await onOpenedPaths?.([mockDroppedPath]);
    });

    expect(await screen.findByRole("heading", { name: "Runtime file" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /native\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /dropped\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(mockedOpenNativeMarkdownFileInNewWindow).not.toHaveBeenCalled();
  });

  it("opens an OS-opened markdown file from a child folder in the current workspace as a new tab", async () => {
    const childFolderPath = "/mock-files/docs/dropped.md";
    let onOpenedPaths: ((paths: string[]) => unknown) | null = null;
    mockOpenMarkdownFile({
      content: "# Native file\n\nAlready open.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListenNativeOpenedMarkdownPaths.mockImplementation(async (listener) => {
      onOpenedPaths = listener;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => {
      if (path === mockNativePath) {
        return {
          content: "# Native file\n\nAlready open.",
          name: "native.md",
          path: mockNativePath
        };
      }

      return {
        content: "# Child file\n\nOpened from a nested workspace folder.",
        name: "dropped.md",
        path: childFolderPath
      };
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByRole("heading", { name: "Native file" })).toBeInTheDocument();
    await waitFor(() => expect(onOpenedPaths).not.toBeNull());

    await act(async () => {
      await onOpenedPaths?.([childFolderPath]);
    });

    expect(await screen.findByRole("heading", { name: "Child file" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /native\.md/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /dropped\.md/ })).toHaveAttribute("aria-selected", "true");
    expect(mockedOpenNativeMarkdownFileInNewWindow).not.toHaveBeenCalled();
  });

  it("opens an OS-opened markdown file from another folder in a new window", async () => {
    const otherFolderPath = "/other-vault/dropped.md";
    let onOpenedPaths: ((paths: string[]) => unknown) | null = null;
    mockOpenMarkdownFile({
      content: "# Native file\n\nAlready open.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListenNativeOpenedMarkdownPaths.mockImplementation(async (listener) => {
      onOpenedPaths = listener;
      return () => {};
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Native file\n\nAlready open.",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByRole("heading", { name: "Native file" })).toBeInTheDocument();
    await waitFor(() => expect(onOpenedPaths).not.toBeNull());

    await act(async () => {
      await onOpenedPaths?.([otherFolderPath]);
    });

    await waitFor(() => expect(mockedOpenNativeMarkdownFileInNewWindow).toHaveBeenCalledWith(otherFolderPath));
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalledWith(otherFolderPath);
    expect(screen.queryByRole("tab", { name: /dropped\.md/ })).not.toBeInTheDocument();
  });

  it("opens a markdown folder when a native folder window opens with an initial path", async () => {
    window.history.pushState({}, "", "/?folder=%2Fmock-files%2Fvault");
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" }
    ]);

    renderApp();

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "vault" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled.md" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
    expect(mockedConsumeWelcomeDocumentState).not.toHaveBeenCalled();
  });

  it("opens a dropped markdown file in the current empty editor", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Dropped file\n\nOpened from drag and drop.",
      name: "dropped.md",
      path: mockDroppedPath
    });

    renderApp();
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({ kind: "file", name: "dropped.md", path: mockDroppedPath });
    });

    expect(await screen.findByRole("heading", { name: "Dropped file" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /dropped\.md/ })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockDroppedPath);
    expect(mockedOpenNativeMarkdownFileInNewWindow).not.toHaveBeenCalled();
  });

  it("opens a dropped markdown file in a new window when the current editor has content", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Welcome to Markra" });
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({ kind: "file", name: "dropped.md", path: mockDroppedPath });
    });

    expect(mockedOpenNativeMarkdownFileInNewWindow).toHaveBeenCalledWith(mockDroppedPath);
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalledWith(mockDroppedPath);
    expect(screen.getByRole("heading", { name: "Welcome to Markra" })).toBeInTheDocument();
  });

  it("opens a dropped markdown folder into the current empty editor file tree", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockedCreateAiAgentSessionId.mockReturnValue("session-dropped-folder");
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
      { name: "note.md", path: "/mock-files/vault/docs/note.md", relativePath: "docs/note.md" }
    ]);

    renderApp();
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({ kind: "folder", name: "vault", path: mockFolderPath });
    });

    expect(await screen.findByRole("complementary", { name: "Markdown file tree" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle file list" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("vault").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "index.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: "vault" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Untitled.md" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Markdown" })).toBeDisabled();
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalled();
    expect(mockedOpenNativeMarkdownFileInNewWindow).not.toHaveBeenCalled();
    expect(mockedOpenNativeMarkdownFolderInNewWindow).not.toHaveBeenCalled();
  });

  it("opens a dropped markdown folder in a new window when the current editor has content", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Welcome to Markra" });
    await waitFor(() => expect(mockedInstallNativeMarkdownFileDrop).toHaveBeenCalled());
    const handleDrop = mockedInstallNativeMarkdownFileDrop.mock.calls.at(-1)?.[0];

    await act(async () => {
      await handleDrop?.({ kind: "folder", name: "vault", path: mockFolderPath });
    });

    expect(mockedOpenNativeMarkdownFolderInNewWindow).toHaveBeenCalledWith(mockFolderPath);
    expect(mockedListNativeMarkdownFilesForPath).not.toHaveBeenCalledWith(mockFolderPath, defaultFileTreeListOptions);
    expect(screen.queryByRole("complementary", { name: "Markdown file tree" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to Markra" })).toBeInTheDocument();
  });

  it("saves an untitled document with the native save dialog shortcut", async () => {
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "Untitled.md",
      path: mockUntitledPath
    });

    renderApp();
    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: null,
          suggestedName: "Untitled.md"
        })
      )
    );
  });

  it("starts untitled document saves in the open markdown folder", async () => {
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "note.md", path: `${mockFolderPath}/note.md`, relativePath: "note.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Note\n\nExisting file.",
      name: "note.md",
      path: `${mockFolderPath}/note.md`
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "Untitled.md",
      path: `${mockFolderPath}/Untitled.md`
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "note.md" }));
    await expectVisibleMarkdownText("Note");

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultDirectory: mockFolderPath,
          path: null,
          suggestedName: "Untitled.md"
        })
      )
    );
  });

  it("opens and saves markdown files through native Tauri file APIs", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });

    await expectVisibleMarkdownText("Native file");
    expect(screen.getByRole("tab", { name: /native\.md/ })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: mockNativePath,
          suggestedName: "native.md"
        })
      )
    );
  });

  it("switches between the visual editor and markdown source mode", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(readMarkdownSource(sourceEditor)).toContain("# Welcome to Markra");
    expect(screen.queryByRole("heading", { name: "Welcome to Markra" })).not.toBeInTheDocument();

    replaceMarkdownSource(sourceEditor, "# Source edit\n\nUpdated from source mode.");

    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();

    await selectEditorViewMode("Preview");

    expect(await screen.findByRole("heading", { name: "Source edit" })).toBeInTheDocument();
    expect(screen.getByText("Updated from source mode.")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown editor")).toHaveAttribute("data-editor-engine", "codemirror");
    expect(container.querySelectorAll(".cm-markra-empty-line")).toHaveLength(1);
  });

  it("preserves the active selection and editor focus across visual and source modes", async () => {
    const syntheticContent = "# Synthetic cursor\n\nalpha beta gamma\n\nomega";
    mockOpenMarkdownFile({
      content: syntheticContent,
      name: "synthetic.md",
      path: mockNativePath
    });
    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Synthetic cursor");

    const visualEditor = screen.getByRole("textbox", { name: "Markdown document" });
    const visualView = getMarkdownSourceView(visualEditor);
    const visualCursor = syntheticContent.indexOf("beta") + 2;
    const visualSelection = EditorSelection.single(visualCursor, syntheticContent.indexOf("alpha"));
    act(() => {
      visualView.dispatch({ selection: visualSelection });
    });

    await selectEditorViewMode("Source code");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const sourceView = getMarkdownSourceView(sourceEditor);
    await waitFor(() => {
      expect(sourceView.state.selection.eq(visualSelection)).toBe(true);
      expect(sourceEditor).toHaveFocus();
    });

    const sourceCursor = syntheticContent.indexOf("omega") + 3;
    const sourceSelection = EditorSelection.single(sourceCursor, syntheticContent.indexOf("gamma"));
    act(() => {
      sourceView.dispatch({ selection: sourceSelection });
    });
    const requestMeasureSpy = vi.spyOn(visualView, "requestMeasure");
    requestMeasureSpy.mockClear();

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(visualView.state.selection.eq(sourceSelection)).toBe(true);
      expect(visualEditor).toHaveFocus();
      expect(requestMeasureSpy).toHaveBeenCalled();
    });
    requestMeasureSpy.mockRestore();
  });

  it("commits pending visual IME content before source mode mounts", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    const visualEditor = screen.getByRole("textbox", { name: "Markdown document" });
    const visualView = getMarkdownSourceView(visualEditor);
    const pendingCompositionTasks: VoidFunction[] = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => pendingCompositionTasks.push(task));
    try {
      act(() => {
        fireEvent.compositionStart(visualEditor);
        visualView.dispatch({
          changes: {
            from: 0,
            insert: "# Pending visual edit\n\nNot published by the IME yet.",
            to: visualView.state.doc.length
          }
        });
        fireEvent.compositionEnd(visualEditor);
      });
    } finally {
      queueMicrotaskSpy.mockRestore();
    }

    await selectEditorViewMode("Source code");

    expect(readMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }))).toBe(
      "# Pending visual edit\n\nNot published by the IME yet."
    );
    act(() => pendingCompositionTasks.forEach((task) => task()));
  });

  it("keeps the active tab content across editor modes after a prior tab finishes IME composition", async () => {
    const bulletinPath = "/mock-files/vault/bulletin.md";
    const tempPath = "/mock-files/vault/temp.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-source-tabs",
      filePath: bulletinPath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [bulletinPath, tempPath]
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => path === bulletinPath
      ? {
        content: "# Bulletin\n\nFirst document.",
        name: "bulletin.md",
        path
      }
      : {
        content: "# Temporary notes\n\nSecond document.",
        name: "temp.md",
        path
      });

    renderApp();

    expect(await screen.findByRole("heading", { name: "Bulletin" })).toBeInTheDocument();
    const bulletinEditor = screen.getByRole("textbox", { name: "Markdown document" });
    const bulletinView = getMarkdownSourceView(bulletinEditor);
    const pendingCompositionTasks: VoidFunction[] = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((task) => pendingCompositionTasks.push(task));
    try {
      act(() => {
        fireEvent.compositionStart(bulletinEditor);
        bulletinView.dispatch({
          changes: {
            from: 0,
            insert: "# Bulletin\n\nFinished Chinese composition.",
            to: bulletinView.state.doc.length
          }
        });
        fireEvent.compositionEnd(bulletinEditor);
      });
    } finally {
      queueMicrotaskSpy.mockRestore();
    }
    fireEvent.click(screen.getByRole("tab", { name: /temp\.md/ }));

    await selectEditorViewMode("Source code");

    expect(readMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }))).toBe(
      "# Temporary notes\n\nSecond document."
    );
    act(() => pendingCompositionTasks.forEach((task) => task()));
    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(
      "# Temporary notes\n\nSecond document."
    );

    fireEvent.click(screen.getByRole("tab", { name: /bulletin\.md/ }));
    expect(readMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }))).toBe(
      "# Bulletin\n\nFinished Chinese composition."
    );
    fireEvent.click(screen.getByRole("tab", { name: /temp\.md/ }));

    await selectEditorViewMode("Preview + Source");

    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(
      "# Temporary notes\n\nSecond document."
    );
    await expectVisibleCodeMirrorText(document.body, "Temporary notes");
    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown document" }))).toBe(
      "# Temporary notes\n\nSecond document."
    );

    await selectEditorViewMode("Preview");

    await expectVisibleCodeMirrorText(document.body, "Temporary notes");
    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown document" }))).toBe(
      "# Temporary notes\n\nSecond document."
    );
  });

  it("isolates source editor instances between document tabs", async () => {
    const firstPath = "/mock-files/vault/first.md";
    const secondPath = "/mock-files/vault/second.md";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-isolated-source-tabs",
      filePath: firstPath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [firstPath, secondPath]
    });
    mockedReadNativeMarkdownFile.mockImplementation(async (path) => path === firstPath
      ? {
        content: "# First document",
        name: "first.md",
        path
      }
      : {
        content: "# Second document",
        name: "second.md",
        path
      });

    renderApp();

    expect(await screen.findByRole("heading", { name: "First document" })).toBeInTheDocument();
    await selectEditorViewMode("Source code");
    const firstSourceView = getMarkdownSourceView(
      await screen.findByRole("textbox", { name: "Markdown source" })
    );

    fireEvent.click(screen.getByRole("tab", { name: /second\.md/ }));

    const secondSourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const secondSourceView = getMarkdownSourceView(secondSourceEditor);
    expect(secondSourceView).not.toBe(firstSourceView);
    expect(secondSourceView.state.doc.toString()).toBe("# Second document");
  });

  it("shows optional line numbers in source and split source modes", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showLineNumbers: true
    }));
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    expect(container.querySelector(".cm-lineNumbers")).not.toBeInTheDocument();

    await selectEditorViewMode("Source code");
    await waitFor(() => expect(container.querySelectorAll(".cm-lineNumbers")).toHaveLength(1));

    await selectEditorViewMode("Preview + Source");
    expect(container.querySelectorAll(".cm-lineNumbers")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Welcome to Markra" })).toBeInTheDocument();
  });

  it("enables typewriter mode in visual and source editors", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      typewriterModeEnabled: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    expect(getVisibleCodeMirrorView(container).dom).toHaveAttribute(
      "data-typewriter-mode",
      "true"
    );

    await selectEditorViewMode("Source code");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });

    expect(sourceEditor.closest(".cm-editor")).toHaveAttribute(
      "data-typewriter-mode",
      "true"
    );
  });

  it("toggles and persists typewriter mode from the keyboard shortcut", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    expect(getVisibleCodeMirrorView(container).dom).not.toHaveAttribute("data-typewriter-mode");

    fireEvent.keyDown(window, { key: "Y", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(getVisibleCodeMirrorView(container).dom).toHaveAttribute(
        "data-typewriter-mode",
        "true"
      );
    });
    expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      typewriterModeEnabled: true
    }));
    expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      typewriterModeEnabled: true
    }));
  });

  it("rolls back typewriter mode and reports a preference save failure", async () => {
    mockedSaveStoredEditorPreferences.mockRejectedValueOnce(
      new Error("Synthetic editor preference save failure")
    );
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");

    fireEvent.keyDown(window, { key: "Y", metaKey: true, shiftKey: true });

    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ typewriterModeEnabled: true })
    ));
    await waitFor(() => {
      expect(getVisibleCodeMirrorView(container).dom).not.toHaveAttribute("data-typewriter-mode");
    });
    expect(document.querySelector(".app-toast")).toHaveTextContent(
      "Could not save editor preferences."
    );
    expect(mockedNotifyAppEditorPreferencesChanged).not.toHaveBeenCalledWith(
      expect.objectContaining({ typewriterModeEnabled: true })
    );
  });

  it("toggles and persists Vim mode from the keyboard shortcut", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    expect(getVisibleCodeMirrorView(container).scrollDOM).not.toHaveClass("cm-vimMode");

    fireEvent.keyDown(window, { altKey: true, code: "KeyV", key: "v", metaKey: true });

    await waitFor(() => {
      expect(getVisibleCodeMirrorView(container).scrollDOM).toHaveClass("cm-vimMode");
    });
    expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      vimModeEnabled: true
    }));
    expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      vimModeEnabled: true
    }));
  });

  it("keeps raw source punctuation unchanged while editing in source mode", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });

    replaceMarkdownSource(sourceEditor, "# Raw source\n\n**");
    await settleEditorUpdates();

    expect(readMarkdownSource(sourceEditor)).toBe("# Raw source\n\n**");
  });

  it("keeps source mode typing undoable and redoable before switching back to visual mode", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const originalSource = readMarkdownSource(sourceEditor);

    replaceMarkdownSource(sourceEditor, "# Source draft\n\nUndo me.");
    expect(readMarkdownSource(sourceEditor)).toBe("# Source draft\n\nUndo me.");

    fireEvent.keyDown(sourceEditor, { ctrlKey: true, key: "z" });
    await waitFor(() => {
      expect(readMarkdownSource(sourceEditor)).toBe(originalSource);
    });

    fireEvent.keyDown(sourceEditor, { ctrlKey: true, key: "y" });
    await waitFor(() => {
      expect(readMarkdownSource(sourceEditor)).toBe("# Source draft\n\nUndo me.");
    });
  });

  it("keeps visual undo history after switching to source mode and back", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    act(() => {
      menuHandlers.insertTable?.();
    });

    revealVisualPreviews(container);
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument());

    await selectEditorViewMode("Source code");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    await waitFor(() => expect(readMarkdownSource(sourceEditor)).toContain("| --- | --- |"));

    await selectEditorViewMode("Preview");
    revealVisualPreviews(container);
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).toBeInTheDocument());

    act(() => {
      menuHandlers.editUndo?.();
    });
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).not.toBeInTheDocument());

    act(() => {
      menuHandlers.editRedo?.();
    });
    revealVisualPreviews(container);
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).toBeInTheDocument());
  });

  it("keeps full-document selections visibly highlighted when the selection toolbar opens", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      }
    });
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(0, visualView.state.doc.length)
      });
    });

    await waitFor(() => {
      expect(container.querySelector(".cm-editor .markra-ai-selection-hold")).toHaveTextContent(
        "Welcome to Markra"
      );
    });
  });

  it("applies inline formatting from the selection toolbar to the live CodeMirror selection", async () => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);
    const from = findEditorTextPosition(visualView, "Welcome");

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(from, from + "Welcome".length)
      });
    });

    const bold = await screen.findByRole("button", { name: "Bold" });
    fireEvent.mouseDown(bold);
    fireEvent.click(bold);

    await waitFor(() => {
      expect(visualView.state.doc.toString()).toContain("**Welcome** to Markra");
    });
    expect(visualView.state.sliceDoc(
      visualView.state.selection.main.from,
      visualView.state.selection.main.to
    )).toBe("Welcome");
  });

  it.each([
    { button: "Italic", formatted: "*Welcome* to Markra" },
    { button: "Strikethrough", formatted: "~~Welcome~~ to Markra" }
  ])("applies $button from the selection toolbar", async ({ button, formatted }) => {
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);
    const from = findEditorTextPosition(visualView, "Welcome");

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(from, from + "Welcome".length)
      });
    });

    const action = await screen.findByRole("button", { name: button });
    fireEvent.mouseDown(action);
    fireEvent.click(action);

    await waitFor(() => {
      expect(visualView.state.doc.toString()).toContain(formatted);
    });
  });

  it("keeps macOS full-document selections visible when selection helpers are disabled", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      }
    });
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: false
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(0, visualView.state.doc.length)
      });
    });

    await waitFor(() => {
      expect(container.querySelector(".cm-editor .markra-ai-selection-hold")).toHaveTextContent(
        "Welcome to Markra"
      );
    });
  });

  it("keeps macOS full-document selections visible when AI features are disabled", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      },
      features: {
        ...runtime.features,
        ai: false
      }
    });
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: false
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(0, visualView.state.doc.length)
      });
    });

    await waitFor(() => {
      expect(container.querySelector(".cm-editor .markra-ai-selection-hold")).toHaveTextContent(
        "Welcome to Markra"
      );
    });
  });

  it("does not add a fallback highlight over macOS partial text selections", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      }
    });
    mockedResolveDesktopPlatform.mockReturnValue("macos");
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);
    const from = findEditorTextPosition(visualView, "Welcome");

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(from, from + "Welcome".length)
      });
    });

    await settleEditorUpdates();
    expect(container.querySelector(".cm-editor .markra-ai-selection-hold")).not.toBeInTheDocument();
  });

  it("does not add a fallback highlight over Windows full-document selections", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      events: {
        ...runtime.events,
        isAvailable: () => true
      }
    });
    mockedResolveDesktopPlatform.mockReturnValue("windows");
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    }));
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();
    const visualView = getVisibleCodeMirrorView(container);

    act(() => {
      visualView.focus();
      visualView.dispatch({
        selection: EditorSelection.range(0, visualView.state.doc.length)
      });
    });

    await settleEditorUpdates();
    expect(container.querySelector(".cm-editor .markra-ai-selection-hold")).not.toBeInTheDocument();
  });

  it("inserts the default menu image and renders its preview after leaving the source", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    act(() => {
      menuHandlers.insertImage?.();
    });

    const visualView = getVisibleCodeMirrorView(container);
    const insertedMarkdown = "![alt](assets/image.png)";
    await waitFor(() => {
      expect(visualView.state.doc.toString()).toContain(insertedMarkdown);
    });
    const imageFrom = visualView.state.doc.toString().indexOf(insertedMarkdown);
    expect(visualView.state.sliceDoc(
      visualView.state.selection.main.from,
      visualView.state.selection.main.to
    )).toBe("assets/image.png");

    act(() => {
      visualView.dispatch({ selection: EditorSelection.cursor(imageFrom + insertedMarkdown.length) });
    });
    const image = await waitFor(() => {
      const insertedImage = container.querySelector<HTMLImageElement>(
        '.cm-editor img[src="assets/image.png"]'
      );
      expect(insertedImage).toBeInTheDocument();
      return insertedImage!;
    });

    expect(image).toHaveAttribute("alt", "alt");
  });

  it("keeps source edits undoable after switching back to visual mode", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await selectEditorViewMode("Source code");
    replaceMarkdownSource(
      await screen.findByRole("textbox", { name: "Markdown source" }),
      "# Source history\n\nShared undo."
    );

    await waitFor(() => {
      const visualEditor = container.querySelector<HTMLElement>('[data-editor-engine="codemirror"]');
      expect(visualEditor).toBeInTheDocument();
      expect(EditorView.findFromDOM(visualEditor!)?.state.doc.toString()).toBe(
        "# Source history\n\nShared undo."
      );
    });

    await selectEditorViewMode("Preview");
    const visualView = getVisibleCodeMirrorView(container);
    await waitFor(() => {
      expect(visualView.state.doc.toString()).toBe("# Source history\n\nShared undo.");
    });

    act(() => {
      menuHandlers.editUndo?.();
    });
    await expectVisibleMarkdownWithout("Source history");
    await expectVisibleMarkdownText("Welcome to Markra");
    expect(getVisibleCodeMirrorView(container)).toBe(visualView);
    expect(redoDepth(visualView.state)).toBeGreaterThan(0);

    act(() => {
      menuHandlers.editRedo?.();
    });
    expect(getVisibleCodeMirrorView(container)).toBe(visualView);
    expect(redoDepth(visualView.state)).toBe(0);
    await waitFor(() => {
      expect(visualView.state.doc.toString()).toBe("# Source history\n\nShared undo.");
    });
  });

  it("keeps callout body line breaks when switching from source to visual mode", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    replaceMarkdownSource(sourceEditor, "> [!WARNING]\n>\n> First line\n> Second line");

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-editor .cm-markra-callout")).toHaveLength(4);
      expect(document.querySelector(".cm-editor .markra-callout-header")).toHaveTextContent("Warning");
    });

    await selectEditorViewMode("Source code");
    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(
      "> [!WARNING]\n>\n> First line\n> Second line"
    );
  });

  it("keeps explicit empty callout body lines when switching source and visual modes", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");

    const source = "> [!WARNING]\n>\n>";
    replaceMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }), source);

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-editor .cm-markra-callout")).toHaveLength(3);
    });

    await selectEditorViewMode("Source code");

    await waitFor(() => {
      expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(source);
    });

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-editor .cm-markra-callout")).toHaveLength(3);
    });
  });

  it("keeps trailing empty callout body lines after content when switching source and visual modes", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Source code");

    const source = "> [!WARNING]\n>\n> Synthetic details\n>\n>";
    replaceMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }), source);

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-editor .cm-markra-callout")).toHaveLength(5);
    });

    await selectEditorViewMode("Source code");

    await waitFor(() => {
      expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(source);
    });

    await selectEditorViewMode("Preview");

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-editor .cm-markra-callout")).toHaveLength(5);
    });
  });

  it("shows a large-file notice instead of rendering oversized markdown in visual mode", async () => {
    const largeContent = `# Oversized file\n\n${"Synthetic paragraph. ".repeat(110_000)}`;
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-large-visual-limit",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: largeContent,
      name: "oversized.md",
      path: mockNativePath
    });

    const { container } = renderApp();

    expect(await screen.findByText("This file is too large to render in visual mode.")).toBeInTheDocument();
    expect(screen.getByText("Open it in source mode to keep editing without rendering the full document.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in source mode" })).toBeInTheDocument();
    expect(container.querySelector(".cm-editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Markdown source" })).not.toBeInTheDocument();
  });

  it("uses native file size metadata to block visual rendering before content thresholds", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-large-size-limit",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# File with large native size\n\nSynthetic body.",
      name: "large-size.md",
      path: mockNativePath,
      sizeBytes: 1_000_001
    });

    const { container } = renderApp();

    expect(await screen.findByText("This file is too large to render in visual mode.")).toBeInTheDocument();
    expect(container.querySelector(".cm-editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "File with large native size" })).not.toBeInTheDocument();
  });

  it("opens oversized markdown in source mode and returns to the visual notice", async () => {
    const largeContent = `# Oversized source\n\n${"Synthetic paragraph. ".repeat(110_000)}`;
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-large-source-limit",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: largeContent,
      name: "oversized.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Open in source mode" }));

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(readMarkdownSource(sourceEditor)).toBe(largeContent);

    replaceMarkdownSource(sourceEditor, `${largeContent}\n\nEdited in source mode.`);

    await selectEditorViewMode("Preview");

    expect(await screen.findByText("This file is too large to render in visual mode.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Oversized source" })).not.toBeInTheDocument();
  });

  it("keeps a restored workspace file in source mode without rerunning startup restore", async () => {
    const restoredContent = "# Restored source\n\nBack from the saved workspace.";
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: mockNativePath,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: mockFolderPath,
      openFilePaths: [mockNativePath]
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: restoredContent,
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    await expectVisibleMarkdownText("Restored source");
    await waitFor(() => expect(mockedReadNativeMarkdownFile).toHaveBeenCalledTimes(1));
    mockedReadNativeMarkdownFile.mockClear();

    await selectEditorViewMode("Source code");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(readMarkdownSource(sourceEditor)).toBe(restoredContent);

    await settleEditorUpdates();

    expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toBe(restoredContent);
    expect(screen.getByRole("button", { name: "Editor view mode: Source code" })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalled();
  });

  it("keeps source and visual editors synchronized in split mode", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await settleEditorUpdates();

    await selectEditorViewMode("Preview + Source");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const visualEditor = container.querySelector('[data-editor-engine="codemirror"]');
    expect(visualEditor).toBeInTheDocument();
    expect(container.querySelector(".editor-split-surface")).toBeInTheDocument();

    replaceMarkdownSource(sourceEditor, "# Split source edit\n\nUpdated from the source pane.");

    await waitFor(() => {
      const currentVisualEditor = container.querySelector('[data-editor-engine="codemirror"]') as HTMLElement | null;
      expect(currentVisualEditor).toBeInTheDocument();
      expect(within(currentVisualEditor as HTMLElement).getByText("Split source edit")).toBeInTheDocument();
      expect(within(currentVisualEditor as HTMLElement).getByText("Updated from the source pane.")).toBeInTheDocument();
    });

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as Record<string, () => unknown>;

    await act(async () => {
      menuHandlers.insertTable?.();
    });

    await waitFor(() => {
      const currentSource = readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }));
      expect(currentSource).toContain("|  |  |\n| --- | --- |\n|  |  |");
      expect(currentSource).not.toContain("Column 1");
      expect(currentSource).not.toContain("Column 2");
    });
  });

  it("keeps a visual update that arrives after source pane focus in split mode", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();

    await selectEditorViewMode("Preview + Source");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    await act(async () => {
      fireEvent.focusIn(sourceEditor);
    });

    const visualView = getVisibleCodeMirrorView(container);
    act(() => {
      visualView.dispatch({
        changes: {
          from: visualView.state.doc.length,
          insert: "\n\nDelayed visual sync."
        },
        userEvent: "input.type"
      });
    });

    await waitFor(() => {
      expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toContain(
        "Delayed visual sync."
      );
    });
  });

  it("keeps a synced visual edit in source after focusing the source pane in split mode", async () => {
    const { container } = renderApp();

    await expectVisibleCodeMirrorText(container, "Welcome to Markra");
    await settleEditorUpdates();

    await selectEditorViewMode("Preview + Source");

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const originalSource = readMarkdownSource(sourceEditor);
    const visualView = getVisibleCodeMirrorView(container);

    await act(async () => {
      fireEvent.focusIn(visualView.dom);
    });
    act(() => {
      visualView.dispatch({ selection: EditorSelection.cursor(0) });
    });
    typeVisualText(visualView, "Visual typed before source focus. ");

    await waitFor(() => {
      expect(readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }))).toContain(
        "Visual typed before source focus."
      );
    });

    await act(async () => {
      fireEvent.focusIn(screen.getByRole("textbox", { name: "Markdown source" }));
    });

    await waitFor(() => {
      const currentSource = readMarkdownSource(screen.getByRole("textbox", { name: "Markdown source" }));
      expect(currentSource).toContain("Visual typed before source focus.");
      expect(currentSource).not.toBe(originalSource);
    });
  });

  it("places the visual pane before the source pane in split mode", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Preview + Source");

    const splitSurface = container.querySelector(".editor-split-surface");
    expect(splitSurface).toBeInTheDocument();

    const [visualPane, , sourcePane] = Array.from(splitSurface!.children) as HTMLElement[];
    expect(within(visualPane!).getByLabelText("Markdown editor")).toHaveAttribute("data-editor-engine", "codemirror");
    expect(await within(sourcePane!).findByRole("textbox", { name: "Markdown source" })).toBeInTheDocument();
  });

  it("resizes split panes from the center divider and persists the ratio", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Preview + Source");

    const splitSurface = container.querySelector<HTMLElement>(".editor-split-surface");
    expect(splitSurface).toBeInTheDocument();
    vi.spyOn(splitSurface!, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 100,
      right: 1100,
      top: 0,
      width: 1000,
      x: 100,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);

    const resizeHandle = await screen.findByRole("separator", { name: "Resize split panes" });

    fireEvent.pointerDown(resizeHandle, { clientX: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 700 });
    fireEvent.pointerUp(window);

    expect(splitSurface!.style.getPropertyValue("--split-visual-pane")).toBe("60fr");
    expect(splitSurface!.style.getPropertyValue("--split-source-pane")).toBe("40fr");
    expect(resizeHandle).toHaveAttribute("aria-valuemin", "25");
    expect(resizeHandle).toHaveAttribute("aria-valuemax", "75");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "60");
    await waitFor(() => expect(mockedSaveStoredEditorPreferences).toHaveBeenCalledWith(expect.objectContaining({
      splitVisualPanePercent: 60
    })));
    await waitFor(() => expect(mockedNotifyAppEditorPreferencesChanged).toHaveBeenCalledWith(expect.objectContaining({
      splitVisualPanePercent: 60
    })));
  });

  it("links source and visual pane scrolling in split mode", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    await selectEditorViewMode("Preview + Source");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });

    const splitScrollElements = Array.from(
      container.querySelectorAll<HTMLElement>(".editor-split-surface .paper-scroll")
    );
    const sourceScroll = sourceEditor.closest<HTMLElement>(".paper-scroll");
    const visualScroll = splitScrollElements.find((element) => element !== sourceScroll) ?? null;
    expect(sourceScroll).toBeInTheDocument();
    expect(visualScroll).toBeInTheDocument();

    mockScrollMetrics(sourceScroll!, {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 200
    });
    mockScrollMetrics(visualScroll!, {
      clientHeight: 300,
      scrollHeight: 700,
      scrollTop: 0
    });

    fireEvent.scroll(sourceScroll!);

    expect(visualScroll!.scrollTop).toBe(100);
  });

  it("recalibrates split pane scrolling after target layout changes", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await settleEditorUpdates();

    await selectEditorViewMode("Preview + Source");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });

    const splitScrollElements = Array.from(
      container.querySelectorAll<HTMLElement>(".editor-split-surface .paper-scroll")
    );
    const sourceScroll = sourceEditor.closest<HTMLElement>(".paper-scroll");
    const visualScroll = splitScrollElements.find((element) => element !== sourceScroll && !element.closest("[hidden]")) ?? null;
    expect(sourceScroll).toBeInTheDocument();
    expect(visualScroll).toBeInTheDocument();

    const resyncFrames: FrameRequestCallback[] = [];
    const flushResyncFrames = () => {
      const frames = resyncFrames.splice(0);
      frames.forEach((frame) => frame(0));
    };
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      resyncFrames.push(callback);
      return resyncFrames.length;
    });

    mockScrollMetrics(sourceScroll!, {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 200
    });
    mockScrollMetrics(visualScroll!, {
      clientHeight: 300,
      scrollHeight: 700,
      scrollTop: 0
    });

    fireEvent.scroll(sourceScroll!);
    expect(visualScroll!.scrollTop).toBe(100);

    mockScrollMetrics(visualScroll!, {
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: visualScroll!.scrollTop
    });

    act(() => {
      flushResyncFrames();
    });

    expect(visualScroll!.scrollTop).toBe(150);
    requestAnimationFrameSpy.mockRestore();
  });

  it("keeps scroll progress when an opened file switches from visual to source mode", async () => {
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "file",
      file: {
        content: `# External file\r\n\r\n${"Paragraph\r\n\r\n".repeat(80)}`,
        name: "external.md",
        path: "/mock-files/external.md"
      }
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("External file");
    await settleEditorUpdates();

    const visualScroll = getVisibleWritingSurface(container);
    mockScrollMetrics(visualScroll, {
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 400
    });
    fireEvent.scroll(visualScroll);

    const restoreFrames: FrameRequestCallback[] = [];
    const flushAppRestoreFrame = (scrollElement: HTMLElement) => {
      while (restoreFrames.length > 0 && scrollElement.scrollTop === 0) {
        restoreFrames.shift()!(0);
      }
      // CodeMirror schedules its own measurement frames; they are outside this App-level assertion.
      restoreFrames.length = 0;
    };
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      restoreFrames.push(callback);
      return restoreFrames.length;
    });

    try {
      await selectEditorViewMode("Source code");
      const sourceScroll = (await screen.findByLabelText("Markdown source")).closest<HTMLElement>(".paper-scroll")!;
      mockScrollMetrics(sourceScroll, {
        clientHeight: 200,
        scrollHeight: 1200,
        scrollTop: 0
      });

      act(() => {
        flushAppRestoreFrame(sourceScroll);
      });

      expect(sourceScroll.scrollTop).toBe(500);

      fireEvent.scroll(sourceScroll);
      await selectEditorViewMode("Preview");
      const restoredVisualScroll = getVisibleWritingSurface(container);
      mockScrollMetrics(restoredVisualScroll, {
        clientHeight: 200,
        scrollHeight: 1000,
        scrollTop: 0
      });

      act(() => {
        flushAppRestoreFrame(restoredVisualScroll);
      });

      expect(restoredVisualScroll.scrollTop).toBe(400);
    } finally {
      requestAnimationFrameSpy.mockRestore();
    }
  });

  it("switches source mode from the keyboard shortcut", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "s", altKey: true, metaKey: true });

    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(readMarkdownSource(sourceEditor)).toContain("# Welcome to Markra");

    fireEvent.keyDown(window, { key: "s", altKey: true, metaKey: true });

    expect(await screen.findByLabelText("Markdown editor")).toHaveAttribute("data-editor-engine", "codemirror");
  });

  it("opens document search from the keyboard shortcut", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    expect(fireEvent.keyDown(window, { key: "f", metaKey: true })).toBe(false);

    expect(screen.getByRole("search", { name: "Find in document" })).toBeInTheDocument();
    const searchInput = screen.getByRole("searchbox", { name: "Find in document" });
    expect(searchInput).toHaveFocus();
    expect(searchInput).toHaveAttribute("autocomplete", "off");
    expect(searchInput).toHaveAttribute("autocapitalize", "none");
    expect(searchInput).toHaveAttribute("autocorrect", "off");
    expect(searchInput).toHaveAttribute("spellcheck", "false");
    expect(screen.getByRole("button", { name: "Case sensitive" })).not.toHaveAttribute("title");
    expect(container.querySelector(".editor-content-slot")).toHaveAttribute("data-document-search-open", "true");
  });

  it("opens document replace from the native Windows Ctrl+H keyboard shortcut", async () => {
    mockedResolveDesktopPlatform.mockReturnValue("windows");

    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    expect(fireEvent.keyDown(window, { key: "h", ctrlKey: true })).toBe(false);

    expect(screen.getByRole("search", { name: "Find in document" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find in document" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Replace" })).toBeInTheDocument();
  });

  it("opens document replace from the native macOS Cmd+Option+F keyboard shortcut", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    expect(fireEvent.keyDown(window, { altKey: true, code: "KeyF", key: "ƒ", metaKey: true })).toBe(false);

    expect(screen.getByRole("search", { name: "Find in document" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Find in document" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Replace" })).toBeInTheDocument();
  });

  it("uses native workspace file count before entering a search query", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "vault",
      path: mockFolderPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" }
    ]);
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [],
      searchedFileCount: 3,
      truncated: false,
      unreadableFileCount: 0
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("button", { name: "guide.md" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });

    await waitFor(() =>
      expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledWith(expect.objectContaining({
        caseSensitive: false,
        path: mockFolderPath,
        query: ""
      }))
    );
    expect(await screen.findByText("3 files")).toBeInTheDocument();
    expect(screen.queryByText("1 file")).not.toBeInTheDocument();
  });

  it("uses native workspace search when the desktop runtime provides it", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "vault",
      path: mockFolderPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" }
    ]);
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [
        {
          columnNumber: 3,
          file: { name: "guide.md", path: guidePath, relativePath: "guide.md" },
          id: `${guidePath}:2`,
          lineNumber: 1,
          lineText: "# Alpha guide",
          match: { from: 2, to: 7 },
          matchIndex: 0,
          snippet: "# Alpha guide"
        }
      ],
      searchedFileCount: 1,
      truncated: false,
      unreadableFileCount: 0
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("button", { name: "guide.md" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace" }), {
      target: { value: "alpha" }
    });

    await waitFor(() =>
      expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledWith(expect.objectContaining({
        caseSensitive: false,
        path: mockFolderPath,
        query: "alpha"
      }))
    );
    expect(mockedReadNativeMarkdownFile).not.toHaveBeenCalledWith(guidePath);
    expect(await screen.findByRole("button", { name: "Open guide.md line 1" })).toBeInTheDocument();
  });

  it("clears workspace search after closing with Escape", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "vault",
      path: mockFolderPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" }
    ]);
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [],
      searchedFileCount: 1,
      truncated: false,
      unreadableFileCount: 0
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("button", { name: "guide.md" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace" }), {
      target: { value: "alpha" }
    });
    await waitFor(() => expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search workspace" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search workspace" })).not.toBeInTheDocument();

    mockedSearchNativeMarkdownFilesForPath.mockClear();
    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });

    expect(screen.getByRole("searchbox", { name: "Search workspace" })).toHaveValue("");
    await waitFor(() =>
      expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledWith(expect.objectContaining({
        path: mockFolderPath,
        query: ""
      }))
    );
    expect(mockedSearchNativeMarkdownFilesForPath).not.toHaveBeenCalledWith(expect.objectContaining({
      query: "alpha"
    }));
  });

  it("shows recent workspace searches after closing and reopening search", async () => {
    const guidePath = "/mock-files/vault/guide.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "vault",
      path: mockFolderPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" }
    ]);
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [],
      searchedFileCount: 1,
      truncated: false,
      unreadableFileCount: 0
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("button", { name: "guide.md" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace" }), {
      target: { value: "alpha" }
    });
    await waitFor(() =>
      expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledWith(expect.objectContaining({
        path: mockFolderPath,
        query: "alpha"
      }))
    );

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search workspace" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search workspace" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    const recentSearches = screen.getByRole("list", { name: "Recent searches" });

    fireEvent.click(within(recentSearches).getByRole("button", { name: "Search for alpha" }));

    expect(screen.getByRole("searchbox", { name: "Search workspace" })).toHaveValue("alpha");
  });

  it("does not open document search after opening a workspace search result", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    mockedOpenNativeMarkdownFolder.mockResolvedValue({
      name: "vault",
      path: mockFolderPath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nSynthetic alpha note.",
      name: "guide.md",
      path: guidePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("button", { name: "guide.md" })).toBeInTheDocument();

    expect(fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true })).toBe(false);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace" }), {
      target: { value: "alpha" }
    });
    fireEvent.click(await screen.findByRole("button", { name: "Open guide.md line 3" }));

    await expectVisibleMarkdownText("Guide");
    expect(screen.queryByRole("search", { name: "Find in document" })).not.toBeInTheDocument();
  });

  it("does not open the AI command when visual document search focuses a match", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "Welcome" }
    });

    await waitFor(() => expect(container.querySelector(".cm-markra-search-match-current")).toBeInTheDocument());
    await settleEditorUpdates();

    expect(screen.queryByRole("dialog", { name: "AI writing command" })).not.toBeInTheDocument();
  });

  it("does not scroll the visual editor while typing a document search query", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    const view = getVisibleCodeMirrorView(container);
    const selectionBeforeSearch = view.state.selection.main.from;

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    const searchbox = screen.getByRole("searchbox", { name: "Find in document" });
    fireEvent.change(searchbox, { target: { value: "Welcome" } });

    await waitFor(() => expect(container.querySelector(".cm-markra-search-match-current")).toBeInTheDocument());
    await settleEditorUpdates();

    expect(view.state.selection.main.from).toBe(selectionBeforeSearch);
    expect(searchbox).toHaveFocus();
  });

  it("does not count hidden display math source as a visual document search match", async () => {
    mockOpenMarkdownFile({
      content: [
        "# c",
        "",
        "$$",
        String.raw`\begin{aligned}`,
        String.raw`z &= csa \\`,
        String.raw`z &= csb`,
        String.raw`\end{aligned}`,
        "$$"
      ].join("\n"),
      name: "math.md",
      path: mockNativePath
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("c");

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "csa" }
    });

    await waitFor(() => expect(screen.getByText("0/0")).toBeInTheDocument());
    expect(container.querySelector(".cm-editor .markra-search-match-current")).not.toBeInTheDocument();
  });

  it("keeps the image preview rendered while source editing and document search open", async () => {
    mockOpenMarkdownFile({
      content: "Intro\n\n![Screenshot](assets/pasted-image.png)\n\nContent",
      name: "native.md",
      path: mockNativePath
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByText("Content")).toBeInTheDocument();

    const image = container.querySelector<HTMLImageElement>('.cm-editor img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();
    const view = getVisibleCodeMirrorView(container);
    const imageFrom = view.state.doc.toString().indexOf("![Screenshot]");
    act(() => {
      view.focus();
      view.dispatch({ selection: EditorSelection.cursor(imageFrom + 2) });
    });
    await waitFor(() => {
      expect(container.querySelector(".markra-image-node-selected")).toBeInTheDocument();
    });
    expect(container.querySelector('.cm-editor img[src="assets/pasted-image.png"]')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true });

    expect(screen.getByRole("searchbox", { name: "Find in document" })).toHaveFocus();
    expect(container.querySelector('.cm-editor img[src="assets/pasted-image.png"]')).toBeInTheDocument();
  });

  it("replaces the current source-mode document search match", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "s", altKey: true, metaKey: true });
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });

    fireEvent.keyDown(window, { key: "f", altKey: true, metaKey: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in document" }), {
      target: { value: "Welcome" }
    });
    const replaceInput = screen.getByRole("textbox", { name: "Replace" });
    expect(replaceInput).toHaveAttribute("autocomplete", "off");
    expect(replaceInput).toHaveAttribute("autocapitalize", "none");
    expect(replaceInput).toHaveAttribute("autocorrect", "off");
    expect(replaceInput).toHaveAttribute("spellcheck", "false");
    fireEvent.change(screen.getByRole("textbox", { name: "Replace" }), {
      target: { value: "Hello" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(readMarkdownSource(sourceEditor)).toContain("# Hello to Markra");
  });

  it("toggles read-only mode from the keyboard shortcut and marks the status area", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "l", altKey: true, metaKey: true });

    expect(screen.getByText("read-only")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Markdown document" })).toHaveAttribute(
      "contenteditable",
      "false"
    );

    fireEvent.keyDown(window, { key: "l", altKey: true, metaKey: true });

    expect(screen.queryByText("read-only")).not.toBeInTheDocument();
  });

  it("keeps source mode read-only while read-only mode is active", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "s", altKey: true, metaKey: true });
    fireEvent.keyDown(window, { key: "l", altKey: true, metaKey: true });

    expect(await screen.findByRole("textbox", { name: "Markdown source" })).toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("prevents visual table controls from editing after read-only mode is toggled", async () => {
    mockOpenMarkdownFile({
      content: ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n"),
      name: "table.md",
      path: mockNativePath
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).toBeInTheDocument());
    const rowCount = () => container.querySelectorAll(".cm-markra-table tr").length;

    expect(rowCount()).toBe(2);

    fireEvent.keyDown(window, { key: "l", altKey: true, metaKey: true });
    expect(screen.getByRole("textbox", { name: "Markdown document" })).toHaveAttribute(
      "contenteditable",
      "false"
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Add row below" }));

    expect(rowCount()).toBe(2);
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("syncs visual table cell edits to source in split mode and saves them", async () => {
    mockOpenMarkdownFile({
      content: ["| Field | Value |", "| --- | --- |", "| Name | Before |"].join("\n"),
      name: "table.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "table.md",
      path: mockNativePath
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await selectEditorViewMode("Preview + Source");
    const sourceEditor = await screen.findByRole("textbox", { name: "Markdown source" });
    const cell = await waitFor(() => {
      const nextCell = container.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td:nth-child(2)"
      );
      expect(nextCell).toBeInTheDocument();
      return nextCell!;
    });

    cell.focus();
    cell.textContent = "After";
    fireEvent.input(cell.closest("table")!);
    const editedCell = await waitFor(() => {
      const nextCell = container.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td:nth-child(2)"
      );
      expect(nextCell).toHaveTextContent("After");
      expect(nextCell).toHaveFocus();
      return nextCell!;
    });
    await waitFor(() =>
      expect(readMarkdownSource(sourceEditor)).toContain("| Name | After |")
    );
    fireEvent.keyDown(editedCell, { key: "s", metaKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: ["| Field | Value |", "| --- | --- |", "| Name | After |"].join("\n"),
          path: mockNativePath,
          suggestedName: "table.md"
        })
      )
    );
  });

  it("keeps a clean file unmodified when toggling markdown source mode without edits", async () => {
    const originalContent = "Native file\n===========\n\nOpened from disk.";
    mockOpenMarkdownFile({
      content: originalContent,
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();

    await selectEditorViewMode("Source code");

    expect(readMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }))).toBe(originalContent);
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();

    await selectEditorViewMode("Preview");

    await expectVisibleMarkdownText("Native file");
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("keeps a clean file unmodified when clicking a rendered heading", async () => {
    mockOpenMarkdownFile({
      content: "### C\n\nSummary content.",
      name: "test.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    const heading = await screen.findByRole("heading", { name: "C" });
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();

    fireEvent.click(heading);

    expect(await screen.findByRole("heading", { name: "C" })).toBeInTheDocument();
    await settleEditorUpdates();

    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();

    await selectEditorViewMode("Source code");

    expect(readMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" })).trim()).toBe(
      "### C\n\nSummary content."
    );
    expect(screen.queryByLabelText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("saves markdown source mode edits through the native file API", async () => {
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    await selectEditorViewMode("Source code");
    replaceMarkdownSource(
      await screen.findByRole("textbox", { name: "Markdown source" }),
      "# Source save\n\nSaved from source mode."
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: "# Source save\n\nSaved from source mode.",
          path: mockNativePath,
          suggestedName: "native.md"
        })
      )
    );
  });

  it("runs remote sync after saving when sync on save is enabled", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      files: {
        ...runtime.files,
        syncMarkdownFolder: mockedSyncNativeMarkdownFolder
      }
    });
    mockedGetStoredSyncSettings.mockResolvedValue({
      autoSyncOnSave: true,
      enabled: true,
      intervalMinutes: 0,
      lastSyncAt: null,
      provider: "webdav",
      remotePath: "markra"
    });
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      imageUpload: {
        ...defaultImageUpload,
        provider: "webdav",
        webdav: {
          ...defaultImageUpload.webdav,
          password: "secret",
          serverUrl: "https://webdav.example.test/dav",
          username: "mock-user"
        }
      }
    }));
    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Native file");

    await selectEditorViewMode("Source code");
    replaceMarkdownSource(
      await screen.findByRole("textbox", { name: "Markdown source" }),
      "# Source save\n\nSynced after save."
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() => expect(mockedSaveNativeMarkdownFile).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockedSyncNativeMarkdownFolder).toHaveBeenCalledWith({
        provider: "webdav",
        sourcePath: mockNativePath,
        webdav: {
          password: "secret",
          remotePath: "markra",
          serverUrl: "https://webdav.example.test/dav",
          username: "mock-user"
        }
      })
    );
    expect(mockedNotifyAppSyncSettingsChanged).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      lastSyncAt: expect.any(Number),
      provider: "webdav",
      remotePath: "markra"
    }));
  });

  it("runs manual remote sync from the native menu", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      files: {
        ...runtime.files,
        syncMarkdownFolder: mockedSyncNativeMarkdownFolder
      }
    });
    mockedGetStoredSyncSettings.mockResolvedValue({
      autoSyncOnSave: false,
      enabled: true,
      intervalMinutes: 0,
      lastSyncAt: null,
      provider: "webdav",
      remotePath: "markra"
    });
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      imageUpload: {
        ...defaultImageUpload,
        provider: "webdav",
        webdav: {
          ...defaultImageUpload.webdav,
          password: "synthetic-secret",
          serverUrl: "https://webdav.example.test/dav",
          username: "synthetic-user"
        }
      }
    }));
    mockOpenMarkdownFile({
      content: "# Manual sync\n\nSynthetic note.",
      name: "manual-sync.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("Manual sync");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.syncNow?.();
    });

    expect(mockedSyncNativeMarkdownFolder).toHaveBeenCalledWith({
      provider: "webdav",
      sourcePath: mockNativePath,
      webdav: {
        password: "synthetic-secret",
        remotePath: "markra",
        serverUrl: "https://webdav.example.test/dav",
        username: "synthetic-user"
      }
    });
  });

  it("schedules automatic remote sync when an interval is configured", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      features: {
        ...runtime.features,
        spellcheck: true,
        updater: false
      },
      files: {
        ...runtime.files,
        syncMarkdownFolder: mockedSyncNativeMarkdownFolder
      }
    });
    mockedGetStoredSyncSettings.mockResolvedValue({
      autoSyncOnSave: false,
      enabled: true,
      intervalMinutes: 5,
      lastSyncAt: null,
      provider: "webdav",
      remotePath: "markra"
    });
    mockedGetStoredEditorPreferences.mockResolvedValue(createStoredEditorPreferences({
      imageUpload: {
        ...defaultImageUpload,
        provider: "webdav",
        webdav: {
          ...defaultImageUpload.webdav,
          password: "secret",
          serverUrl: "https://webdav.example.test/dav",
          username: "mock-user"
        }
      }
    }));
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: []
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Native file\n\nRestored from disk.",
      name: "native.md",
      path: mockNativePath
    });
    let syncInterval: (() => unknown) | null = null;
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5 * 60 * 1000) syncInterval = handler as () => unknown;

      return 42;
    }) as typeof window.setInterval);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => {});

    try {
      renderApp();

      await waitFor(() => expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000));
      expect(await screen.findByText("Restored from disk.")).toBeInTheDocument();
      expect(syncInterval).not.toBeNull();

      await act(async () => {
        await syncInterval?.();
      });

      await waitFor(() =>
        expect(mockedSyncNativeMarkdownFolder).toHaveBeenCalledWith(expect.objectContaining({
          provider: "webdav",
          sourcePath: mockNativePath,
          webdav: {
            password: "secret",
            remotePath: "markra",
            serverUrl: "https://webdav.example.test/dav",
            username: "mock-user"
          }
        }))
      );
    } finally {
      clearIntervalSpy.mockRestore();
      setIntervalSpy.mockRestore();
    }
  });

  it("saves expanded link source as markdown instead of escaped text", async () => {
    mockOpenMarkdownFile({
      content: "[About us](https://example.test/articles/about)",
      name: "native.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });
    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await expectVisibleMarkdownText("[About us](https://example.test/articles/about)");
    const view = getVisibleCodeMirrorView(container);
    act(() => {
      view.dispatch({ selection: EditorSelection.cursor(2) });
    });
    expect(view.state.doc.toString()).toBe("[About us](https://example.test/articles/about)");

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: mockNativePath,
          suggestedName: "native.md"
        })
      )
    );
    const savedContents = mockedSaveNativeMarkdownFile.mock.calls.at(-1)?.[0].contents ?? "";
    expect(savedContents).toContain("[About us](https://example.test/articles/about)");
    expect(savedContents).not.toContain("\\[About us\\]");
    expect(savedContents).not.toContain("\\(https\\://example.test/articles/about\\)");
  });

  it("opens relative markdown links inside the current folder workspace", async () => {
    const guidePath = "/mock-files/docs/guide.md";
    mockOpenMarkdownFile({
      content: "[Guide](./docs/guide.md)",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" },
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened through a document link.",
      name: "guide.md",
      path: guidePath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    revealVisualPreviews(container);
    let link: HTMLAnchorElement | null = null;
    await waitFor(() => {
      link = document.querySelector<HTMLAnchorElement>('.cm-editor a[href="./docs/guide.md"]');
      expect(link).toHaveTextContent("Guide");
    });
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockNativePath, defaultFileTreeListOptions)
    );
    await waitFor(() =>
      expect(mockedLoadNativeMarkdownFilesForPath).toHaveBeenCalledWith(
        mockNativePath,
        expect.objectContaining(defaultFileTreeListOptions)
      )
    );
    link!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true, metaKey: true }));

    expect(await screen.findByText("Opened through a document link.")).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedOpenNativeExternalUrl).not.toHaveBeenCalled();
  });

  it("opens relative markdown links before the current folder tree finishes loading", async () => {
    const guidePath = "/mock-files/docs/guide.md";
    let finishTreeLoad = () => {};
    mockOpenMarkdownFile({
      content: "[Guide](./docs/guide.md)",
      name: "native.md",
      path: mockNativePath
    });
    mockedLoadNativeMarkdownFilesForPath.mockImplementation((_path, options = {}) =>
      new Promise((resolve) => {
        finishTreeLoad = () => {
          const files = [{ name: "native.md", path: mockNativePath, relativePath: "native.md" }];
          if (!options.signal?.aborted) options.onBatch?.(files);
          resolve(files);
        };
      })
    );
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened before the tree finished loading.",
      name: "guide.md",
      path: guidePath
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    revealVisualPreviews(container);
    let link: HTMLAnchorElement | null = null;
    await waitFor(() => {
      link = document.querySelector<HTMLAnchorElement>('.cm-editor a[href="./docs/guide.md"]');
      expect(link).toHaveTextContent("Guide");
    });
    link!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true, metaKey: true }));

    expect(await screen.findByText("Opened before the tree finished loading.")).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(guidePath);
    expect(mockedOpenNativeExternalUrl).not.toHaveBeenCalled();

    finishTreeLoad();
  });

  it("wires native menu file actions to the current document commands", async () => {
    mockOpenMarkdownFile({
      content: "# Native menu file\n\nOpened from the native menu.",
      name: "native-menu.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native-menu.md",
      path: mockNativePath
    });

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openDocument?.();
    });

    expect(await screen.findByRole("heading", { name: "Native menu file" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /native-menu\.md/ })).toBeInTheDocument();

    await act(async () => {
      await menuHandlers.saveDocument?.();
    });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: mockNativePath,
          suggestedName: "native-menu.md"
        })
      )
    );

    await act(async () => {
      await menuHandlers.saveDocumentAs?.();
    });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownFile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: null,
          suggestedName: "native-menu.md"
        })
      )
    );

    expect(screen.getByRole("tab", { name: /native-menu\.md/ })).toBeInTheDocument();
  });

  it("opens a recent markdown file from the native application menu", async () => {
    const recentFile = {
      name: "recent-menu.md",
      path: "/mock-files/recent-menu.md"
    };
    mockedGetStoredRecentMarkdownFiles.mockResolvedValue([recentFile]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Recent menu\n\nOpened from the recent files menu.",
      name: recentFile.name,
      path: recentFile.path
    });

    renderApp();

    await waitFor(() =>
      expect(mockedInstallNativeApplicationMenu.mock.calls.some((call) =>
        JSON.stringify(call[3]) === JSON.stringify([recentFile])
      )).toBe(true)
    );
    const menuCall = mockedInstallNativeApplicationMenu.mock.calls.find((call) =>
      JSON.stringify(call[3]) === JSON.stringify([recentFile])
    );
    const menuHandlers = menuCall?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openRecentFile?.(recentFile);
    });

    expect(await screen.findByRole("heading", { name: "Recent menu" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /recent-menu\.md/ })).toBeInTheDocument();
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(recentFile.path);
    expect(mockedSaveStoredRecentMarkdownFile).toHaveBeenCalledWith(recentFile);
  });

  it("clears recent markdown files from the native application menu", async () => {
    const recentFile = {
      name: "clearable.md",
      path: "/mock-files/clearable.md"
    };
    mockedGetStoredRecentMarkdownFiles.mockResolvedValue([recentFile]);

    renderApp();

    await waitFor(() =>
      expect(mockedInstallNativeApplicationMenu.mock.calls.some((call) =>
        JSON.stringify(call[3]) === JSON.stringify([recentFile])
      )).toBe(true)
    );
    const menuCall = mockedInstallNativeApplicationMenu.mock.calls.find((call) =>
      JSON.stringify(call[3]) === JSON.stringify([recentFile])
    );
    const menuHandlers = menuCall?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.clearRecentFiles?.();
    });

    expect(mockedClearStoredRecentMarkdownFiles).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[3]).toEqual([]));
  });

  it("exports the current markdown document as standalone HTML from the native menu", async () => {
    mockedGetStoredExportSettings.mockResolvedValue({
      ...defaultExportSettings,
      fontFamily: "Example Serif"
    });
    mockOpenMarkdownFile({
      content: "# Exportable\n\nRendered from markdown.",
      name: "exportable.md",
      path: mockNativePath
    });
    mockedSaveNativeHtmlFile.mockResolvedValue({
      name: "exportable.html",
      path: "/mock-files/exportable.html"
    });

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openDocument?.();
    });
    expect(await screen.findByRole("heading", { name: "Exportable" })).toBeInTheDocument();

    await act(async () => {
      await menuHandlers.exportHtml?.();
    });

    await waitFor(() =>
      expect(mockedSaveNativeHtmlFile).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: "exportable.html",
          contents: expect.stringContaining("<h1>Exportable</h1>")
        })
      )
    );
    const exportedHtml = mockedSaveNativeHtmlFile.mock.calls.at(-1)?.[0].contents ?? "";
    expect(exportedHtml).toContain("<p>Rendered from markdown.</p>");
    expect(exportedHtml).toContain("<title>exportable.md</title>");
    expect(exportedHtml).toContain('font-family: "Example Serif", ui-serif');
  });

  it("exports the current saved markdown document with its local resources from the native menu", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      features: {
        ...runtime.features,
        markdownBundle: true
      }
    });
    const markdown = [
      "# Portable Markdown",
      "",
      "![Chart](assets/chart.png)",
      "[Escaped](files/reference\\(final\\).pdf)",
      "[Reference](files/reference.pdf)",
      "[Remote](https://example.test/reference.pdf)"
    ].join("\n");
    mockOpenMarkdownFile({
      content: markdown,
      name: "portable.md",
      path: mockNativePath
    });
    mockedSaveNativeMarkdownBundleFile.mockResolvedValue({
      name: "portable.md",
      path: "/mock-exports/portable.md"
    });

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openDocument?.();
    });
    await act(async () => {
      await menuHandlers.exportMarkdown?.();
    });

    await waitFor(() =>
      expect(mockedSaveNativeMarkdownBundleFile).toHaveBeenCalledWith({
        documentPath: mockNativePath,
        folder: "assets",
        markdown,
        references: expect.arrayContaining([
          expect.objectContaining({ href: "assets/chart.png" }),
          expect.objectContaining({
            href: "files/reference(final).pdf",
            rawHref: "files/reference\\(final\\).pdf"
          }),
          expect.objectContaining({ href: "files/reference.pdf" })
        ]),
        rootPath: mockNativePath,
        suggestedName: "portable.md"
      })
    );
    expect(mockedSaveNativeMarkdownBundleFile.mock.calls[0]?.[0].references).toHaveLength(3);
  });

  it("exports the current markdown document as PDF from the native menu", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    mockedSaveNativePdfFile.mockResolvedValue({
      name: "printable.pdf",
      path: "/mock-files/printable.pdf"
    });
    mockedGetStoredExportSettings.mockResolvedValue({
      fontFamily: null,
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "Ada & Co",
      pdfFooter: "Footer",
      pdfHeader: "Header",
      pdfHeightMm: 210,
      pdfMarginMm: 12,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "custom",
      pdfWidthMm: 148
    });
    mockOpenMarkdownFile({
      content: "# Printable\n\nReady for PDF with $x^2$.",
      name: "printable.md",
      path: mockNativePath
    });

    try {
      renderApp();

      await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
      const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

      await act(async () => {
        await menuHandlers.openDocument?.();
      });
      expect(await screen.findByRole("heading", { name: "Printable" })).toBeInTheDocument();

      await act(async () => {
        await menuHandlers.exportPdf?.();
      });

      await waitFor(() =>
        expect(mockedSaveNativePdfFile).toHaveBeenCalledWith(
          expect.objectContaining({
            contents: expect.stringContaining("<h1>Printable</h1>"),
            suggestedName: "printable.pdf"
          })
        )
      );
      const exportedHtml = mockedSaveNativePdfFile.mock.calls.at(-1)?.[0].contents ?? "";
      expect(exportedHtml).toContain("Ready for PDF with");
      expect(exportedHtml).toContain("katex");
      expect(exportedHtml).toContain("@page {\n  size: 148mm 210mm;\n  margin: 12mm;\n}");
      expect(exportedHtml).toContain('<meta name="author" content="Ada &amp; Co">');
      expect(exportedHtml).toContain('<header class="markdown-export-page-header">Header</header>');
      expect(exportedHtml).toContain('<footer class="markdown-export-page-footer">Footer</footer>');
      expect(exportedHtml).toContain("break-before: page;");
      expect(exportedHtml).toContain("<title>printable.md</title>");
      expect(print).not.toHaveBeenCalled();
    } finally {
      print.mockRestore();
    }
  });

  it("exports the current markdown document through Pandoc from the native menu", async () => {
    mockedSaveNativePandocFile.mockResolvedValue({
      name: "portable.docx",
      path: "/mock-files/portable.docx"
    });
    mockedGetStoredExportSettings.mockResolvedValue({
      fontFamily: null,
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 18,
      pdfMarginPreset: "default",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });
    mockOpenMarkdownFile({
      content: "# Portable\n\n![Chart](assets/chart.png)\n\nExport me.",
      name: "portable.md",
      path: mockNativePath
    });

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openDocument?.();
    });
    expect(await screen.findByRole("heading", { name: "Portable" })).toBeInTheDocument();

    await act(async () => {
      await menuHandlers.exportDocx?.();
    });

    await waitFor(() =>
      expect(mockedSaveNativePandocFile).toHaveBeenCalledWith({
        documentPath: mockNativePath,
        format: "docx",
        markdown: expect.stringContaining("![Chart](assets/chart.png)"),
        pandocArgs: "--toc",
        pandocPath: "/usr/local/bin/pandoc",
        suggestedName: "portable.docx"
      })
    );
  });

  it("shows Pandoc setup actions when Pandoc export cannot find Pandoc", async () => {
    mockedSaveNativePandocFile.mockRejectedValue(
      new Error("Pandoc export requires Pandoc. Install Pandoc or set the executable path in Export settings.")
    );
    mockOpenMarkdownFile({
      content: "# Portable\n\nExport me.",
      name: "portable.md",
      path: mockNativePath
    });

    renderApp();

    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as NativeMenuHandlers;

    await act(async () => {
      await menuHandlers.openDocument?.();
    });

    await act(async () => {
      await menuHandlers.exportDocx?.();
    });

    await waitFor(() =>
      expect(mockedShowNativePandocSetup).toHaveBeenCalledWith({
        cancelLabel: "Cancel",
        installLabel: "Install Pandoc",
        message: "Install Pandoc to continue exporting DOCX, EPUB, or LaTeX files.",
        setPathLabel: "Set Pandoc path",
        title: "Pandoc required"
      })
    );

    mockedShowNativePandocSetup.mockResolvedValueOnce("install");
    await act(async () => {
      await menuHandlers.exportDocx?.();
    });
    expect(mockedOpenNativeExternalUrl).toHaveBeenCalledWith("https://pandoc.org/installing.html");

    mockedShowNativePandocSetup.mockResolvedValueOnce("setPath");
    await act(async () => {
      await menuHandlers.exportDocx?.();
    });
    expect(mockedOpenSettingsWindow).toHaveBeenCalledWith("exportPandocPath");
  });

  it("opens settings directly to the Pandoc path target", async () => {
    window.history.pushState({}, "", "/?settings=1&settingsTarget=exportPandocPath");
    mockedGetStoredExportSettings.mockResolvedValue({
      fontFamily: null,
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 18,
      pdfMarginPreset: "default",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });

    renderApp();

    expect(await screen.findByRole("heading", { name: "Export" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Pandoc path")).toHaveFocus());
  });

  it("detects the Pandoc executable path from export settings", async () => {
    window.history.pushState({}, "", "/?settings=1&settingsTarget=exportPandocPath");
    mockedDetectNativePandocPath.mockResolvedValue("/opt/homebrew/bin/pandoc");
    mockedGetStoredExportSettings.mockResolvedValue({
      fontFamily: null,
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 18,
      pdfMarginPreset: "default",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Detect path" }));

    await waitFor(() =>
      expect(mockedSaveStoredExportSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          pandocPath: "/opt/homebrew/bin/pandoc"
        })
      )
    );
    expect(screen.getByLabelText("Pandoc path")).toHaveValue("/opt/homebrew/bin/pandoc");
  });

  it("saves the PDF export margin from the settings export page", async () => {
    window.history.pushState({}, "", "/?settings");
    mockedGetStoredExportSettings.mockResolvedValue({
      fontFamily: null,
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 18,
      pdfMarginPreset: "default",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Export" }));
    expect(screen.queryByLabelText("Export theme")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Page size"), { target: { value: "letter" } });

    await waitFor(() =>
      expect(mockedSaveStoredExportSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          pdfHeightMm: 279,
          pdfPageSize: "letter",
          pdfWidthMm: 216
        })
      )
    );

    fireEvent.change(screen.getByLabelText("Page width"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("Page height"), { target: { value: "240" } });
    fireEvent.change(screen.getByLabelText("Page margin"), { target: { value: "custom" } });
    fireEvent.change(await screen.findByLabelText("PDF margin"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Page break on level 1 headings" }));
    fireEvent.change(screen.getByLabelText("Header"), { target: { value: "Draft" } });
    fireEvent.change(screen.getByLabelText("Footer"), { target: { value: "Page" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Pandoc path"), { target: { value: "/usr/local/bin/pandoc" } });
    fireEvent.change(screen.getByLabelText("Pandoc arguments"), { target: { value: "--toc" } });

    await waitFor(() =>
      expect(mockedSaveStoredExportSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          pandocArgs: "--toc",
          pandocPath: "/usr/local/bin/pandoc",
          pdfAuthor: "Ada",
          pdfFooter: "Page",
          pdfHeader: "Draft",
          pdfHeightMm: 240,
          pdfMarginMm: 24,
          pdfMarginPreset: "custom",
          pdfPageBreakOnH1: true,
          pdfPageSize: "custom",
          pdfWidthMm: 180
        })
      )
    );
    expect(mockedNotifyAppExportSettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        pandocArgs: "--toc",
        pandocPath: "/usr/local/bin/pandoc",
        pdfAuthor: "Ada",
        pdfFooter: "Page",
        pdfHeader: "Draft",
        pdfMarginMm: 24,
        pdfMarginPreset: "custom",
        pdfPageBreakOnH1: true
      })
    );
  });

  it("inserts a markdown table from the native editor menu handler", async () => {
    const { container } = renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalledTimes(1));
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls[0]?.[0] as Record<string, () => unknown>;

    await act(async () => {
      menuHandlers.insertTable?.();
    });

    revealVisualPreviews(container);
    await waitFor(() => expect(container.querySelector(".cm-markra-table")).toBeInTheDocument());
    const headerCells = Array.from(container.querySelectorAll(".cm-markra-table tr:first-child th")).map(
      (cell) => cell.textContent
    );
    expect(headerCells).toEqual(["", ""]);
    expect(container.querySelector(".cm-markra-table")).not.toHaveTextContent("Column 1");
    expect(container.querySelector(".cm-markra-table")).not.toHaveTextContent("Column 2");
  });

  it("does not expose native editor AI context actions without selected text", async () => {
    renderApp();

    await expectVisibleMarkdownText("Welcome to Markra");
    await waitFor(() => expect(mockedInstallNativeEditorContextMenu).toHaveBeenCalledTimes(1));
    const options = mockedInstallNativeEditorContextMenu.mock.calls[0]?.[3];

    expect(options?.getAiCommandsAvailable?.()).toBe(false);
  });

  it("reloads the current file as an undoable edit when a native watcher reports an external change", async () => {
    let emitExternalChange: (path: string) => unknown | Promise<unknown> = () => {};

    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Changed elsewhere\n\nReloaded from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedWatchNativeMarkdownFile.mockImplementation(async (_, onChange) => {
      emitExternalChange = onChange;
      return () => {};
    });

    const { container } = renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });

    await expectVisibleCodeMirrorText(container, "Native file");
    await waitFor(() => expect(mockedInstallNativeApplicationMenu).toHaveBeenCalled());
    const menuHandlers = mockedInstallNativeApplicationMenu.mock.calls.at(-1)?.[0] as NativeMenuHandlers;

    await waitFor(() =>
      expect(mockedWatchNativeMarkdownFile).toHaveBeenCalledWith(
        mockNativePath,
        expect.any(Function),
        expect.any(Function),
        {
          globalIgnoreRules: "",
          ignoreRootPath: "/mock-files"
        }
      )
    );
    await act(async () => {
      await emitExternalChange(mockNativePath);
    });

    await expectVisibleCodeMirrorText(container, "Changed elsewhere");
    expect(mockedReadNativeMarkdownFile).toHaveBeenCalledWith(mockNativePath);

    act(() => {
      menuHandlers.editUndo?.();
    });

    await expectVisibleCodeMirrorText(container, "Native file");
    await waitFor(() => expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument());
    expect(within(getVisibleCodeMirrorEditor(container)).queryByText("Changed elsewhere")).not.toBeInTheDocument();
  });

  it("refreshes the markdown file tree when the native folder watcher reports a new asset", async () => {
    let emitTreeChange: (path: string) => unknown | Promise<unknown> = () => {};

    mockOpenMarkdownFile({
      content: "# Native file\n\nOpened from disk.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "native.md", path: mockNativePath, relativePath: "native.md" }
    ]);
    mockedWatchNativeMarkdownFile.mockImplementation(async (_path, _onChange, onTreeChange) => {
      emitTreeChange = (path) => onTreeChange?.(path);
      return () => {};
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });

    await expectVisibleMarkdownText("Native file");
    await waitFor(() =>
      expect(mockedListNativeMarkdownFilesForPath).toHaveBeenCalledWith(mockNativePath, defaultFileTreeListOptions)
    );

    const callsBeforeTreeChange = mockedListNativeMarkdownFilesForPath.mock.calls.length;
    await act(async () => {
      await emitTreeChange("/mock-files/assets/pasted-image.png");
    });

    await waitFor(() => expect(mockedListNativeMarkdownFilesForPath.mock.calls.length).toBeGreaterThan(callsBeforeTreeChange));
    expect(mockedListNativeMarkdownFilesForPath).toHaveBeenLastCalledWith(mockNativePath, defaultFileTreeListOptions);
  });
});
