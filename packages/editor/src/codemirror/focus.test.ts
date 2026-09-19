import { createRequire } from "node:module";
import type { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./dom.test-support.ts";

const require = createRequire(import.meta.url);
const views: EditorView[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  // WKWebView omits Safari's Version/ token, even on affected macOS releases.
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  );
  vi.spyOn(navigator, "vendor", "get").mockReturnValue("Apple Computer, Inc.");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(["import", "require"] as const)("CodeMirror %s focus", (entry) => {
  it("preserves ancestor scroll positions when WKWebView ignores preventScroll", async () => {
    const { EditorView: View } = entry === "import"
      ? await import("@codemirror/view")
      : require("@codemirror/view") as typeof import("@codemirror/view");
    const outer = document.createElement("section");
    const inner = document.createElement("div");
    outer.append(inner);
    document.body.append(outer);
    const doc = Array.from(
      { length: 100 },
      (_, index) => `Mock paragraph ${index}`,
    ).join("\n");
    const view = new View({ parent: inner, doc });
    views.push(view);

    const nativeFocus = view.contentDOM.focus.bind(view.contentDOM);
    vi.spyOn(view.contentDOM, "focus").mockImplementation((options) => {
      // Affected WebKit reads this option but still scrolls. Reading the getter
      // reproduces the false-positive feature detection, not missing support.
      const preventScroll = options?.preventScroll;
      nativeFocus({ preventScroll });
      outer.scrollTop = inner.scrollTop = 0;
      outer.scrollLeft = inner.scrollLeft = 0;
    });

    for (const scrollTop of [1600, 4800, 9000]) {
      view.contentDOM.blur();
      outer.scrollTop = scrollTop;
      outer.scrollLeft = 120;
      inner.scrollTop = 240;
      inner.scrollLeft = 60;

      view.focus();

      expect(document.activeElement).toBe(view.contentDOM);
      expect(outer.scrollTop).toBe(scrollTop);
      expect(outer.scrollLeft).toBe(120);
      expect(inner.scrollTop).toBe(240);
      expect(inner.scrollLeft).toBe(60);
      expect(view.state.doc.toString()).toBe(doc);
      expect(view.state.selection.main.empty).toBe(true);
    }
  });
});
