import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import {
  darkEditorThemeOptions,
  defaultEditorPreferences,
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
  resetWelcomeDocumentState,
  normalizeEditorPreferences,
  resolveAppAppearanceTheme,
  resolveAppThemePreferencesAppearance,
  resolveAppThemePreferencesEditorTheme,
  saveStoredCustomThemeCss,
  saveStoredLanguage,
  saveStoredTheme,
  saveStoredThemePreferences
} from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

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

  it("normalizes the automatic active file reveal preference", () => {
    expect(defaultEditorPreferences.autoRevealActiveFile).toBe(false);
    expect(normalizeEditorPreferences({ autoRevealActiveFile: false }).autoRevealActiveFile).toBe(false);
    expect(normalizeEditorPreferences({ autoRevealActiveFile: "sometimes" }).autoRevealActiveFile).toBe(false);
  });

  it("resets the welcome document state for the next launch", async () => {
    await resetWelcomeDocumentState();

    expect(store.delete).toHaveBeenCalledWith("welcomeDocumentSeen");
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
