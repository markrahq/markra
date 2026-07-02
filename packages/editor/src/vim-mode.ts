import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export type VimMode = "insert" | "normal" | "visual";
type VimOperator = "change" | "delete" | "yank";
type VimFindDirection = "backward" | "forward";
type VimFindKey = "F" | "T" | "f" | "t";
type VimSearchDirection = "backward" | "forward";
type VimSearchPending = "search-backward" | "search-forward";
type VimTextObjectPending = "text-object-around" | "text-object-inner";
type VimPairTextObjectKey = "(" | ")" | "[" | "]" | "{" | "}";
type VimQuoteTextObjectKey = "'" | '"' | "`";
type VimTextObjectScope = "around" | "inner";
type VimVisualKind = "character" | "line";
type WordClassifier = (character: string) => boolean;

type VimPairDelimiters = {
  close: ")" | "]" | "}";
  open: "(" | "[" | "{";
};

export type VimModePluginOptions = {
  enabled?: boolean | (() => boolean);
  initialMode?: VimMode;
};

type VimModeState = {
  count: string;
  lastFind: VimCharacterFind | null;
  lastChangeKeys: readonly string[] | null;
  lastChangeText: string | null;
  lastSearch: VimSearch | null;
  mode: VimMode;
  operator: PendingOperator | null;
  pendingChangeKeys: readonly string[] | null;
  pendingInsertChangeKeys: readonly string[] | null;
  pendingInsertText: string;
  pending: string | null;
  preferredColumn: number | null;
  register: VimRegister | null;
  searchQuery: string;
  visualAnchor: number | null;
  visualCursor: number | null;
  visualKind: VimVisualKind | null;
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

type VimCharacterFind = {
  character: string;
  direction: VimFindDirection;
  till: boolean;
};

type VimSearch = {
  direction: VimSearchDirection;
  query: string;
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
export const vimVisualClassName = "markra-vim-visual";

function vimEnabled(options: VimModePluginOptions) {
  return typeof options.enabled === "function" ? options.enabled() : options.enabled === true;
}

function applyVimModeMeta(state: VimModeState, transaction: Transaction): VimModeState {
  const meta = transaction.getMeta(vimModeKey) as VimModeMeta | undefined;
  if (!meta) {
    return transaction.docChanged || transaction.selectionSet
      ? {
          ...state,
          count: "",
          mode: state.mode === "visual" ? "normal" : state.mode,
          operator: null,
          pending: null,
          pendingChangeKeys: null,
          pendingInsertChangeKeys: null,
          pendingInsertText: "",
          preferredColumn: null,
          searchQuery: "",
          visualAnchor: null,
          visualCursor: null,
          visualKind: null
        }
      : state;
  }

  return {
    count: Object.hasOwn(meta, "count") ? meta.count ?? "" : state.count,
    lastFind: Object.hasOwn(meta, "lastFind") ? meta.lastFind ?? null : state.lastFind,
    lastChangeKeys: Object.hasOwn(meta, "lastChangeKeys")
      ? meta.lastChangeKeys ?? null
      : state.lastChangeKeys,
    lastChangeText: Object.hasOwn(meta, "lastChangeText")
      ? meta.lastChangeText ?? null
      : state.lastChangeText,
    lastSearch: Object.hasOwn(meta, "lastSearch") ? meta.lastSearch ?? null : state.lastSearch,
    mode: meta.mode ?? state.mode,
    operator: Object.hasOwn(meta, "operator") ? meta.operator ?? null : state.operator,
    pendingChangeKeys: Object.hasOwn(meta, "pendingChangeKeys")
      ? meta.pendingChangeKeys ?? null
      : state.pendingChangeKeys,
    pendingInsertChangeKeys: Object.hasOwn(meta, "pendingInsertChangeKeys")
      ? meta.pendingInsertChangeKeys ?? null
      : state.pendingInsertChangeKeys,
    pendingInsertText: Object.hasOwn(meta, "pendingInsertText")
      ? meta.pendingInsertText ?? ""
      : state.pendingInsertText,
    pending: Object.hasOwn(meta, "pending") ? meta.pending ?? null : state.pending,
    preferredColumn: Object.hasOwn(meta, "preferredColumn")
      ? meta.preferredColumn ?? null
      : state.preferredColumn,
    register: Object.hasOwn(meta, "register") ? meta.register ?? null : state.register,
    searchQuery: Object.hasOwn(meta, "searchQuery") ? meta.searchQuery ?? "" : state.searchQuery,
    visualAnchor: Object.hasOwn(meta, "visualAnchor") ? meta.visualAnchor ?? null : state.visualAnchor,
    visualCursor: Object.hasOwn(meta, "visualCursor") ? meta.visualCursor ?? null : state.visualCursor,
    visualKind: Object.hasOwn(meta, "visualKind") ? meta.visualKind ?? null : state.visualKind
  };
}

function clearedInputMeta(meta: VimModeMeta = {}): VimModeMeta {
  return {
    count: "",
    operator: null,
    pendingChangeKeys: null,
    pendingInsertChangeKeys: null,
    pendingInsertText: "",
    pending: null,
    preferredColumn: null,
    searchQuery: "",
    visualAnchor: null,
    visualCursor: null,
    visualKind: null,
    ...meta
  };
}

function dispatchMeta(view: EditorView, meta: VimModeMeta) {
  view.dispatch(view.state.tr.setMeta(vimModeKey, meta));
  view.focus();
}

function dispatchMode(view: EditorView, mode: VimMode, meta: VimModeMeta = {}) {
  dispatchMeta(view, clearedInputMeta({ ...(mode === "insert" ? { lastChangeKeys: null } : {}), ...meta, mode }));
}

function dispatchTransaction(view: EditorView, transaction: Transaction, meta: VimModeMeta = clearedInputMeta()) {
  view.dispatch(transaction.setMeta(vimModeKey, meta));
  view.focus();
}

function initialVimModeState(initialMode: VimMode = "insert"): VimModeState {
  return {
    count: "",
    lastFind: null,
    lastChangeKeys: null,
    lastChangeText: null,
    lastSearch: null,
    mode: initialMode,
    operator: null,
    pendingChangeKeys: null,
    pendingInsertChangeKeys: null,
    pendingInsertText: "",
    pending: null,
    preferredColumn: null,
    register: null,
    searchQuery: "",
    visualAnchor: null,
    visualCursor: null,
    visualKind: null
  };
}

function enterNormalMode(view: EditorView, options: VimModePluginOptions) {
  const state = vimModeKey.getState(view.state) ?? initialVimModeState(options.initialMode);
  let transaction = view.state.tr;

  if (state.mode === "visual" && view.state.selection instanceof TextSelection && !view.state.selection.empty) {
    const target = state.visualCursor
      ?? visualCursorPosition(view.state.selection, state.visualAnchor ?? view.state.selection.from);
    transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), 1));
  } else if (state.mode === "insert" && view.state.selection instanceof TextSelection && view.state.selection.empty) {
    const range = currentTextblockRange(view.state);
    if (range) {
      const target = view.state.selection.from > range.start
        ? Math.max(range.start, view.state.selection.from - 1)
        : range.start;
      transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), -1));
    }
  }

  dispatchTransaction(
    view,
    transaction,
    clearedInputMeta({
      lastChangeKeys: state.pendingInsertChangeKeys ?? state.lastChangeKeys,
      lastChangeText: state.pendingInsertChangeKeys ? state.pendingInsertText : state.lastChangeText,
      mode: "normal",
      register: state.register
    })
  );
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
    target.classList.toggle(vimVisualClassName, mode === "visual");
  }
}

function clearVimModeClasses(view: EditorView) {
  for (const target of vimModeClassTargets(view)) {
    target.classList.remove(vimModeClassName, vimInsertClassName, vimNormalClassName, vimVisualClassName);
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

function visualCursorPosition(selection: TextSelection, anchor: number) {
  const head = selection.$head.pos;
  return head > anchor ? Math.max(anchor, head - 1) : head;
}

// ProseMirror selections use text boundaries; Vim visual mode selects the characters between anchor and cursor.
function visualTextSelection(state: EditorState, anchor: number, cursor: number) {
  const clampedAnchor = Math.max(0, Math.min(state.doc.content.size, anchor));
  const clampedCursor = Math.max(0, Math.min(state.doc.content.size, cursor));

  if (clampedCursor >= clampedAnchor) {
    return TextSelection.create(state.doc, clampedAnchor, Math.min(state.doc.content.size, clampedCursor + 1));
  }

  return TextSelection.create(state.doc, Math.min(state.doc.content.size, clampedAnchor + 1), clampedCursor);
}

function visualTextblockSelection(state: EditorState, anchor: number, cursor: number) {
  const ranges = textblockRanges(state);
  if (ranges.length === 0) return null;

  const anchorIndex = nearestTextblockIndex(ranges, anchor);
  const cursorIndex = nearestTextblockIndex(ranges, cursor);
  const startIndex = Math.min(anchorIndex, cursorIndex);
  const endIndex = Math.max(anchorIndex, cursorIndex);
  const startRange = ranges[startIndex];
  const endRange = ranges[endIndex];
  const anchorRange = ranges[anchorIndex];
  const cursorRange = ranges[cursorIndex];
  if (!startRange || !endRange || !anchorRange || !cursorRange) return null;

  return cursorIndex >= anchorIndex
    ? TextSelection.create(state.doc, startRange.start, endRange.end)
    : TextSelection.create(state.doc, anchorRange.end, cursorRange.start);
}

function visualSelectionForKind(state: EditorState, kind: VimVisualKind, anchor: number, cursor: number) {
  return kind === "line"
    ? visualTextblockSelection(state, anchor, cursor)
    : visualTextSelection(state, anchor, cursor);
}

function moveVisualSelection(view: EditorView, anchor: number, cursor: number, kind: VimVisualKind) {
  return moveVisualSelectionWithMeta(view, anchor, cursor, kind);
}

function moveByCharacter(view: EditorView, delta: -1 | 1, count = 1) {
  if (!selectionIsTextSelection(view.state)) return false;

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const limitEnd = normalTextblockEnd(range);
  const target = Math.max(range.start, Math.min(limitEnd, view.state.selection.from + delta * count));
  return moveSelection(view, target, delta);
}

function isFindKey(key: string): key is VimFindKey {
  return key === "f" || key === "F" || key === "t" || key === "T";
}

function isSearchPending(pending: string | null): pending is VimSearchPending {
  return pending === "search-forward" || pending === "search-backward";
}

function searchDirectionFromPending(pending: VimSearchPending): VimSearchDirection {
  return pending === "search-forward" ? "forward" : "backward";
}

function reversedSearch(search: VimSearch): VimSearch {
  return {
    query: search.query,
    direction: search.direction === "forward" ? "backward" : "forward"
  };
}

function isTextObjectPending(pending: string | null): pending is VimTextObjectPending {
  return pending === "text-object-inner" || pending === "text-object-around";
}

function textObjectScopeFromPending(pending: VimTextObjectPending): VimTextObjectScope {
  return pending === "text-object-inner" ? "inner" : "around";
}

function isQuoteTextObjectKey(key: string): key is VimQuoteTextObjectKey {
  return key === '"' || key === "'" || key === "`";
}

function isPairTextObjectKey(key: string): key is VimPairTextObjectKey {
  return key === "(" || key === ")" || key === "[" || key === "]" || key === "{" || key === "}";
}

function pairDelimitersFromKey(key: VimPairTextObjectKey): VimPairDelimiters {
  if (key === "(" || key === ")") return { close: ")", open: "(" };
  if (key === "[" || key === "]") return { close: "]", open: "[" };
  return { close: "}", open: "{" };
}

function pairDelimitersAtCharacter(character: string): VimPairDelimiters | null {
  if (character === "(" || character === ")") return { close: ")", open: "(" };
  if (character === "[" || character === "]") return { close: "]", open: "[" };
  if (character === "{" || character === "}") return { close: "}", open: "{" };

  return null;
}

function characterFindFromKey(key: VimFindKey, character: string): VimCharacterFind {
  return {
    character,
    direction: key === "f" || key === "t" ? "forward" : "backward",
    till: key === "t" || key === "T"
  };
}

function reversedCharacterFind(find: VimCharacterFind): VimCharacterFind {
  return {
    ...find,
    direction: find.direction === "forward" ? "backward" : "forward"
  };
}

function findCharacterOffset(text: string, find: VimCharacterFind, offset: number, count: number) {
  let remaining = Math.max(1, count);

  if (find.direction === "forward") {
    for (let index = offset + 1; index < text.length; index += 1) {
      if (text[index] !== find.character) continue;
      remaining -= 1;
      if (remaining === 0) return index;
    }

    return null;
  }

  for (let index = offset - 1; index >= 0; index -= 1) {
    if (text[index] !== find.character) continue;
    remaining -= 1;
    if (remaining === 0) return index;
  }

  return null;
}

function characterFindTarget(state: EditorState, find: VimCharacterFind, count: number) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const offset = Math.max(0, Math.min(range.text.length - 1, state.selection.from - range.start));
  const foundOffset = findCharacterOffset(range.text, find, offset, count);
  if (foundOffset === null) return null;

  const targetOffset = find.till
    ? foundOffset + (find.direction === "forward" ? -1 : 1)
    : foundOffset;
  if (targetOffset < 0 || targetOffset >= range.text.length) return null;

  return range.start + targetOffset;
}

function moveByCharacterFind(view: EditorView, find: VimCharacterFind, count: number, meta: VimModeMeta = {}) {
  const target = characterFindTarget(view.state, find, count);
  if (target === null) {
    dispatchMeta(view, clearedInputMeta(meta));
    return true;
  }

  return moveSelection(
    view,
    target,
    find.direction === "backward" ? -1 : 1,
    clearedInputMeta(meta)
  );
}

function textblockRangesFromDoc(doc: ProseNode) {
  const ranges: TextblockRange[] = [];

  doc.descendants((node, position) => {
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

function textblockRanges(state: EditorState) {
  return textblockRangesFromDoc(state.doc);
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

function searchMatchPositions(state: EditorState, query: string) {
  if (query.length === 0) return [];

  const positions: number[] = [];
  for (const range of textblockRanges(state)) {
    let offset = range.text.indexOf(query);

    while (offset >= 0) {
      positions.push(range.start + offset);
      offset = range.text.indexOf(query, offset + Math.max(1, query.length));
    }
  }

  return positions;
}

function nextSearchPosition(positions: readonly number[], direction: VimSearchDirection, from: number) {
  if (positions.length === 0) return null;

  if (direction === "forward") {
    return positions.find((position) => position > from) ?? positions[0] ?? null;
  }

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index];
    if (position !== undefined && position < from) return position;
  }

  return positions[positions.length - 1] ?? null;
}

function searchMotionTarget(state: EditorState, search: VimSearch, count: number) {
  const positions = searchMatchPositions(state, search.query);
  if (positions.length === 0) return null;

  let position = state.selection.from;
  for (let index = 0; index < Math.max(1, count); index += 1) {
    const next = nextSearchPosition(positions, search.direction, position);
    if (next === null) return null;
    position = next;
  }

  return position;
}

function moveBySearch(view: EditorView, search: VimSearch, count = 1, rememberedSearch = search) {
  const position = searchMotionTarget(view.state, search, count);
  if (position === null) {
    dispatchMeta(view, clearedInputMeta({ lastSearch: rememberedSearch }));
    return true;
  }

  return moveSelection(
    view,
    position,
    search.direction === "backward" ? -1 : 1,
    clearedInputMeta({ lastSearch: rememberedSearch })
  );
}

function operateSearch(
  view: EditorView,
  operator: PendingOperator,
  search: VimSearch,
  count: number,
  rememberedSearch = search
) {
  const target = searchMotionTarget(view.state, search, count);
  if (target === null) {
    dispatchMeta(view, clearedInputMeta({ lastSearch: rememberedSearch }));
    return true;
  }

  const current = view.state.selection.from;
  // Match Vim's backward search operator boundary: c?x/d?x remove the match and text up to the cursor.
  const from = search.direction === "backward" && target <= current ? target : current;
  const to = search.direction === "backward" && target <= current
    ? Math.min(view.state.doc.content.size, current + 1)
    : target;

  if (operator.type === "change") return changeRange(view, from, to, { lastSearch: rememberedSearch });
  return operator.type === "delete"
    ? deleteRange(view, from, to, { lastSearch: rememberedSearch })
    : yankRange(view, from, to, { lastSearch: rememberedSearch });
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

function joinTextblocks(view: EditorView, blockCount = 2) {
  if (!selectionIsTextSelection(view.state)) return false;

  let transaction = view.state.tr;
  let selectionPosition = view.state.selection.from;
  let joined = false;
  const joinCount = Math.max(1, blockCount - 1);

  for (let step = 0; step < joinCount; step += 1) {
    const ranges = textblockRangesFromDoc(transaction.doc);
    const currentIndex = nearestTextblockIndex(ranges, selectionPosition);
    const currentRange = ranges[currentIndex];
    const nextRange = ranges[currentIndex + 1];
    if (!currentRange || !nextRange) break;

    selectionPosition = currentRange.end;
    transaction = transaction.delete(currentRange.end, nextRange.start).insertText(" ", selectionPosition);
    joined = true;
  }

  if (!joined) return false;

  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), -1)),
    clearedInputMeta()
  );
  return true;
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

function isWhitespaceCharacter(character: string) {
  return /\s/u.test(character);
}

function isBigWordCharacter(character: string) {
  return character.length > 0 && !isWhitespaceCharacter(character);
}

function nextClassifiedWordStartOffset(text: string, offset: number, isCharacter: WordClassifier) {
  let next = Math.max(0, Math.min(text.length, offset));

  while (next < text.length && isCharacter(text[next] ?? "")) next += 1;
  while (next < text.length && !isCharacter(text[next] ?? "")) next += 1;

  return next;
}

function nextClassifiedWordEndOffset(text: string, offset: number, isCharacter: WordClassifier) {
  let next = Math.max(0, Math.min(text.length - 1, offset));

  if (isCharacter(text[next] ?? "")) {
    while (next < text.length - 1 && isCharacter(text[next + 1] ?? "")) next += 1;
    return next;
  }

  while (next < text.length && !isCharacter(text[next] ?? "")) next += 1;
  while (next < text.length - 1 && isCharacter(text[next + 1] ?? "")) next += 1;

  return Math.max(0, Math.min(text.length - 1, next));
}

function previousClassifiedWordStartOffset(text: string, offset: number, isCharacter: WordClassifier) {
  let previous = Math.max(0, Math.min(text.length, offset) - 1);

  while (previous > 0 && !isCharacter(text[previous] ?? "")) previous -= 1;
  while (previous > 0 && isCharacter(text[previous - 1] ?? "")) previous -= 1;

  return previous;
}

function previousClassifiedWordEndOffset(text: string, offset: number, isCharacter: WordClassifier) {
  let previous = Math.max(0, Math.min(text.length, offset) - 1);

  while (previous > 0 && !isCharacter(text[previous] ?? "")) previous -= 1;
  if (previous > 0 && isCharacter(text[previous] ?? "")) return previous;

  return 0;
}

function firstClassifiedWordStartOffset(text: string, isCharacter: WordClassifier) {
  for (let offset = 0; offset < text.length; offset += 1) {
    if (isCharacter(text[offset] ?? "")) return offset;
  }

  return null;
}

function lastClassifiedWordStartOffset(text: string, isCharacter: WordClassifier) {
  let offset = text.length - 1;

  while (offset > 0 && !isCharacter(text[offset] ?? "")) offset -= 1;
  if (!isCharacter(text[offset] ?? "")) return null;

  while (offset > 0 && isCharacter(text[offset - 1] ?? "")) offset -= 1;
  return offset;
}

function wordRangeAtOffset(text: string, offset: number) {
  if (text.length === 0) return null;

  let cursor = Math.max(0, Math.min(text.length - 1, offset));
  if (!isWordCharacter(text[cursor] ?? "") && cursor > 0 && isWordCharacter(text[cursor - 1] ?? "")) {
    cursor -= 1;
  }
  if (!isWordCharacter(text[cursor] ?? "")) return null;

  let start = cursor;
  let end = cursor + 1;

  while (start > 0 && isWordCharacter(text[start - 1] ?? "")) start -= 1;
  while (end < text.length && isWordCharacter(text[end] ?? "")) end += 1;

  return { end, start };
}

function nextWordRange(text: string, offset: number) {
  let cursor = Math.max(0, Math.min(text.length, offset));

  while (cursor < text.length && !isWordCharacter(text[cursor] ?? "")) cursor += 1;
  return cursor < text.length ? wordRangeAtOffset(text, cursor) : null;
}

function wordTextObjectRange(state: EditorState, scope: VimTextObjectScope, count: number) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const offset = Math.max(0, Math.min(range.text.length, state.selection.from - range.start));
  const wordRange = wordRangeAtOffset(range.text, offset);
  if (!wordRange) return null;

  let end = wordRange.end;
  for (let index = 1; index < Math.max(1, count); index += 1) {
    const next = nextWordRange(range.text, end);
    if (!next) break;
    end = next.end;
  }

  let start = wordRange.start;
  if (scope === "around") {
    const contentEnd = end;
    while (end < range.text.length && isWhitespaceCharacter(range.text[end] ?? "")) end += 1;
    if (end === contentEnd) {
      while (start > 0 && isWhitespaceCharacter(range.text[start - 1] ?? "")) start -= 1;
    }
  }

  return {
    end: range.start + end,
    start: range.start + start
  };
}

function nextDelimiterOffset(text: string, delimiter: VimQuoteTextObjectKey, from: number) {
  for (let offset = Math.max(0, from); offset < text.length; offset += 1) {
    if (text[offset] === delimiter) return offset;
  }

  return null;
}

function previousDelimiterOffset(text: string, delimiter: VimQuoteTextObjectKey, from: number) {
  for (let offset = Math.min(text.length - 1, from); offset >= 0; offset -= 1) {
    if (text[offset] === delimiter) return offset;
  }

  return null;
}

function quoteTextObjectRange(state: EditorState, scope: VimTextObjectScope, delimiter: VimQuoteTextObjectKey) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const offset = Math.max(0, Math.min(range.text.length - 1, state.selection.from - range.start));
  const startDelimiter = previousDelimiterOffset(range.text, delimiter, offset);
  if (startDelimiter === null) return null;

  const endDelimiter = nextDelimiterOffset(range.text, delimiter, startDelimiter + 1);
  if (endDelimiter === null) return null;

  const start = scope === "inner" ? startDelimiter + 1 : startDelimiter;
  const end = scope === "inner" ? endDelimiter : endDelimiter + 1;
  if (start > end) return null;

  return {
    end: range.start + end,
    start: range.start + start
  };
}

function enclosingPairOffsets(text: string, delimiters: VimPairDelimiters, offset: number) {
  const stack: number[] = [];
  let enclosing: { end: number; start: number } | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === delimiters.open) {
      stack.push(index);
      continue;
    }

    if (character !== delimiters.close) continue;

    const start = stack.pop();
    if (start === undefined) continue;
    if (start > offset || index < offset) continue;

    if (!enclosing || index - start < enclosing.end - enclosing.start) {
      enclosing = { end: index, start };
    }
  }

  return enclosing;
}

function matchingPairOffset(text: string, offset: number) {
  const character = text[offset] ?? "";
  const delimiters = pairDelimitersAtCharacter(character);
  if (!delimiters) return null;

  if (character === delimiters.open) {
    let depth = 0;
    for (let index = offset; index < text.length; index += 1) {
      if (text[index] === delimiters.open) depth += 1;
      else if (text[index] === delimiters.close) depth -= 1;

      if (depth === 0) return index;
    }

    return null;
  }

  let depth = 0;
  for (let index = offset; index >= 0; index -= 1) {
    if (text[index] === delimiters.close) depth += 1;
    else if (text[index] === delimiters.open) depth -= 1;

    if (depth === 0) return index;
  }

  return null;
}

function matchingPairPosition(state: EditorState) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const offset = Math.max(0, Math.min(range.text.length - 1, state.selection.from - range.start));
  const targetOffset = matchingPairOffset(range.text, offset);
  return targetOffset === null ? null : range.start + targetOffset;
}

function pairTextObjectRange(state: EditorState, scope: VimTextObjectScope, key: VimPairTextObjectKey) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const offset = Math.max(0, Math.min(range.text.length - 1, state.selection.from - range.start));
  const pair = enclosingPairOffsets(range.text, pairDelimitersFromKey(key), offset);
  if (!pair) return null;

  const start = scope === "inner" ? pair.start + 1 : pair.start;
  const end = scope === "inner" ? pair.end : pair.end + 1;
  if (start > end) return null;

  return {
    end: range.start + end,
    start: range.start + start
  };
}

function nextWordStartOffset(text: string, offset: number) {
  return nextClassifiedWordStartOffset(text, offset, isWordCharacter);
}

function nextBigWordStartOffset(text: string, offset: number) {
  return nextClassifiedWordStartOffset(text, offset, isBigWordCharacter);
}

function nextWordEndOffset(text: string, offset: number) {
  return nextClassifiedWordEndOffset(text, offset, isWordCharacter);
}

function nextBigWordEndOffset(text: string, offset: number) {
  return nextClassifiedWordEndOffset(text, offset, isBigWordCharacter);
}

function previousWordStartOffset(text: string, offset: number) {
  return previousClassifiedWordStartOffset(text, offset, isWordCharacter);
}

function previousBigWordStartOffset(text: string, offset: number) {
  return previousClassifiedWordStartOffset(text, offset, isBigWordCharacter);
}

function previousWordEndOffset(text: string, offset: number) {
  return previousClassifiedWordEndOffset(text, offset, isWordCharacter);
}

function previousBigWordEndOffset(text: string, offset: number) {
  return previousClassifiedWordEndOffset(text, offset, isBigWordCharacter);
}

function firstWordStartOffset(text: string) {
  return firstClassifiedWordStartOffset(text, isWordCharacter);
}

function firstBigWordStartOffset(text: string) {
  return firstClassifiedWordStartOffset(text, isBigWordCharacter);
}

function lastWordStartOffset(text: string) {
  return lastClassifiedWordStartOffset(text, isWordCharacter);
}

function lastBigWordStartOffset(text: string) {
  return lastClassifiedWordStartOffset(text, isBigWordCharacter);
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

function bigWordMotionOffset(text: string, offset: number, direction: "end" | "backward-end", count: number) {
  let next = offset;

  for (let index = 0; index < count; index += 1) {
    next = direction === "end"
      ? nextBigWordEndOffset(text, next)
      : previousBigWordEndOffset(text, next);
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

function nextTextblockBigWordStart(ranges: readonly TextblockRange[], currentIndex: number) {
  for (let index = currentIndex + 1; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (!range) continue;

    const offset = firstBigWordStartOffset(range.text);
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

function previousTextblockBigWordStart(ranges: readonly TextblockRange[], currentIndex: number) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (!range) continue;

    const offset = lastBigWordStartOffset(range.text);
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

function bigWordStartMotionPosition(
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
      const targetOffset = nextBigWordStartOffset(range.text, offset);
      if (targetOffset < range.text.length) {
        position = range.start + targetOffset;
        continue;
      }

      const next = nextTextblockBigWordStart(ranges, currentIndex);
      if (!next) return finalForwardTarget === "boundary" ? range.end : normalTextblockEnd(range);

      currentIndex = next.index;
      position = next.position;
      continue;
    }

    const targetOffset = previousBigWordStartOffset(range.text, offset);
    if (targetOffset < offset) {
      position = range.start + targetOffset;
      continue;
    }

    const previous = previousTextblockBigWordStart(ranges, currentIndex);
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

function moveByBigWord(view: EditorView, direction: "forward" | "end" | "backward" | "backward-end", count = 1) {
  if (direction === "forward" || direction === "backward") {
    const target = bigWordStartMotionPosition(view.state, direction, count);
    if (target === null) return false;

    return moveSelection(view, target, direction === "backward" ? -1 : 1);
  }

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const offset = Math.max(0, Math.min(range.text.length, view.state.selection.from - range.start));
  const targetOffset = bigWordMotionOffset(range.text, offset, direction, count);
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

function deletePreviousCharacter(view: EditorView, count = 1) {
  if (!selectionIsTextSelection(view.state)) return false;

  const range = currentTextblockRange(view.state);
  if (!range || view.state.selection.from <= range.start) return false;

  const end = view.state.selection.from;
  const start = Math.max(range.start, end - count);
  const text = view.state.doc.textBetween(start, end, "\n");
  const transaction = view.state.tr.delete(start, end);
  const selectionPosition = Math.min(start, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ register: { kind: "text", text } })
  );
  return true;
}

function replaceCharacters(view: EditorView, character: string, count = 1) {
  if (!selectionIsTextSelection(view.state) || character.length !== 1) return false;

  const range = currentTextblockRange(view.state);
  if (!range || view.state.selection.from >= range.end) return false;

  const from = view.state.selection.from;
  const to = Math.min(range.end, from + count);
  const replacement = character.repeat(to - from);
  const transaction = view.state.tr.insertText(replacement, from, to);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(from), 1)),
    clearedInputMeta()
  );
  return true;
}

function substituteCharacters(view: EditorView, count = 1) {
  const range = currentTextblockRange(view.state);
  if (!range || view.state.selection.from >= range.end) return false;

  const from = view.state.selection.from;
  const to = Math.min(range.end, from + count);
  return changeRange(view, from, to);
}

function operateToTextblockEnd(view: EditorView, operator: VimOperator) {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const from = view.state.selection.from;
  if (from >= range.end) return false;

  return operator === "change"
    ? changeRange(view, from, range.end)
    : deleteRange(view, from, range.end);
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

function selectedTextblocksBetween(state: EditorState, anchor: number, cursor: number) {
  const ranges = textblockRanges(state);
  if (ranges.length === 0) return null;

  const anchorIndex = nearestTextblockIndex(ranges, anchor);
  const cursorIndex = nearestTextblockIndex(ranges, cursor);
  const startIndex = Math.min(anchorIndex, cursorIndex);
  const endIndex = Math.max(anchorIndex, cursorIndex);
  return {
    endIndex,
    ranges,
    selected: ranges.slice(startIndex, endIndex + 1),
    startIndex
  };
}

function textblockSelectionBounds(selection: ReturnType<typeof selectedTextblocks>) {
  if (!selection || selection.selected.length === 0) return false;

  const from = selection.selected[0]?.before;
  const to = selection.selected[selection.selected.length - 1]?.after;
  if (from === undefined || to === undefined) return false;

  return { from, to };
}

function deleteTextblockSelection(view: EditorView, selection: ReturnType<typeof selectedTextblocks>) {
  const bounds = textblockSelectionBounds(selection);
  if (!bounds || !selection) return false;

  const texts = selection.selected.map((range) => range.text);
  const replacement = bounds.from === 0 && bounds.to >= view.state.doc.content.size ? emptyParagraph(view.state) : null;
  const transaction = replacement
    ? view.state.tr.replaceWith(bounds.from, bounds.to, replacement)
    : view.state.tr.delete(bounds.from, bounds.to);
  const selectionPosition = Math.min(bounds.from, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ mode: "normal", register: { kind: "line", texts } })
  );
  return true;
}

function changeTextblockSelection(view: EditorView, selection: ReturnType<typeof selectedTextblocks>) {
  const replacement = emptyParagraph(view.state);
  const bounds = textblockSelectionBounds(selection);
  if (!selection || !bounds || !replacement) return false;

  const texts = selection.selected.map((range) => range.text);
  const transaction = view.state.tr.replaceWith(bounds.from, bounds.to, replacement);
  const selectionPosition = Math.min(bounds.from + 1, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ lastChangeKeys: null, mode: "insert", register: { kind: "line", texts } })
  );
  return true;
}

function deleteCurrentTextblock(view: EditorView, count = 1) {
  return deleteTextblockSelection(view, selectedTextblocks(view.state, count));
}

function changeCurrentTextblock(view: EditorView, count = 1) {
  return changeTextblockSelection(view, selectedTextblocks(view.state, count));
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
    clearedInputMeta({ lastChangeKeys: null, mode: "insert" })
  );
  return true;
}

function textRange(view: EditorView, from: number, to: number) {
  return view.state.doc.textBetween(Math.min(from, to), Math.max(from, to), "\n");
}

function deleteRange(view: EditorView, from: number, to: number, meta: VimModeMeta = {}) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  dispatchTransaction(
    view,
    view.state.tr.delete(start, end),
    clearedInputMeta({ ...meta, register: { kind: "text", text: textRange(view, start, end) } })
  );
  return true;
}

function changeRange(view: EditorView, from: number, to: number, meta: VimModeMeta = {}) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  const text = textRange(view, start, end);
  const transaction = view.state.tr.delete(start, end);
  const selectionPosition = Math.min(start, transaction.doc.content.size);
  dispatchTransaction(
    view,
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1)),
    clearedInputMeta({ ...meta, lastChangeKeys: null, mode: "insert", register: { kind: "text", text } })
  );
  return true;
}

function yankRange(view: EditorView, from: number, to: number, meta: VimModeMeta = {}) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return false;

  dispatchMeta(view, clearedInputMeta({ ...meta, register: { kind: "text", text: textRange(view, start, end) } }));
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

function repeatableChangeStartKeys(state: VimModeState, key: string) {
  if (state.pendingChangeKeys) return [...state.pendingChangeKeys, key];
  // Insert-text changes need typed text capture before they can be faithfully replayed.
  if (
    key !== "A" &&
    key !== "C" &&
    key !== "D" &&
    key !== "I" &&
    key !== "J" &&
    key !== "O" &&
    key !== "P" &&
    key !== "S" &&
    key !== "X" &&
    key !== "a" &&
    key !== "c" &&
    key !== "d" &&
    key !== "i" &&
    key !== "o" &&
    key !== "p" &&
    key !== "r" &&
    key !== "s" &&
    key !== "x"
  ) {
    return null;
  }

  return [...state.count, key];
}

function changeIsWaitingForMoreKeys(state: VimModeState | undefined) {
  return Boolean(state?.operator || state?.pending);
}

function recordRepeatableChange(view: EditorView, previousState: VimModeState, key: string, previousDoc: ProseNode) {
  const changeKeys = repeatableChangeStartKeys(previousState, key);
  if (!changeKeys) return;

  const nextState = vimModeKey.getState(view.state);
  if (view.state.doc !== previousDoc) {
    if (nextState?.mode === "insert") {
      dispatchMeta(view, {
        lastChangeKeys: null,
        lastChangeText: null,
        pendingChangeKeys: null,
        pendingInsertChangeKeys: changeKeys,
        pendingInsertText: ""
      });
      return;
    }

    dispatchMeta(view, { lastChangeKeys: changeKeys, lastChangeText: null, pendingChangeKeys: null });
    return;
  }

  if (nextState?.mode === "insert") {
    dispatchMeta(view, {
      lastChangeKeys: null,
      lastChangeText: null,
      pendingChangeKeys: null,
      pendingInsertChangeKeys: changeKeys,
      pendingInsertText: ""
    });
    return;
  }

  dispatchMeta(view, {
    pendingChangeKeys: changeIsWaitingForMoreKeys(nextState) ? changeKeys : null
  });
}

function repeatLastChange(view: EditorView, keys: readonly string[], text: string | null) {
  if (keys.length === 0) return false;

  for (const key of keys) {
    const state = vimModeKey.getState(view.state) ?? initialVimModeState();
    if (state.mode !== "normal") return false;
    if (!handleNormalModeKey(view, key, state)) return false;
  }

  if (text !== null) {
    const state = vimModeKey.getState(view.state);
    if (state?.mode !== "insert") return false;

    const { from, to } = view.state.selection;
    const transaction = view.state.tr.insertText(text, from, to);
    const position = Math.max(from, from + text.length - 1);
    dispatchTransaction(
      view,
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(position), 1)),
      clearedInputMeta({ lastChangeKeys: keys, lastChangeText: text, mode: "normal", register: state.register })
    );
    return true;
  }

  dispatchMeta(view, { lastChangeKeys: keys, lastChangeText: null, pendingChangeKeys: null });
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
    clearedInputMeta({ lastChangeKeys: null, mode: "insert" })
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
    clearedInputMeta({ lastChangeKeys: null, mode: "insert" })
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

function stateWithCursorAt(state: EditorState, position: number) {
  const clamped = Math.max(0, Math.min(state.doc.content.size, position));
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(clamped), 1)));
}

function resolveMotionTarget(state: EditorState, key: string, count: number, prefix: string | null = null) {
  const range = currentTextblockRange(state);
  if (!range) return null;

  const current = state.selection.from;
  const offset = Math.max(0, Math.min(range.text.length, current - range.start));

  if (prefix === "g" && key === "e") {
    return range.start + wordMotionOffset(range.text, offset, "backward-end", count);
  }
  if (prefix === "g" && key === "E") {
    return range.start + bigWordMotionOffset(range.text, offset, "backward-end", count);
  }

  switch (key) {
    case "h":
    case "ArrowLeft":
      return Math.max(range.start, current - count);
    case "l":
    case "ArrowRight":
      return Math.min(normalTextblockEnd(range), current + count);
    case "w":
      return wordStartMotionPosition(state, "forward", count, "boundary");
    case "W":
      return bigWordStartMotionPosition(state, "forward", count, "boundary");
    case "e":
      return Math.min(normalTextblockEnd(range), range.start + wordMotionOffset(range.text, offset, "end", count));
    case "E":
      return Math.min(normalTextblockEnd(range), range.start + bigWordMotionOffset(range.text, offset, "end", count));
    case "b":
      return wordStartMotionPosition(state, "backward", count);
    case "B":
      return bigWordStartMotionPosition(state, "backward", count);
    case "%":
      return matchingPairPosition(state);
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
  if (operator.type !== "change" || prefix !== null || count !== 1) return false;
  if (key !== "w" && key !== "W") return false;

  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const offset = view.state.selection.from - range.start;
  const character = range.text[offset] ?? "";
  return key === "w" ? isWordCharacter(character) : isBigWordCharacter(character);
}

function operateRange(view: EditorView, operator: PendingOperator, key: string, state: VimModeState, prefix: string | null = null) {
  const count = operator.count * readCount(state);
  const changeCurrentWord = shouldChangeCurrentWord(view, operator, key, count, prefix);
  let motionKey = key;
  if (changeCurrentWord) motionKey = key === "W" ? "E" : "e";

  const target = resolveMotionTarget(view.state, motionKey, count, prefix);
  if (target === null) return false;

  let from = view.state.selection.from;
  let to = (key === "e" || key === "E" || changeCurrentWord) && target >= from
    ? Math.min(view.state.doc.content.size, target + 1)
    : target;
  if (key === "%") {
    from = Math.min(view.state.selection.from, target);
    to = Math.min(view.state.doc.content.size, Math.max(view.state.selection.from, target) + 1);
  }
  if (operator.type === "change") return changeRange(view, from, to);
  return operator.type === "delete" ? deleteRange(view, from, to) : yankRange(view, from, to);
}

function operateCharacterFind(
  view: EditorView,
  operator: PendingOperator,
  find: VimCharacterFind,
  count: number,
  meta: VimModeMeta = {}
) {
  const target = characterFindTarget(view.state, find, count);
  if (target === null) {
    dispatchMeta(view, clearedInputMeta(meta));
    return true;
  }

  const from = view.state.selection.from;
  const to = find.direction === "forward" && target >= from
    ? Math.min(view.state.doc.content.size, target + 1)
    : target;

  if (operator.type === "change") return changeRange(view, from, to, meta);
  return operator.type === "delete" ? deleteRange(view, from, to, meta) : yankRange(view, from, to, meta);
}

function handlePendingOperatorFind(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  const pending = state.pending;
  if (!operator || !pending || !isFindKey(pending)) return false;

  if (key.length !== 1) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const find = characterFindFromKey(pending, key);
  return operateCharacterFind(
    view,
    operator,
    find,
    operator.count * readCount(state),
    { lastFind: find }
  );
}

function handleRepeatedOperatorFind(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  if (!operator || !state.lastFind) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const find = key === "," ? reversedCharacterFind(state.lastFind) : state.lastFind;
  return operateCharacterFind(view, operator, find, operator.count * readCount(state));
}

function textObjectRange(state: EditorState, scope: VimTextObjectScope, key: string, count: number) {
  if (key === "w") return wordTextObjectRange(state, scope, count);
  if (isQuoteTextObjectKey(key)) return quoteTextObjectRange(state, scope, key);
  if (isPairTextObjectKey(key)) return pairTextObjectRange(state, scope, key);

  return null;
}

function operateTextObject(
  view: EditorView,
  operator: PendingOperator,
  scope: VimTextObjectScope,
  key: string,
  count: number
) {
  const range = textObjectRange(view.state, scope, key, count);

  if (!range) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  if (operator.type === "change") return changeRange(view, range.start, range.end);
  return operator.type === "delete"
    ? deleteRange(view, range.start, range.end)
    : yankRange(view, range.start, range.end);
}

function handlePendingOperatorTextObject(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  const pending = state.pending;
  if (!operator || !isTextObjectPending(pending)) return false;

  return operateTextObject(
    view,
    operator,
    textObjectScopeFromPending(pending),
    key,
    operator.count * readCount(state)
  );
}

function handlePendingNormalFind(view: EditorView, key: string, state: VimModeState) {
  const pending = state.pending;
  if (!pending || !isFindKey(pending)) return false;

  if (key.length !== 1) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const find = characterFindFromKey(pending, key);
  return moveByCharacterFind(view, find, readCount(state), { lastFind: find });
}

function handleRepeatedNormalFind(view: EditorView, key: string, state: VimModeState) {
  if (!state.lastFind) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const find = key === "," ? reversedCharacterFind(state.lastFind) : state.lastFind;
  return moveByCharacterFind(view, find, readCount(state));
}

function handlePendingSearch(view: EditorView, key: string, state: VimModeState) {
  const pending = state.pending;
  if (!isSearchPending(pending)) return false;

  if (key === "Escape") {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  if (key === "Backspace") {
    dispatchMeta(view, { searchQuery: state.searchQuery.slice(0, -1) });
    return true;
  }

  if (key === "Enter") {
    const query = state.searchQuery;
    if (query.length === 0) {
      dispatchMeta(view, clearedInputMeta());
      return true;
    }

    return moveBySearch(view, {
      direction: searchDirectionFromPending(pending),
      query
    });
  }

  if (key.length === 1) {
    dispatchMeta(view, { searchQuery: `${state.searchQuery}${key}` });
    return true;
  }

  return true;
}

function handlePendingOperatorSearch(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  const pending = state.pending;
  if (!operator || !isSearchPending(pending)) return false;

  if (key === "Escape") {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  if (key === "Backspace") {
    dispatchMeta(view, { searchQuery: state.searchQuery.slice(0, -1) });
    return true;
  }

  if (key === "Enter") {
    const query = state.searchQuery;
    if (query.length === 0) {
      dispatchMeta(view, clearedInputMeta());
      return true;
    }

    const search = {
      direction: searchDirectionFromPending(pending),
      query
    } satisfies VimSearch;
    return operateSearch(view, operator, search, operator.count * readCount(state));
  }

  if (key.length === 1) {
    dispatchMeta(view, { searchQuery: `${state.searchQuery}${key}` });
    return true;
  }

  return true;
}

function repeatSearch(view: EditorView, state: VimModeState, count: number, reversed: boolean) {
  if (!state.lastSearch) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const search = reversed ? reversedSearch(state.lastSearch) : state.lastSearch;
  return moveBySearch(view, search, count, state.lastSearch);
}

function repeatOperatorSearch(view: EditorView, state: VimModeState, reversed: boolean) {
  const operator = state.operator;
  if (!operator || !state.lastSearch) {
    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  const search = reversed ? reversedSearch(state.lastSearch) : state.lastSearch;
  return operateSearch(view, operator, search, operator.count * readCount(state), state.lastSearch);
}

function enterVisualMode(view: EditorView, state: VimModeState) {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  const cursor = Math.min(normalTextblockEnd(range), view.state.selection.from);
  return moveVisualSelectionWithMeta(view, cursor, cursor, "character", { register: state.register });
}

function enterVisualLineMode(view: EditorView, state: VimModeState) {
  const range = currentTextblockRange(view.state);
  if (!range) return false;

  return moveVisualSelectionWithMeta(view, range.start, range.start, "line", { register: state.register });
}

function moveVisualSelectionWithMeta(
  view: EditorView,
  anchor: number,
  cursor: number,
  kind: VimVisualKind,
  meta: VimModeMeta = {}
) {
  const selection = visualSelectionForKind(view.state, kind, anchor, cursor);
  if (!selection) return false;

  dispatchTransaction(
    view,
    view.state.tr.setSelection(selection),
    clearedInputMeta({ ...meta, mode: "visual", visualAnchor: anchor, visualCursor: cursor, visualKind: kind })
  );
  return true;
}

function collapseVisualSelection(view: EditorView, state: VimModeState) {
  const selection = view.state.selection;
  if (!(selection instanceof TextSelection)) return false;

  const target = state.visualCursor ?? visualCursorPosition(selection, state.visualAnchor ?? selection.from);
  dispatchTransaction(
    view,
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target), 1)),
    clearedInputMeta({ mode: "normal", register: state.register })
  );
  return true;
}

function visualSelectionRange(view: EditorView, state: VimModeState) {
  if (state.visualKind === "line") {
    const selection = visualLineTextblocks(view.state, state);
    const bounds = textblockSelectionBounds(selection);
    return bounds ? { ...bounds, kind: "line" as const, selection } : null;
  }

  const selection = view.state.selection;
  if (!(selection instanceof TextSelection) || selection.empty) return null;

  return { from: selection.from, kind: "character" as const, to: selection.to };
}

function visualLineTextblocks(state: EditorState, vimState: VimModeState) {
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return null;

  const anchor = vimState.visualAnchor ?? selection.from;
  const cursor = vimState.visualCursor ?? visualCursorPosition(selection, anchor);
  return selectedTextblocksBetween(state, anchor, cursor);
}

function yankVisualSelection(view: EditorView, state: VimModeState) {
  const range = visualSelectionRange(view, state);
  if (!range) return collapseVisualSelection(view, state);

  if (range.kind === "line") {
    const selection = range.selection;
    if (!selection || selection.selected.length === 0) return false;

    dispatchTransaction(
      view,
      view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(range.from), 1)),
      clearedInputMeta({
        mode: "normal",
        register: { kind: "line", texts: selection.selected.map((textblock) => textblock.text) }
      })
    );
    return true;
  }

  const text = textRange(view, range.from, range.to);
  dispatchTransaction(
    view,
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(range.from), 1)),
    clearedInputMeta({ mode: "normal", register: { kind: "text", text } })
  );
  return true;
}

function deleteVisualSelection(view: EditorView, state: VimModeState) {
  const range = visualSelectionRange(view, state);
  if (!range) return false;

  if (range.kind === "line") return deleteTextblockSelection(view, range.selection);

  return deleteRange(view, range.from, range.to, { mode: "normal" });
}

function changeVisualSelection(view: EditorView, state: VimModeState) {
  const range = visualSelectionRange(view, state);
  if (!range) return false;

  if (range.kind === "line") return changeTextblockSelection(view, range.selection);

  return changeRange(view, range.from, range.to);
}

function visualMotionTarget(state: EditorState, key: string, count: number, prefix: string | null = null) {
  if (key === "$") {
    const range = currentTextblockRange(state);
    return range ? normalTextblockEnd(range) : null;
  }

  return resolveMotionTarget(state, key, count, prefix);
}

function visualLineMotionTarget(state: EditorState, cursor: number, delta: -1 | 1, count: number) {
  const ranges = textblockRanges(state);
  if (ranges.length === 0) return null;

  const currentIndex = nearestTextblockIndex(ranges, cursor);
  const targetIndex = Math.max(0, Math.min(ranges.length - 1, currentIndex + delta * count));
  return ranges[targetIndex]?.start ?? null;
}

function extendVisualSelection(view: EditorView, key: string, state: VimModeState, prefix: string | null = null) {
  const selection = view.state.selection;
  if (!(selection instanceof TextSelection)) return false;

  const anchor = state.visualAnchor ?? selection.from;
  const cursor = state.visualCursor ?? visualCursorPosition(selection, anchor);
  const kind = state.visualKind ?? "character";
  const count = readCount(state);
  const lineDelta = key === "j" || key === "ArrowDown" ? 1 : key === "k" || key === "ArrowUp" ? -1 : null;
  const target = kind === "line" && lineDelta !== null
    ? visualLineMotionTarget(view.state, cursor, lineDelta, count)
    : visualMotionTarget(stateWithCursorAt(view.state, cursor), key, count, prefix);
  if (target === null) return true;

  return moveVisualSelection(view, anchor, target, kind);
}

function handleVisualModeKey(view: EditorView, key: string, state: VimModeState) {
  if (keyStartsOrContinuesCount(key, state)) return appendCount(view, key, state);

  if (state.pending === "g") {
    if (key === "e") return extendVisualSelection(view, key, state, "g");
    if (key === "E") return extendVisualSelection(view, key, state, "g");

    dispatchMeta(
      view,
      clearedInputMeta({
        mode: "visual",
        visualAnchor: state.visualAnchor,
        visualCursor: state.visualCursor,
        visualKind: state.visualKind
      })
    );
    return true;
  }

  switch (key) {
    case "v":
      return collapseVisualSelection(view, state);
    case "V": {
      const selection = view.state.selection;
      if (!(selection instanceof TextSelection)) return false;
      const anchor = state.visualAnchor ?? selection.from;
      const cursor = state.visualCursor ?? visualCursorPosition(selection, anchor);
      return state.visualKind === "line"
        ? collapseVisualSelection(view, state)
        : moveVisualSelectionWithMeta(view, anchor, cursor, "line", { register: state.register });
    }
    case "y":
      return yankVisualSelection(view, state);
    case "d":
    case "x":
      return deleteVisualSelection(view, state);
    case "Backspace":
    case "Delete":
    case "Enter":
      return true;
    case "c":
      return changeVisualSelection(view, state);
    case "g":
      dispatchMeta(view, { pending: "g" });
      return true;
    case "h":
    case "ArrowLeft":
    case "l":
    case "ArrowRight":
    case "j":
    case "ArrowDown":
    case "k":
    case "ArrowUp":
    case "w":
    case "W":
    case "e":
    case "E":
    case "b":
    case "B":
    case "%":
    case "0":
    case "^":
    case "$":
      return extendVisualSelection(view, key, state);
    default:
      return key.length === 1;
  }
}

function handleOperatorKey(view: EditorView, key: string, state: VimModeState) {
  const operator = state.operator;
  if (!operator) return false;

  if (isFindKey(state.pending ?? "")) return handlePendingOperatorFind(view, key, state);
  if (isSearchPending(state.pending)) return handlePendingOperatorSearch(view, key, state);
  if (isTextObjectPending(state.pending)) return handlePendingOperatorTextObject(view, key, state);

  if (keyStartsOrContinuesCount(key, state)) return appendCount(view, key, state);

  if (operator.type === "delete" && key === "d") return deleteCurrentTextblock(view, operator.count * readCount(state));
  if (operator.type === "yank" && key === "y") return yankCurrentTextblock(view, operator.count * readCount(state));
  if (operator.type === "change" && key === "c") return changeCurrentTextblock(view, operator.count * readCount(state));

  if (state.pending === "g") {
    if (key === "e") return operateRange(view, operator, key, state, "g");
    if (key === "E") return operateRange(view, operator, key, state, "g");

    dispatchMeta(view, clearedInputMeta());
    return true;
  }

  if (key === "g") {
    dispatchMeta(view, { pending: "g" });
    return true;
  }

  if (isFindKey(key)) {
    dispatchMeta(view, { pending: key });
    return true;
  }

  if (key === "/") {
    dispatchMeta(view, { pending: "search-forward", searchQuery: "" });
    return true;
  }

  if (key === "?") {
    dispatchMeta(view, { pending: "search-backward", searchQuery: "" });
    return true;
  }

  if (key === ";" || key === ",") return handleRepeatedOperatorFind(view, key, state);
  if (key === "n") return repeatOperatorSearch(view, state, false);
  if (key === "N") return repeatOperatorSearch(view, state, true);

  if (key === "i" || key === "a") {
    dispatchMeta(view, { pending: key === "i" ? "text-object-inner" : "text-object-around" });
    return true;
  }

  if (operateRange(view, operator, key, state)) return true;

  dispatchMeta(view, clearedInputMeta());
  return true;
}

function handleNormalModeKey(view: EditorView, key: string, state: VimModeState) {
  if (state.operator) return handleOperatorKey(view, key, state);

  if (state.pending === "r") return replaceCharacters(view, key, readCount(state));
  if (isFindKey(state.pending ?? "")) return handlePendingNormalFind(view, key, state);
  if (isSearchPending(state.pending)) return handlePendingSearch(view, key, state);

  if (keyStartsOrContinuesCount(key, state)) return appendCount(view, key, state);

  const count = readCount(state);

  if (state.pending === "g") {
    if (key === "g") return lineMotion(view, "first", count);
    if (key === "e") return moveByWord(view, "backward-end", count);
    if (key === "E") return moveByBigWord(view, "backward-end", count);

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
    case "J":
      return joinTextblocks(view, count);
    case "Backspace":
    case "Delete":
    case "Enter":
      return true;
    case "w":
      return moveByWord(view, "forward", count);
    case "W":
      return moveByBigWord(view, "forward", count);
    case "e":
      return moveByWord(view, "end", count);
    case "E":
      return moveByBigWord(view, "end", count);
    case "b":
      return moveByWord(view, "backward", count);
    case "B":
      return moveByBigWord(view, "backward", count);
    case "%":
      return moveSelection(view, matchingPairPosition(view.state) ?? view.state.selection.from, 1);
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
    case "/":
      dispatchMeta(view, { pending: "search-forward", searchQuery: "" });
      return true;
    case "?":
      dispatchMeta(view, { pending: "search-backward", searchQuery: "" });
      return true;
    case "f":
    case "F":
    case "t":
    case "T":
      dispatchMeta(view, { pending: key });
      return true;
    case ";":
    case ",":
      return handleRepeatedNormalFind(view, key, state);
    case "n":
      return repeatSearch(view, state, count, false);
    case "N":
      return repeatSearch(view, state, count, true);
    case "v":
      return enterVisualMode(view, state);
    case "V":
      return enterVisualLineMode(view, state);
    case "d":
      return beginOperator(view, "delete", state);
    case "y":
      return beginOperator(view, "yank", state);
    case "Y":
      return yankCurrentTextblock(view, count);
    case "c":
      return beginOperator(view, "change", state);
    case "D":
      return operateToTextblockEnd(view, "delete");
    case "C":
      return operateToTextblockEnd(view, "change");
    case "p":
      return pasteRegister(view, "after", count, state.register);
    case "P":
      return pasteRegister(view, "before", count, state.register);
    case "u": {
      const handled = undo(view.state, view.dispatch);
      if (handled) view.focus();
      return handled;
    }
    case "X":
      return deletePreviousCharacter(view, count);
    case "x":
      return deleteCharacter(view, count);
    case "r":
      dispatchMeta(view, { pending: "r" });
      return true;
    case "s":
      return substituteCharacters(view, count);
    case "S":
      return changeCurrentTextblock(view, count);
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
        if (state.mode === "insert") return false;

        if (hasCommandModifier(event)) {
          if (state.mode !== "normal") return false;

          const handled = handleNormalModeModifiedKey(view, event);
          if (!handled) return false;

          event.preventDefault();
          return true;
        }

        if (state.mode === "normal" && event.key === ".") {
          const handled = state.lastChangeKeys ? repeatLastChange(view, state.lastChangeKeys, state.lastChangeText) : true;
          if (!handled) return false;

          event.preventDefault();
          return true;
        }

        const previousDoc = view.state.doc;
        const handled = state.mode === "visual"
          ? handleVisualModeKey(view, event.key, state)
          : handleNormalModeKey(view, event.key, state);
        if (!handled) return false;

        if (state.mode === "normal") recordRepeatableChange(view, state, event.key, previousDoc);

        event.preventDefault();
        return true;
      },
      handleTextInput: (view, _from, _to, text, insertText) => {
        if (!vimEnabled(options)) return false;

        const state = vimModeKey.getState(view.state);
        if (state?.mode === "insert" && state.pendingInsertChangeKeys) {
          dispatchTransaction(
            view,
            insertText(),
            { pendingInsertText: `${state.pendingInsertText}${text}` }
          );
          return true;
        }

        return state?.mode === "normal" || state?.mode === "visual";
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
