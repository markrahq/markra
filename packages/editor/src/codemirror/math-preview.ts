import { syntaxTree } from "@codemirror/language";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import {
  createMarkraMathMacros,
  isMarkraMathMacroDefinitionSource,
  renderMarkraMathToString,
  type MarkraMathMacros,
} from "../math-render.ts";
import {
  findMarkraMathRanges,
  type MarkraMathRange,
  type MarkraSourceRange,
} from "../math-syntax.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import { selectionRevealsRange } from "./policy.ts";
import {
  syntaxTreeChanged,
  transactionChangesStayAfter,
} from "./changes.ts";
import { codeMirrorVimModeChangedEffect } from "./vim.ts";

export type CodeMirrorMathRange = MarkraMathRange;

const codeNodeNames = new Set(["CodeBlock", "FencedCode", "InlineCode"]);

function codeRanges(state: EditorState) {
  const ranges: MarkraSourceRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (codeNodeNames.has(node.name)) ranges.push({ from: node.from, to: node.to });
    },
  });
  return ranges;
}

export function findCodeMirrorMathRanges(state: EditorState) {
  const source = state.doc.toString();
  return findMarkraMathRanges(source, codeRanges(state));
}

function activateMath(view: CodeMirrorView, range: CodeMirrorMathRange) {
  const offset = range.source.startsWith("$$") || range.source.startsWith(String.raw`\[`)
    ? 2
    : 1;
  view.focus();
  view.dispatch({ selection: { anchor: Math.min(range.to - 1, range.from + offset) } });
}

const estimatedEditorLineHeight = 26;

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

  get estimatedHeight() {
    if (this.range.kind !== "display") return -1;
    // Preserve roughly the source block's footprint until CodeMirror measures
    // the rendered formula, limiting scroll jumps for offscreen replacements.
    return Math.max(
      48,
      this.range.source.split("\n").length * estimatedEditorLineHeight,
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

  get estimatedHeight() {
    return this.range.source.includes("\n") ? 32 : -1;
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

function addMathReplacement(
  ranges: Range<Decoration>[],
  range: CodeMirrorMathRange,
  widget: WidgetType,
) {
  ranges.push(
    Decoration.replace({
      block: range.source.includes("\n"),
      widget,
    }).range(range.from, range.to),
  );
}

function renderMath(
  range: CodeMirrorMathRange,
  macros: MarkraMathMacros,
) {
  return renderMarkraMathToString(range.tex, range.kind, macros);
}

interface MathRenderEntry {
  readonly html: string;
  readonly macroDefinitionOnly: boolean;
  readonly range: CodeMirrorMathRange;
}

interface MathPreviewContext {
  readonly focused: boolean;
  readonly vimNormalMode: boolean;
}

interface MathDecorationState {
  readonly decorations: DecorationSet;
  readonly entries: readonly MathRenderEntry[];
  readonly context: MathPreviewContext;
  readonly lastRangeTo: number;
}

function buildMathRenderEntries(state: EditorState) {
  const macros = createMarkraMathMacros();
  return findCodeMirrorMathRanges(state).map((range): MathRenderEntry => ({
    html: renderMath(range, macros),
    macroDefinitionOnly:
      range.kind === "display" && isMarkraMathMacroDefinitionSource(range.tex),
    range,
  }));
}

function buildMathDecorations(
  state: EditorState,
  entries: readonly MathRenderEntry[],
  context: MathPreviewContext,
) {
  const ranges: Range<Decoration>[] = [];

  for (const { html, macroDefinitionOnly, range } of entries) {
    const active = selectionRevealsRange(
      state,
      context.focused,
      context.vimNormalMode,
      range.from,
      range.to,
    );

    if (macroDefinitionOnly) {
      if (active) continue;
      addMathReplacement(
        ranges,
        range,
        new MacroFoldWidget(range),
      );
      continue;
    }

    if (active) {
      if (range.kind === "display") {
        ranges.push(
          Decoration.widget({
            block: range.source.includes("\n"),
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

    addMathReplacement(
      ranges,
      range,
      new MathWidget(
        range,
        html,
        `markra-math-render markra-math-render-${range.kind}`,
      ),
    );
  }

  return Decoration.set(ranges, true);
}

function createMathDecorationState(
  state: EditorState,
  context: MathPreviewContext,
): MathDecorationState {
  const entries = buildMathRenderEntries(state);
  return {
    context,
    decorations: buildMathDecorations(state, entries, context),
    entries,
    lastRangeTo: Math.max(-1, ...entries.map(({ range }) => range.to)),
  };
}

function revealedMathRangesKey(
  state: EditorState,
  context: MathPreviewContext,
  entries: readonly MathRenderEntry[],
) {
  return entries.map(({ range }) =>
    selectionRevealsRange(
      state,
      context.focused,
      context.vimNormalMode,
      range.from,
      range.to,
    ) ? "1" : "0"
  ).join("");
}

const mathTheme = EditorView.baseTheme({
  ".markra-math-render": {
    appearance: "none",
    background: "transparent",
    border: "0",
    cursor: "text",
    font: "inherit",
    padding: "0",
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

const setMathPreviewFocusedEffect = StateEffect.define<boolean>();

function createMathPreviewExtension() {
  const initialContext: MathPreviewContext = {
    focused: true,
    vimNormalMode: false,
  };
  const field = StateField.define<MathDecorationState>({
    create(state) {
      return createMathDecorationState(state, initialContext);
    },
    update(previous, transaction) {
      const focusEffect = transaction.effects.find((effect) =>
        effect.is(setMathPreviewFocusedEffect)
      );
      const vimEffect = transaction.effects.find((effect) =>
        effect.is(codeMirrorVimModeChangedEffect)
      );
      const context = {
        focused: focusEffect?.value ?? previous.context.focused,
        vimNormalMode: vimEffect?.value ?? previous.context.vimNormalMode,
      };
      const contextChanged =
        context.focused !== previous.context.focused ||
        context.vimNormalMode !== previous.context.vimNormalMode;

      if (
        !contextChanged &&
        transactionChangesStayAfter(
          transaction,
          previous.lastRangeTo,
          (source) => /[$\\`~\n]/u.test(source),
        )
      ) {
        return {
          ...previous,
          decorations: previous.decorations.map(transaction.changes),
        };
      }

      if (
        transaction.docChanged ||
        syntaxTreeChanged(transaction.startState, transaction.state)
      ) {
        return createMathDecorationState(transaction.state, context);
      }

      const revealChanged =
        revealedMathRangesKey(
          transaction.startState,
          previous.context,
          previous.entries,
        ) !== revealedMathRangesKey(
          transaction.state,
          context,
          previous.entries,
        );
      if (!contextChanged && !revealChanged) return previous;

      return {
        ...previous,
        context,
        decorations: buildMathDecorations(
          transaction.state,
          previous.entries,
          context,
        ),
      };
    },
    // Layout-changing block replacements must come directly from editor state
    // so CodeMirror can keep its virtualized height map synchronized.
    provide: (mathField) => EditorView.decorations.from(
      mathField,
      (value) => value.decorations,
    ),
  });
  const mountedViews = new WeakSet<CodeMirrorView>();
  const syncFocusedState = (view: CodeMirrorView, focused: boolean) => {
    // Focus can move while an IME owns the editable DOM. Rebuilding block
    // decorations then can interrupt the active composition.
    if (!mountedViews.has(view) || view.compositionStarted) return;
    const previewState = view.state.field(field, false);
    if (!previewState || previewState.context.focused === focused) return;
    view.dispatch({ effects: setMathPreviewFocusedEffect.of(focused) });
  };
  const initializeFocus = ViewPlugin.define((view) => {
    mountedViews.add(view);
    queueMicrotask(() => {
      if (!view.hasFocus) syncFocusedState(view, false);
    });
    return {
      destroy() {
        mountedViews.delete(view);
      },
    };
  });

  return [
    field,
    initializeFocus,
    EditorView.domEventHandlers({
      blur(_event, view) {
        syncFocusedState(view, false);
      },
      focus(_event, view) {
        syncFocusedState(view, true);
      },
      compositionend(_event, view) {
        syncFocusedState(view, view.hasFocus);
      },
    }),
  ];
}

export function mathPreviewPlugin() {
  return defineMarkraPlugin({
    id: "markra.math-preview",
    extension: [
      ...createMathPreviewExtension(),
      mathTheme,
    ],
  });
}
