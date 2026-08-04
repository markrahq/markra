import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";

export function syntaxTreeChanged(
  startState: EditorState,
  state: EditorState,
) {
  // CodeMirror can advance parsing in a document-neutral transaction. Cached
  // syntax-derived UI must compare tree identity instead of only docChanged.
  return syntaxTree(startState) !== syntaxTree(state);
}

export function updateOnlyInsertsPlainText(update: ViewUpdate) {
  if (
    !update.docChanged ||
    update.focusChanged ||
    update.transactions.some((transaction) => transaction.reconfigured) ||
    update.transactions.some((transaction) =>
      transaction.docChanged && !transaction.isUserEvent("input")
    )
  ) {
    return false;
  }

  let plainInsertion = true;
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (
      fromA !== toA ||
      !/^[\p{L}\p{M}\p{N}]+$/u.test(inserted.toString())
    ) {
      plainInsertion = false;
    }
  });
  return plainInsertion;
}

export function updateChangesStayAfter(
  update: ViewUpdate,
  position: number,
  insertedMayAffectSyntax: (source: string) => boolean,
) {
  if (!update.docChanged || update.focusChanged) return false;
  if (
    [...update.startState.selection.ranges, ...update.state.selection.ranges]
      .some((range) => range.from <= position)
  ) {
    return false;
  }

  let staysAfter = true;
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    // Removing delimiters can expose syntax that was previously inside code,
    // so both deleted and inserted source participate in invalidation.
    if (
      fromA <= position ||
      insertedMayAffectSyntax(update.startState.sliceDoc(fromA, toA)) ||
      insertedMayAffectSyntax(inserted.toString())
    ) {
      staysAfter = false;
    }
  });
  return staysAfter;
}
