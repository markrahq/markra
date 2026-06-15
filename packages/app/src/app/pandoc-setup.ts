import { openNativeExternalUrl, openSettingsWindow } from "../lib/tauri";

const pandocInstallUrl = "https://pandoc.org/installing.html";

export function isPandocSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /Pandoc export requires Pandoc|Pandoc executable not found|Failed to launch Pandoc/u.test(message);
}

export async function runPandocSetupAction(action: "cancel" | "install" | "setPath") {
  if (action === "install") {
    await openNativeExternalUrl(pandocInstallUrl);
    return;
  }

  if (action === "setPath") {
    await openSettingsWindow("exportPandocPath");
  }
}
