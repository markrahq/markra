import { defaultMarkdownShortcuts } from "@markra/editor";
import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../ai-actions";
import {
  defaultEditorPreferences,
  getStoredEditorPreferences,
  normalizeEditorPreferences,
  reorderTitlebarActions,
  saveStoredEditorPreferences
} from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("editor preferences", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads split AI-on-selection defaults with complex prompt suggestions off", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredEditorPreferences()).resolves.toEqual({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: false,
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
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "auto",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "viewMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "history", visible: true },
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
      showWordCount: true,
      wrapCodeBlocks: true
    });

    expect(store.get).toHaveBeenCalledWith("editorPreferences");
  });

  it("normalizes partial editor preferences from older settings files", async () => {
    store.get.mockResolvedValue({
      autoUpdateEnabled: true,
      autoSaveEnabled: false,
      autoSaveIntervalMinutes: 30,
      bodyFontSize: 99,
      clipboardImageFolder: "media/screenshots",
      copyExternalFilesToStorage: true,
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
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true,
      showWordCount: false
    });

    await expect(getStoredEditorPreferences()).resolves.toEqual({
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: false,
      autoSaveEnabled: false,
      autoSaveIntervalMinutes: 30,
      autoUpdateEnabled: true,
      bodyFontSize: 16,
      clipboardImageFolder: "media/screenshots",
      copyExternalFilesToStorage: true,
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "default",
      contentWidthPx: null,
      documentLinksOpen: true,
      documentLinksVisible: false,
      editorFontFamily: { family: null, source: "theme" },
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
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true,
      suggestAiPanelForComplexInlinePrompts: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "auto",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "viewMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "history", visible: true },
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
      showWordCount: false,
      wrapCodeBlocks: true
    });
  });

  it("normalizes view mode preferences", () => {
    expect(normalizeEditorPreferences({}).viewMode).toBe("daily");
    expect(normalizeEditorPreferences({ viewMode: "focus" }).viewMode).toBe("focus");
    expect(normalizeEditorPreferences({ viewMode: "zen" }).viewMode).toBe("daily");
    expect(normalizeEditorPreferences({
      viewMode: "custom",
      viewModeCustomizations: {
        aiPanel: "hidden",
        documentLinks: "hidden",
        documentTabs: "visible",
        fileTree: "hidden",
        fileTreeButton: "hidden",
        openButton: "hidden",
        quickCreateButton: "hidden",
        sidebarLayout: "hidden",
        statusBar: "no",
        titlebarActions: "hidden",
        viewModeToggle: "hidden",
        wordCount: "hidden"
      }
    }).viewModeCustomizations).toEqual({
      aiPanel: "hidden",
      documentLinks: "hidden",
      documentTabs: "visible",
      fileList: "visible",
      fileTree: "hidden",
      fileTreeButton: "hidden",
      openButton: "hidden",
      outline: "visible",
      quickCreateButton: "hidden",
      recentFolders: "visible",
      sidebarLayout: "hidden",
      statusBar: "visible",
      titlebarActions: "hidden",
      viewModeToggle: "hidden",
      wordCount: "hidden"
    });
  });

  it("normalizes titlebar action ordering and visibility", () => {
    expect(normalizeEditorPreferences({
      titlebarActions: [
        { id: "save", visible: false },
        { id: "theme", visible: true },
        { id: "save", visible: true },
        { id: "splitMode", visible: true },
        { id: "unknown", visible: true },
        { id: "aiAgent", visible: "yes" },
        { id: "open", visible: true }
      ]
    }).titlebarActions).toEqual([
      { id: "save", visible: false },
      { id: "theme", visible: true },
      { id: "aiAgent", visible: true },
      { id: "viewMode", visible: true },
      { id: "sourceMode", visible: true },
      { id: "history", visible: true }
    ]);
  });

  it("normalizes the automatic update preference", () => {
    expect(normalizeEditorPreferences({}).autoUpdateEnabled).toBe(true);
    expect(normalizeEditorPreferences({ autoUpdateEnabled: false }).autoUpdateEnabled).toBe(false);
    expect(normalizeEditorPreferences({ autoUpdateEnabled: "no" }).autoUpdateEnabled).toBe(true);
  });

  it("normalizes the experimental AI workspace animation preference", () => {
    expect(defaultEditorPreferences.aiWorkspaceAnimationEnabled).toBe(false);
    expect(normalizeEditorPreferences({}).aiWorkspaceAnimationEnabled).toBe(false);
    expect(normalizeEditorPreferences({ aiWorkspaceAnimationEnabled: true }).aiWorkspaceAnimationEnabled).toBe(true);
    expect(normalizeEditorPreferences({ aiWorkspaceAnimationEnabled: "yes" }).aiWorkspaceAnimationEnabled).toBe(false);
  });

  it("normalizes the automatic save preferences", () => {
    expect(normalizeEditorPreferences({}).autoSaveEnabled).toBe(true);
    expect(normalizeEditorPreferences({ autoSaveEnabled: false }).autoSaveEnabled).toBe(false);
    expect(normalizeEditorPreferences({ autoSaveEnabled: "no" }).autoSaveEnabled).toBe(true);
    expect(normalizeEditorPreferences({ autoSaveIntervalMinutes: 30 }).autoSaveIntervalMinutes).toBe(30);
    expect(normalizeEditorPreferences({ autoSaveIntervalMinutes: 0 }).autoSaveIntervalMinutes).toBe(1);
    expect(normalizeEditorPreferences({ autoSaveIntervalMinutes: 240 }).autoSaveIntervalMinutes).toBe(120);
    expect(normalizeEditorPreferences({ autoSaveIntervalMinutes: "often" }).autoSaveIntervalMinutes).toBe(10);
  });

  it("normalizes the editor font family preference", () => {
    expect(normalizeEditorPreferences({}).editorFontFamily).toEqual({ family: null, source: "theme" });
    expect(normalizeEditorPreferences({
      editorFontFamily: {
        family: "Example Serif",
        source: "system"
      }
    }).editorFontFamily).toEqual({ family: "Example Serif", source: "system" });
    expect(normalizeEditorPreferences({
      editorFontFamily: {
        family: "",
        source: "system"
      }
    }).editorFontFamily).toEqual({ family: null, source: "theme" });
    expect(normalizeEditorPreferences({ editorFontFamily: "Legacy Sans" }).editorFontFamily).toEqual({
      family: "Legacy Sans",
      source: "system"
    });
  });

  it("normalizes the code block line wrapping preference", () => {
    expect(normalizeEditorPreferences({}).wrapCodeBlocks).toBe(true);
    expect(normalizeEditorPreferences({ wrapCodeBlocks: false }).wrapCodeBlocks).toBe(false);
    expect(normalizeEditorPreferences({ wrapCodeBlocks: "no" }).wrapCodeBlocks).toBe(true);
  });

  it("migrates the old AI selection display mode into independent switches", () => {
    expect(normalizeEditorPreferences({
      autoOpenAiOnSelection: true,
      aiSelectionDisplayMode: "command"
    })).toMatchObject({
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false
    });

    expect(normalizeEditorPreferences({
      autoOpenAiOnSelection: true,
      aiSelectionDisplayMode: "toolbar"
    })).toMatchObject({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true
    });

    expect(normalizeEditorPreferences({
      autoOpenAiOnSelection: false,
      aiSelectionDisplayMode: "toolbar"
    })).toMatchObject({
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: false
    });
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
      { id: "viewMode", visible: true },
      { id: "sourceMode", visible: true },
      { id: "history", visible: true },
      { id: "save", visible: true },
      { id: "theme", visible: true }
    ] as const;

    expect(reorderTitlebarActions(actions, "aiAgent", "save")).toEqual([
      { id: "viewMode", visible: true },
      { id: "sourceMode", visible: true },
      { id: "history", visible: true },
      { id: "save", visible: true },
      { id: "aiAgent", visible: true },
      { id: "theme", visible: true }
    ]);
    expect(reorderTitlebarActions(actions, "save", "sourceMode")).toEqual([
      { id: "aiAgent", visible: true },
      { id: "viewMode", visible: true },
      { id: "save", visible: true },
      { id: "sourceMode", visible: true },
      { id: "history", visible: true },
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

  it("normalizes the sidebar layout mode", () => {
    expect(normalizeEditorPreferences({}).sidebarLayoutMode).toBe("stacked");
    expect(normalizeEditorPreferences({ sidebarLayoutMode: "tabs" }).sidebarLayoutMode).toBe("tabs");
    expect(normalizeEditorPreferences({ sidebarLayoutMode: "stacked" }).sidebarLayoutMode).toBe("stacked");
    expect(normalizeEditorPreferences({ sidebarLayoutMode: "paged" }).sidebarLayoutMode).toBe("stacked");
  });

  it("normalizes the custom spellcheck preference", () => {
    expect(defaultEditorPreferences.spellcheckEnabled).toBe(false);
    expect(defaultEditorPreferences.spellcheckLanguage).toBe("en");
    expect(defaultEditorPreferences.spellcheckIgnoredWords).toEqual([]);
    expect(normalizeEditorPreferences({ spellcheckEnabled: true }).spellcheckEnabled).toBe(true);
    expect(normalizeEditorPreferences({ spellcheckEnabled: false }).spellcheckEnabled).toBe(false);
    expect(normalizeEditorPreferences({ spellcheckEnabled: "native" }).spellcheckEnabled).toBe(false);
    expect(normalizeEditorPreferences({ spellcheckLanguage: "fr" }).spellcheckLanguage).toBe("fr");
    expect(normalizeEditorPreferences({ spellcheckLanguage: "zh-CN" }).spellcheckLanguage).toBe("en");
    expect(normalizeEditorPreferences({ spellcheckLanguage: "native" }).spellcheckLanguage).toBe("en");
    expect(normalizeEditorPreferences({
      spellcheckIgnoredWords: ["MarkraTerm", "markraterm", "  CustomTerm  ", "", 42]
    }).spellcheckIgnoredWords).toEqual(["markraterm", "customterm"]);
    expect(normalizeEditorPreferences({ spellcheckIgnoredWords: "MarkraTerm" }).spellcheckIgnoredWords).toEqual([]);
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
      aiWorkspaceAnimationEnabled: false,
      autoRevealActiveFile: false,
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
      restoreWorkspaceOnStartup: true,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: true,
      showAiSelectionToolbarOnSelection: false,
      suggestAiPanelForComplexInlinePrompts: false,
      showDocumentTabs: true,
      splitVisualPanePercent: 50,
      spellcheckEnabled: false,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "auto",
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "viewMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "history", visible: true },
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
      showWordCount: true,
      wrapCodeBlocks: true
    });
  });

  it("persists editor preferences", async () => {
    await saveStoredEditorPreferences({
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
      editorFontFamily: { family: "Example Serif", source: "system" },
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
      sidebarLayoutMode: "tabs",
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      splitVisualPanePercent: 64,
      spellcheckEnabled: true,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true },
        { id: "history", visible: true },
        { id: "viewMode", visible: true }
      ],
      viewMode: "custom",
      viewModeCustomizations: {
        aiPanel: "visible",
        documentLinks: "visible",
        documentTabs: "hidden",
        fileList: "visible",
        fileTree: "visible",
        fileTreeButton: "visible",
        openButton: "visible",
        outline: "visible",
        quickCreateButton: "visible",
        recentFolders: "visible",
        sidebarLayout: "visible",
        statusBar: "hidden",
        titlebarActions: "visible",
        viewModeToggle: "visible",
        wordCount: "visible"
      },
      showWordCount: false,
      wrapCodeBlocks: false
    });

    expect(store.set).toHaveBeenCalledWith("editorPreferences", {
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
      editorFontFamily: { family: "Example Serif", source: "system" },
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
      sidebarLayoutMode: "tabs",
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: false,
      splitVisualPanePercent: 64,
      spellcheckEnabled: true,
      spellcheckIgnoredWords: [],
      spellcheckLanguage: "en",
      tableColumnWidthMode: "even",
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true },
        { id: "history", visible: true },
        { id: "viewMode", visible: true }
      ],
      viewMode: "custom",
      viewModeCustomizations: {
        aiPanel: "visible",
        documentLinks: "visible",
        documentTabs: "hidden",
        fileList: "visible",
        fileTree: "visible",
        fileTreeButton: "visible",
        openButton: "visible",
        outline: "visible",
        quickCreateButton: "visible",
        recentFolders: "visible",
        sidebarLayout: "visible",
        statusBar: "hidden",
        titlebarActions: "visible",
        viewModeToggle: "visible",
        wordCount: "visible"
      },
      showWordCount: false,
      wrapCodeBlocks: false
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
