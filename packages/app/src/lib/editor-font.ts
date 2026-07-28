export type EditorFontFamilyPreference =
  | {
    family: null;
    source: "theme";
  }
  | {
    family: string;
    source: "system";
  };

export const defaultEditorFontFamily: EditorFontFamilyPreference = {
  family: null,
  source: "theme"
};

const visualEditorFontFallback = "var(--font-ui)";

function quoteCssFontFamilyName(family: string) {
  // Angle brackets are escaped because export CSS is serialized inside a raw <style> element.
  return `"${family
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/</g, "\\3c ")
    .replace(/>/g, "\\3e ")}"`;
}

export function normalizeSystemFontFamilyName(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized ? normalized.slice(0, 160) : null;
}

export function normalizeEditorFontFamilyPreference(value: unknown): EditorFontFamilyPreference {
  if (typeof value === "object" && value !== null) {
    const preference = value as Partial<EditorFontFamilyPreference>;
    if (preference.source === "system") {
      const family = normalizeSystemFontFamilyName(preference.family);

      return family ? { family, source: "system" } : defaultEditorFontFamily;
    }

    if (preference.source === "theme") return defaultEditorFontFamily;
  }

  const legacyFontFamily = normalizeSystemFontFamilyName(value);
  if (legacyFontFamily && legacyFontFamily !== "theme") {
    return {
      family: legacyFontFamily,
      source: "system"
    };
  }

  return defaultEditorFontFamily;
}

export function editorFontFamilyCssValue(fontFamily: EditorFontFamilyPreference) {
  if (fontFamily.source === "theme") return null;

  return systemFontFamilyCssValue(fontFamily.family, visualEditorFontFallback);
}

export function systemFontFamilyCssValue(family: string, fallback: string) {
  return `${quoteCssFontFamilyName(family)}, ${fallback}`;
}
