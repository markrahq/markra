import { forceParsing } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type Extension,
  type SelectionRange,
} from "@codemirror/state";
import { drawSelection, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMarkdown } from "./index.ts";

const syntaxTreeIterations = vi.hoisted(
  (): Array<{ from: number | undefined; to: number | undefined }> => [],
);

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();

  return {
    ...actual,
    syntaxTree(state: Parameters<typeof actual.syntaxTree>[0]) {
      const tree = actual.syntaxTree(state);
      return new Proxy(tree, {
        get(target, property, receiver) {
          if (property !== "iterate") {
            return Reflect.get(target, property, receiver);
          }

          return (spec: Parameters<typeof tree.iterate>[0]) => {
            syntaxTreeIterations.push({ from: spec.from, to: spec.to });
            return target.iterate(spec);
          };
        },
      });
    },
  };
});

const source = "# Project **notes**\n\nEdit this line";
import "./dom.test-support.ts";

const views: EditorView[] = [];

interface ViewOptions {
  doc?: string;
  anchor?: number;
  selection?: EditorSelection | SelectionRange;
  focus?: boolean;
  extensions?: Extension[];
}

function createView({
  doc = source,
  anchor = doc.length,
  selection,
  focus = true,
  extensions = [liveMarkdown()],
}: ViewOptions = {}) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: selection ?? { anchor },
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        ...extensions,
      ],
    }),
  });

  views.push(view);
  if (focus) {
    view.focus();
    view.dispatch({ selection: view.state.selection });
  }
  return view;
}

function renderedLines(view: EditorView) {
  return Array.from(view.dom.querySelectorAll(".cm-line"), (line) =>
    line.textContent ?? "",
  );
}

function paragraphEndStates(view: EditorView) {
  return Array.from(
    view.dom.querySelectorAll(".cm-markra-paragraph"),
    (line) => line.classList.contains("cm-markra-paragraph-end"),
  );
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("liveMarkdown", () => {
  it("keeps a heading marker visible immediately after it is typed", () => {
    const view = createView({ doc: "", anchor: 0 });

    view.dispatch({
      changes: { from: 0, insert: "#" },
      selection: { anchor: 1 },
    });

    expect(view.state.doc.toString()).toBe("#");
    expect(renderedLines(view)).toEqual(["#"]);
  });

  it("hides Markdown markers outside the active line", () => {
    const view = createView();

    expect(renderedLines(view)).toEqual([
      "Project notes",
      "",
      "Edit this line",
    ]);
  });

  it.each([
    ["heading", "# Synthetic heading", 3, "#"],
    ["strong", "**Synthetic**", 4, "****"],
    ["emphasis", "*Synthetic*", 3, "**"],
    ["inline code", "`Synthetic`", 3, "``"],
    ["strikethrough", "~~Synthetic~~", 4, "~~~~"],
    ["highlight", "==Synthetic==", 4, "===="],
    ["blockquote", "> Synthetic quote", 0, ">"],
    ["list", "- Synthetic item", 0, "-"],
    ["link", "[Synthetic](https://example.test)", 3, "[]()"],
    ["horizontal rule", "---", 1, "---"],
  ])("uses the muted syntax class for %s markers", (
    _label,
    doc,
    anchor,
    expectedMarkers,
  ) => {
    const view = createView({ doc, anchor });
    const syntaxCharacters = Array.from(
      view.dom.querySelectorAll(".cm-markra-syntax-character"),
      (element) => element.textContent ?? "",
    ).join("");

    expect(syntaxCharacters).toBe(expectedMarkers);
  });

  it("reveals the heading marker while the cursor edits heading text", () => {
    const view = createView();

    view.dispatch({ selection: { anchor: 5 } });

    expect(renderedLines(view)[0]).toBe("# Project notes");
  });

  it("reveals a heading marker only at its boundary when automatic heading hiding is enabled", () => {
    const headingView = createView({
      extensions: [liveMarkdown({ hideHeadingMarkersOnFocus: true })],
    });

    headingView.dispatch({ selection: { anchor: 5 } });
    expect(renderedLines(headingView)[0]).toBe("Project notes");

    headingView.dispatch({ selection: { anchor: 0 } });
    expect(renderedLines(headingView)[0]).toBe("# Project notes");
  });

  it.each([
    ["bold", "**Synthetic**"],
    ["italic", "*Synthetic*"],
    ["strikethrough", "~~Synthetic~~"],
    ["highlight", "==Synthetic=="],
    ["inline code", "`Synthetic`"],
    ["nested bold and italic", "***Synthetic***"],
  ])("keeps complete %s markers visible when automatic heading hiding is enabled", (
    _label,
    doc,
  ) => {
    const view = createView({
      doc,
      anchor: doc.indexOf("Synthetic") + 2,
      extensions: [liveMarkdown({ hideHeadingMarkersOnFocus: true })],
    });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it("keeps the heading marker visible while dragging a selection from its text", () => {
    const doc = "## Synthetic heading";
    const view = createView({ doc, anchor: doc.length });

    view.dispatch({
      selection: EditorSelection.range(
        doc.length,
        doc.indexOf("Synthetic") + 2,
      ),
    });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it("reveals only a syntax marker that the cursor enters directly", () => {
    const view = createView();

    view.dispatch({ selection: { anchor: 0 } });

    expect(renderedLines(view)[0]).toBe("# Project notes");
  });

  it("reveals inline source when a Vim normal cursor targets its boundary", () => {
    const doc = "**Synthetic strong text**";
    const view = createView({ doc, anchor: doc.length });

    view.scrollDOM.classList.add("cm-vimMode");
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it("keeps inline source hidden when a Vim cursor targets the next character", () => {
    const doc = "**Synthetic strong text** tail";
    const view = createView({ doc, anchor: doc.length });

    view.scrollDOM.classList.add("cm-vimMode");
    view.dispatch({
      selection: EditorSelection.cursor(doc.indexOf(" tail")),
    });

    expect(renderedLines(view)[0]).toBe("Synthetic strong text tail");
  });

  it.each([
    ["list", "- Synthetic item"],
    ["blockquote", "> Synthetic quote"],
  ])("keeps the %s marker visible while dragging from its source", (
    _label,
    doc,
  ) => {
    const view = createView({ doc, anchor: 0 });

    view.dispatch({ selection: EditorSelection.range(0, 5) });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it.each([
    ["bold", "Before **synthetic** after", "synthetic"],
    ["italic", "Before *synthetic* after", "synthetic"],
    ["strikethrough", "Before ~~synthetic~~ after", "synthetic"],
    ["highlight", "Before ==synthetic== after", "synthetic"],
    ["inline code", "Before `synthetic` after", "synthetic"],
  ])("reveals the complete %s wrapper when its text is active", (_label, doc, text) => {
    const view = createView({
      doc,
      anchor: doc.indexOf(text) + Math.floor(text.length / 2),
    });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it.each([
    ["bold", "Before **synthetic** after", "synthetic"],
    ["italic", "Before *synthetic* after", "synthetic"],
    ["strikethrough", "Before ~~synthetic~~ after", "synthetic"],
    ["inline code", "Before `synthetic` after", "synthetic"],
  ])("keeps the complete %s source visible while dragging from inside it", (
    _label,
    doc,
    text,
  ) => {
    const anchor = doc.indexOf(text) + 2;
    const view = createView({ doc, anchor });

    view.dispatch({
      selection: EditorSelection.range(anchor, anchor + 4),
    });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it("reveals every marker in a nested bold and italic wrapper", () => {
    const doc = "Before ***synthetic*** after";
    const view = createView({
      doc,
      anchor: doc.indexOf("synthetic") + 4,
    });

    expect(renderedLines(view)[0]).toBe(doc);
  });

  it("renders every line when the editor does not have focus", () => {
    const view = createView({ anchor: 5, focus: false });

    expect(renderedLines(view)[0]).toBe("Project notes");
  });

  it("reveals a link only when the selection enters that link", () => {
    const doc = "Before [label](https://example.test) after";
    const view = createView({ doc, anchor: 2 });

    expect(renderedLines(view)[0]).toBe("Before label after");
    expect(view.dom.querySelector(".cm-markra-link-icon")).not.toBeNull();

    view.dispatch({ selection: { anchor: doc.indexOf("label") + 2 } });

    expect(renderedLines(view)[0]).toBe(doc);
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
    expect(
      view.dom.querySelector(".cm-markra-link-source-label")?.textContent,
    ).toBe("label");
    expect(
      Array.from(
        view.dom.querySelectorAll<HTMLElement>(".cm-markra-link-source"),
        (element) => element.textContent,
      ).join(""),
    ).toBe("[](https://example.test)");
    expect(view.dom.querySelector(".cm-markra-link-icon")).toBeNull();
  });

  it("keeps complete link source visible while dragging from its label", () => {
    const doc = "Before [synthetic](https://example.test) after";
    const anchor = doc.indexOf("synthetic") + 2;
    const view = createView({ doc, anchor });

    view.dispatch({
      selection: EditorSelection.range(anchor, anchor + 4),
    });

    expect(renderedLines(view)[0]).toBe(doc);
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
  });

  it("keeps a completed link in source mode until Enter moves the caret away", () => {
    const markdown = "[label](https://example.test)";
    const view = createView({ doc: "", anchor: 0 });

    view.dispatch({
      changes: { from: 0, insert: markdown },
      selection: { anchor: markdown.length },
      userEvent: "input",
    });

    expect(renderedLines(view)[0]).toBe(markdown);

    view.dispatch({
      changes: { from: markdown.length, insert: "\n" },
      selection: { anchor: markdown.length + 1 },
      userEvent: "input",
    });

    expect(renderedLines(view)[0]).toBe("label");
    expect(view.dom.querySelector(".cm-markra-link-icon")).not.toBeNull();
  });

  it("renders an existing link when the initial caret is at its end", () => {
    const doc = "[label](https://example.test)";
    const view = createView({ doc, anchor: doc.length });

    expect(renderedLines(view)[0]).toBe("label");
    expect(view.dom.querySelector(".cm-markra-link")).not.toBeNull();
  });

  it("does not preview an incomplete image label as a shortcut link", () => {
    const view = createView({ doc: "", anchor: 0 });

    view.dispatch({
      changes: { from: 0, insert: "![a]" },
      selection: { anchor: 4 },
    });

    expect(renderedLines(view)).toEqual(["![a]"]);
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-link-icon")).toBeNull();
  });

  it("keeps an unfinished image destination fully visible while typing", () => {
    const doc = "![a](https://images.example.test/mock.jpg?w=1280&h=960";
    const view = createView({ doc, anchor: doc.length });

    expect(renderedLines(view)).toEqual([doc]);
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
  });

  it("renders reference-style links and reveals their complete source when edited", () => {
    const doc = [
      "Read [guide][docs].",
      "",
      "[docs]: https://example.test",
      "",
      "Edit",
    ].join("\n");
    const view = createView({ doc });

    expect(renderedLines(view)[0]).toBe("Read guide.");
    expect(renderedLines(view)[2]).toBe("[docs]: https://example.test");
    expect(
      view.dom.querySelector(".cm-markra-link")?.getAttribute("href"),
    ).toBe("https://example.test");

    view.dispatch({ selection: { anchor: doc.indexOf("guide") + 2 } });

    expect(renderedLines(view)[0]).toBe("Read [guide][docs].");
  });

  it("styles rendered links and blockquotes", () => {
    const doc = "> Read [reference](https://example.test)\n\nEdit";
    const view = createView({ doc });

    expect(renderedLines(view)[0]).toBe("Read reference");
    expect(view.dom.querySelector(".cm-markra-link")?.textContent).toBe(
      "reference",
    );
    expect(view.dom.querySelector(".cm-markra-link")?.tagName).toBe("A");
    expect(
      view.dom.querySelector(".cm-markra-link")?.getAttribute("href"),
    ).toBe("https://example.test");
    expect(view.dom.querySelector(".cm-markra-blockquote")).not.toBeNull();
  });

  it("does not create a navigable anchor for an unsafe link target", () => {
    const doc = "Read [unsafe](javascript:noop)\n\nEdit";
    const view = createView({ doc });
    const rendered = view.dom.querySelector(".cm-markra-link");

    expect(rendered?.textContent).toBe("unsafe");
    expect(rendered?.tagName).not.toBe("A");
    expect(rendered?.hasAttribute("href")).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("renders an anchor for a target allowed by a custom link resolver", () => {
    const doc = "Read [doc](FILE:///attachments/Doc.pdf)\n\nEdit";
    const view = createView({
      doc,
      extensions: [
        liveMarkdown({
          resolveLinkTarget: ({ source }) =>
            source.startsWith("FILE:") ? source : null,
        }),
      ],
    });
    const rendered = view.dom.querySelector(".cm-markra-link");

    expect(rendered?.textContent).toBe("doc");
    expect(rendered?.tagName).toBe("A");
    expect(rendered?.getAttribute("href")).toBe("FILE:///attachments/Doc.pdf");
  });

  it("renders a plain span when the custom link resolver rejects a target", () => {
    const doc = "Read [site](https://example.test)\n\nEdit";
    const view = createView({
      doc,
      extensions: [liveMarkdown({ resolveLinkTarget: () => null })],
    });
    const rendered = view.dom.querySelector(".cm-markra-link");

    expect(rendered?.textContent).toBe("site");
    expect(rendered?.tagName).not.toBe("A");
    expect(rendered?.hasAttribute("href")).toBe(false);
  });

  it("enables and renders GFM strikethrough by default", () => {
    const doc = "Keep ~~old~~ new\n\nEdit";
    const view = createView({ doc });

    expect(renderedLines(view)[0]).toBe("Keep old new");
    expect(
      view.dom.querySelector(".cm-markra-strikethrough")?.textContent,
    ).toBe("old");
  });

  it("keeps Markra highlight syntax rendered while its text is selected", () => {
    const doc = "Active\n\nBefore ==marked== after";
    const view = createView({ doc, anchor: 0 });

    expect(view.dom.querySelector(".cm-markra-highlight")?.textContent).toBe(
      "marked",
    );
    expect(view.dom.textContent).not.toContain("==marked==");

    const from = doc.indexOf("marked");
    view.dispatch({ selection: EditorSelection.range(from, from + 6) });
    expect(view.dom.textContent).not.toContain("==marked==");
    expect(view.dom.querySelector(".cm-markra-highlight")?.textContent).toBe(
      "marked",
    );
  });

  it("keeps preview text and blank rows stable during a range selection", () => {
    const doc = [
      "Before **bold** and [label](https://example.test/long-target) after",
      "",
      "- Synthetic item",
    ].join("\n");
    const view = createView({ doc });
    const before = renderedLines(view);

    view.dispatch({ selection: EditorSelection.range(0, doc.length) });

    expect(renderedLines(view)).toEqual(before);
    expect(view.dom.querySelectorAll(".cm-markra-empty-line")).toHaveLength(1);
    expect(paragraphEndStates(view)).toEqual([true, false]);
  });

  it("keeps all empty lines stable across recreation", () => {
    const doc = "Before\n\n\nAfter";
    const emptyLineCount = (view: EditorView) =>
      view.dom.querySelectorAll(".cm-markra-empty-line").length;
    const firstView = createView({ doc, anchor: 0 });

    expect(emptyLineCount(firstView)).toBe(2);

    firstView.dispatch({
      selection: EditorSelection.cursor("Before\n".length),
      userEvent: "select.pointer",
    });
    expect(emptyLineCount(firstView)).toBe(2);

    const recreatedView = createView({ doc, anchor: doc.length });
    expect(emptyLineCount(recreatedView)).toBe(2);
  });

  it("allows the cursor to remain on an internal blank line", () => {
    const doc = "Before\n\nAfter";
    const view = createView({ doc, anchor: doc.length });
    expect(paragraphEndStates(view)).toEqual([true, false]);

    view.dispatch({ selection: EditorSelection.cursor("Before\n".length) });

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe("Before\n".length);
    expect(view.dom.querySelectorAll(".cm-markra-empty-line")).toHaveLength(1);
    expect(paragraphEndStates(view)).toEqual([true, false]);
  });

  it("adds paragraph spacing without resizing authored blank lines", () => {
    const view = createView({ doc: "First\nSecond\n\n\nAfter" });

    expect(view.dom.querySelectorAll(".cm-markra-empty-line")).toHaveLength(2);
    expect(paragraphEndStates(view)).toEqual([false, true, false]);
  });

  it("adds paragraph spacing when another block starts directly", () => {
    const view = createView({ doc: "Before\n# Heading" });

    expect(paragraphEndStates(view)).toEqual([true]);
  });

  it("keeps a trailing editing line free from paragraph spacing", () => {
    const doc = "Before\n";
    const view = createView({ doc });

    expect(paragraphEndStates(view)).toEqual([false]);

    view.dispatch({ changes: { from: doc.length, insert: " " } });

    expect(paragraphEndStates(view)).toEqual([false]);

    view.dispatch({
      changes: { from: view.state.doc.length, insert: "After" },
    });

    expect(paragraphEndStates(view)).toEqual([false, false]);
  });

  it("updates paragraph layout when a blank line becomes content", () => {
    const doc = "Before\n\nAfter";
    const position = "Before\n".length;
    const view = createView({ doc, anchor: position });

    expect(paragraphEndStates(view)).toEqual([true, false]);

    view.dispatch({
      changes: { from: position, insert: "Middle" },
      selection: EditorSelection.cursor(position + "Middle".length),
    });

    expect(view.state.doc.toString()).toBe("Before\nMiddle\nAfter");
    expect(paragraphEndStates(view)).toEqual([false, false, false]);
  });

  it("does not rebuild preview decorations while a range endpoint moves", () => {
    const doc = "First synthetic paragraph\n\nSecond synthetic paragraph";
    const view = createView({
      doc,
      selection: EditorSelection.range(0, 5),
    });

    syntaxTreeIterations.splice(0);
    view.dispatch({ selection: EditorSelection.range(0, doc.length) });

    expect(syntaxTreeIterations).toHaveLength(0);
  });

  it("maps existing preview decorations while typing plain text", () => {
    const doc = [
      "# Synthetic heading",
      "",
      "- Synthetic list item",
      "",
      "Edit here",
    ].join("\n");
    const view = createView({ doc, anchor: doc.length });

    syntaxTreeIterations.splice(0);
    view.dispatch({
      changes: { from: doc.length, insert: "字" },
      selection: EditorSelection.cursor(doc.length + 1),
      userEvent: "input.type",
    });

    expect(syntaxTreeIterations).toHaveLength(0);
    expect(view.dom.querySelector(".cm-markra-h1")?.textContent).toBe(
      "Synthetic heading",
    );
    expect(renderedLines(view).at(-1)).toBe("Edit here字");

    syntaxTreeIterations.splice(0);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "*" },
      selection: EditorSelection.cursor(view.state.doc.length + 1),
      userEvent: "input.type",
    });

    expect(syntaxTreeIterations.length).toBeGreaterThan(0);
  });

  it("reveals heading source at every heading cursor in a multi-selection", () => {
    const doc = "# One\n\n# Two\n\nRest";
    const selection = EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(doc.indexOf("Two") + 1),
    ]);
    const view = createView({ doc, selection });

    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.ranges).toHaveLength(2);
    expect(renderedLines(view)).toEqual(["# One", "", "# Two", "", "Rest"]);
  });

  it("provides the view and syntax node name to custom reveal policies", () => {
    const contexts: Array<{ view: EditorView; nodeName: string }> = [];
    const view = createView({
      extensions: [
        liveMarkdown({
          reveal(context) {
            contexts.push({
              view: context.view,
              nodeName: context.nodeName,
            });
            return false;
          },
        }),
      ],
    });

    expect(contexts.some((context) => context.view === view)).toBe(true);
    expect(contexts.some((context) => context.nodeName === "HeaderMark")).toBe(
      true,
    );
  });

  it("limits syntax-tree traversal to CodeMirror's visible ranges", () => {
    syntaxTreeIterations.splice(0);
    const doc = Array.from(
      { length: 500 },
      (_, index) => `## Synthetic heading ${index}`,
    ).join("\n\n");
    const view = createView({ doc });
    const expectedRanges = view.visibleRanges.map(({ from, to }) => ({
      from,
      to,
    }));

    expect(expectedRanges.length).toBeGreaterThan(0);
    expect(syntaxTreeIterations.slice(-expectedRanges.length)).toEqual(
      expectedRanges,
    );
  });

  it("rebuilds decorations when the background parser advances", () => {
    const doc = Array.from(
      { length: 4_000 },
      (_, index) => `## Deferred heading ${index}\n\n**value-${index}**`,
    ).join("\n\n");
    const view = createView({ doc });

    syntaxTreeIterations.splice(0);
    expect(forceParsing(view, doc.length, 1_000)).toBe(true);
    expect(syntaxTreeIterations.length).toBeGreaterThan(0);
  });

  it("does not rebuild syntax decorations during an active composition", async () => {
    const doc = "## Synthetic title\n\nCompose";
    const view = createView({ doc });
    const inputLine = view.dom.querySelectorAll<HTMLElement>(".cm-line")[2];
    if (!inputLine) throw new Error("Expected the synthetic input line");

    syntaxTreeIterations.splice(0);
    view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", {
        bubbles: true,
        data: "",
      }),
    );
    inputLine.append("中");
    view.contentDOM.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "中",
        inputType: "insertCompositionText",
      }),
    );

    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe(`${doc}中`);
    });

    expect(view.composing).toBe(true);
    expect(syntaxTreeIterations).toHaveLength(0);

    view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "中",
      }),
    );

    await vi.waitFor(() => {
      expect(view.composing).toBe(false);
      expect(syntaxTreeIterations.length).toBeGreaterThan(0);
    });
  });

  it("hides CodeMirror's drawn selection while an IME composition is active", () => {
    const view = createView({
      doc: "Compose",
      selection: EditorSelection.range(0, 3),
      extensions: [drawSelection(), liveMarkdown()],
    });
    const selectionLayer = view.dom.querySelector<HTMLElement>(
      ".cm-selectionLayer",
    );
    if (!selectionLayer) throw new Error("Expected CodeMirror's selection layer");

    const selectionBackground = document.createElement("div");
    selectionBackground.className = "cm-selectionBackground";
    selectionLayer.append(selectionBackground);

    expect(getComputedStyle(selectionBackground).backgroundColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );

    view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    expect(view.dom.dataset.markraComposing).toBe("true");
    expect(getComputedStyle(selectionBackground).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );

    view.contentDOM.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    expect(view.dom.dataset.markraComposing).toBeUndefined();
    expect(getComputedStyle(selectionBackground).backgroundColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("renders task markers as checkboxes that update the Markdown source", () => {
    const doc = "- [ ] Ship mock release\n\nEdit";
    const view = createView({ doc });
    const checkbox = view.dom.querySelector<HTMLInputElement>(
      ".cm-markra-task-checkbox",
    );

    expect(checkbox).not.toBeNull();
    expect(checkbox?.checked).toBe(false);
    expect(renderedLines(view)[0]).toBe("Ship mock release");

    checkbox?.click();

    expect(view.state.doc.toString()).toBe("- [x] Ship mock release\n\nEdit");
    expect(
      view.dom.querySelector<HTMLInputElement>(".cm-markra-task-checkbox")
      ?.checked,
    ).toBe(true);
  });

  it("renders task markers as checkboxes when the task text is empty", () => {
    const view = createView({ doc: "- [ ]\n- [x]" });
    const checkboxes = Array.from(
      view.dom.querySelectorAll<HTMLInputElement>(".cm-markra-task-checkbox"),
    );

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);

    checkboxes[0]?.click();

    expect(view.state.doc.toString()).toBe("- [x]\n- [x]");
  });

  it("allows task checkbox rendering to be disabled", () => {
    const doc = "- [ ] Keep the marker visible\n\nEdit";
    const view = createView({
      doc,
      extensions: [liveMarkdown({ taskCheckboxes: false })],
    });

    expect(
      view.dom.querySelector(".cm-markra-task-checkbox"),
    ).toBeNull();
    expect(renderedLines(view)[0]).toBe("- [ ] Keep the marker visible");

    const emptyView = createView({
      doc: "- [x]",
      extensions: [liveMarkdown({ taskCheckboxes: false })],
    });
    expect(
      emptyView.dom.querySelector(".cm-markra-task-checkbox"),
    ).toBeNull();
    expect(renderedLines(emptyView)[0]).toBe("- [x]");
  });

  it("adds semantic classes without changing the Markdown document", () => {
    const view = createView();

    expect(view.dom.querySelector(".cm-markra-h1")).not.toBeNull();
    expect(view.dom.querySelector(".cm-markra-h1")?.getAttribute("role")).toBe(
      "heading",
    );
    expect(
      view.dom.querySelector(".cm-markra-h1")?.getAttribute("aria-level"),
    ).toBe("1");
    expect(
      view.dom.querySelector(".cm-markra-h1")?.getAttribute("aria-label"),
    ).toBe("Project notes");
    expect(view.dom.querySelector(".cm-markra-strong")?.textContent).toBe(
      "notes",
    );
    expect(view.state.doc.toString()).toBe(source);
  });

  it("adds document-layout semantics for paragraphs, blank lines, and lists", () => {
    const doc = [
      "# Synthetic title",
      "",
      "Synthetic paragraph",
      "",
      "- Bullet item",
      "- [ ] Task item",
      "1. Ordered item",
      "",
      "Edit here",
    ].join("\n");
    const view = createView({ doc, anchor: doc.length });
    const lines = [...view.dom.querySelectorAll<HTMLElement>(".cm-line")];

    expect(lines[1]?.classList.contains("cm-markra-empty-line")).toBe(true);
    expect(lines[2]?.classList.contains("cm-markra-paragraph")).toBe(true);
    expect(lines[4]?.classList.contains("cm-markra-list-item")).toBe(true);
    expect(lines[4]?.getAttribute("data-list-kind")).toBe("bullet");
    expect(lines[4]?.getAttribute("data-list-marker")).toBe("•");
    expect(lines[4]?.getAttribute("data-markra-list-source")).toBe("hidden");
    expect(lines[4]?.textContent).toBe("Bullet item");
    expect(lines[5]?.getAttribute("data-list-kind")).toBe("task");
    expect(lines[5]?.textContent).toBe("Task item");
    expect(lines[6]?.getAttribute("data-list-kind")).toBe("ordered");
    expect(lines[6]?.getAttribute("data-list-marker")).toBe("1.");
    expect(lines[6]?.textContent).toBe("Ordered item");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps list source markers hidden on the active list line", () => {
    const doc = "- First item\n- Second item\n\nEdit";
    const view = createView({ doc, anchor: doc.indexOf("First") });
    const lines = [...view.dom.querySelectorAll<HTMLElement>(".cm-line")];

    expect(lines[0]?.getAttribute("data-markra-list-source")).toBe("hidden");
    expect(lines[0]?.textContent).toBe("First item");
    expect(lines[1]?.getAttribute("data-markra-list-source")).toBe("hidden");
    expect(lines[1]?.textContent).toBe("Second item");
  });

  it("marks hidden list markers whose source is included in a range selection", () => {
    const doc = "- First item\n- Second item\n\nTail";
    const view = createView({
      doc,
      selection: EditorSelection.range(0, doc.length),
    });
    const listLines = () => [
      ...view.dom.querySelectorAll<HTMLElement>(".cm-markra-list-item"),
    ];

    expect(
      listLines().map((line) =>
        line.getAttribute("data-markra-list-marker-selected")
      ),
    ).toEqual(["true", "true"]);

    view.dispatch({
      selection: EditorSelection.range(doc.indexOf("First"), doc.length),
    });

    expect(
      listLines().map((line) =>
        line.getAttribute("data-markra-list-marker-selected")
      ),
    ).toEqual([null, "true"]);

    view.dispatch({ selection: EditorSelection.cursor(doc.length) });

    expect(
      listLines().map((line) =>
        line.getAttribute("data-markra-list-marker-selected")
      ),
    ).toEqual([null, null]);
  });

  it("preserves visual list depth without leaving source indentation in preview text", () => {
    const doc = [
      "- First bullet",
      "- Second bullet",
      "  - Nested bullet",
      "1. Ordered item",
      "- [ ] First task",
      "- [x] Second task",
      "",
      "Edit",
    ].join("\n");
    const view = createView({ doc, anchor: doc.length });
    const lines = [
      ...view.dom.querySelectorAll<HTMLElement>(".cm-markra-list-item"),
    ];

    expect(lines.map((line) => line.getAttribute("data-list-depth"))).toEqual([
      "0",
      "0",
      "1",
      "0",
      "0",
      "0",
    ]);
    expect(lines.map((line) => line.textContent)).toEqual([
      "First bullet",
      "Second bullet",
      "Nested bullet",
      "Ordered item",
      "First task",
      "Second task",
    ]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps blank source lines inside fenced code blocks at full line height", () => {
    const doc = [
      "~~~ts",
      "const first = 1;",
      "",
      "const second = 2;",
      "~~~",
      "",
      "Edit",
    ].join("\n");
    const view = createView({ doc, anchor: doc.length });
    const lines = [...view.dom.querySelectorAll<HTMLElement>(".cm-line")];

    expect(lines[2]?.classList.contains("cm-markra-empty-line")).toBe(false);
    expect(lines[5]?.classList.contains("cm-markra-empty-line")).toBe(true);
  });
});
