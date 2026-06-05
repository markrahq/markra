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
  unreadableFileCount: number;
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

const defaultMaxMatches = 80;
const defaultMaxMatchesPerFile = 8;
const snippetMaxLength = 96;

export function isWorkspaceSearchableFile(file: WorkspaceSearchFile) {
  return file.kind !== "asset" && file.kind !== "folder";
}

export async function searchWorkspaceFiles(
  files: readonly WorkspaceSearchFile[],
  query: string,
  options: WorkspaceSearchOptions
): Promise<WorkspaceSearchResponse> {
  const normalizedQuery = query.trim();
  const searchableFiles = files.filter(isWorkspaceSearchableFile);
  const maxMatches = Math.max(0, options.maxMatches ?? defaultMaxMatches);
  const maxMatchesPerFile = Math.max(0, options.maxMatchesPerFile ?? defaultMaxMatchesPerFile);

  if (!normalizedQuery || maxMatches === 0 || maxMatchesPerFile === 0) {
    return {
      results: [],
      searchedFileCount: searchableFiles.length,
      unreadableFileCount: 0
    };
  }

  const searched = await Promise.all(
    searchableFiles.map(async (file) => {
      try {
        const read = await options.readFile(file.path);

        return {
          file,
          matches: findWorkspaceSearchResults(file, read.content, normalizedQuery, {
            caseSensitive: options.caseSensitive,
            maxMatchesPerFile
          }),
          unreadable: false
        };
      } catch {
        return {
          file,
          matches: [] as WorkspaceSearchResult[],
          unreadable: true
        };
      }
    })
  );

  const results: WorkspaceSearchResult[] = [];
  const unreadableFileCount = searched.filter((item) => item.unreadable).length;

  for (const item of searched) {
    for (const match of item.matches) {
      if (results.length >= maxMatches) break;
      results.push(match);
    }

    if (results.length >= maxMatches) break;
  }

  return {
    results,
    searchedFileCount: searchableFiles.length,
    unreadableFileCount
  };
}

function findWorkspaceSearchResults(
  file: WorkspaceSearchFile,
  content: string,
  query: string,
  options: { caseSensitive?: boolean; maxMatchesPerFile: number }
) {
  const ranges = findSearchRanges(content, query, {
    caseSensitive: options.caseSensitive
  }).slice(0, options.maxMatchesPerFile);

  return ranges.map((range, matchIndex) => {
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
