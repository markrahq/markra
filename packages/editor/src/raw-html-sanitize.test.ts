import { describe, expect, it } from "vitest";
import { sanitizeRawHtml } from "./raw-html-sanitize.ts";

function renderHtml(source: string) {
  const root = document.createElement("div");
  root.append(...sanitizeRawHtml(source, document));
  return root;
}

describe("HTML table sanitization", () => {
  it("preserves table sections, column groups and merged cells", () => {
    const root = renderHtml([
      "<table><caption>Synthetic measurements</caption>",
      '<colgroup><col span="2" width="120"></colgroup><colgroup span="1"></colgroup>',
      '<thead><tr><th colspan="3" scope="colgroup">Group</th></tr></thead>',
      '<tbody><tr><th rowspan="2" scope="rowgroup">A</th><td colspan="2"><strong>B</strong></td></tr>',
      "<tr><td>C</td><td>D<br>E</td></tr></tbody>",
      '<tfoot><tr><td colspan="3">Total</td></tr></tfoot></table>',
    ].join("\n"));
    const table = root.querySelector("table");

    expect(table?.caption?.textContent).toBe("Synthetic measurements");
    expect(table?.querySelector("col")?.span).toBe(2);
    expect(table?.querySelector("col")?.getAttribute("width")).toBe("120");
    expect(table?.querySelectorAll("colgroup")[1]?.span).toBe(1);
    expect(table?.tHead?.rows[0]?.cells[0]?.colSpan).toBe(3);
    expect(table?.tHead?.rows[0]?.cells[0]?.scope).toBe("colgroup");
    expect(table?.tBodies[0]?.rows[0]?.cells[0]?.rowSpan).toBe(2);
    expect(table?.tBodies[0]?.rows[0]?.cells[0]?.scope).toBe("rowgroup");
    expect(table?.tBodies[0]?.rows[0]?.cells[1]?.colSpan).toBe(2);
    expect(table?.querySelector("strong")?.textContent).toBe("B");
    expect(table?.querySelectorAll("br")).toHaveLength(1);
    expect(table?.tFoot?.rows[0]?.cells[0]?.textContent).toBe("Total");
  });

  it.each([
    ["rowspan", "0", "0"],
    ["rowspan", "65534", "65534"],
    ["rowspan", "65535", null],
    ["colspan", "1000", "1000"],
    ["colspan", "1001", null],
    ["colspan", "0", null],
    ["colspan", " 2 ", "2"],
    ["rowspan", "-1", null],
    ["colspan", "1.5", null],
    ["rowspan", "2rows", null],
    ["colspan", "1e2", null],
    ["rowspan", "", null],
  ])("validates %s=%j on cells", (attribute, value, expected) => {
    const root = renderHtml(`<table><tr><td ${attribute}="${value}">Cell</td></tr></table>`);
    const cell = root.querySelector("td");

    expect(cell).not.toBeNull();
    expect(cell?.getAttribute(attribute)).toBe(expected);
  });

  it.each(["0", "-1", "1001", "2cols"])("rejects invalid column spans: %s", (value) => {
    const root = renderHtml(`<table><colgroup span="${value}"></colgroup><colgroup><col span="${value}"></colgroup><tr><td>Cell</td></tr></table>`);

    expect(root.querySelectorAll("colgroup")).toHaveLength(2);
    expect(root.querySelector("colgroup")?.hasAttribute("span")).toBe(false);
    expect(root.querySelector("col")?.hasAttribute("span")).toBe(false);
  });

  it("keeps table attributes scoped and continues filtering unsafe table contents", () => {
    const root = renderHtml([
      '<div colspan="2" rowspan="2" span="2" scope="row">Before</div>',
      '<table onclick="bad()" class="fixed"><tr><th scope="invalid">Header</th>',
      '<td colspan="2" onmouseover="bad()" style="position:fixed;background:url(javascript:bad())">',
      '<script>bad()</script><iframe src="https://example.test"></iframe>',
      '<a href="javascript:bad()">Unsafe link</a><img src="javascript:bad()" onerror="bad()">',
      '<a href="https://example.test">Safe link</a>',
      "</td></tr></table>",
    ].join(""));

    expect(root.querySelector("td")?.colSpan).toBe(2);
    expect(root.querySelector("div")?.attributes).toHaveLength(0);
    expect(root.querySelector("table")?.attributes).toHaveLength(0);
    expect(root.querySelector("th")?.hasAttribute("scope")).toBe(false);
    expect(root.querySelector("script, iframe, [onclick], [onmouseover], [onerror], [style]")).toBeNull();
    expect(root.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(root.querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(root.querySelector('a[href="https://example.test"]')?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
