import { parseHtmlSpan } from "./html-attributes.ts";

function spanValue(element: Element, attribute: string) {
  return parseHtmlSpan(attribute, element.getAttribute(attribute)) ?? 1;
}

export interface HtmlCellPoint {
  row: number;
  column: number;
}

export interface HtmlTableCell extends HtmlCellPoint {
  element: HTMLTableCellElement;
  rowSpan: number;
  columnSpan: number;
  group: Element;
}

export interface HtmlTable {
  element: HTMLTableElement;
  rows: HTMLTableRowElement[];
  cells: HtmlTableCell[];
  grid: Array<Array<HtmlTableCell | undefined>>;
  columnCount: number;
  valid: boolean;
}

function columnGroups(table: HTMLTableElement) {
  return Array.from(table.children).filter(
    (element): element is HTMLTableColElement => element.tagName === "COLGROUP",
  );
}

function columnsInGroup(group: HTMLTableColElement) {
  return Array.from(group.children).filter(
    (element): element is HTMLTableColElement => element.tagName === "COL",
  );
}

export function readHtmlTable(element: HTMLTableElement): HtmlTable {
  const rows = Array.from(element.rows);
  const cells: HtmlTableCell[] = [];
  const grid: HtmlTable["grid"] = rows.map(() => []);
  const groupEnds = new Map<Element, number>();
  rows.forEach((row, index) => groupEnds.set(row.parentElement!, index + 1));
  let valid = true;
  let occupiedSlots = 0;
  let columnCount = columnGroups(element).reduce((count, group) => {
    const columns = columnsInGroup(group);
    return count + (columns.length ? columns.reduce((sum, col) => sum + spanValue(col, "span"), 0) : spanValue(group, "span"));
  }, 0);
  if (columnCount > 10_000) return { element, rows, cells, grid: [], columnCount, valid: false };

  for (const [rowIndex, row] of rows.entries()) {
    const group = row.parentElement!;
    const groupEnd = groupEnds.get(group)!;
    let column = 0;
    for (const cellElement of Array.from(row.cells)) {
      while (grid[rowIndex]?.[column]) column += 1;
      const rowSpan = Math.min(spanValue(cellElement, "rowspan") || groupEnd - rowIndex, groupEnd - rowIndex);
      const cell: HtmlTableCell = {
        element: cellElement, row: rowIndex, column, group,
        rowSpan, columnSpan: spanValue(cellElement, "colspan"),
      };
      cells.push(cell);
      occupiedSlots += rowSpan * cell.columnSpan;
      // Pathological span grids remain viewable as HTML without allocating an unbounded editing grid.
      if (occupiedSlots > 100_000 || columnCount > 10_000) {
        return { element, rows, cells, grid: [], columnCount, valid: false };
      }
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        for (let c = column; c < column + cell.columnSpan; c += 1) {
          if (grid[r]![c]) valid = false;
          grid[r]![c] = cell;
        }
      }
      column += cell.columnSpan;
      columnCount = Math.max(columnCount, column);
    }
  }
  return { element, rows, cells, grid, columnCount, valid };
}

export function readHtmlTables(source: string, ownerDocument: Document) {
  // This detached template is a source model, never preview DOM: authored unsafe markup must stay inert.
  const template = ownerDocument.createElement("template");
  template.innerHTML = source;
  const elements = Array.from(template.content.querySelectorAll("table")).filter(
    table => !table.parentElement?.closest("table, script, style, template, svg, math, iframe, object"),
  );
  return { template, tables: elements.map(readHtmlTable) };
}

export function htmlTableSelection(table: HtmlTable, anchor: HtmlCellPoint, head: HtmlCellPoint) {
  if (!table.valid) return null;
  const first = table.grid[anchor.row]?.[anchor.column];
  const last = table.grid[head.row]?.[head.column];
  if (!first || !last) return null;
  const bounds = {
    top: Math.min(first.row, last.row), left: Math.min(first.column, last.column),
    bottom: Math.max(first.row + first.rowSpan - 1, last.row + last.rowSpan - 1),
    right: Math.max(first.column + first.columnSpan - 1, last.column + last.columnSpan - 1),
  };
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const cell of table.cells) {
      const bottom = cell.row + cell.rowSpan - 1;
      const right = cell.column + cell.columnSpan - 1;
      if (cell.row > bounds.bottom || bottom < bounds.top || cell.column > bounds.right || right < bounds.left) continue;
      if (cell.row < bounds.top || cell.column < bounds.left || bottom > bounds.bottom || right > bounds.right) {
        bounds.top = Math.min(bounds.top, cell.row);
        bounds.left = Math.min(bounds.left, cell.column);
        bounds.bottom = Math.max(bounds.bottom, bottom);
        bounds.right = Math.max(bounds.right, right);
        expanded = true;
      }
    }
  }
  const selected = new Set<HtmlTableCell>();
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      const cell = table.grid[row]?.[column];
      if (!cell) return null;
      selected.add(cell);
    }
  }
  const cells = [...selected].sort((a, b) => a.row - b.row || a.column - b.column);
  const mergeable = cells.length > 1 && cells.every(cell => cell.group === cells[0]?.group) &&
    bounds.right - bounds.left < 1000 && bounds.bottom - bounds.top < 65534;
  return { bounds, cells, mergeable };
}

export function editHtmlCells(source: string, document: Document, tableIndex: number, updates: readonly (HtmlCellPoint & { html: string })[]) {
  const { template, tables } = readHtmlTables(source, document);
  const table = tables[tableIndex];
  if (!table?.valid) return null;
  let changed = false;
  for (const update of updates) {
    const cell = table.grid[update.row]?.[update.column];
    if (!cell) return null;
    if (cell.element.innerHTML !== update.html) {
      cell.element.innerHTML = update.html;
      changed = true;
    }
  }
  return changed ? template.innerHTML : null;
}

export function editHtmlCell(source: string, document: Document, tableIndex: number, point: HtmlCellPoint, html: string) {
  return editHtmlCells(source, document, tableIndex, [{ ...point, html }]);
}

export function mergeHtmlCells(source: string, document: Document, tableIndex: number, anchor: HtmlCellPoint, head: HtmlCellPoint) {
  const { template, tables } = readHtmlTables(source, document);
  const table = tables[tableIndex];
  const selection = table ? htmlTableSelection(table, anchor, head) : null;
  if (!selection?.mergeable) return null;
  const { bounds, cells } = selection;
  const first = cells[0]!.element;
  first.innerHTML = cells.map(cell => cell.element.innerHTML).filter(html => html.trim()).join("<br>");
  const rows = bounds.bottom - bounds.top + 1;
  const columns = bounds.right - bounds.left + 1;
  first.removeAttribute("rowspan");
  first.removeAttribute("colspan");
  if (rows > 1) first.rowSpan = rows;
  if (columns > 1) first.colSpan = columns;
  for (const cell of cells.slice(1)) cell.element.remove();
  return template.innerHTML;
}

export function splitHtmlCell(source: string, document: Document, tableIndex: number, point: HtmlCellPoint) {
  const { template, tables } = readHtmlTables(source, document);
  const table = tables[tableIndex];
  const cell = table?.valid ? table.grid[point.row]?.[point.column] : null;
  if (!table || !cell || (cell.rowSpan === 1 && cell.columnSpan === 1)) return null;
  cell.element.removeAttribute("rowspan");
  cell.element.removeAttribute("colspan");
  for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
    for (let column = cell.column; column < cell.column + cell.columnSpan; column += 1) {
      if (row === cell.row && column === cell.column) continue;
      const empty = cell.element.cloneNode(false) as HTMLTableCellElement;
      empty.removeAttribute("id");
      const next = table.cells.find(candidate => candidate.row === row && candidate.column > column);
      table.rows[row]!.insertBefore(empty, next?.element ?? null);
    }
  }
  return template.innerHTML;
}

export function resizeHtmlColumns(source: string, document: Document, tableIndex: number, widths: readonly number[]) {
  const { template, tables } = readHtmlTables(source, document);
  const table = tables[tableIndex];
  if (!table?.valid || widths.length !== table.columnCount || !widths.length ||
    widths.some(width => !Number.isFinite(width) || width < 48 || width > 2000)) return null;
  const groups = columnGroups(table.element);
  if (!groups.length) {
    const group = document.createElement("colgroup");
    table.element.insertBefore(group, table.element.caption?.nextSibling ?? table.element.firstChild);
    groups.push(group);
  }
  let index = 0;
  for (const group of groups) {
    const columns = columnsInGroup(group);
    const expanded = columns.length
      ? columns.flatMap(col => Array.from({ length: spanValue(col, "span") }, (_, copyIndex) => {
          const copy = col.cloneNode(false) as HTMLTableColElement;
          if (copyIndex) copy.removeAttribute("id");
          return copy;
        }))
      : Array.from({ length: spanValue(group, "span") }, () => document.createElement("col"));
    group.removeAttribute("span");
    group.removeAttribute("width");
    group.style.removeProperty("width");
    group.replaceChildren();
    for (const col of expanded) {
      if (index >= widths.length) break;
      col.removeAttribute("span");
      col.removeAttribute("width");
      col.style.width = `${Math.round(widths[index++]!)}px`;
      group.append(col);
    }
  }
  while (index < widths.length) {
    const col = document.createElement("col");
    col.style.width = `${Math.round(widths[index++]!)}px`;
    groups.at(-1)!.append(col);
  }
  table.element.style.tableLayout = "fixed";
  table.element.dataset.markraWidthMode = "manual";
  table.element.style.width = `${widths.reduce((sum, width) => sum + Math.round(width), 0)}px`;
  table.element.style.minWidth = "0px";
  table.element.style.maxWidth = "none";
  return template.innerHTML;
}
