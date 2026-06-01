import { defaultMarkdownShortcuts } from "@markra/editor";
import { defaultAiQuickActionPrompts } from "../ai-actions";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../../runtime";
import {
  listenAppCustomThemeCssChanged,
  listenAppEditorPreferencesChanged,
  listenAppExportSettingsChanged,
  listenAppLanguageChanged,
  listenAppThemeChanged,
  notifyAppCustomThemeCssChanged,
  notifyAppEditorPreferencesChanged,
  notifyAppExportSettingsChanged,
  notifyAppLanguageChanged,
  notifyAppThemeChanged
} from "./settings-events";
import type { EditorPreferences } from "./app-settings";

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

    await notifyAppThemeChanged("dark");
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

    await notifyAppThemeChanged("newsprint");
    listener?.({ payload: { theme: "newsprint" } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { theme: "dracula" } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://theme-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://theme-changed", { theme: "newsprint" });
    expect(onThemeChanged).toHaveBeenCalledWith("newsprint");
    expect(onThemeChanged).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("emits and listens for custom theme CSS changes inside Tauri", async () => {
    const unlisten = vi.fn();
    const onCustomThemeCssChanged = vi.fn();
    const css = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";
    eventsAvailable = true;
    mockedListen.mockResolvedValue(unlisten);

    const cleanup = await listenAppCustomThemeCssChanged(onCustomThemeCssChanged);
    const listener = mockedListen.mock.calls[0]?.[1];

    await notifyAppCustomThemeCssChanged(css);
    listener?.({ payload: { css } } as Parameters<NonNullable<typeof listener>>[0]);
    listener?.({ payload: { css: 42 } } as Parameters<NonNullable<typeof listener>>[0]);
    cleanup();

    expect(mockedListen).toHaveBeenCalledWith("markra://custom-theme-css-changed", expect.any(Function));
    expect(mockedEmit).toHaveBeenCalledWith("markra://custom-theme-css-changed", { css });
    expect(onCustomThemeCssChanged).toHaveBeenCalledWith(css);
    expect(onCustomThemeCssChanged).toHaveBeenCalledTimes(1);
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
        { id: "aiAgent", visible: true }
      ],
      showWordCount: false
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
});
