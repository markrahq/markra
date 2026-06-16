import type { Ctx } from "@milkdown/kit/ctx";
import { emphasisSchema, inlineCodeSchema, strongSchema } from "@milkdown/kit/preset/commonmark";
import { strikethroughSchema } from "@milkdown/kit/preset/gfm";
import type { Mark, MarkType, Node as ProseNode } from "@milkdown/kit/prose/model";
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export type LiveMarkdownKind = "strong" | "emphasis" | "inlineCode" | "strikethrough" | "highlight";

export type MarkraLiveMarkdownOptions = {
  highlight?: boolean;
  initialMarkdown?: string;
};

export type LiveMarkdownSpec = {
  markers: string[];
  pattern: RegExp;
  marks: LiveMarkdownMark[];
  kinds?: LiveMarkdownKind[];
};

export type LiveMarkdownMark = {
  kind: LiveMarkdownKind;
  markType: MarkType;
  getAttr?: (marker: string) => Record<string, unknown>;
};

type LiveMarkdownRange = {
  kinds: LiveMarkdownKind[];
  marker: string;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  content: string;
  marks: LiveMarkdownMark[];
};

type FoldedMarkdownRange = {
  marker: string;
  from: number;
  to: number;
  kinds: LiveMarkdownKind[];
};

type ActiveLiveMarkdownRange = {
  from: number;
  to: number;
};

// A suppressed range stays visually folded while the cursor is still near its source markers.
type SuppressedLiveMarkdownRange = ActiveLiveMarkdownRange & {
  cursor: number;
};

type SuppressedLiteralMarkdownRange = ActiveLiveMarkdownRange & {
  marker: string;
};

type ExitedFoldedMarkdownRange = FoldedMarkdownRange & {
  cursor: number;
};

type LiveMarkdownPluginState = {
  suppressActiveAt: number | null;
  activeFoldedRange: FoldedMarkdownRange | null;
  exitedFoldedRange: ExitedFoldedMarkdownRange | null;
  suppressedLiveRange: SuppressedLiveMarkdownRange | null;
  suppressedLiteralRanges: SuppressedLiteralMarkdownRange[];
};

const liveMarkdownKey = new PluginKey("markra-live-markdown");

function getLiveMarkdownKinds(spec: LiveMarkdownSpec) {
  return spec.kinds ?? spec.marks.map((mark) => mark.kind);
}

function overlaps(ranges: LiveMarkdownRange[], from: number, to: number) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function getLiveMarkdownRanges(text: string, specs: LiveMarkdownSpec[]) {
  const ranges: LiveMarkdownRange[] = [];

  for (const spec of specs) {
    spec.pattern.lastIndex = 0;

    for (const match of text.matchAll(spec.pattern)) {
      const matchedText = match[0];
      const from = match.index;
      const to = from + matchedText.length;

      if (overlaps(ranges, from, to)) continue;

      const marker = spec.markers.find((candidate) => matchedText.startsWith(candidate));
      if (!marker || !matchedText.endsWith(marker)) continue;

      const contentFrom = from + marker.length;
      const contentTo = to - marker.length;
      const content = text.slice(contentFrom, contentTo);
      // Empty pairs such as "~~~~" should remain editable placeholders until content is typed inside.
      if (content.length === 0) continue;

      ranges.push({
        kinds: getLiveMarkdownKinds(spec),
        marker,
        from,
        to,
        contentFrom,
        contentTo,
        content,
        marks: spec.marks
      });
    }
  }

  return ranges.sort((left, right) => left.from - right.from || right.to - left.to);
}

function escapedMarkerSource(marker: string) {
  return Array.from(marker).map((character) => `\\${character}`).join("");
}

function unescapeMarkdownPunctuation(text: string) {
  const escapable = new Set(Array.from(String.raw`!"#$%&'()*+,-./:;<=>?@[\]^_` + "`{|}~"));
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    if (character === "\\" && nextCharacter && escapable.has(nextCharacter)) {
      result += nextCharacter;
      index += 1;
      continue;
    }

    result += character;
  }

  return result;
}

function escapedLiteralMarkdownTexts(markdown: string, specs: LiveMarkdownSpec[]) {
  const literals: Array<{ marker: string; text: string }> = [];
  const seen = new Set<string>();
  const markers = [...new Set(specs.flatMap((spec) => spec.markers))].sort((left, right) => right.length - left.length);

  for (const marker of markers) {
    const escapedMarker = escapedMarkerSource(marker);
    let searchFrom = 0;

    while (searchFrom < markdown.length) {
      const openingStart = markdown.indexOf(escapedMarker, searchFrom);
      if (openingStart < 0) break;

      const openingEnd = openingStart + escapedMarker.length;
      const lineEnd = markdown.indexOf("\n", openingEnd);
      const closingLimit = lineEnd < 0 ? markdown.length : lineEnd;
      const closingStart = markdown.indexOf(escapedMarker, openingEnd);

      if (closingStart < 0 || closingStart > closingLimit) {
        searchFrom = openingEnd;
        continue;
      }

      const content = unescapeMarkdownPunctuation(markdown.slice(openingEnd, closingStart));
      if (content.length > 0) {
        const text = `${marker}${content}${marker}`;
        const key = `${marker}\n${text}`;
        if (!seen.has(key)) {
          seen.add(key);
          literals.push({ marker, text });
        }
      }
      searchFrom = closingStart + escapedMarker.length;
    }
  }

  return literals;
}

function findSuppressedLiteralRanges(
  doc: ProseNode,
  specs: LiveMarkdownSpec[],
  initialMarkdown: string | undefined
) {
  if (!initialMarkdown) return [];

  const literals = escapedLiteralMarkdownTexts(initialMarkdown, specs);
  if (literals.length === 0) return [];

  const ranges: SuppressedLiteralMarkdownRange[] = [];

  doc.descendants((node, position) => {
    if (!node.isTextblock) return;

    const blockStart = position + 1;
    for (const literal of literals) {
      let fromIndex = 0;
      while (fromIndex < node.textContent.length) {
        const index = node.textContent.indexOf(literal.text, fromIndex);
        if (index < 0) break;

        ranges.push({
          from: blockStart + index,
          to: blockStart + index + literal.text.length,
          marker: literal.marker
        });
        fromIndex = index + literal.text.length;
      }
    }
  });

  return ranges.sort((left, right) => left.from - right.from || right.to - left.to);
}

function mapSuppressedLiteralRanges(
  ranges: SuppressedLiteralMarkdownRange[],
  tr: Transaction
) {
  if (!tr.docChanged || ranges.length === 0) return ranges;

  return ranges.flatMap((range) => {
    const from = tr.mapping.map(range.from, -1);
    const to = tr.mapping.map(range.to, 1);

    if (to <= from) return [];

    const text = tr.doc.textBetween(from, to);
    if (!text.startsWith(range.marker) || !text.endsWith(range.marker)) return [];
    if (text.length <= range.marker.length * 2) return [];

    return [{ ...range, from, to }];
  });
}

function isSuppressedLiteralRange(
  ranges: SuppressedLiteralMarkdownRange[],
  from: number,
  to: number,
  marker: string
) {
  return ranges.some((range) => range.from === from && range.to === to && range.marker === marker);
}

function getMarkByType(marks: readonly Mark[], markType: MarkType) {
  return marks.find((mark) => mark.type === markType);
}

function getManagedMarkTypes(specs: LiveMarkdownSpec[]) {
  const markTypes: MarkType[] = [];

  for (const spec of specs) {
    for (const mark of spec.marks) {
      if (!markTypes.includes(mark.markType)) {
        markTypes.push(mark.markType);
      }
    }
  }

  return markTypes;
}

function hasManagedMark(marks: readonly Mark[] | null | undefined, markTypes: MarkType[]) {
  return Boolean(marks?.some((mark) => markTypes.includes(mark.type)));
}

function getMarkTypesForKind(specs: LiveMarkdownSpec[], kind: LiveMarkdownKind) {
  const markTypes: MarkType[] = [];

  for (const spec of specs) {
    for (const mark of spec.marks) {
      if (mark.kind === kind && !markTypes.includes(mark.markType)) {
        markTypes.push(mark.markType);
      }
    }
  }

  return markTypes;
}

function textRangeAvoidsMarks(
  node: ProseNode,
  from: number,
  to: number,
  markTypes: MarkType[]
) {
  let cursor = from;
  let valid = true;

  node.forEach((child, offset) => {
    if (!valid || offset >= to) return;

    const childTo = offset + child.nodeSize;
    if (childTo <= cursor) return;

    if (offset > cursor) {
      valid = false;
      return;
    }

    const overlapTo = Math.min(childTo, to);
    if (!child.isText || hasManagedMark(child.marks, markTypes)) {
      valid = false;
      return;
    }

    cursor = overlapTo;
  });

  return valid && cursor >= to;
}

function liveMarkdownRangeHasEligibleDelimiters(
  node: ProseNode,
  range: LiveMarkdownRange,
  excludedDelimiterMarkTypes: MarkType[]
) {
  const closingFrom = range.to - range.marker.length;

  return (
    textRangeAvoidsMarks(node, range.from, range.contentFrom, excludedDelimiterMarkTypes) &&
    textRangeAvoidsMarks(node, closingFrom, range.to, excludedDelimiterMarkTypes)
  );
}

function getLiveMarkdownRangesInTextblock(
  node: ProseNode,
  specs: LiveMarkdownSpec[]
) {
  if (node.type.spec.code) return [];

  const inlineCodeMarkTypes = getMarkTypesForKind(specs, "inlineCode");

  return getLiveMarkdownRanges(node.textContent, specs).filter((range) =>
    liveMarkdownRangeHasEligibleDelimiters(node, range, inlineCodeMarkTypes)
  );
}

function selectionContainsManagedMark(state: EditorState, markTypes: MarkType[]) {
  const { selection } = state;
  if (selection.empty) return false;

  let found = false;
  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (found) return false;
    if (!node.isText) return true;

    found = hasManagedMark(node.marks, markTypes);
    return !found;
  });

  return found;
}

function emptyTextblockSelection(state: EditorState) {
  const { selection } = state;

  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.$from.parent.isTextblock &&
    selection.$from.parent.content.size === 0
  );
}

function shouldClearManagedStoredMarks(
  transactions: readonly { docChanged: boolean }[],
  oldState: EditorState,
  newState: EditorState,
  markTypes: MarkType[]
) {
  if (!hasManagedMark(newState.storedMarks, markTypes)) return false;
  if (!transactions.some((transaction) => transaction.docChanged)) return false;

  if (selectionContainsManagedMark(oldState, markTypes)) return true;

  return oldState.doc.content.size > newState.doc.content.size && emptyTextblockSelection(newState);
}

function clearManagedStoredMarks(state: EditorState, markTypes: MarkType[]) {
  const storedMarks = state.storedMarks;
  if (!storedMarks) return null;

  const nextMarks = storedMarks.filter((mark) => !markTypes.includes(mark.type));
  if (nextMarks.length === storedMarks.length) return null;

  return state.tr.setStoredMarks(nextMarks);
}

function insertTextAfterExitedFoldedMarkdown(
  view: EditorView,
  text: string,
  markTypes: MarkType[]
) {
  if (text.length === 0) return false;

  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const pluginState = liveMarkdownKey.getState(view.state) as LiveMarkdownPluginState | undefined;
  if (selection.from !== pluginState?.exitedFoldedRange?.cursor) return false;

  const marks = selection.$from.marks().filter((mark) => !markTypes.includes(mark.type));
  const insertedText = view.state.schema.text(text, marks);
  const transaction = view.state.tr.replaceSelectionWith(insertedText, false).setStoredMarks(marks);

  view.dispatch(transaction.scrollIntoView());
  return true;
}

function moveCursorPastFoldedMarkdownDelimiter(
  view: EditorView,
  specs: LiveMarkdownSpec[],
  direction: "left" | "right"
) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const pluginState = liveMarkdownKey.getState(view.state) as LiveMarkdownPluginState | undefined;

  if (direction === "right") {
    const exitedRange = pluginState?.exitedFoldedRange ?? null;
    if (exitedRange && selection.from === exitedRange.cursor) return false;

    const foldedRange =
      pluginState?.activeFoldedRange ?? getFoldedMarkdownRangeAtCursor(view.state.doc, selection.from, specs);
    if (!foldedRange || selection.from !== foldedRange.to) return false;

    view.dispatch(
      view.state.tr
        .setMeta(liveMarkdownKey, { exitedFoldedRange: { ...foldedRange, cursor: selection.from } })
        .scrollIntoView()
    );
    return true;
  }

  const exitedRange = pluginState?.exitedFoldedRange ?? null;
  if (!exitedRange || selection.from !== exitedRange.cursor) return false;

  view.dispatch(
    view.state.tr
      .setMeta(liveMarkdownKey, { activeFoldedRange: exitedRange, exitedFoldedRange: null })
      .scrollIntoView()
  );
  return true;
}

function deleteTextAfterLiveMarkdownRange(
  view: EditorView,
  specs: LiveMarkdownSpec[],
  markTypes: MarkType[]
) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return false;

  const cursor = $from.parentOffset;
  const range = getLiveMarkdownRangesInTextblock($from.parent, specs).find(
    (candidate) => candidate.to + 1 === cursor
  );
  if (!range) return false;

  const from = $from.start() + range.to;
  const storedMarks = view.state.storedMarks?.filter((mark) => !markTypes.includes(mark.type)) ?? [];
  const transaction = view.state.tr.delete(from, from + 1);

  view.dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, from))
      .setStoredMarks(storedMarks)
      .scrollIntoView()
  );
  return true;
}

function getMarkerFromFoldedMarks(marks: readonly Mark[], spec: LiveMarkdownSpec) {
  const strongMark = spec.marks.find((mark) => mark.kind === "strong");
  const emphasisMark = spec.marks.find((mark) => mark.kind === "emphasis");

  if (strongMark && emphasisMark) {
    const mark = getMarkByType(marks, strongMark.markType) ?? getMarkByType(marks, emphasisMark.markType);
    const marker = typeof mark?.attrs.marker === "string" ? mark.attrs.marker : "*";
    return marker.repeat(3);
  }

  if (strongMark) {
    const mark = getMarkByType(marks, strongMark.markType);
    const marker = typeof mark?.attrs.marker === "string" ? mark.attrs.marker : "*";
    return marker.repeat(2);
  }

  if (emphasisMark) {
    const mark = getMarkByType(marks, emphasisMark.markType);
    return typeof mark?.attrs.marker === "string" ? mark.attrs.marker : "*";
  }

  return spec.markers[0] ?? "";
}

function getFoldedMarkdownRangeAtCursor(
  doc: ProseNode,
  cursor: number,
  specs: LiveMarkdownSpec[]
): FoldedMarkdownRange | null {
  let foldedRange: FoldedMarkdownRange | null = null;

  doc.descendants((node, position) => {
    if (foldedRange) return false;
    if (!node.isText || !node.text) return;

    const from = position;
    const to = position + node.nodeSize;
    if (cursor < from || cursor > to) return;

    const spec = specs.find((candidate) =>
      candidate.marks.length > 0
      && candidate.marks.every((mark) => node.marks.some((nodeMark) => nodeMark.type === mark.markType))
    );
    if (!spec) return;

    foldedRange = {
      marker: getMarkerFromFoldedMarks(node.marks, spec),
      from,
      to,
      kinds: getLiveMarkdownKinds(spec)
    };
  });

  return foldedRange;
}

function createDelimiterWidget(marker: string) {
  const delimiter = document.createElement("span");
  delimiter.className = "markra-md-delimiter markra-md-virtual-delimiter";
  delimiter.textContent = marker;
  return delimiter;
}

function buildLiveMarkdownDecorations(
  doc: ProseNode,
  specs: LiveMarkdownSpec[],
  activeLiveRange: ActiveLiveMarkdownRange | null,
  activeFoldedRange: FoldedMarkdownRange | null,
  exitedFoldedRange: ExitedFoldedMarkdownRange | null,
  suppressedLiteralRanges: SuppressedLiteralMarkdownRange[]
) {
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (!node.isTextblock) return;

    const blockStart = position + 1;
    const ranges = getLiveMarkdownRangesInTextblock(node, specs);

    for (const range of ranges) {
      const from = blockStart + range.from;
      const to = blockStart + range.to;
      if (isSuppressedLiteralRange(suppressedLiteralRanges, from, to, range.marker)) {
        continue;
      }

      const contentFrom = blockStart + range.contentFrom;
      const contentTo = blockStart + range.contentTo;
      const delimiterClass =
        activeLiveRange?.from === from && activeLiveRange.to === to
          ? "markra-md-delimiter"
          : "markra-md-hidden-delimiter";

      // Keep Markdown markers in the document, but reveal them only for the currently active range.
      decorations.push(
        Decoration.inline(from, contentFrom, {
          class: delimiterClass
        }),
        Decoration.inline(contentTo, to, {
          class: delimiterClass
        })
      );

      if (range.contentFrom < range.contentTo) {
        decorations.push(
          Decoration.inline(contentFrom, contentTo, {
            class: ["markra-live-mark", ...range.kinds.map((kind) => `markra-live-mark-${kind}`)].join(" ")
          })
        );
      }
    }
  });

  const foldedRange = activeFoldedRange ?? exitedFoldedRange;

  if (foldedRange) {
    // Finalized marks use virtual markers so the user can re-enter an editable Markdown-like state.
    decorations.push(
      Decoration.widget(foldedRange.from, () => createDelimiterWidget(foldedRange.marker), { side: -1 }),
      Decoration.widget(foldedRange.to, () => createDelimiterWidget(foldedRange.marker), {
        side: exitedFoldedRange ? -1 : 1,
        marks: exitedFoldedRange ? [] : undefined
      }),
      Decoration.inline(foldedRange.from, foldedRange.to, {
        class: ["markra-live-mark", ...foldedRange.kinds.map((kind) => `markra-live-mark-${kind}`)].join(" ")
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

function getAbsoluteLiveMarkdownRange(active: { range: LiveMarkdownRange; blockStart: number }) {
  return {
    from: active.blockStart + active.range.from,
    to: active.blockStart + active.range.to,
    contentFrom: active.blockStart + active.range.contentFrom,
    contentTo: active.blockStart + active.range.contentTo
  };
}

function isSameLiveMarkdownRange(
  left: Pick<SuppressedLiveMarkdownRange, "from" | "to"> | null,
  right: Pick<SuppressedLiveMarkdownRange, "from" | "to"> | null
) {
  return Boolean(left && right && left.from === right.from && left.to === right.to);
}

function createSuppressedLiveRange(
  range: Pick<SuppressedLiveMarkdownRange, "from" | "to">,
  cursor: number
): SuppressedLiveMarkdownRange {
  return {
    from: range.from,
    to: range.to,
    cursor
  };
}

function findActiveLiveMarkdownRange(state: EditorState, specs: LiveMarkdownSpec[]) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;

  const ranges = getLiveMarkdownRangesInTextblock($from.parent, specs)
    .filter((range) => range.content.trim().length > 0)
    .filter((range) => range.from <= $from.parentOffset && $from.parentOffset <= range.to)
    .sort((left, right) => left.to - left.from - (right.to - right.from));

  const range = ranges[0];
  if (!range) return null;

  return {
    range,
    blockStart: $from.start()
  };
}

export function finalizeActiveLiveMarkdown(view: EditorView, specs: LiveMarkdownSpec[]) {
  const active = findActiveLiveMarkdownRange(view.state, specs);
  if (!active) return false;

  // Enter commits the active raw Markdown span into real ProseMirror marks.
  const { blockStart, range } = active;
  if (range.marks.length === 0) return false;

  const marks = range.marks.map((mark) => mark.markType.create(mark.getAttr?.(range.marker)));
  const markedText = view.state.schema.text(range.content, marks);
  const start = blockStart + range.from;
  const end = blockStart + range.to;
  const cursor = start + range.content.length;
  const tr = view.state.tr.replaceWith(start, end, markedText).setMeta(liveMarkdownKey, {
    suppressActiveAt: cursor
  });

  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView());
  return true;
}

function moveCursorOverLiveMarkdownDelimiter(
  view: EditorView,
  specs: LiveMarkdownSpec[],
  direction: "left" | "right"
) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  const active = findActiveLiveMarkdownRange(view.state, specs);
  if (!active) return false;

  const cursor = selection.from;
  const range = getAbsoluteLiveMarkdownRange(active);
  const pluginState = liveMarkdownKey.getState(view.state) as LiveMarkdownPluginState | undefined;
  const suppressedRange = isSameLiveMarkdownRange(range, pluginState?.suppressedLiveRange ?? null)
    ? pluginState?.suppressedLiveRange ?? null
    : null;
  const openingStart = range.from;
  const openingEnd = range.contentFrom;
  const closingStart = range.contentTo;
  const closingEnd = range.to;
  let target: number | null = null;
  let suppressedLiveRange: SuppressedLiveMarkdownRange | null = null;

  // When a folded range is active, arrow keys should move by visible text positions, not hidden marker positions.
  if (suppressedRange && direction === "right" && cursor === closingEnd) {
    return false;
  }

  if (suppressedRange && direction === "left" && cursor === openingStart) {
    return false;
  }

  if (suppressedRange && direction === "right" && cursor === closingStart) {
    target = closingEnd < selection.$from.end() ? closingEnd + 1 : closingEnd;
    suppressedLiveRange = target === closingEnd ? createSuppressedLiveRange(range, target) : null;
  } else if (suppressedRange && direction === "left" && cursor === closingEnd) {
    target = closingStart;
    suppressedLiveRange = createSuppressedLiveRange(range, target);
  } else if (suppressedRange && direction === "left" && cursor === openingEnd) {
    target = openingStart > selection.$from.start() ? openingStart - 1 : openingStart;
    suppressedLiveRange = target === openingStart ? createSuppressedLiveRange(range, target) : null;
  } else if (suppressedRange && direction === "right" && cursor === openingStart) {
    target = openingEnd;
    suppressedLiveRange = createSuppressedLiveRange(range, target);
  } else if (direction === "right") {
    if (cursor >= openingStart && cursor < openingEnd) {
      target = openingEnd;
    } else if (cursor >= closingStart && cursor < closingEnd) {
      target = closingEnd;
    } else if (cursor === closingEnd) {
      target = closingStart;
      suppressedLiveRange = createSuppressedLiveRange(range, target);
    }
  } else if (cursor > openingStart && cursor <= openingEnd) {
    target = openingStart;
  } else if (cursor > closingStart && cursor <= closingEnd) {
    target = closingStart;
  } else if (cursor === openingStart) {
    target = openingEnd;
    suppressedLiveRange = createSuppressedLiveRange(range, target);
  }

  if (target === null || target === cursor) return false;

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, target))
      .setMeta(liveMarkdownKey, suppressedLiveRange ? { suppressedLiveRange } : {})
      .scrollIntoView()
  );
  return true;
}

export function markraLiveMarkdownSpecs(ctx: Ctx, options: MarkraLiveMarkdownOptions = {}): LiveMarkdownSpec[] {
  return [
    {
      markers: ["`"],
      pattern: /`[^`\n]*?`/g,
      marks: [
        {
          kind: "inlineCode",
          markType: inlineCodeSchema.type(ctx)
        }
      ]
    },
    {
      markers: ["***"],
      pattern: /(?<!\*)\*\*\*(?!\s)[^\n]*?(?<!\s)\*\*\*(?!\*)/g,
      marks: [
        {
          kind: "strong",
          markType: strongSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        },
        {
          kind: "emphasis",
          markType: emphasisSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        }
      ]
    },
    {
      markers: ["___"],
      pattern: /(?<![\p{L}\p{N}_])___(?!_)[^\n]*?(?<!_)___(?!_)(?![\p{L}\p{N}_])/gu,
      marks: [
        {
          kind: "strong",
          markType: strongSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        },
        {
          kind: "emphasis",
          markType: emphasisSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        }
      ]
    },
    {
      markers: ["**"],
      pattern: /(?<!\*)\*\*(?!\s)[^\n]*?(?<!\s)\*\*(?!\*)/g,
      marks: [
        {
          kind: "strong",
          markType: strongSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        }
      ]
    },
    {
      markers: ["__"],
      pattern: /(?<![\p{L}\p{N}_])__(?!_)[^\n]*?(?<!_)__(?!_)(?![\p{L}\p{N}_])/gu,
      marks: [
        {
          kind: "strong",
          markType: strongSchema.type(ctx),
          getAttr: (marker) => ({
            marker: marker[0]
          })
        }
      ]
    },
    {
      markers: ["~~"],
      pattern: /~~[^\n]*?~~/g,
      marks: [
        {
          kind: "strikethrough",
          markType: strikethroughSchema.type(ctx)
        }
      ]
    },
    ...(options.highlight ?? true
      ? [
          {
            markers: ["=="],
            pattern: /(?<!=)==[^=\n][^\n]*?==(?!=)/g,
            marks: [],
            kinds: ["highlight"]
          } satisfies LiveMarkdownSpec
        ]
      : []),
    {
      markers: ["*"],
      pattern: /(?<!\*)\*(?![\s*])[^*\n]*?(?<![\s*])\*(?!\*)/g,
      marks: [
        {
          kind: "emphasis",
          markType: emphasisSchema.type(ctx),
          getAttr: (marker) => ({
            marker
          })
        }
      ]
    },
    {
      markers: ["_"],
      pattern: /(?<![\p{L}\p{N}_])_(?!_)[^\n]*?(?<!_)_(?!_)(?![\p{L}\p{N}_])/gu,
      marks: [
        {
          kind: "emphasis",
          markType: emphasisSchema.type(ctx),
          getAttr: (marker) => ({
            marker
          })
        }
      ]
    }
  ];
}

export const markraLiveMarkdownPlugin = (options: MarkraLiveMarkdownOptions = {}) => $prose((ctx) => {
  const specs = markraLiveMarkdownSpecs(ctx, options);
  const managedMarkTypes = getManagedMarkTypes(specs);

  return new Plugin({
    key: liveMarkdownKey,
    appendTransaction: (transactions, oldState, newState) => {
      if (!shouldClearManagedStoredMarks(transactions, oldState, newState, managedMarkTypes)) return null;

      return clearManagedStoredMarks(newState, managedMarkTypes);
    },
    state: {
      init: (_config, state): LiveMarkdownPluginState => ({
        suppressActiveAt: null,
        activeFoldedRange: null,
        exitedFoldedRange: null,
        suppressedLiveRange: null,
        suppressedLiteralRanges: findSuppressedLiteralRanges(state.doc, specs, options.initialMarkdown)
      }),
      apply: (tr, value, _oldState, newState): LiveMarkdownPluginState => {
        const meta = tr.getMeta(liveMarkdownKey) as Partial<LiveMarkdownPluginState> | undefined;
        const suppressedLiteralRanges = mapSuppressedLiteralRanges(value.suppressedLiteralRanges, tr);
        if (meta && "exitedFoldedRange" in meta) {
          return {
            suppressActiveAt: null,
            activeFoldedRange: meta.activeFoldedRange ?? null,
            exitedFoldedRange: meta.exitedFoldedRange ?? null,
            suppressedLiveRange: null,
            suppressedLiteralRanges
          };
        }

        if (meta?.suppressedLiveRange) {
          // Preserve the folded view after an arrow-key collapse until the cursor leaves that edge.
          return {
            suppressActiveAt: null,
            activeFoldedRange: null,
            exitedFoldedRange: null,
            suppressedLiveRange: meta.suppressedLiveRange,
            suppressedLiteralRanges
          };
        }

        if (typeof meta?.suppressActiveAt === "number") {
          return {
            suppressActiveAt: meta.suppressActiveAt,
            activeFoldedRange: null,
            exitedFoldedRange: null,
            suppressedLiveRange: null,
            suppressedLiteralRanges
          };
        }

        if (tr.selectionSet) {
          const selection = newState.selection instanceof TextSelection ? newState.selection : null;
          const exitedFoldedRange =
            selection?.from === value.exitedFoldedRange?.cursor ? value.exitedFoldedRange : null;
          const activeFoldedRange =
            selection?.empty && selection.from !== value.suppressActiveAt && !exitedFoldedRange
              ? getFoldedMarkdownRangeAtCursor(newState.doc, selection.from, specs)
              : null;

          return {
            suppressActiveAt: selection?.from === value.suppressActiveAt ? value.suppressActiveAt : null,
            activeFoldedRange,
            exitedFoldedRange,
            suppressedLiveRange:
              selection?.from === value.suppressedLiveRange?.cursor ? value.suppressedLiveRange : null,
            suppressedLiteralRanges
          };
        }

        if (tr.docChanged) {
          return {
            suppressActiveAt: null,
            activeFoldedRange: null,
            exitedFoldedRange: null,
            suppressedLiveRange: null,
            suppressedLiteralRanges
          };
        }

        return suppressedLiteralRanges === value.suppressedLiteralRanges ? value : { ...value, suppressedLiteralRanges };
      }
    },
    props: {
      decorations: (state) => {
        const pluginState = liveMarkdownKey.getState(state) as LiveMarkdownPluginState | undefined;
        const active = findActiveLiveMarkdownRange(state, specs);
        const absoluteActive = active ? getAbsoluteLiveMarkdownRange(active) : null;
        const activeLiveRange =
          absoluteActive && !isSameLiveMarkdownRange(absoluteActive, pluginState?.suppressedLiveRange ?? null)
            ? absoluteActive
            : null;

        // Suppressed ranges still receive styling, but their source markers stay hidden.
        return buildLiveMarkdownDecorations(
          state.doc,
          specs,
          activeLiveRange,
          pluginState?.activeFoldedRange ?? null,
          pluginState?.exitedFoldedRange ?? null,
          pluginState?.suppressedLiteralRanges ?? []
        );
      },
      handleTextInput: (view, _from, _to, text) => insertTextAfterExitedFoldedMarkdown(view, text, managedMarkTypes),
      handleKeyDown: (view, event) => {
        const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;

        if (event.key === "Backspace" && !hasModifier) {
          const handled = deleteTextAfterLiveMarkdownRange(view, specs, managedMarkTypes);
          if (handled) {
            event.preventDefault();
            return true;
          }
        }

        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !hasModifier) {
          const handledLiveRange = moveCursorOverLiveMarkdownDelimiter(
            view,
            specs,
            event.key === "ArrowLeft" ? "left" : "right"
          );
          const handledFoldedRange =
            handledLiveRange ||
            moveCursorPastFoldedMarkdownDelimiter(view, specs, event.key === "ArrowLeft" ? "left" : "right");

          if (handledFoldedRange) {
            event.preventDefault();
            return true;
          }
        }

        if (event.key !== "Enter" || hasModifier) {
          return false;
        }

        return finalizeActiveLiveMarkdown(view, specs);
      }
    }
  });
});
