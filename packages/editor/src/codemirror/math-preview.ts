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
import {
  createMarkraMathMacros,
  isMarkraMathMacroDefinitionSource,
  renderMarkraMathToString,
  type MarkraMathKind,
  type MarkraMathMacros,
} from "../math-render.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import { cursorInsideRange, selectionChangeAffectsReveal } from "./policy.ts";
import { updateChangesStayAfter } from "./changes.ts";

export interface CodeMirrorMathRange {
  readonly from: number;
  readonly kind: MarkraMathKind;
  readonly source: string;
  readonly tex: string;
  readonly to: number;
}

interface SourceRange {
  readonly from: number;
  readonly to: number;
}

const codeNodeNames = new Set(["CodeBlock", "FencedCode", "InlineCode"]);

function isEscaped(source: string, index: number) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function overlaps(range: SourceRange, other: SourceRange) {
  return range.from < other.to && range.to > other.from;
}

function insideAnyRange(from: number, to: number, ranges: readonly SourceRange[]) {
  return ranges.some((range) => overlaps({ from, to }, range));
}

function codeRanges(state: EditorState) {
  const ranges: SourceRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (codeNodeNames.has(node.name)) ranges.push({ from: node.from, to: node.to });
    },
  });
  return ranges;
}

function findClosingDelimiter(
  source: string,
  from: number,
  delimiter: string,
  blocked: readonly SourceRange[],
) {
  let cursor = from;
  while (cursor < source.length) {
    const match = source.indexOf(delimiter, cursor);
    if (match < 0) return null;
    if (!isEscaped(source, match) && !insideAnyRange(match, match + delimiter.length, blocked)) {
      return match;
    }
    cursor = match + delimiter.length;
  }
  return null;
}

function displayMathRanges(source: string, blocked: readonly SourceRange[]) {
  const ranges: CodeMirrorMathRange[] = [];
  const delimiters = [
    { close: "$$", open: "$$" },
    { close: String.raw`\]`, open: String.raw`\[` },
  ] as const;

  for (const { close, open } of delimiters) {
    let cursor = 0;
    while (cursor < source.length) {
      const from = source.indexOf(open, cursor);
      if (from < 0) break;
      if (isEscaped(source, from) || insideAnyRange(from, from + open.length, blocked)) {
        cursor = from + open.length;
        continue;
      }

      const closeFrom = findClosingDelimiter(
        source,
        from + open.length,
        close,
        blocked,
      );
      if (closeFrom === null) break;

      const to = closeFrom + close.length;
      const range = {
        from,
        kind: "display" as const,
        source: source.slice(from, to),
        tex: source.slice(from + open.length, closeFrom).trim(),
        to,
      };
      ranges.push(range);
      blocked = [...blocked, range];
      cursor = to;
    }
  }

  return ranges;
}

function inlineDollarRanges(source: string, blocked: readonly SourceRange[]) {
  const ranges: CodeMirrorMathRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const from = source.indexOf("$", cursor);
    if (from < 0) break;
    const afterOpen = source[from + 1];
    if (
      source[from + 1] === "$" ||
      source[from - 1] === "$" ||
      isEscaped(source, from) ||
      !afterOpen ||
      /\s/u.test(afterOpen) ||
      insideAnyRange(from, from + 1, blocked)
    ) {
      cursor = from + 1;
      continue;
    }

    let closeFrom = from + 1;
    while (closeFrom < source.length) {
      closeFrom = source.indexOf("$", closeFrom);
      if (closeFrom < 0 || source.slice(from, closeFrom).includes("\n")) break;
      const beforeClose = source[closeFrom - 1];
      if (
        source[closeFrom + 1] !== "$" &&
        source[closeFrom - 1] !== "$" &&
        !isEscaped(source, closeFrom) &&
        beforeClose &&
        !/\s/u.test(beforeClose) &&
        !insideAnyRange(closeFrom, closeFrom + 1, blocked)
      ) {
        const to = closeFrom + 1;
        ranges.push({
          from,
          kind: "inline",
          source: source.slice(from, to),
          tex: source.slice(from + 1, closeFrom),
          to,
        });
        cursor = to;
        break;
      }
      closeFrom += 1;
    }

    if (closeFrom < 0 || source.slice(from, closeFrom).includes("\n")) cursor = from + 1;
  }

  return ranges;
}

function inlineHugoRanges(source: string, blocked: readonly SourceRange[]) {
  const ranges: CodeMirrorMathRange[] = [];
  const open = String.raw`\(`;
  const close = String.raw`\)`;
  let cursor = 0;

  while (cursor < source.length) {
    const from = source.indexOf(open, cursor);
    if (from < 0) break;
    if (insideAnyRange(from, from + open.length, blocked)) {
      cursor = from + open.length;
      continue;
    }
    const closeFrom = source.indexOf(close, from + open.length);
    if (
      closeFrom < 0 ||
      source.slice(from, closeFrom).includes("\n") ||
      insideAnyRange(closeFrom, closeFrom + close.length, blocked)
    ) {
      cursor = from + open.length;
      continue;
    }

    const to = closeFrom + close.length;
    ranges.push({
      from,
      kind: "inline",
      source: source.slice(from, to),
      tex: source.slice(from + open.length, closeFrom),
      to,
    });
    cursor = to;
  }

  return ranges;
}

export function findCodeMirrorMathRanges(state: EditorState) {
  const source = state.doc.toString();
  const code = codeRanges(state);
  const display = displayMathRanges(source, code);
  const blocked = [...code, ...display];
  const inline = [
    ...inlineDollarRanges(source, blocked),
    ...inlineHugoRanges(source, blocked),
  ];
  return [...display, ...inline].sort((left, right) => left.from - right.from);
}

function activateMath(view: CodeMirrorView, range: CodeMirrorMathRange) {
  const offset = range.source.startsWith("$$") || range.source.startsWith(String.raw`\[`)
    ? 2
    : 1;
  view.dispatch({ selection: { anchor: Math.min(range.to - 1, range.from + offset) } });
  view.focus();
}

class MathWidget extends WidgetType {
  constructor(
    readonly range: CodeMirrorMathRange,
    readonly html: string,
    readonly className: string,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return (
      other.range.source === this.range.source &&
      other.html === this.html &&
      other.className === this.className
    );
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = this.className;
    element.innerHTML = this.html;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", "Edit math source");
    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      activateMath(view, this.range);
    };
    element.addEventListener("mousedown", activate);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    return element;
  }
}

class MacroFoldWidget extends WidgetType {
  constructor(readonly range: CodeMirrorMathRange) {
    super();
  }

  eq(other: MacroFoldWidget) {
    return other.range.source === this.range.source;
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const button = view.dom.ownerDocument.createElement("button");
    button.className = "markra-math-macro-fold";
    button.type = "button";
    button.textContent = String.raw`\newcommand …`;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activateMath(view, this.range);
    });
    return button;
  }
}

function addMultilineReplacement(
  state: EditorState,
  ranges: Range<Decoration>[],
  range: CodeMirrorMathRange,
  widget: WidgetType,
) {
  const firstLine = state.doc.lineAt(range.from);
  const lastLine = state.doc.lineAt(range.to);
  const firstTo = Math.min(firstLine.to, range.to);
  ranges.push(Decoration.replace({ widget }).range(range.from, firstTo));

  for (let lineNumber = firstLine.number + 1; lineNumber <= lastLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const segmentFrom = line.from;
    const segmentTo = Math.min(line.to, range.to);
    if (segmentFrom >= segmentTo) continue;

    if (segmentFrom === line.from && segmentTo === line.to) {
      ranges.push(
        Decoration.line({ class: "cm-markra-math-hidden-line" }).range(line.from),
      );
    } else {
      ranges.push(Decoration.replace({}).range(segmentFrom, segmentTo));
    }
  }
}

function renderMath(
  range: CodeMirrorMathRange,
  macros: MarkraMathMacros,
) {
  return renderMarkraMathToString(range.tex, range.kind, macros);
}

interface MathDecorationState {
  readonly decorations: DecorationSet;
  readonly lastRangeTo: number;
}

function buildMathDecorations(view: CodeMirrorView): MathDecorationState {
  const ranges: Range<Decoration>[] = [];
  const macros = createMarkraMathMacros();
  const mathRanges = findCodeMirrorMathRanges(view.state);

  for (const range of mathRanges) {
    const macroDefinitionOnly =
      range.kind === "display" && isMarkraMathMacroDefinitionSource(range.tex);
    const active = cursorInsideRange(view, range.from, range.to);

    if (macroDefinitionOnly) {
      renderMath(range, macros);
      if (active) continue;
      addMultilineReplacement(
        view.state,
        ranges,
        range,
        new MacroFoldWidget(range),
      );
      continue;
    }

    const html = renderMath(range, macros);
    if (active) {
      if (range.kind === "display") {
        ranges.push(
          Decoration.widget({
            side: 1,
            widget: new MathWidget(
              range,
              html,
              "markra-math-render markra-math-render-display markra-math-render-active-preview",
            ),
          }).range(range.to),
        );
      }
      continue;
    }

    const widget = new MathWidget(
      range,
      html,
      `markra-math-render markra-math-render-${range.kind}`,
    );
    if (range.source.includes("\n")) {
      addMultilineReplacement(view.state, ranges, range, widget);
    } else {
      ranges.push(Decoration.replace({ widget }).range(range.from, range.to));
    }
  }

  return {
    decorations: Decoration.set(ranges, true),
    lastRangeTo: Math.max(-1, ...mathRanges.map((range) => range.to)),
  };
}

const mathTheme = EditorView.baseTheme({
  ".cm-markra-math-hidden-line": {
    display: "none",
  },
  ".markra-math-render": {
    cursor: "text",
  },
  ".markra-math-render-display": {
    display: "block",
    overflowX: "auto",
    padding: "0.4em 0",
    textAlign: "center",
  },
  ".markra-math-render-active-preview": {
    marginTop: "0.4em",
  },
});

export function mathPreviewPlugin() {
  return defineMarkraPlugin({
    id: "markra.math-preview",
    extension: [
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;
          lastRangeTo: number;

          constructor(view: CodeMirrorView) {
            const state = buildMathDecorations(view);
            this.decorations = state.decorations;
            this.lastRangeTo = state.lastRangeTo;
          }

          update(update: ViewUpdate) {
            if (
              updateChangesStayAfter(
                update,
                this.lastRangeTo,
                (source) => /[$\\`~\n]/u.test(source),
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
              const state = buildMathDecorations(update.view);
              this.decorations = state.decorations;
              this.lastRangeTo = state.lastRangeTo;
            }
          }
        },
        { decorations: (plugin) => plugin.decorations },
      ),
      mathTheme,
    ],
  });
}
