import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";

type NativeConfirmLabels = {
  cancelLabel: string;
  message: string;
  okLabel: string;
};

export async function confirmNativeAiAgentSessionDelete(sessionTitle: string, labels: NativeConfirmLabels) {
  return confirm(labels.message, {
    cancelLabel: labels.cancelLabel,
    kind: "warning",
    okLabel: labels.okLabel,
    title: sessionTitle
  });
}

export function showNativeAppAbout() {
  return invoke("show_native_app_about");
}

type NativePandocSetupLabels = {
  cancelLabel: string;
  installLabel: string;
  message: string;
  setPathLabel: string;
  title: string;
};

export type NativePandocSetupAction = "cancel" | "install" | "setPath";

export async function showNativePandocSetup(labels: NativePandocSetupLabels): Promise<NativePandocSetupAction> {
  const result = await message(labels.message, {
    buttons: {
      cancel: labels.cancelLabel,
      no: labels.setPathLabel,
      yes: labels.installLabel
    },
    kind: "warning",
    title: labels.title
  });

  if (result === labels.installLabel) return "install";
  if (result === labels.setPathLabel) return "setPath";

  return "cancel";
}
