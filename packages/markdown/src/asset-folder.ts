const filenameVariable = "${filename}";

export function resolveAssetFolder(folder: string, documentPath: string) {
  if (!folder.includes(filenameVariable)) return folder;

  const name = documentPath.replace(/\\/gu, "/").split("/").pop() ?? "";
  const extensionIndex = name.lastIndexOf(".");
  const filename = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  if (!filename.trim() || filename === "." || filename === ".." || filename.includes("\0")) {
    throw new Error("Current document file name is invalid for an asset folder.");
  }

  // Split/join substitutes once and preserves literal dollar sequences in file names.
  const expanded = folder.split(filenameVariable).join(filename);
  const normalized = expanded.trim().replace(/\\/gu, "/");
  if (
    normalized.startsWith("/") || /^[a-z]:/iu.test(normalized) ||
    normalized.includes("\0") || normalized.split("/").some((part) => part.trim() === "..")
  ) {
    throw new Error("Asset folder must stay inside the current document folder.");
  }
  return expanded;
}

function pathIsBelowFolder(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`);
}

export function assetFolderMatchesPath(path: string, folder: string): boolean {
  const normalizedPath = path.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/").replace(/^\.\//u, "");
  if (folder === ".") return true;
  if (!folder.includes(filenameVariable)) return pathIsBelowFolder(normalizedPath, folder);

  const prefix = folder.split(filenameVariable)[0]!;
  const parts = normalizedPath.split("/");
  // Visibility must survive document renames. Cleanup uses exact per-document
  // resolution instead of this structural match to keep deletion scope narrow.
  return parts.some((_, offset) => {
    const relative = parts.slice(offset).join("/");
    if (!relative.startsWith(prefix)) return false;
    const remainder = relative.slice(prefix.length).split("/")[0]!;
    for (let end = 1; end <= remainder.length; end += 1) {
      const filename = remainder.slice(0, end);
      if (filename === "." || filename === "..") continue;
      if (relative.startsWith(`${folder.split(filenameVariable).join(filename)}/`)) return true;
    }
    return false;
  });
}
