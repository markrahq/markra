import { fireEvent, render, screen } from "@testing-library/react";
import { AiAgentSessionMenu } from "./AiAgentSessionMenu";
import { agentSessionSummary } from "../test/ai-fixtures";

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

describe("AiAgentSessionMenu", () => {
  it("keeps the session menu inside the viewport near the bottom edge", () => {
    const restoreViewport = setViewport(800, 640);

    try {
      render(
        <AiAgentSessionMenu
          activeSessionId="session-b"
          language="en"
          sessions={[
            agentSessionSummary({ id: "session-a", title: "Plan cleanup" }),
            agentSessionSummary({ id: "session-b", title: "Draft proposal" })
          ]}
          onCreateSession={vi.fn()}
          onSelectSession={vi.fn()}
        />
      );

      const trigger = screen.getByRole("button", { name: "Sessions" });
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
        bottom: 628,
        height: 32,
        left: 720,
        right: 752,
        top: 596,
        width: 32,
        x: 720,
        y: 596,
        toJSON: () => ({})
      });

      fireEvent.click(trigger);

      const menu = screen.getByRole("menu", { name: "Sessions" });
      expect(menu).toHaveClass("fixed");
      expect(Number.parseInt(menu.style.top, 10)).toBeLessThan(596);
      expect(menu.style.maxHeight).toBe("580px");
      expect(menu.style.overflowY).toBe("auto");
    } finally {
      restoreViewport();
    }
  });
});
