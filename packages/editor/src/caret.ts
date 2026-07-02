import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { vimNormalClassName } from "./vim-mode";

const customCaretClassName = "markra-prosemirror-custom-caret";
const caretClassName = "markra-prosemirror-caret";
const blockCaretClassName = "markra-prosemirror-caret-block";

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

function caretWidth(view: EditorView) {
  if (!view.dom.classList.contains(vimNormalClassName)) return "1px";

  return `${Math.max(3, Math.round(caretFontSize(view) * 0.44))}px`;
}

function blockCaretWidth(view: EditorView, left: number) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return caretWidth(view);

  try {
    const next = view.coordsAtPos(selection.from + 1, -1);
    const measuredWidth = Math.round(next.left - left);
    if (measuredWidth > 1) return `${measuredWidth}px`;
  } catch {
    return caretWidth(view);
  }

  return caretWidth(view);
}

function hideCaret(caret: HTMLElement) {
  caret.style.display = "none";
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
    hideCaret(this.caret);
  };

  private readonly handleCompositionEnd = () => {
    this.composing = false;
    this.update(this.view);
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
    this.view.dom.ownerDocument.addEventListener("selectionchange", this.handleViewportChange);
    window?.addEventListener("resize", this.handleViewportChange);
    window?.addEventListener("scroll", this.handleViewportChange, true);
  }

  update(view: EditorView) {
    this.view = view;

    const { selection } = view.state;
    if (
      this.composing ||
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

    const lineHeight = coords.bottom - coords.top;
    const height = caretHeight(view, lineHeight);
    const top = coords.top + Math.max(0, lineHeight - height) / 2;
    const block = view.dom.classList.contains(vimNormalClassName);

    this.caret.style.display = "block";
    this.caret.style.left = `${Math.round(coords.left)}px`;
    this.caret.style.top = `${Math.round(top)}px`;
    this.caret.style.height = `${height}px`;
    this.caret.style.width = block ? blockCaretWidth(view, coords.left) : caretWidth(view);
    this.caret.classList.toggle(blockCaretClassName, block);
  }

  destroy() {
    const window = this.view.dom.ownerDocument.defaultView;
    this.view.dom.classList.remove(customCaretClassName);
    this.view.dom.removeEventListener("focus", this.handleFocus);
    this.view.dom.removeEventListener("blur", this.handleBlur);
    this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
    this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
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
