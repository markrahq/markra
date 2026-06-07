import { useEffect, useState } from "react";
import {
  defaultBackupSettings,
  getStoredBackupSettings,
  type BackupSettings
} from "../lib/settings/app-settings";
import { listenAppBackupSettingsChanged } from "../lib/settings/settings-events";

export function useBackupSettings() {
  const [settings, setSettings] = useState<BackupSettings>(defaultBackupSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredBackupSettings()
      .then((storedSettings) => {
        if (alive) setSettings(storedSettings);
      })
      .catch(() => {
        if (alive) setSettings(defaultBackupSettings);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppBackupSettingsChanged((nextSettings) => {
      if (!alive) return;

      setSettings(nextSettings);
      setLoading(false);
    }).then((cleanup) => {
      if (!alive) {
        cleanup();
        return;
      }

      stopListening = cleanup;
    });

    return () => {
      alive = false;
      stopListening?.();
    };
  }, []);

  return {
    loading,
    settings
  };
}
