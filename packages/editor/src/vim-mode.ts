import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export type VimMode = "insert" | "normal";
type VimOperator = "change" | "delete" | "yank";

export type VimModePluginOptions = {
  enabled?: boolean | (() => boolean);
  initialMode?: VimMode;
};

type VimModeState = {
  count: string;
  mode: VimMode;
  operator: PendingOperator | null;
  pending: string | null;
  preferredColumn: number | null;
  register: VimRegister | null;
};

type VimModeMeta = Partial<VimModeState>;

type TextblockRange = {
  after: number;
  before: number;
  start: number;
  end: number;
  text: string;
};

type PendingOperator = {
  count: number;
  type: VimOperator;
};

type VimRegister =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "line";
      texts: string[];
    };

const vimModeKey = new PluginKey<VimModeState>("markra-vim-mode");
export const vimModeClassName = "markra-vim-mode";
export const vimInsertClassName = "markra-vim-insert";
export const vimNormalClassName = "markra-vim-normal";

function vimEnabled(options: VimModePluginOptions) {
  return typeof options.enabled === "function" ? options.enabled() : options.enabled === true;
}

function applyVimModeMeta(state: VimModeState, transaction: Transaction): VimModeState {
  const meta = transaction.getMeta(vimModeKey) as VimModeMeta | undefined;
  if (!meta) {
    return transaction.docChanged || transaction.selectionSet
      ? { ...state, count: "", operator: null, pending: null, preferredColumn: null }
      : state;
  }

  return {
    count: Object.hasOwn(meta, "count") ? meta.count ?? "" : state.count,
    mode: meta.mode ?? state.mode,
    operator: Object.hasOwn(meta, "operator") ? meta.operator ?? null : state.operator,
    pending: Object.hasOwn(meta, "pending") ? meta.pending ?? null : state.pending,
    preferredColumn: Object.hasOwn(meta, "preferredColumn")
      ? meta.preferredColumn ?? null
      : state.preferredColumn,
    register: Object.hasOwn(meta, "register") ? meta.register ?? null : state.register
  };
}

function clearedInputMeta(meta: VimModeMeta = {}): VimModeMeta {
  return {
    count: "",
    operator: null,
    pending: null,
    preferredColumn: null,
    ...meta
  };
}

function dispatchMeta(view: EditorView, meta: VimModeMeta) {
  view.dispatch(view.state.tr.setMeta(vimModeKey, meta));
  view.focus();
}

function dispatchMode(view: EditorView, mode: VimMode, meta: VimModeMeta = {}) {
  dispatchMeta(view, clearedInputMeta({ ...meta, mode }));
}

function dispatchTransaction(view: EditorView, transaction: Transaction, meta: VimModeMeta = clearedInputMeta()) {
  view.dispatch(transaction.setMeta(vimModeKey, meta));
  view.focus();
}

function initialVimModeState(initialMode: VimMode = "insert"): VimModeState {
  return {
    count: "",
    mode: initialMode,
    operator: null,
    pending: null,
    preferredColumn: null,
    register: null
  };
}

function enterNormalMode(view: EditorView, options: VimModePluginOptions) {
  const state = vimModeKey.getState(view.state) ?? initialVimModeState(options.initialMode);
  let transaction = view.state.tr;

  if (state.mode === "insert" && view.state.selection instanceof TextSelection && view.state.selection.empty) {
    const range = currentTextblockRange(view.state);
    if (range) {
      const target = view.state.selection.from > range.start
        ? Math.max(range.start, view.state.selection.from - 1)
        : range.start;
      transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), -1));
    }
  }

  dispatchTransaction(view, transaction, clearedInputMeta({ mode: "normal", register: state.register }));
}

function vimModeClassTargets(view: EditorView) {
  const root = view.dom.closest<HTMLElement>(".markdown-paper");
  const targets = new Set<HTMLElement>();
  targets.add(view.dom);
  if (root) targets.add(root);
  return targets;
}

function updateVimModeClasses(view: EditorView, options: VimModePluginOptions) {
  const enabled = vimEnabled(options);
  const state = vimModeKey.getState(view.state);
  const mode = enabled ? state?.mode ?? options.initialMode ?? "insert" : null;

  for (const target of vimModeClassTargets(view)) {
    target.classList.toggle(vimModeClassName, enabled);
    target.classList.toggle(vimInsertClassName, mode === "insert");
    target.classList.toggle(vimNormalClassName, mode === "normal");
  }
}

function clearVimModeClasses(view: EditorView) {
  for (const target of vimModeClassTargets(view)) {
    target.classList.remove(vimModeClassName, vimInsertClassName, vimNormalClassName);
  }
}

function selectionIsTextSelection(state: EditorState) {
  return state.selection instanceof TextSelection;
}

function textblockDepth(state: EditorState) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).isTextblock) return depth;
  }

  return null;
}

function moveSelection(view: EditorView, position: number, bias: -1 | 1 = 1, meta: VimModeMeta = clearedInputMeta()) {
  const clamped = Math.max(0, Math.min(view.state.doc.content.size, position));
  const selection = TextSelection.near(view.state.doc.resolve(clamped), bias);
  dispatchTransaction(view, view.state.tr.setSelection(selection), meta);
  return true;
}

function moveByCharacter(view: EditorView, delta: -1 | 1, count = 1) {
  if (!selectionIsTextSelection(view.state)) return false;

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const limitEnd = normalTextblockEnd(range);
  const target = Math.max(range.start, Math.min(limitEnd, view.state.selection.from + delta * count));
  return moveSelection(view, target, delta);
}

function textblockRanges(state: EditorState) {
  const ranges: TextblockRange[] = [];

  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true;

    const start = position + 1;
    ranges.push({
      after: position + node.nodeSize,
      before: position,
      end: start + node.content.size,
      start,
      text: node.textContent
    });
    return false;
  });

  return ranges;
}

function normalTextblockEnd(range: Pick<TextblockRange, "start" | "end">) {
  return range.end > range.start ? range.end - 1 : range.start;
}

function currentTextblockRange(state: EditorState) {
  const depth = textblockDepth(state);
  if (depth === null) return null;

  const { $from } = state.selection;
  const start = $from.start(depth);
  const end = $from.end(depth);
  return {
    after: $from.after(depth),
    before: $from.before(depth),
    end,
    start,
    text: $from.node(depth).textContent
  } satisfies TextblockRange;
}

function nearestTextblockIndex(ranges: readonly TextblockRange[], position: number) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [index, range] of ranges.entries()) {
    if (position >= range.start && position <= range.end) return index;

    const distance = position < range.start ? range.start - position : position - range.end;
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }

  return nearestIndex;
}

function moveByTextblock(view: EditorView, delta: -1 | 1, count = 1, preferredColumn?: number | null) {
  if (!selectionIsTextSelection(view.state)) return false;

  const ranges = textblockRanges(view.state);
  if (ranges.length === 0) return false;

  const currentIndex = nearestTextblockIndex(ranges, view.state.selection.from);
  const targetIndex = Math.max(0, Math.min(ranges.length - 1, currentIndex + delta * count));
  const currentRange = ranges[currentIndex];
  const targetRange = ranges[targetIndex];
  if (!currentRange || !targetRange) return false;

  const offset = preferredColumn ?? Math.max(0, view.state.selection.from - currentRange.start);
  const targetOffset = Math.min(offset, normalTextblockEnd(targetRange) - targetRange.start);
  return moveSelection(view, targetRange.start + targetOffset, delta, clearedInputMeta({ preferredColumn: offset }));
}

function moveToTextblockBoundary(view: EditorView, side: "start" | "end") {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const position = side === "start" ? range.start : normalTextblockEnd(range);
  return moveSelection(view, position, side === "start" ? 1 : -1);
}

function isWordCharacter(character: string) {
  return /[\p{L}\p{N}_]/u.test(character);
}

function nextWordStartOffset(text: string, offset: number) {
  let next = Math.max(0, Math.min(text.length, offset));

  while (next < text.length && isWordCharacter(text[next] ?? "")) next += 1;
  while (next < text.length && !isWordCharacter(text[next] ?? "")) next += 1;

  return next;
}

function nextWordEndOffset(text: string, offset: number) {
  let next = Math.max(0, Math.min(text.length - 1, offset));

  if (isWordCharacter(text[next] ?? "")) {
    while (next < text.length - 1 && isWordCharacter(text[next + 1] ?? "")) next += 1;
    return next;
  }

  while (next < text.length && !isWordCharacter(text[next] ?? "")) next += 1;
  while (next < text.length - 1 && isWordCharacter(text[next + 1] ?? "")) next += 1;

  return Math.max(0, Math.min(text.length - 1, next));
}

function previousWordStartOffset(text: string, offset: number) {
  let previous = Math.max(0, Math.min(text.length, offset) - 1);

  while (previous > 0 && !isWordCharacter(text[previous] ?? "")) previous -= 1;
  while (previous > 0 && isWordCharacter(text[previous - 1] ?? "")) previous -= 1;

  return previous;
}

function previousWordEndOffset(text: string, offset: number) {
  let previous = Math.max(0, Math.min(text.length, offset) - 1);

  while (previous > 0 && !isWordCharacter(text[previous] ?? "")) previous -= 1;
  if (previous > 0 && isWordCharacter(text[previous] ?? "")) return previous;

  return 0;
}

function firstWordStartOffset(text: string) {
  const match = /[\p{L}\p{N}_]/u.exec(text);
  return match?.index ?? null;
}

function lastWordStartOffset(text: string) {
  let offset = text.length - 1;

  while (offset > 0 && !isWordCharacter(text[offset] ?? "")) offset -= 1;
  if (!isWordCharacter(text[offset] ?? "")) return null;

  while (offset > 0 && isWordCharacter(text[offset - 1] ?? "")) offset -= 1;
  return offset;
}

function wordMotionOffset(text: string, offset: number, direction: "forward" | "end" | "backward" | "backward-end", count: number) {
  let next = offset;

  for (let index = 0; index < count; index += 1) {
    if (direction === "forward") next = nextWordStartOffset(text, next);
    else if (direction === "end") next = nextWordEndOffset(text, next);
    else if (direction === "backward") next = previousWordStartOffset(text, next);
    else next = previousWordEndOffset(text, next);
  }

  return next;
}

function nextTextblockWordStart(ranges: readonly TextblockRange[], currentIndex: number) {
  for (let index = currentIndex + 1; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (!range) continue;

    const offset = firstWordStartOffset(range.text);
    if (offset !== null) return { index, position: range.start + offset };
  }

  return null;
}

function previousTextblockWordStart(ranges: readonly TextblockRange[], currentIndex: number) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (!range) continue;

    const offset = lastWordStartOffset(range.text);
    if (offset !== null) return { index, position: range.start + offset };
  }

  return null;
}

function wordStartMotionPosition(
  state: EditorState,
  direction: "forward" | "backward",
  count: number,
  finalForwardTarget: "caret" | "boundary" = "caret"
) {
  const ranges = textblockRanges(state);
  if (ranges.length === 0) return null;

  let currentIndex = currentTextblockIndex(state, ranges);
  let position = state.selection.from;

  for (let step = 0; step < count; step += 1) {
    const range = ranges[currentIndex];
    if (!range) return null;

    const offset = Math.max(0, Math.min(range.text.length, position - range.start));

    if (direction === "forward") {
      const targetOffset = nextWordStartOffset(range.text, offset);
      if (targetOffset < range.text.length) {
        position = range.start + targetOffset;
        continue;
      }

      const next = nextTextblockWordStart(ranges, currentIndex);
      if (!next) return finalForwardTarget === "boundary" ? range.end : normalTextblockEnd(range);

      currentIndex = next.index;
      position = next.position;
      continue;
    }

    const targetOffset = previousWordStartOffset(range.text, offset);
    if (targetOffset < offset) {
      position = range.start + targetOffset;
      continue;
    }

    const previous = previousTextblockWordStart(ranges, currentIndex);
    if (!previous) return range.start;

    currentIndex = previous.index;
    position = previous.position;
  }

  return position;
}

function moveByWord(view: EditorView, direction: "forward" | "end" | "backward" | "backward-end", count = 1) {
  if (direction === "forward" || direction === "backward") {
    const target = wordStartMotionPosition(view.state, direction, count);
    if (target === null) return false;

    return moveSelection(view, target, direction === "backward" ? -1 : 1);
  }

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const offset = Math.max(0, Math.min(range.text.length, view.state.selection.from - range.start));
  const targetOffset = wordMotionOffset(range.text, offset, direction, count);
  const target = Math.min(normalTextblockEnd(range), range.start + targetOffset);

  return moveSelection(view, target, direction === "backward-end" ? -1 : 1);
}

function deleteCharacter(view: EditorView, count = 1) {
  if (!selectionIsTextSelection(view.state)) return false;

  const { $from } = view.state.selection;
  const depth = textblockDepth(view.state);
  if (depth === null) return false;

  const blockEnd = $from.end(depth);
  if (view.state.selection.from >= blockEnd) return false;
  const to = Math.min(blockEnd, view.state.selection.from + count);
  const text = view.state.doc.textBetween(view.state.selection.from, to, "\n");

  dispatchTransaction(
    view,
    view.state.tr.delete(view.state.selection.from, to),
    clearedInputMeta({ register: { kind: "text", text } })
  );
  return true;
}

function emptyParagraph(state: EditorState) {
  const paragraph = state.schema.nodes.paragraph;
  return paragraph?.createAndFill() ?? paragraph?.create();
}

function paragraphWithText(state: EditorState, text: string) {
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return null;

  return text ? paragraph.create(null, state.schema.text(text)) : paragraph.createAndFill() ?? paragraph.create();
}

function currentTextblockIndex(state: EditorState, ranges = textblockRanges(state)) {
  return nearestTextblockIndex(ranges, state.selection.from);
}

function selectedTextblocks(state: EditorState, count: number) {
  const ranges = textblockRanges(state);
  if (ranges.length === 0) return null;

  const startIndex = currentTextblockIndex(state, ranges);
  const endIndex = Math.min(ranges.length - 1, startIndex + Math.max(1, count) - 1);
  return {
    endIndex,
    ranges,
    selected: ranges.slice(startIndex, endIndex + 1),
    startIndex
  };
}

function deleteCurrentTextblock(view: EditorView, count = 1) {
  const selection = selectedTextblocks(view.state, count);
  if (!selection || selection.selected.length === 0) return false;

  const from = selection.selected[0]?.before;
  const to = selection.selected[selection.selected.length - 1]?.after;
  if (from === undefined || to === undefined) return false;

  const texts = selection.selected.map((range) => range.text);
  const replacement = from === 0 && to >= view.state.doc.content.size ? emptyParagraph(view.state) : null;
  const transaction = replacement
    ? view.state.tr.replaceWith(from, to, replacement)
    : view.state.tr.delete(from, to);
  const selectionPosition = Math.min(from, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ register: { kind: "line", texts } })
  );
  return true;
}

function yankCurrentTextblock(view: EditorView, count = 1) {
  const selection = selectedTextblocks(view.state, count);
  if (!selection || selection.selected.length === 0) return false;

  dispatchMeta(
    view,
    clearedInputMeta({
      register: {
        kind: "line",
        texts: selection.selected.map((range) => range.text)
      }
    })
  );
  return true;
}

function insertParagraphNearTextblock(view: EditorView, side: "before" | "after") {
  const depth = textblockDepth(view.state);
  const paragraph = emptyParagraph(view.state);
  if (depth === null || !paragraph) return false;

  const { $from } = view.state.selection;
  const position = side === "before" ? $from.before(depth) : $from.after(depth);
  const transaction = view.state.tr.insert(position, paragraph);
  const selectionPosition = side === "before" ? position + 1 : position + paragraph.nodeSize - 1;
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ mode: "insert" })
  );
  return true;
}

function textRange(view: EditorView, from: number, to: number) {
  return view.state.doc.textBetween(Math.min(from, to), Math.max(from, to), "\n");
}

function deleteRange(view: EditorView, from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  dispatchTransaction(
    view,
    view.state.tr.delete(start, end),
    clearedInputMeta({ register: { kind: "text", text: textRange(view, start, end) } })
  );
  return true;
}

function changeRange(view: EditorView, from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  const text = textRange(view, start, end);
  const transaction = view.state.tr.delete(start, end);
  const selectionPosition = Math.min(start, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ mode: "insert", register: { kind: "text", text } })
  );
  return true;
}

function yankRange(view: EditorView, from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  dispatchMeta(view, clearedInputMeta({ register: { kind: "text", text: textRange(view, start, end) } }));
  return true;
}

function pasteRegister(view: EditorView, side: "before" | "after", count = 1, register?: VimRegister | null) {
  if (!register) return false;

  if (register.kind === "text") {
    const range = currentTextblockRange(view.state);
    if (!range) return false;

    const position = side === "after"
      ? Math.min(range.end, view.state.selection.from + 1)
      : view.state.selection.from;
    const text = register.text.repeat(Math.max(1, count));
    const transaction = view.state.tr.insertText(text, position, position);
    dispatchTransaction(
      view,
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(position), 1)),
      clearedInputMeta()
    );
    return true;
  }

  const ranges = textblockRanges(view.state);
  if (ranges.length === 0) return false;

  const currentRange = ranges[currentTextblockIndex(view.state, ranges)];
  if (!currentRange) return false;

  const nodes: ProseNode[] = [];
  for (let repeat = 0; repeat < Math.max(1, count); repeat += 1) {
    for (const text of register.texts) {
      const node = paragraphWithText(view.state, text);
      if (node) nodes.push(node);
    }
  }
  if (nodes.length === 0) return false;

  const position = side === "after" ? currentRange.after : currentRange.before;
  let transaction = view.state.tr;
  for (const node of nodes) {
    transaction = transaction.insert(position + (transaction.doc.content.size - view.state.doc.content.size), node);
  }

  const selectionPosition = Math.min(position + 1, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta()
  );
  return true;
}

function targetIsNestedControl(view: EditorView, event: KeyboardEvent) {
  if (!(event.target instanceof Element)) return false;
  if (event.target === view.dom) return false;

  const control = event.target.closest("input, textarea, select, button");
  return Boolean(control && view.dom.contains(control));
}

function hasCommandModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function readCount(state: VimModeState) {
  const parsed = Number.parseInt(state.count, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function keyStartsOrContinuesCount(key: string, state: VimModeState) {
  return /^[0-9]$/u.test(key) && (key !== "0" || state.count.length > 0);
}

function appendCount(view: EditorView, key: string, state: VimModeState) {
  dispatchMeta(view, { count: `${state.count}${key}` });
  return true;
}

function beginOperator(view: EditorView, type: VimOperator, state: VimModeState) {
  dispatchMeta(view, {
    count: "",
    operator: {
      count: readCount(state),
      type
    },
    pending: null
  });
  return true;
}

function firstNonblankPosition(range: TextblockRange) {
  const match = /\S/u.exec(range.text);
  return range.start + (match?.index ?? 0);
}

function insertAtTextblockBoundary(view: EditorView, side: "first-nonblank" | "end") {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const position = side === "first-nonblank" ? firstNonblankPosition(range) : range.end;
  dispatchTransaction(
    view,
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position), side === "end" ? -1 : 1)),
    clearedInputMeta({ mode: "insert" })
  );
  return true;
}

function insertAfterCharacter(view: EditorView) {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const position = Math.min(range.end, view.state.selection.from + 1);
  dispatchTransaction(
    view,
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position), -1)),
    clearedInputMeta({ mode: "insert" })
  );
  return true;
}

function lineMotion(view: EditorView, key: "first" | "last", count: number) {
  const ranges = textblockRanges(view.state);
  if (ranges.length === 0) return false;

  const targetIndex = key === "first"
    ? Math.max(0, Math.min(ranges.length - 1, count > 1 ? count - 1 : 0))
    : Math.max(0, Math.min(ranges.length - 1, count > 1 ? count - 1 : ranges.length - 1));
  const targetRange = ranges[targetIndex];
  if (!targetRange) return false;

  return moveSelection(view, targetRange.start, 1);
}

function resolveMotionTarget(view: EditorView, key: string, count: number, prefix: string | null = null) {
  const range = currentTextblockRange(view.state);
  if (!range) return null;

  const current = view.state.selection.from;
  const offset = Math.max(0, Math.min(range.text.length, current - range.start));

  if (prefix === "g" && key === "e") {
    return range.start + wordMotionOffset(range.text, offset, "backward-end", count);
  }

  switch (key) {
    case "h":
    case "ArrowLeft":
      return Math.max(range.start, current - count);
    case "l":
    case "ArrowRight":
      return Math.min(normalTextblockEnd(range), current + count);
    case "w":
      return wordStartMotionPosition(view.state, "forward", count, "boundary");
    case "e":
      return Math.min(normalTextblockEnd(range), range.start + wordMotionOffset(range.text, offset, "end", count));
    case "b":
      return wordStartMotionPosition(view.state, "backward", count);
    case "0":
      return range.start;
    case "^":
      return firstNonblankPosition(range);
    case "$":
      return range.end;
    default:
      return null;
  }
}

function shouldChangeCurrentWord(view: EditorView, operator: PendingOperator, key: string, count: number, prefix: string | null) {
  if (operator.type !== "change" || key !== "w" || prefix !== null || count !== 1) return false;

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const offset = view.state.selection.from - range.start;
  return isWordCharacter(range.text[offset] ?? "");
}

function operateRange(view: EditorView, operator: PendingOperator, key: string, state: VimModeState, prefix: string | null = null) {
  const count = operator.count * readCount(state);
  const changeCurrentWord = shouldChangeCurrentWord(view, operator, key, count, prefix);
  const target = resolveMotionTarget(view, changeCurrentWord ? "e" : key, count, prefix);
  if (target === null) return false;

  const from = view.state.selection.from;
  const to = (key === "e" || changeCurrentWord) && target >= from
    ? Math.min(view.state.doc.content.size, target + 1)
    : target;
  if (operator.type === "change") return changeRange(view, from, to);
  return operator.type === "delete" ? deleteRange(view, from, to) : yankRange(view, from, to);
}

function handleOperatorKey(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  if (!operator) return false;

  if (keyStartsOrContinuesCount(key, state)) return appendCount(view, key, state);

  if (operator.type === "delete" && key === "d") return deleteCurrentTextblock(view, operator.count * readCount(state));
  if (operator.type === "yank" && key === "y") return yankCurrentTextblock(view, operator.count * readCount(state));

  if (state.pending === "g") {
    if (key === "e") return operateRange(view, operator, key, state, "g");

    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  if (key === "g") {
    dispatchMeta(view, { pending: "g" });
    return true;
  }

  if (operateRange(view, operator, key, state)) return true;

  dispatchMeta(view, clearedInputMeta());
  return true;
}

function handleNormalModeKey(view: EditorView, key: string, state: VimModeState) {
  if (state.operator) return handleOperatorKey(view, key, state);

  if (keyStartsOrContinuesCount(key, state)) return appendCount(view, key, state);

  const count = readCount(state);

  if (state.pending === "g") {
    if (key === "g") return lineMotion(view, "first", count);
    if (key === "e") return moveByWord(view, "backward-end", count);

    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  switch (key) {
    case "i":
      dispatchMode(view, "insert");
      return true;
    case "a":
      return insertAfterCharacter(view);
    case "I":
      return insertAtTextblockBoundary(view, "first-nonblank");
    case "A":
      return insertAtTextblockBoundary(view, "end");
    case "h":
    case "ArrowLeft":
      return moveByCharacter(view, -1, count);
    case "l":
    case "ArrowRight":
      return moveByCharacter(view, 1, count);
    case "j":
    case "ArrowDown":
      return moveByTextblock(view, 1, count, state.preferredColumn);
    case "k":
    case "ArrowUp":
      return moveByTextblock(view, -1, count, state.preferredColumn);
    case "Backspace":
    case "Delete":
    case "Enter":
      return true;
    case "w":
      return moveByWord(view, "forward", count);
    case "e":
      return moveByWord(view, "end", count);
    case "b":
      return moveByWord(view, "backward", count);
    case "0":
      return moveToTextblockBoundary(view, "start");
    case "^":
      return moveSelection(view, firstNonblankPosition(currentTextblockRange(view.state) ?? {
        after: view.state.selection.from,
        before: view.state.selection.from,
        end: view.state.selection.from,
        start: view.state.selection.from,
        text: ""
      }), 1);
    case "$":
      return moveToTextblockBoundary(view, "end");
    case "G":
      return lineMotion(view, "last", count);
    case "g":
      dispatchMeta(view, { pending: "g" });
      return true;
    case "d":
      return beginOperator(view, "delete", state);
    case "y":
      return beginOperator(view, "yank", state);
    case "c":
      return beginOperator(view, "change", state);
    case "p":
      return pasteRegister(view, "after", count, state.register);
    case "P":
      return pasteRegister(view, "before", count, state.register);
    case "u": {
      const handled = undo(view.state, view.dispatch);
      if (handled) view.focus();
      return handled;
    }
    case "x":
      return deleteCharacter(view, count);
    case "o":
      return insertParagraphNearTextblock(view, "after");
    case "O":
      return insertParagraphNearTextblock(view, "before");
    default:
      return key.length === 1;
  }
}

function handleNormalModeModifiedKey(view: EditorView, event: KeyboardEvent) {
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === "r") {
    const handled = redo(view.state, view.dispatch);
    if (handled) view.focus();
    return handled;
  }

  return false;
}

export function getVimMode(state: EditorState): VimMode {
  return vimModeKey.getState(state)?.mode ?? "insert";
}

export function createVimModePlugin(options: VimModePluginOptions = {}) {
  return new Plugin<VimModeState>({
    key: vimModeKey,
    state: {
      init: () => initialVimModeState(options.initialMode ?? "insert"),
      apply: (transaction, state) => applyVimModeMeta(state, transaction)
    },
    props: {
      handleKeyDown: (view, event) => {
        if (!vimEnabled(options) || targetIsNestedControl(view, event)) return false;

        if (event.key === "Escape") {
          enterNormalMode(view, options);
          event.preventDefault();
          return true;
        }

        if (event.isComposing) return false;

        const state = vimModeKey.getState(view.state) ?? initialVimModeState(options.initialMode ?? "insert");
        if (state.mode !== "normal") return false;

        if (hasCommandModifier(event)) {
          const handled = handleNormalModeModifiedKey(view, event);
          if (!handled) return false;

          event.preventDefault();
          return true;
        }

        const handled = handleNormalModeKey(view, event.key, state);
        if (!handled) return false;

        event.preventDefault();
        return true;
      },
      handleTextInput: (view) => {
        if (!vimEnabled(options)) return false;

        const state = vimModeKey.getState(view.state);
        return state?.mode === "normal";
      }
    },
    view: (view) => {
      updateVimModeClasses(view, options);

      return {
        update: (updatedView) => updateVimModeClasses(updatedView, options),
        destroy: () => clearVimModeClasses(view)
      };
    }
  });
}

export const markraVimModePlugin = (options: VimModePluginOptions = {}) => $prose(() => createVimModePlugin(options));
