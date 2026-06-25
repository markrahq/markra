import {
  markdownImageInsertionForSelection,
  markdownLinkInsertionForSelection,
  scrollElementToContainerTop,
  scrollElementsAboveContainerBottomInset,
  selectionAnchorFromEditorView,
  useEditorController
} from "./useEditorController";
import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...overrides
  };
}

type MockOutlineNode = {
  attrs: { level: number };
  position: number;
  textContent: string;
  type: { name: string };
};

function mockOutlineHeading(position: number, level: number, textContent: string): MockOutlineNode {
  return {
    attrs: { level },
    position,
    textContent,
    type: { name: "heading" }
  };
}

function mockOutlineEditor(view: EditorView): Editor {
  return {
    action: (runner: (ctx: { get: () => EditorView }) => unknown) => runner({
      get: () => view
    })
  } as unknown as Editor;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("editor controller scrolling", () => {
  it("keeps outline jumps below the fixed titlebar", () => {
    const container = document.createElement("div");
    const target = document.createElement("h2");
    const scrollTo = vi.fn();

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: scrollTo
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect({ height: 700, top: 0 }));
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect({ height: 48, top: 240 }));

    scrollElementToContainerTop(target, container);

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      top: 276
    });
  });

  it("scrolls a selected element above a bottom overlay", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    const scrollTo = vi.fn();

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: scrollTo
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect({ bottom: 700, height: 700 }));
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect({ bottom: 640, height: 24, top: 616 }));

    expect(scrollElementsAboveContainerBottomInset([target], container, 200, 24)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "smooth",
      top: 264
    });
  });

  it("uses instant scrolling when the user prefers reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    const container = document.createElement("div");
    const target = document.createElement("span");
    const scrollTo = vi.fn();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: scrollTo
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect({ bottom: 700, height: 700 }));
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect({ bottom: 640, height: 24, top: 616 }));

    try {
      expect(scrollElementsAboveContainerBottomInset([target], container, 200, 24)).toBe(true);
      expect(scrollTo).toHaveBeenCalledWith({
        behavior: "auto",
        top: 264
      });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia
      });
    }
  });

  it("does not scroll when the selected element is already above the overlay", () => {
    const container = document.createElement("div");
    const target = document.createElement("span");
    const scrollTo = vi.fn();

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: scrollTo
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect({ bottom: 700, height: 700 }));
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect({ bottom: 420, height: 24, top: 396 }));

    expect(scrollElementsAboveContainerBottomInset([target], container, 200, 24)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("editor controller outline navigation", () => {
  it("selects outline headings by their non-empty outline index", () => {
    const paperScroll = document.createElement("div");
    const editorDom = document.createElement("div");
    const targetHeading = document.createElement("h4");
    const scrollTo = vi.fn();
    const selection = { synthetic: "selection" };
    const transaction = { synthetic: "transaction" };
    const setSelection = vi.fn(() => transaction);
    const dispatch = vi.fn();
    const focus = vi.fn();
    const nodeDOM = vi.fn(() => targetHeading);
    const resolve = vi.fn(() => ({ synthetic: "resolved-position" }));
    const nodes = [
      mockOutlineHeading(0, 4, "One"),
      mockOutlineHeading(20, 4, "Two"),
      mockOutlineHeading(40, 4, ""),
      mockOutlineHeading(60, 4, "Three")
    ];

    paperScroll.className = "paper-scroll";
    paperScroll.append(editorDom);
    Object.defineProperty(paperScroll, "scrollTop", {
      configurable: true,
      value: 0
    });
    Object.defineProperty(paperScroll, "scrollTo", {
      configurable: true,
      value: scrollTo
    });
    vi.spyOn(paperScroll, "getBoundingClientRect").mockReturnValue(rect({ height: 700, top: 0 }));
    vi.spyOn(targetHeading, "getBoundingClientRect").mockReturnValue(rect({ height: 32, top: 120 }));
    vi.spyOn(TextSelection, "near").mockReturnValue(selection as never);

    const view = {
      dispatch,
      dom: editorDom,
      focus,
      nodeDOM,
      state: {
        doc: {
          descendants(callback: (node: MockOutlineNode, position: number) => boolean | undefined) {
            for (const node of nodes) {
              callback(node, node.position);
            }
          },
          resolve
        },
        tr: {
          setSelection
        }
      }
    } as unknown as EditorView;
    const { result } = renderHook(() => useEditorController());

    act(() => result.current.handleEditorReady(mockOutlineEditor(view)));
    act(() => result.current.selectOutlineItem({ level: 4, title: "Three" }, 2));

    expect(resolve).toHaveBeenCalledWith(61);
    expect(TextSelection.near).toHaveBeenCalledWith({ synthetic: "resolved-position" });
    expect(setSelection).toHaveBeenCalledWith(selection);
    expect(dispatch).toHaveBeenCalledWith(transaction);
    expect(nodeDOM).toHaveBeenCalledWith(60);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      top: 56
    });
    expect(focus).toHaveBeenCalled();
  });
});

describe("editor controller link insertion", () => {
  it("uses a selected URL as both the link label and href", () => {
    expect(markdownLinkInsertionForSelection("https://example.test/articles/about")).toEqual({
      href: "https://example.test/articles/about",
      kind: "link",
      label: "https://example.test/articles/about",
      selectionFromOffset: 0,
      selectionToOffset: "https://example.test/articles/about".length
    });
  });

  it("keeps non-URL selections as an editable markdown link snippet", () => {
    expect(markdownLinkInsertionForSelection("Synthetic label")).toEqual({
      insertedText: "[Synthetic label](https://)",
      kind: "snippet",
      selectionFromOffset: 1,
      selectionToOffset: "[Synthetic label".length
    });
  });

  it("places the cursor after the placeholder label for empty link snippets", () => {
    expect(markdownLinkInsertionForSelection("")).toEqual({
      cursorOffset: "[text".length,
      insertedText: "[text](https://)",
      kind: "snippet"
    });
  });
});

describe("editor controller image insertion", () => {
  it("uses a local asset path placeholder and selects the image source", () => {
    expect(markdownImageInsertionForSelection("Synthetic alt")).toEqual({
      alt: "Synthetic alt",
      insertedText: "![Synthetic alt](assets/image.png)",
      selectionFromOffset: "![Synthetic alt](".length,
      selectionToOffset: "![Synthetic alt](assets/image.png".length,
      src: "assets/image.png"
    });
  });

  it("escapes selected text before using it as image alt markdown", () => {
    const insertion = markdownImageInsertionForSelection(String.raw`A ] bracket \ slash`);

    expect(insertion).toEqual({
      alt: String.raw`A ] bracket \ slash`,
      insertedText: String.raw`![A \] bracket \\ slash](assets/image.png)`,
      selectionFromOffset: String.raw`![A \] bracket \\ slash](`.length,
      selectionToOffset: String.raw`![A \] bracket \\ slash](assets/image.png`.length,
      src: "assets/image.png"
    });
  });
});

describe("editor controller selection anchor", () => {
  it("reads the toolbar anchor from the editor selection when DOM focus moves elsewhere", () => {
    const host = document.createElement("p");
    const text = document.createTextNode("Selected text");
    const range = document.createRange();

    host.append(text);
    vi.spyOn(document, "createRange").mockReturnValue(range);
    vi.spyOn(range, "getClientRects").mockReturnValue([
      rect({ bottom: 80, height: 20, left: 40, right: 120, top: 60, width: 80 }),
      rect({ bottom: 104, height: 20, left: 40, right: 180, top: 84, width: 140 })
    ] as unknown as DOMRectList);

    const view = {
      dom: host,
      domAtPos: (position: number) => ({
        node: text,
        offset: position
      }),
      state: {
        selection: {
          empty: false,
          from: 0,
          to: 13
        }
      }
    } as unknown as EditorView;

    expect(selectionAnchorFromEditorView(view)).toEqual({
      bottom: 104,
      left: 40,
      right: 180,
      top: 60
    });
  });
});
