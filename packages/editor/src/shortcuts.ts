import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  strongSchema
} from "@milkdown/kit/preset/commonmark";
import { strikethroughSchema } from "@milkdown/kit/preset/gfm";
import { exitCode, lift, setBlockType, toggleMark, wrapIn } from "@milkdown/kit/prose/commands";
import { redo, undo } from "@milkdown/kit/prose/history";
import { Fragment, type Node as ProseNode, type NodeType, type ResolvedPos } from "@milkdown/kit/prose/model";
import type { Command, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
import { $prose } from "@milkdown/kit/utils";
import {
  defaultKeyboardShortcuts,
  formatKeyboardShortcut,
  keyboardShortcutActions,
  keyboardShortcutFromKeyboardEvent,
  keyboardShortcutToKeyboardEventInit,
  keyboardShortcutToNativeAccelerator,
  markdownFormattingShortcutActions,
  matchesKeyboardShortcut,
  matchesKeyboardShortcutEvent,
  normalizeKeyboardShortcuts,
  parseKeyboardShortcut,
  isKeyboardShortcutModKey,
  type KeyboardShortcutAction,
  type KeyboardShortcutBindings,
  type KeyboardShortcutMap,
  type MarkdownFormattingShortcutAction,
  type ParsedKeyboardShortcut
} from "@markra/shared";
import { toggleAllFoldableBlocks } from "./fold-toggle.ts";
import { finalizeActiveLiveMarkdown, markraLiveMarkdownSpecs } from "./input-rules.ts";
import { removeEmptyListItem, tightenListSpreadInSelectionAncestor } from "./list-editing.ts";

export const markdownShortcutActions = keyboardShortcutActions;
export const defaultMarkdownShortcuts = defaultKeyboardShortcuts;
export const formatMarkdownShortcut = formatKeyboardShortcut;
export const markdownShortcutFromKeyboardEvent = keyboardShortcutFromKeyboardEvent;
export const markdownShortcutToKeyboardEventInit = keyboardShortcutToKeyboardEventInit;
export const markdownShortcutToNativeAccelerator = keyboardShortcutToNativeAccelerator;
export const normalizeMarkdownShortcuts = normalizeKeyboardShortcuts;
export const parseMarkdownShortcut = parseKeyboardShortcut;

export type MarkdownShortcutAction = KeyboardShortcutAction;
export type MarkdownShortcutBindings = KeyboardShortcutBindings;
export type MarkdownShortcutMap = KeyboardShortcutMap;
export type ParsedMarkdownShortcut = ParsedKeyboardShortcut;

function runCommand(view: EditorView, command: Command) {
  const handled = command(view.state, view.dispatch, view);

  if (handled) {
    view.focus();
  }

  return handled;
}

function selectionIsInsideNodeType(
  selection: Selection,
  nodeType: NodeType
) {
  const positions = [selection.$from, selection.$to];

  return positions.every(($pos) => {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type === nodeType) return true;
    }

    return false;
  });
}

function nodeIsList(node: ProseNode) {
  return node.type.name === "bullet_list" || node.type.name === "ordered_list";
}

type ListItemContext = {
  from: number;
  item: ProseNode;
  itemDepth: number;
  itemIndex: number;
  parentList: ProseNode;
  parentListDepth: number;
  to: number;
};

function listItemContext(selection: Selection, listItem: NodeType): ListItemContext | null {
  const fromDepth = ancestorDepthOfNodeType(selection.$from, listItem);
  const toDepth = ancestorDepthOfNodeType(selection.$to, listItem);
  if (fromDepth === null || toDepth === null) return null;

  const from = selection.$from.before(fromDepth);
  const to = selection.$from.after(fromDepth);
  if (selection.$to.before(toDepth) !== from || selection.$to.after(toDepth) !== to) return null;

  return {
    from,
    item: selection.$from.node(fromDepth),
    itemDepth: fromDepth,
    itemIndex: selection.$from.index(fromDepth - 1),
    parentList: selection.$from.node(fromDepth - 1),
    parentListDepth: fromDepth - 1,
    to
  };
}

function listItemHasChildList(item: ProseNode) {
  for (let index = 0; index < item.childCount; index += 1) {
    if (nodeIsList(item.child(index))) return true;
  }

  return false;
}

function listItemIsNested(context: ListItemContext, listItem: NodeType, selection: Selection) {
  return context.parentListDepth > 0 && selection.$from.node(context.parentListDepth - 1).type === listItem;
}

function liftCreatesChildListFromFollowingSiblings(selection: Selection, listItem: NodeType) {
  const context = listItemContext(selection, listItem);
  if (!context) return false;
  if (!listItemIsNested(context, listItem, selection)) return false;
  if (listItemHasChildList(context.item)) return false;

  return context.itemIndex < context.parentList.childCount - 1;
}

function splitCurrentListItemChildLists(view: EditorView, listItem: NodeType) {
  const { selection } = view.state;
  const context = listItemContext(selection, listItem);
  if (!context) return false;

  const retainedChildren: ProseNode[] = [];
  const promotedItems: ProseNode[] = [];
  context.item.forEach((child) => {
    if (nodeIsList(child)) {
      child.forEach((item) => promotedItems.push(item));
      return;
    }

    retainedChildren.push(child);
  });
  if (promotedItems.length === 0 || retainedChildren.length === 0) return false;

  const retainedItem = context.item.type.create(
    context.item.attrs,
    Fragment.fromArray(retainedChildren),
    context.item.marks
  );
  const replacement = Fragment.fromArray([retainedItem, ...promotedItems]);
  const transaction = view.state.tr.replaceWith(context.from, context.to, replacement);
  const selectionPosition = Math.min(selection.from, transaction.doc.content.size);
  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function continuationBlockContext(selection: Selection, listItem: NodeType) {
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const context = listItemContext(selection, listItem);
  if (!context) return null;

  const blockDepth = context.itemDepth + 1;
  if (selection.$from.depth !== blockDepth || selection.$to.depth !== blockDepth) return null;

  const childIndex = selection.$from.index(context.itemDepth);
  if (childIndex <= 0) return null;

  const child = context.item.child(childIndex);
  if (!child.isTextblock) return null;
  if (selection.$to.index(context.itemDepth) !== childIndex) return null;

  return {
    ...context,
    blockFrom: selection.$from.before(blockDepth),
    childIndex
  };
}

function splitCurrentListItemContinuationBlock(view: EditorView, listItem: NodeType) {
  const context = continuationBlockContext(view.state.selection, listItem);
  if (!context) return false;

  const retainedChildren: ProseNode[] = [];
  const activeChildren: ProseNode[] = [];
  context.item.forEach((child, _offset, index) => {
    if (index < context.childIndex) {
      retainedChildren.push(child);
      return;
    }

    activeChildren.push(child);
  });
  if (retainedChildren.length === 0 || activeChildren.length === 0) return false;

  const retainedItem = context.item.type.create(
    context.item.attrs,
    Fragment.fromArray(retainedChildren),
    context.item.marks
  );
  const activeItem = context.item.type.create(
    context.item.attrs,
    Fragment.fromArray(activeChildren),
    context.item.marks
  );
  const selectionOffset = view.state.selection.from - context.blockFrom;
  const activeBlockFrom = context.from + retainedItem.nodeSize + 1;
  const transaction = view.state.tr.replaceWith(
    context.from,
    context.to,
    Fragment.fromArray([retainedItem, activeItem])
  );
  const selectionPosition = Math.min(activeBlockFrom + selectionOffset, transaction.doc.content.size);
  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function lineBreakContinuationContext(selection: Selection, listItem: NodeType) {
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const context = listItemContext(selection, listItem);
  if (!context) return null;

  const blockDepth = context.itemDepth + 1;
  if (selection.$from.depth !== blockDepth || selection.$to.depth !== blockDepth) return null;

  const childIndex = selection.$from.index(context.itemDepth);
  const child = context.item.child(childIndex);
  if (!child.isTextblock) return null;

  let splitOffset: number | null = null;
  let splitSize = 0;
  child.forEach((inlineNode, offset) => {
    const inlineEnd = offset + inlineNode.nodeSize;
    if (inlineNode.type.name === "hardbreak" && inlineEnd <= selection.$from.parentOffset) {
      splitOffset = offset;
      splitSize = inlineNode.nodeSize;
    }
  });
  if (splitOffset === null) return null;

  const beforeContent = child.content.cut(0, splitOffset);
  const activeContent = child.content.cut(splitOffset + splitSize);
  if (beforeContent.size === 0 || activeContent.size === 0) return null;

  return {
    ...context,
    activeContent,
    activeOffset: selection.$from.parentOffset - (splitOffset + splitSize),
    beforeContent,
    child,
    childIndex
  };
}

function splitCurrentListItemLineBreak(view: EditorView, listItem: NodeType) {
  const context = lineBreakContinuationContext(view.state.selection, listItem);
  if (!context) return false;

  const retainedChildren: ProseNode[] = [];
  const activeChildren: ProseNode[] = [];
  context.item.forEach((child, _offset, index) => {
    if (index < context.childIndex) {
      retainedChildren.push(child);
      return;
    }

    if (index === context.childIndex) {
      retainedChildren.push(context.child.type.create(context.child.attrs, context.beforeContent, context.child.marks));
      activeChildren.push(context.child.type.create(context.child.attrs, context.activeContent, context.child.marks));
      return;
    }

    activeChildren.push(child);
  });
  if (retainedChildren.length === 0 || activeChildren.length === 0) return false;

  const retainedItem = context.item.type.create(
    context.item.attrs,
    Fragment.fromArray(retainedChildren),
    context.item.marks
  );
  const activeItem = context.item.type.create(
    context.item.attrs,
    Fragment.fromArray(activeChildren),
    context.item.marks
  );
  const activeBlockFrom = context.from + retainedItem.nodeSize + 1;
  const transaction = view.state.tr.replaceWith(
    context.from,
    context.to,
    Fragment.fromArray([retainedItem, activeItem])
  );
  const selectionPosition = Math.min(activeBlockFrom + 1 + context.activeOffset, transaction.doc.content.size);
  view.dispatch(
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function liftCurrentListItem(listItem: NodeType): Command {
  return (state, dispatch, view) => {
    if (
      dispatch &&
      view &&
      (splitCurrentListItemLineBreak(view, listItem) || splitCurrentListItemContinuationBlock(view, listItem))
    ) {
      const handled = liftCurrentListItem(listItem)(view.state, view.dispatch, view);
      return handled || true;
    }

    const shouldSplitLiftedChildren = liftCreatesChildListFromFollowingSiblings(state.selection, listItem);

    if (!shouldSplitLiftedChildren || !dispatch || !view) {
      return liftListItem(listItem)(state, dispatch, view);
    }

    const handled = liftListItem(listItem)(state, dispatch, view);
    if (!handled) return false;

    splitCurrentListItemChildLists(view, listItem);
    return true;
  };
}

function toggleBlockquote(blockquote: ReturnType<typeof blockquoteSchema.type>): Command {
  return (state, dispatch, view) => {
    if (selectionIsInsideNodeType(state.selection, blockquote)) {
      return lift(state, dispatch, view);
    }

    return wrapIn(blockquote)(state, dispatch, view);
  };
}

function selectionIsEmptyTextBlock(selection: Selection) {
  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.$from.parent.isTextblock &&
    selection.$from.parent.content.size === 0
  );
}

function selectionIsEmptyBlockquote(selection: Selection, blockquote: NodeType) {
  return selectionIsEmptyTextBlock(selection) && selectionIsInsideNodeType(selection, blockquote);
}

function ancestorDepthOfNodeType($position: ResolvedPos, nodeType: NodeType) {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type === nodeType) return depth;
  }

  return null;
}

function continueListItem(view: EditorView, listItem: NodeType, tightAncestorName?: string) {
  const command = selectionIsEmptyTextBlock(view.state.selection)
    ? liftListItem(listItem)
    : splitListItem(listItem, { spread: false });
  const handled = runCommand(view, command);
  if (handled && tightAncestorName) tightenListSpreadInSelectionAncestor(view, tightAncestorName);

  return handled;
}

function blockquoteExitDepth(selection: Selection, blockquote: NodeType) {
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (!selection.$from.parent.isTextblock) return null;
  if (selection.$from.parentOffset !== selection.$from.parent.content.size) return null;

  const blockquoteDepth = ancestorDepthOfNodeType(selection.$from, blockquote);
  if (blockquoteDepth === null) return null;
  if (selection.$from.after(selection.$from.depth) !== selection.$from.end(blockquoteDepth)) return null;

  return blockquoteDepth;
}

function exitBlockquoteAtEnd(view: EditorView, blockquote: NodeType, paragraph: NodeType) {
  const blockquoteDepth = blockquoteExitDepth(view.state.selection, blockquote);
  if (blockquoteDepth === null) return false;

  if (selectionIsEmptyBlockquote(view.state.selection, blockquote)) {
    return runCommand(view, lift);
  }

  const insertAt = view.state.selection.$from.after(blockquoteDepth);
  const transaction = view.state.tr.insert(insertAt, paragraph.create());
  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, insertAt + 1))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function emptyTopLevelParagraphAfterTable(view: EditorView, paragraph: NodeType) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if ($from.depth !== 1) return null;
  if ($from.parent.type !== paragraph || $from.parent.content.size > 0 || $from.parentOffset !== 0) return null;

  const index = $from.index(0);
  if (index <= 0) return null;

  const previousNode = view.state.doc.child(index - 1);
  if (previousNode.type.name !== "table") return null;

  const paragraphFrom = $from.before(1);
  const paragraphTo = $from.after(1);
  const tableFrom = paragraphFrom - previousNode.nodeSize;
  let cursor: number | null = null;

  previousNode.descendants((node, position) => {
    if (!node.isTextblock) return true;

    cursor = tableFrom + 1 + position + node.content.size;
    return true;
  });

  if (cursor === null) return null;

  return {
    cursor,
    paragraphFrom,
    paragraphTo
  };
}

function moveBackIntoTableFromEmptyParagraph(view: EditorView, paragraph: NodeType) {
  const target = emptyTopLevelParagraphAfterTable(view, paragraph);
  if (!target) return false;

  const transaction = view.state.tr.delete(target.paragraphFrom, target.paragraphTo);
  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, transaction.mapping.map(target.cursor, -1)))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function emptyTopLevelParagraphAfterImage(view: EditorView, paragraph: NodeType) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if ($from.depth !== 1) return null;
  if ($from.parent.type !== paragraph || $from.parent.content.size > 0 || $from.parentOffset !== 0) return null;

  const index = $from.index(0);
  if (index <= 0) return null;

  const previousNode = view.state.doc.child(index - 1);
  if (previousNode.type.name !== "image") return null;

  const paragraphFrom = $from.before(1);

  return {
    imagePosition: paragraphFrom - previousNode.nodeSize,
    paragraphFrom,
    paragraphTo: $from.after(1)
  };
}

function moveBackToImageFromEmptyParagraph(view: EditorView, paragraph: NodeType) {
  const target = emptyTopLevelParagraphAfterImage(view, paragraph);
  if (!target) return false;

  const transaction = view.state.tr.delete(target.paragraphFrom, target.paragraphTo);
  view.dispatch(
    transaction
      .setSelection(NodeSelection.create(transaction.doc, transaction.mapping.map(target.imagePosition, -1)))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

const plainTextIndentation = "  ";

function insertPlainTextIndentation(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return false;
  if (!selection.$to.parent.isTextblock) return false;

  const position = selection.empty ? selection.from : selection.to;
  view.dispatch(view.state.tr.insertText(plainTextIndentation, position, position).scrollIntoView());
  view.focus();

  return true;
}

export const markraMarkdownShortcuts = (configuredShortcuts: MarkdownShortcutMap = {}) => $prose((ctx) => {
  const strong = strongSchema.type(ctx);
  const emphasis = emphasisSchema.type(ctx);
  const inlineCode = inlineCodeSchema.type(ctx);
  const strikethrough = strikethroughSchema.type(ctx);
  const paragraph = paragraphSchema.type(ctx);
  const heading = headingSchema.type(ctx);
  const listItem = listItemSchema.type(ctx);
  const bulletList = bulletListSchema.type(ctx);
  const orderedList = orderedListSchema.type(ctx);
  const blockquote = blockquoteSchema.type(ctx);
  const codeBlock = codeBlockSchema.type(ctx);
  const liveMarkdownSpecs = markraLiveMarkdownSpecs(ctx);
  const shortcuts = normalizeMarkdownShortcuts(configuredShortcuts);
  const shortcutCommands: Record<MarkdownFormattingShortcutAction, Command> = {
    bold: toggleMark(strong),
    bulletList: wrapInList(bulletList),
    codeBlock: setBlockType(codeBlock),
    heading1: setBlockType(heading, { level: 1 }),
    heading2: setBlockType(heading, { level: 2 }),
    heading3: setBlockType(heading, { level: 3 }),
    inlineCode: toggleMark(inlineCode),
    italic: toggleMark(emphasis),
    orderedList: wrapInList(orderedList),
    paragraph: setBlockType(paragraph),
    quote: toggleBlockquote(blockquote),
    strikethrough: toggleMark(strikethrough)
  };

  return new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        let command: Command | null = null;
        const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;

        // Support both Milkdown-style shortcuts and common document-editor aliases.
        if (event.key === "Enter" && !hasModifier && selectionIsInsideNodeType(view.state.selection, blockquote)) {
          const finalizedLiveMarkdown = finalizeActiveLiveMarkdown(view, liveMarkdownSpecs);
          if (finalizedLiveMarkdown) {
            event.preventDefault();
            view.focus();
            return true;
          }

          if (selectionIsInsideNodeType(view.state.selection, listItem)) {
            const handled = continueListItem(view, listItem, "blockquote");
            if (!handled) return false;

            event.preventDefault();
            return true;
          }

          const handled = exitBlockquoteAtEnd(view, blockquote, paragraph);
          if (handled) {
            event.preventDefault();
            return true;
          }

          if (selectionIsEmptyBlockquote(view.state.selection, blockquote)) {
            event.preventDefault();
            view.focus();
            return true;
          }
        } else if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !hasModifier &&
          selectionIsInsideNodeType(view.state.selection, blockquote) &&
          selectionIsInsideNodeType(view.state.selection, listItem)
        ) {
          const handled = removeEmptyListItem(view, event.key);
          if (!handled) return false;
          if (selectionIsInsideNodeType(view.state.selection, blockquote)) {
            tightenListSpreadInSelectionAncestor(view, "blockquote");
          }

          event.preventDefault();
          return true;
        } else if (event.key === "Backspace" && !hasModifier && selectionIsEmptyBlockquote(view.state.selection, blockquote)) {
          const handled = runCommand(view, lift);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "Backspace" && !hasModifier) {
          const handled =
            moveBackIntoTableFromEmptyParagraph(view, paragraph) ||
            moveBackToImageFromEmptyParagraph(view, paragraph);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "Enter" && isKeyboardShortcutModKey(event) && !event.shiftKey && !event.altKey) {
          const handled = runCommand(view, exitCode);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (selectionIsInsideNodeType(view.state.selection, listItem)) {
            const handled = runCommand(
              view,
              event.shiftKey ? liftCurrentListItem(listItem) : sinkListItem(listItem)
            );
            if (handled && selectionIsInsideNodeType(view.state.selection, blockquote)) {
              tightenListSpreadInSelectionAncestor(view, "blockquote");
            }
            if (!handled) view.focus();

            event.preventDefault();
            return true;
          }

          if (event.shiftKey) return false;

          const handled = insertPlainTextIndentation(view);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (matchesKeyboardShortcut(event, "z")) {
          command = undo;
        } else if (matchesKeyboardShortcut(event, "z", { shift: true }) || matchesKeyboardShortcut(event, "y")) {
          command = redo;
        } else if (matchesKeyboardShortcutEvent(event, shortcuts.toggleAllFolds)) {
          const handled = toggleAllFoldableBlocks(view, {
            bulletList,
            heading,
            listItem,
            orderedList
          });
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else {
          const action = markdownFormattingShortcutActions.find((candidate) =>
            matchesKeyboardShortcutEvent(event, shortcuts[candidate])
          );

          if (action) {
            command = shortcutCommands[action];
          }
        }

        if (!command) return false;

        const handled = runCommand(view, command);
        if (!handled) return false;

        event.preventDefault();
        return true;
      }
    }
  });
});
