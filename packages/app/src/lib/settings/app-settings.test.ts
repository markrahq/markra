import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import {
  darkEditorThemeOptions,
  defaultAcpAgentSettings,
  codexAcpAgentArgs,
  defaultEditorPreferences,
  exportStoredAppSettings,
  getStoredAcpAgentSettings,
  getStoredThemePreferences,
  appThemeOptions,
  consumeWelcomeDocumentState,
  editorThemeOptions,
  getStoredCustomThemeCss,
  getStoredLanguage,
  getStoredTheme,
  isAppAppearanceMode,
  isAppTheme,
  lightEditorThemeOptions,
  importStoredAppSettings,
  resetWelcomeDocumentState,
  normalizeEditorPreferences,
  normalizeAcpAgentSettings,
  resolveAppAppearanceTheme,
  resolveAppThemePreferencesAppearance,
  resolveAppThemePreferencesEditorTheme,
  saveStoredAcpAgentSettings,
  saveStoredCustomThemeCss,
  saveStoredLanguage,
  saveStoredTheme,
  saveStoredThemePreferences
} from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;
const legacyCodexAcpAgentArgsWithPathFallback = [
  "-lc '",
  "CODEX_BIN=\"$(command -v codex || true)\"; ",
  "if [ -z \"$CODEX_BIN\" ] && [ -x \"/Applications/Codex.app/Contents/Resources/codex\" ]; then ",
  "CODEX_BIN=\"/Applications/Codex.app/Contents/Resources/codex\"; ",
  "fi; ",
  "if [ -n \"$CODEX_BIN\" ]; then ",
  "exec env CODEX_PATH=\"$CODEX_BIN\" npx -y @agentclientprotocol/codex-acp; ",
  "fi; ",
  "exec npx -y @agentclientprotocol/codex-acp",
  "'"
].join("");

describe("app settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
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

  it("migrates a legacy light theme into split appearance preferences", async () => {
    store.get.mockImplementation(async (key: string) => {
      if (key === "theme") return "sepia";

      return undefined;
    });

    await expect(getStoredThemePreferences()).resolves.toEqual({
      appearanceMode: "light",
      darkTheme: "dark",
      lightTheme: "sepia"
    });

    expect(store.get).toHaveBeenCalledWith("appearanceMode");
    expect(store.get).toHaveBeenCalledWith("lightTheme");
    expect(store.get).toHaveBeenCalledWith("darkTheme");
    expect(store.get).toHaveBeenCalledWith("theme");
  });

  it("loads and persists split appearance preferences", async () => {
    store.get.mockImplementation(async (key: string) => {
      if (key === "appearanceMode") return "system";
      if (key === "lightTheme") return "solarized-light";
      if (key === "darkTheme") return "night";

      return undefined;
    });

    await expect(getStoredThemePreferences()).resolves.toEqual({
      appearanceMode: "system",
      darkTheme: "night",
      lightTheme: "solarized-light"
    });

    await saveStoredThemePreferences({
      appearanceMode: "dark",
      darkTheme: "catppuccin-mocha",
      lightTheme: "catppuccin-latte"
    });

    expect(store.set).toHaveBeenCalledWith("appearanceMode", "dark");
    expect(store.set).toHaveBeenCalledWith("lightTheme", "catppuccin-latte");
    expect(store.set).toHaveBeenCalledWith("darkTheme", "catppuccin-mocha");
    expect(store.set).not.toHaveBeenCalledWith("theme", expect.any(String));
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("resolves the active editor theme from appearance mode and saved palettes", () => {
    const preferences = {
      appearanceMode: "system" as const,
      darkTheme: "night" as const,
      lightTheme: "sepia" as const
    };

    expect(isAppAppearanceMode("system")).toBe(true);
    expect(isAppAppearanceMode("sepia")).toBe(false);
    expect(lightEditorThemeOptions).toContain("sepia");
    expect(lightEditorThemeOptions).not.toContain("night");
    expect(darkEditorThemeOptions).toContain("night");
    expect(darkEditorThemeOptions).not.toContain("sepia");
    expect(resolveAppThemePreferencesAppearance(preferences, "dark")).toBe("dark");
    expect(resolveAppThemePreferencesEditorTheme(preferences, "dark")).toBe("night");
    expect(resolveAppThemePreferencesEditorTheme(preferences, "light")).toBe("sepia");
  });

  it("recognizes GitHub and One theme options", () => {
    const requestedThemes = ["github-dark", "one-dark", "one-light", "one-dark-pro"];

    expect(editorThemeOptions).toEqual(expect.arrayContaining(requestedThemes));
    expect(appThemeOptions).toEqual(expect.arrayContaining(requestedThemes));

    for (const theme of requestedThemes) {
      expect(isAppTheme(theme)).toBe(true);
    }

    expect(resolveAppAppearanceTheme("github-dark" as Parameters<typeof resolveAppAppearanceTheme>[0], "light")).toBe("dark");
    expect(resolveAppAppearanceTheme("one-dark" as Parameters<typeof resolveAppAppearanceTheme>[0], "light")).toBe("dark");
    expect(resolveAppAppearanceTheme("one-light" as Parameters<typeof resolveAppAppearanceTheme>[0], "dark")).toBe("light");
    expect(resolveAppAppearanceTheme("one-dark-pro" as Parameters<typeof resolveAppAppearanceTheme>[0], "light")).toBe("dark");
  });

  it("migrates legacy custom theme CSS into separate light and dark CSS values", async () => {
    const css = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";
    store.get.mockImplementation(async (key: string) => {
      if (key === "customThemeCss") return css;

      return undefined;
    });

    await expect(getStoredCustomThemeCss()).resolves.toEqual({
      dark: css,
      light: css
    });
    expect(store.get).toHaveBeenCalledWith("customThemeCss");
    expect(store.get).toHaveBeenCalledWith("lightCustomThemeCss");
    expect(store.get).toHaveBeenCalledWith("darkCustomThemeCss");
  });

  it("loads and persists separate custom theme CSS values", async () => {
    const light = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";
    const dark = ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }";
    store.get.mockImplementation(async (key: string) => {
      if (key === "lightCustomThemeCss") return light;
      if (key === "darkCustomThemeCss") return dark;

      return undefined;
    });

    await expect(getStoredCustomThemeCss()).resolves.toEqual({ dark, light });
    await saveStoredCustomThemeCss({ dark, light });

    expect(store.set).toHaveBeenCalledWith("lightCustomThemeCss", light);
    expect(store.set).toHaveBeenCalledWith("darkCustomThemeCss", dark);
    expect(store.set).not.toHaveBeenCalledWith("customThemeCss", expect.any(String));
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

  it("normalizes and persists ACP agent settings", async () => {
    store.get.mockResolvedValue({
      args: " --experimental-acp ",
      command: " gemini ",
      cwd: " /mock-vault ",
      enabled: true
    });

    await expect(getStoredAcpAgentSettings()).resolves.toEqual({
      args: "--experimental-acp",
      command: "gemini",
      cwd: "/mock-vault",
      enabled: true
    });

    expect(normalizeAcpAgentSettings({ command: "", enabled: "yes" })).toEqual(defaultAcpAgentSettings);
    expect(codexAcpAgentArgs).toContain("INITIAL_AGENT_MODE=read-only");
    expect(normalizeAcpAgentSettings({
      args: "-lc 'exec env CODEX_PATH=\"$(command -v codex)\" npx -y @agentclientprotocol/codex-acp'",
      command: "/bin/zsh",
      enabled: true
    })).toEqual({
      args: codexAcpAgentArgs,
      command: "/bin/zsh",
      cwd: "",
      enabled: true
    });
    expect(normalizeAcpAgentSettings({
      args: legacyCodexAcpAgentArgsWithPathFallback,
      command: "/bin/zsh",
      enabled: true
    })).toEqual({
      args: codexAcpAgentArgs,
      command: "/bin/zsh",
      cwd: "",
      enabled: true
    });

    await saveStoredAcpAgentSettings({
      args: " --acp ",
      command: " claude ",
      cwd: " ",
      enabled: true
    });

    expect(store.set).toHaveBeenCalledWith("acpAgentSettings", {
      args: "--acp",
      command: "claude",
      cwd: "",
      enabled: true
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("normalizes the automatic active file reveal preference", () => {
    expect(defaultEditorPreferences.autoRevealActiveFile).toBe(false);
    expect(normalizeEditorPreferences({ autoRevealActiveFile: false }).autoRevealActiveFile).toBe(false);
    expect(normalizeEditorPreferences({ autoRevealActiveFile: "sometimes" }).autoRevealActiveFile).toBe(false);
  });

  it("normalizes the document links visibility preference", () => {
    expect(defaultEditorPreferences.documentLinksVisible).toBe(false);
    expect(normalizeEditorPreferences({ documentLinksVisible: true }).documentLinksVisible).toBe(true);
    expect(normalizeEditorPreferences({ documentLinksVisible: "yes" }).documentLinksVisible).toBe(false);
  });

  it("normalizes the document links collapse preference", () => {
    expect(defaultEditorPreferences.documentLinksOpen).toBe(true);
    expect(normalizeEditorPreferences({ documentLinksOpen: false }).documentLinksOpen).toBe(false);
    expect(normalizeEditorPreferences({ documentLinksOpen: "no" }).documentLinksOpen).toBe(true);
  });

  it("resets the welcome document state for the next launch", async () => {
    await resetWelcomeDocumentState();

    expect(store.delete).toHaveBeenCalledWith("welcomeDocumentSeen");
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("exports portable app settings without workspace-local state", async () => {
    store.get.mockImplementation(async (key: string) => {
      if (key === "language") return "zh-CN";
      if (key === "appearanceMode") return "dark";
      if (key === "lightTheme") return "minimal";
      if (key === "darkTheme") return "night";
      if (key === "lightCustomThemeCss") return ":root[data-theme=\"custom\"] { --bg-primary: #fff; }";
      if (key === "darkCustomThemeCss") return ":root[data-theme=\"custom\"] { --bg-primary: #111; }";
      if (key === "editorPreferences") {
        return {
          ...defaultEditorPreferences,
          autoSaveEnabled: false,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav",
            webdav: {
              ...defaultEditorPreferences.imageUpload.webdav,
              password: "synthetic-secret",
              serverUrl: "https://dav.example.test/images"
            }
          }
        };
      }
      if (key === "workspace") {
        return {
          filePath: "/private/example.md"
        };
      }
      if (key === "recentMarkdownFiles") {
        return [{ name: "example.md", path: "/private/example.md" }];
      }

      return undefined;
    });

    const exported = JSON.parse(
      await exportStoredAppSettings(new Date("2030-01-02T03:04:05.000Z"))
    );

    expect(exported).toMatchObject({
      exportedAt: "2030-01-02T03:04:05.000Z",
      format: "markra-settings",
      version: 1,
      settings: {
        appearanceMode: "dark",
        darkTheme: "night",
        editorPreferences: {
          autoSaveEnabled: false,
          imageUpload: {
            provider: "webdav",
            webdav: {
              password: "synthetic-secret",
              serverUrl: "https://dav.example.test/images"
            }
          }
        },
        language: "zh-CN",
        lightTheme: "minimal"
      }
    });
    expect(exported.settings).not.toHaveProperty("workspace");
    expect(exported.settings).not.toHaveProperty("recentMarkdownFiles");
    expect(store.get).not.toHaveBeenCalledWith("workspace");
    expect(store.get).not.toHaveBeenCalledWith("recentMarkdownFiles");
  });

  it("imports portable app settings after validating the file contents", async () => {
    const importedSettingsFile = {
      format: "markra-settings",
      version: 1,
      exportedAt: "2030-01-02T03:04:05.000Z",
      settings: {
        appearanceMode: "dark",
        customThemeCss: {
          dark: ":root[data-theme=\"custom\"] { --bg-primary: #111; }",
          light: ":root[data-theme=\"custom\"] { --bg-primary: #fff; }"
        },
        darkTheme: "night",
        editorPreferences: {
          ...defaultEditorPreferences,
          autoSaveEnabled: false,
          bodyFontSize: 20
        },
        language: "zh-CN",
        lightTheme: "minimal",
        recentMarkdownFiles: [{ name: "example.md", path: "/private/example.md" }],
        workspace: {
          filePath: "/private/example.md"
        }
      }
    };

    const imported = await importStoredAppSettings(JSON.stringify(importedSettingsFile));

    expect(imported).toMatchObject({
      appearanceMode: "dark",
      darkTheme: "night",
      language: "zh-CN",
      lightTheme: "minimal"
    });
    expect(mockedLoadStore).toHaveBeenCalledWith("settings.json", { autoSave: false, defaults: {} });
    expect(store.set).toHaveBeenCalledWith("language", "zh-CN");
    expect(store.set).toHaveBeenCalledWith("appearanceMode", "dark");
    expect(store.set).toHaveBeenCalledWith("lightTheme", "minimal");
    expect(store.set).toHaveBeenCalledWith("darkTheme", "night");
    expect(store.set).toHaveBeenCalledWith(
      "editorPreferences",
      expect.objectContaining({
        autoSaveEnabled: false,
        bodyFontSize: 20
      })
    );
    expect(store.set).not.toHaveBeenCalledWith("workspace", expect.anything());
    expect(store.set).not.toHaveBeenCalledWith("recentMarkdownFiles", expect.anything());
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid settings imports without writing to the settings store", async () => {
    await expect(importStoredAppSettings("{not json")).rejects.toThrow("Invalid Markra settings file.");

    expect(mockedLoadStore).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
});
