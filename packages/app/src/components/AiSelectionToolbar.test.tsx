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
    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
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
      "highlight",
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
        activeFormattingActions={["bold", "highlight", "link"]}
        activeHeadingLevel={1}
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
    expect(screen.getByRole("button", { name: "Highlight" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Heading Level H1" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Heading Level" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("routes heading level choices from the toolbar", () => {
    const onSetHeadingLevel = vi.fn();

    render(
      <AiSelectionToolbar
        activeHeadingLevel={2}
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
        onSetHeadingLevel={onSetHeadingLevel}
      />
    );

    const headingButton = screen.getByRole("button", { name: "Heading Level H2" });
    expect(headingButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(headingButton);

    expect(headingButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Heading Level" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "H1" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "H6" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "H3" }));

    expect(onSetHeadingLevel).toHaveBeenCalledWith(3);
  });

  it("renders the heading level menu outside the scrollable toolbar shell", () => {
    render(
      <AiSelectionToolbar
        activeHeadingLevel={2}
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
        onSetHeadingLevel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Heading Level H2" }));

    const headingMenu = screen.getByRole("menu", { name: "Heading Level" });

    expect(headingMenu.closest(".overflow-x-auto")).toBeNull();
    expect(headingMenu).toHaveClass("fixed");
  });

  it("keeps the heading level menu inside the viewport near the bottom edge", () => {
    const originalInnerHeight = window.innerHeight;
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });

    try {
      render(
        <AiSelectionToolbar
          activeHeadingLevel={2}
          anchor={anchor}
          language="en"
          open
          onCopySelection={vi.fn()}
          onInsertLink={vi.fn()}
          onOpenCommand={vi.fn()}
          onRunFormattingAction={vi.fn()}
          onRunAction={vi.fn()}
          onSetHeadingLevel={vi.fn()}
        />
      );

      const headingButton = screen.getByRole("button", { name: "Heading Level H2" });
      vi.spyOn(headingButton, "getBoundingClientRect").mockReturnValue({
        bottom: 628,
        height: 32,
        left: 120,
        right: 152,
        top: 596,
        width: 32,
        x: 120,
        y: 596,
        toJSON: () => ({})
      });

      fireEvent.click(headingButton);

      const headingMenu = screen.getByRole("menu", { name: "Heading Level" });
      expect(Number.parseInt(headingMenu.style.top, 10)).toBeLessThan(596);
      expect(headingMenu.style.maxHeight).toBe("584px");
      expect(headingMenu.style.overflowY).toBe("auto");
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });

  it("keeps the heading level menu available outside headings", () => {
    const { rerender } = render(
      <AiSelectionToolbar
        activeHeadingLevel={null}
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
        onSetHeadingLevel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Heading Level" })).toBeEnabled();

    rerender(
      <AiSelectionToolbar
        activeHeadingLevel={1}
        anchor={anchor}
        language="en"
        open
        onCopySelection={vi.fn()}
        onInsertLink={vi.fn()}
        onOpenCommand={vi.fn()}
        onRunFormattingAction={vi.fn()}
        onRunAction={vi.fn()}
        onSetHeadingLevel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Heading Level H1" })).toBeEnabled();
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
