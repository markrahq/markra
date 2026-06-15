import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultSyncSettings, type SyncSettings as SyncSettingsValue } from "../../lib/settings/app-settings";
import { SyncSettings } from "./SyncSettings";

describe("SyncSettings", () => {
  it("updates remote sync settings without duplicating WebDAV credentials", () => {
    const onRunSync = vi.fn();
    const onUpdateSettings = vi.fn();
    const settings: SyncSettingsValue = {
      ...defaultSyncSettings,
      enabled: true,
      intervalMinutes: 20,
      remotePath: "notes"
    };

    render(
      <SyncSettings
        settings={settings}
        syncRunning={false}
        translate={translate}
        onRunSync={onRunSync}
        onUpdateSettings={onUpdateSettings}
      />
    );

    expect(screen.getByRole("heading", { name: "Sync" })).toBeInTheDocument();
    const syncSummary = screen.getByRole("note", { name: "Remote two-way sync" });
    expect(syncSummary).toHaveTextContent(
      "Sync keeps the current notes folder and a remote WebDAV folder aligned across devices. It can upload, download, and preserve conflict copies."
    );
    expect(syncSummary.closest(".settings-list-group")).toBeNull();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Username" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Remote folder" })).toHaveAttribute(
      "placeholder",
      "e.g. markra"
    );

    fireEvent.click(screen.getByRole("switch", { name: "Enable sync" }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      enabled: false
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Remote folder" }), {
      target: { value: "markra" }
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      remotePath: "markra"
    });

    fireEvent.click(screen.getByRole("switch", { name: "Sync after saving" }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      autoSyncOnSave: true
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: "Automatic sync interval" }), {
      target: { value: "10" }
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      intervalMinutes: 10
    });

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

    expect(onRunSync).toHaveBeenCalledTimes(1);
  });

  it("disables manual sync while sync is running", () => {
    render(
      <SyncSettings
        settings={defaultSyncSettings}
        syncRunning={true}
        translate={translate}
        onRunSync={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Remote folder" })).toHaveValue("markra");
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });
});
