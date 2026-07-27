import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  blocksPlugin,
  listMarkraUi,
  liveMarkdown,
  runMarkraCommand,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

interface CreateViewOptions {
  doc?: string;
  from?: number;
  readOnly?: boolean;
  to?: number;
}

function createView(options: CreateViewOptions = {}) {
  const doc = options.doc ?? "Alpha\nBeta";
  const from = options.from ?? 0;
  const readOnly = options.readOnly ?? false;
  const to = options.to ?? doc.length;
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(from, to),
      extensions: [
        EditorState.readOnly.of(readOnly),
        liveMarkdown({ plugins: [blocksPlugin()] }),
      ],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("blocksPlugin", () => {
  it("publishes stable Markra-friendly slash-menu actions", () => {
    const view = createView();

    expect(
      listMarkraUi(view, "slash-menu").map((action) => ({
        command: action.command,
        icon: action.icon,
        label: action.label,
      })),
    ).toEqual([
      { command: "block.paragraph", icon: "pilcrow", label: "Paragraph" },
      { command: "block.heading.1", icon: "heading-1", label: "Heading 1" },
      { command: "block.heading.2", icon: "heading-2", label: "Heading 2" },
      { command: "block.heading.3", icon: "heading-3", label: "Heading 3" },
      { command: "block.heading.4", icon: "heading-4", label: "Heading 4" },
      { command: "block.heading.5", icon: "heading-5", label: "Heading 5" },
      { command: "block.heading.6", icon: "heading-6", label: "Heading 6" },
      {
        command: "block.bullet-list",
        icon: "list",
        label: "Bullet list",
      },
      {
        command: "block.ordered-list",
        icon: "list-ordered",
        label: "Numbered list",
      },
      { command: "block.quote", icon: "text-quote", label: "Quote" },
      {
        command: "block.callout",
        icon: "message-square-warning",
        label: "Callout",
      },
      { command: "block.code", icon: "square-code", label: "Code block" },
      { command: "block.table", icon: "table-2", label: "Table" },
    ]);
  });

  it("restores the Callout and Table slash-menu block insertions", () => {
    const callout = createView({ doc: "", from: 0, to: 0 });

    expect(runMarkraCommand(callout, "block.callout")).toBe(true);
    expect(callout.state.doc.toString()).toBe("> [!NOTE]\n> ");
    expect(callout.state.selection.main.head).toBe("> [!NOTE]\n> ".length);

    const table = createView({ doc: "", from: 0, to: 0 });
    expect(runMarkraCommand(table, "block.table")).toBe(true);
    expect(table.state.doc.toString()).toBe(
      "|  |  |\n| --- | --- |\n|  |  |",
    );
    expect(table.state.selection.main.head).toBe(2);
  });

  it("omits Callout when GitHub alerts are disabled", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        extensions: [liveMarkdown({ plugins: [blocksPlugin({ callout: false })] })],
      }),
    });
    views.push(view);

    expect(
      listMarkraUi(view, "slash-menu").some(
        (action) => action.command === "block.callout",
      ),
    ).toBe(false);
  });

  it("sets and removes a heading while keeping the caret with its text", () => {
    const view = createView({ doc: "Alpha", from: 2, to: 2 });

    expect(runMarkraCommand(view, "block.heading.1")).toBe(true);
    expect(view.state.doc.toString()).toBe("# Alpha");
    expect(view.state.selection.main.head).toBe(4);

    expect(runMarkraCommand(view, "block.paragraph")).toBe(true);
    expect(view.state.doc.toString()).toBe("Alpha");
    expect(view.state.selection.main.head).toBe(2);
  });

  it("shows a quiet heading-level control for the active rendered heading", () => {
    const view = createView({ doc: "## Synthetic heading", from: 8, to: 8 });
    view.focus();
    view.dispatch({ selection: view.state.selection });

    const button = view.dom.querySelector<HTMLButtonElement>(
      ".markra-heading-level-button",
    );
    expect(button?.dataset.headingLevel).toBe("H2");
    button?.click();

    const heading3 = view.dom.querySelector<HTMLButtonElement>(
      '.markra-heading-level-option[data-heading-level="H3"]',
    );
    expect(heading3?.getAttribute("aria-selected")).toBe("false");
    heading3?.click();

    expect(view.state.doc.toString()).toBe("### Synthetic heading");
    expect(view.dom.querySelector(".markra-heading-level-list")).toBeNull();
  });

  it("does not show a heading-level control for a code comment", () => {
    const doc = "```python\n# Synthetic comment\n```";
    const comment = doc.indexOf("Synthetic");
    const view = createView({ doc, from: comment, to: comment });
    view.focus();
    view.dispatch({ selection: view.state.selection });

    expect(view.dom.querySelector(".markra-heading-level-button")).toBeNull();
  });

  it("does not transform the next line when a selection ends at its start", () => {
    const view = createView({ doc: "Alpha\nBeta", from: 0, to: 6 });

    expect(runMarkraCommand(view, "block.heading.2")).toBe(true);
    expect(view.state.doc.toString()).toBe("## Alpha\nBeta");
  });

  it("toggles quote and list markers across selected lines", () => {
    const quote = createView();
    expect(runMarkraCommand(quote, "block.quote")).toBe(true);
    expect(quote.state.doc.toString()).toBe("> Alpha\n> Beta");
    expect(runMarkraCommand(quote, "block.quote")).toBe(true);
    expect(quote.state.doc.toString()).toBe("Alpha\nBeta");

    const bullet = createView();
    expect(runMarkraCommand(bullet, "block.bullet-list")).toBe(true);
    expect(bullet.state.doc.toString()).toBe("- Alpha\n- Beta");
    expect(runMarkraCommand(bullet, "block.bullet-list")).toBe(true);
    expect(bullet.state.doc.toString()).toBe("Alpha\nBeta");

    const ordered = createView();
    expect(runMarkraCommand(ordered, "block.ordered-list")).toBe(true);
    expect(ordered.state.doc.toString()).toBe("1. Alpha\n2. Beta");
    expect(runMarkraCommand(ordered, "block.ordered-list")).toBe(true);
    expect(ordered.state.doc.toString()).toBe("Alpha\nBeta");
  });

  it("wraps and unwraps a selected block in a fenced code block", () => {
    const view = createView();

    expect(runMarkraCommand(view, "block.code")).toBe(true);
    expect(view.state.doc.toString()).toBe("```\nAlpha\nBeta\n```");
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("Alpha\nBeta");

    expect(runMarkraCommand(view, "block.code")).toBe(true);
    expect(view.state.doc.toString()).toBe("Alpha\nBeta");
  });

  it("unwraps an existing fenced block with a punctuation-rich language", () => {
    const view = createView({
      doc: "```c++\nAlpha\n```",
      from: 7,
      to: 12,
    });

    expect(runMarkraCommand(view, "block.code")).toBe(true);
    expect(view.state.doc.toString()).toBe("Alpha");
  });

  it("disables block commands in a read-only editor", () => {
    const view = createView({ readOnly: true });

    expect(listMarkraUi(view, "slash-menu").every((action) => !action.enabled)).toBe(
      true,
    );
    expect(runMarkraCommand(view, "block.quote")).toBe(false);
  });

  it("provides the same heading shortcut family used by Markra", () => {
    const view = createView({ doc: "Alpha", from: 2, to: 2 });
    const event = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      ctrlKey: true,
      key: "1",
    });

    expect(runScopeHandlers(view, event, "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("# Alpha");

    const heading6 = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      ctrlKey: true,
      key: "6",
    });
    expect(runScopeHandlers(view, heading6, "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("###### Alpha");
  });
});
