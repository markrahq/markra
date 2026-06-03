type ShouldCloseAiCommandOnAgentPanelOpenInput = {
  closeAiCommandOnAgentPanelOpen: boolean;
  currentOpen: boolean;
  nextOpen: boolean;
};

type ShouldHideAiCommandForAiAgentPanelInput = {
  aiAgentOpen: boolean;
  closeAiCommandOnAgentPanelOpen: boolean;
};

export function shouldCloseAiCommandOnAgentPanelOpen({
  closeAiCommandOnAgentPanelOpen,
  currentOpen,
  nextOpen
}: ShouldCloseAiCommandOnAgentPanelOpenInput) {
  return closeAiCommandOnAgentPanelOpen && !currentOpen && nextOpen;
}

export function shouldHideAiCommandForAiAgentPanel({
  aiAgentOpen,
  closeAiCommandOnAgentPanelOpen
}: ShouldHideAiCommandForAiAgentPanelInput) {
  return closeAiCommandOnAgentPanelOpen && aiAgentOpen;
}

export function shouldHideSelectionToolbarForAiAgentPanel(
  _input: ShouldHideAiCommandForAiAgentPanelInput
) {
  return false;
}
