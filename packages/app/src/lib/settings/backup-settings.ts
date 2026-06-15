import { clampNumber, normalizeNullableString } from "@markra/shared";

export type BackupSettings = {
  backupOnExit: boolean;
  intervalMinutes: number;
  lastBackupAt: number | null;
  targetPath: string;
};

export const defaultBackupSettings: BackupSettings = {
  backupOnExit: false,
  intervalMinutes: 0,
  lastBackupAt: null,
  targetPath: ""
};

const backupIntervalMinutesMin = 0;
const backupIntervalMinutesMax = 24 * 60;

export function normalizeBackupSettings(value: unknown): BackupSettings {
  if (typeof value !== "object" || value === null) return { ...defaultBackupSettings };

  const settings = value as Partial<BackupSettings>;
  const intervalMinutes = clampNumber(
    settings.intervalMinutes,
    backupIntervalMinutesMin,
    backupIntervalMinutesMax
  );
  const lastBackupAt = clampNumber(settings.lastBackupAt, 0, Number.MAX_SAFE_INTEGER);

  return {
    backupOnExit:
      typeof settings.backupOnExit === "boolean"
        ? settings.backupOnExit
        : defaultBackupSettings.backupOnExit,
    intervalMinutes: intervalMinutes === null
      ? defaultBackupSettings.intervalMinutes
      : Math.round(intervalMinutes),
    lastBackupAt: lastBackupAt === null ? null : Math.round(lastBackupAt),
    targetPath: normalizeNullableString(settings.targetPath)?.trim() ?? defaultBackupSettings.targetPath
  };
}
