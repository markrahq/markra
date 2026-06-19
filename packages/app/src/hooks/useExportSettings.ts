import { useEffect, useRef, useState } from "react";
import {
  defaultExportSettings,
  getStoredExportSettings,
  type ExportSettings
} from "../lib/settings/app-settings";
import { listenAppExportSettingsChanged } from "../lib/settings/settings-events";

export function useExportSettings() {
  const [settings, setSettings] = useState<ExportSettings>(defaultExportSettings);
  const [loading, setLoading] = useState(true);
  const liveSettingsReceivedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredExportSettings()
      .then((storedSettings) => {
        if (alive && !liveSettingsReceivedRef.current) setSettings(storedSettings);
      })
      .catch(() => {
        if (alive && !liveSettingsReceivedRef.current) setSettings(defaultExportSettings);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppExportSettingsChanged((nextSettings) => {
      if (alive) {
        liveSettingsReceivedRef.current = true;
        setSettings(nextSettings);
      }
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
