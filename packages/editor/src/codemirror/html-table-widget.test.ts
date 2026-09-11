import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, redo } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import { liveMarkdown, rawHtmlPreviewPlugin } from "./index.ts";
import "./dom.test-support.ts";

const source = '<table><tbody><tr><td><strong>A</strong></td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>';
const views: EditorView[] = [];
function createView(html = source, readOnly = false, permission = new Compartment()) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const doc = `Before\n\n${html}\n\nAfter`;
  const view = new EditorView({ parent, state: EditorState.create({ doc,
    selection: { anchor: doc.length },
    extensions: [history(), permission.of(EditorState.readOnly.of(readOnly)), liveMarkdown({ plugins: [rawHtmlPreviewPlugin({ resolveImageSrc: src => `asset://${src}` })] })],
  }) });
  views.push(view);
  return view;
}
const contents = (view: EditorView) => [...view.dom.querySelectorAll<HTMLElement>(".cm-markra-html-cell-content")];
function select(view: EditorView, index: number, shiftKey = false) {
  const cell = contents(view)[index]!;
  cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, shiftKey }));
  if (!shiftKey) cell.focus();
  return cell;
}
function button(view: EditorView, label: string) {
  return view.dom.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
function input(cell: HTMLElement, html: string) {
  cell.innerHTML = html;
  cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}
afterEach(() => { for (const view of views.splice(0)) view.destroy(); document.body.replaceChildren(); });

describe("HTML table editing widget", () => {
  it("uses the Markdown table controls for adding, aligning and resizing", () => {
    const view = createView();
    button(view, "Add column to the right").click();
    expect(view.dom.querySelectorAll("tr")[0]?.children).toHaveLength(3);
    button(view, "Add row below").click();
    expect(view.dom.querySelectorAll("tr")).toHaveLength(3);
    button(view, "Align table center").click();
    expect(view.dom.querySelector("td")?.style.textAlign).toBe("center");
    button(view, "Column width mode").click();
    expect(view.dom.querySelector("table")?.style.tableLayout).toBe("fixed");
    button(view, "Adjust table").click();
    const size = document.querySelector<HTMLButtonElement>('[aria-label="Resize table to 2 columns by 2 rows"]')!;
    size.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }));
    expect(view.dom.querySelectorAll("tr")).toHaveLength(2);
    expect(view.dom.querySelectorAll("tr")[0]?.children).toHaveLength(2);
  });

  it("uses one editing host and matches Enter, Shift+Enter and Escape", () => {
    const view = createView();
    expect(view.dom.querySelector("table")?.getAttribute("contenteditable")).toBe("true");
    expect(contents(view)[0]?.tagName).toBe("TD");
    const cell = select(view, 0);
    input(cell, "Changed");
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
    const next = select(view, 1);
    input(next, "Saved");
    next.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toContain("<td>Saved</td>");
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it("does not normalize or rewrite authored HTML on focus and blur", () => {
    const html = "<TABLE class='authored'><TR><TD><img src='./mock.png'>A</TD></TR></TABLE>";
    const view = createView(html);
    const original = view.state.doc.toString();
    const cell = select(view, 0);
    cell.blur();
    expect(view.state.doc.toString()).toBe(original);
  });

  it("starts a new Escape baseline after leaving and reentering a cell", async () => {
    const view = createView();
    input(select(view, 0), "Saved");
    view.focus();
    await Promise.resolve();
    const cell = select(view, 0);
    input(cell, "Cancelled");
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toContain("<td>Saved</td>");
  });

  it("keeps the Escape baseline while native focus moves to the table host", async () => {
    const view = createView();
    const cell = select(view, 1);
    const table = cell.closest("table")!;
    // Native focusout can run its microtasks while activeElement is still body.
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
    cell.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: table }));
    await Promise.resolve();
    Reflect.deleteProperty(document, "activeElement");
    table.focus();
    input(cell, "Changed");
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toContain("<td>B</td>");
  });

  it("offers column deletion from the first row of a table without th cells", () => {
    const view = createView();
    contents(view)[1]!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(button(view, "Delete column").hidden).toBe(false);
    button(view, "Delete column").click();
    expect(contents(view).map(cell => cell.textContent)).toEqual(["A", "C"]);
  });

  it("cancels active resizing when an external document change arrives", () => {
    const view = createView();
    const handle = view.dom.querySelector<HTMLElement>('[role="separator"][data-column="0"]')!;
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }));
    const position = view.state.doc.toString().indexOf(">B<") + 1;
    view.dispatch({ changes: { from: position, to: position + 1, insert: "External" } });
    const external = view.state.doc.toString();
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 150 }));
    expect(view.state.doc.toString()).toBe(external);
    expect(view.dom.querySelector("col")).toBeNull();
  });

  it("edits cells directly, retaining the active DOM and surrounding document", () => {
    const view = createView();
    expect(contents(view)).toHaveLength(4);
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
    const cell = select(view, 0);
    input(cell, "<strong>Updated</strong>");
    expect(contents(view)[0]).toBe(cell);
    expect(document.activeElement).toBe(cell);
    expect(view.state.doc.toString()).toContain("<strong>Updated</strong>");
    expect(view.state.doc.toString()).toMatch(/^Before\n\n<table>[\s\S]*<\/table>\n\nAfter$/u);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toContain("Updated");
  });

  it("defers IME text until composition finishes", () => {
    const view = createView();
    const cell = select(view, 1);
    cell.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input(cell, "测试");
    expect(view.state.doc.toString()).not.toContain("测试");
    cell.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(view.state.doc.toString()).toContain("测试");
    expect(contents(view)[1]).toBe(cell);
  });

  it("keeps input focused when the browser targets the shared table host", () => {
    const view = createView();
    const cell = select(view, 1);
    const table = view.dom.querySelector("table")!;
    table.focus();
    const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    cell.textContent = "Shared host";
    table.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(view.state.doc.toString()).toContain("<td>Shared host</td>");
    expect(document.activeElement).toBe(contents(view)[1]);
  });

  it("copies a cross-cell selection as table source like Markdown tables", () => {
    const view = createView();
    const cells = contents(view);
    const range = document.createRange(); range.setStart(cells[0]!, 0); range.setEnd(cells[3]!, cells[3]!.childNodes.length);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    const copied: Record<string, string> = {};
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { setData: (type: string, value: string) => { copied[type] = value; } } });
    view.dom.querySelector("table")!.dispatchEvent(event);
    expect(copied["text/plain"]).toBe(source);
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
  });

  it("clears a text selection across cells without removing rows or columns", () => {
    const view = createView();
    const cells = contents(view);
    const range = document.createRange(); range.setStart(cells[0]!, 0); range.setEnd(cells[3]!, cells[3]!.childNodes.length);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    view.dom.querySelector("table")!.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
    expect(contents(view).map(cell => cell.textContent)).toEqual(["", "", "", ""]);
    expect(view.dom.querySelectorAll("tr")).toHaveLength(2);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
  });

  it("focuses a new row's editable cell when rowspan zero covers its first column", () => {
    const view = createView('<table><tbody><tr><td rowspan="0">Keep</td><td>A</td></tr></tbody></table>');
    button(view, "Add row below").click();
    expect((document.activeElement as HTMLElement).dataset.row).toBe("1");
    expect((document.activeElement as HTMLElement).dataset.column).toBe("1");
  });

  it("retains cell focus after keyboard undo and structural actions", () => {
    const view = createView();
    const cell = select(view, 1);
    input(cell, "Typed");
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(contents(view)[1]);
    select(view, 0); select(view, 3, true);
    button(view, "Merge cells").click();
    expect(document.activeElement).toBe(contents(view)[0]);
  });

  it("merges a Shift-click rectangle and splits without losing contents", () => {
    const view = createView();
    select(view, 0);
    select(view, 3, true);
    expect(button(view, "Merge cells").disabled).toBe(false);
    button(view, "Merge cells").click();
    expect(contents(view)).toHaveLength(1);
    expect(view.dom.querySelector("td")?.rowSpan).toBe(2);
    expect(view.dom.querySelector("td")?.colSpan).toBe(2);
    expect(view.state.doc.toString()).toContain("<strong>A</strong><br>B<br>C<br>D");
    button(view, "Split cell").click();
    expect(contents(view)).toHaveLength(4);
    expect(contents(view)[0]?.textContent).toBe("ABCD");
    expect(contents(view)[0]?.querySelectorAll("br")).toHaveLength(3);
    expect(undo(view)).toBe(true);
    expect(contents(view)).toHaveLength(1);
  });

  it("uses keyboard navigation, line breaks and plain text paste inside cells", () => {
    const view = createView();
    const cell = select(view, 0);
    const range = document.createRange();
    range.selectNodeContents(cell); range.collapse(false);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "<b>literal</b>\nnext" } });
    cell.dispatchEvent(event);
    expect(view.state.doc.toString()).toContain("&lt;b&gt;literal&lt;/b&gt;<br>next");
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(contents(view)[1]);
  });

  it("preserves relative image paths when editing a cell", () => {
    const view = createView('<table><tr><td><img src="./mock.png">A</td></tr></table>');
    const cell = select(view, 0);
    expect(cell.querySelector("img")?.getAttribute("src")).toBe("asset://./mock.png");
    cell.append(" updated");
    cell.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(view.state.doc.toString()).toContain('src="./mock.png"');
    expect(view.state.doc.toString()).not.toContain("asset://");
  });

  it("provides a caret line after Shift+Enter without persisting its placeholder", () => {
    const view = createView();
    const cell = select(view, 1);
    const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    expect(cell.querySelector('[data-markra-caret-break]')).not.toBeNull();
    expect(view.state.doc.toString()).toContain("<td>B<br></td>");
    expect(view.state.doc.toString()).not.toContain("data-markra");
  });

  it("maps the source range when text is inserted before the table", () => {
    const view = createView();
    view.dispatch({ changes: { from: 0, insert: "Prefix\n\n" } });
    input(select(view, 1), "Moved");
    expect(view.state.doc.toString()).toMatch(/^Prefix\n\nBefore\n\n<table>/u);
    expect(view.state.doc.toString()).toContain("Moved");
    expect(view.state.doc.toString()).toMatch(/<\/table>\n\nAfter$/u);
  });

  it("resizes columns with keyboard controls and preserves widths after recreation", () => {
    const view = createView();
    const handle = view.dom.querySelector<HTMLElement>('[role="separator"][data-column="0"]');
    expect(handle).not.toBeNull();
    handle!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    const width = view.dom.querySelector("col")?.style.width;
    expect(width).toBe("110px");
    expect(view.state.doc.toString()).toContain("table-layout: fixed");
    const recreated = createView(view.state.doc.toString().slice(8, -7));
    expect(recreated.dom.querySelector("col")?.style.width).toBe(width);
    expect(recreated.dom.querySelector("table")?.style.tableLayout).toBe("fixed");
    view.dom.querySelector<HTMLElement>('[role="separator"][data-column="0"]')!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
  });

  it("commits a drag once on release and cancels a drag on Escape", () => {
    const view = createView();
    const handle = view.dom.querySelector<HTMLElement>('[role="separator"][data-column="0"]')!;
    expect(handle).not.toBeNull();
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }));
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 150 }));
    expect(view.dom.querySelector("col")?.style.width).toBe("150px");
    const persisted = view.state.doc.toString();
    view.dom.querySelector<HTMLElement>('[role="separator"][data-column="0"]')!.dispatchEvent(new MouseEvent("pointerdown", { clientX: 150, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 190 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.state.doc.toString()).toBe(persisted);
    expect(view.dom.querySelector("col")?.style.width).toBe("150px");
  });

  it("keeps read-only documents unchanged", () => {
    const readonly = createView(source, true);
    expect(readonly.dom.querySelector("table")?.getAttribute("contenteditable")).toBe("false");
    expect(button(readonly, "Merge cells").disabled).toBe(true);
    expect(readonly.dom.querySelector('[role="separator"]')).toBeNull();
    input(contents(readonly)[0]!, "Ignored");
    expect(readonly.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
  });

  it("disables existing cell and resize controls when read-only configuration changes", () => {
    const permission = new Compartment();
    const view = createView(source, false, permission);
    select(view, 0);
    view.dispatch({ effects: permission.reconfigure(EditorState.readOnly.of(true)) });
    expect(contents(view)).toHaveLength(4);
    expect(view.dom.querySelector("table")?.getAttribute("contenteditable")).toBe("false");
    expect(view.dom.querySelector('[role="separator"]')).toBeNull();
    expect(view.state.doc.toString()).toBe(`Before\n\n${source}\n\nAfter`);
  });
});
