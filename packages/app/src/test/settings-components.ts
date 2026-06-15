import { t } from "@markra/shared";

export function translate(key: Parameters<typeof t>[1]) {
  return t("en", key);
}
