export type SearchRange = {
  from: number;
  to: number;
};

export type SearchOptions = {
  caseSensitive?: boolean;
  maxMatches?: number;
  regularExpression?: boolean;
};

type RegularExpressionMode = "global" | "sticky";

function regularExpressionFlags(options: SearchOptions, mode: RegularExpressionMode) {
  return `${mode === "global" ? "g" : ""}${options.caseSensitive ? "" : "i"}mu${mode === "sticky" ? "y" : ""}`;
}

function createRegularExpression(
  query: string,
  options: SearchOptions,
  mode: RegularExpressionMode
) {
  try {
    return new RegExp(query, regularExpressionFlags(options, mode));
  } catch {
    return null;
  }
}

function nextStringIndex(text: string, index: number) {
  if (index >= text.length) return text.length + 1;

  return index + (text.codePointAt(index)! > 0xffff ? 2 : 1);
}

export function isValidSearchQuery(query: string, options: SearchOptions = {}) {
  return !options.regularExpression || createRegularExpression(query, options, "global") !== null;
}

function findRegularExpressionRanges(
  text: string,
  query: string,
  options: SearchOptions,
  maxMatches: number
) {
  const expression = createRegularExpression(query, options, "global");
  if (!expression) return [];

  const ranges: SearchRange[] = [];
  let match = expression.exec(text);

  while (match) {
    ranges.push({
      from: match.index,
      to: match.index + match[0].length
    });
    if (ranges.length >= maxMatches) return ranges;

    if (match[0].length === 0) {
      // RegExp.exec does not advance after an empty match, so move by one
      // Unicode code point to keep anchors and lookarounds from looping.
      expression.lastIndex = nextStringIndex(text, match.index);
    }
    match = expression.exec(text);
  }

  return ranges;
}

export function findSearchRanges(text: string, query: string, options: SearchOptions = {}): SearchRange[] {
  if (!query) return [];

  const ranges: SearchRange[] = [];
  const maxMatches = Math.max(0, options.maxMatches ?? Number.POSITIVE_INFINITY);
  if (maxMatches === 0) return ranges;
  if (options.regularExpression) {
    return findRegularExpressionRanges(text, query, options, maxMatches);
  }

  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  let from = 0;

  while (from <= text.length - query.length) {
    const candidate = text.slice(from, from + query.length);
    const matches = options.caseSensitive
      ? candidate === query
      : candidate.toLocaleLowerCase() === needle;

    if (matches) {
      ranges.push({
        from,
        to: from + query.length
      });
      if (ranges.length >= maxMatches) return ranges;
      from += Math.max(1, query.length);
      continue;
    }

    from += 1;
  }

  return ranges;
}

export function resolveSearchReplacement(
  text: string,
  range: SearchRange,
  query: string,
  replacement: string,
  options: SearchOptions = {}
) {
  if (!options.regularExpression) return replacement;

  // Keep the full input available so lookbehind and JavaScript replacement
  // tokens such as $`, $', $1, and $<name> retain their native semantics.
  const expression = createRegularExpression(query, options, "sticky");
  if (!expression) return replacement;

  expression.lastIndex = range.from;
  const match = expression.exec(text);
  if (
    !match
    || match.index !== range.from
    || match.index + match[0].length !== range.to
  ) {
    return replacement;
  }

  expression.lastIndex = range.from;
  const replacedText = text.replace(expression, replacement);
  const suffixLength = text.length - range.to;
  return replacedText.slice(range.from, replacedText.length - suffixLength);
}

export function normalizeSearchIndex(index: number, count: number) {
  if (count <= 0) return -1;

  return ((index % count) + count) % count;
}
