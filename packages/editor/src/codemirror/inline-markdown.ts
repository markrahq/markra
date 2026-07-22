import { parser, GFM } from "@lezer/markdown";
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

function renderRange(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  from: number,
  to: number,
  options: InlineMarkdownRenderOptions,
) {
  let cursor = from;
  for (const child of childNodes(node)) {
    if (child.to <= from || child.from >= to) continue;
    const childFrom = Math.max(from, child.from);
    const childTo = Math.min(to, child.to);
    appendText(parent, source, cursor, childFrom);
    if (!markerNodes.has(child.name)) {
      renderNode(
        parent,
        ownerDocument,
        source,
        child,
        childFrom,
        childTo,
        options,
      );
    }
    cursor = Math.max(cursor, childTo);
  }
  appendText(parent, source, cursor, to);
}

function wrappedNode(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  tagName: "del" | "em" | "mark" | "strong",
  options: InlineMarkdownRenderOptions,
) {
  const element = ownerDocument.createElement(tagName);
  renderRange(
    element,
    ownerDocument,
    source,
    node,
    node.from,
    node.to,
    options,
  );
  parent.appendChild(element);
}

function renderLink(
  parent: Node,
  ownerDocument: Document,
  source: string,
  node: InlineNode,
  options: InlineMarkdownRenderOptions,
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
    options,
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
    options,
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
  options: InlineMarkdownRenderOptions,
) {
  const url = node.name === "URL"
    ? node
    : childNodes(node).find((child) => child.name === "URL");
  if (!url) {
    appendText(parent, source, node.from, node.to);
    return;
  }

  const linkSource = unescapeMarkdown(source.slice(url.from, url.to).trim());
  const href = resolveLinkHref(linkSource, true, options);
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
  options: InlineMarkdownRenderOptions,
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
    resolvedSource = options.resolveImageSource
      ? options.resolveImageSource(details)
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
  options: InlineMarkdownRenderOptions = {},
) {
  switch (node.name) {
    case "StrongEmphasis":
      wrappedNode(parent, ownerDocument, source, node, "strong", options);
      return;
    case "Emphasis":
      wrappedNode(parent, ownerDocument, source, node, "em", options);
      return;
    case "Strikethrough":
      wrappedNode(parent, ownerDocument, source, node, "del", options);
      return;
    case "Highlight":
      wrappedNode(parent, ownerDocument, source, node, "mark", options);
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
      renderLink(parent, ownerDocument, source, node, options);
      return;
    case "Autolink":
    case "URL":
      renderAutolink(parent, ownerDocument, source, node, options);
      return;
    case "HardBreak":
      parent.appendChild(ownerDocument.createElement("br"));
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
      renderImage(parent, ownerDocument, source, node, options);
      return;
    }
    default:
      renderRange(parent, ownerDocument, source, node, from, to, options);
  }
}

export function renderInlineMarkdown(
  target: HTMLElement,
  source: string,
  options: InlineMarkdownRenderOptions = {},
) {
  target.replaceChildren();
  const tree = inlineParser.parse(source);
  renderRange(
    target,
    target.ownerDocument,
    source,
    tree.topNode,
    0,
    source.length,
    options,
  );
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "")
      .replace(/[\r\n]+/gu, " ")
      .replace(/\|/gu, "\\|");
  }
  if (!(node instanceof HTMLElement)) return "";
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
