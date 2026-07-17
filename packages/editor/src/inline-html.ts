import type { Node as ProseNode } from "@milkdown/kit/prose/model";

type HtmlBoundary = {
  kind: "close" | "open" | "void";
  tagName: string;
};

export type InlineHtmlBoundaryNode = {
  from: number;
  source: string;
  to: number;
};

export type InlineHtmlRange = {
  closeFrom: number;
  closeTo: number;
  from: number;
  openFrom: number;
  openSource: string;
  openTo: number;
  tagName: string;
  to: number;
};

const pairedInlineHtmlTags = new Set([
  "a",
  "abbr",
  "b",
  "code",
  "del",
  "em",
  "i",
  "kbd",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u"
]);

const voidHtmlTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

function htmlBoundaryFromSource(source: string): HtmlBoundary | null {
  const trimmed = source.trim();
  const match = /^<\s*(\/?)\s*([A-Za-z][\w:.-]*)(?=[\s/>])[^<]*>$/u.exec(trimmed);
  const tagName = match?.[2]?.toLowerCase();
  if (!tagName) return null;

  if (match?.[1] === "/") {
    return { kind: "close", tagName };
  }

  if (/\/\s*>$/u.test(trimmed) || voidHtmlTags.has(tagName)) {
    return { kind: "void", tagName };
  }

  return { kind: "open", tagName };
}

export function pairInlineHtmlBoundaries(boundaries: InlineHtmlBoundaryNode[]) {
  const ranges: InlineHtmlRange[] = [];
  const stack: Array<InlineHtmlBoundaryNode & { tagName: string }> = [];

  boundaries.forEach((boundaryNode) => {
    const boundary = htmlBoundaryFromSource(boundaryNode.source);
    if (!boundary || boundary.kind === "void") return;

    if (boundary.kind === "open") {
      stack.push({ ...boundaryNode, tagName: boundary.tagName });
      return;
    }

    const opening = stack.at(-1);
    if (!opening || opening.tagName !== boundary.tagName) {
      // A mismatched pair must not hide or restyle neighboring source nodes as if the HTML were valid.
      stack.length = 0;
      return;
    }

    stack.pop();
    if (!pairedInlineHtmlTags.has(opening.tagName)) return;

    ranges.push({
      closeFrom: boundaryNode.from,
      closeTo: boundaryNode.to,
      from: opening.to,
      openFrom: opening.from,
      openSource: opening.source,
      openTo: opening.to,
      tagName: opening.tagName,
      to: boundaryNode.from
    });
  });

  return ranges;
}

export function findInlineHtmlRanges(doc: ProseNode) {
  const ranges: InlineHtmlRange[] = [];

  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;

    const boundaries: InlineHtmlBoundaryNode[] = [];
    node.forEach((child, offset) => {
      if (child.type.name !== "html" || typeof child.attrs.value !== "string") return;

      const from = position + 1 + offset;
      boundaries.push({
        from,
        source: child.attrs.value,
        to: from + child.nodeSize
      });
    });
    ranges.push(...pairInlineHtmlBoundaries(boundaries));

    return false;
  });

  return ranges;
}
