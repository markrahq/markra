import { shouldBlockLargeMarkdownVisual } from "./large-markdown";

// Outline parsing and Unicode word counting run synchronously. Keep them off
// the input path once a document is large enough to consume a visible frame.
export const markdownSummaryDeferredLimitBytes = 64_000;
export const markdownSummaryDeferredLimitChars = 64_000;

type MarkdownSummaryMetadata = {
  sizeBytes?: number | null;
};

export function shouldDeferMarkdownSummary(
  content: string,
  metadata: MarkdownSummaryMetadata = {}
) {
  if (shouldBlockLargeMarkdownVisual(content, metadata)) return false;

  if (metadata.sizeBytes !== undefined && metadata.sizeBytes !== null) {
    return metadata.sizeBytes >= markdownSummaryDeferredLimitBytes;
  }

  return content.length >= markdownSummaryDeferredLimitChars;
}

type ScheduledMarkdownSummaryCallback = () => unknown;

export function scheduleMarkdownSummaryIdle(callback: ScheduledMarkdownSummaryCallback) {
  const windowTarget = typeof window === "undefined" ? null : window;
  const idleTarget = windowTarget as (Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => unknown;
  }) | null;

  if (idleTarget?.requestIdleCallback) {
    const handle = idleTarget.requestIdleCallback(() => callback(), { timeout: 500 });

    return () => {
      idleTarget.cancelIdleCallback?.(handle);
    };
  }

  if (!windowTarget) {
    callback();
    return () => {};
  }

  const handle = windowTarget.setTimeout(callback, 16);

  return () => {
    windowTarget.clearTimeout(handle);
  };
}
