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

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("markdownEditingPlugin", () => {
  it("keeps CodeMirror's native Enter behavior in a paragraph", () => {
    const doc = "MockBeforeMockAfter";
    const position = "MockBefore".length;
    const view = createView(doc, position);

    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("MockBefore\nMockAfter");
    expect(view.state.selection.main.head).toBe(position + 1);
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
