import {
  sanitizeDiagnosticDetails,
  sanitizeDiagnosticText,
  type DiagnosticDetailValue
} from "@markra/shared";

export type AppLogLevel = "error" | "info" | "warn";
export type AppLogArea =
  | "ai"
  | "backup"
  | "editor"
  | "file"
  | "settings"
  | "storage"
  | "sync"
  | "system"
  | "update";

export type AppLogEvent = {
  area: AppLogArea;
  details?: Record<string, DiagnosticDetailValue>;
  level: AppLogLevel;
  message: string;
  timestamp: string;
};

export type AppLogInput = {
  area: AppLogArea;
  details?: Record<string, unknown>;
  level: AppLogLevel;
  message: string;
};

export type AppLogWriter = (event: AppLogEvent) => Promise<unknown> | unknown;

type AppLogSink = (event: AppLogEvent) => unknown;

const appLogSinks = new Set<AppLogSink>();
let appLogBackendWriter: AppLogWriter | null = null;
let appLogBackendDispatchDepth = 0;

export const appLogger = {
  error(area: AppLogArea, message: string, details?: Record<string, unknown>) {
    return logAppEvent({ area, details, level: "error", message });
  },
  info(area: AppLogArea, message: string, details?: Record<string, unknown>) {
    return logAppEvent({ area, details, level: "info", message });
  },
  log(input: AppLogInput) {
    return logAppEvent(input);
  },
  warn(area: AppLogArea, message: string, details?: Record<string, unknown>) {
    return logAppEvent({ area, details, level: "warn", message });
  }
};

export function logAppEvent(input: AppLogInput) {
  const event = sanitizeAppLogEvent(input);
  dispatchAppLogSinks(event);
  dispatchAppLogBackend(event);

  return event;
}

export function registerAppLogSink(sink: AppLogSink) {
  appLogSinks.add(sink);

  return () => {
    appLogSinks.delete(sink);
  };
}

export function setAppLogBackendWriter(writer: AppLogWriter | null) {
  appLogBackendWriter = writer;
}

export function resetAppLogBackendWriterForTests() {
  appLogBackendWriter = null;
}

function sanitizeAppLogEvent(input: AppLogInput): AppLogEvent {
  return {
    area: input.area,
    details: sanitizeDiagnosticDetails(input.details),
    level: input.level,
    message: sanitizeDiagnosticText(input.message),
    timestamp: new Date().toISOString()
  };
}

function dispatchAppLogSinks(event: AppLogEvent) {
  for (const sink of appLogSinks) {
    try {
      sink(event);
    } catch {
      // Logging must never break the user action that produced the log.
    }
  }
}

function dispatchAppLogBackend(event: AppLogEvent) {
  const writer = appLogBackendWriter;
  if (!writer) return;
  if (appLogBackendDispatchDepth > 0) return;

  try {
    appLogBackendDispatchDepth += 1;
    const result = writer(event);
    // Only guard the synchronous writer call. Holding this across async file writes would
    // drop unrelated log events that happen while the previous backend write is still pending.
    if (isPromiseLike(result)) {
      result.catch(() => undefined);
    }
  } catch {
    // Runtime Log already received the event; backend failures should stay non-fatal.
  } finally {
    releaseAppLogBackendDispatch();
  }
}

function releaseAppLogBackendDispatch() {
  appLogBackendDispatchDepth = Math.max(0, appLogBackendDispatchDepth - 1);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  if (typeof value !== "object" || value === null) return false;

  return typeof (value as { catch?: unknown }).catch === "function";
}
