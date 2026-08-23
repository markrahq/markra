export type QuickLookAppearance = "dark" | "light";

export type QuickLookPreviewPayload = {
  appearance?: QuickLookAppearance;
  fileName: string;
  markdown: string;
};

const rasterDataImagePattern = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z\d+/=\s]+$/iu;
// Finder grants a Quick Look extension access to the selected Markdown file, not arbitrary siblings.
// Keep relative images visible without requesting a broad filesystem entitlement.
const localImagePlaceholderSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="560" height="88" viewBox="0 0 560 88">
    <rect x="0.5" y="0.5" width="559" height="87" rx="8" fill="#f6f8fa" stroke="#d0d7de"/>
    <text x="280" y="50" fill="#656d76" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" text-anchor="middle">Local image unavailable in Quick Look</text>
  </svg>
`)}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeQuickLookPayload(value: unknown): QuickLookPreviewPayload | null {
  if (!isRecord(value) || typeof value.markdown !== "string") return null;

  return {
    ...(value.appearance === "dark" || value.appearance === "light"
      ? { appearance: value.appearance }
      : {}),
    fileName: typeof value.fileName === "string" && value.fileName.trim()
      ? value.fileName
      : "Markdown Preview",
    markdown: value.markdown
  };
}

export function resolveQuickLookImageSrc(src: string) {
  const value = src.trim();
  if (!value) return "";
  if (/^https?:\/\//iu.test(value)) return value;
  if (rasterDataImagePattern.test(value)) return value;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(value) || value.startsWith("//")) return "";
  return localImagePlaceholderSrc;
}

export function applyQuickLookAppearance(
  appearance: QuickLookAppearance,
  root: HTMLElement = document.documentElement
) {
  root.dataset.theme = appearance;
  root.style.colorScheme = appearance;
}
