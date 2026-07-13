import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type GfmTableAlignment = "center" | "left" | "right" | null;

export type GfmTableFragment = {
  markdown: string;
  rowCount: number;
};

type MarkdownNode = {
  children?: MarkdownNode[];
  type: string;
};

const gfmTableParser = unified().use(remarkParse).use(remarkGfm);
const pipeDelimitedRowPattern = /^\s*\|.*\|\s*$/u;

function tableDelimiter(alignment: GfmTableAlignment) {
  if (alignment === "left") return ":---";
  if (alignment === "center") return ":---:";
  if (alignment === "right") return "---:";
  return "---";
}

function syntheticTableMarkdown(
  rows: readonly string[],
  columnCount: number,
  alignments: readonly GfmTableAlignment[]
) {
  const headers = Array.from({ length: columnCount }, (_, index) => `markra-${index + 1}`);
  const delimiters = Array.from(
    { length: columnCount },
    (_, index) => tableDelimiter(alignments[index] ?? null)
  );

  return [
    `| ${headers.join(" | ")} |`,
    `| ${delimiters.join(" | ")} |`,
    ...rows
  ].join("\n");
}

function parsedTable(markdown: string) {
  try {
    const tree = gfmTableParser.runSync(gfmTableParser.parse(markdown)) as MarkdownNode;
    if (tree.children?.length !== 1) return null;

    const table = tree.children[0];
    return table?.type === "table" ? table : null;
  } catch {
    return null;
  }
}

export function parseGfmTableFragment(
  source: string,
  columnCount: number,
  alignments: readonly GfmTableAlignment[] = []
): GfmTableFragment | null {
  if (!Number.isInteger(columnCount) || columnCount < 1) return null;

  const normalizedSource = source.replace(/\r\n?/gu, "\n").trim();
  if (!normalizedSource) return null;

  const rows = normalizedSource.split("\n");
  if (rows.some((row) => !pipeDelimitedRowPattern.test(row))) return null;

  const markdown = syntheticTableMarkdown(rows, columnCount, alignments);
  const table = parsedTable(markdown);
  if (!table?.children || table.children.length !== rows.length + 1) return null;

  const bodyRows = table.children.slice(1);
  if (bodyRows.some((row) => row.type !== "tableRow" || row.children?.length !== columnCount)) {
    return null;
  }

  return {
    markdown,
    rowCount: bodyRows.length
  };
}
