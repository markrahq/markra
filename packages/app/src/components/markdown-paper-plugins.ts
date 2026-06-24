import {
  commands as commonmarkCommands,
  hardbreakAttr,
  hardbreakSchema,
  imageSchema,
  inputRules as commonmarkInputRules,
  keymap as commonmarkKeymap,
  plugins as commonmarkPlugins,
  remarkPreserveEmptyLinePlugin,
  schema as commonmarkSchema
} from "@milkdown/kit/preset/commonmark";
import {
  commands as gfmCommands,
  inputRules as gfmInputRules,
  keymap as gfmKeymap,
  pasteRules as gfmPasteRules,
  plugins as gfmPlugins,
  schema as gfmSchema
} from "@milkdown/kit/preset/gfm";
import type { ResolvedPos } from "@milkdown/kit/prose/model";
import type { Selection } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, $remark } from "@milkdown/kit/utils";
import type { AiSelectionContext } from "@markra/ai";
import { parseMarkdownCalloutMarker } from "@markra/shared";
import { readAiSelectionContextFromView } from "../hooks/useEditorController";

type MarkdownTreeNode = {
  children?: MarkdownTreeNode[];
  position?: {
    end?: { line?: number };
    start?: { line?: number };
  };
  type?: string;
  value?: unknown;
};

type MarkdownStringifySettings = {
  rule?: "*" | "-" | "_" | null;
  ruleRepetition?: number | null;
  ruleSpaces?: boolean | null;
};

type RemarkProcessorData = {
  settings?: MarkdownStringifySettings;
};

const blankParagraphContainerTypes = new Set(["blockquote", "listItem", "root"]);

const markraBlockImageSchema = imageSchema.extendSchema((previous) => (ctx) => ({
  ...previous(ctx),
  draggable: false,
  group: "block",
  inline: false,
  toMarkdown: {
    match: (node) => node.type.name === "image",
    runner: (state, node) => {
      state.openNode("paragraph");
      state.addNode("image", undefined, undefined, {
        alt: node.attrs.alt,
        title: node.attrs.title,
        url: node.attrs.src
      });
      state.closeNode();
    }
  }
}));

function hardbreakDomAttrs(attrs: Record<string, unknown>) {
  const existingClass = typeof attrs.class === "string" && attrs.class.length > 0 ? attrs.class : "";
  return {
    ...attrs,
    class: ["markra-hardbreak", existingClass].filter(Boolean).join(" ")
  };
}

const markraHardbreakSchema = hardbreakSchema.extendSchema((previous) => (ctx) => {
  const baseSchema = previous(ctx);

  return {
    ...baseSchema,
    attrs: {
      ...baseSchema.attrs,
      renderLineBreak: {
        default: false,
        validate: "boolean"
      }
    },
    parseDOM: [
      {
        tag: 'span.markra-hardbreak[data-type="hardbreak"]',
        getAttrs: () => ({ isInline: true, renderLineBreak: true })
      },
      ...(baseSchema.parseDOM ?? [])
    ],
    parseMarkdown: {
      match: ({ type }) => type === "break",
      runner: (state, node, type) => {
        const data = node.data as undefined | { isInline?: boolean; renderLineBreak?: boolean };
        state.addNode(type, {
          isInline: Boolean(data?.isInline),
          renderLineBreak: Boolean(data?.renderLineBreak)
        });
      }
    },
    toDOM: (node) => {
      if (!(node.attrs.isInline && node.attrs.renderLineBreak)) {
        return baseSchema.toDOM?.(node) ?? ["br", ctx.get(hardbreakAttr.key)(node)];
      }

      const attrs = hardbreakDomAttrs(ctx.get(hardbreakAttr.key)(node));
      return ["span", attrs, ["br"]];
    }
  };
});

function lineNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function blankParagraphCountBetween(previous: MarkdownTreeNode, next: MarkdownTreeNode) {
  const previousEndLine = lineNumber(previous.position?.end?.line);
  const nextStartLine = lineNumber(next.position?.start?.line);
  if (previousEndLine === null || nextStartLine === null) return 0;

  // One blank line is the ordinary Markdown block separator; extra pairs represent empty paragraphs.
  const blankLines = nextStartLine - previousEndLine - 1;
  return Math.max(0, Math.floor((blankLines - 1) / 2));
}

function blankParagraphNode(): MarkdownTreeNode {
  return {
    children: [],
    type: "paragraph"
  };
}

function markdownNodeText(node: MarkdownTreeNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(markdownNodeText).join("") ?? "";
}

function appendExplicitEmptyCalloutBodyLines(node: MarkdownTreeNode, children: MarkdownTreeNode[]) {
  if (node.type !== "blockquote") return;

  const firstChild = children[0];
  if (firstChild?.type !== "paragraph" || !parseMarkdownCalloutMarker(markdownNodeText(firstChild))) return;

  const nodeEndLine = lineNumber(node.position?.end?.line);
  let lastChildEndLine: number | null = null;
  for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
    lastChildEndLine = lineNumber(children[childIndex]?.position?.end?.line);
    if (lastChildEndLine !== null) break;
  }
  if (nodeEndLine === null || lastChildEndLine === null) return;

  const trailingEmptyBodyLines = Math.max(0, nodeEndLine - lastChildEndLine);
  for (let lineIndex = 0; lineIndex < trailingEmptyBodyLines; lineIndex += 1) {
    children.push(blankParagraphNode());
  }
}

function preserveBlankParagraphs(node: MarkdownTreeNode) {
  if (!Array.isArray(node.children)) return;

  node.children.forEach(preserveBlankParagraphs);
  if (!blankParagraphContainerTypes.has(node.type ?? "")) return;

  const children: MarkdownTreeNode[] = [];
  node.children.forEach((child, index) => {
    const previous = node.children?.[index - 1];

    if (previous) {
      const count = blankParagraphCountBetween(previous, child);
      for (let blankIndex = 0; blankIndex < count; blankIndex += 1) {
        children.push(blankParagraphNode());
      }
    }

    children.push(child);
  });

  appendExplicitEmptyCalloutBodyLines(node, children);

  node.children = children;
}

function trimParagraphEdgeWhitespace(children: MarkdownTreeNode[]) {
  const trimmed = [...children];

  while (
    trimmed[0]?.type === "text" &&
    typeof trimmed[0].value === "string" &&
    trimmed[0].value.trim().length === 0
  ) {
    trimmed.shift();
  }

  while (
    trimmed[trimmed.length - 1]?.type === "text" &&
    typeof trimmed[trimmed.length - 1]?.value === "string" &&
    String(trimmed[trimmed.length - 1]?.value).trim().length === 0
  ) {
    trimmed.pop();
  }

  const first = trimmed[0];
  if (first?.type === "text" && typeof first.value === "string") {
    trimmed[0] = {
      ...first,
      value: first.value.trimStart()
    };
  }

  const lastIndex = trimmed.length - 1;
  const last = trimmed[lastIndex];
  if (last?.type === "text" && typeof last.value === "string") {
    trimmed[lastIndex] = {
      ...last,
      value: last.value.trimEnd()
    };
  }

  return trimmed;
}

function splitImageParagraph(paragraph: MarkdownTreeNode) {
  if (paragraph.type !== "paragraph" || !Array.isArray(paragraph.children)) return null;
  if (!paragraph.children.some((child) => child.type === "image")) return null;

  const nodes: MarkdownTreeNode[] = [];
  let paragraphChildren: MarkdownTreeNode[] = [];
  const flushParagraph = () => {
    const children = trimParagraphEdgeWhitespace(paragraphChildren);
    paragraphChildren = [];
    if (children.length === 0) return;

    nodes.push({
      ...paragraph,
      children
    });
  };

  for (const child of paragraph.children) {
    if (child.type === "image") {
      flushParagraph();
      nodes.push(child);
    } else {
      paragraphChildren.push(child);
    }
  }

  flushParagraph();
  return nodes;
}

function liftImageParagraphs(node: MarkdownTreeNode) {
  if (!Array.isArray(node.children)) return;

  const children: MarkdownTreeNode[] = [];
  for (const child of node.children) {
    const splitNodes = splitImageParagraph(child);
    if (splitNodes) {
      for (const splitNode of splitNodes) {
        liftImageParagraphs(splitNode);
        children.push(splitNode);
      }
    } else {
      liftImageParagraphs(child);
      children.push(child);
    }
  }
  node.children = children;
}

const markraBlankParagraphRemarkPlugin = $remark("markraBlankParagraphRemark", () => () => (tree: MarkdownTreeNode) => {
  preserveBlankParagraphs(tree);
});

const markraBlockImageRemarkPlugin = $remark("markraBlockImageRemark", () => () => (tree: MarkdownTreeNode) => {
  liftImageParagraphs(tree);
});

function markraMarkdownStyleRemark(this: { data: () => RemarkProcessorData }) {
  const data = this.data();
  data.settings = {
    ...data.settings,
    rule: "*",
    ruleRepetition: 3,
    ruleSpaces: false
  };
}

const markraMarkdownStyleRemarkPlugin = $remark<"markraMarkdownStyleRemark", undefined>(
  "markraMarkdownStyleRemark",
  () => markraMarkdownStyleRemark
);

export const markraCommonmark = [
  markraMarkdownStyleRemarkPlugin,
  markraBlankParagraphRemarkPlugin,
  markraBlockImageRemarkPlugin,
  commonmarkSchema,
  markraBlockImageSchema,
  markraHardbreakSchema,
  commonmarkInputRules,
  commonmarkCommands,
  commonmarkKeymap,
  commonmarkPlugins.filter((plugin) =>
    plugin !== remarkPreserveEmptyLinePlugin.plugin &&
    plugin !== remarkPreserveEmptyLinePlugin.options
  )
].flat();

export const markraGfm = [
  gfmSchema,
  gfmInputRules,
  gfmPasteRules,
  gfmKeymap,
  gfmCommands,
  gfmPlugins
].flat();

function positionHasAncestorNodeName($pos: ResolvedPos, nodeName: string) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) return true;
  }

  return false;
}

function selectionIsInsideNodeName(selection: Selection, nodeName: string) {
  return [selection.$from, selection.$to].every(($pos) => positionHasAncestorNodeName($pos, nodeName));
}

function editorViewIsComposing(view: EditorView) {
  return Boolean((view as EditorView & { composing?: boolean }).composing);
}

export function activeOutlineIndexFromEditorView(view: EditorView) {
  const cursor = view.state.selection.head;
  let outlineIndex = -1;
  let activeOutlineIndex: number | null = null;

  view.state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") return true;

    if (node.textContent.trim()) {
      outlineIndex += 1;
      if (position <= cursor) {
        activeOutlineIndex = outlineIndex;
      }
    }

    return false;
  });

  return activeOutlineIndex;
}

type TextSelectionObserverOptions = {
  onActiveOutlineIndexChange?: (index: number | null) => unknown;
};

export function markraTextSelectionObserverPlugin(
  onTextSelectionChange: (selection: AiSelectionContext | null) => unknown,
  options: TextSelectionObserverOptions = {}
) {
  return $prose(() => {
    let lastSignature = "";
    let lastActiveOutlineIndex: number | null | undefined;

    const notifyActiveOutlineIndexChange = (view: EditorView, force = false) => {
      if (!options.onActiveOutlineIndexChange) return;

      const activeOutlineIndex = activeOutlineIndexFromEditorView(view);
      if (!force && activeOutlineIndex === lastActiveOutlineIndex) return;

      lastActiveOutlineIndex = activeOutlineIndex;
      options.onActiveOutlineIndexChange(activeOutlineIndex);
    };

    const notifySelectionChange = (
      view: EditorView,
      options: { force?: boolean; requireFocusForEmptySelection: boolean }
    ) => {
      if (editorViewIsComposing(view)) return;

      const { selection } = view.state;

      if (selectionIsInsideNodeName(selection, "code_block")) {
        if (lastSignature) {
          lastSignature = "";
          onTextSelectionChange(null);
        }
        return;
      }

      if (selection.empty) {
        if (options.requireFocusForEmptySelection && !view.hasFocus()) return;

        const blockContext = readAiSelectionContextFromView(view);
        if (blockContext.text.trim()) {
          const signature = `${blockContext.source ?? "block"}:${blockContext.from}:${blockContext.to}:${blockContext.text}`;
          if (!options.force && signature === lastSignature) return;

          lastSignature = signature;
          onTextSelectionChange(blockContext);
          return;
        }

        if (lastSignature) {
          lastSignature = "";
          onTextSelectionChange(null);
        }
        return;
      }

      const text = view.state.doc.textBetween(selection.from, selection.to, "\n").trim();
      if (!text) {
        if (view.hasFocus() && lastSignature) {
          lastSignature = "";
          onTextSelectionChange(null);
        }

        return;
      }

      const signature = `${selection.from}:${selection.to}:${text}`;
      if (!options.force && signature === lastSignature) return;

      lastSignature = signature;
      onTextSelectionChange({
        from: selection.from,
        source: "selection",
        text,
        to: selection.to
      });
    };

    const targetIsInsideWritingSurface = (view: EditorView, target: EventTarget | null) => {
      const targetElement =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      const writingSurface = view.dom.closest(".paper-scroll");

      return Boolean(targetElement && writingSurface?.contains(targetElement));
    };

    const hasDomSelectedText = (view: EditorView) => {
      const domSelection = view.dom.ownerDocument.getSelection();

      return Boolean(domSelection && !domSelection.isCollapsed && domSelection.toString().trim());
    };

    const clearStaleSelectionAfterEditorClick = (view: EditorView) => {
      if (!lastSignature) return;

      if (hasDomSelectedText(view)) return;

      if (!view.state.selection.empty) {
        lastSignature = "";
        onTextSelectionChange(null);
        return;
      }

      notifySelectionChange(view, { requireFocusForEmptySelection: false });
    };

    return new Plugin({
      view(view) {
        const ownerDocument = view.dom.ownerDocument;
        let pointerSelectionPending = false;
        notifyActiveOutlineIndexChange(view, true);

        const handleMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return;

          pointerSelectionPending = targetIsInsideWritingSurface(view, event.target);
        };
        const handleMouseUp = (event: MouseEvent) => {
          if (event.button !== 0) return;

          const selectionStartedInEditor = pointerSelectionPending;
          pointerSelectionPending = false;
          if (!targetIsInsideWritingSurface(view, event.target)) return;

          ownerDocument.defaultView?.setTimeout(() => {
            if (selectionStartedInEditor && !view.state.selection.empty && hasDomSelectedText(view)) {
              notifySelectionChange(view, { requireFocusForEmptySelection: false });
              return;
            }

            clearStaleSelectionAfterEditorClick(view);
          }, 0);
        };

        ownerDocument.addEventListener("mousedown", handleMouseDown, true);
        ownerDocument.addEventListener("mouseup", handleMouseUp, true);

        return {
          destroy() {
            ownerDocument.removeEventListener("mousedown", handleMouseDown, true);
            ownerDocument.removeEventListener("mouseup", handleMouseUp, true);
            if (lastActiveOutlineIndex !== undefined) {
              lastActiveOutlineIndex = undefined;
              options.onActiveOutlineIndexChange?.(null);
            }
          },
          update(view, previousState) {
            const { selection } = view.state;
            const selectionChanged = !selection.eq(previousState.selection);
            const documentChanged = !view.state.doc.eq(previousState.doc);
            const selectionTextMayNeedRefresh = !selectionChanged && !selection.empty && !view.state.doc.eq(previousState.doc);
            if (selectionChanged || documentChanged) {
              notifyActiveOutlineIndexChange(view);
            }
            if (!selectionChanged && !selectionTextMayNeedRefresh) return;
            if (pointerSelectionPending) return;
            notifySelectionChange(view, {
              force: selectionTextMayNeedRefresh,
              requireFocusForEmptySelection: true
            });
          }
        };
      }
    });
  });
}

function linkTargetFromClickTarget(target: EventTarget | null) {
  const targetElement =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!targetElement) return null;

  return targetElement.closest<HTMLAnchorElement | HTMLElement>("a[href], .markra-live-link-label[data-markra-href]");
}

function linkHrefFromClickTarget(target: EventTarget | null) {
  const linkTarget = linkTargetFromClickTarget(target);
  if (!linkTarget) return null;

  if (linkTarget instanceof HTMLAnchorElement) {
    return linkTarget.getAttribute("href") ?? linkTarget.href;
  }

  return linkTarget.dataset.markraHref ?? null;
}

function linkOpenModifierIsPressed(event: MouseEvent) {
  return event.metaKey || event.ctrlKey;
}

type ExternalLinkClickPluginOptions = {
  openExternalUrl?: (url: string) => unknown;
  openLocalAttachment?: (src: string) => unknown;
};

const markdownDocumentHrefPattern = /\.(md|markdown)(?:[?#].*)?$/iu;
const markdownImageHrefPattern = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu;

function isLocalAttachmentHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;

  const normalized = trimmed.toLocaleLowerCase();
  if (normalized.startsWith("file:")) {
    return !markdownDocumentHrefPattern.test(trimmed) && !markdownImageHrefPattern.test(trimmed);
  }

  if (normalized.startsWith("data:") || normalized.startsWith("mailto:") || normalized.includes("://")) {
    return false;
  }

  return !markdownDocumentHrefPattern.test(trimmed) && !markdownImageHrefPattern.test(trimmed);
}

function linkOpenerForHref(href: string, options: ExternalLinkClickPluginOptions) {
  if (isLocalAttachmentHref(href) && options.openLocalAttachment) {
    return () => options.openLocalAttachment?.(href);
  }

  if (options.openExternalUrl) {
    return () => options.openExternalUrl?.(href);
  }

  return null;
}

export function markraExternalLinkClickPlugin(options: ExternalLinkClickPluginOptions) {
  return $prose(() => {
    return new Plugin({
      props: {
        handleDOMEvents: {
          mousedown(_view, event) {
            const href = linkHrefFromClickTarget(event.target);
            if (!href) return false;

            if (!linkOpenModifierIsPressed(event)) {
              return false;
            }

            if (!linkOpenerForHref(href, options)) return false;

            event.preventDefault();
            return true;
          },
          click(_view, event) {
            const href = linkHrefFromClickTarget(event.target);
            if (!href) return false;

            if (!linkOpenModifierIsPressed(event)) {
              return false;
            }

            const openLink = linkOpenerForHref(href, options);
            if (!openLink) return false;

            event.preventDefault();

            try {
              Promise.resolve(openLink()).catch(() => {});
            } catch {
              // Opening external links is best-effort; editing should not be interrupted by opener failures.
            }

            return true;
          }
        }
      }
    });
  });
}
