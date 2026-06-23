import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import {
  installAppTestHarness,
  mockNativePath,
  mockOpenMarkdownFile,
  mockedConsumeWelcomeDocumentState,
  mockedListNativeMarkdownFileHistory,
  mockedReadNativeMarkdownFileHistory,
  mockedSaveNativeMarkdownFile,
  renderApp
} from "./test/app-harness";

const editorControllerSpies = vi.hoisted(() => ({
  replaceMarkdown: vi.fn()
}));

vi.mock("./hooks/useEditorController", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hooks/useEditorController")>();

  return {
    ...actual,
    useEditorController: () => ({
      ...actual.useEditorController(),
      replaceMarkdown: editorControllerSpies.replaceMarkdown
    })
  };
});

installAppTestHarness();

async function selectEditorViewMode(optionName: "Preview" | "Source code" | "Preview + Source") {
  const modeOrder = ["Preview", "Source code", "Preview + Source"] as const;
  const currentMode = () => {
    if (screen.queryByRole("button", { name: "Editor view mode: Preview" })) return "Preview";
    if (screen.queryByRole("button", { name: "Editor view mode: Source code" })) return "Source code";
    if (screen.queryByRole("button", { name: "Editor view mode: Preview + Source" })) return "Preview + Source";

    throw new Error("Editor view mode button was not found.");
  };

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

function replaceMarkdownSource(sourceEditor: HTMLElement, value: string) {
  const view = EditorView.findFromDOM(sourceEditor);
  if (!view) {
    throw new Error("Expected the markdown source editor to use CodeMirror.");
  }

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

describe("Markra document history restore", () => {
  beforeEach(() => {
    editorControllerSpies.replaceMarkdown.mockReset();
  });

  it("logs the document history restore pipeline", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
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
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "History versions" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option"));

    await waitFor(() => {
      expect(debugSpy.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
        "[markra-history] restore click",
        "[markra-history] restore contents resolved",
        "[markra-history] app restore requested",
        "[markra-history] document restore state updated",
        "[markra-history] editor replace requested",
        "[markra-history] save restored document success"
      ]));
    });

    debugSpy.mockRestore();
  });

  it("writes restored history contents into the active visual editor", async () => {
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

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();
    editorControllerSpies.replaceMarkdown.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option"));

    await waitFor(() => {
      expect(editorControllerSpies.replaceMarkdown).toHaveBeenCalledWith("# Earlier\n\nSynthetic body.");
    });
  });

  it("saves restored history contents back to the current file", async () => {
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
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option"));

    await waitFor(() => {
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith({
        contents: "# Earlier\n\nSynthetic body.",
        historyCursorId: "history-current",
        path: mockNativePath,
        skipHistorySnapshot: true,
        suggestedName: "native.md"
      });
    });
  });

  it("toggles the floating history panel from the titlebar action", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Current\n\nSynthetic body.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    const historyButton = screen.getByRole("button", { name: "Show history" });
    fireEvent.click(historyButton);
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();

    fireEvent.click(historyButton);
    expect(screen.queryByRole("region", { name: "History versions" })).not.toBeInTheDocument();
  });

  it("toggles the floating history panel from the keyboard shortcut", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Current\n\nSynthetic body.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: "h",
      metaKey: true,
      shiftKey: true
    });
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: "h",
      metaKey: true,
      shiftKey: true
    });
    expect(screen.queryByRole("region", { name: "History versions" })).not.toBeInTheDocument();
  });

  it("keeps document history unavailable while read-only mode is active", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Current\n\nSynthetic body.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFileHistory.mockResolvedValue([]);

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    fireEvent.keyDown(window, {
      altKey: true,
      key: "l",
      metaKey: true
    });

    expect(screen.getByRole("button", { name: "Show history" })).toBeDisabled();
    fireEvent.keyDown(window, {
      key: "h",
      metaKey: true,
      shiftKey: true
    });

    expect(screen.queryByRole("region", { name: "History versions" })).not.toBeInTheDocument();
    expect(mockedListNativeMarkdownFileHistory).not.toHaveBeenCalled();
  });

  it("refreshes the open history panel after saving document updates", async () => {
    mockedConsumeWelcomeDocumentState.mockResolvedValue(false);
    mockOpenMarkdownFile({
      content: "# Current\n\nSynthetic body.",
      name: "native.md",
      path: mockNativePath
    });
    mockedListNativeMarkdownFileHistory
      .mockResolvedValueOnce([
        {
          id: "history-original",
          createdAt: 1_700_000_001_000,
          sizeBytes: 27
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "history-updated",
          createdAt: 1_700_000_002_000,
          sizeBytes: 35
        },
        {
          id: "history-original",
          createdAt: 1_700_000_001_000,
          sizeBytes: 27
        }
      ]);
    mockedSaveNativeMarkdownFile.mockResolvedValue({
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open Markdown or Folder" }));
    expect(await screen.findByText("Current")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByRole("region", { name: "History versions" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedListNativeMarkdownFileHistory).toHaveBeenCalledTimes(1);
    });

    await selectEditorViewMode("Source code");
    replaceMarkdownSource(await screen.findByRole("textbox", { name: "Markdown source" }), "# Updated\n\nSynthetic body.");
    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    await waitFor(() => {
      expect(mockedSaveNativeMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
        contents: "# Updated\n\nSynthetic body.",
        path: mockNativePath,
        suggestedName: "native.md"
      }));
    });
    await waitFor(() => {
      expect(mockedListNativeMarkdownFileHistory).toHaveBeenCalledTimes(2);
    });
  });
});
