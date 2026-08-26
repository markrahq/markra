export type SearchRange = {
  from: number;
  to: number;
};

type SearchOptions = {
  caseSensitive?: boolean;
  maxMatches?: number;
};

export function findSearchRanges(text: string, query: string, options: SearchOptions = {}): SearchRange[] {
  if (!query) return [];

  const maxMatches = Math.max(0, options.maxMatches ?? Number.POSITIVE_INFINITY);
  if (maxMatches === 0) return [];

  if (options.caseSensitive) {
    return searchRangesInText(text, query, maxMatches);
  }

  const normalizedText = caseFoldSearchText(text);
  const normalizedQuery = caseFoldSearchText(query);
  if (!normalizedQuery) return [];

  if (normalizedText.length === text.length && normalizedQuery.length === query.length) {
    return searchRangesInText(normalizedText, normalizedQuery, maxMatches);
  }

  const offsetMappedQuery = Array.from(query, caseFoldSearchText).join("");
  return searchRangesWithOriginalOffsets(text, offsetMappedQuery, maxMatches);
}

function caseFoldSearchText(value: string) {
  return value
    .toLocaleLowerCase()
    .replaceAll("ς", "σ")
    .replaceAll("ß", "ss");
}

function searchRangesInText(text: string, query: string, maxMatches: number) {
  const ranges: SearchRange[] = [];
  let from = 0;

  while (from <= text.length - query.length) {
    const matchFrom = text.indexOf(query, from);
    if (matchFrom < 0) break;

    ranges.push({
      from: matchFrom,
      to: matchFrom + query.length
    });
    if (ranges.length >= maxMatches) break;
    from = matchFrom + Math.max(1, query.length);
  }

  return ranges;
}

function searchRangesWithOriginalOffsets(text: string, normalizedQuery: string, maxMatches: number) {
  const normalizedCharacters: string[] = [];
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  let originalOffset = 0;

  for (const character of text) {
    const originalEnd = originalOffset + character.length;
    const normalizedCharacter = caseFoldSearchText(character);

    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      normalizedCharacters.push(normalizedCharacter[index] ?? "");
      originalStarts.push(originalOffset);
      originalEnds.push(originalEnd);
    }

    originalOffset = originalEnd;
  }

  const normalizedText = normalizedCharacters.join("");
  const normalizedRanges = searchRangesInText(normalizedText, normalizedQuery, maxMatches);
  const ranges: SearchRange[] = [];

  for (const range of normalizedRanges) {
    const from = originalStarts[range.from];
    const to = originalEnds[range.to - 1];
    if (from === undefined || to === undefined) continue;

    const previousRange = ranges.at(-1);
    if (previousRange?.from === from && previousRange.to === to) continue;

    ranges.push({ from, to });
  }

  return ranges;
}

export function normalizeSearchIndex(index: number, count: number) {
  if (count <= 0) return -1;

  return ((index % count) + count) % count;
}
