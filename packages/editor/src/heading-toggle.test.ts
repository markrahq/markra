import { Schema, type NodeType } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  createHeadingTogglePlugin,
  headingSectionCollapseInfo,
  setAllHeadingSectionsCollapsed
} from "./heading-toggle";

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
    text: { group: "inline" }
  }
});

function createDoc() {
  return schema.node("doc", null, [
    schema.node("heading", { level: 1 }, [schema.text("First")]),
    schema.node("paragraph", null, [schema.text("First body")]),
    schema.node("heading", { level: 2 }, [schema.text("Nested")]),
    schema.node("paragraph", null, [schema.text("Nested body")]),
    schema.node("heading", { level: 1 }, [schema.text("Second")]),
    schema.node("paragraph", null, [schema.text("Second body")])
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

describe("heading toggle plugin", () => {
  it("collapses and expands every foldable heading section", () => {
    const heading = schema.nodes.heading as NodeType;
    const state = EditorState.create({
      doc: createDoc(),
      plugins: [createHeadingTogglePlugin(heading)]
    });
    const view = createView(state);

    expect(headingSectionCollapseInfo(view.state, heading)).toEqual({
      collapsedCount: 0,
      totalCount: 3
    });

    expect(setAllHeadingSectionsCollapsed(view, heading, true)).toBe(true);
    expect(headingSectionCollapseInfo(view.state, heading)).toEqual({
      collapsedCount: 3,
      totalCount: 3
    });

    expect(setAllHeadingSectionsCollapsed(view, heading, false)).toBe(true);
    expect(headingSectionCollapseInfo(view.state, heading)).toEqual({
      collapsedCount: 0,
      totalCount: 3
    });
  });
});
