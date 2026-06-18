import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

const countableWordUnits =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}_'-])+/gu;
const markraHighlightPattern = /(?<!=)==[^=\n][^\n]*?==(?!=)/gu;
const inlineMarkdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(markraHighlightRemarkPlugin);

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

export function getMarkdownOutline(text: string): MarkdownOutlineItem[] {
  const outline: MarkdownOutlineItem[] = [];
  let fenced = false;

  text.split(/\r?\n/).forEach((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }

    if (fenced) return;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;

    const titleMarkdown = match[2].trim();
    const title = readableMarkdownHeadingTitle(titleMarkdown);

    outline.push({
      level: match[1].length,
      title,
      ...(titleMarkdown === title ? {} : { titleMarkdown })
    });
  });

  return outline;
}
