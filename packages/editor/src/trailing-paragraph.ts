import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const trailingParagraphKey = new PluginKey("markraTrailingParagraph");
const terminalAffordanceTextblockNodeNames = new Set([
  "code_block",
  "frontmatter",
  "heading"
]);
const terminalAffordanceAtomNodeNames = new Set([
  "hr",
  "html",
  "image"
]);

function needsTrailingParagraphAffordance(doc: ProseNode, paragraph: NodeType) {
  const lastNode = doc.lastChild;
  if (!lastNode) return false;
  if (lastNode.type === paragraph) {
    return lastNode.content.size > 0 && doc.canReplaceWith(doc.childCount, doc.childCount, paragraph);
  }
  if (lastNode.isTextblock && !terminalAffordanceTextblockNodeNames.has(lastNode.type.name)) return false;
  if (lastNode.isAtom && !terminalAffordanceAtomNodeNames.has(lastNode.type.name)) return false;

  return doc.canReplaceWith(doc.childCount, doc.childCount, paragraph);
}

function isPlainLeftMouseDown(event: MouseEvent) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function eventTargetElement(target: EventTarget | null) {
  return target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
}

function hasNonCollapsedNativeSelection(document: Document) {
  const selection = document.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

function isTopLevelContentElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && !element.classList.contains("markra-trailing-paragraph");
}

function lastTopLevelContentElement(view: EditorView) {
  return Array.from(view.dom.children).filter(isTopLevelContentElement).at(-1) ?? null;
}

function clickIsPastLastTopLevelBlock(view: EditorView, event: MouseEvent) {
  const lastElement = lastTopLevelContentElement(view);
  if (!lastElement) return true;

  const rect = lastElement.getBoundingClientRect();
  return event.clientY >= rect.bottom;
}

function insertTrailingParagraph(view: EditorView, paragraph: NodeType) {
  if (!view.editable) return false;
  if (!needsTrailingParagraphAffordance(view.state.doc, paragraph)) return false;

  const insertAt = view.state.doc.content.size;
  const transaction = view.state.tr.insert(insertAt, paragraph.create());
  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, insertAt + 1))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function createTrailingParagraphWidget(view: EditorView, paragraph: NodeType) {
  const widget = view.dom.ownerDocument.createElement("div");
  widget.className = "markra-trailing-paragraph";
  widget.contentEditable = "false";
  widget.dataset.markraTrailingParagraph = "true";
  widget.setAttribute("aria-hidden", "true");
  widget.style.cursor = "text";
  widget.style.display = "block";
  widget.style.minHeight = "1.65em";
  widget.style.width = "100%";

  widget.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    insertTrailingParagraph(view, paragraph);
  });

  return widget;
}

export function createTrailingParagraphPlugin(paragraph: NodeType) {
  return new Plugin({
    key: trailingParagraphKey,
    view(view) {
      const paper = view.dom.closest<HTMLElement>(".markdown-paper");
      if (!paper) return {};

      const handlePaperMouseDown = (event: MouseEvent) => {
        if (!isPlainLeftMouseDown(event)) return;

        const target = eventTargetElement(event.target);
        if (target !== paper) return;
        if (hasNonCollapsedNativeSelection(paper.ownerDocument)) return;
        if (!clickIsPastLastTopLevelBlock(view, event)) return;
        if (!insertTrailingParagraph(view, paragraph)) return;

        event.preventDefault();
        event.stopPropagation();
      };

      paper.addEventListener("mousedown", handlePaperMouseDown);

      return {
        destroy() {
          paper.removeEventListener("mousedown", handlePaperMouseDown);
        }
      };
    },
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (event.target !== view.dom || !isPlainLeftMouseDown(event)) return false;
          if (!clickIsPastLastTopLevelBlock(view, event)) return false;
          if (!insertTrailingParagraph(view, paragraph)) return false;

          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      },
      decorations(state) {
        if (!needsTrailingParagraphAffordance(state.doc, paragraph)) return DecorationSet.empty;

        return DecorationSet.create(state.doc, [
          Decoration.widget(
            state.doc.content.size,
            (view) => createTrailingParagraphWidget(view, paragraph),
            {
              key: "markra-trailing-paragraph",
              side: 1,
              stopEvent: (event) => event.type === "mousedown"
            }
          )
        ]);
      }
    }
  });
}

export const markraTrailingParagraphPlugin = $prose((ctx) =>
  createTrailingParagraphPlugin(paragraphSchema.type(ctx))
);
