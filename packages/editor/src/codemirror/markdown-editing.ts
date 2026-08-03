import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  type ChangeSpec,
  type SelectionRange,
  type Transaction,
} from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { defineMarkraPlugin } from "./plugin.ts";

const indentation = "  ";
const listMarkerPattern = /^((?:[\t ]*>[\t ]*)*)([\t ]*)(?:[-+*]|\d+[.)])[\t ]+/u;
const quotePrefixPattern = /^([\t ]*(?:>[\t ]*)+)/u;
const incompleteInlineDestinationPattern =
  /(?:^|[^\\])!?\[(?:\\.|[^\]\\])*\]\((?:\\.|[^)\n])*$/u;

function isEditable(view: EditorView) {
  return !view.state.facet(EditorState.readOnly);
}

function selectionEnd(state: EditorState, range: SelectionRange) {
  if (range.empty) return range.to;
  const line = state.doc.lineAt(range.to);
  return line.from === range.to ? Math.max(range.from, range.to - 1) : range.to;
}

function selectedLines(state: EditorState) {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(selectionEnd(state, range)).number;
    for (let number = first; number <= last; number += 1) numbers.add(number);
  }
  return [...numbers].sort((left, right) => left - right).map((number) =>
    state.doc.line(number));
}

function dispatchChanges(view: EditorView, changes: readonly ChangeSpec[]) {
  if (changes.length === 0) return false;
  const changeSet = view.state.changes(changes);
  const selection = EditorSelection.create(
    view.state.selection.ranges.map((range) =>
      EditorSelection.range(
        changeSet.mapPos(range.anchor, 1),
        changeSet.mapPos(range.head, 1),
      )),
    view.state.selection.mainIndex,
  );
  view.dispatch({ changes: changeSet, selection, userEvent: "input" });
  view.focus();
  return true;
}

function indentList(view: EditorView, outdent: boolean) {
  if (!isEditable(view)) return false;
  const lines = selectedLines(view.state);
  const matches = lines.map((line) => listMarkerPattern.exec(line.text));
  if (matches.some((match) => !match)) return false;

  const changes: ChangeSpec[] = [];
  lines.forEach((line, index) => {
    const match = matches[index];
    if (!match) return;
    const quotePrefixLength = match[1]?.length ?? 0;
    const existingIndent = match[2] ?? "";
    const from = line.from + quotePrefixLength;
    if (!outdent) {
      changes.push({ from, insert: indentation });
      return;
    }
    const remove = Math.min(indentation.length, existingIndent.length);
    if (remove > 0) changes.push({ from, to: from + remove });
  });
  return dispatchChanges(view, changes);
}

function insertPlainIndentation(view: EditorView) {
  if (!isEditable(view)) return false;
  const changes = view.state.selection.ranges.map((range) => ({
    from: range.to,
    insert: indentation,
  }));
  return dispatchChanges(view, changes);
}

function handleTab(view: EditorView) {
  return indentList(view, false) || insertPlainIndentation(view);
}

function handleShiftTab(view: EditorView) {
  return indentList(view, true);
}

function keepJoinedLineCaretsAfterText(transaction: Transaction) {
  if (!transaction.docChanged || !transaction.isUserEvent("delete.backward")) {
    return transaction;
  }

  const affectedPositions = new Set<number>();
  for (const range of transaction.startState.selection.ranges) {
    if (!range.empty) continue;
    if (range.head === 0) {
      if (
        transaction.startState.doc.lines > 1 &&
        transaction.startState.doc.line(1).length === 0
      ) {
        affectedPositions.add(0);
      }
      continue;
    }
    const line = transaction.startState.doc.lineAt(range.head);
    if (
      line.from === range.head &&
      transaction.startState.doc.lineAt(range.head - 1).length === 0
    ) {
      affectedPositions.add(transaction.changes.mapPos(range.head, -1));
    }
  }
  if (affectedPositions.size === 0) return transaction;

  let corrected = false;
  const selection = EditorSelection.create(
    transaction.newSelection.ranges.map((range) => {
      if (
        range.empty &&
        range.assoc !== 1 &&
        affectedPositions.has(range.head)
      ) {
        corrected = true;
        return EditorSelection.cursor(
          range.head,
          1,
          range.bidiLevel ?? undefined,
          range.goalColumn ?? undefined,
        );
      }
      return range;
    }),
    transaction.newSelection.mainIndex,
  );
  if (!corrected) return transaction;

  // Apply affinity in the deleting transaction. A later selection-only
  // update is treated as an equivalent DOM boundary beside inline widgets.
  return [
    transaction,
    {
      selection,
      sequential: true,
    },
  ];
}

function removeLeadingEmptyLineBackward(view: EditorView) {
  if (!isEditable(view)) return false;
  const { ranges } = view.state.selection;
  if (
    ranges.length !== 1 ||
    !ranges[0]?.empty ||
    ranges[0].head !== 0 ||
    view.state.doc.lines === 1 ||
    view.state.doc.line(1).length !== 0
  ) {
    return false;
  }

  view.dispatch({
    changes: { from: 0, to: 1 },
    selection: EditorSelection.cursor(0, 1),
    userEvent: "delete.backward",
  });
  return true;
}

function confirmIncompleteInlineDestination(view: EditorView) {
  if (!isEditable(view)) return false;
  const { ranges } = view.state.selection;
  if (ranges.length !== 1 || !ranges[0]?.empty) return false;

  const position = ranges[0].head;
  const line = view.state.doc.lineAt(position);
  if (position !== line.to) return false;
  const sourceBeforeCursor = view.state.sliceDoc(line.from, position);
  if (!incompleteInlineDestinationPattern.test(sourceBeforeCursor)) {
    return false;
  }

  // Enter confirms the destination instead of placing a line break inside
  // Markdown link syntax, which would leave both links and images unparseable.
  view.dispatch({
    changes: { from: position, insert: ")\n" },
    selection: EditorSelection.cursor(position + 2),
    userEvent: "input",
  });
  return true;
}

function insideTableCell(view: EditorView, position: number) {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(view.state).resolveInner(position, -1);
  while (node) {
    if (node.name === "TableCell" || node.name === "TableHeader") return true;
    node = node.parent;
  }
  return false;
}

function insertContextualHardBreak(view: EditorView) {
  if (!isEditable(view)) return false;
  const range = view.state.selection.main;
  if (!range.empty) return false;

  if (insideTableCell(view, range.head)) {
    view.dispatch({
      changes: { from: range.head, insert: "<br>" },
      selection: EditorSelection.cursor(range.head + 4),
      userEvent: "input",
    });
    return true;
  }

  const line = view.state.doc.lineAt(range.head);
  const quotePrefix = quotePrefixPattern.exec(line.text)?.[1];
  if (!quotePrefix) return false;
  const inserted = `\n${quotePrefix}`;
  view.dispatch({
    changes: { from: range.head, insert: inserted },
    selection: EditorSelection.cursor(range.head + inserted.length),
    userEvent: "input",
  });
  return true;
}

export function markdownEditingPlugin() {
  return defineMarkraPlugin({
    id: "markra.markdown-editing",
    extension: [
      EditorState.transactionFilter.of(keepJoinedLineCaretsAfterText),
      Prec.high(keymap.of([
        { key: "Backspace", run: removeLeadingEmptyLineBackward },
        {
          key: "Enter",
          run: confirmIncompleteInlineDestination,
        },
        { key: "Tab", run: handleTab, shift: handleShiftTab },
        { key: "Shift-Enter", run: insertContextualHardBreak },
      ])),
    ],
  });
}
