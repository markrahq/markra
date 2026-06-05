import { fireEvent, render, screen } from "@testing-library/react";
import { AiModelPicker, type AiModelPickerOption } from "./AiModelPicker";

const models: AiModelPickerOption[] = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    providerId: "openai",
    providerName: "OpenAI",
    providerType: "openai"
  },
  {
    id: "claude-synthetic",
    name: "Claude Synthetic",
    providerId: "anthropic",
    providerName: "Anthropic",
    providerType: "anthropic"
  }
];

function setViewport(width: number, height: number) {
  const originalInnerHeight = window.innerHeight;
  const originalInnerWidth = window.innerWidth;

  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });

  return () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
  };
}

describe("AiModelPicker", () => {
  it("keeps the subtitle model listbox inside the viewport near the bottom edge", () => {
    const restoreViewport = setViewport(800, 640);

    try {
      render(
        <AiModelPicker
          ariaLabel="AI model"
          models={models}
          selectedModelId="gpt-5.5"
          selectedProviderId="openai"
          variant="subtitle"
          onSelect={vi.fn()}
          translate={(key) => key}
        />
      );

      const trigger = screen.getByRole("combobox", { name: "AI model" });
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
        bottom: 628,
        height: 32,
        left: 360,
        right: 440,
        top: 596,
        width: 80,
        x: 360,
        y: 596,
        toJSON: () => ({})
      });

      fireEvent.click(trigger);

      const listbox = screen.getByRole("listbox", { name: "AI model" });
      expect(listbox).toHaveClass("fixed");
      expect(Number.parseInt(listbox.style.top, 10)).toBeLessThan(596);
      expect(listbox.style.maxHeight).toBe("582px");
      expect(listbox.style.overflowY).toBe("auto");
    } finally {
      restoreViewport();
    }
  });
});
