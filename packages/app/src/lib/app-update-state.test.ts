import {
  clearDiscoveredAppUpdateVersion,
  getDiscoveredAppUpdateVersion,
  setDiscoveredAppUpdateVersion
} from "./app-update-state";

const discoveredAppUpdateVersionStorageKey = "markra.discoveredAppUpdate.version";

describe("app update state", () => {
  beforeEach(() => {
    setDiscoveredAppUpdateVersion(null);
    window.localStorage.clear();
  });

  afterEach(() => {
    setDiscoveredAppUpdateVersion(null);
    window.localStorage.clear();
  });

  it("returns discovered update versions only for the matching current app version", () => {
    setDiscoveredAppUpdateVersion({
      currentVersion: "0.0.6",
      version: "0.0.7"
    });

    expect(getDiscoveredAppUpdateVersion("0.0.6")).toBe("0.0.7");
    expect(getDiscoveredAppUpdateVersion("0.0.7")).toBeNull();
  });

  it("ignores malformed stored update state", () => {
    setDiscoveredAppUpdateVersion({
      currentVersion: "0.0.6",
      version: "0.0.7"
    });
    window.localStorage.setItem(discoveredAppUpdateVersionStorageKey, "0.0.7");

    expect(getDiscoveredAppUpdateVersion("0.0.6")).toBeNull();
  });

  it("does not clear a newer discovered update when an older install finishes", () => {
    setDiscoveredAppUpdateVersion({
      currentVersion: "0.0.6",
      version: "0.0.8"
    });

    clearDiscoveredAppUpdateVersion("0.0.7");
    expect(getDiscoveredAppUpdateVersion("0.0.6")).toBe("0.0.8");

    clearDiscoveredAppUpdateVersion("0.0.8");
    expect(getDiscoveredAppUpdateVersion("0.0.6")).toBeNull();
  });
});
