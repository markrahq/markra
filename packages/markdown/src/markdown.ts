import type { Tree } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { readMarkdownFrontmatter } from "./frontmatter.ts";
import { markraSetextHeading } from "./setext-heading.ts";

const countableWordUnits =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}_'-])+/gu;
const markraHighlightPattern = /(?<!=)==[^=\n][^\n]*?==(?!=)/gu;
const inlineMarkdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(markraHighlightRemarkPlugin);
const headingParser = parser.configure([GFM, markraSetextHeading]);
const headingNodePattern = /^(?:ATX|Setext)Heading([1-6])$/u;

type MarkdownNode = {
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
  type: string;
  value?: string;
};

export function getWordCount(text: string) {
  const words = text.trim().match(countableWordUnits);
  return words?.length ?? 0;
}

export type MarkdownOutlineItem = {
  level: number;
  title: string;
  titleMarkdown?: string;
};

export type MarkdownHeading = MarkdownOutlineItem & {
  from: number;
  to: number;
};

function splitMarkraHighlightText(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  markraHighlightPattern.lastIndex = 0;
  for (const match of value.matchAll(markraHighlightPattern)) {
    const matchIndex = match.index ?? 0;
    const source = match[0];
    const content = source.slice(2, -2);

    if (matchIndex > cursor) nodes.push({ type: "text", value: value.slice(cursor, matchIndex) });
    nodes.push({
      children: [{ type: "text", value: content }],
      data: { hName: "mark" },
      type: "markraHighlight"
    });
    cursor = matchIndex + source.length;
  }

  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });

  return nodes;
}

function transformMarkraHighlight(node: MarkdownNode) {
  if (!Array.isArray(node.children)) return;

  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index];
    if (!child) continue;

    if (child.type === "text" && typeof child.value === "string" && child.value.includes("==")) {
      const replacement = splitMarkraHighlightText(child.value);
      if (replacement.length > 1 || replacement[0]?.type !== "text" || replacement[0].value !== child.value) {
        node.children.splice(index, 1, ...replacement);
      }
      continue;
    }

    transformMarkraHighlight(child);
  }
}

export function markraHighlightRemarkPlugin() {
  return (tree: MarkdownNode) => {
    transformMarkraHighlight(tree);
  };
}

function readableMarkdownHeadingTitle(title: string) {
  // A heading's text is inline content, but `inlineMarkdownParser` parses whatever it is handed
  // as a block document — so a leading "1. " / "2) ", "- ", "> " or "#" prefix is mis-read as a
  // list, blockquote or heading marker and dropped, losing it from the outline (e.g. "1. Overview"
  // became "Overview"). Parsing the title back inside a heading keeps the whole value as heading
  // inline content, so those prefixes survive while inline formatting (bold/links/code/highlight/
  // math) is still flattened.
  return toString(inlineMarkdownParser.runSync(inlineMarkdownParser.parse(`# ${title}`))).trim();
}

export function getMarkdownHeadings(text: string, tree: Tree = headingParser.parse(text)): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const frontmatter = readMarkdownFrontmatter(text);

  tree.iterate({
    enter(node) {
      const match = headingNodePattern.exec(node.name);
      if (!match) return;
      // Frontmatter delimiters can otherwise turn metadata into Setext headings.
      if (frontmatter && node.from < frontmatter.to) return;

      const marks = node.node.getChildren("HeaderMark");
      const firstMark = marks[0];
      if (!firstMark) return;

      const setext = node.name.startsWith("Setext");
      let from = setext ? node.from : firstMark.to;
      const to = setext ? text.lastIndexOf("\n", firstMark.from) : marks[1]?.from ?? node.to;
      const parts: string[] = [];

      // Continuation quote markers belong to the container, not the heading's inline text.
      node.node.cursor().iterate((quote) => {
        if (quote.name !== "QuoteMark" || quote.from >= to) return;
        parts.push(text.slice(from, quote.from));
        from = quote.to;
      });
      parts.push(text.slice(from, to));
      const titleMarkdown = parts.join("").split(/\r?\n/u).map((line) => line.trim()).join(" ");
      const title = readableMarkdownHeadingTitle(titleMarkdown);
      // Empty headings have no outline entry; keep every consumer's indices aligned.
      if (!title) return;

      headings.push({
        from: node.from,
        level: Number(match[1]),
        title,
        ...(titleMarkdown === title ? {} : { titleMarkdown }),
        to: node.to
      });
    }
  });

  return headings;
}

export function getMarkdownOutline(text: string): MarkdownOutlineItem[] {
  return getMarkdownHeadings(text).map(({ from, to, ...item }) => item);
}
