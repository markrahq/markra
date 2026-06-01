import type { ResolvedPos } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
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

export type SelectionFormattingShortcutAction = typeof selectionFormattingShortcutActions[number];
export type SelectionFormattingAction = SelectionFormattingShortcutAction | "link";

const markActionTypeNames = {
  bold: "strong",
  inlineCode: "inlineCode",
  italic: "emphasis",
  link: "link",
  strikethrough: "strike_through"
} as const satisfies Partial<Record<SelectionFormattingAction, string>>;

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

export function readSelectionFormattingActionsFromView(view: EditorView): SelectionFormattingAction[] {
  const { state } = view;
  const activeActions: SelectionFormattingAction[] = [];

  for (const [action, markName] of Object.entries(markActionTypeNames)) {
    if (selectionHasMark(state, markName)) activeActions.push(action as SelectionFormattingAction);
  }

  if (selectionHasAncestor(state, "heading", { level: 1 })) activeActions.push("heading1");
  if (selectionHasAncestor(state, "blockquote")) activeActions.push("quote");
  if (selectionHasAncestor(state, "bullet_list")) activeActions.push("bulletList");
  if (selectionHasAncestor(state, "ordered_list")) activeActions.push("orderedList");

  return activeActions;
}
