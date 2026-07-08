import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { diagnosticErrorMessage, t, type AppLanguage } from "@markra/shared";
import { UpdateProgressToast } from "../components/UpdateProgressToast";
import {
  clearDiscoveredAppUpdateVersion,
  setDiscoveredAppUpdateVersion,
  useDiscoveredAppUpdateVersion
} from "../lib/app-update-state";
import { appLogger } from "../lib/app-logger";
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
  currentVersion?: string;
};

function formatUpdateMessage(message: string, update: NativeAppUpdate, progress?: NativeAppUpdateProgress) {
  const progressText = progress?.progress === null || progress?.progress === undefined ? "" : String(progress.progress);

  return message
    .replace("{version}", update.version)
    .replace("{currentVersion}", update.currentVersion)
    .replace("{progress}", progressText);
}

function updateCheckCompletedDetails(update: NativeAppUpdate | null, automatic: boolean) {
  if (!update) {
    return {
      automatic,
      result: "current"
    };
  }

  return {
    automatic,
    currentVersion: update.currentVersion,
    result: "available",
    version: update.version
  };
}

function logUpdateCheckCompleted(update: NativeAppUpdate | null, automatic: boolean) {
  appLogger.info(
    "update",
    automatic ? "Automatic update check completed" : "Manual update check completed",
    updateCheckCompletedDetails(update, automatic)
  );
}

function logUpdateCheckFailed(error: unknown, automatic: boolean) {
  appLogger.warn(
    "update",
    automatic ? "Automatic update check failed" : "Manual update check failed",
    {
      automatic,
      error: diagnosticErrorMessage(error)
    }
  );
}

export function useAutoUpdater(language: AppLanguage, enabled = true, options: AutoUpdaterOptions = {}) {
  const [availableUpdate, setAvailableUpdate] = useState<NativeAppUpdate | null>(null);
  const currentVersion = options.currentVersion;
  const discoveredAppUpdateVersion = useDiscoveredAppUpdateVersion(currentVersion);
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
      setAvailableUpdate((currentUpdate) => currentUpdate?.version === update.version ? null : currentUpdate);
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
      setAvailableUpdate((currentUpdate) => currentUpdate?.version === update.version ? null : currentUpdate);
      clearDiscoveredAppUpdateVersion(update.version);
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

  const installUpdate = useCallback((update: NativeAppUpdate) => {
    if (!enabled) return;

    downloadUpdate(update, { notifyFailure: true });
  }, [downloadUpdate, enabled]);

  const showAvailableUpdate = useCallback((update: NativeAppUpdate, options: { notify: boolean }) => {
    setAvailableUpdate(update);
    setDiscoveredAppUpdateVersion({
      currentVersion: update.currentVersion,
      version: update.version
    });
    if (!options.notify) return;

    showAppToast({
      action: {
        label: t(language, "app.updateInstallAndRestart"),
        onClick: () => {
          installUpdate(update);
        }
      },
      duration: Infinity,
      id: appUpdateToastId,
      message: formatUpdateMessage(t(language, "app.updateAvailable"), update),
      status: "success"
    });
  }, [installUpdate, language]);

  const installAvailableUpdate = useCallback(() => {
    if (!availableUpdate) return;

    installUpdate(availableUpdate);
  }, [availableUpdate, installUpdate]);

  const checkForUpdates = useCallback(async () => {
    if (!enabled || checkingRef.current) return;

    checkingRef.current = true;
    appLogger.info("update", "Manual update check started", { automatic: false });
    showAppToast({
      id: appUpdateToastId,
      message: t(language, "app.updateChecking"),
      status: "loading"
    });

    try {
      const update = await checkNativeAppUpdate();
      if (update) {
        logUpdateCheckCompleted(update, false);
        showAvailableUpdate(update, { notify: true });
        return;
      }

      setAvailableUpdate(null);
      clearDiscoveredAppUpdateVersion();
      logUpdateCheckCompleted(null, false);
      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateCurrent"),
        status: "success"
      });
    } catch (error) {
      logUpdateCheckFailed(error, false);
      showAppToast({
        id: appUpdateToastId,
        message: t(language, "app.updateFailed"),
        status: "error"
      });
    } finally {
      checkingRef.current = false;
    }
  }, [enabled, language, showAvailableUpdate]);

  useEffect(() => {
    if (!autoCheck || !enabled) return;
    let cancelled = false;

    async function checkForUpdatesInBackground() {
      if (checkingRef.current || downloadingRef.current) return;

      checkingRef.current = true;
      appLogger.info("update", "Automatic update check started", { automatic: true });
      try {
        const update = await checkNativeAppUpdate();
        if (cancelled) return;
        if (update) {
          showAvailableUpdate(update, { notify: false });
          logUpdateCheckCompleted(update, true);
        } else {
          setAvailableUpdate(null);
          clearDiscoveredAppUpdateVersion();
          logUpdateCheckCompleted(null, true);
        }
      } catch (error) {
        logUpdateCheckFailed(error, true);
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
  }, [autoCheck, checkIntervalMs, enabled, showAvailableUpdate]);

  return {
    availableUpdate,
    availableUpdateVersion: availableUpdate?.version ?? discoveredAppUpdateVersion,
    checkForUpdates,
    installAvailableUpdate
  };
}
