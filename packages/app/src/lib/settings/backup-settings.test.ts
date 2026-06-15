import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredBackupSettings, saveStoredBackupSettings } from "./app-settings";
import { defaultBackupSettings, normalizeBackupSettings } from "./backup-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("backup settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads backup settings with local backup disabled by default", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredBackupSettings()).resolves.toEqual(defaultBackupSettings);

    expect(store.get).toHaveBeenCalledWith("backupSettings");
  });

  it("normalizes and persists backup settings", async () => {
    const settings = normalizeBackupSettings({
      backupOnExit: true,
      intervalMinutes: 8.4,
      lastBackupAt: 1_700_000_000_000,
      targetPath: " /mock-backups "
    });

    expect(settings).toEqual({
      backupOnExit: true,
      intervalMinutes: 8,
      lastBackupAt: 1_700_000_000_000,
      targetPath: "/mock-backups"
    });

    await saveStoredBackupSettings(settings);

    expect(store.set).toHaveBeenCalledWith("backupSettings", settings);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
