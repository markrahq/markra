import {
  scrollElementToContainerTop,
  scrollElementsAboveContainerBottomInset,
  selectionAnchorFromEditorView
} from "./useEditorController";
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
