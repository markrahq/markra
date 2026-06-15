import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultCustomThemeCss } from "../../lib/settings/app-settings";
import { AppearanceSettings } from "./AppearanceSettings";

describe("AppearanceSettings", () => {
  it("updates the global theme from appearance settings", () => {
    const onSelectTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="system"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={onSelectTheme}
      />
    );

    const themeSelect = screen.getByRole("combobox", { name: "Color theme" });

    expect(themeSelect).toHaveValue("system");
    expect(screen.getByRole("option", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Github" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GitHub Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "One Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "One Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "One Dark Pro" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sepia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Solarized Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Solarized Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nord" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Catppuccin Latte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Catppuccin Mocha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Academic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Minimal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Night" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pixyll" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Custom" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Custom theme CSS" })).not.toBeInTheDocument();

    fireEvent.change(themeSelect, { target: { value: "newsprint" } });

    expect(onSelectTheme).toHaveBeenCalledWith("newsprint");
  });

  it("edits custom theme CSS when the custom theme is selected", () => {
    const onUpdateCustomThemeCss = vi.fn();
    const css = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";

    render(
      <AppearanceSettings
        customThemeCss={css}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    const customCss = screen.getByRole("textbox", { name: "Custom theme CSS" });

    expect(customCss).toHaveValue(css);

    fireEvent.change(customCss, {
      target: { value: ":root[data-theme=\"custom\"] { --accent: #0969da; }" }
    });

    expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(":root[data-theme=\"custom\"] { --accent: #0969da; }");
  });

  it("selects a theme from preview swatches", () => {
    const onSelectTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="system"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={onSelectTheme}
      />
    );

    const themePreviews = screen.getByRole("radiogroup", { name: "Theme previews" });
    const systemPreview = within(themePreviews).getByRole("radio", { name: "System" });
    const sepiaPreview = within(themePreviews).getByRole("radio", { name: "Sepia" });

    expect(systemPreview).toHaveAttribute("aria-checked", "true");
    expect(sepiaPreview).toHaveAttribute("aria-checked", "false");

    fireEvent.click(sepiaPreview);

    expect(onSelectTheme).toHaveBeenCalledWith("sepia");
  });

  it("resets the custom theme CSS to the default template", () => {
    const onUpdateCustomThemeCss = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss={":root[data-theme=\"custom\"] { --accent: #b91c1c; }"}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset template" }));

    expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(defaultCustomThemeCss);
  });

  it("imports custom theme CSS from a stylesheet file", async () => {
    const onUpdateCustomThemeCss = vi.fn();
    const importedCss = ":root[data-theme=\"custom\"] { --accent: #2aa198; }";

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    const fileInput = document.querySelector("input[type=\"file\"]") as HTMLInputElement;

    expect(fileInput).toHaveAttribute("accept", ".css,text/css");

    const cssFile = new File([importedCss], "solarized.css", { type: "text/css" });
    fireEvent.change(fileInput, { target: { files: [cssFile] } });

    await waitFor(() => {
      expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(importedCss);
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
        customThemeCss={css}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSS" }));

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
