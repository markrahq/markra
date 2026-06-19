import { useEffect, useRef, useState } from "react";
import {
  defaultEditorPreferences,
  getStoredEditorPreferences,
  type EditorPreferences
} from "../lib/settings/app-settings";
import { listenAppEditorPreferencesChanged } from "../lib/settings/settings-events";

export function useEditorPreferences() {
  const [preferences, setPreferences] = useState<EditorPreferences>(defaultEditorPreferences);
  const [loading, setLoading] = useState(true);
  const livePreferencesReceivedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let stopListening: (() => unknown) | null = null;

    getStoredEditorPreferences()
      .then((storedPreferences) => {
        if (alive && !livePreferencesReceivedRef.current) setPreferences(storedPreferences);
      })
      .catch(() => {
        if (alive && !livePreferencesReceivedRef.current) setPreferences(defaultEditorPreferences);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    listenAppEditorPreferencesChanged((nextPreferences) => {
      if (alive) {
        livePreferencesReceivedRef.current = true;
        setPreferences(nextPreferences);
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
    preferences
  };
}
