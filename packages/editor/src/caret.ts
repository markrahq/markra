import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const customCaretClassName = "markra-prosemirror-custom-caret";
const caretClassName = "markra-prosemirror-caret";

function focused(view: EditorView) {
  return view.hasFocus() || view.dom.classList.contains("ProseMirror-focused");
}

function caretFontSize(view: EditorView) {
  const fontSize = view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom).fontSize ?? "";
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

function caretHeight(view: EditorView, lineHeight: number) {
  const targetHeight = Math.round(caretFontSize(view) * 1.125);
  return Math.max(1, Math.min(targetHeight, lineHeight > 0 ? lineHeight : targetHeight));
}

function hideCaret(caret: HTMLElement) {
  caret.style.display = "none";
}

function usableRangeRect(range: Range) {
  const usable = (rect: DOMRect) =>
    [rect.bottom, rect.left, rect.right, rect.top].every(Number.isFinite) &&
    (rect.bottom > rect.top || rect.right > rect.left);
  const clientRect = Array.from(range.getClientRects()).find(usable);
  if (clientRect) return clientRect;

  const boundingRect = range.getBoundingClientRect();
  return usable(boundingRect) ? boundingRect : null;
}

function adjacentTextCaretCoords(view: EditorView, text: Text, offset: number, range: Range) {
  const useNextCharacter = offset < text.data.length;
  if (!useNextCharacter && offset === 0) return null;

  if (useNextCharacter) {
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
  } else {
    range.setStart(text, offset - 1);
    range.setEnd(text, offset);
  }

  const rect = usableRangeRect(range);
  if (!rect) return null;

  const direction = text.parentElement
    ? view.dom.ownerDocument.defaultView?.getComputedStyle(text.parentElement).direction
    : "ltr";
  const rtl = direction === "rtl";
  const leadingEdge = rtl ? rect.right : rect.left;
  const trailingEdge = rtl ? rect.left : rect.right;
  const left = useNextCharacter ? leadingEdge : trailingEdge;

  return {
    bottom: rect.bottom,
    left,
    right: left,
    top: rect.top
  };
}

function compositionCaretCoords(view: EditorView) {
  const selection = view.dom.ownerDocument.getSelection();
  const focusNode = selection?.focusNode;
  if (!selection || !focusNode || !view.dom.contains(focusNode)) return null;

  try {
    // ProseMirror positions exclude uncommitted IME text, but the DOM selection tracks its internal caret.
    const range = view.dom.ownerDocument.createRange();
    range.setStart(focusNode, selection.focusOffset);
    range.collapse(true);
    const rect = usableRangeRect(range);
    if (rect) {
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      };
    }

    return focusNode.nodeType === Node.TEXT_NODE
      ? adjacentTextCaretCoords(view, focusNode as Text, selection.focusOffset, range)
      : null;
  } catch {
    return null;
  }
}

class VisualCaretView {
  private readonly caret: HTMLElement;
  private composing = false;

  constructor(private view: EditorView) {
    this.caret = view.dom.ownerDocument.createElement("span");
    this.caret.className = caretClassName;
    this.caret.setAttribute("aria-hidden", "true");
    hideCaret(this.caret);

    const root = view.dom.closest<HTMLElement>(".markdown-paper") ?? view.dom.ownerDocument.body;
    root.append(this.caret);
    view.dom.classList.add(customCaretClassName);
    this.bind();
    this.update(view);
  }

  private readonly handleFocus = () => {
    this.update(this.view);
  };

  private readonly handleBlur = () => {
    hideCaret(this.caret);
  };

  private readonly handleCompositionStart = () => {
    this.composing = true;
    this.update(this.view);
  };

  private readonly handleCompositionEnd = () => {
    this.composing = false;
    this.update(this.view);
  };

  private readonly handleInput = () => {
    if (this.composing) this.update(this.view);
  };

  private readonly handleViewportChange = () => {
    this.update(this.view);
  };

  private bind() {
    const window = this.view.dom.ownerDocument.defaultView;
    this.view.dom.addEventListener("focus", this.handleFocus);
    this.view.dom.addEventListener("blur", this.handleBlur);
    this.view.dom.addEventListener("compositionstart", this.handleCompositionStart);
    this.view.dom.addEventListener("compositionend", this.handleCompositionEnd);
    this.view.dom.addEventListener("input", this.handleInput);
    this.view.dom.ownerDocument.addEventListener("selectionchange", this.handleViewportChange);
    window?.addEventListener("resize", this.handleViewportChange);
    window?.addEventListener("scroll", this.handleViewportChange, true);
  }

  update(view: EditorView) {
    this.view = view;

    const { selection } = view.state;
    if (
      !view.editable ||
      !focused(view) ||
      !(selection instanceof TextSelection) ||
      !selection.empty
    ) {
      hideCaret(this.caret);
      return;
    }

    let coords: ReturnType<EditorView["coordsAtPos"]>;
    try {
      coords = view.coordsAtPos(selection.from);
    } catch {
      hideCaret(this.caret);
      return;
    }

    if (this.composing) {
      const compositionCoords = compositionCaretCoords(view);
      if (compositionCoords) {
        const hasCompositionLineHeight = compositionCoords.bottom > compositionCoords.top;
        coords = {
          bottom: hasCompositionLineHeight ? compositionCoords.bottom : coords.bottom,
          left: compositionCoords.left,
          right: compositionCoords.right,
          top: hasCompositionLineHeight ? compositionCoords.top : coords.top
        };
      }
    }

    const lineHeight = coords.bottom - coords.top;
    const height = caretHeight(view, lineHeight);
    const top = coords.top + Math.max(0, lineHeight - height) / 2;

    this.caret.style.display = "block";
    this.caret.style.left = `${Math.round(coords.left)}px`;
    this.caret.style.top = `${Math.round(top)}px`;
    this.caret.style.height = `${height}px`;
  }

  destroy() {
    const window = this.view.dom.ownerDocument.defaultView;
    this.view.dom.classList.remove(customCaretClassName);
    this.view.dom.removeEventListener("focus", this.handleFocus);
    this.view.dom.removeEventListener("blur", this.handleBlur);
    this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
    this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
    this.view.dom.removeEventListener("input", this.handleInput);
    this.view.dom.ownerDocument.removeEventListener("selectionchange", this.handleViewportChange);
    window?.removeEventListener("resize", this.handleViewportChange);
    window?.removeEventListener("scroll", this.handleViewportChange, true);
    this.caret.remove();
  }
}

export const markraVisualCaretPlugin = $prose(() =>
  new Plugin({
    view: (view) => new VisualCaretView(view)
  })
);
