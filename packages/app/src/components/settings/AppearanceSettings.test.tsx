import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultCustomThemeCss } from "../../lib/settings/app-settings";
import { AppearanceSettings } from "./AppearanceSettings";

describe("AppearanceSettings", () => {
  it("updates the appearance mode and separate light and dark palettes", () => {
    const onSelectAppearanceMode = vi.fn();
    const onSelectLightTheme = vi.fn();
    const onSelectDarkTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeEnabled={false}
        darkCustomThemeCss=""
        lightCustomThemeCss=""
        selectedAppearanceMode="system"
        selectedDarkTheme="night"
        selectedLightTheme="sepia"
        translate={translate}
        onSelectAppearanceMode={onSelectAppearanceMode}
        onSelectDarkTheme={onSelectDarkTheme}
        onSelectLightTheme={onSelectLightTheme}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={vi.fn()}
        onUpdateLightCustomThemeCss={vi.fn()}
      />
    );

    const appearanceMode = screen.getByRole("radiogroup", { name: "Appearance mode" });
    const lightPalette = screen.getByRole("radiogroup", { name: "Light palette" });
    const darkPalette = screen.getByRole("radiogroup", { name: "Dark palette" });

    expect(screen.queryByRole("combobox", { name: "Color theme" })).not.toBeInTheDocument();
    expect(within(appearanceMode).getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(within(appearanceMode).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
    expect(within(appearanceMode).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    expect(within(lightPalette).getByRole("radio", { name: "Sepia" })).toHaveAttribute("aria-checked", "true");
    expect(within(lightPalette).getByRole("radio", { name: "Solarized Light" })).toBeInTheDocument();
    expect(within(lightPalette).queryByRole("radio", { name: "Night" })).not.toBeInTheDocument();
    expect(within(darkPalette).getByRole("radio", { name: "Night" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Solarized Dark" })).toBeInTheDocument();
    expect(within(darkPalette).queryByRole("radio", { name: "Sepia" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Light custom theme CSS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Dark custom theme CSS" })).not.toBeInTheDocument();

    fireEvent.click(within(appearanceMode).getByRole("radio", { name: "Dark" }));
    fireEvent.click(within(lightPalette).getByRole("radio", { name: "Solarized Light" }));
    fireEvent.click(within(darkPalette).getByRole("radio", { name: "Solarized Dark" }));

    expect(onSelectAppearanceMode).toHaveBeenCalledWith("dark");
    expect(onSelectLightTheme).toHaveBeenCalledWith("solarized-light");
    expect(onSelectDarkTheme).toHaveBeenCalledWith("solarized-dark");
  });

  it("edits light and dark custom theme CSS independently", () => {
    const onUpdateLightCustomThemeCss = vi.fn();
    const onUpdateDarkCustomThemeCss = vi.fn();
    const lightCss = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";
    const darkCss = ":root[data-theme=\"custom\"] { --bg-primary: #0d1117; }";

    render(
      <AppearanceSettings
        customThemeEnabled
        darkCustomThemeCss={darkCss}
        lightCustomThemeCss={lightCss}
        selectedAppearanceMode="light"
        selectedDarkTheme="dark"
        selectedLightTheme="light"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={vi.fn()}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={onUpdateDarkCustomThemeCss}
        onUpdateLightCustomThemeCss={onUpdateLightCustomThemeCss}
      />
    );

    const lightCustomCss = screen.getByRole("textbox", { name: "Light custom theme CSS" });
    const darkCustomCss = screen.getByRole("textbox", { name: "Dark custom theme CSS" });
    const lightPalette = screen.getByRole("radiogroup", { name: "Light palette" });
    const darkPalette = screen.getByRole("radiogroup", { name: "Dark palette" });
    const customThemeSwitch = screen.getByRole("switch", { name: "Custom theme" });
    const lightCustomThemePanel = screen.getByRole("region", { name: "Light custom theme CSS" });
    const darkCustomThemePanel = screen.getByRole("region", { name: "Dark custom theme CSS" });

    expect(lightCustomCss).toHaveValue(lightCss);
    expect(darkCustomCss).toHaveValue(darkCss);
    expect(customThemeSwitch).toBeChecked();
    expect(customThemeSwitch.closest(".settings-row")?.nextElementSibling).toBe(lightPalette.closest(".settings-row"));
    expect(within(lightPalette).getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
    expect(within(darkPalette).getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
    expect(within(lightPalette).getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
    expect(within(darkPalette).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getAllByText(/Applies only when Custom is selected/)).toHaveLength(1);
    expect(lightCustomThemePanel.querySelector(".rounded-lg")).not.toBeInTheDocument();
    expect(darkCustomThemePanel.querySelector(".rounded-lg")).not.toBeInTheDocument();
    expect(lightCustomCss).toHaveClass("min-h-24");
    expect(darkCustomCss).toHaveClass("min-h-24");

    fireEvent.change(lightCustomCss, {
      target: { value: ":root[data-theme=\"custom\"] { --accent: #0969da; }" }
    });
    fireEvent.change(darkCustomCss, {
      target: { value: ":root[data-theme=\"custom\"] { --accent: #58a6ff; }" }
    });

    expect(onUpdateLightCustomThemeCss).toHaveBeenCalledWith(":root[data-theme=\"custom\"] { --accent: #0969da; }");
    expect(onUpdateDarkCustomThemeCss).toHaveBeenCalledWith(":root[data-theme=\"custom\"] { --accent: #58a6ff; }");
  });

  it("exposes custom theme as a switch while retaining both palette buttons", () => {
    const onToggleCustomTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeEnabled={false}
        darkCustomThemeCss=""
        lightCustomThemeCss=""
        selectedAppearanceMode="system"
        selectedDarkTheme="night"
        selectedLightTheme="sepia"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={vi.fn()}
        onToggleCustomTheme={onToggleCustomTheme}
        onUpdateDarkCustomThemeCss={vi.fn()}
        onUpdateLightCustomThemeCss={vi.fn()}
      />
    );

    const appearanceMode = screen.getByRole("radiogroup", { name: "Appearance mode" });
    const lightPalette = screen.getByRole("radiogroup", { name: "Light palette" });
    const darkPalette = screen.getByRole("radiogroup", { name: "Dark palette" });
    const customThemeSwitch = screen.getByRole("switch", { name: "Custom theme" });

    expect(appearanceMode.closest(".settings-row")?.nextElementSibling).toBe(customThemeSwitch.closest(".settings-row"));
    expect(within(lightPalette).getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "false");
    expect(within(darkPalette).getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "false");
    expect(customThemeSwitch).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Light custom theme CSS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Dark custom theme CSS" })).not.toBeInTheDocument();

    fireEvent.click(customThemeSwitch);

    expect(onToggleCustomTheme).toHaveBeenCalledTimes(1);
  });

  it("marks selected themes in each preview group", () => {
    const onSelectLightTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeEnabled={false}
        darkCustomThemeCss=""
        lightCustomThemeCss=""
        selectedAppearanceMode="system"
        selectedDarkTheme="dark"
        selectedLightTheme="light"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={onSelectLightTheme}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={vi.fn()}
        onUpdateLightCustomThemeCss={vi.fn()}
      />
    );

    const lightPalette = screen.getByRole("radiogroup", { name: "Light palette" });
    const lightPreview = within(lightPalette).getByRole("radio", { name: "Light" });
    const sepiaPreview = within(lightPalette).getByRole("radio", { name: "Sepia" });

    expect(lightPreview).toHaveAttribute("aria-checked", "true");
    expect(sepiaPreview).toHaveAttribute("aria-checked", "false");

    fireEvent.click(sepiaPreview);

    expect(onSelectLightTheme).toHaveBeenCalledWith("sepia");
  });

  it("resets the custom theme CSS to the default template", () => {
    const onUpdateLightCustomThemeCss = vi.fn();

    render(
      <AppearanceSettings
        customThemeEnabled
        darkCustomThemeCss=""
        lightCustomThemeCss={":root[data-theme=\"custom\"] { --accent: #b91c1c; }"}
        selectedAppearanceMode="light"
        selectedDarkTheme="dark"
        selectedLightTheme="light"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={vi.fn()}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={vi.fn()}
        onUpdateLightCustomThemeCss={onUpdateLightCustomThemeCss}
      />
    );

    const lightCustomThemePanel = screen.getByRole("region", { name: "Light custom theme CSS" });

    fireEvent.click(within(lightCustomThemePanel).getByRole("button", { name: "Reset template" }));

    expect(onUpdateLightCustomThemeCss).toHaveBeenCalledWith(defaultCustomThemeCss);
  });

  it("imports custom theme CSS from a stylesheet file", async () => {
    const onUpdateDarkCustomThemeCss = vi.fn();
    const importedCss = ":root[data-theme=\"custom\"] { --accent: #2aa198; }";

    render(
      <AppearanceSettings
        customThemeEnabled
        darkCustomThemeCss=""
        lightCustomThemeCss=""
        selectedAppearanceMode="dark"
        selectedDarkTheme="dark"
        selectedLightTheme="light"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={vi.fn()}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={onUpdateDarkCustomThemeCss}
        onUpdateLightCustomThemeCss={vi.fn()}
      />
    );

    const darkCustomThemePanel = screen.getByRole("region", { name: "Dark custom theme CSS" });
    const fileInput = darkCustomThemePanel.querySelector("input[type=\"file\"]") as HTMLInputElement;

    expect(fileInput).toHaveAttribute("accept", ".css,text/css");

    const cssFile = new File([importedCss], "solarized.css", { type: "text/css" });
    fireEvent.change(fileInput, { target: { files: [cssFile] } });

    await waitFor(() => {
      expect(onUpdateDarkCustomThemeCss).toHaveBeenCalledWith(importedCss);
    });
  });

  it("exports custom theme CSS as a stylesheet file", async () => {
    const css = ":root[data-theme=\"custom\"] { --accent: #8fbcbb; }";
    const objectUrl = "blob:markra-custom-theme";
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <AppearanceSettings
        customThemeEnabled
        darkCustomThemeCss={css}
        lightCustomThemeCss=""
        selectedAppearanceMode="dark"
        selectedDarkTheme="dark"
        selectedLightTheme="light"
        translate={translate}
        onSelectAppearanceMode={vi.fn()}
        onSelectDarkTheme={vi.fn()}
        onSelectLightTheme={vi.fn()}
        onToggleCustomTheme={vi.fn()}
        onUpdateDarkCustomThemeCss={vi.fn()}
        onUpdateLightCustomThemeCss={vi.fn()}
      />
    );

    const darkCustomThemePanel = screen.getByRole("region", { name: "Dark custom theme CSS" });

    fireEvent.click(within(darkCustomThemePanel).getByRole("button", { name: "Export CSS" }));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    const exportedBlob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(await exportedBlob.text()).toBe(css);
    expect(clickAnchor).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    clickAnchor.mockRestore();
  });
});
