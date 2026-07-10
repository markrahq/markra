import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Editor as MilkdownEditor, editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView as ProseMirrorEditorView } from "@milkdown/kit/prose/view";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { defaultAiQuickActionPrompts } from "./lib/ai-actions";
import {
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
  dispatchAiEditorPreviewAction,
  installAppTestHarness,
  mockFolderPath,
  mockNativePath,
  mockedCreateAiAgentSessionId,
  mockedInitializeStoredAiAgentSession,
  mockedGetStoredAiAgentSession,
  mockedGetStoredEditorPreferences,
  mockedGetStoredAiSettings,
  mockedGetStoredAiAgentPreferences,
  mockedGetStoredWorkspaceState,
  mockedListNativeMarkdownFilesForPath,
  mockedListStoredAiAgentSessions,
  mockedOpenNativeMarkdownPath,
  mockedReadNativeMarkdownFile,
  mockedSaveStoredAiSettings,
  renderApp
} from "./test/app-harness";
import { agentSessionSummary, storedAgentSession } from "./test/ai-fixtures";

installAppTestHarness();

async function settleEditorUpdates() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve(null));
  });
}

function visibleEditorView(
  container: HTMLElement,
  editors: Array<ReturnType<typeof MilkdownEditor.make>>
): ProseMirrorEditorView {
  for (const editor of editors) {
    try {
      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      if (container.contains(view.dom) && !view.dom.closest("[hidden]")) return view;
    } catch {
      // Some editor instances may be disposed while the app swaps surfaces.
    }
  }

  throw new Error("Expected a visible Milkdown editor view.");
}

function findTextPosition(view: ProseMirrorEditorView, text: string, offset = 0) {
  let result: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (result !== null || !node.isText) return true;

    const textOffset = node.text?.indexOf(text) ?? -1;
    if (textOffset < 0) return true;

    result = nodePosition + textOffset + offset;
    return false;
  });

  if (result === null) throw new Error(`Text not found in editor: ${text}`);

  return result;
}

describe("Markra AI workspace", () => {
  it("opens a right-side Markra AI workspace from the titlebar", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [
            {
              capabilities: ["text", "reasoning", "tools"],
              enabled: true,
              id: "gpt-5.5",
              name: "GPT-5.5"
            }
          ],
          name: "OpenAI",
          type: "openai"
        }
      ]
    });
    const { container } = renderApp();

    await screen.findByText("Welcome to Markra");

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));

    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toHaveAttribute("aria-pressed", "true");
    const agentPanel = await screen.findByRole("complementary", { name: "Markra AI" });
    expect(agentPanel).toBeInTheDocument();
    expect(within(agentPanel).getAllByText("OpenAI · GPT-5.5")[0]).toBeInTheDocument();
    expect(within(agentPanel).getByRole("combobox", { name: "AI model" })).toHaveTextContent("OpenAI · GPT-5.5");
    expect((container.querySelector(".editor-agent-layout") as HTMLElement).style.gridTemplateColumns).toBe(
      "minmax(0,1fr) 384px"
    );

    fireEvent.click(screen.getByRole("button", { name: "Close Markra AI" }));

    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toHaveAttribute("aria-pressed", "false");
    expect((container.querySelector(".editor-agent-layout") as HTMLElement).style.gridTemplateColumns).toBe(
      "minmax(0,1fr) 0px"
    );
  });

  it("keeps the selected editor text visibly held when the right-side AI input is focused", async () => {
    const createdEditors: Array<ReturnType<typeof MilkdownEditor.make>> = [];
    const originalMake = MilkdownEditor.make.bind(MilkdownEditor);
    const makeSpy = vi.spyOn(MilkdownEditor, "make").mockImplementation(() => {
      const editor = originalMake();
      createdEditors.push(editor);
      return editor;
    });

    try {
      const { container } = renderApp();

      await screen.findByText("Welcome to Markra");
      await settleEditorUpdates();

      const view = visibleEditorView(container, createdEditors);
      const from = findTextPosition(view, "Welcome");
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + "Welcome".length)));
      });

      fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));

      const agentPanel = await screen.findByRole("complementary", { name: "Markra AI" });
      const input = within(agentPanel).getByRole("textbox", { name: "Markra AI message" });

      fireEvent.focus(input);

      await waitFor(() => {
        expect(container.querySelector(".ProseMirror .markra-ai-selection-hold")).toHaveTextContent("Welcome");
      });
    } finally {
      makeSpy.mockRestore();
    }
  });

  it("toggles the Markra AI panel from the keyboard shortcut", async () => {
    renderApp();

    await screen.findByText("Welcome to Markra");

    fireEvent.keyDown(window, { key: "j", altKey: true, metaKey: true });

    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("complementary", { name: "Markra AI" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "j", altKey: true, metaKey: true });

    expect(screen.getByRole("button", { name: "Toggle Markra AI" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the inline AI command from the keyboard shortcut at the current block", async () => {
    renderApp();

    await screen.findByText("Welcome to Markra");
    await screen.findByRole("textbox", { name: "Markdown document" });

    fireEvent.keyDown(window, { key: "j", metaKey: true, shiftKey: true });

    expect(await screen.findByRole("textbox", { name: "AI command" })).toBeInTheDocument();
  });

  it("moves structurally complex inline prompts into the Markra AI panel", async () => {
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
      imageUpload: {
        fileNamePattern: "pasted-image-{timestamp}",
        picgo: {
          secret: "",
          serverUrl: ""
        },
        provider: "local",
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
      },
      lineHeight: 1.65,
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      paragraphSpacingPx: 8,
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      showWordCount: true,
      suggestAiPanelForComplexInlinePrompts: true,
      tableColumnWidthMode: "even",
      wrapCodeBlocks: true,
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
      }
    });

    renderApp();

    await screen.findByText("Welcome to Markra");
    await screen.findByRole("textbox", { name: "Markdown document" });

    fireEvent.keyDown(window, { key: "j", metaKey: true, shiftKey: true });

    const commandInput = await screen.findByRole("textbox", { name: "AI command" });
    fireEvent.click(commandInput);
    fireEvent.change(commandInput, {
      target: {
        value: "Compare these options\n- speed\n- reliability"
      }
    });

    fireEvent.click(await screen.findByRole("button", { name: "Use Markra AI" }));

    const agentPanel = await screen.findByRole("complementary", { name: "Markra AI" });
    expect(within(agentPanel).getByRole("textbox", { name: "Markra AI message" })).toHaveValue(
      "Compare these options\n- speed\n- reliability"
    );
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "AI command" })).not.toBeInTheDocument());
  });

  it("hides the complex inline prompt panel suggestion when the experimental setting is off", async () => {
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
      imageUpload: {
        fileNamePattern: "pasted-image-{timestamp}",
        picgo: {
          secret: "",
          serverUrl: ""
        },
        provider: "local",
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
      },
      lineHeight: 1.65,
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      paragraphSpacingPx: 8,
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      showWordCount: true,
      suggestAiPanelForComplexInlinePrompts: false,
      tableColumnWidthMode: "even",
      wrapCodeBlocks: true,
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
      }
    });

    renderApp();

    await screen.findByText("Welcome to Markra");
    await screen.findByRole("textbox", { name: "Markdown document" });

    fireEvent.keyDown(window, { key: "j", metaKey: true, shiftKey: true });

    const commandInput = await screen.findByRole("textbox", { name: "AI command" });
    fireEvent.click(commandInput);
    fireEvent.change(commandInput, {
      target: {
        value: "Compare these options\n- speed\n- reliability"
      }
    });

    expect(screen.queryByRole("button", { name: "Use Markra AI" })).not.toBeInTheDocument();
  });

  it("allows agent messages when a workspace is open without a markdown document", async () => {
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));

    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });
    const input = within(agentPanel).getByRole("textbox", { name: "Markra AI message" });
    const sendButton = within(agentPanel).getByRole("button", { name: "Send message" });
    const suggestion = within(agentPanel).getByRole("button", { name: "Summarize this document" });

    expect(within(agentPanel).getByText("Ready when you are")).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Ask Markra AI...");
    expect(input).toBeEnabled();
    expect(suggestion).toBeDisabled();

    fireEvent.change(input, { target: { value: "List markdown files in this workspace" } });

    expect(sendButton).toBeEnabled();
  });

  it("restores the pending AI suggestion without reopening the command input when an applied suggestion is undone", async () => {
    const { container } = renderApp();

    await screen.findByText("Welcome to Markra");

    window.dispatchEvent(
      new CustomEvent(AI_EDITOR_PREVIEW_RESTORE_EVENT, {
        detail: {
          result: {
            from: 1,
            original: "Original",
            replacement: "Improved",
            to: 9,
            type: "replace"
          }
        }
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "AI command" })).not.toBeInTheDocument();
    });
  });

  it("applies an AI preview action event back into the editor document", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "Original text",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    await screen.findByText("Original text");

    const eventDetail = {
      action: "apply",
      result: {
        from: 1,
        original: "Original",
        replacement: "Improved",
        to: 9,
        type: "replace"
      }
    } as const;

    await waitFor(() => {
      dispatchAiEditorPreviewAction(eventDetail);
      expect(screen.getByText("Improved text")).toBeInTheDocument();
    });
  });

  it("ignores repeated apply events for the same AI insert preview", async () => {
    mockedGetStoredWorkspaceState.mockResolvedValue({
      aiAgentSessionId: "session-app",
      filePath: mockNativePath,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [mockNativePath]
    });
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "Original text",
      name: "native.md",
      path: mockNativePath
    });

    renderApp();

    await screen.findByText("Original text");

    const eventDetail = {
      action: "apply",
      result: {
        from: 9,
        original: "",
        replacement: " improved",
        to: 9,
        type: "insert"
      }
    } as const;

    await waitFor(() => {
      dispatchAiEditorPreviewAction(eventDetail);
      expect(screen.getByText("Original improved text")).toBeInTheDocument();
    });

    dispatchAiEditorPreviewAction(eventDetail);
    expect(screen.queryByText("Original improved improved text")).not.toBeInTheDocument();
  });

  it("updates the Markra AI context when selecting a markdown file from a folder workspace", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened from the folder tree.",
      name: "guide.md",
      path: guidePath
    });

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));
    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });
    fireEvent.click(within(agentPanel).getByRole("button", { name: "Current context" }));

    expect(within(agentPanel).getByText("vault")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));

    expect(await screen.findByText("Guide")).toBeInTheDocument();
    await waitFor(() => expect(within(agentPanel).getByText("guide.md")).toBeInTheDocument());
    await waitFor(() => expect(within(agentPanel).getByText("1 headings · 1 sections · 0 tables")).toBeInTheDocument());
    await waitFor(() => expect(mockedListStoredAiAgentSessions).toHaveBeenCalledWith(guidePath, { includeArchived: true }));
    expect(within(agentPanel).queryByText("vault")).not.toBeInTheDocument();
  });

  it("selects the current file's existing Markra AI session when changing files inside a folder workspace", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened from the folder tree.",
      name: "guide.md",
      path: guidePath
    });
    mockedListStoredAiAgentSessions.mockImplementation(async (workspaceKey) =>
      workspaceKey === guidePath
        ? [
            agentSessionSummary({
              createdAt: 10,
              id: "session-guide",
              messageCount: 2,
              title: "Guide session",
              updatedAt: 20,
              workspaceKey: guidePath
            })
          ]
        : []
    );

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));
    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });
    fireEvent.click(within(agentPanel).getByRole("button", { name: "Current context" }));

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));

    expect(await screen.findByText("Guide")).toBeInTheDocument();
    await waitFor(() => expect(within(agentPanel).getByText("session-guide")).toBeInTheDocument());
    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledWith("session-guide"));
  });

  it("restores a session's agent model and mode toggles when selecting it", async () => {
    mockedGetStoredAiSettings.mockResolvedValue({
      agentDefaultModelId: "gpt-5.5",
      agentDefaultProviderId: "openai",
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "openai-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "deepseek-key",
          baseUrl: "https://api.deepseek.com",
          defaultModelId: "deepseek-v4-flash",
          enabled: true,
          id: "deepseek",
          models: [
            { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }
          ],
          name: "DeepSeek",
          type: "deepseek"
        }
      ]
    });
    mockedListStoredAiAgentSessions.mockResolvedValue([
      agentSessionSummary({
        createdAt: 10,
        id: "session-app",
        title: "OpenAI session",
        updatedAt: 20,
        workspaceKey: "__untitled__"
      }),
      agentSessionSummary({
        createdAt: 11,
        id: "session-deepseek",
        title: "DeepSeek session",
        updatedAt: 21,
        workspaceKey: "__untitled__"
      })
    ]);
    mockedGetStoredAiAgentSession.mockImplementation(async (sessionId) => {
      if (sessionId === "session-deepseek") {
        return storedAgentSession({
          agentModelId: "deepseek-v4-flash",
          agentProviderId: "deepseek",
          panelOpen: true,
          thinkingEnabled: true,
          webSearchEnabled: true
        });
      }

      return storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        panelOpen: true,
        thinkingEnabled: false,
        webSearchEnabled: false
      });
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));
    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });

    fireEvent.click(within(agentPanel).getByRole("button", { name: "Sessions" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /DeepSeek session/ }));

    await waitFor(() =>
      expect(mockedSaveStoredAiSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          agentDefaultModelId: "deepseek-v4-flash",
          agentDefaultProviderId: "deepseek"
        })
      )
    );
    await waitFor(() => expect(within(agentPanel).getByRole("button", { name: "Deep thinking" })).toHaveAttribute("aria-pressed", "true"));
    expect(within(agentPanel).getByRole("button", { name: "Web search" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps remembered mode toggles when creating a new Markra AI session", async () => {
    const initializedSessions = new Set(["session-app"]);
    let finishInitialize: (() => unknown) | undefined;

    mockedCreateAiAgentSessionId
      .mockReturnValueOnce("session-app")
      .mockReturnValue("session-new");
    mockedGetStoredAiAgentPreferences.mockResolvedValue({ thinkingEnabled: false, webSearchEnabled: false });
    mockedGetStoredAiSettings.mockResolvedValue({
      agentDefaultModelId: "gpt-5.5",
      agentDefaultProviderId: "openai",
      defaultModelId: "gpt-5.5",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "openai-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-5.5",
          enabled: true,
          id: "openai",
          models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
          name: "OpenAI",
          type: "openai"
        }
      ]
    });
    mockedListStoredAiAgentSessions.mockResolvedValue([
      agentSessionSummary({
        createdAt: 10,
        id: "session-app",
        title: "OpenAI session",
        updatedAt: 20,
        workspaceKey: "__untitled__"
      })
    ]);
    mockedGetStoredAiAgentSession.mockImplementation(async (sessionId) =>
      storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        panelOpen: true,
        thinkingEnabled: sessionId === "session-new" && initializedSessions.has(sessionId),
        webSearchEnabled: sessionId === "session-new" && initializedSessions.has(sessionId)
      })
    );
    mockedInitializeStoredAiAgentSession.mockImplementation(async (sessionId) => {
      await new Promise((resolve) => {
        finishInitialize = () => resolve(undefined);
      });
      initializedSessions.add(sessionId);
    });

    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));
    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });
    const deepThinking = within(agentPanel).getByRole("button", { name: "Deep thinking" });
    const webSearch = within(agentPanel).getByRole("button", { name: "Web search" });

    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledWith("session-app"));
    await waitFor(() => expect(deepThinking).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(deepThinking);
    fireEvent.click(webSearch);
    expect(deepThinking).toHaveAttribute("aria-pressed", "true");
    expect(webSearch).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(agentPanel).getByRole("button", { name: "Sessions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "New session" }));

    await waitFor(() => expect(mockedInitializeStoredAiAgentSession).toHaveBeenCalledWith("session-new", null, {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: true
    }));

    await act(async () => {
      finishInitialize?.();
    });

    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledWith("session-new"));
    expect(within(agentPanel).getByRole("button", { name: "Deep thinking" })).toHaveAttribute("aria-pressed", "true");
    expect(within(agentPanel).getByRole("button", { name: "Web search" })).toHaveAttribute("aria-pressed", "true");
  });

  it("creates a separate Markra AI session when selecting a file without existing session history", async () => {
    const guidePath = "/mock-files/vault/docs/guide.md";
    mockedCreateAiAgentSessionId
      .mockReturnValueOnce("session-startup")
      .mockReturnValueOnce("session-folder")
      .mockReturnValueOnce("session-guide");
    mockedOpenNativeMarkdownPath.mockResolvedValue({
      kind: "folder",
      folder: {
        path: mockFolderPath,
        name: "vault"
      }
    });
    mockedListNativeMarkdownFilesForPath.mockResolvedValue([
      { name: "guide.md", path: guidePath, relativePath: "docs/guide.md" }
    ]);
    mockedReadNativeMarkdownFile.mockResolvedValue({
      content: "# Guide\n\nOpened from the folder tree.",
      name: "guide.md",
      path: guidePath
    });
    mockedListStoredAiAgentSessions.mockResolvedValue([]);

    renderApp();

    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(await screen.findByRole("heading", { name: "vault" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI" }));
    const agentPanel = screen.getByRole("complementary", { name: "Markra AI" });
    fireEvent.click(within(agentPanel).getByRole("button", { name: "Current context" }));

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    fireEvent.click(await screen.findByRole("button", { name: "docs/guide.md" }));

    expect(await screen.findByText("Guide")).toBeInTheDocument();
    await waitFor(() => expect(within(agentPanel).getByText("session-guide")).toBeInTheDocument());
    expect(within(agentPanel).queryByText("session-folder")).not.toBeInTheDocument();
  });
});
