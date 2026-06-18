import { invoke } from "@tauri-apps/api/core";
import type { AppSystemFontFamily } from "@markra/app/runtime";

function normalizeSystemFontFamilyEntry(value: unknown): AppSystemFontFamily | null {
  if (typeof value === "string") {
    const family = value.trim();

    return family ? { family, label: family } : null;
  }

  if (typeof value !== "object" || value === null) return null;

  const entry = value as Partial<AppSystemFontFamily>;
  if (typeof entry.family !== "string") return null;

  const family = entry.family.trim();
  if (!family) return null;

  const label = typeof entry.label === "string" && entry.label.trim()
    ? entry.label.trim()
    : family;

  return { family, label };
}

export function normalizeNativeSystemFontFamilies(value: unknown) {
  if (!Array.isArray(value)) return [];

  const entries = new Map<string, AppSystemFontFamily>();
  for (const item of value) {
    const entry = normalizeSystemFontFamilyEntry(item);
    if (!entry || entries.has(entry.family)) continue;

    entries.set(entry.family, entry);
  }

  return Array.from(entries.values()).sort((first, second) =>
    first.label.localeCompare(second.label) || first.family.localeCompare(second.family)
  );
}

export async function listNativeSystemFontFamilies() {
  if (!("__TAURI_INTERNALS__" in window)) {
    return [];
  }

  return normalizeNativeSystemFontFamilies(await invoke("list_system_font_families"));
}
