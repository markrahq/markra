import { Fragment, type Node as ProseNode, type ResolvedPos } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { openSlashCommandMenu } from "./slash-commands.ts";

export type BlockDragLabels = {
  addBlock: string;
  dragBlock: string;
};

type BlockDragRange = {
  depth: number;
  node: ProseNode;
  parentStart: number;
  parentTypeName: string;
  pos: number;
};

type BlockDropTarget = {
  placement: "nested" | "sibling";
  range: BlockDragRange;
  side: "before" | "after";
};

type PointerDragState = {
  pointerId: number;
  range: BlockDragRange;
  startLeft: number;
  startTop: number;
};

type MouseDragState = {
  range: BlockDragRange;
  startLeft: number;
  startTop: number;
};

const blockDragKey = new PluginKey("markra-block-drag");
const markraBlockDragMime = "application/x-markra-block";
const movableNodeNames = new Set([
  "blockquote",
  "code_block",
  "heading",
  "horizontal_rule",
  "image",
  "list_item",
  "paragraph",
  "table"
]);
const listNodeNames = new Set(["bullet_list", "ordered_list"]);
const priorityNodeNames = ["list_item", "blockquote"];
const tableNodeNames = new Set(["table", "table_cell", "table_header", "table_row"]);

const defaultBlockDragLabels: BlockDragLabels = {
  addBlock: "Add block below",
  dragBlock: "Drag block"
};
const blockMoveAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"
};
const dragGhostOffset = {
  left: 12,
  top: 10
};
const dragGhostTextLimit = 96;
const blockToolbarGutterOffset = 54;
const dropIndicatorInset = 2;
const dropIndicatorMaxWidth = 640;
const edgeScrollMaxStep = 28;
const edgeScrollThreshold = 72;
const listNestOffset = 36;

function normalizeBlockDragLabels(labels: Partial<BlockDragLabels> | undefined): BlockDragLabels {
  return {
    ...defaultBlockDragLabels,
    ...labels
  };
}

function clampedDocumentPosition(state: EditorState, position: number) {
  return Math.max(0, Math.min(position, state.doc.content.size));
}

function pixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineHeightValue(lineHeight: string, fontSize: string) {
  const parsedLineHeight = Number.parseFloat(lineHeight);
  if (!Number.isFinite(parsedLineHeight)) return 0;
  if (lineHeight.endsWith("px")) return parsedLineHeight;

  const parsedFontSize = pixelValue(fontSize);
  if (parsedFontSize <= 0) return 0;

  return parsedLineHeight * parsedFontSize;
}

function contentBoxFirstLineCenterTop(element: Element, rect: DOMRect) {
  const ownerWindow = element.ownerDocument.defaultView;
  if (!ownerWindow) return rect.top;

  const style = ownerWindow.getComputedStyle(element);
  const borderTop = pixelValue(style.borderTopWidth);
  const borderBottom = pixelValue(style.borderBottomWidth);
  const paddingTop = pixelValue(style.paddingTop);
  const paddingBottom = pixelValue(style.paddingBottom);
  const contentHeight = Math.max(0, rect.height - borderTop - borderBottom - paddingTop - paddingBottom);
  const lineHeight = lineHeightValue(style.lineHeight, style.fontSize);
  const firstLineHeight = lineHeight > 0 ? Math.min(contentHeight, lineHeight) : contentHeight;

  return rect.top + borderTop + paddingTop + firstLineHeight / 2;
}

function hasTableAncestor($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (tableNodeNames.has($pos.node(depth).type.name)) return true;
  }

  return false;
}

function blockRangeAtDepth($pos: ResolvedPos, depth: number): BlockDragRange {
  const parentDepth = depth - 1;
  const parent = $pos.node(parentDepth);

  return {
    depth,
    node: $pos.node(depth),
    parentStart: parentDepth === 0 ? 0 : $pos.before(parentDepth),
    parentTypeName: parent.type.name,
    pos: $pos.before(depth)
  };
}

function topLevelBlockRangeAtPosition(state: EditorState, position: number): BlockDragRange | null {
  let containingRange: BlockDragRange | null = null;
  let exactStartRange: BlockDragRange | null = null;
  let exactEndAtomRange: BlockDragRange | null = null;

  state.doc.forEach((node, offset) => {
    if (!movableNodeNames.has(node.type.name)) return;

    const end = offset + node.nodeSize;
    const range: BlockDragRange = {
      depth: 1,
      node,
      parentStart: 0,
      parentTypeName: "doc",
      pos: offset
    };

    if (position > offset && position < end) {
      containingRange = range;
    } else if (position === offset) {
      exactStartRange ??= range;
    } else if (position === end && node.isAtom) {
      exactEndAtomRange = range;
    }
  });

  return containingRange ?? exactEndAtomRange ?? exactStartRange;
}

function findAncestorRangeByName($pos: ResolvedPos, nodeName: string) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === nodeName) return blockRangeAtDepth($pos, depth);
  }

  return null;
}

function findMovableBlockAtPosition(state: EditorState, position: number): BlockDragRange | null {
  const clampedPosition = clampedDocumentPosition(state, position);
  const topLevelRange = topLevelBlockRangeAtPosition(state, clampedPosition);
  if (topLevelRange) return topLevelRange;

  const $pos = state.doc.resolve(clampedPosition);
  const tableRange = findAncestorRangeByName($pos, "table");
  if (tableRange) return tableRange;
  if (hasTableAncestor($pos)) return null;

  for (const nodeName of priorityNodeNames) {
    const priorityRange = findAncestorRangeByName($pos, nodeName);
    if (priorityRange) return priorityRange;
  }

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (!movableNodeNames.has(node.type.name)) continue;

    return blockRangeAtDepth($pos, depth);
  }

  return null;
}

function sameParentBlock(source: BlockDragRange, target: BlockDragRange) {
  return source.parentStart === target.parentStart && source.parentTypeName === target.parentTypeName;
}

function isListItem(range: BlockDragRange) {
  return range.node.type.name === "list_item";
}

function parentNodeForRange(state: EditorState, range: BlockDragRange) {
  return range.parentTypeName === "doc" ? state.doc : state.doc.nodeAt(range.parentStart);
}

function listItemFromBlock(source: BlockDragRange, target: BlockDropTarget) {
  if (isListItem(source)) return source.node;

  return target.range.node.type.createAndFill(null, source.node);
}

function dropBoundary(target: BlockDropTarget) {
  return target.side === "before" ? target.range.pos : target.range.pos + target.range.node.nodeSize;
}

function targetInsideSource(source: BlockDragRange, target: BlockDropTarget) {
  const sourceEnd = source.pos + source.node.nodeSize;
  return target.range.pos >= source.pos && target.range.pos < sourceEnd;
}

function canMoveListItem(state: EditorState, source: BlockDragRange, target: BlockDropTarget) {
  if (targetInsideSource(source, target)) return false;
  if (target.placement === "nested") return isListItem(target.range);

  const sourceParent = parentNodeForRange(state, source);
  if (!sourceParent || !listNodeNames.has(sourceParent.type.name)) return false;
  if (isListItem(target.range)) return true;

  return true;
}

function canMoveBlockIntoList(state: EditorState, source: BlockDragRange, target: BlockDropTarget) {
  if (targetInsideSource(source, target)) return false;
  if (!isListItem(target.range)) return false;

  const targetParent = parentNodeForRange(state, target.range);
  if (!targetParent || !listNodeNames.has(targetParent.type.name)) return false;

  return listItemFromBlock(source, target) !== null;
}

function canMoveBlock(state: EditorState, source: BlockDragRange, target: BlockDropTarget) {
  if (isListItem(source)) return canMoveListItem(state, source, target);
  if (canMoveBlockIntoList(state, source, target)) return true;

  if (!sameParentBlock(source, target.range)) return false;
  if (targetInsideSource(source, target)) return false;

  const sourceEnd = source.pos + source.node.nodeSize;
  const boundary = dropBoundary(target);
  return boundary < source.pos || boundary > sourceEnd;
}

function siblingBlockElements(view: EditorView, range: BlockDragRange) {
  const element = targetFromEventTarget(view.nodeDOM(range.pos));
  const parent = element?.parentElement;
  if (!parent) return [];

  return Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function snapshotBlockRects(elements: HTMLElement[]) {
  const rects = new Map<HTMLElement, DOMRect>();
  for (const element of elements) {
    rects.set(element, element.getBoundingClientRect());
  }

  return rects;
}

function animateBlockMoves(elements: HTMLElement[], beforeRects: Map<HTMLElement, DOMRect>) {
  for (const element of elements) {
    const before = beforeRects.get(element);
    if (!before || typeof element.animate !== "function") continue;

    const after = element.getBoundingClientRect();
    const deltaX = before.left - after.left;
    const deltaY = before.top - after.top;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

    const animation = element.animate(
      [
        { transform: `translate(${Math.round(deltaX)}px, ${Math.round(deltaY)}px)` },
        { transform: "translate(0, 0)" }
      ],
      blockMoveAnimation
    );
    animation.finished?.catch(() => {});
  }
}

function listItemDeleteRange(state: EditorState, source: BlockDragRange, target: BlockDropTarget) {
  const sourceParent = parentNodeForRange(state, source);
  if (
    sourceParent &&
    listNodeNames.has(sourceParent.type.name) &&
    sourceParent.childCount === 1 &&
    !sameParentBlock(source, target.range)
  ) {
    return {
      from: source.parentStart,
      to: source.parentStart + sourceParent.nodeSize
    };
  }

  return {
    from: source.pos,
    to: source.pos + source.node.nodeSize
  };
}

function dispatchBlockMove(
  view: EditorView,
  source: BlockDragRange,
  target: BlockDropTarget,
  insertPos: number,
  insertNode: ProseNode
) {
  const currentNode = view.state.doc.nodeAt(source.pos);
  if (!currentNode || !currentNode.eq(source.node)) return false;

  const animatedElements = siblingBlockElements(view, source);
  const beforeRects = snapshotBlockRects(animatedElements);
  const deleteRange = isListItem(source)
    ? listItemDeleteRange(view.state, source, target)
    : { from: source.pos, to: source.pos + source.node.nodeSize };
  const insertAssoc = insertPos > deleteRange.from ? -1 : 1;

  try {
    const tr = view.state.tr.delete(deleteRange.from, deleteRange.to);
    const mappedInsertPos = tr.mapping.map(insertPos, insertAssoc);
    tr.insert(mappedInsertPos, insertNode);
    const selectionPosition = Math.min(mappedInsertPos + 1, tr.doc.content.size);
    const selection = TextSelection.near(tr.doc.resolve(selectionPosition), 1);

    view.dispatch(tr.setSelection(selection).scrollIntoView());
    animateBlockMoves(animatedElements, beforeRects);
    view.focus();
    return true;
  } catch {
    return false;
  }
}

function moveListItemAsSibling(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  return dispatchBlockMove(view, source, target, dropBoundary(target), source.node);
}

function moveListItemOutsideList(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  const sourceParent = parentNodeForRange(view.state, source);
  if (!sourceParent || !listNodeNames.has(sourceParent.type.name)) return false;

  const wrapperList = sourceParent.type.create(sourceParent.attrs, source.node);
  return dispatchBlockMove(view, source, target, dropBoundary(target), wrapperList);
}

function findNestedListInTarget(
  target: BlockDropTarget,
  listType: ProseNode["type"]
): { node: ProseNode; pos: number } | null {
  let existingList: { node: ProseNode; pos: number } | null = null;

  target.range.node.forEach((child, offset) => {
    if (existingList || child.type !== listType) return;
    existingList = {
      node: child,
      pos: target.range.pos + 1 + offset
    };
  });

  return existingList;
}

function nestedListInsertion(listItem: ProseNode, listType: ProseNode["type"], target: BlockDropTarget) {
  if (!listNodeNames.has(listType.name)) return null;

  const existingList = findNestedListInTarget(target, listType);

  if (existingList) {
    return {
      insertNode: listItem,
      insertPos: existingList.pos + existingList.node.nodeSize - 1
    };
  }

  return {
    insertNode: listType.create(null, listItem),
    insertPos: target.range.pos + target.range.node.nodeSize - 1
  };
}

function moveListItemNested(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  const sourceParent = parentNodeForRange(view.state, source);
  if (!sourceParent || !listNodeNames.has(sourceParent.type.name)) return false;

  const insertion = nestedListInsertion(source.node, sourceParent.type, target);
  if (!insertion) return false;

  return dispatchBlockMove(view, source, target, insertion.insertPos, insertion.insertNode);
}

function moveListItem(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  if (target.placement === "nested") return moveListItemNested(view, source, target);
  if (isListItem(target.range)) return moveListItemAsSibling(view, source, target);

  return moveListItemOutsideList(view, source, target);
}

function moveBlockIntoList(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  const listItem = listItemFromBlock(source, target);
  const targetParent = parentNodeForRange(view.state, target.range);
  if (!listItem || !targetParent || !listNodeNames.has(targetParent.type.name)) return false;

  if (target.placement === "nested") {
    const insertion = nestedListInsertion(listItem, targetParent.type, target);
    if (!insertion) return false;

    return dispatchBlockMove(view, source, target, insertion.insertPos, insertion.insertNode);
  }

  return dispatchBlockMove(view, source, target, dropBoundary(target), listItem);
}

function moveBlock(view: EditorView, source: BlockDragRange, target: BlockDropTarget) {
  if (!canMoveBlock(view.state, source, target)) return false;
  if (isListItem(source)) return moveListItem(view, source, target);
  if (canMoveBlockIntoList(view.state, source, target)) return moveBlockIntoList(view, source, target);

  const currentNode = view.state.doc.nodeAt(source.pos);
  if (!currentNode || !currentNode.eq(source.node)) return false;

  const animatedElements = siblingBlockElements(view, source);
  const beforeRects = snapshotBlockRects(animatedElements);
  const sourceEnd = source.pos + source.node.nodeSize;
  const boundary = dropBoundary(target);
  let insertPos = boundary;
  if (boundary > source.pos) insertPos -= source.node.nodeSize;

  try {
    const tr = view.state.tr.delete(source.pos, sourceEnd).insert(insertPos, source.node);
    const selection = TextSelection.near(tr.doc.resolve(Math.min(insertPos + 1, tr.doc.content.size)), 1);

    view.dispatch(tr.setSelection(selection).scrollIntoView());
    animateBlockMoves(animatedElements, beforeRects);
    view.focus();
    return true;
  } catch {
    return false;
  }
}

function paragraphBlockFor(view: EditorView) {
  const paragraph = view.state.schema.nodes.paragraph;
  return paragraph?.create() ?? null;
}

function blockToInsertAfter(view: EditorView) {
  return paragraphBlockFor(view);
}

function listChildIndexForRange(list: ProseNode, range: BlockDragRange) {
  const targetOffset = range.pos - range.parentStart - 1;
  let targetIndex = -1;

  list.forEach((child, offset, index) => {
    if (targetIndex >= 0) return;
    if (offset !== targetOffset || !child.eq(range.node)) return;

    targetIndex = index;
  });

  return targetIndex;
}

function splitListAroundInsertedParagraph(view: EditorView, range: BlockDragRange) {
  const paragraph = paragraphBlockFor(view);
  if (!paragraph) return false;

  const list = parentNodeForRange(view.state, range);
  if (!list || !listNodeNames.has(list.type.name)) return false;

  const targetIndex = listChildIndexForRange(list, range);
  if (targetIndex < 0) return false;

  const beforeItems: ProseNode[] = [];
  const afterItems: ProseNode[] = [];

  list.forEach((child, _offset, index) => {
    if (index <= targetIndex) {
      beforeItems.push(child);
      return;
    }

    afterItems.push(child);
  });

  const beforeList = list.type.create(list.attrs, Fragment.fromArray(beforeItems));
  const replacementNodes: ProseNode[] = [beforeList, paragraph];
  const paragraphPosition = range.parentStart + beforeList.nodeSize;

  if (afterItems.length > 0) {
    const afterAttrs = list.type.name === "ordered_list"
      ? { ...list.attrs, order: (list.attrs.order ?? 1) + targetIndex + 1 }
      : list.attrs;
    replacementNodes.push(list.type.create(afterAttrs, Fragment.fromArray(afterItems)));
  }

  try {
    const tr = view.state.tr.replaceWith(
      range.parentStart,
      range.parentStart + list.nodeSize,
      Fragment.fromArray(replacementNodes)
    );
    const selection = TextSelection.near(tr.doc.resolve(paragraphPosition + 1), 1);
    view.dispatch(tr.setSelection(selection).scrollIntoView());
    view.focus();
    return true;
  } catch {
    return false;
  }
}

function insertBlockAfter(view: EditorView, range: BlockDragRange) {
  if (range.node.type.name === "list_item") return splitListAroundInsertedParagraph(view, range);

  const block = blockToInsertAfter(view);
  if (!block) return false;

  const insertPos = range.pos + range.node.nodeSize;

  try {
    const tr = view.state.tr.insert(insertPos, block);
    const selection = TextSelection.near(tr.doc.resolve(insertPos + 1), 1);
    view.dispatch(tr.setSelection(selection).scrollIntoView());
    view.focus();
    return true;
  } catch {
    return false;
  }
}

function targetFromEventTarget(target: EventTarget | null) {
  return target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
}

function clearTimeoutIfNeeded(timeout: ReturnType<typeof setTimeout> | null) {
  if (timeout !== null) clearTimeout(timeout);
}

function clearNativeSelection(ownerDocument: Document) {
  const selection = ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  selection.removeAllRanges();
}

function dragGhostText(range: BlockDragRange) {
  const text = range.node.textContent.trim().replace(/\s+/g, " ");
  const label = text.length > 0 ? text : range.node.type.name.replace(/_/g, " ");
  if (label.length <= dragGhostTextLimit) return label;

  return `${label.slice(0, dragGhostTextLimit - 3)}...`;
}

function scrollContainerFor(viewDom: HTMLElement, ownerDocument: Document) {
  const paperScroll = viewDom.closest<HTMLElement>(".paper-scroll");
  if (paperScroll) return paperScroll;

  const scrollingElement = ownerDocument.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
}

class MarkraBlockDragView {
  private activeRange: BlockDragRange | null = null;
  private dragSourceElement: Element | null = null;
  private draggingRange: BlockDragRange | null = null;
  private dropTarget: BlockDropTarget | null = null;
  private readonly ghost: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly addButton: HTMLButtonElement;
  private readonly handle: HTMLButtonElement;
  private readonly indicator: HTMLElement;
  private mouseDrag: MouseDragState | null = null;
  private nativeDragActive = false;
  private readonly ownerDocument: Document;
  private pointerDrag: PointerDragState | null = null;
  private readonly root: HTMLElement;
  private readonly scrollContainer: HTMLElement | null;
  private readonly toolbar: HTMLElement;

  constructor(
    private readonly view: EditorView,
    labels: BlockDragLabels
  ) {
    const ownerDocument = view.dom.ownerDocument;
    this.ownerDocument = ownerDocument;
    this.root = view.dom.closest<HTMLElement>(".markdown-paper") ?? view.dom.parentElement ?? view.dom;
    this.toolbar = ownerDocument.createElement("div");
    this.addButton = ownerDocument.createElement("button");
    this.handle = ownerDocument.createElement("button");
    this.indicator = ownerDocument.createElement("div");
    this.ghost = ownerDocument.createElement("div");
    this.scrollContainer = scrollContainerFor(view.dom, ownerDocument);

    this.toolbar.className = "markra-block-toolbar";
    this.toolbar.contentEditable = "false";
    this.toolbar.dataset.show = "false";

    this.addButton.type = "button";
    this.addButton.className = "markra-block-tool-button markra-block-add-button";
    this.addButton.title = labels.addBlock;
    this.addButton.ariaLabel = labels.addBlock;
    this.addButton.contentEditable = "false";
    this.addButton.draggable = false;

    this.handle.type = "button";
    this.handle.className = "markra-block-tool-button markra-block-drag-handle";
    this.handle.title = labels.dragBlock;
    this.handle.ariaLabel = labels.dragBlock;
    this.handle.contentEditable = "false";
    this.handle.draggable = false;

    for (let index = 0; index < 4; index += 1) {
      const dot = ownerDocument.createElement("span");
      dot.className = "markra-block-drag-dot";
      this.handle.append(dot);
    }

    this.indicator.className = "markra-block-drop-indicator";
    this.indicator.ariaHidden = "true";
    this.indicator.dataset.show = "false";

    this.ghost.className = "markra-block-drag-ghost";
    this.ghost.ariaHidden = "true";
    this.ghost.contentEditable = "false";
    this.ghost.dataset.show = "false";
    this.ghost.style.left = "0px";
    this.ghost.style.top = "0px";

    this.toolbar.append(this.addButton, this.handle);
    this.root.append(this.toolbar, this.indicator, this.ghost);

    this.root.addEventListener("pointermove", this.handleHoverMove);
    this.root.addEventListener("pointerleave", this.handleHoverLeave);
    this.root.addEventListener("mousemove", this.handleHoverMove);
    this.root.addEventListener("mouseleave", this.handleHoverLeave);
    this.root.addEventListener("dragover", this.handleDragOver, true);
    this.root.addEventListener("drop", this.handleDrop, true);
    this.root.addEventListener("dragend", this.handleDragEnd, true);
    this.toolbar.addEventListener("pointerenter", this.handlePointerEnter);
    this.addButton.addEventListener("mousedown", this.handleAddMouseDown);
    this.addButton.addEventListener("click", this.handleAddClick);
    this.handle.addEventListener("pointerdown", this.handlePointerDown);
    this.handle.addEventListener("mousedown", this.handleMouseDown);
    this.handle.addEventListener("click", this.handleClick);
    this.handle.addEventListener("dragstart", this.handleDragStart);
    this.handle.addEventListener("dragend", this.handleDragEnd);
  }

  update(view: EditorView, previousState: EditorState) {
    if (!view.state.doc.eq(previousState.doc) && !this.draggingRange) {
      this.hideHandle();
    }
  }

  destroy() {
    clearTimeoutIfNeeded(this.hideTimer);
    this.root.removeEventListener("pointermove", this.handleHoverMove);
    this.root.removeEventListener("pointerleave", this.handleHoverLeave);
    this.root.removeEventListener("mousemove", this.handleHoverMove);
    this.root.removeEventListener("mouseleave", this.handleHoverLeave);
    this.root.removeEventListener("dragover", this.handleDragOver, true);
    this.root.removeEventListener("drop", this.handleDrop, true);
    this.root.removeEventListener("dragend", this.handleDragEnd, true);
    this.toolbar.removeEventListener("pointerenter", this.handlePointerEnter);
    this.addButton.removeEventListener("mousedown", this.handleAddMouseDown);
    this.addButton.removeEventListener("click", this.handleAddClick);
    this.handle.removeEventListener("pointerdown", this.handlePointerDown);
    this.handle.removeEventListener("mousedown", this.handleMouseDown);
    this.handle.removeEventListener("click", this.handleClick);
    this.handle.removeEventListener("dragstart", this.handleDragStart);
    this.handle.removeEventListener("dragend", this.handleDragEnd);
    this.clearMouseDrag();
    this.clearPointerDrag();
    this.clearDragSource();
    this.endNativeDragInteraction();
    this.toolbar.remove();
    this.indicator.remove();
    this.ghost.remove();
  }

  private readonly handleHoverMove = (event: PointerEvent | MouseEvent) => {
    if (this.mouseDrag || this.pointerDrag || this.draggingRange || !this.view.editable) return;
    if (this.toolbar.contains(targetFromEventTarget(event.target))) return;

    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = null;

    const range = this.rangeFromPoint(event.clientX, event.clientY);
    if (!range) {
      this.hideHandle();
      return;
    }

    this.activeRange = range;
    this.positionToolbar(range);
  };

  private readonly handleHoverLeave = () => {
    if (this.mouseDrag || this.pointerDrag || this.draggingRange) return;

    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideHandle();
    }, 120);
  };

  private readonly handlePointerEnter = () => {
    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = null;
  };

  private readonly handleAddMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleAddClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const range = this.activeRange ?? this.rangeFromPoint(event.clientX, event.clientY);
    if (!range || !insertBlockAfter(this.view, range)) return;

    openSlashCommandMenu(this.view);
    this.hideHandle();
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    const range = this.activeRange ?? this.rangeFromPoint(event.clientX, event.clientY);
    if (!range) return;

    event.preventDefault();
    event.stopPropagation();
    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = null;
    this.beginNativeDragInteraction();
    this.pointerDrag = {
      pointerId: event.pointerId,
      range,
      startLeft: event.clientX,
      startTop: event.clientY
    };
    this.ownerDocument.addEventListener("pointermove", this.handlePointerDragMove);
    this.ownerDocument.addEventListener("pointerup", this.handlePointerDragEnd);
    this.ownerDocument.addEventListener("pointercancel", this.handlePointerDragCancel);

    try {
      this.handle.setPointerCapture(event.pointerId);
    } catch {
      // Some test and WebView environments do not expose pointer capture for detached drags.
    }
  };

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (this.pointerDrag) return;
    if (event.button !== 0) return;

    const range = this.activeRange ?? this.rangeFromPoint(event.clientX, event.clientY);
    if (!range) return;

    event.preventDefault();
    event.stopPropagation();
    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = null;
    this.beginNativeDragInteraction();
    this.mouseDrag = {
      range,
      startLeft: event.clientX,
      startTop: event.clientY
    };
    this.ownerDocument.addEventListener("mousemove", this.handleMouseDragMove);
    this.ownerDocument.addEventListener("mouseup", this.handleMouseDragEnd);
  };

  private readonly handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleDragStart = (event: DragEvent) => {
    if (!this.activeRange || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    const range = this.activeRange;
    const blockDom = this.blockDom(range);
    clearTimeoutIfNeeded(this.hideTimer);
    this.hideTimer = null;
    this.beginNativeDragInteraction();
    this.beginDrag(range);
    this.positionGhost(event.clientX, event.clientY);

    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(markraBlockDragMime, "true");
    event.dataTransfer.setData("text/plain", range.node.textContent);
    if (blockDom) event.dataTransfer.setDragImage(blockDom, 0, 0);
  };

  private readonly handleDragOver = (event: DragEvent) => {
    if (!this.draggingRange) return;

    this.positionGhost(event.clientX, event.clientY);
    this.autoScrollAtPoint(event.clientY);
    if (!this.updateDropTarget(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  private readonly handleDrop = (event: DragEvent) => {
    if (!this.draggingRange) return;

    const target = this.dropTarget ?? this.dropTargetFromPoint(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
    if (target) moveBlock(this.view, this.draggingRange, target);

    this.endDrag();
  };

  private readonly handleDragEnd = () => {
    this.clearPointerDrag();
    this.endDrag();
  };

  private readonly handlePointerDragMove = (event: PointerEvent) => {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

    const distance = Math.abs(event.clientX - pointerDrag.startLeft) + Math.abs(event.clientY - pointerDrag.startTop);
    if (!this.draggingRange) {
      if (distance < 4) return;
      this.beginDrag(pointerDrag.range);
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearNativeSelection();
    this.positionGhost(event.clientX, event.clientY);
    this.autoScrollAtPoint(event.clientY);
    this.updateDropTarget(event.clientX, event.clientY);
  };

  private readonly handlePointerDragEnd = (event: PointerEvent) => {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const target = this.draggingRange
      ? this.dropTarget ?? this.dropTargetFromPoint(event.clientX, event.clientY)
      : null;
    if (this.draggingRange && target) moveBlock(this.view, this.draggingRange, target);

    this.clearPointerDrag();
    this.endDrag();
  };

  private readonly handlePointerDragCancel = (event: PointerEvent) => {
    const pointerDrag = this.pointerDrag;
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

    this.clearPointerDrag();
    this.endDrag();
  };

  private readonly handleMouseDragMove = (event: MouseEvent) => {
    const mouseDrag = this.mouseDrag;
    if (!mouseDrag) return;

    const distance = Math.abs(event.clientX - mouseDrag.startLeft) + Math.abs(event.clientY - mouseDrag.startTop);
    if (!this.draggingRange) {
      if (distance < 4) return;
      this.beginDrag(mouseDrag.range);
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearNativeSelection();
    this.positionGhost(event.clientX, event.clientY);
    this.autoScrollAtPoint(event.clientY);
    this.updateDropTarget(event.clientX, event.clientY);
  };

  private readonly handleMouseDragEnd = (event: MouseEvent) => {
    if (!this.mouseDrag) return;

    event.preventDefault();
    event.stopPropagation();

    const target = this.draggingRange
      ? this.dropTarget ?? this.dropTargetFromPoint(event.clientX, event.clientY)
      : null;
    if (this.draggingRange && target) moveBlock(this.view, this.draggingRange, target);

    this.clearMouseDrag();
    this.endDrag();
  };

  private rangeFromPoint(left: number, top: number) {
    let position: ReturnType<EditorView["posAtCoords"]>;
    try {
      position = this.view.posAtCoords({
        left: this.documentProbeLeft(left),
        top
      });
    } catch {
      return null;
    }

    if (!position) return null;

    return findMovableBlockAtPosition(this.view.state, position.pos);
  }

  private documentProbeLeft(left: number) {
    const rect = this.view.dom.getBoundingClientRect();
    if (left >= rect.left && left <= rect.right) return left;

    return rect.left + rect.width / 2;
  }

  private dropTargetFromPoint(left: number, top: number): BlockDropTarget | null {
    const range = this.rangeFromPoint(left, top);
    if (!range) return null;

    const dom = this.blockDom(range);
    const rect = dom?.getBoundingClientRect();
    const placement = this.dropPlacementFromPoint(range, rect, left);
    const side = placement === "nested" || (rect && top > rect.top + rect.height / 2) ? "after" : "before";

    return { placement, range, side };
  }

  private dropPlacementFromPoint(
    range: BlockDragRange,
    rect: DOMRect | undefined,
    left: number
  ): BlockDropTarget["placement"] {
    if (!this.draggingRange || !isListItem(range) || !rect) return "sibling";
    if (left < rect.left + listNestOffset) return "sibling";

    return "nested";
  }

  private beginDrag(range: BlockDragRange) {
    this.draggingRange = range;
    this.beginNativeDragInteraction();
    this.markDragSource(range);
    this.showGhost(range);
    this.toolbar.dataset.dragging = "true";
    this.handle.dataset.dragging = "true";
    this.view.dom.dataset.dragging = "true";
  }

  private updateDropTarget(left: number, top: number) {
    if (!this.draggingRange) return false;

    const target = this.dropTargetFromPoint(left, top);
    if (!target || !canMoveBlock(this.view.state, this.draggingRange, target)) {
      this.dropTarget = null;
      this.hideIndicator();
      return false;
    }

    this.dropTarget = target;
    this.positionIndicator(target);
    this.clearNativeSelection();
    return true;
  }

  private blockDom(range: BlockDragRange) {
    const dom = this.view.nodeDOM(range.pos);
    return targetFromEventTarget(dom);
  }

  private positionToolbar(range: BlockDragRange) {
    const dom = this.blockDom(range);
    const editorRect = this.view.dom.getBoundingClientRect();
    if (!dom) {
      this.hideHandle();
      return;
    }

    const rect = dom.getBoundingClientRect();
    const left = Math.max(8, editorRect.left - blockToolbarGutterOffset);
    const top = contentBoxFirstLineCenterTop(dom, rect);

    this.toolbar.style.left = `${Math.round(left)}px`;
    this.toolbar.style.top = `${Math.round(top)}px`;
    this.toolbar.dataset.show = "true";
  }

  private hideHandle() {
    this.activeRange = null;
    this.toolbar.dataset.show = "false";
  }

  private markDragSource(range: BlockDragRange) {
    this.clearDragSource();
    this.dragSourceElement = this.blockDom(range);
    this.dragSourceElement?.classList.add("markra-block-drag-source");
  }

  private clearDragSource() {
    this.dragSourceElement?.classList.remove("markra-block-drag-source");
    this.dragSourceElement = null;
  }

  private clearMouseDrag() {
    this.mouseDrag = null;
    this.ownerDocument.removeEventListener("mousemove", this.handleMouseDragMove);
    this.ownerDocument.removeEventListener("mouseup", this.handleMouseDragEnd);
  }

  private clearPointerDrag() {
    const pointerDrag = this.pointerDrag;
    if (pointerDrag) {
      try {
        this.handle.releasePointerCapture(pointerDrag.pointerId);
      } catch {
        // Pointer capture may already be released when the native WebView cancels a drag.
      }
    }

    this.pointerDrag = null;
    this.ownerDocument.removeEventListener("pointermove", this.handlePointerDragMove);
    this.ownerDocument.removeEventListener("pointerup", this.handlePointerDragEnd);
    this.ownerDocument.removeEventListener("pointercancel", this.handlePointerDragCancel);
  }

  private beginNativeDragInteraction() {
    if (!this.nativeDragActive) {
      this.nativeDragActive = true;
      this.root.dataset.blockDragging = "true";
      this.ownerDocument.documentElement.dataset.markraBlockDragging = "true";
      this.ownerDocument.body.classList.add("markra-block-dragging");
    }

    this.clearNativeSelection();
  }

  private endNativeDragInteraction() {
    if (!this.nativeDragActive) return;

    this.nativeDragActive = false;
    delete this.root.dataset.blockDragging;
    delete this.ownerDocument.documentElement.dataset.markraBlockDragging;
    this.ownerDocument.body.classList.remove("markra-block-dragging");
    this.clearNativeSelection();
  }

  private clearNativeSelection() {
    clearNativeSelection(this.ownerDocument);
  }

  private positionIndicator(target: BlockDropTarget) {
    const dom = this.blockDom(target.range);
    const rect = dom?.getBoundingClientRect();
    if (!rect) {
      this.hideIndicator();
      return;
    }

    const top = target.side === "before" ? rect.top : rect.bottom;
    const left = target.placement === "nested" ? rect.left + listNestOffset : rect.left + dropIndicatorInset;
    const rawWidth =
      target.placement === "nested" ? rect.width - listNestOffset - dropIndicatorInset : rect.width - dropIndicatorInset * 2;
    const indicatorWidth = Math.max(24, Math.min(rawWidth, dropIndicatorMaxWidth));

    this.indicator.style.left = `${Math.round(left)}px`;
    this.indicator.style.top = `${Math.round(top)}px`;
    this.indicator.style.width = `${Math.round(indicatorWidth)}px`;
    this.indicator.dataset.show = "true";
  }

  private hideIndicator() {
    this.indicator.dataset.show = "false";
  }

  private showGhost(range: BlockDragRange) {
    this.ghost.textContent = dragGhostText(range);
    this.ghost.dataset.show = "true";
  }

  private positionGhost(left: number, top: number) {
    if (this.ghost.dataset.show !== "true") return;

    this.ghost.style.transform = `translate(${Math.round(left + dragGhostOffset.left)}px, ${Math.round(
      top + dragGhostOffset.top
    )}px)`;
  }

  private hideGhost() {
    this.ghost.dataset.show = "false";
    this.ghost.textContent = "";
    this.ghost.style.transform = "translate(-9999px, -9999px)";
  }

  private autoScrollAtPoint(top: number) {
    const scrollContainer = this.scrollContainer;
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const threshold = Math.min(edgeScrollThreshold, rect.height / 2);
    if (threshold < 1) return;

    const topDistance = top - rect.top;
    const bottomDistance = rect.bottom - top;
    let scrollTopDelta = 0;

    if (topDistance < threshold) {
      const pressure = (threshold - topDistance) / threshold;
      scrollTopDelta = -Math.ceil(edgeScrollMaxStep * Math.max(0, pressure));
    } else if (bottomDistance < threshold) {
      const pressure = (threshold - bottomDistance) / threshold;
      scrollTopDelta = Math.ceil(edgeScrollMaxStep * Math.max(0, pressure));
    }

    if (scrollTopDelta === 0) return;

    if (typeof scrollContainer.scrollBy === "function") {
      scrollContainer.scrollBy({ left: 0, top: scrollTopDelta });
      return;
    }

    scrollContainer.scrollTop += scrollTopDelta;
  }

  private endDrag() {
    this.draggingRange = null;
    this.dropTarget = null;
    this.clearDragSource();
    delete this.toolbar.dataset.dragging;
    delete this.handle.dataset.dragging;
    this.view.dom.dataset.dragging = "false";
    this.endNativeDragInteraction();
    this.hideHandle();
    this.hideIndicator();
    this.hideGhost();
  }
}

export function markraBlockDragPlugin(labels?: Partial<BlockDragLabels>) {
  const normalizedLabels = normalizeBlockDragLabels(labels);

  return $prose(() => {
    return new Plugin({
      key: blockDragKey,
      view: (view) => new MarkraBlockDragView(view, normalizedLabels)
    });
  });
}
