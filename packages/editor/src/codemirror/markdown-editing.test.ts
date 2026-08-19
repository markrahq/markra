import { defaultKeymap } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type Transaction,
} from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { codeMirrorBlockDragPlugin } from "./block-drag.ts";
import { liveMarkdown } from "./index.ts";
import { markdownEditingPlugin } from "./markdown-editing.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  selection: number | EditorSelection,
  blockToolbar = false,
  observedTransactions?: Transaction[],
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        keymap.of(defaultKeymap),
        liveMarkdown({
          plugins: [
            ...(blockToolbar ? [codeMirrorBlockDragPlugin()] : []),
            markdownEditingPlugin(),
          ],
        }),
        observedTransactions
          ? EditorView.updateListener.of((update) => {
            observedTransactions.push(...update.transactions);
          })
          : [],
      ],
      selection: typeof selection === "number"
        ? EditorSelection.cursor(selection)
        : selection,
    }),
  });
  views.push(view);
  return view;
}

function press(
  view: EditorView,
  key: string,
  options: KeyboardEventInit = {},
) {
  return runScopeHandlers(
    view,
    new KeyboardEvent("keydown", { bubbles: true, key, ...options }),
    "editor",
  );
}

function expectFullHeightEmptyLines(view: EditorView, count: number) {
  const emptyLines = Array.from(
    view.dom.querySelectorAll(".cm-markra-empty-line"),
  );
  expect(emptyLines).toHaveLength(count);
  expect(
    emptyLines.every((line) =>
      !line.hasAttribute("data-markra-empty-source")
    ),
  ).toBe(true);
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("markdownEditingPlugin", () => {
  it.each([3, 4])(
    "keeps the trailing line break when replacing a line after click count %s",
    (detail) => {
      const firstLine = "Mock selected line";
      const secondLine = "Mock next line";
      const view = createView(`${firstLine}\n${secondLine}`, 0);
      view.focus();

      view.contentDOM.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
        detail,
      }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      expect(view.state.selection.main.from).toBe(0);
      expect(view.state.selection.main.to).toBe(firstLine.length);

      view.dispatch(
        view.state.replaceSelection("Replacement"),
        { userEvent: "input.type" },
      );

      expect(view.state.doc.toString()).toBe(`Replacement\n${secondLine}`);
    },
  );

  it("keeps the trailing line break when replacing a keyboard-selected line", () => {
    const firstLine = "Mock selected line";
    const secondLine = "Mock next line";
    const view = createView(`${firstLine}\n${secondLine}`, 0);
    view.focus();

    expect(press(view, "l", { altKey: true })).toBe(true);
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(firstLine.length);

    view.dispatch(
      view.state.replaceSelection("Replacement"),
      { userEvent: "input.type" },
    );

    expect(view.state.doc.toString()).toBe(`Replacement\n${secondLine}`);
  });

  it("inserts into a triple-clicked empty line without removing it", () => {
    const secondLine = "Mock next line";
    const view = createView(`\n${secondLine}`, 0);
    view.focus();

    view.contentDOM.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 0,
      detail: 3,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(view.state.selection.main.empty).toBe(true);
    view.dispatch(
      view.state.replaceSelection("Replacement"),
      { userEvent: "input.type" },
    );

    expect(view.state.doc.toString()).toBe(`Replacement\n${secondLine}`);
  });

  it("keeps internal line breaks in a keyboard-selected line range", () => {
    const firstLine = "Mock first line";
    const secondLine = "Mock second line";
    const thirdLine = "Mock third line";
    const doc = `${firstLine}\n${secondLine}\n${thirdLine}`;
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.range(2, firstLine.length + 1 + 4),
      ]),
    );

    expect(press(view, "l", { altKey: true })).toBe(true);
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(
      firstLine.length + 1 + secondLine.length,
    );

    view.dispatch(
      view.state.replaceSelection("Replacement"),
      { userEvent: "input.type" },
    );

    expect(view.state.doc.toString()).toBe(`Replacement\n${thirdLine}`);
  });

  it("selects multiple complete lines without their trailing breaks", () => {
    const firstLine = "Mock first line";
    const middleLine = "Mock middle line";
    const lastLine = "Mock last line";
    const doc = `${firstLine}\n${middleLine}\n${lastLine}`;
    const lastLineFrom = firstLine.length + 1 + middleLine.length + 1;
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(2),
        EditorSelection.cursor(lastLineFrom + 2),
      ]),
    );

    expect(press(view, "l", { altKey: true })).toBe(true);
    expect(view.state.selection.ranges.map(({ from, to }) => ({ from, to })))
      .toEqual([
        { from: 0, to: firstLine.length },
        { from: lastLineFrom, to: doc.length },
      ]);

    view.dispatch(
      view.state.replaceSelection("Replacement"),
      { userEvent: "input.type" },
    );

    expect(view.state.doc.toString()).toBe(
      `Replacement\n${middleLine}\nReplacement`,
    );
  });

  it("keeps CodeMirror's double-click word selection behavior", () => {
    const view = createView("Mock selected line\nMock next line", 0);
    view.focus();

    view.contentDOM.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 0,
      detail: 2,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe("Mock".length);
  });

  it("keeps CodeMirror's native Enter behavior in a paragraph", () => {
    const doc = "MockBeforeMockAfter";
    const position = "MockBefore".length;
    const view = createView(doc, position);

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("MockBefore\nMockAfter");
    expect(view.state.selection.main.head).toBe(position + 1);
  });

  it("keeps the caret on a new blank line before text", () => {
    const doc = "Before\nAfter";
    const position = "Before\n".length;
    const view = createView(doc, position);
    view.focus();

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before\n\nAfter");
    expect(view.state.selection.main.head).toBe(position + 1);
    expectFullHeightEmptyLines(view, 1);

    view.dispatch({
      changes: { from: position + 1, insert: "Middle" },
      selection: EditorSelection.cursor(position + 1 + "Middle".length),
      userEvent: "input.type",
    });

    expect(view.state.doc.toString()).toBe("Before\n\nMiddleAfter");
    expectFullHeightEmptyLines(view, 1);
  });

  it("adds one editable blank line when a Markdown separator already exists", () => {
    const doc = "Before\n\nAfter";
    const position = "Before\n\n".length;
    const view = createView(doc, position);
    view.focus();

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before\n\n\nAfter");
    expect(view.state.selection.main.head).toBe(position + 1);
    expectFullHeightEmptyLines(view, 2);
  });

  it("adds one editable blank line after the final character before the next line", () => {
    const doc = "Before\nAfter";
    const position = "Before".length;
    const view = createView(doc, position);
    view.focus();

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before\n\nAfter");
    expect(view.state.selection.main.head).toBe(position + 1);
    expectFullHeightEmptyLines(view, 1);
  });

  it("keeps a single native newline at the end of the document", () => {
    const doc = "Before";
    const view = createView(doc, doc.length);
    view.focus();

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before\n");
    expect(view.state.selection.main.head).toBe(doc.length + 1);
    expectFullHeightEmptyLines(view, 1);
  });

  it("moves the caret with text across repeated Enter presses", () => {
    const before = "MockBefore";
    const after = "MockAfter";
    const view = createView(`${before}${after}`, before.length);
    view.focus();

    for (let presses = 1; presses <= 4; presses += 1) {
      expect(press(view, "Enter")).toBe(true);
      const lineBreaks = presses;
      expect(view.state.doc.toString()).toBe(
        `${before}${"\n".repeat(lineBreaks)}${after}`,
      );
      expect(view.state.selection.main.head).toBe(before.length + lineBreaks);
    }

    expectFullHeightEmptyLines(view, 3);

    const position = view.state.selection.main.head;
    view.dispatch({
      changes: { from: position, insert: "Typed" },
      selection: EditorSelection.cursor(position + "Typed".length),
      userEvent: "input.type",
    });

    expect(view.state.doc.toString()).toBe(
      `${before}\n\n\n\nTyped${after}`,
    );
    expectFullHeightEmptyLines(view, 3);

    view.dispatch({
      selection: EditorSelection.cursor(0),
      userEvent: "select.pointer",
    });
    expectFullHeightEmptyLines(view, 3);
  });

  it("keeps surviving blank lines full height during backward deletion", () => {
    const before = "MockBefore";
    const after = "MockAfter";
    const view = createView(`${before}${after}`, before.length);
    view.focus();

    for (let presses = 0; presses < 4; presses += 1) {
      expect(press(view, "Enter")).toBe(true);
    }

    view.contentDOM.blur();
    expect(view.hasFocus).toBe(false);
    expectFullHeightEmptyLines(view, 3);

    view.focus();
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.line(4).from),
      userEvent: "select.pointer",
    });
    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe(`${before}\n\n\n${after}`);
    expectFullHeightEmptyLines(view, 2);

    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe(`${before}\n\n${after}`);
    expectFullHeightEmptyLines(view, 1);

    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe(`${before}\n${after}`);
    expect(
      view.dom.querySelector(".cm-markra-empty-line"),
    ).toBeNull();
  });

  it("keeps multiple inserted empty lines full height", () => {
    const doc = "One\nTwo";
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor("One\n".length),
      ]),
    );
    view.focus();

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("\nOne\n\nTwo");
    expect(view.state.selection.ranges.map((range) => range.head)).toEqual([
      1,
      "\nOne\n".length + 1,
    ]);
    expectFullHeightEmptyLines(view, 2);
  });

  it("keeps the caret associated with text after joining lines backward", () => {
    const view = createView("MockText", 0);

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("\nMockText");
    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe("MockText");
    expect(view.state.selection.main.head).toBe(0);
    expect(view.state.selection.main.assoc).toBe(1);
  });

  it("keeps the native caret on the text side of the block toolbar", () => {
    const transactions: Transaction[] = [];
    const view = createView("\nMockText", 1, true, transactions);
    view.focus();

    expect(press(view, "Backspace")).toBe(true);

    const line = view.dom.querySelector<HTMLElement>(".cm-line");
    const toolbar = line?.querySelector(":scope > .cm-markra-block-toolbar");
    const nativeSelection = document.getSelection();
    expect(line).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(nativeSelection?.anchorNode).not.toBeNull();

    const anchorNode = nativeSelection?.anchorNode;
    const anchorOffset = nativeSelection?.anchorOffset ?? -1;
    const toolbarIndex = line && toolbar
      ? [...line.childNodes].indexOf(toolbar)
      : -1;
    const isOnTextSide = anchorNode === line
      ? anchorOffset > toolbarIndex + 1
      : Boolean(
        anchorNode && line?.contains(anchorNode) && !toolbar?.contains(anchorNode),
      );
    expect(isOnTextSide).toBe(true);
    // The affinity must be part of the deleting transaction. A follow-up
    // selection update leaves real browsers on the equivalent widget edge.
    expect(transactions).toHaveLength(1);
  });

  it("keeps every caret associated with text when joining empty lines backward", () => {
    const doc = "\nMockOne\n\nMockTwo";
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(doc.indexOf("MockTwo")),
      ]),
    );

    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe("MockOne\nMockTwo");
    expect(view.state.selection.ranges.map((range) => range.head)).toEqual([
      0,
      "MockOne\n".length,
    ]);
    expect(view.state.selection.ranges.map((range) => range.assoc)).toEqual([
      1,
      1,
    ]);
  });

  it("corrects only affected carets in a mixed multi-cursor deletion", () => {
    const doc = "\nMockOne\nTail";
    const view = createView(
      doc,
      EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(doc.length),
      ]),
    );

    expect(press(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe("MockOne\nTai");
    expect(view.state.selection.ranges.map((range) => range.assoc)).toEqual([
      1,
      -1,
    ]);
  });

  it("completes a typed image destination when Enter confirms it", () => {
    const doc = "![a](https://images.example.test/mock.jpg?w=1280&h=960";
    const view = createView(doc, doc.length);

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe(`${doc})\n`);
    expect(view.state.selection.main.head).toBe(doc.length + 2);
  });

  it("keeps CodeMirror's native Markdown list continuation", () => {
    const view = createView("- First", "- First".length);

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("- First\n- ");
  });

  it("inserts two spaces at the cursor for plain-text Tab", () => {
    const view = createView("Alphabeta", "Alpha".length);

    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("Alpha  beta");
  });

  it("indents and outdents the current Markdown list item", () => {
    const doc = "- First\n- Second";
    const view = createView(doc, doc.indexOf("Second"));

    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("- First\n  - Second");
    expect(press(view, "Tab", { shiftKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps Shift+Enter inside quote and callout source", () => {
    const doc = "> [!NOTE]\n> Quote";
    const view = createView(doc, doc.length);

    expect(press(view, "Enter", { shiftKey: true })).toBe(true);
    expect(view.state.doc.toString()).toBe("> [!NOTE]\n> Quote\n> ");
  });

  it("inserts an HTML line break inside a GFM table cell", () => {
    const doc = "| Name | Notes |\n| --- | --- |\n| Example | First line |";
    const position = doc.indexOf("First line") + "First line".length;
    const view = createView(doc, position);

    expect(press(view, "Enter", { shiftKey: true })).toBe(true);
    expect(view.state.doc.toString()).toContain("First line<br> |");
  });
});
