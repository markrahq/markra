import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { desktopRuntime } from "./index";
import * as logs from "./tauri/logs";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(),
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn()
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
  version: vi.fn(() => "26.5.1")
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn()
}));

vi.mock("./tauri/logs", () => ({
  isNativeLoggingAvailable: vi.fn(() => true),
  openNativeLogFolder: vi.fn(),
  writeNativeLog: vi.fn()
}));

vi.mock("@markra/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@markra/shared")>(),
  hasTauriRuntime: vi.fn(() => true)
}));

const mockedListen = vi.mocked(listen);

describe("desktop runtime events", () => {
  beforeEach(() => {
    mockedListen.mockReset();
  });

  it("ignores stale Tauri unlisten failures and only cleans up once", async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error("undefined is not an object (evaluating 'listeners[eventId].handlerId')"));
    mockedListen.mockResolvedValue(cleanup);

    const stopListening = await desktopRuntime.events.listen("markra://synthetic-event", () => {});

    await expect(Promise.resolve(stopListening())).resolves.toBeUndefined();
    await expect(Promise.resolve(stopListening())).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("desktop runtime logs", () => {
  it("exposes the native log runtime", () => {
    expect(desktopRuntime.logs.isAvailable()).toBe(true);
    expect(desktopRuntime.logs.openLogFolder).toBe(logs.openNativeLogFolder);
    expect(desktopRuntime.logs.writeLog).toBe(logs.writeNativeLog);
  });
});

describe("desktop runtime settings", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(load).mockReset();
  });

  it.each(["settings.json", "/mock-data/settings.json"])(
    "loads the store from the native resolved path %s",
    async (resolvedPath) => {
      vi.mocked(invoke).mockResolvedValue(resolvedPath);
      const options = { defaults: {}, autoSave: false };

      await desktopRuntime.settings.loadStore("settings.json", options);

      expect(invoke).toHaveBeenCalledWith("resolve_store_path", { path: "settings.json" });
      expect(load).toHaveBeenCalledWith(resolvedPath, options);
    }
  );

  it("does not fall back to the default store when resolving the custom path fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Mock storage unavailable"));

    await expect(desktopRuntime.settings.loadStore("settings.json", { defaults: {} }))
      .rejects.toThrow("Mock storage unavailable");
    expect(load).not.toHaveBeenCalled();
  });
});
