import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
} from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import {
  runMarkraCommand,
  searchMarkraUi,
  type MarkraUiAction,
} from "./plugin.ts";

export type MarkraSlashMenuSource = "typed" | "virtual";

export interface MarkraSlashMenuState {
  readonly actions: readonly MarkraUiAction[];
  readonly from: number | null;
  readonly open: boolean;
  readonly query: string;
  readonly selectedIndex: number;
  readonly source: MarkraSlashMenuSource | null;
  readonly to: number | null;
}

interface SlashMenuRange {
  from: number;
  query: string;
  source: MarkraSlashMenuSource;
  to: number;
}

interface SuppressedRange {
  from: number;
  to: number;
}

interface InternalSlashMenuState {
  active: SlashMenuRange | null;
  selectedIndex: number;
  suppressed: SuppressedRange | null;
}

type SlashMenuEffect =
  | { type: "close" }
  | { type: "open" }
  | { index: number; type: "select" };

interface SyntaxNodeLike {
  name: string;
  parent: SyntaxNodeLike | null;
}

const updateSlashMenu = StateEffect.define<SlashMenuEffect>();

function isEditable(state: EditorState) {
  return !state.facet(EditorState.readOnly);
}

function isInsideCodeBlock(state: EditorState, position: number) {
  let node: SyntaxNodeLike | null = syntaxTree(state).resolve(position, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
    node = node.parent;
  }
  return false;
}

function typedRangeFromState(state: EditorState): SlashMenuRange | null {
  if (!isEditable(state) || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty) return null;

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to) return null;
  if (isInsideCodeBlock(state, selection.head)) return null;

  const beforeCursor = state.sliceDoc(line.from, selection.head);
  const match = /^([\t ]*)[/、]([^\s/、]*)$/u.exec(beforeCursor);
  if (!match) return null;

  const indentLength = match[1]?.length ?? 0;
  return {
    from: line.from + indentLength,
    query: match[2] ?? "",
    source: "typed",
    to: selection.head,
  };
}

function virtualRangeFromState(
  state: EditorState,
  from = state.selection.main.head,
): SlashMenuRange | null {
  if (!isEditable(state) || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty || from > selection.head) return null;

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to || from < line.from) return null;
  if (isInsideCodeBlock(state, selection.head)) return null;

  const query = state.sliceDoc(from, selection.head);
  if (/\s|[/、]/u.test(query)) return null;

  return {
    from,
    query,
    source: "virtual",
    to: selection.head,
  };
}

function continuedVirtualRange(
  transaction: Transaction,
  previous: InternalSlashMenuState,
) {
  if (previous.active?.source !== "virtual") return null;
  const from = transaction.changes.mapPos(previous.active.from, -1);
  return virtualRangeFromState(transaction.state, from);
}

function sameRange(
  left: SuppressedRange | null,
  right: SuppressedRange | null,
) {
  return Boolean(
    left && right && left.from === right.from && left.to === right.to,
  );
}

function effectFrom(transaction: Transaction) {
  return transaction.effects.find((effect) => effect.is(updateSlashMenu))?.value;
}

const slashMenuField = StateField.define<InternalSlashMenuState>({
  create(state) {
    return {
      active: typedRangeFromState(state),
      selectedIndex: 0,
      suppressed: null,
    };
  },
  update(previous, transaction) {
    const effect = effectFrom(transaction);
    const typedRange = typedRangeFromState(transaction.state);

    if (effect?.type === "close") {
      return {
        active: null,
        selectedIndex: 0,
        // Keep the exact typed range suppressed until its text or selection
        // changes, otherwise any later transaction would reopen the menu.
        suppressed:
          typedRange?.source === "typed"
            ? { from: typedRange.from, to: typedRange.to }
            : null,
      };
    }

    if (effect?.type === "open") {
      return {
        active: virtualRangeFromState(transaction.state),
        selectedIndex: 0,
        suppressed: null,
      };
    }

    const active = typedRange ?? continuedVirtualRange(transaction, previous);
    if (sameRange(active, previous.suppressed)) {
      return { active: null, selectedIndex: 0, suppressed: previous.suppressed };
    }

    const keepSelection =
      active?.from === previous.active?.from &&
      active?.query === previous.active?.query &&
      active?.source === previous.active?.source;

    return {
      active,
      selectedIndex:
        effect?.type === "select"
          ? effect.index
          : keepSelection
            ? previous.selectedIndex
            : 0,
      suppressed: null,
    };
  },
});

function internalState(view: EditorView) {
  return view.state.field(slashMenuField, false);
}

function moveSelection(view: EditorView, amount: -1 | 1) {
  const menu = getMarkraSlashMenuState(view);
  if (!menu.open) return false;
  const count = menu.actions.length;
  const index = count === 0 ? 0 : (menu.selectedIndex + amount + count) % count;
  view.dispatch({ effects: updateSlashMenu.of({ index, type: "select" }) });
  return true;
}

function runSelectedAction(view: EditorView) {
  const menu = getMarkraSlashMenuState(view);
  if (!menu.open || menu.actions.length === 0) return false;
  return runMarkraSlashMenuAction(
    view,
    menu.actions[menu.selectedIndex]?.command,
  );
}

const slashMenuKeymap = Prec.highest(
  keymap.of([
    { key: "ArrowDown", run: (view) => moveSelection(view, 1) },
    { key: "ArrowUp", run: (view) => moveSelection(view, -1) },
    { key: "Enter", run: runSelectedAction },
    { key: "Tab", run: runSelectedAction },
    { key: "Escape", run: closeMarkraSlashMenu },
  ]),
);

export function markraSlashMenu(): Extension {
  return [slashMenuField, slashMenuKeymap];
}

export function getMarkraSlashMenuState(
  view: EditorView,
): MarkraSlashMenuState {
  const state = internalState(view);
  if (!state?.active) {
    return {
      actions: [],
      from: null,
      open: false,
      query: "",
      selectedIndex: 0,
      source: null,
      to: null,
    };
  }

  const { active } = state;
  const actions = searchMarkraUi(view, "slash-menu", active.query).map(
    (action) => ({
      ...action,
      run: () => runMarkraSlashMenuAction(view, action.command),
    }),
  );
  const selectedIndex = Math.min(
    state.selectedIndex,
    Math.max(actions.length - 1, 0),
  );

  return {
    actions,
    from: active.from,
    open: true,
    query: active.query,
    selectedIndex,
    source: active.source,
    to: active.to,
  };
}

export function openMarkraSlashMenu(view: EditorView) {
  if (!virtualRangeFromState(view.state)) return false;
  view.dispatch({ effects: updateSlashMenu.of({ type: "open" }) });
  // Toolbar buttons take DOM focus before their click handler runs. Restore it
  // so CodeMirror receives the menu's Arrow/Enter/Escape keybindings.
  view.focus();
  return true;
}

export function closeMarkraSlashMenu(view: EditorView) {
  if (!internalState(view)?.active) return false;
  view.dispatch({ effects: updateSlashMenu.of({ type: "close" }) });
  return true;
}

export function runMarkraSlashMenuAction(
  view: EditorView,
  commandId?: string,
) {
  const menu = getMarkraSlashMenuState(view);
  if (!menu.open) return false;
  const action = commandId
    ? menu.actions.find((candidate) => candidate.command === commandId)
    : menu.actions[menu.selectedIndex];
  if (!action?.enabled || menu.from === null || menu.to === null) return false;
  const query = menu.query;

  // Delete the typed or virtual query first so block commands operate on the
  // clean Markdown line, matching Markra's existing slash-command semantics.
  view.dispatch({
    changes: { from: menu.from, to: menu.to },
    effects: updateSlashMenu.of({ type: "close" }),
    selection: EditorSelection.cursor(menu.from),
    userEvent: "input.delete",
  });
  const handled = runMarkraCommand(view, action.command, {
    query,
    source: "slash-menu",
  });
  if (handled) view.focus();
  return handled;
}
