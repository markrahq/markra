import { getAppRuntime } from "../../runtime";

export type ThemeFileSelection = { light: string | null; dark: string | null };

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

export async function getStoredThemeFiles() {
  const store = await loadStore();
  return normalizeThemeFiles(await store.get("themeFiles"));
}

export async function saveStoredThemeFiles(selection: ThemeFileSelection) {
  const store = await loadStore();
  // File names refer to this machine's themes directory; portable CSS backups stay independent.
  await store.set("themeFiles", normalizeThemeFiles(selection));
  await store.save();
}
