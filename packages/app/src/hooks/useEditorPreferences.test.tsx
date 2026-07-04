import { act, renderHook, waitFor } from "@testing-library/react";
import { defaultAiQuickActionPrompts } from "../lib/ai-actions";
import { defaultEditorPreferences, getStoredEditorPreferences } from "../lib/settings/app-settings";
import { listenAppEditorPreferencesChanged } from "../lib/settings/settings-events";
import { useEditorPreferences } from "./useEditorPreferences";

const defaultViewModeCustomizations = vi.hoisted(() => ({
  aiPanel: "visible" as const,
  documentLinks: "visible" as const,
  documentTabs: "visible" as const,
  fileList: "visible" as const,
  fileTree: "visible" as const,
  fileTreeButton: "visible" as const,
  openButton: "visible" as const,
  outline: "visible" as const,
  quickCreateButton: "visible" as const,
  recentFolders: "visible" as const,
  sidebarLayout: "visible" as const,
  statusBar: "visible" as const,
  titlebarActions: "visible" as const,
  viewModeToggle: "visible" as const,
  wordCount: "visible" as const
}));

vi.mock("../lib/settings/app-settings", () => ({
  defaultEditorPreferences: {
    aiQuickActionPrompts: {
      continue: "",
      polish: "",
      rewrite: "",
      summarize: "",
      translate: ""
    },
    aiWorkspaceAnimationEnabled: false,
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
    editorFontFamily: {
      family: null,
      source: "theme"
    },
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
    markdownShortcuts: {
      bold: "Mod+B",
      bulletList: "Mod+Shift+8",
      codeBlock: "Mod+Alt+C",
      heading1: "Mod+Alt+1",
      heading2: "Mod+Alt+2",
      heading3: "Mod+Alt+3",
      image: "Mod+Shift+I",
      inlineCode: "Mod+E",
      italic: "Mod+I",
      link: "Mod+K",
      orderedList: "Mod+Shift+7",
      paragraph: "Mod+Alt+0",
      quote: "Mod+Shift+B",
      strikethrough: "Mod+Shift+X",
      table: "Mod+Shift+Alt+T",
      toggleAiAgent: "Mod+Alt+J",
      toggleAiCommand: "Mod+Shift+J",
      toggleAllFolds: "Mod+Alt+T",
      toggleMarkdownFiles: "Mod+Shift+M",
      toggleSourceMode: "Mod+Alt+S"
    },
    markdownTemplates: [],
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
    tableColumnWidthMode: "auto",
    viewMode: "daily",
    viewModeCustomizations: defaultViewModeCustomizations,
    wrapCodeBlocks: true
  },
  getStoredEditorPreferences: vi.fn()
}));

vi.mock("../lib/settings/settings-events", () => ({
  listenAppEditorPreferencesChanged: vi.fn()
}));

const mockedGetStoredEditorPreferences = vi.mocked(getStoredEditorPreferences);
const mockedListenAppEditorPreferencesChanged = vi.mocked(listenAppEditorPreferencesChanged);

describe("useEditorPreferences", () => {
  beforeEach(() => {
    mockedGetStoredEditorPreferences.mockReset();
    mockedListenAppEditorPreferencesChanged.mockReset();
    mockedListenAppEditorPreferencesChanged.mockResolvedValue(() => {});
  });

  it("loads editor preferences and reacts to cross-window preference changes", async () => {
    let onPreferencesChanged: Parameters<typeof listenAppEditorPreferencesChanged>[0] | null = null;
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
      editorFontFamily: {
        family: null,
        source: "theme"
      },
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
      markdownShortcuts: {
        bold: "Mod+B",
        bulletList: "Mod+Shift+8",
        codeBlock: "Mod+Alt+C",
        heading1: "Mod+Alt+1",
        heading2: "Mod+Alt+2",
        heading3: "Mod+Alt+3",
        image: "Mod+Shift+I",
        inlineCode: "Mod+E",
        italic: "Mod+I",
        link: "Mod+K",
        openQuickOpen: "Mod+P",
        openSpellcheckSuggestions: "Mod+.",
        orderedList: "Mod+Shift+7",
        paragraph: "Mod+Alt+0",
        quote: "Mod+Shift+B",
        strikethrough: "Mod+Shift+X",
        table: "Mod+Shift+Alt+T",
        toggleAiAgent: "Mod+Alt+J",
        toggleAiCommand: "Mod+Shift+J",
        toggleAllFolds: "Mod+Alt+T",
        toggleDocumentHistory: "Mod+Shift+H",
        toggleMarkdownFiles: "Mod+Shift+M",
        toggleReadOnlyMode: "Mod+Alt+L",
        toggleSourceMode: "Mod+Alt+S"
      },
      markdownTemplates: [],
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
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
      viewModeCustomizations: defaultViewModeCustomizations,
      showWordCount: true,
      wrapCodeBlocks: true
    });
    mockedListenAppEditorPreferencesChanged.mockImplementation(async (listener) => {
      onPreferencesChanged = listener;
      return () => {};
    });

    const { result } = renderHook(() => useEditorPreferences());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preferences.showAiQuickInputOnSelection).toBe(true);

    act(() => {
      onPreferencesChanged?.({
        aiQuickActionPrompts: defaultAiQuickActionPrompts,
        aiWorkspaceAnimationEnabled: false,
        autoRevealActiveFile: true,
        autoSaveEnabled: true,
        autoSaveIntervalMinutes: 10,
        autoUpdateEnabled: true,
        bodyFontSize: 18,
        clipboardImageFolder: "images",
        copyExternalFilesToStorage: true,
        closeAiCommandOnAgentPanelOpen: true,
        contentWidth: "wide",
        contentWidthPx: 1120,
        documentLinksOpen: true,
        documentLinksVisible: false,
        editorFontFamily: {
          family: "Example Serif",
          source: "system"
        },
        extendedSyntax: {
          githubAlerts: true,
          highlight: false
        },
        imageUpload: {
          fileNamePattern: "{name}-{timestamp}",
          picgo: {
            secret: "",
            serverUrl: ""
          },
          provider: "webdav",
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
            password: "secret",
            publicBaseUrl: "",
            serverUrl: "https://dav.example.com/images",
            uploadPath: "notes",
            username: "ada"
          }
        },
        lineHeight: 1.8,
        markdownShortcuts: {
          bold: "Mod+Alt+B",
          bulletList: "Mod+Shift+8",
          codeBlock: "Mod+Alt+C",
          heading1: "Mod+Alt+1",
          heading2: "Mod+Alt+2",
          heading3: "Mod+Alt+3",
          image: "Mod+Shift+I",
          inlineCode: "Mod+E",
          italic: "Mod+I",
          link: "Mod+K",
          openQuickOpen: "Mod+P",
          openSpellcheckSuggestions: "Mod+.",
          orderedList: "Mod+Shift+7",
          paragraph: "Mod+Alt+0",
          quote: "Mod+Shift+B",
          strikethrough: "Mod+Shift+X",
          table: "Mod+Shift+Alt+T",
          toggleAiAgent: "Mod+Alt+J",
          toggleAiCommand: "Mod+Shift+J",
          toggleAllFolds: "Mod+Alt+T",
          toggleDocumentHistory: "Mod+Shift+H",
          toggleMarkdownFiles: "Mod+Shift+M",
          toggleReadOnlyMode: "Mod+Alt+L",
          toggleSourceMode: "Mod+Alt+S"
        },
        markdownTemplates: [],
        restoreWorkspaceOnStartup: false,
        sidebarLayoutMode: "stacked",
        showAiQuickInputOnSelection: false,
        showAiSelectionToolbarOnSelection: true,
        suggestAiPanelForComplexInlinePrompts: true,
        showDocumentTabs: false,
        splitVisualPanePercent: 64,
        spellcheckEnabled: true,
        spellcheckIgnoredWords: ["exampleterm"],
        spellcheckLanguage: "en",
        tableColumnWidthMode: "even",
        titlebarActions: [
          { id: "theme", visible: true },
          { id: "save", visible: false },
          { id: "sourceMode", visible: true },
          { id: "aiAgent", visible: true }
        ],
        viewMode: "daily",
        viewModeCustomizations: defaultViewModeCustomizations,
        showWordCount: false,
        wrapCodeBlocks: false
      });
    });

    expect(result.current.preferences.showAiQuickInputOnSelection).toBe(false);
    expect(result.current.preferences.showAiSelectionToolbarOnSelection).toBe(true);
    expect(result.current.preferences.bodyFontSize).toBe(18);
    expect(result.current.preferences.closeAiCommandOnAgentPanelOpen).toBe(true);
    expect(result.current.preferences.contentWidth).toBe("wide");
  });

  it("keeps a live preference update when the initial stored preferences resolve later", async () => {
    let onPreferencesChanged: Parameters<typeof listenAppEditorPreferencesChanged>[0] | null = null;
    let resolveStoredPreferences: (preferences: Awaited<ReturnType<typeof getStoredEditorPreferences>>) => unknown = () => {};
    mockedGetStoredEditorPreferences.mockReturnValue(new Promise((resolve) => {
      resolveStoredPreferences = resolve;
    }));
    mockedListenAppEditorPreferencesChanged.mockImplementation(async (listener) => {
      onPreferencesChanged = listener;
      return () => {};
    });

    const { result } = renderHook(() => useEditorPreferences());

    act(() => {
      onPreferencesChanged?.({
        ...defaultEditorPreferences,
        bodyFontSize: 18,
        showWordCount: false
      });
    });
    expect(result.current.preferences.bodyFontSize).toBe(18);
    expect(result.current.preferences.showWordCount).toBe(false);

    await act(async () => {
      resolveStoredPreferences({
        ...defaultEditorPreferences,
        bodyFontSize: 16,
        showWordCount: true
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.preferences.bodyFontSize).toBe(18);
    expect(result.current.preferences.showWordCount).toBe(false);
  });
});
