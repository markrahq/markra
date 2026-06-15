import { pathNameFromPath } from "@markra/shared";

export type RecentMarkdownFolder = {
  name: string;
  path: string;
};

export type RecentMarkdownFile = {
  name: string;
  path: string;
};

export const recentMarkdownFilesMaxLength = 10;
export const recentMarkdownFoldersMaxLength = 5;

export function normalizeRecentMarkdownFiles(value: unknown): RecentMarkdownFile[] {
  if (!Array.isArray(value)) return [];

  const seenPaths = new Set<string>();
  const files: RecentMarkdownFile[] = [];

  value.forEach((item) => {
    if (files.length >= recentMarkdownFilesMaxLength) return;
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<RecentMarkdownFile>;
    const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
    if (!path || seenPaths.has(path)) return;

    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    seenPaths.add(path);
    files.push({
      name: name || pathNameFromPath(path),
      path
    });
  });

  return files;
}

export function prependRecentMarkdownFile(
  files: readonly RecentMarkdownFile[],
  file: RecentMarkdownFile
) {
  return normalizeRecentMarkdownFiles([file, ...files]);
}

export function normalizeRecentMarkdownFolders(value: unknown): RecentMarkdownFolder[] {
  if (!Array.isArray(value)) return [];

  const seenPaths = new Set<string>();
  const folders: RecentMarkdownFolder[] = [];

  value.forEach((item) => {
    if (folders.length >= recentMarkdownFoldersMaxLength) return;
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<RecentMarkdownFolder>;
    const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
    if (!path || seenPaths.has(path)) return;

    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    seenPaths.add(path);
    folders.push({
      name: name || pathNameFromPath(path),
      path
    });
  });

  return folders;
}

export function prependRecentMarkdownFolder(
  folders: readonly RecentMarkdownFolder[],
  folder: RecentMarkdownFolder
) {
  return normalizeRecentMarkdownFolders([folder, ...folders]);
}
