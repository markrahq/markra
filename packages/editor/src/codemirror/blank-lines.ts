import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type Range,
  StateField,
  type Extension,
  type Text,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { readCodeMirrorFrontmatter } from "./frontmatter-preview.ts";

const PREFORMATTED_BLOCKS = new Set([
  "BlockMath",
  "CodeBlock",
  "FencedCode",
  "Frontmatter",
  "HTMLBlock",
]);
const frontmatterCache = new WeakMap<
  EditorState,
  ReturnType<typeof readCodeMirrorFrontmatter>
>();

function mayStartWithFrontmatter(state: EditorState) {
  const prefix = state.sliceDoc(0, 4);
  const sourceStart = prefix.charCodeAt(0) === 0xfeff
    ? prefix.slice(1)
    : prefix;
  return sourceStart.startsWith("---") ||
    sourceStart.startsWith("+++") ||
    sourceStart.startsWith("{");
}

interface BlankLineLayout {
  atomicRanges: DecorationSet;
  decorations: DecorationSet;
}

class BlockGapWidget extends WidgetType {
  eq() {
    return true;
  }

  get estimatedHeight() {
    return 8;
  }

  toDOM(view: EditorView) {
    const gap = view.dom.ownerDocument.createElement("div");
    gap.className = "cm-markra-block-gap";
    gap.setAttribute("aria-hidden", "true");
    return gap;
  }
}

export function isInsidePreformattedBlock(
  state: EditorState,
  position: number,
) {
  let frontmatter = frontmatterCache.get(state);
  if (frontmatter === undefined) {
    // Most documents have no frontmatter. Avoid materializing the full source
    // on every EditorState while blank-line layout is rebuilt during typing.
    frontmatter = mayStartWithFrontmatter(state)
      ? readCodeMirrorFrontmatter(state.doc.toString())
      : null;
    frontmatterCache.set(state, frontmatter);
  }
  if (
    frontmatter &&
    position >= frontmatter.contentFrom &&
    position <= frontmatter.contentTo
  ) {
    return true;
  }

  let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null =
    syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (PREFORMATTED_BLOCKS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

function isCollapsibleBlankLine(
  state: EditorState,
  line: ReturnType<Text["line"]>,
) {
  return line.text.trim().length === 0 &&
    !isInsidePreformattedBlock(state, line.from);
}

function buildBlankLineLayout(state: EditorState): BlankLineLayout {
  const layoutDecorations: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines;) {
    const firstBlank = state.doc.line(lineNumber);
    if (!isCollapsibleBlankLine(state, firstBlank)) {
      lineNumber += 1;
      continue;
    }

    let lastBlankNumber = lineNumber;
    while (lastBlankNumber < state.doc.lines) {
      const nextLine = state.doc.line(lastBlankNumber + 1);
      if (!isCollapsibleBlankLine(state, nextLine)) break;
      lastBlankNumber += 1;
    }

    const previousLine = lineNumber > 1
      ? state.doc.line(lineNumber - 1)
      : null;
    const nextLine = lastBlankNumber < state.doc.lines
      ? state.doc.line(lastBlankNumber + 1)
      : null;
    if (
      previousLine?.text.trim().length &&
      nextLine?.text.trim().length
    ) {
      // Markdown does not preserve whether the first blank source line was
      // intended as content. Treating one internal line as layout whitespace
      // gives reopened files a stable, source-only separator while leaving
      // every additional blank line editable.
      layoutDecorations.push(
        Decoration.line({
          attributes: { "data-markra-empty-source": "separator" },
          class: "cm-markra-layout-separator",
        }).range(firstBlank.from),
      );
      // The source separator is not an editable row in preview, but it still
      // represents a block boundary. A measured block widget keeps that
      // rhythm stable across every block type without changing caret height.
      layoutDecorations.push(
        Decoration.widget({
          block: true,
          side: -100,
          widget: new BlockGapWidget(),
        }).range(firstBlank.from),
      );
      atomicRanges.push(
        Decoration.mark({}).range(previousLine.to, firstBlank.to),
      );
    }

    lineNumber = lastBlankNumber + 1;
  }

  return {
    atomicRanges: Decoration.set(atomicRanges, true),
    decorations: Decoration.set(layoutDecorations, true),
  };
}

function layoutSeparatorExit(state: EditorState, position: number) {
  const line = state.doc.lineAt(position);
  if (line.number === 1 || !isCollapsibleBlankLine(state, line)) return null;
  const previousLine = state.doc.line(line.number - 1);
  if (previousLine.text.trim().length === 0) return null;

  let lastBlankNumber = line.number;
  while (lastBlankNumber < state.doc.lines) {
    const next = state.doc.line(lastBlankNumber + 1);
    if (!isCollapsibleBlankLine(state, next)) break;
    lastBlankNumber += 1;
  }

  if (lastBlankNumber === state.doc.lines) return null;
  return state.doc.line(line.number + 1).from;
}

export function moveToEditableLine(view: EditorView, position: number) {
  const boundedPosition = Math.max(0, Math.min(position, view.state.doc.length));
  const separatorExit = layoutSeparatorExit(view.state, boundedPosition);
  if (
    separatorExit !== null &&
    !view.state.facet(EditorState.readOnly)
  ) {
    view.dispatch({
      changes: { from: boundedPosition, insert: "\n" },
      selection: EditorSelection.cursor(boundedPosition + 1, 1),
      userEvent: "input",
    });
    return;
  }
  view.dispatch({
    selection: EditorSelection.cursor(separatorExit ?? boundedPosition, 1),
  });
}

function keepSelectionsOutOfLayoutSeparators(transaction: Transaction) {
  let corrected = false;
  const selection = EditorSelection.create(
    transaction.newSelection.ranges.map((range) => {
      if (!range.empty) return range;
      const target = layoutSeparatorExit(transaction.state, range.head);
      if (target === null) return range;
      corrected = true;
      return EditorSelection.cursor(
        target,
        1,
        range.bidiLevel ?? undefined,
        range.goalColumn ?? undefined,
      );
    }),
    transaction.newSelection.mainIndex,
  );
  if (!corrected) return transaction;
  return [transaction, { selection, sequential: true }];
}

const blankLineLayoutField = StateField.define<BlankLineLayout>({
  create: buildBlankLineLayout,
  update(layout, transaction) {
    if (
      !transaction.docChanged &&
      syntaxTree(transaction.startState) === syntaxTree(transaction.state)
    ) {
      return layout;
    }
    return buildBlankLineLayout(transaction.state);
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, (layout) => layout.decorations),
      EditorView.atomicRanges.of((view) =>
        view.state.field(field).atomicRanges
      ),
    ];
  },
});

const blankLineLayoutTheme = EditorView.baseTheme({
  ".cm-markra-layout-separator": {
    display: "none",
  },
  ".cm-markra-block-gap": {
    height: "var(--editor-paragraph-spacing, 8px)",
    pointerEvents: "none",
    width: "100%",
  },
});

export function blankLineLayout(): Extension {
  return [
    blankLineLayoutField,
    blankLineLayoutTheme,
    EditorState.transactionFilter.of(keepSelectionsOutOfLayoutSeparators),
  ];
}
