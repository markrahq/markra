import { StateField, type EditorState } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  codeMirrorVimModeChangedEffect,
  codeMirrorVimNormalModeActive,
} from "./vim.ts";

export type RevealScope = "line" | "node" | "node-boundary" | "heading";

export interface RevealContext {
  view: EditorView;
  state: EditorState;
  from: number;
  to: number;
  nodeName: string;
  scope: RevealScope;
}

export type RevealPolicy = (context: RevealContext) => boolean;

const sourceDragAnchors = StateField.define<readonly number[]>({
  create: () => [],
  update(previousAnchors, transaction) {
    if (transaction.docChanged) return [];

    const ranges = transaction.state.selection.ranges;
    if (ranges.every((selection) => selection.empty)) return [];

    const prior = new Set(previousAnchors);
    const startingCursors = new Set(
      transaction.startState.selection.ranges
        .filter((selection) => selection.empty)
        .map((selection) => selection.head),
    );

    return ranges.flatMap((selection) =>
      !selection.empty &&
        (prior.has(selection.anchor) || startingCursors.has(selection.anchor))
        ? [selection.anchor]
        : []
    );
  },
});

export const sourceDragSelectionExtension = sourceDragAnchors;

function sourceDragStartedInsideRange(
  state: EditorState,
  from: number,
  to: number,
  includeBoundaries = false,
) {
  const anchors = state.field(sourceDragAnchors, false) ?? [];
  return state.selection.ranges.some(
    (selection) =>
      !selection.empty &&
      anchors.includes(selection.anchor) &&
      (includeBoundaries
        ? selection.anchor >= from && selection.anchor <= to
        : selection.anchor > from && selection.anchor < to),
  );
}

function revealCursorKey(state: EditorState) {
  return state.selection.ranges
    .filter((selection) => selection.empty)
    .map((selection) => selection.head)
    .join(":");
}

export function selectionChangeAffectsReveal(update: ViewUpdate) {
  return (
    update.transactions.some((transaction) =>
      transaction.effects.some((effect) =>
        effect.is(codeMirrorVimModeChangedEffect),
      ),
    ) ||
    (
      update.selectionSet &&
      revealCursorKey(update.startState) !== revealCursorKey(update.state)
    )
  );
}

export function cursorInsideRange(
  view: EditorView,
  from: number,
  to: number,
) {
  return selectionRevealsRange(
    view.state,
    view.hasFocus,
    codeMirrorVimNormalModeActive(view),
    from,
    to,
  );
}

export function selectionRevealsRange(
  state: EditorState,
  focused: boolean,
  includeCursorBoundaries: boolean,
  from: number,
  to: number,
) {
  return (
    focused &&
    state.selection.ranges.some(
      (selection) =>
        selection.empty
          ? includeCursorBoundaries
            ? selection.head >= from && selection.head < to
            : selection.head > from && selection.head < to
          : sourceDragStartedInsideRange(state, from, to),
    )
  );
}

export const revealActiveLine: RevealPolicy = ({
  view,
  state,
  from,
  to,
  scope,
}) => {
  if (!view.hasFocus) return false;

  // A range selection is a visual operation, not an intent to edit Markdown
  // source. Revealing delimiters while its endpoint moves can rewrap lines and
  // change the document height underneath the pointer. The exception is a drag
  // whose fixed anchor began inside source that was already active.
  if (
    sourceDragStartedInsideRange(
      state,
      from,
      to,
      scope === "line" || scope === "heading",
    )
  ) {
    return true;
  }

  const cursors = state.selection.ranges.filter((selection) => selection.empty);

  if (scope === "heading") {
    // A heading marker sits at the node boundary, so its complete rendered
    // text and marker share one editing range.
    return cursors.some(
      (selection) => selection.head >= from && selection.head <= to,
    );
  }

  if (scope === "node" || scope === "node-boundary") {
    const includeCursorBoundaries = codeMirrorVimNormalModeActive(view);
    // A Vim block cursor targets the source character at its document
    // position. Reveal boundary delimiters so destructive commands never act
    // on Markdown that the user cannot see.
    return cursors.some(
      (selection) =>
        includeCursorBoundaries
          ? selection.head >= from && selection.head < to
          : selection.head > from && selection.head < to,
    );
  }

  // Keep the live preview intact while editing rendered text. Markdown source
  // only needs to reappear when the selection actually reaches its marker.
  return cursors.some((selection) =>
    from === to
      ? selection.head === from
      // A just-typed prefix leaves the caret exactly at the marker's right
      // edge; include it so the character does not disappear under the caret.
      : selection.head >= from && selection.head <= to,
  );
};
