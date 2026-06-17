import type { AppDialogRuntime } from "@markra/app/runtime";
import { confirmWithBrowser } from "./browser";
import type { WebRuntimeOptions } from "./types";

export function createWebDialogRuntime(options: WebRuntimeOptions): AppDialogRuntime {
  const confirm = options.confirm ?? confirmWithBrowser;

  return {
    confirmAiAgentSessionDelete: async (_sessionTitle, labels) => confirm(labels.message),
    showAppAbout: async () => undefined,
    showPandocSetup: async () => "cancel"
  };
}
