import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoredCustomThemeCss,
  getStoredThemePreferences,
  defaultCustomThemeCssValues,
  defaultAppThemePreferences,
  normalizeAppThemePreferences,
  normalizeCustomThemeCssValues,
  normalizeCustomThemeCss,
  resolveAppThemePreferencesAppearance,
  resolveAppThemePreferencesEditorTheme,
  saveStoredCustomThemeCss,
  saveStoredThemePreferences,
  type AppAppearanceMode,
  type AppThemePreferences,
  type CustomThemeCssValues,
  type DarkEditorTheme,
  type EditorTheme,
  type LightEditorTheme,
  type ResolvedAppTheme
} from "../lib/settings/app-settings";
import {
  listenAppCustomThemeCssChanged,
  listenAppThemeChanged,
  notifyAppCustomThemeCssChanged,
  notifyAppThemeChanged
} from "../lib/settings/settings-events";

const systemDarkThemeQuery = "(prefers-color-scheme: dark)";
const customThemeStyleElementId = "markra-custom-theme-style";

function getSystemTheme(): ResolvedAppTheme {
  if (typeof window.matchMedia !== "function") return "light";

  return window.matchMedia(systemDarkThemeQuery).matches ? "dark" : "light";
}

function removeCustomThemeCss() {
  document.getElementById(customThemeStyleElementId)?.remove();
}

function applyCustomThemeCss(css: string) {
  let style = document.getElementById(customThemeStyleElementId) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = customThemeStyleElementId;
    style.dataset.markraCustomTheme = "true";
    document.head.append(style);
  }

  style.textContent = css;
}

function applyAppTheme(theme: EditorTheme, resolvedTheme: ResolvedAppTheme, customThemeCss: CustomThemeCssValues) {
  // Keep the root attribute as the single switch for theme-scoped CSS variables.
  document.documentElement.dataset.theme = theme;

  const activeCustomCss = resolvedTheme === "dark" ? customThemeCss.dark : customThemeCss.light;

  if (theme === "custom" && activeCustomCss.trim()) {
    applyCustomThemeCss(activeCustomCss);
    return;
  }

  removeCustomThemeCss();
}

export function useAppTheme() {
  const [themePreferences, setThemePreferences] = useState<AppThemePreferences>(defaultAppThemePreferences);
  const [customThemeCss, setCustomThemeCss] = useState<CustomThemeCssValues>(defaultCustomThemeCssValues);
  const [systemTheme, setSystemTheme] = useState<ResolvedAppTheme>(() => getSystemTheme());
  const liveCustomThemeCssReceivedRef = useRef(false);
  const liveThemePreferencesReceivedRef = useRef(false);
  const editorTheme = resolveAppThemePreferencesEditorTheme(themePreferences, systemTheme);
  const resolvedTheme = resolveAppThemePreferencesAppearance(themePreferences, systemTheme);

  useEffect(() => {
    let active = true;

    getStoredThemePreferences().then((storedPreferences) => {
      if (active && !liveThemePreferencesReceivedRef.current) setThemePreferences(storedPreferences);
    }).catch(() => {});

    getStoredCustomThemeCss().then((storedCss) => {
      if (active && !liveCustomThemeCssReceivedRef.current) setCustomThemeCss(storedCss);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(systemDarkThemeQuery);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    applyAppTheme(editorTheme, resolvedTheme, customThemeCss);
  }, [customThemeCss, editorTheme, resolvedTheme]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenAppThemeChanged((nextPreferences) => {
      if (active) {
        liveThemePreferencesReceivedRef.current = true;
        setThemePreferences(nextPreferences);
      }
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

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenAppCustomThemeCssChanged((nextCss) => {
      if (active) {
        liveCustomThemeCssReceivedRef.current = true;
        setCustomThemeCss(nextCss);
      }
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

  const updateThemePreferences = useCallback((nextPreferences: AppThemePreferences) => {
    const normalizedPreferences = normalizeAppThemePreferences(nextPreferences);

    setThemePreferences(normalizedPreferences);
    liveThemePreferencesReceivedRef.current = true;
    saveStoredThemePreferences(normalizedPreferences)
      .then(() => notifyAppThemeChanged(normalizedPreferences))
      .catch(() => {});
  }, []);

  const selectAppearanceMode = useCallback((appearanceMode: AppAppearanceMode) => {
    updateThemePreferences({
      ...themePreferences,
      appearanceMode
    });
  }, [themePreferences, updateThemePreferences]);

  const selectLightTheme = useCallback((lightTheme: LightEditorTheme) => {
    updateThemePreferences({
      ...themePreferences,
      lightTheme
    });
  }, [themePreferences, updateThemePreferences]);

  const selectDarkTheme = useCallback((darkTheme: DarkEditorTheme) => {
    updateThemePreferences({
      ...themePreferences,
      darkTheme
    });
  }, [themePreferences, updateThemePreferences]);

  const toggleTheme = useCallback(() => {
    updateThemePreferences({
      ...themePreferences,
      appearanceMode: resolvedTheme === "dark" ? "light" : "dark"
    });
  }, [resolvedTheme, themePreferences, updateThemePreferences]);

  const updateCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      [resolvedTheme]: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss, resolvedTheme]);

  const updateLightCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      light: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss]);

  const updateDarkCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      dark: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss]);

  return {
    customThemeCss,
    darkCustomThemeCss: customThemeCss.dark,
    editorTheme,
    appearanceMode: themePreferences.appearanceMode,
    darkTheme: themePreferences.darkTheme,
    lightCustomThemeCss: customThemeCss.light,
    lightTheme: themePreferences.lightTheme,
    resolvedTheme,
    selectAppearanceMode,
    selectDarkTheme,
    selectLightTheme,
    themePreferences,
    toggleTheme,
    updateCustomThemeCss,
    updateDarkCustomThemeCss,
    updateLightCustomThemeCss
  };
}
