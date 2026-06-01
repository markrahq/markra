import { fireEvent, render, screen } from "@testing-library/react";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../lib/ai-actions";
import { AiSelectionToolbar } from "./AiSelectionToolbar";

const anchor = {
  bottom: 180,
  left: 240,
  right: 420,
  top: 148
};

describe("AiSelectionToolbar", () => {
  it("renders built-in AI presets at the selected text anchor", () => {
    render(
      <AiSelectionToolbar
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
      />
    );

    const toolbar = screen.getByRole("toolbar", { name: "AI quick actions" });

    expect(toolbar).toHaveStyle({
      left: "330px",
      top: "136px"
    });
    expect(screen.getByRole("button", { name: "AI command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rewrite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue writing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Translate" })).toBeInTheDocument();
  });

  it("renders basic selection tools and routes them to editor commands", () => {
    const onRunFormattingAction = vi.fn();
    const onInsertLink = vi.fn();
    const onCopySelection = vi.fn();

    render(
      <AiSelectionToolbar
        anchor={anchor}
        language="en"
        open
        onCopySelection={onCopySelection}
        onInsertLink={onInsertLink}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={onRunFormattingAction}
        onRunAction={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    fireEvent.click(screen.getByRole("button", { name: "Strikethrough" }));
    fireEvent.click(screen.getByRole("button", { name: "Inline Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Heading 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    fireEvent.click(screen.getByRole("button", { name: "Bullet List" }));
    fireEvent.click(screen.getByRole("button", { name: "Ordered List" }));
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(onRunFormattingAction.mock.calls.map(([action]) => action)).toEqual([
      "bold",
      "italic",
      "strikethrough",
      "inlineCode",
      "heading1",
      "quote",
      "bulletList",
      "orderedList"
    ]);
    expect(onInsertLink).toHaveBeenCalledTimes(1);
    expect(onCopySelection).toHaveBeenCalledTimes(1);
  });

  it("marks active formatting tools as pressed", () => {
    render(
      <AiSelectionToolbar
        activeFormattingActions={["bold", "heading1", "link"]}
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Heading 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the copy button success state in place", () => {
    render(
      <AiSelectionToolbar
        anchor={anchor}
        copySucceeded
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });

  it("targets translation preset prompts to the selected app language", () => {
    const onRunAction = vi.fn();

    render(
      <AiSelectionToolbar
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={onRunAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(onRunAction).toHaveBeenCalledWith(
      "translate",
      defaultAiQuickActionPrompt("translate", "English")
    );
  });

  it("uses configured prompt text while keeping the localized button label", () => {
    const onRunAction = vi.fn();

    render(
      <AiSelectionToolbar
        anchor={anchor}
        language="en"
        open
        quickActionPrompts={{
          ...defaultAiQuickActionPrompts,
          polish: "Make the selected text clearer."
        }}
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={onRunAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Polish" }));

    expect(onRunAction).toHaveBeenCalledWith("polish", "Make the selected text clearer.");
  });

  it("opens the full command input for a custom instruction", () => {
    const onOpenCommand = vi.fn();

    render(
      <AiSelectionToolbar
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={onOpenCommand}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "AI command" }));

    expect(onOpenCommand).toHaveBeenCalledTimes(1);
  });

  it("does not render when there is no selected text anchor", () => {
    render(
      <AiSelectionToolbar
        anchor={null}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
      />
    );

    expect(screen.queryByRole("toolbar", { name: "AI quick actions" })).not.toBeInTheDocument();
  });
});
