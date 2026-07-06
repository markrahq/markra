type RuntimeLogLevel = "error" | "info" | "warn";
type RuntimeLogArea =
  | "ai"
  | "backup"
  | "editor"
  | "file"
  | "settings"
  | "storage"
  | "sync"
  | "system"
  | "update";
type RuntimeLogDetailValue = boolean | number | string | null;
export type RuntimeLogEntry = {
  area: RuntimeLogArea;
  details?: Record<string, RuntimeLogDetailValue>;
  id: string;
  level: RuntimeLogLevel;
  message: string;
  timestamp: string;
};

type RuntimeLogEntryInput = {
  details?: Record<string, unknown>;
  level: RuntimeLogLevel;
  message: string;
};

type RuntimeLogErrorInput = {
  details?: Record<string, unknown>;
  error: unknown;
  message: string;
};

const runtimeLogStorageKey = "markra.runtimeLog.entries";
const runtimeLogChangedEvent = "markra:runtime-log-changed";
const defaultRuntimeLogEntryLimit = 200;
const runtimeLogDetailTextLimit = 1200;
const redactedValue = "[redacted]";
const sensitiveDetailKeyPattern = /(?:authorization|endpoint|host|key|password|path|secret|token|url|user)/iu;
const urlPattern = /https?:\/\/[^\s]+/giu;
const absolutePathPattern = /(?:\/Users|\/home|\/private|[A-Za-z]:\\)[^\s]+/gu;
const runtimeLogAreas = [
  "ai",
  "backup",
  "editor",
  "file",
  "settings",
  "storage",
  "sync",
  "system",
  "update"
] as const;

let runtimeLogIdCounter = 0;
let runtimeLogCaptureInstallCount = 0;
let runtimeLogConsoleCaptureDepth = 0;
let installedRuntimeLogCaptureCleanup: (() => unknown) | null = null;

function appendRuntimeLogEntry(input: RuntimeLogEntryInput) {
  const timestamp = new Date();
  const entry: RuntimeLogEntry = {
    area: "system",
    details: sanitizeRuntimeLogDetails(input.details),
    id: createRuntimeLogEntryId(timestamp),
    level: input.level,
    message: sanitizeRuntimeLogText(input.message),
    timestamp: normalizeRuntimeLogTimestamp(timestamp)
  };
  const entries = [...listRuntimeLogEntries(), entry].slice(-defaultRuntimeLogEntryLimit);
  writeRuntimeLogEntries(entries);
  notifyRuntimeLogChanged();

  return entry;
}

function appendRuntimeLogError(input: RuntimeLogErrorInput) {
  return appendRuntimeLogEntry({
    details: {
      ...input.details,
      error: runtimeLogErrorMessage(input.error)
    },
    level: "error",
    message: input.message
  });
}

export function installRuntimeLogCapture() {
  if (typeof window === "undefined") return () => {};

  runtimeLogCaptureInstallCount += 1;
  if (installedRuntimeLogCaptureCleanup) return releaseRuntimeLogCapture;

  const cleanupCallbacks: Array<() => unknown> = [];

  const handleError = (event: ErrorEvent) => {
    appendRuntimeLogError({
      details: {
        column: event.colno,
        filename: event.filename,
        line: event.lineno
      },
      error: event.error ?? event.message,
      message: "Unhandled runtime error"
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    appendRuntimeLogError({
      error: event.reason,
      message: "Unhandled promise rejection"
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  cleanupCallbacks.push(() => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  });

  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: Parameters<Console["warn"]>) => {
    if (runtimeLogConsoleCaptureDepth === 0) {
      runtimeLogConsoleCaptureDepth += 1;
      try {
        appendRuntimeLogEntry({
          details: {
            arguments: stringifyRuntimeLogValue(args.length === 1 ? args[0] : args)
          },
          level: "warn",
          message: "Console warning"
        });
      } finally {
        runtimeLogConsoleCaptureDepth -= 1;
      }
    }

    return originalWarn.apply(console, args);
  };
  console.error = (...args: Parameters<Console["error"]>) => {
    if (runtimeLogConsoleCaptureDepth === 0) {
      runtimeLogConsoleCaptureDepth += 1;
      try {
        appendRuntimeLogEntry({
          details: {
            arguments: stringifyRuntimeLogValue(args.length === 1 ? args[0] : args)
          },
          level: "error",
          message: "Console error"
        });
      } finally {
        runtimeLogConsoleCaptureDepth -= 1;
      }
    }

    return originalError.apply(console, args);
  };
  cleanupCallbacks.push(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  installedRuntimeLogCaptureCleanup = () => {
    for (const cleanup of [...cleanupCallbacks].reverse()) cleanup();
    installedRuntimeLogCaptureCleanup = null;
  };

  return releaseRuntimeLogCapture;
}

export function listRuntimeLogEntries(): RuntimeLogEntry[] {
  const storage = getRuntimeLogStorage();
  if (!storage) return [];

  try {
    const rawEntries = storage.getItem(runtimeLogStorageKey);
    if (!rawEntries) return [];

    const parsedEntries = JSON.parse(rawEntries) as unknown;
    if (!Array.isArray(parsedEntries)) return [];

    return parsedEntries.flatMap((entry) => {
      const normalizedEntry = normalizeRuntimeLogEntry(entry);

      return normalizedEntry ? [normalizedEntry] : [];
    });
  } catch {
    return [];
  }
}

export function clearRuntimeLogEntries() {
  const storage = getRuntimeLogStorage();
  if (storage) {
    try {
      storage.removeItem(runtimeLogStorageKey);
    } catch {
      // Ignore storage failures; the panel can still show the current in-memory state.
    }
  }
  notifyRuntimeLogChanged();
}

export function formatRuntimeLogEntries(entries: readonly RuntimeLogEntry[]) {
  if (entries.length === 0) return "";

  return entries.map(formatRuntimeLogEntry).join("\n\n");
}

export function listenRuntimeLogEntriesChanged(listener: () => unknown) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === runtimeLogStorageKey) listener();
  };
  window.addEventListener(runtimeLogChangedEvent, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(runtimeLogChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function formatRuntimeLogEntry(entry: RuntimeLogEntry) {
  const header = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.area} ${entry.message}`;
  const detailLines = Object.entries(entry.details ?? {}).map(([key, value]) => `${key}: ${String(value)}`);

  return [header, ...detailLines].join("\n");
}

function writeRuntimeLogEntries(entries: readonly RuntimeLogEntry[]) {
  const storage = getRuntimeLogStorage();
  if (!storage) return;

  try {
    storage.setItem(runtimeLogStorageKey, JSON.stringify(entries));
  } catch {
    // If localStorage is full or unavailable, avoid breaking the user action that produced the log.
  }
}

function getRuntimeLogStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyRuntimeLogChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(runtimeLogChangedEvent));
}

function createRuntimeLogEntryId(now: Date) {
  runtimeLogIdCounter += 1;

  return `runtime-log-${now.getTime()}-${runtimeLogIdCounter}`;
}

function normalizeRuntimeLogTimestamp(value: Date) {
  return Number.isFinite(value.getTime()) ? value.toISOString() : new Date().toISOString();
}

function normalizeRuntimeLogEntry(value: unknown): RuntimeLogEntry | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Partial<RuntimeLogEntry>;
  if (!isRuntimeLogArea(candidate.area)) return null;
  if (!isRuntimeLogLevel(candidate.level)) return null;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.message !== "string" || !candidate.message.trim()) return null;
  if (typeof candidate.timestamp !== "string" || !candidate.timestamp.trim()) return null;

  return {
    area: candidate.area,
    details: sanitizeRuntimeLogDetails(candidate.details),
    id: candidate.id,
    level: candidate.level,
    message: sanitizeRuntimeLogText(candidate.message),
    timestamp: candidate.timestamp
  };
}

function isRuntimeLogArea(value: unknown): value is RuntimeLogArea {
  return runtimeLogAreas.some((area) => area === value);
}

function isRuntimeLogLevel(value: unknown): value is RuntimeLogLevel {
  return value === "error" || value === "info" || value === "warn";
}

function runtimeLogErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim() || error.name;

    return sanitizeRuntimeLogText(message);
  }

  if (typeof error === "string") return sanitizeRuntimeLogText(error);

  return stringifyRuntimeLogValue(error);
}

function releaseRuntimeLogCapture() {
  runtimeLogCaptureInstallCount = Math.max(0, runtimeLogCaptureInstallCount - 1);
  if (runtimeLogCaptureInstallCount > 0) return;

  installedRuntimeLogCaptureCleanup?.();
}

function sanitizeRuntimeLogDetails(details: RuntimeLogEntryInput["details"]) {
  if (!details) return undefined;

  const sanitizedDetails: Record<string, RuntimeLogDetailValue> = {};
  for (const [key, value] of Object.entries(details)) {
    sanitizedDetails[key] = sensitiveDetailKeyPattern.test(key)
      ? redactedValue
      : sanitizeRuntimeLogValue(value);
  }

  return sanitizedDetails;
}

function sanitizeRuntimeLogValue(value: unknown): RuntimeLogDetailValue {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeRuntimeLogText(value);

  return stringifyRuntimeLogValue(value);
}

function sanitizeRuntimeLogText(value: string) {
  return limitRuntimeLogText(value
    .replace(urlPattern, redactedValue)
    .replace(absolutePathPattern, redactedValue)
    .trim());
}

function stringifyRuntimeLogValue(value: unknown): string {
  if (typeof value === "string") return sanitizeRuntimeLogText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;

  const seen = new WeakSet<object>();

  try {
    const serialized = JSON.stringify(value, (key, currentValue) => {
      if (key && sensitiveDetailKeyPattern.test(key)) return redactedValue;
      if (currentValue instanceof Error) {
        return {
          message: runtimeLogErrorMessage(currentValue),
          name: sanitizeRuntimeLogText(currentValue.name)
        };
      }
      if (typeof currentValue === "string") return sanitizeRuntimeLogText(currentValue);
      if (typeof currentValue === "bigint") return currentValue.toString();
      if (typeof currentValue === "function") return `[function ${currentValue.name || "anonymous"}]`;
      if (typeof currentValue === "symbol") return currentValue.toString();
      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) return "[circular]";
        seen.add(currentValue);
      }

      return currentValue;
    });

    return limitRuntimeLogText(serialized ?? String(value));
  } catch {
    return sanitizeRuntimeLogText(String(value));
  }
}

function limitRuntimeLogText(value: string) {
  return value.length > runtimeLogDetailTextLimit
    ? `${value.slice(0, runtimeLogDetailTextLimit)}...[truncated]`
    : value;
}
