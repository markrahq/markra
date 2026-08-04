import { syntaxTree } from "@codemirror/language";
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
import { parseGfmTableFragment } from "@markra/markdown";
import { syntaxTreeChanged } from "./changes.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import { readCodeMirrorTableShape } from "./table.ts";

export interface TableFragmentMergePluginOptions {
  label?: string;
}

interface TableFragmentMergeCandidate {
  readonly fragmentFrom: number;
  readonly fragmentTo: number;
  readonly tableFrom: number;
  readonly tableTo: number;
}

const defaultLabel = "Merge into table above";

function candidateAfterTable(
  state: EditorState,
  tableFrom: number,
  tableTo: number,
): TableFragmentMergeCandidate | null {
  const shape = readCodeMirrorTableShape(state.sliceDoc(tableFrom, tableTo));
  if (!shape) return null;

  const tableLine = state.doc.lineAt(tableTo);
  let lineNumber = tableLine.number + 1;
  let foundBlankLine = false;

  while (lineNumber <= state.doc.lines) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim()) break;
    foundBlankLine = true;
    lineNumber += 1;
  }
  if (!foundBlankLine || lineNumber > state.doc.lines) return null;

  const fragmentFrom = state.doc.line(lineNumber).from;
  let fragmentTo = fragmentFrom;
  const rows: string[] = [];
  while (lineNumber <= state.doc.lines) {
    const line = state.doc.line(lineNumber);
    if (!line.text.trim()) break;
    rows.push(line.text);
    fragmentTo = line.to;
    lineNumber += 1;
  }

  const parsed = parseGfmTableFragment(
    rows.join("\n"),
    shape.columnCount,
    shape.alignments,
  );
  if (!parsed) return null;

  return { fragmentFrom, fragmentTo, tableFrom, tableTo };
}

function tableFragmentMergeCandidates(state: EditorState) {
  const candidates: TableFragmentMergeCandidate[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const candidate = candidateAfterTable(state, node.from, node.to);
      if (candidate) candidates.push(candidate);
    },
  });
  return candidates;
}

function currentCandidate(state: EditorState, tableFrom: number) {
  return tableFragmentMergeCandidates(state).find(
    (candidate) => candidate.tableFrom === tableFrom,
  ) ?? null;
}

function firstRowContentOffset(state: EditorState, candidate: TableFragmentMergeCandidate) {
  const source = state.sliceDoc(candidate.fragmentFrom, candidate.fragmentTo);
  return source.search(/[^\s|]/u);
}

function mergeCandidate(view: CodeMirrorView, tableFrom: number) {
  if (view.state.readOnly) return false;
  const candidate = currentCandidate(view.state, tableFrom);
  if (!candidate) return false;

  const contentOffset = firstRowContentOffset(view.state, candidate);
  // Only the blank block boundary is removed. Keeping the row source byte-for-byte preserves
  // escaped pipes and inline Markdown that a parse/serialize round trip could otherwise alter.
  view.dispatch({
    changes: {
      from: candidate.tableTo,
      insert: "\n",
      to: candidate.fragmentFrom,
    },
    selection: {
      anchor: candidate.tableTo + 1 + Math.max(0, contentOffset),
    },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

class TableFragmentMergeWidget extends WidgetType {
  constructor(
    readonly tableFrom: number,
    readonly label: string,
  ) {
    super();
  }

  eq(other: TableFragmentMergeWidget) {
    return this.tableFrom === other.tableFrom && this.label === other.label;
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("span");
    const button = document.createElement("button");
    const icon = document.createElement("span");
    const text = document.createElement("span");

    wrapper.className = "markra-table-fragment-merge";
    wrapper.dataset.tableFrom = String(this.tableFrom);
    button.type = "button";
    button.className = "markra-table-fragment-merge-button";
    button.ariaLabel = this.label;
    button.title = this.label;
    icon.className = "markra-table-fragment-merge-icon";
    icon.ariaHidden = "true";
    icon.textContent = "↑";
    text.className = "markra-table-fragment-merge-label";
    text.textContent = this.label;
    button.append(icon, text);
    wrapper.append(button);

    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      mergeCandidate(view, this.tableFrom);
    });
    return wrapper;
  }
}

function mergeDecorations(state: EditorState, label: string): DecorationSet {
  if (state.readOnly) return Decoration.none;
  return Decoration.set(
    tableFragmentMergeCandidates(state).map((candidate) =>
      Decoration.widget({
        side: -1,
        widget: new TableFragmentMergeWidget(candidate.tableFrom, label),
      }).range(candidate.fragmentFrom),
    ),
    true,
  );
}

const mergeTheme = EditorView.baseTheme({
  ".markra-table-fragment-merge": {
    display: "flex",
    justifyContent: "center",
    padding: "0.2em 0",
  },
  ".markra-table-fragment-merge-button": {
    alignItems: "center",
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    gap: "0.35em",
    opacity: "0.65",
  },
});

class TableFragmentMergeViewPlugin {
  decorations: DecorationSet;

  constructor(view: CodeMirrorView, readonly label: string) {
    this.decorations = mergeDecorations(view.state, label);
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.startState.readOnly !== update.state.readOnly ||
      syntaxTreeChanged(update.startState, update.state)
    ) {
      this.decorations = mergeDecorations(update.state, this.label);
    }
  }
}

export function tableFragmentMergePlugin(
  options: TableFragmentMergePluginOptions = {},
) {
  const label = options.label ?? defaultLabel;
  return defineMarkraPlugin({
    id: "markra.table-fragment-merge",
    extension: [
      ViewPlugin.define(
        (view) => new TableFragmentMergeViewPlugin(view, label),
        { decorations: (plugin) => plugin.decorations },
      ),
      mergeTheme,
    ],
  });
}
