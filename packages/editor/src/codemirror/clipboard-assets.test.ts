import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdownImageDragMime } from "@markra/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markNextPlainTextPaste } from "../plain-text-paste.ts";
import { codeMirrorClipboardAssetsPlugin } from "./clipboard-assets.ts";
import { liveMarkdown } from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createDeferred<T>() {
  let resolve!: (value: T) => unknown;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createView(
  doc: string,
  options: Parameters<typeof codeMirrorClipboardAssetsPlugin>[0] = {},
  readOnly = false,
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        liveMarkdown({ plugins: [codeMirrorClipboardAssetsPlugin(options)] }),
        EditorState.readOnly.of(readOnly),
      ],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  views.push(view);
  return view;
}

function fileList(files: readonly File[]) {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  });
}

function paste(
  view: EditorView,
  options: {
    editorData?: string;
    files?: readonly File[];
    html?: string;
    plainTextPaste?: boolean;
    text?: string;
  },
) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: fileList(options.files ?? []),
      getData: (type: string) => {
        if (type === "application/x-markra-plain-text-paste") {
          return options.plainTextPaste ? "true" : "";
        }
        if (type === "text/html") return options.html ?? "";
        if (type === "text/plain") return options.text ?? "";
        if (type === "vscode-editor-data") return options.editorData ?? "";
        return "";
      },
      types: options.plainTextPaste
        ? ["application/x-markra-plain-text-paste", "text/plain"]
        : [],
    },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

function drop(
  view: EditorView,
  options: { files?: readonly File[]; payload?: unknown; text?: string },
) {
  const event = new MouseEvent("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: fileList(options.files ?? []),
      getData: (type: string) => {
        if (type === markdownImageDragMime && options.payload) {
          return JSON.stringify(options.payload);
        }
        if (type === "text/plain") return options.text ?? "";
        return "";
      },
    },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("codeMirrorClipboardAssetsPlugin", () => {
  it("shows a placeholder and inserts a saved pasted image", async () => {
    const pending = createDeferred<{ alt: string; src: string } | null>();
    const saveImage = vi.fn(() => pending.promise);
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot.png", {
      type: "image/png",
    });
    const view = createView("", { saveImage });

    const event = paste(view, { files: [image] });

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(saveImage).toHaveBeenCalledWith(image));
    expect(view.dom.querySelector(".markra-image-upload-placeholder")).not.toBeNull();
    expect(view.state.doc.toString()).toBe("");

    pending.resolve({ alt: "Screenshot", src: "assets/pasted-image.png" });
    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe("![Screenshot](assets/pasted-image.png)");
    });
    expect(view.dom.querySelector(".markra-image-upload-placeholder")).toBeNull();
  });

  it("maps a pending image insertion through typing without losing text", async () => {
    const pending = createDeferred<{ alt: string; src: string } | null>();
    const view = createView("", { saveImage: () => pending.promise });
    const image = new File([new Uint8Array([1])], "Delayed.png", { type: "image/png" });

    paste(view, { files: [image] });
    view.dispatch({ changes: { from: 0, insert: "Typed while waiting" } });
    pending.resolve({ alt: "Delayed", src: "assets/delayed.png" });

    await vi.waitFor(() => expect(view.state.doc.toString()).toContain("![Delayed](assets/delayed.png)"));
    expect(view.state.doc.toString()).toContain("Typed while waiting");
  });

  it("saves attachments and inserts Markdown links", async () => {
    const saveAttachment = vi.fn().mockResolvedValue({
      label: "Reference Doc.pdf",
      src: "assets/Reference%20Doc.pdf",
    });
    const attachment = new File([new Uint8Array([4])], "Reference Doc.pdf", {
      type: "application/pdf",
    });
    const view = createView("", { saveAttachment });

    expect(paste(view, { files: [attachment] }).defaultPrevented).toBe(true);

    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe(
        "[Reference Doc.pdf](assets/Reference%20Doc.pdf)",
      );
    });
    expect(saveAttachment).toHaveBeenCalledWith(attachment);
  });

  it("prefers a structured HTML table over its bitmap clipboard preview", async () => {
    const saveImage = vi.fn().mockResolvedValue({
      alt: "Preview",
      src: "assets/preview.png",
    });
    const preview = new File([new Uint8Array([1])], "preview.png", { type: "image/png" });
    const view = createView("", { saveImage });

    const event = paste(view, {
      files: [preview],
      html: "<table><tr><th>Name</th><th>Role</th></tr><tr><td>Alpha</td><td>Editor</td></tr></table>",
      text: "Name\tRole\nAlpha\tEditor",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(saveImage).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toContain("| Name | Role |");
    expect(view.state.doc.toString()).toContain("| Alpha | Editor |");
  });

  it("converts pasted web HTML and localizes remote images", async () => {
    const saveRemoteImage = vi.fn().mockResolvedValue({
      alt: "Kitten",
      src: "assets/kitten.png",
    });
    const view = createView("", { saveRemoteImage });

    const event = paste(view, {
      html: '<p>Intro</p><img src="https://images.example.test/kitten.png" alt="Kitten"><p>Outro</p>',
      text: "Intro\n\nOutro",
    });

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(saveRemoteImage).toHaveBeenCalledWith({
        alt: "Kitten",
        src: "https://images.example.test/kitten.png",
        title: "",
      });
    });
    await vi.waitFor(() => expect(view.state.doc.toString()).toContain("![Kitten](assets/kitten.png)"));
    expect(view.state.doc.toString()).toContain("Intro");
    expect(view.state.doc.toString()).toContain("Outro");
  });

  it("leaves explicitly plain text paste data unformatted", () => {
    const code = [
      "const mockValue = items[0];",
      "if (mockValue) {",
      "  console.log(mockValue);",
      "}",
    ].join("\n");
    const view = createView("");

    const event = paste(view, {
      editorData: JSON.stringify({ mode: "javascript", version: 1 }),
      html: `<pre><code>${code}</code></pre>`,
      plainTextPaste: true,
      text: code,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(code);
  });

  it("inserts the marked synthetic plain-text event before suppressing the native duplicate", () => {
    const view = createView("");
    markNextPlainTextPaste(view.contentDOM);

    const syntheticEvent = paste(view, {
      plainTextPaste: true,
      text: "### Synthetic heading",
    });
    const nativeEvent = paste(view, { text: "Duplicate native paste" });

    expect(syntheticEvent.defaultPrevented).toBe(true);
    expect(nativeEvent.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("### Synthetic heading");
  });

  it("prefers structured rich HTML over Markdown-looking fallback text", () => {
    const view = createView("");

    const event = paste(view, {
      html: [
        "<p>Mock summary</p>",
        "<ol><li>First <code>choice</code></li><li>Second choice</li></ol>",
        '<p>See <a href="https://example.test/mock-docs">mock docs</a>.</p>',
      ].join(""),
      text: [
        "Mock summary",
        "First choice",
        "Second choice",
        "See [mock docs](https://example.test/mock-docs).",
      ].join("\n"),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "Mock summary",
      "",
      "1.  First `choice`",
      "2.  Second choice",
      "",
      "See [mock docs](https://example.test/mock-docs).",
    ].join("\n"));
  });

  it("keeps styled file badges as inline links", () => {
    const view = createView("");
    const expected = [
      "Mock changes: ",
      "[example-a.ts (line 108)](/mock-project/src/example-a.ts:108), ",
      "[example-b.ts (line 438)](C:/mock-project/src/example-b.ts:438), ",
      "[example-c.ts (line 7)](https://example.test/mock-file#L7).",
    ].join("");

    const event = paste(view, {
      html: [
        "<p>Mock changes: ",
        '<a href="/mock-project/src/example-a.ts:108">',
        '<div style="font-family: Menlo, monospace; white-space: pre-wrap">',
        "example-a.ts (line 108)",
        "</div>",
        "</a>, ",
        '<a href="C:/mock-project/src/example-b.ts:438" ',
        'style="font-family: Menlo, monospace; white-space: pre-wrap">',
        "<div>example-b.ts</div>",
        "<div>(line 438)</div>",
        "</a>, ",
        '<a href="https://example.test/mock-file#L7">',
        '<p style="font-family: Menlo, monospace">example-c.ts (line 7)</p>',
        "</a>.</p>",
      ].join(""),
      text: expected,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(expected);
  });

  it("does not merge ordinary linked card blocks", () => {
    const view = createView("");
    const href = "https://example.test/mock-card";

    paste(view, {
      html: [
        '<p>See <a href="https://example.test/mock-card">',
        "<div>Mock title</div>",
        "<div>Mock subtitle</div>",
        "</a>.</p>",
      ].join(""),
      text: "See Mock title Mock subtitle.",
    });

    const markdown = view.state.doc.toString();
    expect(markdown).toContain(`[Mock title](${href})`);
    expect(markdown).toContain(`[Mock subtitle](${href})`);
    expect(markdown).not.toContain("Mock titleMock subtitle");
  });

  it("does not flatten semantic or multiline linked code", () => {
    const semanticView = createView("");
    const multilineView = createView("");

    paste(semanticView, {
      html: [
        '<p>See <a href="https://example.test/mock-code">',
        '<pre style="font-family: Menlo, monospace"><code>const mock = 1;</code></pre>',
        "</a>.</p>",
      ].join(""),
      text: "See const mock = 1;.",
    });
    paste(multilineView, {
      html: [
        '<p>See <a href="https://example.test/mock-lines">',
        '<div style="font-family: Menlo, monospace; white-space: pre-wrap">',
        "Mock line one<br>Mock line two",
        "</div></a>.</p>",
      ].join(""),
      text: "See Mock line one\nMock line two.",
    });

    expect(semanticView.state.doc.toString()).toContain("```\nconst mock = 1;\n```");
    expect(multilineView.state.doc.toString()).toContain("```\nMock line one\nMock line two\n```");
  });

  it("preserves Markdown-looking lines inside a styled mixed-content code block", () => {
    const view = createView("");
    const code = [
      "# Mock score",
      "=",
      "+ reward × 100",
      "",
      "- resource cost",
    ].join("\n");

    const event = paste(view, {
      html: [
        "<h2>Mock formula</h2>",
        "<ul><li>First constraint</li><li>Second constraint</li></ul>",
        "<p>Use this synthetic model:</p>",
        '<div style="font-family: Menlo, monospace; white-space: pre-wrap">',
        "<div># Mock score</div>",
        "<div>=</div>",
        "<div>+ reward × 100</div>",
        "<div><br></div>",
        "<div>- resource cost</div>",
        "</div>",
      ].join(""),
      text: [
        "Mock formula",
        "First constraint",
        "Second constraint",
        "Use this synthetic model:",
        code,
      ].join("\n"),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe([
      "## Mock formula",
      "",
      "-   First constraint",
      "-   Second constraint",
      "",
      "Use this synthetic model:",
      "",
      "```",
      code,
      "```",
    ].join("\n"));
  });

  it("preserves language metadata from a styled mixed-content code block", () => {
    const code = "print('mock value')";
    const view = createView("");

    paste(view, {
      html: [
        "<p>Mock introduction</p>",
        '<div style="font-family: Menlo, monospace; white-space: pre-wrap">',
        `<code class="language-python">${code}</code>`,
        "</div>",
        "<p>Mock conclusion</p>",
      ].join(""),
      text: ["Mock introduction", code, "Mock conclusion"].join("\n"),
    });

    expect(view.state.doc.toString()).toBe([
      "Mock introduction",
      "",
      "```python",
      code,
      "```",
      "",
      "Mock conclusion",
    ].join("\n"));
  });

  it("keeps Markdown source from a non-semantic editor clipboard", () => {
    const source = [
      "# Mock heading",
      "",
      "- First item",
      "- Second item",
    ].join("\n");
    const view = createView("");

    paste(view, {
      html: [
        '<div class="mock-editor-line"><span># Mock heading</span></div>',
        '<div class="mock-editor-line"><br></div>',
        '<div class="mock-editor-line"><span>- First item</span></div>',
        '<div class="mock-editor-line"><span>- Second item</span></div>',
      ].join(""),
      text: source,
    });

    expect(view.state.doc.toString()).toBe(source);
  });

  it("wraps code copied with syntax-highlighted HTML in a fenced block", () => {
    const code = [
      "const mock_value = items[0];",
      'if (mock_value === "synthetic") {',
      "  return /a+b*/.test(mock_value);",
      "}",
    ].join("\n");
    const view = createView("");

    const event = paste(view, {
      html: [
        '<div style="font-family: Menlo, Monaco, monospace">',
        "<div>const mock_value = items[0];</div>",
        '<div>if (mock_value === &quot;synthetic&quot;) {</div>',
        "<div>&nbsp;&nbsp;return /a+b*/.test(mock_value);</div>",
        "<div>}</div>",
        "</div>",
      ].join(""),
      text: code,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(`\`\`\`javascript\n${code}\n\`\`\``);
  });

  it("preserves a code block inside mixed rich HTML", () => {
    const code = "print('synthetic')";
    const view = createView("");

    const event = paste(view, {
      html: [
        "<p>Mock introduction</p>",
        `<pre><code class="language-python">${code}</code></pre>`,
        "<p>Mock conclusion</p>",
      ].join(""),
      text: `Mock introduction\n\n${code}\n\nMock conclusion`,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(
      `Mock introduction\n\n\`\`\`python\n${code}\n\`\`\`\n\nMock conclusion`,
    );
  });

  it("wraps high-confidence plain text code at a block boundary", () => {
    const code = [
      "const mockValue = items[0];",
      "if (mockValue) {",
      "  console.log(mockValue);",
      "}",
    ].join("\n");
    const view = createView("Intro");

    const event = paste(view, { text: code });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(
      `Intro\n\n\`\`\`javascript\n${code}\n\`\`\``,
    );
  });

  it("uses a longer fence when pasted code contains Markdown backticks", () => {
    const code = 'const fence = "```";\nconsole.log(fence);';
    const view = createView("");

    paste(view, {
      editorData: JSON.stringify({ mode: "javascript", version: 1 }),
      text: code,
    });

    expect(view.state.doc.toString()).toBe(
      `\`\`\`\`javascript\n${code}\n\`\`\`\``,
    );
  });

  it("does not nest an automatically detected block inside fenced code", () => {
    const view = createView("```ts\nconst before = true;\n```");
    view.dispatch({ selection: EditorSelection.cursor(6) });
    const original = view.state.doc.toString();

    paste(view, {
      editorData: JSON.stringify({ mode: "typescript", version: 1 }),
      text: "const one = 1;\nconst two = 2;\n",
    });

    expect(view.state.doc.toString()).toBe(
      original.replace("const before", "const one = 1;\nconst two = 2;\nconst before"),
    );
    expect(view.state.doc.toString().match(/```/gu)).toHaveLength(2);
  });

  it("inserts existing file-tree image drags without saving again", () => {
    const saveImage = vi.fn();
    const view = createView("", {
      documentPath: () => "/vault/docs/note.md",
      saveImage,
    });

    const event = drop(view, {
      payload: {
        alt: "Diagram",
        path: "/vault/assets/diagram.png",
        relativePath: "assets/diagram.png",
      },
    });

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("![Diagram](../assets/diagram.png)");
    expect(saveImage).not.toHaveBeenCalled();
  });

  it("does not handle file mutations in a read-only editor", () => {
    const saveImage = vi.fn();
    const image = new File([new Uint8Array([1])], "Screenshot.png", { type: "image/png" });
    const view = createView("Read only", { saveImage }, true);

    const event = paste(view, { files: [image] });

    // CodeMirror itself suppresses browser mutations in read-only mode.
    expect(event.defaultPrevented).toBe(true);
    expect(saveImage).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("Read only");
  });
});
