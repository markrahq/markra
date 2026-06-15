import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredSyncSettings, saveStoredSyncSettings } from "./app-settings";
import { defaultSyncSettings, normalizeSyncSettings } from "./sync-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("sync settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads remote sync settings disabled by default", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredSyncSettings()).resolves.toEqual({
      ...defaultSyncSettings,
      remotePath: "markra"
    });

    expect(store.get).toHaveBeenCalledWith("syncSettings");
  });

  it("defaults the remote sync folder to markra", () => {
    expect(normalizeSyncSettings({})).toEqual({
      ...defaultSyncSettings,
      remotePath: "markra"
    });
  });

  it("keeps an explicitly cleared remote sync folder empty while editing", () => {
    expect(normalizeSyncSettings({
      remotePath: " "
    })).toEqual({
      ...defaultSyncSettings,
      remotePath: ""
    });
  });

  it("normalizes and persists WebDAV sync settings", async () => {
    const settings = normalizeSyncSettings({
      autoSyncOnSave: true,
      enabled: true,
      intervalMinutes: 12.8,
      lastSyncAt: 1_700_000_000_000,
      provider: "webdav",
      remotePath: " /notes "
    });

    expect(settings).toEqual({
      autoSyncOnSave: true,
      enabled: true,
      intervalMinutes: 13,
      lastSyncAt: 1_700_000_000_000,
      provider: "webdav",
      remotePath: "/notes"
    });

    await saveStoredSyncSettings(settings);

    expect(store.set).toHaveBeenCalledWith("syncSettings", settings);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("migrates the remote sync folder from legacy nested WebDAV settings", () => {
    expect(normalizeSyncSettings({
      enabled: true,
      webdav: {
        password: "secret",
        remotePath: " markra ",
        serverUrl: "https://dav.example.test/",
        username: "ada"
      }
    })).toEqual({
      ...defaultSyncSettings,
      enabled: true,
      remotePath: "markra"
    });
  });
});
