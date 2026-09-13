import { describe, expect, it } from "vitest";
import {
  readHtmlTables, htmlTableSelection, editHtmlCell, mergeHtmlCells,
  splitHtmlCell, resizeHtmlColumns,
} from "./html-table.ts";

const source = '<div data-example="keep"><table><caption>Synthetic</caption><thead><tr><th colspan="3">Heading</th></tr></thead><tbody><tr><td rowspan="2">A</td><td><strong>B</strong></td><td>C</td></tr><tr><td>D</td><td>E</td></tr></tbody></table></div>';
const point = (row: number, column: number) => ({ row, column });
const tableOf = (html: string) => readHtmlTables(html, document).tables[0]!;

describe("HTML table source operations", () => {
  it("maps merged cells onto logical coordinates without changing source", () => {
    const table = tableOf(source);
    expect(table.columnCount).toBe(3);
    expect(table.rows).toHaveLength(3);
    expect(table.grid[1]?.[0]).toBe(table.grid[2]?.[0]);
    expect(table.grid[2]?.[1]?.element.textContent).toBe("D");
    expect(table.cells).toHaveLength(6);
  });

  it("expands selection to include whole merged cells", () => {
    const selection = htmlTableSelection(tableOf(source), point(2, 0), point(2, 1));
    expect(selection?.bounds).toEqual({ top: 1, left: 0, bottom: 2, right: 1 });
    expect(selection?.cells.map(cell => cell.element.textContent)).toEqual(["A", "B", "D"]);
  });

  it("rejects a merge across header/body row groups", () => {
    expect(mergeHtmlCells(source, document, 0, point(0, 0), point(1, 1))).toBeNull();
  });

  it("uses the same valid span limits as the preview and refuses oversized merges", () => {
    const invalid = '<table><tr><td colspan="1001">A</td><td>B</td></tr></table>';
    expect(tableOf(invalid).columnCount).toBe(2);
    const wide = '<table><tr><td colspan="1000">A</td><td>B</td></tr></table>';
    expect(mergeHtmlCells(wide, document, 0, point(0, 0), point(0, 1000))).toBeNull();
  });

  it("merges a rectangle while retaining all contents and formatting", () => {
    const merged = mergeHtmlCells(source, document, 0, point(1, 1), point(2, 2))!;
    const table = tableOf(merged);
    const cell = table.grid[1]?.[1];
    expect(cell?.rowSpan).toBe(2);
    expect(cell?.columnSpan).toBe(2);
    expect(cell?.element.innerHTML).toBe("<strong>B</strong><br>C<br>D<br>E");
    expect(table.cells).toHaveLength(3);
    expect(merged).toContain('data-example="keep"');
    expect(merged).toContain("<caption>Synthetic</caption>");
  });

  it("splits all covered slots, leaving contents in the top-left cell", () => {
    const merged = mergeHtmlCells(source, document, 0, point(1, 1), point(2, 2))!;
    const split = splitHtmlCell(merged, document, 0, point(2, 2))!;
    const table = tableOf(split);
    expect(table.rows.map(row => row.cells.length)).toEqual([1, 3, 2]);
    expect(table.grid[1]?.[1]?.element.innerHTML).toBe("<strong>B</strong><br>C<br>D<br>E");
    expect(table.grid[1]?.[2]?.element.innerHTML).toBe("");
    expect(table.grid[2]?.[1]?.element.innerHTML).toBe("");
    expect(table.grid[2]?.[2]?.element.innerHTML).toBe("");
  });

  it("honors rowspan zero within its row group and splits without duplicating ids", () => {
    const html = '<table><tbody><tr><td id="synthetic" rowspan="0">A</td><td>B</td></tr><tr><td>C</td></tr></tbody><tbody><tr><td>D</td><td>E</td></tr></tbody></table>';
    expect(tableOf(html).grid[0]?.[0]?.rowSpan).toBe(2);
    const split = splitHtmlCell(html, document, 0, point(0, 0))!;
    expect(tableOf(split).rows.map(row => row.cells.length)).toEqual([2, 2, 2]);
    expect(split.match(/id="synthetic"/gu)).toHaveLength(1);
  });

  it("edits one cell without modifying other table contents, attributes or nested tables", () => {
    const html = '<table class="authored"><tr><td>A<table><tr><td>Nested</td></tr></table></td><td data-example="keep">B</td></tr></table>';
    const edited = editHtmlCell(html, document, 0, point(0, 1), "New &amp; <em>text</em>")!;
    expect(readHtmlTables(edited, document).tables).toHaveLength(1);
    expect(tableOf(edited).cells).toHaveLength(2);
    expect(edited).toContain('<td>Nested</td>');
    expect(edited).toContain('class="authored"');
    expect(edited).toContain('<td data-example="keep">New &amp; <em>text</em></td>');
  });

  it("persists widths in colgroups while retaining authored non-width attributes", () => {
    const html = '<table style="color:red"><caption>Widths</caption><colgroup class="group"><col span="2" style="background:yellow"></colgroup><tr><td>A</td><td>B</td></tr></table>';
    const resized = resizeHtmlColumns(html, document, 0, [120, 240])!;
    const table = tableOf(resized).element;
    expect(table.style.width).toBe("360px");
    expect(table.style.tableLayout).toBe("fixed");
    expect(table.style.color).toBe("red");
    expect(table.querySelector("colgroup")?.className).toBe("group");
    expect([...table.querySelectorAll("col")].map(col => col.style.width)).toEqual(["120px", "240px"]);
    expect(table.querySelector("col")?.style.background).toBe("yellow");
    expect(table.firstElementChild?.tagName).toBe("CAPTION");
  });

  it("does not duplicate a spanning column's id when persisting widths", () => {
    const html = '<table><colgroup><col id="synthetic-column" span="2"></colgroup><tr><td>A</td><td>B</td></tr></table>';
    const resized = resizeHtmlColumns(html, document, 0, [120, 180])!;
    expect(tableOf(resized).element.querySelectorAll('[id="synthetic-column"]')).toHaveLength(1);
    expect([...tableOf(resized).element.querySelectorAll("col")].map(col => col.style.width)).toEqual(["120px", "180px"]);
  });

  it("adds a colgroup after a caption and keeps widths through merge and split", () => {
    const resized = resizeHtmlColumns(source, document, 0, [100, 150, 200])!;
    expect(tableOf(resized).element.children[1]?.tagName).toBe("COLGROUP");
    const merged = mergeHtmlCells(resized, document, 0, point(1, 1), point(2, 2))!;
    const split = splitHtmlCell(merged, document, 0, point(1, 1))!;
    expect([...tableOf(split).element.querySelectorAll("col")].map(col => col.style.width)).toEqual(["100px", "150px", "200px"]);
  });

  it("rejects missing cells, invalid widths, overlapping spans and nonrectangular holes", () => {
    expect(editHtmlCell(source, document, 4, point(0, 0), "X")).toBeNull();
    expect(resizeHtmlColumns(source, document, 0, [100, NaN, 200])).toBeNull();
    expect(resizeHtmlColumns(source, document, 0, [100])).toBeNull();
    expect(splitHtmlCell(source, document, 0, point(1, 1))).toBeNull();
    const hole = '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    expect(mergeHtmlCells(hole, document, 0, point(0, 0), point(1, 1))).toBeNull();
    const overlap = '<table><tr><td>A</td><td rowspan="2">B</td></tr><tr><td colspan="2">C</td></tr></table>';
    expect(tableOf(overlap).valid).toBe(false);
    expect(mergeHtmlCells(overlap, document, 0, point(0, 0), point(1, 0))).toBeNull();
  });
});

describe("HTML table structure controls", () => {
  it("adds a column and a body row around existing merged cells", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const column = transformHtmlTable(source, document, 0, { type: "add-column" })!;
    expect(tableOf(column).columnCount).toBe(4);
    expect(tableOf(column).grid[2]?.[0]?.rowSpan).toBe(2);
    const row = transformHtmlTable(column, document, 0, { type: "add-row" })!;
    expect(tableOf(row).rows).toHaveLength(4);
    expect(tableOf(row).rows[3]?.cells).toHaveLength(4);
  });

  it("shrinks spans when deleting a column and moves surviving rowspan content when deleting its first row", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const removed = transformHtmlTable(source, document, 0, { type: "delete-column", index: 1 })!;
    expect(tableOf(removed).columnCount).toBe(2);
    expect(tableOf(removed).grid[0]?.[0]?.columnSpan).toBe(2);
    expect(tableOf(removed).grid[1]?.[1]?.element.textContent).toBe("C");
    const row = transformHtmlTable(source, document, 0, { type: "delete-row", index: 1 })!;
    expect(tableOf(row).rows).toHaveLength(2);
    expect(tableOf(row).rows[1]?.textContent).toBe("ADE");
    expect(tableOf(row).grid[1]?.[0]?.rowSpan).toBe(1);
  });

  it("adds rows before a footer and honors open-ended rowspan groups", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const html = '<table><tbody><tr><td rowspan="0">A</td><td>B</td></tr></tbody><tfoot><tr><td colspan="2">Total</td></tr></tfoot></table>';
    const added = transformHtmlTable(html, document, 0, { type: "add-row" })!;
    expect(tableOf(added).rows.map(row => row.parentElement?.tagName)).toEqual(["TBODY", "TBODY", "TFOOT"]);
    expect(tableOf(added).grid[1]?.[0]?.element.textContent).toBe("A");
    expect(tableOf(added).rows[1]?.cells).toHaveLength(1);
  });

  it("resizes a merged table while retaining surviving content and column widths", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const widths = resizeHtmlColumns(source, document, 0, [100, 150, 200])!;
    const resized = transformHtmlTable(widths, document, 0, { type: "resize", columns: 2, rows: 2 })!;
    const table = tableOf(resized);
    expect(table.rows).toHaveLength(2);
    expect(table.columnCount).toBe(2);
    expect(table.grid[1]?.[0]?.rowSpan).toBe(1);
    expect(table.grid[1]?.[1]?.element.textContent).toBe("B");
    expect([...table.element.querySelectorAll("col")].map(col => col.style.width)).toEqual(["100px", "150px"]);
    expect(table.element.style.width).toBe("250px");
  });

  it("persists alignment and switches manual widths to auto or even layout", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const aligned = transformHtmlTable(source, document, 0, { type: "align", alignment: "right" })!;
    expect(tableOf(aligned).cells.every(cell => cell.element.style.textAlign === "right")).toBe(true);
    const manual = resizeHtmlColumns(aligned, document, 0, [100, 150, 200])!;
    const auto = transformHtmlTable(manual, document, 0, { type: "width-mode", mode: "auto" })!;
    expect(tableOf(auto).element.style.tableLayout).toBe("auto");
    expect(tableOf(auto).element.style.width).toBe("100%");
    const even = transformHtmlTable(auto, document, 0, { type: "width-mode", mode: "even" })!;
    expect(tableOf(even).element.style.tableLayout).toBe("fixed");
    expect(tableOf(even).element.querySelector("col")?.style.width).toContain("%");
  });

  it("preserves the last row/column and only deletes the selected table", async () => {
    const { transformHtmlTable } = await import("./html-table-actions.ts");
    const html = '<div>Before<table><tr><td>A</td></tr></table>After</div>';
    expect(transformHtmlTable(html, document, 0, { type: "delete-column", index: 0 })).toBeNull();
    expect(transformHtmlTable(html, document, 0, { type: "delete-row", index: 0 })).toBeNull();
    expect(transformHtmlTable(html, document, 0, { type: "delete-table" })).toBe("<div>BeforeAfter</div>");
  });
});
