import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences } from "../../lib/settings/app-settings";
import { GeneralSettings } from "./GeneralSettings";

describe("GeneralSettings", () => {
  it("toggles automatic update checks", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <GeneralSettings
        appVersion="0.0.7"
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        welcomeReset={false}
        onCheckForUpdates={vi.fn()}
        onResetWelcomeDocument={vi.fn()}
        onSelectLanguage={vi.fn()}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const autoUpdateSwitch = screen.getByRole("switch", { name: "Automatically check for updates" });

    expect(autoUpdateSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(autoUpdateSwitch);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      autoUpdateEnabled: false
    });
  });

  it("updates automatic save preferences", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <GeneralSettings
        appVersion="0.0.7"
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        welcomeReset={false}
        onCheckForUpdates={vi.fn()}
        onResetWelcomeDocument={vi.fn()}
        onSelectLanguage={vi.fn()}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const autoSaveSwitch = screen.getByRole("switch", { name: "Auto-save" });
    const autoSaveInterval = screen.getByRole("spinbutton", { name: "Save interval" });

    expect(autoSaveSwitch).toHaveAttribute("aria-checked", "true");
    expect(autoSaveInterval).toHaveValue(10);

    fireEvent.click(autoSaveSwitch);
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      autoSaveEnabled: false
    });

    fireEvent.change(autoSaveInterval, { target: { value: "30" } });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      autoSaveIntervalMinutes: 30
    });
  });

  it("keeps diagnostics actions out of general settings", () => {
    render(
      <GeneralSettings
        appVersion="0.0.7"
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        welcomeReset={false}
        onCheckForUpdates={vi.fn()}
        onResetWelcomeDocument={vi.fn()}
        onSelectLanguage={vi.fn()}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Copy diagnostic report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open prefilled diagnostics issue" })).not.toBeInTheDocument();
  });

  it("installs, repairs, and uninstalls the command line tool from general settings", () => {
    const onInstallShellCommand = vi.fn();
    const onUninstallShellCommand = vi.fn();
    const onRefreshShellCommand = vi.fn();
    const baseProps = {
      appVersion: "0.0.7",
      language: "en" as const,
      preferences: defaultEditorPreferences,
      translate,
      welcomeReset: false,
      onCheckForUpdates: vi.fn(),
      onResetWelcomeDocument: vi.fn(),
      onSelectLanguage: vi.fn(),
      onUpdatePreferences: vi.fn(),
      onInstallShellCommand,
      onRefreshShellCommand,
      onUninstallShellCommand
    };

    const { rerender } = render(
      <GeneralSettings
        {...baseProps}
        shellCommandStatus={{
          commandPath: "/mock-bin/markra",
          targetPath: "/Applications/Markra.app/Contents/MacOS/markra",
          status: "missing"
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Install markra command" }));
    expect(onInstallShellCommand).toHaveBeenCalledTimes(1);

    rerender(
      <GeneralSettings
        {...baseProps}
        shellCommandStatus={{
          commandPath: "/mock-bin/markra",
          targetPath: "/Applications/Markra.app/Contents/MacOS/markra",
          status: "needsRepair"
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Repair markra command" }));
    expect(onInstallShellCommand).toHaveBeenCalledTimes(2);

    rerender(
      <GeneralSettings
        {...baseProps}
        shellCommandStatus={{
          commandPath: "/mock-bin/markra",
          targetPath: "/Applications/Markra.app/Contents/MacOS/markra",
          status: "installed"
        }}
      />
    );
    expect(screen.getByText(/Installed at \/mock-bin\/markra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Uninstall markra command" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh markra command status" }));

    expect(onUninstallShellCommand).toHaveBeenCalledTimes(1);
    expect(onRefreshShellCommand).toHaveBeenCalledTimes(1);
  });
});
