import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linksPlugin,
  listMarkraUi,
  liveMarkdown,
  resolveSafeLinkTarget,
  runMarkraCommand,
  type LinksPluginOptions,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  options: LinksPluginOptions,
  selection = doc.length,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [linksPlugin(options)] })],
      selection: { anchor: selection },
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("linksPlugin", () => {
  it("accepts navigation-safe targets and rejects executable protocols", () => {
    expect(resolveSafeLinkTarget("https://example.test/docs")).toBe(
      "https://example.test/docs",
    );
    expect(resolveSafeLinkTarget("mailto:author@example.test")).toBe(
      "mailto:author@example.test",
    );
    expect(resolveSafeLinkTarget("tel:+15550100")).toBe("tel:+15550100");
    expect(resolveSafeLinkTarget("../guide.md#install")).toBe(
      "../guide.md#install",
    );
    expect(resolveSafeLinkTarget("#commands")).toBe("#commands");

    expect(resolveSafeLinkTarget("javascript:alert(1)")).toBeNull();
    expect(resolveSafeLinkTarget("javascript\\:alert(1)")).toBeNull();
    expect(resolveSafeLinkTarget("data:text/html,unsafe")).toBeNull();
    expect(resolveSafeLinkTarget("file:///mock/private.md")).toBeNull();
    expect(resolveSafeLinkTarget("markra://documents/mock.md")).toBeNull();
    expect(resolveSafeLinkTarget("https://example.test/\u0000unsafe")).toBeNull();
  });

  it("reveals editable link Markdown on plain click without opening it", () => {
    const doc =
      "Read [Synthetic alt](https://example.test/guide) now\n\nEdit here";
    const open = vi.fn();
    const view = createView(doc, { open });
    const link = view.dom.querySelector<HTMLElement>(".cm-markra-link");

    expect(link).not.toBeNull();
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }))).toBe(false);

    expect(open).not.toHaveBeenCalled();
    expect(view.state.selection.main.head).toBe(
      doc.indexOf("Synthetic alt") + 1,
    );
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-link-source-label")?.textContent)
      .toBe("Synthetic alt");
    expect(
      Array.from(
        view.dom.querySelectorAll<HTMLElement>(".cm-markra-link-source"),
        (element) => element.textContent,
      ).join(""),
    ).toBe("[](https://example.test/guide)");

    const labelFrom = doc.indexOf("Synthetic alt");
    view.dispatch({
      changes: {
        from: labelFrom,
        insert: "Changed alt",
        to: labelFrom + "Synthetic alt".length,
      },
    });
    const urlFrom = view.state.doc.toString().indexOf("https://example.test/guide");
    view.dispatch({
      changes: {
        from: urlFrom,
        insert: "https://example.test/changed",
        to: urlFrom + "https://example.test/guide".length,
      },
    });

    expect(view.state.doc.toString()).toContain(
      "[Changed alt](https://example.test/changed)",
    );
  });

  it("opens a rendered link on Cmd/Ctrl-click without changing Markdown", () => {
    const doc =
      "Read [Synthetic guide](https://example.test/guide) now\n\nEdit here";
    const open = vi.fn();
    const view = createView(doc, { open });
    const link = view.dom.querySelector<HTMLElement>(".cm-markra-link");
    const modifierPointerDown = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    });
    const modifierClick = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    });
    const controlPointerDown = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      ctrlKey: true,
    });

    expect(link).not.toBeNull();
    expect(link?.dispatchEvent(modifierPointerDown)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    link?.dispatchEvent(modifierClick);
    expect(open).toHaveBeenCalledTimes(1);
    expect(link?.dispatchEvent(controlPointerDown)).toBe(false);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "https://example.test/guide",
        target: "https://example.test/guide",
        view,
      }),
    );
    expect(view.state.doc.toString()).toBe(doc);
  });

  it.each([
    ["Cmd", { key: "Meta", metaKey: true }],
    ["Ctrl", { key: "Control", ctrlKey: true }],
  ])("shows a pointer cursor while %s is held over links", (_label, init) => {
    const doc = "Read [Synthetic guide](https://example.test/guide) now";
    const view = createView(doc, { open: vi.fn() });
    expect(view.dom.querySelector(".cm-markra-link")).not.toBeNull();

    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ...init,
    }));

    expect(view.dom.dataset.markraLinkModifier).toBe("true");

    view.contentDOM.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true,
      key: init.key,
    }));

    expect(view.dom.dataset.markraLinkModifier).toBeUndefined();
  });

  it("opens a reference-style link through its resolved definition", () => {
    const doc = [
      "Read [Synthetic guide][docs] now",
      "",
      "[docs]: https://example.test/reference",
      "",
      "Edit here",
    ].join("\n");
    const open = vi.fn();
    const view = createView(doc, { open });
    const link = view.dom.querySelector<HTMLElement>(".cm-markra-link");

    expect(link?.textContent).toBe("Synthetic guide");
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    }))).toBe(false);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      source: "https://example.test/reference",
      target: "https://example.test/reference",
      view,
    }));
    expect(view.state.doc.toString()).toBe(doc);
  });

  it.each([
    ["angle autolink", "<https://example.test/angle>", "https://example.test/angle"],
    ["bare autolink", "https://example.test/bare", "https://example.test/bare"],
    ["loopback port autolink", "http://127.0.0.1:8080/test", "http://127.0.0.1:8080/test"],
    ["angle email autolink", "<author@example.test>", "mailto:author@example.test"],
    ["mailto autolink", "<mailto:author@example.test>", "mailto:author@example.test"],
    ["bare email autolink", "author@example.test", "mailto:author@example.test"],
    ["www autolink", "www.example.test/guide", "http://www.example.test/guide"],
  ])("supports %s with the same click interactions", (_label, markdown, target) => {
    const doc = `Read ${markdown} now\n\nEdit here`;
    const visibleSource = markdown.replace(/^<|>$/gu, "");
    const open = vi.fn();
    const view = createView(doc, { open });
    const link = view.dom.querySelector<HTMLElement>(".cm-markra-link");

    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe(target);
    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      metaKey: true,
    }))).toBe(false);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      source: target,
      target,
      view,
    }));

    expect(link?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }))).toBe(false);
    expect(view.state.selection.main.head).toBeGreaterThanOrEqual(
      doc.indexOf(visibleSource),
    );
    expect(view.state.selection.main.head).toBeLessThanOrEqual(
      doc.indexOf(visibleSource) + visibleSource.length,
    );
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("publishes a stable context-menu command and keyboard shortcut", () => {
    const doc = "Read [Synthetic guide](./guide.md) now";
    const open = vi.fn();
    const view = createView(doc, { label: "打开链接", open }, doc.indexOf("guide"));

    expect(listMarkraUi(view, "context-menu")).toMatchObject([
      {
        command: "link.open",
        enabled: true,
        icon: "external-link",
        label: "打开链接",
        plugin: "markra.links",
      },
    ]);
    expect(runMarkraCommand(view, "link.open")).toBe(true);

    const shortcut = new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "Enter",
    });
    expect(runScopeHandlers(view, shortcut, "editor")).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("lets Markra resolve application links through a host callback", () => {
    const doc = "Open [Mock document](markra://documents/mock.md)";
    const open = vi.fn();
    const resolveTarget = vi.fn(({ source }) =>
      source.startsWith("markra://") ? `/documents/${source.slice(9)}` : null,
    );
    const view = createView(
      doc,
      { open, resolveTarget },
      doc.indexOf("Mock document"),
    );

    expect(runMarkraCommand(view, "link.open")).toBe(true);
    expect(resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "markra://documents/mock.md",
        view,
      }),
    );
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "markra://documents/mock.md",
        target: "/documents/documents/mock.md",
        view,
      }),
    );
  });

  it("does not expose or run unsafe links when the host does not resolve them", () => {
    const doc = "Open [Unsafe](javascript:alert%281%29)";
    const open = vi.fn();
    const view = createView(doc, { open }, doc.indexOf("Unsafe"));

    expect(listMarkraUi(view, "context-menu")).toEqual([]);
    expect(runMarkraCommand(view, "link.open")).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("can opt into single-click activation for read-oriented hosts", () => {
    const doc = "Read [Synthetic guide](https://example.test/guide) now\n\nEdit";
    const open = vi.fn();
    const view = createView(doc, { activation: "click", open });
    const link = view.dom.querySelector<HTMLElement>(".cm-markra-link");
    const pointerDown = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });

    expect(link?.dispatchEvent(pointerDown)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
