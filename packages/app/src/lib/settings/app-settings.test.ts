import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import {
  appThemeOptions,
  consumeWelcomeDocumentState,
  editorThemeOptions,
  getStoredCustomThemeCss,
  getStoredLanguage,
  getStoredTheme,
  isAppTheme,
  resetWelcomeDocumentState,
  resolveAppAppearanceTheme,
  saveStoredCustomThemeCss,
  saveStoredLanguage,
  saveStoredTheme
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

  it("resets the welcome document state for the next launch", async () => {
    await resetWelcomeDocumentState();

    expect(store.delete).toHaveBeenCalledWith("welcomeDocumentSeen");
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
