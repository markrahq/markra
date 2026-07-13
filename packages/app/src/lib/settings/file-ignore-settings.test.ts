import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import {
  exportStoredAppSettings,
  getStoredFileIgnoreSettings,
  importStoredAppSettings,
  saveStoredFileIgnoreSettings
} from "./app-settings";
import {
  defaultFileIgnoreSettings,
  fileIgnoreRulesMaxLength,
  normalizeFileIgnoreSettings
} from "./file-ignore-settings";

const settingsStore = createSettingsStoreHarness();
const { store } = settingsStore;

describe("file ignore settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("normalizes global ignore rules without changing gitignore whitespace", () => {
    expect(normalizeFileIgnoreSettings(undefined)).toEqual(defaultFileIgnoreSettings);
    expect(normalizeFileIgnoreSettings({
      rules: "drafts/\r\nimportant\\ \r*.tmp"
    })).toEqual({
      rules: "drafts/\nimportant\\ \n*.tmp"
    });
    expect(normalizeFileIgnoreSettings({
      rules: "x".repeat(fileIgnoreRulesMaxLength + 1)
    }).rules).toHaveLength(fileIgnoreRulesMaxLength);
  });

  it("loads and persists normalized global ignore rules", async () => {
    store.get.mockResolvedValue({ rules: "generated/\r\n*.tmp" });

    await expect(getStoredFileIgnoreSettings()).resolves.toEqual({
      rules: "generated/\n*.tmp"
    });
    expect(store.get).toHaveBeenCalledWith("fileIgnoreSettings");

    await saveStoredFileIgnoreSettings({ rules: "drafts/\r" });

    expect(store.set).toHaveBeenCalledWith("fileIgnoreSettings", {
      rules: "drafts/\n"
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("includes global ignore rules in portable settings", async () => {
    store.get.mockImplementation(async (key: string) => {
      if (key === "fileIgnoreSettings") return { rules: "generated/\r\n*.tmp" };

      return undefined;
    });

    const exported = JSON.parse(await exportStoredAppSettings(new Date("2026-07-13T00:00:00.000Z")));

    expect(exported.settings.fileIgnoreSettings).toEqual({
      rules: "generated/\n*.tmp"
    });

    await importStoredAppSettings(JSON.stringify({
      exportedAt: "2026-07-13T00:00:00.000Z",
      format: "markra-settings",
      settings: {
        fileIgnoreSettings: { rules: "drafts/\r" }
      },
      version: 1
    }));

    expect(store.set).toHaveBeenCalledWith("fileIgnoreSettings", {
      rules: "drafts/\n"
    });
  });
});
