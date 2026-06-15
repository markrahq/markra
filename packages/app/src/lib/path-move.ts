function normalizePathSeparators(path: string) {
  return path.replace(/\\/gu, "/");
}

function stripWindowsVerbatimPrefix(path: string) {
  const normalizedPath = normalizePathSeparators(path);
  if (/^\/\/\?\/UNC\//iu.test(normalizedPath)) {
    return `//${normalizedPath.slice("//?/UNC/".length)}`;
  }

  return normalizedPath.replace(/^\/\/\?\//iu, "");
}

export function normalizeMovedPath(path: string) {
  return stripWindowsVerbatimPrefix(path).replace(/\/+$/u, "");
}

function isWindowsComparablePath(path: string) {
  return /^[a-z]:($|\/)/iu.test(path) || path.startsWith("//");
}

export function normalizeComparablePath(path: string | null | undefined) {
  const trimmedPath = path?.trim();
  if (!trimmedPath) return null;

  const normalizedPath = stripWindowsVerbatimPrefix(trimmedPath).replace(/\/+$/u, "");
  const comparablePath = normalizedPath || (trimmedPath.startsWith("/") ? "/" : null);
  if (!comparablePath) return null;

  return isWindowsComparablePath(comparablePath)
    ? comparablePath.toLowerCase()
    : comparablePath;
}

export function sameNativePath(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeComparablePath(left);
  const normalizedRight = normalizeComparablePath(right);

  return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
}

function nativePathSeparator(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

export function replaceMovedPath(path: string, previousPath: string, nextPath: string) {
  const normalizedPath = normalizeMovedPath(path);
  const normalizedPreviousPath = normalizeMovedPath(previousPath);

  if (normalizedPath === normalizedPreviousPath) return nextPath;
  if (!normalizedPath.startsWith(`${normalizedPreviousPath}/`)) return path;

  const separator = nativePathSeparator(nextPath);
  const suffix = normalizedPath.slice(normalizedPreviousPath.length + 1).split("/").join(separator);
  return `${nextPath.replace(/[\\/]+$/u, "")}${separator}${suffix}`;
}
