import { fireEvent, render, screen } from "@testing-library/react";
import { defaultExportSettings } from "../../lib/settings/app-settings";
import { translate } from "../../test/settings-components";
import { ExportSettings } from "./ExportSettings";

describe("ExportSettings", () => {
  it("selects an installed font for HTML and PDF exports", () => {
    const onUpdateSettings = vi.fn();
    const settings = {
      ...defaultExportSettings,
      fontFamily: null
    };

    render(
      <ExportSettings
        settings={settings}
        systemFontFamilies={[
          { family: "Example Sans", label: "Example Sans" },
          { family: "Example Serif", label: "Example Serif" }
        ]}
        translate={translate}
        onUpdateSettings={onUpdateSettings}
      />
    );

    const fontFamilySelect = screen.getByRole("combobox", { name: "Export font" });

    expect(fontFamilySelect).toHaveValue("Default");
    fireEvent.focus(fontFamilySelect);
    fireEvent.change(fontFamilySelect, { target: { value: "ser" } });
    fireEvent.click(screen.getByRole("option", { name: "Example Serif" }));

    expect(onUpdateSettings).toHaveBeenCalledWith({
      ...settings,
      fontFamily: "Example Serif"
    });
  });
});
