export const markdownImageDragMime = "application/x-markra-markdown-image";

export type MarkdownImageDragPayload = {
  alt: string;
  path: string;
  relativePath: string;
};

type MarkdownImageDragFile = {
  name: string;
  path: string;
  relativePath: string;
};

const imageExtensionPattern = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/iu;
const unsafeMarkdownHrefCharactersPattern = /[%\s()<>#]/gu;
const escapedMarkdownAltPattern = /[\\\]]/gu;

function normalizePathSeparators(path: string) {
  return path.replace(/\\/gu, "/");
}

function trimPathSlashes(path: string) {
  return path.replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function pathParts(path: string) {
  const normalized = normalizePathSeparators(path);
  const driveMatch = /^[a-z]:/iu.exec(normalized);
  const prefix = driveMatch ? driveMatch[0] : normalized.startsWith("/") ? "/" : "";
  const body = prefix ? normalized.slice(prefix.length) : normalized;
  const parts = body.split("/").filter(Boolean);

  return prefix ? [prefix, ...parts] : parts;
}

function pathFromParts(parts: string[]) {
  if (parts[0] === "/") return `/${parts.slice(1).join("/")}`;
  return parts.join("/");
}

function directoryPath(path: string) {
  const parts = pathParts(path);
  if (parts.length <= 1) return parts[0] === "/" ? "/" : "";

  return pathFromParts(parts.slice(0, -1));
}

function relativeImagePathFromDocument(
  documentPath: string | null | undefined,
  targetPath: string,
  fallbackRelativePath: string
) {
  const fallback = trimPathSlashes(normalizePathSeparators(fallbackRelativePath));
  if (!documentPath) return fallback;

  const fromParts = pathParts(directoryPath(documentPath));
  const toParts = pathParts(targetPath);

  if (fromParts[0] !== toParts[0]) return fallback;

  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }

  const upParts = fromParts.slice(shared).filter((part) => part !== "/").map(() => "..");
  const downParts = toParts.slice(shared);
  const relativePath = [...upParts, ...downParts].join("/");

  return relativePath || fallback;
}

function encodeMarkdownHref(href: string) {
  return href.replace(unsafeMarkdownHrefCharactersPattern, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function escapeMarkdownImageAlt(alt: string) {
  return alt.replace(escapedMarkdownAltPattern, (character) => `\\${character}`);
}

export function markdownImageAltFromFileName(fileName: string) {
  return fileName.replace(imageExtensionPattern, "").trim() || "image";
}

export function markdownImageDragPayloadForFile(file: MarkdownImageDragFile): MarkdownImageDragPayload {
  return {
    alt: markdownImageAltFromFileName(file.name),
    path: file.path,
    relativePath: file.relativePath
  };
}

export function markdownImageDragSrcForDocument(
  payload: MarkdownImageDragPayload,
  documentPath: string | null | undefined
) {
  return encodeMarkdownHref(relativeImagePathFromDocument(documentPath, payload.path, payload.relativePath));
}

export function markdownImageDragMarkdownForDocument(
  payload: MarkdownImageDragPayload,
  documentPath: string | null | undefined
) {
  return `![${escapeMarkdownImageAlt(payload.alt)}](${markdownImageDragSrcForDocument(payload, documentPath)})`;
}

export function readMarkdownImageDragPayload(dataTransfer: DataTransfer | null | undefined) {
  if (typeof dataTransfer?.getData !== "function") return null;

  const rawPayload = dataTransfer?.getData(markdownImageDragMime);
  if (!rawPayload) return null;

  try {
    const payload = JSON.parse(rawPayload) as Partial<MarkdownImageDragPayload>;
    if (typeof payload.path !== "string" || !payload.path.trim()) return null;
    if (typeof payload.relativePath !== "string" || !payload.relativePath.trim()) return null;

    return {
      alt: typeof payload.alt === "string" && payload.alt.trim() ? payload.alt : "image",
      path: payload.path,
      relativePath: payload.relativePath
    } satisfies MarkdownImageDragPayload;
  } catch {
    return null;
  }
}

export function writeMarkdownImageDragPayload(
  dataTransfer: DataTransfer,
  payload: MarkdownImageDragPayload,
  options: { documentPath?: string | null | undefined } = {}
) {
  try {
    dataTransfer.effectAllowed = "copy";
  } catch {
    // Some WebViews expose partial DataTransfer implementations during app-internal drags.
  }

  const markdown = markdownImageDragMarkdownForDocument(payload, options.documentPath);
  try {
    dataTransfer.setData("text/plain", markdown);
  } catch {
    // Keep the custom payload path available when plain text is rejected.
  }

  try {
    dataTransfer.setData(markdownImageDragMime, JSON.stringify(payload));
  } catch {
    // The editor can still use the text/plain markdown fallback.
  }
}
