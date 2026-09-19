import { getAppRuntime } from "../../runtime";

export type ThemeFileSelection = { light: string | null; dark: string | null };
export type ThemeFileSettings = { directory: string | null; selection: ThemeFileSelection };

export const emptyThemeFiles: ThemeFileSelection = { light: null, dark: null };
export const themeFilesChangedEvent = "markra://theme-files-changed";

function normalizeThemeFile(value: unknown): string | null {
  return typeof value === "string" && /^[^/\\\x00-\x1f:]+\.css$/i.test(value) ? value : null;
}

export function normalizeThemeFiles(value: unknown): ThemeFileSelection {
  const selection = value && typeof value === "object" ? value as Partial<ThemeFileSelection> : {};
  return { light: normalizeThemeFile(selection.light), dark: normalizeThemeFile(selection.dark) };
}

function loadStore() {
  return getAppRuntime().settings.loadStore("settings.json", { autoSave: false, defaults: {} });
}

export function normalizeThemeSettings(value: unknown): ThemeFileSettings {
  const settings = value && typeof value === "object"
    ? value as { directory?: unknown; selection?: unknown }
    : {};
  return {
    directory: typeof settings.directory === "string" && settings.directory.trim() && !settings.directory.includes("\0")
      ? settings.directory : null,
    selection: normalizeThemeFiles(settings.selection ?? value)
  };
}

export async function getStoredThemeSettings() {
  const store = await loadStore();
  return normalizeThemeSettings(await store.get("themeFiles"));
}

export async function saveStoredThemeSettings(settings: ThemeFileSettings) {
  const store = await loadStore();
  const normalized = normalizeThemeSettings(settings);
  const previous = await store.get("themeFiles");
  // Store the folder and its file names together; portable settings backups exclude this local source.
  try {
    await store.set("themeFiles", { ...normalized.selection, directory: normalized.directory });
    await store.save();
  } catch (error) {
    // The store caches set() before save(). Restore that cache without replacing a newer source.
    const current = normalizeThemeSettings(await store.get("themeFiles"));
    if (JSON.stringify(current) === JSON.stringify(normalized)) {
      if (previous === undefined) await store.delete("themeFiles");
      else await store.set("themeFiles", previous);
    }
    throw error;
  }
}

export async function getStoredThemeFiles() {
  return (await getStoredThemeSettings()).selection;
}

export async function saveStoredThemeFiles(selection: ThemeFileSelection) {
  const settings = await getStoredThemeSettings();
  await saveStoredThemeSettings({ ...settings, selection });
}
