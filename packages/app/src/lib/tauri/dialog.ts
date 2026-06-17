import { getAppRuntime } from "../../runtime";

type NativeConfirmLabels = {
  cancelLabel: string;
  message: string;
  okLabel: string;
};

export function confirmNativeAiAgentSessionDelete(sessionTitle: string, labels: NativeConfirmLabels) {
  return getAppRuntime().dialog.confirmAiAgentSessionDelete(sessionTitle, labels);
}

export function showNativeAppAbout() {
  return getAppRuntime().dialog.showAppAbout();
}

type NativePandocSetupLabels = {
  cancelLabel: string;
  installLabel: string;
  message: string;
  setPathLabel: string;
  title: string;
};

export type NativePandocSetupAction = "cancel" | "install" | "setPath";

export function showNativePandocSetup(labels: NativePandocSetupLabels): Promise<NativePandocSetupAction> {
  return getAppRuntime().dialog.showPandocSetup(labels);
}
