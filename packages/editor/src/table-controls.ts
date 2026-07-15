import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { createLucideIcon, popoverPosition } from "@markra/shared";
import { Minus, Plus, Trash2 } from "lucide";
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, TableMap } from "prosemirror-tables";

type TableControlLabels = {
  addColumnRight: string;
  addRowBelow: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  autoWidth: string;
  deleteColumn: string;
  deleteRow: string;
  deleteTable: string;
  adjustTable: string;
  resizeTableTo: string;
  tableColumns: string;
  tableRows: string;
};

type TableAlignment = "left" | "center" | "right";
type TableColumnWidthMode = "auto" | "even";
type TableControlOptions = {
  getDefaultWidthMode?: () => TableColumnWidthMode | null | undefined;
  getDocumentKey?: () => string | null | undefined;
};
type TableSize = { columns: number; rows: number };

const defaultTableControlLabels: TableControlLabels = {
  addColumnRight: "Add column to the right",
  addRowBelow: "Add row below",
  alignLeft: "Align table left",
  alignCenter: "Align table center",
  alignRight: "Align table right",
  autoWidth: "Column width mode",
  deleteColumn: "Delete column",
  deleteRow: "Delete row",
  deleteTable: "Delete table",
  adjustTable: "Adjust table",
  resizeTableTo: "Resize table to {columns} columns by {rows} rows",
  tableColumns: "Table columns",
  tableRows: "Table rows"
};

const tableAlignments: TableAlignment[] = ["left", "center", "right"];
const tableSizePickerColumns = 8;
const tableSizePickerRows = 10;
const tableSizePopoverFallbackSize = { height: 248, width: 184 };
const tableWidthModeStoragePrefix = "markra:table-width-mode";
const tableWidthModeMemoryStore = new Map<string, TableColumnWidthMode>();
const tableWidthModeViews = new WeakMap<EditorView, Set<MarkraTableNodeView>>();
const tableColumnMinUnits = 3;
const tableReadableShortColumnUnits = 9;
const tableColumnMaxUnits = 40;

function tableTextUnits(text: string) {
  let units = 0;

  for (const char of Array.from(text.replace(/\s+/gu, ""))) {
    units += /[\u1100-\u11ff\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(char) ? 1 : 0.55;
  }

  return units;
}

function controlTargetFromEvent(event: Event) {
  return event.target instanceof Node ? event.target : null;
}

function elementFromEventTarget(target: EventTarget | null) {
  return target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
}

function tableCellFromEventTarget(target: EventTarget | null) {
  return elementFromEventTarget(target)?.closest<HTMLTableCellElement>("th, td") ?? null;
}

function isPrimaryMouseButton(event: MouseEvent) {
  return event.button === 0 && !event.ctrlKey;
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function tableStorageDocumentKey(documentKey: string | null | undefined) {
  const normalizedKey = documentKey?.trim();
  return normalizedKey ? normalizedKey : "untitled";
}

function compactTableCellText(text: string) {
  return text.trim().replace(/\s+/gu, " ");
}

function tableSignatureForNode(node: ProseNode) {
  const rows: string[] = [];

  for (let rowIndex = 0; rowIndex < node.childCount; rowIndex += 1) {
    const row = node.child(rowIndex);
    const cells: string[] = [];

    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
      const cell = row.child(cellIndex);
      cells.push(compactTableCellText(cell.textContent));
    }

    rows.push(cells.join("\u001f"));
  }

  return stableHash(rows.join("\u001e"));
}

function createTableControlButton(
  ownerDocument: Document,
  className: string,
  label: string,
  onMouseDown: (event: MouseEvent) => unknown
) {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = `markra-table-control ${className}`;
  button.title = label;
  button.ariaLabel = label;
  button.contentEditable = "false";
  button.draggable = false;
  button.addEventListener("mousedown", onMouseDown);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  return button;
}

function createTableAlignIcon(ownerDocument: Document, alignment: TableAlignment) {
  const icon = ownerDocument.createElement("span");
  icon.className = `markra-table-align-icon markra-table-align-icon-${alignment}`;
  icon.ariaHidden = "true";

  for (let index = 0; index < 3; index += 1) {
    const line = ownerDocument.createElement("span");
    line.className = "markra-table-align-icon-line";
    icon.append(line);
  }

  return icon;
}

function createTableSizeIcon(ownerDocument: Document) {
  const icon = ownerDocument.createElement("span");
  icon.className = "markra-table-size-icon";
  icon.ariaHidden = "true";

  for (let index = 0; index < 4; index += 1) {
    const square = ownerDocument.createElement("span");
    square.className = "markra-table-size-icon-square";
    icon.append(square);
  }

  return icon;
}

function createTableWidthIcon(ownerDocument: Document) {
  const icon = ownerDocument.createElement("span");
  icon.className = "markra-table-width-icon";
  icon.ariaHidden = "true";

  for (const className of [
    "markra-table-width-edge",
    "markra-table-width-arrow",
    "markra-table-width-letter",
    "markra-table-width-arrow",
    "markra-table-width-edge"
  ]) {
    const part = ownerDocument.createElement("span");
    part.className = className;
    if (className === "markra-table-width-letter") part.textContent = "A";
    icon.append(part);
  }

  return icon;
}

function clampTableSize(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function formatTableSizeLabel(labels: TableControlLabels, size: TableSize) {
  return labels.resizeTableTo
    .replace("{columns}", String(size.columns))
    .replace("{rows}", String(size.rows));
}

class MarkraTableNodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;

  private node: ProseNode;
  private readonly tableScroll: HTMLElement;
  private readonly table: HTMLTableElement;
  private readonly colgroup: HTMLTableColElement;
  private readonly alignControls: HTMLElement;
  private readonly sizeControls: HTMLElement;
  private readonly sizeButton: HTMLButtonElement;
  private readonly sizePopover: HTMLElement;
  private readonly sizeCells: HTMLButtonElement[];
  private readonly columnsInput: HTMLInputElement;
  private readonly rowsInput: HTMLInputElement;
  private readonly alignButtons: HTMLButtonElement[];
  private readonly widthModeButton: HTMLButtonElement;
  private readonly addColumnButton: HTMLButtonElement;
  private readonly addRowButton: HTMLButtonElement;
  private readonly deleteColumnButton: HTMLButtonElement;
  private readonly deleteRowButton: HTMLButtonElement;
  private readonly deleteTableButton: HTMLButtonElement;
  private hoveredCell: { column: number; row: number } | null = null;
  private pendingSize: TableSize = { columns: 1, rows: 1 };
  private widthMode: TableColumnWidthMode = "even";
  private lastWidthModeStorageKey: string | null = null;
  private lastAppliedColumnWidthSignature: string | null = null;

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: (() => number | undefined) | boolean,
    private readonly labels: TableControlLabels,
    private readonly options: TableControlOptions
  ) {
    this.node = node;
    this.dom = view.dom.ownerDocument.createElement("div");
    this.tableScroll = view.dom.ownerDocument.createElement("div");
    this.table = view.dom.ownerDocument.createElement("table");
    this.colgroup = view.dom.ownerDocument.createElement("colgroup");
    this.alignControls = view.dom.ownerDocument.createElement("div");
    this.sizeControls = view.dom.ownerDocument.createElement("div");
    this.sizePopover = view.dom.ownerDocument.createElement("div");
    this.contentDOM = view.dom.ownerDocument.createElement("tbody");
    this.sizeButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-size-button",
      labels.adjustTable,
      this.handleSizeButtonMouseDown
    );
    this.sizeButton.ariaExpanded = "false";
    this.sizeButton.append(createTableSizeIcon(view.dom.ownerDocument));
    this.columnsInput = this.createSizeInput(labels.tableColumns, tableSizePickerColumns);
    this.rowsInput = this.createSizeInput(labels.tableRows, tableSizePickerRows);
    this.sizeCells = this.createSizeCells(labels);
    this.alignButtons = tableAlignments.map((alignment) => {
      const label =
        alignment === "left" ? labels.alignLeft : alignment === "center" ? labels.alignCenter : labels.alignRight;
      const button = createTableControlButton(
        view.dom.ownerDocument,
        `markra-table-align-button markra-table-align-${alignment}`,
        label,
        this.handleAlignMouseDown
      );
      button.dataset.alignment = alignment;
      button.append(createTableAlignIcon(view.dom.ownerDocument, alignment));
      return button;
    });
    this.widthModeButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-width-button",
      labels.autoWidth,
      this.handleWidthModeMouseDown
    );
    this.widthModeButton.addEventListener("keydown", this.handleWidthModeKeyDown);
    this.widthModeButton.append(createTableWidthIcon(view.dom.ownerDocument));
    this.addColumnButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-add-column",
      labels.addColumnRight,
      this.handleAddColumnMouseDown
    );
    this.addColumnButton.append(createLucideIcon(view.dom.ownerDocument, Plus, "markra-table-control-icon"));
    this.addRowButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-add-row",
      labels.addRowBelow,
      this.handleAddRowMouseDown
    );
    this.addRowButton.append(createLucideIcon(view.dom.ownerDocument, Plus, "markra-table-control-icon"));
    this.deleteColumnButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-delete-control markra-table-delete-column",
      labels.deleteColumn,
      this.handleDeleteColumnMouseDown
    );
    this.deleteColumnButton.append(createLucideIcon(view.dom.ownerDocument, Minus, "markra-table-control-icon"));
    this.deleteRowButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-delete-control markra-table-delete-row",
      labels.deleteRow,
      this.handleDeleteRowMouseDown
    );
    this.deleteRowButton.append(createLucideIcon(view.dom.ownerDocument, Minus, "markra-table-control-icon"));
    this.deleteTableButton = createTableControlButton(
      view.dom.ownerDocument,
      "markra-table-delete-table",
      labels.deleteTable,
      this.handleDeleteTableMouseDown
    );
    this.deleteTableButton.append(createLucideIcon(view.dom.ownerDocument, Trash2, "markra-table-control-icon"));

    this.dom.className = "tableWrapper markra-table-controls-wrapper";
    this.tableScroll.className = "markra-table-scroll";
    this.alignControls.className = "markra-table-align-controls";
    this.sizeControls.className = "markra-table-size-controls";
    this.sizePopover.className = "markra-table-size-popover";
    this.sizePopover.contentEditable = "false";
    this.sizePopover.hidden = true;
    this.buildSizePopover();
    this.deleteColumnButton.hidden = true;
    this.deleteRowButton.hidden = true;
    this.dom.addEventListener("mousemove", this.handleMouseMove);
    this.dom.addEventListener("mouseleave", this.hideDeleteControls);
    this.table.append(this.colgroup, this.contentDOM);
    this.tableScroll.append(this.table);
    this.sizeControls.append(this.sizeButton);
    this.alignControls.append(this.sizeControls, ...this.alignButtons, this.widthModeButton, this.deleteTableButton);
    this.dom.append(
      this.alignControls,
      this.tableScroll,
      this.addColumnButton,
      this.addRowButton,
      this.deleteColumnButton,
      this.deleteRowButton
    );
    this.updateAlignmentButtons();
    this.widthMode = this.readStoredWidthMode();
    this.registerWidthModeView();
    this.updateWidthMode();
  }

  update(nextNode: ProseNode) {
    if (nextNode.type !== this.node.type) return false;

    this.node = nextNode;
    if (this.widthMode === "auto") this.writeStoredWidthMode("auto");
    this.updateAlignmentButtons();
    this.updateWidthMode();
    if (!this.sizePopover.hidden) this.positionSizePopover();
    return true;
  }

  stopEvent(event: Event) {
    const target = controlTargetFromEvent(event);
    return Boolean(
      target &&
        (this.addColumnButton.contains(target) ||
          this.sizeControls.contains(target) ||
          this.sizePopover.contains(target) ||
          this.alignControls.contains(target) ||
          this.widthModeButton.contains(target) ||
          this.addRowButton.contains(target) ||
          this.deleteColumnButton.contains(target) ||
          this.deleteRowButton.contains(target) ||
          this.deleteTableButton.contains(target))
    );
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    const target = mutation.target;
    if (mutation.type === "attributes" && target instanceof Element) {
      const attributeName = mutation.attributeName;
      const isTableControlMutation =
        attributeName === "class" || attributeName === "data-width-mode" || attributeName === "data-table-alignment";
      if (
        isTableControlMutation &&
        (target === this.dom || target === this.tableScroll || target === this.table || this.table.contains(target))
      ) {
        return true;
      }
    }

    return (
      target instanceof Node &&
      (this.addColumnButton.contains(target) ||
        this.sizeControls.contains(target) ||
        this.sizePopover.contains(target) ||
        this.alignControls.contains(target) ||
        this.widthModeButton.contains(target) ||
        this.addRowButton.contains(target) ||
        this.deleteColumnButton.contains(target) ||
        this.deleteRowButton.contains(target) ||
        this.deleteTableButton.contains(target))
    );
  }

  destroy() {
    this.dom.removeEventListener("mousemove", this.handleMouseMove);
    this.dom.removeEventListener("mouseleave", this.hideDeleteControls);
    this.view.dom.ownerDocument.removeEventListener("mousedown", this.handleDocumentMouseDown, true);
    this.removeSizePopoverLayoutListeners();
    this.sizePopover.remove();
    this.sizeButton.removeEventListener("mousedown", this.handleSizeButtonMouseDown);
    for (const cell of this.sizeCells) {
      cell.removeEventListener("mouseenter", this.handleSizeCellMouseEnter);
      cell.removeEventListener("focus", this.handleSizeCellFocus);
      cell.removeEventListener("mousedown", this.handleSizeCellMouseDown);
    }
    this.columnsInput.removeEventListener("input", this.handleSizeInput);
    this.columnsInput.removeEventListener("keydown", this.handleSizeInputKeyDown);
    this.rowsInput.removeEventListener("input", this.handleSizeInput);
    this.rowsInput.removeEventListener("keydown", this.handleSizeInputKeyDown);
    for (const button of this.alignButtons) {
      button.removeEventListener("mousedown", this.handleAlignMouseDown);
    }
    this.widthModeButton.removeEventListener("mousedown", this.handleWidthModeMouseDown);
    this.widthModeButton.removeEventListener("keydown", this.handleWidthModeKeyDown);
    this.addColumnButton.removeEventListener("mousedown", this.handleAddColumnMouseDown);
    this.addRowButton.removeEventListener("mousedown", this.handleAddRowMouseDown);
    this.deleteColumnButton.removeEventListener("mousedown", this.handleDeleteColumnMouseDown);
    this.deleteRowButton.removeEventListener("mousedown", this.handleDeleteRowMouseDown);
    this.deleteTableButton.removeEventListener("mousedown", this.handleDeleteTableMouseDown);
    this.unregisterWidthModeView();
  }

  private createSizeInput(label: string, max: number) {
    const input = this.view.dom.ownerDocument.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(max);
    input.className = "markra-table-size-input";
    input.ariaLabel = label;
    input.contentEditable = "false";
    input.draggable = false;
    input.addEventListener("input", this.handleSizeInput);
    input.addEventListener("keydown", this.handleSizeInputKeyDown);
    return input;
  }

  private createSizeCells(labels: TableControlLabels) {
    const cells: HTMLButtonElement[] = [];

    for (let row = 1; row <= tableSizePickerRows; row += 1) {
      for (let column = 1; column <= tableSizePickerColumns; column += 1) {
        const cell = this.view.dom.ownerDocument.createElement("button");
        const size = { columns: column, rows: row };
        cell.type = "button";
        cell.className = "markra-table-size-cell";
        cell.ariaLabel = formatTableSizeLabel(labels, size);
        cell.ariaPressed = "false";
        cell.contentEditable = "false";
        cell.draggable = false;
        cell.dataset.columns = String(column);
        cell.dataset.rows = String(row);
        cell.addEventListener("mouseenter", this.handleSizeCellMouseEnter);
        cell.addEventListener("focus", this.handleSizeCellFocus);
        cell.addEventListener("mousedown", this.handleSizeCellMouseDown);
        cells.push(cell);
      }
    }

    return cells;
  }

  private buildSizePopover() {
    const grid = this.view.dom.ownerDocument.createElement("div");
    const footer = this.view.dom.ownerDocument.createElement("div");
    const separator = this.view.dom.ownerDocument.createElement("span");

    grid.className = "markra-table-size-grid";
    grid.append(...this.sizeCells);
    footer.className = "markra-table-size-footer";
    separator.className = "markra-table-size-separator";
    separator.textContent = "x";
    footer.append(this.columnsInput, separator, this.rowsInput);
    this.sizePopover.append(grid, footer);
  }

  private readonly handleSizeButtonMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();

    if (this.sizePopover.hidden) {
      this.showSizePopover();
    } else {
      this.hideSizePopover();
    }
  };

  private readonly handleDocumentMouseDown = (event: MouseEvent) => {
    const target = controlTargetFromEvent(event);
    if (target && (this.sizeControls.contains(target) || this.sizePopover.contains(target))) return;

    this.hideSizePopover();
  };

  private readonly handleSizePopoverLayoutChange = () => {
    if (!this.sizePopover.hidden) this.positionSizePopover();
  };

  private readonly handleSizeCellMouseEnter = (event: MouseEvent) => {
    this.updatePendingSize(this.sizeFromTarget(event.currentTarget));
  };

  private readonly handleSizeCellFocus = (event: FocusEvent) => {
    this.updatePendingSize(this.sizeFromTarget(event.currentTarget));
  };

  private readonly handleSizeCellMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.resizeTableTo(this.sizeFromTarget(event.currentTarget));
  };

  private readonly handleSizeInput = () => {
    this.updatePendingSize(this.sizeFromInputs());
  };

  private readonly handleSizeInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.resizeTableTo(this.sizeFromInputs());
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.hideSizePopover();
      this.view.focus();
    }
  };

  private readonly handleAddColumnMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.insertColumnAfterTable();
  };

  private readonly handleAlignMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    const alignment = button?.dataset.alignment;
    if (alignment !== "left" && alignment !== "center" && alignment !== "right") return;

    this.alignTable(alignment);
  };

  private readonly handleWidthModeMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.toggleWidthMode();
  };

  private readonly handleWidthModeKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.stopPropagation();
    this.toggleWidthMode();
  };

  private readonly handleAddRowMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.insertRowAfterTable();
  };

  private readonly handleDeleteColumnMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.deleteHoveredColumn();
  };

  private readonly handleDeleteRowMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.deleteHoveredRow();
  };

  private readonly handleDeleteTableMouseDown = (event: MouseEvent) => {
    if (!isPrimaryMouseButton(event)) return;

    event.preventDefault();
    event.stopPropagation();
    this.deleteTable();
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    const cell = tableCellFromEventTarget(event.target);
    if (!cell) return;

    this.showDeleteControlsForCell(cell);
  };

  private readonly hideDeleteControls = () => {
    this.hoveredCell = null;
    this.deleteColumnButton.hidden = true;
    this.deleteRowButton.hidden = true;
  };

  private showSizePopover() {
    const map = TableMap.get(this.node);
    this.view.dom.ownerDocument.body.append(this.sizePopover);
    this.sizePopover.hidden = false;
    this.sizeButton.ariaExpanded = "true";
    this.positionSizePopover();
    this.updatePendingSize({
      columns: Math.min(map.width, tableSizePickerColumns),
      rows: Math.min(map.height, tableSizePickerRows)
    });
    this.view.dom.ownerDocument.addEventListener("mousedown", this.handleDocumentMouseDown, true);
    this.addSizePopoverLayoutListeners();
  }

  private hideSizePopover() {
    this.sizePopover.hidden = true;
    this.sizeButton.ariaExpanded = "false";
    this.sizePopover.remove();
    this.view.dom.ownerDocument.removeEventListener("mousedown", this.handleDocumentMouseDown, true);
    this.removeSizePopoverLayoutListeners();
  }

  private positionSizePopover() {
    const windowTarget = this.view.dom.ownerDocument.defaultView;
    const position = popoverPosition(
      this.sizeButton.getBoundingClientRect(),
      {
        height: this.sizePopover.offsetHeight || tableSizePopoverFallbackSize.height,
        width: this.sizePopover.offsetWidth || tableSizePopoverFallbackSize.width
      },
      {
        height: windowTarget?.innerHeight ?? 768,
        width: windowTarget?.innerWidth ?? 1024
      }
    );

    this.sizePopover.style.left = `${position.left}px`;
    this.sizePopover.style.maxHeight = `${position.maxHeight}px`;
    this.sizePopover.style.overflowY = "auto";
    this.sizePopover.style.position = "fixed";
    this.sizePopover.style.top = `${position.top}px`;
  }

  private addSizePopoverLayoutListeners() {
    const windowTarget = this.view.dom.ownerDocument.defaultView;
    windowTarget?.addEventListener("resize", this.handleSizePopoverLayoutChange);
    windowTarget?.addEventListener("scroll", this.handleSizePopoverLayoutChange, true);
  }

  private removeSizePopoverLayoutListeners() {
    const windowTarget = this.view.dom.ownerDocument.defaultView;
    windowTarget?.removeEventListener("resize", this.handleSizePopoverLayoutChange);
    windowTarget?.removeEventListener("scroll", this.handleSizePopoverLayoutChange, true);
  }

  private sizeFromTarget(target: EventTarget | null): TableSize {
    const element = target instanceof HTMLElement ? target : null;
    return {
      columns: clampTableSize(Number(element?.dataset.columns), 1, tableSizePickerColumns),
      rows: clampTableSize(Number(element?.dataset.rows), 1, tableSizePickerRows)
    };
  }

  private sizeFromInputs(): TableSize {
    return {
      columns: clampTableSize(Number(this.columnsInput.value), 1, tableSizePickerColumns),
      rows: clampTableSize(Number(this.rowsInput.value), 1, tableSizePickerRows)
    };
  }

  private updatePendingSize(size: TableSize) {
    this.pendingSize = {
      columns: clampTableSize(size.columns, 1, tableSizePickerColumns),
      rows: clampTableSize(size.rows, 1, tableSizePickerRows)
    };
    this.columnsInput.value = String(this.pendingSize.columns);
    this.rowsInput.value = String(this.pendingSize.rows);

    for (const cell of this.sizeCells) {
      const columns = Number(cell.dataset.columns);
      const rows = Number(cell.dataset.rows);
      const isActive = columns <= this.pendingSize.columns && rows <= this.pendingSize.rows;
      cell.ariaPressed = String(isActive);
      cell.classList.toggle("markra-table-size-cell-active", isActive);
    }
  }

  private showDeleteControlsForCell(cell: HTMLTableCellElement) {
    const row = cell.parentElement;
    if (!(row instanceof HTMLTableRowElement)) return;

    const canDeleteColumn = row.rowIndex === 0;
    const canDeleteRow = row.rowIndex > 0;
    if (!canDeleteColumn && !canDeleteRow) {
      this.hideDeleteControls();
      return;
    }

    this.hoveredCell = {
      column: cell.cellIndex,
      row: row.rowIndex
    };

    const wrapperRect = this.dom.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    this.deleteColumnButton.hidden = !canDeleteColumn;
    this.deleteRowButton.hidden = !canDeleteRow;
    this.deleteColumnButton.style.left = `${cellRect.left - wrapperRect.left + cellRect.width / 2}px`;
    this.deleteColumnButton.style.top = `${cellRect.top - wrapperRect.top}px`;
    this.deleteRowButton.style.left = `${rowRect.right - wrapperRect.left}px`;
    this.deleteRowButton.style.top = `${rowRect.top - wrapperRect.top + rowRect.height / 2}px`;
  }

  private tablePosition() {
    if (typeof this.getPos !== "function") return false;

    const tablePosition = this.getPos();
    if (typeof tablePosition !== "number") return false;

    return tablePosition;
  }

  private tableSignature() {
    return tableSignatureForNode(this.node);
  }

  private widthModeStorageKey() {
    const documentKey = tableStorageDocumentKey(this.options.getDocumentKey?.());
    return `${tableWidthModeStoragePrefix}:${encodeURIComponent(documentKey)}`;
  }

  private registerWidthModeView() {
    let views = tableWidthModeViews.get(this.view);
    if (!views) {
      views = new Set();
      tableWidthModeViews.set(this.view, views);
    }
    views.add(this);
  }

  private unregisterWidthModeView() {
    const views = tableWidthModeViews.get(this.view);
    views?.delete(this);
  }

  private readStoredWidthMode(): TableColumnWidthMode {
    const key = this.widthModeStorageKey();
    this.lastWidthModeStorageKey = key;
    const memoryMode = tableWidthModeMemoryStore.get(key);
    if (memoryMode) return memoryMode;
    const defaultMode = this.options.getDefaultWidthMode?.() === "auto" ? "auto" : "even";

    try {
      const storedMode = this.view.dom.ownerDocument.defaultView?.localStorage.getItem(key);
      if (storedMode === "auto" || storedMode === "even") return storedMode;
      return defaultMode;
    } catch {
      return defaultMode;
    }
  }

  private writeStoredWidthMode(mode: TableColumnWidthMode) {
    this.widthMode = mode;
    const key = this.widthModeStorageKey();
    const previousKey = this.lastWidthModeStorageKey;

    if (previousKey && previousKey !== key) {
      tableWidthModeMemoryStore.delete(previousKey);

      try {
        this.view.dom.ownerDocument.defaultView?.localStorage.removeItem(previousKey);
      } catch {
        // Ignore storage cleanup failures; the in-memory key has already been cleared.
      }
    }

    this.lastWidthModeStorageKey = key;

    tableWidthModeMemoryStore.set(key, mode);

    try {
      const storage = this.view.dom.ownerDocument.defaultView?.localStorage;
      storage?.setItem(key, mode);
    } catch {
      return;
    }
  }

  private applyWidthMode(mode: TableColumnWidthMode) {
    this.widthMode = mode;
    this.updateWidthMode();
  }

  private syncDocumentWidthMode(mode: TableColumnWidthMode) {
    this.writeStoredWidthMode(mode);

    const views = tableWidthModeViews.get(this.view);
    for (const view of views ?? []) {
      view.applyWidthMode(mode);
    }
  }

  private placeCursorInCell(tablePosition: number, row: number, column: number) {
    const map = TableMap.get(this.node);
    if (!map.width || !map.height) return false;

    const cellPosition = tablePosition + 1 + map.positionAt(row, column, this.node);
    const selection = TextSelection.near(this.view.state.doc.resolve(cellPosition + 1), 1);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    return true;
  }

  private moveTransactionCursorToCell(tr: Transaction, tablePosition: number, row: number, column: number) {
    const table = tr.doc.nodeAt(tablePosition);
    if (!table || table.type !== this.node.type) return tr;

    const map = TableMap.get(table);
    if (row < 0 || row >= map.height || column < 0 || column >= map.width) return tr;

    const cellPosition = tablePosition + 1 + map.positionAt(row, column, table);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(cellPosition + 1), 1));
  }

  private tableAlignment() {
    const map = TableMap.get(this.node);
    const alignments = new Set<TableAlignment>();

    for (let column = 0; column < map.width; column += 1) {
      const cell = this.node.nodeAt(map.positionAt(0, column, this.node));
      const alignment = cell?.attrs.alignment;
      if (alignment === "center" || alignment === "right") {
        alignments.add(alignment);
      } else {
        alignments.add("left");
      }
    }

    return alignments.size === 1 ? [...alignments][0] : null;
  }

  private updateAlignmentButtons() {
    const activeAlignment = this.tableAlignment();
    const tableAlignment = activeAlignment ?? "left";

    this.dom.dataset.tableAlignment = tableAlignment;
    this.tableScroll.dataset.tableAlignment = tableAlignment;
    this.table.dataset.tableAlignment = tableAlignment;

    for (const button of this.alignButtons) {
      button.ariaPressed = String(button.dataset.alignment === activeAlignment);
    }
  }

  private updateWidthMode() {
    const isAuto = this.widthMode === "auto";

    this.table.classList.toggle("markra-table-width-auto", isAuto);
    this.dom.dataset.widthMode = this.widthMode;
    this.table.dataset.widthMode = this.widthMode;
    this.updateColumnWidthHints(isAuto);
    this.widthModeButton.ariaPressed = String(isAuto);
    this.widthModeButton.dataset.mode = this.widthMode;
    this.widthModeButton.title = this.labels.autoWidth;
    this.widthModeButton.ariaLabel = this.labels.autoWidth;
  }

  private updateColumnWidthHints(isAuto: boolean) {
    if (!isAuto) {
      this.colgroup.replaceChildren();
      this.lastAppliedColumnWidthSignature = null;
      return;
    }

    const signature = this.tableSignature();
    if (signature === this.lastAppliedColumnWidthSignature && this.colgroup.childElementCount > 0) return;

    const columnWidths = this.contentDrivenColumnWidths();
    this.colgroup.replaceChildren(
      ...columnWidths.map((width) => {
        const column = this.view.dom.ownerDocument.createElement("col");
        column.style.width = `${width}%`;
        return column;
      })
    );
    this.lastAppliedColumnWidthSignature = signature;
  }

  private contentDrivenColumnWidths() {
    const map = TableMap.get(this.node);
    const columnCount = Math.max(1, map.width);
    const weights = Array.from({ length: columnCount }, () => tableColumnMinUnits);

    for (let rowIndex = 0; rowIndex < this.node.childCount; rowIndex += 1) {
      const row = this.node.child(rowIndex);
      let columnIndex = 0;

      for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
        const cell = row.child(cellIndex);
        const colspan = Math.max(1, Number(cell.attrs.colspan ?? 1));
        const cellUnits = Math.max(tableColumnMinUnits, tableTextUnits(cell.textContent));
        const unitsPerColumn = Math.min(tableColumnMaxUnits, cellUnits / colspan);

        for (let offset = 0; offset < colspan && columnIndex + offset < columnCount; offset += 1) {
          weights[columnIndex + offset] = Math.max(weights[columnIndex + offset], unitsPerColumn);
        }

        columnIndex += colspan;
      }
    }

    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index] <= tableReadableShortColumnUnits) {
        weights[index] = tableReadableShortColumnUnits;
      }
    }

    const totalWeight = weights.reduce((total, weight) => total + weight, 0) || columnCount;
    return weights.map((weight) => (weight / totalWeight) * 100);
  }

  private toggleWidthMode() {
    const nextMode: TableColumnWidthMode = this.widthMode === "auto" ? "even" : "auto";
    this.syncDocumentWidthMode(nextMode);
    this.view.focus();
  }

  private alignTable(alignment: TableAlignment) {
    const tablePosition = this.tablePosition();
    if (tablePosition === false) return;

    const map = TableMap.get(this.node);
    const cellPositions = new Set<number>();

    for (let row = 0; row < map.height; row += 1) {
      for (let column = 0; column < map.width; column += 1) {
        cellPositions.add(tablePosition + 1 + map.positionAt(row, column, this.node));
      }
    }

    const tr = this.view.state.tr;
    for (const cellPosition of cellPositions) {
      const cell = tr.doc.nodeAt(cellPosition);
      if (!cell) continue;

      tr.setNodeMarkup(cellPosition, undefined, {
        ...cell.attrs,
        alignment
      });
    }

    this.view.dispatch(tr.scrollIntoView());
    this.updateAlignmentButtons();
    this.view.focus();
  }

  private resizeTableTo(size: TableSize) {
    const tablePosition = this.tablePosition();
    if (tablePosition === false) return;

    const targetSize = {
      columns: clampTableSize(size.columns, 1, tableSizePickerColumns),
      rows: clampTableSize(size.rows, 1, tableSizePickerRows)
    };
    const resizedTable = this.createResizedTable(targetSize);
    if (!resizedTable) return;

    let tr = this.view.state.tr
      .replaceWith(tablePosition, tablePosition + this.node.nodeSize, resizedTable)
      .scrollIntoView();
    tr = this.moveTransactionCursorToCell(tr, tablePosition, targetSize.rows - 1, targetSize.columns - 1);
    this.view.dispatch(tr);
    this.hideSizePopover();
    this.hideDeleteControls();
    this.view.focus();
  }

  private createResizedTable(size: TableSize) {
    if (!this.node.childCount) return null;

    const rows: ProseNode[] = [];

    for (let rowIndex = 0; rowIndex < size.rows; rowIndex += 1) {
      const sourceRow = rowIndex < this.node.childCount ? this.node.child(rowIndex) : null;
      const templateRow = sourceRow ?? this.templateRowForIndex(rowIndex);
      const cells: ProseNode[] = [];

      for (let columnIndex = 0; columnIndex < size.columns; columnIndex += 1) {
        const sourceCell =
          sourceRow && columnIndex < sourceRow.childCount ? sourceRow.child(columnIndex) : null;
        cells.push(sourceCell ?? this.createEmptyCellForPosition(rowIndex, columnIndex));
      }

      rows.push(templateRow.type.createChecked(templateRow.attrs, cells));
    }

    return this.node.type.createChecked(this.node.attrs, rows);
  }

  private templateRowForIndex(rowIndex: number) {
    if (rowIndex === 0 || this.node.childCount === 1) return this.node.child(0);

    return this.node.child(Math.min(rowIndex, this.node.childCount - 1));
  }

  private createEmptyCellForPosition(rowIndex: number, columnIndex: number) {
    const templateRow = this.templateRowForIndex(rowIndex);
    const templateCell = templateRow.child(Math.min(columnIndex, templateRow.childCount - 1));
    const attrs: Record<string, unknown> = { ...templateCell.attrs };
    const alignment = this.tableAlignment();

    if ("alignment" in attrs && alignment) attrs.alignment = alignment;
    if ("colspan" in attrs) attrs.colspan = 1;
    if ("rowspan" in attrs) attrs.rowspan = 1;
    if ("colwidth" in attrs) attrs.colwidth = null;

    return templateCell.type.createAndFill(attrs) ?? templateCell.type.create(attrs);
  }

  private insertColumnAfterTable() {
    const tablePosition = this.tablePosition();
    if (tablePosition === false) return;

    const map = TableMap.get(this.node);
    if (!this.placeCursorInCell(tablePosition, 0, map.width - 1)) return;

    addColumnAfter(this.view.state, (tr) =>
      this.view.dispatch(this.moveTransactionCursorToCell(tr.scrollIntoView(), tablePosition, 0, map.width))
    );
    this.view.focus();
  }

  private insertRowAfterTable() {
    const tablePosition = this.tablePosition();
    if (tablePosition === false) return;

    const map = TableMap.get(this.node);
    if (!this.placeCursorInCell(tablePosition, map.height - 1, 0)) return;

    addRowAfter(this.view.state, (tr) =>
      this.view.dispatch(this.moveTransactionCursorToCell(tr.scrollIntoView(), tablePosition, map.height, 0))
    );
    this.view.focus();
  }

  private deleteHoveredColumn() {
    const tablePosition = this.tablePosition();
    if (tablePosition === false || !this.hoveredCell) return;

    const map = TableMap.get(this.node);
    if (map.width <= 1) return;

    const targetRow = Math.min(this.hoveredCell.row, map.height - 1);
    const targetColumn = Math.min(this.hoveredCell.column, map.width - 1);
    if (!this.placeCursorInCell(tablePosition, targetRow, targetColumn)) return;

    deleteColumn(this.view.state, (tr) => {
      const nextColumn = Math.min(targetColumn, map.width - 2);
      this.view.dispatch(this.moveTransactionCursorToCell(tr.scrollIntoView(), tablePosition, targetRow, nextColumn));
    });
    this.hideDeleteControls();
    this.view.focus();
  }

  private deleteHoveredRow() {
    const tablePosition = this.tablePosition();
    if (tablePosition === false || !this.hoveredCell) return;

    const map = TableMap.get(this.node);
    if (map.height <= 1) return;

    const targetRow = Math.min(this.hoveredCell.row, map.height - 1);
    const targetColumn = Math.min(this.hoveredCell.column, map.width - 1);
    if (!this.placeCursorInCell(tablePosition, targetRow, targetColumn)) return;

    deleteRow(this.view.state, (tr) => {
      const nextRow = Math.min(targetRow, map.height - 2);
      this.view.dispatch(this.moveTransactionCursorToCell(tr.scrollIntoView(), tablePosition, nextRow, targetColumn));
    });
    this.hideDeleteControls();
    this.view.focus();
  }

  private deleteTable() {
    const tablePosition = this.tablePosition();
    if (tablePosition === false) return;

    const paragraph = this.view.state.schema.nodes.paragraph;
    if (!paragraph) return;

    let tr = this.view.state.tr
      .replaceWith(tablePosition, tablePosition + this.node.nodeSize, paragraph.create())
      .scrollIntoView();
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(tablePosition + 1), 1));
    this.view.dispatch(tr);
    this.hideSizePopover();
    this.hideDeleteControls();
    this.view.focus();
  }
}

export function markraTableControlsPlugin(labels: Partial<TableControlLabels> = {}, options: TableControlOptions = {}) {
  const resolvedLabels = {
    ...defaultTableControlLabels,
    ...labels
  };

  return $prose(() => {
    return new Plugin({
      props: {
        nodeViews: {
          table: (node, view, getPos) => new MarkraTableNodeView(node, view, getPos, resolvedLabels, options)
        }
      }
    });
  });
}
