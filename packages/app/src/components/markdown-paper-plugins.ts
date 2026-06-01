import {
  commands as commonmarkCommands,
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

export const markraCommonmark = [
  markraBlankParagraphRemarkPlugin,
  markraBlockImageRemarkPlugin,
  commonmarkSchema,
  markraBlockImageSchema,
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

export function markraTextSelectionObserverPlugin(
  onTextSelectionChange: (selection: AiSelectionContext | null) => unknown
) {
  return $prose(() => {
    let lastSignature = "";

    const notifySelectionChange = (view: EditorView, options: { requireFocusForEmptySelection: boolean }) => {
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
          if (signature === lastSignature) return;

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
      if (signature === lastSignature) return;

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
          },
          update(view, previousState) {
            const { selection } = view.state;
            if (selection.eq(previousState.selection)) return;
            if (pointerSelectionPending) return;
            notifySelectionChange(view, { requireFocusForEmptySelection: true });
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

export function markraExternalLinkClickPlugin(openExternalUrl: (url: string) => unknown) {
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

            event.preventDefault();
            return true;
          },
          click(_view, event) {
            const href = linkHrefFromClickTarget(event.target);
            if (!href) return false;

            if (!linkOpenModifierIsPressed(event)) {
              return false;
            }

            event.preventDefault();

            try {
              Promise.resolve(openExternalUrl(href)).catch(() => {});
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
