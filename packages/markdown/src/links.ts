import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownPositionPoint = {
  column?: number;
  line?: number;
  offset?: number;
};

type MarkdownPosition = {
  end?: MarkdownPositionPoint;
  start?: MarkdownPositionPoint;
};

type MarkdownNode = {
  children?: MarkdownNode[];
  position?: MarkdownPosition;
  type: string;
  url?: unknown;
  value?: unknown;
};

type ProtectedRange = {
  from: number;
  to: number;
};

type MarkdownEdit = {
  from: number;
  text: string;
  to: number;
};

export type MarkdownLinkReference = {
  columnNumber: number;
  from: number;
  href: string;
  lineNumber: number;
  lineText: string;
  text: string;
  to: number;
};

export type MarkdownMentionRange = {
  columnNumber: number;
  from: number;
  lineNumber: number;
  lineText: string;
  text: string;
  to: number;
};

export type MarkdownMentionCandidate = {
  id: string;
  title: string;
};

export type MarkdownUnlinkedMention = {
  candidate: MarkdownMentionCandidate;
  columnNumber: number;
  from: number;
  lineNumber: number;
  lineText: string;
  text: string;
  to: number;
};

const markdownLinkParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const markdownDocumentExtensionPattern = /\.(md|markdown)$/iu;
const localUrlSchemePattern = /^[a-z][a-z\d+.-]*:/iu;
const wikiLinkPattern = /!?\[\[([^\]\n]+)\]\]/gu;
const wordCharacterPattern = /[\p{L}\p{N}_-]/u;
const boundarySensitiveTitlePattern = /[\p{Script=Latin}\p{N}_-]/u;
const unsafeMarkdownHrefCharactersPattern = /%(?![a-f\d]{2})|[\s()<>#]/giu;

function parseMarkdown(markdown: string) {
  return markdownLinkParser.parse(markdown) as MarkdownNode;
}

function leadingDelimitedFrontmatterRange(markdown: string): ProtectedRange | null {
  const start = markdown.charCodeAt(0) === 0xfeff ? 1 : 0;
  const firstLineEnd = markdown.indexOf("\n", start);
  if (firstLineEnd < 0) return null;

  const delimiter = markdown.slice(start, firstLineEnd).trim();
  if (delimiter !== "---" && delimiter !== "+++") return null;

  let cursor = firstLineEnd + 1;
  while (cursor < markdown.length) {
    const lineEnd = markdown.indexOf("\n", cursor);
    const safeLineEnd = lineEnd >= 0 ? lineEnd : markdown.length;
    const line = markdown.slice(cursor, safeLineEnd).trim();

    if (line === delimiter) {
      return {
        from: 0,
        to: lineEnd >= 0 ? lineEnd + 1 : safeLineEnd
      };
    }

    cursor = lineEnd >= 0 ? lineEnd + 1 : markdown.length;
  }

  return null;
}

function lineStartOffsets(markdown: string) {
  const offsets = [0];

  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "\n") offsets.push(index + 1);
  }

  return offsets;
}

function lineStartIndexForOffset(lineStarts: readonly number[], offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle] ?? 0;

    if (lineStart <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(0, high);
}

function markdownNodeStart(node: MarkdownNode) {
  return node.position?.start?.offset;
}

function markdownNodeEnd(node: MarkdownNode) {
  return node.position?.end?.offset;
}

function lineInfoForOffset(markdown: string, offset: number, lineStarts: readonly number[]) {
  const safeOffset = Math.max(0, Math.min(offset, markdown.length));
  const lineIndex = lineStartIndexForOffset(lineStarts, safeOffset);
  const lineStart = lineStarts[lineIndex] ?? 0;
  const nextLineStart = lineStarts[lineIndex + 1];
  const lineEnd = typeof nextLineStart === "number" ? nextLineStart - 1 : markdown.length;

  return {
    columnNumber: safeOffset - lineStart + 1,
    lineNumber: lineIndex + 1,
    lineText: markdown.slice(lineStart, lineEnd)
  };
}

function traverseMarkdownNode(node: MarkdownNode, visit: (node: MarkdownNode, parents: readonly MarkdownNode[]) => unknown) {
  const walk = (currentNode: MarkdownNode, parents: readonly MarkdownNode[]) => {
    visit(currentNode, parents);
    currentNode.children?.forEach((child) => walk(child, [...parents, currentNode]));
  };

  walk(node, []);
}

function markdownLabelEnd(source: string, start: number) {
  let depth = 0;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "[") {
      depth += 1;
      continue;
    }
    if (character !== "]") continue;

    depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function skipMarkdownWhitespace(source: string, start: number) {
  let index = start;
  while (index < source.length && /[\t\n\r ]/u.test(source[index] ?? "")) index += 1;
  return index;
}

function markdownDestinationEnd(source: string, start: number, inline: boolean) {
  if (source[start] === "<") {
    for (let index = start + 1; index < source.length; index += 1) {
      if (source[index] === "\\") {
        index += 1;
        continue;
      }
      if (source[index] === ">") return index;
    }
    return -1;
  }

  let nestedParentheses = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (inline && character === "(") {
      nestedParentheses += 1;
      continue;
    }
    if (inline && character === ")") {
      if (nestedParentheses === 0) return index;
      nestedParentheses -= 1;
      continue;
    }
    if (/\s/u.test(character) && nestedParentheses === 0) return index;
  }

  return source.length;
}

function markdownDestinationRange(markdown: string, node: MarkdownNode): ProtectedRange | null {
  const nodeStart = markdownNodeStart(node);
  const nodeEnd = markdownNodeEnd(node);
  if (typeof nodeStart !== "number" || typeof nodeEnd !== "number") return null;

  const source = markdown.slice(nodeStart, nodeEnd);
  const labelStart = source.startsWith("![") ? 1 : 0;
  if (source[labelStart] !== "[") return null;

  const labelEnd = markdownLabelEnd(source, labelStart);
  if (labelEnd < 0) return null;

  const definition = node.type === "definition";
  const delimiter = definition ? ":" : "(";
  if (source[labelEnd + 1] !== delimiter) return null;

  let destinationStart = skipMarkdownWhitespace(source, labelEnd + 2);
  const wrapped = source[destinationStart] === "<";
  const destinationEnd = markdownDestinationEnd(source, destinationStart, !definition);
  if (destinationEnd < 0) return null;
  if (wrapped) destinationStart += 1;

  return {
    from: nodeStart + destinationStart,
    to: nodeStart + destinationEnd
  };
}

function normalizedRelativePathParts(path: string) {
  const parts: string[] = [];

  for (const part of path.replace(/\\/gu, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts;
}

function markdownDocumentDirectoryParts(path: string) {
  const parts = normalizedRelativePathParts(path);
  if (!parts) return null;

  return parts.slice(0, -1);
}

function encodedMarkdownHrefPath(path: string) {
  return path.replace(unsafeMarkdownHrefCharactersPattern, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function rebasedMarkdownHref(href: string, fromDocumentPath: string, toDocumentPath: string) {
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    localUrlSchemePattern.test(trimmed)
  ) {
    return null;
  }

  const suffixStart = trimmed.search(/[?#]/u);
  const rawPath = suffixStart >= 0 ? trimmed.slice(0, suffixStart) : trimmed;
  const suffix = suffixStart >= 0 ? trimmed.slice(suffixStart) : "";
  if (!rawPath) return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURI(rawPath);
  } catch {
    return null;
  }

  const fromDirectory = markdownDocumentDirectoryParts(fromDocumentPath);
  const toDirectory = markdownDocumentDirectoryParts(toDocumentPath);
  if (!fromDirectory || !toDirectory) return null;

  const targetParts = normalizedRelativePathParts([...fromDirectory, decodedPath].join("/"));
  if (!targetParts) return null;
  const fromDocumentParts = normalizedRelativePathParts(fromDocumentPath);
  if (fromDocumentParts?.join("/") === targetParts.join("/")) return null;

  let shared = 0;
  while (
    shared < toDirectory.length &&
    shared < targetParts.length &&
    toDirectory[shared] === targetParts[shared]
  ) {
    shared += 1;
  }

  const rebasedPath = [
    ...toDirectory.slice(shared).map(() => ".."),
    ...targetParts.slice(shared)
  ].join("/");
  if (!rebasedPath) return null;

  return `${encodedMarkdownHrefPath(rebasedPath)}${suffix}`;
}

function applyMarkdownEdits(markdown: string, edits: MarkdownEdit[]) {
  if (!edits.length) return markdown;

  const contentParts: string[] = [];
  let cursor = 0;
  for (const edit of edits.sort((left, right) => left.from - right.from)) {
    contentParts.push(markdown.slice(cursor, edit.from), edit.text);
    cursor = edit.to;
  }
  contentParts.push(markdown.slice(cursor));

  return contentParts.join("");
}

function decodeMarkdownHref(href: string) {
  const trimmed = href.trim();
  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;

  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
}

function isLocalMarkdownHref(href: string) {
  const decoded = decodeMarkdownHref(href);
  if (!decoded || decoded.startsWith("#") || decoded.startsWith("//") || localUrlSchemePattern.test(decoded)) {
    return false;
  }

  const path = decoded.split(/[?#]/u)[0] ?? "";
  return markdownDocumentExtensionPattern.test(path);
}

function isWikiDocumentHref(href: string) {
  const target = href.trim().split("#")[0]?.trim() ?? "";
  if (!target || target.startsWith("#") || target.startsWith("//") || localUrlSchemePattern.test(target)) return false;

  const extensionMatch = /\.[a-z\d]+$/iu.exec(target);
  return !extensionMatch || markdownDocumentExtensionPattern.test(target);
}

function wikiReferenceFromSource(
  markdown: string,
  source: string,
  absoluteOffset: number,
  lineStarts: readonly number[]
) {
  const wikiLinks: MarkdownLinkReference[] = [];

  wikiLinkPattern.lastIndex = 0;
  for (const match of source.matchAll(wikiLinkPattern)) {
    const matchText = match[0];
    if (matchText.startsWith("!")) continue;

    const body = match[1] ?? "";
    const [rawHref, rawLabel] = body.split("|", 2);
    const href = rawHref?.trim() ?? "";
    if (!isWikiDocumentHref(href)) continue;

    const text = rawLabel?.trim() || href;
    const from = absoluteOffset + (match.index ?? 0);
    const to = from + matchText.length;
    const line = lineInfoForOffset(markdown, from, lineStarts);

    wikiLinks.push({
      columnNumber: line.columnNumber,
      from,
      href,
      lineNumber: line.lineNumber,
      lineText: line.lineText,
      text,
      to
    });
  }

  return wikiLinks;
}

function textNodeStartOffset(node: MarkdownNode) {
  const start = markdownNodeStart(node);
  if (typeof start !== "number") return null;

  return start;
}

function overlapsProtectedRange(from: number, to: number, protectedRange: ProtectedRange | null) {
  return Boolean(protectedRange && from < protectedRange.to && to > protectedRange.from);
}

function splitTextNodeLines(markdown: string, text: string, start: number, lineStarts: readonly number[]) {
  const ranges: MarkdownMentionRange[] = [];
  let cursor = 0;

  text.split("\n").forEach((lineText, lineIndex, lines) => {
    const from = start + cursor;
    const to = from + lineText.length;
    if (lineText) {
      const line = lineInfoForOffset(markdown, from, lineStarts);
      ranges.push({
        columnNumber: line.columnNumber,
        from,
        lineNumber: line.lineNumber,
        lineText: line.lineText,
        text: lineText,
        to
      });
    }

    cursor += lineText.length + (lineIndex < lines.length - 1 ? 1 : 0);
  });

  return ranges;
}

function removeWikiSourceRanges(range: MarkdownMentionRange) {
  const ranges: MarkdownMentionRange[] = [];
  let cursor = 0;

  wikiLinkPattern.lastIndex = 0;
  for (const match of range.text.matchAll(wikiLinkPattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      ranges.push({
        ...range,
        columnNumber: range.columnNumber + cursor,
        from: range.from + cursor,
        text: range.text.slice(cursor, matchIndex),
        to: range.from + matchIndex
      });
    }

    cursor = matchIndex + match[0].length;
  }

  if (cursor < range.text.length) {
    ranges.push({
      ...range,
      columnNumber: range.columnNumber + cursor,
      from: range.from + cursor,
      text: range.text.slice(cursor),
      to: range.to
    });
  }

  return ranges;
}

function isMentionTextNode(node: MarkdownNode, parents: readonly MarkdownNode[]) {
  if (node.type !== "text" || typeof node.value !== "string") return false;

  return !parents.some((parent) =>
    parent.type === "link" ||
    parent.type === "linkReference" ||
    parent.type === "definition" ||
    parent.type === "image" ||
    parent.type === "imageReference"
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasWordBoundary(text: string, from: number, to: number, title: string) {
  if (!boundarySensitiveTitlePattern.test(title)) return true;

  const before = from > 0 ? text[from - 1] : "";
  const after = to < text.length ? text[to] : "";

  return (!before || !wordCharacterPattern.test(before)) && (!after || !wordCharacterPattern.test(after));
}

export function parseMarkdownLinkReferences(markdown: string): MarkdownLinkReference[] {
  const tree = parseMarkdown(markdown);
  const frontmatterRange = leadingDelimitedFrontmatterRange(markdown);
  const lineStarts = lineStartOffsets(markdown);
  const links: MarkdownLinkReference[] = [];

  traverseMarkdownNode(tree, (node, parents) => {
    if (node.type === "link" && typeof node.url === "string" && isLocalMarkdownHref(node.url)) {
      const from = markdownNodeStart(node);
      const to = markdownNodeEnd(node);
      if (typeof from !== "number" || typeof to !== "number") return;
      if (overlapsProtectedRange(from, to, frontmatterRange)) return;

      const line = lineInfoForOffset(markdown, from, lineStarts);
      links.push({
        columnNumber: line.columnNumber,
        from,
        href: node.url,
        lineNumber: line.lineNumber,
        lineText: line.lineText,
        text: toString(node),
        to
      });
      return;
    }

    if (!isMentionTextNode(node, parents) || typeof node.value !== "string") return;

    const start = textNodeStartOffset(node);
    if (start === null) return;
    if (overlapsProtectedRange(start, start + node.value.length, frontmatterRange)) return;

    links.push(...wikiReferenceFromSource(markdown, node.value, start, lineStarts));
  });

  return links.sort((left, right) => left.from - right.from);
}

export function rebaseMarkdownLocalLinks(
  markdown: string,
  fromDocumentPath: string,
  toDocumentPath: string
) {
  const fromDirectory = markdownDocumentDirectoryParts(fromDocumentPath);
  const toDirectory = markdownDocumentDirectoryParts(toDocumentPath);
  if (!fromDirectory || !toDirectory || fromDirectory.join("/") === toDirectory.join("/")) return markdown;

  const edits: MarkdownEdit[] = [];
  traverseMarkdownNode(parseMarkdown(markdown), (node) => {
    if (
      (node.type !== "link" && node.type !== "image" && node.type !== "definition") ||
      typeof node.url !== "string"
    ) {
      return;
    }

    const href = rebasedMarkdownHref(node.url, fromDocumentPath, toDocumentPath);
    if (!href || href === node.url) return;

    const range = markdownDestinationRange(markdown, node);
    if (!range) return;
    edits.push({ ...range, text: href });
  });

  return applyMarkdownEdits(markdown, edits);
}

export function parseMarkdownMentionRanges(markdown: string): MarkdownMentionRange[] {
  const tree = parseMarkdown(markdown);
  const frontmatterRange = leadingDelimitedFrontmatterRange(markdown);
  const lineStarts = lineStartOffsets(markdown);
  const ranges: MarkdownMentionRange[] = [];

  traverseMarkdownNode(tree, (node, parents) => {
    if (!isMentionTextNode(node, parents) || typeof node.value !== "string") return;

    const start = textNodeStartOffset(node);
    if (start === null) return;
    if (overlapsProtectedRange(start, start + node.value.length, frontmatterRange)) return;

    splitTextNodeLines(markdown, node.value, start, lineStarts).forEach((range) => {
      ranges.push(...removeWikiSourceRanges(range));
    });
  });

  return ranges.filter((range) => range.text.trim().length > 0).sort((left, right) => left.from - right.from);
}

export function findMarkdownUnlinkedMentions(
  ranges: readonly MarkdownMentionRange[],
  candidates: readonly MarkdownMentionCandidate[]
): MarkdownUnlinkedMention[] {
  const mentions: MarkdownUnlinkedMention[] = [];
  const sortedCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      title: candidate.title.trim()
    }))
    .filter((candidate) => candidate.title.length > 0)
    .sort((left, right) => right.title.length - left.title.length);

  ranges.forEach((range) => {
    const occupied: Array<{ from: number; to: number }> = [];

    sortedCandidates.forEach((candidate) => {
      const pattern = new RegExp(escapeRegExp(candidate.title), "giu");

      for (const match of range.text.matchAll(pattern)) {
        const localFrom = match.index ?? 0;
        const localTo = localFrom + match[0].length;
        if (!hasWordBoundary(range.text, localFrom, localTo, candidate.title)) continue;
        if (occupied.some((item) => localFrom < item.to && localTo > item.from)) continue;

        occupied.push({ from: localFrom, to: localTo });
        mentions.push({
          candidate,
          columnNumber: range.columnNumber + localFrom,
          from: range.from + localFrom,
          lineNumber: range.lineNumber,
          lineText: range.lineText,
          text: match[0],
          to: range.from + localTo
        });
      }
    });
  });

  return mentions.sort((left, right) => left.from - right.from);
}
