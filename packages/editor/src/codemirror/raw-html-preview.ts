import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
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
  sanitizeRawHtml,
  type ResolveRawHtmlSrc,
} from "../raw-html-sanitize.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import { cursorInsideRange, selectionChangeAffectsReveal } from "./policy.ts";
import { syntaxTreeChanged, updateChangesStayAfter } from "./changes.ts";

export interface RawHtmlPreviewPluginOptions {
  resolveImageSrc?: ResolveRawHtmlSrc;
}

interface CodeMirrorHtmlRange {
  readonly block: boolean;
  readonly from: number;
  readonly source: string;
  readonly to: number;
}

interface InlineHtmlBoundary {
  readonly from: number;
  readonly kind: "close" | "open" | "void";
  readonly parentFrom: number;
  readonly parentTo: number;
  readonly source: string;
  readonly tagName: string;
  readonly to: number;
}

const pairedInlineHtmlTags = new Set([
  "a",
  "abbr",
  "b",
  "code",
  "del",
  "em",
  "i",
  "kbd",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

const voidInlineHtmlTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function inlineHtmlBoundary(
  source: string,
  from: number,
  to: number,
  parentFrom: number,
  parentTo: number,
): InlineHtmlBoundary | null {
  const match = /^<\s*(\/?)\s*([A-Za-z][\w:.-]*)(?=[\s/>])[^<]*>$/u.exec(
    source.trim(),
  );
  const tagName = match?.[2]?.toLocaleLowerCase();
  if (!tagName) return null;
  const kind = match?.[1] === "/"
    ? "close"
    : /\/\s*>$/u.test(source) || voidInlineHtmlTags.has(tagName)
      ? "void"
      : "open";
  return { from, kind, parentFrom, parentTo, source, tagName, to };
}

function blockHtmlRanges(view: CodeMirrorView) {
  const ranges: CodeMirrorHtmlRange[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "HTMLBlock") return;
      ranges.push({
        block: true,
        from: node.from,
        source: view.state.sliceDoc(node.from, node.to),
        to: node.to,
      });
      return false;
    },
  });
  return ranges;
}

function overlaps(
  range: { from: number; to: number },
  other: { from: number; to: number },
) {
  return range.from < other.to && range.to > other.from;
}

function inlineHtmlRanges(
  view: CodeMirrorView,
  blocks: readonly CodeMirrorHtmlRange[],
) {
  const ranges: CodeMirrorHtmlRange[] = [];
  const groups = new Map<string, InlineHtmlBoundary[]>();
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "HTMLTag") return;
      if (blocks.some((block) => overlaps(node, block))) return;
      const parent = node.node.parent;
      if (!parent) return;
      const boundary = inlineHtmlBoundary(
        view.state.sliceDoc(node.from, node.to),
        node.from,
        node.to,
        parent.from,
        parent.to,
      );
      if (!boundary) return;
      const key = `${parent.from}:${parent.to}`;
      const group = groups.get(key) ?? [];
      group.push(boundary);
      groups.set(key, group);
    },
  });

  for (const boundaries of groups.values()) {
    const stack: InlineHtmlBoundary[] = [];
    for (const boundary of boundaries.sort((left, right) => left.from - right.from)) {
      if (boundary.kind === "void") continue;
      if (boundary.kind === "open") {
        stack.push(boundary);
        continue;
      }
      const opening = stack.at(-1);
      if (!opening || opening.tagName !== boundary.tagName) {
        stack.length = 0;
        continue;
      }
      stack.pop();
      // Emitting only the outer pair avoids overlapping replacement
      // decorations for nested HTML, which CodeMirror cannot render safely.
      if (stack.length > 0 || !pairedInlineHtmlTags.has(opening.tagName)) {
        continue;
      }
      ranges.push({
        block: opening.source.includes("\n") ||
          view.state.sliceDoc(opening.from, boundary.to).includes("\n"),
        from: opening.from,
        source: view.state.sliceDoc(opening.from, boundary.to),
        to: boundary.to,
      });
    }
  }
  return ranges.sort((left, right) => left.from - right.from);
}

function activateHtml(view: CodeMirrorView, range: CodeMirrorHtmlRange) {
  view.dispatch({
    selection: { anchor: Math.min(range.to - 1, range.from + 1) },
    scrollIntoView: true,
  });
  view.focus();
}

class RawHtmlWidget extends WidgetType {
  constructor(
    readonly range: CodeMirrorHtmlRange,
    readonly options: RawHtmlPreviewPluginOptions,
  ) {
    super();
  }

  eq(other: RawHtmlWidget) {
    return other.range.source === this.range.source && other.range.block === this.range.block;
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const nodes = sanitizeRawHtml(this.range.source, document, this.options);
    const wrapper = this.range.block ? document.createElement("div") : null;
    let root: HTMLElement;

    if (!this.range.block && nodes.length === 1 && nodes[0] instanceof HTMLElement) {
      root = nodes[0];
      root.classList.add("cm-markra-inline-html");
    } else {
      root = wrapper ?? document.createElement("span");
      root.append(...nodes);
      root.classList.add(this.range.block ? "markra-html-node" : "cm-markra-inline-html");
    }

    root.dataset.type = "html";
    root.dataset.value = this.range.source;
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", "Edit HTML source");
    const activate = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      activateHtml(view, this.range);
    };
    root.addEventListener("mousedown", activate);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    return root;
  }
}

function addBlockReplacement(
  view: CodeMirrorView,
  ranges: Range<Decoration>[],
  range: CodeMirrorHtmlRange,
  widget: WidgetType,
) {
  const firstLine = view.state.doc.lineAt(range.from);
  const lastLine = view.state.doc.lineAt(range.to);
  const firstTo = Math.min(firstLine.to, range.to);
  ranges.push(Decoration.replace({ widget }).range(range.from, firstTo));

  for (let lineNumber = firstLine.number + 1; lineNumber <= lastLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const segmentTo = Math.min(line.to, range.to);
    if (line.from >= segmentTo) continue;
    if (segmentTo === line.to) {
      ranges.push(
        Decoration.line({ class: "cm-markra-html-hidden-line" }).range(line.from),
      );
    } else {
      ranges.push(Decoration.replace({}).range(line.from, segmentTo));
    }
  }
}

function buildRawHtmlDecorations(
  view: CodeMirrorView,
  options: RawHtmlPreviewPluginOptions,
) {
  const ranges: Range<Decoration>[] = [];
  const blocks = blockHtmlRanges(view);
  const htmlRanges = [...blocks, ...inlineHtmlRanges(view, blocks)].sort(
    (left, right) => left.from - right.from,
  );

  for (const range of htmlRanges) {
    if (cursorInsideRange(view, range.from, range.to)) continue;
    const widget = new RawHtmlWidget(range, options);
    if (range.block && range.source.includes("\n")) {
      addBlockReplacement(view, ranges, range, widget);
    } else {
      ranges.push(Decoration.replace({ widget }).range(range.from, range.to));
    }
  }

  return {
    decorations: Decoration.set(ranges, true),
    lastRangeTo: Math.max(-1, ...htmlRanges.map((range) => range.to)),
  };
}

function changedLinesMayContainRawHtml(update: ViewUpdate) {
  let mayContainHtml = false;
  update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const firstLine = update.state.doc.lineAt(fromB).number;
    const lastLine = update.state.doc.lineAt(toB).number;
    for (
      let lineNumber = firstLine;
      lineNumber <= lastLine;
      lineNumber += 1
    ) {
      if (/[<>]/u.test(update.state.doc.line(lineNumber).text)) {
        mayContainHtml = true;
        return;
      }
    }
  });
  return mayContainHtml;
}

const rawHtmlTheme = EditorView.baseTheme({
  ".cm-markra-html-hidden-line": {
    display: "none",
  },
  ".markra-html-node": {
    display: "block",
    maxWidth: "100%",
  },
  ".markra-html-node img": {
    maxWidth: "100%",
  },
  ".cm-markra-inline-html": {
    cursor: "text",
  },
});

export function rawHtmlPreviewPlugin(
  options: RawHtmlPreviewPluginOptions = {},
) {
  return defineMarkraPlugin({
    id: "markra.raw-html-preview",
    extension: [
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;
          lastRangeTo: number;

          constructor(view: CodeMirrorView) {
            const state = buildRawHtmlDecorations(view, options);
            this.decorations = state.decorations;
            this.lastRangeTo = state.lastRangeTo;
          }

          update(update: ViewUpdate) {
            if (
              !changedLinesMayContainRawHtml(update) &&
              updateChangesStayAfter(
                update,
                this.lastRangeTo,
                (source) => /[<>\n]/u.test(source),
              )
            ) {
              this.decorations = this.decorations.map(update.changes);
              return;
            }
            if (
              update.docChanged ||
              selectionChangeAffectsReveal(update) ||
              update.focusChanged ||
              update.viewportChanged ||
              syntaxTreeChanged(update.startState, update.state)
            ) {
              const state = buildRawHtmlDecorations(update.view, options);
              this.decorations = state.decorations;
              this.lastRangeTo = state.lastRangeTo;
            }
          }
        },
        { decorations: (plugin) => plugin.decorations },
      ),
      rawHtmlTheme,
    ],
  });
}
