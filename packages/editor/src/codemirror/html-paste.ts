import TurndownService from "turndown";
import type { RemoteClipboardImage } from "../clipboard-asset-types.ts";

export interface CodeMirrorHtmlPaste {
  readonly markdown: string;
  readonly remoteImages: readonly RemoteClipboardImage[];
  readonly structured: boolean;
}

const codeFontPattern = /(?:monospace|menlo|monaco|consolas|courier|sfmono|fira code|jetbrains mono|cascadia code|source code pro)/iu;
const preformattedWhitespacePattern = /white-space\s*:\s*(?:pre|pre-wrap|break-spaces)/iu;
const richTextSelector = [
  "a[href]",
  "b",
  "blockquote",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ol",
  "s",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "ul",
].join(",");
const preformattedBlockNames = new Set(["DIV", "P", "PRE"]);
const anchorMarkupPattern = /<a\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/a\s*>/giu;

function preformattedStyle(element: Element) {
  const style = element.getAttribute("style") ?? "";
  return codeFontPattern.test(style) || preformattedWhitespacePattern.test(style);
}

function preformattedElements(document: Document) {
  return Array.from(document.querySelectorAll<HTMLElement>("pre, [style]"))
    .filter((element) => element.tagName === "PRE" || preformattedStyle(element));
}

function styledInlineLinkMarkup(link: HTMLAnchorElement) {
  const blocks = Array.from(link.querySelectorAll<HTMLElement>("div, p"));
  // Only flatten compact preformatted wrappers; semantic or multiline content
  // must stay on the normal code/link conversion path.
  if (blocks.length === 0 ||
    link.querySelector("br, code, pre") !== null ||
    /[\r\n]/u.test(link.textContent ?? "") ||
    ![link, ...Array.from(link.querySelectorAll<HTMLElement>("[style]"))]
      .some((element) => preformattedStyle(element))) {
    return null;
  }

  const blockSet = new Set(blocks);
  const blocksWithFollowingBlock = new Set(blocks.filter(
    (block) => Boolean(
      block.nextElementSibling && blockSet.has(block.nextElementSibling as HTMLElement),
    ),
  ));
  for (const block of blocks.reverse()) {
    const span = link.ownerDocument.createElement("span");
    for (const attribute of Array.from(block.attributes)) {
      span.setAttribute(attribute.name, attribute.value);
    }
    span.append(...Array.from(block.childNodes));
    block.replaceWith(span);
    if (blocksWithFollowingBlock.has(block)) span.after(" ");
  }

  return link.outerHTML;
}

function normalizeAnchorBlockMarkup(html: string, parser: DOMParser) {
  // A block wrapper inside a paragraph link makes the HTML parser split one
  // authored anchor into empty and duplicate links before Turndown sees it.
  return html.replace(anchorMarkupPattern, (anchor) => {
    if (!codeFontPattern.test(anchor) && !preformattedWhitespacePattern.test(anchor)) {
      return anchor;
    }
    const fragment = parser.parseFromString(anchor, "text/html");
    const link = fragment.body.querySelector<HTMLAnchorElement>("a[href]");
    return link ? styledInlineLinkMarkup(link) ?? anchor : anchor;
  });
}

function meaningfulBodyNodes(document: Document) {
  return Array.from(document.body.childNodes).filter(
    (node) => node.nodeType === 1 ||
      (node.nodeType === 3 && Boolean(node.textContent?.trim())),
  );
}

function hasMixedPreformattedContent(document: Document) {
  const bodyNodes = meaningfulBodyNodes(document);
  return preformattedElements(document).some(
    (element) => bodyNodes.some(
      (node) => node !== element && !element.contains(node),
    ),
  );
}

function hasStructuredHtml(document: Document) {
  return document.querySelector(richTextSelector) !== null ||
    hasMixedPreformattedContent(document);
}

function syntaxHighlightedPlainText(
  document: Document,
  plainText: string,
) {
  if (!plainText || document.querySelector("pre > code")) return null;
  if (preformattedElements(document).length === 0 || hasStructuredHtml(document)) {
    return null;
  }

  // Syntax-highlighted clipboard HTML represents punctuation as ordinary text.
  // Turndown would escape it as Markdown, so preserve the accompanying source.
  return plainText.replace(/\r\n?/gu, "\n");
}

function preformattedNodeText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (element.tagName === "BR") return "\n";

  const text = Array.from(element.childNodes)
    .map((child) => preformattedNodeText(child))
    .join("");
  if (!preformattedBlockNames.has(element.tagName)) return text;
  return `${text.replace(/\n+$/u, "")}\n`;
}

function codeLanguageClass(element: Element) {
  const candidates = [element, ...Array.from(element.querySelectorAll("[class]"))];
  for (const candidate of candidates) {
    for (const className of candidate.classList) {
      const match = /^(?:lang(?:uage)?)-(.+)$/iu.exec(className);
      if (match?.[1]) return `language-${match[1]}`;
    }
  }

  return "";
}

function normalizeStyledCodeBlocks(document: Document) {
  for (const element of preformattedElements(document)) {
    if (!preformattedBlockNames.has(element.tagName)) continue;
    if (element.tagName === "PRE" && element.querySelector(":scope > code")) {
      continue;
    }
    const parent = element.parentElement;
    if (parent && preformattedStyle(parent)) continue;

    const codeText = preformattedNodeText(element)
      .replace(/\r\n?/gu, "\n")
      .replace(/\n+$/u, "");
    if (!codeText) continue;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const languageClass = codeLanguageClass(element);
    if (languageClass) code.classList.add(languageClass);
    code.textContent = codeText;
    pre.append(code);
    element.replaceWith(pre);
  }
}

function normalizedCellMarkdown(service: TurndownService, cell: Element) {
  return service
    .turndown(cell.innerHTML)
    .replace(/\r\n?/gu, "\n")
    .replace(/\s*\n\s*/gu, " ")
    .replace(/\|/gu, "\\|")
    .trim();
}

function tableMarkdown(service: TurndownService, table: Element) {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.children)
      .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
      .map((cell) => normalizedCellMarkdown(service, cell)),
  ).filter((row) => row.length > 0);
  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  const serializeRow = (row: readonly string[]) => `| ${row.join(" | ")} |`;

  return [
    serializeRow(normalizedRows[0] ?? []),
    serializeRow(Array.from({ length: columnCount }, () => "---")),
    ...normalizedRows.slice(1).map(serializeRow),
  ].join("\n");
}

function createTurndownService() {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    strongDelimiter: "**",
  });
  service.addRule("markra-gfm-table", {
    filter: "table",
    replacement(_content, node) {
      const markdown = tableMarkdown(service, node as Element);
      return markdown ? `\n\n${markdown}\n\n` : "";
    },
  });
  service.addRule("markra-strikethrough", {
    filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
    replacement(content) {
      return content ? `~~${content}~~` : "";
    },
  });
  return service;
}

function remoteImage(image: Element): RemoteClipboardImage | null {
  const src = image.getAttribute("src") ?? "";
  try {
    const url = new URL(src);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    alt: image.getAttribute("alt") ?? "",
    src,
    title: image.getAttribute("title") ?? "",
  };
}

export function convertCodeMirrorClipboardHtml(
  html: string,
  plainText = "",
): CodeMirrorHtmlPaste | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const parser = new DOMParser();
  const document = parser.parseFromString(
    normalizeAnchorBlockMarkup(html, parser),
    "text/html",
  );
  const service = createTurndownService();
  const structured = hasStructuredHtml(document);
  const code = syntaxHighlightedPlainText(document, plainText);
  // Turndown collapses whitespace in ordinary styled elements before applying
  // rules, so semanticize code containers while their authored line breaks remain.
  if (!code) normalizeStyledCodeBlocks(document);
  const markdown = code ?? service
    .turndown(document.body.innerHTML)
    .replace(/\r\n?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (!markdown) return null;

  return {
    markdown,
    remoteImages: Array.from(document.querySelectorAll("img")).flatMap((image) => {
      const remote = remoteImage(image);
      return remote ? [remote] : [];
    }),
    structured,
  };
}
