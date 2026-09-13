import { useCallback, useEffect, useRef, useState } from "react";
import { getAppRuntime, type ThemeDirectory } from "../runtime";
import {
  emptyThemeFiles, getStoredThemeFiles, normalizeThemeFiles, saveStoredThemeFiles,
  themeFilesChangedEvent, type ThemeFileSelection
} from "../lib/settings/theme-files";

type ThemeFilesState = ThemeDirectory & {
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
  const selectionRef = useRef(emptyThemeFiles);
  const [state, setState] = useState<ThemeFilesState>({
    directory: "", files: [], css: emptyThemeFiles, selection: emptyThemeFiles,
    failedFiles: [], error: false, loading: !!themes, ready: !themes
  });

  const reload = useCallback(async (selection = selectionRef.current) => {
    if (!themes) return;
    const request = ++version.current;
    selectionRef.current = selection;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    try {
      const directory = await themes.list();
      const failedFiles: string[] = [];
      const read = async (name: string | null) => {
        if (!name) return null;
        try {
          return await themes.read(name);
        } catch {
          failedFiles.push(name);
          return null;
        }
      };
      const [light, dark] = await Promise.all([read(selection.light), read(selection.dark)]);
      // A refresh or cross-window event can supersede an in-flight disk read.
      if (request !== version.current) return;
      setState({ ...directory, css: { light, dark }, selection, failedFiles: [...new Set(failedFiles)],
        error: false, loading: false, ready: true });
    } catch {
      if (request !== version.current) return;
      setState((previous) => ({ ...previous, selection, css: emptyThemeFiles,
        failedFiles: [], error: true, loading: false, ready: true }));
    }
  }, [themes]);

  useEffect(() => {
    if (!themes) return;
    let active = true;
    let stopListening: (() => unknown) | undefined;
    const initialVersion = version.current;
    getStoredThemeFiles().then((selection) => {
      if (active && initialVersion === version.current) return reload(selection);
    }).catch(() => {
      if (active && initialVersion === version.current) {
        setState((previous) => ({ ...previous, error: true, ready: true, loading: false }));
      }
    });
    if (runtime.events.isAvailable()) {
      runtime.events.listen<{ selection: ThemeFileSelection }>(themeFilesChangedEvent, (event) => {
        if (active) reload(normalizeThemeFiles(event.payload.selection));
      }).then((cleanup) => {
        if (active) stopListening = cleanup;
        else cleanup();
      }).catch(() => {});
    }
    return () => {
      active = false;
      version.current++;
      stopListening?.();
    };
  }, [reload, runtime.events, themes]);

  const notify = useCallback(async () => {
    if (runtime.events.isAvailable()) {
      await runtime.events.emit(themeFilesChangedEvent, { selection: selectionRef.current });
    }
  }, [runtime.events]);

  const refresh = useCallback(async () => {
    await reload();
    await notify().catch(() => {});
  }, [notify, reload]);

  const select = useCallback(async (appearance: keyof ThemeFileSelection, fileName: string | null) => {
    const selection = normalizeThemeFiles({ ...selectionRef.current, [appearance]: fileName });
    setState((previous) => ({ ...previous, loading: true, error: false }));
    try {
      await saveStoredThemeFiles(selection);
      await reload(selection);
      await notify().catch(() => {});
    } catch {
      setState((previous) => ({ ...previous, error: true, loading: false }));
    }
  }, [notify, reload]);

  const openFolder = useCallback(async () => {
    try {
      await themes?.openFolder();
    } catch {
      setState((previous) => ({ ...previous, error: true }));
    }
  }, [themes]);

  return { ...state, available: !!themes, refresh, select, openFolder };
}
