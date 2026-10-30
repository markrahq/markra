export type MarkdownFrontmatterKind = "json" | "toml" | "yaml";

export interface MarkdownFrontmatterRange {
  readonly content: string;
  readonly contentFrom: number;
  readonly contentTo: number;
  readonly delimiter?: "---" | "+++";
  readonly from: number;
  readonly kind: MarkdownFrontmatterKind;
  readonly source: string;
  readonly to: number;
}

function findJsonObjectEnd(source: string, start: number) {
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function readJsonFrontmatter(
  source: string,
  from: number,
): MarkdownFrontmatterRange | null {
  if (source[from] !== "{") return null;
  const to = findJsonObjectEnd(source, from);
  if (to === null) return null;

  let after = to;
  while (source[after] === " " || source[after] === "\t") after += 1;
  if (after < source.length && source[after] !== "\n" && source[after] !== "\r") {
    return null;
  }

  const json = source.slice(from, to);
  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  } catch {
    return null;
  }
  return {
    content: json,
    contentFrom: from,
    contentTo: to,
    from,
    kind: "json" as const,
    source: json,
    to,
  };
}

function readFencedFrontmatter(
  source: string,
  from: number,
): MarkdownFrontmatterRange | null {
  const opening = /^(---|\+\+\+)[ \t]*(?:\r?\n|$)/u.exec(source.slice(from));
  const delimiter = opening?.[1] as "---" | "+++" | undefined;
  if (!opening || !delimiter) return null;

  const contentFrom = from + opening[0].length;
  const closingPattern = new RegExp(`^${delimiter.replace(/\+/gu, "\\+")}[ \\t]*$`, "gmu");
  closingPattern.lastIndex = contentFrom;
  const closing = closingPattern.exec(source);
  if (!closing) return null;

  const to = closing.index + closing[0].length;
  return {
    content: source.slice(contentFrom, closing.index).replace(/\r?\n$/u, ""),
    contentFrom,
    contentTo: closing.index,
    delimiter,
    from,
    kind: delimiter === "---" ? "yaml" as const : "toml" as const,
    source: source.slice(from, to),
    to,
  };
}

export function readMarkdownFrontmatter(
  source: string,
): MarkdownFrontmatterRange | null {
  const from = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  return readFencedFrontmatter(source, from) ?? readJsonFrontmatter(source, from);
}
