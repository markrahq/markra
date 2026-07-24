import { EditorState } from "@codemirror/state";
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
      extensions: [liveMarkdown({ plugins: [plugin] })],
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

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("codeBlockPreviewPlugin", () => {
  it("renders a language header and code body while preserving Markdown", () => {
    const view = createView();

    expect(view.dom.querySelector(".cm-markra-code-header")?.textContent).toBe(
      "ts",
    );
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
    expect(view.dom.querySelector(".markra-code-language-select")).not.toBeNull();
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

  it("accepts a cached host highlighter without bundling one", () => {
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
    expect(copy?.textContent).toBe("");
    expect(copy?.querySelector(".markra-code-copy-icon")).not.toBeNull();
    expect(copy?.querySelector(".markra-code-copy-check-icon")).not.toBeNull();
    expect(language?.closest(".markra-code-language-control")).not.toBeNull();
    expect(copy?.closest(".cm-markra-code-header-line")).not.toBeNull();
    expect(language?.closest(".cm-markra-code-closing-line")).not.toBeNull();
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
    expect(zoomButton?.querySelector(".markra-mermaid-zoom-icon")).not.toBeNull();
    expect(zoomButton?.textContent).toBe("");

    zoomButton?.click();
    const dialog = document.querySelector<HTMLElement>(
      ".markra-mermaid-zoom-dialog",
    );
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.querySelector("svg")).not.toBeNull();
    for (const className of [
      ".markra-mermaid-zoom-out-button",
      ".markra-mermaid-zoom-in-button",
      ".markra-mermaid-zoom-reset-button",
      ".markra-mermaid-zoom-close-button",
    ]) {
      const button = dialog?.querySelector<HTMLButtonElement>(className);
      expect(button?.querySelector("svg")).not.toBeNull();
      expect(button?.textContent).toBe("");
    }
    dialog?.querySelector<HTMLButtonElement>(".markra-mermaid-zoom-in-button")?.click();
    expect(
      dialog?.querySelector<HTMLElement>(".markra-mermaid-zoom-canvas")?.style.transform,
    ).toContain("scale(1.25)");

    const content = dialog?.querySelector<HTMLElement>(
      ".markra-mermaid-zoom-content",
    );
    const canvas = dialog?.querySelector<HTMLElement>(
      ".markra-mermaid-zoom-canvas",
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

    dialog?.querySelector<HTMLButtonElement>(".markra-mermaid-zoom-reset-button")?.click();
    expect(canvas?.style.transform).toBe("translate(0px, 0px) scale(1)");

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(document.querySelector(".markra-mermaid-zoom-dialog")).toBeNull();
  });
});
