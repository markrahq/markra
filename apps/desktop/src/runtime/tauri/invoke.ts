import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { diagnosticErrorMessage } from "@markra/shared";
import { appLogger, type AppLogArea } from "@markra/app/runtime";

type NativeInvokeArgs = Parameters<typeof tauriInvoke>[1];
const nativeCommandErrorFileNamePattern = /\b[\w.-]+\.(?:docx?|gif|html|jpe?g|markdown|md|pdf|png|pptx?|svg|txt|webp|xlsx?)\b/giu;

export async function invokeNative<T>(command: string, args?: NativeInvokeArgs): Promise<T> {
  const startedAt = Date.now();
  const area = nativeCommandArea(command);
  const details = nativeCommandDetails(command, args);
  appLogger.info(area, "Native command started", details);

  try {
    // Keep no-arg commands as one-argument calls so the wrapper does not reshape native command boundaries.
    const result = args === undefined
      ? await tauriInvoke<T>(command)
      : await tauriInvoke<T>(command, args);

    appLogger.info(area, "Native command completed", {
      ...details,
      durationMs: Math.max(0, Date.now() - startedAt)
    });

    return result;
  } catch (error) {
    appLogger.error(area, "Native command failed", {
      ...details,
      error: nativeCommandErrorMessage(error)
    });
    throw error;
  }
}

function nativeCommandErrorMessage(error: unknown) {
  return diagnosticErrorMessage(error).replace(nativeCommandErrorFileNamePattern, "[file]");
}

function nativeCommandDetails(command: string, args: NativeInvokeArgs | undefined) {
  const argumentKeys = nativeCommandArgumentKeys(args);

  return {
    ...(argumentKeys ? { argumentKeys } : {}),
    command,
    hasArgs: args !== undefined
  };
}

function nativeCommandArgumentKeys(args: NativeInvokeArgs | undefined) {
  if (args === undefined || typeof args !== "object" || args === null || Array.isArray(args)) return null;

  // Native payloads may include document text, credentials, paths, or clipboard data; only log the shape.
  const keys = Object.keys(args).sort();

  return keys.length > 0 ? keys.join(",") : null;
}

function nativeCommandArea(command: string): AppLogArea {
  if (command.includes("sync")) return "sync";
  if (command.includes("backup")) return "backup";
  if (command.includes("update")) return "update";
  if (command.includes("s3") || command.includes("picgo") || command.includes("webdav_image")) return "storage";
  if (command.startsWith("request_ai") || command.startsWith("request_native_chat") || command.includes("_acp_")) {
    return "ai";
  }
  if (command.includes("settings") || command.includes("shell_command")) return "settings";
  if (
    command.includes("clipboard")
    || command.includes("file")
    || command.includes("folder")
    || command.includes("image")
    || command.includes("markdown")
    || command.includes("pandoc")
  ) {
    return "file";
  }

  return "system";
}
