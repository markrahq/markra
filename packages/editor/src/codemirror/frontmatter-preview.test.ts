import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { frontmatterPreviewPlugin, liveMarkdown } from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [frontmatterPreviewPlugin()] })],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("frontmatterPreviewPlugin", () => {
  it.each([
    {
      kind: "yaml",
      source: ["---", "title: Synthetic", "---", "", "# Body"].join("\n"),
    },
    {
      kind: "toml",
      source: ["+++", 'title = "Synthetic"', "+++", "", "# Body"].join("\n"),
    },
    {
      kind: "json",
      source: [
        "{",
        '  "title": "Synthetic {draft}",',
        '  "meta": { "ready": true }',
        "}",
        "",
        "# Body",
      ].join("\n"),
    },
  ])("renders leading $kind metadata without changing source", ({ kind, source }) => {
    const view = createView(source);
    const preview = view.dom.querySelector<HTMLElement>(".cm-markra-frontmatter");
    const editor = preview?.querySelector<HTMLTextAreaElement>(
      ".cm-markra-frontmatter-editor",
    );

    expect(preview?.dataset.frontmatterKind).toBe(kind);
    expect(editor?.value).toContain("Synthetic");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("edits YAML inside the card without applying Markdown rendering", () => {
    const source = ["---", "title: Synthetic", "---", "", "# Body"].join("\n");
    const view = createView(source);
    const editor = view.dom.querySelector<HTMLTextAreaElement>(
      ".cm-markra-frontmatter-editor",
    );
    const label = view.dom.querySelector<HTMLElement>(
      ".cm-markra-frontmatter-label",
    );

    expect(editor?.value).toBe("title: Synthetic");
    expect(view.dom.querySelector(".cm-markra-frontmatter")).not.toBeNull();
    expect(label && getComputedStyle(label).fontFamily).toContain(
      "var(--font-ui",
    );
    expect(editor && getComputedStyle(editor).fontFamily).toContain("ui-monospace");
    expect(
      [...view.dom.querySelectorAll<HTMLElement>(".cm-markra-frontmatter-hidden-line")]
        .every((line) => getComputedStyle(line).display === "none"),
    ).toBe(true);

    if (editor) {
      editor.focus();
      editor.value = "title: Mock";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    expect(view.state.doc.toString()).toBe("---\ntitle: Mock\n---\n\n# Body");
    expect(view.dom.querySelectorAll(".cm-markra-h1")).toHaveLength(1);
    expect(view.dom.querySelector(".cm-markra-frontmatter-editor")).toBe(editor);
    expect(view.dom.ownerDocument.activeElement).toBe(editor);
  });

  it("ignores non-leading or malformed metadata", () => {
    const malformed = createView('{"title":"Synthetic",}\n\n# Body');
    const nonLeading = createView("# Intro\n\n---\ntitle: Synthetic\n---");
    expect(malformed.dom.querySelector(".cm-markra-frontmatter")).toBeNull();
    expect(nonLeading.dom.querySelector(".cm-markra-frontmatter")).toBeNull();
  });

  it("creates an editable YAML card when the opening delimiter is confirmed", () => {
    const view = createView("---");

    expect(
      runScopeHandlers(
        view,
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
        "editor",
      ),
    ).toBe(true);

    expect(view.state.doc.toString()).toBe("---\n\n---");
    expect(view.state.selection.main.head).toBe(4);
    expect(
      view.dom.querySelector<HTMLTextAreaElement>(".cm-markra-frontmatter-editor")
        ?.value,
    ).toBe("");
    expect(view.dom.ownerDocument.activeElement).toBe(
      view.dom.querySelector(".cm-markra-frontmatter-editor"),
    );
    expect(
      [...view.dom.querySelectorAll<HTMLElement>(".cm-markra-frontmatter-hidden-line")]
        .every((line) => getComputedStyle(line).display === "none"),
    ).toBe(true);
  });

  it("removes the entire card when all YAML content is deleted", () => {
    const source = ["---", "title: Synthetic", "---", "", "# Body"].join("\n");
    const view = createView(source);
    const editor = view.dom.querySelector<HTMLTextAreaElement>(
      ".cm-markra-frontmatter-editor",
    );
    editor?.focus();
    editor?.setSelectionRange(0, editor.value.length);
    const deletion = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    editor?.dispatchEvent(deletion);

    expect(deletion.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("# Body");
    expect(view.dom.querySelector(".cm-markra-frontmatter")).toBeNull();
    expect(view.dom.textContent).not.toContain("---");
  });

  it.each([
    { key: "Backspace", position: 1 },
    { key: "Backspace", position: 2 },
    { key: "Backspace", position: 3 },
    { key: "Delete", position: 0 },
    { key: "Delete", position: 1 },
    { key: "Delete", position: 2 },
  ])("removes the entire card with $key at a mapped card boundary", ({ key, position }) => {
    const source = ["---", "title: Synthetic", "---", "", "# Body"].join("\n");
    const view = createView(source);
    view.focus();
    view.dispatch({ selection: EditorSelection.cursor(position) });

    expect(
      runScopeHandlers(
        view,
        new KeyboardEvent("keydown", { bubbles: true, key }),
        "editor",
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe("# Body");
    expect(view.dom.textContent).not.toContain("--");
  });

  it("keeps metadata rendered during a multi-line range selection", () => {
    const source = ["---", "title: Synthetic", "---", "", "# Body"].join("\n");
    const view = createView(source);

    view.dispatch({ selection: EditorSelection.range(0, source.length) });

    expect(
      view.dom.querySelector<HTMLTextAreaElement>(".cm-markra-frontmatter-editor")
        ?.value,
    ).toContain("Synthetic");
  });

  it("wraps long metadata lines without widening the editor", () => {
    const source = [
      "---",
      `description: ${"synthetic-metadata".repeat(80)}`,
      "---",
      "",
      "# Body",
    ].join("\n");
    const view = createView(source);
    const preview = view.dom.querySelector<HTMLElement>(".cm-markra-frontmatter");
    const style = preview && getComputedStyle(preview);

    expect(style?.boxSizing).toBe("border-box");
    expect(style?.width).toBe("100%");
    expect(style?.whiteSpace).toBe("pre-wrap");
    expect(style?.overflowWrap).toBe("anywhere");
  });
});
