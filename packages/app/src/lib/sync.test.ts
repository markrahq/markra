import type { SyncSettings, WebDavImageUploadSettings } from "./settings/app-settings";
import { runMarkdownSync } from "./sync";

function syncSettings(patch: Partial<SyncSettings> = {}): SyncSettings {
  return {
    autoSyncOnSave: false,
    enabled: false,
    intervalMinutes: 0,
    lastSyncAt: null,
    provider: "webdav",
    remotePath: "",
    ...patch
  };
}

function storageWebDavSettings(patch: Partial<WebDavImageUploadSettings> = {}): WebDavImageUploadSettings {
  return {
    password: "",
    publicBaseUrl: "",
    serverUrl: "",
    uploadPath: "",
    username: "",
    ...patch
  };
}

describe("markdown sync", () => {
  it("skips when sync is disabled or not configured", async () => {
    const saveSettings = vi.fn();
    const syncMarkdownFolder = vi.fn();

    await expect(runMarkdownSync({
      now: () => 123,
      saveSettings,
      settings: syncSettings(),
      sourcePath: "/mock-notes",
      storageWebDavSettings: storageWebDavSettings(),
      syncMarkdownFolder
    })).resolves.toEqual({
      reason: "disabled",
      status: "skipped"
    });

    await expect(runMarkdownSync({
      now: () => 123,
      saveSettings,
      settings: syncSettings({ enabled: true }),
      sourcePath: null,
      storageWebDavSettings: storageWebDavSettings(),
      syncMarkdownFolder
    })).resolves.toEqual({
      reason: "missing-source",
      status: "skipped"
    });

    await expect(runMarkdownSync({
      now: () => 123,
      saveSettings,
      settings: syncSettings({ enabled: true }),
      sourcePath: "/mock-notes",
      storageWebDavSettings: storageWebDavSettings({
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/"
      }),
      syncMarkdownFolder
    })).resolves.toEqual({
      reason: "missing-webdav",
      status: "skipped"
    });

    await expect(runMarkdownSync({
      now: () => 123,
      saveSettings,
      settings: syncSettings({
        enabled: true,
        remotePath: "notes"
      }),
      sourcePath: "/mock-notes",
      storageWebDavSettings: storageWebDavSettings(),
      syncMarkdownFolder
    })).resolves.toEqual({
      reason: "missing-webdav",
      status: "skipped"
    });

    await expect(runMarkdownSync({
      now: () => 123,
      saveSettings,
      settings: syncSettings({
        enabled: true,
        remotePath: "/"
      }),
      sourcePath: "/mock-notes",
      storageWebDavSettings: storageWebDavSettings({
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/"
      }),
      syncMarkdownFolder
    })).resolves.toEqual({
      reason: "missing-webdav",
      status: "skipped"
    });

    expect(syncMarkdownFolder).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("runs WebDAV sync and persists the latest sync time", async () => {
    const summary = {
      bytesDownloaded: 8,
      bytesUploaded: 12,
      conflictFiles: 1,
      downloadedFiles: 1,
      scannedFiles: 3,
      skippedFiles: 1,
      uploadedFiles: 1
    };
    const saveSettings = vi.fn();
    const syncMarkdownFolder = vi.fn().mockResolvedValue(summary);
    const settings = syncSettings({
      enabled: true,
      remotePath: "notes"
    });
    const storageSettings = storageWebDavSettings({
      password: "secret",
      serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
      username: "ada"
    });

    await expect(runMarkdownSync({
      now: () => 1_700_000_000_000,
      saveSettings,
      settings,
      sourcePath: "/mock-notes",
      storageWebDavSettings: storageSettings,
      syncMarkdownFolder
    })).resolves.toEqual({
      settings: {
        ...settings,
        lastSyncAt: 1_700_000_000_000
      },
      status: "synced",
      summary
    });

    expect(syncMarkdownFolder).toHaveBeenCalledWith({
      provider: "webdav",
      sourcePath: "/mock-notes",
      webdav: {
        password: "secret",
        remotePath: "notes",
        serverUrl: "https://dav.example.test/remote.php/dav/files/ada/",
        username: "ada"
      }
    });
    expect(saveSettings).toHaveBeenCalledWith({
      ...settings,
      lastSyncAt: 1_700_000_000_000
    });
  });
});
