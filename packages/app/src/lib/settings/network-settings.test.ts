import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredNetworkSettings, saveStoredNetworkSettings } from "./app-settings";
import { normalizeNetworkSettings } from "./network-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("network settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("normalizes app network proxy settings with socks support", () => {
    expect(normalizeNetworkSettings({
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: " socks5://127.0.0.1:1080 "
    })).toEqual({
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: "socks5://127.0.0.1:1080"
    });

    expect(normalizeNetworkSettings({
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: "ftp://proxy.example.test:21"
    })).toEqual({
      bypassLocalAddresses: true,
      proxyEnabled: false,
      proxyUrl: ""
    });
  });

  it("loads and persists network settings from the app data store", async () => {
    store.get.mockResolvedValue({
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: "socks5h://proxy.example.test:1080"
    });

    await expect(getStoredNetworkSettings()).resolves.toEqual({
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: "socks5h://proxy.example.test:1080"
    });
    await saveStoredNetworkSettings({
      bypassLocalAddresses: true,
      proxyEnabled: true,
      proxyUrl: "http://127.0.0.1:7890"
    });

    expect(store.get).toHaveBeenCalledWith("network");
    expect(store.set).toHaveBeenCalledWith("network", {
      bypassLocalAddresses: true,
      proxyEnabled: true,
      proxyUrl: "http://127.0.0.1:7890"
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
