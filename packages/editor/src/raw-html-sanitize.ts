export type ResolveRawHtmlSrc = (src: string) => string;

export interface RawHtmlSanitizeOptions {
  resolveImageSrc?: ResolveRawHtmlSrc;
}

export interface RawHtmlRenderOptions extends RawHtmlSanitizeOptions {
  htmlSourceApplyLabel?: string;
  htmlSourceLabel?: string;
}

const allowedRawHtmlTags = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "del",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "img",
  "kbd",
  "mark",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
]);

const droppedRawHtmlTags = new Set([
  "base",
  "embed",
  "form",
  "iframe",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

const allowedGlobalAttributes = new Set([
  "align",
  "aria-label",
  "dir",
  "height",
  "lang",
  "role",
  "style",
  "title",
  "width",
]);
const allowedAnchorAttributes = new Set(["href", "name", "rel", "target"]);
const allowedTableCellAttributes = new Set(["colspan", "rowspan"]);
const allowedTableScopes = new Set(["row", "col", "rowgroup", "colgroup"]);
const allowedImageAttributes = new Set([
  "alt",
  "decoding",
  "height",
  "loading",
  "src",
  "title",
  "width",
]);
const allowedStyleProperties = new Set([
  "align-items",
  "display",
  "flex-wrap",
  "gap",
  "height",
  "justify-content",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "text-align",
  "width",
]);

const blockRawHtmlTags = new Set([
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

function isSafeRawHtmlUrl(value: string, kind: "href" | "src") {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/gu, "");
  if (!normalized) return false;

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(normalized);
  if (!schemeMatch) return true;

  const scheme = schemeMatch[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") return true;
  if (kind === "href" && (scheme === "mailto" || scheme === "tel")) return true;
  if (kind === "src" && scheme === "data" && /^data:image\//iu.test(normalized)) return true;
  return false;
}

function sanitizeRawHtmlStyle(value: string, ownerDocument: Document) {
  if (/(?:expression\s*\(|url\s*\(|javascript\s*:|@import)/iu.test(value)) return "";

  const probe = ownerDocument.createElement("span");
  probe.style.cssText = value;
  const declarations: string[] = [];
  for (const property of allowedStyleProperties) {
    const propertyValue = probe.style.getPropertyValue(property);
    if (propertyValue) declarations.push(`${property}: ${propertyValue}`);
  }
  return declarations.join("; ");
}

function attributeIsAllowed(tagName: string, attributeName: string) {
  if (attributeName.startsWith("on")) return false;
  if (attributeName.startsWith("data-")) return true;
  if (allowedGlobalAttributes.has(attributeName)) return true;
  if (tagName === "a" && allowedAnchorAttributes.has(attributeName)) return true;
  if ((tagName === "td" || tagName === "th") && allowedTableCellAttributes.has(attributeName)) return true;
  if ((tagName === "col" || tagName === "colgroup") && attributeName === "span") return true;
  if (tagName === "th" && attributeName === "scope") return true;
  return tagName === "img" && allowedImageAttributes.has(attributeName);
}

function copySanitizedAttribute(
  element: HTMLElement,
  tagName: string,
  attributeName: string,
  attributeValue: string,
  ownerDocument: Document,
  options: RawHtmlSanitizeOptions,
) {
  if (!attributeIsAllowed(tagName, attributeName)) return;

  if (allowedTableCellAttributes.has(attributeName) || attributeName === "span") {
    const source = attributeValue.trim();
    const span = Number(source);
    // HTML uses rowspan="0" for all remaining rows in the group; column spans start at 1.
    const minimum = attributeName === "rowspan" ? 0 : 1;
    const maximum = attributeName === "rowspan" ? 65534 : 1000;
    if (/^\d+$/u.test(source) && span >= minimum && span <= maximum) {
      element.setAttribute(attributeName, String(span));
    }
    return;
  }
  if (attributeName === "scope") {
    const scope = attributeValue.trim().toLowerCase();
    if (allowedTableScopes.has(scope)) element.setAttribute("scope", scope);
    return;
  }
  if (attributeName === "href") {
    if (isSafeRawHtmlUrl(attributeValue, "href")) element.setAttribute("href", attributeValue);
    return;
  }
  if (attributeName === "src") {
    if (!isSafeRawHtmlUrl(attributeValue, "src")) return;
    const source = tagName === "img"
      ? options.resolveImageSrc?.(attributeValue) ?? attributeValue
      : attributeValue;
    // The host resolver may intentionally return an application-owned scheme
    // such as asset:// after the original Markdown URL has passed validation.
    element.setAttribute("src", source);
    return;
  }
  if (attributeName === "style") {
    const safeStyle = sanitizeRawHtmlStyle(attributeValue, ownerDocument);
    if (safeStyle) element.setAttribute("style", safeStyle);
    return;
  }
  element.setAttribute(attributeName, attributeValue);
}

export function sanitizeRawHtmlNode(
  sourceNode: Node,
  ownerDocument: Document,
  options: RawHtmlSanitizeOptions = {},
): Node[] {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return [ownerDocument.createTextNode(sourceNode.textContent ?? "")];
  }
  if (!(sourceNode instanceof Element)) return [];

  const tagName = sourceNode.tagName.toLowerCase();
  if (droppedRawHtmlTags.has(tagName)) return [];
  const children = Array.from(sourceNode.childNodes).flatMap((child) =>
    sanitizeRawHtmlNode(child, ownerDocument, options),
  );
  if (!allowedRawHtmlTags.has(tagName)) return children;

  const element = ownerDocument.createElement(tagName);
  for (const attribute of Array.from(sourceNode.attributes)) {
    copySanitizedAttribute(
      element,
      tagName,
      attribute.name.toLowerCase(),
      attribute.value,
      ownerDocument,
      options,
    );
  }
  if (tagName === "a") element.setAttribute("rel", "noopener noreferrer");
  if (tagName === "img") {
    element.draggable = false;
    if (!element.hasAttribute("alt")) element.setAttribute("alt", "");
  }
  element.append(...children);
  return [element];
}

export function sanitizeRawHtml(
  source: string,
  ownerDocument: Document,
  options: RawHtmlSanitizeOptions = {},
) {
  const template = ownerDocument.createElement("template");
  template.innerHTML = source;
  return Array.from(template.content.childNodes).flatMap((node) =>
    sanitizeRawHtmlNode(node, ownerDocument, options),
  );
}

function createRawHtmlFallback(rawHtml: string, ownerDocument: Document) {
  const fallback = ownerDocument.createElement("span");
  fallback.textContent = rawHtml;
  return fallback;
}

export function decorateRawHtmlRoot(
  root: HTMLElement,
  rawHtml: string,
  editing = false,
) {
  root.classList.add("markra-html-node");
  root.classList.toggle("markra-html-node-editing", editing);
  root.dataset.type = "html";
  root.dataset.value = rawHtml;
  root.contentEditable = "false";
  root.draggable = false;
}

export function resetRawHtmlRoot(root: HTMLElement) {
  for (const attribute of Array.from(root.attributes)) {
    root.removeAttribute(attribute.name);
  }
  root.replaceChildren();
}

function copyRawHtmlAttributes(target: HTMLElement, source: HTMLElement) {
  for (const attribute of Array.from(source.attributes)) {
    target.setAttribute(attribute.name, attribute.value);
  }
}

function firstRawHtmlElementTagName(rawHtml: string, ownerDocument: Document) {
  const template = ownerDocument.createElement("template");
  template.innerHTML = rawHtml;
  const firstElement = Array.from(template.content.childNodes).find(
    (node) => node instanceof HTMLElement,
  );
  return firstElement instanceof HTMLElement
    ? firstElement.tagName.toLowerCase()
    : null;
}

function rawHtmlBoundaryTagName(rawHtml: string) {
  const match = /^<\/?\s*([A-Za-z][\w:.-]*)(?:\s[^<>]*)?\/?\s*>$/u.exec(
    rawHtml.trim(),
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function rawHtmlIsHiddenBoundary(rawHtml: string) {
  const tagName = rawHtmlBoundaryTagName(rawHtml);
  if (!tagName) return false;
  if (!allowedRawHtmlTags.has(tagName) && !droppedRawHtmlTags.has(tagName)) {
    return tagName.includes("-") || tagName.includes(":");
  }
  return (
    blockRawHtmlTags.has(tagName) &&
    (rawHtml.trim().startsWith("</") || !/\/\s*>$/u.test(rawHtml.trim()))
  );
}

export function createRawHtmlRoot(rawHtml: string, ownerDocument: Document) {
  const firstTagName = firstRawHtmlElementTagName(rawHtml, ownerDocument);
  return ownerDocument.createElement(
    firstTagName && blockRawHtmlTags.has(firstTagName) ? "div" : "span",
  );
}

export function renderRawHtmlPreviewInto(
  root: HTMLElement,
  rawHtml: string,
  ownerDocument: Document,
  options: RawHtmlRenderOptions,
) {
  const sanitizedNodes = sanitizeRawHtml(rawHtml, ownerDocument, options);
  const meaningfulNodes = sanitizedNodes.filter(
    (node) => node.textContent || node instanceof HTMLElement,
  );
  const firstMeaningfulNode = meaningfulNodes[0];

  resetRawHtmlRoot(root);
  if (
    meaningfulNodes.length === 1 &&
    firstMeaningfulNode instanceof HTMLElement &&
    firstMeaningfulNode.tagName.toLowerCase() === root.tagName.toLowerCase()
  ) {
    copyRawHtmlAttributes(root, firstMeaningfulNode);
    root.append(...Array.from(firstMeaningfulNode.childNodes));
  } else {
    root.append(...meaningfulNodes);
  }

  if (!root.childNodes.length && !rawHtmlIsHiddenBoundary(rawHtml)) {
    root.replaceChildren(createRawHtmlFallback(rawHtml, ownerDocument));
  }
  decorateRawHtmlRoot(root, rawHtml);
}
