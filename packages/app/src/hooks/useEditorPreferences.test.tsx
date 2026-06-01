import { act, renderHook, waitFor } from "@testing-library/react";
import { defaultAiQuickActionPrompts } from "../lib/ai-actions";
import { getStoredEditorPreferences } from "../lib/settings/app-settings";
import { listenAppEditorPreferencesChanged } from "../lib/settings/settings-events";
import { useEditorPreferences } from "./useEditorPreferences";

vi.mock("../lib/settings/app-settings", () => ({
  defaultEditorPreferences: {
    aiQuickActionPrompts: {
      continue: "",
      polish: "",
      rewrite: "",
      summarize: "",
      translate: ""
    },
    autoUpdateEnabled: true,
    bodyFontSize: 16,
    clipboardImageFolder: "assets",
    closeAiCommandOnAgentPanelOpen: false,
    contentWidth: "default",
    contentWidthPx: null,
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
      table: "Mod+Alt+T",
      toggleAiAgent: "Mod+Alt+J",
      toggleAiCommand: "Mod+Shift+J",
      toggleMarkdownFiles: "Mod+Shift+M",
      toggleSourceMode: "Mod+Alt+S"
    },
    markdownTemplates: [],
    restoreWorkspaceOnStartup: true,
    showAiQuickInputOnSelection: true,
    showAiSelectionToolbarOnSelection: false,
    showDocumentTabs: true,
    splitVisualPanePercent: 50,
    showWordCount: true
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
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "assets",
      closeAiCommandOnAgentPanelOpen: false,
      contentWidth: "default",
      contentWidthPx: null,
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
        table: "Mod+Alt+T",
        toggleAiAgent: "Mod+Alt+J",
        toggleAiCommand: "Mod+Shift+J",
        toggleMarkdownFiles: "Mod+Shift+M",
        toggleReadOnlyMode: "Mod+Alt+L",
        toggleSourceMode: "Mod+Alt+S"
      },
      markdownTemplates: [],
      restoreWorkspaceOnStartup: true,
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      showWordCount: true
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
        autoUpdateEnabled: true,
        bodyFontSize: 18,
        clipboardImageFolder: "images",
        closeAiCommandOnAgentPanelOpen: true,
        contentWidth: "wide",
        contentWidthPx: 1120,
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
          orderedList: "Mod+Shift+7",
          paragraph: "Mod+Alt+0",
          quote: "Mod+Shift+B",
          strikethrough: "Mod+Shift+X",
          table: "Mod+Alt+T",
          toggleAiAgent: "Mod+Alt+J",
          toggleAiCommand: "Mod+Shift+J",
          toggleMarkdownFiles: "Mod+Shift+M",
          toggleReadOnlyMode: "Mod+Alt+L",
          toggleSourceMode: "Mod+Alt+S"
        },
        markdownTemplates: [],
        restoreWorkspaceOnStartup: false,
        showAiQuickInputOnSelection: false,
        showAiSelectionToolbarOnSelection: true,
        suggestAiPanelForComplexInlinePrompts: true,
        showDocumentTabs: false,
        splitVisualPanePercent: 64,
        titlebarActions: [
          { id: "theme", visible: true },
          { id: "save", visible: false },
          { id: "sourceMode", visible: true },
          { id: "aiAgent", visible: true }
        ],
        showWordCount: false
      });
    });

    expect(result.current.preferences.showAiQuickInputOnSelection).toBe(false);
    expect(result.current.preferences.showAiSelectionToolbarOnSelection).toBe(true);
    expect(result.current.preferences.bodyFontSize).toBe(18);
    expect(result.current.preferences.closeAiCommandOnAgentPanelOpen).toBe(true);
    expect(result.current.preferences.contentWidth).toBe("wide");
  });
});
