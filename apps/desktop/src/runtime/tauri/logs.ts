import { error as logError, info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log";
import { sanitizeDiagnosticDetails, sanitizeDiagnosticText } from "@markra/shared";
import type { AppLogEvent } from "@markra/app/runtime";
import { invokeNative } from "./invoke";

export function isNativeLoggingAvailable() {
  return true;
}

export async function writeNativeLog(event: AppLogEvent) {
  const message = formatNativeLogMessage(event);

  try {
    if (event.level === "error") {
      await logError(message);
      return;
    }

    if (event.level === "warn") {
      await logWarn(message);
      return;
    }

    await logInfo(message);
  } catch {
    // Runtime Log already captured this event; desktop file logging is best-effort.
  }
}

export async function openNativeLogFolder() {
  await invokeNative("open_log_folder");
}

function formatNativeLogMessage(event: AppLogEvent) {
  const header = `[${sanitizeDiagnosticText(event.timestamp)}] ${event.level.toUpperCase()} ${event.area} ${sanitizeDiagnosticText(event.message)}`;
  const details = sanitizeDiagnosticDetails(event.details);
  if (!details || Object.keys(details).length === 0) return header;

  return `${header} ${JSON.stringify(details)}`;
}
