import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { listenNativeEvent, safeNativeEventCleanup } from "./events";

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

type NativeSettingsWindowTargetPayload = {
  target?: unknown;
};

const nativeSettingsWindowTargetEvent = "markra://settings-window-target";
const nativeAppExitRequestedEvent = "markra://app-exit-requested";

function isNativeSettingsWindowTarget(value: unknown): value is NativeSettingsWindowTarget {
  return value === "exportPandocPath";
}

export function openSettingsWindow(target?: NativeSettingsWindowTarget) {
  return invoke("open_settings_window", {
    target: target ?? null
  });
}

export function prewarmSettingsWindow() {
  return invoke("prewarm_settings_window");
}

export function markSettingsWindowReady() {
  return invoke("mark_settings_window_ready");
}

export function hideSettingsWindow() {
  return invoke("hide_settings_window");
}

export async function listenNativeSettingsWindowTarget(onTarget: (target: NativeSettingsWindowTarget) => unknown) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }

  return listenNativeEvent<NativeSettingsWindowTargetPayload>(nativeSettingsWindowTargetEvent, (event) => {
    if (isNativeSettingsWindowTarget(event.payload.target)) {
      onTarget(event.payload.target);
    }
  });
}

export async function listenNativeAppExitRequested(onExitRequested: () => unknown | Promise<unknown>) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }

  return listenNativeEvent(nativeAppExitRequestedEvent, () => onExitRequested());
}

export function openNativeExternalUrl(url: string) {
  if (!("__TAURI_INTERNALS__" in window)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  }

  return invoke("open_external_url", { url });
}

export async function setNativeWindowTitle(title: string) {
  window.document.title = title;

  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

async function getCurrentNativeWindow() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return null;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function getCurrentNativeWindowLabel() {
  return (await getCurrentNativeWindow())?.label ?? null;
}

function normalizeNativeEditorWindowRestoreStates(value: unknown): NativeEditorWindowRestoreState[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];

    const candidate = item as Partial<NativeEditorWindowRestoreState>;
    const label = candidate.label?.trim();
    const trimmedFilePath = typeof candidate.filePath === "string" ? candidate.filePath.trim() : "";
    const filePath = trimmedFilePath
      ? trimmedFilePath
      : null;
    const openFilePaths = Array.isArray(candidate.openFilePaths)
      ? candidate.openFilePaths.flatMap((path) => {
        if (typeof path !== "string") return [];

        const trimmedPath = path.trim();
        return trimmedPath ? [trimmedPath] : [];
      })
      : [];

    if (!label || (!filePath && openFilePaths.length === 0)) return [];

    return [{
      filePath,
      label,
      openFilePaths
    }];
  });
}

export async function setNativeEditorWindowRestoreState(input: SetNativeEditorWindowRestoreStateInput) {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  await invoke("set_editor_window_restore_state", input);
}

export async function listNativeEditorWindowRestoreStates() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return [];
  }

  return normalizeNativeEditorWindowRestoreStates(await invoke("list_editor_window_restore_states"));
}

export async function exitNativeApp() {
  if (!("__TAURI_INTERNALS__" in window)) {
    window.close();
    return;
  }

  await exit(0);
}

export async function listenNativeWindowCloseRequested(
  onCloseRequested: (event: NativeWindowCloseRequestEvent) => unknown | Promise<unknown>
) {
  const currentWindow = await getCurrentNativeWindow();
  if (!currentWindow) return () => {};

  return safeNativeEventCleanup(await currentWindow.onCloseRequested(async (event) => {
    await onCloseRequested({
      preventDefault: () => event.preventDefault()
    });
  }));
}

export async function closeNativeWindow() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.close();
}

export async function destroyNativeWindow() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.destroy();
}

export async function minimizeNativeWindow() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return;
  }

  await invoke("minimize_current_window");
}

export async function showNativeWindow() {
  const currentWindow = await getCurrentNativeWindow();
  if (!currentWindow) return;

  if (!(await currentWindow.isVisible())) {
    await currentWindow.show();
  }
  try {
    await currentWindow.setFocus();
  } catch {
    // Focusing is best-effort; showing the window is the startup-critical action.
  }
}

export async function toggleNativeWindowMaximized() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.toggleMaximize();
}

export async function toggleNativeWindowFullscreen() {
  const currentWindow = await getCurrentNativeWindow();
  if (!currentWindow) return;

  await currentWindow.setFullscreen(!(await currentWindow.isFullscreen()));
}
