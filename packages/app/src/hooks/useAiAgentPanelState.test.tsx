import { act, renderHook } from "@testing-library/react";
import {
  aiAgentPanelDefaultWidth,
  aiAgentPanelMaxWidth,
  aiAgentPanelMinWidth,
  useAiAgentPanelState
} from "./useAiAgentPanelState";

describe("useAiAgentPanelState", () => {
  it("opens and closes the panel while closing inline AI only for the opening transition", () => {
    const closeInlineAiCommand = vi.fn();
    const { result } = renderHook(() => useAiAgentPanelState({
      closeAiCommandOnAgentPanelOpen: true,
      enabled: true,
      onCloseInlineAiCommand: closeInlineAiCommand
    }));

    expect(result.current.open).toBe(false);
    expect(result.current.enabledOpen).toBe(false);
    expect(result.current.width).toBe(aiAgentPanelDefaultWidth);

    act(() => result.current.openPanel());

    expect(result.current.open).toBe(true);
    expect(result.current.enabledOpen).toBe(true);
    expect(closeInlineAiCommand).toHaveBeenCalledTimes(1);

    act(() => result.current.openPanel());

    expect(result.current.open).toBe(true);
    expect(closeInlineAiCommand).toHaveBeenCalledTimes(1);

    act(() => result.current.closePanel());

    expect(result.current.open).toBe(false);
    expect(result.current.enabledOpen).toBe(false);
    expect(closeInlineAiCommand).toHaveBeenCalledTimes(1);
  });

  it("ignores open and restore requests while disabled", () => {
    const closeInlineAiCommand = vi.fn();
    const { result } = renderHook(() => useAiAgentPanelState({
      closeAiCommandOnAgentPanelOpen: true,
      enabled: false,
      onCloseInlineAiCommand: closeInlineAiCommand
    }));

    act(() => result.current.openPanel());
    act(() => result.current.restoreSession({
      panelOpen: true,
      panelWidth: aiAgentPanelMaxWidth
    }));

    expect(result.current.open).toBe(false);
    expect(result.current.enabledOpen).toBe(false);
    expect(result.current.width).toBe(aiAgentPanelDefaultWidth);
    expect(closeInlineAiCommand).not.toHaveBeenCalled();
  });

  it("clamps restored session width and falls back to the default width", () => {
    const { result } = renderHook(() => useAiAgentPanelState({
      closeAiCommandOnAgentPanelOpen: false,
      enabled: true,
      onCloseInlineAiCommand: () => {}
    }));

    act(() => result.current.restoreSession({
      panelOpen: true,
      panelWidth: aiAgentPanelMaxWidth + 100
    }));

    expect(result.current.open).toBe(true);
    expect(result.current.width).toBe(aiAgentPanelMaxWidth);

    act(() => result.current.restoreSession({
      panelOpen: false,
      panelWidth: aiAgentPanelMinWidth - 100
    }));

    expect(result.current.open).toBe(false);
    expect(result.current.width).toBe(aiAgentPanelMinWidth);

    act(() => result.current.restoreSession({
      panelOpen: true,
      panelWidth: null
    }));

    expect(result.current.open).toBe(true);
    expect(result.current.width).toBe(aiAgentPanelDefaultWidth);
  });

  it("tracks resize state", () => {
    const { result } = renderHook(() => useAiAgentPanelState({
      closeAiCommandOnAgentPanelOpen: false,
      enabled: true,
      onCloseInlineAiCommand: () => {}
    }));

    act(() => result.current.startResize());
    expect(result.current.resizing).toBe(true);

    act(() => result.current.endResize());
    expect(result.current.resizing).toBe(false);
  });
});
