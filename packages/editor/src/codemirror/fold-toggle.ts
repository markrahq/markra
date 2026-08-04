import {
  foldEffect,
  foldable,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView as CodeMirrorView,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTreeChanged } from "./changes.ts";
import { defineMarkraPlugin } from "./plugin.ts";

export interface FoldToggleLabels {
  readonly collapseListItem: string;
  readonly collapseSection: string;
  readonly expandListItem: string;
  readonly expandSection: string;
}

export interface FoldTogglePluginOptions {
  labels?: Partial<FoldToggleLabels>;
}

type FoldToggleKind = "heading" | "list";

interface FoldToggleRange {
  readonly from: number;
  readonly kind: FoldToggleKind;
  readonly lineFrom: number;
  readonly to: number;
}

const headingNamePattern = /^(?:ATX|Setext)Heading[1-6]$/u;
const defaultLabels: FoldToggleLabels = {
  collapseListItem: "Collapse list item",
  collapseSection: "Collapse section",
  expandListItem: "Expand list item",
  expandSection: "Expand section",
};

function foldKindAt(state: EditorState, position: number): FoldToggleKind | null {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (headingNamePattern.test(node.name)) return "heading";
    if (node.name === "ListItem" && node.from === position) return "list";
    node = node.parent;
  }
  return null;
}

function toggleRanges(state: EditorState) {
  const ranges: FoldToggleRange[] = [];
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const range = foldable(state, line.from, line.to);
    if (!range) continue;
    const kind = foldKindAt(state, line.from);
    if (!kind) continue;
    ranges.push({ ...range, kind, lineFrom: line.from });
  }
  return ranges;
}

function rangeIsFolded(state: EditorState, range: FoldToggleRange) {
  let folded = false;
  foldedRanges(state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) folded = true;
  });
  return folded;
}

function currentToggleRange(
  state: EditorState,
  lineFrom: number,
  kind: FoldToggleKind,
) {
  return toggleRanges(state).find(
    (range) => range.lineFrom === lineFrom && range.kind === kind,
  ) ?? null;
}

function toggleFold(
  view: CodeMirrorView,
  lineFrom: number,
  kind: FoldToggleKind,
) {
  const range = currentToggleRange(view.state, lineFrom, kind);
  if (!range) return false;
  view.dispatch({
    effects: rangeIsFolded(view.state, range)
      ? unfoldEffect.of({ from: range.from, to: range.to })
      : foldEffect.of({ from: range.from, to: range.to }),
  });
  view.focus();
  return true;
}

class FoldToggleWidget extends WidgetType {
  constructor(
    readonly range: FoldToggleRange,
    readonly collapsed: boolean,
    readonly labels: FoldToggleLabels,
  ) {
    super();
  }

  eq(other: FoldToggleWidget) {
    return this.range.lineFrom === other.range.lineFrom &&
      this.range.kind === other.range.kind &&
      this.collapsed === other.collapsed &&
      JSON.stringify(this.labels) === JSON.stringify(other.labels);
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const button = view.dom.ownerDocument.createElement("button");
    const heading = this.range.kind === "heading";
    const label = heading
      ? this.collapsed
        ? this.labels.expandSection
        : this.labels.collapseSection
      : this.collapsed
        ? this.labels.expandListItem
        : this.labels.collapseListItem;
    button.type = "button";
    button.className = heading
      ? "markra-heading-toggle-button"
      : "markra-list-toggle-button";
    button.dataset.collapsed = String(this.collapsed);
    button.ariaExpanded = String(!this.collapsed);
    button.ariaLabel = label;
    button.title = label;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFold(view, this.range.lineFrom, this.range.kind);
    });
    return button;
  }
}

function toggleDecorations(
  state: EditorState,
  labels: FoldToggleLabels,
): DecorationSet {
  const decorations = toggleRanges(state).flatMap((range) => {
    const collapsed = rangeIsFolded(state, range);
    const className = range.kind === "heading"
      ? "markra-heading-toggle-heading"
      : "markra-list-toggle-item";
    return [
      Decoration.line({
        attributes: {
          "data-fold-collapsed": String(collapsed),
        },
        class: className,
      }).range(range.lineFrom),
      Decoration.widget({
        // Keep gutter-only controls before the document boundary. CodeMirror
        // draws a line-start selection with a strong positive association;
        // placing this widget after the boundary would extend the highlight
        // leftward over the absolutely positioned fold button.
        side: -1,
        widget: new FoldToggleWidget(range, collapsed, labels),
      }).range(range.lineFrom),
    ];
  });
  return Decoration.set(decorations, true);
}

class FoldToggleViewPlugin {
  decorations: DecorationSet;

  constructor(view: CodeMirrorView, readonly labels: FoldToggleLabels) {
    this.decorations = toggleDecorations(view.state, labels);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.transactions.some((transaction) => transaction.effects.length > 0) ||
      syntaxTreeChanged(update.startState, update.state)
    ) {
      this.decorations = toggleDecorations(update.state, this.labels);
    }
  }
}

const foldToggleTheme = EditorView.baseTheme({
  ".markra-heading-toggle-button, .markra-list-toggle-button": {
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "pointer",
    display: "inline-block",
    marginInlineEnd: "0.3em",
    opacity: "0.45",
    padding: "0 0.15em",
  },
  ".markra-heading-toggle-button::before, .markra-list-toggle-button::before": {
    content: '"▾"',
  },
  '.markra-heading-toggle-button[data-collapsed="true"]::before, .markra-list-toggle-button[data-collapsed="true"]::before': {
    content: '"▸"',
  },
});

export function foldTogglePlugin(
  options: FoldTogglePluginOptions = {},
) {
  const labels = { ...defaultLabels, ...options.labels };
  return defineMarkraPlugin({
    id: "markra.fold-toggle",
    extension: [
      ViewPlugin.define(
        (view) => new FoldToggleViewPlugin(view, labels),
        { decorations: (plugin) => plugin.decorations },
      ),
      foldToggleTheme,
    ],
  });
}
