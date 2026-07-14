import { act, renderHook } from "@testing-library/react";
import { showAppToast } from "../lib/app-toast";
import { runMarkdownSync } from "../lib/sync";
import {
  defaultBackupSettings,
  defaultEditorPreferences,
  defaultSyncSettings
} from "../lib/settings/app-settings";
import { notifyAppSyncSettingsChanged } from "../lib/settings/settings-events";
import { useWorkspaceBackupSync } from "./useWorkspaceBackupSync";

vi.mock("../lib/app-toast", () => ({
  showAppToast: vi.fn()
}));

vi.mock("../lib/sync", () => ({
  runMarkdownSync: vi.fn()
}));

vi.mock("../lib/settings/settings-events", () => ({
  notifyAppBackupSettingsChanged: vi.fn(),
  notifyAppSyncSettingsChanged: vi.fn()
}));

const mockedRunMarkdownSync = vi.mocked(runMarkdownSync);
const mockedShowAppToast = vi.mocked(showAppToast);
const mockedNotifyAppSyncSettingsChanged = vi.mocked(notifyAppSyncSettingsChanged);

const syncedSettings = {
  ...defaultSyncSettings,
  enabled: true,
  lastSyncAt: 1_700_000_000_000
};

const syncedResult = {
  settings: syncedSettings,
  status: "synced" as const,
  summary: {
    bytesDownloaded: 0,
    bytesUploaded: 0,
    conflictFiles: 0,
    downloadedFiles: 0,
    scannedFiles: 1,
    skippedFiles: 0,
    uploadedFiles: 1
  }
};

function createDeferred<T>() {
  let resolve: (value: T) => unknown = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

function renderWorkspaceBackupSync() {
  return renderHook(() => useWorkspaceBackupSync({
    backupSettings: {
      loading: false,
      settings: defaultBackupSettings
    },
    editorPreferences: {
      loading: false,
      preferences: defaultEditorPreferences
    },
    syncSettings: {
      loading: false,
      settings: {
        ...defaultSyncSettings,
        enabled: true
      }
    },
    translate: (key) => key
  }));
}

describe("useWorkspaceBackupSync", () => {
  beforeEach(() => {
    mockedRunMarkdownSync.mockReset();
    mockedShowAppToast.mockReset();
    mockedNotifyAppSyncSettingsChanged.mockReset();
  });

  it("shows progress and completion feedback for a manual sync", async () => {
    const pending = createDeferred<typeof syncedResult>();
    mockedRunMarkdownSync.mockReturnValue(pending.promise);
    const { result } = renderWorkspaceBackupSync();

    act(() => {
      result.current.setSourcePath("/mock-notes/note.md");
    });

    let runPromise: Promise<unknown> | null = null;
    act(() => {
      runPromise = result.current.runWorkspaceSync();
    });

    expect(mockedShowAppToast).toHaveBeenNthCalledWith(1, {
      id: "sync",
      message: "settings.sync.running",
      status: "loading"
    });

    let repeatedResult: unknown = "not-run";
    await act(async () => {
      repeatedResult = await result.current.runWorkspaceSync();
    });
    expect(repeatedResult).toBeNull();
    expect(mockedRunMarkdownSync).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(syncedResult);
      await runPromise;
    });

    expect(mockedNotifyAppSyncSettingsChanged).toHaveBeenCalledWith(syncedSettings);
    expect(mockedShowAppToast).toHaveBeenNthCalledWith(2, {
      id: "sync",
      message: "settings.sync.completed",
      status: "success"
    });
  });

  it("keeps automatic sync feedback silent", async () => {
    mockedRunMarkdownSync.mockResolvedValue(syncedResult);
    const { result } = renderWorkspaceBackupSync();

    await act(async () => {
      await result.current.runWorkspaceSync({
        silent: true,
        sourcePath: "/mock-notes/note.md"
      });
    });

    expect(mockedShowAppToast).not.toHaveBeenCalled();
  });

  it("replaces manual progress feedback with the existing failure message", async () => {
    mockedRunMarkdownSync.mockRejectedValue(new Error("Synthetic sync failure"));
    const { result } = renderWorkspaceBackupSync();

    await act(async () => {
      await result.current.runWorkspaceSync({
        sourcePath: "/mock-notes/note.md"
      });
    });

    expect(mockedShowAppToast).toHaveBeenNthCalledWith(1, {
      id: "sync",
      message: "settings.sync.running",
      status: "loading"
    });
    expect(mockedShowAppToast).toHaveBeenNthCalledWith(2, {
      id: "sync",
      message: "settings.sync.failed",
      status: "error"
    });
  });
});
