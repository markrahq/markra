import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { codexAcpAgentArgs, defaultAcpAgentSettings, defaultEditorPreferences } from "../../lib/settings/app-settings";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../../lib/ai-actions";
import { AiSettings } from "./AiSettings";

describe("AiSettings", () => {
  it("edits ACP agent runtime settings", () => {
    const onUpdateAcpAgentSettings = vi.fn();

    render(
      <AiSettings
        acpAgentSettings={{
          args: "--experimental-acp",
          command: "gemini",
          cwd: "/mock-vault",
          enabled: true
        }}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={onUpdateAcpAgentSettings}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "ACP agent" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Use ACP agent" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "ACP command" })).toHaveValue("gemini");
    expect(screen.getByRole("textbox", { name: "ACP arguments" })).toHaveValue("--experimental-acp");
    expect(screen.getByRole("textbox", { name: "ACP working directory" })).toHaveValue("/mock-vault");

    fireEvent.click(screen.getByRole("switch", { name: "Use ACP agent" }));
    expect(onUpdateAcpAgentSettings).toHaveBeenCalledWith({
      args: "--experimental-acp",
      command: "gemini",
      cwd: "/mock-vault",
      enabled: false
    });

    fireEvent.change(screen.getByRole("textbox", { name: "ACP command" }), { target: { value: "claude" } });
    expect(onUpdateAcpAgentSettings).toHaveBeenCalledWith({
      args: "--experimental-acp",
      command: "claude",
      cwd: "/mock-vault",
      enabled: true
    });
  });

  it("uses disabled default ACP settings when none are configured", () => {
    render(
      <AiSettings
        acpAgentSettings={defaultAcpAgentSettings}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={vi.fn()}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("switch", { name: "Use ACP agent" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("combobox", { name: "ACP agent preset" })).toHaveValue("custom");
    expect(screen.getByRole("textbox", { name: "ACP command" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "ACP command" })).toHaveAttribute("placeholder", "/bin/zsh");
    expect(screen.getByRole("textbox", { name: "ACP arguments" })).toHaveAttribute(
      "placeholder",
      codexAcpAgentArgs
    );
    expect(screen.getByRole("textbox", { name: "ACP working directory" })).toHaveAttribute(
      "placeholder",
      "Leave empty for current workspace"
    );
  });

  it("applies common ACP agent presets", () => {
    const onUpdateAcpAgentSettings = vi.fn();
    const { rerender } = render(
      <AiSettings
        acpAgentSettings={{
          ...defaultAcpAgentSettings,
          cwd: "/mock-vault"
        }}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={onUpdateAcpAgentSettings}
        onUpdatePreferences={vi.fn()}
      />
    );

    const presetSelect = screen.getByRole("combobox", { name: "ACP agent preset" });
    expect(Array.from(presetSelect.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
      "Custom",
      "Codex",
      "Claude Agent",
      "Gemini CLI",
      "GitHub Copilot",
      "OpenCode",
      "Qwen Code",
      "Cline"
    ]);

    const expectedPresets = [
      ["codex-acp", codexAcpAgentArgs],
      ["claude-acp", "-lc 'exec npx -y @agentclientprotocol/claude-agent-acp'"],
      ["gemini", "-lc 'exec npx -y @google/gemini-cli --acp'"],
      ["github-copilot-cli", "-lc 'exec npx -y @github/copilot --acp'"],
      ["opencode", "-lc 'exec opencode acp'"],
      ["qwen-code", "-lc 'exec npx -y @qwen-code/qwen-code --acp --experimental-skills'"],
      ["cline", "-lc 'exec npx -y cline --acp'"]
    ];

    for (const [presetId, args] of expectedPresets) {
      fireEvent.change(presetSelect, { target: { value: presetId } });

      expect(onUpdateAcpAgentSettings).toHaveBeenLastCalledWith({
        args,
        command: "/bin/zsh",
        cwd: "/mock-vault",
        enabled: true
      });
    }

    rerender(
      <AiSettings
        acpAgentSettings={{
          args: "-lc 'exec npx -y @google/gemini-cli --acp'",
          command: "/bin/zsh",
          cwd: "/mock-vault",
          enabled: true
        }}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={onUpdateAcpAgentSettings}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: "ACP agent preset" })).toHaveValue("gemini");

    fireEvent.change(screen.getByRole("combobox", { name: "ACP agent preset" }), { target: { value: "custom" } });

    expect(onUpdateAcpAgentSettings).toHaveBeenLastCalledWith({
      args: "",
      command: "",
      cwd: "/mock-vault",
      enabled: true
    });
  });

  it("moves editor AI assistance controls into the AI settings tab", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <AiSettings
        acpAgentSettings={defaultAcpAgentSettings}
        language="en"
        preferences={{
          ...defaultEditorPreferences,
          suggestAiPanelForComplexInlinePrompts: true
        }}
        translate={translate}
        onUpdateAcpAgentSettings={vi.fn()}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.getByRole("switch", { name: "Show AI quick input" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Show floating toolbar" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "AI workspace animation" })).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "Experimental. Shows an AI cursor and highlights in the workspace while file changes are being applied."
      )
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("switch", { name: "AI workspace animation" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      suggestAiPanelForComplexInlinePrompts: true,
      aiWorkspaceAnimationEnabled: true
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
        acpAgentSettings={defaultAcpAgentSettings}
        language="en"
        preferences={preferences}
        translate={translate}
        onUpdateAcpAgentSettings={vi.fn()}
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
        acpAgentSettings={defaultAcpAgentSettings}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={vi.fn()}
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
        acpAgentSettings={defaultAcpAgentSettings}
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdateAcpAgentSettings={vi.fn()}
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
