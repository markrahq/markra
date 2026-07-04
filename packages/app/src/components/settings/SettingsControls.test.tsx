import { render, screen } from "@testing-library/react";

import { SettingsTextarea, SettingsTextInput } from "./SettingsControls";

describe("SettingsControls", () => {
  it("turns off browser text correction for settings text inputs", () => {
    render(
      <SettingsTextInput
        label="S3 endpoint URL"
        value="https://s3.example.test"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "S3 endpoint URL" });

    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("turns off browser text correction for settings textareas by default", () => {
    render(
      <SettingsTextarea
        label="Custom CSS"
        value=":root { --accent: #111; }"
        onChange={vi.fn()}
      />
    );

    const textarea = screen.getByRole("textbox", { name: "Custom CSS" });

    expect(textarea).toHaveAttribute("autocapitalize", "none");
    expect(textarea).toHaveAttribute("autocorrect", "off");
    expect(textarea).toHaveAttribute("spellcheck", "false");
  });
});
