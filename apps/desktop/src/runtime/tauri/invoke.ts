import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type NativeInvokeArgs = Parameters<typeof tauriInvoke>[1];

export async function invokeNative<T>(command: string, args?: NativeInvokeArgs): Promise<T> {
  try {
    // Keep no-arg commands as one-argument calls so the wrapper does not reshape native command boundaries.
    if (args === undefined) {
      return await tauriInvoke<T>(command);
    }

    return await tauriInvoke<T>(command, args);
  } catch (error) {
    console.error("[native command failed]", { command, error });
    throw error;
  }
}
