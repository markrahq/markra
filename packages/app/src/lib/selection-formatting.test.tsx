import { render, waitFor } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}" data-testid="mock-mermaid"><g></g></svg>`
    }))
  }
}));

import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { MarkdownPaper } from "../components/MarkdownPaper";
import {
  clearSelectionFormattingInView,
  readSelectionFormattingActionsFromView,
  readSelectionFormattingStateFromView,
  setSelectionHeadingLevelInView,
  toggleSelectionLinkInView,
  toggleSelectionHighlightInView,
  type SelectionFormattingAction
} from "./selection-formatting";

async function renderEditor(initialContent: string) {
  let editor: Editor | null = null;
  const result = render(
    <MarkdownPaper
      initialContent={initialContent}
      onEditorReady={(instance) => {
        editor = instance;
      }}
      onMarkdownChange={() => {}}
      revision={0}
    />
  );

  await waitFor(() => expect(editor).not.toBeNull());

  return {
    ...result,
    view: editor!.action((ctx) => ctx.get(editorViewCtx))
  };
}

function findTextPosition(view: EditorView, text: string) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (position !== null) return false;
    if (!node.isText || !node.text) return;

    const textOffset = node.text.indexOf(text);
    if (textOffset === -1) return;

    position = nodePosition + textOffset;
    return false;
  });

  if (position === null) throw new Error(`Could not find text in editor: ${text}`);

  return position;
}

function selectText(view: EditorView, text: string) {
  const from = findTextPosition(view, text);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

function findBlockEndPosition(view: EditorView, typeName: string, text: string) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (position !== null) return false;
    if (node.type.name !== typeName || !node.textContent.includes(text)) return true;

    position = nodePosition + node.nodeSize;
    return false;
  });

  if (position === null) throw new Error(`Could not find ${typeName} block in editor: ${text}`);

  return position;
}

describe("selection formatting", () => {
  it.each([
    ["bold", "bold text", "bold"],
    ["italic", "italic text", "italic"],
    ["strikethrough", "strike text", "strikethrough"],
    ["inline code", "code text", "inlineCode"],
    ["highlight", "highlight text", "highlight"],
    ["link", "link text", "link"],
    ["heading", "Heading text", "heading1"],
    ["quote", "Quote text", "quote"],
    ["bullet list", "Bullet text", "bulletList"],
    ["ordered list", "Ordered text", "orderedList"]
  ] as const)("detects %s formatting at the current selection", async (_label, selectedText, action) => {
    const { view } = await renderEditor([
      "**bold text** *italic text* ~~strike text~~ `code text` [link text](https://example.test)",
      "==highlight text==",
      "",
      "# Heading text",
      "",
      "> Quote text",
      "",
      "- Bullet text",
      "",
      "1. Ordered text"
    ].join("\n"));

    selectText(view, selectedText);

    expect(readSelectionFormattingActionsFromView(view)).toContain(action satisfies SelectionFormattingAction);
  });

  it("reports the current heading level at the selection", async () => {
    const { view } = await renderEditor("## Heading text");

    selectText(view, "Heading text");

    expect(readSelectionFormattingStateFromView(view)).toMatchObject({
      headingLevel: 2
    });
  });

  it("reports the current heading level when the selection ends at the heading boundary", async () => {
    const { view } = await renderEditor("### Heading text\n\nParagraph text");
    const from = findTextPosition(view, "Heading text");
    const to = findBlockEndPosition(view, "heading", "Heading text");

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

    expect(readSelectionFormattingStateFromView(view)).toMatchObject({
      headingLevel: 3
    });
  });

  it("sets the selected heading level", async () => {
    const { view } = await renderEditor("## Heading text");

    selectText(view, "Heading text");

    expect(setSelectionHeadingLevelInView(view, 3)).toBe(true);
    expect(readSelectionFormattingStateFromView(view).headingLevel).toBe(3);
  });

  it("turns the selected paragraph into the chosen heading level", async () => {
    const { view } = await renderEditor("Paragraph text");

    selectText(view, "Paragraph text");

    expect(readSelectionFormattingStateFromView(view).headingLevel).toBeNull();

    expect(setSelectionHeadingLevelInView(view, 4)).toBe(true);
    expect(readSelectionFormattingStateFromView(view).headingLevel).toBe(4);
  });

  it("wraps selected inline text in highlight markers", async () => {
    const { view } = await renderEditor("Highlight this text");

    selectText(view, "this");

    expect(toggleSelectionHighlightInView(view)).toBe(true);
    expect(view.state.doc.textContent).toBe("Highlight ==this== text");
    expect(readSelectionFormattingActionsFromView(view)).toContain("highlight");
  });

  it("removes highlight markers around selected highlighted text", async () => {
    const { view } = await renderEditor("Highlight ==this== text");

    selectText(view, "this");

    expect(toggleSelectionHighlightInView(view)).toBe(true);
    expect(view.state.doc.textContent).toBe("Highlight this text");
    expect(readSelectionFormattingActionsFromView(view)).not.toContain("highlight");
  });

  it("removes link formatting from selected linked text", async () => {
    const { view } = await renderEditor("[Synthetic link](https://example.test/articles/about)");

    selectText(view, "Synthetic link");

    expect(readSelectionFormattingActionsFromView(view)).toContain("link");

    expect(toggleSelectionLinkInView(view)).toBe(true);

    expect(view.state.doc.textContent).toBe("Synthetic link");
    expect(readSelectionFormattingActionsFromView(view)).not.toContain("link");
  });

  it("clears mixed inline formatting from the selected text", async () => {
    const { view } = await renderEditor(
      "**Bold** *italic* ~~strike~~ `code` [link](https://example.test) ==highlight=="
    );
    const from = findTextPosition(view, "Bold");
    const to = findTextPosition(view, "highlight") + "highlight".length;

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

    expect(readSelectionFormattingActionsFromView(view)).toEqual(
      expect.arrayContaining(["bold", "italic", "strikethrough", "inlineCode", "link"])
    );
    expect(view.state.doc.textContent).toContain("==highlight==");

    expect(clearSelectionFormattingInView(view)).toBe(true);

    expect(view.state.doc.textContent).toBe("Bold italic strike code link highlight");
    expect(readSelectionFormattingActionsFromView(view)).toEqual([]);
  });
});
