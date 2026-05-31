import {
  Fragment,
  type Mark,
  type Node as ProseNode,
  type NodeType,
  type ResolvedPos
} from "@milkdown/kit/prose/model";
import { inlineCodeSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { footnoteDefinitionSchema, footnoteReferenceSchema } from "@milkdown/kit/preset/gfm";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $inputRule, $prose } from "@milkdown/kit/utils";

const footnoteReferenceSelector = 'sup[data-type="footnote_reference"][data-label]';
const footnoteReferenceInputPattern = /\[\^([^\]\s]+)\]$/u;
const footnoteDefinitionInputPattern = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/u;
const footnoteDefinitionBlockPattern = /^[ \t]{0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/u;
const footnoteReferenceMarkdownPattern = /\[\^([^\]\s]+)\]/gu;
const footnoteDefinitionContinuationPattern = /^(?: {4}|\t)(.*)$/u;
const fencedCodeDelimiterPattern = /^[ \t]{0,3}(`{3,}|~{3,})/u;
const footnotePreviewGap = 8;
const footnotePreviewPadding = 12;
const footnotePreviewWidth = 320;

let footnotePreviewIdSeed = 0;

type MarkdownCodeRange = {
  closed: boolean;
  from: number;
  to: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;

  for (let position = index - 1; position >= 0 && text[position] === "\\"; position -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function readBacktickRunLength(text: string, start: number) {
  if (text[start] !== "`" || isEscaped(text, start)) return 0;

  let length = 1;
  while (text[start + length] === "`") length += 1;
  return length;
}

function findClosingBacktickRun(text: string, start: number, markerLength: number) {
  for (let position = start; position < text.length; position += 1) {
    if (readBacktickRunLength(text, position) !== markerLength) continue;
    return position;
  }

  return null;
}

function inlineCodeRanges(text: string): MarkdownCodeRange[] {
  const ranges: MarkdownCodeRange[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const markerLength = readBacktickRunLength(text, cursor);
    if (markerLength === 0) {
      cursor += 1;
      continue;
    }

    const closingStart = findClosingBacktickRun(text, cursor + markerLength, markerLength);
    if (closingStart === null) {
      ranges.push({ closed: false, from: cursor, to: text.length });
      break;
    }

    const closingEnd = closingStart + markerLength;
    ranges.push({ closed: true, from: cursor, to: closingEnd });
    cursor = closingEnd;
  }

  return ranges;
}

function readLineBounds(text: string, start: number) {
  const lineEnd = text.indexOf("\n", start);
  const to = lineEnd === -1 ? text.length : lineEnd;
  return {
    next: lineEnd === -1 ? text.length : lineEnd + 1,
    text: text.slice(start, to),
    to
  };
}

function fencedCodeRanges(text: string): MarkdownCodeRange[] {
  const ranges: MarkdownCodeRange[] = [];
  let fence: { marker: string; markerLength: number; from: number } | null = null;
  let lineStart = 0;

  while (lineStart < text.length) {
    const line = readLineBounds(text, lineStart);
    const match = fencedCodeDelimiterPattern.exec(line.text);
    const marker = match?.[1] ?? "";

    if (marker) {
      const markerCharacter = marker[0] ?? "";
      if (!fence) {
        fence = { from: lineStart, marker: markerCharacter, markerLength: marker.length };
      } else if (markerCharacter === fence.marker && marker.length >= fence.markerLength) {
        ranges.push({ closed: true, from: fence.from, to: line.to });
        fence = null;
      }
    }

    if (line.next === lineStart) break;
    lineStart = line.next;
  }

  if (fence) ranges.push({ closed: false, from: fence.from, to: text.length });

  return ranges;
}

function markdownCodeRanges(text: string) {
  return [...fencedCodeRanges(text), ...inlineCodeRanges(text)];
}

function positionIsInMarkdownCodeRange(position: number, range: MarkdownCodeRange) {
  return position > range.from && (position < range.to || (!range.closed && position <= range.to));
}

function positionIsInMarkdownCode(position: number, ranges: MarkdownCodeRange[]) {
  return ranges.some((range) => positionIsInMarkdownCodeRange(position, range));
}

function hasUnescapedFootnoteSyntaxOutsideCode(text: string) {
  const codeRanges = markdownCodeRanges(text);

  footnoteReferenceMarkdownPattern.lastIndex = 0;
  for (const match of text.matchAll(footnoteReferenceMarkdownPattern)) {
    const from = match.index;
    if (isEscaped(text, from) || positionIsInMarkdownCode(from, codeRanges)) continue;
    return true;
  }

  return false;
}

function elementFromEventTarget(target: EventTarget | null) {
  return target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
}

function findFootnoteReference(target: EventTarget | null) {
  return elementFromEventTarget(target)?.closest<HTMLElement>(footnoteReferenceSelector) ?? null;
}

function findAncestorDepth($from: ResolvedPos, type: NodeType) {
  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) return depth;
  }

  return null;
}

function readFootnoteLabel(reference: HTMLElement) {
  const label = reference.dataset.label?.trim();
  return label ? label : null;
}

function footnoteDefinitionPreviewText(definition: ProseNode) {
  const blocks: string[] = [];

  definition.descendants((node) => {
    if (node.type.name === "footnote_definition") return false;
    if (!node.isTextblock) return true;

    const text = node.textBetween(0, node.content.size, "\n").trim();
    if (text) blocks.push(text);
    return false;
  });

  const text = blocks.join("\n").trim();
  return text ? text : null;
}

function findFootnoteDefinitionText(doc: ProseNode, label: string) {
  let content: string | null = null;

  doc.descendants((node) => {
    if (content !== null) return false;
    if (node.type.name !== "footnote_definition") return true;
    if (String(node.attrs.label ?? "") !== label) return false;

    content = footnoteDefinitionPreviewText(node);
    return false;
  });

  return content;
}

function findPreviewRoot(view: EditorView) {
  const markdownPaper = view.dom.closest(".markdown-paper");
  if (markdownPaper instanceof HTMLElement) return markdownPaper;

  return view.dom.parentElement ?? view.dom.ownerDocument.body;
}

class MarkraFootnotePreviewView {
  private readonly id = `markra-footnote-preview-${footnotePreviewIdSeed += 1}`;
  private readonly root: HTMLElement;
  private preview: HTMLElement | null = null;
  private reference: HTMLElement | null = null;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.root = findPreviewRoot(view);
    view.dom.addEventListener("mouseover", this.handleMouseOver);
    view.dom.addEventListener("mouseout", this.handleMouseOut);
  }

  update(view: EditorView) {
    this.view = view;
    if (!this.reference) return;

    if (!this.reference.isConnected) {
      this.hide();
      return;
    }

    this.show(this.reference);
  }

  destroy() {
    this.view.dom.removeEventListener("mouseover", this.handleMouseOver);
    this.view.dom.removeEventListener("mouseout", this.handleMouseOut);
    this.hide();
  }

  private readonly handleMouseOver = (event: MouseEvent) => {
    const reference = findFootnoteReference(event.target);
    if (!reference || reference === this.reference) return;

    this.show(reference);
  };

  private readonly handleMouseOut = (event: MouseEvent) => {
    const reference = findFootnoteReference(event.target);
    if (!reference || reference !== this.reference) return;
    if (event.relatedTarget instanceof Node && reference.contains(event.relatedTarget)) return;

    this.hide();
  };

  private show(reference: HTMLElement) {
    const label = readFootnoteLabel(reference);
    if (!label) {
      this.hide();
      return;
    }

    const content = findFootnoteDefinitionText(this.view.state.doc, label);
    if (!content) {
      this.hide();
      return;
    }

    const preview = this.ensurePreview();
    preview.dataset.label = label;
    preview.textContent = content;
    this.reference?.removeAttribute("aria-describedby");
    this.reference = reference;
    this.reference.setAttribute("aria-describedby", this.id);
    this.positionPreview(reference, preview);
  }

  private hide() {
    this.reference?.removeAttribute("aria-describedby");
    this.reference = null;
    this.preview?.remove();
    this.preview = null;
  }

  private ensurePreview() {
    if (this.preview) return this.preview;

    const preview = this.view.dom.ownerDocument.createElement("div");
    preview.id = this.id;
    preview.className = "markra-footnote-preview";
    preview.contentEditable = "false";
    preview.role = "tooltip";
    this.root.append(preview);
    this.preview = preview;
    return preview;
  }

  private positionPreview(reference: HTMLElement, preview: HTMLElement) {
    const ownerWindow = reference.ownerDocument.defaultView;
    const viewportWidth = ownerWindow?.innerWidth ?? 1024;
    const viewportHeight = ownerWindow?.innerHeight ?? 768;
    const maxWidth = Math.min(footnotePreviewWidth, Math.max(180, viewportWidth - footnotePreviewPadding * 2));
    const referenceRect = reference.getBoundingClientRect();

    preview.style.maxWidth = `${maxWidth}px`;
    const previewRect = preview.getBoundingClientRect();
    const previewWidth = previewRect.width > 0 ? Math.min(previewRect.width, maxWidth) : maxWidth;

    const left = clamp(
      referenceRect.left + referenceRect.width / 2 - previewWidth / 2,
      footnotePreviewPadding,
      Math.max(footnotePreviewPadding, viewportWidth - previewWidth - footnotePreviewPadding)
    );
    const previewHeight = previewRect.height;
    const fitsBelow =
      referenceRect.bottom + footnotePreviewGap + previewHeight + footnotePreviewPadding <= viewportHeight;
    const top = fitsBelow
      ? referenceRect.bottom + footnotePreviewGap
      : Math.max(footnotePreviewPadding, referenceRect.top - previewHeight - footnotePreviewGap);

    preview.style.left = `${Math.round(left)}px`;
    preview.style.top = `${Math.round(top)}px`;
  }
}

export function markraFootnotePreviewPlugin() {
  return $prose(() => new Plugin({
    view: (view) => new MarkraFootnotePreviewView(view)
  }));
}

export const markraFootnoteReferenceInputRule = $inputRule((ctx) => {
  const inlineCode = inlineCodeSchema.type(ctx);
  const footnoteReference = footnoteReferenceSchema.type(ctx);

  return new InputRule(footnoteReferenceInputPattern, (state, match, start, end) => {
    const label = match[1]?.trim();
    if (!label) return null;

    const $start = state.doc.resolve(start);
    if ($start.parent.type.spec.code) return null;
    if ($start.marks().some((mark) => mark.type === inlineCode)) return null;

    const textBeforeMatch = $start.parent.textBetween(0, $start.parentOffset, "", "");
    if (isEscaped(textBeforeMatch, textBeforeMatch.length) || positionIsInMarkdownCode(
      textBeforeMatch.length,
      inlineCodeRanges(textBeforeMatch)
    )) {
      return null;
    }

    const reference = footnoteReference.create({ label });
    const transaction = state.tr.replaceWith(start, end, reference);
    return transaction.setSelection(TextSelection.create(transaction.doc, start + reference.nodeSize));
  });
});

export function markraFootnoteDefinitionInputPlugin() {
  return $prose((ctx) => {
    const footnoteDefinition = footnoteDefinitionSchema.type(ctx);
    const footnoteReference = footnoteReferenceSchema.type(ctx);
    const inlineCode = inlineCodeSchema.type(ctx);
    const paragraph = paragraphSchema.type(ctx);

    const createDefinition = (state: EditorView["state"], label: string, text: string) => {
      const definitionParagraph = text ? paragraph.create(null, state.schema.text(text)) : paragraph.create();
      return footnoteDefinition.create({ label }, definitionParagraph);
    };

    const marksIncludeInlineCode = (marks: readonly Mark[]) => marks.some((mark) => mark.type === inlineCode);

    const createInlineContentWithReferences = (state: EditorView["state"], text: string, marks: readonly Mark[] = []) => {
      const content: ProseNode[] = [];
      let cursor = 0;
      const codeRanges = markdownCodeRanges(text);

      if (marksIncludeInlineCode(marks)) return text ? [state.schema.text(text, marks)] : [];

      footnoteReferenceMarkdownPattern.lastIndex = 0;
      for (const match of text.matchAll(footnoteReferenceMarkdownPattern)) {
        const from = match.index;
        const label = match[1]?.trim();
        if (isEscaped(text, from) || positionIsInMarkdownCode(from, codeRanges)) continue;
        if (!label) continue;

        if (from > cursor) content.push(state.schema.text(text.slice(cursor, from), marks));
        content.push(footnoteReference.create({ label }));
        cursor = from + match[0].length;
      }

      if (cursor < text.length) content.push(state.schema.text(text.slice(cursor), marks));
      return content;
    };

    const createParagraphWithReferences = (state: EditorView["state"], text: string) => {
      const content = createInlineContentWithReferences(state, text);
      return paragraph.create(null, content.length > 0 ? Fragment.fromArray(content) : undefined);
    };

    const paragraphNeedsInlinePreservation = (node: ProseNode) => {
      let needsPreservation = false;

      node.forEach((child) => {
        if (!child.isText || marksIncludeInlineCode(child.marks)) needsPreservation = true;
      });

      return needsPreservation;
    };

    const paragraphHasConvertibleFootnoteSyntax = (node: ProseNode) => {
      let hasConvertibleFootnoteSyntax = false;

      node.forEach((child) => {
        if (hasConvertibleFootnoteSyntax) return;
        if (!child.isText || !child.text || marksIncludeInlineCode(child.marks)) return;

        if (hasUnescapedFootnoteSyntaxOutsideCode(child.text)) hasConvertibleFootnoteSyntax = true;
      });

      return hasConvertibleFootnoteSyntax;
    };

    const createParagraphPreservingInlineNodes = (state: EditorView["state"], node: ProseNode) => {
      const content: ProseNode[] = [];

      node.forEach((child) => {
        if (child.isText && child.text) {
          content.push(...createInlineContentWithReferences(state, child.text, child.marks));
          return;
        }

        content.push(child);
      });

      return paragraph.create(node.attrs, content.length > 0 ? Fragment.fromArray(content) : undefined);
    };

    const stripFootnoteContinuationIndent = (line: string) => {
      const continuationMatch = footnoteDefinitionContinuationPattern.exec(line);
      return continuationMatch ? continuationMatch[1] ?? "" : line;
    };

    const lineIsBlank = (line: string) => /^[ \t]*$/u.test(line);

    const readFootnoteDefinitionLine = (line: string) => {
      const definitionMatch = footnoteDefinitionBlockPattern.exec(line);
      const label = definitionMatch?.[1]?.trim();
      if (!definitionMatch || !label) return null;

      return {
        label,
        text: definitionMatch[2] ?? ""
      };
    };

    const nextNonBlankLineIndex = (lines: string[], start: number) => {
      let index = start;
      while (index < lines.length && lineIsBlank(lines[index] ?? "")) index += 1;
      return index;
    };

    const createFootnoteMarkdownNodes = (state: EditorView["state"], text: string) => {
      const lines = text.replace(/\r\n?/gu, "\n").split("\n");
      const nodes: ProseNode[] = [];
      let index = 0;

      while (index < lines.length) {
        if (lineIsBlank(lines[index] ?? "")) {
          index += 1;
          continue;
        }

        const definition = readFootnoteDefinitionLine(lines[index] ?? "");
        if (definition) {
          const textLines = [definition.text];
          index += 1;

          while (index < lines.length) {
            const line = lines[index] ?? "";
            if (readFootnoteDefinitionLine(line)) break;

            if (lineIsBlank(line)) {
              const nextIndex = nextNonBlankLineIndex(lines, index + 1);
              const nextLine = lines[nextIndex] ?? "";
              if (!footnoteDefinitionContinuationPattern.test(nextLine)) break;

              textLines.push("");
              index = nextIndex;
              continue;
            }

            const continuationMatch = footnoteDefinitionContinuationPattern.exec(line);
            if (!continuationMatch) break;

            textLines.push(stripFootnoteContinuationIndent(line));
            index += 1;
          }

          nodes.push(createDefinition(state, definition.label, textLines.join("\n").trimEnd()));
          continue;
        }

        const paragraphLines: string[] = [];
        while (index < lines.length) {
          const line = lines[index] ?? "";
          if (lineIsBlank(line) || readFootnoteDefinitionLine(line)) break;

          paragraphLines.push(line);
          index += 1;
        }

        const paragraphText = paragraphLines.join("\n").trim();
        if (paragraphText) nodes.push(createParagraphWithReferences(state, paragraphText));
      }

      return nodes;
    };

    type NormalizedFootnoteParagraph = {
      from: number;
      to: number;
      parsed: Fragment;
    };

    const findNormalizableParagraph = (state: EditorView["state"]): NormalizedFootnoteParagraph | null => {
      let normalized: NormalizedFootnoteParagraph | null = null;

      state.doc.descendants((node, position) => {
        if (normalized) return false;
        if (node.type !== paragraph) return true;

        if (!paragraphHasConvertibleFootnoteSyntax(node)) return false;

        const nodes = paragraphNeedsInlinePreservation(node)
          ? [createParagraphPreservingInlineNodes(state, node)]
          : createFootnoteMarkdownNodes(state, node.textContent);
        if (nodes.length === 0) return false;

        normalized = {
          from: position,
          parsed: Fragment.fromArray(nodes),
          to: position + node.nodeSize
        };
        return false;
      });

      return normalized;
    };

    const replaceCurrentParagraphWithDefinition = (view: EditorView, label: string, text: string) => {
      const { state } = view;
      const { $from } = state.selection;
      const definition = createDefinition(state, label, text);
      const paragraphFrom = $from.before();
      const paragraphTo = $from.after();
      const ancestorDefinitionDepth = findAncestorDepth($from, footnoteDefinition);

      if (ancestorDefinitionDepth !== null) {
        const ancestorDefinition = $from.node(ancestorDefinitionDepth);
        if (ancestorDefinition.childCount <= 1) return false;

        const ancestorParent = $from.node(ancestorDefinitionDepth - 1);
        const ancestorIndex = $from.index(ancestorDefinitionDepth - 1);
        if (!ancestorParent.canReplaceWith(ancestorIndex + 1, ancestorIndex + 1, footnoteDefinition)) return false;

        const ancestorTo = $from.after(ancestorDefinitionDepth);
        const transaction = state.tr.delete(paragraphFrom, paragraphTo);
        const insertPosition = transaction.mapping.map(ancestorTo);
        view.dispatch(
          transaction
            .insert(insertPosition, definition)
            .setSelection(TextSelection.create(transaction.doc, insertPosition + 2 + text.length))
            .scrollIntoView()
        );
        return true;
      }

      const parent = $from.node($from.depth - 1);
      const index = $from.index($from.depth - 1);
      if (!parent.canReplaceWith(index, index + 1, footnoteDefinition)) return false;

      const transaction = state.tr.replaceWith(paragraphFrom, paragraphTo, definition);
      view.dispatch(
        transaction
          .setSelection(TextSelection.create(transaction.doc, paragraphFrom + 2 + text.length))
          .scrollIntoView()
      );
      return true;
    };

    const exitFootnoteDefinition = (view: EditorView, ancestorDefinitionDepth: number) => {
      const { state } = view;
      const { $from } = state.selection;
      const ancestorDefinition = $from.node(ancestorDefinitionDepth);
      const currentChildIndex = $from.index(ancestorDefinitionDepth);
      if (currentChildIndex !== ancestorDefinition.childCount - 1) return false;

      const ancestorParent = $from.node(ancestorDefinitionDepth - 1);
      const ancestorIndex = $from.index(ancestorDefinitionDepth - 1);
      if (!ancestorParent.canReplaceWith(ancestorIndex + 1, ancestorIndex + 1, paragraph)) return false;

      const insertPosition = $from.after(ancestorDefinitionDepth);
      const transaction = state.tr.insert(insertPosition, paragraph.create());
      view.dispatch(
        transaction
          .setSelection(TextSelection.create(transaction.doc, insertPosition + 1))
          .scrollIntoView()
      );
      return true;
    };

    const previousSiblingIsFootnoteDefinition = ($from: ResolvedPos) => {
      if ($from.depth === 0) return false;

      const parentNode = $from.node($from.depth - 1);
      const index = $from.index($from.depth - 1);
      if (index === 0) return false;

      return parentNode.child(index - 1).type === footnoteDefinition;
    };

    return new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;

        const normalized = findNormalizableParagraph(newState);
        if (!normalized) return null;

        const transaction = newState.tr;
        const $from = transaction.doc.resolve(normalized.from);
        const parent = $from.node($from.depth);
        const index = $from.index($from.depth);
        if (!parent.canReplace(index, index + 1, normalized.parsed)) return null;

        return transaction.replaceWith(normalized.from, normalized.to, normalized.parsed);
      },
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;

          const { state } = view;
          const { selection } = state;
          if (!(selection instanceof TextSelection) || !selection.empty) return false;

          const { $from } = selection;
          if (!$from.parent.isTextblock || $from.parent.type !== paragraph) return false;
          if ($from.parent.content.size === 0 && previousSiblingIsFootnoteDefinition($from)) {
            event.preventDefault();
            return true;
          }

          const ancestorDefinitionDepth = findAncestorDepth($from, footnoteDefinition);
          if (ancestorDefinitionDepth === null) return false;

          if ($from.parent.content.size !== 0) {
            if ($from.parentOffset !== $from.parent.content.size) return false;

            event.preventDefault();
            return exitFootnoteDefinition(view, ancestorDefinitionDepth);
          }

          event.preventDefault();
          return true;
        },
        handlePaste(view, event, slice) {
          const pastedText = slice.content.textBetween(0, slice.content.size, "\n");
          if (!pastedText || pastedText.includes("\n")) return false;
          if (!hasUnescapedFootnoteSyntaxOutsideCode(pastedText)) return false;

          const { state } = view;
          const { selection } = state;
          if (!(selection instanceof TextSelection) || !selection.empty) return false;

          const { $from } = selection;
          if (!$from.parent.isTextblock || $from.parent.type !== paragraph) return false;

          const pastedFrom = $from.parentOffset;
          const pastedTo = pastedFrom + pastedText.length;
          const nextText = [
            $from.parent.textContent.slice(0, pastedFrom),
            pastedText,
            $from.parent.textContent.slice(pastedFrom)
          ].join("");
          const inlineCodeRange = inlineCodeRanges(nextText).find((range) => {
            if (!range.closed) return false;

            const markerLength = readBacktickRunLength(nextText, range.from);
            return pastedFrom >= range.from + markerLength && pastedTo <= range.to - markerLength;
          });
          if (!inlineCodeRange) return false;

          const markerLength = readBacktickRunLength(nextText, inlineCodeRange.from);
          const content = nextText.slice(inlineCodeRange.from + markerLength, inlineCodeRange.to - markerLength);
          if (!content) return false;

          const start = $from.start() + inlineCodeRange.from;
          const end = $from.start() + inlineCodeRange.to - pastedText.length;
          const markedText = state.schema.text(content, [inlineCode.create()]);
          const transaction = state.tr.replaceWith(start, end, markedText);
          event.preventDefault();
          view.dispatch(
            transaction
              .setSelection(TextSelection.create(transaction.doc, start + content.length))
              .scrollIntoView()
          );
          return true;
        },
        handleTextInput(view, from, to, text) {
          if (from !== to || text.length === 0) return false;

          const { state } = view;
          const { $from } = state.selection;
          if (!$from.parent.isTextblock || $from.parent.type !== paragraph) return false;
          if ($from.parentOffset !== $from.parent.content.size) return false;

          if (
            $from.parent.content.size === 0 &&
            findAncestorDepth($from, footnoteDefinition) !== null &&
            /^[ \t]+$/u.test(text)
          ) {
            return true;
          }

          const fullDefinitionMatch = footnoteDefinitionInputPattern.exec(text);
          if (fullDefinitionMatch && $from.parent.content.size === 0) {
            const label = fullDefinitionMatch[1]?.trim();
            if (!label) return false;

            return replaceCurrentParagraphWithDefinition(view, label, fullDefinitionMatch[2] ?? "");
          }

          const reference = $from.parent.firstChild;
          if (reference?.type !== footnoteReference) return false;

          const rest = $from.parent.textBetween(reference.nodeSize, $from.parent.content.size, "", "");
          const label = String(reference.attrs.label ?? "").trim();
          if (!label) return false;

          if (rest === "" && text === ":") return replaceCurrentParagraphWithDefinition(view, label, "");
          if (rest !== ":") return false;

          const definitionText = text.trimStart();
          return replaceCurrentParagraphWithDefinition(view, label, definitionText);
        }
      }
    });
  });
}
