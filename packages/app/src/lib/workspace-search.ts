import { findSearchRanges, type SearchRange } from "@markra/shared";
import type { NativeMarkdownFolderFile } from "./tauri";

export type WorkspaceSearchFile = Pick<NativeMarkdownFolderFile, "kind" | "name" | "path" | "relativePath">;

export type WorkspaceSearchResult = {
  columnNumber: number;
  file: WorkspaceSearchFile;
  id: string;
  lineNumber: number;
  lineText: string;
  match: SearchRange;
  matchIndex: number;
  snippet: string;
};

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

  return {
    results,
    searchedFileCount: searchableFiles.length,
    truncated: truncatedByFileLimit || (maxMatches !== undefined && collectedMatchCount > maxMatches),
    unreadableFileCount
  };
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
    } satisfies WorkspaceSearchResult;
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
