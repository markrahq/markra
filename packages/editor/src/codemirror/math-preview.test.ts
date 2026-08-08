import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMarkdown, mathPreviewPlugin } from "./index.ts";
import { codeMirrorVimModeChangedEffect } from "./vim.ts";
import "./dom.test-support.ts";

const syntaxTreeIterations = vi.hoisted(
  (): Array<{ from: number | undefined; to: number | undefined }> => [],
);
const syntaxTreeProxies = vi.hoisted(() => new WeakMap<object, object>());
const mathRenderCalls = vi.hoisted((): string[] => []);

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();

  return {
    ...actual,
    syntaxTree(state: Parameters<typeof actual.syntaxTree>[0]) {
      const tree = actual.syntaxTree(state);
      const cached = syntaxTreeProxies.get(tree);
      if (cached) return cached as typeof tree;

      const proxy = new Proxy(tree, {
        get(target, property, receiver) {
          if (property !== "iterate") return Reflect.get(target, property, receiver);
          return (spec: Parameters<typeof tree.iterate>[0]) => {
            syntaxTreeIterations.push({ from: spec.from, to: spec.to });
            return target.iterate(spec);
          };
        },
      });
      syntaxTreeProxies.set(tree, proxy);
      return proxy;
    },
  };
});

vi.mock("../math-render.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../math-render.ts")>();
  return {
    ...actual,
    renderMarkraMathToString(
      ...args: Parameters<typeof actual.renderMarkraMathToString>
    ) {
      mathRenderCalls.push(args[0]);
      return actual.renderMarkraMathToString(...args);
    },
  };
});

const views: EditorView[] = [];

function decorationRanges(view: EditorView, widgetName: string) {
  const ranges: Array<{
    block: boolean;
    estimatedHeight: number;
    from: number;
    to: number;
  }> = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    if (typeof source === "function") continue;
    source.between(0, view.state.doc.length, (from, to, decoration) => {
      if (decoration.spec.widget?.constructor.name !== widgetName) return;
      ranges.push({
        block: decoration.spec.block === true,
        estimatedHeight: decoration.spec.widget.estimatedHeight,
        from,
        to,
      });
    });
  }
  return ranges;
}

function createView(
  doc: string,
  anchor = doc.length,
  plugin = mathPreviewPlugin(),
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [plugin] })],
      selection: EditorSelection.cursor(anchor),
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  mathRenderCalls.splice(0);
  document.body.replaceChildren();
});

describe("mathPreviewPlugin", () => {
  it("replaces multiline display math with one block decoration", () => {
    const source = [
      "Before",
      "",
      "$$",
      String.raw`\frac{x + y}{z}`,
      "$$",
      "",
      "After",
    ].join("\n");
    const mathFrom = source.indexOf("$$");
    const mathTo = source.lastIndexOf("$$") + 2;
    const view = createView(source);

    expect(decorationRanges(view, "MathWidget")).toContainEqual({
      block: true,
      estimatedHeight: 78,
      from: mathFrom,
      to: mathTo,
    });
    expect(view.dom.querySelector(".cm-markra-math-hidden-line")).toBeNull();
  });

  it("does not rebuild every math decoration when the viewport scrolls", async () => {
    const doc = Array.from(
      { length: 200 },
      (_, index) => `Synthetic formula ${index}: $x_${index}$.`,
    ).join("\n\n");
    const view = createView(doc);
    mathRenderCalls.splice(0);
    syntaxTreeIterations.splice(0);

    view.scrollDOM.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mathRenderCalls).toHaveLength(0);
    expect(
      syntaxTreeIterations.filter(
        ({ from, to }) => from === undefined && to === undefined,
      ),
    ).toHaveLength(0);
  });

  it("reuses rendered formulas for selection-only reveal updates", () => {
    const doc = Array.from(
      { length: 200 },
      (_, index) => `Synthetic formula ${index}: $x_${index}$.`,
    ).join("\n\n");
    const firstFormula = doc.indexOf("$x_0$") + 1;
    const view = createView(doc);
    mathRenderCalls.splice(0);

    view.dispatch({ selection: EditorSelection.cursor(firstFormula) });

    expect(mathRenderCalls).toHaveLength(0);
  });

  it("does not rescan math when plain text changes after it", () => {
    const doc = "Before $x + y$ after\n\nEdit";
    const view = createView(doc);
    syntaxTreeIterations.splice(0);

    view.dispatch({
      changes: { from: doc.length, insert: "!" },
      selection: { anchor: doc.length + 1 },
      userEvent: "input",
    });

    expect(
      syntaxTreeIterations.filter(
        ({ from, to }) => from === undefined && to === undefined,
      ),
    ).toHaveLength(1);
  });

  it("rescans when removing a code fence exposes math syntax", () => {
    const doc = "```\n$x + y$\n```\n\nEdit";
    const view = createView(doc);
    const closingFenceFrom = doc.lastIndexOf("```");

    expect(view.dom.querySelector(".markra-math-render")).toBeNull();
    view.dispatch({
      changes: [
        { from: 0, to: "```\n".length },
        { from: closingFenceFrom, to: closingFenceFrom + "```\n".length },
      ],
    });

    expect(view.dom.querySelector(".markra-math-render")).not.toBeNull();
  });

  it("renders dollar and Hugo math with KaTeX without changing Markdown", () => {
    const doc = [
      "Where $a^2 + b^2 = c^2$.",
      "",
      "$$",
      String.raw`\int_0^1 x^2 \, dx`,
      "$$",
      "",
      String.raw`\[ E = mc^2 \]`,
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);

    expect(view.dom.querySelectorAll(".markra-math-render-inline .katex")).toHaveLength(1);
    expect(view.dom.querySelectorAll(".markra-math-render-display .katex")).toHaveLength(2);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps inline code, escaped dollars, currency, and unfinished math as source", () => {
    const doc = "Use \\$literal, $100, `$code$`, and unfinished $value.";
    const view = createView(doc);

    expect(view.dom.querySelector(".markra-math-render")).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("reveals source when selected and activates rendered math from the widget", () => {
    const doc = "Before $x + y$ after\n\nEdit";
    const mathFrom = doc.indexOf("$x");
    const view = createView(doc);
    const widget = view.dom.querySelector<HTMLElement>(".markra-math-render-inline");

    expect(widget).not.toBeNull();
    widget?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(view.state.selection.main.head).toBeGreaterThan(mathFrom);
    expect(view.state.selection.main.head).toBeLessThan(mathFrom + "$x + y$".length);
    expect(view.dom.querySelector(".markra-math-render-inline")).toBeNull();
    expect(view.dom.textContent).toContain("$x + y$");
  });

  it("reveals source when a Vim normal cursor targets a math boundary", () => {
    const doc = "$x^2$";
    const view = createView(doc);

    view.scrollDOM.classList.add("cm-vimMode");
    view.dispatch({
      effects: codeMirrorVimModeChangedEffect.of(true),
      selection: EditorSelection.cursor(0),
    });

    expect(view.dom.querySelector(".markra-math-render-inline")).toBeNull();
    expect(view.dom.textContent).toContain(doc);
  });

  it("renders math when a Vim cursor targets the next character", () => {
    const doc = "$x^2$ tail";
    const view = createView(doc);

    view.scrollDOM.classList.add("cm-vimMode");
    view.dispatch({
      effects: codeMirrorVimModeChangedEffect.of(true),
      selection: EditorSelection.cursor(doc.indexOf(" tail")),
    });

    expect(view.dom.querySelector(".markra-math-render-inline")).not.toBeNull();
  });

  it("keeps math source visible while dragging from inside it", () => {
    const doc = "Before $x + y$ after\n\nEdit";
    const anchor = doc.indexOf("x");
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(anchor) });
    view.dispatch({ selection: EditorSelection.range(anchor, anchor + 4) });

    expect(view.dom.querySelector(".markra-math-render-inline")).toBeNull();
    expect(view.dom.textContent).toContain("$x + y$");
  });

  it("keeps rendered math stable during a multi-line range selection", () => {
    const doc = "Before $x + y$ after\n\nAnother paragraph";
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.range(0, doc.length) });

    expect(view.dom.querySelector(".markra-math-render-inline")).not.toBeNull();
    expect(view.dom.textContent).not.toContain("$x + y$");
  });

  it("applies macro definitions to later formulas while folding definition-only blocks", () => {
    const doc = [
      "$$",
      String.raw`\newcommand{\RR}{\mathbb{R}}`,
      "$$",
      "",
      String.raw`Domain $\RR$.`,
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);

    expect(view.dom.querySelector(".markra-math-macro-fold")).not.toBeNull();
    expect(view.dom.querySelector(".markra-math-render-display")).toBeNull();
    expect(view.dom.querySelector(".markra-math-render-inline .mathbb")?.textContent).toContain("R");
    expect(view.state.doc.toString()).toBe(doc);
  });
});
