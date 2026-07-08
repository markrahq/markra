import {
  diagnosticErrorMessage,
  runtimeDiagnosticEvent,
  sanitizeDiagnosticDetails,
  sanitizeDiagnosticText,
  stringifyDiagnosticValue,
  type DiagnosticDetailValue
} from "@markra/shared";
import { appLogger, registerAppLogSink, type AppLogArea, type AppLogEvent, type AppLogLevel } from "./app-logger";

export type RuntimeLogLevel = AppLogLevel;
export type RuntimeLogArea = AppLogArea;
type RuntimeLogDetailValue = DiagnosticDetailValue;
export type RuntimeLogEntry = {
  area: RuntimeLogArea;
  details?: Record<string, RuntimeLogDetailValue>;
  id: string;
  level: RuntimeLogLevel;
  message: string;
  timestamp: string;
};

type RuntimeLogEntryInput = {
  area?: RuntimeLogArea;
  details?: Record<string, unknown>;
  level: RuntimeLogLevel;
  message: string;
  timestamp?: string;
};

type RuntimeLogErrorInput = {
  details?: Record<string, unknown>;
  error: unknown;
  message: string;
};

const runtimeLogStorageKey = "markra.runtimeLog.entries";
const runtimeLogChangedEvent = "markra:runtime-log-changed";
const defaultRuntimeLogEntryLimit = 200;
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

registerAppLogSink((event) => {
  appendRuntimeLogEvent(event);
});

function appendRuntimeLogEvent(event: AppLogEvent) {
  return appendRuntimeLogEntry({
    area: event.area,
    details: event.details,
    level: event.level,
    message: event.message,
    timestamp: event.timestamp
  });
}

function appendRuntimeLogEntry(input: RuntimeLogEntryInput) {
  const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
  const entry: RuntimeLogEntry = {
    area: input.area ?? "system",
    details: sanitizeDiagnosticDetails(input.details),
    id: createRuntimeLogEntryId(timestamp),
    level: input.level,
    message: sanitizeDiagnosticText(input.message),
    timestamp: normalizeRuntimeLogTimestamp(timestamp)
  };
  const entries = [...listRuntimeLogEntries(), entry].slice(-defaultRuntimeLogEntryLimit);
  writeRuntimeLogEntries(entries);
  notifyRuntimeLogChanged();

  return entry;
}

function appendRuntimeLogError(input: RuntimeLogErrorInput) {
  return appLogger.error("system", input.message, {
    ...input.details,
    error: diagnosticErrorMessage(input.error)
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
  const handleRuntimeDiagnostic = (event: Event) => {
    const input = runtimeDiagnosticEntryInput(event);
    if (!input) return;

    appLogger.log({
      area: input.area ?? "system",
      details: input.details,
      level: input.level,
      message: input.message
    });
  };
  window.addEventListener(runtimeDiagnosticEvent, handleRuntimeDiagnostic);
  cleanupCallbacks.push(() => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener(runtimeDiagnosticEvent, handleRuntimeDiagnostic);
  });

  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: Parameters<Console["warn"]>) => {
    if (runtimeLogConsoleCaptureDepth === 0) {
      runtimeLogConsoleCaptureDepth += 1;
      try {
        appLogger.warn("system", "Console warning", {
          arguments: stringifyDiagnosticValue(args.length === 1 ? args[0] : args)
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
        appLogger.error("system", "Console error", {
          arguments: stringifyDiagnosticValue(args.length === 1 ? args[0] : args)
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

  return [...entries].reverse().map(formatRuntimeLogEntry).join("\n");
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
  const details = entry.details && Object.keys(entry.details).length > 0
    ? ` ${JSON.stringify(entry.details)}`
    : "";

  return `${header}${details}`;
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
    details: sanitizeDiagnosticDetails(candidate.details),
    id: candidate.id,
    level: candidate.level,
    message: sanitizeDiagnosticText(candidate.message),
    timestamp: candidate.timestamp
  };
}

function runtimeDiagnosticEntryInput(event: Event): RuntimeLogEntryInput | null {
  const detail = "detail" in event ? (event as CustomEvent<unknown>).detail : null;
  if (!isRuntimeDiagnosticRecord(detail)) return null;

  const message = typeof detail.message === "string" && detail.message.trim()
    ? detail.message
    : "Runtime diagnostic";
  const details = isRuntimeDiagnosticDetails(detail.details) ? detail.details : undefined;

  return {
    area: isRuntimeLogArea(detail.area) ? detail.area : "system",
    details,
    level: isRuntimeLogLevel(detail.level) ? detail.level : "info",
    message
  };
}

function isRuntimeDiagnosticRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeDiagnosticDetails(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeLogArea(value: unknown): value is RuntimeLogArea {
  return runtimeLogAreas.some((area) => area === value);
}

function isRuntimeLogLevel(value: unknown): value is RuntimeLogLevel {
  return value === "error" || value === "info" || value === "warn";
}

function releaseRuntimeLogCapture() {
  runtimeLogCaptureInstallCount = Math.max(0, runtimeLogCaptureInstallCount - 1);
  if (runtimeLogCaptureInstallCount > 0) return;

  installedRuntimeLogCaptureCleanup?.();
}
