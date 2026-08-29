import { syntaxTree } from "@codemirror/language";
import {
  StateField,
  type EditorState,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import {
  syntaxTreeChanged,
} from "./changes.ts";
import { markraListDepth } from "./renderers.ts";

type HeadingEdge = "after" | "before";
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const headingLevels: Readonly<Record<string, HeadingLevel>> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
};

const headingSpacing: Readonly<
  Record<HeadingLevel, Readonly<Record<HeadingEdge, number>>>
> = {
  1: { after: 16, before: 0 },
  2: { after: 12, before: 28 },
  3: { after: 4, before: 22 },
  4: { after: 2, before: 18 },
  5: { after: 0, before: 14 },
  6: { after: 0, before: 14 },
};

abstract class MeasuredSpacerWidget extends WidgetType {
  constructor(readonly height: number) {
    super();
  }

  // CodeMirror estimates offscreen block heights from this value. Rendering
  // the same value inline prevents long documents from accumulating pointer
  // coordinate drift before every spacer has entered the viewport.
  get estimatedHeight() {
    return this.height;
  }

  protected createSpacer(view: CodeMirrorView, className: string) {
    const spacer = view.dom.ownerDocument.createElement("div");
    spacer.className = className;
    spacer.style.height = `${this.height}px`;
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  }
}

class HeadingSpacerWidget extends MeasuredSpacerWidget {
  constructor(
    readonly edge: HeadingEdge,
    height: number,
    readonly level: HeadingLevel,
  ) {
    super(height);
  }

  eq(other: HeadingSpacerWidget) {
    return other.edge === this.edge &&
      other.height === this.height &&
      other.level === this.level;
  }

  toDOM(view: CodeMirrorView) {
    const spacer = this.createSpacer(view, "cm-markra-heading-spacer");
    spacer.dataset.headingEdge = this.edge;
    spacer.dataset.headingLevel = String(this.level);
    return spacer;
  }
}

class ParagraphSpacerWidget extends MeasuredSpacerWidget {
  eq(other: ParagraphSpacerWidget) {
    return other.height === this.height;
  }

  toDOM(view: CodeMirrorView) {
    return this.createSpacer(view, "cm-markra-paragraph-spacer");
  }
}

class BlockquoteSpacerWidget extends MeasuredSpacerWidget {
  eq(other: BlockquoteSpacerWidget) {
    return other.height === this.height;
  }

  toDOM(view: CodeMirrorView) {
    return this.createSpacer(view, "cm-markra-blockquote-spacer");
  }
}

function addHeadingSpacer(
  ranges: Range<Decoration>[],
  edge: HeadingEdge,
  height: number,
  level: HeadingLevel,
  position: number,
) {
  if (height === 0) return;
  ranges.push(
    Decoration.widget({
      block: true,
      side: edge === "before" ? -100 : 100,
      widget: new HeadingSpacerWidget(edge, height, level),
    }).range(position),
  );
}

function hasFollowingContent(state: EditorState, lineNumber: number) {
  for (let number = lineNumber + 1; number <= state.doc.lines; number += 1) {
    if (state.doc.line(number).text.trim().length > 0) return true;
  }
  return false;
}

function buildBlockSpacing(
  state: EditorState,
  paragraphSpacing: number,
) {
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      const level = headingLevels[node.type.name];
      if (level) {
        const firstLine = state.doc.lineAt(node.from);
        const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
        const spacing = headingSpacing[level];
        addHeadingSpacer(
          ranges,
          "before",
          spacing.before,
          level,
          firstLine.from,
        );
        addHeadingSpacer(ranges, "after", spacing.after, level, lastLine.to);
        return;
      }

      if (node.type.name === "Blockquote") {
        const firstLine = state.doc.lineAt(node.from);
        if (
          firstLine.number > 1 &&
          state.doc.line(firstLine.number - 1).text.trim().length === 0
        ) {
          ranges.push(
            Decoration.widget({
              block: true,
              side: -90,
              widget: new BlockquoteSpacerWidget(10),
            }).range(firstLine.from),
          );
        }
      }

      if (
        paragraphSpacing <= 0 ||
        node.type.name !== "Paragraph" ||
        markraListDepth(node.node) > 0 ||
        node.to <= node.from
      ) {
        return;
      }

      const lastLine = state.doc.lineAt(node.to - 1);
      if (!hasFollowingContent(state, lastLine.number)) return;
      ranges.push(
        Decoration.widget({
          block: true,
          side: 100,
          widget: new ParagraphSpacerWidget(paragraphSpacing),
        }).range(lastLine.to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

function normalizeSpacing(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function transactionOnlyInsertsBlockSafeText(transaction: Transaction) {
  if (!transaction.docChanged || !transaction.isUserEvent("input")) {
    return false;
  }

  let safeInsertion = true;
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const source = inserted.toString();
    if (
      fromA !== toA ||
      /[\n\r\t#>*+=\-`~]/u.test(source)
    ) {
      safeInsertion = false;
      return;
    }
    if (source.includes(" ")) {
      const line = transaction.startState.doc.lineAt(fromA);
      const offset = fromA - line.from;
      const nextLine = line.text.slice(0, offset) +
        source +
        line.text.slice(offset);
      if (
        /^[\t ]{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])[\t ]+/u.test(nextLine)
      ) {
        safeInsertion = false;
      }
    }
  });
  return safeInsertion;
}

function plainTextChangeStaysInsideBlock(transaction: Transaction) {
  if (!transactionOnlyInsertsBlockSafeText(transaction)) return false;

  let staysInsideBlock = true;
  transaction.changes.iterChangedRanges((fromA) => {
    if (!staysInsideBlock) return;
    if (transaction.startState.doc.lineAt(fromA).text.trim().length === 0) {
      staysInsideBlock = false;
    }
  });
  return staysInsideBlock;
}

export function blockSpacingExtension(paragraphSpacing = 0) {
  const normalizedParagraphSpacing = normalizeSpacing(paragraphSpacing);

  return StateField.define<DecorationSet>({
    create: (state) => buildBlockSpacing(state, normalizedParagraphSpacing),
    provide: (field) => EditorView.decorations.from(field),
    update(spacing, transaction) {
      if (plainTextChangeStaysInsideBlock(transaction)) {
        return spacing.map(transaction.changes);
      }
      if (transaction.docChanged) {
        return buildBlockSpacing(transaction.state, normalizedParagraphSpacing);
      }
      if (transaction.selection) return spacing;
      return syntaxTreeChanged(transaction.startState, transaction.state)
        ? buildBlockSpacing(transaction.state, normalizedParagraphSpacing)
        : spacing;
    },
  });
}
