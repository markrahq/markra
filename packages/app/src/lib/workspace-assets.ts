import {
  parseMarkdownAssetReferences,
  type MarkdownAssetReference,
  resolveMarkdownLocalPath
} from "@markra/markdown";
import { normalizeComparablePath } from "./path-move";

export type WorkspaceAssetFile = {
  createdAt?: number;
  kind?: "asset" | "attachment" | "folder";
  modifiedAt?: number;
  name: string;
  path: string;
  relativePath: string;
  sizeBytes?: number;
};

export type WorkspaceAssetDocumentContent = {
  content: string;
  path: string;
};

export type WorkspaceAssetIndex = {
  candidateAssets: WorkspaceAssetFile[];
  referencedAssets: WorkspaceAssetFile[];
  scannedDocumentCount: number;
  scannedDocuments: WorkspaceAssetFile[];
  unreadableDocuments: WorkspaceAssetFile[];
  unusedAssets: WorkspaceAssetFile[];
};

export type BuildWorkspaceAssetIndexOptions = {
  assets: readonly WorkspaceAssetFile[];
  dirtyDocuments?: readonly WorkspaceAssetDocumentContent[];
  documents: readonly WorkspaceAssetFile[];
  managedFolder: string;
  readFile: (path: string) => Promise<WorkspaceAssetDocumentContent>;
};

function normalizedPathParts(path: string) {
  return path
    .trim()
    .replace(/\\/gu, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
}

function normalizedManagedFolderParts(folder: string) {
  const parts = normalizedPathParts(folder);
  return parts.length > 0 ? parts : null;
}

function pathPartsAreEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

export function workspaceAssetIsManaged(
  relativePath: string,
  managedFolder: string,
  documentRelativePaths: readonly string[] = []
) {
  const managedParts = normalizedManagedFolderParts(managedFolder);
  if (!managedParts) return false;

  const directoryParts = normalizedPathParts(relativePath).slice(0, -1);
  return documentRelativePaths.some((documentPath) => {
    const documentDirectoryParts = normalizedPathParts(documentPath).slice(0, -1);
    return pathPartsAreEqual(directoryParts, [...documentDirectoryParts, ...managedParts]);
  });
}

function localFileUrlPath(href: string) {
  if (!/^file:/iu.test(href)) return null;

  try {
    const url = new URL(href);
    if (url.protocol !== "file:") return null;

    const decodedPath = decodeURI(url.pathname);
    if (url.host) return `//${url.host}${decodedPath}`;
    if (/^\/[a-z]:\//iu.test(decodedPath)) return decodedPath.slice(1);

    return decodedPath;
  } catch {
    return null;
  }
}

function resolvedWorkspaceAssetPath(href: string, documentPath: string) {
  const filePath = localFileUrlPath(href);
  if (filePath) return filePath;
  if (/^[a-z][a-z\d+.-]*:/iu.test(href) && !/^[a-z]:[\\/]/iu.test(href)) return null;

  return resolveMarkdownLocalPath(href, documentPath);
}

function comparablePathKey(path: string) {
  return normalizeComparablePath(path)?.normalize("NFC").toLocaleLowerCase() ?? null;
}

function comparableRelativePathKey(path: string) {
  const parts = normalizedPathParts(path);
  return parts.length > 0 ? parts.join("/").normalize("NFC").toLocaleLowerCase() : null;
}

function decodedReferencePath(href: string) {
  const path = href.split(/[?#]/u)[0] ?? href;

  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

type WorkspaceAssetLookup = {
  absolutePaths: Map<string, WorkspaceAssetFile[]>;
  relativeEntries: Array<readonly [string, WorkspaceAssetFile]>;
  relativePaths: Map<string, WorkspaceAssetFile[]>;
};

function appendAssetLookupEntry(
  lookup: Map<string, WorkspaceAssetFile[]>,
  key: string | null,
  asset: WorkspaceAssetFile
) {
  if (!key) return;

  const matches = lookup.get(key) ?? [];
  matches.push(asset);
  lookup.set(key, matches);
}

function createWorkspaceAssetLookup(assets: readonly WorkspaceAssetFile[]): WorkspaceAssetLookup {
  const absolutePaths = new Map<string, WorkspaceAssetFile[]>();
  const relativePaths = new Map<string, WorkspaceAssetFile[]>();
  const relativeEntries: Array<readonly [string, WorkspaceAssetFile]> = [];

  assets.forEach((asset) => {
    appendAssetLookupEntry(absolutePaths, comparablePathKey(asset.path), asset);
    const relativeKey = comparableRelativePathKey(asset.relativePath);
    appendAssetLookupEntry(relativePaths, relativeKey, asset);
    if (relativeKey) relativeEntries.push([relativeKey, asset]);
  });

  return { absolutePaths, relativeEntries, relativePaths };
}

function referencedWorkspaceAssets(
  reference: MarkdownAssetReference,
  document: WorkspaceAssetFile,
  lookup: WorkspaceAssetLookup
) {
  const matches = new Set<WorkspaceAssetFile>();
  const addMatches = (assets: readonly WorkspaceAssetFile[] | undefined) => {
    assets?.forEach((asset) => matches.add(asset));
  };
  const resolvedPath = resolvedWorkspaceAssetPath(reference.href, document.path);
  if (resolvedPath) addMatches(lookup.absolutePaths.get(comparablePathKey(resolvedPath) ?? ""));

  const hrefPath = decodedReferencePath(reference.href);
  if (/^[a-z][a-z\d+.-]*:/iu.test(hrefPath) && !/^[a-z]:[\\/]/iu.test(hrefPath)) {
    return matches;
  }

  const rootRelativeKey = comparableRelativePathKey(hrefPath.replace(/^[/\\]+/u, ""));
  if (hrefPath.startsWith("/") || hrefPath.startsWith("\\")) {
    addMatches(lookup.relativePaths.get(rootRelativeKey ?? ""));
  }

  if (reference.kind !== "wiki" || !rootRelativeKey) return matches;

  // Wiki embeds are resolved differently across Markdown tools. Treat every
  // suffix match as referenced so ambiguity can never turn into data loss.
  lookup.relativeEntries.forEach(([assetRelativeKey, asset]) => {
    if (
      assetRelativeKey === rootRelativeKey ||
      assetRelativeKey.endsWith(`/${rootRelativeKey}`)
    ) {
      matches.add(asset);
    }
  });

  return matches;
}

function uniqueWorkspaceFiles(files: readonly WorkspaceAssetFile[]) {
  const filesByPath = new Map<string, WorkspaceAssetFile>();

  files.forEach((file) => {
    const key = comparablePathKey(file.path);
    if (key && !filesByPath.has(key)) filesByPath.set(key, file);
  });

  return Array.from(filesByPath.values());
}

export async function buildWorkspaceAssetIndex({
  assets,
  dirtyDocuments = [],
  documents,
  managedFolder,
  readFile
}: BuildWorkspaceAssetIndexOptions): Promise<WorkspaceAssetIndex> {
  const scannedDocuments = uniqueWorkspaceFiles(documents);
  const documentRelativePaths = scannedDocuments.map((document) => document.relativePath);
  const candidateAssets = uniqueWorkspaceFiles(
    assets.filter((file) => (
      file.kind === "asset" &&
      workspaceAssetIsManaged(file.relativePath, managedFolder, documentRelativePaths)
    ))
  );
  const candidateLookup = createWorkspaceAssetLookup(candidateAssets);

  const dirtyContents = new Map(
    dirtyDocuments.flatMap((document) => {
      const key = comparablePathKey(document.path);
      return key ? [[key, document] as const] : [];
    })
  );
  const referencedPaths = new Set<string>();
  const unreadableDocuments: WorkspaceAssetFile[] = [];
  let scannedDocumentCount = 0;

  await Promise.all(scannedDocuments.map(async (document) => {
    const documentKey = comparablePathKey(document.path);
    const dirtyDocument = documentKey ? dirtyContents.get(documentKey) : null;

    try {
      const read = dirtyDocument ?? await readFile(document.path);
      scannedDocumentCount += 1;

      parseMarkdownAssetReferences(read.content).forEach((reference) => {
        referencedWorkspaceAssets(reference, document, candidateLookup).forEach((asset) => {
          const key = comparablePathKey(asset.path);
          if (key) referencedPaths.add(key);
        });
      });
    } catch {
      unreadableDocuments.push(document);
    }
  }));

  const referencedAssets = candidateAssets.filter((asset) => {
    const key = comparablePathKey(asset.path);
    return key ? referencedPaths.has(key) : false;
  });
  const unusedAssets = candidateAssets.filter((asset) => {
    const key = comparablePathKey(asset.path);
    return key ? !referencedPaths.has(key) : false;
  });

  return {
    candidateAssets,
    referencedAssets,
    scannedDocumentCount,
    scannedDocuments,
    unreadableDocuments,
    unusedAssets
  };
}
