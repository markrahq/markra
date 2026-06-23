import type { AppLanguage } from "@markra/shared";

export type SpellcheckLanguage = Extract<AppLanguage, "de" | "en" | "es" | "fr" | "it" | "pt-BR" | "ru">;

export const defaultSpellcheckLanguage: SpellcheckLanguage = "en";

export const spellcheckLanguageOptions = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" }
] satisfies Array<{ code: SpellcheckLanguage; label: string }>;

export function isSpellcheckLanguage(value: unknown): value is SpellcheckLanguage {
  return spellcheckLanguageOptions.some((language) => language.code === value);
}
