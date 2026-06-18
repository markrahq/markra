import { Schema, type Node as ProseNode, type NodeType } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import { createHeadingLevelPlugin } from "./heading-level";

const emptyRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  toJSON: () => ({}),
  top: 0,
  width: 0,
  x: 0,
  y: 0
} as DOMRect;
const originalElementGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalElementGetClientRects = Element.prototype.getClientRects;
const originalRangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;
const originalRangeGetClientRects = Range.prototype.getClientRects;
const textPrototype = Text.prototype as Text & {
  getBoundingClientRect?: () => DOMRect;
  getClientRects?: () => DOMRectList;
};
const originalTextGetBoundingClientRect = textPrototype.getBoundingClientRect;
const originalTextGetClientRects = textPrototype.getClientRects;

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      toDOM: (node: ProseNode) => [`h${node.attrs.level}`, 0]
    },
    paragraph: {
      content: "inline*",
      group: "block",
      toDOM: () => ["p", 0]
    },
    text: { group: "inline" }
  }
});

function createDoc() {
  return schema.node("doc", null, [
    schema.node("heading", { level: 2 }, [schema.text("Synthetic heading")]),
    schema.node("paragraph", null, [schema.text("Synthetic body")])
  ]);
}

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("heading level plugin", () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () => emptyRect;
    Element.prototype.getClientRects = () => [emptyRect] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => emptyRect;
    Range.prototype.getClientRects = () => [emptyRect] as unknown as DOMRectList;
    Object.assign(Text.prototype, {
      getBoundingClientRect: () => emptyRect,
      getClientRects: () => [emptyRect] as unknown as DOMRectList
    });
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalElementGetBoundingClientRect;
    Element.prototype.getClientRects = originalElementGetClientRects;
    Range.prototype.getBoundingClientRect = originalRangeGetBoundingClientRect;
    Range.prototype.getClientRects = originalRangeGetClientRects;

    if (originalTextGetBoundingClientRect) {
      textPrototype.getBoundingClientRect = originalTextGetBoundingClientRect;
    } else {
      delete textPrototype.getBoundingClientRect;
    }

    if (originalTextGetClientRects) {
      textPrototype.getClientRects = originalTextGetClientRects;
    } else {
      delete textPrototype.getClientRects;
    }
  });

  it("converts the active heading to a paragraph from the level menu", () => {
    const heading = schema.nodes.heading as NodeType;
    const paragraph = schema.nodes.paragraph as NodeType;
    const doc = createDoc();
    const host = document.createElement("div");
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 2),
        plugins: [createHeadingLevelPlugin(heading, paragraph)]
      })
    });

    document.body.append(host);
    view.dom.dispatchEvent(new Event("focus"));

    const menuButton = host.querySelector(".markra-heading-level-button");
    expect(menuButton).toBeInstanceOf(HTMLButtonElement);
    click(menuButton as HTMLButtonElement);

    const paragraphOption = host.querySelector('[data-heading-level="paragraph"]');
    expect(paragraphOption).toBeInstanceOf(HTMLButtonElement);
    expect(paragraphOption?.textContent).toBe("Paragraph");
    click(paragraphOption as HTMLButtonElement);

    expect(view.state.doc.child(0).type).toBe(paragraph);
    expect(view.state.doc.child(0).textContent).toBe("Synthetic heading");
    expect(view.state.selection.$head.parent.type).toBe(paragraph);

    view.destroy();
    host.remove();
  });
});
