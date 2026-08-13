import { useCallback, useEffect, useRef, useState } from "react";
import { setAppLogLevel } from "../lib/app-logger";
import {
  defaultAppLogLevel,
  type AppLogLevel
} from "../lib/log-level";
import {
  getStoredLogLevel,
  saveStoredLogLevel
} from "../lib/settings/app-settings";
import {
  listenAppLogLevelChanged,
  notifyAppLogLevelChanged
} from "../lib/settings/settings-events";

export function useAppLogLevel() {
  const [level, setLevel] = useState<AppLogLevel>(defaultAppLogLevel);
  const liveLevelReceivedRef = useRef(false);

  useEffect(() => {
    let active = true;

    getStoredLogLevel().then((storedLevel) => {
      // A cross-window change can arrive first; a stale disk read must not overwrite it.
      if (!active || liveLevelReceivedRef.current) return;

      setLevel(storedLevel);
      setAppLogLevel(storedLevel);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenAppLogLevelChanged((nextLevel) => {
      liveLevelReceivedRef.current = true;
      setLevel(nextLevel);
      setAppLogLevel(nextLevel);
    }).then((stopListening) => {
      if (!active) {
        stopListening();
        return;
      }

      cleanup = stopListening;
    }).catch(() => {});

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  const selectLevel = useCallback((nextLevel: AppLogLevel) => {
    liveLevelReceivedRef.current = true;
    setLevel(nextLevel);
    setAppLogLevel(nextLevel);

    saveStoredLogLevel(nextLevel)
      .then(() => notifyAppLogLevelChanged(nextLevel))
      .catch(() => {});
  }, []);

  return {
    level,
    selectLevel
  };
}
