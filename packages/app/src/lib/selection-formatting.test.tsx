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
import { readSelectionFormattingActionsFromView, type SelectionFormattingAction } from "./selection-formatting";

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

describe("selection formatting", () => {
  it.each([
    ["bold", "bold text", "bold"],
    ["italic", "italic text", "italic"],
    ["strikethrough", "strike text", "strikethrough"],
    ["inline code", "code text", "inlineCode"],
    ["link", "link text", "link"],
    ["heading", "Heading text", "heading1"],
    ["quote", "Quote text", "quote"],
    ["bullet list", "Bullet text", "bulletList"],
    ["ordered list", "Ordered text", "orderedList"]
  ] as const)("detects %s formatting at the current selection", async (_label, selectedText, action) => {
    const { view } = await renderEditor([
      "**bold text** *italic text* ~~strike text~~ `code text` [link text](https://example.test)",
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
});
