import {
  EditorSelection,
  EditorState,
  Prec,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type EditorView as CodeMirrorView,
  type ViewUpdate,
} from "@codemirror/view";
import {
  readMarkdownFrontmatter as readCodeMirrorFrontmatter,
  type MarkdownFrontmatterRange as CodeMirrorFrontmatterRange,
} from "@markra/markdown";
import { defineMarkraPlugin } from "./plugin.ts";

export { readCodeMirrorFrontmatter };
export type {
  MarkdownFrontmatterKind as CodeMirrorFrontmatterKind,
  MarkdownFrontmatterRange as CodeMirrorFrontmatterRange,
} from "@markra/markdown";

function removeFrontmatter(
  view: CodeMirrorView,
  range: CodeMirrorFrontmatterRange,
) {
  if (view.state.facet(EditorState.readOnly)) return false;
  const source = view.state.doc.toString();
  let to = range.to;
  while (source[to] === "\n" || source[to] === "\r") to += 1;
  view.dispatch({
    changes: { from: range.from, to },
    selection: EditorSelection.cursor(range.from),
    scrollIntoView: true,
    userEvent: "delete",
  });
  view.focus();
  return true;
}

class FrontmatterWidget extends WidgetType {
  constructor(readonly range: CodeMirrorFrontmatterRange) {
    super();
  }

  eq(other: FrontmatterWidget) {
    return other.range.source === this.range.source && other.range.kind === this.range.kind;
  }

  ignoreEvent() {
    return true;
  }

  updateDOM(dom: HTMLElement, view: CodeMirrorView) {
    if (!dom.classList.contains("cm-markra-frontmatter")) return false;
    this.syncDOM(dom, view);
    return true;
  }

  private syncDOM(root: HTMLElement, view: CodeMirrorView) {
    const label = root.querySelector<HTMLElement>(".cm-markra-frontmatter-label");
    const editor = root.querySelector<HTMLTextAreaElement>(
      ".cm-markra-frontmatter-editor",
    );
    root.dataset.frontmatterKind = this.range.kind;
    label?.replaceChildren(this.range.kind.toUpperCase());
    if (editor && editor.value !== this.range.content) {
      editor.value = this.range.content;
    }
    if (editor) {
      editor.readOnly = view.state.facet(EditorState.readOnly);
      editor.rows = Math.max(1, editor.value.split("\n").length);
    }
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const root = document.createElement("div");
    const label = document.createElement("span");
    const editor = document.createElement("textarea");

    root.className = "cm-markra-frontmatter markra-frontmatter";
    root.dataset.type = "frontmatter";
    label.className = "cm-markra-frontmatter-label";
    editor.className = "cm-markra-frontmatter-editor";
    editor.setAttribute(
      "aria-label",
      `Edit ${this.range.kind.toUpperCase()} frontmatter`,
    );
    editor.spellcheck = false;
    let composing = false;
    const syncEditorValue = () => {
      const current = readCodeMirrorFrontmatter(view.state.doc.toString());
      if (!current) return;
      const selectionStart = editor.selectionStart;
      const selectionEnd = editor.selectionEnd;
      const insert = current.delimiter ? `${editor.value}\n` : editor.value;
      if (view.state.doc.sliceString(current.contentFrom, current.contentTo) === insert) {
        return;
      }
      view.dispatch({
        changes: {
          from: current.contentFrom,
          to: current.contentTo,
          insert,
        },
        userEvent: "input",
      });
      const nextEditor = view.dom.querySelector<HTMLTextAreaElement>(
        ".cm-markra-frontmatter-editor",
      );
      // Updating the hidden Markdown lines may rebuild CodeMirror's line DOM.
      // Restore the textarea focus so continuous typing never drops a character.
      nextEditor?.focus({ preventScroll: true });
      nextEditor?.setSelectionRange(selectionStart, selectionEnd);
      if (nextEditor) {
        nextEditor.rows = Math.max(1, nextEditor.value.split("\n").length);
      }
    };
    editor.addEventListener("compositionstart", () => {
      composing = true;
    });
    editor.addEventListener("compositionend", () => {
      composing = false;
      syncEditorValue();
    });
    editor.addEventListener("keydown", (event) => {
      if (
        (event.key !== "Backspace" && event.key !== "Delete") ||
        editor.selectionStart !== 0 ||
        editor.selectionEnd !== editor.value.length
      ) {
        return;
      }
      const current = readCodeMirrorFrontmatter(view.state.doc.toString());
      if (!current || view.state.facet(EditorState.readOnly)) return;

      event.preventDefault();
      event.stopPropagation();
      removeFrontmatter(view, current);
    });
    editor.addEventListener("input", (event) => {
      // Refocusing or moving the textarea selection before IME commit transfers
      // the composition to CodeMirror's contenteditable surface on Windows.
      if (composing || event.isComposing) return;
      syncEditorValue();
    });
    root.append(label, editor);
    this.syncDOM(root, view);
    return root;
  }
}

function buildFrontmatterDecorations(view: CodeMirrorView) {
  const range = readCodeMirrorFrontmatter(view.state.doc.toString());
  if (!range) return Decoration.none;

  const decorations: Range<Decoration>[] = [];
  const firstLine = view.state.doc.lineAt(range.from);
  const lastLine = view.state.doc.lineAt(range.to);
  decorations.push(
    Decoration.replace({ widget: new FrontmatterWidget(range) }).range(
      range.from,
      Math.min(firstLine.to, range.to),
    ),
  );
  for (let lineNumber = firstLine.number + 1; lineNumber <= lastLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const segmentTo = Math.min(line.to, range.to);
    if (line.from >= segmentTo) continue;
    if (segmentTo === line.to) {
      decorations.push(
        Decoration.line({ class: "cm-markra-frontmatter-hidden-line" }).range(
          line.from,
        ),
      );
    } else {
      decorations.push(Decoration.replace({}).range(line.from, segmentTo));
    }
  }
  return Decoration.set(decorations, true);
}

function createLeadingYamlFrontmatter(view: CodeMirrorView) {
  if (view.state.facet(EditorState.readOnly)) return false;
  const { ranges } = view.state.selection;
  if (ranges.length !== 1 || !ranges[0]?.empty) return false;

  const position = ranges[0].head;
  const line = view.state.doc.lineAt(position);
  if (line.number !== 1 || position !== line.to || line.text !== "---") {
    return false;
  }

  view.dispatch({
    changes: { from: position, insert: "\n\n---" },
    selection: EditorSelection.cursor(position + 1),
    scrollIntoView: true,
    userEvent: "input",
  });
  view.dom.querySelector<HTMLTextAreaElement>(
    ".cm-markra-frontmatter-editor",
  )?.focus();
  return true;
}

function removeFrontmatterAtBoundary(
  view: CodeMirrorView,
  direction: "backward" | "forward",
) {
  const { ranges } = view.state.selection;
  if (ranges.length !== 1 || !ranges[0]?.empty) return false;
  const frontmatter = readCodeMirrorFrontmatter(view.state.doc.toString());
  if (!frontmatter) return false;

  const openingLine = view.state.doc.lineAt(frontmatter.from);
  const position = ranges[0].head;
  // The card replaces only the opening delimiter. CodeMirror may map the same
  // visual card edge to any source position inside that replaced delimiter.
  const atBoundary = direction === "backward"
    ? position > openingLine.from && position <= openingLine.to
    : position >= openingLine.from && position < openingLine.to;
  return atBoundary && removeFrontmatter(view, frontmatter);
}

const frontmatterTheme = EditorView.baseTheme({
  ".cm-markra-frontmatter-hidden-line": {
    display: "none",
  },
  ".cm-markra-frontmatter": {
    background: "color-mix(in srgb, currentColor 4%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: "0.5em",
    boxSizing: "border-box",
    display: "block",
    margin: "0.5em 0 1em",
    overflowX: "auto",
    overflowWrap: "anywhere",
    padding: "0.75em 0.9em",
    whiteSpace: "pre-wrap",
    width: "100%",
  },
  ".cm-markra-frontmatter-label": {
    display: "block",
    fontFamily: 'var(--font-ui, "Noto Sans SC Variable", sans-serif)',
    fontSize: "0.72em",
    fontWeight: "650",
    marginBottom: "0.4em",
    opacity: "0.55",
  },
  ".cm-markra-frontmatter-editor": {
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "text",
    display: "block",
    fieldSizing: "content",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    fontSize: "inherit",
    fontStyle: "normal",
    fontWeight: "400",
    lineHeight: "inherit",
    margin: "0",
    minHeight: "1.5em",
    outline: "none",
    overflow: "hidden",
    overflowWrap: "anywhere",
    padding: "0",
    resize: "none",
    whiteSpace: "pre-wrap",
    width: "100%",
  },
  ".cm-markra-frontmatter-editor::selection": {
    background: "color-mix(in srgb, Highlight 72%, transparent)",
  },
});

export function frontmatterPreviewPlugin() {
  return defineMarkraPlugin({
    id: "markra.frontmatter-preview",
    extension: [
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;

          constructor(view: CodeMirrorView) {
            this.decorations = buildFrontmatterDecorations(view);
          }

          update(update: ViewUpdate) {
            if (
              update.docChanged ||
              update.focusChanged ||
              update.viewportChanged
            ) {
              this.decorations = buildFrontmatterDecorations(update.view);
            }
          }
        },
        { decorations: (plugin) => plugin.decorations },
      ),
      Prec.highest(keymap.of([
        { key: "Enter", run: createLeadingYamlFrontmatter },
        {
          key: "Backspace",
          run: (view) => removeFrontmatterAtBoundary(view, "backward"),
        },
        {
          key: "Delete",
          run: (view) => removeFrontmatterAtBoundary(view, "forward"),
        },
      ])),
      frontmatterTheme,
    ],
  });
}
