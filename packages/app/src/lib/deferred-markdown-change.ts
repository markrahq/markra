export const deferredMarkdownChangeDelayMs = 120;
export const deferredMarkdownChangeMaxWaitMs = 600;

type TimerHandle = ReturnType<typeof setTimeout>;

type DeferredMarkdownChangeEmitterOptions = {
  clearTimer?: (handle: TimerHandle) => unknown;
  delayMs?: number;
  maxWaitMs?: number;
  setTimer?: (callback: () => unknown, delayMs: number) => TimerHandle;
};

function defaultSetTimer(callback: () => unknown, delayMs: number) {
  return setTimeout(callback, delayMs);
}

function defaultClearTimer(handle: TimerHandle) {
  clearTimeout(handle);
}

export function createDeferredMarkdownChangeEmitter<T>(
  emit: (content: T) => unknown,
  options: DeferredMarkdownChangeEmitterOptions = {}
) {
  const delayMs = options.delayMs ?? deferredMarkdownChangeDelayMs;
  const maxWaitMs = Math.max(delayMs, options.maxWaitMs ?? deferredMarkdownChangeMaxWaitMs);
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  let delayTimer: TimerHandle | null = null;
  let maxWaitTimer: TimerHandle | null = null;
  let hasPendingContent = false;
  let pendingContent: T | null = null;
  let destroyed = false;

  const clearDelayTimer = () => {
    if (delayTimer === null) return;

    clearTimer(delayTimer);
    delayTimer = null;
  };

  const clearMaxWaitTimer = () => {
    if (maxWaitTimer === null) return;

    clearTimer(maxWaitTimer);
    maxWaitTimer = null;
  };

  const flush = () => {
    clearDelayTimer();
    clearMaxWaitTimer();
    if (destroyed || !hasPendingContent) return;

    const content = pendingContent as T;
    pendingContent = null;
    hasPendingContent = false;
    emit(content);
  };

  const schedule = (content: T) => {
    if (destroyed) return;

    pendingContent = content;
    hasPendingContent = true;
    clearDelayTimer();
    delayTimer = setTimer(flush, delayMs);
    if (maxWaitTimer === null) maxWaitTimer = setTimer(flush, maxWaitMs);
  };

  const destroy = () => {
    destroyed = true;
    pendingContent = null;
    hasPendingContent = false;
    clearDelayTimer();
    clearMaxWaitTimer();
  };

  return {
    destroy,
    flush,
    schedule
  };
}
