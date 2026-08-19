import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearCodeMirrorSelectionFormatting,
  formattingPlugin,
  listMarkraUi,
  liveMarkdown,
  runMarkraCommand,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView({
  doc = "Before text after",
  from = 7,
  readOnly = false,
  to = 11,
} = {}) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(from, to),
      extensions: [
        EditorState.readOnly.of(readOnly),
        liveMarkdown({ plugins: [formattingPlugin()] }),
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

describe("formattingPlugin", () => {
  it("publishes stable Markra-friendly formatting actions", () => {
    const view = createView();

    expect(
      listMarkraUi(view, "selection-toolbar").map((action) => ({
        command: action.command,
        icon: action.icon,
        label: action.label,
      })),
    ).toEqual([
      { command: "format.bold", icon: "bold", label: "Bold" },
      { command: "format.italic", icon: "italic", label: "Italic" },
      {
        command: "format.strikethrough",
        icon: "strikethrough",
        label: "Strikethrough",
      },
      { command: "format.code", icon: "code", label: "Inline code" },
      {
        command: "format.highlight",
        icon: "highlighter",
        label: "Highlight",
      },
    ]);
  });

  it("wraps and unwraps a selection while preserving the selected text", () => {
    const view = createView();

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before **text** after");
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("text");
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.bold",
      )?.active,
    ).toBe(true);
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.italic",
      )?.active,
    ).toBe(false);

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before text after");
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.bold",
      )?.active,
    ).toBe(false);
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("text");
  });

  it.each([
    ["bold", "format.bold", "**"],
    ["italic", "format.italic", "*"],
    ["strikethrough", "format.strikethrough", "~~"],
    ["inline code", "format.code", "`"],
    ["highlight", "format.highlight", "=="],
  ] as const)(
    "normalizes mixed %s formatting before toggling it off",
    (_label, command, marker) => {
      const selected = `plain ${marker}marked${marker} tail`;
      const view = createView({
        doc: `Before ${selected} after`,
        from: "Before ".length,
        to: "Before ".length + selected.length,
      });

      expect(runMarkraCommand(view, command)).toBe(true);
      expect(view.state.doc.toString()).toBe(
        `Before ${marker}plain marked tail${marker} after`,
      );
      expect(
        view.state.sliceDoc(
          view.state.selection.main.from,
          view.state.selection.main.to,
        ),
      ).toBe("plain marked tail");

      expect(runMarkraCommand(view, command)).toBe(true);
      expect(view.state.doc.toString()).toBe(
        "Before plain marked tail after",
      );
    },
  );

  it("preserves nested italic formatting while normalizing mixed bold", () => {
    const selected = "plain ***marked*** tail";
    const view = createView({
      doc: `Before ${selected} after`,
      from: "Before ".length,
      to: "Before ".length + selected.length,
    });

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "Before **plain *marked* tail** after",
    );

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "Before plain *marked* tail after",
    );
  });

  it("merges bold spans that cross both selection boundaries", () => {
    const doc = "Before **start** plain **end** after";
    const from = doc.indexOf("start");
    const to = doc.indexOf("end") + "end".length;
    const view = createView({ doc, from, to });

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "Before **start plain end** after",
    );
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("start plain end");

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "Before start plain end after",
    );
  });

  it("preserves escaped marker text while normalizing italic", () => {
    const selected = String.raw`plain \*literal\* and *italic* tail`;
    const view = createView({
      doc: `Before ${selected} after`,
      from: "Before ".length,
      to: "Before ".length + selected.length,
    });

    expect(runMarkraCommand(view, "format.italic")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      String.raw`Before *plain \*literal\* and italic tail* after`,
    );

    expect(runMarkraCommand(view, "format.italic")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      String.raw`Before plain \*literal\* and italic tail after`,
    );
  });

  it("tracks and toggles nested bold and italic markers independently", () => {
    const view = createView();

    expect(runMarkraCommand(view, "format.bold")).toBe(true);
    expect(runMarkraCommand(view, "format.italic")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before ***text*** after");
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.bold",
      )?.active,
    ).toBe(true);
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.italic",
      )?.active,
    ).toBe(true);

    expect(runMarkraCommand(view, "format.italic")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before **text** after");
    expect(
      listMarkraUi(view, "selection-toolbar").find(
        (action) => action.command === "format.italic",
      )?.active,
    ).toBe(false);
  });

  it("clears bold markers while preserving the selected text", () => {
    const view = createView({
      doc: "Before **text** after",
      from: 9,
      to: 13,
    });

    expect(clearCodeMirrorSelectionFormatting(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("Before text after");
    expect(
      view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to,
      ),
    ).toBe("text");
  });

  it("toggles Markra highlight syntax", () => {
    const view = createView();

    expect(runMarkraCommand(view, "format.highlight")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before ==text== after");
    expect(runMarkraCommand(view, "format.highlight")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before text after");
  });

  it("disables formatting without an editable text selection", () => {
    const emptySelection = createView({ from: 7, to: 7 });
    const readOnlySelection = createView({ readOnly: true });

    expect(
      listMarkraUi(emptySelection, "selection-toolbar").every(
        (action) => !action.enabled,
      ),
    ).toBe(true);
    expect(runMarkraCommand(emptySelection, "format.bold")).toBe(false);
    expect(
      listMarkraUi(readOnlySelection, "selection-toolbar").every(
        (action) => !action.enabled,
      ),
    ).toBe(true);
    expect(runMarkraCommand(readOnlySelection, "format.bold")).toBe(false);
  });

  it("provides common document-editor formatting shortcuts", () => {
    const view = createView();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "b",
    });

    expect(runScopeHandlers(view, event, "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before **text** after");
  });

  it("handles normalized italic and strikethrough shortcut events", () => {
    const italic = createView();
    const italicEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "i",
    });
    expect(runScopeHandlers(italic, italicEvent, "editor")).toBe(true);
    expect(italic.state.doc.toString()).toBe("Before *text* after");

    const strikethrough = createView();
    const strikethroughEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "x",
      shiftKey: true,
    });
    expect(runScopeHandlers(strikethrough, strikethroughEvent, "editor")).toBe(true);
    expect(strikethrough.state.doc.toString()).toBe("Before ~~text~~ after");
  });
});
