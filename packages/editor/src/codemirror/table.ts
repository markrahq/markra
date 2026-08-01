import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import { createLucideIcon, popoverPosition } from "@markra/shared";
import { Minus, Plus, Trash2 } from "lucide";
import {
  renderInlineMarkdown,
  serializeInlineMarkdown,
  type InlineMarkdownImageDetails,
} from "./inline-markdown.ts";
import type { ImagePreviewPluginOptions } from "./image.ts";
import {
  openMarkraLinkSource,
  type LinksPluginOptions,
} from "./links.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import { getMarkraRenderers, markraRenderer } from "./renderers.ts";

export type CodeMirrorTableAlignment = "center" | "left" | "right" | null;
export type CodeMirrorTableWidthMode = "auto" | "even";

export interface CodeMirrorTableShape {
  readonly alignments: readonly CodeMirrorTableAlignment[];
  readonly columnCount: number;
}

export interface TablePreviewPluginOptions {
  getDocumentKey?: () => string | null | undefined;
  images?: ImagePreviewPluginOptions;
  labels?: Partial<TablePreviewLabels>;
  links?: LinksPluginOptions;
  widthMode?: CodeMirrorTableWidthMode;
}

export interface TablePreviewLabels {
  addColumnRight: string;
  addRowBelow: string;
  adjustTable: string;
  alignCenter: string;
  alignLeft: string;
  alignRight: string;
  columnWidthMode: string;
  deleteColumn: string;
  deleteRow: string;
  deleteTable: string;
  resizeTableTo: string;
  tableColumns: string;
  tableRows: string;
}

interface TableCellPreview {
  readonly from: number;
  readonly source: string;
  readonly to: number;
}

const TABLE_CARET_PLACEHOLDER = "\u200b";

function createVisualTableCaretHost(ownerDocument: Document) {
  const host = ownerDocument.createElement("span");
  host.dataset.markraTableCaretHost = "true";
  const text = ownerDocument.createTextNode(TABLE_CARET_PLACEHOLDER);
  host.append(text);
  return { host, text };
}

interface TablePreview {
  readonly alignments: readonly CodeMirrorTableAlignment[];
  readonly from: number;
  readonly header: readonly TableCellPreview[];
  readonly rows: readonly (readonly TableCellPreview[])[];
  readonly to: number;
}

interface TableEditingSession {
  readonly column: number;
  readonly header: boolean;
  readonly inlineSourceVisible: boolean;
  readonly originalSource: string;
  readonly row: number;
  readonly tableFrom: number;
}

const defaultLabels: TablePreviewLabels = {
  addColumnRight: "Add column to the right",
  addRowBelow: "Add row below",
  adjustTable: "Adjust table",
  alignCenter: "Align table center",
  alignLeft: "Align table left",
  alignRight: "Align table right",
  columnWidthMode: "Column width mode",
  deleteColumn: "Delete column",
  deleteRow: "Delete row",
  deleteTable: "Delete table",
  resizeTableTo: "Resize table to {columns} columns by {rows} rows",
  tableColumns: "Table columns",
  tableRows: "Table rows",
};

const tableSizePickerColumns = 8;
const tableSizePickerRows = 10;
const tableSizePopoverFallbackSize = { height: 248, width: 184 };
const tablePreviewRendererId = "markra.table-preview";
const tableWidthModeStoragePrefix = "markra:table-width-mode";
const tableEditingSessions = new WeakMap<CodeMirrorView, TableEditingSession>();

export function tablePreviewEnabled(state: EditorState) {
  return getMarkraRenderers(state, "Table").some(
    (renderer) => renderer.id === tablePreviewRendererId,
  );
}

function tableWidthModeStorageKey(documentKey: string | null | undefined) {
  const normalizedKey = documentKey?.trim() || "untitled";
  return `${tableWidthModeStoragePrefix}:${encodeURIComponent(normalizedKey)}`;
}

function readStoredWidthMode(
  document: Document,
  documentKey: string | null | undefined,
  fallback: CodeMirrorTableWidthMode,
) {
  try {
    const stored = document.defaultView?.localStorage.getItem(
      tableWidthModeStorageKey(documentKey),
    );
    return stored === "auto" || stored === "even" ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredWidthMode(
  document: Document,
  documentKey: string | null | undefined,
  mode: CodeMirrorTableWidthMode,
) {
  try {
    document.defaultView?.localStorage.setItem(
      tableWidthModeStorageKey(documentKey),
      mode,
    );
  } catch {
    // Storage can be unavailable in embedded or privacy-restricted surfaces.
  }
}

function createTableAlignIcon(
  document: Document,
  alignment: Exclude<CodeMirrorTableAlignment, null>,
) {
  const icon = document.createElement("span");
  icon.className = `markra-table-align-icon markra-table-align-icon-${alignment}`;
  icon.ariaHidden = "true";
  for (let index = 0; index < 3; index += 1) {
    const line = document.createElement("span");
    line.className = "markra-table-align-icon-line";
    icon.append(line);
  }
  return icon;
}

function createTableSizeIcon(document: Document) {
  const icon = document.createElement("span");
  icon.className = "markra-table-size-icon";
  icon.ariaHidden = "true";
  for (let index = 0; index < 4; index += 1) {
    const square = document.createElement("span");
    square.className = "markra-table-size-icon-square";
    icon.append(square);
  }
  return icon;
}

function createTableWidthIcon(document: Document) {
  const icon = document.createElement("span");
  icon.className = "markra-table-width-icon";
  icon.ariaHidden = "true";
  for (const className of [
    "markra-table-width-edge",
    "markra-table-width-arrow",
    "markra-table-width-letter",
    "markra-table-width-arrow",
    "markra-table-width-edge",
  ]) {
    const part = document.createElement("span");
    part.className = className;
    if (className === "markra-table-width-letter") part.textContent = "A";
    icon.append(part);
  }
  return icon;
}

function trimCellRange(line: string, from: number, to: number) {
  while (from < to && /\s/u.test(line[from] ?? "")) from += 1;
  while (to > from && /\s/u.test(line[to - 1] ?? "")) to -= 1;
  return { from, to };
}

function tableCells(line: string, lineFrom: number) {
  let rowFrom = line.search(/\S/u);
  if (rowFrom < 0) rowFrom = 0;
  let rowTo = line.length;
  while (rowTo > rowFrom && /\s/u.test(line[rowTo - 1] ?? "")) rowTo -= 1;
  if (line[rowFrom] === "|") rowFrom += 1;
  if (line[rowTo - 1] === "|") rowTo -= 1;

  const cells: TableCellPreview[] = [];
  let cellFrom = rowFrom;
  let escaped = false;
  const pushCell = (cellTo: number) => {
    const trimmed = trimCellRange(line, cellFrom, cellTo);
    const source = line.slice(trimmed.from, trimmed.to);
    cells.push({
      from: lineFrom + trimmed.from,
      source,
      to: lineFrom + trimmed.to,
    });
  };

  for (let cursor = rowFrom; cursor < rowTo; cursor += 1) {
    const character = line[cursor];
    if (character === "|" && !escaped) {
      pushCell(cursor);
      cellFrom = cursor + 1;
      continue;
    }
    escaped = character === "\\" ? !escaped : false;
  }
  pushCell(rowTo);
  return cells;
}

const tableSeparatorPattern = /^:?-+:?$/u;

function alignmentFromSeparator(cell: string): CodeMirrorTableAlignment {
  const source = cell.trim();
  if (!tableSeparatorPattern.test(source)) return null;
  if (source.startsWith(":") && source.endsWith(":")) return "center";
  if (source.endsWith(":")) return "right";
  if (source.startsWith(":")) return "left";
  return null;
}

function tablePreview(
  source: string,
  from: number,
  to: number,
): TablePreview | null {
  const lines = source.split(/\r?\n/u);
  if (lines.length < 2) return null;

  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  const header = tableCells(lines[0] ?? "", from + (lineOffsets[0] ?? 0));
  const separators = tableCells(lines[1] ?? "", from + (lineOffsets[1] ?? 0));
  if (
    header.length === 0 ||
    separators.length !== header.length ||
    separators.some((cell) => !tableSeparatorPattern.test(cell.source.trim()))
  ) {
    return null;
  }

  return {
    alignments: separators.map((cell) => alignmentFromSeparator(cell.source)),
    from,
    header,
    rows: lines.slice(2).filter((line) => line.trim()).map((line, index) => {
      const cells = tableCells(
        line,
        from + (lineOffsets[index + 2] ?? 0),
      );
      return Array.from({ length: header.length }, (_, column) =>
        cells[column] ?? {
          from: from + (lineOffsets[index + 2] ?? 0) + line.length,
          source: "",
          to: from + (lineOffsets[index + 2] ?? 0) + line.length,
        },
      );
    }),
    to,
  };
}

export function readCodeMirrorTableShape(source: string): CodeMirrorTableShape | null {
  const preview = tablePreview(source, 0, source.length);
  if (!preview) return null;
  return {
    alignments: preview.alignments,
    columnCount: preview.header.length,
  };
}

function separatorFor(alignment: CodeMirrorTableAlignment) {
  if (alignment === "center") return ":---:";
  if (alignment === "right") return "---:";
  if (alignment === "left") return ":---";
  return "---";
}

function serializeRow(cells: readonly string[]) {
  return `| ${cells.join(" | ")} |`;
}

function serializeTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  alignments: readonly CodeMirrorTableAlignment[],
) {
  return [
    serializeRow(header),
    serializeRow(alignments.map(separatorFor)),
    ...rows.map(serializeRow),
  ].join("\n");
}

function replaceTable(
  view: CodeMirrorView,
  preview: TablePreview,
  header: readonly string[],
  rows: readonly (readonly string[])[],
  alignments: readonly CodeMirrorTableAlignment[],
  focus = true,
) {
  if (view.state.readOnly) return false;
  view.dispatch({
    changes: {
      from: preview.from,
      insert: serializeTable(header, rows, alignments),
      to: preview.to,
    },
  });
  if (focus) view.focus();
  return true;
}

function tableValues(preview: TablePreview) {
  return {
    alignments: [...preview.alignments],
    header: preview.header.map((cell) => cell.source),
    rows: preview.rows.map((row) => row.map((cell) => cell.source)),
  };
}

function addRow(view: CodeMirrorView, preview: TablePreview) {
  const values = tableValues(preview);
  const rowIndex = values.rows.length;
  values.rows.push(Array.from({ length: values.header.length }, () => ""));
  const changed = replaceTable(
    view,
    preview,
    values.header,
    values.rows,
    values.alignments,
    false,
  );
  if (changed) focusVisualTableCell(view, preview.from, rowIndex, 0, false, 0);
  return changed;
}

function addColumn(view: CodeMirrorView, preview: TablePreview) {
  const values = tableValues(preview);
  const columnIndex = values.header.length;
  values.header.push("");
  values.alignments.push(null);
  for (const row of values.rows) row.push("");
  const changed = replaceTable(
    view,
    preview,
    values.header,
    values.rows,
    values.alignments,
    false,
  );
  if (changed) focusVisualTableCell(view, preview.from, -1, columnIndex, true, 0);
  return changed;
}

function alignTable(
  view: CodeMirrorView,
  preview: TablePreview,
  alignment: Exclude<CodeMirrorTableAlignment, null>,
) {
  const values = tableValues(preview);
  values.alignments.fill(alignment);
  return replaceTable(view, preview, values.header, values.rows, values.alignments);
}

function deleteRow(view: CodeMirrorView, preview: TablePreview, rowIndex: number) {
  const values = tableValues(preview);
  if (rowIndex < 0 || rowIndex >= values.rows.length) return false;
  values.rows.splice(rowIndex, 1);
  const changed = replaceTable(
    view,
    preview,
    values.header,
    values.rows,
    values.alignments,
    false,
  );
  if (changed) {
    const nextRow = Math.min(rowIndex, values.rows.length - 1);
    focusVisualTableCell(
      view,
      preview.from,
      nextRow,
      0,
      nextRow < 0,
      0,
    );
  }
  return changed;
}

function deleteColumn(
  view: CodeMirrorView,
  preview: TablePreview,
  columnIndex: number,
) {
  const values = tableValues(preview);
  if (values.header.length <= 1 || columnIndex < 0 || columnIndex >= values.header.length) {
    return false;
  }
  values.header.splice(columnIndex, 1);
  values.alignments.splice(columnIndex, 1);
  for (const row of values.rows) row.splice(columnIndex, 1);
  const changed = replaceTable(
    view,
    preview,
    values.header,
    values.rows,
    values.alignments,
    false,
  );
  if (changed) {
    focusVisualTableCell(
      view,
      preview.from,
      -1,
      Math.min(columnIndex, values.header.length - 1),
      true,
      0,
    );
  }
  return changed;
}

function deleteTable(view: CodeMirrorView, preview: TablePreview) {
  if (view.state.readOnly) return false;
  const consumeNewline = view.state.sliceDoc(preview.to, preview.to + 2) === "\n\n";
  view.dispatch({
    changes: {
      from: preview.from,
      insert: "",
      to: preview.to + (consumeNewline ? 1 : 0),
    },
  });
  view.focus();
  return true;
}

function resizedValues(
  preview: TablePreview,
  columnCount: number,
  totalRowCount: number,
) {
  const values = tableValues(preview);
  const columns = Math.max(
    1,
    Math.min(tableSizePickerColumns, Math.trunc(columnCount)),
  );
  const totalRows = Math.max(
    1,
    Math.min(tableSizePickerRows, Math.trunc(totalRowCount)),
  );
  const header = Array.from(
    { length: columns },
    (_, index) => values.header[index] ?? "",
  );
  const alignments = Array.from(
    { length: columns },
    (_, index) => values.alignments[index] ?? null,
  );
  const rows = Array.from({ length: Math.max(0, totalRows - 1) }, (_, row) =>
    Array.from(
      { length: columns },
      (_, column) => values.rows[row]?.[column] ?? "",
    ));
  return { alignments, header, rows };
}

function resizeTable(
  view: CodeMirrorView,
  preview: TablePreview,
  columns: number,
  rows: number,
) {
  if (view.state.readOnly) return false;
  const values = resizedValues(preview, columns, rows);
  const source = serializeTable(
    values.header,
    values.rows,
    values.alignments,
  );
  view.dispatch({
    changes: { from: preview.from, insert: source, to: preview.to },
    scrollIntoView: true,
  });
  const lastRow = values.rows.length - 1;
  focusVisualTableCell(
    view,
    preview.from,
    lastRow,
    values.header.length - 1,
    lastRow < 0,
    0,
  );
  return true;
}

function formatTableSizeLabel(
  labels: TablePreviewLabels,
  columns: number,
  rows: number,
) {
  return labels.resizeTableTo
    .replace("{columns}", String(columns))
    .replace("{rows}", String(rows));
}

function createControl(
  document: Document,
  className: string,
  label: string,
  action: () => unknown,
  icon?: Node,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `markra-table-control ${className}`;
  button.ariaLabel = label;
  button.title = label;
  button.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  if (icon) button.append(icon);
  return button;
}

function normalizedTableAlignment(preview: TablePreview) {
  const alignments = new Set(
    preview.alignments.map((alignment) => alignment ?? "left"),
  );
  return alignments.size === 1 ? [...alignments][0] : null;
}

function applyWidthModeToTableControls(
  view: CodeMirrorView,
  mode: CodeMirrorTableWidthMode,
) {
  for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
    ".cm-markra-table-wrap",
  )) {
    wrapper.dataset.widthMode = mode;
    const table = wrapper.querySelector<HTMLTableElement>(".cm-markra-table");
    if (table) {
      table.dataset.widthMode = mode;
      table.classList.toggle("markra-table-width-auto", mode === "auto");
    }
    const button = wrapper.querySelector<HTMLButtonElement>(
      ".markra-table-width-button",
    );
    if (button) {
      button.ariaPressed = String(mode === "auto");
      button.dataset.mode = mode;
    }
  }
}

function visualTableCellHasPlaceholderBreak(cell: HTMLTableCellElement) {
  return (
    cell.childNodes.length === 1 &&
    cell.firstElementChild?.tagName === "BR" &&
    cell.firstElementChild.getAttribute("data-markra-source-break") !== "true"
  );
}

function visualTableCellSource(cell: HTMLTableCellElement) {
  // Browsers keep a lone <br> as the caret placeholder after the last
  // character is deleted. Persisted line breaks are tagged during rendering,
  // so only the browser-owned placeholder represents an empty cell.
  if (visualTableCellHasPlaceholderBreak(cell)) return "";
  return serializeInlineMarkdown(cell);
}

function replaceVisualTableCell(
  view: CodeMirrorView,
  preview: TablePreview,
  rowIndex: number,
  columnIndex: number,
  header: boolean,
  source: string,
) {
  const values = tableValues(preview);
  const currentSource = header
    ? values.header[columnIndex]
    : values.rows[rowIndex]?.[columnIndex];
  if (currentSource === source) return false;

  if (header) {
    values.header[columnIndex] = source;
  } else {
    const row = values.rows[rowIndex];
    if (!row) return false;
    row[columnIndex] = source;
  }

  return replaceTable(
    view,
    preview,
    values.header,
    values.rows,
    values.alignments,
    false,
  );
}

function tableCellCaretOffset(cell: HTMLTableCellElement) {
  const selection = cell.ownerDocument.getSelection();
  const anchorNode = selection?.anchorNode;
  if (!selection || !anchorNode || !cell.contains(anchorNode)) {
    return cell.textContent?.length ?? 0;
  }

  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell);
  range.setEnd(anchorNode, selection.anchorOffset);
  return range.toString().replaceAll(TABLE_CARET_PLACEHOLDER, "").length;
}

function activeVisualTableCell(
  view: CodeMirrorView,
  table: HTMLTableElement,
) {
  const activeElement = table.ownerDocument.activeElement;
  if (
    activeElement instanceof HTMLTableCellElement &&
    table.contains(activeElement)
  ) {
    // Safari can leave its native range in the prior cell after Tab moves
    // focus, so the focused cell is the authoritative input destination.
    return activeElement;
  }

  const selectionNode = table.ownerDocument.getSelection()?.anchorNode;
  const selectionElement =
    selectionNode instanceof Element ? selectionNode : selectionNode?.parentElement;
  const selectedCell = selectionElement?.closest<HTMLTableCellElement>("th, td");
  if (selectedCell && table.contains(selectedCell)) return selectedCell;

  // WebKit can lift the selection to the row/table after deleting the final
  // character. The editing session still identifies the cell that must sync.
  const session = tableEditingSessions.get(view);
  const wrapper = table.closest<HTMLElement>(".cm-markra-table-wrap");
  if (
    !session ||
    wrapper?.dataset.tableFrom !== String(session.tableFrom)
  ) {
    return null;
  }
  return table.querySelector<HTMLTableCellElement>(
    `[data-table-row="${session.row}"]` +
      `[data-table-column="${session.column}"]` +
      `[data-table-header="${String(session.header)}"]`,
  );
}

function placeVisualTableCellCaret(
  cell: HTMLTableCellElement,
  caretOffset: number,
) {
  cell.focus();
  const walker = cell.ownerDocument.createTreeWalker(
    cell,
    NodeFilter.SHOW_TEXT,
  );
  let textNode = walker.nextNode();
  let remaining = caretOffset;
  while (
    textNode &&
    remaining > (textNode.textContent?.length ?? 0)
  ) {
    remaining -= textNode.textContent?.length ?? 0;
    textNode = walker.nextNode();
  }
  // WebKit may place input outside an empty table cell when the range is
  // anchored on the <th>/<td> itself, so always provide a text caret host.
  if (!textNode) {
    textNode = cell.ownerDocument.createTextNode("");
    if (visualTableCellHasPlaceholderBreak(cell)) {
      cell.replaceChildren(textNode);
    } else {
      cell.append(textNode);
    }
  }
  const selection = cell.ownerDocument.getSelection();
  if (!selection) return;
  const range = cell.ownerDocument.createRange();
  range.setStart(
    textNode,
    Math.min(remaining, textNode.textContent?.length ?? 0),
  );
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function repairVisualTableCellSelection(
  view: CodeMirrorView,
  table: HTMLTableElement,
) {
  const cell = activeVisualTableCell(view, table);
  const selectionNode = table.ownerDocument.getSelection()?.anchorNode;
  if (cell && (!selectionNode || !cell.contains(selectionNode))) {
    placeVisualTableCellCaret(cell, tableCellCaretOffset(cell));
  }
}

function moveVisualTableCellFocus(
  view: CodeMirrorView,
  table: HTMLTableElement,
  backward: boolean,
) {
  const cell = activeVisualTableCell(view, table);
  if (!cell) return false;

  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("th, td"),
  );
  const target = cells[cells.indexOf(cell) + (backward ? -1 : 1)];
  if (!target) return false;

  placeVisualTableCellCaret(target, tableCellCaretOffset(target));
  return true;
}

export function focusVisualTableCell(
  view: CodeMirrorView,
  tableFrom: number,
  rowIndex: number,
  columnIndex: number,
  header: boolean,
  caretOffset: number,
  lineBreakIndex?: number,
) {
  queueMicrotask(() => {
    if (!view.dom.isConnected) return;
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      `.cm-markra-table-wrap[data-table-from="${tableFrom}"] ` +
        `[data-table-row="${rowIndex}"][data-table-column="${columnIndex}"]` +
        `[data-table-header="${String(header)}"]`,
    );
    if (!cell) return;

    const lineBreak = lineBreakIndex === undefined
      ? undefined
      : cell.querySelectorAll<HTMLBRElement>(
          'br[data-markra-source-break="true"]',
        )[lineBreakIndex];
    if (!lineBreak) {
      placeVisualTableCellCaret(cell, caretOffset);
      return;
    }

    cell.focus();
    const caretHost = createVisualTableCaretHost(cell.ownerDocument);
    lineBreak.after(caretHost.host);
    const selection = cell.ownerDocument.getSelection();
    if (!selection) return;
    const range = cell.ownerDocument.createRange();
    range.setStart(caretHost.text, TABLE_CARET_PLACEHOLDER.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function insertVisualTableCellLineBreak(
  view: CodeMirrorView,
  preview: TablePreview,
  cell: HTMLTableCellElement,
  rowIndex: number,
  columnIndex: number,
  header: boolean,
) {
  const selection = cell.ownerDocument.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !cell.contains(range.commonAncestorContainer)) {
    placeVisualTableCellCaret(cell, tableCellCaretOffset(cell));
    range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  }
  if (!selection || !range) return;

  range.deleteContents();
  const lineBreak = cell.ownerDocument.createElement("br");
  lineBreak.dataset.markraSourceBreak = "true";
  range.insertNode(lineBreak);
  const caretHost = createVisualTableCaretHost(cell.ownerDocument);
  lineBreak.after(caretHost.host);
  range.setStart(caretHost.text, TABLE_CARET_PLACEHOLDER.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  const lineBreakIndex = Array.from(
    cell.querySelectorAll<HTMLBRElement>(
      'br[data-markra-source-break="true"]',
    ),
  ).indexOf(lineBreak);
  const changed = replaceVisualTableCell(
    view,
    preview,
    rowIndex,
    columnIndex,
    header,
    visualTableCellSource(cell),
  );
  if (changed) {
    focusVisualTableCell(
      view,
      preview.from,
      rowIndex,
      columnIndex,
      header,
      0,
      lineBreakIndex,
    );
  }
}

function syncVisualTableCell(
  view: CodeMirrorView,
  preview: TablePreview,
  cell: HTMLTableCellElement,
) {
  if (view.state.readOnly) return;

  const rowIndex = Number(cell.dataset.tableRow);
  const columnIndex = Number(cell.dataset.tableColumn);
  const header = cell.dataset.tableHeader === "true";
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;

  const caretOffset = tableCellCaretOffset(cell);
  const changed = replaceVisualTableCell(
    view,
    preview,
    rowIndex,
    columnIndex,
    header,
    visualTableCellSource(cell),
  );
  const selectionNode = cell.ownerDocument.getSelection()?.anchorNode;
  if (changed || !selectionNode || !cell.contains(selectionNode)) {
    focusVisualTableCell(
      view,
      preview.from,
      rowIndex,
      columnIndex,
      header,
      caretOffset,
    );
  }
}

function revealVisualTableInlineSource(
  cell: HTMLTableCellElement,
  element: HTMLElement,
  markdown: string | undefined,
) {
  if (!markdown) return false;
  const source = cell.ownerDocument.createTextNode(markdown);
  const icon = element.nextElementSibling;
  if (icon?.classList.contains("markra-live-link-icon")) icon.remove();
  element.replaceWith(source);
  cell.focus();
  const selection = cell.ownerDocument.getSelection();
  if (selection) {
    const range = cell.ownerDocument.createRange();
    range.setStart(source, Math.min(1, markdown.length));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}

function renderVisualTableCell(
  view: CodeMirrorView,
  cell: HTMLTableCellElement,
  source: string,
  images: ImagePreviewPluginOptions | undefined,
  links: LinksPluginOptions | undefined,
) {
  const imageResolver = images?.resolveSource;
  const linkResolver = links?.resolveTarget;
  renderInlineMarkdown(cell, source, {
    ...(imageResolver
      ? {
          resolveImageSource: (details: InlineMarkdownImageDetails) =>
            imageResolver({ ...details, state: view.state, view }),
        }
      : {}),
    ...(linkResolver
      ? {
          resolveLinkTarget: (linkSource: string) =>
            linkResolver({ source: linkSource, state: view.state, view }),
        }
      : {}),
  });
}

function appendCell(
  view: CodeMirrorView,
  row: HTMLTableRowElement,
  cellPreview: TableCellPreview,
  alignment: CodeMirrorTableAlignment,
  header: boolean,
  preview: TablePreview,
  rowIndex: number,
  columnIndex: number,
  images: ImagePreviewPluginOptions | undefined,
  links: LinksPluginOptions | undefined,
) {
  const cell = row.ownerDocument.createElement(header ? "th" : "td");
  const currentSession = tableEditingSessions.get(view);
  const keepInlineSourceVisible =
    currentSession?.tableFrom === preview.from &&
    currentSession.row === rowIndex &&
    currentSession.column === columnIndex &&
    currentSession.header === header &&
    currentSession.inlineSourceVisible;
  if (keepInlineSourceVisible) cell.textContent = cellPreview.source;
  else renderVisualTableCell(view, cell, cellPreview.source, images, links);
  cell.tabIndex = view.state.readOnly ? -1 : 0;
  cell.dataset.tableColumn = String(columnIndex);
  cell.dataset.tableHeader = String(header);
  cell.dataset.tableRow = String(rowIndex);
  if (alignment) cell.style.textAlign = alignment;
  cell.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest<HTMLElement>(
      "[data-markra-link-markdown]",
    );
    if (link && cell.contains(link)) {
      const source = link.dataset.markraLinkSource;
      const modifier = event.metaKey || event.ctrlKey;
      const handled = modifier
        ? Boolean(source && links && openMarkraLinkSource(view, source, links))
        : revealVisualTableInlineSource(
            cell,
            link,
            link.dataset.markraLinkMarkdown,
          );
      if (handled && !modifier) {
        tableEditingSessions.set(view, {
          column: columnIndex,
          header,
          inlineSourceVisible: true,
          originalSource: cellPreview.source,
          row: rowIndex,
          tableFrom: preview.from,
        });
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const image = target?.closest<HTMLElement>(
      "[data-markra-image-markdown]",
    );
    if (image && cell.contains(image)) {
      const handled = revealVisualTableInlineSource(
        cell,
        image,
        image.dataset.markraImageMarkdown,
      );
      if (handled) {
        tableEditingSessions.set(view, {
          column: columnIndex,
          header,
          inlineSourceVisible: true,
          originalSource: cellPreview.source,
          row: rowIndex,
          tableFrom: preview.from,
        });
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.ctrlKey) return;
    event.stopPropagation();
  });
  cell.addEventListener("focus", () => {
    const current = tableEditingSessions.get(view);
    if (
      current?.tableFrom === preview.from &&
      current.row === rowIndex &&
      current.column === columnIndex &&
      current.header === header
    ) {
      return;
    }
    tableEditingSessions.set(view, {
      column: columnIndex,
      header,
      inlineSourceVisible: false,
      originalSource: cellPreview.source,
      row: rowIndex,
      tableFrom: preview.from,
    });
  });
  cell.addEventListener("blur", () => {
    cell.ownerDocument.defaultView?.setTimeout(() => {
      const activeCell = cell.ownerDocument.activeElement;
      const session = tableEditingSessions.get(view);
      if (
        activeCell instanceof HTMLTableCellElement &&
        activeCell.dataset.tableRow === String(rowIndex) &&
        activeCell.dataset.tableColumn === String(columnIndex) &&
        activeCell.dataset.tableHeader === String(header)
      ) {
        return;
      }
      if (
        session?.tableFrom === preview.from &&
        session.row === rowIndex &&
        session.column === columnIndex &&
        session.header === header
      ) {
        tableEditingSessions.delete(view);
        if (session.inlineSourceVisible && cell.isConnected) {
          renderVisualTableCell(view, cell, cellPreview.source, images, links);
        }
      }
    }, 0);
  });
  cell.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      insertVisualTableCellLineBreak(
        view,
        preview,
        cell,
        rowIndex,
        columnIndex,
        header,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const session = tableEditingSessions.get(view);
      tableEditingSessions.delete(view);
      if (session?.inlineSourceVisible) {
        renderVisualTableCell(
          view,
          cell,
          visualTableCellSource(cell),
          images,
          links,
        );
      }
      view.focus();
      return;
    }
    if (event.key !== "Escape") return;

    event.preventDefault();
    event.stopPropagation();
    const session = tableEditingSessions.get(view);
    tableEditingSessions.delete(view);
    if (session) {
      const changed = replaceVisualTableCell(
        view,
        preview,
        rowIndex,
        columnIndex,
        header,
        session.originalSource,
      );
      if (!changed && session.inlineSourceVisible) {
        renderVisualTableCell(view, cell, session.originalSource, images, links);
      }
    }
    view.focus();
  });
  row.append(cell);
}

class TableWidget extends WidgetType {
  private sizeButton: HTMLButtonElement | null = null;
  private sizePopover: HTMLElement | null = null;

  constructor(
    readonly preview: TablePreview,
    readonly labels: TablePreviewLabels,
    readonly defaultWidthMode: CodeMirrorTableWidthMode,
    readonly getDocumentKey: () => string | null | undefined,
    readonly images: ImagePreviewPluginOptions | undefined,
    readonly links: LinksPluginOptions | undefined,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      JSON.stringify(this.preview) === JSON.stringify(other.preview) &&
      this.defaultWidthMode === other.defaultWidthMode &&
      this.images === other.images &&
      this.links === other.links &&
      JSON.stringify(this.labels) === JSON.stringify(other.labels)
    );
  }

  ignoreEvent() {
    return true;
  }

  private closeSizePicker = () => {
    const document = this.sizePopover?.ownerDocument;
    this.sizePopover?.remove();
    this.sizePopover = null;
    if (this.sizeButton) this.sizeButton.ariaExpanded = "false";
    document?.removeEventListener(
      "mousedown",
      this.handleDocumentMouseDown,
      true,
    );
  };

  private handleDocumentMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (
      target instanceof Node &&
      (this.sizeButton?.contains(target) || this.sizePopover?.contains(target))
    ) {
      return;
    }
    this.closeSizePicker();
  };

  private openSizePicker(
    view: CodeMirrorView,
    anchor: HTMLButtonElement,
  ) {
    if (this.sizePopover) {
      this.closeSizePicker();
      return;
    }

    const document = view.dom.ownerDocument;
    const popover = document.createElement("div");
    const grid = document.createElement("div");
    const footer = document.createElement("div");
    const columnsInput = document.createElement("input");
    const rowsInput = document.createElement("input");
    const separator = document.createElement("span");
    const currentColumns = Math.min(
      this.preview.header.length,
      tableSizePickerColumns,
    );
    const currentRows = Math.min(
      this.preview.rows.length + 1,
      tableSizePickerRows,
    );

    popover.className = "markra-table-size-popover";
    popover.setAttribute("role", "dialog");
    popover.ariaLabel = this.labels.adjustTable;
    grid.className = "markra-table-size-grid";
    footer.className = "markra-table-size-footer";
    columnsInput.className = "markra-table-size-input";
    columnsInput.type = "number";
    columnsInput.min = "1";
    columnsInput.max = String(tableSizePickerColumns);
    columnsInput.value = String(currentColumns);
    columnsInput.ariaLabel = this.labels.tableColumns;
    rowsInput.className = "markra-table-size-input";
    rowsInput.type = "number";
    rowsInput.min = "1";
    rowsInput.max = String(tableSizePickerRows);
    rowsInput.value = String(currentRows);
    rowsInput.ariaLabel = this.labels.tableRows;
    separator.className = "markra-table-size-separator";
    separator.textContent = "x";

    const updatePendingSize = (columns: number, rows: number) => {
      columnsInput.value = String(columns);
      rowsInput.value = String(rows);
      for (const cell of grid.querySelectorAll<HTMLButtonElement>(
        ".markra-table-size-cell",
      )) {
        const active =
          Number(cell.dataset.columns) <= columns &&
          Number(cell.dataset.rows) <= rows;
        cell.ariaPressed = String(active);
        cell.classList.toggle("markra-table-size-cell-active", active);
      }
    };

    const applySize = (columns: number, rows: number) => {
      if (resizeTable(view, this.preview, columns, rows)) {
        this.closeSizePicker();
      }
    };
    for (let row = 1; row <= tableSizePickerRows; row += 1) {
      for (let column = 1; column <= tableSizePickerColumns; column += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "markra-table-size-cell";
        cell.ariaLabel = formatTableSizeLabel(this.labels, column, row);
        cell.dataset.columns = String(column);
        cell.dataset.rows = String(row);
        cell.addEventListener("mouseenter", () => {
          updatePendingSize(column, row);
        });
        cell.addEventListener("focus", () => {
          updatePendingSize(column, row);
        });
        cell.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          applySize(column, row);
        });
        grid.append(cell);
      }
    }

    const handleInputKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        applySize(Number(columnsInput.value), Number(rowsInput.value));
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.closeSizePicker();
        view.focus();
      }
    };
    columnsInput.addEventListener("keydown", handleInputKeyDown);
    rowsInput.addEventListener("keydown", handleInputKeyDown);
    footer.append(columnsInput, separator, rowsInput);
    popover.append(grid, footer);
    document.body.append(popover);
    updatePendingSize(currentColumns, currentRows);

    const windowTarget = document.defaultView;
    const position = popoverPosition(
      anchor.getBoundingClientRect(),
      {
        height: popover.offsetHeight || tableSizePopoverFallbackSize.height,
        width: popover.offsetWidth || tableSizePopoverFallbackSize.width,
      },
      {
        height: windowTarget?.innerHeight ?? 768,
        width: windowTarget?.innerWidth ?? 1024,
      },
    );
    popover.style.left = `${position.left}px`;
    popover.style.maxHeight = `${position.maxHeight}px`;
    popover.style.overflowY = "auto";
    popover.style.position = "fixed";
    popover.style.top = `${position.top}px`;
    anchor.ariaExpanded = "true";
    document.addEventListener("mousedown", this.handleDocumentMouseDown, true);
    this.sizePopover = popover;
  }

  destroy(dom: HTMLElement) {
    dom.ownerDocument.removeEventListener(
      "mousedown",
      this.handleDocumentMouseDown,
      true,
    );
    this.closeSizePicker();
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("span");
    const tableScroll = document.createElement("span");
    const alignControls = document.createElement("span");
    const sizeControls = document.createElement("span");
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const body = document.createElement("tbody");
    const activeAlignment = normalizedTableAlignment(this.preview);
    const tableAlignment = activeAlignment ?? "left";
    const widthMode = readStoredWidthMode(
      document,
      this.getDocumentKey(),
      this.defaultWidthMode,
    );
    let hoveredColumn = 0;
    let hoveredRow = 0;
    let composing = false;

    wrapper.className =
      "cm-markra-table-wrap tableWrapper markra-table-controls-wrapper";
    wrapper.dataset.tableFrom = String(this.preview.from);
    wrapper.dataset.tableAlignment = tableAlignment;
    wrapper.dataset.widthMode = widthMode;
    tableScroll.className = "markra-table-scroll";
    tableScroll.dataset.tableAlignment = tableAlignment;
    alignControls.className = "markra-table-align-controls";
    sizeControls.className = "markra-table-size-controls";
    table.className = "cm-markra-table";
    // Individual contenteditable cells trap native ranges inside one cell.
    // One shared editing host lets drag selections cross the complete table.
    table.setAttribute("contenteditable", String(!view.state.readOnly));
    table.dataset.tableAlignment = tableAlignment;
    table.dataset.widthMode = widthMode;
    table.classList.toggle("markra-table-width-auto", widthMode === "auto");
    table.addEventListener("keydown", (event) => {
      if (
        event.key !== "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !moveVisualTableCellFocus(view, table, event.shiftKey)
      ) {
        return;
      }
      // WebKit preserves the old editing position during native Tab focus
      // navigation, so move the caret before its next insertion begins.
      event.preventDefault();
      event.stopPropagation();
    });
    // Browsers target editing events at the shared contenteditable table host,
    // so cell-level listeners miss real input even though the cell DOM changes.
    table.addEventListener("beforeinput", (event) => {
      if (event instanceof InputEvent && event.isComposing) return;
      repairVisualTableCellSelection(view, table);
    });
    table.addEventListener("compositionstart", (event) => {
      event.stopPropagation();
      repairVisualTableCellSelection(view, table);
      composing = true;
    });
    table.addEventListener("compositionend", (event) => {
      event.stopPropagation();
      composing = false;
      const cell = activeVisualTableCell(view, table);
      if (cell) syncVisualTableCell(view, this.preview, cell);
    });
    table.addEventListener("input", (event) => {
      event.stopPropagation();
      // Replacing the widget mid-composition cancels native CJK input, so commit only after compositionend.
      if (composing || (event instanceof InputEvent && event.isComposing)) return;
      const cell = activeVisualTableCell(view, table);
      if (cell) syncVisualTableCell(view, this.preview, cell);
    });

    const sizeButton = document.createElement("button");
    sizeButton.type = "button";
    sizeButton.className = "markra-table-control markra-table-size-button";
    sizeButton.ariaLabel = this.labels.adjustTable;
    sizeButton.ariaExpanded = "false";
    sizeButton.title = this.labels.adjustTable;
    sizeButton.append(createTableSizeIcon(document));
    sizeButton.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
    });
    sizeButton.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      this.openSizePicker(view, sizeButton);
    });
    this.sizeButton = sizeButton;

    const alignButtons = (["left", "center", "right"] as const).map(
      (alignment) => {
        const label =
          alignment === "left"
            ? this.labels.alignLeft
            : alignment === "center"
              ? this.labels.alignCenter
              : this.labels.alignRight;
        const button = createControl(
          document,
          `markra-table-align-button markra-table-align-${alignment}`,
          label,
          () => alignTable(view, this.preview, alignment),
          createTableAlignIcon(document, alignment),
        );
        button.dataset.alignment = alignment;
        button.ariaPressed = String(alignment === activeAlignment);
        return button;
      },
    );

    let widthModeButton: HTMLButtonElement;
    const toggleWidthMode = () => {
      const currentMode =
        widthModeButton.dataset.mode === "auto" ? "auto" : "even";
      const nextMode = currentMode === "auto" ? "even" : "auto";
      writeStoredWidthMode(document, this.getDocumentKey(), nextMode);
      applyWidthModeToTableControls(view, nextMode);
    };
    widthModeButton = createControl(
      document,
      "markra-table-width-button",
      this.labels.columnWidthMode,
      toggleWidthMode,
      createTableWidthIcon(document),
    );
    widthModeButton.ariaPressed = String(widthMode === "auto");
    widthModeButton.dataset.mode = widthMode;
    widthModeButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggleWidthMode();
    });

    const deleteTableButton = createControl(
      document,
      "markra-table-delete-table",
      this.labels.deleteTable,
      () => deleteTable(view, this.preview),
      createLucideIcon(document, Trash2, "markra-table-control-icon"),
    );
    const addColumnButton = createControl(
      document,
      "markra-table-add-column",
      this.labels.addColumnRight,
      () => addColumn(view, this.preview),
      createLucideIcon(document, Plus, "markra-table-control-icon"),
    );
    const addRowButton = createControl(
      document,
      "markra-table-add-row",
      this.labels.addRowBelow,
      () => addRow(view, this.preview),
      createLucideIcon(document, Plus, "markra-table-control-icon"),
    );
    const deleteColumnButton = createControl(
      document,
      "markra-table-delete-control markra-table-delete-column",
      this.labels.deleteColumn,
      () => deleteColumn(view, this.preview, hoveredColumn),
      createLucideIcon(document, Minus, "markra-table-control-icon"),
    );
    const deleteRowButton = createControl(
      document,
      "markra-table-delete-control markra-table-delete-row",
      this.labels.deleteRow,
      () => deleteRow(view, this.preview, hoveredRow),
      createLucideIcon(document, Minus, "markra-table-control-icon"),
    );
    deleteColumnButton.hidden = true;
    deleteRowButton.hidden = true;

    sizeControls.append(sizeButton);
    alignControls.append(
      sizeControls,
      ...alignButtons,
      widthModeButton,
      deleteTableButton,
    );

    for (const [index, cell] of this.preview.header.entries()) {
      appendCell(
        view,
        headRow,
        cell,
        this.preview.alignments[index] ?? null,
        true,
        this.preview,
        -1,
        index,
        this.images,
        this.links,
      );
    }
    head.append(headRow);

    for (const [rowIndex, values] of this.preview.rows.entries()) {
      const row = document.createElement("tr");
      for (const [columnIndex, cell] of values.entries()) {
        appendCell(
          view,
          row,
          cell,
          this.preview.alignments[columnIndex] ?? null,
          false,
          this.preview,
          rowIndex,
          columnIndex,
          this.images,
          this.links,
        );
      }
      body.append(row);
    }

    table.append(head, body);
    tableScroll.append(table);
    wrapper.append(
      alignControls,
      tableScroll,
      addColumnButton,
      addRowButton,
      deleteColumnButton,
      deleteRowButton,
    );
    wrapper.addEventListener("mousemove", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest<HTMLTableCellElement>("th, td");
      if (!cell || !table.contains(cell)) return;
      const row = cell.parentElement;
      if (!(row instanceof HTMLTableRowElement)) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      if (cell instanceof HTMLTableCellElement && cell.tagName === "TH") {
        hoveredColumn = cell.cellIndex;
        const cellRect = cell.getBoundingClientRect();
        deleteColumnButton.hidden = false;
        deleteRowButton.hidden = true;
        deleteColumnButton.style.left =
          `${cellRect.left - wrapperRect.left + cellRect.width / 2}px`;
        deleteColumnButton.style.top = `${cellRect.top - wrapperRect.top}px`;
        return;
      }

      hoveredRow = row.sectionRowIndex;
      const rowRect = row.getBoundingClientRect();
      deleteColumnButton.hidden = true;
      deleteRowButton.hidden = false;
      deleteRowButton.style.left = `${rowRect.right - wrapperRect.left}px`;
      deleteRowButton.style.top =
        `${rowRect.top - wrapperRect.top + rowRect.height / 2}px`;
    });
    wrapper.addEventListener("mouseleave", () => {
      deleteColumnButton.hidden = true;
      deleteRowButton.hidden = true;
    });
    wrapper.addEventListener("copy", (event) => {
      if (!event.clipboardData) return;
      const selection = document.getSelection();
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest<HTMLTableCellElement>("th, td");
      const selectionInsideCell = Boolean(
        cell &&
        selection &&
        !selection.isCollapsed &&
        selection.anchorNode &&
        selection.focusNode &&
        cell.contains(selection.anchorNode) &&
        cell.contains(selection.focusNode),
      );
      const text = selectionInsideCell
        ? selection?.toString() ?? ""
        : view.state.sliceDoc(this.preview.from, this.preview.to);
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    });
    return wrapper;
  }
}

const tableTheme = EditorView.baseTheme({
  ".cm-markra-table-wrap": {
    display: "block",
    margin: "1.5em 0",
    overflow: "visible",
    padding: "1.75em 2.25em 2.25em 0",
    position: "relative",
  },
  ".cm-markra-table-hidden-line": {
    display: "none",
  },
  ".markra-table-scroll": {
    display: "block",
    overflowX: "auto",
  },
  ".markra-table-align-controls": {
    alignItems: "center",
    display: "flex",
    gap: "0.125em",
    left: "0.375em",
    position: "absolute",
    top: "0",
    zIndex: "10",
  },
  ".markra-table-size-controls": {
    display: "flex",
  },
  ".markra-table-control": {
    alignItems: "center",
    borderRadius: "999px",
    cursor: "pointer",
    display: "inline-flex",
    height: "1.5em",
    justifyContent: "center",
    opacity: "0",
    padding: "0",
    pointerEvents: "none",
    position: "absolute",
    transition: "opacity 150ms ease, scale 150ms ease",
    width: "1.5em",
  },
  ".cm-markra-table-wrap:hover .markra-table-control, .cm-markra-table-wrap:focus-within .markra-table-control": {
    opacity: "1",
    pointerEvents: "auto",
  },
  ".markra-table-size-button, .markra-table-align-button, .markra-table-width-button, .markra-table-delete-table": {
    borderRadius: "0.375em",
    position: "static",
  },
  ".markra-table-add-column": {
    right: "0.375em",
    top: "50%",
    transform: "translateY(-50%)",
  },
  ".markra-table-add-row": {
    bottom: "0.375em",
    left: "50%",
    transform: "translateX(-50%)",
  },
  ".markra-table-delete-control": {
    transform: "translate(-50%, -50%)",
  },
  ".cm-markra-table": {
    borderCollapse: "collapse",
    width: "100%",
  },
  ".markra-table-size-popover": {
    background: "var(--bg-primary, Canvas)",
    border: "1px solid var(--border-default, currentColor)",
    borderRadius: "0.5em",
    boxShadow: "0 0.75em 2em rgb(0 0 0 / 18%)",
    padding: "0.55em",
    zIndex: "100",
  },
  ".markra-table-size-grid": {
    display: "grid",
    gap: "0.18em",
    gridTemplateColumns: `repeat(${tableSizePickerColumns}, 1.05em)`,
  },
  ".markra-table-size-cell": {
    aspectRatio: "1",
    background: "color-mix(in srgb, currentColor 4%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 20%, transparent)",
    borderRadius: "0.12em",
    padding: "0",
  },
  ".markra-table-size-cell:hover, .markra-table-size-cell:focus": {
    background: "color-mix(in srgb, var(--accent, currentColor) 22%, transparent)",
    borderColor: "var(--accent, currentColor)",
  },
  ".markra-table-size-footer": {
    alignItems: "center",
    display: "flex",
    gap: "0.35em",
    justifyContent: "center",
    marginTop: "0.5em",
  },
  ".markra-table-size-input": {
    width: "3.5em",
  },
  '.cm-markra-table[data-width-mode="auto"]': {
    tableLayout: "auto",
  },
  '.cm-markra-table[data-width-mode="even"]': {
    tableLayout: "fixed",
  },
  ".cm-markra-table th, .cm-markra-table td": {
    border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
    cursor: "text",
    outline: "none",
    padding: "0.42em 0.65em",
    position: "relative",
    verticalAlign: "top",
  },
  '.cm-markra-table[contenteditable="true"] th:focus, .cm-markra-table[contenteditable="true"] td:focus': {
    boxShadow: "inset 0 0 0 2px currentColor",
  },
  ".cm-markra-table th": {
    backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)",
    fontWeight: "650",
  },
});

export function tablePreviewPlugin(
  options: TablePreviewPluginOptions = {},
) {
  const labels = { ...defaultLabels, ...options.labels };
  const widthMode = options.widthMode ?? "auto";
  const getDocumentKey = options.getDocumentKey ?? (() => undefined);

  return defineMarkraPlugin({
    id: tablePreviewRendererId,
    extension: [
      markraRenderer({
        id: tablePreviewRendererId,
        nodeNames: ["Table"],
        render(context) {
          if (context.revealed("node")) return true;

          const preview = tablePreview(
            context.state.sliceDoc(context.node.from, context.node.to),
            context.node.from,
            context.node.to,
          );
          if (!preview) return true;

          const firstLine = context.state.doc.lineAt(context.node.from);
          const lastLine = context.state.doc.lineAt(context.node.to);
          context.add(
            Decoration.replace({
              widget: new TableWidget(
                preview,
                labels,
                widthMode,
                getDocumentKey,
                options.images,
                options.links,
              ),
            }).range(firstLine.from, firstLine.to),
          );
          for (
            let lineNumber = firstLine.number + 1;
            lineNumber <= lastLine.number;
            lineNumber += 1
          ) {
            const line = context.state.doc.line(lineNumber);
            context.add(
              Decoration.line({ class: "cm-markra-table-hidden-line" }).range(
                line.from,
              ),
            );
          }
          return false;
        },
      }),
      tableTheme,
    ],
  });
}
