import { parser, GFM } from "@lezer/markdown";
import {
  createMarkraMathMacros,
  renderMarkraMathToString,
  type MarkraMathMacros,
} from "../math-render.ts";
import {
  findMarkraMathRanges,
  type MarkraMathRange,
  type MarkraSourceRange,
} from "../math-syntax.ts";
import { markraHighlight } from "./highlight.ts";
import { resolveSafeImageSource } from "./image.ts";
import {
  resolveAutolinkTarget,
  resolveSafeLinkTarget,
} from "./links.ts";
import { unescapeMarkdown, unquoteMarkdownTitle } from "./syntax.ts";

const inlineParser = parser.configure([GFM, markraHighlight]);
type InlineNode = ReturnType<typeof inlineParser.parse>["topNode"];

const markdownEscape = /\\([\\`*{}\[\]()#+\-.!_|>~])/gu;
const htmlLineBreak = /^<br\s*\/?>$/iu;
const markerNodes = new Set([
  "CodeMark",
  "EmphasisMark",
  "HighlightMark",
  "LinkMark",
  "StrikethroughMark",
]);

export interface InlineMarkdownImageDetails {
  readonly alt: string;
  readonly markdown: string;
  readonly source: string;
  readonly title: string;
}

export interface InlineMarkdownRenderOptions {
  readonly resolveImageSource?: (
    details: InlineMarkdownImageDetails,
  ) => string | null;
  readonly resolveLinkTarget?: (source: string) => string | null;
}

interface InlineMarkdownRenderContext {
  readonly mathMacros: MarkraMathMacros;
  readonly mathRanges: readonly MarkraMathRange[];
  readonly options: InlineMarkdownRenderOptions;
}

function resolveLinkHref(
  linkSource: string,
  autolink: boolean,
  options: InlineMarkdownRenderOptions,
) {
  const resolveTarget = options.resolveLinkTarget;
  if (!resolveTarget) {
    return autolink
      ? resolveAutolinkTarget(linkSource)
      : resolveSafeLinkTarget(linkSource);
  }

  const candidate = autolink
    ? resolveAutolinkTarget(linkSource)
    : unescapeMarkdown(linkSource);
  if (!candidate) return null;
  let target: string | null;
  try {
    target = resolveTarget(candidate);
  } catch {
    return null;
  }
  const normalizedTarget = target?.trim();
  return normalizedTarget ? normalizedTarget : null;
}

function appendText(
  parent: Node,
  source: string,
  from: number,
  to: number,
) {
  if (to <= from) return;
  parent.appendChild(
    (parent.ownerDocument ?? (parent as Document)).createTextNode(
      source.slice(from, to).replace(markdownEscape, "$1"),
    ),
  );
}

function childNodes(node: InlineNode) {
  const children: InlineNode[] = [];
  let child = node.firstChild;
  while (child) {
    children.push(child);
    child = child.nextSibling;
  }
  return children;
}

function inlineCodeRanges(node: InlineNode) {
  const ranges: MarkraSourceRange[] = [];
  const visit = (current: InlineNode) => {
    if (current.name === "InlineCode") {
      ranges.push({ from: current.from, to: current.to });
      return;
    }
    for (const child of childNodes(current)) visit(child);
  };
  visit(node);
  return ranges;
}

function appendMath(
  parent: Node,
  ownerDocument: Document,
  range: MarkraMathRange,
  macros: MarkraMathMacros,
) {
  const element = ownerDocument.createElement("span");
  element.className = "markra-math-render markra-math-render-inline";
  element.contentEditable = "false";
  element.dataset.markraMathMarkdown = range.source;
  element.innerHTML = renderMarkraMathToString(range.tex, "inline", macros);
  element.setAttribute("aria-label", "Edit math source");
  element.setAttribute("role", "button");
  parent.appendChild(element);
}

function appendTextWithMath(
  parent: Node,
  ownerDocument: Document,
  source: string,
  from: number,
  to: number,
  context: InlineMarkdownRenderContext,
) {
  let cursor = from;
  for (const range of context.mathRanges) {
    if (
      range.kind !== "inline" ||
      range.from < from ||
      range.to > to
    ) {
      continue;
    }
    appendText(parent, source, cursor, range.from);
    appendMath(parent, ownerDocument, range, context.mathMacros);
    cursor = range.to;
  }
  appendText(parent, source, cursor, to);
}

function mathRangeCrossingChild(
  child: InlineNode,
  from: number,
  to: number,
  cursor: number,
  ranges: readonly MarkraMathRange[],
) {
  // TeX punctuation can look like Markdown, so a formula that crosses a parsed
  // child boundary must stay atomic instead of inheriting that child markup.
  return ranges.find((range) =>
    range.kind === "inline" &&
    range.from >= cursor &&
    range.from >= from &&
    range.to <= to &&
    range.from < child.to &&
    range.to > child.from &&
    !(child.from <= range.from && child.to >= range.to)
  );
}

function renderRange(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  from: number,
  to: number,
  context: InlineMarkdownRenderContext,
) {
  let cursor = from;
  for (const child of childNodes(node)) {
    if (child.to <= from || child.from >= to || child.to <= cursor) continue;
    const childFrom = Math.max(from, child.from);
    const childTo = Math.min(to, child.to);
    const crossingMath = mathRangeCrossingChild(
      child,
      from,
      to,
      cursor,
      context.mathRanges,
    );
    if (crossingMath) {
      appendTextWithMath(
        parent,
        ownerDocument,
        source,
        cursor,
        crossingMath.from,
        context,
      );
      appendMath(parent, ownerDocument, crossingMath, context.mathMacros);
      cursor = crossingMath.to;
      continue;
    }
    appendTextWithMath(
      parent,
      ownerDocument,
      source,
      cursor,
      childFrom,
      context,
    );
    if (!markerNodes.has(child.name)) {
      renderNode(
        parent,
        ownerDocument,
        source,
        child,
        childFrom,
        childTo,
        context,
      );
    }
    cursor = Math.max(cursor, childTo);
  }
  appendTextWithMath(parent, ownerDocument, source, cursor, to, context);
}

function wrappedNode(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  tagName: "del" | "em" | "mark" | "strong",
  context: InlineMarkdownRenderContext,
) {
  const element = ownerDocument.createElement(tagName);
  renderRange(
    element,
    ownerDocument,
    source,
    node,
    node.from,
    node.to,
    context,
  );
  parent.appendChild(element);
}

function renderLink(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  context: InlineMarkdownRenderContext,
) {
  const children = childNodes(node);
  const marks = children.filter((child) => child.name === "LinkMark");
  const url = children.find((child) => child.name === "URL");
  const labelFrom = marks[0]?.to;
  const labelTo = marks[1]?.from;
  if (labelFrom === undefined || labelTo === undefined || !url) {
    appendText(parent, source, node.from, node.to);
    return;
  }

  const href = resolveLinkHref(
    source.slice(url.from, url.to).trim(),
    false,
    context.options,
  );
  const element = ownerDocument.createElement(href ? "a" : "span");
  element.dataset.markraLinkMarkdown = source.slice(node.from, node.to);
  element.dataset.markraLinkSource = source.slice(url.from, url.to).trim();
  if (href) {
    element.setAttribute("href", href);
    element.draggable = false;
    element.addEventListener("click", (event) => event.preventDefault());
  }
  renderRange(
    element,
    ownerDocument,
    source,
    node,
    labelFrom,
    labelTo,
    context,
  );
  parent.appendChild(element);
  if (href) {
    const icon = ownerDocument.createElement("span");
    icon.ariaHidden = "true";
    icon.className = "markra-live-link-icon";
    icon.contentEditable = "false";
    parent.appendChild(icon);
  }
}

function renderAutolink(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  context: InlineMarkdownRenderContext,
) {
  const url = node.name === "URL"
    ? node
    : childNodes(node).find((child) => child.name === "URL");
  if (!url) {
    appendText(parent, source, node.from, node.to);
    return;
  }

  const linkSource = unescapeMarkdown(source.slice(url.from, url.to).trim());
  const href = resolveLinkHref(linkSource, true, context.options);
  const element = ownerDocument.createElement(href ? "a" : "span");
  element.dataset.markraLinkMarkdown = source.slice(node.from, node.to);
  element.dataset.markraLinkSource = href ?? linkSource;
  if (href) {
    element.setAttribute("href", href);
    element.draggable = false;
    element.addEventListener("click", (event) => event.preventDefault());
  }
  element.textContent = source.slice(url.from, url.to);
  parent.appendChild(element);
  if (href) {
    const icon = ownerDocument.createElement("span");
    icon.ariaHidden = "true";
    icon.className = "markra-live-link-icon";
    icon.contentEditable = "false";
    parent.appendChild(icon);
  }
}

function renderImage(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  context: InlineMarkdownRenderContext,
) {
  const children = childNodes(node);
  const marks = children.filter((child) => child.name === "LinkMark");
  const url = children.find((child) => child.name === "URL");
  const labelFrom = marks[0]?.to;
  const labelTo = marks[1]?.from;
  if (labelFrom === undefined || labelTo === undefined || !url) {
    appendText(parent, source, node.from, node.to);
    return;
  }

  const titleNode = children.find((child) => child.name === "LinkTitle");
  const details: InlineMarkdownImageDetails = {
    alt: unescapeMarkdown(source.slice(labelFrom, labelTo)),
    markdown: source.slice(node.from, node.to),
    source: unescapeMarkdown(source.slice(url.from, url.to).trim()),
    title: titleNode
      ? unquoteMarkdownTitle(source.slice(titleNode.from, titleNode.to).trim())
      : "",
  };
  let resolvedSource: string | null;
  try {
    resolvedSource = context.options.resolveImageSource
      ? context.options.resolveImageSource(details)
      : resolveSafeImageSource(details.source);
  } catch {
    resolvedSource = null;
  }

  if (!resolvedSource) {
    const fallback = ownerDocument.createElement("span");
    fallback.dataset.markraImageMarkdown = details.markdown;
    fallback.textContent = details.alt;
    parent.appendChild(fallback);
    return;
  }

  const image = ownerDocument.createElement("img");
  image.alt = details.alt;
  image.className = "cm-markra-image cm-markra-table-image";
  image.contentEditable = "false";
  image.dataset.markraImageMarkdown = details.markdown;
  image.decoding = "async";
  image.draggable = false;
  image.loading = "lazy";
  image.src = resolvedSource;
  if (details.title) image.title = details.title;
  parent.appendChild(image);
}

function renderNode(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  from = node.from,
  to = node.to,
  context: InlineMarkdownRenderContext,
) {
  switch (node.name) {
    case "StrongEmphasis":
      wrappedNode(parent, ownerDocument, source, node, "strong", context);
      return;
    case "Emphasis":
      wrappedNode(parent, ownerDocument, source, node, "em", context);
      return;
    case "Strikethrough":
      wrappedNode(parent, ownerDocument, source, node, "del", context);
      return;
    case "Highlight":
      wrappedNode(parent, ownerDocument, source, node, "mark", context);
      return;
    case "InlineCode": {
      const element = ownerDocument.createElement("code");
      const marks = childNodes(node).filter((child) => child.name === "CodeMark");
      const contentFrom = marks[0]?.to ?? node.from;
      const contentTo = marks.at(-1)?.from ?? node.to;
      element.textContent = source.slice(contentFrom, contentTo);
      element.dataset.markraCodeMarkdown = source.slice(node.from, node.to);
      element.dataset.markraCodeText = element.textContent;
      parent.appendChild(element);
      return;
    }
    case "Link":
      renderLink(parent, ownerDocument, source, node, context);
      return;
    case "Autolink":
    case "URL":
      renderAutolink(parent, ownerDocument, source, node, context);
      return;
    case "HardBreak":
      {
        const lineBreak = ownerDocument.createElement("br");
        lineBreak.dataset.markraSourceBreak = "true";
        parent.appendChild(lineBreak);
      }
      return;
    case "HTMLBlock":
    case "HTMLTag":
      if (htmlLineBreak.test(source.slice(from, to))) {
        const lineBreak = ownerDocument.createElement("br");
        lineBreak.dataset.markraSourceBreak = "true";
        parent.appendChild(lineBreak);
      } else {
        appendText(parent, source, from, to);
      }
      return;
    case "Escape":
      {
        const element = ownerDocument.createElement("span");
        element.dataset.markraEscapeMarkdown = source.slice(node.from, node.to);
        element.dataset.markraEscapeText = unescapeMarkdown(
          source.slice(node.from, node.to),
        );
        element.textContent = element.dataset.markraEscapeText;
        parent.appendChild(element);
      }
      return;
    case "Image": {
      renderImage(parent, ownerDocument, source, node, context);
      return;
    }
    default:
      renderRange(parent, ownerDocument, source, node, from, to, context);
  }
}

export function renderInlineMarkdown(
  target: HTMLElement,
  source: string,
  options: InlineMarkdownRenderOptions = {},
) {
  target.replaceChildren();
  const tree = inlineParser.parse(source);
  const context: InlineMarkdownRenderContext = {
    mathMacros: createMarkraMathMacros(),
    mathRanges: findMarkraMathRanges(source, inlineCodeRanges(tree.topNode)),
    options,
  };
  renderRange(
    target,
    target.ownerDocument,
    source,
    tree.topNode,
    0,
    source.length,
    context,
  );
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "")
      .replace(/[\r\n]+/gu, " ")
      .replace(/\|/gu, "\\|");
  }
  if (!(node instanceof HTMLElement)) return "";
  // KaTeX emits duplicate visual and accessibility text; only the authored
  // Markdown is a valid table-cell serialization of the formula.
  if (node.dataset.markraMathMarkdown) {
    return node.dataset.markraMathMarkdown;
  }
  const content = Array.from(node.childNodes, serializeNode).join("");
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return `**${content}**`;
    case "EM":
    case "I":
      return `*${content}*`;
    case "DEL":
    case "S":
      return `~~${content}~~`;
    case "MARK":
      return `==${content}==`;
    case "CODE": {
      const value = node.textContent ?? "";
      if (
        node.dataset.markraCodeMarkdown &&
        value === node.dataset.markraCodeText
      ) {
        return node.dataset.markraCodeMarkdown;
      }
      const longestRun = Math.max(
        0,
        ...Array.from(value.matchAll(/`+/gu), (match) => match[0].length),
      );
      const fence = "`".repeat(longestRun + 1);
      const needsPadding =
        value.startsWith("`") ||
        value.endsWith("`") ||
        (value.startsWith(" ") && value.endsWith(" ") && /\S/u.test(value));
      const padding = needsPadding ? " " : "";
      return `${fence}${padding}${value}${padding}${fence}`;
    }
    case "A":
      return node.dataset.markraLinkMarkdown ??
        `[${content}](${node.getAttribute("href") ?? ""})`;
    case "IMG":
      return node.dataset.markraImageMarkdown ??
        `![${node.getAttribute("alt") ?? ""}](${node.getAttribute("src") ?? ""})`;
    case "SPAN":
      if (node.dataset.markraTableCaretHost === "true") {
        return content.replace(/^\u200b/u, "");
      }
      if (
        node.dataset.markraEscapeMarkdown &&
        node.textContent === node.dataset.markraEscapeText
      ) {
        return node.dataset.markraEscapeMarkdown;
      }
      return node.dataset.markraImageMarkdown ??
        node.dataset.markraLinkMarkdown ??
        content;
    case "BR":
      return "<br>";
    default:
      return content;
  }
}

export function serializeInlineMarkdown(target: HTMLElement) {
  return Array.from(target.childNodes, serializeNode).join("").trim();
}
