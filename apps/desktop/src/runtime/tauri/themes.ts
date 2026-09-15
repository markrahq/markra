import type { ThemeDirectory } from "@markra/app/runtime";
import { open } from "@tauri-apps/plugin-dialog";
import { invokeNative } from "./invoke";

export function listNativeThemes(directory?: string | null) {
  return directory == null ? invokeNative<ThemeDirectory>("list_themes")
    : invokeNative<ThemeDirectory>("list_themes", { directory });
}

export function readNativeTheme(fileName: string, directory?: string | null) {
  return invokeNative<string>("read_theme", { fileName, ...(directory == null ? {} : { directory }) });
}

export function openNativeThemeFolder(directory?: string | null) {
  return directory == null ? invokeNative("open_theme_folder") : invokeNative("open_theme_folder", { directory });
}

export async function chooseNativeThemeFolder(options: { title: string; defaultPath?: string }) {
  const selected = await open({ directory: true, multiple: false, ...options });
  return typeof selected === "string" ? selected : null;
}
