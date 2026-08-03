import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView as CodeMirrorView,
  type ViewUpdate,
} from "@codemirror/view";
import { defineMarkraPlugin } from "./plugin.ts";
import { cursorInsideRange, selectionChangeAffectsReveal } from "./policy.ts";
import { updateChangesStayAfter } from "./changes.ts";

interface FootnoteDefinition {
  readonly content: string;
  readonly contentFrom: number;
  readonly from: number;
  readonly label: string;
  readonly markerTo: number;
  readonly to: number;
}

interface FootnoteReference {
  readonly definition: FootnoteDefinition | null;
  readonly from: number;
  readonly label: string;
  readonly to: number;
}

const definitionPattern = /^[ \t]{0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/u;
const referencePattern = /\[\^([^\]\s]+)\]/gu;
const codeNodeNames = new Set(["CodeBlock", "FencedCode", "InlineCode"]);

function activateFootnoteSource(
  view: CodeMirrorView,
  from: number,
  to: number,
) {
  view.dispatch({
    selection: { anchor: Math.min(to - 1, from + 1) },
    scrollIntoView: true,
  });
  view.focus();
}

function isEscaped(source: string, index: number) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function codeRanges(state: EditorState) {
  const ranges: Array<{ from: number; to: number }> = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (codeNodeNames.has(node.name)) ranges.push({ from: node.from, to: node.to });
    },
  });
  return ranges;
}

function rangeContains(
  ranges: readonly { from: number; to: number }[],
  from: number,
  to: number,
) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function readFootnoteDefinitions(state: EditorState) {
  const definitions: FootnoteDefinition[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = definitionPattern.exec(line.text);
    const label = match?.[1];
    if (!match || !label) continue;

    const markerText = match[0].slice(0, match[0].length - (match[2]?.length ?? 0));
    const bodyOffset = line.text.length - (match[2]?.length ?? 0);
    const contentLines = [match[2] ?? ""];
    let to = line.to;
    let continuationLine = lineNumber + 1;
    while (continuationLine <= state.doc.lines) {
      const continuation = state.doc.line(continuationLine);
      const continuationMatch = /^(?: {4}|\t)(.*)$/u.exec(continuation.text);
      if (!continuationMatch) break;
      contentLines.push(continuationMatch[1] ?? "");
      to = continuation.to;
      continuationLine += 1;
    }

    definitions.push({
      content: contentLines.join(" ").replace(/\s+/gu, " ").trim(),
      contentFrom: line.from + bodyOffset,
      from: line.from,
      label,
      markerTo: line.from + markerText.length,
      to,
    });
    lineNumber = continuationLine - 1;
  }

  return definitions;
}

function readFootnoteReferences(
  state: EditorState,
  definitions: readonly FootnoteDefinition[],
) {
  const source = state.doc.toString();
  const blocked = [...codeRanges(state), ...definitions];
  const byLabel = new Map(definitions.map((definition) => [definition.label, definition]));
  const references: FootnoteReference[] = [];

  referencePattern.lastIndex = 0;
  for (const match of source.matchAll(referencePattern)) {
    const label = match[1];
    const from = match.index;
    const to = from + match[0].length;
    if (!label || isEscaped(source, from) || rangeContains(blocked, from, to)) continue;
    references.push({ definition: byLabel.get(label) ?? null, from, label, to });
  }
  return references;
}

class FootnoteReferenceWidget extends WidgetType {
  constructor(readonly reference: FootnoteReference) {
    super();
  }

  eq(other: FootnoteReferenceWidget) {
    return (
      other.reference.label === this.reference.label &&
      other.reference.definition?.content === this.reference.definition?.content
    );
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const reference = document.createElement("sup");
    const button = document.createElement("button");
    let preview: HTMLElement | null = null;

    reference.className = "cm-markra-footnote-reference";
    button.type = "button";
    button.textContent = this.reference.label;
    button.setAttribute("aria-label", `Footnote ${this.reference.label}`);
    reference.append(button);

    const closePreview = () => {
      preview?.remove();
      preview = null;
    };
    const openPreview = () => {
      const definition = this.reference.definition;
      if (!definition || preview) return;
      preview = document.createElement("span");
      preview.className = "markra-footnote-preview";
      preview.textContent = definition.content || `Footnote ${definition.label}`;
      preview.setAttribute("role", "tooltip");
      reference.append(preview);
    };
    const navigate = (event: Event) => {
      const definition = this.reference.definition;
      if (!definition) return;
      event.preventDefault();
      event.stopPropagation();
      closePreview();
      view.dispatch({ selection: { anchor: definition.contentFrom }, scrollIntoView: true });
      view.focus();
    };
    const activateSource = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      closePreview();
      activateFootnoteSource(view, this.reference.from, this.reference.to);
    };
    const handleClick = (event: MouseEvent) => {
      if ((event.metaKey || event.ctrlKey) && this.reference.definition) {
        navigate(event);
        return;
      }
      activateSource(event);
    };

    reference.addEventListener("mouseenter", openPreview);
    reference.addEventListener("mouseleave", closePreview);
    reference.addEventListener("focusin", openPreview);
    reference.addEventListener("focusout", closePreview);
    reference.addEventListener("mousedown", (event) => {
      if (event.metaKey || event.ctrlKey) return;
      activateSource(event);
    });
    reference.addEventListener("click", handleClick);
    return reference;
  }
}

class FootnoteDefinitionLabelWidget extends WidgetType {
  constructor(readonly definition: FootnoteDefinition) {
    super();
  }

  eq(other: FootnoteDefinitionLabelWidget) {
    return (
      other.definition.label === this.definition.label &&
      other.definition.from === this.definition.from &&
      other.definition.markerTo === this.definition.markerTo
    );
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const label = view.dom.ownerDocument.createElement("span");
    label.className = "cm-markra-footnote-definition-label";
    label.textContent = this.definition.label;
    label.setAttribute("aria-label", `Edit footnote ${this.definition.label} source`);
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      activateFootnoteSource(
        view,
        this.definition.from,
        this.definition.markerTo,
      );
    };
    label.addEventListener("mousedown", activate);
    label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    return label;
  }
}

interface FootnoteDecorationState {
  readonly decorations: DecorationSet;
  readonly lastRangeTo: number;
}

function buildFootnoteDecorations(view: CodeMirrorView): FootnoteDecorationState {
  const ranges: Range<Decoration>[] = [];
  const definitions = readFootnoteDefinitions(view.state);
  const references = readFootnoteReferences(view.state, definitions);

  for (const reference of references) {
    if (cursorInsideRange(view, reference.from, reference.to)) continue;
    ranges.push(
      Decoration.replace({ widget: new FootnoteReferenceWidget(reference) }).range(
        reference.from,
        reference.to,
      ),
    );
  }

  for (const definition of definitions) {
    const firstLine = view.state.doc.lineAt(definition.from);
    const lastLine = view.state.doc.lineAt(definition.to);
    for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
      ranges.push(
        Decoration.line({ class: "cm-markra-footnote-definition" }).range(
          view.state.doc.line(lineNumber).from,
        ),
      );
    }
    if (cursorInsideRange(view, definition.from, definition.to)) continue;
    ranges.push(
      Decoration.replace({
        widget: new FootnoteDefinitionLabelWidget(definition),
      }).range(definition.from, definition.markerTo),
    );
  }

  return {
    decorations: Decoration.set(ranges, true),
    lastRangeTo: Math.max(
      -1,
      ...definitions.map((definition) => definition.to),
      ...references.map((reference) => reference.to),
    ),
  };
}

const footnoteTheme = EditorView.baseTheme({
  ".cm-markra-footnote-reference": {
    color: "var(--accent, currentColor)",
    fontSize: "0.75em",
    lineHeight: "1",
    position: "relative",
    verticalAlign: "super",
  },
  ".cm-markra-footnote-reference > button": {
    background: "transparent",
    border: "0",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    padding: "0 0.12em",
  },
  ".markra-footnote-preview": {
    background: "var(--editor-paper-bg, Canvas)",
    border: "1px solid var(--editor-border, currentColor)",
    borderRadius: "0.45em",
    boxShadow: "0 0.5em 1.5em rgb(0 0 0 / 16%)",
    color: "var(--text-primary, CanvasText)",
    fontSize: "0.95rem",
    left: "0",
    lineHeight: "1.45",
    maxWidth: "20rem",
    padding: "0.6em 0.75em",
    position: "absolute",
    top: "calc(100% + 0.35em)",
    width: "max-content",
    zIndex: "20",
  },
  ".cm-markra-footnote-definition": {
    color: "var(--text-secondary, currentColor)",
  },
  ".cm-markra-footnote-definition-label": {
    color: "var(--accent, currentColor)",
    cursor: "pointer",
    fontSize: "0.82em",
    fontWeight: "650",
    marginRight: "0.45em",
  },
});

export function footnotePreviewPlugin() {
  return defineMarkraPlugin({
    id: "markra.footnote-preview",
    extension: [
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;
          lastRangeTo: number;

          constructor(view: CodeMirrorView) {
            const state = buildFootnoteDecorations(view);
            this.decorations = state.decorations;
            this.lastRangeTo = state.lastRangeTo;
          }

          update(update: ViewUpdate) {
            if (
              updateChangesStayAfter(
                update,
                this.lastRangeTo,
                (source) => /[\[\]^:`~\n]/u.test(source),
              )
            ) {
              this.decorations = this.decorations.map(update.changes);
              return;
            }
            if (
              update.docChanged ||
              selectionChangeAffectsReveal(update) ||
              update.focusChanged ||
              update.viewportChanged
            ) {
              const state = buildFootnoteDecorations(update.view);
              this.decorations = state.decorations;
              this.lastRangeTo = state.lastRangeTo;
            }
          }
        },
        { decorations: (plugin) => plugin.decorations },
      ),
      footnoteTheme,
    ],
  });
}
