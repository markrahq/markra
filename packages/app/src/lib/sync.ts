import {
  saveStoredSyncSettings,
  type SyncSettings,
  type WebDavImageUploadSettings,
  type WebDavSyncSettings
} from "./settings/app-settings";
import {
  syncNativeMarkdownFolder,
  type NativeMarkdownSyncSummary,
  type SyncNativeMarkdownFolderInput
} from "./tauri/file";

type SaveSyncSettings = (settings: SyncSettings) => Promise<unknown> | unknown;
type SyncMarkdownFolder = (input: SyncNativeMarkdownFolderInput) => Promise<NativeMarkdownSyncSummary>;

export type MarkdownSyncSkippedReason = "disabled" | "missing-source" | "missing-webdav";
export type MarkdownSyncResult =
  | {
      reason: MarkdownSyncSkippedReason;
      status: "skipped";
    }
  | {
      settings: SyncSettings;
      status: "synced";
      summary: NativeMarkdownSyncSummary;
    };

export type RunMarkdownSyncOptions = {
  now?: () => number;
  saveSettings?: SaveSyncSettings;
  settings: SyncSettings;
  sourcePath: string | null;
  storageWebDavSettings: WebDavImageUploadSettings;
  syncMarkdownFolder?: SyncMarkdownFolder;
};

function createWebDavSyncSettings(
  syncSettings: SyncSettings,
  storageWebDavSettings: WebDavImageUploadSettings
): WebDavSyncSettings {
  return {
    password: storageWebDavSettings.password,
    remotePath: syncSettings.remotePath,
    serverUrl: storageWebDavSettings.serverUrl,
    username: storageWebDavSettings.username
  };
}

function normalizeConfiguredRemotePath(value: string) {
  return value.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

function webDavSyncConfigured(settings: WebDavSyncSettings) {
  const remotePath = normalizeConfiguredRemotePath(settings.remotePath);

  return Boolean(settings.serverUrl.trim() && remotePath && remotePath !== ".");
}

export async function runMarkdownSync({
  now = Date.now,
  saveSettings = saveStoredSyncSettings,
  settings,
  sourcePath,
  storageWebDavSettings,
  syncMarkdownFolder = syncNativeMarkdownFolder
}: RunMarkdownSyncOptions): Promise<MarkdownSyncResult> {
  if (!settings.enabled) {
    return {
      reason: "disabled",
      status: "skipped"
    };
  }

  const normalizedSourcePath = sourcePath?.trim();
  if (!normalizedSourcePath) {
    return {
      reason: "missing-source",
      status: "skipped"
    };
  }

  const webdav = createWebDavSyncSettings(settings, storageWebDavSettings);
  if (!webDavSyncConfigured(webdav)) {
    return {
      reason: "missing-webdav",
      status: "skipped"
    };
  }

  const summary = await syncMarkdownFolder({
    provider: settings.provider,
    sourcePath: normalizedSourcePath,
    webdav
  });
  const nextSettings = {
    ...settings,
    lastSyncAt: now()
  };
  await saveSettings(nextSettings);

  return {
    settings: nextSettings,
    status: "synced",
    summary
  };
}
