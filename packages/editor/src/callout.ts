import { SerializerReady, serializerCtx } from "@milkdown/kit/core";
import type { Ctx, MilkdownPlugin } from "@milkdown/kit/ctx";
import { blockquoteSchema, listItemSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { splitBlock } from "@milkdown/kit/prose/commands";
import type { Node as ProseNode, ResolvedPos } from "@milkdown/kit/prose/model";
import { liftListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { Plugin, TextSelection, type Command, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose, $remark } from "@milkdown/kit/utils";
import {
  markdownCalloutDefinitions,
  markdownCalloutMarkerForType,
  parseMarkdownCalloutMarker,
  restoreEscapedMarkdownCalloutMarkers,
  type MarkdownCalloutType,
  type ParsedMarkdownCalloutMarker
} from "@markra/shared";
import { removeEmptyListItem } from "./list-editing.ts";

type CalloutBlock = {
  blockquote: ProseNode;
  blockquoteFrom: number;
  blockquoteTo: number;
  marker: ParsedMarkdownCalloutMarker;
  markerBlockFrom: number;
  markerBlockTo: number;
  markerLineIsEmpty: boolean;
  markerFrom: number;
  markerTo: number;
};

type MarkdownTreeNode = {
  children?: MarkdownTreeNode[];
  data?: Record<string, unknown>;
  type?: string;
  value?: unknown;
};

const calloutTypeOrder: MarkdownCalloutType[] = ["note", "tip", "important", "warning", "caution"];

type MarkdownSerializer = (doc: ProseNode) => string;

export const markraCalloutSerializerPlugin: MilkdownPlugin = (ctx: Ctx) => async () => {
  await ctx.wait(SerializerReady);
  ctx.update(serializerCtx, (serializeMarkdown: MarkdownSerializer) => (doc: ProseNode) =>
    restoreEscapedMarkdownCalloutMarkers(serializeMarkdown(doc))
  );

  return () => {};
};

function nodeText(node: MarkdownTreeNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(nodeText).join("") ?? "";
}

function markCalloutBreaks(node: MarkdownTreeNode) {
  if (node.type === "break") {
    node.data = {
      ...node.data,
      renderLineBreak: true
    };
    return;
  }

  node.children?.forEach(markCalloutBreaks);
}

function markCalloutHardbreaks(tree: MarkdownTreeNode) {
  if (!Array.isArray(tree.children)) return;

  for (const child of tree.children) {
    markCalloutHardbreaks(child);
  }

  if (tree.type !== "blockquote") return;

  const firstParagraph = tree.children.find((child) => child.type === "paragraph");
  if (!firstParagraph || !parseMarkdownCalloutMarker(nodeText(firstParagraph))) return;

  tree.children.forEach(markCalloutBreaks);
}

export const markraCalloutRemarkPlugin = $remark("markraCalloutRemark", () => () => (tree) => {
  markCalloutHardbreaks(tree as unknown as MarkdownTreeNode);
});

function firstTextMarkerRange(blockquote: ProseNode, blockquoteFrom: number): CalloutBlock | null {
  const firstBlock = blockquote.firstChild;
  const firstText = firstBlock?.firstChild;
  if (!firstBlock?.isTextblock || !firstText?.isText || !firstText.text) return null;

  const marker = parseMarkdownCalloutMarker(firstText.text);
  if (!marker) return null;

  const markerOffset = firstText.text.indexOf(marker.source);
  if (markerOffset < 0) return null;

  const markerBlockFrom = blockquoteFrom + 1;
  const markerFrom = blockquoteFrom + 2 + markerOffset;
  const markerLineText = firstBlock.textContent.slice(
    firstBlock.textContent.indexOf(marker.source) + marker.source.length
  );

  return {
    blockquote,
    blockquoteFrom,
    blockquoteTo: blockquoteFrom + blockquote.nodeSize,
    marker,
    markerBlockFrom,
    markerBlockTo: markerBlockFrom + firstBlock.nodeSize,
    markerLineIsEmpty: markerLineText.trim().length === 0,
    markerFrom,
    markerTo: markerFrom + marker.source.length
  };
}

function isDeleteKey(event: KeyboardEvent) {
  return event.key === "Backspace" || event.key === "Delete";
}

function isEnterKey(event: KeyboardEvent) {
  return event.key === "Enter";
}

function hasModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function runCommand(view: EditorView, command: Command) {
  const handled = command(view.state, view.dispatch, view);

  if (handled) {
    view.focus();
  }

  return handled;
}

function selectionIsInEmptyTextBlock(state: EditorState) {
  const { selection } = state;
  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.$from.parent.isTextblock &&
    selection.$from.parent.content.size === 0
  );
}

function selectionIsAtSlashCommandEnd(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;

  const beforeCursor = $from.parent.textContent.slice(0, $from.parentOffset);
  const afterCursor = $from.parent.textContent.slice($from.parentOffset);

  return afterCursor.length === 0 && /^\/[^\s/]*$/u.test(beforeCursor);
}

function insertCalloutSourceLineBreak(view: EditorView) {
  const callout = findCalloutAtSelection(view);
  if (!callout) return false;
  if (!(view.state.selection instanceof TextSelection)) return false;

  const hardbreak = view.state.schema.nodes.hardbreak;
  if (!hardbreak) return false;

  view.dispatch(
    view.state.tr
      .setMeta("hardbreak", true)
      .replaceSelectionWith(hardbreak.create({ isInline: true, renderLineBreak: true }))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function calloutVisibleText(callout: CalloutBlock) {
  let text = "";

  callout.blockquote.forEach((child, _offset, index) => {
    if (index === 0) {
      const markerIndex = child.textContent.indexOf(callout.marker.source);
      const contentStart = markerIndex >= 0 ? markerIndex + callout.marker.source.length : 0;
      text += child.textContent.slice(contentStart);
      return;
    }

    text += child.textContent;
  });

  return text.trim();
}

function findCalloutInState(state: EditorState): CalloutBlock | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "blockquote") continue;

    return firstTextMarkerRange(node, $from.before(depth));
  }

  return null;
}

function findCalloutAncestorAtPosition($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "blockquote") continue;

    const callout = firstTextMarkerRange(node, $pos.before(depth));
    if (callout) return callout;
  }

  return null;
}

function findCalloutAtSelection(view: EditorView): CalloutBlock | null {
  return findCalloutInState(view.state);
}

function positionHasAncestorNodeName($pos: ResolvedPos, nodeName: string) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) return true;
  }

  return false;
}

function selectionIsInsideNodeName(state: EditorState, nodeName: string) {
  const { selection } = state;
  return [selection.$from, selection.$to].every(($pos) => positionHasAncestorNodeName($pos, nodeName));
}

function removeEmptyCalloutListItem(view: EditorView, key: KeyboardEvent["key"]) {
  return removeEmptyListItem(view, key);
}

function emptySelectionBlockRange(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (!selection.$from.parent.isTextblock || selection.$from.parent.content.size > 0) return null;

  return {
    from: selection.$from.before(selection.$from.depth),
    to: selection.$from.after(selection.$from.depth)
  };
}

function adjacentCalloutTextPosition(callout: CalloutBlock, emptyBlockFrom: number, direction: "backward" | "forward") {
  let fallbackPosition: number | null = null;

  callout.blockquote.descendants((child, offset) => {
    if (!child.isTextblock) return true;

    const childFrom = callout.blockquoteFrom + 1 + offset;
    if (childFrom >= callout.markerBlockFrom && childFrom < callout.markerBlockTo) return false;
    if (child.content.size === 0) return false;

    if (direction === "backward" && childFrom < emptyBlockFrom) {
      fallbackPosition = childFrom + 1 + child.content.size;
      return false;
    }

    if (direction === "forward" && fallbackPosition === null && childFrom > emptyBlockFrom) {
      fallbackPosition = childFrom + 1;
    }

    return false;
  });

  return fallbackPosition;
}

function calloutBodyTextBlockRanges(callout: CalloutBlock) {
  const ranges: Array<{ from: number; to: number }> = [];

  callout.blockquote.forEach((child, offset, index) => {
    if (index === 0 || !child.isTextblock) return;

    const from = callout.blockquoteFrom + 1 + offset;
    ranges.push({
      from,
      to: from + child.nodeSize
    });
  });

  return ranges;
}

function calloutHasBodyBlocks(callout: CalloutBlock) {
  return callout.blockquote.childCount > 1;
}

function exitCalloutBlock(
  view: EditorView,
  callout: CalloutBlock,
  paragraph: ReturnType<typeof paragraphSchema.type>
) {
  const transaction = view.state.tr;
  const hasVisibleBodyContent = calloutVisibleText(callout).length > 0;
  const selectedEmptyBodyRange = hasVisibleBodyContent ? emptySelectionBlockRange(view) : null;

  if (selectedEmptyBodyRange) {
    transaction.delete(
      transaction.mapping.map(selectedEmptyBodyRange.from),
      transaction.mapping.map(selectedEmptyBodyRange.to)
    );
  } else if (!hasVisibleBodyContent && callout.blockquote.childCount > 1) {
    const [, ...extraBodyRanges] = calloutBodyTextBlockRanges(callout);

    for (const range of extraBodyRanges.reverse()) {
      transaction.delete(
        transaction.mapping.map(range.from),
        transaction.mapping.map(range.to)
      );
    }
  }

  const insertAt = transaction.mapping.map(callout.blockquoteTo);
  transaction.insert(insertAt, paragraph.create());
  const selectionPosition = Math.min(insertAt + 1, transaction.doc.content.size);

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, selectionPosition))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function rawCalloutMarkerLineAtSelection(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parentOffset !== $from.parent.content.size) return null;

  const quoteMatch = /^\s*>\s*(.*?)\s*$/u.exec($from.parent.textContent);
  if (!quoteMatch) return null;

  const marker = parseMarkdownCalloutMarker(quoteMatch[1] ?? "");
  if (!marker) return null;

  const quotedText = quoteMatch[1] ?? "";
  const afterMarker = quotedText.slice(quotedText.indexOf(marker.source) + marker.source.length);
  if (afterMarker.trim().length > 0) return null;

  return {
    marker,
    from: $from.before($from.depth),
    to: $from.after($from.depth)
  };
}

function replaceRawCalloutMarkerLine(
  view: EditorView,
  paragraph: ReturnType<typeof paragraphSchema.type>,
  blockquote: ReturnType<typeof blockquoteSchema.type>
) {
  const rawLine = rawCalloutMarkerLineAtSelection(view);
  if (!rawLine) return false;

  const markerParagraph = paragraph.create(
    null,
    view.state.schema.text(markdownCalloutMarkerForType(rawLine.marker.type))
  );
  const bodyParagraph = paragraph.create();
  const callout = blockquote.create(null, [markerParagraph, bodyParagraph]);
  let transaction = view.state.tr.replaceWith(rawLine.from, rawLine.to, callout);
  const selectionPosition = Math.min(rawLine.from + 1 + markerParagraph.nodeSize + 1, transaction.doc.content.size);

  transaction = transaction
    .setSelection(TextSelection.create(transaction.doc, selectionPosition))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();

  return true;
}

function removeEmptyCalloutLine(view: EditorView, callout: CalloutBlock, key: KeyboardEvent["key"]) {
  const emptyBlock = emptySelectionBlockRange(view);
  if (!emptyBlock) return false;

  const direction = key === "Delete" ? "forward" : "backward";
  const targetPosition =
    adjacentCalloutTextPosition(callout, emptyBlock.from, direction) ??
    adjacentCalloutTextPosition(callout, emptyBlock.from, direction === "forward" ? "backward" : "forward");

  if (targetPosition !== null) {
    const transaction = view.state.tr.delete(emptyBlock.from, emptyBlock.to);
    const mappedTargetPosition = transaction.mapping.map(targetPosition);

    view.dispatch(
      transaction
        .setSelection(TextSelection.create(transaction.doc, mappedTargetPosition))
        .scrollIntoView()
    );
    view.focus();

    return true;
  }

  const bodyRanges = calloutBodyTextBlockRanges(callout);
  if (bodyRanges.length <= 1) return false;

  const emptyBlockIndex = bodyRanges.findIndex((range) => range.from === emptyBlock.from && range.to === emptyBlock.to);
  if (emptyBlockIndex === -1) return false;

  const adjacentRange =
    direction === "forward"
      ? bodyRanges[emptyBlockIndex + 1] ?? bodyRanges[emptyBlockIndex - 1]
      : bodyRanges[emptyBlockIndex - 1] ?? bodyRanges[emptyBlockIndex + 1];
  if (!adjacentRange) return false;

  const transaction = view.state.tr.delete(emptyBlock.from, emptyBlock.to);
  const mappedTargetPosition = transaction.mapping.map(adjacentRange.from + 1);

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, mappedTargetPosition))
      .scrollIntoView()
  );
  view.focus();

  return true;
}

function deleteEmptyCalloutBlock(
  view: EditorView,
  callout: CalloutBlock,
  paragraph: ReturnType<typeof paragraphSchema.type>
) {
  if (calloutVisibleText(callout).length > 0) return false;
  if (!emptySelectionBlockRange(view)) return false;

  const transaction = view.state.tr.replaceWith(callout.blockquoteFrom, callout.blockquoteTo, paragraph.create());
  const selectionPosition = Math.min(callout.blockquoteFrom + 1, transaction.doc.content.size);

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, selectionPosition))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function keepDeleteHoldInsideEmptyCallout(
  view: EditorView,
  callout: CalloutBlock,
  event: KeyboardEvent,
  deleteHoldStartedInsideNonEmptyCallout: boolean
) {
  if (!event.repeat && !deleteHoldStartedInsideNonEmptyCallout) return false;
  if (calloutVisibleText(callout).length > 0) return false;
  if (!emptySelectionBlockRange(view)) return false;

  view.focus();
  return true;
}

function continueCalloutListItemOnEnter(
  view: EditorView,
  listItem: ReturnType<typeof listItemSchema.type>
) {
  if (selectionIsInEmptyTextBlock(view.state)) return runCommand(view, liftListItem(listItem));

  return runCommand(view, splitListItem(listItem));
}

function handleCalloutEnter(
  view: EditorView,
  callout: CalloutBlock,
  paragraph: ReturnType<typeof paragraphSchema.type>,
  listItem: ReturnType<typeof listItemSchema.type>
) {
  if (selectionIsInMarkerLine(view.state, callout)) return exitCalloutBlock(view, callout, paragraph);
  if (selectionIsInsideNodeName(view.state, "list_item")) return continueCalloutListItemOnEnter(view, listItem);
  if (selectionIsInEmptyTextBlock(view.state)) return exitCalloutBlock(view, callout, paragraph);

  return runCommand(view, splitBlock);
}

function markerOnlyCalloutsInDoc(doc: ProseNode) {
  const callouts: CalloutBlock[] = [];

  doc.descendants((node, position) => {
    if (node.type.name !== "blockquote") return;

    const callout = firstTextMarkerRange(node, position);
    if (!callout || calloutHasBodyBlocks(callout) || !callout.markerLineIsEmpty) return false;

    callouts.push(callout);
    return false;
  });

  return callouts;
}

function selectionIsInMarkerLine(state: EditorState, callout: CalloutBlock) {
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) return false;

  return state.selection.from >= callout.markerBlockFrom && state.selection.from <= callout.markerBlockTo - 1;
}

function firstCalloutBodyTextPosition(callout: CalloutBlock) {
  const [firstBodyRange] = calloutBodyTextBlockRanges(callout);
  return firstBodyRange ? firstBodyRange.from + 1 : null;
}

function moveHiddenMarkerSelectionToCalloutBody(state: EditorState) {
  const callout = findCalloutInState(state);
  if (!callout || !callout.markerLineIsEmpty || !selectionIsInMarkerLine(state, callout)) return null;

  const bodyTextPosition = firstCalloutBodyTextPosition(callout);
  if (bodyTextPosition === null) return null;

  return state.tr
    .setSelection(TextSelection.create(state.doc, bodyTextPosition))
    .scrollIntoView();
}

function dispatchHiddenMarkerSelectionToCalloutBody(view: EditorView) {
  const transaction = moveHiddenMarkerSelectionToCalloutBody(view.state);
  if (transaction) view.dispatch(transaction);
}

function selectionIsQuoteShortcutAfterCallout(state: EditorState, paragraph: ReturnType<typeof paragraphSchema.type>) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type !== paragraph) return false;
  if ($from.parent.textContent !== ">" || $from.parentOffset !== $from.parent.content.size) return false;

  const index = $from.index(0);
  if (index <= 0) return false;

  const previousNode = state.doc.child(index - 1);
  return previousNode.type.name === "blockquote" && firstTextMarkerRange(previousNode, 0) !== null;
}

function trailingEmptySelectionInCallout(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (!selection.$from.parent.isTextblock || selection.$from.parent.content.size > 0) return null;

  const callout = findCalloutInState(state);
  if (!callout || calloutVisibleText(callout).length === 0) return null;
  if (selection.$from.after(selection.$from.depth) !== callout.blockquoteTo - 1) return null;

  return {
    callout,
    from: selection.$from.before(selection.$from.depth),
    to: selection.$from.after(selection.$from.depth)
  };
}

function splitTypedQuoteAfterCallout(
  oldState: EditorState,
  newState: EditorState,
  paragraph: ReturnType<typeof paragraphSchema.type>,
  blockquote: ReturnType<typeof blockquoteSchema.type>
) {
  if (!selectionIsQuoteShortcutAfterCallout(oldState, paragraph)) return null;

  const trailingEmptyBlock = trailingEmptySelectionInCallout(newState);
  if (!trailingEmptyBlock) return null;

  const transaction = newState.tr.delete(trailingEmptyBlock.from, trailingEmptyBlock.to);
  const insertAt = transaction.mapping.map(trailingEmptyBlock.callout.blockquoteTo, -1);
  transaction.insert(insertAt, blockquote.create(null, paragraph.create()));
  transaction.setSelection(TextSelection.create(transaction.doc, Math.min(insertAt + 2, transaction.doc.content.size)));

  return transaction.scrollIntoView();
}

function appendBodyToMarkerOnlyCallout(
  state: EditorState,
  paragraph: ReturnType<typeof paragraphSchema.type>
) {
  const callouts = markerOnlyCalloutsInDoc(state.doc).filter((callout) =>
    selectionIsInMarkerLine(state, callout)
  );
  if (callouts.length === 0) return null;

  const transaction = state.tr;
  let bodySelectionPosition: number | null = null;

  for (const callout of callouts) {
    const insertAt = transaction.mapping.map(callout.markerBlockTo, 1);
    transaction.insert(insertAt, paragraph.create());
    bodySelectionPosition = Math.min(insertAt + 1, transaction.doc.content.size);
  }

  if (!transaction.docChanged) return null;

  if (bodySelectionPosition !== null) {
    transaction.setSelection(TextSelection.create(transaction.doc, bodySelectionPosition));
  }

  return transaction.scrollIntoView();
}

function normalizeCalloutHardbreaks(state: EditorState) {
  const hardbreak = state.schema.nodes.hardbreak;
  if (!hardbreak) return null;

  const transaction = state.tr;
  let changed = false;

  state.doc.descendants((node, position) => {
    if (node.type !== hardbreak || (node.attrs.isInline === true && node.attrs.renderLineBreak === true)) return;

    const callout = findCalloutAncestorAtPosition(state.doc.resolve(position));
    if (!callout) return;

    transaction.setNodeMarkup(position, undefined, { ...node.attrs, isInline: true, renderLineBreak: true }, node.marks);
    changed = true;
  });

  return changed ? transaction : null;
}

function createCalloutTypeSelect(
  ownerDocument: Document,
  view: EditorView,
  callout: CalloutBlock
) {
  const select = ownerDocument.createElement("select");
  select.className = "markra-callout-type-select";
  select.setAttribute("aria-label", "Callout type");
  select.contentEditable = "false";

  for (const type of calloutTypeOrder) {
    const definition = markdownCalloutDefinitions[type];
    const option = ownerDocument.createElement("option");
    option.value = type;
    option.textContent = definition.label;
    option.selected = type === callout.marker.type;
    select.append(option);
  }

  select.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  select.addEventListener("change", () => {
    const nextType = select.value as MarkdownCalloutType;
    const nextMarker = markdownCalloutMarkerForType(nextType);
    const transaction = view.state.tr
      .insertText(nextMarker, callout.markerFrom, callout.markerTo)
      .scrollIntoView();

    view.dispatch(transaction);
    view.focus();
  });

  return select;
}

function createCalloutHeader(callout: CalloutBlock) {
  return (view: EditorView) => {
    const ownerDocument = view.dom.ownerDocument;
    const header = ownerDocument.createElement("div");
    header.className = "markra-callout-header";
    header.contentEditable = "false";

    const icon = ownerDocument.createElement("span");
    icon.className = "markra-callout-icon";
    icon.setAttribute("aria-hidden", "true");

    const title = ownerDocument.createElement("span");
    title.className = "markra-callout-title";
    title.textContent = callout.marker.label;

    header.append(icon, title, createCalloutTypeSelect(ownerDocument, view, callout));
    return header;
  };
}

function buildCalloutDecorations(doc: ProseNode) {
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (node.type.name !== "blockquote") return;

    const callout = firstTextMarkerRange(node, position);
    if (!callout) return;

    decorations.push(
      Decoration.node(callout.blockquoteFrom, callout.blockquoteTo, {
        class: `markra-callout markra-callout-${callout.marker.type}`,
        "data-callout-label": callout.marker.label,
        "data-callout-type": callout.marker.type
      }),
      Decoration.widget(callout.blockquoteFrom + 1, createCalloutHeader(callout), {
        key: `markra-callout-header-${callout.blockquoteFrom}-${callout.marker.type}`,
        side: -1
      })
    );

    decorations.push(
      Decoration.inline(callout.markerFrom, callout.markerTo, {
        class: "markra-callout-source-marker"
      })
    );

    if (callout.markerLineIsEmpty) {
      decorations.push(
        Decoration.node(callout.markerBlockFrom, callout.markerBlockTo, {
          class: "markra-callout-marker-line"
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const markraCalloutPlugin = $prose((ctx) => {
  const paragraph = paragraphSchema.type(ctx);
  const blockquote = blockquoteSchema.type(ctx);
  const listItem = listItemSchema.type(ctx);
  let deleteHoldStartedInsideNonEmptyCallout = false;

  return new Plugin({
    view: (view) => {
      dispatchHiddenMarkerSelectionToCalloutBody(view);

      return {
        update: (updatedView, previousState) => {
          if (
            updatedView.state.doc.eq(previousState.doc) &&
            updatedView.state.selection.eq(previousState.selection)
          ) return;

          dispatchHiddenMarkerSelectionToCalloutBody(updatedView);
        }
      };
    },
    appendTransaction: (transactions, oldState, newState) => {
      const markerSelectionTransaction = moveHiddenMarkerSelectionToCalloutBody(newState);
      if (markerSelectionTransaction) return markerSelectionTransaction;

      if (!transactions.some((transaction) => transaction.docChanged)) return null;

      return (
        appendBodyToMarkerOnlyCallout(newState, paragraph) ??
        normalizeCalloutHardbreaks(newState) ??
        splitTypedQuoteAfterCallout(oldState, newState, paragraph, blockquote)
      );
    },
    props: {
      decorations: (state) => buildCalloutDecorations(state.doc),
      handleDOMEvents: {
        keyup: (_view, event) => {
          if (isDeleteKey(event)) {
            deleteHoldStartedInsideNonEmptyCallout = false;
          }

          return false;
        }
      },
      handleKeyDown: (view, event) => {
        if (isEnterKey(event)) {
          if (event.altKey || event.ctrlKey || event.metaKey) return false;
          if (event.shiftKey) {
            const handled = insertCalloutSourceLineBreak(view);
            if (!handled) return false;

            event.preventDefault();
            return true;
          }

          if (selectionIsAtSlashCommandEnd(view.state)) return false;

          const callout = findCalloutAtSelection(view);

          const handled = callout
            ? handleCalloutEnter(view, callout, paragraph, listItem)
            : replaceRawCalloutMarkerLine(view, paragraph, blockquote);
          if (!handled) return false;

          event.preventDefault();
          return true;
        }

        if (hasModifier(event)) return false;
        if (!isDeleteKey(event)) return false;

        const callout = findCalloutAtSelection(view);
        if (!callout) return false;
        if (selectionIsInsideNodeName(view.state, "list_item")) {
          const handled = removeEmptyCalloutListItem(view, event.key);
          if (!handled) return false;

          event.preventDefault();
          return true;
        }

        if (calloutVisibleText(callout).length > 0) {
          deleteHoldStartedInsideNonEmptyCallout = true;
        }

        const handled =
          removeEmptyCalloutLine(view, callout, event.key) ||
          keepDeleteHoldInsideEmptyCallout(view, callout, event, deleteHoldStartedInsideNonEmptyCallout) ||
          deleteEmptyCalloutBlock(view, callout, paragraph);
        if (!handled) return false;

        event.preventDefault();
        return true;
      }
    }
  });
});
