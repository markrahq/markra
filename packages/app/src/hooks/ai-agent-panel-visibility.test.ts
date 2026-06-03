import {
  shouldCloseAiCommandOnAgentPanelOpen,
  shouldHideAiCommandForAiAgentPanel,
  shouldHideSelectionToolbarForAiAgentPanel
} from "./ai-agent-panel-visibility";

describe("AI agent panel visibility", () => {
  it("closes the AI command only when the panel is being opened and the preference is enabled", () => {
    expect(shouldCloseAiCommandOnAgentPanelOpen({
      closeAiCommandOnAgentPanelOpen: true,
      currentOpen: false,
      nextOpen: true
    })).toBe(true);

    expect(shouldCloseAiCommandOnAgentPanelOpen({
      closeAiCommandOnAgentPanelOpen: false,
      currentOpen: false,
      nextOpen: true
    })).toBe(false);

    expect(shouldCloseAiCommandOnAgentPanelOpen({
      closeAiCommandOnAgentPanelOpen: true,
      currentOpen: true,
      nextOpen: true
    })).toBe(false);

    expect(shouldCloseAiCommandOnAgentPanelOpen({
      closeAiCommandOnAgentPanelOpen: true,
      currentOpen: true,
      nextOpen: false
    })).toBe(false);
  });

  it("hides the AI command while the agent panel is already open when the preference is enabled", () => {
    expect(shouldHideAiCommandForAiAgentPanel({
      aiAgentOpen: true,
      closeAiCommandOnAgentPanelOpen: true
    })).toBe(true);

    expect(shouldHideAiCommandForAiAgentPanel({
      aiAgentOpen: true,
      closeAiCommandOnAgentPanelOpen: false
    })).toBe(false);

    expect(shouldHideAiCommandForAiAgentPanel({
      aiAgentOpen: false,
      closeAiCommandOnAgentPanelOpen: true
    })).toBe(false);
  });

  it("keeps the selection toolbar independent from the inline AI command close preference", () => {
    expect(shouldHideSelectionToolbarForAiAgentPanel({
      aiAgentOpen: true,
      closeAiCommandOnAgentPanelOpen: true
    })).toBe(false);
  });
});
