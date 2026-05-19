import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../lib/ai-actions";
import { AiCommandBar } from "./AiCommandBar";

describe("AiCommandBar", () => {
  it("keeps the compact command closed on programmatic focus after selection opens it", () => {
    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });
    fireEvent.focus(input);

    expect(input.closest(".ai-command-box")).toHaveAttribute("data-state", "compact");
    expect(screen.queryByText("AI toolkit")).not.toBeInTheDocument();
  });

  it("notifies when the command input takes focus so the app can preserve selection context", () => {
    const onSelectionContextFocus = vi.fn();
    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSelectionContextFocus={onSelectionContextFocus}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByRole("textbox", { name: "AI command" }));

    expect(onSelectionContextFocus).toHaveBeenCalledTimes(1);
  });

  it("closes an idle compact command when clicking outside it", () => {
    const onClose = vi.fn();
    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={onClose}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes an idle expanded command when clicking outside it", () => {
    const onClose = vi.fn();
    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={onClose}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a result follow-up command open when clicking outside it", () => {
    const onClose = vi.fn();
    render(
      <AiCommandBar
        aiResult={{
          from: 1,
          original: "Original",
          replacement: "Improved",
          to: 9,
          type: "replace"
        }}
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={onClose}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.mouseDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports the compact command overlay inset from its rendered height", async () => {
    const onOverlayInsetChange = vi.fn();
    const originalInnerHeight = window.innerHeight;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains("ai-command-box")) {
        return {
          bottom: 752,
          height: 56,
          left: 0,
          right: 600,
          top: 696,
          width: 600,
          x: 0,
          y: 696,
          toJSON: () => ({})
        } as DOMRect;
      }

      return originalRect.call(this);
    };

    try {
      render(
        <AiCommandBar
          language="en"
          open
          prompt=""
          submitting={false}
          onClose={vi.fn()}
          onOverlayInsetChange={onOverlayInsetChange}
          onPromptChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      await waitFor(() => expect(onOverlayInsetChange).toHaveBeenCalledWith(104));
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight
      });
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("updates the overlay inset when the command expands", async () => {
    const onOverlayInsetChange = vi.fn();
    const originalInnerHeight = window.innerHeight;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    let commandTop = 696;
    let commandHeight = 56;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains("ai-command-box")) {
        return {
          bottom: commandTop + commandHeight,
          height: commandHeight,
          left: 0,
          right: 600,
          top: commandTop,
          width: 600,
          x: 0,
          y: commandTop,
          toJSON: () => ({})
        } as DOMRect;
      }

      return originalRect.call(this);
    };

    try {
      render(
        <AiCommandBar
          language="en"
          open
          prompt=""
          submitting={false}
          onClose={vi.fn()}
          onOverlayInsetChange={onOverlayInsetChange}
          onPromptChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      await waitFor(() => expect(onOverlayInsetChange).toHaveBeenCalledWith(104));

      commandTop = 620;
      commandHeight = 132;
      fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));

      await waitFor(() => expect(onOverlayInsetChange).toHaveBeenCalledWith(180));
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight
      });
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("keeps result follow-up input aligned with the pre-generation command UI", () => {
    render(
      <AiCommandBar
        aiResult={{
          from: 1,
          original: "Original",
          replacement: "Improved",
          to: 9,
          type: "replace"
        }}
        language="en"
        open
        prompt="rewrite"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const commandBox = screen.getByRole("textbox", { name: "AI command" }).closest(".ai-command-box");

    expect(screen.queryByText("AI suggestion ready")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AI command" }).closest(".ai-command-panel")).not.toBeInTheDocument();
    expect(commandBox).toHaveClass("min-h-21", "rounded-lg", "border", "border-(--ai-command-expanded-border)");
    expect(commandBox).toHaveClass("shadow-(--ai-command-expanded-shadow)");
    expect(screen.queryByText("AI toolkit")).not.toBeInTheDocument();
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
    expect(screen.queryByText("Improved")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("keeps the result follow-up field ready for another instruction", () => {
    render(
      <AiCommandBar
        aiResult={{
          from: 1,
          original: "Original",
          replacement: "Improved",
          to: 9,
          type: "replace"
        }}
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "AI command" })).toHaveAttribute(
      "placeholder",
      "Tell AI what else needs to be changed..."
    );
  });

  it("locks the input and shows an interrupt control while AI is running", () => {
    const onInterrupt = vi.fn();
    const onPromptChange = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt="rewrite"
        submitting
        onClose={vi.fn()}
        onInterrupt={onInterrupt}
        onPromptChange={onPromptChange}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });

    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".ai-command-loading-icon")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "new text" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop AI command" }));

    expect(onPromptChange).not.toHaveBeenCalled();
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it("shows a quiet thinking status while AI is running", () => {
    render(
      <AiCommandBar
        language="en"
        open
        prompt="rewrite"
        submitting
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent(/^Thinking$/);
    expect(status).toHaveClass("text-(--text-secondary)");
    expect(screen.getByText("Thinking")).toHaveClass("ai-command-thinking-text");
    expect(screen.queryByText("Reading context")).not.toBeInTheDocument();
    expect(screen.queryByText("Generating suggestion")).not.toBeInTheDocument();
  });

  it("shows expanded thinking feedback for an external AI context action before submission starts", () => {
    render(
      <AiCommandBar
        externalActionPending
        language="en"
        open
        prompt="Polish"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });
    const status = screen.getByRole("status");
    const commandBox = input.closest(".ai-command-box");

    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent(/^Thinking$/);
    expect(commandBox).toHaveClass("min-h-21", "rounded-lg", "border-(--ai-command-expanded-border)");
    expect(commandBox).not.toHaveClass("h-14", "rounded-xl");
  });

  it("submits with Enter instead of inserting a newline", () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt="rewrite"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "AI command" }), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onPromptChange).not.toHaveBeenCalled();
  });

  it("does not submit when Enter confirms an IME composition", () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt="Which AI models are available?"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", nativeEvent: { isComposing: true, keyCode: 229 } });
    fireEvent.compositionEnd(input);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onPromptChange).not.toHaveBeenCalled();
  });

  it("inserts a newline with Ctrl+Enter", () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt="helloworld"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "AI command" });
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { ctrlKey: true, key: "Enter" });

    expect(onPromptChange).toHaveBeenCalledWith("hello\nworld");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("suggests the AI panel for structurally complex inline prompts", () => {
    const onTransferToAiPanel = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt={"Compare these options\n- speed\n- reliability"}
        selectedText="Synthetic selected paragraph."
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        onTransferToAiPanel={onTransferToAiPanel}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));

    expect(screen.getByText("This may work better in Markra AI.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Markra AI" }));

    expect(onTransferToAiPanel).toHaveBeenCalledWith("Compare these options\n- speed\n- reliability");
  });

  it("keeps simple inline prompts focused on the command box", () => {
    render(
      <AiCommandBar
        language="en"
        open
        prompt="Polish this"
        selectedText="Synthetic selected paragraph."
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
        onTransferToAiPanel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));

    expect(screen.queryByText("This may work better in Markra AI.")).not.toBeInTheDocument();
  });

  it("uses quick actions, sends them immediately, and hides the toolkit once the user types", async () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });

    fireEvent.click(input);
    expect(await screen.findByText("AI toolkit")).toBeInTheDocument();
    expect(screen.getByLabelText("AI quick actions")).toHaveClass("bottom-[calc(100%+10px)]");

    fireEvent.click(screen.getByRole("button", { name: "Polish" }));

    expect(onPromptChange).toHaveBeenCalledWith(defaultAiQuickActionPrompt("polish", "English"));
    expect(onSubmit).toHaveBeenCalledWith(defaultAiQuickActionPrompt("polish", "English"), "polish");
    expect(screen.queryByText("AI toolkit")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "custom request" } });

    expect(screen.queryByText("AI toolkit")).not.toBeInTheDocument();
  });

  it("uses configured quick action prompts for the command box toolkit", async () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        quickActionPrompts={{
          ...defaultAiQuickActionPrompts,
          polish: "Make the selected text clearer."
        }}
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));
    fireEvent.click(await screen.findByRole("button", { name: "Polish" }));

    expect(onPromptChange).toHaveBeenCalledWith("Make the selected text clearer.");
    expect(onSubmit).toHaveBeenCalledWith("Make the selected text clearer.", "polish");
  });

  it("targets translation quick actions to the selected app language", async () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));
    fireEvent.click(await screen.findByRole("button", { name: "Translate" }));

    expect(onPromptChange).toHaveBeenCalledWith(
      defaultAiQuickActionPrompt("translate", "English")
    );
    expect(onSubmit).toHaveBeenCalledWith(
      defaultAiQuickActionPrompt("translate", "English"),
      "translate"
    );
  });

  it("keeps quick action generation in the compact input style", async () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();
    const englishPolishPrompt = defaultAiQuickActionPrompt("polish", "English");

    const { rerender } = render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("textbox", { name: "AI command" }));
    fireEvent.click(await screen.findByRole("button", { name: "Polish" }));

    rerender(
      <AiCommandBar
        language="en"
        open
        prompt={englishPolishPrompt}
        submitting
        onClose={vi.fn()}
        onInterrupt={vi.fn()}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
      />
    );

    const status = screen.getByRole("status");
    const commandBox = status.closest(".ai-command-box");

    expect(onPromptChange).toHaveBeenCalledWith(englishPolishPrompt);
    expect(onSubmit).toHaveBeenCalledWith(englishPolishPrompt, "polish");
    expect(status).toHaveTextContent("Polishing...");
    expect(screen.getByText("Polishing...")).toHaveClass("ai-command-inline-loading-text");
    expect(commandBox).toHaveClass("h-14", "rounded-xl", "border-(--border-default)");
    expect(commandBox).not.toHaveClass("min-h-21", "border-(--ai-command-expanded-border)");
    expect(screen.queryByRole("combobox", { name: "AI model" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop AI command" })).toBeInTheDocument();
  });

  it("keeps the compact command input vertically centered", () => {
    render(
      <AiCommandBar
        language="en"
        open
        prompt=""
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });

    expect(input.closest("div")).toHaveClass("items-center");
    expect(input).toHaveClass("h-10", "leading-10");
  });

  it("lets the editor choose the AI model used by the command", () => {
    const onSelectModel = vi.fn();

    render(
      <AiCommandBar
        availableModels={[
          {
            id: "gpt-5.5",
            name: "GPT-5.5",
            providerId: "openai",
            providerName: "OpenAI",
            providerType: "openai"
          },
          {
            id: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            providerId: "anthropic",
            providerName: "Anthropic",
            providerType: "anthropic"
          }
        ]}
        editorLeftInset="18rem"
        language="en"
        open
        prompt="rewrite"
        selectedModelId="gpt-5.5"
        selectedProviderId="openai"
        submitting={false}
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSelectModel={onSelectModel}
        onSubmit={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });
    fireEvent.click(input);
    expect(screen.getByRole("dialog", { name: "AI writing command" })).toHaveStyle({
      left: "18rem",
      right: "0px"
    });
    const modelPicker = screen.getByRole("combobox", { name: "AI model" });
    expect(modelPicker.closest(".ai-command-footer")).toHaveClass("justify-end");
    expect(screen.getByAltText("OpenAI logo")).toBeInTheDocument();
    fireEvent.click(modelPicker);
    expect(screen.getByAltText("Anthropic logo")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("option")[1]!);

    expect(onSelectModel).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-6");
  });

  it("lets DeepSeek commands opt into thinking for a single send", () => {
    const onSubmit = vi.fn();

    render(
      <AiCommandBar
        language="en"
        open
        prompt="Polish"
        selectedProviderId="deepseek"
        submitting={false}
        supportsThinking
        onClose={vi.fn()}
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByRole("textbox", { name: "AI command" });
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("button", { name: "Deep thinking" }));
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Deep thinking" })).toHaveAttribute("aria-pressed", "true");
    expect(onSubmit).toHaveBeenCalledWith(undefined, "custom", { thinkingEnabled: true });
  });
});
