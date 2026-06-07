import type { BackupSettings } from "./settings/app-settings";
import { runMarkdownBackup } from "./backup";

function backupSettings(patch: Partial<BackupSettings> = {}): BackupSettings {
  return {
    backupOnExit: false,
    intervalMinutes: 0,
    lastBackupAt: null,
    targetPath: "",
    ...patch
  };
}

describe("markdown backup", () => {
  it("skips when no source or target folder is configured", async () => {
    const backupMarkdownFolder = vi.fn();
    const saveSettings = vi.fn();

    await expect(runMarkdownBackup({
      backupMarkdownFolder,
      now: () => 123,
      saveSettings,
      settings: backupSettings(),
      sourcePath: null
    })).resolves.toEqual({
      reason: "missing-source",
      status: "skipped"
    });

    await expect(runMarkdownBackup({
      backupMarkdownFolder,
      now: () => 123,
      saveSettings,
      settings: backupSettings(),
      sourcePath: "/mock-notes"
    })).resolves.toEqual({
      reason: "missing-target",
      status: "skipped"
    });

    expect(backupMarkdownFolder).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("runs native backup and persists the latest backup time", async () => {
    const summary = {
      bytesCopied: 24,
      copiedFiles: 2,
      deletedFiles: 0,
      deletedFolders: 0,
      scannedFiles: 3,
      skippedFiles: 1
    };
    const backupMarkdownFolder = vi.fn().mockResolvedValue(summary);
    const saveSettings = vi.fn();
    const settings = backupSettings({
      targetPath: "/mock-backups"
    });

    await expect(runMarkdownBackup({
      backupMarkdownFolder,
      now: () => 1_700_000_000_000,
      saveSettings,
      settings,
      sourcePath: "/mock-notes"
    })).resolves.toEqual({
      settings: {
        ...settings,
        lastBackupAt: 1_700_000_000_000
      },
      status: "backed-up",
      summary
    });

    expect(backupMarkdownFolder).toHaveBeenCalledWith({
      sourcePath: "/mock-notes",
      targetPath: "/mock-backups"
    });
    expect(saveSettings).toHaveBeenCalledWith({
      ...settings,
      lastBackupAt: 1_700_000_000_000
    });
  });

});
