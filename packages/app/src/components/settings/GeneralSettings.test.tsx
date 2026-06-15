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
});
