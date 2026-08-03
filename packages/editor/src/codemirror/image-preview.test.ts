import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  imagePreviewPlugin,
  liveMarkdown,
  resolveSafeImageSource,
} from "./index.ts";

import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(
  doc: string,
  plugin: ReturnType<typeof imagePreviewPlugin> | null = imagePreviewPlugin(),
  readOnly = false,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.readOnly.of(readOnly),
        liveMarkdown({ plugins: plugin ? [plugin] : [] }),
      ],
      selection: { anchor: doc.length },
    }),
  });
  views.push(view);
  view.focus();
  view.dispatch({ selection: view.state.selection });
  return view;
}

function firstLine(view: EditorView) {
  return view.dom.querySelector(".cm-line")?.textContent ?? "";
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("imagePreviewPlugin", () => {
  it("waits for Enter before previewing a newly typed image", () => {
    const view = createView("");
    const markdown = "![a](https://example.test/image.png)";

    view.dispatch({
      changes: { from: 0, insert: markdown },
      selection: { anchor: markdown.length },
      userEvent: "input",
    });

    expect(
      view.dom.querySelector<HTMLInputElement>(".markra-image-node-source")
        ?.value,
    ).toBe(markdown);

    view.dispatch({
      changes: { from: markdown.length, insert: "\n" },
      selection: { anchor: markdown.length + 1 },
      userEvent: "input",
    });

    expect(view.dom.querySelector(".markra-image-node-source")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-image")).not.toBeNull();
  });

  it("renders an existing image when the initial caret is at its end", () => {
    const doc = "![Synthetic alt](https://example.test/image.png)";
    const view = createView(doc);

    expect(view.dom.querySelector(".markra-image-node-source")).toBeNull();
    expect(view.dom.querySelector(".cm-markra-image")).not.toBeNull();
  });

  it("renders a safe Markdown image without changing its source", () => {
    const doc =
      'Before ![Synthetic alt](https://example.test/image.png "Preview") after\n\nEdit';
    const view = createView(doc);
    const image = view.dom.querySelector<HTMLImageElement>(
      ".cm-markra-image",
    );

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe(
      "https://example.test/image.png",
    );
    expect(image?.alt).toBe("Synthetic alt");
    expect(image?.title).toBe("Preview");
    expect(image?.loading).toBe("lazy");
    expect(image?.decoding).toBe("async");
    expect(firstLine(view)).toBe("Before  after");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("does not reload an unchanged image while editing text above it", () => {
    const sourceSetter = vi.spyOn(
      HTMLImageElement.prototype,
      "src",
      "set",
    );
    try {
      const doc = [
        "Edit here",
        "",
        "![Synthetic alt](https://example.test/image.png)",
      ].join("\n");
      const view = createView(doc);
      const image = view.dom.querySelector<HTMLImageElement>(
        ".cm-markra-image",
      );
      const requestMeasure = vi.spyOn(view, "requestMeasure");
      const baselineView = createView(doc, null);
      const baselineRequestMeasure = vi.spyOn(
        baselineView,
        "requestMeasure",
      );
      sourceSetter.mockClear();
      requestMeasure.mockClear();
      baselineRequestMeasure.mockClear();

      baselineView.dispatch({
        changes: { from: "Edit here".length, insert: "!" },
        selection: { anchor: "Edit here!".length },
        userEvent: "input",
      });
      view.dispatch({
        changes: { from: "Edit here".length, insert: "!" },
        selection: { anchor: "Edit here!".length },
        userEvent: "input",
      });

      expect(view.dom.querySelector(".cm-markra-image")).toBe(image);
      expect(sourceSetter).not.toHaveBeenCalled();
      expect(requestMeasure).toHaveBeenCalledTimes(
        baselineRequestMeasure.mock.calls.length,
      );
    } finally {
      sourceSetter.mockRestore();
    }
  });

  it("marks a standalone Markdown image line for block layout", () => {
    const doc = "![Synthetic alt](https://example.test/image.png)\n\nEdit";
    const view = createView(doc);
    const image = view.dom.querySelector<HTMLImageElement>(".cm-markra-image");

    expect(image).not.toBeNull();
    expect(image?.closest(".cm-markra-image-line")).not.toBeNull();
  });

  it("keeps the preview visible and shows editable Markdown source when selected", () => {
    const doc = "Before ![Synthetic alt](./assets/mock.png) after\n\nEdit";
    const view = createView(doc);
    const image = view.dom.querySelector<HTMLImageElement>(".cm-markra-image");

    expect(image).not.toBeNull();
    image?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }));

    expect(view.dom.querySelector(".cm-markra-image")).not.toBeNull();
    expect(view.dom.querySelector(".markra-image-node-selected")).not.toBeNull();
    expect(
      view.dom.querySelector<HTMLInputElement>(".markra-image-node-source")
        ?.value,
    ).toBe("![Synthetic alt](./assets/mock.png)");
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("opens an image in the shared media viewer from the enlarge button or a double click", () => {
    const doc =
      '![Synthetic detail](https://example.test/detail.png "Detailed preview")\n\nEdit';
    const view = createView(doc);
    const image = view.dom.querySelector<HTMLImageElement>(".cm-markra-image");
    const enlargeButton = view.dom.querySelector<HTMLButtonElement>(
      ".markra-image-viewer-button",
    );

    expect(image).not.toBeNull();
    expect(enlargeButton?.ariaLabel).toBe("Enlarge image");
    expect(enlargeButton?.querySelector("svg")).not.toBeNull();
    expect(image?.parentElement).toBe(enlargeButton?.parentElement);
    expect(image?.parentElement?.classList).toContain("markra-image-frame");

    enlargeButton?.click();
    let dialog = document.querySelector<HTMLElement>(
      ".markra-media-viewer-dialog",
    );
    let enlargedImage = dialog?.querySelector<HTMLImageElement>(
      ".markra-media-viewer-image",
    );

    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.ariaLabel).toBe("Enlarged image");
    expect(enlargedImage?.getAttribute("src")).toBe(
      "https://example.test/detail.png",
    );
    expect(enlargedImage?.alt).toBe("Synthetic detail");
    expect(
      dialog?.querySelector(".markra-media-viewer-zoom-in-button"),
    ).not.toBeNull();

    dialog
      ?.querySelector<HTMLButtonElement>(".markra-media-viewer-close-button")
      ?.click();
    expect(document.querySelector(".markra-media-viewer-dialog")).toBeNull();

    image?.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    }));
    dialog = document.querySelector<HTMLElement>(
      ".markra-media-viewer-dialog",
    );
    enlargedImage = dialog?.querySelector<HTMLImageElement>(
      ".markra-media-viewer-image",
    );

    expect(dialog).not.toBeNull();
    expect(enlargedImage?.getAttribute("src")).toBe(
      "https://example.test/detail.png",
    );
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("opens the viewer in read-only mode without revealing editable source", () => {
    const doc = "![Synthetic detail](https://example.test/detail.png)";
    const view = createView(doc, imagePreviewPlugin(), true);
    const image = view.dom.querySelector<HTMLImageElement>(".cm-markra-image");

    image?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }));
    expect(view.dom.querySelector(".markra-image-node-source")).toBeNull();

    image?.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    }));
    expect(document.querySelector(".markra-media-viewer-dialog")).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("keeps one active viewer and closes it when the shown image changes", () => {
    const firstSource = "https://example.test/first.png";
    const secondSource = "https://example.test/second.png";
    const doc = [
      `![First synthetic image](${firstSource})`,
      "",
      `![Second synthetic image](${secondSource})`,
    ].join("\n");
    const view = createView(doc);
    const images = view.dom.querySelectorAll<HTMLImageElement>(
      ".cm-markra-image",
    );

    images[0]?.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    }));
    expect(
      document.querySelector<HTMLImageElement>(".markra-media-viewer-image")
        ?.getAttribute("src"),
    ).toBe(firstSource);

    images[1]?.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    }));
    expect(document.querySelectorAll(".markra-media-viewer-dialog")).toHaveLength(1);
    expect(
      document.querySelector<HTMLImageElement>(".markra-media-viewer-image")
        ?.getAttribute("src"),
    ).toBe(secondSource);

    const sourceFrom = view.state.doc.toString().indexOf(secondSource);
    view.dispatch({
      changes: {
        from: sourceFrom,
        to: sourceFrom + secondSource.length,
        insert: "https://example.test/updated.png",
      },
      userEvent: "input",
    });

    expect(document.querySelector(".markra-media-viewer-dialog")).toBeNull();
  });

  it("closes an active viewer when its editor is destroyed", () => {
    const view = createView(
      "![Synthetic detail](https://example.test/detail.png)",
    );
    view.dom.querySelector<HTMLImageElement>(".cm-markra-image")?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
    expect(document.querySelector(".markra-media-viewer-dialog")).not.toBeNull();

    view.destroy();
    views.splice(views.indexOf(view), 1);

    expect(document.querySelector(".markra-media-viewer-dialog")).toBeNull();
  });

  it("updates and deletes an image through its inline Markdown source", () => {
    const doc = "![Synthetic alt](./assets/mock.png)\n\nEdit";
    const view = createView(doc);
    view.dom.querySelector<HTMLImageElement>(".cm-markra-image")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    const source = view.dom.querySelector<HTMLInputElement>(
      ".markra-image-node-source",
    );

    expect(source).not.toBeNull();
    if (!source) return;

    source.focus();
    source.value = "![Changed](https://example.test/changed.png)";
    source.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.state.doc.toString()).toBe(
      "![Changed](https://example.test/changed.png)\n\nEdit",
    );
    expect(
      view.dom.querySelector<HTMLImageElement>(".cm-markra-image")?.src,
    ).toBe("https://example.test/changed.png");

    const updatedSource = view.dom.querySelector<HTMLInputElement>(
      ".markra-image-node-source",
    );
    expect(updatedSource).not.toBeNull();
    if (!updatedSource) return;
    updatedSource.value = "";
    updatedSource.dispatchEvent(new Event("input", { bubbles: true }));

    expect(view.state.doc.toString()).toBe("\n\nEdit");
    expect(view.dom.querySelector(".cm-markra-image")).toBeNull();
  });

  it("moves into the blank line after an edited image on Enter", () => {
    const doc = "![Synthetic alt](./assets/mock.png)\n\nEdit";
    const view = createView(doc);
    view.dom.querySelector<HTMLImageElement>(".cm-markra-image")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    const source = view.dom.querySelector<HTMLInputElement>(
      ".markra-image-node-source",
    );

    expect(source).not.toBeNull();
    source?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    }));

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(doc.indexOf("\n") + 1);
    expect(view.dom.querySelector(".markra-image-node-source")).toBeNull();
  });

  it("moves below a selected image when Enter comes from the editor", () => {
    const imageMarkdown = "![Synthetic alt](./assets/mock.png)";
    const doc = `${imageMarkdown}\nFollowing`;
    const view = createView(doc);
    view.dom.querySelector<HTMLImageElement>(".cm-markra-image")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    expect(view.state.selection.main.head).toBe(1);
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(imageMarkdown.length + 1);
    expect(view.dom.querySelector(".markra-image-node-source")).toBeNull();

    view.dispatch({
      changes: { from: imageMarkdown.length + 1, insert: "Plain " },
      selection: { anchor: imageMarkdown.length + 7 },
      userEvent: "input",
    });
    expect(view.state.doc.toString()).toBe(
      `${imageMarkdown}\nPlain Following`,
    );
    expect(view.dom.querySelector(".cm-markra-link")).toBeNull();
  });

  it("rejects executable and local protocols by default", () => {
    const executable = createView(
      "![Unsafe](javascript:alert%281%29)\n\nEdit",
    );
    const local = createView("![Local](file:///mock/private.png)\n\nEdit");

    expect(executable.dom.querySelector(".cm-markra-image")).toBeNull();
    expect(local.dom.querySelector(".cm-markra-image")).toBeNull();
  });

  it("allows common browser image sources but rejects SVG data URLs", () => {
    expect(resolveSafeImageSource("./assets/mock.png")).toBe(
      "./assets/mock.png",
    );
    expect(resolveSafeImageSource("blob:https://example.test/mock")).toBe(
      "blob:https://example.test/mock",
    );
    expect(resolveSafeImageSource("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(
      resolveSafeImageSource("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"),
    ).toBeNull();
  });

  it("lets Markra resolve application assets through a host callback", () => {
    const resolveSource = vi.fn((context) =>
      context.source.startsWith("markra://")
        ? "https://assets.example.test/mock.png"
        : null,
    );
    const view = createView(
      '![Asset](markra://images/mock.png "Asset preview")\n\nEdit',
      imagePreviewPlugin({
        className: "markra-image",
        resolveSource,
      }),
    );
    const image = view.dom.querySelector<HTMLImageElement>(".markra-image");

    expect(resolveSource).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: "Asset",
        source: "markra://images/mock.png",
        title: "Asset preview",
        view,
      }),
    );
    expect(image?.getAttribute("src")).toBe(
      "https://assets.example.test/mock.png",
    );
  });
});
