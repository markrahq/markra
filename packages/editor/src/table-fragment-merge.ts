import { ParserReady, SerializerReady, parserCtx, serializerCtx } from "@milkdown/kit/core";
import { Fragment, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";
import { parseGfmTableFragment, type GfmTableAlignment } from "@markra/markdown";
import { TableMap } from "prosemirror-tables";

export type TableFragmentMergeCandidate = {
  fragment: ProseNode;
  fragmentFrom: number;
  fragmentTo: number;
  rows: readonly ProseNode[];
  tableFrom: number;
};

type MarkdownParser = (markdown: string) => ProseNode;
type MarkdownSerializer = (doc: ProseNode) => string;

const defaultMergeLabel = "Merge into table above";
const svgNamespace = "http://www.w3.org/2000/svg";

function tableRowWidth(row: ProseNode) {
  let width = 0;

  row.forEach((cell) => {
    width += Math.max(1, Number(cell.attrs.colspan ?? 1));
  });

  return width;
}

function rowsAreCompatible(table: ProseNode, rows: readonly ProseNode[]) {
  if (rows.length === 0) return false;

  const width = TableMap.get(table).width;
  const rowType = table.type.schema.nodes.table_row;
  if (!rowType) return false;

  return rows.every((row) => row.type === rowType && tableRowWidth(row) === width);
}

export function createTableFragmentMergeTransaction(
  state: EditorState,
  candidate: TableFragmentMergeCandidate
): Transaction | null {
  const table = state.doc.nodeAt(candidate.tableFrom);
  if (!table || table.type.name !== "table") return null;

  const fragmentFrom = candidate.tableFrom + table.nodeSize;
  if (candidate.fragmentFrom !== fragmentFrom) return null;

  const fragment = state.doc.nodeAt(fragmentFrom);
  if (!fragment || fragment.type.name !== "paragraph" || !fragment.eq(candidate.fragment)) return null;

  const fragmentTo = fragmentFrom + fragment.nodeSize;
  if (candidate.fragmentTo !== fragmentTo) return null;
  if (!rowsAreCompatible(table, candidate.rows)) return null;

  const rows = Fragment.fromArray([...candidate.rows]);
  if (!table.canReplace(table.childCount, table.childCount, rows)) return null;

  const mergedTable = table.copy(table.content.append(rows));
  const firstNewRowFrom = candidate.tableFrom + 1 + table.content.size;
  const transaction = state.tr.replaceWith(candidate.tableFrom, fragmentTo, mergedTable);
  const selection = TextSelection.near(transaction.doc.resolve(firstNewRowFrom + 2), 1);

  return transaction.setSelection(selection).scrollIntoView();
}

function tableAlignments(table: ProseNode) {
  const map = TableMap.get(table);
  const alignments: GfmTableAlignment[] = [];

  for (let column = 0; column < map.width; column += 1) {
    const cell = table.nodeAt(map.positionAt(0, column, table));
    const alignment = cell?.attrs.alignment;

    if (alignment === "center" || alignment === "left" || alignment === "right") {
      alignments.push(alignment);
    } else {
      alignments.push(null);
    }
  }

  return alignments;
}

function serializeFragment(doc: ProseNode, fragment: ProseNode, serializeMarkdown: MarkdownSerializer) {
  try {
    const fragmentDocument = doc.type.create(null, Fragment.from(fragment));
    // A standalone paragraph serializer escapes its leading pipe to keep it prose. Restore only
    // that boundary marker so GFM can validate the row while cell-internal escapes stay intact.
    return serializeMarkdown(fragmentDocument)
      .replace(/^(\s*)\\\|/gmu, "$1|")
      .trim();
  } catch {
    return null;
  }
}

function parsedBodyRows(markdown: string, rowCount: number, parseMarkdown: MarkdownParser) {
  try {
    const parsedDocument = parseMarkdown(markdown);
    if (parsedDocument.childCount !== 1) return null;

    const parsedTable = parsedDocument.firstChild;
    if (!parsedTable || parsedTable.type.name !== "table" || parsedTable.childCount !== rowCount + 1) {
      return null;
    }

    const rows: ProseNode[] = [];
    for (let index = 1; index < parsedTable.childCount; index += 1) {
      const row = parsedTable.child(index);
      if (row.type.name !== "table_row") return null;
      rows.push(row);
    }

    return rows;
  } catch {
    return null;
  }
}

function tableFragmentCandidateAt(
  doc: ProseNode,
  tableFrom: number,
  parseMarkdown: MarkdownParser,
  serializeMarkdown: MarkdownSerializer
): TableFragmentMergeCandidate | null {
  const table = doc.nodeAt(tableFrom);
  if (!table || table.type.name !== "table") return null;

  const fragmentFrom = tableFrom + table.nodeSize;
  const fragment = doc.nodeAt(fragmentFrom);
  if (!fragment || fragment.type.name !== "paragraph") return null;

  const source = serializeFragment(doc, fragment, serializeMarkdown);
  if (!source) return null;

  const map = TableMap.get(table);
  const parsedFragment = parseGfmTableFragment(source, map.width, tableAlignments(table));
  if (!parsedFragment) return null;

  const rows = parsedBodyRows(parsedFragment.markdown, parsedFragment.rowCount, parseMarkdown);
  if (!rows || !rowsAreCompatible(table, rows)) return null;

  return {
    fragment,
    fragmentFrom,
    fragmentTo: fragmentFrom + fragment.nodeSize,
    rows,
    tableFrom
  };
}

function tableFragmentCandidates(
  doc: ProseNode,
  parseMarkdown: MarkdownParser,
  serializeMarkdown: MarkdownSerializer
) {
  const candidates: TableFragmentMergeCandidate[] = [];
  let position = 0;

  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (node.type.name === "table") {
      const candidate = tableFragmentCandidateAt(doc, position, parseMarkdown, serializeMarkdown);
      if (candidate) candidates.push(candidate);
    }
    position += node.nodeSize;
  }

  return candidates;
}

function mergeIcon(document: Document) {
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.classList.add("markra-table-fragment-merge-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("viewBox", "0 0 24 24");

  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", "M5 4h14M12 20V8m-5 5 5-5 5 5");
  icon.append(path);

  return icon;
}

function emptyMergeWidget(document: Document) {
  const placeholder = document.createElement("span");
  placeholder.hidden = true;
  placeholder.setAttribute("aria-hidden", "true");
  return placeholder;
}

function createMergeWidget(
  view: EditorView,
  candidate: TableFragmentMergeCandidate,
  label: string,
  parseMarkdown: MarkdownParser,
  serializeMarkdown: MarkdownSerializer
) {
  if (!view.editable) return emptyMergeWidget(view.dom.ownerDocument);

  const document = view.dom.ownerDocument;
  const wrapper = document.createElement("div");
  const button = document.createElement("button");
  const text = document.createElement("span");

  wrapper.className = "markra-table-fragment-merge";
  wrapper.contentEditable = "false";
  wrapper.dataset.tableFrom = String(candidate.tableFrom);

  button.type = "button";
  button.className = "markra-table-fragment-merge-button";
  button.ariaLabel = label;
  button.contentEditable = "false";
  button.draggable = false;

  text.className = "markra-table-fragment-merge-label";
  text.textContent = label;
  button.append(mergeIcon(document), text);
  wrapper.append(button);

  button.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    if (!view.editable || event.button !== 0 || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();

    const currentCandidate = tableFragmentCandidateAt(
      view.state.doc,
      candidate.tableFrom,
      parseMarkdown,
      serializeMarkdown
    );
    if (!currentCandidate) return;

    const transaction = createTableFragmentMergeTransaction(view.state, currentCandidate);
    if (!transaction) return;

    view.dispatch(transaction);
    view.focus();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
  });

  return wrapper;
}

function eventTargetsMergeWidget(event: Event) {
  const element = event.target instanceof Element
    ? event.target
    : event.target instanceof Node
      ? event.target.parentElement
      : null;

  return Boolean(element?.closest(".markra-table-fragment-merge"));
}

export function markraTableFragmentMergePlugin(label = defaultMergeLabel) {
  return $proseAsync(async (ctx) => {
    await Promise.all([ctx.wait(ParserReady), ctx.wait(SerializerReady)]);
    const parseMarkdown = ctx.get(parserCtx);
    const serializeMarkdown = ctx.get(serializerCtx);

    return new Plugin({
      props: {
        decorations(state) {
          const candidates = tableFragmentCandidates(state.doc, parseMarkdown, serializeMarkdown);
          if (candidates.length === 0) return DecorationSet.empty;

          return DecorationSet.create(
            state.doc,
            candidates.map((candidate) =>
              Decoration.widget(
                candidate.fragmentFrom,
                (view) => createMergeWidget(view, candidate, label, parseMarkdown, serializeMarkdown),
                {
                  key: `markra-table-fragment-merge:${candidate.tableFrom}:${candidate.fragmentFrom}`,
                  side: -1,
                  stopEvent: eventTargetsMergeWidget
                }
              )
            )
          );
        }
      }
    });
  });
}
