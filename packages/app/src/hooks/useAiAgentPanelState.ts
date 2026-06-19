import { useCallback, useState } from "react";
import { clampNumber } from "@markra/shared";
import { shouldCloseAiCommandOnAgentPanelOpen } from "./ai-agent-panel-visibility";

export const aiAgentPanelDefaultWidth = 384;
export const aiAgentPanelMinWidth = 320;
export const aiAgentPanelMaxWidth = 760;

type AiAgentPanelSessionState = {
  panelOpen: boolean;
  panelWidth: number | null;
};

type UseAiAgentPanelStateOptions = {
  closeAiCommandOnAgentPanelOpen: boolean;
  enabled: boolean;
  onCloseInlineAiCommand: () => unknown;
};

export function useAiAgentPanelState({
  closeAiCommandOnAgentPanelOpen,
  enabled,
  onCloseInlineAiCommand
}: UseAiAgentPanelStateOptions) {
  const [open, setOpenState] = useState(false);
  const [width, setWidth] = useState(aiAgentPanelDefaultWidth);
  const [resizing, setResizing] = useState(false);

  const setOpen = useCallback((nextOpen: boolean) => {
    if (!enabled) return;

    if (shouldCloseAiCommandOnAgentPanelOpen({
      closeAiCommandOnAgentPanelOpen,
      currentOpen: open,
      nextOpen
    })) {
      onCloseInlineAiCommand();
    }

    setOpenState(nextOpen);
  }, [closeAiCommandOnAgentPanelOpen, enabled, onCloseInlineAiCommand, open]);

  const openPanel = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const togglePanel = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const restoreSession = useCallback((session: AiAgentPanelSessionState) => {
    if (!enabled) return;

    setOpenState(session.panelOpen);
    setWidth(clampNumber(session.panelWidth, aiAgentPanelMinWidth, aiAgentPanelMaxWidth) ?? aiAgentPanelDefaultWidth);
  }, [enabled]);

  const startResize = useCallback(() => {
    setResizing(true);
  }, []);

  const endResize = useCallback(() => {
    setResizing(false);
  }, []);

  return {
    closePanel,
    enabledOpen: enabled && open,
    endResize,
    open,
    openPanel,
    resizing,
    restoreSession,
    setOpen,
    setWidth,
    startResize,
    togglePanel,
    width
  };
}
