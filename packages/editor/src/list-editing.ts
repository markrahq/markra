import { closeHistory } from "@milkdown/kit/prose/history";
import { Fragment, type Node as ProseNode, type ResolvedPos } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

type EmptyListItemContext = {
  $from: ResolvedPos;
  from: number;
  itemIndex: number;
  listItem: ProseNode;
  listItemDepth: number;
  parentList: ProseNode;
  parentListDepth: number;
  to: number;
};

function ancestorDepthByNodeName($pos: ResolvedPos, nodeName: string) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) return depth;
  }

  return null;
}

export function nodeIsList(node: ProseNode) {
  return node.type.name === "bullet_list" || node.type.name === "ordered_list";
}

function emptyListItemContext(state: EditorState): EmptyListItemContext | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (!selection.$from.parent.isTextblock || selection.$from.parent.content.size > 0) return null;

  const { $from } = selection;
  const listItemDepth = ancestorDepthByNodeName($from, "list_item");
  if (listItemDepth === null) return null;

  const parentListDepth = listItemDepth - 1;
  if (parentListDepth <= 0) return null;

  const parentList = $from.node(parentListDepth);
  if (!nodeIsList(parentList)) return null;

  return {
    $from,
    from: $from.before(listItemDepth),
    itemIndex: $from.index(parentListDepth),
    listItem: $from.node(listItemDepth),
    listItemDepth,
    parentList,
    parentListDepth,
    to: $from.after(listItemDepth)
  };
}

function firstTextBlockStartPosition(node: ProseNode, nodeFrom: number) {
  let position: number | null = null;

  node.descendants((child, offset) => {
    if (position !== null) return false;
    if (!child.isTextblock) return true;

    position = nodeFrom + offset + 2;
    return false;
  });

  return position;
}

function firstTextBlockEndPosition(node: ProseNode, nodeFrom: number) {
  let position: number | null = null;

  node.descendants((child, offset) => {
    if (position !== null) return false;
    if (!child.isTextblock) return true;

    position = nodeFrom + offset + 2 + child.content.size;
    return false;
  });

  return position;
}

function listItemHasOnlyEmptyTextBlocksAndLists(listItem: ProseNode) {
  let valid = true;

  listItem.forEach((child) => {
    if (nodeIsList(child)) return;
    if (!child.isTextblock || child.content.size > 0) valid = false;
  });

  return valid;
}

function childListItems(listItem: ProseNode) {
  const items: ProseNode[] = [];

  listItem.forEach((child) => {
    if (!nodeIsList(child)) return;

    child.forEach((item) => {
      items.push(item);
    });
  });

  return items;
}

function childLists(listItem: ProseNode) {
  const lists: ProseNode[] = [];

  listItem.forEach((child) => {
    if (nodeIsList(child)) lists.push(child);
  });

  return lists;
}

function appendChildListsToListItem(listItem: ProseNode, lists: ProseNode[]) {
  const children: ProseNode[] = [];
  listItem.forEach((child) => children.push(child));

  for (const list of lists) {
    const lastChild = children.at(-1);
    if (lastChild && nodeIsList(lastChild) && lastChild.type === list.type) {
      children[children.length - 1] = lastChild.type.create(
        { ...lastChild.attrs, spread: false },
        lastChild.content.append(list.content),
        lastChild.marks
      );
      continue;
    }

    children.push(list.type.create({ ...list.attrs, spread: false }, list.content, list.marks));
  }

  return listItem.type.create({ ...listItem.attrs, spread: false }, Fragment.fromArray(children), listItem.marks);
}

function moveEmptyListItemChildrenToPreviousSibling(view: EditorView, context: EmptyListItemContext) {
  if (context.itemIndex <= 0) return false;

  const lists = childLists(context.listItem);
  if (lists.length === 0) return false;

  const previousItem = context.parentList.child(context.itemIndex - 1);
  const previousItemFrom = context.from - previousItem.nodeSize;
  const updatedPreviousItem = appendChildListsToListItem(previousItem, lists);
  const transaction = closeHistory(view.state.tr.replaceWith(previousItemFrom, context.to, updatedPreviousItem));
  const selectionPosition = Math.min(
    firstTextBlockEndPosition(updatedPreviousItem, previousItemFrom) ?? previousItemFrom + 1,
    transaction.doc.content.size
  );

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, selectionPosition))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function promoteEmptyListItemChildren(view: EditorView, context: EmptyListItemContext) {
  const promotedItems = childListItems(context.listItem);
  if (promotedItems.length === 0) return false;

  const transaction = closeHistory(view.state.tr.replaceWith(context.from, context.to, Fragment.fromArray(promotedItems)));
  const selectionPosition = Math.min(context.from + 2, transaction.doc.content.size);

  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function removeEmptyListItemWithChildren(view: EditorView, key: KeyboardEvent["key"]) {
  const context = emptyListItemContext(view.state);
  if (!context) return false;
  if (!listItemHasOnlyEmptyTextBlocksAndLists(context.listItem)) return false;

  return (
    (key === "Backspace" && moveEmptyListItemChildrenToPreviousSibling(view, context)) ||
    promoteEmptyListItemChildren(view, context)
  );
}

function parentListItemEndPosition(context: EmptyListItemContext) {
  const parentListItemDepth = context.parentListDepth - 1;
  if (parentListItemDepth <= 0) return null;

  const parentListItem = context.$from.node(parentListItemDepth);
  if (parentListItem.type.name !== "list_item") return null;

  const parentListItemFrom = context.$from.before(parentListItemDepth);
  return firstTextBlockEndPosition(parentListItem, parentListItemFrom) ?? parentListItemFrom + 1;
}

function removeEmptyLeafListItem(view: EditorView, key: KeyboardEvent["key"]) {
  const context = emptyListItemContext(view.state);
  if (!context) return false;
  if (context.listItem.childCount !== 1) return false;
  if (context.parentList.childCount <= 1) return false;

  if (key === "Backspace" && context.itemIndex === 0) {
    const parentSelectionPosition = parentListItemEndPosition(context);
    if (parentSelectionPosition !== null) {
      const transaction = closeHistory(view.state.tr.delete(context.from, context.to));
      const mappedSelectionPosition = Math.min(
        Math.max(transaction.mapping.map(parentSelectionPosition, -1), 1),
        transaction.doc.content.size
      );

      view.dispatch(
        transaction
          .setSelection(TextSelection.create(transaction.doc, mappedSelectionPosition))
          .scrollIntoView()
      );
      view.focus();

      return true;
    }
  }

  const preferPrevious = key === "Backspace" && context.itemIndex > 0;
  const siblingIndex = preferPrevious ? context.itemIndex - 1 : context.itemIndex + 1;
  if (siblingIndex < 0 || siblingIndex >= context.parentList.childCount) return false;

  const sibling = context.parentList.child(siblingIndex);
  const siblingFrom = preferPrevious ? context.from - sibling.nodeSize : context.to;
  const selectionPosition = preferPrevious
    ? firstTextBlockEndPosition(sibling, siblingFrom) ?? context.from - 1
    : firstTextBlockStartPosition(sibling, siblingFrom) ?? context.to + 1;
  const transaction = closeHistory(view.state.tr.delete(context.from, context.to));
  const mappedSelectionPosition = Math.min(
    Math.max(transaction.mapping.map(selectionPosition, preferPrevious ? -1 : 1), 1),
    transaction.doc.content.size
  );

  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(mappedSelectionPosition), preferPrevious ? -1 : 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function emptyNestedLeafListRange(state: EditorState) {
  const context = emptyListItemContext(state);
  if (!context) return null;
  if (context.listItem.childCount !== 1) return null;
  if (context.parentList.childCount !== 1) return null;

  const parentListItemDepth = context.parentListDepth - 1;
  if (parentListItemDepth <= 0 || context.$from.node(parentListItemDepth).type.name !== "list_item") return null;

  const parentListItemFrom = context.$from.before(parentListItemDepth);
  const selectionPosition =
    firstTextBlockEndPosition(context.$from.node(parentListItemDepth), parentListItemFrom) ??
    parentListItemFrom + 1;

  return {
    from: context.$from.before(context.parentListDepth),
    selectionPosition,
    to: context.$from.after(context.parentListDepth)
  };
}

function removeEmptyNestedListItem(view: EditorView) {
  const range = emptyNestedLeafListRange(view.state);
  if (!range) return false;

  const transaction = closeHistory(view.state.tr.delete(range.from, range.to));
  const mappedSelectionPosition = Math.min(
    Math.max(transaction.mapping.map(range.selectionPosition, -1), 1),
    transaction.doc.content.size
  );

  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(mappedSelectionPosition), -1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

export function removeEmptyListItem(view: EditorView, key: KeyboardEvent["key"]) {
  return (
    removeEmptyListItemWithChildren(view, key) ||
    removeEmptyLeafListItem(view, key) ||
    removeEmptyNestedListItem(view)
  );
}

function nodeHasSpreadAttribute(node: ProseNode) {
  return Object.prototype.hasOwnProperty.call(node.attrs, "spread");
}

function nodeNeedsTightSpread(node: ProseNode) {
  return nodeHasSpreadAttribute(node) && (nodeIsList(node) || node.type.name === "list_item") && node.attrs.spread !== false;
}

export function tightenListSpreadInSelectionAncestor(view: EditorView, ancestorName: string) {
  const { selection } = view.state;
  const ancestorDepth = ancestorDepthByNodeName(selection.$from, ancestorName);
  if (ancestorDepth === null) return false;

  const ancestor = selection.$from.node(ancestorDepth);
  const ancestorFrom = selection.$from.before(ancestorDepth);
  let transaction = view.state.tr;

  ancestor.descendants((node, offset) => {
    if (!nodeNeedsTightSpread(node)) return true;

    transaction = transaction.setNodeMarkup(ancestorFrom + 1 + offset, undefined, {
      ...node.attrs,
      spread: false
    });
    return true;
  });

  if (!transaction.docChanged) return false;

  view.dispatch(transaction.setMeta("addToHistory", false));
  view.focus();

  return true;
}
