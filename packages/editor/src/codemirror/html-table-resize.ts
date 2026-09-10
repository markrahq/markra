import type { EditorView } from "@codemirror/view";

interface ColumnCell {
  element: HTMLTableCellElement;
  column: number;
  columnSpan: number;
}

function boundedWidth(width: number) {
  return Math.min(2000, Math.max(48, Math.round(width)));
}

export function attachHtmlColumnResizers(
  view: EditorView,
  table: HTMLTableElement,
  grid: HTMLElement,
  columnCount: number,
  cells: readonly ColumnCell[],
  label: string,
  commit: (widths: number[], column: number) => unknown,
  canResize: () => boolean,
) {
  const document = table.ownerDocument;
  const window = document.defaultView!;
  const handles: HTMLElement[] = [];
  let destroyed = false;
  let cancelDrag: (() => unknown) | null = null;

  function widths() {
    const rect = table.getBoundingClientRect();
    const boundaries: Array<number | undefined> = Array(columnCount + 1);
    boundaries[0] = 0;
    boundaries[columnCount] = rect.width || columnCount * 100;
    for (const cell of cells) {
      const cellRect = cell.element.getBoundingClientRect();
      if (cellRect.width <= 0) continue;
      boundaries[cell.column] = cellRect.left - rect.left;
      boundaries[cell.column + cell.columnSpan] = cellRect.right - rect.left;
    }
    const declared = Array.from(table.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col"));
    let start = 0;
    while (start < columnCount) {
      let end = start + 1;
      while (boundaries[end] === undefined && end < columnCount) end += 1;
      for (let i = start + 1; i < end; i += 1) {
        boundaries[i] = boundaries[start]! + (boundaries[end]! - boundaries[start]!) * (i - start) / (end - start);
      }
      start = end;
    }
    return Array.from({ length: columnCount }, (_, index) => boundedWidth(
      !rect.width && declared[index]?.style.width.endsWith("px")
        ? Number.parseFloat(declared[index]!.style.width)
        : boundaries[index + 1]! - boundaries[index]!,
    ));
  }

  function measure() {
    if (destroyed) return;
    view.requestMeasure({
      key: grid,
      read: () => ({ widths: widths(), offset: table.getBoundingClientRect().left - grid.getBoundingClientRect().left }),
      write: measurement => {
        if (destroyed) return;
        let left = measurement.offset;
        handles.forEach((handle, index) => {
          left += measurement.widths[index]!;
          handle.style.left = `${left}px`;
          handle.setAttribute("aria-valuenow", String(measurement.widths[index]));
        });
      },
    });
  }

  for (let column = 0; column < columnCount; column += 1) {
    const handle = document.createElement("div");
    handle.className = "cm-markra-html-column-resize";
    handle.dataset.column = String(column);
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `${label} ${column + 1}`);
    handle.title = `${label} ${column + 1}`;
    handle.setAttribute("aria-valuemin", "48");
    handle.setAttribute("aria-valuemax", "2000");
    handle.setAttribute("aria-valuenow", "100");
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || view.state.readOnly || !canResize()) return;
      event.preventDefault(); event.stopPropagation();
      const next = widths();
      next[column] = boundedWidth(next[column]! + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 50 : 10));
      commit(next, column);
    });
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || view.state.readOnly || !canResize()) return;
      event.preventDefault(); event.stopPropagation();
      cancelDrag?.();
      const initial = widths();
      const initialX = event.clientX;
      const initialStyle = table.getAttribute("style");
      const groups = Array.from(table.children).filter(node => node.tagName === "COLGROUP");
      const preview = document.createElement("colgroup");
      for (const width of initial) {
        const col = document.createElement("col"); col.style.width = `${width}px`; preview.append(col);
      }
      for (const group of groups) group.remove();
      table.insertBefore(preview, table.caption?.nextSibling ?? table.firstChild);
      grid.classList.add("cm-markra-html-resizing");
      let next = initial;
      const restore = () => {
        preview.remove();
        const before = table.caption?.nextSibling ?? table.firstChild;
        for (const group of groups) table.insertBefore(group, before);
        if (initialStyle === null) table.removeAttribute("style"); else table.setAttribute("style", initialStyle);
        grid.classList.remove("cm-markra-html-resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("keydown", key);
        cancelDrag = null;
      };
      const move = (moveEvent: PointerEvent) => {
        if (view.state.readOnly) { cancel(); return; }
        next = [...initial];
        next[column] = boundedWidth(initial[column]! + moveEvent.clientX - initialX);
        (preview.children[column] as HTMLElement).style.width = `${next[column]}px`;
        table.style.tableLayout = "fixed";
        table.style.width = `${next.reduce((sum, width) => sum + width, 0)}px`;
        table.style.minWidth = "0px"; table.style.maxWidth = "none";
        measure();
      };
      const finish = () => {
        restore();
        if (next[column] !== initial[column] && !view.state.readOnly) commit(next, column);
        measure();
      };
      const cancel = () => { restore(); measure(); };
      const key = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); cancel(); }
      };
      cancelDrag = cancel;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("blur", cancel);
      window.addEventListener("keydown", key);
    });
    grid.append(handle); handles.push(handle);
  }
  const observer = new ResizeObserver(measure);
  observer.observe(table);
  measure();
  return {
    measure,
    destroy() {
      destroyed = true;
      cancelDrag?.();
      observer.disconnect();
    },
  };
}
