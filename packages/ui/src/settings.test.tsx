import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  SettingsButton,
  SettingsCallout,
  SettingsCheckbox,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextInput,
  SettingsTextarea
} from "./settings";

describe("settings ui", () => {
  it("renders compact settings sections and rows", () => {
    render(
      <SettingsSection label="Reference" intro={<p>Configure citations.</p>}>
        <SettingsRow
          title="Bibliography"
          description="Choose a bibliography file."
          action={<SettingsButton label="Choose file">Choose</SettingsButton>}
        />
        <SettingsRow title="Citation style" action={<span>APA</span>} />
      </SettingsSection>
    );

    expect(screen.getByRole("heading", { name: "Reference" })).toHaveClass("settings-section-title");
    expect(screen.getByText("Configure citations.")).toBeInTheDocument();
    expect(screen.getByText("Bibliography").closest(".settings-row")).toBeInTheDocument();
    expect(document.querySelector(".settings-list-group")).toHaveClass("divide-y");
  });

  it("supports section and row extension slots with scoped class names", () => {
    render(
      <SettingsSection
        id="reference-settings"
        title="Reference"
        className="custom-section"
        headerClassName="custom-header"
        headingClassName="custom-heading"
        actionsClassName="custom-actions"
        contentClassName="custom-content"
        footerClassName="custom-footer"
        actions={<SettingsButton label="Reset">Reset</SettingsButton>}
        footer={<p>Footer content</p>}
      >
        <SettingsRow
          data-testid="settings-row"
          className="custom-row"
          contentClassName="custom-row-content"
          titleClassName="custom-row-title"
          descriptionClassName="custom-row-description"
          actionClassName="custom-row-action"
          leading={<span data-testid="leading-slot">#</span>}
          meta={<span data-testid="meta-slot">Beta</span>}
          title={<span>Bibliography</span>}
          description={<span>Choose a synthetic bibliography file.</span>}
          action={<button type="button">Choose</button>}
        />
      </SettingsSection>
    );

    expect(document.querySelector("#reference-settings")).toHaveClass("custom-section");
    expect(document.querySelector(".settings-section-header")).toHaveClass("custom-header");
    expect(screen.getByRole("heading", { name: "Reference" })).toHaveClass("custom-heading");
    expect(screen.getByRole("button", { name: "Reset" }).closest(".settings-section-actions")).toHaveClass(
      "custom-actions"
    );
    expect(document.querySelector(".settings-list-group")).toHaveClass("custom-content");
    expect(screen.getByText("Footer content").closest(".settings-section-footer")).toHaveClass("custom-footer");
    expect(screen.getByTestId("settings-row")).toHaveClass("custom-row");
    expect(screen.getByTestId("leading-slot")).toBeInTheDocument();
    expect(screen.getByTestId("meta-slot")).toBeInTheDocument();
    expect(screen.getByText("Bibliography").closest(".settings-row-title")).toHaveClass("custom-row-title");
    expect(screen.getByText("Choose a synthetic bibliography file.").closest(".settings-row-description")).toHaveClass(
      "custom-row-description"
    );
    expect(screen.getByRole("button", { name: "Choose" }).closest(".settings-row-action")).toHaveClass(
      "custom-row-action"
    );
  });

  it("supports callout children and class-name slots", () => {
    render(
      <SettingsCallout
        title="Export note"
        className="custom-callout"
        contentClassName="custom-callout-content"
        titleClassName="custom-callout-title"
        descriptionClassName="custom-callout-description"
        description={<span>Use synthetic export arguments only.</span>}
      >
        <button type="button">Learn more</button>
      </SettingsCallout>
    );

    expect(screen.getByRole("note", { name: "Export note" })).toHaveClass("custom-callout");
    expect(screen.getByText("Export note").closest(".settings-callout-title")).toHaveClass("custom-callout-title");
    expect(screen.getByText("Use synthetic export arguments only.").closest(".settings-callout-description")).toHaveClass(
      "custom-callout-description"
    );
    expect(screen.getByRole("button", { name: "Learn more" }).closest(".settings-callout-content")).toHaveClass(
      "custom-callout-content"
    );
  });

  it("normalizes control callbacks to values", () => {
    const onSwitchChange = vi.fn();
    const onTextChange = vi.fn();
    const onTextareaChange = vi.fn();
    const onSelectChange = vi.fn();
    const onNumberChange = vi.fn();
    const onCheckboxChange = vi.fn();

    render(
      <>
        <SettingsSwitch checked={false} label="Enable references" onChange={onSwitchChange} />
        <SettingsTextInput label="Bibliography path" value="" onChange={onTextChange} />
        <SettingsTextarea label="Export arguments" value="" onChange={onTextareaChange} />
        <SettingsSelect
          label="Citation style"
          value="apa"
          options={[
            { label: "APA", value: "apa" },
            { label: "IEEE", value: "ieee" }
          ]}
          onChange={onSelectChange}
        />
        <SettingsNumberInput label="Max results" value={5} onChange={onNumberChange} />
        <SettingsCheckbox checked={false} label="Include abstract" onChange={onCheckboxChange} />
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

  it("turns off browser text correction for text inputs and textareas", () => {
    render(
      <>
        <SettingsTextInput label="S3 endpoint URL" value="https://s3.example.test" onChange={vi.fn()} />
        <SettingsTextarea label="Custom CSS" value=":root { --accent: #111; }" onChange={vi.fn()} />
      </>
    );

    expect(screen.getByRole("textbox", { name: "S3 endpoint URL" })).toHaveAttribute("autocorrect", "off");
    expect(screen.getByRole("textbox", { name: "Custom CSS" })).toHaveAttribute("spellcheck", "false");
  });

  it("passes native props and custom classes through settings controls", () => {
    render(
      <>
        <SettingsButton label="Run export" variant="primary" size="md" className="custom-button" data-testid="button">
          Run
        </SettingsButton>
        <SettingsSwitch checked={false} label="Enable export" className="custom-switch" data-testid="switch" />
        <SettingsTextInput
          label="Endpoint"
          value=""
          name="endpoint"
          placeholder="https://example.test"
          className="custom-input"
          widthClassName="w-64"
          data-testid="text-input"
          onChange={vi.fn()}
        />
        <SettingsTextarea
          label="Arguments"
          value=""
          rows={6}
          placeholder="--citeproc"
          className="custom-textarea"
          widthClassName="w-96"
          data-testid="textarea"
          onChange={vi.fn()}
        />
        <SettingsSelect
          label="Style"
          value="apa"
          className="custom-select"
          data-testid="select"
          onChange={vi.fn()}
        >
          <option value="apa">APA</option>
          <option value="ieee">IEEE</option>
        </SettingsSelect>
        <SettingsNumberInput
          label="Limit"
          value={3}
          className="custom-number"
          inputClassName="custom-number-input"
          unitClassName="custom-number-unit"
          unit="items"
          data-testid="number"
          onChange={vi.fn()}
        />
        <SettingsCheckbox
          checked={false}
          label={<span>Include abstract</span>}
          className="custom-checkbox"
          inputClassName="custom-checkbox-input"
          labelClassName="custom-checkbox-label"
          data-testid="checkbox"
          onChange={vi.fn()}
        />
      </>
    );

    expect(screen.getByTestId("button")).toHaveClass("custom-button");
    expect(screen.getByTestId("switch")).toHaveClass("custom-switch");
    expect(screen.getByTestId("text-input")).toHaveClass("custom-input", "w-64");
    expect(screen.getByTestId("text-input")).toHaveAttribute("name", "endpoint");
    expect(screen.getByTestId("textarea")).toHaveClass("custom-textarea", "w-96");
    expect(screen.getByTestId("textarea")).toHaveAttribute("rows", "6");
    expect(screen.getByTestId("select")).toHaveClass("custom-select");
    expect(screen.getByRole("option", { name: "IEEE" })).toBeInTheDocument();
    expect(screen.getByTestId("number")).toHaveClass("custom-number");
    expect(screen.getByRole("spinbutton", { name: "Limit" })).toHaveClass("custom-number-input");
    expect(screen.getByText("items")).toHaveClass("custom-number-unit");
    expect(screen.getByTestId("checkbox")).toHaveClass("custom-checkbox");
    expect(screen.getByRole("checkbox", { name: "Include abstract" })).toHaveClass("custom-checkbox-input");
    expect(screen.getByText("Include abstract").closest(".custom-checkbox-label")).toBeInTheDocument();
  });
});
