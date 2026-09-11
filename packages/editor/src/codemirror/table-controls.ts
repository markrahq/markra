import { createLucideIcon, popoverPosition } from "@markra/shared";
import { Minus, Plus, Trash2 } from "lucide";

export type TableAlignment = "left" | "center" | "right" | null;
export type TableWidthMode = "auto" | "even";

export interface TableControlLabels {
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

export const defaultTableLabels: TableControlLabels = {
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

function createTableAlignIcon(
  document: Document,
  alignment: Exclude<TableAlignment, null>,
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

function formatTableSizeLabel(
  labels: TableControlLabels,
  columns: number,
  rows: number,
) {
  return labels.resizeTableTo
    .replace("{columns}", String(columns))
    .replace("{rows}", String(rows));
}

export function createTableControl(
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


interface TableShape { columns: number; rows: number }
interface ExtraControl {
  label: string;
  icon: Node;
  action: string;
  run: () => unknown;
  enabled: () => boolean;
}
export interface TableControlOptions {
  labels: TableControlLabels;
  readOnly: () => boolean;
  shape: () => TableShape;
  alignment: () => TableAlignment;
  widthMode: () => TableWidthMode;
  resize: (columns: number, rows: number) => unknown;
  align: (alignment: Exclude<TableAlignment, null>) => unknown;
  setWidthMode: (mode: TableWidthMode) => unknown;
  addRow: () => unknown;
  addColumn: () => unknown;
  deleteRow: (index: number) => unknown;
  deleteColumn: (index: number) => unknown;
  deleteTable: () => unknown;
  cellPosition: (cell: HTMLTableCellElement) => { row: number; column: number; header: boolean };
  focusEditor: () => unknown;
  extras?: readonly ExtraControl[];
}

function createSizePicker(document: Document, options: TableControlOptions) {
  let popover: HTMLElement | null = null;
  let anchor: HTMLButtonElement | null = null;
  const close = () => {
    popover?.remove(); popover = null;
    if (anchor) anchor.ariaExpanded = "false";
    document.removeEventListener("mousedown", outside, true);
  };
  const outside = (event: MouseEvent) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target || (!popover?.contains(target) && !anchor?.contains(target))) close();
  };
  return {
    close,
    open(button: HTMLButtonElement) {
      if (popover) { close(); return; }
      if (options.readOnly()) return;
      anchor = button;
      popover = document.createElement("div");
      popover.className = "markra-table-size-popover";
      popover.setAttribute("role", "dialog"); popover.ariaLabel = options.labels.adjustTable;
      const grid = document.createElement("div"); grid.className = "markra-table-size-grid";
      const footer = document.createElement("div"); footer.className = "markra-table-size-footer";
      const columnsInput = document.createElement("input");
      const rowsInput = document.createElement("input");
      const shape = options.shape();
      for (const [input, maximum, value, label] of [
        [columnsInput, 8, shape.columns, options.labels.tableColumns],
        [rowsInput, 10, shape.rows, options.labels.tableRows],
      ] as const) {
        input.className = "markra-table-size-input"; input.type = "number";
        input.min = "1"; input.max = String(maximum); input.value = String(Math.min(maximum, Math.max(1, value)));
        input.ariaLabel = label;
      }
      const update = (columns: number, rows: number) => {
        columnsInput.value = String(columns); rowsInput.value = String(rows);
        for (const cell of grid.querySelectorAll<HTMLButtonElement>(".markra-table-size-cell")) {
          const active = Number(cell.dataset.columns) <= columns && Number(cell.dataset.rows) <= rows;
          cell.ariaPressed = String(active); cell.classList.toggle("markra-table-size-cell-active", active);
        }
      };
      const apply = (columns: number, rows: number) => {
        if (!options.readOnly() && options.resize(columns, rows)) close();
      };
      for (let row = 1; row <= 10; row += 1) {
        for (let column = 1; column <= 8; column += 1) {
          const cell = document.createElement("button"); cell.type = "button";
          cell.className = "markra-table-size-cell";
          cell.ariaLabel = formatTableSizeLabel(options.labels, column, row);
          cell.dataset.columns = String(column); cell.dataset.rows = String(row);
          cell.addEventListener("mouseenter", () => update(column, row));
          cell.addEventListener("focus", () => update(column, row));
          cell.addEventListener("mousedown", event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation(); apply(column, row);
          });
          grid.append(cell);
        }
      }
      const keydown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault(); event.stopPropagation(); apply(Number(columnsInput.value), Number(rowsInput.value));
        } else if (event.key === "Escape") { event.preventDefault(); close(); options.focusEditor(); }
      };
      columnsInput.addEventListener("keydown", keydown); rowsInput.addEventListener("keydown", keydown);
      const separator = document.createElement("span"); separator.className = "markra-table-size-separator"; separator.textContent = "x";
      footer.append(columnsInput, separator, rowsInput); popover.append(grid, footer); document.body.append(popover);
      update(Number(columnsInput.value), Number(rowsInput.value));
      const position = popoverPosition(button.getBoundingClientRect(), {
        height: popover.offsetHeight || 248, width: popover.offsetWidth || 184,
      }, { height: document.defaultView?.innerHeight ?? 768, width: document.defaultView?.innerWidth ?? 1024 });
      Object.assign(popover.style, { left: `${position.left}px`, top: `${position.top}px`, maxHeight: `${position.maxHeight}px`, overflowY: "auto", position: "fixed" });
      button.ariaExpanded = "true";
      document.addEventListener("mousedown", outside, true);
    },
  };
}

export function createTableControls(wrapper: HTMLElement, table: HTMLTableElement, options: TableControlOptions) {
  const document = wrapper.ownerDocument;
  const picker = createSizePicker(document, options);
  const toolbar = document.createElement("span"); toolbar.className = "markra-table-align-controls";
  const sizeControls = document.createElement("span"); sizeControls.className = "markra-table-size-controls";
  const size = createTableControl(document, "markra-table-size-button", options.labels.adjustTable, () => picker.open(size), createTableSizeIcon(document));
  size.ariaExpanded = "false"; sizeControls.append(size);
  const alignments = (["left", "center", "right"] as const).map(alignment => {
    const label = alignment === "left" ? options.labels.alignLeft : alignment === "center" ? options.labels.alignCenter : options.labels.alignRight;
    const button = createTableControl(document, `markra-table-align-button markra-table-align-${alignment}`, label, () => options.align(alignment), createTableAlignIcon(document, alignment));
    button.dataset.alignment = alignment;
    return button;
  });
  const toggleWidth = () => {
    options.setWidthMode(options.widthMode() === "auto" ? "even" : "auto"); update();
  };
  const width = createTableControl(document, "markra-table-width-button", options.labels.columnWidthMode, toggleWidth, createTableWidthIcon(document));
  width.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); event.stopPropagation(); if (!width.disabled) toggleWidth();
  });
  const extraButtons = (options.extras ?? []).map(extra => {
    const button = createTableControl(document, "markra-table-extra-control", extra.label, extra.run, extra.icon);
    button.dataset.action = extra.action;
    return button;
  });
  const remove = createTableControl(document, "markra-table-delete-table", options.labels.deleteTable, options.deleteTable, createLucideIcon(document, Trash2, "markra-table-control-icon"));
  toolbar.append(sizeControls, ...alignments, width, ...extraButtons, remove);
  const column = createTableControl(document, "markra-table-add-column", options.labels.addColumnRight, options.addColumn, createLucideIcon(document, Plus, "markra-table-control-icon"));
  const row = createTableControl(document, "markra-table-add-row", options.labels.addRowBelow, options.addRow, createLucideIcon(document, Plus, "markra-table-control-icon"));
  let hoveredColumn = 0, hoveredRow = 0;
  const deleteColumn = createTableControl(document, "markra-table-delete-control markra-table-delete-column", options.labels.deleteColumn, () => options.deleteColumn(hoveredColumn), createLucideIcon(document, Minus, "markra-table-control-icon"));
  const deleteRow = createTableControl(document, "markra-table-delete-control markra-table-delete-row", options.labels.deleteRow, () => options.deleteRow(hoveredRow), createLucideIcon(document, Minus, "markra-table-control-icon"));
  deleteColumn.hidden = true; deleteRow.hidden = true;
  wrapper.prepend(toolbar); wrapper.append(column, row, deleteColumn, deleteRow);
  const hover = (event: MouseEvent) => {
    const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("th, td") : null;
    if (!cell || cell.closest("table") !== table) return;
    const position = options.cellPosition(cell);
    const bounds = wrapper.getBoundingClientRect();
    if (position.header) {
      hoveredColumn = position.column;
      const rect = cell.getBoundingClientRect();
      deleteColumn.hidden = false; deleteRow.hidden = true;
      deleteColumn.style.left = `${rect.left - bounds.left + rect.width / 2}px`;
      deleteColumn.style.top = `${rect.top - bounds.top}px`;
    } else {
      hoveredRow = position.row;
      const rect = cell.parentElement!.getBoundingClientRect();
      deleteColumn.hidden = true; deleteRow.hidden = false;
      const visibleRight = wrapper.querySelector(".markra-table-scroll")?.getBoundingClientRect().right ?? rect.right;
      deleteRow.style.left = `${Math.min(rect.right, visibleRight) - bounds.left}px`;
      deleteRow.style.top = `${rect.top - bounds.top + rect.height / 2}px`;
    }
  };
  const leave = () => { deleteColumn.hidden = true; deleteRow.hidden = true; };
  wrapper.addEventListener("mousemove", hover); wrapper.addEventListener("mouseleave", leave);
  function update() {
    const readonly = options.readOnly();
    for (const button of [size, ...alignments, width, remove, column, row, deleteColumn, deleteRow]) button.disabled = readonly;
    deleteColumn.disabled ||= options.shape().columns <= 1;
    const alignment = options.alignment();
    for (const button of alignments) button.ariaPressed = String(button.dataset.alignment === alignment);
    width.dataset.mode = options.widthMode(); width.ariaPressed = String(options.widthMode() === "auto");
    extraButtons.forEach((button, index) => { button.disabled = readonly || !options.extras![index]!.enabled(); });
  }
  update();
  return { update, destroy() { picker.close(); wrapper.removeEventListener("mousemove", hover); wrapper.removeEventListener("mouseleave", leave); } };
}
