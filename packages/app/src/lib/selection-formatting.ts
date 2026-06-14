import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { setBlockType } from "@milkdown/kit/prose/commands";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export const selectionFormattingShortcutActions = [
  "bold",
  "italic",
  "strikethrough",
  "inlineCode",
  "heading1",
  "quote",
  "bulletList",
  "orderedList"
] as const;

export const selectionFormattingToolbarActions = [
  "bold",
  "italic",
  "strikethrough",
  "inlineCode",
  "highlight",
  "clearFormatting",
  "heading1",
  "quote",
  "bulletList",
  "orderedList"
] as const;

export const selectionHeadingLevels = [1, 2, 3, 4, 5, 6] as const;

export type SelectionFormattingShortcutAction = typeof selectionFormattingShortcutActions[number];
export type SelectionFormattingToolbarAction = typeof selectionFormattingToolbarActions[number];
export type SelectionFormattingAction = SelectionFormattingToolbarAction | "link";
export type SelectionHeadingLevel = typeof selectionHeadingLevels[number];

export type SelectionFormattingState = {
  actions: SelectionFormattingAction[];
  headingLevel: SelectionHeadingLevel | null;
};

const markActionTypeNames = {
  bold: "strong",
  inlineCode: "inlineCode",
  italic: "emphasis",
  link: "link",
  strikethrough: "strike_through"
} as const satisfies Partial<Record<SelectionFormattingAction, string>>;
const highlightMarker = "==";

type HighlightRange = {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
};

type ActiveHighlightRange = HighlightRange & {
  absoluteFrom: number;
  absoluteTo: number;
  absoluteContentFrom: number;
  absoluteContentTo: number;
};

type DeletionRange = {
  from: number;
  to: number;
};

function getHighlightRanges(text: string) {
  const ranges: HighlightRange[] = [];
  const pattern = /==[^=\n][^\n]*?==/g;

  for (const match of text.matchAll(pattern)) {
    const from = match.index ?? 0;
    const matchedText = match[0];
    const to = from + matchedText.length;
    if (text[from - 1] === "=" || text[to] === "=") continue;

    const contentFrom = from + highlightMarker.length;
    const contentTo = to - highlightMarker.length;
    if (contentFrom >= contentTo) continue;

    ranges.push({
      from,
      to,
      contentFrom,
      contentTo
    });
  }

  return ranges;
}

function rangesOverlap(firstFrom: number, firstTo: number, secondFrom: number, secondTo: number) {
  return firstFrom < secondTo && secondFrom < firstTo;
}

function positionHasAncestor(
  position: ResolvedPos,
  typeName: string,
  attrs?: Record<string, unknown>
) {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name !== typeName) continue;
    if (attrs && Object.entries(attrs).some(([key, value]) => node.attrs[key] !== value)) continue;

    return true;
  }

  return false;
}

function selectionHasAncestor(
  state: EditorState,
  typeName: string,
  attrs?: Record<string, unknown>
) {
  return [state.selection.$from, state.selection.$to].every((position) =>
    positionHasAncestor(position, typeName, attrs)
  );
}

function selectionHasMark(state: EditorState, markName: string) {
  const markType = state.schema.marks[markName];
  if (!markType) return false;

  if (state.selection.empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    return marks.some((mark) => mark.type === markType);
  }

  return state.doc.rangeHasMark(state.selection.from, state.selection.to, markType);
}

function findActiveHighlightRange(state: EditorState): ActiveHighlightRange | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;
  if (!selection.$from.sameParent(selection.$to) || !selection.$from.parent.isTextblock) return null;

  const blockStart = selection.$from.start();
  const selectionFrom = selection.from - blockStart;
  const selectionTo = selection.to - blockStart;
  const range = getHighlightRanges(selection.$from.parent.textContent).find((candidate) => {
    if (selection.empty) {
      return candidate.contentFrom <= selectionFrom && selectionFrom <= candidate.contentTo;
    }

    return candidate.from <= selectionFrom && selectionTo <= candidate.to;
  });
  if (!range) return null;

  return {
    ...range,
    absoluteFrom: blockStart + range.from,
    absoluteTo: blockStart + range.to,
    absoluteContentFrom: blockStart + range.contentFrom,
    absoluteContentTo: blockStart + range.contentTo
  };
}

function highlightMarkerDeletionRangesForSelection(state: EditorState) {
  const { selection } = state;
  const ranges: DeletionRange[] = [];

  if (!(selection instanceof TextSelection) || selection.empty) return ranges;

  state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isTextblock) return true;

    const blockStart = position + 1;
    const selectedFrom = Math.max(selection.from, blockStart) - blockStart;
    const selectedTo = Math.min(selection.to, blockStart + node.textContent.length) - blockStart;
    if (selectedFrom >= selectedTo) return false;

    for (const range of getHighlightRanges(node.textContent)) {
      const selectionTouchesHighlight =
        rangesOverlap(range.contentFrom, range.contentTo, selectedFrom, selectedTo) ||
        rangesOverlap(range.from, range.to, selectedFrom, selectedTo);

      if (!selectionTouchesHighlight) continue;

      ranges.push(
        {
          from: blockStart + range.contentTo,
          to: blockStart + range.to
        },
        {
          from: blockStart + range.from,
          to: blockStart + range.contentFrom
        }
      );
    }

    return false;
  });

  return ranges;
}

function normalizeHeadingLevel(value: unknown) {
  if (typeof value !== "number") return null;
  if (!selectionHeadingLevels.includes(value as SelectionHeadingLevel)) return null;

  return value as SelectionHeadingLevel;
}

type ActiveHeading = {
  from: number;
  level: SelectionHeadingLevel;
};

function findHeadingAtPosition(position: ResolvedPos): ActiveHeading | null {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name !== "heading") continue;

    const level = normalizeHeadingLevel(node.attrs.level);
    if (level === null) return null;

    return {
      from: position.before(depth),
      level
    };
  }

  return null;
}

function resolveBoundedPosition(state: EditorState, position: number) {
  return state.doc.resolve(Math.max(0, Math.min(position, state.doc.content.size)));
}

function findHeadingNearPosition(state: EditorState, position: number, fallbackOffset: -1 | 0 | 1) {
  const directHeading = findHeadingAtPosition(resolveBoundedPosition(state, position));
  if (directHeading || fallbackOffset === 0) return directHeading;

  const fallbackPosition = position + fallbackOffset;
  if (fallbackPosition < 0 || fallbackPosition > state.doc.content.size) return null;

  return findHeadingAtPosition(resolveBoundedPosition(state, fallbackPosition));
}

function findActiveHeading(state: EditorState): ActiveHeading | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;
  if (selection.empty) return findHeadingNearPosition(state, selection.head, 0);

  const startHeading = findHeadingNearPosition(state, selection.from, 1);
  const endHeading = findHeadingNearPosition(state, selection.to, -1);
  if (!startHeading || !endHeading || startHeading.from !== endHeading.from) return null;

  return startHeading;
}

export function readSelectionFormattingActionsFromView(view: EditorView): SelectionFormattingAction[] {
  const { state } = view;
  const activeActions: SelectionFormattingAction[] = [];

  for (const [action, markName] of Object.entries(markActionTypeNames)) {
    if (selectionHasMark(state, markName)) activeActions.push(action as SelectionFormattingAction);
  }

  if (findActiveHighlightRange(state)) activeActions.push("highlight");
  if (selectionHasAncestor(state, "heading", { level: 1 })) activeActions.push("heading1");
  if (selectionHasAncestor(state, "blockquote")) activeActions.push("quote");
  if (selectionHasAncestor(state, "bullet_list")) activeActions.push("bulletList");
  if (selectionHasAncestor(state, "ordered_list")) activeActions.push("orderedList");

  return activeActions;
}

export function readSelectionFormattingStateFromView(view: EditorView): SelectionFormattingState {
  return {
    actions: readSelectionFormattingActionsFromView(view),
    headingLevel: findActiveHeading(view.state)?.level ?? null
  };
}

export function setSelectionHeadingLevelInView(view: EditorView, level: SelectionHeadingLevel) {
  const heading = view.state.schema.nodes.heading;
  if (!heading) return false;

  const changed = setBlockType(heading, { level })(view.state, view.dispatch, view);
  if (changed) view.focus();

  return changed;
}

export function toggleSelectionHighlightInView(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  if (!selection.$from.sameParent(selection.$to) || !selection.$from.parent.isTextblock) return false;

  const activeHighlightRange = findActiveHighlightRange(view.state);

  if (activeHighlightRange) {
    const transaction = view.state.tr
      .delete(activeHighlightRange.absoluteContentTo, activeHighlightRange.absoluteTo)
      .delete(activeHighlightRange.absoluteFrom, activeHighlightRange.absoluteContentFrom);
    const nextFrom = transaction.mapping.map(selection.from, -1);
    const nextTo = transaction.mapping.map(selection.to, 1);

    view.dispatch(
      transaction
        .setSelection(TextSelection.create(transaction.doc, nextFrom, nextTo))
        .scrollIntoView()
    );
    view.focus();
    return true;
  }

  const transaction = view.state.tr
    .insertText(highlightMarker, selection.to, selection.to)
    .insertText(highlightMarker, selection.from, selection.from);
  const nextFrom = transaction.mapping.map(selection.from, 1);
  const nextTo = transaction.mapping.map(selection.to, -1);

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, nextFrom, nextTo))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

export function toggleSelectionLinkInView(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;

  const link = view.state.schema.marks.link;
  if (!link || !view.state.doc.rangeHasMark(selection.from, selection.to, link)) return false;

  const transaction = view.state.tr.removeMark(selection.from, selection.to, link);
  if (!transaction.docChanged) return false;

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, selection.from, selection.to))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

export function clearSelectionFormattingInView(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;

  const transaction = view.state.tr;
  for (const markType of Object.values(view.state.schema.marks)) {
    transaction.removeMark(selection.from, selection.to, markType);
  }

  const markerDeletionRanges = highlightMarkerDeletionRangesForSelection(view.state)
    .sort((first, second) => second.from - first.from);
  for (const range of markerDeletionRanges) {
    transaction.delete(range.from, range.to);
  }

  if (!transaction.docChanged) return false;

  const nextFrom = Math.max(0, Math.min(transaction.mapping.map(selection.from, -1), transaction.doc.content.size));
  const nextTo = Math.max(0, Math.min(transaction.mapping.map(selection.to, 1), transaction.doc.content.size));

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, Math.min(nextFrom, nextTo), Math.max(nextFrom, nextTo)))
      .scrollIntoView()
  );
  view.focus();
  return true;
}
