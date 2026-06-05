export const largeMarkdownVisualLimitBytes = 1_000_000;
export const largeMarkdownVisualLimitChars = 1_000_000;
export const largeMarkdownVisualLimitLines = 20_000;

type LargeMarkdownVisualMetadata = {
  sizeBytes?: number | null;
};

function lineCountAtLeast(content: string, minimumLines: number) {
  let lines = content.length > 0 ? 1 : 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) continue;

    lines += 1;
    if (lines >= minimumLines) return true;
  }

  return lines >= minimumLines;
}

export function shouldBlockLargeMarkdownVisual(
  content: string,
  metadata: LargeMarkdownVisualMetadata = {}
) {
  if (metadata.sizeBytes !== undefined && metadata.sizeBytes !== null) {
    return metadata.sizeBytes >= largeMarkdownVisualLimitBytes;
  }

  return content.length >= largeMarkdownVisualLimitChars ||
    lineCountAtLeast(content, largeMarkdownVisualLimitLines);
}
