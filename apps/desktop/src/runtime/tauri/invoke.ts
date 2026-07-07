import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  diagnosticErrorMessage,
  runtimeDiagnosticEvent,
  sanitizeDiagnosticDetails
} from "@markra/shared";

type NativeInvokeArgs = Parameters<typeof tauriInvoke>[1];
type NativeCommandFailureArea = "ai" | "backup" | "file" | "settings" | "storage" | "sync" | "system" | "update";

export async function invokeNative<T>(command: string, args?: NativeInvokeArgs): Promise<T> {
  try {
    // Keep no-arg commands as one-argument calls so the wrapper does not reshape native command boundaries.
    if (args === undefined) {
      return await tauriInvoke<T>(command);
    }

    return await tauriInvoke<T>(command, args);
  } catch (error) {
    const details = nativeCommandFailureDetails(command, args, error);
    dispatchNativeCommandFailureDiagnostic(command, details);
    console.error("[native command failed]", details);
    throw error;
  }
}

function nativeCommandFailureDetails(command: string, args: NativeInvokeArgs | undefined, error: unknown) {
  const rawDetails: Record<string, unknown> = {
    command,
    error: diagnosticErrorMessage(error)
  };
  if (args !== undefined) {
    rawDetails.args = args;
  }

  return sanitizeDiagnosticDetails(rawDetails) ?? {};
}

function dispatchNativeCommandFailureDiagnostic(
  command: string,
  details: ReturnType<typeof nativeCommandFailureDetails>
) {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;

  window.dispatchEvent(new CustomEvent(runtimeDiagnosticEvent, {
    detail: {
      area: nativeCommandFailureArea(command),
      details,
      level: "error",
      message: "Native command failed"
    }
  }));
}

function nativeCommandFailureArea(command: string): NativeCommandFailureArea {
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
