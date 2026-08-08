import { syntaxTree } from "@codemirror/language";
import type { EditorState, Transaction } from "@codemirror/state";
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

function changesStayAfter(
  change: Pick<
    Transaction,
    "changes" | "docChanged" | "startState" | "state"
  >,
  position: number,
  insertedMayAffectSyntax: (source: string) => boolean,
) {
  if (!change.docChanged) return false;
  if (
    [...change.startState.selection.ranges, ...change.state.selection.ranges]
      .some((range) => range.from <= position)
  ) {
    return false;
  }

  let staysAfter = true;
  change.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    // Removing delimiters can expose syntax that was previously inside code,
    // so both deleted and inserted source participate in invalidation.
    if (
      fromA <= position ||
      insertedMayAffectSyntax(change.startState.sliceDoc(fromA, toA)) ||
      insertedMayAffectSyntax(inserted.toString())
    ) {
      staysAfter = false;
    }
  });
  return staysAfter;
}

export function transactionChangesStayAfter(
  transaction: Transaction,
  position: number,
  insertedMayAffectSyntax: (source: string) => boolean,
) {
  return changesStayAfter(
    transaction,
    position,
    insertedMayAffectSyntax,
  );
}

export function updateChangesStayAfter(
  update: ViewUpdate,
  position: number,
  insertedMayAffectSyntax: (source: string) => boolean,
) {
  return !update.focusChanged && changesStayAfter(
    update,
    position,
    insertedMayAffectSyntax,
  );
}
