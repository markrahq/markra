import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences } from "../../lib/settings/app-settings";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../../lib/ai-actions";
import { AiSettings } from "./AiSettings";

describe("AiSettings", () => {
  it("moves editor AI assistance controls into the AI settings tab", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <AiSettings
        language="en"
        preferences={{
          ...defaultEditorPreferences,
          suggestAiPanelForComplexInlinePrompts: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.getByRole("switch", { name: "Show AI quick input" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Show floating toolbar" })).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "Experimental. Suggest Markra AI for complex inline requests based on local input structure. Turn it off if the prompt feels too eager."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Show AI quick input" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      suggestAiPanelForComplexInlinePrompts: true,
      showAiQuickInputOnSelection: false
    });

    fireEvent.click(screen.getByRole("switch", { name: "Show floating toolbar" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      suggestAiPanelForComplexInlinePrompts: true,
      showAiSelectionToolbarOnSelection: true
    });

    fireEvent.click(screen.getByRole("switch", { name: "Suggest Markra AI for complex inline requests" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      suggestAiPanelForComplexInlinePrompts: false
    });
  });

  it("edits and resets AI quick action prompts", () => {
    const onUpdatePreferences = vi.fn();
    const preferences = {
      ...defaultEditorPreferences,
      aiQuickActionPrompts: {
        ...defaultAiQuickActionPrompts,
        polish: "Make the selected text clearer."
      }
    };

    render(
      <AiSettings
        language="en"
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const polishPrompt = screen.getByRole("textbox", { name: "Polish prompt" });

    expect(screen.getByRole("heading", { name: "AI prompts" })).toBeInTheDocument();
    expect(polishPrompt).toHaveValue("Make the selected text clearer.");

    fireEvent.change(polishPrompt, { target: { value: "Make this sharper." } });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      aiQuickActionPrompts: {
        ...defaultAiQuickActionPrompts,
        polish: "Make this sharper."
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Polish prompt" }));

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      aiQuickActionPrompts: defaultAiQuickActionPrompts
    });
  });

  it("shows the default prompt when no custom quick action prompt is stored", () => {
    render(
      <AiSettings
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Polish prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("polish", "English")
    );
    expect(screen.getByRole("textbox", { name: "Continue writing prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("continue", "English")
    );
  });

  it("keeps non-translation defaults in English while targeting translations to the app language", () => {
    render(
      <AiSettings
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Polish prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("polish", "English")
    );
    expect(screen.getByRole("textbox", { name: "Translate prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("translate", "English")
    );
  });
});
