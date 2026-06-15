import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredWebSearchSettings, saveStoredWebSearchSettings } from "./app-settings";
import { normalizeWebSearchSettings } from "./web-search-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("web search settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads local Bing as the default web search settings", async () => {
    store.get.mockResolvedValue(undefined);

    await expect(getStoredWebSearchSettings()).resolves.toEqual({
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    });

    expect(store.get).toHaveBeenCalledWith("webSearch");
  });

  it("normalizes persisted web search settings", () => {
    expect(normalizeWebSearchSettings({
      contentMaxChars: 999999,
      enabled: "yes",
      maxResults: 200,
      providerId: "searxng",
      searxngApiHost: " http://localhost:8888/ "
    })).toEqual({
      contentMaxChars: 40000,
      enabled: true,
      maxResults: 20,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888"
    });

    expect(normalizeWebSearchSettings({
      contentMaxChars: 100,
      maxResults: -1,
      providerId: "unknown",
      searxngApiHost: "file:///tmp/nope"
    })).toEqual({
      contentMaxChars: 2000,
      enabled: true,
      maxResults: 1,
      providerId: "local-bing",
      searxngApiHost: ""
    });
  });

  it("persists normalized web search settings", async () => {
    await saveStoredWebSearchSettings({
      contentMaxChars: 8000,
      enabled: true,
      maxResults: 8,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888/"
    });

    expect(store.set).toHaveBeenCalledWith("webSearch", {
      contentMaxChars: 8000,
      enabled: true,
      maxResults: 8,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888"
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
