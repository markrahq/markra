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

const visualEditorFontFallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

function quoteCssFontFamilyName(family: string) {
  return `"${family.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
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

  return `${quoteCssFontFamilyName(fontFamily.family)}, ${visualEditorFontFallback}`;
}
