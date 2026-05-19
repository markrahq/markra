import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $prose, $remark } from "@milkdown/kit/utils";
import { renderToString } from "katex";
import remarkMath from "remark-math";

type MathRangeKind = "display" | "inline";

type MathRange = {
  from: number;
  kind: MathRangeKind;
  source: string;
  tex: string;
  to: number;
};

type ActiveMathSource = {
  from: number;
  to: number;
};

type MathRenderMeta =
  | {
      range: MathRange;
      type: "activate";
    }
  | {
      type: "deactivate";
    };

const mathRenderKey = new PluginKey<ActiveMathSource | null>("markra-math-render");
const transparentCaretAnchorSrc =
  "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22%20viewBox=%220%200%201%201%22/%3E";

type MarkdownPosition = {
  end?: {
    offset?: number;
  };
  start?: {
    offset?: number;
  };
};

type MathMarkdownNode = MarkdownNode & {
  position?: MarkdownPosition;
  value?: string;
};

type MarkdownSerializerInfo = {
  after?: string;
  before?: string;
};

type MarkdownSerializerState = {
  containerPhrasing: (node: MarkdownNode, info: MarkdownSerializerInfo) => string;
  enter: (name: string) => () => unknown;
};

function mathSourceFromPosition(markdown: string, node: MathMarkdownNode, fallback: string) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return fallback;
  if (start < 0 || end < start || end > markdown.length) return fallback;

  const source = markdown.slice(start, end);
  return source.trim() ? source : fallback;
}

function inlineMathFallback(value: string) {
  return `$${value}$`;
}

function displayMathFallback(value: string) {
  return value.includes("\n") ? `$$\n${value}\n$$` : `$$ ${value} $$`;
}

function sourceToInlineMarkdownNodes(source: string) {
  const children: MarkdownNode[] = [];
  const lines = source.split(/\r\n?|\n/u);

  lines.forEach((line, index) => {
    if (line.length > 0) {
      children.push({
        type: "text",
        value: line
      });
    }

    if (index < lines.length - 1) {
      children.push({
        data: {
          isInline: true
        },
        type: "break"
      });
    }
  });

  return children;
}

function transformMathMarkdownSources(node: MarkdownNode, markdown: string) {
  if (!Array.isArray(node.children)) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index] as MathMarkdownNode;

    if (child.type === "math") {
      const source = mathSourceFromPosition(markdown, child, displayMathFallback(child.value ?? ""));
      node.children.splice(index, 1, {
        children: sourceToInlineMarkdownNodes(source),
        type: "paragraph"
      });
      continue;
    }

    if (child.type === "inlineMath") {
      const source = mathSourceFromPosition(markdown, child, inlineMathFallback(child.value ?? ""));
      const sourceNodes = sourceToInlineMarkdownNodes(source);
      node.children.splice(index, 1, ...sourceNodes);
      index += sourceNodes.length - 1;
      continue;
    }

    transformMathMarkdownSources(child, markdown);
  }
}

function markdownSourceFromInlineNodes(children: MarkdownNode[] | undefined) {
  if (!children) return null;

  let source = "";
  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string") {
      source += child.value;
      continue;
    }

    if (child.type === "break") {
      source += "\n";
      continue;
    }

    return null;
  }

  return source;
}

function isDisplayMathSource(source: string) {
  const ranges = getMathRanges(source);
  return ranges.length === 1 && ranges[0]?.kind === "display" && ranges[0].from === 0 && ranges[0].to === source.length;
}

function serializeMathAwareParagraph(
  node: MarkdownNode,
  _parent: MarkdownNode | undefined,
  state: MarkdownSerializerState,
  info: MarkdownSerializerInfo
) {
  const source = markdownSourceFromInlineNodes(node.children);
  if (source !== null && isDisplayMathSource(source)) return source;

  const exit = state.enter("paragraph");
  const subexit = state.enter("phrasing");
  const value = state.containerPhrasing(node, info);
  subexit();
  exit();
  return value;
}

function remarkMathParseOnly(this: { data: () => { toMarkdownExtensions?: unknown[] } }) {
  const dataBeforeMath = this.data();
  const toMarkdownExtensionCount = dataBeforeMath.toMarkdownExtensions?.length ?? 0;

  // Keep remark-math parsing so math blocks win over Markdown lists, but avoid its source-escaping stringifier.
  remarkMath.call(this);

  const dataAfterMath = this.data();
  if (!Array.isArray(dataAfterMath.toMarkdownExtensions)) return;

  dataAfterMath.toMarkdownExtensions.splice(toMarkdownExtensionCount);
  dataAfterMath.toMarkdownExtensions.push({
    handlers: {
      paragraph: serializeMathAwareParagraph
    }
  });
}

export const markraMathRemarkPlugin = $remark<"markraMathRemark", undefined>(
  "markraMathRemark",
  () => remarkMathParseOnly
);

export const markraMathSourcePlugin = $remark("markraMathSource", () => () => (tree, file) => {
  transformMathMarkdownSources(tree as MarkdownNode, String(file.value ?? ""));
});

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function findClosingDelimiter(text: string, delimiter: "$" | "$$", from: number) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] !== "$" || isEscaped(text, index)) continue;

    if (delimiter === "$$") {
      if (text.startsWith("$$", index)) return index;
      continue;
    }

    if (text[index - 1] !== "$" && text[index + 1] !== "$") return index;
  }

  return -1;
}

function getMathRanges(text: string) {
  const ranges: MathRange[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "$" || isEscaped(text, index)) {
      index += 1;
      continue;
    }

    if (text.startsWith("$$", index)) {
      const closingIndex = findClosingDelimiter(text, "$$", index + 2);
      if (closingIndex === -1) {
        index += 2;
        continue;
      }

      const to = closingIndex + 2;
      const tex = text.slice(index + 2, closingIndex).trim();
      if (tex) {
        ranges.push({
          from: index,
          kind: "display",
          source: text.slice(index, to),
          tex,
          to
        });
      }

      index = to;
      continue;
    }

    if (text[index - 1] === "$" || text[index + 1] === "$") {
      index += 1;
      continue;
    }

    const closingIndex = findClosingDelimiter(text, "$", index + 1);
    if (closingIndex === -1) {
      index += 1;
      continue;
    }

    const to = closingIndex + 1;
    const tex = text.slice(index + 1, closingIndex).trim();
    if (tex) {
      ranges.push({
        from: index,
        kind: "inline",
        source: text.slice(index, to),
        tex,
        to
      });
    }

    index = to;
  }

  return ranges;
}

function makeAbsoluteRange(range: MathRange, blockStart: number): MathRange {
  return {
    ...range,
    from: blockStart + range.from,
    to: blockStart + range.to
  };
}

function findActiveMathRange(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.spec.code) return null;
  if (!$from.sameParent(selection.$to)) return null;

  const from = Math.min($from.parentOffset, selection.$to.parentOffset);
  const to = Math.max($from.parentOffset, selection.$to.parentOffset);
  const relativeRange = getMathRanges($from.parent.textContent).find((candidate) =>
    selection.empty ? candidate.from < from && from < candidate.to : candidate.from <= from && to <= candidate.to
  );

  return relativeRange ? makeAbsoluteRange(relativeRange, $from.start()) : null;
}

function findMathRangeByBounds(doc: ProseNode, bounds: ActiveMathSource): MathRange | null {
  let activeRange: MathRange | null = null;

  doc.descendants((node, position) => {
    if (activeRange) return false;
    if (!node.isTextblock || node.type.spec.code) return;

    const blockStart = position + 1;
    for (const relativeRange of getMathRanges(node.textContent)) {
      const range = makeAbsoluteRange(relativeRange, blockStart);
      if (range.from !== bounds.from || range.to !== bounds.to) continue;

      activeRange = range;
      return false;
    }
  });

  return activeRange;
}

function getActiveMathSource(state: EditorState): MathRange | null {
  const activeSource = mathRenderKey.getState(state) as ActiveMathSource | null;
  if (!activeSource) return null;

  return findMathRangeByBounds(state.doc, activeSource);
}

function getEditableMathRange(state: EditorState) {
  return getActiveMathSource(state) ?? findActiveMathRange(state);
}

function findAdjacentMathRange(state: EditorState, direction: "backward" | "forward") {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (getActiveMathSource(state)) return null;

  let adjacentRange: MathRange | null = null;
  const cursor = selection.from;

  state.doc.descendants((node, position) => {
    if (adjacentRange) return false;
    if (!node.isTextblock || node.type.spec.code) return;

    const blockStart = position + 1;
    for (const relativeRange of getMathRanges(node.textContent)) {
      const range = makeAbsoluteRange(relativeRange, blockStart);
      const touchesCursor = direction === "forward" ? range.from === cursor : range.to === cursor;
      if (!touchesCursor) continue;

      adjacentRange = range;
      return false;
    }
  });

  return adjacentRange;
}

function displayMathRangeForWholeTextBlock(node: ProseNode, position: number): MathRange | null {
  const relativeRanges = getMathRanges(node.textContent);
  const range = relativeRanges.length === 1 ? relativeRanges[0] : null;
  if (!range || range.kind !== "display") return null;
  if (range.from !== 0 || range.to !== node.textContent.length) return null;

  return makeAbsoluteRange(range, position + 1);
}

function findNextDisplayMathBlock(state: EditorState): MathRange | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  if (getActiveMathSource(state)) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.parentOffset !== $from.parent.content.size) return null;

  const currentBlockEnd = $from.after();
  let nextBlockMathRange: MathRange | null = null;

  state.doc.descendants((node, position) => {
    if (nextBlockMathRange) return false;
    if (!node.isTextblock || node.type.spec.code) return true;
    if (position < currentBlockEnd) return true;

    nextBlockMathRange = displayMathRangeForWholeTextBlock(node, position);
    return false;
  });

  return nextBlockMathRange;
}

function renderFormula(range: MathRange) {
  return renderToString(range.tex, {
    displayMode: range.kind === "display",
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false
  });
}

function mathSourceEditPosition(range: MathRange) {
  const delimiterLength = range.kind === "display" ? 2 : 1;
  const sourceAfterDelimiter = range.source.slice(delimiterLength);
  const firstContentOffset = sourceAfterDelimiter.search(/\S/u);
  const fallbackPosition = range.from + delimiterLength;
  if (firstContentOffset === -1) return fallbackPosition;

  return Math.min(range.to - 1, fallbackPosition + firstContentOffset);
}

function revealMathSource(view: EditorView, range: MathRange) {
  view.dispatch(
    view.state.tr
      .setMeta(mathRenderKey, {
        range,
        type: "activate"
      } satisfies MathRenderMeta)
      .setSelection(TextSelection.create(view.state.doc, mathSourceEditPosition(range)))
      .scrollIntoView()
  );
  view.focus();
}

function isPlainEnter(event: KeyboardEvent) {
  return event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function insertDisplayMathSourceNewline(view: EditorView, event: KeyboardEvent) {
  if (!isPlainEnter(event)) return false;

  const range = getActiveMathSource(view.state);
  if (!range || range.kind !== "display") return false;
  if (!selectionIsInsideMathRange(view.state, range)) return false;

  const hardbreak = view.state.schema.nodes.hardbreak;
  if (!hardbreak) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.replaceSelectionWith(hardbreak.create()).scrollIntoView());
  view.focus();
  return true;
}

function displayMathSourceLineBounds(state: EditorState, range: MathRange) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;

  const hardbreak = state.schema.nodes.hardbreak;
  if (!hardbreak) return null;

  const cursor = selection.from;
  const parentStart = $from.start();
  let lineStart = range.from;
  let lineEnd = range.to;

  for (let index = 0, offset = 0; index < $from.parent.childCount; index += 1) {
    const child = $from.parent.child(index);
    const childFrom = parentStart + offset;

    if (child.type === hardbreak) {
      if (childFrom < cursor) {
        lineStart = Math.max(range.from, childFrom + child.nodeSize);
      } else {
        lineEnd = Math.min(range.to, childFrom);
        break;
      }
    }

    offset += child.nodeSize;
  }

  return { from: lineStart, to: lineEnd };
}

function moveDisplayMathSourceLineBoundary(view: EditorView, event: KeyboardEvent) {
  if (
    (event.key !== "ArrowRight" && event.key !== "ArrowLeft") ||
    !event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey
  ) {
    return false;
  }

  const range = getActiveMathSource(view.state);
  if (!range || range.kind !== "display") return false;
  if (!selectionIsInsideMathRange(view.state, range)) return false;

  const lineBounds = displayMathSourceLineBounds(view.state, range);
  if (!lineBounds) return false;

  const target = event.key === "ArrowRight" ? lineBounds.to : lineBounds.from;
  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)).scrollIntoView());
  view.focus();
  return true;
}

function closeActiveMathSource(view: EditorView, event: KeyboardEvent) {
  if (!isPlainEnter(event)) return false;

  const range = getEditableMathRange(view.state);
  if (!range) return false;

  event.preventDefault();
  let transaction = view.state.tr.setMeta(mathRenderKey, {
    type: "deactivate"
  } satisfies MathRenderMeta);
  transaction = transaction.setSelection(TextSelection.create(transaction.doc, range.to));
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

function deleteMathRange(view: EditorView, range: MathRange) {
  let transaction = view.state.tr
    .setMeta(mathRenderKey, {
      type: "deactivate"
    } satisfies MathRenderMeta)
    .delete(range.from, range.to);
  const cursor = Math.min(range.from, transaction.doc.content.size);
  transaction = transaction.setSelection(TextSelection.create(transaction.doc, cursor)).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
}

function deleteAdjacentMathSource(view: EditorView, event: KeyboardEvent) {
  if (event.key !== "Backspace" && event.key !== "Delete") return false;

  const range = findAdjacentMathRange(view.state, event.key === "Delete" ? "forward" : "backward");
  if (!range) return false;

  event.preventDefault();
  deleteMathRange(view, range);
  return true;
}

function moveDownToDisplayMath(view: EditorView, event: KeyboardEvent) {
  if (event.key !== "ArrowDown" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;

  const range = findNextDisplayMathBlock(view.state);
  if (!range) return false;

  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.to)).scrollIntoView());
  view.focus();
  return true;
}

function handleMathKeyDown(view: EditorView, event: KeyboardEvent) {
  return (
    moveDownToDisplayMath(view, event) ||
    moveDisplayMathSourceLineBoundary(view, event) ||
    insertDisplayMathSourceNewline(view, event) ||
    closeActiveMathSource(view, event) ||
    deleteAdjacentMathSource(view, event)
  );
}

function selectionIsInsideMathRange(state: EditorState, range: MathRange) {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);

  return selection.empty ? range.from < from && from < range.to : range.from <= from && to <= range.to;
}

function closeInactiveMathSource(state: EditorState) {
  const activeSource = mathRenderKey.getState(state) as ActiveMathSource | null;
  if (!activeSource) return null;

  const activeRange = findMathRangeByBounds(state.doc, activeSource);
  if (activeRange && selectionIsInsideMathRange(state, activeRange)) return null;

  return state.tr.setMeta(mathRenderKey, {
    type: "deactivate"
  } satisfies MathRenderMeta);
}

function targetIsInsideActiveMathSource(target: EventTarget | null, root: HTMLElement) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const source =
    element?.closest(".markra-math-source:not(.markra-math-source-hidden), .markra-math-render-active-preview") ?? null;
  const displaySourceBlock = element?.closest("p") ?? null;

  return Boolean(
    (source && root.contains(source)) ||
      (displaySourceBlock &&
        root.contains(displaySourceBlock) &&
        displaySourceBlock.querySelector(".markra-math-source-active-display"))
  );
}

function closeActiveMathSourceFromPointer(view: EditorView, event: PointerEvent) {
  const activeSource = mathRenderKey.getState(view.state) as ActiveMathSource | null;
  if (!activeSource || targetIsInsideActiveMathSource(event.target, view.dom)) return;

  view.dispatch(
    view.state.tr
      .setMeta(mathRenderKey, {
        type: "deactivate"
      } satisfies MathRenderMeta)
      .setSelection(TextSelection.create(view.state.doc, activeSource.to))
  );
}

function createMathNativeCaretAnchor() {
  return (view: EditorView) => {
    const element = view.dom.ownerDocument.createElement("img");
    element.className = "ProseMirror-separator markra-math-caret-anchor";
    element.setAttribute("src", transparentCaretAnchorSrc);
    element.setAttribute("alt", "");
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("draggable", "false");
    return element;
  };
}

function createMathWidget(range: MathRange, activePreview = false) {
  return (view: EditorView) => {
    const element = view.dom.ownerDocument.createElement("span");
    element.className = `markra-math-render markra-math-render-${range.kind}`;
    element.setAttribute(
      "aria-label",
      activePreview ? "Math formula preview" : range.kind === "display" ? "Math formula" : "Inline math formula"
    );
    element.tabIndex = activePreview ? -1 : 0;

    if (activePreview) {
      element.classList.add("markra-math-render-active-preview");
    } else {
      element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        revealMathSource(view, range);
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          deleteMathRange(view, range);
          return;
        }

        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        event.stopPropagation();
        revealMathSource(view, range);
      });
    }

    try {
      element.innerHTML = renderFormula(range);
    } catch {
      element.classList.add("markra-math-render-invalid");
      element.textContent = range.source;
    }

    return element;
  };
}

function activeMathTokenDecorations(range: MathRange) {
  const decorations: Decoration[] = [];
  const delimiterLength = range.kind === "display" ? 2 : 1;

  decorations.push(
    Decoration.inline(range.from, range.from + delimiterLength, {
      class: "markra-math-token markra-math-token-delimiter"
    }),
    Decoration.inline(range.to - delimiterLength, range.to, {
      class: "markra-math-token markra-math-token-delimiter"
    })
  );

  const tokenPatterns: Array<[RegExp, string]> = [
    [/\\[a-zA-Z]+/gu, "markra-math-token-command"],
    [/[{}]/gu, "markra-math-token-brace"],
    [/(?:\\\\|[&=+\-*/^_])/gu, "markra-math-token-operator"]
  ];

  for (const [pattern, className] of tokenPatterns) {
    for (const match of range.source.matchAll(pattern)) {
      if (typeof match.index !== "number") continue;

      const from = range.from + match.index;
      const to = from + match[0].length;
      if (to <= range.from + delimiterLength || from >= range.to - delimiterLength) continue;

      decorations.push(
        Decoration.inline(from, to, {
          class: `markra-math-token ${className}`
        })
      );
    }
  }

  return decorations;
}

function selectionIsAtMathRangeEnd(state: EditorState, range: MathRange) {
  const { selection } = state;
  return selection instanceof TextSelection && selection.empty && selection.from === range.to;
}

function createMathCaretAnchorDecoration(range: MathRange) {
  return Decoration.widget(range.to, createMathNativeCaretAnchor(), {
    key: `markra-math-caret-anchor-${range.to}`,
    raw: true,
    relaxedSide: true,
    side: 1
  });
}

function buildMathDecorations(state: EditorState, activeRange: MathRange | null) {
  const { doc } = state;
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (!node.isTextblock || node.type.spec.code) return;

    const blockStart = position + 1;
    for (const relativeRange of getMathRanges(node.textContent)) {
      const range = makeAbsoluteRange(relativeRange, blockStart);
      const isActive = activeRange?.from === range.from && activeRange.to === range.to;
      decorations.push(
        Decoration.inline(range.from, range.to, {
          class: isActive
            ? [
                "markra-math-source",
                "markra-math-source-active",
                range.kind === "display" ? "markra-math-source-active-display" : "markra-math-source-active-inline"
              ].join(" ")
            : [
                "markra-math-source",
                "markra-math-source-hidden",
                range.kind === "display" ? "markra-math-source-hidden-display" : "",
                "markra-md-hidden-delimiter"
              ]
                .filter(Boolean)
                .join(" ")
        })
      );

      if (isActive) {
        decorations.push(...activeMathTokenDecorations(range));

        if (range.kind === "display") {
          decorations.push(
            Decoration.widget(range.to, createMathWidget(range, true), {
              ignoreSelection: true,
              key: `markra-math-active-preview-${range.from}-${range.to}`,
              side: 1
            })
          );
        }
      } else {
        decorations.push(
          Decoration.widget(range.from, createMathWidget(range), {
            ignoreSelection: true,
            key: `markra-math-${range.kind}-${range.from}-${range.to}`,
            side: -1
          })
        );

        if (range.kind === "display" && selectionIsAtMathRangeEnd(state, range)) {
          decorations.push(createMathCaretAnchorDecoration(range));
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const markraMathPlugin = $prose(() => {
  return new Plugin({
    key: mathRenderKey,
    view: (view) => {
      const ownerDocument = view.dom.ownerDocument;
      const handleDocumentPointerDown = (event: PointerEvent) => {
        closeActiveMathSourceFromPointer(view, event);
      };

      ownerDocument.addEventListener("pointerdown", handleDocumentPointerDown, true);

      return {
        destroy() {
          ownerDocument.removeEventListener("pointerdown", handleDocumentPointerDown, true);
        }
      };
    },
    state: {
      init: (): ActiveMathSource | null => null,
      apply(transaction, activeSource: ActiveMathSource | null, _oldState, newState): ActiveMathSource | null {
        const meta = transaction.getMeta(mathRenderKey) as MathRenderMeta | undefined;
        if (meta?.type === "deactivate") return null;
        if (meta?.type === "activate") {
          return {
            from: meta.range.from,
            to: meta.range.to
          } satisfies ActiveMathSource;
        }

        if (!activeSource) return null;

        const mappedSource = {
          from: transaction.mapping.map(activeSource.from, 1),
          to: transaction.mapping.map(activeSource.to, -1)
        } satisfies ActiveMathSource;
        if (mappedSource.from >= mappedSource.to) return null;

        return findMathRangeByBounds(newState.doc, mappedSource) ? mappedSource : null;
      }
    },
    appendTransaction: (_transactions, _oldState, newState) => closeInactiveMathSource(newState),
    props: {
      decorations: (state) => buildMathDecorations(state, getEditableMathRange(state)),
      handleKeyDown: handleMathKeyDown
    }
  });
});
