import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests, type RuntimeStore } from "../../runtime";
import {
  createAiAgentSessionId,
  consumeWelcomeDocumentState,
  deleteStoredAiAgentSession,
  getStoredAiAgentSession,
  getStoredAiAgentPreferences,
  initializeStoredAiAgentSession,
  getStoredAiSettings,
  getStoredCustomThemeCss,
  listStoredAiAgentSessions,
  getStoredEditorPreferences,
  getStoredExportSettings,
  getStoredLanguage,
  getStoredRecentMarkdownFolders,
  getStoredTheme,
  getStoredWebSearchSettings,
  getStoredWorkspaceState,
  normalizeRecentMarkdownFolders,
  normalizeEditorPreferences,
  normalizeWebSearchSettings,
  normalizeExportSettings,
  reorderTitlebarActions,
  removeStoredRecentMarkdownFolder,
  resetWelcomeDocumentState,
  saveStoredAiAgentSession,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSessionTitle,
  saveStoredAiSettings,
  saveStoredCustomThemeCss,
  saveStoredEditorPreferences,
  saveStoredExportSettings,
  saveStoredLanguage,
  saveStoredRecentMarkdownFolder,
  saveStoredTheme,
  saveStoredWebSearchSettings,
  saveStoredWorkspaceState,
  setStoredAiAgentSessionArchived,
  type AiProviderSettings
} from "./app-settings";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../ai-actions";

const mockedLoadStore = vi.fn();

describe("app settings", () => {
  const originalRandomUuid = globalThis.crypto.randomUUID;
  const store = {
    delete: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    set: vi.fn()
  };

  beforeEach(() => {
    globalThis.crypto.randomUUID = originalRandomUuid;
    mockedLoadStore.mockReset();
    store.delete.mockReset();
    store.get.mockReset();
    store.save.mockReset();
    store.set.mockReset();
    mockedLoadStore.mockResolvedValue(store as unknown as RuntimeStore);
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      settings: {
        loadStore: mockedLoadStore
      }
    });
  });

  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("consumes and persists the first welcome document state in the Tauri app data store", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(consumeWelcomeDocumentState()).resolves.toBe(true);

    expect(mockedLoadStore).toHaveBeenCalledWith("settings.json", { autoSave: false, defaults: {} });
    expect(store.get).toHaveBeenCalledWith("welcomeDocumentSeen");
    expect(store.set).toHaveBeenCalledWith("welcomeDocumentSeen", true);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite settings after the welcome document was already seen", async () => {
    store.get.mockResolvedValue(true);

    await expect(consumeWelcomeDocumentState()).resolves.toBe(false);

    expect(store.set).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("loads a persisted global theme from settings", async () => {
    store.get.mockResolvedValue("catppuccin-mocha");

    await expect(getStoredTheme()).resolves.toBe("catppuccin-mocha");

    expect(store.get).toHaveBeenCalledWith("theme");
  });

  it("loads and persists the system color theme preference", async () => {
    store.get.mockResolvedValue("system");

    await expect(getStoredTheme()).resolves.toBe("system");

    await saveStoredTheme("system");

    expect(store.set).toHaveBeenCalledWith("theme", "system");
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("falls back to the system theme preference when the stored theme is missing or invalid", async () => {
    store.get.mockResolvedValue("dracula");

    await expect(getStoredTheme()).resolves.toBe("system");
  });

  it("persists the selected global theme", async () => {
    await saveStoredTheme("solarized-dark");

    expect(store.set).toHaveBeenCalledWith("theme", "solarized-dark");
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads and persists custom theme CSS", async () => {
    const css = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";
    store.get.mockResolvedValue(css);

    await expect(getStoredCustomThemeCss()).resolves.toBe(css);
    await saveStoredCustomThemeCss(css);

    expect(store.get).toHaveBeenCalledWith("customThemeCss");
    expect(store.set).toHaveBeenCalledWith("customThemeCss", css);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads English as the default app language", async () => {
    store.get.mockResolvedValue("pirate");

    await expect(getStoredLanguage()).resolves.toBe("en");

    expect(store.get).toHaveBeenCalledWith("language");
  });

  it("loads and persists a supported app language", async () => {
    store.get.mockResolvedValue("zh-CN");

    await expect(getStoredLanguage()).resolves.toBe("zh-CN");

    await saveStoredLanguage("ja");

    expect(store.set).toHaveBeenCalledWith("language", "ja");
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads enabled AI-on-selection as the default editor preference", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredEditorPreferences()).resolves.toEqual({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: true,
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
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      restoreWorkspaceOnStartup: true,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      showWordCount: true
    });

    expect(store.get).toHaveBeenCalledWith("editorPreferences");
  });

  it("loads local Bing as the default web search settings", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredWebSearchSettings()).resolves.toEqual({
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    });

    expect(store.get).toHaveBeenCalledWith("webSearch");
  });

  it("loads the default export settings", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredExportSettings()).resolves.toEqual({
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

    expect(store.get).toHaveBeenCalledWith("exportSettings");
  });

  it("normalizes persisted export settings", () => {
    expect(normalizeExportSettings({
      pandocArgs: " --toc --metadata title=\"Draft\" ",
      pandocPath: " /opt/homebrew/bin/pandoc ",
      pdfAuthor: " Ada Lovelace ",
      pdfFooter: "Page footer",
      pdfHeader: "Draft header",
      pdfHeightMm: 279,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    })).toEqual({
      pandocArgs: "--toc --metadata title=\"Draft\"",
      pandocPath: "/opt/homebrew/bin/pandoc",
      pdfAuthor: "Ada Lovelace",
      pdfFooter: "Page footer",
      pdfHeader: "Draft header",
      pdfHeightMm: 279,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });
    expect(normalizeExportSettings({
      pandocArgs: "x".repeat(1500),
      pandocPath: "x".repeat(700),
      pdfHeightMm: 9999,
      pdfMarginMm: 999,
      pdfMarginPreset: "custom",
      pdfPageSize: "custom",
      pdfWidthMm: 10
    })).toEqual({
      pandocArgs: "x".repeat(1000),
      pandocPath: "x".repeat(500),
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 2000,
      pdfMarginMm: 60,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: false,
      pdfPageSize: "custom",
      pdfWidthMm: 50
    });
    expect(normalizeExportSettings({ pdfMarginMm: 24 })).toEqual({
      pandocArgs: "",
      pandocPath: "",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: false,
      pdfPageSize: "default",
      pdfWidthMm: 210
    });
  });

  it("normalizes persisted web search settings", () => {
    expect(normalizeWebSearchSettings({
      contentMaxChars: 999999,
      enabled: "yes",
      maxResults: 200,
      providerId: "searxng",
      searxngApiHost: " http://localhost:8888/ "
    })).toEqual({
      contentMaxChars: 40000,
      enabled: true,
      maxResults: 20,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888"
    });

    expect(normalizeWebSearchSettings({
      contentMaxChars: 100,
      maxResults: -1,
      providerId: "unknown",
      searxngApiHost: "file:///tmp/nope"
    })).toEqual({
      contentMaxChars: 2000,
      enabled: true,
      maxResults: 1,
      providerId: "local-bing",
      searxngApiHost: ""
    });
  });

  it("persists normalized web search settings", async () => {
    await saveStoredWebSearchSettings({
      contentMaxChars: 8000,
      enabled: true,
      maxResults: 8,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888/"
    });

    expect(store.set).toHaveBeenCalledWith("webSearch", {
      contentMaxChars: 8000,
      enabled: true,
      maxResults: 8,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888"
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("persists normalized export settings", async () => {
    await saveStoredExportSettings({
      pandocArgs: " --toc ",
      pandocPath: " /usr/local/bin/pandoc ",
      pdfAuthor: "Ada",
      pdfFooter: "Footer",
      pdfHeader: "Header",
      pdfHeightMm: 279,
      pdfMarginMm: 72,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });

    expect(store.set).toHaveBeenCalledWith("exportSettings", {
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      pdfAuthor: "Ada",
      pdfFooter: "Footer",
      pdfHeader: "Header",
      pdfHeightMm: 279,
      pdfMarginMm: 60,
      pdfMarginPreset: "custom",
      pdfPageBreakOnH1: true,
      pdfPageSize: "letter",
      pdfWidthMm: 216
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("normalizes partial editor preferences from older settings files", async () => {
    store.get.mockResolvedValue({
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: false,
      autoUpdateEnabled: true,
      bodyFontSize: 99,
      clipboardImageFolder: "media/screenshots",
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "page",
      imageUpload: {
        fileNamePattern: "web-{name}-{timestamp}",
        provider: "webdav",
        webdav: {
          password: "secret",
          publicBaseUrl: " https://cdn.example.com/images/ ",
          serverUrl: " https://dav.example.com/remote.php/dav/files/me/ ",
          uploadPath: " Markra/screenshots ",
          username: " ada "
        }
      },
      lineHeight: 2,
      markdownShortcuts: {
        bold: "Mod+Alt+B",
        italic: "Mod+S",
        quote: "Shift+B"
      },
      markdownTemplates: [
        {
          content: "# legacy content is migrated to the template file layer",
          fileName: " standup.md ",
          id: " standup ",
          name: " Standup ",
          suggestedName: " {{date}} standup "
        },
        {
          fileName: "../unsafe.md",
          id: "",
          name: "",
          suggestedName: ""
        }
      ],
      restoreWorkspaceOnStartup: false,
      showWordCount: false
    });

    await expect(getStoredEditorPreferences()).resolves.toEqual({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: false,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "media/screenshots",
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "default",
      contentWidthPx: null,
      imageUpload: {
        fileNamePattern: "web-{name}-{timestamp}",
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
          publicBaseUrl: "https://cdn.example.com/images",
          serverUrl: "https://dav.example.com/remote.php/dav/files/me",
          uploadPath: "Markra/screenshots",
          username: "ada"
        }
      },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      },
      lineHeight: 1.65,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      },
      markdownTemplates: [
        {
          fileName: "standup.md",
          id: "standup",
          name: "Standup",
          suggestedName: "{{date}} standup"
        }
      ],
      restoreWorkspaceOnStartup: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      showWordCount: false
    });
  });

  it("normalizes titlebar action ordering and visibility", () => {
    expect(normalizeEditorPreferences({
      titlebarActions: [
        { id: "save", visible: false },
        { id: "theme", visible: true },
        { id: "save", visible: true },
        { id: "unknown", visible: true },
        { id: "aiAgent", visible: "yes" },
        { id: "open", visible: true }
      ]
    }).titlebarActions).toEqual([
      { id: "save", visible: false },
      { id: "theme", visible: true },
      { id: "aiAgent", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true }
    ]);
  });

  it("normalizes the automatic update preference", () => {
    expect(normalizeEditorPreferences({}).autoUpdateEnabled).toBe(true);
    expect(normalizeEditorPreferences({ autoUpdateEnabled: false }).autoUpdateEnabled).toBe(false);
    expect(normalizeEditorPreferences({ autoUpdateEnabled: "no" }).autoUpdateEnabled).toBe(true);
  });

  it("falls back to the quick input for unknown AI selection display modes", () => {
    expect(normalizeEditorPreferences({
      aiSelectionDisplayMode: "popup"
    }).aiSelectionDisplayMode).toBe("command");
  });

  it("normalizes AI quick action prompt overrides", () => {
    expect(normalizeEditorPreferences({
      aiQuickActionPrompts: {
        continue: "Keep writing in the same voice.",
        polish: 42,
        summarize: "Summarize in one sentence."
      }
    }).aiQuickActionPrompts).toEqual({
      ...defaultAiQuickActionPrompts,
      continue: "Keep writing in the same voice.",
      summarize: "Summarize in one sentence."
    });
  });

  it("normalizes extended syntax preferences", () => {
    expect(normalizeEditorPreferences({}).extendedSyntax).toEqual({
      githubAlerts: true,
      highlight: true
    });
    expect(normalizeEditorPreferences({
      extendedSyntax: {
        githubAlerts: false,
        highlight: false
      }
    }).extendedSyntax).toEqual({
      githubAlerts: false,
      highlight: false
    });
    expect(normalizeEditorPreferences({
      extendedSyntax: {
        githubAlerts: "maybe",
        highlight: "nope"
      }
    }).extendedSyntax).toEqual({
      githubAlerts: true,
      highlight: true
    });
    expect(normalizeEditorPreferences({
      extendedSyntax: null
    }).extendedSyntax).toEqual({
      githubAlerts: true,
      highlight: true
    });
  });

  it("normalizes stored built-in AI quick action prompts as unset defaults", () => {
    expect(normalizeEditorPreferences({
      aiQuickActionPrompts: {
        continue: defaultAiQuickActionPrompt("continue", "English"),
        translate: defaultAiQuickActionPrompt("translate", "English")
      }
    }).aiQuickActionPrompts).toEqual(defaultAiQuickActionPrompts);
  });

  it("moves titlebar actions to the target slot in both directions", () => {
    const actions = [
      { id: "aiAgent", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ] as const;

    expect(reorderTitlebarActions(actions, "aiAgent", "save")).toEqual([
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "save", visible: true },
      { id: "aiAgent", visible: true },
      { id: "theme", visible: true }
    ]);
    expect(reorderTitlebarActions(actions, "save", "sourceMode")).toEqual([
      { id: "aiAgent", visible: true },
      { id: "save", visible: true },
      { id: "sourceMode", visible: true },
      { id: "splitMode", visible: true },
      { id: "theme", visible: true }
    ]);
  });

  it("normalizes custom markdown shortcuts while keeping unsafe chords at their defaults", () => {
    expect(normalizeEditorPreferences({
      markdownShortcuts: {
        bold: "mod+alt+b",
        inlineCode: "Mod+Shift+E",
        italic: "Mod+S",
        quote: "Alt+Q",
        strikethrough: "Mod+Shift+X"
      }
    }).markdownShortcuts).toEqual({
      ...defaultMarkdownShortcuts,
      bold: "Mod+Alt+B",
      strikethrough: "Mod+Shift+X"
    });
  });

  it("normalizes custom editor content width pixels", () => {
    expect(normalizeEditorPreferences({ contentWidthPx: 1120 }).contentWidthPx).toBe(1120);
    expect(normalizeEditorPreferences({ contentWidthPx: 320 }).contentWidthPx).toBe(640);
    expect(normalizeEditorPreferences({ contentWidthPx: 2000 }).contentWidthPx).toBe(1280);
    expect(normalizeEditorPreferences({ contentWidthPx: "wide" }).contentWidthPx).toBeNull();
  });

  it("normalizes split pane visual width percentages", () => {
    expect(normalizeEditorPreferences({ splitVisualPanePercent: 64 }).splitVisualPanePercent).toBe(64);
    expect(normalizeEditorPreferences({ splitVisualPanePercent: 10 }).splitVisualPanePercent).toBe(25);
    expect(normalizeEditorPreferences({ splitVisualPanePercent: 90 }).splitVisualPanePercent).toBe(75);
    expect(normalizeEditorPreferences({ splitVisualPanePercent: "wide" }).splitVisualPanePercent).toBe(50);
  });

  it("migrates previous app shortcut defaults to the current defaults", () => {
    expect(normalizeEditorPreferences({
      markdownShortcuts: {
        toggleAiAgent: "Mod+Shift+A",
        toggleSourceMode: "Mod+Alt+V"
      }
    }).markdownShortcuts).toEqual(defaultMarkdownShortcuts);
  });

  it("keeps markdown shortcut mappings unique after normalization", () => {
    expect(normalizeEditorPreferences({
      markdownShortcuts: {
        bold: "Mod+I"
      }
    }).markdownShortcuts).toEqual(defaultMarkdownShortcuts);

    expect(normalizeEditorPreferences({
      markdownShortcuts: {
        bold: "Mod+I",
        italic: "Mod+B"
      }
    }).markdownShortcuts).toEqual({
      ...defaultMarkdownShortcuts,
      bold: "Mod+I",
      italic: "Mod+B"
    });
  });

  it("falls back to local image upload when persisted image upload settings are unsafe", () => {
    expect(normalizeEditorPreferences({
      imageUpload: {
        fileNamePattern: "../bad",
        provider: "ftp",
        webdav: {
          publicBaseUrl: "file:///tmp/images",
          serverUrl: "ftp://dav.example.com/images",
          uploadPath: "../outside",
          username: 42
        }
      }
    }).imageUpload).toEqual({
      provider: "local",
      fileNamePattern: "pasted-image-{timestamp}",
      picgo: {
        secret: "",
        serverUrl: ""
      },
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
    });
  });

  it("normalizes S3-compatible image upload settings", () => {
    expect(normalizeEditorPreferences({
      imageUpload: {
        fileNamePattern: "{name}-{random}",
        provider: "s3",
        s3: {
          accessKeyId: " access-key ",
          bucket: " markra-images ",
          endpointUrl: " https://s3.example.com/ ",
          publicBaseUrl: " https://cdn.example.com/images/ ",
          region: " us-east-1 ",
          secretAccessKey: "secret",
          uploadPath: " notes/screenshots "
        }
      }
    }).imageUpload).toEqual({
      provider: "s3",
      fileNamePattern: "{name}-{random}",
      picgo: {
        secret: "",
        serverUrl: ""
      },
      s3: {
        accessKeyId: "access-key",
        bucket: "markra-images",
        endpointUrl: "https://s3.example.com",
        publicBaseUrl: "https://cdn.example.com/images",
        region: "us-east-1",
        secretAccessKey: "secret",
        uploadPath: "notes/screenshots"
      },
      webdav: {
        password: "",
        publicBaseUrl: "",
        serverUrl: "",
        uploadPath: "",
        username: ""
      }
    });
  });

  it("normalizes PicGo and PicList server image upload settings", () => {
    expect(normalizeEditorPreferences({
      imageUpload: {
        fileNamePattern: "{name}-{random}",
        provider: "picgo",
        picgo: {
          secret: " server-secret ",
          serverUrl: " http://127.0.0.1:36677/upload?ignored=true#docs "
        }
      }
    }).imageUpload).toEqual({
      provider: "picgo",
      fileNamePattern: "{name}-{random}",
      picgo: {
        secret: "server-secret",
        serverUrl: "http://127.0.0.1:36677/upload"
      },
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
    });
  });

  it("falls back to the default clipboard image folder when the stored folder is unsafe", async () => {
    store.get.mockResolvedValue({
      clipboardImageFolder: "../outside"
    });

    await expect(getStoredEditorPreferences()).resolves.toEqual({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: true,
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
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      restoreWorkspaceOnStartup: true,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ],
      showWordCount: true
    });
  });

  it("persists editor preferences", async () => {
    await saveStoredEditorPreferences({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: false,
      autoUpdateEnabled: true,
      bodyFontSize: 18,
      clipboardImageFolder: "images",
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "wide",
      contentWidthPx: 1120,
      extendedSyntax: {
        githubAlerts: false,
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
          publicBaseUrl: "https://cdn.example.com/images",
          serverUrl: "https://dav.example.com/images",
          uploadPath: "notes",
          username: "ada"
        }
      },
      lineHeight: 1.8,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      },
      markdownTemplates: [
        {
          fileName: "weekly-review.md",
          id: "weekly-review",
          name: "Weekly review",
          suggestedName: "{{date}} weekly"
        }
      ],
      restoreWorkspaceOnStartup: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      splitVisualPanePercent: 64,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "aiAgent", visible: true }
      ],
      showWordCount: false
    });

    expect(store.set).toHaveBeenCalledWith("editorPreferences", {
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiSelectionDisplayMode: "command",
      autoOpenAiOnSelection: false,
      autoUpdateEnabled: true,
      bodyFontSize: 18,
      clipboardImageFolder: "images",
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "wide",
      contentWidthPx: 1120,
      extendedSyntax: {
        githubAlerts: false,
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
          publicBaseUrl: "https://cdn.example.com/images",
          serverUrl: "https://dav.example.com/images",
          uploadPath: "notes",
          username: "ada"
        }
      },
      lineHeight: 1.8,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      },
      markdownTemplates: [
        {
          fileName: "weekly-review.md",
          id: "weekly-review",
          name: "Weekly review",
          suggestedName: "{{date}} weekly"
        }
      ],
      restoreWorkspaceOnStartup: false,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      splitVisualPanePercent: 64,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "aiAgent", visible: true }
      ],
      showWordCount: false
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("resets the welcome document state for the next launch", async () => {
    await resetWelcomeDocumentState();

    expect(store.delete).toHaveBeenCalledWith("welcomeDocumentSeen");
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads the last workspace state from settings", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/notes.md",
        " ",
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: [
        {
          filePath: "/mock-files/vault/README.md",
          label: "main",
          openFilePaths: [
            "/mock-files/vault/notes.md",
            "/mock-files/vault/README.md",
            "/mock-files/vault/notes.md"
          ]
        },
        {
          filePath: " ",
          label: "blank-window",
          openFilePaths: []
        },
        {
          filePath: "/mock-files/vault/archive.md",
          label: "main",
          openFilePaths: ["/mock-files/vault/archive.md"]
        }
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await expect(getStoredWorkspaceState()).resolves.toEqual({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/notes.md",
        "/mock-files/vault/README.md"
      ],
      openWindows: [
        {
          filePath: "/mock-files/vault/README.md",
          label: "main",
          openFilePaths: [
            "/mock-files/vault/notes.md",
            "/mock-files/vault/README.md"
          ]
        }
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    expect(store.get).toHaveBeenCalledWith("workspace");
  });

  it("merges and persists partial workspace state updates", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: null,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/notes.md"],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/notes.md",
        sideFilePath: "/mock-files/vault/archive.md"
      }
    });

    await saveStoredWorkspaceState({
      filePath: "/mock-files/vault/README.md",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    expect(store.set).toHaveBeenCalledWith("workspace", {
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: [],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("clears the saved side-by-side workspace group", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await saveStoredWorkspaceState({
      sideBySideGroup: null
    });

    expect(store.set).toHaveBeenCalledWith("workspace", {
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: []
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("drops a side-by-side workspace group when one grouped file is not open", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/README.md"],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await expect(getStoredWorkspaceState()).resolves.toEqual({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/README.md"],
      openWindows: []
    });
  });

  it("normalizes recently used markdown folders", () => {
    expect(normalizeRecentMarkdownFolders([
      { name: "notes", path: "/mock-files/notes" },
      { name: "duplicate notes", path: "/mock-files/notes" },
      { name: "", path: "/mock-files/research" },
      { name: "blank path", path: " " },
      null
    ])).toEqual([
      { name: "notes", path: "/mock-files/notes" },
      { name: "research", path: "/mock-files/research" }
    ]);
  });

  it("loads recently used markdown folders from settings", async () => {
    store.get.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" },
      { name: "duplicate notes", path: "/mock-files/notes" }
    ]);

    await expect(getStoredRecentMarkdownFolders()).resolves.toEqual([
      { name: "notes", path: "/mock-files/notes" }
    ]);
    expect(store.get).toHaveBeenCalledWith("recentMarkdownFolders");
  });

  it("prepends and persists a recently used markdown folder", async () => {
    store.get.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" },
      { name: "vault old", path: "/mock-files/vault" }
    ]);

    await saveStoredRecentMarkdownFolder({
      name: "vault",
      path: "/mock-files/vault"
    });

    expect(store.set).toHaveBeenCalledWith("recentMarkdownFolders", [
      { name: "vault", path: "/mock-files/vault" },
      { name: "notes", path: "/mock-files/notes" }
    ]);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("removes a recently used markdown folder", async () => {
    store.get.mockResolvedValue([
      { name: "notes", path: "/mock-files/notes" },
      { name: "vault", path: "/mock-files/vault" }
    ]);

    await expect(removeStoredRecentMarkdownFolder("/mock-files/notes")).resolves.toEqual([
      { name: "vault", path: "/mock-files/vault" }
    ]);

    expect(store.set).toHaveBeenCalledWith("recentMarkdownFolders", [
      { name: "vault", path: "/mock-files/vault" }
    ]);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads default AI provider settings when none are stored", async () => {
    store.get.mockResolvedValue(undefined);

    const settings = await getStoredAiSettings();

    expect(store.get).toHaveBeenCalledWith("aiProviders");
    expect(settings.providers.map((provider) => provider.id)).toContain("openai");
    expect(settings.providers.find((provider) => provider.id === "azure-openai")?.baseUrl).toBe(
      "https://your-resource-name.openai.azure.com"
    );
    expect(settings.providers.find((provider) => provider.id === "aliyun-bailian")).toMatchObject({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      type: "openai-compatible"
    });
    expect(settings.providers.find((provider) => provider.id === "xiaomi-mimo")).toMatchObject({
      baseUrl: "https://api.xiaomimimo.com/v1",
      type: "openai-compatible"
    });
    expect(settings.providers.find((provider) => provider.id === "volcengine")).toMatchObject({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      type: "openai-compatible"
    });
    expect(settings.providers[0]?.models[0]?.capabilities).toEqual(["text", "vision", "reasoning", "tools", "web"]);
  });

  it("fills default API URLs for stored built-in AI providers without one", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gpt-4o",
          enabled: false,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-4o", name: "GPT-4o" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "qwen3.6-plus",
          enabled: false,
          id: "aliyun-bailian",
          models: [{ capability: "text", enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
          name: "Qwen",
          type: "openai-compatible"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "default",
          enabled: false,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "default", name: "Default model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers.find((provider) => provider.id === "openai")?.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.providers.find((provider) => provider.id === "aliyun-bailian")?.baseUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")?.baseUrl).toBe("");
  });

  it("preserves Xiaomi MiMo Token Plan API URLs because they are valid non-native-search endpoints", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "mimo-v2.5",
      defaultProviderId: "xiaomi-mimo",
      providers: [
        {
          apiKey: "sk-test",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          defaultModelId: "mimo-v2.5",
          enabled: true,
          id: "xiaomi-mimo",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "mimo-v2.5", name: "MiMo V2.5" }],
          name: "Xiaomi MiMo",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers.find((provider) => provider.id === "xiaomi-mimo")?.baseUrl).toBe(
      "https://token-plan-cn.xiaomimimo.com/v1"
    );
  });

  it("removes the legacy OpenAI Compatible built-in provider while preserving custom compatible providers", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "default",
      defaultProviderId: "openai-compatible",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "default",
          enabled: false,
          id: "openai-compatible",
          models: [{ capability: "text", enabled: true, id: "default", name: "Default model" }],
          name: "OpenAI Compatible",
          type: "openai-compatible"
        },
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          customHeaders: '{"HTTP-Referer":"https://markra.app"}',
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.defaultProviderId).toBe("custom-provider-1");
    expect(settings.providers.map((provider) => provider.id)).toEqual(["custom-provider-1"]);
    expect(settings.providers[0]?.type).toBe("openai-compatible");
  });

  it("refreshes stale built-in AI provider model defaults from stored settings", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gpt-4o",
          enabled: false,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-4o", name: "GPT-4o" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "deepseek-chat",
          enabled: false,
          id: "deepseek",
          models: [
            { capability: "text", enabled: true, id: "deepseek-chat", name: "DeepSeek Chat" },
            { capability: "text", enabled: true, id: "deepseek-reasoner", name: "DeepSeek Reasoner" }
          ],
          name: "DeepSeek",
          type: "deepseek"
        }
      ]
    });

    const settings = await getStoredAiSettings();
    const openai = settings.providers.find((provider) => provider.id === "openai");
    const deepseek = settings.providers.find((provider) => provider.id === "deepseek");

    expect(settings.defaultModelId).toBe("gpt-5.5");
    expect(openai?.defaultModelId).toBe("gpt-5.5");
    expect(openai?.models.map((model) => model.id)).toEqual(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-image-2"]);
    expect(deepseek?.defaultModelId).toBe("deepseek-v4-pro");
    expect(deepseek?.models.map((model) => model.id)).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
  });

  it("preserves user-added AI provider models during normalization", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gpt-custom",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          defaultModelId: "gpt-custom",
          enabled: true,
          id: "openai",
          models: [{ capability: "text", enabled: true, id: "gpt-custom", name: "GPT Custom" }],
          name: "OpenAI",
          type: "openai"
        },
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "text", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.defaultModelId).toBe("gpt-custom");
    expect(settings.providers.find((provider) => provider.id === "openai")?.models.map((model) => model.id)).toEqual(["gpt-custom"]);
    expect(settings.providers.find((provider) => provider.id === "custom-provider-1")?.models.map((model) => model.id)).toEqual([
      "writer-model"
    ]);
  });

  it("preserves custom headers for AI providers", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "writer-model",
      defaultProviderId: "custom-provider-1",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          customHeaders: '{"HTTP-Referer":"https://markra.app"}',
          defaultModelId: "writer-model",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "reasoning", enabled: true, id: "writer-model", name: "Writer Model" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers[0]).toMatchObject({
      customHeaders: '{"HTTP-Referer":"https://markra.app"}'
    });
  });

  it("enriches stored built-in AI models with current built-in capabilities", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "gemini-3.1-pro-preview",
      defaultProviderId: "google",
      providers: [
        {
          apiKey: "",
          baseUrl: "",
          defaultModelId: "gemini-3.1-pro-preview",
          enabled: true,
          id: "google",
          models: [
            { capabilities: ["text"], enabled: true, id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
            { capability: "text", enabled: true, id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
            { capabilities: ["text"], enabled: true, id: "custom-gemini", name: "Custom Gemini" }
          ],
          name: "Google",
          type: "google"
        }
      ]
    });

    const settings = await getStoredAiSettings();
    const google = settings.providers.find((provider) => provider.id === "google");

    expect(google?.models.find((model) => model.id === "gemini-3.1-pro-preview")?.capabilities).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(google?.models.find((model) => model.id === "gemini-3-flash-preview")?.capabilities).toEqual([
      "text",
      "vision",
      "reasoning",
      "tools",
      "web"
    ]);
    expect(google?.models.find((model) => model.id === "custom-gemini")?.capabilities).toEqual(["text"]);
  });

  it("normalizes legacy single-capability AI models into multi-capability models", async () => {
    store.get.mockResolvedValue({
      defaultModelId: "legacy-vision",
      defaultProviderId: "custom-provider-1",
      providers: [
        {
          apiKey: "",
          baseUrl: "https://proxy.example.test/v1",
          defaultModelId: "legacy-vision",
          enabled: true,
          id: "custom-provider-1",
          models: [{ capability: "vision", enabled: true, id: "legacy-vision", name: "Legacy Vision" }],
          name: "Custom Provider",
          type: "openai-compatible"
        }
      ]
    });

    const settings = await getStoredAiSettings();

    expect(settings.providers[0]?.models[0]).toMatchObject({
      capabilities: ["text", "vision"],
      id: "legacy-vision"
    });
  });

  it("persists AI provider settings in the app settings store", async () => {
    const settings: AiProviderSettings = {
      defaultModelId: "gpt-4o",
      defaultProviderId: "openai",
      providers: [
        {
          apiKey: "test-key",
          baseUrl: "https://api.openai.com/v1",
          defaultModelId: "gpt-4o",
          enabled: true,
          id: "openai",
          models: [
            {
              capabilities: ["text", "reasoning", "tools"],
              enabled: true,
              id: "gpt-4o",
              name: "GPT-4o"
            }
          ],
          name: "OpenAI",
          type: "openai" as const
        }
      ]
    };

    await saveStoredAiSettings(settings);

    expect(store.set).toHaveBeenCalledWith("aiProviders", settings);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("loads a stored AI agent session for the current document", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockResolvedValue(sessionStore as unknown as RuntimeStore);
    sessionStore.get.mockResolvedValue({
      draft: "follow up",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: true,
      webSearchEnabled: false
    });

    await expect(getStoredAiAgentSession("session-a")).resolves.toMatchObject({
      draft: "follow up",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: true,
      webSearchEnabled: false
    });

    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/session-a.json", {
      autoSave: false,
      defaults: {}
    });
    expect(sessionStore.get).toHaveBeenCalledWith("session");
  });

  it("persists AI agent session state and updates the session index", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "follow up",
      messages: [{ id: 1, role: "assistant", text: "hi", thinking: "..." }],
      panelOpen: true,
      panelWidth: 480,
      thinkingEnabled: true,
      webSearchEnabled: true
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/session-a.json", {
      autoSave: false,
      defaults: {}
    });
    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/index.json", {
      autoSave: false,
      defaults: {}
    });
    expect(sessionStore.set).toHaveBeenCalledWith("session", {
      agentModelId: null,
      agentProviderId: null,
      draft: "follow up",
      messages: [expect.objectContaining({ id: 1, isError: false, role: "assistant", text: "hi", thinking: "..." })],
      panelOpen: true,
      panelWidth: 480,
      thinkingEnabled: true,
      webSearchEnabled: true
    });
    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      messageCount: 1,
      title: "hi",
      titleSource: "fallback",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        messageCount: 1,
        title: "hi",
        titleSource: "fallback",
        workspaceKey: "/mock-files/vault"
      })
    ]);
    expect(sessionStore.save).toHaveBeenCalledTimes(1);
    expect(indexStore.save).toHaveBeenCalledTimes(1);
  });

  it("does not move an existing AI agent session to a different workspace during autosave", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue({
      archivedAt: null,
      createdAt: 10,
      id: "session-a",
      messageCount: 1,
      title: "Folder chat",
      titleSource: "manual",
      updatedAt: 20,
      workspaceKey: "/mock-files/vault"
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 384,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault/docs/guide.md"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        workspaceKey: "/mock-files/vault"
      })
    ]);
  });

  it("lists stored AI agent sessions for the active workspace", async () => {
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    indexStore.get.mockResolvedValue([
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      },
      {
        archivedAt: null,
        createdAt: 2,
        id: "session-b",
        messageCount: 1,
        title: "Second session",
        titleSource: "fallback",
        updatedAt: 40,
        workspaceKey: "/mock-files/other"
      },
      {
        archivedAt: 60,
        createdAt: 3,
        id: "session-c",
        messageCount: 2,
        title: null,
        titleSource: null,
        updatedAt: 50,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await expect(listStoredAiAgentSessions("/mock-files/vault")).resolves.toEqual([
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      }
    ]);
    await expect(listStoredAiAgentSessions("/mock-files/vault", { includeArchived: true })).resolves.toEqual([
      {
        archivedAt: 60,
        createdAt: 3,
        id: "session-c",
        messageCount: 2,
        title: null,
        titleSource: null,
        updatedAt: 50,
        workspaceKey: "/mock-files/vault"
      },
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      }
    ]);
  });

  it("archives and restores an AI agent session without deleting its file", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          archivedAt: null,
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "Gold audit session",
          titleSource: "manual",
          updatedAt: 12,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "hello" },
          { id: 2, role: "assistant", text: "hi" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([
      {
        archivedAt: null,
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "Gold audit session",
        titleSource: "manual",
        updatedAt: 12,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await setStoredAiAgentSessionArchived("session-a", true);

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      archivedAt: expect.any(Number),
      id: "session-a",
      title: "Gold audit session"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        archivedAt: expect.any(Number),
        id: "session-a"
      })
    ]);

    await setStoredAiAgentSessionArchived("session-a", false);

    expect(sessionStore.set).toHaveBeenLastCalledWith("meta", expect.objectContaining({
      archivedAt: null,
      id: "session-a"
    }));
  });

  it("initializes a blank AI agent session file for a new workspace chat", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      draft: "",
      messages: [],
      panelOpen: false,
      panelWidth: null,
      thinkingEnabled: false,
      webSearchEnabled: false
    });
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-new",
        messageCount: 0,
        title: null,
        titleSource: null,
        workspaceKey: "/mock-files/vault"
      })
    ]);
  });

  it("uses remembered AI agent thinking preference when initializing a new session", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    store.get.mockImplementation(async (key) =>
      key === "aiAgentPreferences" ? { thinkingEnabled: true, webSearchEnabled: true } : undefined
    );
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", expect.objectContaining({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek",
      thinkingEnabled: true,
      webSearchEnabled: true
    }));
  });

  it("lets new AI agent sessions use explicit mode options over remembered preferences", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    store.get.mockImplementation(async (key) =>
      key === "aiAgentPreferences" ? { thinkingEnabled: false, webSearchEnabled: false } : undefined
    );
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: true
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", expect.objectContaining({
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: true
    }));
  });

  it("loads and persists AI agent preferences", async () => {
    store.get.mockResolvedValue({ thinkingEnabled: true, webSearchEnabled: true });

    await expect(getStoredAiAgentPreferences()).resolves.toEqual({ thinkingEnabled: true, webSearchEnabled: true });
    await saveStoredAiAgentPreferences({ thinkingEnabled: false });

    expect(store.set).toHaveBeenCalledWith("aiAgentPreferences", { thinkingEnabled: false, webSearchEnabled: true });
    expect(store.save).toHaveBeenCalledTimes(1);

    store.set.mockClear();
    store.save.mockClear();
    store.get.mockResolvedValue({ thinkingEnabled: true, webSearchEnabled: false });

    await saveStoredAiAgentPreferences({ webSearchEnabled: true });

    expect(store.set).toHaveBeenCalledWith("aiAgentPreferences", { thinkingEnabled: true, webSearchEnabled: true });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("persists an AI-generated session title without losing workspace metadata", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "look into gold pricing issue",
          titleSource: "fallback",
          updatedAt: 11,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "Check this dataset" },
          { id: 2, role: "assistant", text: "Gold price looks wrong" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([
      {
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "look into gold pricing issue",
        titleSource: "fallback",
        updatedAt: 11,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await saveStoredAiAgentSessionTitle("session-a", "Gold and XAU pricing audit", {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      title: "Gold and XAU pricing audit",
      titleSource: "ai",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        title: "Gold and XAU pricing audit",
        titleSource: "ai"
      })
    ]);
  });

  it("keeps an existing AI-generated session title on later session saves", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue({
      createdAt: 10,
      id: "session-a",
      messageCount: 2,
      title: "Gold and XAU pricing audit",
      titleSource: "ai",
      updatedAt: 11,
      workspaceKey: "/mock-files/vault"
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [
        { id: 1, role: "user", text: "hello" },
        { id: 2, role: "assistant", text: "hi" }
      ],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      title: "Gold and XAU pricing audit",
      titleSource: "ai"
    }));
  });

  it("persists a manually renamed session title and keeps it on later session saves", async () => {
    const sessionStore = {
      delete: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "fallback title",
          titleSource: "fallback",
          updatedAt: 11,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "hello" },
          { id: 2, role: "assistant", text: "hi" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSessionTitle("session-a", "Gold audit session", {
      source: "manual",
      workspaceKey: "/mock-files/vault"
    });

    sessionStore.get.mockResolvedValue({
      createdAt: 10,
      id: "session-a",
      messageCount: 2,
      title: "Gold audit session",
      titleSource: "manual",
      updatedAt: 12,
      workspaceKey: "/mock-files/vault"
    });

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [
        { id: 1, role: "user", text: "hello" },
        { id: 2, role: "assistant", text: "hi again" }
      ],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      title: "Gold audit session",
      titleSource: "manual"
    }));
  });

  it("deletes a stored AI agent session and removes it from the session index", async () => {
    const sessionStore = {
      delete: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    indexStore.get.mockResolvedValue([
      {
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "Gold audit session",
        titleSource: "manual",
        updatedAt: 12,
        workspaceKey: "/mock-files/vault"
      },
      {
        createdAt: 11,
        id: "session-b",
        messageCount: 1,
        title: "Another session",
        titleSource: "fallback",
        updatedAt: 13,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await deleteStoredAiAgentSession("session-a");

    expect(sessionStore.delete).toHaveBeenCalledWith("session");
    expect(sessionStore.delete).toHaveBeenCalledWith("meta");
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-b",
        title: "Another session"
      })
    ]);
  });

  it("generates a random AI agent session id from crypto when available", () => {
    globalThis.crypto.randomUUID = vi.fn(
      (): ReturnType<Crypto["randomUUID"]> => "00000000-0000-4000-8000-000000000000"
    );

    expect(createAiAgentSessionId()).toBe("00000000-0000-4000-8000-000000000000");
  });
});
