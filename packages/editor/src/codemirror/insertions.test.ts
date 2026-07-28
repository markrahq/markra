import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  insertionsPlugin,
  listMarkraUi,
  liveMarkdown,
  runMarkraCommand,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(readOnly = false) {
  const doc = "Published: placeholder";
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.readOnly.of(readOnly),
        liveMarkdown({
          plugins: [
            insertionsPlugin({
              labels: { "insert.today": "Current date" },
              now: () => new Date(2031, 4, 6, 10, 30),
            }),
          ],
        }),
      ],
      selection: EditorSelection.range(
        doc.indexOf("placeholder"),
        doc.length,
      ),
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("insertionsPlugin", () => {
  it("publishes a Today slash command that replaces the selection", () => {
    const view = createView();

    expect(
      listMarkraUi(view, "slash-menu").map((action) => ({
        command: action.command,
        icon: action.icon,
        label: action.label,
      })),
    ).toEqual([
      {
        command: "insert.today",
        icon: "calendar-days",
        label: "Current date",
      },
    ]);

    expect(runMarkraCommand(view, "insert.today")).toBe(true);
    expect(view.state.doc.toString()).toBe("Published: 2031-05-06");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("disables date insertion in a read-only editor", () => {
    const view = createView(true);

    expect(listMarkraUi(view, "slash-menu")[0]?.enabled).toBe(false);
    expect(runMarkraCommand(view, "insert.today")).toBe(false);
    expect(view.state.doc.toString()).toBe("Published: placeholder");
  });
});
