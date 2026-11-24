import { t, type AppLanguage } from "@markra/shared";
import { showAppToast } from "./app-toast";

export async function copyPathToClipboard(path: string, language: AppLanguage) {
  const copied = await navigator.clipboard?.writeText(path).then(() => true, () => false);
  if (!copied) showAppToast({ message: t(language, "app.copyPathFailed"), status: "error" });
}
