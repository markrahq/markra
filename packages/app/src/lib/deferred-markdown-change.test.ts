import { describe, expect, it, vi } from "vitest";
import {
  createDeferredMarkdownChangeEmitter,
  deferredMarkdownChangeDelayMs,
  deferredMarkdownChangeMaxWaitMs
} from "./deferred-markdown-change";

describe("deferred markdown change emitter", () => {
  it("coalesces rapid changes and emits only the latest content after a short pause", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const emitter = createDeferredMarkdownChangeEmitter<string>(emit);

    emitter.schedule("# Lesson\n\nFirst");
    emitter.schedule("# Lesson\n\nSecond");

    vi.advanceTimersByTime(deferredMarkdownChangeDelayMs - 1);
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("# Lesson\n\nSecond");

    emitter.destroy();
    vi.useRealTimers();
  });

  it("emits pending content at the max wait while continuous changes keep arriving", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const emitter = createDeferredMarkdownChangeEmitter<string>(emit);

    emitter.schedule("Draft 0");
    for (let index = 1; index <= 5; index += 1) {
      vi.advanceTimersByTime(deferredMarkdownChangeDelayMs - 1);
      emitter.schedule(`Draft ${index}`);
    }

    vi.advanceTimersByTime(deferredMarkdownChangeMaxWaitMs - ((deferredMarkdownChangeDelayMs - 1) * 5) - 1);
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("Draft 5");

    emitter.destroy();
    vi.useRealTimers();
  });

  it("flushes pending content immediately and cancels scheduled timers", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const emitter = createDeferredMarkdownChangeEmitter<string>(emit);

    emitter.schedule("Synthetic draft");
    emitter.flush();
    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("Synthetic draft");

    emitter.destroy();
    vi.useRealTimers();
  });
});
