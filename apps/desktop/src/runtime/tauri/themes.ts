import type { ThemeDirectory } from "@markra/app/runtime";
import { invokeNative } from "./invoke";

export function listNativeThemes() {
  return invokeNative<ThemeDirectory>("list_themes");
}

export function readNativeTheme(fileName: string) {
  return invokeNative<string>("read_theme", { fileName });
}

export function openNativeThemeFolder() {
  return invokeNative("open_theme_folder");
}
