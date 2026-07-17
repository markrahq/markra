import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { findInlineHtmlRanges, type InlineHtmlRange } from "./inline-html";

export type ResolveRawHtmlSrc = (src: string) => string;

type RawHtmlRenderOptions = {
  htmlSourceApplyLabel?: string;
  htmlSourceLabel?: string;
  resolveImageSrc?: ResolveRawHtmlSrc;
};

type GetNodePosition = () => number | undefined;

const allowedRawHtmlTags = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "code",
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
  "u"
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
  "template"
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
  "width"
]);

const allowedAnchorAttributes = new Set(["href", "name", "rel", "target"]);
const allowedImageAttributes = new Set(["alt", "decoding", "height", "loading", "src", "title", "width"]);
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
  "width"
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
  "ul"
]);

function isSafeRawHtmlUrl(value: string, kind: "href" | "src") {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!normalized) return false;

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(normalized);
  if (!schemeMatch) return true;

  const scheme = schemeMatch[1]?.toLowerCase();
  if (scheme === "http" || scheme === "https") return true;
  if (kind === "href" && (scheme === "mailto" || scheme === "tel")) return true;
  if (kind === "src" && scheme === "data" && /^data:image\//iu.test(normalized)) return true;

  return false;
}

function isSafeRawHtmlStyle(value: string) {
  return !/(?:expression\s*\(|url\s*\(|javascript\s*:|@import)/iu.test(value);
}

function sanitizeRawHtmlStyle(value: string, ownerDocument: Document) {
  if (!isSafeRawHtmlStyle(value)) return "";

  const probe = ownerDocument.createElement("span");
  probe.style.cssText = value;

  const declarations: string[] = [];
  for (const property of allowedStyleProperties) {
    const propertyValue = probe.style.getPropertyValue(property);
    if (!propertyValue) continue;

    declarations.push(`${property}: ${propertyValue}`);
  }

  return declarations.join("; ");
}

function rawHtmlAttributeIsAllowed(tagName: string, attributeName: string) {
  if (attributeName.startsWith("on")) return false;
  if (attributeName.startsWith("data-")) return true;
  if (allowedGlobalAttributes.has(attributeName)) return true;
  if (tagName === "a" && allowedAnchorAttributes.has(attributeName)) return true;
  if (tagName === "img" && allowedImageAttributes.has(attributeName)) return true;

  return false;
}

function sanitizeRawHtmlAttribute(
  element: HTMLElement,
  tagName: string,
  attributeName: string,
  attributeValue: string,
  ownerDocument: Document,
  options: RawHtmlRenderOptions
) {
  if (!rawHtmlAttributeIsAllowed(tagName, attributeName)) return;

  if (attributeName === "href") {
    if (isSafeRawHtmlUrl(attributeValue, "href")) element.setAttribute("href", attributeValue);
    return;
  }

  if (attributeName === "src") {
    if (!isSafeRawHtmlUrl(attributeValue, "src")) return;

    const resolvedSrc = tagName === "img" ? options.resolveImageSrc?.(attributeValue) ?? attributeValue : attributeValue;
    element.setAttribute("src", resolvedSrc);
    return;
  }

  if (attributeName === "style") {
    const safeStyle = sanitizeRawHtmlStyle(attributeValue, ownerDocument);
    if (safeStyle) element.setAttribute("style", safeStyle);
    return;
  }

  element.setAttribute(attributeName, attributeValue);
}

function sanitizeRawHtmlNode(
  sourceNode: Node,
  ownerDocument: Document,
  options: RawHtmlRenderOptions
): Node[] {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return [ownerDocument.createTextNode(sourceNode.textContent ?? "")];
  }

  if (!(sourceNode instanceof Element)) return [];

  const tagName = sourceNode.tagName.toLowerCase();
  if (droppedRawHtmlTags.has(tagName)) return [];

  const sanitizedChildren = Array.from(sourceNode.childNodes).flatMap((child) =>
    sanitizeRawHtmlNode(child, ownerDocument, options)
  );

  if (!allowedRawHtmlTags.has(tagName)) return sanitizedChildren;

  const element = ownerDocument.createElement(tagName);
  for (const attribute of Array.from(sourceNode.attributes)) {
    sanitizeRawHtmlAttribute(element, tagName, attribute.name.toLowerCase(), attribute.value, ownerDocument, options);
  }

  if (tagName === "a") {
    element.setAttribute("rel", "noopener noreferrer");
  }

  if (tagName === "img") {
    element.draggable = false;
    if (!element.hasAttribute("alt")) element.setAttribute("alt", "");
  }

  element.append(...sanitizedChildren);
  return [element];
}

function inlineHtmlDecorationAttributes(
  range: InlineHtmlRange,
  ownerDocument: Document,
  options: RawHtmlRenderOptions
) {
  const template = ownerDocument.createElement("template");
  template.innerHTML = range.openSource;
  const sourceElement = Array.from(template.content.childNodes).find((node) => node instanceof HTMLElement);
  if (!(sourceElement instanceof HTMLElement)) return null;

  const sanitizedElement = sanitizeRawHtmlNode(sourceElement, ownerDocument, options)
    .find((node) => node instanceof HTMLElement);
  if (!(sanitizedElement instanceof HTMLElement) || sanitizedElement.tagName.toLowerCase() !== range.tagName) return null;

  const attributes: Record<string, string> = {
    class: "markra-inline-html",
    nodeName: range.tagName
  };
  for (const attribute of Array.from(sanitizedElement.attributes)) {
    attributes[attribute.name] = attribute.value;
  }

  return attributes;
}

function inlineHtmlDecorations(doc: ProseNode, ownerDocument: Document, options: RawHtmlRenderOptions) {
  const decorations: Decoration[] = [];

  findInlineHtmlRanges(doc).forEach((range) => {
    const attributes = inlineHtmlDecorationAttributes(range, ownerDocument, options);
    if (!attributes) return;

    // Keep the HTML boundary atoms in the document so nested Markdown stays editable and serializes unchanged.
    if (range.from < range.to) {
      decorations.push(Decoration.inline(range.from, range.to, attributes));
    }

    const boundaryAttributes = {
      class: "markra-inline-html-boundary",
      style: "display: none"
    };
    decorations.push(Decoration.node(range.openFrom, range.openTo, boundaryAttributes));
    decorations.push(Decoration.node(range.closeFrom, range.closeTo, boundaryAttributes));
  });

  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function createRawHtmlFallback(rawHtml: string, ownerDocument: Document) {
  const fallback = ownerDocument.createElement("span");
  fallback.textContent = rawHtml;
  return fallback;
}

function decorateRawHtmlRoot(root: HTMLElement, rawHtml: string, editing = false) {
  root.classList.add("markra-html-node");
  root.classList.toggle("markra-html-node-editing", editing);
  root.dataset.type = "html";
  root.dataset.value = rawHtml;
  root.contentEditable = "false";
  root.draggable = false;
}

function resetRawHtmlRoot(root: HTMLElement) {
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
  const firstElement = Array.from(template.content.childNodes).find((node) => node instanceof HTMLElement);

  return firstElement instanceof HTMLElement ? firstElement.tagName.toLowerCase() : null;
}

function rawHtmlBoundaryTagName(rawHtml: string) {
  const match = /^<\/?\s*([A-Za-z][\w:.-]*)(?:\s[^<>]*)?\/?\s*>$/u.exec(rawHtml.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function rawHtmlIsSelfClosingBoundary(rawHtml: string) {
  return /\/\s*>$/u.test(rawHtml.trim());
}

function rawHtmlIsCustomComponentBoundary(rawHtml: string) {
  const tagName = rawHtmlBoundaryTagName(rawHtml);
  if (!tagName) return false;
  if (allowedRawHtmlTags.has(tagName) || droppedRawHtmlTags.has(tagName)) return false;

  return tagName.includes("-") || tagName.includes(":");
}

function rawHtmlIsBlockWrapperBoundary(rawHtml: string) {
  const tagName = rawHtmlBoundaryTagName(rawHtml);
  if (!tagName || !blockRawHtmlTags.has(tagName)) return false;

  return rawHtml.trim().startsWith("</") || !rawHtmlIsSelfClosingBoundary(rawHtml);
}

function rawHtmlIsHiddenBoundary(rawHtml: string) {
  return rawHtmlIsCustomComponentBoundary(rawHtml) || rawHtmlIsBlockWrapperBoundary(rawHtml);
}

function createRawHtmlRoot(rawHtml: string, ownerDocument: Document) {
  const firstTagName = firstRawHtmlElementTagName(rawHtml, ownerDocument);
  const rootTagName = firstTagName && blockRawHtmlTags.has(firstTagName) ? "div" : "span";

  return ownerDocument.createElement(rootTagName);
}

function renderRawHtmlPreviewInto(root: HTMLElement, rawHtml: string, ownerDocument: Document, options: RawHtmlRenderOptions) {
  const template = ownerDocument.createElement("template");
  template.innerHTML = rawHtml;

  const sanitizedNodes = Array.from(template.content.childNodes).flatMap((node) =>
    sanitizeRawHtmlNode(node, ownerDocument, options)
  );
  const meaningfulNodes = sanitizedNodes.filter((node) => node.textContent || node instanceof HTMLElement);
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

  if (!root.childNodes.length) {
    if (!rawHtmlIsHiddenBoundary(rawHtml)) {
      root.replaceChildren(createRawHtmlFallback(rawHtml, ownerDocument));
    }
  }

  decorateRawHtmlRoot(root, rawHtml);
}

function createRawHtmlSourceInput(rawHtml: string, ownerDocument: Document, label: string) {
  const textarea = ownerDocument.createElement("textarea");
  textarea.className = "markra-html-node-source";
  textarea.value = rawHtml;
  textarea.rows = Math.min(12, Math.max(3, rawHtml.split("\n").length));
  textarea.ariaLabel = label;
  textarea.spellcheck = false;
  textarea.wrap = "off";

  return textarea;
}

function appendHtmlToken(parent: HTMLElement, className: string, text: string, ownerDocument: Document) {
  const token = ownerDocument.createElement("span");
  token.className = className;
  token.textContent = text;
  parent.append(token);
}

function appendHighlightedHtmlTag(parent: HTMLElement, source: string, ownerDocument: Document) {
  if (/^<!--/u.test(source)) {
    appendHtmlToken(parent, "markra-html-token-comment", source, ownerDocument);
    return;
  }

  const tagMatch = /^<\/?\s*[A-Za-z][\w:-]*/u.exec(source);
  if (!tagMatch) {
    parent.append(ownerDocument.createTextNode(source));
    return;
  }

  appendHtmlToken(parent, "markra-html-token-tag", tagMatch[0], ownerDocument);

  const rest = source.slice(tagMatch[0].length);
  const tokenPattern = /"[^"]*"|'[^']*'|[A-Za-z_:][\w:.-]*|\s+|./gu;
  let match: RegExpExecArray | null = tokenPattern.exec(rest);

  while (match) {
    const token = match[0];

    if (/^["']/u.test(token)) {
      appendHtmlToken(parent, "markra-html-token-string", token, ownerDocument);
    } else if (/^[A-Za-z_:][\w:.-]*$/u.test(token)) {
      appendHtmlToken(parent, "markra-html-token-attr", token, ownerDocument);
    } else {
      parent.append(ownerDocument.createTextNode(token));
    }

    match = tokenPattern.exec(rest);
  }
}

function renderHighlightedHtmlSource(code: HTMLElement, source: string, ownerDocument: Document) {
  code.replaceChildren();

  const tagPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>|<![^<>]*>/gu;
  let offset = 0;
  let match: RegExpExecArray | null = tagPattern.exec(source);

  while (match) {
    if (match.index > offset) {
      code.append(ownerDocument.createTextNode(source.slice(offset, match.index)));
    }

    appendHighlightedHtmlTag(code, match[0], ownerDocument);
    offset = match.index + match[0].length;
    match = tagPattern.exec(source);
  }

  if (offset < source.length) {
    code.append(ownerDocument.createTextNode(source.slice(offset)));
  }
}

function createRawHtmlSourceHighlight(rawHtml: string, ownerDocument: Document) {
  const highlight = ownerDocument.createElement("pre");
  const code = ownerDocument.createElement("code");

  highlight.className = "markra-html-node-highlight";
  highlight.ariaHidden = "true";
  highlight.append(code);
  renderHighlightedHtmlSource(code, rawHtml, ownerDocument);

  return { code, highlight };
}

function createRawHtmlEditorFrame(
  rawHtml: string,
  ownerDocument: Document,
  options: RawHtmlRenderOptions,
  onCommit: (value: string) => unknown
) {
  const frame = ownerDocument.createElement("div");
  const toolbar = ownerDocument.createElement("div");
  const label = ownerDocument.createElement("span");
  const applyButton = ownerDocument.createElement("button");
  const input = createRawHtmlSourceInput(
    rawHtml,
    ownerDocument,
    options.htmlSourceLabel ?? "HTML source"
  );
  const sourceLayer = ownerDocument.createElement("div");
  const { code, highlight } = createRawHtmlSourceHighlight(rawHtml, ownerDocument);

  frame.className = "markra-html-node-editor";
  sourceLayer.className = "markra-html-node-source-layer";
  toolbar.className = "markra-html-node-editor-toolbar";
  label.className = "markra-html-node-editor-label";
  label.textContent = "HTML";
  applyButton.className = "markra-html-node-editor-apply";
  applyButton.type = "button";
  applyButton.textContent = "✓";
  applyButton.ariaLabel = options.htmlSourceApplyLabel ?? "Apply HTML source";
  applyButton.title = options.htmlSourceApplyLabel ?? "Apply HTML source";

  applyButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onCommit(input.value);
  });
  applyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const refreshHighlight = () => {
    renderHighlightedHtmlSource(code, input.value, ownerDocument);
  };

  input.addEventListener("input", refreshHighlight);
  input.addEventListener("change", refreshHighlight);
  input.addEventListener("scroll", () => {
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  });

  toolbar.append(label, applyButton);
  sourceLayer.append(highlight, input);
  frame.append(toolbar, sourceLayer);

  return { frame, input };
}

class MarkraRawHtmlNodeView implements NodeView {
  readonly dom: HTMLElement;
  private editing = false;
  private sourceInput: HTMLTextAreaElement | null = null;

  constructor(
    private node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: GetNodePosition,
    private readonly options: RawHtmlRenderOptions
  ) {
    this.dom = createRawHtmlRoot(rawHtmlValueFromNode(node), view.dom.ownerDocument);
    this.renderPreview();
    this.dom.ownerDocument.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
    this.dom.addEventListener("click", (event) => {
      if (this.editing) return;

      event.preventDefault();
      event.stopPropagation();
      this.renderSourceEditor();
    });
  }

  update(nextNode: ProseNode) {
    if (nextNode.type !== this.node.type) return false;
    if (rawHtmlValueFromNode(nextNode) !== rawHtmlValueFromNode(this.node)) return false;

    this.node = nextNode;
    return true;
  }

  destroy() {
    this.dom.ownerDocument.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
  }

  stopEvent(event: Event) {
    return this.editing || this.dom.contains(event.target instanceof Node ? event.target : null);
  }

  ignoreMutation() {
    return true;
  }

  private renderPreview() {
    this.editing = false;
    this.sourceInput = null;
    renderRawHtmlPreviewInto(
      this.dom,
      rawHtmlValueFromNode(this.node),
      this.view.dom.ownerDocument,
      this.options
    );
  }

  private renderSourceEditor() {
    const rawHtml = rawHtmlValueFromNode(this.node);
    const { frame, input } = createRawHtmlEditorFrame(rawHtml, this.view.dom.ownerDocument, this.options, (value) => {
      this.commitSource(value);
    });

    this.editing = true;
    this.sourceInput = input;
    resetRawHtmlRoot(this.dom);
    decorateRawHtmlRoot(this.dom, rawHtml, true);
    this.dom.replaceChildren(frame);

    const commit = () => {
      this.commitSource(input.value);
    };

    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.renderPreview();
        this.view.focus();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commit();
        this.view.focus();
      }
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if (!this.editing) return;
    if (event.target instanceof Node && this.dom.contains(event.target)) return;

    this.commitSource(this.sourceInput?.value ?? rawHtmlValueFromNode(this.node));
  };

  private commitSource(value: string) {
    const nextValue = value;
    if (nextValue === rawHtmlValueFromNode(this.node)) {
      this.renderPreview();
      return;
    }

    const position = this.getPos();
    if (typeof position !== "number") {
      this.renderPreview();
      return;
    }

    const transaction = this.view.state.tr.setNodeMarkup(position, undefined, { value: nextValue });
    this.view.dispatch(transaction);
  }
}

function rawHtmlValueFromNode(node: ProseNode) {
  return typeof node.attrs.value === "string" ? node.attrs.value : "";
}

export function markraRawHtmlPlugin(options: RawHtmlRenderOptions = {}) {
  return $prose(() => {
    return new Plugin({
      props: {
        decorations(state) {
          if (typeof document === "undefined") return DecorationSet.empty;

          return inlineHtmlDecorations(state.doc, document, options);
        },
        nodeViews: {
          html: (node, view, getPos) => new MarkraRawHtmlNodeView(node, view, getPos as GetNodePosition, options)
        }
      }
    });
  });
}
