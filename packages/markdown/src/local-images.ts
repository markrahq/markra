import { convertFileSrc } from "@tauri-apps/api/core";
import { hasTauriRuntime } from "@markra/shared";

type MarkdownImageSrcResolverOptions = {
  convertFileSrc?: (path: string) => string;
  resolveLocalSrc?: (input: { documentPath: string; src: string }) => string | Promise<string> | null;
};

function isWindowsDocumentPath(path: string) {
  return path.startsWith("\\\\") || path.startsWith("//") || /^[a-zA-Z]:[\\/]/u.test(path);
}

function isRemoteOrEmbeddedImageSrc(src: string, documentPath: string) {
  // `//host/share/...` is URL-shaped, so only give it UNC semantics for native Windows documents.
  const isForwardSlashUncPath = src.startsWith("//")
    && hasTauriRuntime()
    && isWindowsDocumentPath(documentPath);

  return (src.startsWith("//") && !isForwardSlashUncPath)
    || (/^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(src) && !/^[a-zA-Z]:[\\/]/u.test(src));
}

function documentDirectory(path: string) {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (slash < 0) return "";

  return path.slice(0, slash);
}

function documentSeparator(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function normalizeWindowsVerbatimPath(path: string) {
  if (/^\\\\\?\\UNC[\\/]/iu.test(path)) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\[a-zA-Z]:[\\/]/u.test(path)) return path.slice(4);

  return path;
}

function decodeMarkdownImagePath(src: string) {
  try {
    return decodeURI(src.split(/[?#]/u)[0] ?? src);
  } catch {
    return src;
  }
}

function splitLocalPathRoot(path: string, separator: string) {
  const driveRoot = /^[a-zA-Z]:[\\/]/u.exec(path)?.[0];
  if (driveRoot) {
    return {
      root: driveRoot.replace(/[\\/]$/u, separator),
      rest: path.slice(driveRoot.length)
    };
  }

  if (path.startsWith("\\\\") || path.startsWith("//")) {
    const [, , server = "", share = "", ...rest] = path.split(/[\\/]/u);
    if (server && share) {
      return {
        root: `${separator}${separator}${server}${separator}${share}${separator}`,
        rest: rest.join(separator)
      };
    }
  }

  if (path.startsWith("/")) {
    return {
      root: "/",
      rest: path.slice(1)
    };
  }

  if (path.startsWith("\\")) {
    return {
      root: "\\",
      rest: path.slice(1)
    };
  }

  return {
    root: "",
    rest: path
  };
}

function joinLocalPath(root: string, parts: string[], separator: string) {
  const path = parts.join(separator);
  if (!root) return path;
  if (!path) return root;

  return root.endsWith("/") || root.endsWith("\\") ? `${root}${path}` : `${root}${separator}${path}`;
}

function localPathIsAbsolute(path: string) {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/u.test(path);
}

function resolveLocalPath(src: string, documentPath: string) {
  const normalizedDocumentPath = normalizeWindowsVerbatimPath(documentPath);
  const decodedSrc = normalizeWindowsVerbatimPath(decodeMarkdownImagePath(src));
  const separator = documentSeparator(documentPath);

  if (localPathIsAbsolute(decodedSrc)) {
    return decodedSrc;
  }

  const directory = documentDirectory(normalizedDocumentPath);
  const { root, rest } = splitLocalPathRoot(directory, separator);
  const parts = [...rest.split(/[\\/]/u), ...decodedSrc.split(/[\\/]/u)];
  const resolvedParts: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolvedParts.pop();
      continue;
    }
    resolvedParts.push(part);
  }

  return joinLocalPath(root, resolvedParts, separator);
}

export function createMarkdownImageSrcResolver(
  documentPath: string | null | undefined,
  options: MarkdownImageSrcResolverOptions & Required<Pick<MarkdownImageSrcResolverOptions, "resolveLocalSrc">>
): (src: string) => string | Promise<string>;
export function createMarkdownImageSrcResolver(
  documentPath: string | null | undefined,
  options?: Omit<MarkdownImageSrcResolverOptions, "resolveLocalSrc">
): (src: string) => string;
export function createMarkdownImageSrcResolver(
  documentPath: string | null | undefined,
  options: MarkdownImageSrcResolverOptions = {}
) {
  const toFileSrc = options.convertFileSrc ?? convertFileSrc;

  return (src: string) => {
    if (!documentPath || isRemoteOrEmbeddedImageSrc(src, documentPath)) return src;
    const runtimeSrc = options.resolveLocalSrc?.({ documentPath, src });
    if (runtimeSrc !== null && runtimeSrc !== undefined) return runtimeSrc;
    if (!options.convertFileSrc && !hasTauriRuntime()) return src;

    return toFileSrc(resolveLocalPath(src, documentPath));
  };
}
