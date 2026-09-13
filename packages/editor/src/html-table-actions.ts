import { parseHtmlSpan } from "./html-attributes.ts";
import { readHtmlTable, readHtmlTables, type HtmlTable } from "./html-table.ts";

export type HtmlTableAction =
  | { type: "add-row" | "add-column" | "delete-table" }
  | { type: "delete-row" | "delete-column"; index: number }
  | { type: "resize"; columns: number; rows: number }
  | { type: "align"; alignment: "left" | "center" | "right" }
  | { type: "width-mode"; mode: "auto" | "even" };

export function htmlTableWidthMode(table: HTMLTableElement) {
  return table.style.tableLayout === "fixed" ? "even" : "auto";
}

export function htmlTableAlignment(table: HtmlTable): "left" | "center" | "right" | null {
  const alignments = new Set(table.cells.map(cell => cell.element.style.textAlign || cell.element.getAttribute("align") || table.element.style.textAlign || "left"));
  const alignment = [...alignments][0];
  return alignments.size === 1 && (alignment === "left" || alignment === "center" || alignment === "right") ? alignment : null;
}

function newCell(row: HTMLTableRowElement) {
  const header = row.parentElement?.tagName === "THEAD" ||
    (row.cells.length > 0 && Array.from(row.cells).every(cell => cell.tagName === "TH"));
  return row.ownerDocument.createElement(header ? "th" : "td");
}

function fillRow(table: HtmlTable, index: number, columns: number) {
  const row = table.rows[index]!;
  for (let column = 0; column < columns; column += 1) {
    if (table.grid[index]?.[column]) continue;
    const next = table.cells.find(cell => cell.row === index && cell.column > column);
    row.insertBefore(newCell(row), next?.element ?? null);
  }
}

function addRow(table: HtmlTable) {
  const element = table.element;
  const body = element.tBodies.item(element.tBodies.length - 1) ?? element.createTBody();
  if (element.tFoot) element.insertBefore(body, element.tFoot);
  const row = body.insertRow();
  const next = readHtmlTable(element);
  // Rebuild after insertion so rowspan="0" owns the new row's covered slots.
  fillRow(next, next.rows.indexOf(row), Math.max(1, table.columnCount));
}

function addColumn(table: HtmlTable) {
  if (!table.rows.length) { addRow(table); return; }
  for (let index = 0; index < table.rows.length; index += 1) {
    fillRow(table, index, table.columnCount);
    table.rows[index]!.append(newCell(table.rows[index]!));
  }
}

function setSpan(cell: HTMLTableCellElement, attribute: "rowspan" | "colspan", span: number) {
  if (span === 1) cell.removeAttribute(attribute);
  else cell.setAttribute(attribute, String(span));
}

function deleteRow(table: HtmlTable, index: number) {
  const row = table.rows[index];
  if (!row || table.rows.length <= 1) return false;
  for (const cell of table.cells) {
    if (cell.row > index || cell.row + cell.rowSpan <= index) continue;
    if (cell.row === index && cell.rowSpan > 1) {
      // A spanning cell belongs to surviving rows too; move its content before removing the row.
      const nextRow = table.rows[index + 1]!;
      const next = table.cells.find(candidate => candidate.row === index + 1 && candidate.column > cell.column);
      nextRow.insertBefore(cell.element, next?.element ?? null);
    }
    if (cell.rowSpan > 1 && cell.element.getAttribute("rowspan") !== "0") {
      setSpan(cell.element, "rowspan", cell.rowSpan - 1);
    }
  }
  row.remove();
  return true;
}

function deleteColumn(table: HtmlTable, index: number) {
  if (table.columnCount <= 1 || index < 0 || index >= table.columnCount) return false;
  for (const cell of table.cells) {
    if (cell.column > index || cell.column + cell.columnSpan <= index) continue;
    if (cell.columnSpan === 1) cell.element.remove();
    else setSpan(cell.element, "colspan", cell.columnSpan - 1);
  }
  return true;
}

function normalizeColumns(table: HTMLTableElement) {
  const groups = Array.from(table.children).filter((node): node is HTMLTableColElement => node.tagName === "COLGROUP");
  const columns: HTMLTableColElement[] = [];
  for (const group of groups) {
    const originals = Array.from(group.children).filter((node): node is HTMLTableColElement => node.tagName === "COL");
    const expanded = originals.length
      ? originals.flatMap(col => Array.from({ length: parseHtmlSpan("span", col.getAttribute("span")) ?? 1 }, (_, index) => {
          const copy = col.cloneNode(false) as HTMLTableColElement;
          if (index) copy.removeAttribute("id");
          copy.removeAttribute("span");
          return copy;
        }))
      : Array.from({ length: parseHtmlSpan("span", group.getAttribute("span")) ?? 1 }, () => table.ownerDocument.createElement("col"));
    group.removeAttribute("span");
    group.replaceChildren(...expanded);
    columns.push(...expanded);
  }
  return { groups, columns };
}

function updateColumnLayout(table: HTMLTableElement, count: number, removed?: number) {
  const { groups, columns } = normalizeColumns(table);
  if (!groups.length && table.dataset.markraWidthMode !== "even") return;
  if (removed !== undefined) columns.splice(removed, 1)[0]?.remove();
  for (const column of columns.splice(count)) column.remove();
  if (!groups.length) {
    const group = table.ownerDocument.createElement("colgroup");
    table.insertBefore(group, table.caption?.nextSibling ?? table.firstChild);
    groups.push(group);
  }
  while (columns.length < count) {
    const col = table.ownerDocument.createElement("col");
    if (table.dataset.markraWidthMode === "manual") col.style.width = "100px";
    groups.at(-1)!.append(col);
    columns.push(col);
  }
  for (const group of groups) if (!group.children.length) group.remove();
  if (table.dataset.markraWidthMode === "even") {
    for (const col of columns) col.style.width = `${100 / count}%`;
  } else if (table.dataset.markraWidthMode === "manual" && columns.every(col => col.style.width.endsWith("px"))) {
    table.style.width = `${columns.reduce((sum, col) => sum + Number.parseFloat(col.style.width), 0)}px`;
  }
}

export function transformHtmlTable(source: string, document: Document, index: number, action: HtmlTableAction) {
  const { template, tables } = readHtmlTables(source, document);
  let table = tables[index];
  if (!table?.valid) return null;
  switch (action.type) {
    case "add-row": addRow(table); break;
    case "add-column":
      addColumn(table);
      updateColumnLayout(table.element, Math.max(1, table.columnCount + 1));
      break;
    case "delete-row":
      if (!Number.isInteger(action.index) || !deleteRow(table, action.index)) return null;
      break;
    case "delete-column":
      if (!Number.isInteger(action.index) || !deleteColumn(table, action.index)) return null;
      updateColumnLayout(table.element, table.columnCount - 1, action.index);
      break;
    case "delete-table": table.element.remove(); break;
    case "align":
      table.element.style.textAlign = action.alignment;
      for (const cell of table.cells) cell.element.style.textAlign = action.alignment;
      break;
    case "width-mode": {
      const element = table.element;
      element.dataset.markraWidthMode = action.mode;
      element.style.tableLayout = action.mode === "auto" ? "auto" : "fixed";
      element.style.width = "100%";
      element.style.removeProperty("min-width");
      element.style.removeProperty("max-width");
      for (const col of Array.from(element.querySelectorAll<HTMLTableColElement>(":scope > colgroup, :scope > colgroup > col"))) {
        col.removeAttribute("width"); col.style.removeProperty("width");
      }
      updateColumnLayout(element, table.columnCount);
      break;
    }
    case "resize": {
      if (!Number.isFinite(action.rows) || !Number.isFinite(action.columns)) return null;
      const rows = Math.max(1, Math.min(10, Math.trunc(action.rows)));
      const columns = Math.max(1, Math.min(8, Math.trunc(action.columns)));
      for (const cell of table.cells) {
        if (cell.row >= rows || cell.column >= columns) cell.element.remove();
        else {
          if (cell.row + cell.rowSpan > rows) setSpan(cell.element, "rowspan", rows - cell.row);
          if (cell.column + cell.columnSpan > columns) setSpan(cell.element, "colspan", columns - cell.column);
        }
      }
      for (const row of table.rows.slice(rows)) row.remove();
      updateColumnLayout(table.element, columns);
      table = readHtmlTable(table.element);
      while (table.rows.length < rows) { addRow(table); table = readHtmlTable(table.element); }
      for (let row = 0; row < table.rows.length; row += 1) fillRow(table, row, columns);
      break;
    }
  }
  return template.innerHTML === source ? null : template.innerHTML;
}
