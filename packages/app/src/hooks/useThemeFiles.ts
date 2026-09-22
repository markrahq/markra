import { useCallback, useEffect, useRef, useState } from "react";
import { getAppRuntime, type ThemeDirectory } from "../runtime";
import {
  emptyThemeFiles, getStoredThemeSettings, normalizeThemeSettings, saveStoredThemeSettings,
  themeFilesChangedEvent, type ThemeFileSelection, type ThemeFileSettings
} from "../lib/settings/theme-files";

type ThemeFilesState = ThemeDirectory & {
  customDirectory: string | null;
  css: ThemeFileSelection;
  selection: ThemeFileSelection;
  failedFiles: string[];
  error: boolean;
  loading: boolean;
  ready: boolean;
};

export function useThemeFiles() {
  const runtime = getAppRuntime();
  const themes = runtime.themes;
  const version = useRef(0);
  const mounted = useRef(true);
  const pendingChanges = useRef(0);
  const changeQueue = useRef(Promise.resolve());
  const deferredSettings = useRef<ThemeFileSettings | null>(null);
  const resolvedDirectory = useRef("");
  const settingsRef = useRef<ThemeFileSettings>({ directory: null, selection: emptyThemeFiles });
  const [state, setState] = useState<ThemeFilesState>({
    directory: "", customDirectory: null, files: [], css: emptyThemeFiles, selection: emptyThemeFiles,
    failedFiles: [], error: false, loading: !!themes, ready: !themes
  });

  const reload = useCallback(async (settings = settingsRef.current) => {
    if (!themes) return false;
    const request = ++version.current;
    settingsRef.current = settings;
    const { selection } = settings;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    try {
      const directory = await themes.list(settings.directory);
      const failedFiles: string[] = [];
      const read = async (name: string | null) => {
        if (!name) return null;
        try {
          return await themes.read(name, directory.directory);
        } catch {
          failedFiles.push(name);
          return null;
        }
      };
      const [light, dark] = await Promise.all([read(selection.light), read(selection.dark)]);
      // A refresh or cross-window event can supersede an in-flight disk read.
      if (request !== version.current) return false;
      resolvedDirectory.current = directory.directory;
      setState({ ...directory, customDirectory: settings.directory, css: { light, dark }, selection, failedFiles: [...new Set(failedFiles)],
        error: false, loading: pendingChanges.current > 0, ready: true });
    } catch {
      if (request !== version.current) return false;
      const directory = settings.directory ?? resolvedDirectory.current;
      resolvedDirectory.current = directory;
      setState((previous) => ({ ...previous, directory, files: [],
        customDirectory: settings.directory, selection, css: emptyThemeFiles,
        failedFiles: [], error: true, loading: pendingChanges.current > 0, ready: true }));
    }
    return true;
  }, [themes]);

  useEffect(() => {
    mounted.current = true;
    if (!themes) return () => { mounted.current = false; };
    let active = true;
    let stopListening: (() => unknown) | undefined;
    const initialVersion = version.current;
    getStoredThemeSettings().then((settings) => {
      if (active && initialVersion === version.current) return reload(settings);
    }).catch(() => {
      if (active && initialVersion === version.current) {
        setState((previous) => ({ ...previous, error: true, ready: true, loading: false }));
      }
    });
    if (runtime.events.isAvailable()) {
      runtime.events.listen<ThemeFileSettings>(themeFilesChangedEvent, (event) => {
        if (!active) return;
        const settings = normalizeThemeSettings(event.payload);
        if (pendingChanges.current) deferredSettings.current = settings;
        else reload(settings);
      }).then((cleanup) => {
        if (active) stopListening = cleanup;
        else cleanup();
      }).catch(() => {});
    }
    return () => {
      active = false;
      mounted.current = false;
      version.current++;
      stopListening?.();
    };
  }, [reload, runtime.events, themes]);

  const notify = useCallback(async (settings: ThemeFileSettings) => {
    if (runtime.events.isAvailable()) {
      await runtime.events.emit(themeFilesChangedEvent, settings);
    }
  }, [runtime.events]);

  const refresh = useCallback(async () => {
    if (pendingChanges.current) return;
    const settings = settingsRef.current;
    if (await reload(settings)) await notify(settings).catch(() => {});
  }, [notify, reload]);

  const updateSettings = useCallback((resolve: (current: ThemeFileSettings) => ThemeFileSettings | Promise<ThemeFileSettings>) => {
    pendingChanges.current++;
    version.current++;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    // Serialize user choices; background refreshes must not cancel a source that is being saved.
    const change = changeQueue.current.then(async () => {
      let failed = false;
      try {
        if (!mounted.current) return;
        const settings = await resolve(settingsRef.current);
        if (!mounted.current) return;
        await saveStoredThemeSettings(settings);
        if (mounted.current) await reload(settings);
        await notify(settings).catch(() => {});
      } catch {
        failed = true;
      } finally {
        pendingChanges.current--;
        if (!pendingChanges.current && mounted.current) {
          const deferred = deferredSettings.current;
          deferredSettings.current = null;
          // A successful choice supersedes refreshes received during its validation, save and reload.
          if (failed && deferred) await reload(deferred);
          setState((previous) => ({ ...previous, loading: false, error: failed || previous.error }));
        }
      }
    });
    changeQueue.current = change;
    return change;
  }, [notify, reload]);

  const select = useCallback((appearance: keyof ThemeFileSelection, fileName: string | null) =>
    updateSettings((current) => normalizeThemeSettings({ ...current,
      selection: { ...current.selection, [appearance]: fileName } })), [updateSettings]);

  const openFolder = useCallback(async () => {
    try {
      await themes?.openFolder(settingsRef.current.directory);
    } catch {
      setState((previous) => ({ ...previous, error: true }));
    }
  }, [themes]);

  const changeDirectory = useCallback(async (directory: string | null) => {
    if (!themes) return;
    await updateSettings(async (current) => {
      // Validate before saving so an inaccessible folder leaves the current source intact.
      const catalog = await themes.list(directory);
      return {
        directory: directory === null ? null : catalog.directory,
        selection: catalog.directory === resolvedDirectory.current ? current.selection : emptyThemeFiles
      };
    });
  }, [themes, updateSettings]);

  const chooseFolder = useCallback(async (title: string) => {
    if (!themes) return;
    try {
      const directory = await themes.chooseFolder({ title, ...(state.directory ? { defaultPath: state.directory } : {}) });
      // A confirmed picker result is a new choice, even if background refreshes completed while it was open.
      if (directory !== null && mounted.current) await changeDirectory(directory);
    } catch {
      if (mounted.current) setState((previous) => ({ ...previous, error: true }));
    }
  }, [themes, state.directory, changeDirectory]);

  const resetFolder = useCallback(() => changeDirectory(null), [changeDirectory]);

  return { ...state, available: !!themes, refresh, select, openFolder, chooseFolder, resetFolder };
}
