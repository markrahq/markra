import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  PluginSettingsButton,
  PluginSettingsCheckbox,
  PluginSettingsNumberInput,
  PluginSettingsRow,
  PluginSettingsSection,
  PluginSettingsSelect,
  PluginSettingsSwitch,
  PluginSettingsTextInput,
  PluginSettingsTextarea,
  SettingsSection
} from "./react";

describe("plugin settings ui", () => {
  it("renders settings sections and rows with Markra settings class names", () => {
    render(
      <PluginSettingsSection title="Reference" intro={<p>Configure citation behavior.</p>}>
        <PluginSettingsRow
          title="Bibliography"
          description="Choose a bibliography file."
          action={<PluginSettingsButton label="Choose file">Choose</PluginSettingsButton>}
        />
        <PluginSettingsRow title="Citation style" action={<span>APA</span>} />
      </PluginSettingsSection>
    );

    expect(screen.getByRole("heading", { name: "Reference" })).toHaveClass("settings-section-title");
    expect(screen.getByText("Configure citation behavior.")).toBeInTheDocument();
    expect(screen.getByText("Bibliography").closest(".settings-row")).toBeInTheDocument();
    expect(screen.getByText("Choose").closest("button")).toHaveAttribute("aria-label", "Choose file");
    expect(document.querySelector(".settings-list-group")).toHaveClass("divide-y");
  });

  it("exposes value-level control callbacks for plugin settings", () => {
    const onSwitchChange = vi.fn();
    const onTextChange = vi.fn();
    const onTextareaChange = vi.fn();
    const onSelectChange = vi.fn();
    const onNumberChange = vi.fn();
    const onCheckboxChange = vi.fn();

    render(
      <>
        <PluginSettingsSwitch checked={false} label="Enable references" onCheckedChange={onSwitchChange} />
        <PluginSettingsTextInput label="Bibliography path" value="" onValueChange={onTextChange} />
        <PluginSettingsTextarea label="Export arguments" value="" onValueChange={onTextareaChange} />
        <PluginSettingsSelect
          label="Citation style"
          value="apa"
          options={[
            { label: "APA", value: "apa" },
            { label: "IEEE", value: "ieee" }
          ]}
          onValueChange={onSelectChange}
        />
        <PluginSettingsNumberInput label="Max results" value={5} onValueChange={onNumberChange} />
        <PluginSettingsCheckbox checked={false} label="Include abstract" onCheckedChange={onCheckboxChange} />
      </>
    );

    fireEvent.click(screen.getByRole("switch", { name: "Enable references" }));
    fireEvent.change(screen.getByLabelText("Bibliography path"), { target: { value: "refs.bib" } });
    fireEvent.change(screen.getByLabelText("Export arguments"), { target: { value: "--citeproc" } });
    fireEvent.change(screen.getByLabelText("Citation style"), { target: { value: "ieee" } });
    fireEvent.change(screen.getByLabelText("Max results"), { target: { value: "8" } });
    fireEvent.click(screen.getByLabelText("Include abstract"));

    expect(onSwitchChange).toHaveBeenCalledWith(true);
    expect(onTextChange).toHaveBeenCalledWith("refs.bib");
    expect(onTextareaChange).toHaveBeenCalledWith("--citeproc");
    expect(onSelectChange).toHaveBeenCalledWith("ieee");
    expect(onNumberChange).toHaveBeenCalledWith(8);
    expect(onCheckboxChange).toHaveBeenCalledWith(true);
  });

  it("also re-exports the base settings names from the stable plugin entry", () => {
    render(
      <SettingsSection title="Direct re-export">
        <PluginSettingsRow title="Base name" action={<span>Available</span>} />
      </SettingsSection>
    );

    expect(screen.getByRole("heading", { name: "Direct re-export" })).toHaveClass("settings-section-title");
  });
});
