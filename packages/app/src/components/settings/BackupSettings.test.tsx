import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultBackupSettings, type BackupSettings as BackupSettingsValue } from "../../lib/settings/app-settings";
import { BackupSettings } from "./BackupSettings";

describe("BackupSettings", () => {
  it("updates local backup settings from a dedicated settings panel", () => {
    const onRunBackup = vi.fn();
    const onUpdateSettings = vi.fn();
    const onChooseTargetPath = vi.fn();
    const settings: BackupSettingsValue = {
      ...defaultBackupSettings,
      intervalMinutes: 30,
      targetPath: "/mock-backups"
    };

    render(
      <BackupSettings
        backupRunning={false}
        settings={settings}
        translate={translate}
        onRunBackup={onRunBackup}
        onChooseTargetPath={onChooseTargetPath}
        onUpdateSettings={onUpdateSettings}
      />
    );

    expect(screen.getByRole("heading", { name: "Backups" })).toBeInTheDocument();
    const backupSummary = screen.getByRole("note", { name: "Local one-way safety copy" });
    expect(backupSummary).toHaveTextContent(
      "Backup copies notes to a local folder for recovery. It does not download, merge, or change the original notes folder."
    );
    expect(backupSummary.closest(".settings-list-group")).toBeNull();
    expect(screen.getByText("Never")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Backup target" }), {
      target: { value: "/mock-backups/daily" }
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      targetPath: "/mock-backups/daily"
    });

    fireEvent.click(screen.getByRole("switch", { name: "Back up on exit" }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      backupOnExit: true
    });

    expect(screen.queryByRole("switch", { name: "Mirror sync target" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Automatic backup interval" }), {
      target: { value: "15" }
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      intervalMinutes: 15
    });

    fireEvent.click(screen.getByRole("button", { name: "Back up now" }));

    expect(onRunBackup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Choose backup target folder" }));

    expect(onChooseTargetPath).toHaveBeenCalledTimes(1);
  });

  it("disables manual backup while a backup is running", () => {
    render(
      <BackupSettings
        backupRunning={true}
        settings={defaultBackupSettings}
        translate={translate}
        onRunBackup={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
  });
});
