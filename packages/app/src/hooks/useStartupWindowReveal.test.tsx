import { render } from "@testing-library/react";
import { useStartupWindowReveal } from "./useStartupWindowReveal";

function StartupWindowRevealTest({
  fallbackMs = 1000,
  ready,
  revealWindow
}: {
  fallbackMs?: number;
  ready: boolean;
  revealWindow: () => Promise<unknown>;
}) {
  useStartupWindowReveal({
    fallbackMs,
    ready,
    revealWindow
  });

  return null;
}

async function flushMicrotasks() {
  await Promise.resolve();
}

describe("useStartupWindowReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 1);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("waits until startup is ready before showing the native window", async () => {
    const revealWindow = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <StartupWindowRevealTest
        ready={false}
        revealWindow={revealWindow}
      />
    );

    await flushMicrotasks();
    expect(revealWindow).not.toHaveBeenCalled();

    view.rerender(
      <StartupWindowRevealTest
        ready
        revealWindow={revealWindow}
      />
    );
    await vi.advanceTimersByTimeAsync(2);

    expect(revealWindow).toHaveBeenCalledTimes(1);
  });

  it("uses the fallback timeout if startup readiness never arrives", async () => {
    const revealWindow = vi.fn().mockResolvedValue(undefined);
    render(
      <StartupWindowRevealTest
        fallbackMs={20}
        ready={false}
        revealWindow={revealWindow}
      />
    );

    await vi.advanceTimersByTimeAsync(22);

    expect(revealWindow).toHaveBeenCalledTimes(1);
  });

  it("reveals even when hidden windows do not run animation frames", async () => {
    vi.mocked(window.requestAnimationFrame).mockImplementation(() => 1);
    const revealWindow = vi.fn().mockResolvedValue(undefined);
    render(
      <StartupWindowRevealTest
        ready
        revealWindow={revealWindow}
      />
    );

    await vi.advanceTimersByTimeAsync(150);

    expect(revealWindow).toHaveBeenCalledTimes(1);
  });
});
