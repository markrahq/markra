import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const gapGuardedBlockNames = new Set(["hr"]);
const maximumGuardedGapPadding = 4;

function isPlainLeftMouseDown(event: MouseEvent) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function eventTargetElement(target: EventTarget | null) {
  return target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
}

function pixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function guardedGapExtent(value: string) {
  const pixels = pixelValue(value);
  if (!pixels) return maximumGuardedGapPadding;

  return Math.min(pixels, maximumGuardedGapPadding);
}

function blockGapExtents(element: Element) {
  const ownerWindow = element.ownerDocument.defaultView;
  if (!ownerWindow) {
    return {
      bottom: maximumGuardedGapPadding,
      top: maximumGuardedGapPadding
    };
  }

  const style = ownerWindow.getComputedStyle(element);
  return {
    bottom: guardedGapExtent(style.marginBottom),
    top: guardedGapExtent(style.marginTop)
  };
}

function horizontalPointIsInsideRect(left: number, rect: DOMRect) {
  return left >= rect.left && left <= rect.right;
}

function verticalPointIsInsideBlockGap(top: number, rect: DOMRect, gap: { bottom: number; top: number }) {
  if (top >= rect.top - gap.top && top < rect.top) return true;
  if (top > rect.bottom && top <= rect.bottom + gap.bottom) return true;

  return false;
}

function eventTargetsEditorSurface(view: EditorView, target: EventTarget | null) {
  return eventTargetElement(target) === view.dom;
}

function pointIsInGuardedBlockGap(view: EditorView, left: number, top: number) {
  let isInGap = false;

  view.state.doc.descendants((node, position) => {
    if (!gapGuardedBlockNames.has(node.type.name)) return true;

    const dom = view.nodeDOM(position);
    const element = eventTargetElement(dom);
    const rect = element?.getBoundingClientRect();
    if (!element || !rect || !horizontalPointIsInsideRect(left, rect)) return false;

    const gap = blockGapExtents(element);
    if (verticalPointIsInsideBlockGap(top, rect, gap)) {
      isInGap = true;
      return false;
    }

    return false;
  });

  return isInGap;
}

export function createBlockGapPlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!view.editable || !isPlainLeftMouseDown(event)) return false;
          if (!eventTargetsEditorSurface(view, event.target)) return false;
          if (!pointIsInGuardedBlockGap(view, event.clientX, event.clientY)) return false;

          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      }
    }
  });
}

export const markraBlockGapPlugin = $prose(() => createBlockGapPlugin());
