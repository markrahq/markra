import { useEffect, useState } from "react";
import {
  defaultFileIgnoreSettings,
  getStoredFileIgnoreSettings,
  type FileIgnoreSettings
} from "../lib/settings/app-settings";
import { listenAppFileIgnoreSettingsChanged } from "../lib/settings/settings-events";

export function useFileIgnoreSettings() {
  const [settings, setSettings] = useState<FileIgnoreSettings>(defaultFileIgnoreSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredFileIgnoreSettings()
      .then((storedSettings) => {
        if (alive) setSettings(storedSettings);
      })
      .catch(() => {
        if (alive) setSettings(defaultFileIgnoreSettings);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppFileIgnoreSettingsChanged((nextSettings) => {
      if (alive) setSettings(nextSettings);
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
