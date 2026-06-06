import { Schema, type NodeType } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  createHeadingTogglePlugin,
  headingSectionCollapseInfo
} from "./heading-toggle";
import {
  createListTogglePlugin,
  listItemCollapseInfo
} from "./list-toggle";
import { toggleAllFoldableBlocks } from "./fold-toggle";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block"
    },
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
    schema.node("heading", { level: 1 }, [schema.text("Section")]),
    paragraph("Body"),
    schema.node("bullet_list", null, [
      schema.node("list_item", null, [
        paragraph("Parent"),
        schema.node("bullet_list", null, [
          schema.node("list_item", null, [paragraph("Child")])
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

describe("fold toggle", () => {
  it("collapses all foldable headings and list items, then expands them when all are collapsed", () => {
    const bulletList = schema.nodes.bullet_list as NodeType;
    const heading = schema.nodes.heading as NodeType;
    const listItem = schema.nodes.list_item as NodeType;
    const orderedList = schema.nodes.ordered_list as NodeType;
    const state = EditorState.create({
      doc: createDoc(),
      plugins: [
        createHeadingTogglePlugin(heading),
        createListTogglePlugin(listItem, bulletList, orderedList)
      ]
    });
    const view = createView(state);
    const nodeTypes = { bulletList, heading, listItem, orderedList };

    expect(toggleAllFoldableBlocks(view, nodeTypes)).toBe(true);
    expect(headingSectionCollapseInfo(view.state, heading)).toEqual({
      collapsedCount: 1,
      totalCount: 1
    });
    expect(listItemCollapseInfo(view.state, listItem, bulletList, orderedList)).toEqual({
      collapsedCount: 1,
      totalCount: 1
    });

    expect(toggleAllFoldableBlocks(view, nodeTypes)).toBe(true);
    expect(headingSectionCollapseInfo(view.state, heading)).toEqual({
      collapsedCount: 0,
      totalCount: 1
    });
    expect(listItemCollapseInfo(view.state, listItem, bulletList, orderedList)).toEqual({
      collapsedCount: 0,
      totalCount: 1
    });
  });
});
