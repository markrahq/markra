import { invoke } from "@tauri-apps/api/core";

export type NativeEditorWindowRestoreState = {
  filePath: string | null;
  label: string;
  openFilePaths: string[];
};

export type SetNativeEditorWindowRestoreStateInput = {
  filePath: string | null;
  openFilePaths: string[];
};

export function openSettingsWindow() {
  return invoke("open_settings_window");
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

export async function closeNativeWindow() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.close();
}

export async function minimizeNativeWindow() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.minimize();
}

export async function toggleNativeWindowMaximized() {
  const currentWindow = await getCurrentNativeWindow();
  await currentWindow?.toggleMaximize();
}
