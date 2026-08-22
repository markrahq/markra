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
  sourceDragSelectionExtension,
  type RevealContext,
  type RevealPolicy,
  type RevealScope,
} from "./policy.ts";
import {
  getMarkraRenderers,
  type MarkraRenderer,
  type MarkraSyntaxNode,
} from "./renderers.ts";
import {
  readMarkdownLinkDestination,
  readMarkdownLinkReferences,
  resolveAutolinkTarget,
  resolveSafeLinkTarget,
  type MarkraLinkSourceContext,
} from "./links.ts";
import { unescapeMarkdown } from "./syntax.ts";
import { createTaskDecoration } from "./tasks.ts";
import { isInsidePreformattedBlock } from "./blank-lines.ts";
import { syntaxTreeChanged, updateOnlyInsertsPlainText } from "./changes.ts";

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

const LINK_SYNTAX = new Set(["LinkLabel", "LinkMark", "LinkTitle", "URL"]);
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
const LIST_ITEM_PATTERN = /^([\t ]*)([-+*]|\d+[.)])[\t ]+(\[[ xX]\](?:[\t ]+|$))?/u;
const EMPTY_TASK_ITEM_PATTERN =
  /^([\t ]*)([-+*]|\d+[.)])([\t ]+)(\[[ xX]\])[\t ]*$/u;

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

function rangeSelectionIncludesPosition(
  view: EditorView,
  position: number,
) {
  return view.state.selection.ranges.some(
    (selection) =>
      !selection.empty && selection.from <= position && selection.to > position,
  );
}

function buildListMarkerSelectionDecorations(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const decoratedLines = new Set<number>();

  for (const visibleRange of view.visibleRanges) {
    const firstLine = view.state.doc.lineAt(visibleRange.from).number;
    const lastLine = view.state.doc.lineAt(visibleRange.to).number;

    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber);
      if (
        decoratedLines.has(line.from) ||
        !listLineAttributes(line.text) ||
        !rangeSelectionIncludesPosition(view, line.from)
      ) {
        continue;
      }

      decoratedLines.add(line.from);
      ranges.push(
        Decoration.line({
          attributes: { "data-markra-list-marker-selected": "true" },
        }).range(line.from),
      );
    }
  }

  return Decoration.set(ranges, true);
}

const listMarkerSelectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildListMarkerSelectionDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        // Visual list markers are pseudo-elements, so CodeMirror's selection
        // layer cannot paint them. Mirror selection only when source includes
        // the marker, without revealing Markdown or changing line geometry.
        this.decorations = buildListMarkerSelectionDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function emptyTaskMarkerRange(source: string) {
  const match = EMPTY_TASK_ITEM_PATTERN.exec(source);
  if (!match) return null;

  const markerFrom =
    (match[1]?.length ?? 0) +
    (match[2]?.length ?? 0) +
    (match[3]?.length ?? 0);
  return {
    from: markerFrom,
    to: markerFrom + (match[4]?.length ?? 0),
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

function hasUnclosedInlineDestination(
  state: EditorView["state"],
  node: MarkraSyntaxNode,
) {
  const nodeLine = state.doc.lineAt(node.from);
  const sourceBeforeNode = state.sliceDoc(nodeLine.from, node.from);
  if (
    node.name === "URL" &&
    /(?:!\[(?:\\.|[^\]\\])*\]|\[(?:\\.|[^\]\\])*\])\((?:\\.|[^)\n])*$/u
      .test(sourceBeforeNode) &&
    !state.sliceDoc(node.to, nodeLine.to).includes(")")
  ) {
    return true;
  }

  let container: MarkraSyntaxNode | null = node;
  while (
    container &&
    container.name !== "Image" &&
    container.name !== "Link"
  ) {
    container = container.parent;
  }
  if (!container) return false;

  if (
    container.name === "Image" &&
    !container.getChild("URL") &&
    /^!\[(?:\\.|[^\]\\])*\]$/u.test(
      state.sliceDoc(container.from, container.to),
    )
  ) {
    return true;
  }

  const line = state.doc.lineAt(container.to);
  if (container.to >= line.to) return false;
  return /^\((?:\\.|[^)\n])*$/u.test(
    state.sliceDoc(container.to, line.to),
  );
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
  hideHeadingMarkersOnFocus?: boolean;
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
  hideHeadingMarkersOnFocus: boolean,
  taskCheckboxes: boolean,
  resolveLinkTarget: LivePreviewConfig["resolveLinkTarget"],
  typedBoundary: number | null,
) {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const referenceTargets = readMarkdownLinkReferences(state);
  const decoratedHeadingLines = new Set<number>();
  const decoratedBlockLines = new Set<string>();
  const decoratedEmptyLines = new Set<number>();
  const decoratedListLines = new Set<number>();
  const decoratedNodes = new Set<string>();
  const rendererClaimedNodes = new Set<string>();
  const tree = syntaxTree(state);
  const isRevealed = (context: RevealContext) =>
    reveal(context) ||
    (
      context.scope === "node-boundary" &&
      typedBoundary === context.to &&
      view.hasFocus &&
      state.selection.ranges.some(
        (selection) => selection.empty && selection.head === typedBoundary,
      )
    );
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
        let paragraphEndLine: number | null = null;
        if (
          node.name === "Paragraph" &&
          listDepth(node.node as MarkraSyntaxNode) === 0
        ) {
          const endLine = state.doc.lineAt(node.to - 1).number;
          let nextContentLine = endLine + 1;
          while (
            nextContentLine <= state.doc.lines &&
            state.doc.line(nextContentLine).text.trim().length === 0
          ) {
            nextContentLine += 1;
          }
          // Authored blank lines stay full-height and editable. Add semantic
          // paragraph rhythm to the content line only when another block follows.
          if (nextContentLine <= state.doc.lines) {
            paragraphEndLine = endLine;
          }
        }
        for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
          const line = state.doc.line(lineNumber);
          const key = `${blockClass}:${line.from}`;
          if (!decoratedBlockLines.has(key)) {
            decoratedBlockLines.add(key);
            const className = lineNumber === paragraphEndLine
              ? `${blockClass} cm-markra-paragraph-end`
              : blockClass;
            ranges.push(Decoration.line({ class: className }).range(line.from));
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
          return isRevealed({
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

    if (node.name === "Escape" && node.from < node.to) {
      // Visual mode renders the escaped character literally; the backslash remains available in
      // source mode and in the document model, so pasted plain text stays portable Markdown.
      pushHiddenRange(
        ranges,
        state.doc,
        node.from,
        Math.min(node.from + 1, node.to),
      );
      return false;
    }

    if (node.name === "ListItem") {
      const line = state.doc.lineAt(node.from);
      const listAttributes = listLineAttributes(line.text);
      const listMark = node.node.getChild("ListMark");
      const sourceVisible = isRevealed({
        view,
        state,
        from: listMark?.from ?? line.from,
        to: listMark?.to ?? line.from,
        nodeName: "ListMark",
        scope: "line",
      });
      if (listAttributes && !decoratedListLines.has(line.from)) {
        decoratedListLines.add(line.from);
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

      const emptyTask = emptyTaskMarkerRange(line.text);
      if (emptyTask) {
        if (taskCheckboxes) {
          const taskFrom = line.from + emptyTask.from;
          const taskDecoration = createTaskDecoration(
            state,
            taskFrom,
            line.from + emptyTask.to,
          );
          if (taskDecoration) ranges.push(taskDecoration);
          if (!sourceVisible) {
            pushHiddenRange(ranges, state.doc, line.from, taskFrom);
          }
        }

        // Lezer treats an empty task marker as a paragraph or link. Claim the
        // item so those fallback nodes cannot hide its source or overlap the
        // checkbox replacement.
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
    const unfinishedInlineDestination = hasUnclosedInlineDestination(
      state,
      node.node as MarkraSyntaxNode,
    );
    const standaloneUrl =
      node.name === "URL" &&
      parentName !== "Autolink" &&
      parentName !== "Image" &&
      parentName !== "Link";
    const linkLike =
      (node.name === "Link" && !unfinishedInlineDestination) ||
      node.name === "Autolink" || standaloneUrl;
    const inlineClass = unfinishedInlineDestination
      ? undefined
      : INLINE_CLASSES[node.name] ??
        (standaloneUrl ? "cm-markra-link" : undefined);
    if (inlineClass && node.from < node.to) {
      const linkUrl = node.name === "URL"
        ? node.node
        : linkLike
          ? node.node.getChild("URL")
          : null;
      const linkSource = linkLike
        ? readMarkdownLinkDestination(state, node.node, referenceTargets)
        : null;
      const linkHref = linkSource
        ? resolveLinkHref(node.name, linkSource, view, resolveLinkTarget)
        : null;
      const linkRevealed = linkLike && isRevealed({
        view,
        state,
        from: node.from,
        to: node.to,
        nodeName: node.name,
        scope: "node-boundary",
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
    const isReferenceLinkLabel =
      node.name === "LinkLabel" && parentName === "Link";
    const isReferenceDefinitionMark =
      node.name === "LinkMark" && parentName === "LinkReference";
    const isUncommittedSetextMark =
      node.name === "HeaderMark" && parentName === "Paragraph";
    const isHideable =
      !unfinishedInlineDestination &&
      !isFootnoteLinkSyntax(state, node.node as MarkraSyntaxNode) &&
      !taskSourceRemainsVisible &&
      !isReferenceDefinitionMark &&
      !isUncommittedSetextMark &&
      (HIDEABLE_MARKS.has(node.name) ||
        isReferenceLinkLabel ||
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
        revealScope = "node-boundary";
      }
    } else if (node.name === "HeaderMark") {
      const heading = node.node.parent;
      if (
        !hideHeadingMarkersOnFocus &&
        heading &&
        HEADING_CLASSES[heading.name]
      ) {
        // When automatic hiding is disabled, entering the rendered heading
        // reveals its complete source marker for direct editing.
        revealFrom = heading.from;
        revealTo = heading.to;
        revealScope = "heading";
      }
    } else if (INLINE_WRAPPER_MARKS.has(node.name)) {
      const wrapper = node.node.parent;
      if (
        wrapper &&
        INLINE_WRAPPERS.has(wrapper.name)
      ) {
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
      !isRevealed({
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
        !isInsidePreformattedBlock(state, line.from)
      ) {
        // Keep every authored blank as a normal CodeMirror row. Folding one
        // based on surrounding text makes its height change while typing.
        decoratedEmptyLines.add(line.from);
        ranges.push(
          Decoration.line({
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
  const hideHeadingMarkersOnFocus =
    config.hideHeadingMarkersOnFocus ?? false;
  const taskCheckboxes = config.taskCheckboxes ?? true;
  const resolveLinkTarget = config.resolveLinkTarget;

  function syncCompositionUi(view: EditorView, composing: boolean) {
    if (composing) {
      view.dom.dataset.markraComposing = "true";
    } else {
      delete view.dom.dataset.markraComposing;
    }
  }

  function cursorInTopLevelParagraph(
    state: ViewUpdate["state"],
    position: number,
  ) {
    const node = syntaxTree(state).resolveInner(position, -1);
    return node.parent?.name === "Document" && node.name === "Paragraph";
  }

  function plainTextInputCanMapDecorations(update: ViewUpdate) {
    const before = update.startState.selection.main;
    const after = update.state.selection.main;
    if (
      !updateOnlyInsertsPlainText(update) ||
      update.startState.selection.ranges.length !== 1 ||
      update.state.selection.ranges.length !== 1 ||
      !before.empty ||
      !after.empty ||
      getMarkraRenderers(update.state, "Paragraph").length > 0
    ) {
      return false;
    }

    return cursorInTopLevelParagraph(update.startState, before.head) &&
      cursorInTopLevelParagraph(update.state, after.head);
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      composing: boolean;
      typedBoundary: number | null;

      constructor(view: EditorView) {
        this.typedBoundary = null;
        this.decorations = buildDecorations(
          view,
          reveal,
          hideHeadingMarkersOnFocus,
          taskCheckboxes,
          resolveLinkTarget,
          this.typedBoundary,
        );
        this.composing = view.composing;
      }

      update(update: ViewUpdate) {
        const typedInput = update.transactions.some(
          (transaction) =>
            transaction.docChanged && transaction.isUserEvent("input"),
        );
        if (typedInput && update.state.selection.main.empty) {
          // Only the node completed by this keyboard transaction keeps its
          // closing delimiter visible. Existing content at the same cursor
          // boundary must still render normally when a document is opened.
          this.typedBoundary = update.state.selection.main.head;
        } else if (
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged
        ) {
          this.typedBoundary = null;
        }

        const compositionEnded = this.composing && !update.view.composing;
        this.composing = update.view.composing;
        syncCompositionUi(update.view, this.composing);

        if (this.composing) {
          // Mapping preserves the current DOM while the platform owns the
          // composition range. A full rebuild at this point can cancel IME.
          this.decorations = this.decorations.map(update.changes);
          return;
        }

        if (plainTextInputCanMapDecorations(update)) {
          // Plain letters and numbers cannot create Markdown structure in a
          // top-level paragraph. Mapping retains every unchanged preview DOM
          // instead of walking the full visible syntax tree per keystroke.
          this.decorations = this.decorations.map(update.changes);
          return;
        }

        const reconfigured = update.transactions.some(
          (transaction) => transaction.reconfigured,
        );
        const treeChanged =
          !update.selectionSet &&
          update.transactions.length > 0 &&
          syntaxTreeChanged(update.startState, update.state);

        if (
          compositionEnded ||
          update.docChanged ||
          selectionChangeAffectsReveal(update) ||
          update.focusChanged ||
          update.viewportChanged ||
          reconfigured ||
          treeChanged
        ) {
          this.decorations = buildDecorations(
            update.view,
            reveal,
            hideHeadingMarkersOnFocus,
            taskCheckboxes,
            resolveLinkTarget,
            this.typedBoundary,
          );
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        compositionstart(_event, view) {
          syncCompositionUi(view, true);
        },
        compositionend(_event, view) {
          syncCompositionUi(view, false);
          // CodeMirror updates its composition state before plugin handlers.
          // An empty transaction gives the plugin an immediate rebuild point.
          view.dispatch({});
        },
        blur(_event, view) {
          syncCompositionUi(view, false);
        },
      },
    },
  );
}

export function livePreview(config: LivePreviewConfig = {}): Extension {
  return [
    sourceDragSelectionExtension,
    previewPlugin(config),
    listMarkerSelectionPlugin,
  ];
}
