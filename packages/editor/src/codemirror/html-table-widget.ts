import { isolateHistory, redo, undo } from "@codemirror/commands";
import { WidgetType, type EditorView } from "@codemirror/view";
import { sanitizeRawHtml, type RawHtmlSanitizeOptions } from "../raw-html-sanitize.ts";
import {
  readHtmlTables, htmlTableSelection, editHtmlCell, mergeHtmlCells, splitHtmlCell, resizeHtmlColumns,
  type HtmlCellPoint, type HtmlTable,
} from "../html-table.ts";
import { attachHtmlColumnResizers } from "./html-table-resize.ts";

export interface HtmlTableLabels {
  mergeCells: string;
  splitCell: string;
  editSource: string;
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
}
const defaultLabels: HtmlTableLabels = {
  mergeCells: "Merge cells", splitCell: "Split cell", editSource: "Edit HTML source",
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
    this.runtime = { range, tables, root: null, selections: new Map(), controllers: [], images: new WeakMap(), composing: null, pendingInput: null, focus: null, historyCell: null, dirty: new WeakSet(), rendering: false };
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
    this.runtime.root?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }

  private change(view: EditorView, source: string | null, inputCell?: HTMLElement) {
    const range = this.runtime.range;
    if (view.state.readOnly || source === null || source === range.source || view.state.sliceDoc(range.from, range.to) !== range.source) return false;
    const key = inputCell ? `${inputCell.dataset.table}:${inputCell.dataset.row}:${inputCell.dataset.column}` : null;
    const document = view.dom.ownerDocument;
    const restoreInputFocus = inputCell && document.activeElement === inputCell;
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

  private commitCell(view: EditorView, content: HTMLElement) {
    if (view.state.readOnly || this.runtime.composing === content || this.runtime.rendering ||
      !this.runtime.root?.contains(content) || !this.runtime.dirty.has(content)) return;
    this.runtime.dirty.delete(content);
    const clone = content.cloneNode(true) as HTMLElement;
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
    const point = contentPoint(content);
    this.change(view, editHtmlCell(this.runtime.range.source, content.ownerDocument, point.table, point, safe.innerHTML), content);
  }

  private choose(view: EditorView, table: number, point: HtmlCellPoint, extend: boolean) {
    const previous = this.runtime.selections.get(table);
    this.runtime.selections.set(table, { anchor: extend && previous ? previous.anchor : point, head: point });
    this.updateControls(view);
  }

  private updateControls(view: EditorView) {
    const root = this.runtime.root;
    if (!root) return;
    this.runtime.tables.forEach((table, index) => {
      const wrapper = root.querySelector<HTMLElement>(`.cm-markra-html-table[data-table="${index}"]`);
      if (!wrapper) return;
      const current = this.runtime.selections.get(index);
      const selection = current ? htmlTableSelection(table, current.anchor, current.head) : null;
      wrapper.querySelectorAll<HTMLTableCellElement>("[data-html-cell]").forEach(cell => {
        const selected = selection?.cells.some(item => item.row === Number(cell.dataset.row) && item.column === Number(cell.dataset.column));
        cell.toggleAttribute("data-selected", Boolean(selected));
      });
      const merge = wrapper.querySelector<HTMLButtonElement>('[data-action="merge"]');
      const split = wrapper.querySelector<HTMLButtonElement>('[data-action="split"]');
      if (merge) merge.disabled = view.state.readOnly || Boolean(this.runtime.composing) || !selection?.mergeable;
      const cell = selection?.cells.length === 1 ? selection.cells[0] : null;
      if (split) split.disabled = view.state.readOnly || Boolean(this.runtime.composing) || !cell || (cell.rowSpan === 1 && cell.columnSpan === 1);
    });
  }

  private sourceButton(document: Document, view: EditorView) {
    return this.control(document, this.labels.editSource, "source", () => {
      this.runtime.composing = null;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.classList.contains("cm-markra-html-cell-content")) this.commitCell(view, active);
      const { from, to } = this.runtime.range;
      view.focus();
      view.dispatch({ selection: { anchor: Math.min(to - 1, from + 1) }, scrollIntoView: true });
    });
  }
  private control(document: Document, label: string, action: string, run: () => unknown) {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label; button.setAttribute("aria-label", label);
    button.dataset.action = action;
    button.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); if (!button.disabled) run(); });
    return button;
  }

  private bindContent(view: EditorView, content: HTMLElement, table: number, point: HtmlCellPoint) {
    const document = content.ownerDocument;
    content.addEventListener("mousedown", event => {
      event.stopPropagation();
      if (event.button !== 0) return;
      if (event.shiftKey) event.preventDefault();
      if (view.state.selection.main.head > this.runtime.range.from && view.state.selection.main.head < this.runtime.range.to) {
        view.dispatch({ selection: { anchor: this.runtime.range.from } });
      }
      this.choose(view, table, point, event.shiftKey);
    });
    content.addEventListener("focus", () => { if (!this.runtime.selections.has(table)) this.choose(view, table, point, false); });
    content.addEventListener("compositionstart", event => { event.stopPropagation(); this.runtime.composing = content; this.updateControls(view); });
    content.addEventListener("compositionend", event => { event.stopPropagation(); this.runtime.composing = null; this.commitCell(view, content); this.updateControls(view); });
    content.addEventListener("input", event => {
      event.stopPropagation();
      if (this.runtime.composing !== content) refreshCellCaret(content);
      this.runtime.dirty.add(content); this.commitCell(view, content);
    });
    content.addEventListener("blur", () => { this.runtime.composing = null; this.commitCell(view, content); });
    content.addEventListener("paste", event => {
      event.preventDefault(); event.stopPropagation();
      if (view.state.readOnly || !event.clipboardData) return;
      insertCellText(content, event.clipboardData.getData("text/plain")); this.runtime.dirty.add(content); this.commitCell(view, content);
    });
    content.addEventListener("drop", event => { event.preventDefault(); event.stopPropagation(); });
    content.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && ["s", "f", "p"].includes(event.key.toLowerCase())) return;
      event.stopPropagation();
      if (event.isComposing || this.runtime.composing === content) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) redo(view); else undo(view);
        this.restoreFocus(view, contentPoint(content)); return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo(view); this.restoreFocus(view, contentPoint(content)); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault(); const range = document.createRange(); range.selectNodeContents(content);
        const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return;
      }
      if (event.key === "Enter" && !view.state.readOnly) {
        event.preventDefault(); insertCellText(content, "\n"); this.runtime.dirty.add(content); this.commitCell(view, content); return;
      }
      if (event.key === "Tab") {
        event.preventDefault(); this.commitCell(view, content);
        const cells = [...this.runtime.root!.querySelectorAll<HTMLElement>(`.cm-markra-html-cell-content[data-table="${table}"]`)];
        const next = cells[cells.indexOf(content) + (event.shiftKey ? -1 : 1)];
        if (next) { this.choose(view, table, contentPoint(next), false); next.focus(); }
        else { view.dispatch({ selection: { anchor: event.shiftKey ? this.runtime.range.from : this.runtime.range.to } }); view.focus(); }
      }
      if (event.key === "Escape") {
        event.preventDefault(); this.commitCell(view, content);
        view.dispatch({ selection: { anchor: this.runtime.range.to } }); view.focus();
      }
    });
  }

  private render(view: EditorView, root: HTMLElement) {
    this.runtime.rendering = true;
    this.runtime.controllers.forEach(controller => controller.destroy()); this.runtime.controllers = [];
    this.runtime.images = new WeakMap(); this.runtime.composing = null;
    const document = root.ownerDocument;
    root.replaceChildren(...sanitizeRawHtml(this.runtime.range.source, document, this.options));
    const rendered = [...root.querySelectorAll("table")].filter(table => !table.parentElement?.closest("table"));
    if (rendered.length !== this.runtime.tables.length) { root.prepend(this.sourceButton(document, view)); this.runtime.rendering = false; return; }
    rendered.forEach((table, index) => {
      const model = this.runtime.tables[index]!;
      const wrapper = document.createElement("div"); wrapper.className = "cm-markra-html-table"; wrapper.dataset.table = String(index);
      const toolbar = document.createElement("div"); toolbar.className = "cm-markra-html-table-toolbar";
      const hint = document.createElement("span"); hint.textContent = this.labels.selectCells;
      const merge = this.control(document, this.labels.mergeCells, "merge", () => {
        const selected = this.runtime.selections.get(index); if (!selected) return;
        const selection = htmlTableSelection(this.runtime.tables[index]!, selected.anchor, selected.head); if (!selection?.mergeable) return;
        const point = { row: selection.bounds.top, column: selection.bounds.left };
        this.runtime.selections.set(index, { anchor: point, head: point }); this.runtime.focus = { table: index, ...point };
        this.change(view, mergeHtmlCells(this.runtime.range.source, document, index, selected.anchor, selected.head));
      });
      const split = this.control(document, this.labels.splitCell, "split", () => {
        const selected = this.runtime.selections.get(index); if (!selected) return;
        const cell = this.runtime.tables[index]?.grid[selected.anchor.row]?.[selected.anchor.column]; if (!cell) return;
        const point = { row: cell.row, column: cell.column };
        this.runtime.selections.set(index, { anchor: point, head: point }); this.runtime.focus = { table: index, ...point };
        this.change(view, splitHtmlCell(this.runtime.range.source, document, index, point));
      });
      toolbar.append(merge, split, this.sourceButton(document, view), hint);
      const scroll = document.createElement("div"); scroll.className = "markra-table-scroll";
      const grid = document.createElement("div"); grid.className = "cm-markra-html-table-grid";
      table.replaceWith(wrapper); grid.append(table); scroll.append(grid); wrapper.append(toolbar, scroll);
      const renderedCells = Array.from(table.rows).flatMap(row => Array.from(row.cells));
      const columnCells: Array<{ element: HTMLTableCellElement; column: number; columnSpan: number }> = [];
      model.cells.forEach((cell, cellIndex) => {
        const td = renderedCells[cellIndex]; if (!td) return;
        td.dataset.htmlCell = "true"; td.dataset.row = String(cell.row); td.dataset.column = String(cell.column);
        const content = document.createElement("div"); content.className = "cm-markra-html-cell-content";
        content.dataset.table = String(index); content.dataset.row = String(cell.row); content.dataset.column = String(cell.column);
        content.setAttribute("contenteditable", this.readOnly || !model.valid ? "false" : "true");
        content.tabIndex = this.readOnly || !model.valid ? -1 : 0;
        content.setAttribute("role", "textbox"); content.setAttribute("aria-multiline", "true");
        content.setAttribute("aria-readonly", String(this.readOnly || !model.valid));
        content.setAttribute("aria-label", `${this.labels.cell} ${cell.row + 1}, ${cell.column + 1}`);
        const imageSources: string[] = [];
        content.append(...sanitizeRawHtml(cell.element.innerHTML, document, { resolveImageSrc: source => {
          imageSources.push(source); return this.options.resolveImageSrc?.(source) ?? source;
        } }));
        content.querySelectorAll("img[src]").forEach((image, i) => { if (imageSources[i] !== undefined) this.runtime.images.set(image, imageSources[i]!); });
        content.querySelectorAll("br").forEach(br => { br.dataset.markraSourceBreak = "true"; });
        content.querySelectorAll("table").forEach(nested => { nested.setAttribute("contenteditable", "false"); });
        if (!this.readOnly && model.valid) refreshCellCaret(content);
        td.replaceChildren(content);
        this.bindContent(view, content, index, cell);
        columnCells.push({ element: td, column: cell.column, columnSpan: cell.columnSpan });
      });
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
  }
}

export function createHtmlTableWidget(range: HtmlRange, view: EditorView, options: HtmlTableWidgetOptions) {
  if (!/<table\b/iu.test(range.source)) return null;
  const { tables } = readHtmlTables(range.source, view.dom.ownerDocument);
  return tables.length ? new HtmlTableWidget(range, options, view.state.readOnly, tables) : null;
}
