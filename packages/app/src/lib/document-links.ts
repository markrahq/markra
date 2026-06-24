export type MarkdownDocumentLinkFile = {
  kind?: "asset" | "attachment" | "folder";
  name: string;
  path: string;
  relativePath: string;
};

const markdownDocumentExtensionPattern = /\.(md|markdown)$/iu;
const localUrlSchemePattern = /^[a-z][a-z\d+.-]*:/iu;
const unsafeMarkdownHrefCharactersPattern = /[%\s()<>#]/gu;
const documentLinkCompletionLimit = 8;

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

function normalizeAbsolutePath(path: string) {
  const normalized = normalizePathSeparators(path);
  const absolutePrefix = normalized.startsWith("/") ? "/" : /^[a-z]:/iu.exec(normalized)?.[0] ?? "";
  const body = absolutePrefix ? normalized.slice(absolutePrefix.length) : normalized;
  const parts: string[] = [];

  body.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });

  if (absolutePrefix === "/") return `/${parts.join("/")}`;
  if (absolutePrefix) return `${absolutePrefix}/${parts.join("/")}`;
  return parts.join("/");
}

function resolvePathFromDocument(href: string, documentPath: string | null | undefined) {
  const normalizedHref = normalizePathSeparators(href);
  if (normalizedHref.startsWith("/") || /^[a-z]:\//iu.test(normalizedHref)) {
    return normalizeAbsolutePath(normalizedHref);
  }

  if (!documentPath) return normalizeAbsolutePath(normalizedHref);

  const baseDirectory = directoryPath(documentPath);
  return normalizeAbsolutePath(`${baseDirectory}/${normalizedHref}`);
}

function relativePathFromDocument(documentPath: string | null | undefined, targetPath: string, fallbackRelativePath: string) {
  if (!documentPath) return `./${trimPathSlashes(normalizePathSeparators(fallbackRelativePath))}`;

  const fromParts = pathParts(directoryPath(documentPath));
  const toParts = pathParts(targetPath);

  if (fromParts[0] !== toParts[0]) return `./${trimPathSlashes(normalizePathSeparators(fallbackRelativePath))}`;

  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }

  const upParts = fromParts.slice(shared).filter((part) => part !== "/").map(() => "..");
  const downParts = toParts.slice(shared);
  const relativeParts = [...upParts, ...downParts];
  const relativePath = relativeParts.join("/");

  if (!relativePath || relativePath.startsWith(".")) return relativePath || ".";
  return `./${relativePath}`;
}

export function markdownDocumentLinkTitle(file: MarkdownDocumentLinkFile) {
  return file.name.replace(markdownDocumentExtensionPattern, "");
}

function normalizeCompletionText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isMarkdownDocumentFile(file: MarkdownDocumentLinkFile) {
  return !file.kind && markdownDocumentExtensionPattern.test(file.name);
}

function encodeMarkdownHref(href: string) {
  return href.replace(unsafeMarkdownHrefCharactersPattern, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function decodeMarkdownHref(href: string) {
  const trimmed = href.trim();
  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;

  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
}

function localMarkdownHrefPath(href: string) {
  const decoded = decodeMarkdownHref(href);
  if (!decoded || decoded.startsWith("#") || decoded.startsWith("//") || localUrlSchemePattern.test(decoded)) {
    return null;
  }

  return decoded.split(/[?#]/u)[0] ?? null;
}

export function documentLinkCompletionFiles(
  files: readonly MarkdownDocumentLinkFile[],
  query: string,
  currentDocumentPath?: string | null
) {
  const normalizedQuery = normalizeCompletionText(query);

  return files
    .filter((file) => isMarkdownDocumentFile(file) && file.path !== currentDocumentPath)
    .filter((file) => {
      if (!normalizedQuery) return true;

      const title = normalizeCompletionText(markdownDocumentLinkTitle(file));
      const relativePath = normalizeCompletionText(file.relativePath);
      return title.includes(normalizedQuery) || relativePath.includes(normalizedQuery);
    })
    .sort((a, b) => {
      const aTitle = normalizeCompletionText(markdownDocumentLinkTitle(a));
      const bTitle = normalizeCompletionText(markdownDocumentLinkTitle(b));
      const aStarts = normalizedQuery ? aTitle.startsWith(normalizedQuery) : false;
      const bStarts = normalizedQuery ? bTitle.startsWith(normalizedQuery) : false;
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      return a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" });
    })
    .slice(0, documentLinkCompletionLimit);
}

export function markdownDocumentLinkHrefForFile(file: MarkdownDocumentLinkFile, currentDocumentPath?: string | null) {
  return encodeMarkdownHref(relativePathFromDocument(currentDocumentPath, file.path, file.relativePath));
}

export function markdownDocumentLinkForFile(file: MarkdownDocumentLinkFile, currentDocumentPath?: string | null) {
  const href = markdownDocumentLinkHrefForFile(file, currentDocumentPath);
  return `[${markdownDocumentLinkTitle(file)}](${href})`;
}

export function resolveMarkdownDocumentLinkFile(
  href: string,
  currentDocumentPath: string | null | undefined,
  files: readonly MarkdownDocumentLinkFile[]
) {
  const hrefPath = localMarkdownHrefPath(href);
  if (!hrefPath || !markdownDocumentExtensionPattern.test(hrefPath)) return null;

  const resolvedPath = resolvePathFromDocument(hrefPath, currentDocumentPath);
  const normalizedHrefRelativePath = trimPathSlashes(normalizePathSeparators(hrefPath).replace(/^\.\//u, ""));

  return files.find((file) => {
    if (!isMarkdownDocumentFile(file)) return false;

    return normalizeAbsolutePath(file.path) === resolvedPath || normalizePathSeparators(file.relativePath) === normalizedHrefRelativePath;
  }) ?? null;
}
