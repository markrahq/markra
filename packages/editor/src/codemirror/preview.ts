import { syntaxTree } from "@codemirror/language";
import type { Extension, Range, Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  revealActiveLine,
  selectionChangeAffectsReveal,
  type RevealPolicy,
  type RevealScope,
} from "./policy.ts";
import {
  getMarkraRenderers,
  type MarkraRenderer,
  type MarkraSyntaxNode,
} from "./renderers.ts";
import {
  resolveAutolinkTarget,
  resolveSafeLinkTarget,
  type MarkraLinkSourceContext,
} from "./links.ts";
import { unescapeMarkdown } from "./syntax.ts";
import { createTaskDecoration } from "./tasks.ts";

const HEADING_CLASSES: Readonly<Record<string, string>> = {
  ATXHeading1: "cm-markra-h1",
  ATXHeading2: "cm-markra-h2",
  ATXHeading3: "cm-markra-h3",
  ATXHeading4: "cm-markra-h4",
  ATXHeading5: "cm-markra-h5",
  ATXHeading6: "cm-markra-h6",
  SetextHeading1: "cm-markra-h1",
  SetextHeading2: "cm-markra-h2",
};

const HEADING_LEVELS: Readonly<Record<string, string>> = {
  ATXHeading1: "1",
  ATXHeading2: "2",
  ATXHeading3: "3",
  ATXHeading4: "4",
  ATXHeading5: "5",
  ATXHeading6: "6",
  SetextHeading1: "1",
  SetextHeading2: "2",
};

const INLINE_CLASSES: Readonly<Record<string, string>> = {
  Autolink: "cm-markra-link",
  StrongEmphasis: "cm-markra-strong",
  Emphasis: "cm-markra-emphasis",
  InlineCode: "cm-markra-inline-code",
  Strikethrough: "cm-markra-strikethrough",
  Link: "cm-markra-link",
  Highlight: "cm-markra-highlight",
};

const BLOCK_CLASSES: Readonly<Record<string, string>> = {
  Blockquote: "cm-markra-blockquote",
  Paragraph: "cm-markra-paragraph",
};

const HIDEABLE_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "QuoteMark",
  "LinkMark",
  "LinkTitle",
  "HighlightMark",
  "ListMark",
]);

const LINK_SYNTAX = new Set(["LinkMark", "LinkTitle", "URL"]);
const INLINE_WRAPPER_MARKS = new Set([
  "CodeMark",
  "EmphasisMark",
  "HighlightMark",
  "StrikethroughMark",
]);
const INLINE_WRAPPERS = new Set([
  "Emphasis",
  "Highlight",
  "InlineCode",
  "Strikethrough",
  "StrongEmphasis",
]);
const PREFORMATTED_BLOCKS = new Set([
  "BlockMath",
  "CodeBlock",
  "FencedCode",
  "Frontmatter",
  "HTMLBlock",
]);

const LIST_ITEM_PATTERN = /^([\t ]*)([-+*]|\d+[.)])[\t ]+(\[[ xX]\][\t ]+)?/u;

function listLineAttributes(source: string) {
  const match = LIST_ITEM_PATTERN.exec(source);
  if (!match) return null;

  const sourceMarker = match[2] ?? "-";
  const kind = match[3]
    ? "task"
    : /^\d/u.test(sourceMarker)
      ? "ordered"
      : "bullet";

  return {
    kind,
    marker: kind === "ordered" ? sourceMarker : "•",
  };
}

function listDepth(node: MarkraSyntaxNode) {
  let depth = 0;
  let parent = node.parent;
  while (parent) {
    if (parent.name === "ListItem") depth += 1;
    parent = parent.parent;
  }
  return depth;
}

function isInsidePreformattedBlock(
  tree: ReturnType<typeof syntaxTree>,
  position: number,
) {
  let node: ReturnType<typeof tree.resolveInner> | null =
    tree.resolveInner(position, 1);
  while (node) {
    if (PREFORMATTED_BLOCKS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

function headingAriaLabel(source: string, setext: boolean) {
  const title = setext
    ? source
    : source
        .replace(/^[\t ]{0,3}#{1,6}[\t ]+/u, "")
        .replace(/[\t ]+#+[\t ]*$/u, "");

  return title
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[*_~=`]/gu, "")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/gu, "$1")
    .trim();
}

export interface LivePreviewConfig {
  resolveLinkTarget?: (context: MarkraLinkSourceContext) => string | null;
  reveal?: RevealPolicy;
  taskCheckboxes?: boolean;
}

function resolveLinkHref(
  nodeName: string,
  source: string,
  view: EditorView,
  resolveTarget: LivePreviewConfig["resolveLinkTarget"],
) {
  const candidate = nodeName === "Link" ? source : resolveAutolinkTarget(source);
  if (!candidate) return null;
  if (!resolveTarget) {
    return nodeName === "Link" ? resolveSafeLinkTarget(candidate) : candidate;
  }

  let target: string | null;
  try {
    target = resolveTarget({ source: candidate, state: view.state, view });
  } catch {
    return null;
  }
  const normalizedTarget = target?.trim();
  return normalizedTarget ? normalizedTarget : null;
}

class LinkIconWidget extends WidgetType {
  eq(other: LinkIconWidget) {
    return other instanceof LinkIconWidget;
  }

  toDOM(view: EditorView) {
    const icon = view.dom.ownerDocument.createElement("span");
    icon.ariaHidden = "true";
    icon.className = "cm-markra-link-icon";
    icon.contentEditable = "false";
    icon.draggable = false;
    return icon;
  }
}

const linkIconWidget = new LinkIconWidget();

function isLinkDestination(name: string, parentName: string | undefined) {
  return name === "URL" && parentName === "Link";
}

function isFootnoteLinkSyntax(state: EditorView["state"], node: MarkraSyntaxNode) {
  let current: MarkraSyntaxNode | null = node;
  while (current) {
    if (
      (current.name === "Link" || current.name === "LinkReference") &&
      state.sliceDoc(current.from, Math.min(current.to, current.from + 2)) === "[^"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function pushHiddenRange(
  ranges: Range<Decoration>[],
  doc: Text,
  from: number,
  to: number,
) {
  let cursor = from;

  // CodeMirror view plugins cannot replace a range that crosses a line break.
  // Splitting here keeps custom Markdown parsers safe to compose with Markra.
  while (cursor < to) {
    const line = doc.lineAt(cursor);
    const segmentEnd = Math.min(to, line.to);
    if (cursor < segmentEnd) {
      ranges.push(Decoration.replace({}).range(cursor, segmentEnd));
    }
    cursor = line.to + 1;
  }
}

function buildDecorations(
  view: EditorView,
  reveal: RevealPolicy,
  taskCheckboxes: boolean,
  resolveLinkTarget: LivePreviewConfig["resolveLinkTarget"],
) {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const decoratedHeadingLines = new Set<number>();
  const decoratedBlockLines = new Set<string>();
  const decoratedEmptyLines = new Set<number>();
  const decoratedListLines = new Set<number>();
  const decoratedNodes = new Set<string>();
  const rendererClaimedNodes = new Set<string>();
  const tree = syntaxTree(state);
  type SyntaxNode = Parameters<
    NonNullable<Parameters<typeof tree.iterate>[0]["enter"]>
  >[0];

  const addNodeDecorations = (
    node: SyntaxNode,
    visibleRange: { from: number; to: number },
  ) => {
    // Block nodes may span multiple disjoint visible ranges around folds. They
    // must be revisited per range, but only the actually drawn lines are styled.
    const visibleNodeFrom = Math.max(node.from, visibleRange.from);
    const visibleNodeTo = Math.min(node.to, visibleRange.to);
    if (visibleNodeFrom < visibleNodeTo) {
      const blockClass = BLOCK_CLASSES[node.name];
      if (blockClass) {
        const firstLine = state.doc.lineAt(visibleNodeFrom).number;
        const lastLine = state.doc.lineAt(visibleNodeTo - 1).number;
        for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
          const line = state.doc.line(lineNumber);
          const key = `${blockClass}:${line.from}`;
          if (!decoratedBlockLines.has(key)) {
            decoratedBlockLines.add(key);
            ranges.push(Decoration.line({ class: blockClass }).range(line.from));
          }
        }
      }
    }

    const nodeKey = `${node.name}:${node.from}:${node.to}`;
    const renderers = getMarkraRenderers(state, node.name);
    const runRenderer = (renderer: MarkraRenderer) =>
      renderer.render({
        add(range) {
          ranges.push(range);
        },
        node: node.node as MarkraSyntaxNode,
        revealed(scope = "node") {
          return reveal({
            view,
            state,
            from: node.from,
            to: node.to,
            nodeName: node.name,
            scope,
          });
        },
        state,
        view,
        visibleRange,
      });

    for (const renderer of renderers) {
      if (renderer.scope !== "visible-range") continue;
      if (runRenderer(renderer) === false) {
        rendererClaimedNodes.add(nodeKey);
        return false;
      }
    }

    if (decoratedNodes.has(nodeKey)) {
      return rendererClaimedNodes.has(nodeKey) ? false : undefined;
    }
    decoratedNodes.add(nodeKey);

    for (const renderer of renderers) {
      if (renderer.scope === "visible-range") continue;
      if (runRenderer(renderer) === false) {
        // A renderer that replaces a whole syntax node must claim its children
        // so base marker decorations cannot overlap the replacement range.
        rendererClaimedNodes.add(nodeKey);
        return false;
      }
    }

    if (taskCheckboxes && node.name === "TaskMarker") {
      const taskDecoration = createTaskDecoration(
        state,
        node.from,
        node.to,
      );
      if (taskDecoration) ranges.push(taskDecoration);
    }

    if (node.name === "ListItem") {
      const line = state.doc.lineAt(node.from);
      const listAttributes = listLineAttributes(line.text);
      if (listAttributes && !decoratedListLines.has(line.from)) {
        decoratedListLines.add(line.from);
        const listMark = node.node.getChild("ListMark");
        const sourceVisible = reveal({
          view,
          state,
          from: listMark?.from ?? line.from,
          to: listMark?.to ?? line.from,
          nodeName: "ListMark",
          scope: "line",
        });
        ranges.push(
          Decoration.line({
            attributes: {
              "data-list-depth": String(
                listDepth(node.node as MarkraSyntaxNode),
              ),
              "data-list-kind": listAttributes.kind,
              "data-list-marker": listAttributes.marker,
              "data-markra-list-source": sourceVisible ? "visible" : "hidden",
            },
            class: "cm-markra-list-item",
          }).range(line.from),
        );
      }
    }

    const headingClass = HEADING_CLASSES[node.name];
    if (headingClass) {
      const line = state.doc.lineAt(node.from);
      if (!decoratedHeadingLines.has(line.from)) {
        decoratedHeadingLines.add(line.from);
        ranges.push(
          Decoration.line({
            attributes: {
              "aria-label": headingAriaLabel(
                line.text,
                node.name.startsWith("Setext"),
              ),
              "aria-level": HEADING_LEVELS[node.name] ?? "1",
              role: "heading",
            },
            class: headingClass,
          }).range(line.from),
        );
      }
    }

    const parentName = node.node.parent?.name;
    const standaloneUrl =
      node.name === "URL" &&
      parentName !== "Autolink" &&
      parentName !== "Image" &&
      parentName !== "Link";
    const linkLike =
      node.name === "Link" || node.name === "Autolink" || standaloneUrl;
    const inlineClass = INLINE_CLASSES[node.name] ??
      (standaloneUrl ? "cm-markra-link" : undefined);
    if (inlineClass && node.from < node.to) {
      const linkUrl = node.name === "URL"
        ? node.node
        : linkLike
          ? node.node.getChild("URL")
          : null;
      const linkSource = linkUrl
        ? unescapeMarkdown(state.sliceDoc(linkUrl.from, linkUrl.to).trim())
        : null;
      const linkHref = linkSource
        ? resolveLinkHref(node.name, linkSource, view, resolveLinkTarget)
        : null;
      const linkRevealed = linkLike && reveal({
        view,
        state,
        from: node.from,
        to: node.to,
        nodeName: node.name,
        scope: "node",
      });

      if (linkLike && linkRevealed) {
        const marks = node.name === "Link"
          ? node.node.getChildren("LinkMark")
          : [];
        const labelFrom = marks[0]?.to ?? linkUrl?.from;
        const labelTo = marks[1]?.from ?? linkUrl?.to;
        if (
          labelFrom !== undefined &&
          labelTo !== undefined &&
          labelFrom < labelTo
        ) {
          if (node.from < labelFrom) {
            ranges.push(
              Decoration.mark({
                class: "cm-markra-link-source",
              }).range(node.from, labelFrom),
            );
          }
          ranges.push(
            Decoration.mark({
              class: "cm-markra-link-source-label",
            }).range(labelFrom, labelTo),
          );
          if (labelTo < node.to) {
            ranges.push(
              Decoration.mark({
                class: "cm-markra-link-source",
              }).range(labelTo, node.to),
            );
          }
        }
      } else {
        ranges.push(
          Decoration.mark({
            class: inlineClass,
            ...(linkHref
              ? {
                  attributes: {
                    draggable: "false",
                    href: linkHref,
                  },
                  tagName: "a",
                }
              : {}),
          }).range(node.from, node.to),
        );

        if (linkLike) {
          const iconPosition = node.name === "Link"
            ? node.node.getChildren("LinkMark")[1]?.from
            : linkUrl?.to;
          if (iconPosition !== undefined) {
            ranges.push(
              Decoration.widget({
                side: 1,
                widget: linkIconWidget,
              }).range(iconPosition),
            );
          }
        }
      }
    }

    const taskSourceRemainsVisible =
      node.name === "ListMark" &&
      !taskCheckboxes &&
      listLineAttributes(state.doc.lineAt(node.from).text)?.kind === "task";
    const isHideable =
      !isFootnoteLinkSyntax(state, node.node as MarkraSyntaxNode) &&
      !taskSourceRemainsVisible &&
      (HIDEABLE_MARKS.has(node.name) ||
        isLinkDestination(node.name, parentName));

    let revealFrom = node.from;
    let revealTo = node.to;
    let revealScope: RevealScope = "line";

    if (LINK_SYNTAX.has(node.name)) {
      let parent = node.node.parent;
      while (
        parent &&
        parent.name !== "Autolink" &&
        parent.name !== "Link" &&
        parent.name !== "Image"
      ) {
        parent = parent.parent;
      }
      if (
        parent?.name === "Autolink" ||
        parent?.name === "Link" ||
        parent?.name === "Image"
      ) {
        revealFrom = parent.from;
        revealTo = parent.to;
        revealScope = "node";
      }
    } else if (INLINE_WRAPPER_MARKS.has(node.name)) {
      const wrapper = node.node.parent;
      if (wrapper && INLINE_WRAPPERS.has(wrapper.name)) {
        // Paired delimiters must reveal as one unit. Revealing each mark by
        // itself leaves an orphan closing marker when the text is active.
        revealFrom = wrapper.from;
        revealTo = wrapper.to;
        revealScope = "node";
      }
    }

    if (
      isHideable &&
      node.from < node.to &&
      !reveal({
        view,
        state,
        from: revealFrom,
        to: revealTo,
        nodeName: node.name,
        scope: revealScope,
      })
    ) {
      let hideTo = node.to;
      if (
        node.name === "HeaderMark" ||
        node.name === "QuoteMark" ||
        node.name === "ListMark"
      ) {
        while (
          hideTo < state.doc.length &&
          state.doc.sliceString(hideTo, hideTo + 1) === " "
        ) {
          hideTo += 1;
        }
      }
      // Nested list indentation belongs to Markdown source. Hide it together
      // with the marker so preview layout is driven only by semantic depth.
      const hideFrom = node.name === "ListMark"
        ? state.doc.lineAt(node.from).from
        : node.from;
      pushHiddenRange(ranges, state.doc, hideFrom, hideTo);
    }
  };

  for (const visibleRange of view.visibleRanges) {
    const firstVisibleLine = state.doc.lineAt(visibleRange.from).number;
    const lastVisibleLine = state.doc.lineAt(visibleRange.to).number;
    for (
      let lineNumber = firstVisibleLine;
      lineNumber <= lastVisibleLine;
      lineNumber += 1
    ) {
      const line = state.doc.line(lineNumber);
      if (
        line.length === 0 &&
        !decoratedEmptyLines.has(line.from) &&
        !isInsidePreformattedBlock(tree, line.from)
      ) {
        decoratedEmptyLines.add(line.from);
        ranges.push(
          Decoration.line({
            attributes: {
              "data-markra-empty-source": reveal({
                view,
                state,
                from: line.from,
                to: line.to,
                nodeName: "EmptyLine",
                scope: "line",
              })
                ? "visible"
                : "hidden",
            },
            class: "cm-markra-empty-line",
          }).range(line.from),
        );
      }
    }

    tree.iterate({
      from: visibleRange.from,
      to: visibleRange.to,
      enter(node) {
        return addNodeDecorations(node, visibleRange);
      },
    });
  }

  return Decoration.set(ranges, true);
}

function previewPlugin(config: LivePreviewConfig): Extension {
  const reveal = config.reveal ?? revealActiveLine;
  const taskCheckboxes = config.taskCheckboxes ?? true;
  const resolveLinkTarget = config.resolveLinkTarget;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      composing: boolean;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(
          view,
          reveal,
          taskCheckboxes,
          resolveLinkTarget,
        );
        this.composing = view.composing;
      }

      update(update: ViewUpdate) {
        const compositionEnded = this.composing && !update.view.composing;
        this.composing = update.view.composing;

        if (this.composing) {
          // Mapping preserves the current DOM while the platform owns the
          // composition range. A full rebuild at this point can cancel IME.
          this.decorations = this.decorations.map(update.changes);
          return;
        }

        const reconfigured = update.transactions.some(
          (transaction) => transaction.reconfigured,
        );
        const syntaxTreeChanged =
          !update.selectionSet &&
          update.transactions.length > 0 &&
          syntaxTree(update.startState) !== syntaxTree(update.state);

        if (
          compositionEnded ||
          update.docChanged ||
          selectionChangeAffectsReveal(update) ||
          update.focusChanged ||
          update.viewportChanged ||
          reconfigured ||
          syntaxTreeChanged
        ) {
          this.decorations = buildDecorations(
            update.view,
            reveal,
            taskCheckboxes,
            resolveLinkTarget,
          );
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        compositionend(_event, view) {
          // CodeMirror updates its composition state before plugin handlers.
          // An empty transaction gives the plugin an immediate rebuild point.
          view.dispatch({});
        },
      },
    },
  );
}

export function livePreview(config: LivePreviewConfig = {}): Extension {
  return previewPlugin(config);
}
