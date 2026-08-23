import { Channel, invoke } from "@tauri-apps/api/core";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getStoredNetworkSettings, saveStoredWorkspaceState } from "@markra/app/settings";
import { listNativeEditorWindowRestoreStates } from "./window";

const localUpdaterProxyUrls = [
  "http://127.0.0.1:7890",
  "http://127.0.0.1:7897",
  "http://127.0.0.1:1087",
  "http://127.0.0.1:10809",
  "http://127.0.0.1:6152"
] as const;

export type NativeAppUpdateProgress = {
  contentLength: number | null;
  downloaded: number;
  progress: number | null;
};

export type NativeAppUpdate = {
  body?: string;
  currentVersion: string;
  date?: string;
  downloadAndInstall: (callbacks?: { onProgress?: (progress: NativeAppUpdateProgress) => unknown }) => Promise<unknown>;
  restart: () => Promise<unknown>;
  version: string;
};

type NativePortableUpdateMetadata = {
  body?: string;
  currentVersion: string;
  date?: string;
  version: string;
};

type NativePortableDownloadEvent = DownloadEvent;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function checkWithLocalProxyFallback() {
  const proxies = await updaterProxyUrls();

  for (const proxy of proxies) {
    try {
      return await check({ proxy });
    } catch {
      // Local proxies are optional; fall through to the next candidate or direct check.
    }
  }

  return check();
}

async function checkPortableWithLocalProxyFallback() {
  const proxies = await updaterProxyUrls();

  for (const proxy of proxies) {
    try {
      return await invoke<NativePortableUpdateMetadata | null>("check_portable_app_update", { proxy });
    } catch {
      // Local proxies are optional; fall through to the next candidate or direct check.
    }
  }

  return invoke<NativePortableUpdateMetadata | null>("check_portable_app_update");
}

async function updaterProxyUrls() {
  try {
    const settings = await getStoredNetworkSettings();
    const configuredProxy = settings.proxyEnabled ? settings.proxyUrl.trim() : "";
    if (!configuredProxy) return [...localUpdaterProxyUrls];

    return [configuredProxy, ...localUpdaterProxyUrls.filter((proxy) => proxy !== configuredProxy)];
  } catch {
    return [...localUpdaterProxyUrls];
  }
}

function resolveProgress(downloaded: number, contentLength: number | null) {
  if (!contentLength || contentLength <= 0) return null;

  return Math.min(100, Math.round((downloaded / contentLength) * 100));
}

function emitProgress({
  contentLength,
  downloaded,
  onProgress
}: {
  contentLength: number | null;
  downloaded: number;
  onProgress?: (progress: NativeAppUpdateProgress) => unknown;
}) {
  onProgress?.({
    contentLength,
    downloaded,
    progress: resolveProgress(downloaded, contentLength)
  });
}

async function persistEditorWindowRestoreSnapshot() {
  try {
    const openWindows = await listNativeEditorWindowRestoreStates();
    await saveStoredWorkspaceState({ openWindows });
  } catch {
    // Relaunching for an installed update should not be blocked by opportunistic restore state.
  }
}

function createProgressListener(onProgress?: (progress: NativeAppUpdateProgress) => unknown) {
  let contentLength: number | null = null;
  let downloaded = 0;

  return (event: DownloadEvent) => {
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? null;
      downloaded = 0;
      emitProgress({ contentLength, downloaded, onProgress });
      return;
    }

    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      emitProgress({ contentLength, downloaded, onProgress });
      return;
    }

    if (event.event === "Finished") {
      if (contentLength !== null) downloaded = contentLength;
      emitProgress({ contentLength, downloaded, onProgress });
    }
  };
}

async function checkNativePortableAppUpdate(): Promise<NativeAppUpdate | null> {
  const update = await checkPortableWithLocalProxyFallback();
  if (!update) return null;

  return {
    ...update,
    async downloadAndInstall(callbacks = {}) {
      const onEvent = new Channel<NativePortableDownloadEvent>(createProgressListener(callbacks.onProgress));
      await invoke("download_portable_app_update", { onEvent });
    },
    async restart() {
      await persistEditorWindowRestoreSnapshot();
      await invoke("restart_portable_app_update");
    }
  };
}

export async function checkNativeAppUpdate(): Promise<NativeAppUpdate | null> {
  if (!isTauriRuntime()) return null;

  if (await invoke<boolean>("is_native_portable_app")) {
    return checkNativePortableAppUpdate();
  }

  const update = await checkWithLocalProxyFallback();
  if (!update) return null;

  return {
    body: update.body,
    currentVersion: update.currentVersion,
    date: update.date,
    async downloadAndInstall(callbacks = {}) {
      await update.downloadAndInstall(createProgressListener(callbacks.onProgress));
    },
    async restart() {
      await persistEditorWindowRestoreSnapshot();
      await relaunch();
    },
    version: update.version
  };
}
