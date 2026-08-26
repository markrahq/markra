import { findSearchRanges, type SearchRange } from "@markra/shared";
import type { NativeMarkdownFolderFile } from "./tauri";

export type WorkspaceSearchFile = Pick<NativeMarkdownFolderFile, "kind" | "name" | "path" | "relativePath">;

export type WorkspaceSearchContentResult = {
  columnNumber: number;
  file: WorkspaceSearchFile;
  id: string;
  kind?: "content";
  lineNumber: number;
  lineText: string;
  match: SearchRange;
  matchIndex: number;
  snippet: string;
};

export type WorkspaceSearchFileNameResult = {
  file: WorkspaceSearchFile;
  id: string;
  kind: "fileName";
};

export type WorkspaceSearchResult = WorkspaceSearchContentResult | WorkspaceSearchFileNameResult;

export type WorkspaceSearchResponse = {
  results: WorkspaceSearchResult[];
  searchedFileCount: number;
  truncated: boolean;
  unreadableFileCount: number;
};

export type WorkspaceSearchRequest = {
  caseSensitive?: boolean;
  currentDocument?: {
    content: string;
    path: string;
  } | null;
  globalIgnoreRules?: string | null;
  maxMatches?: number;
  maxMatchesPerFile?: number;
  path: string;
  query: string;
};

type WorkspaceSearchReadResult = {
  content: string;
  path: string;
};

type WorkspaceSearchOptions = {
  caseSensitive?: boolean;
  maxMatches?: number;
  maxMatchesPerFile?: number;
  readFile: (path: string) => Promise<WorkspaceSearchReadResult>;
};

const snippetMaxLength = 96;

export function isWorkspaceSearchableFile(file: WorkspaceSearchFile) {
  return file.kind !== "asset" && file.kind !== "attachment" && file.kind !== "folder";
}

export function isWorkspaceFileNameSearchResult(
  result: WorkspaceSearchResult
): result is WorkspaceSearchFileNameResult {
  return result.kind === "fileName";
}

// Merge names after content search so native and browser fallbacks share one result contract
// without making the native content index return synthetic line matches.
export function mergeWorkspaceFileNameMatches(
  response: WorkspaceSearchResponse,
  files: readonly WorkspaceSearchFile[],
  query: string,
  options: {
    caseSensitive?: boolean;
    maxMatches?: number;
    maxMatchesPerFile?: number;
  } = {}
): WorkspaceSearchResponse {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return response;

  const searchableFiles = files.filter(isWorkspaceSearchableFile);
  const matchingFilePaths = new Set(searchableFiles.flatMap((file) => {
    const matchesNameOrPath = [file.name, file.relativePath].some((candidate) =>
      findSearchRanges(candidate, normalizedQuery, {
        caseSensitive: options.caseSensitive,
        maxMatches: 1
      }).length > 0
    );

    return matchesNameOrPath ? [file.path] : [];
  }));
  if (matchingFilePaths.size === 0) return response;

  const contentResultsByPath = new Map<string, WorkspaceSearchContentResult[]>();
  const resultFilesByPath = new Map<string, WorkspaceSearchFile>();

  response.results.forEach((result) => {
    if (isWorkspaceFileNameSearchResult(result)) return;

    resultFilesByPath.set(result.file.path, result.file);
    const fileResults = contentResultsByPath.get(result.file.path);
    if (fileResults) {
      fileResults.push(result);
    } else {
      contentResultsByPath.set(result.file.path, [result]);
    }
  });

  const fileNameMatchedFiles = searchableFiles.filter((file) => matchingFilePaths.has(file.path));
  const contentOnlyFiles = searchableFiles.filter((file) => (
    !matchingFilePaths.has(file.path) && contentResultsByPath.has(file.path)
  ));
  const orderedPaths: string[] = [];
  const orderedPathSet = new Set<string>();
  const addOrderedPath = (path: string) => {
    if (orderedPathSet.has(path)) return;

    orderedPathSet.add(path);
    orderedPaths.push(path);
  };

  fileNameMatchedFiles.forEach((file) => addOrderedPath(file.path));
  contentOnlyFiles.forEach((file) => addOrderedPath(file.path));
  response.results.forEach((result) => {
    if (!isWorkspaceFileNameSearchResult(result)) addOrderedPath(result.file.path);
  });

  const filesByPath = new Map(searchableFiles.map((file) => [file.path, file]));
  const maxMatches = options.maxMatches === undefined ? undefined : Math.max(0, options.maxMatches);
  const maxMatchesPerFile = options.maxMatchesPerFile === undefined
    ? undefined
    : Math.max(0, options.maxMatchesPerFile);
  const results: WorkspaceSearchResult[] = [];
  let truncated = response.truncated;

  for (const path of orderedPaths) {
    const file = filesByPath.get(path) ?? resultFilesByPath.get(path);
    if (!file) continue;

    const fileResults: WorkspaceSearchResult[] = [];
    if (matchingFilePaths.has(path)) {
      fileResults.push({
        file,
        id: `file-name:${file.path}`,
        kind: "fileName"
      });
    }

    const contentResults = contentResultsByPath.get(path) ?? [];
    const remainingFileResultCount = maxMatchesPerFile === undefined
      ? contentResults.length
      : Math.max(0, maxMatchesPerFile - fileResults.length);
    if (contentResults.length > remainingFileResultCount) truncated = true;
    fileResults.push(...contentResults.slice(0, remainingFileResultCount));

    const remainingResultCount = maxMatches === undefined
      ? fileResults.length
      : Math.max(0, maxMatches - results.length);
    if (fileResults.length > remainingResultCount) truncated = true;
    results.push(...fileResults.slice(0, remainingResultCount));

    if (maxMatches !== undefined && results.length >= maxMatches) {
      if (orderedPaths.at(-1) !== path) truncated = true;
      break;
    }
  }

  return {
    ...response,
    results,
    truncated
  };
}

export async function searchWorkspaceFiles(
  files: readonly WorkspaceSearchFile[],
  query: string,
  options: WorkspaceSearchOptions
): Promise<WorkspaceSearchResponse> {
  const normalizedQuery = query.trim();
  const searchableFiles = files.filter(isWorkspaceSearchableFile);
  const maxMatches = options.maxMatches === undefined ? undefined : Math.max(0, options.maxMatches);
  const maxMatchesPerFile = options.maxMatchesPerFile === undefined ? undefined : Math.max(0, options.maxMatchesPerFile);

  if (!normalizedQuery || maxMatches === 0 || maxMatchesPerFile === 0) {
    return {
      results: [],
      searchedFileCount: searchableFiles.length,
      truncated: false,
      unreadableFileCount: 0
    };
  }

  const searched = await Promise.all(
    searchableFiles.map(async (file) => {
      try {
        const read = await options.readFile(file.path);

        return {
          file,
          ...findWorkspaceSearchResults(file, read.content, normalizedQuery, {
            caseSensitive: options.caseSensitive,
            maxMatchesPerFile
          }),
          unreadable: false
        };
      } catch {
        return {
          file,
          matches: [] as WorkspaceSearchResult[],
          truncated: false,
          unreadable: true
        };
      }
    })
  );

  const results: WorkspaceSearchResult[] = [];
  const unreadableFileCount = searched.filter((item) => item.unreadable).length;
  const collectedMatchCount = searched.reduce((count, item) => count + item.matches.length, 0);
  const truncatedByFileLimit = searched.some((item) => item.truncated);

  for (const item of searched) {
    for (const match of item.matches) {
      if (maxMatches !== undefined && results.length >= maxMatches) break;
      results.push(match);
    }

    if (maxMatches !== undefined && results.length >= maxMatches) break;
  }

  return mergeWorkspaceFileNameMatches({
    results,
    searchedFileCount: searchableFiles.length,
    truncated: truncatedByFileLimit || (maxMatches !== undefined && collectedMatchCount > maxMatches),
    unreadableFileCount
  }, searchableFiles, normalizedQuery, {
    caseSensitive: options.caseSensitive,
    maxMatches,
    maxMatchesPerFile
  });
}

function findWorkspaceSearchResults(
  file: WorkspaceSearchFile,
  content: string,
  query: string,
  options: { caseSensitive?: boolean; maxMatchesPerFile?: number }
) {
  const searchLimit = options.maxMatchesPerFile === undefined ? undefined : options.maxMatchesPerFile + 1;
  const ranges = findSearchRanges(content, query, {
    caseSensitive: options.caseSensitive,
    maxMatches: searchLimit
  });
  const truncated = options.maxMatchesPerFile !== undefined && ranges.length > options.maxMatchesPerFile;

  const visibleRanges = options.maxMatchesPerFile === undefined ? ranges : ranges.slice(0, options.maxMatchesPerFile);
  const results = visibleRanges.map((range, matchIndex) => {
    const line = lineForSearchRange(content, range);

    return {
      columnNumber: line.columnNumber,
      file,
      id: `${file.path}:${range.from}`,
      lineNumber: line.lineNumber,
      lineText: line.text,
      match: range,
      matchIndex,
      snippet: workspaceSearchSnippet(line.text, line.columnNumber, range.to - range.from)
    } satisfies WorkspaceSearchContentResult;
  });

  return {
    matches: results,
    truncated
  };
}

function lineForSearchRange(content: string, range: SearchRange) {
  const lineStart = content.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const lineEndIndex = content.indexOf("\n", range.from);
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : content.length;
  const lineNumber = content.slice(0, range.from).split("\n").length;

  return {
    columnNumber: range.from - lineStart + 1,
    lineNumber,
    text: content.slice(lineStart, lineEnd)
  };
}

function workspaceSearchSnippet(lineText: string, columnNumber: number, matchLength: number) {
  const normalizedLine = lineText.trimEnd();
  if (normalizedLine.length <= snippetMaxLength) return normalizedLine;

  const matchStart = Math.max(0, columnNumber - 1);
  const matchEnd = matchStart + matchLength;
  const radius = Math.floor((snippetMaxLength - matchLength) / 2);
  const start = Math.max(0, matchStart - radius);
  const end = Math.min(normalizedLine.length, matchEnd + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedLine.length ? "..." : "";

  return `${prefix}${normalizedLine.slice(start, end)}${suffix}`;
}
