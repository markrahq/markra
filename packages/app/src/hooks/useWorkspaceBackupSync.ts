import { useCallback, useEffect, useMemo, useRef } from "react";
import { debug, type I18nKey } from "@markra/shared";
import { showAppToast } from "../lib/app-toast";
import { runMarkdownBackup } from "../lib/backup";
import { runMarkdownSync } from "../lib/sync";
import type {
  BackupSettings,
  EditorPreferences,
  SyncSettings
} from "../lib/settings/app-settings";
import {
  notifyAppBackupSettingsChanged,
  notifyAppSyncSettingsChanged
} from "../lib/settings/settings-events";

type SettingsState<TSettings> = {
  loading: boolean;
  settings: TSettings;
};

type EditorPreferencesState = {
  loading: boolean;
  preferences: EditorPreferences;
};

type WorkspaceBackupSyncInput = {
  backupSettings: SettingsState<BackupSettings>;
  editorPreferences: EditorPreferencesState;
  syncSettings: SettingsState<SyncSettings>;
  translate: (key: I18nKey) => string;
};

export function useWorkspaceBackupSync({
  backupSettings,
  editorPreferences,
  syncSettings,
  translate
}: WorkspaceBackupSyncInput) {
  const backupRunningRef = useRef(false);
  const sourcePathRef = useRef<string | null>(null);
  const syncRunningRef = useRef(false);

  const setSourcePath = useCallback((sourcePath: string | null) => {
    sourcePathRef.current = sourcePath;
  }, []);

  const runWorkspaceBackup = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (backupRunningRef.current || backupSettings.loading) return null;

    backupRunningRef.current = true;
    try {
      const result = await runMarkdownBackup({
        settings: backupSettings.settings,
        sourcePath: sourcePathRef.current
      });

      if (result.status === "backed-up") {
        await notifyAppBackupSettingsChanged(result.settings);
        if (!silent) {
          showAppToast({
            id: "backup",
            message: translate("settings.backup.completed"),
            status: "success"
          });
        }
      } else if (!silent) {
        showAppToast({
          id: "backup",
          message: translate(
            result.reason === "missing-source"
              ? "settings.backup.missingSource"
              : "settings.backup.missingTarget"
          ),
          status: "error"
        });
      }

      return result;
    } catch (error) {
      debug(() => ["[markra-backup] backup failed", {
        error: error instanceof Error ? error.message : String(error)
      }]);
      if (!silent) {
        showAppToast({
          id: "backup",
          message: translate("settings.backup.failed"),
          status: "error"
        });
      }
      return null;
    } finally {
      backupRunningRef.current = false;
    }
  }, [backupSettings.loading, backupSettings.settings, translate]);

  const runWorkspaceSync = useCallback(async ({
    silent = false,
    sourcePath = sourcePathRef.current
  }: {
    silent?: boolean;
    sourcePath?: string | null;
  } = {}) => {
    if (syncRunningRef.current || syncSettings.loading || editorPreferences.loading) return null;

    // Acquire the guard first so repeated manual shortcuts cannot replace the active sync toast.
    syncRunningRef.current = true;
    if (!silent) {
      showAppToast({
        id: "sync",
        message: translate("settings.sync.running"),
        status: "loading"
      });
    }
    try {
      const result = await runMarkdownSync({
        settings: syncSettings.settings,
        sourcePath,
        storageWebDavSettings: editorPreferences.preferences.imageUpload.webdav
      });

      if (result.status === "synced") {
        await notifyAppSyncSettingsChanged(result.settings);
        if (!silent) {
          showAppToast({
            id: "sync",
            message: translate("settings.sync.completed"),
            status: "success"
          });
        }
      } else if (!silent) {
        showAppToast({
          id: "sync",
          message: translate(
            result.reason === "missing-source"
              ? "settings.sync.missingSource"
              : "settings.sync.missingWebDav"
          ),
          status: "error"
        });
      }

      return result;
    } catch (error) {
      debug(() => ["[markra-sync] sync failed", {
        error: error instanceof Error ? error.message : String(error)
      }]);
      if (!silent) {
        showAppToast({
          id: "sync",
          message: translate("settings.sync.failed"),
          status: "error"
        });
      }
      return null;
    } finally {
      syncRunningRef.current = false;
    }
  }, [
    editorPreferences.loading,
    editorPreferences.preferences.imageUpload.webdav,
    syncSettings.loading,
    syncSettings.settings,
    translate
  ]);

  const beforeNativeAppExitBackup = useCallback(async () => {
    if (!backupSettings.settings.backupOnExit) return;

    await runWorkspaceBackup({ silent: true });
  }, [backupSettings.settings.backupOnExit, runWorkspaceBackup]);

  const backupStatusLabel = useMemo(() => {
    if (backupSettings.settings.lastBackupAt === null) return null;

    return `${translate("settings.backup.lastBackup")} ${new Intl.DateTimeFormat(undefined, {
      timeStyle: "short"
    }).format(new Date(backupSettings.settings.lastBackupAt))}`;
  }, [backupSettings.settings.lastBackupAt, translate]);

  const syncStatusLabel = useMemo(() => {
    if (syncSettings.settings.lastSyncAt === null) return null;

    return `${translate("settings.sync.lastSync")} ${new Intl.DateTimeFormat(undefined, {
      timeStyle: "short"
    }).format(new Date(syncSettings.settings.lastSyncAt))}`;
  }, [syncSettings.settings.lastSyncAt, translate]);

  useEffect(() => {
    if (backupSettings.loading) return;
    if (backupSettings.settings.intervalMinutes <= 0) return;
    if (!backupSettings.settings.targetPath.trim()) return;

    const intervalMs = backupSettings.settings.intervalMinutes * 60 * 1000;
    const intervalId = window.setInterval(() => {
      runWorkspaceBackup({ silent: true }).catch(() => {});
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    backupSettings.loading,
    backupSettings.settings.intervalMinutes,
    backupSettings.settings.targetPath,
    runWorkspaceBackup
  ]);

  useEffect(() => {
    if (syncSettings.loading) return;
    if (editorPreferences.loading) return;
    if (!syncSettings.settings.enabled) return;
    if (syncSettings.settings.intervalMinutes <= 0) return;
    if (!editorPreferences.preferences.imageUpload.webdav.serverUrl.trim()) return;
    if (!syncSettings.settings.remotePath.trim()) return;

    const intervalMs = syncSettings.settings.intervalMinutes * 60 * 1000;
    const intervalId = window.setInterval(() => {
      runWorkspaceSync({ silent: true }).catch(() => {});
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    runWorkspaceSync,
    editorPreferences.loading,
    editorPreferences.preferences.imageUpload.webdav.serverUrl,
    syncSettings.loading,
    syncSettings.settings.enabled,
    syncSettings.settings.intervalMinutes,
    syncSettings.settings.remotePath
  ]);

  return {
    backupStatusLabel,
    beforeNativeAppExitBackup,
    runWorkspaceBackup,
    runWorkspaceSync,
    setSourcePath,
    syncStatusLabel
  };
}
