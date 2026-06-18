import { defaultMarkdownShortcuts } from "@markra/editor";
import { defaultAiQuickActionPrompts } from "../ai-actions";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../../runtime";
import {
  listenAppCustomThemeCssChanged,
  listenAppBackupSettingsChanged,
  listenAppEditorPreferencesChanged,
  listenAppExportSettingsChanged,
  listenAppLanguageChanged,
  listenAppThemeChanged,
  listenAppSyncSettingsChanged,
  notifyAppCustomThemeCssChanged,
  notifyAppBackupSettingsChanged,
  notifyAppEditorPreferencesChanged,
  notifyAppExportSettingsChanged,
  notifyAppLanguageChanged,
  notifyAppSyncSettingsChanged,
  notifyAppThemeChanged
} from "./settings-events";
import type { BackupSettings, EditorPreferences, SyncSettings } from "./app-settings";

const mockedEmit = vi.fn();
const mockedListen = vi.fn();

describe("settings events", () => {
  let eventsAvailable = false;

  beforeEach(() => {
    mockedEmit.mockReset();
    mockedListen.mockReset();
    eventsAvailable = false;
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      events: {
        emit: mockedEmit,
        isAvailable: () => eventsAvailable,
        listen: mockedListen
      }
    });
  });

  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("does nothing outside the Tauri runtime", async () => {
    const cleanup = await listenAppThemeChanged(vi.fn());

    await notifyAppThemeChanged({
      appearanceMode: "dark",
      darkTheme: "dark",
      lightTheme: "light"
    });
    cleanup();

    expect(mockedListen).not.toHaveBeenCalled();
    expect(mockedEmit).not.toHaveBeenCalled();
  });

  it("emits and listens for theme changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onThemeChanged = vi.fn();
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppThemeChanged(onThemeChanged);
    const listener = mockedListen.mock.calls[0]?.[1];
    const preferences = {
      appearanceMode: "dark" as const,
      darkTheme: "night" as const,
      lightTheme: "sepia" as const
    };

    await notifyAppThemeChanged(preferences);
    listener?.({ payload: { preferences } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { theme: "newsprint" } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { theme: "dracula" } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://theme-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://theme-changed", { preferences });
    expect(onThemeChanged).toHaveBeenCalledWith(preferences);
    expect(onThemeChanged).toHaveBeenCalledWith({
      appearanceMode: "light",
      darkTheme: "dark",
      lightTheme: "newsprint"
    });
    expect(onThemeChanged).toHaveBeenCalledTimes(2);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for custom theme CSS changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onCustomThemeCssChanged = vi.fn();
    const customThemeCss = {
      dark: ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }",
      light: ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }"
    };
    const legacyCss = ":root[data-theme=\"custom\"] { --accent: #0969da; }";
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppCustomThemeCssChanged(onCustomThemeCssChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    await notifyAppCustomThemeCssChanged(customThemeCss);
    listener?.({ payload: { customThemeCss } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { css: legacyCss } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { css: 42 } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://custom-theme-css-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://custom-theme-css-changed", { customThemeCss });
    expect(onCustomThemeCssChanged).toHaveBeenCalledWith(customThemeCss);
    expect(onCustomThemeCssChanged).toHaveBeenCalledWith({
      dark: legacyCss,
      light: legacyCss
    });
    expect(onCustomThemeCssChanged).toHaveBeenCalledTimes(2);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for language changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onLanguageChanged = vi.fn();
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppLanguageChanged(onLanguageChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    await notifyAppLanguageChanged("fr");
    listener?.({ payload: { language: "fr" } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { language: "pirate" } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://language-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://language-changed", { language: "fr" });
    expect(onLanguageChanged).toHaveBeenCalledWith("fr");
    expect(onLanguageChanged).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for editor preference changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onPreferencesChanged = vi.fn();
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppEditorPreferencesChanged(onPreferencesChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    const preferences: EditorPreferences = {
      aiQuickActionPrompts: defaultAiQuickActionPrompts,
      autoUpdateEnabled: true,
      bodyFontSize: 18,
      clipboardImageFolder: "images",
      closeAiCommandOnAgentPanelOpen: true,
      contentWidth: "wide" as const,
      contentWidthPx: 1120,
      editorFontFamily: {
        family: "Example Serif",
        source: "system"
      },
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
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
      markdownShortcuts: defaultMarkdownShortcuts,
      markdownTemplates: [],
      restoreWorkspaceOnStartup: false,
      sidebarLayoutMode: "stacked",
      showAiQuickInputOnSelection: false,
      showAiSelectionToolbarOnSelection: true,
      suggestAiPanelForComplexInlinePrompts: true,
      showDocumentTabs: true,
      splitVisualPanePercent: 64,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "aiAgent", visible: true },
        { id: "history", visible: true }
      ],
      showWordCount: false,
      wrapCodeBlocks: false
    };

    await notifyAppEditorPreferencesChanged(preferences);
    listener?.({ payload: { preferences } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({
      payload: {
        preferences: {
          closeAiCommandOnAgentPanelOpen: false,
          showAiQuickInputOnSelection: "nope",
          showAiSelectionToolbarOnSelection: true
        }
      }
    } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://editor-preferences-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://editor-preferences-changed", {
      preferences
    });
    expect(onPreferencesChanged).toHaveBeenCalledWith(preferences);
    expect(onPreferencesChanged).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for export setting changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onSettingsChanged = vi.fn();
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppExportSettingsChanged(onSettingsChanged);
    const listener = mockedListen.mock.calls[0]?.[1];
    const settings = {
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      pdfAuthor: "",
      pdfFooter: "",
      pdfHeader: "",
      pdfHeightMm: 297,
      pdfMarginMm: 24,
      pdfMarginPreset: "custom" as const,
      pdfPageBreakOnH1: false,
      pdfPageSize: "default" as const,
      pdfWidthMm: 210
    };

    await notifyAppExportSettingsChanged(settings);
    listener?.({ payload: { settings } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://export-settings-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://export-settings-changed", {
      settings
    });
    expect(onSettingsChanged).toHaveBeenCalledWith(settings);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for backup setting changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onSettingsChanged = vi.fn();
    const settings: BackupSettings = {
      backupOnExit: true,
      intervalMinutes: 15,
      lastBackupAt: 1_700_000_000_000,
      targetPath: "/mock-backups"
    };
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppBackupSettingsChanged(onSettingsChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    await notifyAppBackupSettingsChanged(settings);
    listener?.({ payload: { settings } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://backup-settings-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://backup-settings-changed", {
      settings
    });
    expect(onSettingsChanged).toHaveBeenCalledWith(settings);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for sync setting changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onSettingsChanged = vi.fn();
    const settings: SyncSettings = {
      autoSyncOnSave: true,
      enabled: true,
      intervalMinutes: 20,
      lastSyncAt: 1_700_000_000_000,
      provider: "webdav",
      remotePath: "notes"
    };
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppSyncSettingsChanged(onSettingsChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    await notifyAppSyncSettingsChanged(settings);
    listener?.({ payload: { settings } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://sync-settings-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://sync-settings-changed", {
      settings
    });
    expect(onSettingsChanged).toHaveBeenCalledWith(settings);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

});
