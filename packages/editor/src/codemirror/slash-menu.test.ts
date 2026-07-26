import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blocksPlugin,
  closeMarkraSlashMenu,
  getMarkraSlashMenuState,
  liveMarkdown,
  openMarkraSlashMenu,
  runMarkraSlashMenuAction,
  searchMarkraUi,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(doc = "/", slashMenu = true) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        liveMarkdown({ plugins: [blocksPlugin()], slashMenu }),
      ],
    }),
  });
  views.push(view);
  return view;
}

function editorKey(view: EditorView, key: string) {
  return runScopeHandlers(
    view,
    new KeyboardEvent("keydown", { bubbles: true, key }),
    "editor",
  );
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("Markra slash menu", () => {
  it("stays opt-in so a host never gets invisible keyboard interception", () => {
    const view = createView("/", false);

    expect(getMarkraSlashMenuState(view).open).toBe(false);
    expect(editorKey(view, "ArrowDown")).toBe(false);
  });

  it("searches semantic UI metadata independently of a component framework", () => {
    const view = createView();

    expect(
      searchMarkraUi(view, "slash-menu", "h2").map((action) => action.command),
    ).toEqual(["block.heading.2"]);
    expect(
      searchMarkraUi(view, "slash-menu", "numbered list").map(
        (action) => action.command,
      ),
    ).toEqual(["block.ordered-list"]);
  });

  it("exposes typed slash state and filters plugin-contributed actions", () => {
    const view = createView("/hea");
    const state = getMarkraSlashMenuState(view);

    expect(state).toMatchObject({
      from: 0,
      open: true,
      query: "hea",
      selectedIndex: 0,
      source: "typed",
      to: 4,
    });
    expect(state.actions.map((action) => action.command)).toEqual([
      "block.heading.1",
      "block.heading.2",
      "block.heading.3",
      "block.heading.4",
      "block.heading.5",
      "block.heading.6",
    ]);
  });

  it("supports the Chinese dunhao as a typed slash-menu trigger", () => {
    const view = createView("、h2");

    expect(getMarkraSlashMenuState(view)).toMatchObject({
      from: 0,
      open: true,
      query: "h2",
      source: "typed",
      to: 3,
    });
    expect(editorKey(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("## ");
  });

  it("does not open from source text inside a fenced code block", () => {
    const view = createView("```text\n/hea\n```");
    view.dispatch({ selection: EditorSelection.cursor(12) });

    expect(getMarkraSlashMenuState(view).open).toBe(false);
  });

  it("supports keyboard navigation and runs a command after deleting the query", () => {
    const navigation = createView();
    expect(editorKey(navigation, "ArrowDown")).toBe(true);
    expect(getMarkraSlashMenuState(navigation).selectedIndex).toBe(1);
    expect(editorKey(navigation, "ArrowUp")).toBe(true);
    expect(getMarkraSlashMenuState(navigation).selectedIndex).toBe(0);

    const execution = createView("/h2");
    expect(editorKey(execution, "Enter")).toBe(true);
    expect(execution.state.doc.toString()).toBe("## ");
    expect(execution.state.selection.main.head).toBe(3);
    expect(getMarkraSlashMenuState(execution).open).toBe(false);
  });

  it.each([
    ["warning", "WARNING"],
    ["tip", "TIP"],
    ["caution", "CAUTION"],
    ["important", "IMPORTANT"],
  ])("uses /%s as the inserted Callout type", (query, type) => {
    const view = createView(`/${query}`);

    expect(runMarkraSlashMenuAction(view, "block.callout")).toBe(true);
    expect(view.state.doc.toString()).toBe(`> [!${type}]\n> `);
  });

  it("closes a typed menu without immediately reopening it", () => {
    const view = createView("/h");

    expect(closeMarkraSlashMenu(view)).toBe(true);
    expect(getMarkraSlashMenuState(view).open).toBe(false);
    view.dispatch({});
    expect(getMarkraSlashMenuState(view).open).toBe(false);
  });

  it("opens virtually for a toolbar button and executes text typed after it", () => {
    const view = createView("");
    const focus = vi.spyOn(view, "focus");

    expect(openMarkraSlashMenu(view)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
    view.dispatch({
      changes: { from: 0, insert: "quote" },
      selection: EditorSelection.cursor(5),
    });
    expect(getMarkraSlashMenuState(view)).toMatchObject({
      open: true,
      query: "quote",
      source: "virtual",
    });

    expect(runMarkraSlashMenuAction(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("> ");
    expect(getMarkraSlashMenuState(view).open).toBe(false);
  });
});
