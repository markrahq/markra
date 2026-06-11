export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Untitled.md";
}

export function firstMarkdownPath(paths: string[]) {
  return paths.find(isMarkdownPath) ?? null;
}

export function folderNameFromDocumentPath(path: string | null) {
  if (!path) return "No folder";

  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-2) ?? "Files";
}

export function parentPathFromPath(path: string | null | undefined) {
  const normalizedPath = path?.trim();
  if (!normalizedPath) return null;

  const lastSeparatorIndex = Math.max(normalizedPath.lastIndexOf("/"), normalizedPath.lastIndexOf("\\"));
  if (lastSeparatorIndex < 0) return null;
  if (lastSeparatorIndex === 0) return normalizedPath.slice(0, 1);

  const prefixWithSeparator = normalizedPath.slice(0, lastSeparatorIndex + 1);
  if (/^[a-z]:[\\/]$/iu.test(prefixWithSeparator)) return prefixWithSeparator;

  return normalizedPath.slice(0, lastSeparatorIndex);
}

export function isMarkdownPath(path: string) {
  return /\.(md|markdown|txt)$/i.test(fileNameFromPath(path));
}

export function pathNameFromPath(path: string | null) {
  if (!path) return "No folder";

  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Files";
}
