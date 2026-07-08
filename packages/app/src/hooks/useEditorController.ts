import { useCallback, useEffect, useRef } from "react";
import { editorViewCtx, parserCtx, serializerCtx, type Editor } from "@milkdown/kit/core";
import { imageSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { Fragment, Slice, type MarkType, type Node as ProseNode, type NodeType } from "@milkdown/kit/prose/model";
import { NodeSelection, Selection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { AiDiffResult, AiDocumentAnchor, AiHeadingAnchor, AiSelectionContext } from "@markra/ai";
import {
  applyAiEditorResult,
  clearFinalizedImageSourceEditing,
  clearAiSelectionHold,
  clearAiEditorPreview,
  confirmAiEditorResultApplied,
  listAiEditorPreviewResults,
  findVisibleSearchMatchesInState,
  markraLiveMarkdownSpecs,
  scrollAiEditorPreviewIntoView,
  scrollSearchMatchIntoView,
  restoreEscapedLiveMarkdownSource,
  serializeLinkImageLiveMarkdown,
  setLiveMarkdownSourceContext,
  showAiEditorPreview,
  showAiSelectionHold,
  updateSearchDecorations,
  type AiEditorPreviewLabels
} from "@markra/editor";
import type { MarkdownOutlineItem } from "@markra/markdown";
import { debug, normalizedExternalAutolinkUrl, type SearchRange } from "@markra/shared";
import {
  clearSelectionFormattingInView,
  readSelectionFormattingActionsFromView,
  readSelectionFormattingStateFromView,
  setSelectionHeadingLevelInView,
  toggleSelectionLinkInView,
  toggleSelectionHighlightInView,
  type SelectionHeadingLevel,
  type SelectionFormattingState
} from "../lib/selection-formatting";
import { selectionAnchorFromRects, type SelectionAnchor } from "../lib/selection-anchor";

const fixedTitlebarHeight = 40;
const outlineScrollTopMargin = 24;
const outlineScrollTopOffset = fixedTitlebarHeight + outlineScrollTopMargin;
const aiCommandSelectionBottomMargin = 24;
const defaultMarkdownTable = [
  "|  |  |",
  "| --- | --- |",
  "|  |  |"
].join("\n");
const aiSelectionHoldSelector = ".markra-ai-selection-hold";

type MarkdownLinkInsertion =
  | {
      href: string;
      kind: "link";
      label: string;
      selectionFromOffset: number;
      selectionToOffset: number;
    }
  | {
      cursorOffset: number;
      insertedText: string;
      kind: "snippet";
      selectionFromOffset?: undefined;
      selectionToOffset?: undefined;
    }
  | {
      cursorOffset?: undefined;
      insertedText: string;
      kind: "snippet";
      selectionFromOffset: number;
      selectionToOffset: number;
    };

type MarkdownImageInsertion = {
  alt: string;
  insertedText: string;
  selectionFromOffset: number;
  selectionToOffset: number;
  src: string;
};

type MarkdownImageReference = {
  alt: string;
  src: string;
};

type EditorInsertionPoint = {
  left: number;
  top: number;
};

function comparableSerializedMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .trim();
}

function serializeCurrentEditorMarkdown(
  view: EditorView,
  serializeMarkdown: (doc: ProseNode) => string,
  link: MarkType,
  image: NodeType,
  liveMarkdownSpecs: ReturnType<typeof markraLiveMarkdownSpecs>
) {
  return restoreEscapedLiveMarkdownSource(
    serializeLinkImageLiveMarkdown(view.state.doc, serializeMarkdown, link, image),
    view.state,
    liveMarkdownSpecs
  );
}

type EditorReadyOptions = {
  autoFocus?: boolean;
};

export function shouldFocusEditorOnReady(markdown = "") {
  const params = new URLSearchParams(window.location.search);
  return params.has("blank") || params.has("path") || markdown.trim() === "";
}

export function scrollElementToContainerTop(element: Node | null, scrollContainer: Element | null) {
  if (!(element instanceof HTMLElement) || !(scrollContainer instanceof HTMLElement)) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  // Keep outline jumps slightly below the top edge so the heading has room to breathe.
  const top = Math.max(0, scrollContainer.scrollTop + elementRect.top - containerRect.top - outlineScrollTopOffset);

  if (typeof scrollContainer.scrollTo === "function") {
    scrollContainer.scrollTo({
      behavior: "auto",
      top
    });
    return;
  }

  scrollContainer.scrollTop = top;
}

export function scrollElementsAboveContainerBottomInset(
  elements: Iterable<Element>,
  scrollContainer: Element | null,
  bottomInset: number,
  margin = aiCommandSelectionBottomMargin
) {
  if (!(scrollContainer instanceof HTMLElement) || bottomInset <= 0) return false;

  const targetRects = Array.from(elements)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .map((element) => element.getBoundingClientRect());
  if (targetRects.length === 0) return false;

  const containerRect = scrollContainer.getBoundingClientRect();
  const targetBottom = Math.max(...targetRects.map((rect) => rect.bottom));
  const safeBottom = containerRect.bottom - bottomInset - margin;
  if (targetBottom <= safeBottom) return false;

  const top = Math.max(0, scrollContainer.scrollTop + targetBottom - safeBottom);
  if (typeof scrollContainer.scrollTo === "function") {
    scrollContainer.scrollTo({
      behavior: aiCommandSelectionScrollBehavior(),
      top
    });
    return true;
  }

  scrollContainer.scrollTop = top;
  return true;
}

function aiCommandSelectionScrollBehavior(): ScrollBehavior {
  if (typeof window.matchMedia !== "function") return "smooth";

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function markdownLinkInsertionForSelection(selectedText: string): MarkdownLinkInsertion {
  const href = normalizedExternalAutolinkUrl(selectedText);
  if (href) {
    return {
      href,
      kind: "link",
      label: selectedText.trim(),
      selectionFromOffset: 0,
      selectionToOffset: selectedText.trim().length
    };
  }

  const content = selectedText || "text";
  const insertedText = `[${content}](https://)`;
  if (selectedText) {
    return {
      insertedText,
      kind: "snippet",
      selectionFromOffset: 1,
      selectionToOffset: 1 + content.length
    };
  }

  return {
    cursorOffset: `[${content}`.length,
    insertedText,
    kind: "snippet"
  };
}

export function markdownImageInsertionForSelection(selectedText: string): MarkdownImageInsertion {
  const alt = selectedText || "alt";
  const markdownAlt = alt.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]");
  const src = "assets/image.png";
  const insertedText = `![${markdownAlt}](${src})`;
  const selectionFromOffset = markdownAlt.length + 4;

  return {
    alt,
    insertedText,
    selectionFromOffset,
    selectionToOffset: selectionFromOffset + src.length,
    src
  };
}

function findInsertedImageNodePosition(
  doc: ProseNode,
  image: NodeType,
  insertion: MarkdownImageInsertion,
  preferredPosition: number
) {
  let bestPosition: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  doc.descendants((node, position) => {
    if (node.type !== image) return true;
    if (String(node.attrs.alt ?? "") !== insertion.alt) return true;
    if (String(node.attrs.src ?? "") !== insertion.src) return true;

    const distance = Math.abs(position - preferredPosition);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = position;
    }

    return true;
  });

  return bestPosition;
}

function focusInsertedImageSource(view: EditorView, insertion: MarkdownImageInsertion) {
  const source = view.dom.querySelector<HTMLInputElement>(".markra-image-node-source");
  if (!source) {
    view.focus();
    return;
  }

  source.focus();
  source.setSelectionRange(insertion.selectionFromOffset, insertion.selectionToOffset);
}

function emptyTopLevelParagraphSelectionRange(view: EditorView, selection: Selection = view.state.selection) {
  if (!selection.empty) return null;
  let range: { from: number; to: number } | null = null;

  view.state.doc.forEach((node, offset) => {
    if (range) return;
    if (node.type.name !== "paragraph" || node.content.size > 0) return;
    if (selection.from < offset || selection.from > offset + node.nodeSize) return;

    range = {
      from: offset,
      to: offset + node.nodeSize
    };
  });

  return range;
}

function editorSelectionAtPoint(view: EditorView, point: EditorInsertionPoint) {
  const position = view.posAtCoords(point);
  if (!position) return null;

  return Selection.near(view.state.doc.resolve(position.pos));
}

function insertMarkdownImageReferences(
  view: EditorView,
  image: NodeType,
  images: MarkdownImageReference[],
  selection: Selection
) {
  const range = emptyTopLevelParagraphSelectionRange(view, selection) ?? selection;
  const fragment = Fragment.fromArray(
    images.map((savedImage) =>
      image.create({
        alt: savedImage.alt || "image",
        src: savedImage.src,
        title: ""
      })
    )
  );
  const tr = view.state.tr.replaceWith(range.from, range.to, fragment).scrollIntoView();
  const cursor = Math.min(tr.doc.content.size, range.from + fragment.size);

  tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), -1));
  view.dispatch(tr);
  view.focus();
}

export function readAiSelectionContextFromView(view: EditorView): AiSelectionContext {
  const { doc, selection } = view.state;

  if (!selection.empty) {
    const fullDocument = selection.from === 0 && selection.to === doc.content.size;

    return {
      cursor: selection.to,
      ...(fullDocument ? { fullDocument: true } : {}),
      from: selection.from,
      source: "selection",
      text: doc.textBetween(selection.from, selection.to, "\n"),
      to: selection.to
    };
  }

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.textContent.trim().length === 0) {
    return {
      cursor: selection.from,
      from: selection.from,
      text: "",
      to: selection.to
    };
  }

  const from = $from.start();
  const to = $from.end();

  return {
    cursor: selection.from,
    from,
    source: "block",
    text: doc.textBetween(from, to, "\n"),
    to
  };
}

export function selectionAnchorFromEditorView(view: EditorView): SelectionAnchor | null {
  const { selection } = view.state;
  if (selection.empty) return null;

  const range = view.dom.ownerDocument.createRange();
  const from = view.domAtPos(selection.from);
  const to = view.domAtPos(selection.to);

  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);

  const rectsAnchor = selectionAnchorFromRects(range.getClientRects());
  if (rectsAnchor) return rectsAnchor;

  return selectionAnchorFromRects([range.getBoundingClientRect()]);
}

export function readAiTableAnchorsFromView(view: EditorView): AiDocumentAnchor[] {
  const anchors: AiDocumentAnchor[] = [];
  let currentHeadingTitle: string | null = null;

  view.state.doc.descendants((node, position) => {
    if (node.type.name === "heading") {
      currentHeadingTitle = node.textContent.trim() || null;
      return true;
    }

    if (node.type.name !== "table") return true;

    const tableMarkdown = tableNodeToMarkdown(node);
    const tableIndex = anchors.length;
    const headerTitle = tableHeaderTitle(tableMarkdown);
    const title = currentHeadingTitle ? `${currentHeadingTitle} table` : `Table: ${headerTitle}`;

    anchors.push({
      description: headerTitle ? `Markdown table ${title}: ${headerTitle}` : `Markdown table ${title}`,
      from: position,
      id: `table:${tableIndex}`,
      kind: "table",
      text: tableMarkdown,
      title,
      to: position + node.nodeSize
    });

    return false;
  });

  return anchors;
}

export function readAiSectionAnchorsFromView(view: EditorView): AiDocumentAnchor[] {
  const headings: Array<{ from: number; level: number; title: string; to: number }> = [];

  view.state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") return true;

    headings.push({
      from: position,
      level: Number(node.attrs.level ?? 1),
      title: node.textContent.trim(),
      to: position + node.nodeSize
    });

    return true;
  });

  return headings.map((heading, index) => {
    let sectionEnd = view.state.doc.content.size;

    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const nextHeading = headings[nextIndex]!;
      if (nextHeading.level <= heading.level) {
        sectionEnd = nextHeading.from;
        break;
      }
    }

    return {
      description: `Section ${heading.title}`,
      from: heading.from,
      id: `section:${index}`,
      kind: "section" as const,
      text: view.state.doc.textBetween(heading.from, sectionEnd, "\n"),
      title: heading.title,
      to: sectionEnd
    };
  });
}

function tableNodeToMarkdown(tableNode: ProseNode) {
  const rows: string[][] = [];

  tableNode.forEach((rowNode) => {
    const row: string[] = [];
    rowNode.forEach((cellNode) => {
      row.push(formatTableCellText(cellNode.textContent));
    });
    rows.push(row);
  });

  if (!rows.length) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );
  const separator = Array.from({ length: columnCount }, (_, index) => {
    const columnWidth = normalizedRows[0]?.[index]?.length ?? 0;

    return "-".repeat(Math.max(3, columnWidth));
  });

  return [
    tableMarkdownRow(normalizedRows[0] ?? []),
    tableMarkdownRow(separator),
    ...normalizedRows.slice(1).map((row) => tableMarkdownRow(row))
  ].join("\n");
}

function tableMarkdownRow(cells: string[]) {
  return `| ${cells.join(" | ")} |`;
}

function formatTableCellText(text: string) {
  return text.replace(/\s+/gu, " ").replace(/\|/gu, "\\|").trim();
}

function tableHeaderTitle(tableMarkdown: string) {
  const headerLine = tableMarkdown.split("\n")[0] ?? "";

  return headerLine
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
}

export function useEditorController() {
  const editorRef = useRef<Editor | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  const getMarkdownFromEditor = useCallback((editor: Editor, fallbackContent: string) => {
    try {
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        return serializeCurrentEditorMarkdown(
          view,
          ctx.get(serializerCtx),
          linkSchema.type(ctx),
          imageSchema.type(ctx),
          markraLiveMarkdownSpecs(ctx)
        );
      });
    } catch {
      return fallbackContent;
    }
  }, []);

  const getCurrentMarkdown = useCallback((fallbackContent: string) => {
    const editor = editorRef.current;
    return editor ? getMarkdownFromEditor(editor, fallbackContent) : fallbackContent;
  }, [getMarkdownFromEditor]);

  const isCurrentMarkdownEquivalent = useCallback((markdown: string) => {
    try {
      const editor = editorRef.current;
      if (!editor) return undefined;

      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const parseMarkdown = ctx.get(parserCtx);
        const serializer = ctx.get(serializerCtx);
        const link = linkSchema.type(ctx);
        const image = imageSchema.type(ctx);
        const liveMarkdownSpecs = markraLiveMarkdownSpecs(ctx);
        const currentMarkdown = serializeCurrentEditorMarkdown(
          view,
          serializer,
          link,
          image,
          liveMarkdownSpecs
        );
        const parsedMarkdown = serializeLinkImageLiveMarkdown(parseMarkdown(markdown), serializer, link, image);

        return comparableSerializedMarkdown(currentMarkdown) === comparableSerializedMarkdown(parsedMarkdown);
      });
    } catch {
      return false;
    }
  }, []);

  const replaceMarkdown = useCallback((
    markdown: string,
    options: { addToHistory?: boolean; historyBaselineMarkdown?: string } = {}
  ) => {
    try {
      const editor = editorRef.current;
      if (!editor) {
        debug(() => ["[markra-history] editor replace skipped", {
          reason: "editor not ready",
          requestedChars: markdown.length
        }]);
        return false;
      }

      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const parseMarkdown = ctx.get(parserCtx);
        const serializer = ctx.get(serializerCtx);
        const link = linkSchema.type(ctx);
        const image = imageSchema.type(ctx);
        const liveMarkdownSpecs = markraLiveMarkdownSpecs(ctx);
        const currentMarkdown = serializeCurrentEditorMarkdown(
          view,
          serializer,
          link,
          image,
          liveMarkdownSpecs
        );
        if (comparableSerializedMarkdown(currentMarkdown) === comparableSerializedMarkdown(markdown)) {
          if (
            options.addToHistory &&
            options.historyBaselineMarkdown !== undefined &&
            comparableSerializedMarkdown(options.historyBaselineMarkdown) !== comparableSerializedMarkdown(markdown)
          ) {
            const baselineDocument = parseMarkdown(options.historyBaselineMarkdown);
            const baselineTransaction = setLiveMarkdownSourceContext(
              view.state.tr
                .replace(0, view.state.doc.content.size, new Slice(baselineDocument.content, 0, 0))
                .setMeta("addToHistory", false),
              liveMarkdownSpecs,
              options.historyBaselineMarkdown
            );
            view.dispatch(baselineTransaction);

            const parsedDocument = parseMarkdown(markdown);
            const selectionPosition = Math.min(view.state.selection.from, parsedDocument.content.size);
            const historyTransaction = setLiveMarkdownSourceContext(
              view.state.tr
                .replace(0, view.state.doc.content.size, new Slice(parsedDocument.content, 0, 0)),
              liveMarkdownSpecs,
              markdown
            );

            historyTransaction.setSelection(TextSelection.near(historyTransaction.doc.resolve(selectionPosition))).scrollIntoView();
            view.dispatch(historyTransaction);
            debug(() => ["[markra-history] editor replace history repaired", {
              currentChars: currentMarkdown.length,
              requestedChars: markdown.length,
              selectionPosition
            }]);
            return true;
          }

          debug(() => ["[markra-history] editor replace skipped", {
            currentChars: currentMarkdown.length,
            reason: "contents equivalent",
            requestedChars: markdown.length
          }]);
          return true;
        }

        const parsedDocument = parseMarkdown(markdown);
        const selectionPosition = Math.min(view.state.selection.from, parsedDocument.content.size);
        const tr = setLiveMarkdownSourceContext(
          view.state.tr
            .replace(0, view.state.doc.content.size, new Slice(parsedDocument.content, 0, 0)),
          liveMarkdownSpecs,
          markdown
        );

        if (!options.addToHistory) {
          tr.setMeta("addToHistory", false);
        }

        tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPosition))).scrollIntoView();
        view.dispatch(tr);
        debug(() => ["[markra-history] editor replace dispatched", {
          currentChars: currentMarkdown.length,
          requestedChars: markdown.length,
          selectionPosition
        }]);
        return true;
      });
    } catch (error: unknown) {
      debug(() => ["[markra-history] editor replace failed", {
        error: error instanceof Error ? error.message : String(error),
        requestedChars: markdown.length
      }]);
      return false;
    }
  }, []);

  const getSelection = useCallback((): AiSelectionContext | null => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return null;

      return readAiSelectionContextFromView(view);
    } catch {
      return null;
    }
  }, []);
  const getSelectionAnchor = useCallback((): SelectionAnchor | null => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return null;

      return selectionAnchorFromEditorView(view);
    } catch {
      return null;
    }
  }, []);

  const getSelectionFormattingActions = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      return readSelectionFormattingActionsFromView(view);
    } catch {
      return [];
    }
  }, []);

  const getSelectionFormattingState = useCallback((): SelectionFormattingState => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) {
        return {
          actions: [],
          headingLevel: null
        };
      }

      return readSelectionFormattingStateFromView(view);
    } catch {
      return {
        actions: [],
        headingLevel: null
      };
    }
  }, []);

  const setSelectionHeadingLevel = useCallback((level: SelectionHeadingLevel) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      return setSelectionHeadingLevelInView(view, level);
    } catch {
      return false;
    }
  }, []);

  const toggleSelectionHighlight = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      return toggleSelectionHighlightInView(view);
    } catch {
      return false;
    }
  }, []);

  const clearSelectionFormatting = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      return clearSelectionFormattingInView(view);
    } catch {
      return false;
    }
  }, []);

  const getHeadingAnchors = useCallback((): AiHeadingAnchor[] => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      const anchors: AiHeadingAnchor[] = [];
      view.state.doc.descendants((node, position) => {
        if (node.type.name !== "heading") return true;

        anchors.push({
          from: position,
          level: Number(node.attrs.level ?? 1),
          title: node.textContent.trim(),
          to: position + node.nodeSize
        });

        return true;
      });

      return anchors;
    } catch {
      return [];
    }
  }, []);

  const getTableAnchors = useCallback((): AiDocumentAnchor[] => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      return readAiTableAnchorsFromView(view);
    } catch {
      return [];
    }
  }, []);

  const getSectionAnchors = useCallback((): AiDocumentAnchor[] => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      return readAiSectionAnchorsFromView(view);
    } catch {
      return [];
    }
  }, []);

  const getDocumentEndPosition = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return 0;

      return view.state.doc.content.size;
    } catch {
      return 0;
    }
  }, []);

  const handleEditorReady = useCallback((editor: Editor | null, options: EditorReadyOptions = {}) => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    editorRef.current = editor;

    if (!editor || !options.autoFocus) return;

    focusTimerRef.current = window.setTimeout(() => {
      if (editorRef.current !== editor) return;

      try {
        const view = editor.action((ctx) => ctx.get(editorViewCtx));
        view.focus();
      } catch {
        // The editor may have been torn down before the deferred focus runs.
      } finally {
        focusTimerRef.current = null;
      }
    }, 0);
  }, []);

  const runEditorShortcut = useCallback(
    (
      key: string,
      modifiers: Pick<KeyboardEventInit, "altKey" | "code" | "shiftKey"> = {},
      options: { focusEditor?: boolean } = {}
    ) => {
      const editor = editorRef.current;
      if (!editor) return false;

      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        metaKey: true,
        ...modifiers
      });
      const handled = view.someProp("handleKeyDown", (handler) => handler(view, event));

      if (handled && options.focusEditor !== false) {
        view.focus();
      }

      return Boolean(handled);
    },
    []
  );

  const findSearchMatches = useCallback((query: string, options: { caseSensitive?: boolean } = {}) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      return findVisibleSearchMatchesInState(view.state, query, options);
    } catch {
      return [];
    }
  }, []);

  const showSearchMatches = useCallback((
    matches: SearchRange[],
    activeIndex: number,
    options: { suppressEditorChrome?: boolean } = {}
  ) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return;

      if (options.suppressEditorChrome) clearFinalizedImageSourceEditing(view);
      updateSearchDecorations(view, matches, activeIndex, options);
    } catch {
      // Search decoration is a transient affordance; failing to draw it should not interrupt editing.
    }
  }, []);

  const revealSearchMatch = useCallback((match: SearchRange | null | undefined) => {
    if (!match) return false;

    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      return scrollSearchMatchIntoView(view);
    } catch {
      return false;
    }
  }, []);

  const replaceSearchMatch = useCallback((match: SearchRange | null | undefined, replacement: string) => {
    if (!match) return false;

    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      view.dispatch(
        view.state.tr
          .insertText(replacement, match.from, match.to)
          .scrollIntoView()
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const replaceAllSearchMatches = useCallback((matches: SearchRange[], replacement: string) => {
    if (matches.length === 0) return false;

    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      const transaction = [...matches]
        .sort((left, right) => right.from - left.from)
        .reduce((tr, match) => tr.insertText(replacement, match.from, match.to), view.state.tr)
        .scrollIntoView();

      view.dispatch(transaction);
      return true;
    } catch {
      return false;
    }
  }, []);

  const insertMarkdownSnippet = useCallback((open: string, close: string, placeholder: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    const { from, to } = view.state.selection;
    const selectedText = view.state.doc.textBetween(from, to, " ");
    const content = selectedText || placeholder;
    const insertedText = `${open}${content}${close}`;
    const cursor = selectedText ? from + insertedText.length : from + open.length + content.length;
    const tr = view.state.tr.insertText(insertedText, from, to);
    tr.setSelection(TextSelection.create(tr.doc, cursor)).scrollIntoView();

    view.dispatch(tr);
    view.focus();
  }, []);

  const insertMarkdownImage = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const image = imageSchema.type(ctx);
      const parseMarkdown = ctx.get(parserCtx);
      const { from, to } = view.state.selection;
      const selectedText = view.state.doc.textBetween(from, to, " ");
      const insertion = markdownImageInsertionForSelection(selectedText);
      const parsedDocument = parseMarkdown(insertion.insertedText);
      const tr = view.state.tr.replaceRange(from, to, new Slice(parsedDocument.content, 0, 0));
      const imagePosition = findInsertedImageNodePosition(tr.doc, image, insertion, from);

      if (imagePosition !== null) {
        tr.setSelection(NodeSelection.create(tr.doc, imagePosition)).scrollIntoView();
      } else {
        tr.scrollIntoView();
      }

      view.dispatch(tr);
      focusInsertedImageSource(view, insertion);
    });
  }, []);

  const insertMarkdownImages = useCallback((images: MarkdownImageReference[]) => {
    const editor = editorRef.current;
    if (!editor || images.length === 0) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const image = imageSchema.type(ctx);
      insertMarkdownImageReferences(view, image, images, view.state.selection);
    });
  }, []);

  const insertMarkdownImagesAtPoint = useCallback((images: MarkdownImageReference[], point: EditorInsertionPoint) => {
    const editor = editorRef.current;
    if (!editor || images.length === 0) return false;

    let inserted = false;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const selection = editorSelectionAtPoint(view, point);
      if (!selection) return;

      const image = imageSchema.type(ctx);
      insertMarkdownImageReferences(view, image, images, selection);
      inserted = true;
    });

    return inserted;
  }, []);

  const insertMarkdownLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (toggleSelectionLinkInView(view)) return;

      const { from, to } = view.state.selection;
      const selectedText = view.state.doc.textBetween(from, to, " ");
      const insertion = markdownLinkInsertionForSelection(selectedText);

      if (insertion.kind === "link") {
        const link = linkSchema.type(ctx);
        const linkedText = view.state.schema.text(insertion.label, [
          link.create({ href: insertion.href })
        ]);
        const tr = view.state.tr.replaceWith(from, to, linkedText);
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            from + insertion.selectionFromOffset,
            from + insertion.selectionToOffset
          )
        ).scrollIntoView();

        view.dispatch(tr);
        view.focus();
        return;
      }

      const tr = view.state.tr.insertText(insertion.insertedText, from, to);
      const selection =
        insertion.selectionFromOffset === undefined
          ? TextSelection.create(tr.doc, from + insertion.cursorOffset)
          : TextSelection.create(tr.doc, from + insertion.selectionFromOffset, from + insertion.selectionToOffset);
      tr.setSelection(selection).scrollIntoView();

      view.dispatch(tr);
      view.focus();
    });
  }, []);

  const insertMarkdownTable = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
      const parsedDocument = parseMarkdown(defaultMarkdownTable);
      const { from, to } = view.state.selection;
      const tr = view.state.tr.replaceRange(from, to, new Slice(parsedDocument.content, 0, 0)).scrollIntoView();

      view.dispatch(tr);
      view.focus();
    } catch {
      // Table insertion is a convenience command; failing silently keeps the editor usable.
    }
  }, []);

  const applyAiResult = useCallback((result: AiDiffResult, options: { previewId?: string } = {}) => {
    if (result.type === "error") return false;

    try {
      const editor = editorRef.current;
      if (!editor) return false;

      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
      return applyAiEditorResult(view, result, {
        parseMarkdown,
        previewId: options.previewId
      });
    } catch {
      return false;
    }
  }, []);

  const previewAiResult = useCallback((
    result: AiDiffResult,
    labels?: AiEditorPreviewLabels,
    options: { previewId?: string } = {}
  ) => {
    try {
      const editor = editorRef.current;
      if (!editor) return;

      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
      showAiEditorPreview(view, result, labels, { parseMarkdown, previewId: options.previewId });
    } catch {
      // AI preview is a visual affordance. Failing to draw it should not block the command flow.
    }
  }, []);

  const confirmAiResultApplied = useCallback((result: AiDiffResult, options: { previewId?: string } = {}) => {
    if (result.type === "error") return;

    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return;

      confirmAiEditorResultApplied(view, result, {
        previewId: options.previewId
      });
    } catch {
      // The editor may already have been torn down; the document edit itself has still been applied.
    }
  }, []);

  const holdAiSelection = useCallback((selection: AiSelectionContext) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return;

      showAiSelectionHold(view, selection);
    } catch {
      // Losing this decoration should not interrupt the AI command flow.
    }
  }, []);

  const scrollAiSelectionAboveCommand = useCallback((bottomInset: number) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      const selectionHoldElements = view.dom.querySelectorAll(aiSelectionHoldSelector);
      return scrollElementsAboveContainerBottomInset(
        selectionHoldElements,
        view.dom.closest(".paper-scroll"),
        bottomInset
      );
    } catch {
      return false;
    }
  }, []);

  const clearAiPreview = useCallback((result?: AiDiffResult, options: { previewId?: string } = {}) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return;

      clearAiEditorPreview(view, result, options);
    } catch {
      // The editor may be unavailable while windows are changing.
    }
  }, []);

  const listAiPreviews = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return [];

      return listAiEditorPreviewResults(view);
    } catch {
      return [];
    }
  }, []);

  const scrollToAiPreview = useCallback((result?: AiDiffResult, options: { previewId?: string } = {}) => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return false;

      return scrollAiEditorPreviewIntoView(view, result, options);
    } catch {
      return false;
    }
  }, []);

  const clearAiSelection = useCallback(() => {
    try {
      const view = editorRef.current?.action((ctx) => ctx.get(editorViewCtx));
      if (!view) return;

      clearAiSelectionHold(view);
    } catch {
      // The editor may be unavailable while the AI command is closing.
    }
  }, []);

  const selectOutlineItem = useCallback((targetItem: MarkdownOutlineItem, targetIndex: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      let headingIndex = -1;
      let targetNodePosition: number | null = null;
      let targetPosition: number | null = null;

      view.state.doc.descendants((node, position) => {
        if (node.type.name !== "heading") return true;

        const headingTitle = node.textContent.trim();
        if (!headingTitle) return true;

        headingIndex += 1;
        if (
          headingIndex === targetIndex &&
          Number(node.attrs.level) === targetItem.level &&
          headingTitle === targetItem.title
        ) {
          // Keep the cursor inside the matched heading while the DOM scroll aligns the heading itself.
          targetNodePosition = position;
          targetPosition = position + 1;
          return false;
        }

        return true;
      });

      if (targetPosition === null) {
        view.focus();
        return;
      }

      const resolvedPosition = view.state.doc.resolve(targetPosition);
      const selection = TextSelection.near(resolvedPosition);

      view.focus();
      view.dispatch(view.state.tr.setSelection(selection));
      scrollElementToContainerTop(
        targetNodePosition === null ? null : view.nodeDOM(targetNodePosition),
        view.dom.closest(".paper-scroll")
      );
    } catch {
      // The sidebar should remain usable even if the editor is still booting.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    };
  }, []);

  return {
    applyAiResult,
    clearAiPreview,
    clearAiSelection,
    clearSelectionFormatting,
    confirmAiResultApplied,
    findSearchMatches,
    getDocumentEndPosition,
    getHeadingAnchors,
    getCurrentMarkdown,
    getMarkdownFromEditor,
    isCurrentMarkdownEquivalent,
    getSelection,
    getSelectionAnchor,
    getSelectionFormattingActions,
    getSelectionFormattingState,
    getSectionAnchors,
    getTableAnchors,
    handleEditorReady,
    holdAiSelection,
    insertMarkdownImage,
    insertMarkdownImages,
    insertMarkdownImagesAtPoint,
    insertMarkdownLink,
    insertMarkdownSnippet,
    insertMarkdownTable,
    listAiPreviews,
    previewAiResult,
    replaceAllSearchMatches,
    replaceMarkdown,
    replaceSearchMatch,
    revealSearchMatch,
    runEditorShortcut,
    scrollAiSelectionAboveCommand,
    setSelectionHeadingLevel,
    scrollToAiPreview,
    selectOutlineItem,
    showSearchMatches,
    toggleSelectionHighlight
  };
}
