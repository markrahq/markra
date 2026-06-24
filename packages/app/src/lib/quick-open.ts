import type { NativeMarkdownFolderFile } from "./tauri";

export type QuickOpenMatchRange = {
  from: number;
  to: number;
};

export type QuickOpenResult = {
  current: boolean;
  file: NativeMarkdownFolderFile;
  nameMatches: QuickOpenMatchRange[];
  open: boolean;
  pathMatches: QuickOpenMatchRange[];
};

type QuickOpenOptions = {
  currentPath?: string | null;
  limit?: number;
  openFilePaths?: readonly string[];
};

type ScoredQuickOpenResult = QuickOpenResult & {
  order: number;
  score: number;
};

const pathSeparatorPattern = /[\\/]+/gu;
const whitespacePattern = /\s+/gu;

export function quickOpenFiles(
  files: readonly NativeMarkdownFolderFile[],
  query: string,
  options: QuickOpenOptions = {}
): QuickOpenResult[] {
  const normalizedQuery = normalizeQuery(query);
  const openFilePathRanks = new Map(
    (options.openFilePaths ?? [])
      .filter((path) => path.trim().length > 0)
      .map((path, index) => [path, index])
  );
  const scoredResults = files.flatMap((file, order): ScoredQuickOpenResult[] => {
    if (!isQuickOpenFile(file)) return [];

    const current = Boolean(options.currentPath && file.path === options.currentPath);
    const open = current || openFilePathRanks.has(file.path);

    if (!normalizedQuery) {
      return [{
        current,
        file,
        nameMatches: [],
        open,
        order,
        pathMatches: [],
        score: emptyQueryScore(file, current, openFilePathRanks)
      }];
    }

    const nameMatch = fuzzyMatch(file.name, normalizedQuery);
    const pathMatch = fuzzyMatch(normalizeDisplayPath(file.relativePath), normalizedQuery);
    if (!nameMatch && !pathMatch) return [];

    const nameScore = nameMatch ? nameMatch.score : Number.POSITIVE_INFINITY;
    const pathScore = pathMatch ? pathMatch.score + 500 : Number.POSITIVE_INFINITY;
    const usingNameMatch = nameScore <= pathScore;

    return [{
      current,
      file,
      nameMatches: usingNameMatch && nameMatch ? nameMatch.ranges : [],
      open,
      order,
      pathMatches: usingNameMatch ? [] : pathMatch?.ranges ?? [],
      score: Math.min(nameScore, pathScore) - (current ? 12 : open ? 6 : 0)
    }];
  });

  return scoredResults
    .sort((left, right) => compareQuickOpenResults(left, right))
    .slice(0, options.limit ?? scoredResults.length)
    .map(({ score: _score, order: _order, ...result }) => result);
}

function isQuickOpenFile(file: NativeMarkdownFolderFile) {
  return file.kind !== "asset" && file.kind !== "attachment" && file.kind !== "folder";
}

function normalizeDisplayPath(path: string) {
  return path.replace(pathSeparatorPattern, "/");
}

function normalizeQuery(query: string) {
  return query.trim().replace(whitespacePattern, "").toLocaleLowerCase();
}

function normalizeMatchText(text: string) {
  return text.toLocaleLowerCase();
}

function emptyQueryScore(
  file: NativeMarkdownFolderFile,
  current: boolean,
  openFilePathRanks: ReadonlyMap<string, number>
) {
  if (current) return -2;

  const openRank = openFilePathRanks.get(file.path);
  if (openRank !== undefined) return openRank;

  return 10_000;
}

function fuzzyMatch(text: string, query: string) {
  const normalizedText = normalizeMatchText(text);
  const contiguousIndex = normalizedText.indexOf(query);

  if (contiguousIndex >= 0) {
    return {
      ranges: [{ from: contiguousIndex, to: contiguousIndex + query.length }],
      score: contiguousIndex === 0 ? query.length : 50 + contiguousIndex
    };
  }

  const ranges: QuickOpenMatchRange[] = [];
  let textCursor = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (const queryCharacter of query) {
    const matchIndex = normalizedText.indexOf(queryCharacter, textCursor);
    if (matchIndex < 0) return null;

    if (firstMatch < 0) firstMatch = matchIndex;
    lastMatch = matchIndex;
    ranges.push({ from: matchIndex, to: matchIndex + 1 });
    textCursor = matchIndex + 1;
  }

  return {
    ranges: mergeAdjacentRanges(ranges),
    score: 1_000 + firstMatch + Math.max(0, lastMatch - firstMatch - query.length)
  };
}

function mergeAdjacentRanges(ranges: QuickOpenMatchRange[]) {
  const merged: QuickOpenMatchRange[] = [];

  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && previous.to === range.from) {
      previous.to = range.to;
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function compareQuickOpenResults(left: ScoredQuickOpenResult, right: ScoredQuickOpenResult) {
  if (left.score !== right.score) return left.score - right.score;

  const nameComparison = left.file.name.localeCompare(right.file.name, undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (nameComparison !== 0) return nameComparison;

  const pathComparison = left.file.relativePath.localeCompare(right.file.relativePath, undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (pathComparison !== 0) return pathComparison;

  return left.order - right.order;
}
