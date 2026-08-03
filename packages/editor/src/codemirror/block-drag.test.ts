import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  codeMirrorBlockDragPlugin,
  moveCodeMirrorBlock,
  readCodeMirrorBlockRanges,
} from "./block-drag.ts";
import { horizontalRulePlugin } from "./horizontal-rule.ts";
import { getMarkraSlashMenuState, liveMarkdown } from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  readOnly = false,
  extensions: readonly Extension[] = [],
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        liveMarkdown({
          plugins: [codeMirrorBlockDragPlugin(), horizontalRulePlugin()],
          slashMenu: true,
        }),
        EditorState.readOnly.of(readOnly),
        ...extensions,
      ],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("codeMirrorBlockDragPlugin", () => {
  it("discovers list items as independently draggable blocks without rewriting source", () => {
    const doc = "# Title\n\nParagraph\n\n- One\n- Two\n\n> Quote";
    const view = createView(doc);

    expect(readCodeMirrorBlockRanges(view.state).map((range) =>
      view.state.sliceDoc(range.from, range.to))).toEqual([
      "# Title",
      "Paragraph",
      "- One",
      "- Two",
      "> Quote",
    ]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("reorders one list item without moving the entire list", () => {
    const doc = "- First\n- Second\n- Third\n\nAfter";
    const view = createView(doc);
    const [first, second] = readCodeMirrorBlockRanges(view.state);

    expect(first?.name).toBe("ListItem");
    expect(second?.name).toBe("ListItem");
    expect(second && first && moveCodeMirrorBlock(view, second.from, first.from, "before")).toBe(true);
    expect(view.state.doc.toString()).toBe("- Second\n- First\n- Third\n\nAfter");
  });

  it("moves a paragraph into a list as a sibling item", () => {
    const doc = "Paragraph\n\n- First\n- Second";
    const view = createView(doc);
    const [paragraph, first] = readCodeMirrorBlockRanges(view.state);

    expect(paragraph && first && moveCodeMirrorBlock(view, paragraph.from, first.from, "after")).toBe(true);
    expect(view.state.doc.toString()).toBe("- First\n- Paragraph\n- Second");
  });

  it("outdents a nested list item when a shallower drop depth is requested", () => {
    const doc = "- First\n  - Nested\n- Last";
    const view = createView(doc);
    const nested = readCodeMirrorBlockRanges(view.state).find(
      (block) => block.depth === 1,
    );
    const last = readCodeMirrorBlockRanges(view.state).at(-1);

    expect(nested && last && moveCodeMirrorBlock(view, nested.from, last.from, "before", 0)).toBe(true);
    expect(view.state.doc.toString()).toBe("- First\n- Nested\n- Last");
  });

  it("preserves parsed child-item styling by changing only the moved region", () => {
    const doc = [
      "- **First title**: Body",
      "- Middle item",
      "- **Second title**: Body",
      "- **Third title**: Body",
      "",
      "After",
    ].join("\n");
    const changedRanges: Array<{ from: number; to: number }> = [];
    const view = createView(doc, false, [
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        update.changes.iterChangedRanges((from, to) => {
          changedRanges.push({ from, to });
        });
      }),
    ]);
    const [first, , second] = readCodeMirrorBlockRanges(view.state);

    expect(
      first && second &&
        moveCodeMirrorBlock(view, second.from, first.from, "after", 1),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "- **First title**: Body",
      "  - **Second title**: Body",
      "- Middle item",
      "- **Third title**: Body",
      "",
      "After",
    ].join("\n"));
    expect(changedRanges).toHaveLength(1);
    expect(changedRanges[0]?.from).toBeGreaterThan(0);
    expect(changedRanges[0]?.to).toBeLessThan(doc.length);

    const childLine = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-markra-list-item"),
    ).find((line) => line.textContent === "Second title: Body");
    expect(childLine?.getAttribute("data-list-depth")).toBe("1");
    expect(childLine?.getAttribute("data-markra-list-source")).toBe("hidden");
  });

  it("clamps a child drop to the deepest available parent level", () => {
    const view = createView([
      "- **First title**: Body",
      "- Middle item",
      "- **Moved title**: Body",
      "- Last item",
    ].join("\n"));
    const [first, , source] = readCodeMirrorBlockRanges(view.state);

    expect(
      source && first && moveCodeMirrorBlock(
        view,
        source.from,
        first.from,
        "after",
        3,
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "- **First title**: Body",
      "  - **Moved title**: Body",
      "- Middle item",
      "- Last item",
    ].join("\n"));
    const movedLine = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-line"),
    ).find((line) => line.textContent?.includes("Moved title"));
    expect(movedLine?.getAttribute("data-list-depth")).toBe("1");
    expect(movedLine?.getAttribute("data-markra-list-source")).toBe("hidden");
  });

  it("uses the parent marker width when nesting below an ordered item", () => {
    const view = createView([
      "10. Ordered parent",
      "- **Moved title**: Body",
      "- Last item",
    ].join("\n"));
    const [parent, source] = readCodeMirrorBlockRanges(view.state);

    expect(
      source && parent && moveCodeMirrorBlock(
        view,
        source.from,
        parent.from,
        "after",
        1,
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "10. Ordered parent",
      "    - **Moved title**: Body",
      "- Last item",
    ].join("\n"));
    const movedLine = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-line"),
    ).find((line) => line.textContent?.includes("Moved title"));
    expect(movedLine?.getAttribute("data-list-depth")).toBe("1");
    expect(movedLine?.getAttribute("data-markra-list-source")).toBe("hidden");
  });

  it("preserves tab-expanded columns when nesting a second-level item deeper", () => {
    const view = createView([
      "- Parent",
      "\t- First child",
      "\t- Second child",
      "\t\t- Grandchild",
      "- Tail",
    ].join("\n"));
    const blocks = readCodeMirrorBlockRanges(view.state);
    const firstChild = blocks.find((block) =>
      view.state.sliceDoc(block.from, block.to).startsWith("\t- First child")
    );
    const secondChild = blocks.find((block) =>
      view.state.sliceDoc(block.from, block.to).startsWith("\t- Second child")
    );

    expect(firstChild?.depth).toBe(1);
    expect(secondChild?.depth).toBe(1);
    expect(
      secondChild && firstChild && moveCodeMirrorBlock(
        view,
        secondChild.from,
        firstChild.from,
        "after",
        2,
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "- Parent",
      "\t- First child",
      "      - Second child",
      "          - Grandchild",
      "- Tail",
    ].join("\n"));
    const movedBlocks = readCodeMirrorBlockRanges(view.state);
    const moved = movedBlocks.find((block) =>
      view.state.doc.lineAt(block.from).text.includes("Second child")
    );
    const grandchild = movedBlocks.find((block) =>
      view.state.doc.lineAt(block.from).text.includes("Grandchild")
    );
    expect(moved?.depth).toBe(2);
    expect(grandchild?.depth).toBe(3);
  });

  it("turns a paragraph dropped as a child into a nested list item", () => {
    const view = createView("- Parent\n\nChild paragraph\n\nAfter");
    const [parent, child] = readCodeMirrorBlockRanges(view.state);

    expect(
      child && parent && moveCodeMirrorBlock(
        view,
        child.from,
        parent.from,
        "after",
        1,
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "- Parent\n  - Child paragraph\n\nAfter",
    );
    const childLine = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-line"),
    ).find((line) => line.textContent === "Child paragraph");
    expect(childLine?.getAttribute("data-list-depth")).toBe("1");
    expect(childLine?.getAttribute("data-markra-list-source")).toBe("hidden");
  });

  it("renders block controls with the app-compatible icon structure", () => {
    const view = createView("First\n\nSecond");
    const add = view.dom.querySelector(".markra-block-add-button");
    const drag = view.dom.querySelector(".markra-block-drag-handle");

    expect(add?.classList.contains("markra-block-tool-button")).toBe(true);
    expect(drag?.classList.contains("markra-block-tool-button")).toBe(true);
    expect(drag?.querySelectorAll(".markra-block-drag-dot")).toHaveLength(6);
  });

  it("moves a top-level block as one undoable source edit", () => {
    const doc = "First\n\nSecond\n\nThird";
    const view = createView(doc);
    const [first, second] = readCodeMirrorBlockRanges(view.state);

    expect(first && second && moveCodeMirrorBlock(view, first.from, second.from, "after")).toBe(true);
    expect(view.state.doc.toString()).toBe("Second\n\nFirst\n\nThird");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("reorders a four-asterisk horizontal rule as one block", () => {
    const doc = "First\n\n****\n\nSecond";
    const view = createView(doc);
    const blocks = readCodeMirrorBlockRanges(view.state);
    const rule = blocks.find((block) => block.name === "HorizontalRule");
    const second = blocks.find((block) => view.state.sliceDoc(block.from, block.to) === "Second");

    expect(view.dom.querySelectorAll("hr.cm-markra-horizontal-rule")).toHaveLength(1);
    expect(rule && second && moveCodeMirrorBlock(view, rule.from, second.from, "after")).toBe(true);
    expect(view.state.doc.toString()).toBe("First\n\nSecond\n\n****");
  });

  it("reorders blocks through the rendered drag handle", () => {
    const view = createView("First\n\nSecond\n\nThird");
    const [first, second] = readCodeMirrorBlockRanges(view.state);
    const handle = view.dom.querySelector<HTMLElement>(
      `[data-block-from="${first?.from}"] .markra-block-drag-handle`,
    );
    const target = view.dom.querySelector<HTMLElement>(
      `.cm-line[data-markra-block-from="${second?.from}"]`,
    );
    const values = new Map<string, string>();
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "none",
      getData: (type: string) => values.get(type) ?? "",
      setData: (type: string, value: string) => values.set(type, value),
    };
    const dragStart = new MouseEvent("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    const dragOver = new MouseEvent("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, "dataTransfer", { value: dataTransfer });
    const drop = new MouseEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });

    handle?.dispatchEvent(dragStart);
    target?.dispatchEvent(dragOver);
    expect(view.dom.querySelector(".markra-block-drag-source")).not.toBeNull();
    expect(view.dom.querySelector(".markra-block-drop-indicator")?.getAttribute("data-show")).toBe("true");
    target?.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("Second\n\nFirst\n\nThird");
    expect(view.dom.querySelector(".markra-block-drag-source")).toBeNull();
    expect(view.dom.querySelector(".markra-block-drop-indicator")).toBeNull();
  });

  it("reorders task items through pointer dragging when native drag events are unavailable", () => {
    const view = createView(
      "- [ ] First task\n- [ ] Second task\n- [ ] Third task",
    );
    const [first, second] = readCodeMirrorBlockRanges(view.state);
    const handle = view.dom.querySelector<HTMLElement>(
      `[data-block-from="${first?.from}"] .markra-block-drag-handle`,
    );
    const target = view.dom.querySelector<HTMLElement>(
      `.cm-line[data-markra-block-from="${second?.from}"]`,
    );

    handle?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    }));
    target?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 20,
      clientY: 40,
      pointerId: 1,
    }));

    expect(view.dom.querySelector(".markra-block-drag-source")).not.toBeNull();
    expect(
      view.dom.querySelector(".markra-block-drop-indicator")?.getAttribute(
        "data-show",
      ),
    ).toBe("true");

    target?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 40,
      pointerId: 1,
    }));

    expect(view.state.doc.toString()).toBe(
      "- [ ] Second task\n- [ ] First task\n- [ ] Third task",
    );
    expect(view.dom.querySelector(".markra-block-drag-source")).toBeNull();
    expect(view.dom.querySelector(".markra-block-drop-indicator")).toBeNull();
  });

  it("nests a second-level item as a third-level item through pointer dragging", () => {
    const view = createView([
      "- Parent",
      "  - First child",
      "  - Second child",
      "- Tail",
    ].join("\n"));
    const blocks = readCodeMirrorBlockRanges(view.state);
    const firstChild = blocks.find((block) =>
      view.state.sliceDoc(block.from, block.to).startsWith("  - First child")
    );
    const secondChild = blocks.find((block) =>
      view.state.sliceDoc(block.from, block.to).startsWith("  - Second child")
    );
    const handle = view.dom.querySelector<HTMLElement>(
      `[data-block-from="${secondChild?.from}"] .markra-block-drag-handle`,
    );
    const target = view.dom.querySelector<HTMLElement>(
      `.cm-line[data-markra-block-from="${firstChild?.from}"]`,
    );

    handle?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: 44,
      clientY: 10,
      pointerId: 2,
    }));
    target?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: 66,
      clientY: 40,
      pointerId: 2,
    }));
    target?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 66,
      clientY: 40,
      pointerId: 2,
    }));

    expect(view.state.doc.toString()).toBe([
      "- Parent",
      "  - First child",
      "    - Second child",
      "- Tail",
    ].join("\n"));
    const moved = readCodeMirrorBlockRanges(view.state).find((block) =>
      view.state.sliceDoc(block.from, block.to).startsWith("    - Second child")
    );
    expect(moved?.depth).toBe(2);
  });

  it("adds an editable blank block below and opens the virtual slash menu", () => {
    const view = createView("First\n\nSecond\n\nThird");
    const second = readCodeMirrorBlockRanges(view.state)[1];
    const button = view.dom.querySelector<HTMLButtonElement>(
      `[data-block-from="${second?.from}"] [aria-label="Add block below"]`,
    );

    button?.click();

    expect(view.state.doc.toString()).toBe("First\n\nSecond\n\n\n\nThird");
    expect(getMarkraSlashMenuState(view)).toMatchObject({
      open: true,
      source: "virtual",
    });
    expect(view.dom.querySelectorAll(".markra-block-add-button")).toHaveLength(4);
  });

  it("keeps later block controls mounted while typing plain text before them", () => {
    const doc = "Edit here\n\n## Later block";
    const view = createView(doc);
    const laterFrom = doc.indexOf("## Later block");
    const laterToolbar = view.dom.querySelector<HTMLElement>(
      `[data-block-from="${laterFrom}"]`,
    );

    view.dispatch({
      changes: { from: "Edit here".length, insert: "字" },
      selection: EditorSelection.cursor("Edit here字".length),
      userEvent: "input.type",
    });

    const nextLaterFrom = laterFrom + 1;
    expect(
      view.dom.querySelector(`[data-block-from="${nextLaterFrom}"]`),
    ).toBe(laterToolbar);
    expect(
      view.dom.querySelector(
        `.cm-line[data-markra-block-from="${nextLaterFrom}"]`,
      ),
    ).not.toBeNull();
  });

  it("does not render mutation controls in a read-only editor", () => {
    const view = createView("First\n\nSecond", true);

    expect(view.dom.querySelector(".markra-block-drag-handle")).toBeNull();
    const [first, second] = readCodeMirrorBlockRanges(view.state);
    expect(first && second && moveCodeMirrorBlock(view, first.from, second.from, "after")).toBe(false);
    expect(view.state.doc.toString()).toBe("First\n\nSecond");
  });
});
