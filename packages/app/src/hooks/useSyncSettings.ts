import { useEffect, useState } from "react";
import {
  defaultSyncSettings,
  getStoredSyncSettings,
  type SyncSettings
} from "../lib/settings/app-settings";
import { listenAppSyncSettingsChanged } from "../lib/settings/settings-events";

export function useSyncSettings() {
  const [settings, setSettings] = useState<SyncSettings>(defaultSyncSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredSyncSettings()
      .then((storedSettings) => {
        if (alive) setSettings(storedSettings);
      })
      .catch(() => {
        if (alive) setSettings(defaultSyncSettings);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppSyncSettingsChanged((nextSettings) => {
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
