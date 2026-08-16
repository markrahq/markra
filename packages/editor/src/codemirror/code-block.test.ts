import { EditorSelection, EditorState } from "@codemirror/state";
import { forceParsing } from "@codemirror/language";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codeBlockPreviewPlugin, liveMarkdown } from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];
const codeDocument =
  "Before\n\n```ts\nconst answer = 42;\nreturn answer;\n```\n\nEdit";

function createView(
  doc = codeDocument,
  plugin = codeBlockPreviewPlugin(),
  focus = true,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        liveMarkdown({ plugins: [plugin] }),
      ],
      selection: { anchor: doc.length },
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
  return [...view.dom.querySelectorAll(".cm-line")].map(
    (line) => line.textContent ?? "",
  );
}

function decorationWidgetNames(view: EditorView) {
  const names: string[] = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    if (typeof source === "function") continue;
    source.between(0, view.state.doc.length, (_from, _to, decoration) => {
      const name = decoration.spec.widget?.constructor.name;
      if (name) names.push(name);
    });
  }
  return names;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("codeBlockPreviewPlugin", () => {
  it("renders a language header and code body while preserving Markdown", () => {
    const view = createView();
    const header = view.dom.querySelector<HTMLElement>(".cm-markra-code-header");

    expect(header?.textContent).toBe("ts");
    const headerFontFamily = header && getComputedStyle(header).fontFamily;
    expect(headerFontFamily).toContain("var(--font-ui");
    expect(headerFontFamily).toContain("Noto Sans SC Variable");
    expect(
      view.dom.querySelectorAll(".cm-markra-code-content-line"),
    ).toHaveLength(2);
    expect(
      view.dom.querySelector(".cm-markra-code-closing-line"),
    ).not.toBeNull();
    expect(renderedLines(view)).toContain("const answer = 42;");
    expect(view.state.doc.toString()).toBe(codeDocument);
  });

  it("keeps the visual code block chrome while editing its content", () => {
    const view = createView();

    view.dispatch({
      selection: { anchor: codeDocument.indexOf("answer =") + 2 },
    });

    expect(view.dom.querySelector(".cm-markra-code-header")?.textContent).toBe(
      "ts",
    );
    expect(renderedLines(view)).not.toContain("```ts");
    expect(renderedLines(view)).not.toContain("```");
    expect(renderedLines(view)).toContain("const answer = 42;");
    expect(
      view.dom
        .querySelector(".cm-markra-code-closing-line")
        ?.getAttribute("data-code-block-active"),
    ).toBe("true");
    expect(
      view.dom
        .querySelector(".cm-markra-code-header-line")
        ?.getAttribute("data-code-block-active"),
    ).toBeNull();
    expect(view.dom.querySelector(".markra-code-language-select")).not.toBeNull();
  });

  it("marks only the hovered code block for progressive control reveal", () => {
    const source = [
      "```sh",
      "first_command",
      "```",
      "",
      "Between blocks",
      "",
      "```python",
      "second_value = 2",
      "```",
    ].join("\n");
    const view = createView(source);
    const headers = [
      ...view.dom.querySelectorAll<HTMLElement>(
        ".cm-markra-code-header-line",
      ),
    ];
    const secondCodeLine = [
      ...view.dom.querySelectorAll<HTMLElement>(
        ".cm-markra-code-content-line",
      ),
    ].find((line) => line.textContent?.includes("second_value"));
    const paragraphLine = [...view.dom.querySelectorAll<HTMLElement>(".cm-line")]
      .find((line) => line.textContent === "Between blocks");

    secondCodeLine?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));

    expect(headers).toHaveLength(2);
    expect(headers[0]?.dataset.codeBlockHovered).toBeUndefined();
    expect(headers[1]?.dataset.codeBlockHovered).toBe("true");

    paragraphLine?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));

    expect(headers.every((header) =>
      header.dataset.codeBlockHovered === undefined
    )).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("uses measured top gaps for consecutive code blocks", () => {
    const source = [
      "```sh",
      "first_command",
      "```",
      "",
      "```python",
      "second_value = 2",
      "```",
    ].join("\n");
    const view = createView(source);
    const topGaps = [
      ...view.dom.querySelectorAll<HTMLElement>(".cm-markra-code-top-gap"),
    ];

    expect(topGaps).toHaveLength(2);
    expect(topGaps.map((gap) => getComputedStyle(gap).height)).toEqual([
      "12px",
      "12px",
    ]);
    expect(view.state.doc.toString()).toBe(source);
  });

  it("adds code block top chrome when background parsing catches up", () => {
    const prefix = Array.from(
      { length: 400 },
      (_, index) => `Synthetic paragraph ${index}.`,
    ).join("\n\n");
    const source = `${prefix}\n\n\`\`\`text\nSynthetic code\n\`\`\``;
    const view = createView(source);

    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("CodeBlockTopGapWidget");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps indented fence chrome on the folded opening line", () => {
    const source = [
      "  ```",
      "  https://example.test/folder/database.kdbx",
      "  ```",
    ].join("\n");
    const view = createView(source);
    const headerLine = view.dom.querySelector(".cm-markra-code-header-line");
    const language = view.dom.querySelector(".markra-code-language-select");

    expect(language?.closest(".cm-markra-code-header-line")).toBe(headerLine);
    expect(headerLine?.textContent).not.toContain("  ");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps a lone unfinished opening fence editable until Enter", () => {
    const source = "```";
    const view = createView(source);
    view.dispatch({ selection: { anchor: source.length } });

    expect(renderedLines(view)).toContain(source);
    expect(view.dom.querySelector(".cm-markra-code-header")).toBeNull();
    expect(view.dom.querySelector(".markra-code-language-select")).toBeNull();
  });

  it("moves a click on the folded closing line to an editable line after the fence", () => {
    const view = createView("```ts\nconst answer = 42;\n```");
    const closingLine = view.dom.querySelector<HTMLElement>(
      ".cm-markra-code-closing-line",
    );

    expect(closingLine).not.toBeNull();
    closingLine?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    view.dispatch(view.state.replaceSelection("Outside"));

    expect(view.state.doc.toString()).toBe(
      "```ts\nconst answer = 42;\n```\nOutside",
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("inserts a matching closing fence when Enter creates a code block", () => {
    const source = "```sh";
    const view = createView(source);
    view.dispatch({ selection: { anchor: source.length } });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("```sh\n\n```");
    expect(view.state.selection.main.head).toBe(source.length + 1);
  });

  it("unwraps a fenced block without joining its first code line backward", () => {
    const view = createView();
    const codeStart = codeDocument.indexOf("const answer");
    view.dispatch({ selection: { anchor: codeStart } });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Backspace",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "Before\n\nconst answer = 42;\nreturn answer;\n\nEdit",
    );
    expect(view.state.selection.main.head).toBe("Before\n\n".length);
  });

  it("unwraps multiple fenced blocks when every caret is at the first code line", () => {
    const source = "```ts\nfirst\n```\n\n```js\nsecond\n```";
    const view = createView(source);
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(source.indexOf("first")),
        EditorSelection.cursor(source.indexOf("second")),
      ]),
    });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Backspace",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe("first\n\nsecond");
    expect(view.state.selection.ranges.map((range) => range.head)).toEqual([
      0,
      "first\n\n".length,
    ]);
  });

  it("leaves a selected code range to the standard Backspace behavior", () => {
    const view = createView();
    const codeStart = codeDocument.indexOf("const answer");
    view.dispatch({
      selection: EditorSelection.range(codeStart, codeStart + "const".length),
    });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Backspace",
    }), "editor")).toBe(false);
    expect(view.state.doc.toString()).toBe(codeDocument);
  });

  it("exits after Enter on the trailing empty code line", () => {
    const source = "```sh\nfirst command\n\n```\nAfter";
    const trailingEmptyLine = source.indexOf("\n\n```") + 1;
    const view = createView(source);
    view.dispatch({ selection: { anchor: trailingEmptyLine } });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.selection.main.head).toBe(source.indexOf("After"));
  });

  it("exits when the trailing empty line was just inserted", () => {
    const source = "```sh\nfirst command\n```\nAfter";
    const view = createView(source);
    view.dispatch({
      selection: { anchor: source.indexOf("\n```") },
    });

    view.dispatch(view.state.replaceSelection("\n"));

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "```sh\nfirst command\n\n```\nAfter",
    );
    expect(view.state.selection.main.head).toBe(
      view.state.doc.toString().indexOf("After"),
    );
  });

  it("materializes an outside line when exiting a code block at document end", () => {
    const source = "```sh\nfirst command\n```";
    const view = createView(source);
    view.dispatch({
      selection: { anchor: source.indexOf("\n```") },
    });

    view.dispatch(view.state.replaceSelection("\n"));

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "```sh\nfirst command\n\n```\n",
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("closes and exits an unfinished code block after Enter on its final empty line", () => {
    const source = "```sh\nfirst command\n";
    const view = createView(source);
    view.dispatch({ selection: { anchor: source.length } });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }), "editor")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "```sh\nfirst command\n```\n",
    );
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("selects only the current code content on the first Mod+A", () => {
    const view = createView();
    view.dispatch({ selection: { anchor: codeDocument.indexOf("answer =") } });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "a",
    }), "editor")).toBe(true);
    expect(view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    )).toBe("const answer = 42;\nreturn answer;");
  });

  it("reuses cached highlighting when editing outside the code block", () => {
    const highlight = vi.fn(({ code, language }) => {
      expect(language).toBe("ts");
      expect(code).toContain("const answer");
      return [
        { className: "token-keyword", from: 0, to: 5 },
        { className: "token-number", from: 15, to: 17 },
      ];
    });
    const view = createView(
      codeDocument,
      codeBlockPreviewPlugin({ highlight }),
    );

    expect(view.dom.querySelector(".token-keyword")?.textContent).toBe("const");
    expect(view.dom.querySelector(".token-number")?.textContent).toBe("42");
    expect(highlight).toHaveBeenCalledOnce();

    view.dispatch({ selection: { anchor: codeDocument.length - 2 } });
    expect(highlight).toHaveBeenCalledOnce();

    view.dispatch({
      changes: { from: codeDocument.length, insert: "!" },
      selection: { anchor: codeDocument.length + 1 },
      userEvent: "input",
    });
    expect(highlight).toHaveBeenCalledOnce();
  });

  it("uses a configurable label for blocks without language info", () => {
    const view = createView(
      "```\nsynthetic code\n```\n\nEdit",
      codeBlockPreviewPlugin({ plainTextLabel: "Text" }),
    );

    expect(view.dom.querySelector(".cm-markra-code-header")?.textContent).toBe(
      "Text",
    );
  });

  it("keeps the final code line visible while a fence is unfinished", () => {
    const view = createView(
      "```ts\nconst value = 42;\n\nEdit",
      codeBlockPreviewPlugin(),
      false,
    );

    expect(view.dom.querySelector(".cm-markra-code-header")?.textContent).toBe(
      "ts",
    );
    expect(renderedLines(view)).toContain("const value = 42;");
    expect(
      view.dom.querySelector(".cm-markra-code-closing-line"),
    ).toBeNull();
  });

  it("changes the fenced language from the inline selector without touching code", () => {
    const view = createView();
    const language = view.dom.querySelector<HTMLSelectElement>(
      ".markra-code-language-select",
    );

    expect(language?.value).toBe("ts");
    expect(Array.from(language?.options ?? []).map((option) => option.value)).toEqual(
      expect.arrayContaining(["", "json", "ts", "tsx", "python"]),
    );
    if (language) language.value = "json";
    language?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(view.state.doc.toString()).toBe(
      codeDocument.replace("```ts", "```json"),
    );
    expect(view.dom.querySelector(".cm-markra-code-header")?.textContent).toContain(
      "json",
    );
  });

  it("keeps uncommon fenced languages available in the inline selector", () => {
    const view = createView("```synthetic-lang\nvalue\n```\n\nEdit");
    const language = view.dom.querySelector<HTMLSelectElement>(
      ".markra-code-language-select",
    );

    expect(language?.value).toBe("synthetic-lang");
    expect(Array.from(language?.options ?? []).map((option) => option.value)).toContain(
      "synthetic-lang",
    );
  });

  it("copies source code and exposes visual line numbers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = createView();
    const copy = view.dom.querySelector<HTMLButtonElement>(
      ".markra-code-copy-button",
    );
    const language = view.dom.querySelector<HTMLSelectElement>(
      ".markra-code-language-select",
    );

    expect(
      [...view.dom.querySelectorAll(".cm-markra-code-content-line")].map(
        (line) => line.getAttribute("data-code-line-number"),
      ),
    ).toEqual(["1", "2"]);
    expect(
      [...view.dom.querySelectorAll(".cm-markra-code-content-line")].map(
        (line) => line.getAttribute("data-code-line-numbers"),
      ),
    ).toEqual(["true", "true"]);
    expect(
      view.dom
        .querySelector(".cm-markra-code-top-gap")
        ?.getAttribute("data-code-line-numbers"),
    ).toBe("true");
    expect(
      view.dom
        .querySelector(".cm-markra-code-closing-line")
        ?.getAttribute("data-code-line-numbers"),
    ).toBe("true");
    expect(copy?.textContent).toBe("");
    expect(copy?.querySelector(".markra-code-copy-icon")).not.toBeNull();
    expect(copy?.querySelector(".markra-code-copy-check-icon")).not.toBeNull();
    expect(language?.closest(".markra-code-language-control")).not.toBeNull();
    expect(copy?.closest(".cm-markra-code-header-line")).not.toBeNull();
    expect(language?.closest(".cm-markra-code-header-actions")).not.toBeNull();
    expect(language?.closest(".cm-markra-code-header-line")).not.toBeNull();
    expect(language?.closest(".cm-markra-code-closing-line")).toBeNull();
    copy?.click();

    expect(writeText).toHaveBeenCalledWith(
      "const answer = 42;\nreturn answer;",
    );
    await vi.waitFor(() => {
      expect(copy?.getAttribute("aria-label")).toBe("Code copied");
      expect(copy?.dataset.copied).toBe("true");
      expect(copy?.textContent).toBe("");
    });
  });

  it("can hide visual code block line numbers", () => {
    const view = createView(
      codeDocument,
      codeBlockPreviewPlugin({ showLineNumbers: false }),
    );

    const contentLines = [
      ...view.dom.querySelectorAll(".cm-markra-code-content-line"),
    ];

    expect(contentLines.map(
      (line) => line.getAttribute("data-code-line-number"),
    )).toEqual([null, null]);
    expect(contentLines.map(
      (line) => line.getAttribute("data-code-line-numbers"),
    )).toEqual(["false", "false"]);
    expect(
      view.dom
        .querySelector(".cm-markra-code-top-gap")
        ?.getAttribute("data-code-line-numbers"),
    ).toBe("false");
    expect(
      view.dom
        .querySelector(".cm-markra-code-closing-line")
        ?.getAttribute("data-code-line-numbers"),
    ).toBe("false");
  });

  it("renders Mermaid as a preview and reveals its unchanged source on activation", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const renderMermaid = vi.fn().mockResolvedValue(
      '<svg aria-label="Synthetic diagram"></svg>',
    );
    const view = createView(
      source,
      codeBlockPreviewPlugin({ renderMermaid }),
    );

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-render svg")).not.toBeNull();
    });
    const preview = view.dom.querySelector<HTMLElement>(
      ".markra-mermaid-render",
    );
    const wrapper = preview?.closest<HTMLElement>(".markra-code-block");
    expect(getComputedStyle(wrapper!).display).toBe("inline-block");
    expect(getComputedStyle(wrapper!).marginTop).toBe("0px");
    expect(getComputedStyle(wrapper!).marginBottom).toBe("0px");
    expect(getComputedStyle(preview!).marginTop).toBe("0px");
    expect(getComputedStyle(preview!).marginBottom).toBe("0px");
    expect(getComputedStyle(preview!).paddingTop).toBe("0px");
    expect(getComputedStyle(preview!).paddingBottom).toBe("0px");
    expect(renderMermaid).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "flowchart TD\n  A --> B",
      }),
    );
    view.dom.querySelector<HTMLElement>(".markra-mermaid-render")?.click();

    expect(view.dom.querySelector(".markra-mermaid-render")).toBeNull();
    expect(renderedLines(view)).toContain("```mermaid");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("registers Mermaid preview when background parsing catches up", () => {
    const prefix = Array.from(
      { length: 400 },
      (_, index) => `Synthetic paragraph ${index}.`,
    ).join("\n\n");
    const source = `${prefix}\n\n\`\`\`mermaid\nflowchart TD\n  A --> B\n\`\`\`\n\nEdit`;
    const renderMermaid = vi.fn().mockResolvedValue(
      '<svg aria-label="Synthetic diagram"></svg>',
    );
    const view = createView(
      source,
      codeBlockPreviewPlugin({ renderMermaid }),
    );

    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("MermaidPreviewWidget");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("removes empty zero-size Mermaid label nodes", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const view = createView(
      source,
      codeBlockPreviewPlugin({
        renderMermaid: async () => [
          "<svg>",
          '<g class="label"><foreignObject width="0" height="0"></foreignObject></g>',
          '<g class="label"><foreignObject width="32" height="24"><div>Visible</div></foreignObject></g>',
          "</svg>",
        ].join(""),
      }),
    );

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-render svg")).not.toBeNull();
    });

    expect(
      view.dom.querySelector(
        '.markra-mermaid-render foreignObject[width="0"][height="0"]',
      ),
    ).toBeNull();
    expect(view.dom.querySelector(".markra-mermaid-render")?.textContent)
      .toContain("Visible");
  });

  it("keeps an unchanged Mermaid preview mounted when editing after it", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const renderMermaid = vi.fn().mockResolvedValue(
      '<svg aria-label="Synthetic diagram"></svg>',
    );
    const view = createView(
      source,
      codeBlockPreviewPlugin({ renderMermaid }),
    );

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-render svg")).not.toBeNull();
    });
    const preview = view.dom.querySelector(".markra-mermaid-render");
    expect(renderMermaid).toHaveBeenCalledOnce();

    view.dispatch({
      changes: { from: source.length, insert: "!" },
      selection: { anchor: source.length + 1 },
      userEvent: "input",
    });

    await Promise.resolve();
    expect(renderMermaid).toHaveBeenCalledOnce();
    expect(view.dom.querySelector(".markra-mermaid-render")).toBe(preview);
  });

  it("keeps an unchanged Mermaid preview mounted when editing before it", async () => {
    const source = "Before\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nAfter";
    const renderMermaid = vi.fn().mockResolvedValue(
      '<svg aria-label="Synthetic diagram"></svg>',
    );
    const view = createView(
      source,
      codeBlockPreviewPlugin({ renderMermaid }),
    );

    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-render svg")).not.toBeNull();
    });
    const preview = view.dom.querySelector(".markra-mermaid-render");
    expect(renderMermaid).toHaveBeenCalledOnce();

    const inserted = "Expanded synthetic prefix. ";
    view.dispatch({
      changes: { from: 0, insert: inserted },
      selection: { anchor: inserted.length },
      userEvent: "input",
    });

    await Promise.resolve();
    expect(renderMermaid).toHaveBeenCalledOnce();
    expect(view.dom.querySelector(".markra-mermaid-render")).toBe(preview);

    view.dom.querySelector<HTMLElement>(".markra-mermaid-render")?.click();
    expect(view.dom.querySelector(".markra-mermaid-render")).toBeNull();
  });

  it("returns active Mermaid source to preview mode with Escape", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const view = createView(
      source,
      codeBlockPreviewPlugin({
        renderMermaid: async () => "<svg></svg>",
      }),
    );
    view.dispatch({ selection: { anchor: source.indexOf("A --> B") } });
    expect(view.dom.querySelector(".markra-mermaid-render")).toBeNull();

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Escape",
    }), "editor")).toBe(true);
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-render svg")).not.toBeNull();
    });
    expect(view.state.doc.toString()).toBe(source);
  });

  it("keeps Mermaid source visible while selecting from inside the code block", () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const view = createView(source);
    const anchor = source.indexOf("flowchart");
    const head = source.indexOf("B");

    view.dispatch({ selection: { anchor } });
    expect(view.dom.querySelector(".markra-mermaid-render")).toBeNull();

    view.dispatch({ selection: { anchor, head } });

    expect(view.state.selection.main.empty).toBe(false);
    expect(view.dom.querySelector(".markra-mermaid-render")).toBeNull();
    expect(renderedLines(view)).toContain("flowchart TD");
    expect(renderedLines(view)).toContain("  A --> B");
  });

  it("opens, zooms, pans, and resets an enlarged Mermaid preview", async () => {
    const source = "```mermaid\nflowchart TD\n  A --> B\n```\n\nEdit";
    const view = createView(
      source,
      codeBlockPreviewPlugin({
        renderMermaid: async () => '<svg aria-label="Synthetic diagram"></svg>',
      }),
    );
    await vi.waitFor(() => {
      expect(view.dom.querySelector(".markra-mermaid-zoom-button")).not.toBeNull();
    });

    const zoomButton = view.dom.querySelector<HTMLButtonElement>(
      ".markra-mermaid-zoom-button",
    );
    const preview = view.dom.querySelector<HTMLElement>(".markra-mermaid-render");
    expect(
      zoomButton?.closest<HTMLElement>(".markra-code-block")?.dataset.mermaidMode,
    ).toBe("preview");
    expect(zoomButton?.parentElement).not.toBe(preview);
    const zoomIcon = zoomButton?.querySelector(".markra-mermaid-zoom-icon");
    const iconPaths = (icon: Element | null | undefined) => (
      Array.from(icon?.querySelectorAll("path") ?? [])
        .map((path) => path.getAttribute("d"))
    );
    expect(zoomIcon).not.toBeNull();
    expect(iconPaths(zoomIcon)).toEqual([
      "M15 3h6v6",
      "m21 3-7 7",
      "M9 21H3v-6",
      "m3 21 7-7",
    ]);
    expect(zoomButton?.textContent).toBe("");

    zoomButton?.click();
    const dialog = document.querySelector<HTMLElement>(
      ".markra-media-viewer-dialog",
    );
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.querySelector("svg")).not.toBeNull();
    for (const className of [
      ".markra-media-viewer-zoom-out-button",
      ".markra-media-viewer-zoom-in-button",
      ".markra-media-viewer-reset-button",
      ".markra-media-viewer-fullscreen-button",
      ".markra-media-viewer-close-button",
    ]) {
      const button = dialog?.querySelector<HTMLButtonElement>(className);
      expect(button?.querySelector("svg")).not.toBeNull();
      expect(button?.textContent).toBe("");
    }
    const fullscreenIcon = dialog?.querySelector(
      ".markra-media-viewer-fullscreen-icon",
    );
    expect(iconPaths(fullscreenIcon)).toEqual([
      "M8 3H5a2 2 0 0 0-2 2v3",
      "M21 8V5a2 2 0 0 0-2-2h-3",
      "M3 16v3a2 2 0 0 0 2 2h3",
      "M16 21h3a2 2 0 0 0 2-2v-3",
    ]);
    dialog?.querySelector<HTMLButtonElement>(".markra-media-viewer-zoom-in-button")?.click();
    expect(
      dialog?.querySelector<HTMLElement>(".markra-media-viewer-canvas")?.style.transform,
    ).toContain("scale(1.25)");

    const content = dialog?.querySelector<HTMLElement>(
      ".markra-media-viewer-content",
    );
    const canvas = dialog?.querySelector<HTMLElement>(
      ".markra-media-viewer-canvas",
    );
    content?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 80,
      pointerId: 9,
    }));
    content?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 132,
      clientY: 96,
      pointerId: 9,
    }));
    expect(content?.dataset.dragging).toBe("true");
    expect(canvas?.style.transform).toContain("translate(32px, 16px)");
    content?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      pointerId: 9,
    }));
    expect(content?.dataset.dragging).toBeUndefined();

    dialog?.querySelector<HTMLButtonElement>(".markra-media-viewer-reset-button")?.click();
    expect(canvas?.style.transform).toBe("translate(0px, 0px) scale(1)");

    const fullscreen = dialog?.querySelector<HTMLButtonElement>(
      ".markra-media-viewer-fullscreen-button",
    );
    fullscreen?.click();
    expect(dialog?.dataset.fullscreen).toBe("true");
    expect(fullscreen?.ariaPressed).toBe("true");
    expect(fullscreen?.ariaLabel).toBe("Exit full screen");
    expect(iconPaths(dialog?.querySelector(".markra-media-viewer-fullscreen-icon"))).toEqual([
      "M8 3v3a2 2 0 0 1-2 2H3",
      "M21 8h-3a2 2 0 0 1-2-2V3",
      "M3 16h3a2 2 0 0 1 2 2v3",
      "M16 21v-3a2 2 0 0 1 2-2h3",
    ]);

    fullscreen?.click();
    expect(dialog?.dataset.fullscreen).toBeUndefined();
    expect(fullscreen?.ariaPressed).toBe("false");
    expect(fullscreen?.ariaLabel).toBe("Enter full screen");

    fullscreen?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(document.querySelector(".markra-media-viewer-dialog")).toBe(dialog);
    expect(dialog?.dataset.fullscreen).toBeUndefined();
    expect(fullscreen?.ariaPressed).toBe("false");
    expect(fullscreen?.ariaLabel).toBe("Enter full screen");

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(document.querySelector(".markra-media-viewer-dialog")).toBeNull();
  });
});
