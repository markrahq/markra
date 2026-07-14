export const fileIgnoreRulesMaxLength = 50_000;

export type FileIgnoreSettings = {
  rules: string;
};

export const defaultFileIgnoreSettings: FileIgnoreSettings = {
  rules: ""
};

export function normalizeFileIgnoreRules(value: unknown) {
  if (typeof value !== "string") return "";

  return value.replace(/\r\n?/gu, "\n").slice(0, fileIgnoreRulesMaxLength);
}

export function normalizeFileIgnoreSettings(value: unknown): FileIgnoreSettings {
  const settings = typeof value === "object" && value !== null
    ? value as Partial<FileIgnoreSettings>
    : defaultFileIgnoreSettings;

  return {
    rules: normalizeFileIgnoreRules(settings.rules)
  };
}
