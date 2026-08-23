import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getStoredNetworkSettings, saveStoredWorkspaceState } from "@markra/app/settings";
import { listNativeEditorWindowRestoreStates } from "./window";
import { checkNativeAppUpdate } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: vi.fn().mockImplementation(function Channel(callback: unknown) {
    return { callback };
  }),
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn()
}));

vi.mock("@markra/app/settings", () => ({
  getStoredNetworkSettings: vi.fn(),
  saveStoredWorkspaceState: vi.fn()
}));

vi.mock("./window", () => ({
  listNativeEditorWindowRestoreStates: vi.fn()
}));

const mockedCheck = vi.mocked(check);
const mockedInvoke = vi.mocked(invoke);
const mockedGetStoredNetworkSettings = vi.mocked(getStoredNetworkSettings);
const mockedRelaunch = vi.mocked(relaunch);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);
const mockedListNativeEditorWindowRestoreStates = vi.mocked(listNativeEditorWindowRestoreStates);

describe("native app updater", () => {
  beforeEach(() => {
    mockedCheck.mockReset();
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(async (command) => {
      if (command === "is_native_portable_app") return false;
      return undefined;
    });
    mockedGetStoredNetworkSettings.mockReset();
    mockedRelaunch.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedListNativeEditorWindowRestoreStates.mockReset();
    mockedListNativeEditorWindowRestoreStates.mockResolvedValue([]);
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
    mockedGetStoredNetworkSettings.mockResolvedValue({
      bypassLocalAddresses: true,
      proxyEnabled: false,
      proxyUrl: ""
    });
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("skips update checks outside the Tauri runtime", async () => {
    const update = await checkNativeAppUpdate();

    expect(update).toBeNull();
    expect(mockedCheck).not.toHaveBeenCalled();
  });

  it("returns null when Tauri reports no update", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockedCheck.mockResolvedValue(null);

    await expect(checkNativeAppUpdate()).resolves.toBeNull();
    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:7890"
    });
  });

  it("checks for updates through the configured app proxy first", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockedGetStoredNetworkSettings.mockResolvedValueOnce({
      bypassLocalAddresses: true,
      proxyEnabled: true,
      proxyUrl: "socks5://127.0.0.1:1080"
    });
    mockedCheck.mockResolvedValue(null);

    await expect(checkNativeAppUpdate()).resolves.toBeNull();

    expect(mockedCheck).toHaveBeenCalledTimes(1);
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "socks5://127.0.0.1:1080"
    });
  });

  it("falls back to a direct update check when local HTTP proxies are unavailable", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockedCheck.mockImplementation(async (options) => {
      if (options?.proxy) {
        throw new Error(`proxy unavailable: ${options.proxy}`);
      }

      return null;
    });

    await expect(checkNativeAppUpdate()).resolves.toBeNull();

    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:7890"
    });
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:7897"
    });
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:1087"
    });
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:10809"
    });
    expect(mockedCheck).toHaveBeenCalledWith({
      proxy: "http://127.0.0.1:6152"
    });
    expect(mockedCheck).toHaveBeenLastCalledWith();
  });

  it("wraps update metadata and separates download from restart", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => unknown) => {
      onEvent({ data: { contentLength: 100 }, event: "Started" });
      onEvent({ data: { chunkLength: 25 }, event: "Progress" });
      onEvent({ data: { chunkLength: 75 }, event: "Progress" });
      onEvent({ event: "Finished" });
    });
    mockedCheck.mockResolvedValue({
      body: "Release notes",
      currentVersion: "0.0.6",
      date: "2026-05-11T00:00:00Z",
      downloadAndInstall,
      rawJson: {},
      version: "0.0.7"
    } as unknown as Awaited<ReturnType<typeof check>>);
    const onProgress = vi.fn();

    const update = await checkNativeAppUpdate();
    await update?.downloadAndInstall({ onProgress });

    expect(update).toMatchObject({
      body: "Release notes",
      currentVersion: "0.0.6",
      date: "2026-05-11T00:00:00Z",
      version: "0.0.7"
    });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      contentLength: 100,
      downloaded: 0,
      progress: 0
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      contentLength: 100,
      downloaded: 100,
      progress: 100
    });
    expect(mockedRelaunch).not.toHaveBeenCalled();

    await update?.restart();

    expect(mockedRelaunch).toHaveBeenCalledTimes(1);
  });

  it("persists the registered editor window restore snapshot before relaunching", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockedListNativeEditorWindowRestoreStates.mockResolvedValue([
      {
        filePath: "/mock-files/first.md",
        label: "main",
        openFilePaths: ["/mock-files/first.md"]
      },
      {
        filePath: "/mock-files/second.md",
        label: "markra-editor-1",
        openFilePaths: ["/mock-files/second.md"]
      }
    ]);
    mockedCheck.mockResolvedValue({
      currentVersion: "0.0.6",
      downloadAndInstall: vi.fn(),
      rawJson: {},
      version: "0.0.7"
    } as unknown as Awaited<ReturnType<typeof check>>);

    const update = await checkNativeAppUpdate();
    await update?.restart();

    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledWith({
      openWindows: [
        {
          filePath: "/mock-files/first.md",
          label: "main",
          openFilePaths: ["/mock-files/first.md"]
        },
        {
          filePath: "/mock-files/second.md",
          label: "markra-editor-1",
          openFilePaths: ["/mock-files/second.md"]
        }
      ]
    });
    expect(mockedRelaunch).toHaveBeenCalledTimes(1);
  });

  it("uses the signed portable update channel without launching an installer", async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "is_native_portable_app") return true;
      if (command === "check_portable_app_update") {
        return {
          body: "Portable release notes",
          currentVersion: "0.0.6",
          date: "2026-05-11T00:00:00Z",
          version: "0.0.7"
        };
      }
      if (command === "download_portable_app_update") {
        const channel = (args as { onEvent: { callback: (event: unknown) => unknown } }).onEvent;
        channel.callback({ data: { contentLength: 80 }, event: "Started" });
        channel.callback({ data: { chunkLength: 80 }, event: "Progress" });
        channel.callback({ event: "Finished" });
      }
      return undefined;
    });
    const onProgress = vi.fn();

    const update = await checkNativeAppUpdate();
    await update?.downloadAndInstall({ onProgress });
    await update?.restart();

    expect(mockedCheck).not.toHaveBeenCalled();
    expect(mockedInvoke).toHaveBeenCalledWith("check_portable_app_update", {
      proxy: "http://127.0.0.1:7890"
    });
    expect(mockedInvoke).toHaveBeenCalledWith("download_portable_app_update", {
      onEvent: expect.anything()
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      contentLength: 80,
      downloaded: 80,
      progress: 100
    });
    expect(mockedSaveStoredWorkspaceState).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("restart_portable_app_update");
    expect(mockedRelaunch).not.toHaveBeenCalled();
  });
});
