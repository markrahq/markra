import { fireEvent, render, screen } from "@testing-library/react";
import { t } from "@markra/shared";
import { SettingsContent, SettingsSidebar } from "./SettingsShell";

function translate(key: Parameters<typeof t>[1]) {
  return t("en", key);
}

function renderSettingsSidebar(onCategoryChange = vi.fn()) {
  render(
    <SettingsSidebar
      activeCategory="general"
      appVersion="9.9.9"
      platform="macos"
      translate={translate}
      onCategoryChange={onCategoryChange}
    />
  );

  return onCategoryChange;
}

describe("SettingsShell", () => {
  it("shows keyboard shortcuts as its own settings category", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));

    expect(onCategoryChange).toHaveBeenCalledWith("keyboardShortcuts");
  });

  it("shows the configured app version in the sidebar footer", () => {
    renderSettingsSidebar();

    expect(screen.getByText("Markra v9.9.9")).toBeInTheDocument();
  });

  it("shows storage as its own settings category", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Storage" }));

    expect(onCategoryChange).toHaveBeenCalledWith("storage");
  });

  it("shows backups as its own settings category", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Backups" }));

    expect(onCategoryChange).toHaveBeenCalledWith("backup");
  });

  it("shows sync as its own settings category", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(onCategoryChange).toHaveBeenCalledWith("sync");
  });

  it("shows templates as its own settings category", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Templates" }));

    expect(onCategoryChange).toHaveBeenCalledWith("templates");
  });

  it("shows AI and providers as separate settings categories", () => {
    const onCategoryChange = renderSettingsSidebar();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Providers" }));

    expect(onCategoryChange).toHaveBeenCalledWith("ai");
    expect(onCategoryChange).toHaveBeenCalledWith("providers");
  });

  it("uses the keyboard shortcuts category title for the active panel", () => {
    render(
      <SettingsContent activeCategory="keyboardShortcuts" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("uses the storage category title for the active panel", () => {
    render(
      <SettingsContent activeCategory="storage" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Storage" })).toBeInTheDocument();
  });

  it("uses the backups category title for the active panel", () => {
    render(
      <SettingsContent activeCategory="backup" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Backups" })).toBeInTheDocument();
  });

  it("uses the sync category title for the active panel", () => {
    render(
      <SettingsContent activeCategory="sync" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Sync" })).toBeInTheDocument();
  });

  it("uses the templates category title for the active panel", () => {
    render(
      <SettingsContent activeCategory="templates" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Templates" })).toBeInTheDocument();
  });

  it("uses the provider category title for the provider panel", () => {
    render(
      <SettingsContent activeCategory="providers" translate={translate}>
        <div />
      </SettingsContent>
    );

    expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
  });
});
