import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchPlainTextPaste } from "../plain-text-paste.ts";
import { liveMarkdown } from "./index.ts";
import {
  focusVisualTableCell,
  tablePreviewPlugin,
} from "./table.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  plugin = tablePreviewPlugin(),
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [plugin] })],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("tablePreviewPlugin", () => {
  it("keeps an unchanged visual table mounted when editing before it", async () => {
    const doc = [
      "Before",
      "",
      "| Name | Value |",
      "| --- | ---: |",
      "| Alpha | 1 |",
      "",
      "After",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");

    expect(table).not.toBeNull();

    const inserted = "Expanded synthetic prefix. ";
    view.dispatch({
      changes: { from: 0, insert: inserted },
      selection: { anchor: inserted.length },
      userEvent: "input",
    });

    expect(view.dom.querySelector(".cm-markra-table")).toBe(table);
    expect(table?.closest<HTMLElement>(".cm-markra-table-wrap")?.dataset.tableFrom)
      .toBe(String(inserted.length + doc.indexOf("| Name")));

    view.dom
      .querySelector<HTMLButtonElement>('[aria-label="Add row below"]')
      ?.click();
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(`${inserted}Before`);
    expect(view.state.doc.toString()).toContain("|  |  |\n\nAfter");
  });

  it("renders a GFM table without changing its Markdown source", () => {
    const doc = [
      "| Name | Value |",
      "| :--- | ---: |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");

    expect(table).not.toBeNull();
    expect(table?.querySelector("th")?.textContent).toBe("Name");
    expect(table?.querySelector("td")?.textContent).toBe("Alpha");
    expect(table?.querySelectorAll("th")[0]?.style.textAlign).toBe("left");
    expect(table?.querySelectorAll("th")[1]?.style.textAlign).toBe("right");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("renders valid GFM delimiter cells with fewer than three hyphens", () => {
    const doc = [
      "| Cycle | Count | Rank | Valid | Score |",
      "| -- | :--: | :-: | :-------: | :-: |",
      "| Day | 11 | 2 | 3 | 1 |",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const headers = table?.querySelectorAll<HTMLTableCellElement>("th");

    expect(table).not.toBeNull();
    expect(headers).toHaveLength(5);
    expect(headers?.[0]?.style.textAlign).toBe("");
    expect(headers?.[1]?.style.textAlign).toBe("center");
    expect(headers?.[2]?.style.textAlign).toBe("center");
    expect(headers?.[3]?.style.textAlign).toBe("center");
    expect(headers?.[4]?.style.textAlign).toBe("center");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("uses one editing host so a native selection can span the complete table", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "| Beta | 2 |",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cells = Array.from(
      view.dom.querySelectorAll<HTMLTableCellElement>(".cm-markra-table th, .cm-markra-table td"),
    );

    expect(table?.getAttribute("contenteditable")).toBe("true");
    expect(cells).not.toHaveLength(0);
    expect(cells.every((cell) => !cell.hasAttribute("contenteditable"))).toBe(true);
  });

  it("places the native caret inside an empty visual table cell", async () => {
    const doc = ["|  |  |", "| --- | --- |", "|  |  |"].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table thead th:first-child",
    );
    const outside = document.createTextNode("Outside");
    document.body.append(outside);
    const nativeFocus = cell?.focus.bind(cell);

    if (cell && nativeFocus) {
      vi.spyOn(cell, "focus").mockImplementation(() => {
        nativeFocus();
        const selection = document.getSelection();
        const range = document.createRange();
        range.setStart(outside, 0);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    }

    focusVisualTableCell(view, 0, -1, 0, true, 0);
    await Promise.resolve();

    expect(document.activeElement).toBe(cell);
    expect(document.getSelection()?.anchorNode?.nodeType).toBe(Node.TEXT_NODE);
    expect(document.getSelection()?.anchorNode?.parentNode).toBe(cell);
    expect(document.getSelection()?.anchorOffset).toBe(0);
  });

  it("renders inline Markdown inside visual table cells", () => {
    const doc = [
      "| Name | Link |",
      "| --- | --- |",
      "| **Bold** | [Open](https://example.test) |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cells = view.dom.querySelectorAll<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    expect(cells[0]?.querySelector("strong")?.textContent).toBe("Bold");
    expect(cells[1]?.querySelector("a")?.textContent).toBe("Open");
    expect(cells[1]?.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.test",
    );
    expect(cells[1]?.querySelector(".markra-live-link-icon")).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("renders anchors for custom-resolved link targets inside visual table cells", () => {
    const doc = [
      "| Attachment | Site |",
      "| --- | --- |",
      "| [Reference.pdf](FILE:///mock-files/Reference.pdf) | [Open](https://example.test) |",
      "",
      "Edit",
    ].join("\n");
    const resolveTarget = vi.fn(({ source }: { source: string }) =>
      source.startsWith("FILE:") ? source : null,
    );
    const view = createView(
      doc,
      tablePreviewPlugin({ links: { open: () => true, resolveTarget } }),
    );
    const cells = view.dom.querySelectorAll<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const attachment = cells[0]?.querySelector("a");
    const rejected = cells[1]?.querySelector("[data-markra-link-markdown]");

    expect(attachment?.textContent).toBe("Reference.pdf");
    expect(attachment?.getAttribute("href")).toBe(
      "FILE:///mock-files/Reference.pdf",
    );
    const resolveContext = resolveTarget.mock.calls[0]?.[0] as
      | { source: string; state: EditorState; view: EditorView }
      | undefined;
    expect(resolveContext?.source).toBe("FILE:///mock-files/Reference.pdf");
    expect(resolveContext?.state).toBeInstanceOf(EditorState);
    expect(resolveContext?.view).toBe(view);
    expect(rejected?.tagName).toBe("SPAN");
    expect(rejected?.hasAttribute("href")).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("renders and preserves images inside visual table cells", async () => {
    const doc = [
      "| Name | Media |",
      "| --- | --- |",
      '| Row | Before ![Synthetic image](https://images.example.test/mock.png "Mock title") after |',
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );
    const image = cell?.querySelector<HTMLImageElement>("img");

    expect(image?.alt).toBe("Synthetic image");
    expect(image?.getAttribute("src")).toBe(
      "https://images.example.test/mock.png",
    );
    expect(image?.title).toBe("Mock title");

    cell?.focus();
    if (cell?.firstChild) cell.firstChild.textContent = "Updated before ";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(
      '| Row | Updated before ![Synthetic image](https://images.example.test/mock.png "Mock title") after |',
    );
    expect(
      view.dom.querySelector<HTMLImageElement>(
        ".cm-markra-table tbody td:nth-child(2) img",
      )?.alt,
    ).toBe("Synthetic image");
  });

  it("reveals editable image Markdown inside a visual table cell", () => {
    const doc = [
      "| Name | Media |",
      "| --- | --- |",
      "| Row | ![Synthetic image](https://images.example.test/mock.png) |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );
    const image = cell?.querySelector<HTMLImageElement>("img");

    expect(image).not.toBeNull();
    expect(image?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }))).toBe(false);
    expect(cell?.querySelector("img")).toBeNull();
    expect(cell?.textContent).toBe(
      "![Synthetic image](https://images.example.test/mock.png)",
    );
    expect(document.activeElement).toBe(cell);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("preserves link titles while editing surrounding table-cell text", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      '| Row | Before [Docs](https://example.test/guide "Guide title") after |',
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );

    cell?.focus();
    if (cell?.firstChild) cell.firstChild.textContent = "Updated before ";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(
      '| Row | Updated before [Docs](https://example.test/guide "Guide title") after |',
    );
  });

  it.each([
    ["angle autolink", "<https://example.test/angle>", "https://example.test/angle"],
    ["bare autolink", "https://example.test/bare", "https://example.test/bare"],
    ["email autolink", "author@example.test", "mailto:author@example.test"],
    ["www autolink", "www.example.test/guide", "http://www.example.test/guide"],
  ])("renders and opens a %s inside a visual table cell", (_label, markdown, target) => {
    const doc = [
      "| Name | Link |",
      "| --- | --- |",
      `| Row | ${markdown} |`,
      "",
      "Edit",
    ].join("\n");
    const open = vi.fn();
    const view = createView(doc, tablePreviewPlugin({ links: { open } }));
    const link = view.dom.querySelector<HTMLAnchorElement>(
      ".cm-markra-table tbody td:nth-child(2) a",
    );

    expect(link?.getAttribute("href")).toBe(target);
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    }))).toBe(false);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      source: target,
      target,
      view,
    }));
    expect(view.state.doc.toString()).toBe(doc);
  });

  it.each([
    ["escaped punctuation", String.raw`Before \*literal\* after`],
    ["long inline-code fence", "Before ```a``b``` after"],
  ])("preserves unchanged %s while editing table-cell text", async (_label, value) => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      `| Row | ${value} |`,
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );

    cell?.focus();
    if (cell?.firstChild) cell.firstChild.textContent = "Updated before ";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(
      `| Row | Updated before ${value.slice("Before ".length)} |`,
    );
  });

  it("preserves a non-navigable link while editing surrounding table-cell text", async () => {
    const markdown = "[Unsafe](javascript:noop)";
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      `| Row | Before ${markdown} after |`,
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );
    const fallback = cell?.querySelector<HTMLElement>(
      "[data-markra-link-markdown]",
    );

    expect(fallback?.tagName).toBe("SPAN");
    cell?.focus();
    if (cell?.firstChild) cell.firstChild.textContent = "Updated before ";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(
      `| Row | Updated before ${markdown} after |`,
    );
  });

  it("keeps editable link Markdown visible while a visual table cell changes", async () => {
    const doc = [
      "| Name | Link |",
      "| --- | --- |",
      "| Row | [Synthetic alt](https://example.test/guide) |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );
    const link = cell?.querySelector<HTMLAnchorElement>("a");

    expect(link).not.toBeNull();
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }))).toBe(false);

    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(cell?.querySelector("a")).toBeNull();
    expect(cell?.querySelector(".markra-live-link-icon")).toBeNull();
    expect(cell?.textContent).toBe(
      "[Synthetic alt](https://example.test/guide)",
    );
    expect(view.state.doc.toString()).toBe(doc);
    expect(document.activeElement).toBe(cell);

    if (cell) {
      cell.textContent =
        "[Changed alt](https://example.test/changed)";
    }
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    const updatedCell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    );
    expect(updatedCell?.querySelector("a")).toBeNull();
    expect(updatedCell?.textContent).toBe(
      "[Changed alt](https://example.test/changed)",
    );
    expect(view.state.doc.toString()).toContain(
      "| Row | [Changed alt](https://example.test/changed) |",
    );

    updatedCell?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    }));
    expect(
      view.dom.querySelector(".cm-markra-table tbody td:nth-child(2) a")
        ?.textContent,
    ).toBe("Changed alt");
  });

  it("opens a visual table link on Cmd/Ctrl-click without revealing source", () => {
    const doc = [
      "| Name | Link |",
      "| --- | --- |",
      "| Row | [Synthetic alt](https://example.test/guide) |",
      "",
      "Edit",
    ].join("\n");
    const open = vi.fn();
    const view = createView(doc, tablePreviewPlugin({ links: { open } }));
    const link = view.dom.querySelector<HTMLAnchorElement>(
      ".cm-markra-table tbody td:nth-child(2) a",
    );

    expect(link).not.toBeNull();
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    }))).toBe(false);
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      ctrlKey: true,
    }))).toBe(false);

    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({
      source: "https://example.test/guide",
      target: "https://example.test/guide",
      view,
    }));
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(view.dom.querySelector(".cm-markra-table a")).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("preserves visual inline formatting while a table cell is edited", async () => {
    const doc = "| Name |\n| --- |\n| **Bold** |\n\nEdit";
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const strong = cell?.querySelector("strong");

    cell?.focus();
    if (strong) strong.textContent = "Updated";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| **Updated** |");
    expect(
      view.dom.querySelector(".cm-markra-table tbody td strong")?.textContent,
    ).toBe("Updated");
  });

  it("copies a visual table as Markdown plain text", () => {
    const tableMarkdown = "| Name | Value |\n| --- | --- |\n| Alpha | 1 |";
    const view = createView(`${tableMarkdown}\n\nEdit`);
    const wrapper = view.dom.querySelector<HTMLElement>(".cm-markra-table-wrap");
    const setData = vi.fn();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { setData },
    });

    wrapper?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith("text/plain", tableMarkdown);
  });

  it("renders the original Markra table control layout and icons", () => {
    const doc = [
      "| Name | Value |",
      "| :--- | :--- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const wrapper = view.dom.querySelector<HTMLElement>(
      ".cm-markra-table-wrap",
    );

    expect(wrapper?.classList.contains("tableWrapper")).toBe(true);
    expect(wrapper?.dataset.tableAlignment).toBe("left");
    expect(wrapper?.querySelector(".cm-markra-table-controls")).toBeNull();
    expect(
      wrapper?.querySelector(".markra-table-scroll > .cm-markra-table"),
    ).not.toBeNull();
    expect(
      wrapper?.querySelectorAll(".markra-table-align-controls > button"),
    ).toHaveLength(5);
    expect(
      wrapper?.querySelectorAll(".markra-table-size-icon-square"),
    ).toHaveLength(4);
    expect(
      wrapper?.querySelectorAll(".markra-table-align-icon-line"),
    ).toHaveLength(9);
    expect(wrapper?.querySelector(".markra-table-width-icon")).not.toBeNull();

    for (const label of [
      "Add column to the right",
      "Add row below",
      "Delete column",
      "Delete row",
      "Delete table",
    ]) {
      expect(
        wrapper?.querySelector(
          `[aria-label="${label}"] svg.markra-lucide-icon.markra-table-control-icon`,
        ),
      ).not.toBeNull();
    }

    expect(
      wrapper?.querySelector('[aria-label="Align table left"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper?.querySelector('[aria-label="Column width mode"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("moves the original delete controls to the hovered header or row", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const wrapper = view.dom.querySelector<HTMLElement>(
      ".cm-markra-table-wrap",
    );
    const header = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table th:nth-child(2)",
    );
    const row = view.dom.querySelector<HTMLTableRowElement>(
      ".cm-markra-table tbody tr",
    );
    const bodyCell = row?.querySelector<HTMLTableCellElement>("td");
    const deleteColumn = wrapper?.querySelector<HTMLButtonElement>(
      '[aria-label="Delete column"]',
    );
    const deleteRow = wrapper?.querySelector<HTMLButtonElement>(
      '[aria-label="Delete row"]',
    );

    expect(wrapper).not.toBeNull();
    expect(header).not.toBeNull();
    expect(row).not.toBeNull();
    expect(bodyCell).not.toBeNull();
    wrapper!.getBoundingClientRect = () => ({
      bottom: 150,
      height: 140,
      left: 20,
      right: 320,
      top: 10,
      width: 300,
      x: 20,
      y: 10,
      toJSON: () => ({}),
    });
    header!.getBoundingClientRect = () => ({
      bottom: 70,
      height: 40,
      left: 120,
      right: 220,
      top: 30,
      width: 100,
      x: 120,
      y: 30,
      toJSON: () => ({}),
    });
    row!.getBoundingClientRect = () => ({
      bottom: 110,
      height: 40,
      left: 20,
      right: 284,
      top: 70,
      width: 264,
      x: 20,
      y: 70,
      toJSON: () => ({}),
    });

    header!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(deleteColumn?.hidden).toBe(false);
    expect(deleteColumn?.style.left).toBe("150px");
    expect(deleteColumn?.style.top).toBe("20px");
    expect(deleteRow?.hidden).toBe(true);

    bodyCell!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(deleteColumn?.hidden).toBe(true);
    expect(deleteRow?.hidden).toBe(false);
    expect(deleteRow?.style.left).toBe("264px");
    expect(deleteRow?.style.top).toBe("80px");
  });

  it("reveals the complete table source when the selection enters it", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("Alpha")) });

    expect(view.dom.querySelector(".cm-markra-table")).toBeNull();
    expect(view.dom.textContent).toContain("| Alpha | 1 |");
  });

  it("keeps complete table source visible while dragging from inside it", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const anchor = doc.indexOf("Alpha") + 1;
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(anchor) });
    view.dispatch({
      selection: EditorSelection.range(anchor, doc.indexOf("| 1")),
    });

    expect(view.dom.querySelector(".cm-markra-table")).toBeNull();
    expect(view.dom.textContent).toContain("| Alpha | 1 |");
  });

  it("keeps the table visual when a preview cell is activated", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(".cm-markra-table tbody td");

    cell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(view.state.selection.main.head).toBe(doc.length);
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(cell?.closest("table")?.getAttribute("contenteditable")).toBe("true");
    expect(cell?.hasAttribute("contenteditable")).toBe(false);
  });

  it("updates Markdown while editing a visual table cell", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    cell?.focus();
    if (cell) cell.textContent = "Updated | value";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| Updated \\| value | 1 |");
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td",
      )?.textContent,
    ).toBe("Updated | value");
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td",
      ),
    );
  });

  it("serializes multiline plain text paste inside a visual table cell", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | Before |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td:nth-child(2)",
    )!;
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(dispatchPlainTextPaste(view.contentDOM, "Line one\nLine two"))
      .toBe(true);
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(
      "| Alpha | BeforeLine one<br>Line two |",
    );
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it("keeps visual table structure when plain text selection spans cells", async () => {
    const doc = [
      "| First | Second |",
      "| --- | --- |",
      "| Alpha | Beta |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cells = view.dom.querySelectorAll<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const first = cells[0]!;
    const second = cells[1]!;
    first.focus();
    const range = document.createRange();
    range.setStart(first.firstChild!, first.textContent!.length);
    range.setEnd(second.firstChild!, second.textContent!.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(dispatchPlainTextPaste(view.contentDOM, "PASTED")).toBe(true);
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| AlphaPASTED | Beta |");
    expect(view.dom.querySelectorAll(".cm-markra-table tbody td")).toHaveLength(2);
  });

  it("updates Markdown when input targets the shared table editing host", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cell = table?.querySelector<HTMLTableCellElement>("tbody td");

    cell?.focus();
    if (cell) cell.textContent = "Updated";
    table?.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| Updated | 1 |");
    expect(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td",
      )?.textContent,
    ).toBe("Updated");
  });

  it("keeps a visual table cell empty after deleting its last character", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| A | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    cell?.focus();
    cell?.replaceChildren(document.createElement("br"));
    cell?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
    }));

    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("|  | 1 |");
    expect(view.state.doc.toString()).not.toContain("<br>");
    expect(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody td",
      )?.textContent,
    ).toBe("");
  });

  it("recovers when WebKit moves an emptied cell selection to the table host", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| A | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cell = table?.querySelector<HTMLTableCellElement>("tbody td");
    const row = cell?.parentElement;

    cell?.focus();
    cell?.replaceChildren(document.createElement("br"));
    table?.focus();
    if (row) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(row, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    table?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("|  | 1 |");
    const updatedCell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    expect(document.activeElement).toBe(updatedCell);
    if (updatedCell) updatedCell.textContent = "Again";
    updatedCell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| Again | 1 |");
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it.each([
    "deleteContentBackward",
    "deleteContentForward",
  ])("reanchors an empty cell after a no-op %s", async (inputType) => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "|  | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cell = table?.querySelector<HTMLTableCellElement>("tbody td");
    const row = cell?.parentElement;

    cell?.focus();
    cell?.replaceChildren(document.createElement("br"));
    table?.focus();
    if (row) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(row, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    table?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType,
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe(doc);
    expect(document.activeElement).toBe(cell);
    expect(cell?.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(cell?.querySelector("br")).toBeNull();
  });

  it("repairs an escaped selection before insertion mutates the table DOM", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "|  | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cell = table?.querySelector<HTMLTableCellElement>("tbody td");
    const row = cell?.parentElement;

    cell?.focus();
    cell?.replaceChildren(document.createElement("br"));
    table?.focus();
    if (row) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(row, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "Again",
      inputType: "insertText",
    });
    table?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(cell);
    expect(cell?.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(cell?.querySelector("br")).toBeNull();
  });

  it.each([
    {
      expectedRow: "| Alpha | Forward |",
      name: "Tab",
      sourceSelector: "tbody td:first-child",
      targetSelector: "tbody td:nth-child(2)",
      targetValue: "Forward",
      shiftKey: false,
    },
    {
      expectedRow: "| Backward | 1 |",
      name: "Shift+Tab",
      sourceSelector: "tbody td:nth-child(2)",
      targetSelector: "tbody td:first-child",
      targetValue: "Backward",
      shiftKey: true,
    },
  ])("moves the caret before typing in the cell reached by $name", async ({
    expectedRow,
    sourceSelector,
    targetSelector,
    targetValue,
    shiftKey,
  }) => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const sourceCell =
      table?.querySelector<HTMLTableCellElement>(sourceSelector);
    const targetCell =
      table?.querySelector<HTMLTableCellElement>(targetSelector);
    const sourceText = sourceCell?.firstChild;

    sourceCell?.focus();
    if (sourceText) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(sourceText, sourceText.textContent?.length ?? 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      shiftKey,
    });
    sourceCell?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(targetCell);
    expect(
      targetCell?.contains(document.getSelection()?.anchorNode ?? null),
    ).toBe(true);
    if (targetCell) targetCell.textContent = targetValue;
    targetCell?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: targetValue,
      inputType: "insertText",
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(expectedRow);
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it("repairs an escaped selection before IME composition", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "|  | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const table = view.dom.querySelector<HTMLTableElement>(".cm-markra-table");
    const cell = table?.querySelector<HTMLTableCellElement>("tbody td");
    const row = cell?.parentElement;

    cell?.focus();
    table?.focus();
    if (row) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(row, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    table?.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
    }));

    expect(document.activeElement).toBe(cell);
    expect(cell?.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
    if (cell) cell.textContent = "再次";
    table?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      isComposing: true,
    }));
    expect(view.state.doc.toString()).toBe(doc);

    table?.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| 再次 | 1 |");
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it("commits a visual table cell after IME composition finishes", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    cell?.focus();
    cell?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    if (cell) cell.textContent = "中文";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));

    expect(view.state.doc.toString()).toBe(doc);

    cell?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| 中文 | 1 |");
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("中文");
  });

  it("restores the original visual cell value with Escape", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    cell?.focus();
    if (cell) cell.textContent = "Updated";
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    )?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }));

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it("uses Enter to finish editing a visual table cell", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    cell?.focus();
    cell?.closest("table")?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
  });

  it.each([
    {
      afterInput: "<br>NextAlpha",
      afterLineBreak: "<br>Alpha",
      caretOffset: 0,
      eventTarget: "table",
      position: "start",
    },
    {
      afterInput: "Al<br>Nextpha",
      afterLineBreak: "Al<br>pha",
      caretOffset: 2,
      eventTarget: "table",
      position: "middle",
    },
    {
      afterInput: "Alpha<br>Next",
      afterLineBreak: "Alpha<br>",
      caretOffset: 5,
      eventTarget: "table",
      position: "end",
    },
    {
      afterInput: "Al<br>Nextpha",
      afterLineBreak: "Al<br>pha",
      caretOffset: 2,
      eventTarget: "cell",
      position: "middle",
    },
  ])("keeps a line break at the $position when Enter targets the $eventTarget", async ({
    afterInput,
    afterLineBreak,
    caretOffset,
    eventTarget,
  }) => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const text = cell?.firstChild;

    cell?.focus();
    if (text) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(text, caretOffset);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      shiftKey: true,
    });
    const keydownTarget = eventTarget === "table"
      ? cell?.closest("table")
      : cell;
    keydownTarget?.dispatchEvent(event);
    await Promise.resolve();

    const updatedCell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toContain(`| ${afterLineBreak} | 1 |`);
    const lineBreak = updatedCell?.querySelector("br");
    expect(lineBreak).not.toBeNull();
    expect(document.activeElement).toBe(updatedCell);
    expect(document.getSelection()?.anchorNode?.parentNode).toBe(
      lineBreak?.nextSibling,
    );
    expect(document.getSelection()?.anchorOffset).toBe(1);

    const nativeLineBreak = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertLineBreak",
    });
    updatedCell?.closest("table")?.dispatchEvent(nativeLineBreak);
    expect(nativeLineBreak.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toContain(`| ${afterLineBreak} | 1 |`);

    const caretText = document.getSelection()?.anchorNode;
    if (caretText) caretText.textContent = "\u200bNext";
    updatedCell?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "Next",
      inputType: "insertText",
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain(`| ${afterInput} | 1 |`);
    expect(view.state.doc.toString()).not.toContain("\u200b");
  });

  it("keeps composed text on the new visual table line", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const text = cell?.firstChild;

    cell?.focus();
    if (text) {
      const selection = document.getSelection();
      const range = document.createRange();
      range.setStart(text, 2);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    cell?.closest("table")?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      shiftKey: true,
    }));
    await Promise.resolve();

    const updatedCell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );
    const table = updatedCell?.closest("table");
    table?.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      data: "Mock",
    }));
    const caretText = document.getSelection()?.anchorNode;
    if (caretText) caretText.textContent = "\u200bMock";
    table?.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "Mock",
      inputType: "insertCompositionText",
      isComposing: true,
    }));
    table?.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      data: "Mock",
    }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| Al<br>Mockpha | 1 |");
    expect(view.state.doc.toString()).not.toContain("\u200b");
  });

  it("does not mistake a persisted line break for an empty-cell placeholder", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| <br> | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const cell = view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody td",
    );

    expect(
      cell?.querySelector('br[data-markra-source-break="true"]'),
    ).not.toBeNull();
    cell?.focus();
    cell?.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();

    expect(view.state.doc.toString()).toBe(doc);
  });

  it("adds rows and columns and keeps editing in the new visual cells", async () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);

    view.dom.querySelector<HTMLButtonElement>('[aria-label="Add row below"]')?.click();
    await Promise.resolve();
    expect(view.state.doc.toString()).toContain("|  |  |\n\nEdit");
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody tr:last-child td:first-child",
      ),
    );
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Add column to the right"]')?.click();
    await Promise.resolve();
    expect(view.state.doc.toString()).toContain("| Name | Value |  |");
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table thead th:last-child",
      ),
    );
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Align table right"]')?.click();
    expect(view.state.doc.toString()).toContain("| ---: | ---: | ---: |");
  });

  it("deletes a selected preview row or column and focuses a nearby visual cell", async () => {
    const doc = [
      "| Name | Value | Extra |",
      "| --- | --- | --- |",
      "| Alpha | 1 | A |",
      "| Beta | 2 | B |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);

    view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table tbody tr:first-child td",
    )?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Delete row"]')?.click();
    await Promise.resolve();
    expect(view.state.doc.toString()).not.toContain("Alpha");
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody tr:first-child td:first-child",
      ),
    );
    view.dom.querySelector<HTMLTableCellElement>(
      ".cm-markra-table th:nth-child(3)",
    )?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Delete column"]')?.click();
    await Promise.resolve();
    expect(view.state.doc.toString()).not.toContain("Extra");
    expect(view.state.doc.toString()).not.toContain("| B |");
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table thead th:last-child",
      ),
    );
    view.dom.querySelector<HTMLButtonElement>('[aria-label="Delete table"]')?.click();
    expect(view.state.doc.toString()).toBe("\nEdit");
  });

  it.each([
    { button: 2, ctrlKey: false, name: "right-click" },
    { button: 0, ctrlKey: true, name: "ctrl-click" },
  ])("does not delete a table on $name", ({ button, ctrlKey }) => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const deleteTable = view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Delete table"]',
    );

    deleteTable?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      button,
      cancelable: true,
      ctrlKey,
    }));

    expect(view.state.doc.toString()).toBe(doc);
  });

  it("applies Markra's configured table width mode", () => {
    const doc = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc, tablePreviewPlugin({ widthMode: "even" }));

    expect(view.dom.querySelector(".cm-markra-table-wrap")?.getAttribute("data-width-mode")).toBe("even");
    expect(view.dom.querySelector(".cm-markra-table")?.getAttribute("data-width-mode")).toBe("even");
  });

  it("toggles the original table width control for every table in the document", () => {
    const source = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "| Other | Table |",
      "| --- | --- |",
      "| Beta | 2 |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(source);
    const button = view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Column width mode"]',
    );

    button?.click();

    expect(
      Array.from(view.dom.querySelectorAll(".cm-markra-table-wrap")).map(
        (wrapper) => wrapper.getAttribute("data-width-mode"),
      ),
    ).toEqual(["even", "even"]);
    expect(
      Array.from(view.dom.querySelectorAll(".cm-markra-table")).every(
        (table) => !table.classList.contains("markra-table-width-auto"),
      ),
    ).toBe(true);
    expect(
      Array.from(
        view.dom.querySelectorAll('[aria-label="Column width mode"]'),
      ).every((control) => control.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  it("resizes a table and keeps editing in the last visual cell", async () => {
    const doc = [
      "| Field | Value |",
      "| --- | --- |",
      "| Name | Markra |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const adjust = view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Adjust table"]',
    );

    adjust?.click();
    const resize = document.querySelector<HTMLButtonElement>(
      '[aria-label="Resize table to 3 columns by 4 rows"]',
    );
    resize?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(
      document.querySelector<HTMLInputElement>('[aria-label="Table columns"]')?.value,
    ).toBe("3");
    expect(
      document.querySelector<HTMLInputElement>('[aria-label="Table rows"]')?.value,
    ).toBe("4");
    resize?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));

    await Promise.resolve();

    expect(view.state.doc.toString()).toContain("| Field | Value |  |");
    expect(view.state.doc.toString()).toContain("| Name | Markra |  |");
    expect(view.state.doc.toString().match(/^\|  \|  \|  \|$/gmu)).toHaveLength(2);
    expect(document.querySelector(".markra-table-size-popover")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-table")).not.toBeNull();
    expect(document.activeElement).toBe(
      view.dom.querySelector<HTMLTableCellElement>(
        ".cm-markra-table tbody tr:last-child td:last-child",
      ),
    );
  });

  it("closes the size picker when its toolbar button is clicked again", () => {
    const doc = [
      "| Field | Value |",
      "| --- | --- |",
      "| Name | Markra |",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const adjust = view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Adjust table"]',
    );

    adjust?.click();
    expect(document.querySelector(".markra-table-size-popover")).not.toBeNull();

    adjust?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));
    adjust?.click();

    expect(document.querySelector(".markra-table-size-popover")).toBeNull();
  });

  it("clamps the size picker summary for tables larger than its grid", () => {
    const header = `| ${Array.from({ length: 9 }, (_, index) => `H${index + 1}`).join(" | ")} |`;
    const separator = `| ${Array.from({ length: 9 }, () => "---").join(" | ")} |`;
    const row = `| ${Array.from({ length: 9 }, () => "Cell").join(" | ")} |`;
    const view = createView([
      header,
      separator,
      ...Array.from({ length: 11 }, () => row),
      "",
      "Edit",
    ].join("\n"));

    view.dom.querySelector<HTMLButtonElement>(
      '[aria-label="Adjust table"]',
    )?.click();

    expect(
      document.querySelector<HTMLInputElement>('[aria-label="Table columns"]')
        ?.value,
    ).toBe("8");
    expect(
      document.querySelector<HTMLInputElement>('[aria-label="Table rows"]')
        ?.value,
    ).toBe("10");
  });
});
