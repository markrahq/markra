import { EditorSelection, EditorState } from "@codemirror/state";
import { foldedRanges } from "@codemirror/language";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blocksPlugin } from "./blocks.ts";
import { formattingPlugin } from "./formatting.ts";
import { liveMarkdown } from "./index.ts";
import { markdownShortcutsPlugin } from "./markdown-shortcuts.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc = "Before text after",
  from = doc.indexOf("text"),
  to = from + "text".length,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        liveMarkdown({
          plugins: [
            blocksPlugin({ keybindings: false }),
            formattingPlugin({ keybindings: false }),
            markdownShortcutsPlugin({
              shortcuts: {
                bold: "Mod+Alt+B",
                heading1: "Mod+Alt+4",
                image: "Mod+Alt+I",
                openSpellcheckSuggestions: "Mod+Alt+.",
              },
            }),
          ],
        }),
      ],
      selection: EditorSelection.range(from, to),
    }),
  });
  views.push(view);
  return view;
}

function shortcut(
  view: EditorView,
  key: string,
  options: KeyboardEventInit = {},
) {
  return runScopeHandlers(
    view,
    new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      ctrlKey: true,
      key,
      ...options,
    }),
    "editor",
  );
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("markdownShortcutsPlugin", () => {
  it("delegates the configured plain text paste shortcut to the host", () => {
    const pastePlainText = vi.fn(() => true);
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "Synthetic",
        extensions: [
          liveMarkdown({
            plugins: [
              markdownShortcutsPlugin({
                pastePlainText,
                shortcuts: { pastePlainText: "Mod+Alt+G" },
              }),
            ],
          }),
        ],
      }),
    });
    views.push(view);

    const event = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "KeyG",
      ctrlKey: true,
      key: "g",
    });
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pastePlainText).toHaveBeenCalledWith(view, "Mod+Alt+G");
  });

  it("uses the configured formatting shortcut instead of the default chord", () => {
    const view = createView();
    const defaultEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "b",
    });

    expect(runScopeHandlers(view, defaultEvent, "editor")).toBe(false);
    expect(view.state.doc.toString()).toBe("Before text after");
    expect(shortcut(view, "b")).toBe(true);
    expect(view.state.doc.toString()).toBe("Before **text** after");
  });

  it("supports Alt-only formatting shortcuts without also matching Mod+Alt", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "Alpha",
        extensions: [
          liveMarkdown({
            plugins: [
              blocksPlugin({ keybindings: false }),
              formattingPlugin({ keybindings: false }),
              markdownShortcutsPlugin({
                shortcuts: { heading1: "Alt+1" },
              }),
            ],
          }),
        ],
        selection: EditorSelection.cursor(0),
      }),
    });
    views.push(view);

    const modAltEvent = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "Digit1",
      ctrlKey: true,
      key: "¡",
    });
    const altEvent = new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "Digit1",
      key: "¡",
    });

    view.contentDOM.dispatchEvent(modAltEvent);
    expect(view.state.doc.toString()).toBe("Alpha");

    view.contentDOM.dispatchEvent(altEvent);
    expect(altEvent.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("# Alpha");
  });

  it("routes configured block and insertion shortcuts to CodeMirror commands", () => {
    const heading = createView("Alpha", 2, 2);
    expect(shortcut(heading, "4")).toBe(true);
    expect(heading.state.doc.toString()).toBe("# Alpha");

    const image = createView("Alt", 0, 3);
    expect(shortcut(image, "i")).toBe(true);
    expect(image.state.doc.toString()).toBe("![Alt](assets/image.png)");
  });

  it("delegates the configured spellcheck shortcut to the host", () => {
    const openSpellcheckSuggestions = vi.fn(() => true);
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "Mispelled",
        extensions: [
          liveMarkdown({
            plugins: [
              markdownShortcutsPlugin({
                openSpellcheckSuggestions,
                shortcuts: { openSpellcheckSuggestions: "Mod+Alt+." },
              }),
            ],
          }),
        ],
      }),
    });
    views.push(view);

    expect(shortcut(view, ".")).toBe(true);
    expect(openSpellcheckSuggestions).toHaveBeenCalledWith(view);
  });

  it("toggles all foldable Markdown sections with the configured shortcut", () => {
    const doc = "# One\n\nAlpha\n\n## Two\n\nBeta";
    const view = createView(doc, 0, 0);

    expect(shortcut(view, "t")).toBe(true);
    let folds = 0;
    foldedRanges(view.state).between(0, view.state.doc.length, () => {
      folds += 1;
    });
    expect(folds).toBeGreaterThan(0);

    expect(shortcut(view, "t")).toBe(true);
    foldedRanges(view.state).between(0, view.state.doc.length, () => {
      folds += 1;
    });
    expect(folds).toBeGreaterThan(0);
    expect(foldedRanges(view.state).size).toBe(0);
  });
});
