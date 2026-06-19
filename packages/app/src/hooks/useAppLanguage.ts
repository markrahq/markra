import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredLanguage, saveStoredLanguage, type AppLanguage } from "../lib/settings/app-settings";
import { listenAppLanguageChanged, notifyAppLanguageChanged } from "../lib/settings/settings-events";

function applyAppLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
}

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [ready, setReady] = useState(false);
  const liveLanguageReceivedRef = useRef(false);

  useEffect(() => {
    let active = true;

    getStoredLanguage().then((storedLanguage) => {
      if (!active) return;
      if (liveLanguageReceivedRef.current) {
        setReady(true);
        return;
      }

      setLanguage(storedLanguage);
      applyAppLanguage(storedLanguage);
      setReady(true);
    }).catch(() => {
      if (!active) return;

      applyAppLanguage("en");
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenAppLanguageChanged((nextLanguage) => {
      liveLanguageReceivedRef.current = true;
      setLanguage(nextLanguage);
      applyAppLanguage(nextLanguage);
      setReady(true);
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

  const selectLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    liveLanguageReceivedRef.current = true;
    setReady(true);
    applyAppLanguage(nextLanguage);

    saveStoredLanguage(nextLanguage)
      .then(() => notifyAppLanguageChanged(nextLanguage))
      .catch(() => {});
  }, []);

  return {
    language,
    ready,
    selectLanguage
  };
}
