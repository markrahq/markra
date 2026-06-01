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

export const selectionHeadingLevels = [1, 2, 3, 4, 5, 6] as const;

export type SelectionFormattingShortcutAction = typeof selectionFormattingShortcutActions[number];
export type SelectionFormattingAction = SelectionFormattingShortcutAction | "link";
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
