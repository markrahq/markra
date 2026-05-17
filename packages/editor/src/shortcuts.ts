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
import type { NodeType, ResolvedPos } from "@milkdown/kit/prose/model";
import type { Command, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { liftListItem, sinkListItem, wrapInList } from "@milkdown/kit/prose/schema-list";
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

function isPlainParagraphNodeName(nodeName: string) {
  return nodeName === "paragraph";
}

function isAtEndOfAncestorChain($pos: ResolvedPos, topDepth: number) {
  if ($pos.parentOffset !== $pos.parent.content.size) return false;

  for (let depth = $pos.depth - 1; depth >= topDepth; depth -= 1) {
    if ($pos.after(depth + 1) !== $pos.end(depth)) return false;
  }

  return true;
}

function findTerminalAncestorEndPosition(view: EditorView, $pos: ResolvedPos) {
  if ($pos.depth < 1) return null;

  const topNodeEnd = $pos.after(1);
  if (topNodeEnd < view.state.doc.content.size) return null;
  if (!isAtEndOfAncestorChain($pos, 1)) return null;

  return topNodeEnd;
}

function findTerminalBlockEndPosition(view: EditorView) {
  const { selection } = view.state;

  if (selection instanceof NodeSelection) {
    if (isPlainParagraphNodeName(selection.node.type.name)) return null;
    if (selection.to >= view.state.doc.content.size) return selection.to;

    return findTerminalAncestorEndPosition(view, selection.$to);
  }

  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.depth < 1) return null;

  const topNode = $from.node(1);
  if (isPlainParagraphNodeName(topNode.type.name)) return null;

  return findTerminalAncestorEndPosition(view, $from);
}

function moveBelowTerminalBlock(view: EditorView, paragraph: ReturnType<typeof paragraphSchema.type>) {
  const position = findTerminalBlockEndPosition(view);
  if (position === null) return false;

  const tr = view.state.tr.insert(position, paragraph.create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, position + 1)).scrollIntoView());
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
        if (event.key === "Enter" && !hasModifier && selectionIsEmptyBlockquote(view.state.selection, blockquote)) {
          event.preventDefault();
          view.focus();
          return true;
        } else if (event.key === "Backspace" && !hasModifier && selectionIsEmptyBlockquote(view.state.selection, blockquote)) {
          const handled = runCommand(view, lift);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "Enter" && isKeyboardShortcutModKey(event) && !event.shiftKey && !event.altKey) {
          const handled = runCommand(view, exitCode) || moveBelowTerminalBlock(view, paragraph);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "ArrowDown" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const handled = moveBelowTerminalBlock(view, paragraph);
          if (!handled) return false;

          event.preventDefault();
          return true;
        } else if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (selectionIsInsideNodeType(view.state.selection, listItem)) {
            const handled = runCommand(view, event.shiftKey ? liftListItem(listItem) : sinkListItem(listItem));
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
