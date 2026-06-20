import { createElement, useCallback, useEffect, useRef } from "react";
import { t, type AppLanguage } from "@markra/shared";
import { UpdateProgressToast } from "../components/UpdateProgressToast";
import { showAppToast } from "../lib/app-toast";
import { checkNativeAppUpdate, type NativeAppUpdate, type NativeAppUpdateProgress } from "../lib/tauri/updater";

const appUpdateToastId = "app-update-toast";
const defaultAutoUpdateCheckIntervalMs = 6 * 60 * 60 * 1000;

export type AutoUpdaterOptions = {
  autoCheck?: boolean;
  beforeRestart?: () => unknown | Promise<unknown>;
  checkIntervalMs?: number;
  confirmInstall?: () => boolean | Promise<boolean>;
  confirmRestart?: () => boolean | Promise<boolean>;
};

function formatUpdateMessage(message: string, update: NativeAppUpdate, progress?: NativeAppUpdateProgress) {
  const progressText = progress?.progress === null || progress?.progress === undefined ? "" : String(progress.progress);

  return message
    .replace("{version}", update.version)
    .replace("{currentVersion}", update.currentVersion)
    .replace("{progress}", progressText);
}

export function useAutoUpdater(language: AppLanguage, enabled = true, options: AutoUpdaterOptions = {}) {
  const checkingRef = useRef(false);
  const downloadingRef = useRef(false);
  const downloadedUpdateRef = useRef<NativeAppUpdate | null>(null);
  const autoCheck = options.autoCheck ?? true;
  const beforeRestart = options.beforeRestart;
  const checkIntervalMs = options.checkIntervalMs ?? defaultAutoUpdateCheckIntervalMs;
  const confirmInstall = options.confirmInstall;
  const confirmRestart = options.confirmRestart;

  const restartUpdate = useCallback(async (update: NativeAppUpdate) => {
    try {
      await beforeRestart?.();
      const canRestart = await (confirmRestart ?? confirmInstall)?.();
      if (canRestart === false) return;

      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateRestarting"),
        status: "loading"
      });
      await update.restart();
    } catch {
      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateFailed"),
        status: "error"
      });
    }
  }, [beforeRestart, confirmInstall, confirmRestart, language]);

  const showReadyToRestart = useCallback((update: NativeAppUpdate) => {
    downloadedUpdateRef.current = update;
    showAppToast({
      action: {
        label: t(language, "app.updateRestartNow"),
        onClick: () => {
          restartUpdate(update);
        }
      },
      duration: Infinity,
      id: appUpdateToastId,
      message: formatUpdateMessage(t(language, "app.updateReadyToRestart"), update),
      status: "success"
    });
  }, [language, restartUpdate]);

  const showDownloadProgress = useCallback((update: NativeAppUpdate, progress: NativeAppUpdateProgress) => {
    const key = progress.progress === null ? "app.updateDownloading" : "app.updateDownloadingProgress";
    const message = formatUpdateMessage(t(language, key), update, progress);

    showAppToast({
      id: appUpdateToastId,
      message: createElement(UpdateProgressToast, {
        message,
        progress: progress.progress
      }),
      status: "loading"
    });
  }, [language]);

  const downloadUpdate = useCallback(async (update: NativeAppUpdate, options: { notifyFailure: boolean }) => {
    if (downloadingRef.current) return;
    if (downloadedUpdateRef.current?.version === update.version) {
      showReadyToRestart(downloadedUpdateRef.current);
      return;
    }

    downloadingRef.current = true;
    try {
      showDownloadProgress(update, {
        contentLength: null,
        downloaded: 0,
        progress: null
      });
      await update.downloadAndInstall({
        onProgress: (progress) => showDownloadProgress(update, progress)
      });
      showReadyToRestart(update);
    } catch {
      if (options.notifyFailure) {
        showAppToast({
          id: appUpdateToastId,
          message: t(language, "app.updateFailed"),
          status: "error"
        });
      }
    } finally {
      downloadingRef.current = false;
    }
  }, [showDownloadProgress, showReadyToRestart, language]);

  const checkForUpdates = useCallback(async () => {
    if (!enabled || checkingRef.current) return;

    checkingRef.current = true;
    showAppToast({
      id: appUpdateToastId,
      message: t(language, "app.updateChecking"),
      status: "loading"
    });

    try {
      const update = await checkNativeAppUpdate();
      if (update) {
        await downloadUpdate(update, { notifyFailure: true });
        return;
      }

      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateCurrent"),
        status: "success"
      });
    } catch {
      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateFailed"),
        status: "error"
      });
    } finally {
      checkingRef.current = false;
    }
  }, [downloadUpdate, enabled, language]);

  useEffect(() => {
    if (!autoCheck || !enabled) return;
    let cancelled = false;

    async function checkForUpdatesInBackground() {
      if (checkingRef.current || downloadingRef.current) return;

      checkingRef.current = true;
      try {
        const update = await checkNativeAppUpdate();
        if (!cancelled && update) await downloadUpdate(update, { notifyFailure: false });
      } catch {
        // Background update checks should not interrupt normal app usage.
      } finally {
        checkingRef.current = false;
      }
    }

    checkForUpdatesInBackground();
    const interval = window.setInterval(checkForUpdatesInBackground, checkIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [autoCheck, checkIntervalMs, downloadUpdate, enabled]);

  return {
    checkForUpdates
  };
}
