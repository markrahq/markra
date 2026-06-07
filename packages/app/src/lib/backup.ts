import {
  saveStoredBackupSettings,
  type BackupSettings
} from "./settings/app-settings";
import {
  backupNativeMarkdownFolder,
  type BackupNativeMarkdownFolderInput,
  type NativeMarkdownBackupSummary
} from "./tauri";

type BackupMarkdownFolder = (input: BackupNativeMarkdownFolderInput) => Promise<NativeMarkdownBackupSummary>;
type SaveBackupSettings = (settings: BackupSettings) => Promise<unknown> | unknown;

export type MarkdownBackupSkippedReason = "missing-source" | "missing-target";

export type MarkdownBackupResult =
  | {
      reason: MarkdownBackupSkippedReason;
      status: "skipped";
    }
  | {
      settings: BackupSettings;
      status: "backed-up";
      summary: NativeMarkdownBackupSummary;
    };

export type RunMarkdownBackupInput = {
  backupMarkdownFolder?: BackupMarkdownFolder;
  now?: () => number;
  saveSettings?: SaveBackupSettings;
  settings: BackupSettings;
  sourcePath: string | null | undefined;
};

function normalizedBackupPath(path: string | null | undefined) {
  const trimmedPath = path?.trim();

  return trimmedPath ? trimmedPath : null;
}

export async function runMarkdownBackup({
  backupMarkdownFolder = backupNativeMarkdownFolder,
  now = Date.now,
  saveSettings = saveStoredBackupSettings,
  settings,
  sourcePath
}: RunMarkdownBackupInput): Promise<MarkdownBackupResult> {
  const normalizedSourcePath = normalizedBackupPath(sourcePath);
  if (!normalizedSourcePath) {
    return {
      reason: "missing-source",
      status: "skipped"
    };
  }

  const normalizedTargetPath = normalizedBackupPath(settings.targetPath);
  if (!normalizedTargetPath) {
    return {
      reason: "missing-target",
      status: "skipped"
    };
  }

  const summary = await backupMarkdownFolder({
    sourcePath: normalizedSourcePath,
    targetPath: normalizedTargetPath
  });
  const nextSettings = {
    ...settings,
    lastBackupAt: Math.round(now())
  };

  await saveSettings(nextSettings);

  return {
    settings: nextSettings,
    status: "backed-up",
    summary
  };
}
