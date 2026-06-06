import { Schema, type NodeType } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  createListTogglePlugin,
  listItemCollapseInfo,
  setAllListItemsCollapsed
} from "./list-toggle";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block"
    },
    bullet_list: {
      content: "list_item+",
      group: "block"
    },
    ordered_list: {
      content: "list_item+",
      group: "block"
    },
    list_item: {
      content: "paragraph block*"
    },
    text: { group: "inline" }
  }
});

function paragraph(text: string) {
  return schema.node("paragraph", null, [schema.text(text)]);
}

function createDoc() {
  return schema.node("doc", null, [
    schema.node("bullet_list", null, [
      schema.node("list_item", null, [
        paragraph("First parent"),
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [paragraph("First child")])
        ])
      ]),
      schema.node("list_item", null, [
        paragraph("Second parent"),
        schema.node("ordered_list", null, [
          schema.node("list_item", null, [paragraph("Second child")])
        ])
      ])
    ])
  ]);
}

function createView(state: EditorState) {
  let currentState = state;

  return {
    dispatch(transaction: Transaction) {
      currentState = currentState.apply(transaction);
    },
    focus: vi.fn(),
    get state() {
      return currentState;
    }
  } as unknown as EditorView & { focus: ReturnType<typeof vi.fn> };
}

describe("list toggle plugin", () => {
  it("collapses and expands every foldable list item", () => {
    const bulletList = schema.nodes.bullet_list as NodeType;
    const listItem = schema.nodes.list_item as NodeType;
    const orderedList = schema.nodes.ordered_list as NodeType;
    const state = EditorState.create({
      doc: createDoc(),
      plugins: [createListTogglePlugin(listItem, bulletList, orderedList)]
    });
    const view = createView(state);

    expect(listItemCollapseInfo(view.state, listItem, bulletList, orderedList)).toEqual({
      collapsedCount: 0,
      totalCount: 2
    });

    expect(setAllListItemsCollapsed(view, listItem, bulletList, orderedList, true)).toBe(true);
    expect(listItemCollapseInfo(view.state, listItem, bulletList, orderedList)).toEqual({
      collapsedCount: 2,
      totalCount: 2
    });

    expect(setAllListItemsCollapsed(view, listItem, bulletList, orderedList, false)).toBe(true);
    expect(listItemCollapseInfo(view.state, listItem, bulletList, orderedList)).toEqual({
      collapsedCount: 0,
      totalCount: 2
    });
  });
});
