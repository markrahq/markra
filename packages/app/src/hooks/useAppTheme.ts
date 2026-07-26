import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  appAppearanceModeOptions,
  getStoredCustomThemeCss,
  getStoredThemePreferences,
  defaultCustomThemeCssValues,
  defaultAppThemePreferences,
  darkEditorThemeOptions,
  lightEditorThemeOptions,
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
const startupThemeStyleElementId = "markra-startup-theme-style";
const startupAppearanceModeParam = "startupAppearanceMode";
const startupLightThemeParam = "startupLightTheme";
const startupDarkThemeParam = "startupDarkTheme";

function getSystemTheme(): ResolvedAppTheme {
  if (typeof window.matchMedia !== "function") return "light";

  return window.matchMedia(systemDarkThemeQuery).matches ? "dark" : "light";
}

function removeCustomThemeCss() {
  document.getElementById(customThemeStyleElementId)?.remove();
}

function removeStartupThemeCss() {
  document.getElementById(startupThemeStyleElementId)?.remove();
  document.documentElement.style.removeProperty("background-color");
  document.documentElement.style.removeProperty("color-scheme");
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
  removeStartupThemeCss();

  const activeCustomCss = resolvedTheme === "dark" ? customThemeCss.dark : customThemeCss.light;

  if (theme === "custom" && activeCustomCss.trim()) {
    applyCustomThemeCss(activeCustomCss);
    return;
  }

  removeCustomThemeCss();
}

function isAppAppearanceMode(value: string | null): value is AppAppearanceMode {
  return appAppearanceModeOptions.includes(value as AppAppearanceMode);
}

function isLightEditorTheme(value: string | null): value is LightEditorTheme {
  return lightEditorThemeOptions.includes(value as LightEditorTheme);
}

function isDarkEditorTheme(value: string | null): value is DarkEditorTheme {
  return darkEditorThemeOptions.includes(value as DarkEditorTheme);
}

function startupThemePreferencesFromLocation(): AppThemePreferences | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const appearanceMode = params.get(startupAppearanceModeParam);
  const lightTheme = params.get(startupLightThemeParam);
  const darkTheme = params.get(startupDarkThemeParam);

  if (!isAppAppearanceMode(appearanceMode) || !isLightEditorTheme(lightTheme) || !isDarkEditorTheme(darkTheme)) {
    return null;
  }

  return normalizeAppThemePreferences({
    appearanceMode,
    darkTheme,
    lightTheme
  });
}

export function useAppTheme() {
  const startupThemePreferencesRef = useRef<AppThemePreferences | null>(startupThemePreferencesFromLocation());
  const [themePreferences, setThemePreferences] = useState<AppThemePreferences>(
    () => startupThemePreferencesRef.current ?? defaultAppThemePreferences
  );
  const [customThemeCss, setCustomThemeCss] = useState<CustomThemeCssValues>(defaultCustomThemeCssValues);
  const [systemTheme, setSystemTheme] = useState<ResolvedAppTheme>(() => getSystemTheme());
  const [themePreferencesReady, setThemePreferencesReady] = useState(() => startupThemePreferencesRef.current !== null);
  const [customThemeCssReady, setCustomThemeCssReady] = useState(false);
  const liveCustomThemeCssReceivedRef = useRef(false);
  const liveThemePreferencesReceivedRef = useRef(false);
  const editorTheme = resolveAppThemePreferencesEditorTheme(themePreferences, systemTheme);
  const resolvedTheme = resolveAppThemePreferencesAppearance(themePreferences, systemTheme);
  const customThemeEnabled = themePreferences.customThemeEnabled === true;
  const ready = themePreferencesReady && (editorTheme !== "custom" || customThemeCssReady);

  useEffect(() => {
    let active = true;

    getStoredThemePreferences().then((storedPreferences) => {
      if (active && !liveThemePreferencesReceivedRef.current) setThemePreferences(storedPreferences);
    }).catch(() => {}).finally(() => {
      if (active) setThemePreferencesReady(true);
    });

    getStoredCustomThemeCss().then((storedCss) => {
      if (active && !liveCustomThemeCssReceivedRef.current) setCustomThemeCss(storedCss);
    }).catch(() => {}).finally(() => {
      if (active) setCustomThemeCssReady(true);
    });

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

  useLayoutEffect(() => {
    applyAppTheme(editorTheme, resolvedTheme, customThemeCss);
  }, [customThemeCss, editorTheme, resolvedTheme]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | null = null;

    listenAppThemeChanged((nextPreferences) => {
      if (active) {
        liveThemePreferencesReceivedRef.current = true;
        setThemePreferences(nextPreferences);
        setThemePreferencesReady(true);
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
        setCustomThemeCssReady(true);
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
    setThemePreferencesReady(true);
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

  // The custom swatches mirror the global switch; keep the saved palettes so turning custom off restores them.
  const selectLightTheme = useCallback((lightTheme: LightEditorTheme) => {
    updateThemePreferences({
      ...themePreferences,
      customThemeEnabled: lightTheme === "custom",
      ...(lightTheme === "custom" ? {} : { lightTheme })
    });
  }, [themePreferences, updateThemePreferences]);

  const selectDarkTheme = useCallback((darkTheme: DarkEditorTheme) => {
    updateThemePreferences({
      ...themePreferences,
      customThemeEnabled: darkTheme === "custom",
      ...(darkTheme === "custom" ? {} : { darkTheme })
    });
  }, [themePreferences, updateThemePreferences]);

  const toggleTheme = useCallback(() => {
    updateThemePreferences({
      ...themePreferences,
      appearanceMode: resolvedTheme === "dark" ? "light" : "dark"
    });
  }, [resolvedTheme, themePreferences, updateThemePreferences]);

  const toggleCustomTheme = useCallback(() => {
    updateThemePreferences({
      ...themePreferences,
      customThemeEnabled: !customThemeEnabled
    });
  }, [customThemeEnabled, themePreferences, updateThemePreferences]);

  const updateCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      [resolvedTheme]: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    setCustomThemeCssReady(true);
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss, resolvedTheme]);

  const updateLightCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      light: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    setCustomThemeCssReady(true);
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss]);

  const updateDarkCustomThemeCss = useCallback((nextCss: string) => {
    const normalizedCss = normalizeCustomThemeCssValues({
      ...customThemeCss,
      dark: normalizeCustomThemeCss(nextCss)
    });

    setCustomThemeCss(normalizedCss);
    liveCustomThemeCssReceivedRef.current = true;
    setCustomThemeCssReady(true);
    saveStoredCustomThemeCss(normalizedCss).then(() => notifyAppCustomThemeCssChanged(normalizedCss)).catch(() => {});
  }, [customThemeCss]);

  return {
    customThemeCss,
    customThemeEnabled,
    darkCustomThemeCss: customThemeCss.dark,
    editorTheme,
    appearanceMode: themePreferences.appearanceMode,
    darkTheme: themePreferences.darkTheme,
    lightCustomThemeCss: customThemeCss.light,
    lightTheme: themePreferences.lightTheme,
    ready,
    resolvedTheme,
    selectAppearanceMode,
    selectDarkTheme,
    selectLightTheme,
    themePreferences,
    toggleCustomTheme,
    toggleTheme,
    updateCustomThemeCss,
    updateDarkCustomThemeCss,
    updateLightCustomThemeCss
  };
}
