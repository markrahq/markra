import { getAppRuntime } from "../../runtime";

export type NativeSettingsWindowTarget = "exportPandocPath";

export type NativeEditorWindowRestoreState = {
  filePath: string | null;
  label: string;
  openFilePaths: string[];
};

export type SetNativeEditorWindowRestoreStateInput = {
  filePath: string | null;
  openFilePaths: string[];
};

export type NativeWindowCloseRequestEvent = {
  preventDefault: () => unknown;
};

export function exitNativeApp() {
  return getAppRuntime().window.exitApp();
}

export function openSettingsWindow(target?: NativeSettingsWindowTarget) {
  return getAppRuntime().window.openSettingsWindow(target);
}

export function listenNativeSettingsWindowTarget(onTarget: (target: NativeSettingsWindowTarget) => unknown) {
  return getAppRuntime().window.listenSettingsWindowTarget(onTarget);
}

export function listenNativeAppExitRequested(onExitRequested: () => unknown | Promise<unknown>) {
  return getAppRuntime().window.listenAppExitRequested(onExitRequested);
}

export function listenNativeWindowCloseRequested(
  onCloseRequested: (event: NativeWindowCloseRequestEvent) => unknown | Promise<unknown>
) {
  return getAppRuntime().window.listenWindowCloseRequested(onCloseRequested);
}

export function openNativeExternalUrl(url: string) {
  return getAppRuntime().window.openExternalUrl(url);
}

export function setNativeWindowTitle(title: string) {
  return getAppRuntime().window.setWindowTitle(title);
}

export function setNativeEditorWindowRestoreState(input: SetNativeEditorWindowRestoreStateInput) {
  return getAppRuntime().window.setEditorWindowRestoreState(input);
}

export function listNativeEditorWindowRestoreStates() {
  return getAppRuntime().window.listEditorWindowRestoreStates();
}

export function closeNativeWindow() {
  return getAppRuntime().window.closeWindow();
}

export function minimizeNativeWindow() {
  return getAppRuntime().window.minimizeWindow();
}

export function toggleNativeWindowMaximized() {
  return getAppRuntime().window.toggleWindowMaximized();
}

export function toggleNativeWindowFullscreen() {
  return getAppRuntime().window.toggleWindowFullscreen();
}
