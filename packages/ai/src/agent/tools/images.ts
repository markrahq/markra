export type MarkdownImageReference = {
  alt: string;
  fileName: string;
  src: string;
};

export type WorkspaceImageFile = {
  name: string;
  path: string;
  relativePath: string;
};

const imageFileExtensionPattern = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;

export function extractMarkdownImageReferences(markdown: string): MarkdownImageReference[] {
  const references: MarkdownImageReference[] = [];
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/gu;
  let match: RegExpExecArray | null = imagePattern.exec(markdown);

  while (match) {
    const src = normalizeMarkdownImageSrc(match[2] ?? "");
    if (src) {
      references.push({
        alt: match[1] ?? "",
        fileName: fileNameFromImageReference(src),
        src
      });
    }
    match = imagePattern.exec(markdown);
  }

  return references;
}

export function workspaceImageFiles(files: readonly WorkspaceImageFile[]) {
  return files.filter((file) => imageFileExtensionPattern.test(file.name) || imageFileExtensionPattern.test(file.relativePath));
}

export function resolveMarkdownImageReference(references: MarkdownImageReference[], src: string) {
  const normalizedSrc = src.trim();

  return references.find((reference) => reference.src === normalizedSrc) ?? null;
}

function normalizeMarkdownImageSrc(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end > 0 ? trimmed.slice(1, end).trim() : "";
  }

  return trimmed.split(/\s+/u)[0] ?? "";
}

function fileNameFromImageReference(value: string) {
  const withoutQuery = value.split(/[?#]/u)[0] ?? "";
  const normalized = decodeImageReferenceText(withoutQuery).replace(/\\/gu, "/");
  const lastSeparator = normalized.lastIndexOf("/");

  return lastSeparator >= 0 ? normalized.slice(lastSeparator + 1) : normalized;
}

function decodeImageReferenceText(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
