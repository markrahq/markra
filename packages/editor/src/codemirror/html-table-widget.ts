import { createLucideIcon } from "@markra/shared";
import { TableCellsMerge, TableCellsSplit } from "lucide";
import { createTableControls, defaultTableLabels, type TableControlLabels } from "./table-controls.ts";
import { clearTableSelection, activeTableCell, placeTableCellCaret, tableCellCaretOffset, createTableCaretHost, tableCaretPlaceholder } from "./table-selection.ts";
import { transformHtmlTable, htmlTableAlignment, htmlTableWidthMode, type HtmlTableAction } from "../html-table-actions.ts";
import { isolateHistory, redo, undo } from "@codemirror/commands";
import { WidgetType, type EditorView } from "@codemirror/view";
import { sanitizeRawHtml, type RawHtmlSanitizeOptions } from "../raw-html-sanitize.ts";
import {
  readHtmlTables, htmlTableSelection, editHtmlCell, editHtmlCells, mergeHtmlCells, splitHtmlCell, resizeHtmlColumns,
  type HtmlCellPoint, type HtmlTable,
} from "../html-table.ts";
import { attachHtmlColumnResizers } from "./html-table-resize.ts";

export interface HtmlTableLabels extends TableControlLabels {
  mergeCells: string;
  splitCell: string;
  selectCells: string;
  resizeColumn: string;
  cell: string;
}
export interface HtmlTableWidgetOptions extends RawHtmlSanitizeOptions {
  tableLabels?: Partial<HtmlTableLabels>;
}
interface HtmlRange { from: number; to: number; source: string }
interface CellSelection { anchor: HtmlCellPoint; head: HtmlCellPoint }
interface CellFocus extends HtmlCellPoint { table: number; resize?: boolean }
interface Runtime {
  range: HtmlRange;
  tables: HtmlTable[];
  root: HTMLElement | null;
  selections: Map<number, CellSelection>;
  controllers: Array<ReturnType<typeof attachHtmlColumnResizers>>;
  images: WeakMap<Element, string>;
  composing: HTMLElement | null;
  pendingInput: string | null;
  focus: CellFocus | null;
  historyCell: string | null;
  dirty: WeakSet<HTMLElement>;
  rendering: boolean;
  controls: Array<ReturnType<typeof createTableControls>>;
  editSession: (CellFocus & { originalHtml: string }) | null;
}
const defaultLabels: HtmlTableLabels = {
  ...defaultTableLabels,
  mergeCells: "Merge cells", splitCell: "Split cell",
  selectCells: "Shift-click to select cells", resizeColumn: "Resize column", cell: "Cell",
};

function contentPoint(element: HTMLElement): CellFocus {
  return { table: Number(element.dataset.table), row: Number(element.dataset.row), column: Number(element.dataset.column) };
}
function refreshCellCaret(content: HTMLElement) {
  content.querySelectorAll("[data-markra-caret-break]").forEach(element => element.remove());
  let last = content.lastChild;
  while (last?.nodeType === Node.TEXT_NODE && !last.textContent) last = last.previousSibling;
  // Browsers need one extra trailing break to display the caret after an authored final line break.
  if (!last || (last instanceof Element && last.tagName === "BR")) {
    const br = content.ownerDocument.createElement("br");
    br.dataset.markraCaretBreak = "true"; content.append(br);
  }
}
function insertCellText(content: HTMLElement, text: string) {
  content.querySelectorAll("[data-markra-caret-break]").forEach(element => element.remove());
  const document = content.ownerDocument;
  const selection = document.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
  if (!content.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(content); range.collapse(false); }
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  text.replace(/\r\n?/gu, "\n").split("\n").forEach((part, index) => {
    if (index) { const br = document.createElement("br"); br.dataset.markraSourceBreak = "true"; fragment.append(br); }
    fragment.append(document.createTextNode(part));
  });
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); }
  refreshCellCaret(content);
}

export class HtmlTableWidget extends WidgetType {
  private runtime: Runtime;
  private readonly labels: HtmlTableLabels;
  constructor(range: HtmlRange, readonly options: HtmlTableWidgetOptions, readonly readOnly: boolean, tables: HtmlTable[]) {
    super();
    this.labels = { ...defaultLabels, ...options.tableLabels };
    this.runtime = { range, tables, root: null, selections: new Map(), controllers: [], images: new WeakMap(), composing: null, pendingInput: null, focus: null, historyCell: null, dirty: new WeakSet(), rendering: false, controls: [], editSession: null };
  }

  eq(other: HtmlTableWidget) {
    if (other.runtime.range.from !== this.runtime.range.from || other.runtime.range.to !== this.runtime.range.to ||
      other.runtime.range.source !== this.runtime.range.source || other.readOnly !== this.readOnly ||
      other.options.resolveImageSrc !== this.options.resolveImageSrc || JSON.stringify(other.labels) !== JSON.stringify(this.labels)) return false;
    other.runtime = this.runtime;
    return true;
  }
  ignoreEvent() { return true; }

  updateDOM(dom: HTMLElement, view: EditorView, previous: this) {
    const nextRange = this.runtime.range;
    const nextTables = this.runtime.tables;
    const sameSource = previous.runtime.range.source === nextRange.source;
    const ownInput = previous.runtime.pendingInput === nextRange.source;
    const sameOptions = previous.options.resolveImageSrc === this.options.resolveImageSrc && JSON.stringify(previous.labels) === JSON.stringify(this.labels);
    const active = dom.ownerDocument.activeElement;
    const activeContent = active instanceof HTMLElement && dom.contains(active) && active.classList.contains("cm-markra-html-cell-content") ? active : null;
    const focus = previous.runtime.focus ?? (activeContent ? contentPoint(activeContent) : null);
    // Input transactions must reuse their native editing host, particularly while an IME owns the caret.
    this.runtime = previous.runtime;
    this.runtime.range = nextRange;
    this.runtime.tables = nextTables;
    this.runtime.pendingInput = null;
    dom.dataset.value = nextRange.source;
    if ((sameSource || ownInput) && sameOptions && previous.readOnly === this.readOnly) {
      this.updateControls(view);
      this.runtime.controllers.forEach(controller => controller.measure());
      return true;
    }
    this.runtime.editSession = null;
    this.render(view, dom);
    this.runtime.focus = null;
    if (focus && !this.readOnly) queueMicrotask(() => {
      if (dom.isConnected && dom.ownerDocument.activeElement === dom.ownerDocument.body) this.restoreFocus(view, focus);
    });
    return true;
  }

  private restoreFocus(view: EditorView, focus: CellFocus) {
    if (view.state.readOnly) return;
    const cell = this.runtime.tables[focus.table]?.grid[focus.row]?.[focus.column];
    const selector = focus.resize
      ? `.cm-markra-html-table[data-table="${focus.table}"] [role="separator"][data-column="${focus.column}"]`
      : `.cm-markra-html-cell-content[data-table="${focus.table}"][data-row="${cell?.row ?? focus.row}"][data-column="${cell?.column ?? focus.column}"]`;
    const target = this.runtime.root?.querySelector<HTMLElement>(selector);
    if (target instanceof HTMLTableCellElement) placeTableCellCaret(target, tableCellCaretOffset(target));
    else target?.focus({ preventScroll: true });
  }

  private change(view: EditorView, source: string | null, inputCell?: HTMLElement) {
    const range = this.runtime.range;
    if (view.state.readOnly || source === null || source === range.source || view.state.sliceDoc(range.from, range.to) !== range.source) {
      // A no-op resize must not leave a focus request for the next cell edit.
      this.runtime.focus = null;
      return false;
    }
    const key = inputCell ? `${inputCell.dataset.table}:${inputCell.dataset.row}:${inputCell.dataset.column}` : null;
    const document = view.dom.ownerDocument;
    const restoreInputFocus = inputCell && (document.activeElement === inputCell ||
      document.activeElement === inputCell.closest("table"));
    const actionFocus = this.runtime.focus;
    const selection = document.getSelection();
    const caret = restoreInputFocus && selection?.anchorNode && selection.focusNode
      ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, head: selection.focusNode, headOffset: selection.focusOffset }
      : null;
    const isolate = !key || key !== this.runtime.historyCell;
    this.runtime.historyCell = key;
    if (inputCell) this.runtime.pendingInput = source;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: source },
      userEvent: inputCell ? "input.type" : "input.table",
      annotations: isolate ? isolateHistory.of(inputCell ? "before" : "full") : [],
    });
    // CodeMirror can move the containing source line even when it reuses the widget itself.
    if (restoreInputFocus && inputCell.isConnected) {
      inputCell.focus({ preventScroll: true });
      if (caret && inputCell.contains(caret.anchor) && inputCell.contains(caret.head)) {
        document.getSelection()?.setBaseAndExtent(caret.anchor, caret.anchorOffset, caret.head, caret.headOffset);
      }
    }
    if (actionFocus) this.restoreFocus(view, actionFocus);
    this.runtime.pendingInput = null;
    return true;
  }

  private cellHtml(content: HTMLElement) {
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-markra-table-caret-host]").forEach(host => host.replaceWith(content.ownerDocument.createTextNode((host.textContent ?? "").replaceAll(tableCaretPlaceholder, ""))));
    clone.querySelectorAll("[data-markra-caret-break]").forEach(element => element.remove());
    const renderedImages = content.querySelectorAll("img");
    clone.querySelectorAll("img").forEach((image, index) => {
      const original = this.runtime.images.get(renderedImages[index]!);
      if (original !== undefined) image.setAttribute("src", original);
    });
    // A browser-created lone break is an empty caret host; authored breaks carry an internal marker.
    const placeholder = clone.childNodes.length === 1 && clone.firstElementChild?.tagName === "BR" && !clone.firstElementChild.hasAttribute("data-markra-source-break");
    clone.querySelectorAll("[data-markra-source-break]").forEach(element => element.removeAttribute("data-markra-source-break"));
    const safe = content.ownerDocument.createElement("div");
    if (!placeholder) safe.append(...sanitizeRawHtml(clone.innerHTML, content.ownerDocument));
    return safe.innerHTML;
  }

  private commitCell(view: EditorView, content: HTMLElement) {
    if (view.state.readOnly || this.runtime.composing === content || this.runtime.rendering ||
      !this.runtime.root?.contains(content) || !this.runtime.dirty.has(content)) return;
    this.runtime.dirty.delete(content);
    const point = contentPoint(content);
    this.change(view, editHtmlCell(this.runtime.range.source, content.ownerDocument, point.table, point, this.cellHtml(content)), content);
  }

  private choose(view: EditorView, table: number, point: HtmlCellPoint, extend: boolean) {
    const previous = this.runtime.selections.get(table);
    this.runtime.selections.set(table, { anchor: extend && previous ? previous.anchor : point, head: point });
    this.updateControls(view);
  }

  private updateControls(view: EditorView) {
    const root = this.runtime.root;
    if (!root) return;
    this.runtime.controls.forEach(control => control.update());
    this.runtime.tables.forEach((table, index) => {
      const wrapper = root.querySelector<HTMLElement>(`.cm-markra-html-table[data-table="${index}"]`);
      if (!wrapper) return;
      const current = this.runtime.selections.get(index);
      const selection = current ? htmlTableSelection(table, current.anchor, current.head) : null;
      wrapper.querySelectorAll<HTMLTableCellElement>("[data-html-cell]").forEach(cell => {
        const selected = selection && selection.cells.length > 1 && selection.cells.some(item => item.row === Number(cell.dataset.row) && item.column === Number(cell.dataset.column));
        cell.toggleAttribute("data-selected", Boolean(selected));
      });
      const merge = wrapper.querySelector<HTMLButtonElement>('[data-action="merge"]');
      const split = wrapper.querySelector<HTMLButtonElement>('[data-action="split"]');
      if (merge) merge.disabled = view.state.readOnly || Boolean(this.runtime.composing) || !selection?.mergeable;
      const cell = selection?.cells.length === 1 ? selection.cells[0] : null;
      if (split) split.disabled = view.state.readOnly || Boolean(this.runtime.composing) || !cell || (cell.rowSpan === 1 && cell.columnSpan === 1);
    });
  }

  private beginCell(table: number, point: HtmlCellPoint) {
    const current = this.runtime.editSession;
    if (current?.table === table && current.row === point.row && current.column === point.column) return;
    const cell = this.runtime.tables[table]?.grid[point.row]?.[point.column];
    if (cell) this.runtime.editSession = { table, row: cell.row, column: cell.column, originalHtml: cell.element.innerHTML };
  }

  private bindContent(view: EditorView, content: HTMLElement, table: number, point: HtmlCellPoint) {
    content.addEventListener("mousedown", event => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.stopPropagation();
      if (event.shiftKey) event.preventDefault();
      if (view.state.selection.main.head > this.runtime.range.from && view.state.selection.main.head < this.runtime.range.to) {
        view.dispatch({ selection: { anchor: this.runtime.range.from } });
      }
      if (!event.shiftKey) this.beginCell(table, point);
      this.choose(view, table, point, event.shiftKey);
    });
    content.addEventListener("focus", () => this.beginCell(table, point));
    content.addEventListener("blur", () => {
      this.runtime.composing = null;
      this.commitCell(view, content);
    });
  }

  private bindTable(view: EditorView, table: HTMLTableElement, index: number) {
    const document = table.ownerDocument;
    table.addEventListener("focusout", event => {
      // Native cell-to-host focus can flush microtasks before activeElement leaves body.
      if (event.relatedTarget instanceof Node && table.contains(event.relatedTarget)) return;
      queueMicrotask(() => {
        if (table.isConnected && !table.contains(document.activeElement) && this.runtime.editSession?.table === index) {
          this.runtime.editSession = null;
        }
      });
    });
    const active = () => {
      const cell = activeTableCell(table);
      if (cell?.classList.contains("cm-markra-html-cell-content")) return cell;
      const session = this.runtime.editSession;
      return session?.table === index
        ? table.querySelector<HTMLTableCellElement>(`[data-row="${session.row}"][data-column="${session.column}"]`)
        : null;
    };
    const repair = () => {
      const cell = active();
      if (cell && !cell.contains(document.getSelection()?.anchorNode ?? null)) placeTableCellCaret(cell, tableCellCaretOffset(cell));
      return cell;
    };
    const insertTarget = () => {
      const selection = document.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range && !range.collapsed) {
        const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const cell = start?.closest<HTMLTableCellElement>("th, td");
        if (cell?.closest("table") === table && !cell.contains(range.endContainer)) {
          range.collapse(true);
          cell.focus(); selection!.removeAllRanges(); selection!.addRange(range);
        }
      }
      return repair();
    };
    table.addEventListener("beforeinput", event => {
      if (view.state.readOnly) { event.preventDefault(); return; }
      if (event instanceof InputEvent && ["insertLineBreak", "insertParagraph"].includes(event.inputType)) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (event instanceof InputEvent && event.inputType.startsWith("delete")) {
        const cleared = clearTableSelection(table);
        if (cleared.length) {
          event.preventDefault(); event.stopPropagation();
          const first = contentPoint(cleared[0]!);
          this.runtime.focus = first;
          this.change(view, editHtmlCells(this.runtime.range.source, document, index,
            cleared.map(cell => ({ ...contentPoint(cell), html: this.cellHtml(cell) }))));
          return;
        }
      }
      insertTarget();
    });
    table.addEventListener("compositionstart", event => {
      event.stopPropagation();
      const cell = insertTarget();
      if (!cell) return;
      this.beginCell(index, contentPoint(cell));
      if (!cell.textContent) {
        const host = createTableCaretHost(document);
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        // Textless cells can contain images, nested tables or authored line breaks.
        if (range && cell.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          range.insertNode(host.host);
        } else {
          cell.append(host.host);
        }
        placeTableCellCaret(cell, tableCaretPlaceholder.length);
      }
      this.runtime.composing = cell;
      this.updateControls(view);
    });
    table.addEventListener("compositionend", event => {
      event.stopPropagation();
      const cell = this.runtime.composing ?? active();
      this.runtime.composing = null;
      if (cell) { this.runtime.dirty.add(cell); this.commitCell(view, cell); }
      this.updateControls(view);
    });
    table.addEventListener("input", event => {
      event.stopPropagation();
      const cell = event.target instanceof HTMLElement && event.target.classList.contains("cm-markra-html-cell-content") ? event.target : active();
      if (!cell) return;
      this.runtime.dirty.add(cell);
      if (this.runtime.composing || (event instanceof InputEvent && event.isComposing)) return;
      refreshCellCaret(cell);
      this.commitCell(view, cell);
    });
    table.addEventListener("paste", event => {
      event.preventDefault(); event.stopPropagation();
      if (view.state.readOnly || !event.clipboardData) return;
      const cell = insertTarget();
      if (!cell) return;
      insertCellText(cell, event.clipboardData.getData("text/plain"));
      this.runtime.dirty.add(cell); this.commitCell(view, cell);
    });
    table.addEventListener("drop", event => { event.preventDefault(); event.stopPropagation(); });
    table.addEventListener("copy", event => {
      if (!event.clipboardData) return;
      const selection = document.getSelection();
      const cell = active();
      const withinCell = selection && !selection.isCollapsed && cell?.contains(selection.anchorNode) && cell.contains(selection.focusNode);
      event.preventDefault(); event.stopPropagation();
      event.clipboardData.setData("text/plain", withinCell ? selection!.toString() : this.runtime.tables[index]!.element.outerHTML);
    });
    table.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && ["s", "f", "p"].includes(event.key.toLowerCase())) return;
      event.stopPropagation();
      const cell = active();
      if (!cell || event.isComposing || this.runtime.composing) return;
      const point = contentPoint(cell);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) redo(view); else undo(view);
        this.restoreFocus(view, point); return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo(view); this.restoreFocus(view, point); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); const range = document.createRange(); range.selectNodeContents(cell);
        const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return;
      }
      if (event.key === "Enter" && !view.state.readOnly) {
        event.preventDefault();
        if (event.shiftKey) {
          insertCellText(cell, "\n"); this.runtime.dirty.add(cell); this.commitCell(view, cell);
        } else {
          this.commitCell(view, cell); this.runtime.editSession = null; view.focus();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        const session = this.runtime.editSession;
        this.runtime.editSession = null;
        if (session) this.change(view, editHtmlCell(this.runtime.range.source, document, session.table, session, session.originalHtml));
        view.focus(); return;
      }
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        this.commitCell(view, cell);
        const cells = [...table.querySelectorAll<HTMLTableCellElement>(".cm-markra-html-cell-content")].filter(cell => cell.closest("table") === table);
        const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
        if (!next) return;
        event.preventDefault();
        this.choose(view, index, contentPoint(next), false);
        placeTableCellCaret(next, tableCellCaretOffset(next));
      }
    });
  }

  private structure(view: EditorView, index: number, action: HtmlTableAction) {
    const model = this.runtime.tables[index];
    if (!model) return false;
    const source = transformHtmlTable(this.runtime.range.source, view.dom.ownerDocument, index, action);
    if (source === null) return false;
    const next = readHtmlTables(source, view.dom.ownerDocument).tables[index];
    if (action.type === "add-column") this.runtime.focus = { table: index, row: 0, column: model.columnCount };
    else if (action.type === "add-row") {
      const footer = model.rows.findIndex(row => row.parentElement?.tagName === "TFOOT");
      const row = footer < 0 ? model.rows.length : footer;
      const cell = next?.cells.find(cell => cell.row === row);
      this.runtime.focus = { table: index, row, column: cell?.column ?? 0 };
    } else if (action.type === "resize") this.runtime.focus = { table: index, row: Math.max(0, action.rows - 1), column: Math.max(0, action.columns - 1) };
    else if (action.type === "delete-row" && next) this.runtime.focus = { table: index, row: Math.min(action.index, next.rows.length - 1), column: 0 };
    else if (action.type === "delete-column" && next) this.runtime.focus = { table: index, row: 0, column: Math.min(action.index, next.columnCount - 1) };
    const changed = this.change(view, source);
    if (changed && action.type === "delete-table") view.focus();
    return changed;
  }

  private render(view: EditorView, root: HTMLElement) {
    this.runtime.rendering = true;
    this.runtime.controllers.forEach(controller => controller.destroy()); this.runtime.controllers = [];
    this.runtime.controls.forEach(control => control.destroy()); this.runtime.controls = [];
    this.runtime.images = new WeakMap(); this.runtime.composing = null;
    const document = root.ownerDocument;
    root.replaceChildren(...sanitizeRawHtml(this.runtime.range.source, document, this.options));
    const rendered = [...root.querySelectorAll("table")].filter(table => !table.parentElement?.closest("table"));
    if (rendered.length !== this.runtime.tables.length) { this.runtime.rendering = false; return; }
    rendered.forEach((table, index) => {
      const model = this.runtime.tables[index]!;
      const wrapper = document.createElement("div"); wrapper.className = "cm-markra-html-table cm-markra-table-wrap tableWrapper markra-table-controls-wrapper"; wrapper.dataset.table = String(index);
      const merge = () => {
        const selected = this.runtime.selections.get(index); if (!selected) return;
        const selection = htmlTableSelection(this.runtime.tables[index]!, selected.anchor, selected.head); if (!selection?.mergeable) return;
        const point = { row: selection.bounds.top, column: selection.bounds.left };
        this.runtime.selections.set(index, { anchor: point, head: point }); this.runtime.focus = { table: index, ...point };
        this.change(view, mergeHtmlCells(this.runtime.range.source, document, index, selected.anchor, selected.head));
      };
      const split = () => {
        const selected = this.runtime.selections.get(index); if (!selected) return;
        const cell = this.runtime.tables[index]?.grid[selected.anchor.row]?.[selected.anchor.column]; if (!cell) return;
        const point = { row: cell.row, column: cell.column };
        this.runtime.selections.set(index, { anchor: point, head: point }); this.runtime.focus = { table: index, ...point };
        this.change(view, splitHtmlCell(this.runtime.range.source, document, index, point));
      };
      const scroll = document.createElement("div"); scroll.className = "markra-table-scroll";
      const grid = document.createElement("div"); grid.className = "cm-markra-html-table-grid";
      table.replaceWith(wrapper); grid.append(table); scroll.append(grid); wrapper.append(scroll);
      table.classList.add("cm-markra-table");
      table.setAttribute("contenteditable", String(!this.readOnly && model.valid));
      // Only cell edits have a source transaction; captions remain selectable preview content.
      table.caption?.setAttribute("contenteditable", "false");
      table.title = this.labels.selectCells;
      const renderedCells = Array.from(table.rows).flatMap(row => Array.from(row.cells));
      const columnCells: Array<{ element: HTMLTableCellElement; column: number; columnSpan: number }> = [];
      model.cells.forEach((cell, cellIndex) => {
        const td = renderedCells[cellIndex]; if (!td) return;
        td.dataset.htmlCell = "true"; td.dataset.row = String(cell.row); td.dataset.column = String(cell.column);
        const content = td; content.classList.add("cm-markra-html-cell-content");
        content.replaceChildren();
        content.dataset.table = String(index); content.dataset.row = String(cell.row); content.dataset.column = String(cell.column);
        content.tabIndex = this.readOnly || !model.valid ? -1 : 0;
        content.title = `${this.labels.cell} ${cell.row + 1}, ${cell.column + 1}`;
        const imageSources: string[] = [];
        content.append(...sanitizeRawHtml(cell.element.innerHTML, document, { resolveImageSrc: source => {
          imageSources.push(source); return this.options.resolveImageSrc?.(source) ?? source;
        } }));
        content.querySelectorAll("img[src]").forEach((image, i) => { if (imageSources[i] !== undefined) this.runtime.images.set(image, imageSources[i]!); });
        content.querySelectorAll("br").forEach(br => { br.dataset.markraSourceBreak = "true"; });
        content.querySelectorAll("table").forEach(nested => { nested.setAttribute("contenteditable", "false"); });
        if (!this.readOnly && model.valid) refreshCellCaret(content);
        this.bindContent(view, content, index, cell);
        columnCells.push({ element: td, column: cell.column, columnSpan: cell.columnSpan });
      });
      this.bindTable(view, table, index);
      const selection = () => {
        const value = this.runtime.selections.get(index);
        return value ? htmlTableSelection(this.runtime.tables[index]!, value.anchor, value.head) : null;
      };
      const updateLayout = () => {
        const current = this.runtime.tables[index]!;
        const mode = htmlTableWidthMode(current.element);
        const alignment = htmlTableAlignment(current);
        wrapper.dataset.widthMode = mode; table.dataset.widthMode = mode;
        wrapper.dataset.tableAlignment = alignment ?? "left";
        scroll.dataset.tableAlignment = alignment ?? "left";
        table.dataset.tableAlignment = alignment ?? "left";
      };
      updateLayout();
      this.runtime.controls.push(createTableControls(wrapper, table, {
        labels: this.labels,
        readOnly: () => view.state.readOnly || !this.runtime.tables[index]?.valid || this.runtime.composing !== null,
        shape: () => ({ columns: this.runtime.tables[index]!.columnCount, rows: this.runtime.tables[index]!.rows.length }),
        alignment: () => htmlTableAlignment(this.runtime.tables[index]!),
        widthMode: () => htmlTableWidthMode(this.runtime.tables[index]!.element),
        resize: (columns, rows) => this.structure(view, index, { type: "resize", columns, rows }),
        align: alignment => this.structure(view, index, { type: "align", alignment }),
        setWidthMode: mode => this.structure(view, index, { type: "width-mode", mode }),
        addRow: () => this.structure(view, index, { type: "add-row" }),
        addColumn: () => this.structure(view, index, { type: "add-column" }),
        deleteRow: row => this.structure(view, index, { type: "delete-row", index: row }),
        deleteColumn: column => this.structure(view, index, { type: "delete-column", index: column }),
        deleteTable: () => this.structure(view, index, { type: "delete-table" }),
        cellPosition: cell => ({ row: Number(cell.dataset.row), column: Number(cell.dataset.column), header: cell.dataset.row === "0" }),
        focusEditor: () => view.focus(),
        extras: [
          { label: this.labels.mergeCells, action: "merge", run: merge, icon: createLucideIcon(document, TableCellsMerge, "markra-table-control-icon"), enabled: () => !this.runtime.composing && Boolean(selection()?.mergeable) },
          { label: this.labels.splitCell, action: "split", run: split, icon: createLucideIcon(document, TableCellsSplit, "markra-table-control-icon"), enabled: () => {
            const selected = selection();
            return !this.runtime.composing && selected?.cells.length === 1 && (selected.cells[0]!.rowSpan > 1 || selected.cells[0]!.columnSpan > 1);
          } },
        ],
      }));
      if (!this.readOnly && model.valid && model.columnCount) {
        this.runtime.controllers.push(attachHtmlColumnResizers(view, table, grid, model.columnCount, columnCells, this.labels.resizeColumn, (widths, column) => {
          this.runtime.focus = { table: index, row: 0, column, resize: true };
          this.change(view, resizeHtmlColumns(this.runtime.range.source, document, index, widths));
        }, () => this.runtime.composing === null));
      }
    });
    this.updateControls(view);
    this.runtime.rendering = false;
  }

  toDOM(view: EditorView) {
    const root = view.dom.ownerDocument.createElement("div");
    root.className = "markra-html-node"; root.setAttribute("contenteditable", "false");
    root.dataset.type = "html"; root.dataset.value = this.runtime.range.source;
    this.runtime.root = root;
    root.addEventListener("keydown", event => {
      if (view.state.readOnly || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && !(event.ctrlKey && key === "y")) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof HTMLElement ? event.target : null;
      const table = Number(target?.closest<HTMLElement>(".cm-markra-html-table")?.dataset.table ?? 0);
      const resize = target?.closest<HTMLElement>(".cm-markra-html-column-resize");
      const selected = this.runtime.selections.get(table)?.anchor ?? { row: 0, column: 0 };
      const focus = { table, ...selected, ...(resize ? { column: Number(resize.dataset.column), resize: true } : {}) };
      if (key === "y" || event.shiftKey) redo(view); else undo(view);
      this.restoreFocus(view, focus);
    });
    this.render(view, root);
    return root;
  }
  destroy() {
    this.runtime.controllers.forEach(controller => controller.destroy()); this.runtime.controllers = [];
    this.runtime.controls.forEach(control => control.destroy()); this.runtime.controls = [];
  }
}

export function createHtmlTableWidget(range: HtmlRange, view: EditorView, options: HtmlTableWidgetOptions) {
  if (!/<table\b/iu.test(range.source)) return null;
  const { tables } = readHtmlTables(range.source, view.dom.ownerDocument);
  return tables.length ? new HtmlTableWidget(range, options, view.state.readOnly, tables) : null;
}
