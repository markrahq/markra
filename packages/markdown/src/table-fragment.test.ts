import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type Alignment = "center" | "left" | "right" | null;
type TableFragment = { markdown: string; rowCount: number };
type TableFragmentParser = (
  source: string,
  columnCount: number,
  alignments?: readonly Alignment[]
) => TableFragment | null;

type MarkdownNode = {
  children?: MarkdownNode[];
  type: string;
};

const parser = unified().use(remarkParse).use(remarkGfm);

async function loadTableFragmentParser() {
  const markdown = await import("./index.ts") as unknown as {
    parseGfmTableFragment?: TableFragmentParser;
  };

  return markdown.parseGfmTableFragment;
}

function parseMarkdown(markdown: string) {
  return parser.runSync(parser.parse(markdown)) as MarkdownNode;
}

describe("parseGfmTableFragment", () => {
  it("builds a synthetic GFM table for one compatible row", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    const result = parseGfmTableFragment?.("| Beta | 2 |", 2, [null, null]);

    expect(result).toMatchObject({ rowCount: 1 });
    const tree = parseMarkdown(result?.markdown ?? "");
    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0]?.type).toBe("table");
    expect(tree.children?.[0]?.children).toHaveLength(2);
  });

  it("preserves multiple compatible rows and requested alignments", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    const result = parseGfmTableFragment?.(
      "| Beta | 2 |\n| Gamma | 3 |",
      2,
      ["left", "right"]
    );

    expect(result).toMatchObject({ rowCount: 2 });
    expect(result?.markdown).toContain("| :--- | ---: |");
    expect(parseMarkdown(result?.markdown ?? "").children?.[0]?.children).toHaveLength(3);
  });

  it("rejects rows whose cell count differs from the table", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    expect(parseGfmTableFragment?.("| Beta |", 2, [null, null])).toBeNull();
    expect(parseGfmTableFragment?.("| Beta | 2 | extra |", 2, [null, null])).toBeNull();
  });

  it("rejects prose that merely contains a pipe", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    expect(parseGfmTableFragment?.("ordinary | prose", 2, [null, null])).toBeNull();
  });

  it("rejects a multi-line fragment when any row is incompatible", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    expect(
      parseGfmTableFragment?.("| Beta | 2 |\n| Gamma |", 2, [null, null])
    ).toBeNull();
  });

  it("accepts escaped pipes and inline formatting through GFM parsing", async () => {
    const parseGfmTableFragment = await loadTableFragmentParser();

    const result = parseGfmTableFragment?.(
      "| `a\\|b` | **bold** and [link](https://example.test) |",
      2,
      [null, null]
    );

    expect(result).toMatchObject({ rowCount: 1 });
    expect(result?.markdown).toContain("`a\\|b`");
    expect(result?.markdown).toContain("**bold**");
  });
});
