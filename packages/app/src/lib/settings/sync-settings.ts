import { clampNumber, normalizeNullableString } from "@markra/shared";

export type SyncProvider = "webdav";

export type WebDavSyncSettings = {
  password: string;
  remotePath: string;
  serverUrl: string;
  username: string;
};

export type SyncSettings = {
  autoSyncOnSave: boolean;
  enabled: boolean;
  intervalMinutes: number;
  lastSyncAt: number | null;
  provider: SyncProvider;
  remotePath: string;
};

export const defaultSyncSettings: SyncSettings = {
  autoSyncOnSave: false,
  enabled: false,
  intervalMinutes: 0,
  lastSyncAt: null,
  provider: "webdav",
  remotePath: ""
};

const syncIntervalMinutesMin = 0;
const syncIntervalMinutesMax = 24 * 60;

export function normalizeSyncSettings(value: unknown): SyncSettings {
  if (typeof value !== "object" || value === null) return { ...defaultSyncSettings };

  const settings = value as Partial<SyncSettings> & { webdav?: Partial<WebDavSyncSettings> };
  const legacyWebDav = typeof settings.webdav === "object" && settings.webdav !== null
    ? settings.webdav
    : {};
  const intervalMinutes = clampNumber(
    settings.intervalMinutes,
    syncIntervalMinutesMin,
    syncIntervalMinutesMax
  );
  const lastSyncAt = clampNumber(settings.lastSyncAt, 0, Number.MAX_SAFE_INTEGER);

  return {
    autoSyncOnSave:
      typeof settings.autoSyncOnSave === "boolean"
        ? settings.autoSyncOnSave
        : defaultSyncSettings.autoSyncOnSave,
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : defaultSyncSettings.enabled,
    intervalMinutes: intervalMinutes === null
      ? defaultSyncSettings.intervalMinutes
      : Math.round(intervalMinutes),
    lastSyncAt: lastSyncAt === null ? null : Math.round(lastSyncAt),
    provider: settings.provider === "webdav" ? "webdav" : defaultSyncSettings.provider,
    remotePath:
      normalizeNullableString(settings.remotePath)?.trim()
      ?? normalizeNullableString(legacyWebDav.remotePath)?.trim()
      ?? defaultSyncSettings.remotePath
  };
}
