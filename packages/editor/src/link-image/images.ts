import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import type { RawImageRange, ResolveMarkdownImageSrc } from "./types.ts";

export function createImagePreview(range: RawImageRange, resolveImageSrc: ResolveMarkdownImageSrc | undefined) {
  const image = document.createElement("img");
  image.className = "markra-live-image-preview";
  image.src = resolveImageSrc?.(range.src) ?? range.src;
  image.alt = range.alt;
  image.draggable = false;

  if (range.title) {
    image.title = range.title;
  }

  return image;
}

function updateImageNodeDom(dom: HTMLImageElement, node: ProseNode, resolveImageSrc: ResolveMarkdownImageSrc | undefined) {
  const src = String(node.attrs.src ?? "");
  const title = String(node.attrs.title ?? "");

  dom.src = resolveImageSrc?.(src) ?? src;
  dom.alt = String(node.attrs.alt ?? "");
  dom.draggable = false;

  if (title) {
    dom.title = title;
  } else {
    dom.removeAttribute("title");
  }
}

function escapeImageAlt(alt: string) {
  return alt.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]");
}

function escapeImageTitle(title: string) {
  return title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function unescapeImageMarkdownText(text: string) {
  return text.replace(/\\([\\\]"])/gu, "$1");
}

function imageMarkdownSrc(src: string) {
  if (!/[\s()<>]/u.test(src)) return src;

  return `<${src.replace(/>/gu, "%3E")}>`;
}

function imageMarkdownSource(node: ProseNode) {
  const alt = escapeImageAlt(String(node.attrs.alt ?? ""));
  const src = String(node.attrs.src ?? "");
  const title = String(node.attrs.title ?? "");

  if (!title) return `![${alt}](${imageMarkdownSrc(src)})`;

  return `![${alt}](${imageMarkdownSrc(src)} "${escapeImageTitle(title)}")`;
}

function parseImageMarkdownSource(source: string) {
  const match = /^!\[((?:\\.|[^\]\\])*)\]\((?:<([^>\n]+)>|([^\s)\n]+))(?:\s+"((?:\\.|[^"\n])*)")?\)$/u.exec(
    source.trim()
  );
  if (!match) return null;

  const [, alt = "", angleSrc, plainSrc, title = ""] = match;

  return {
    alt: unescapeImageMarkdownText(alt),
    src: angleSrc ?? plainSrc ?? "",
    title: unescapeImageMarkdownText(title)
  };
}

function focusImageSource(source: HTMLInputElement, node: ProseNode) {
  window.setTimeout(() => {
    source.focus();
    const alt = String(node.attrs.alt ?? "");
    source.setSelectionRange(2, 2 + alt.length);
  });
}

function createImageSourceIcon(ownerDocument: Document) {
  const svg = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rect = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
  const circle = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "circle");
  const path = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "markra-image-node-source-icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("height", "18");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");

  rect.setAttribute("height", "18");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");
  rect.setAttribute("width", "18");
  rect.setAttribute("x", "3");
  rect.setAttribute("y", "3");
  circle.setAttribute("cx", "9");
  circle.setAttribute("cy", "9");
  circle.setAttribute("r", "2");
  path.setAttribute("d", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21");

  svg.append(rect, circle, path);
  return svg;
}

export function createFinalizedImageNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
  resolveImageSrc: ResolveMarkdownImageSrc | undefined
) {
  let currentNode = node;
  const dom = document.createElement("span");
  const sourceRow = document.createElement("span");
  const sourceIcon = createImageSourceIcon(document);
  const source = document.createElement("input");
  const image = document.createElement("img");
  const hideSourceOnOutsidePress = (event: MouseEvent) => {
    if (!sourceRow.isConnected) return;
    if (event.target instanceof Node && dom.contains(event.target)) return;

    hideSource();
  };

  dom.className = "markra-image-node";
  dom.contentEditable = "false";
  dom.draggable = false;
  sourceRow.className = "markra-image-node-source-row";
  source.className = "markra-image-node-source";
  source.type = "text";
  source.ariaLabel = "Image markdown source";
  source.spellcheck = false;
  sourceRow.append(sourceIcon, source);
  dom.append(image);

  const showSource = () => {
    if (!view.editable) {
      hideSource();
      return false;
    }

    source.value = imageMarkdownSource(currentNode);
    if (!sourceRow.isConnected) dom.insertBefore(sourceRow, image);
    dom.classList.add("markra-image-node-selected");
    dom.ownerDocument.addEventListener("mousedown", hideSourceOnOutsidePress, true);
    return true;
  };

  const hideSource = () => {
    sourceRow.remove();
    dom.classList.remove("markra-image-node-selected");
    dom.classList.remove("markra-image-node-source-invalid");
    dom.ownerDocument.removeEventListener("mousedown", hideSourceOnOutsidePress, true);
  };

  const syncSource = () => {
    if (!view.editable) return false;

    const position = typeof getPos === "function" ? getPos() : undefined;
    if (source.value.trim().length === 0) {
      if (typeof position !== "number") return false;

      view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView());
      return false;
    }

    const parsed = parseImageMarkdownSource(source.value);
    if (!parsed) {
      dom.classList.add("markra-image-node-source-invalid");
      return false;
    }

    dom.classList.remove("markra-image-node-source-invalid");
    if (typeof position !== "number") return false;

    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, {
        alt: parsed.alt,
        src: parsed.src,
        title: parsed.title
      })
    );
    return true;
  };

  const moveToParagraphAfterImage = (event: KeyboardEvent) => {
    if (!view.editable) return;
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    if (!syncSource()) return;

    const position = typeof getPos === "function" ? getPos() : undefined;
    const paragraph = view.state.schema.nodes.paragraph;
    if (typeof position !== "number" || !paragraph) return;

    const imageEnd = position + currentNode.nodeSize;
    const nextNode = view.state.doc.resolve(imageEnd).nodeAfter;
    if (nextNode?.type === paragraph && nextNode.content.size === 0) {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, imageEnd + 1)).scrollIntoView()
      );
    } else {
      const transaction = view.state.tr.insert(imageEnd, paragraph.create());
      view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, imageEnd + 1)).scrollIntoView());
    }

    hideSource();
    view.focus();
  };

  const selectImage = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!view.editable) {
      hideSource();
      return;
    }

    showSource();
    focusImageSource(source, currentNode);
  };

  updateImageNodeDom(image, currentNode, resolveImageSrc);
  image.addEventListener("mousedown", selectImage);
  image.addEventListener("click", selectImage);
  source.addEventListener("input", syncSource);
  source.addEventListener("change", syncSource);
  source.addEventListener("keydown", moveToParagraphAfterImage);

  return {
    dom,
    selectNode: showSource,
    deselectNode: hideSource,
    update(nextNode: ProseNode) {
      if (nextNode.type.name !== "image") return false;

      currentNode = nextNode;
      updateImageNodeDom(image, currentNode, resolveImageSrc);
      if (source.isConnected && document.activeElement !== source) source.value = imageMarkdownSource(currentNode);
      return true;
    },
    stopEvent(event: Event) {
      return event.target === source;
    },
    ignoreMutation(mutation: ViewMutationRecord) {
      return mutation.target === source;
    },
    destroy() {
      hideSource();
      image.removeEventListener("mousedown", selectImage);
      image.removeEventListener("click", selectImage);
      source.removeEventListener("input", syncSource);
      source.removeEventListener("change", syncSource);
      source.removeEventListener("keydown", moveToParagraphAfterImage);
    }
  };
}
