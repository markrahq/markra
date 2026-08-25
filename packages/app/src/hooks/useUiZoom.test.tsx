import { act, renderHook, waitFor } from "@testing-library/react";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import { useUiZoom } from "./useUiZoom";

describe("useUiZoom", () => {
  const setUiZoom = vi.fn();

  beforeEach(() => {
    setUiZoom.mockReset();
    setUiZoom.mockResolvedValue(undefined);
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      window: {
        ...createDefaultAppRuntime().window,
        setUiZoom
      }
    });
  });

  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("applies the selected percentage to the current interface", async () => {
    renderHook(() => useUiZoom({
      onUiZoomPercentChange: vi.fn(),
      uiZoomPercent: 140
    }));

    await waitFor(() => expect(setUiZoom).toHaveBeenCalledWith(1.4));
  });

  it("handles VS Code-style zoom shortcuts", () => {
    const onUiZoomPercentChange = vi.fn();
    const { rerender } = renderHook(({ uiZoomPercent }) => useUiZoom({
      onUiZoomPercentChange,
      uiZoomPercent
    }), {
      initialProps: { uiZoomPercent: 100 }
    });

    const zoomInEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Equal",
      ctrlKey: true,
      key: "="
    });
    act(() => window.dispatchEvent(zoomInEvent));

    expect(zoomInEvent.defaultPrevented).toBe(true);
    expect(onUiZoomPercentChange).toHaveBeenLastCalledWith(120);

    rerender({ uiZoomPercent: 120 });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Minus",
      key: "-",
      metaKey: true
    })));
    expect(onUiZoomPercentChange).toHaveBeenLastCalledWith(100);

    rerender({ uiZoomPercent: 160 });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Digit0",
      ctrlKey: true,
      key: "0"
    })));
    expect(onUiZoomPercentChange).toHaveBeenLastCalledWith(100);
  });
});
