import type { AppLanguage } from "@markra/shared";
import type { AiProviderConfig } from "@markra/providers";
import type { AppFeatureRuntime } from "../../runtime";
import type { DesktopPlatform } from "../platform";
import type {
  AiProviderSettings,
  BackupSettings,
  EditorPreferences,
  ExportSettings,
  NetworkSettings,
  SyncSettings,
  WebSearchSettings
} from "../settings/app-settings";

export type DiagnosticsReportInput = {
  aiSettings: AiProviderSettings;
  appVersion: string;
  backupSettings: BackupSettings;
  editorPreferences: EditorPreferences;
  exportSettings: ExportSettings;
  features: AppFeatureRuntime;
  generatedAt?: Date;
  language: AppLanguage;
  networkSettings: NetworkSettings;
  osVersion: string | null;
  platform: DesktopPlatform | null;
  syncSettings: SyncSettings;
  webSearchSettings: WebSearchSettings;
};

export type CrashDiagnosticsReportInput = {
  appVersion: string;
  componentStack?: string | null;
  error: unknown;
  generatedAt?: Date;
  language: AppLanguage;
  osVersion: string | null;
  platform: DesktopPlatform | null;
};

const diagnosticsIssueUrl = "https://github.com/markrahq/markra/issues/new";

export function generateDiagnosticsReport({
  aiSettings,
  appVersion,
  backupSettings,
  editorPreferences,
  exportSettings,
  features,
  generatedAt = new Date(),
  language,
  networkSettings,
  osVersion,
  platform,
  syncSettings,
  webSearchSettings
}: DiagnosticsReportInput) {
  const reportTime = Number.isFinite(generatedAt.getTime()) ? generatedAt.toISOString() : "unknown";
  const enabledAiProviderCount = aiSettings.providers.filter((provider) => provider.enabled).length;

  return [
    "## Markra Diagnostics",
    "",
    "### App",
    line("Report time", reportTime),
    line("App version", appVersion || "unknown"),
    line("Platform", platform ?? "unknown"),
    line("OS version", osVersion?.trim() || "unknown"),
    line("App language", language),
    "",
    "### Features",
    line("AI feature enabled", features.ai),
    line("Export feature enabled", features.export),
    line("Network proxy support", features.networkProxy),
    line("Pandoc feature enabled", features.pandoc),
    line("S3 image upload feature", features.s3ImageUpload),
    line("Spellcheck feature enabled", features.spellcheck),
    line("Updater feature enabled", features.updater),
    "",
    "### Editor",
    line("Restore workspace on startup", editorPreferences.restoreWorkspaceOnStartup),
    line("Auto-save enabled", editorPreferences.autoSaveEnabled),
    line("Auto-save interval", minuteBucket(editorPreferences.autoSaveIntervalMinutes)),
    line("View mode", editorPreferences.viewMode),
    line("Document tabs enabled", editorPreferences.showDocumentTabs),
    line("Spellcheck enabled", editorPreferences.spellcheckEnabled),
    line("Image storage provider", editorPreferences.imageUpload.provider),
    line("Copy external files to storage", editorPreferences.copyExternalFilesToStorage),
    "",
    "### AI",
    line("AI providers configured", aiSettings.providers.length),
    line("AI providers enabled", enabledAiProviderCount),
    line("AI provider types", aiProviderTypes(aiSettings.providers)),
    line("AI quick input on selection", editorPreferences.showAiQuickInputOnSelection),
    line("AI selection toolbar on selection", editorPreferences.showAiSelectionToolbarOnSelection),
    line("AI agent animation enabled", editorPreferences.aiWorkspaceAnimationEnabled),
    "",
    "### Network",
    line("Network proxy enabled", networkSettings.proxyEnabled),
    line("Bypass local addresses", networkSettings.bypassLocalAddresses),
    line("Web search enabled", webSearchSettings.enabled),
    line("Web search provider", webSearchSettings.providerId),
    "",
    "### Sync And Backup",
    line("Sync enabled", syncSettings.enabled),
    line("Sync provider", syncSettings.provider),
    line("Sync on save", syncSettings.autoSyncOnSave),
    line("Sync interval", minuteBucket(syncSettings.intervalMinutes)),
    line("Last sync recorded", syncSettings.lastSyncAt !== null),
    line("Backup on exit", backupSettings.backupOnExit),
    line("Backup interval", minuteBucket(backupSettings.intervalMinutes)),
    line("Backup target configured", backupSettings.targetPath.trim().length > 0),
    line("Last backup recorded", backupSettings.lastBackupAt !== null),
    "",
    "### Export",
    line("PDF page size", exportSettings.pdfPageSize),
    line("PDF margin preset", exportSettings.pdfMarginPreset),
    line("PDF page break on H1", exportSettings.pdfPageBreakOnH1),
    line("Pandoc path configured", exportSettings.pandocPath.trim().length > 0),
    line("Pandoc args configured", exportSettings.pandocArgs.trim().length > 0),
    "",
    "### Privacy",
    "- This report is generated locally.",
    "- It does not include document contents, file names, file paths, prompts, API keys, endpoint URLs, or raw logs."
  ].join("\n");
}

export function generateCrashDiagnosticsReport({
  appVersion,
  componentStack,
  error,
  generatedAt = new Date(),
  language,
  osVersion,
  platform
}: CrashDiagnosticsReportInput) {
  const reportTime = Number.isFinite(generatedAt.getTime()) ? generatedAt.toISOString() : "unknown";
  const normalizedError = normalizeCrashError(error);

  return [
    "## Markra Crash Report",
    "",
    "### Error",
    line("Error name", normalizedError.name),
    line("Error message", normalizedError.message),
    line("Component stack", componentStack?.trim() ? "available" : "unavailable"),
    "",
    "### App",
    line("Report time", reportTime),
    line("App version", appVersion || "unknown"),
    line("Platform", platform ?? "unknown"),
    line("OS version", osVersion?.trim() || "unknown"),
    line("App language", language),
    "",
    "### Privacy",
    "- This report is generated locally.",
    "- It does not include document contents, file names, file paths, prompts, API keys, endpoint URLs, raw logs, or raw JavaScript stacks.",
    "- Please review the issue draft before submitting it."
  ].join("\n");
}

export function generateDiagnosticsIssueUrl(report: string, options: { title?: string } = {}) {
  const url = new URL(diagnosticsIssueUrl);
  // Keep this as a browser draft so users can review the local report before sharing it.
  const body = [
    "## What happened?",
    "",
    "<!-- Describe the issue, what you expected, and steps to reproduce. -->",
    "",
    report
  ].join("\n");

  url.searchParams.set("title", options.title ?? "Diagnostics report");
  url.searchParams.set("body", body);

  return url.toString();
}

function normalizeCrashError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message.trim() || "Unknown error",
      name: error.name.trim() || "Error"
    };
  }

  if (typeof error === "string") {
    return {
      message: error.trim() || "Unknown error",
      name: "Error"
    };
  }

  return {
    message: "Unknown error",
    name: "Error"
  };
}

function line(label: string, value: boolean | number | string) {
  return `- ${label}: ${String(value)}`;
}

function minuteBucket(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "disabled";
  if (minutes <= 1) return "1m";
  if (minutes <= 5) return "1-5m";
  if (minutes <= 15) return "5-15m";
  if (minutes <= 60) return "15-60m";
  if (minutes <= 240) return "1-4h";

  return ">4h";
}

function aiProviderTypes(providers: readonly AiProviderConfig[]) {
  const providerTypes = Array.from(new Set(providers.map((provider) => provider.type))).sort();

  return providerTypes.length > 0 ? providerTypes.join(", ") : "none";
}
