import { supportedLanguages, t } from "./index";
import deMessages from "./locales/de";
import enMessages from "./locales/en";
import esMessages from "./locales/es";
import frMessages from "./locales/fr";
import itMessages from "./locales/it";
import jaMessages from "./locales/ja";
import koMessages from "./locales/ko";
import ptBrMessages from "./locales/pt-BR";
import ruMessages from "./locales/ru";
import zhCnMessages from "./locales/zh-CN";
import zhTwMessages from "./locales/zh-TW";
import type { AppLanguage, I18nKey, LocaleMessages } from "./locales/types";

const nonEnglishLocaleMessages: Record<Exclude<AppLanguage, "en">, LocaleMessages> = {
  de: deMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
  ja: jaMessages,
  ko: koMessages,
  "pt-BR": ptBrMessages,
  ru: ruMessages,
  "zh-CN": zhCnMessages,
  "zh-TW": zhTwMessages
};

const sourceKeys = Object.keys(enMessages) as I18nKey[];

function untranslatedKeys(messages: LocaleMessages) {
  return sourceKeys.filter((key) => {
    const message = messages[key];

    return typeof message !== "string" || message.trim().length === 0;
  });
}

describe("i18n", () => {
  it("ships common app languages with English as the first default", () => {
    expect(supportedLanguages.map((language) => language.code)).toEqual([
      "en",
      "zh-CN",
      "zh-TW",
      "ja",
      "ko",
      "fr",
      "de",
      "es",
      "pt-BR",
      "it",
      "ru"
    ]);
  });

  it("falls back to the key when no translation exists", () => {
    expect(t("ru", "missing.key")).toBe("missing.key");
  });

  it("ships user-facing AI chat image attachment copy", () => {
    const keys = [
      "app.aiAgentAttachImages",
      "app.aiAgentRemoveImage",
      "app.aiAgentVisionRequired",
      "app.aiAgentAttachmentUnsupported",
      "app.aiAgentAttachmentUnreadable",
      "app.aiAgentAttachmentTooLarge",
      "app.aiAgentAttachmentsTooLarge",
      "app.aiAgentAttachmentLimit",
      "app.aiAgentAttachmentStorageFailed",
      "app.aiAgentAttachmentUnavailable"
    ] as I18nKey[];

    expect(keys.map((key) => t("en", key))).toEqual([
      "Attach images",
      "Remove image",
      "Choose a model with vision to send images.",
      "This image format is not supported.",
      "This image could not be read.",
      "Each image must be 10 MB or smaller.",
      "Images in one message must total 20 MB or less.",
      "You can attach up to 4 images per message.",
      "Could not save the attached images.",
      "Image unavailable"
    ]);
  });

  it("ships non-empty English labels for every translation key", () => {
    expect(untranslatedKeys(enMessages)).toEqual([]);
  });

  it("ships every English translation key in every supported locale", () => {
    for (const [language, messages] of Object.entries(nonEnglishLocaleMessages)) {
      expect(untranslatedKeys(messages), `${language} should define every English i18n key`).toEqual([]);
    }
  });
});
