import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMarkdown, rawHtmlPreviewPlugin } from "./index.ts";
import "./dom.test-support.ts";

const syntaxTreeIterations = vi.hoisted(() => [] as Array<unknown>);

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();
  return {
    ...actual,
    syntaxTree(state: Parameters<typeof actual.syntaxTree>[0]) {
      const tree = actual.syntaxTree(state);
      return new Proxy(tree, {
        get(target, property, receiver) {
          if (property !== "iterate") {
            return Reflect.get(target, property, receiver);
          }
          return (spec: Parameters<typeof tree.iterate>[0]) => {
            syntaxTreeIterations.push(spec);
            return target.iterate(spec);
          };
        },
      });
    },
  };
});

const views: EditorView[] = [];

function createView(
  doc: string,
  plugin = rawHtmlPreviewPlugin(),
  anchor = doc.length,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [plugin] })],
      selection: EditorSelection.cursor(anchor),
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

describe("rawHtmlPreviewPlugin", () => {
  it("reveals source and updates its selection before focusing the editor", () => {
    const doc = "Before\n\n<table>\n<tr><td>Mock</td></tr>\n</table>\n\nAfter";
    const from = doc.indexOf("<table>");
    const view = createView(doc, rawHtmlPreviewPlugin(), 0);
    view.contentDOM.blur();
    const focused: Array<{ head: number; preview: boolean }> = [];
    view.contentDOM.addEventListener("focus", () => focused.push({
      head: view.state.selection.main.head,
      preview: Boolean(view.dom.querySelector(".markra-html-node table")),
    }));
    view.dom.querySelector<HTMLButtonElement>('[data-action="source"]')!.click();
    expect(focused).toEqual([{ head: from, preview: false }]);
  });

  it("keeps explicitly opened HTML source visible at both block boundaries", () => {
    const source = "<table>\n<tr><td>Synthetic</td></tr>\n</table>";
    const doc = `Before\n\n${source}\n\nAfter`;
    const from = doc.indexOf("<table>");
    const to = from + source.length;
    const view = createView(doc);
    view.dom.querySelector<HTMLButtonElement>('[data-action="source"]')!.click();

    view.dispatch({ selection: EditorSelection.cursor(from) });
    expect(view.dom.querySelector(".markra-html-node")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-html-hidden-line")).toBeNull();
    expect(view.state.selection.main.head).toBe(from);

    view.dispatch({ selection: EditorSelection.cursor(to) });
    expect(view.dom.querySelector(".markra-html-node")).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);

    view.dispatch({ selection: EditorSelection.cursor(doc.length) });
    expect(view.dom.querySelector(".markra-html-node table")).not.toBeNull();
  });

  it("preserves source intent through boundary edits, selection and blur without changing initial previews", () => {
    const source = "<table>\n<tr><td>Mock</td></tr>\n</table>";
    const doc = `${source}\n\nAfter`;
    const view = createView(doc, rawHtmlPreviewPlugin(), 0);
    expect(view.dom.querySelector(".markra-html-node table")).not.toBeNull();
    view.dom.querySelector<HTMLButtonElement>('[data-action="source"]')!.click();
    view.dispatch({ selection: EditorSelection.cursor(0) });
    view.contentDOM.blur();
    view.dispatch({ selection: view.state.selection });
    expect(view.dom.querySelector(".markra-html-node")).toBeNull();

    view.focus();
    view.dispatch({ changes: { from: 0, insert: "\n" }, selection: EditorSelection.cursor(0) });
    expect(view.dom.querySelector(".markra-html-node")).toBeNull();
    view.dispatch({ changes: { from: 0, to: 1 }, selection: EditorSelection.cursor(0) });
    view.dispatch({ selection: EditorSelection.range(0, doc.length) });
    expect(view.dom.querySelector(".markra-html-node")).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);

    const reopened = createView(doc, rawHtmlPreviewPlugin(), 0);
    expect(reopened.dom.querySelector(".markra-html-node table")).not.toBeNull();
  });

  it.each(["", "\n"])("renders merged HTML tables and preserves source through editing and recreation (%j)", (separator) => {
    const source = [
      '<div><table><thead><tr><th colspan="2">Synthetic heading</th></tr></thead>',
      '<tbody><tr><td rowspan="2">A</td><td>B</td></tr>',
      "<tr><td>C</td></tr></tbody></table></div>",
    ].join(separator);
    const doc = `${source}\n\nEdit here`;
    const view = createView(doc);
    const preview = view.dom.querySelector<HTMLElement>(".markra-html-node");

    expect(preview?.querySelector("th")?.colSpan).toBe(2);
    expect(preview?.querySelector("td")?.rowSpan).toBe(2);
    expect(view.state.doc.toString()).toBe(doc);

    preview?.querySelector<HTMLButtonElement>('[data-action="source"]')?.click();
    expect(view.dom.querySelector(".markra-html-node table")).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);

    const position = doc.indexOf(">B<") + 1;
    view.dispatch({ changes: { from: position, to: position + 1, insert: "Updated" } });
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    const edited = doc.replace(">B<", ">Updated<");
    expect(view.dom.querySelector("table")?.textContent).toContain("Updated");
    expect(view.dom.querySelector("td")?.rowSpan).toBe(2);
    expect(view.state.doc.toString()).toBe(edited);

    const reopened = createView(edited);
    expect(reopened.dom.querySelector("th")?.colSpan).toBe(2);
    expect(reopened.dom.querySelector("td")?.rowSpan).toBe(2);
    expect(reopened.state.doc.toString()).toBe(edited);
  });

  it("renders sanitized block HTML without changing its source", () => {
    const doc = [
      '<div class="example" onclick="alert(1)">',
      '<strong>Safe</strong><script>bad()</script>',
      "</div>",
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc);
    const preview = view.dom.querySelector<HTMLElement>(".markra-html-node");

    expect(preview?.textContent).toContain("Safe");
    expect(preview?.textContent).not.toContain("bad()");
    expect(preview?.firstElementChild?.hasAttribute("onclick")).toBe(false);
    expect(preview?.querySelector("script")).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("maps rendered HTML when plain text is typed after its last range", () => {
    const doc = [
      "<div>",
      "Synthetic HTML",
      "</div>",
      "",
      "Edit here",
    ].join("\n");
    const view = createView(doc);

    syntaxTreeIterations.splice(0);
    view.dispatch({
      changes: { from: doc.length, insert: "字" },
      selection: EditorSelection.cursor(doc.length + 1),
      userEvent: "input.type",
    });

    expect(syntaxTreeIterations).toHaveLength(0);
    expect(view.dom.querySelector(".markra-html-node")?.textContent).toContain(
      "Synthetic HTML",
    );
  });

  it("renders inline HTML and reveals its source when activated", () => {
    const doc = "Press <kbd>Mod</kbd> now.\n\nEdit";
    const view = createView(doc);
    const preview = view.dom.querySelector<HTMLElement>(".cm-markra-inline-html");

    expect(preview?.tagName).toBe("KBD");
    expect(preview?.textContent).toContain("Mod");
    preview?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(view.dom.querySelector(".cm-markra-inline-html")).toBeNull();
    expect(view.dom.textContent).toContain("<kbd>Mod</kbd>");
  });

  it("keeps raw HTML source visible while dragging from inside it", () => {
    const doc = "Press <kbd>Mod</kbd> now.\n\nEdit";
    const anchor = doc.indexOf("Mod");
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.cursor(anchor) });
    view.dispatch({ selection: EditorSelection.range(anchor, anchor + 3) });

    expect(view.dom.querySelector(".cm-markra-inline-html")).toBeNull();
    expect(view.dom.textContent).toContain("<kbd>Mod</kbd>");
  });

  it("keeps rendered HTML stable during a multi-line range selection", () => {
    const doc = "Press <kbd>Mod</kbd> now.\n\nAnother paragraph";
    const view = createView(doc);

    view.dispatch({ selection: EditorSelection.range(0, doc.length) });

    expect(view.dom.querySelector(".cm-markra-inline-html")?.textContent).toBe("Mod");
    expect(view.dom.textContent).not.toContain("<kbd>Mod</kbd>");
  });

  it("balances nested inline HTML without leaving closing tags behind", () => {
    const doc = "Before <span><span>Inner</span></span> after\n\nEdit";
    const view = createView(doc);
    const preview = view.dom.querySelector<HTMLElement>(".cm-markra-inline-html");

    expect(preview?.tagName).toBe("SPAN");
    expect(preview?.querySelector("span")?.textContent).toBe("Inner");
    expect(view.dom.textContent).toContain("Before Inner after");
    expect(view.dom.textContent).not.toContain("</span>");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("resolves safe image sources and rejects executable URLs", () => {
    const resolveImageSrc = vi.fn((source: string) =>
      source === "./mock.png" ? "https://assets.example.test/mock.png" : source,
    );
    const doc = [
      '<div><img src="./mock.png" alt="Mock"><img src="javascript:alert(1)"></div>',
      "",
      "Edit",
    ].join("\n");
    const view = createView(doc, rawHtmlPreviewPlugin({ resolveImageSrc }));
    const images = view.dom.querySelectorAll<HTMLImageElement>(".markra-html-node img");

    expect(resolveImageSrc).toHaveBeenCalledWith("./mock.png");
    expect(images[0]?.getAttribute("src")).toBe("https://assets.example.test/mock.png");
    expect(images[1]?.hasAttribute("src")).toBe(false);
  });
});
