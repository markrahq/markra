import {
  findSearchRanges,
  parseWorkspaceSearchQuery,
  type SearchRange,
  type WorkspaceSearchQueryGroup,
  type WorkspaceSearchQueryPlan,
  type WorkspaceSearchTerm
} from "@markra/shared";
import type { NativeMarkdownFolderFile } from "./tauri";

export type WorkspaceSearchFile = Pick<
  NativeMarkdownFolderFile,
  "createdAt" | "kind" | "modifiedAt" | "name" | "path" | "relativePath"
>;

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

export type WorkspaceSearchSortOrder =
  | "created-asc"
  | "created-desc"
  | "modified-asc"
  | "modified-desc"
  | "path-asc"
  | "path-desc";

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

type WorkspaceSearchFilePlanState =
  | {
      group: WorkspaceSearchQueryGroup;
      kind: "fileOnly";
    }
  | {
      groups: WorkspaceSearchQueryGroup[];
      kind: "needsContent";
    }
  | {
      kind: "noMatch";
    };

type WorkspaceSearchMatchedRange = {
  lineText: string;
  range: SearchRange;
};

export function isWorkspaceSearchableFile(file: WorkspaceSearchFile) {
  return file.kind !== "asset" && file.kind !== "folder";
}

export async function searchWorkspaceFiles(
  files: readonly WorkspaceSearchFile[],
  query: string,
  options: WorkspaceSearchOptions
): Promise<WorkspaceSearchResponse> {
  const normalizedQuery = query.trim();
  const queryPlan = parseWorkspaceSearchQuery(normalizedQuery, {
    caseSensitive: options.caseSensitive
  });
  const searchableFiles = files.filter(isWorkspaceSearchableFile);
  const maxMatches = options.maxMatches === undefined ? undefined : Math.max(0, options.maxMatches);
  const maxMatchesPerFile = options.maxMatchesPerFile === undefined ? undefined : Math.max(0, options.maxMatchesPerFile);

  if (!queryPlan || maxMatches === 0 || maxMatchesPerFile === 0) {
    return {
      results: [],
      searchedFileCount: searchableFiles.length,
      truncated: false,
      unreadableFileCount: 0
    };
  }

  const searched = await Promise.all(
    searchableFiles.map(async (file) => {
      const filePlanState = workspaceSearchFilePlanState(file, queryPlan);
      if (filePlanState.kind === "noMatch") {
        return {
          file,
          matches: [] as WorkspaceSearchResult[],
          truncated: false,
          unreadable: false
        };
      }

      if (filePlanState.kind === "fileOnly") {
        return {
          file,
          matches: [fileOnlyWorkspaceSearchResult(file, filePlanState.group)],
          truncated: false,
          unreadable: false
        };
      }

      try {
        const read = await options.readFile(file.path);

        return {
          file,
          ...findWorkspaceSearchResults(file, read.content, queryPlan, {
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
  queryPlan: WorkspaceSearchQueryPlan,
  options: { maxMatchesPerFile?: number }
) {
  const searchLimit = options.maxMatchesPerFile === undefined ? undefined : options.maxMatchesPerFile + 1;
  const ranges = workspaceSearchMatchedContentRanges(file, content, queryPlan, searchLimit);
  const truncated = options.maxMatchesPerFile !== undefined && ranges.length > options.maxMatchesPerFile;

  const visibleRanges = options.maxMatchesPerFile === undefined ? ranges : ranges.slice(0, options.maxMatchesPerFile);
  const results = visibleRanges.map((match, matchIndex) => {
    const line = lineForSearchRange(match.lineText, match.range);

    return {
      columnNumber: line.columnNumber,
      file,
      id: `${file.path}:${match.range.from}`,
      lineNumber: line.lineNumber,
      lineText: line.text,
      match: match.range,
      matchIndex,
      snippet: workspaceSearchSnippet(line.text, line.columnNumber, match.range.to - match.range.from)
    } satisfies WorkspaceSearchResult;
  });

  return {
    matches: results,
    truncated
  };
}

function workspaceSearchFilePlanState(
  file: WorkspaceSearchFile,
  queryPlan: WorkspaceSearchQueryPlan
): WorkspaceSearchFilePlanState {
  const contentGroups: WorkspaceSearchQueryGroup[] = [];

  for (const group of queryPlan.groups) {
    const state = workspaceSearchGroupFileState(file, group);

    if (state === "fileOnly") {
      return {
        group,
        kind: "fileOnly"
      };
    }

    if (state === "needsContent") {
      contentGroups.push(group);
    }
  }

  if (contentGroups.length === 0) return { kind: "noMatch" };

  return {
    groups: contentGroups,
    kind: "needsContent"
  };
}

function workspaceSearchGroupFileState(file: WorkspaceSearchFile, group: WorkspaceSearchQueryGroup) {
  const fileScopedIncludes = group.include.filter((term) => term.scope !== "content");
  const fileScopedExcludes = group.exclude.filter((term) => term.scope !== "content");

  if (!fileScopedIncludes.every((term) => workspaceSearchTermMatchesFile(file, term))) return "noMatch";
  if (fileScopedExcludes.some((term) => workspaceSearchTermMatchesFile(file, term))) return "noMatch";

  const needsContent = group.include.some((term) => term.scope === "content")
    || group.exclude.some((term) => term.scope === "content");

  return needsContent ? "needsContent" : "fileOnly";
}

function workspaceSearchMatchedContentRanges(
  file: WorkspaceSearchFile,
  content: string,
  queryPlan: WorkspaceSearchQueryPlan,
  maxMatches?: number
) {
  const ranges: WorkspaceSearchMatchedRange[] = [];
  const seen = new Set<string>();

  for (const group of queryPlan.groups) {
    if (!workspaceSearchGroupMatches(file, content, group)) continue;

    const contentTerms = group.include.filter((term) => term.scope === "content");
    if (contentTerms.length === 0) {
      ranges.push(fileOnlyWorkspaceSearchRange(file, group));
    }

    contentTerms.forEach((term) => {
      findSearchRanges(content, term.query, {
        caseSensitive: term.caseSensitive,
        maxMatches
      }).forEach((range) => {
        const key = `${range.from}:${range.to}`;
        if (seen.has(key)) return;

        seen.add(key);
        ranges.push({
          lineText: content,
          range
        });
      });
    });
  }

  ranges.sort((left, right) => left.range.from - right.range.from || left.range.to - right.range.to);

  return maxMatches === undefined ? ranges : ranges.slice(0, maxMatches);
}

function workspaceSearchGroupMatches(
  file: WorkspaceSearchFile,
  content: string,
  group: WorkspaceSearchQueryGroup
) {
  return group.include.every((term) => workspaceSearchTermMatches(file, content, term))
    && !group.exclude.some((term) => workspaceSearchTermMatches(file, content, term));
}

function workspaceSearchTermMatches(
  file: WorkspaceSearchFile,
  content: string,
  term: WorkspaceSearchTerm
) {
  if (term.scope === "content") {
    return findSearchRanges(content, term.query, {
      caseSensitive: term.caseSensitive,
      maxMatches: 1
    }).length > 0;
  }

  return workspaceSearchTermMatchesFile(file, term);
}

function workspaceSearchTermMatchesFile(file: WorkspaceSearchFile, term: WorkspaceSearchTerm) {
  return findSearchRanges(workspaceSearchFileFieldValue(file, term.scope), term.query, {
    caseSensitive: term.caseSensitive,
    maxMatches: 1
  }).length > 0;
}

function fileOnlyWorkspaceSearchResult(
  file: WorkspaceSearchFile,
  group: WorkspaceSearchQueryGroup
): WorkspaceSearchResult {
  const match = fileOnlyWorkspaceSearchRange(file, group);
  const line = lineForSearchRange(match.lineText, match.range);

  return {
    columnNumber: line.columnNumber,
    file,
    id: `${file.path}:file`,
    lineNumber: line.lineNumber,
    lineText: line.text,
    match: match.range,
    matchIndex: 0,
    snippet: workspaceSearchSnippet(line.text, line.columnNumber, match.range.to - match.range.from)
  };
}

function fileOnlyWorkspaceSearchRange(
  file: WorkspaceSearchFile,
  group: WorkspaceSearchQueryGroup
): WorkspaceSearchMatchedRange {
  const term = group.include.find((candidate) => candidate.scope !== "content");
  const lineText = term ? workspaceSearchFileFieldValue(file, term.scope) : file.relativePath;
  const range = term
    ? findSearchRanges(lineText, term.query, {
        caseSensitive: term.caseSensitive,
        maxMatches: 1
      })[0]
    : null;

  return {
    lineText,
    range: range ?? {
      from: 0,
      to: lineText.length
    }
  };
}

function workspaceSearchFileFieldValue(file: WorkspaceSearchFile, scope: WorkspaceSearchTerm["scope"]) {
  if (scope === "file") return file.name;

  return file.relativePath;
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
