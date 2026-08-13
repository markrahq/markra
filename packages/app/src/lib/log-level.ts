export const appLogLevelOptions = ["debug", "info", "warn", "error"] as const;
export type AppLogLevel = typeof appLogLevelOptions[number];

// Preserve the pre-setting behavior while keeping verbose native command traces opt-in.
export const defaultAppLogLevel: AppLogLevel = "info";

const appLogLevelPriority: Record<AppLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export function isAppLogLevel(value: unknown): value is AppLogLevel {
  return appLogLevelOptions.some((level) => level === value);
}

export function normalizeAppLogLevel(value: unknown): AppLogLevel {
  return isAppLogLevel(value) ? value : defaultAppLogLevel;
}

export function appLogLevelAllows(level: AppLogLevel, minimumLevel: AppLogLevel) {
  return appLogLevelPriority[level] >= appLogLevelPriority[minimumLevel];
}
