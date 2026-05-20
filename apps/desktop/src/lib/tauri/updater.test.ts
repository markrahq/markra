import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { saveStoredWorkspaceState } from "../settings/app-settings";
import { listNativeEditorWindowRestoreStates } from "./window";
import { checkNativeAppUpdate } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn()
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn()
}));

vi.mock("../settings/app-settings", () => ({
  saveStoredWorkspaceState: vi.fn()
}));

vi.mock("./window", () => ({
  listNativeEditorWindowRestoreStates: vi.fn()
}));

const mockedCheck = vi.mocked(check);
const mockedRelaunch = vi.mocked(relaunch);
const mockedSaveStoredWorkspaceState = vi.mocked(saveStoredWorkspaceState);
const mockedListNativeEditorWindowRestoreStates = vi.mocked(listNativeEditorWindowRestoreStates);

describe("native app updater", () => {
  beforeEach(() => {
    mockedCheck.mockReset();
    mockedRelaunch.mockReset();
    mockedSaveStoredWorkspaceState.mockReset();
    mockedListNativeEditorWindowRestoreStates.mockReset();
    mockedListNativeEditorWindowRestoreStates.mockResolvedValue([]);
    mockedSaveStoredWorkspaceState.mockResolvedValue(undefined);
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
});
