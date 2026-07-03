import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg id="${id}" data-testid="mock-mermaid"><g></g></svg>`
    }))
  }
}));

import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import { Fragment, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { MarkdownPaper } from "./MarkdownPaper";
import {
  AI_EDITOR_PREVIEW_APPLIED_EVENT,
  AI_EDITOR_PREVIEW_ACTION_EVENT,
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
  type AiEditorPreviewAppliedDetail,
  type AiEditorPreviewActionDetail,
  type RemoteClipboardImage,
  applyAiEditorResult,
  clearAiEditorPreview,
  clearAiSelectionHold,
  confirmAiEditorResultApplied,
  createWordSetSpellchecker,
  defaultMarkdownShortcuts,
  findSearchMatchesInDoc,
  findVisibleSearchMatchesInState,
  mermaidThemeFromElement,
  scrollAiEditorPreviewIntoView,
  showAiEditorPreview,
  showAiSelectionHold,
  updateSearchDecorations,
  type MarkdownShortcutMap,
  type Spellchecker
} from "@markra/editor";
import {
  readAiSectionAnchorsFromView,
  readAiSelectionContextFromView,
  readAiTableAnchorsFromView
} from "../hooks/useEditorController";
import type { AiSelectionContext } from "@markra/ai";
import type {
  EditorFontFamilyPreference,
  EditorTheme,
  ExtendedSyntaxPreferences,
  TableColumnWidthModePreference
} from "../lib/settings/app-settings";

const tableColumnWidthModeLabel = "Column width mode";

async function renderEditor(
  initialContent = "",
  options: {
    documentPath?: string | null;
    editorTheme?: EditorTheme;
    editorFontFamily?: EditorFontFamilyPreference;
    onMarkdownChange?: (content: string) => unknown;
    onSaveClipboardImage?: (image: File) => Promise<{ alt: string; src: string } | null>;
    onSaveClipboardAttachment?: (attachment: File) => Promise<{ label: string; src: string } | null>;
    onSaveRemoteClipboardImage?: (image: RemoteClipboardImage) => Promise<{ alt: string; src: string } | null>;
    openLocalAttachment?: (src: string) => unknown;
    openExternalUrl?: (url: string) => unknown;
    bottomOverlayInset?: number;
    onTextSelectionChange?: (selection: AiSelectionContext | null) => unknown;
    readOnly?: boolean;
    resolveImageSrc?: (src: string) => string;
    markdownShortcuts?: MarkdownShortcutMap;
    extendedSyntax?: ExtendedSyntaxPreferences;
    workspaceFiles?: Array<{
      kind?: "asset" | "attachment" | "folder";
      name: string;
      path: string;
      relativePath: string;
    }>;
    spellcheckEnabled?: boolean;
    spellcheckIgnoredWords?: readonly string[];
    spellchecker?: Spellchecker;
    onAddSpellcheckIgnoredWord?: (word: string) => unknown;
    tableColumnWidthMode?: TableColumnWidthModePreference;
    wrapCodeBlocks?: boolean;
  } = {}
) {
  let editor: Editor | null = null;
  const result = render(
    <MarkdownPaper
      documentPath={options.documentPath}
      editorTheme={options.editorTheme}
      editorFontFamily={options.editorFontFamily}
      bottomOverlayInset={options.bottomOverlayInset}
      initialContent={initialContent}
      onEditorReady={(instance) => {
        editor = instance;
      }}
      extendedSyntax={options.extendedSyntax}
      markdownShortcuts={options.markdownShortcuts}
      onMarkdownChange={options.onMarkdownChange ?? (() => {})}
      onSaveClipboardAttachment={options.onSaveClipboardAttachment}
      onSaveClipboardImage={options.onSaveClipboardImage}
      onSaveRemoteClipboardImage={options.onSaveRemoteClipboardImage}
      openLocalAttachment={options.openLocalAttachment}
      openExternalUrl={options.openExternalUrl}
      readOnly={options.readOnly}
      onTextSelectionChange={options.onTextSelectionChange}
      resolveImageSrc={options.resolveImageSrc}
      revision={0}
      spellcheckEnabled={options.spellcheckEnabled}
      spellcheckIgnoredWords={options.spellcheckIgnoredWords}
      spellchecker={options.spellchecker}
      tableColumnWidthMode={options.tableColumnWidthMode}
      onAddSpellcheckIgnoredWord={options.onAddSpellcheckIgnoredWord}
      workspaceFiles={options.workspaceFiles}
      wrapCodeBlocks={options.wrapCodeBlocks}
    />
  );

  await act(async () => {
    await Promise.resolve();
  });

  await waitFor(() => expect(editor).not.toBeNull(), { timeout: 5000 });

  return {
    ...result,
    editor: editor!,
    view: editor!.action((ctx) => ctx.get(editorViewCtx))
  };
}

async function settleMarkdownListener() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 250);
  });
}

function typeText(view: EditorView, text: string) {
  for (const char of text) {
    const { from, to } = view.state.selection;
    const insertText = () => view.state.tr.insertText(char, from, to).scrollIntoView();
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, insertText));

    if (!handled) {
      view.dispatch(insertText());
    }
  }
}

function insertTextDirectly(view: EditorView, text: string) {
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
}

const syntheticSpellchecker = createWordSetSpellchecker([
  "accommodate",
  "and",
  "document",
  "environment",
  "mentions",
  "this",
  "word"
]);

function insertTextThroughInputHandler(view: EditorView, text: string) {
  const { from, to } = view.state.selection;
  const insertText = () => view.state.tr.insertText(text, from, to).scrollIntoView();
  const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, text, insertText));

  if (!handled) {
    view.dispatch(insertText());
  }

  return Boolean(handled);
}

function moveCursor(view: EditorView, position: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
}

function focusEditor(view: EditorView) {
  view.focus();
  fireEvent.focus(view.dom);
}

function selectNode(view: EditorView, position: number) {
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
}

function selectText(view: EditorView, from: number, to: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

function selectedPlainClipboardText(view: EditorView) {
  return plainClipboardTextFromSlice(view, view.state.selection.content());
}

function plainClipboardTextFromSlice(view: EditorView, slice: Slice) {
  let text: string | null = null;

  view.someProp("clipboardTextSerializer", (serializer) => {
    text = serializer(slice, view);
    return true;
  });

  return text ?? slice.content.textBetween(0, slice.content.size, "\n\n");
}

function findFirstProseNode(view: EditorView, typeName: string): ProseNode {
  const matches: ProseNode[] = [];

  view.state.doc.descendants((node) => {
    if (matches.length > 0 || node.type.name !== typeName) return true;

    matches.push(node);
    return false;
  });

  const result = matches[0];
  if (!result) {
    throw new Error(`Could not find node in editor: ${typeName}`);
  }

  return result;
}

function clickFinalizedImage(target: Element) {
  const mouseDownResult = fireEvent.mouseDown(target);
  fireEvent.click(target);
  return mouseDownResult;
}

function testRect(rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">): DOMRect {
  return {
    ...rect,
    height: rect.bottom - rect.top,
    width: rect.right - rect.left,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({})
  } as DOMRect;
}

function mockInlineElementRect(element: HTMLElement, rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">) {
  const domRect = testRect(rect);

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => domRect
  });
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => [domRect]
  });
}

function findFirstTextBlockCursor(view: EditorView) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (!node.isTextblock) return true;

    position = nodePosition + 1;
    return false;
  });

  if (position === null) {
    throw new Error("Could not find text block in editor.");
  }

  return position;
}

function findLastTextBlockCursor(view: EditorView) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (!node.isTextblock) return true;

    position = nodePosition + 1;
    return true;
  });

  if (position === null) {
    throw new Error("Could not find text block in editor.");
  }

  return position;
}

function findLastTextBlockEndCursor(view: EditorView) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (!node.isTextblock) return true;

    position = nodePosition + 1 + node.content.size;
    return true;
  });

  if (position === null) {
    throw new Error("Could not find text block in editor.");
  }

  return position;
}

function splitCurrentTextBlockDirectly(view: EditorView) {
  view.dispatch(view.state.tr.split(view.state.selection.from).scrollIntoView());
}

function findTextPosition(view: EditorView, text: string, offset = 0) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (position !== null) return false;
    if (!node.isText || !node.text) return;

    const textOffset = node.text.indexOf(text);
    if (textOffset === -1) return;

    position = nodePosition + textOffset + offset;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find text in editor: ${text}`);
  }

  return position;
}

function findNodeEndPosition(view: EditorView, typeName: string) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (position !== null) return false;
    if (node.type.name !== typeName) return true;

    position = nodePosition + node.nodeSize;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find node in editor: ${typeName}`);
  }

  return position;
}

function findNodeStartPosition(view: EditorView, typeName: string) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (position !== null) return false;
    if (node.type.name !== typeName) return true;

    position = nodePosition;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find node in editor: ${typeName}`);
  }

  return position;
}

function findTopLevelEmptyParagraphPosition(view: EditorView) {
  let position: number | null = null;

  view.state.doc.forEach((node, offset) => {
    if (position !== null) return;
    if (node.type.name !== "paragraph" || node.content.size > 0) return;

    position = offset;
  });

  if (position === null) {
    throw new Error("Could not find top-level empty paragraph in editor.");
  }

  return position;
}

function pressEnter(view: EditorView) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pressBackspace(view: EditorView, options: Pick<KeyboardEventInit, "repeat"> = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Backspace",
    bubbles: true,
    cancelable: true,
    ...options
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pressArrowRight(view: EditorView) {
  const event = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pressArrowLeft(view: EditorView) {
  const event = new KeyboardEvent("keydown", {
    key: "ArrowLeft",
    bubbles: true,
    cancelable: true
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pressArrowDown(view: EditorView) {
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pressShortcut(
  view: EditorView,
  key: string,
  modifiers: Pick<KeyboardEventInit, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"> = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers
  });
  return view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function pasteImage(view: EditorView, image: File) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [image],
      getData: () => ""
    }
  });

  return view.someProp("handlePaste", (handler) => handler(view, event, view.state.selection.content()));
}

function dispatchMixedClipboardPaste(view: EditorView, data: { files: File[]; html?: string; plainText?: string }) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: data.files,
      getData: (type: string) => {
        if (type === "text/html") return data.html ?? "";
        if (type === "text/plain") return data.plainText ?? "";
        return "";
      }
    }
  });

  view.dom.dispatchEvent(event);
}

function dispatchCopy(view: EditorView) {
  const data = new Map<string, string>();
  const event = new Event("copy", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;

  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: (type?: string) => {
        if (type) {
          data.delete(type);
          return;
        }

        data.clear();
      },
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => {
        data.set(type, value);
      }
    }
  });

  view.dom.dispatchEvent(event);

  return data;
}

function pasteFile(view: EditorView, file: File) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [file],
      getData: () => ""
    }
  });

  return view.someProp("handlePaste", (handler) => handler(view, event, view.state.selection.content()));
}

function pasteHtml(view: EditorView, html: string, slice: Slice) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) => type === "text/html" ? html : ""
    }
  });

  return view.someProp("handlePaste", (handler) => handler(view, event, slice));
}

function pasteText(view: EditorView, text: string) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) => type === "text/plain" ? text : ""
    }
  });

  return view.someProp("handlePaste", (handler) => handler(view, event, view.state.selection.content()));
}

function dropImage(view: EditorView, image: File) {
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [image]
    }
  });

  return view.someProp("handleDrop", (handler) => handler(view, event, view.state.selection.content(), false));
}

function dropMarkdownImageDragPayload(
  view: EditorView,
  payload: { alt: string; path: string; relativePath: string }
) {
  const dataTransfer = createDragDataTransfer();
  dataTransfer.setData("application/x-markra-markdown-image", JSON.stringify(payload));
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true
  }) as DragEvent;
  Object.defineProperty(event, "clientX", { value: 20 });
  Object.defineProperty(event, "clientY", { value: 20 });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });

  return view.someProp("handleDrop", (handler) => handler(view, event, view.state.selection.content(), false));
}

function dropPlainMarkdownImageText(view: EditorView, markdown: string) {
  const dataTransfer = createDragDataTransfer();
  dataTransfer.setData("text/plain", markdown);
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true
  }) as DragEvent;
  Object.defineProperty(event, "clientX", { value: 20 });
  Object.defineProperty(event, "clientY", { value: 20 });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });

  return view.someProp("handleDrop", (handler) => handler(view, event, view.state.selection.content(), false));
}

function createDragDataTransfer() {
  const data = new Map<string, string>();

  return {
    clearData: () => data.clear(),
    dropEffect: "move",
    effectAllowed: "copyMove",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value),
    setDragImage: vi.fn()
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element,
  type: string,
  options: { clientX: number; clientY: number; dataTransfer: DataTransfer }
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  }) as DragEvent;

  Object.defineProperty(event, "clientX", { value: options.clientX });
  Object.defineProperty(event, "clientY", { value: options.clientY });
  Object.defineProperty(event, "dataTransfer", { value: options.dataTransfer });
  target.dispatchEvent(event);

  return event;
}

function topLevelBlockPositions(view: EditorView) {
  const positions: number[] = [];

  view.state.doc.forEach((_node, offset) => {
    positions.push(offset);
  });

  return positions;
}

function nodePositionsByType(view: EditorView, typeName: string) {
  const positions: number[] = [];

  view.state.doc.descendants((node, position) => {
    if (node.type.name === typeName) positions.push(position);
  });

  return positions;
}

function positionWithAncestorExcluding(view: EditorView, typeName: string, excludedTypeName: string) {
  for (let position = 0; position <= view.state.doc.content.size; position += 1) {
    const $position = view.state.doc.resolve(position);
    let hasType = false;
    let hasExcludedType = false;

    for (let depth = $position.depth; depth > 0; depth -= 1) {
      const nodeTypeName = $position.node(depth).type.name;
      if (nodeTypeName === typeName) hasType = true;
      if (nodeTypeName === excludedTypeName) hasExcludedType = true;
    }

    if (hasType && !hasExcludedType) return position;
  }

  return null;
}

function selectionHasAncestor(view: EditorView, typeName: string) {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return true;
  }

  return false;
}

function mockBlockDragLayout(view: EditorView, blocks: HTMLElement[], positions: number[]) {
  const blockRects = blocks.map((_block, index) => {
    const top = 100 + index * 40;
    return {
      bottom: top + 28,
      height: 28,
      left: 160,
      right: 640,
      top,
      width: 480,
      x: 160,
      y: top,
      toJSON: () => ({})
    } as DOMRect;
  });
  const originalPosAtCoords = view.posAtCoords.bind(view);

  for (const [index, block] of blocks.entries()) {
    block.getBoundingClientRect = vi.fn(() => blockRects[index]);
  }

  view.dom.getBoundingClientRect = vi.fn(() => ({
    bottom: 260,
    height: 180,
    left: 160,
    right: 640,
    top: 90,
    width: 480,
    x: 160,
    y: 90,
    toJSON: () => ({})
  } as DOMRect));

  Object.defineProperty(view, "posAtCoords", {
    configurable: true,
    value: ({ left, top }: { left: number; top: number }) => {
      if (left < 160 || left > 640) return null;

      const index = blockRects.findIndex((rect) => top >= rect.top && top <= rect.bottom);
      let blockIndex = index;

      if (blockIndex === -1) {
        blockIndex = 0;
        for (const [rectIndex, rect] of blockRects.entries()) {
          if (top > rect.bottom) blockIndex = rectIndex;
        }
      }

      const normalizedIndex = Math.max(0, Math.min(positions.length - 1, blockIndex));
      const position = positions[normalizedIndex];

      return { inside: position, pos: position + 1 };
    }
  });

  return () => {
    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: originalPosAtCoords
    });
  };
}

function isEditorTopLevelBlockElement(child: Element): child is HTMLElement {
  return child instanceof HTMLElement && !child.classList.contains("markra-trailing-paragraph");
}

function editorTopLevelBlockElementsFromSurface(surface: HTMLElement) {
  return Array.from(surface.children).filter(isEditorTopLevelBlockElement);
}

function editorTopLevelBlockElements(container: HTMLElement) {
  const surface = container.querySelector<HTMLElement>(".ProseMirror");
  if (!surface) throw new Error("Could not find editor surface.");

  return editorTopLevelBlockElementsFromSurface(surface);
}

function mockTopLevelBlockRects(container: HTMLElement, rects: DOMRect[]) {
  const blocks = editorTopLevelBlockElements(container);
  if (blocks.length !== rects.length) {
    throw new Error(`Expected ${rects.length} editor blocks, found ${blocks.length}.`);
  }

  for (const [index, block] of blocks.entries()) {
    block.getBoundingClientRect = vi.fn(() => rects[index]);
  }
}

function mockTopLevelBlockDragLayout(view: EditorView, container: HTMLElement) {
  return mockBlockDragLayout(
    view,
    editorTopLevelBlockElements(container),
    topLevelBlockPositions(view)
  );
}

function mockThinHorizontalRuleBlockDragLayout(view: EditorView, container: HTMLElement) {
  const blocks = editorTopLevelBlockElements(container);
  const positions = topLevelBlockPositions(view);
  const blockRects = [
    {
      bottom: 128,
      height: 28,
      left: 160,
      right: 640,
      top: 100,
      width: 480,
      x: 160,
      y: 100,
      toJSON: () => ({})
    },
    {
      bottom: 141,
      height: 1,
      left: 160,
      right: 640,
      top: 140,
      width: 480,
      x: 160,
      y: 140,
      toJSON: () => ({})
    },
    {
      bottom: 188,
      height: 28,
      left: 160,
      right: 640,
      top: 160,
      width: 480,
      x: 160,
      y: 160,
      toJSON: () => ({})
    }
  ] as DOMRect[];
  const originalPosAtCoords = view.posAtCoords.bind(view);

  if (blocks.length !== blockRects.length || positions.length !== blockRects.length) {
    throw new Error("Expected a paragraph, horizontal rule, and paragraph block.");
  }

  for (const [index, block] of blocks.entries()) {
    block.getBoundingClientRect = vi.fn(() => blockRects[index]);
  }

  view.dom.getBoundingClientRect = vi.fn(() => ({
    bottom: 260,
    height: 180,
    left: 160,
    right: 640,
    top: 90,
    width: 480,
    x: 160,
    y: 90,
    toJSON: () => ({})
  } as DOMRect));

  Object.defineProperty(view, "posAtCoords", {
    configurable: true,
    value: ({ left, top }: { left: number; top: number }) => {
      if (left < 160 || left > 640) return null;

      const index = blockRects.findIndex((rect) => top >= rect.top && top <= rect.bottom);
      if (index < 0) return null;

      const position = positions[index];
      return { inside: position, pos: position + 1 };
    }
  });

  return () => {
    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: originalPosAtCoords
    });
  };
}

function mockListItemBlockDragLayout(view: EditorView, container: HTMLElement) {
  return mockBlockDragLayout(
    view,
    Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror li")),
    nodePositionsByType(view, "list_item")
  );
}

function mockTopLevelBlockDragLayoutByCurrentDomOrder(view: EditorView, container: HTMLElement) {
  const surface = container.querySelector<HTMLElement>(".ProseMirror");
  if (!surface) throw new Error("Could not find editor surface.");

  const blocks = editorTopLevelBlockElements(container);
  const positions = topLevelBlockPositions(view);
  const originalPosAtCoords = view.posAtCoords.bind(view);

  const rectForIndex = (index: number) => {
    const top = 100 + index * 40;
    return {
      bottom: top + 28,
      height: 28,
      left: 160,
      right: 640,
      top,
      width: 480,
      x: 160,
      y: top,
      toJSON: () => ({})
    } as DOMRect;
  };

  for (const block of blocks) {
    block.getBoundingClientRect = vi.fn(() =>
      rectForIndex(editorTopLevelBlockElementsFromSurface(surface).indexOf(block))
    );
  }

  view.dom.getBoundingClientRect = vi.fn(() => ({
    bottom: 260,
    height: 180,
    left: 160,
    right: 640,
    top: 90,
    width: 480,
    x: 160,
    y: 90,
    toJSON: () => ({})
  } as DOMRect));

  Object.defineProperty(view, "posAtCoords", {
    configurable: true,
    value: ({ left, top }: { left: number; top: number }) => {
      if (left < 160 || left > 640) return null;

      const blockIndex = Math.max(0, Math.min(positions.length - 1, Math.floor((top - 100) / 40)));
      const position = positions[blockIndex];

      return { inside: position, pos: position + 1 };
    }
  });

  return () => {
    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: originalPosAtCoords
    });
  };
}

function expectLiveMark(container: HTMLElement, kind: string, text: string) {
  expect(container.querySelector(`.ProseMirror .markra-live-mark-${kind}`)).toHaveTextContent(text);
}

function expectLiveStrongEmphasis(container: HTMLElement, text: string) {
  const liveMark = container.querySelector(".ProseMirror .markra-live-mark-strong.markra-live-mark-emphasis");
  expect(liveMark).toHaveTextContent(text);
}

function expectMarkdownDelimiters(container: HTMLElement, count: number) {
  expect(container.querySelectorAll(".ProseMirror .markra-md-delimiter")).toHaveLength(count);
}

function expectHiddenMarkdownDelimiters(container: HTMLElement, count: number) {
  expect(container.querySelectorAll(".ProseMirror .markra-md-hidden-delimiter")).toHaveLength(count);
}

function expectMarkdownDelimiterText(container: HTMLElement, text: string) {
  expect(
    Array.from(container.querySelectorAll(".ProseMirror .markra-md-delimiter")).map((node) => node.textContent)
  ).toEqual([text, text]);
}

function expectLiveLink(container: HTMLElement, text: string) {
  const liveLink = container.querySelector(".ProseMirror .markra-live-link-label");
  expect(liveLink).toHaveTextContent(text);
  return liveLink;
}

function expectActiveSourceLinkLabel(container: HTMLElement, text: string) {
  const sourceLabel = container.querySelector(".ProseMirror .markra-live-link-source-label");
  expect(sourceLabel).toHaveTextContent(text);
  expect(sourceLabel).not.toHaveClass("markra-live-link-label");
  expect(sourceLabel).not.toHaveAttribute("data-markra-href");
  return sourceLabel;
}

function expectLinkIconCount(container: HTMLElement, count: number) {
  expect(container.querySelectorAll(".ProseMirror .markra-live-link-icon")).toHaveLength(count);
}

function expectLiveImagePreview(container: HTMLElement, src: string) {
  const image = container.querySelector<HTMLImageElement>(
    `.ProseMirror img.markra-live-image-preview[src="${src}"]`
  );
  expect(image).toBeInTheDocument();
  return image;
}

afterAll(async () => {
  // Milkdown ctx leaves 3s listener cleanup timers pending after editor teardown.
  await new Promise((resolve) => {
    window.setTimeout(resolve, 3200);
  });
});

describe("MarkdownPaper editing", () => {
  it("marks whether code blocks should wrap long lines", async () => {
    const { container } = await renderEditor("```ts\nconst syntheticValue = 'mock';\n```", { wrapCodeBlocks: false });

    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-code-block-wrap", "false");
  });

  it("lets an explicit editor font override theme fonts", async () => {
    const { container } = await renderEditor("# Synthetic heading", {
      editorFontFamily: {
        family: "Example Serif",
        source: "system"
      },
      editorTheme: "gothic"
    });
    const paper = container.querySelector<HTMLElement>(".markdown-paper");

    expect(paper?.style.getPropertyValue("--editor-font-family")).toContain("\"Example Serif\"");
    expect(paper?.style.getPropertyValue("--editor-heading-font-family")).toBe("var(--editor-font-family)");
  });

  it("does not override theme fonts by default", async () => {
    const { container } = await renderEditor("# Synthetic heading");
    const paper = container.querySelector<HTMLElement>(".markdown-paper");

    expect(paper?.style.getPropertyValue("--editor-font-family")).toBe("");
    expect(paper?.style.getPropertyValue("--editor-heading-font-family")).toBe("");
  });

  it("renders a custom caret for focused collapsed ProseMirror selections", async () => {
    const { view } = await renderEditor("Alpha");
    const coordsSpy = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 42,
      left: 24,
      right: 25,
      top: 10
    });

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Alpha", 2));

    const caret = view.dom.ownerDocument.querySelector<HTMLElement>(".markra-prosemirror-caret");

    expect(view.dom).toHaveClass("markra-prosemirror-custom-caret");
    expect(caret).toBeInTheDocument();
    expect(caret).toHaveAttribute("aria-hidden", "true");
    expect(caret?.style.display).toBe("block");
    expect(caret?.style.left).toBe("24px");
    expect(caret?.style.top).toBe("17px");
    expect(caret?.style.height).toBe("18px");

    coordsSpy.mockRestore();
    await settleMarkdownListener();
  });

  it("hides the custom caret for non-collapsed ProseMirror selections", async () => {
    const { view } = await renderEditor("Alpha");
    const coordsSpy = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 42,
      left: 24,
      right: 25,
      top: 10
    });

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Alpha", 2));
    selectText(view, findTextPosition(view, "Alpha"), findTextPosition(view, "Alpha", 2));

    const caret = view.dom.ownerDocument.querySelector<HTMLElement>(".markra-prosemirror-caret");

    expect(caret?.style.display).toBe("none");

    coordsSpy.mockRestore();
    await settleMarkdownListener();
  });

  it("renders exact visual search highlights without width normalization", async () => {
    const { container, view } = await renderEditor("alpha, beta，gamma, delta");

    const commaMatches = findSearchMatchesInDoc(view.state.doc, ",");
    const fullWidthCommaMatches = findSearchMatchesInDoc(view.state.doc, "，");

    expect(commaMatches.map((match) => view.state.doc.textBetween(match.from, match.to))).toEqual([",", ","]);
    expect(fullWidthCommaMatches.map((match) => view.state.doc.textBetween(match.from, match.to))).toEqual(["，"]);

    updateSearchDecorations(view, commaMatches, 0);

    expect(container.querySelectorAll(".markra-search-match")).toHaveLength(2);
    expect(container.querySelector(".markra-search-match-current")).toHaveTextContent(",");
  });

  it("underlines misspelled words with the custom spellcheck plugin", async () => {
    const { container } = await renderEditor("This document mentions environment and acommodate word.", {
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    expect(Array.from(container.querySelectorAll(".markra-spellcheck-error"), (element) => element.textContent)).toEqual([
      "acommodate"
    ]);
  });

  it("updates custom spellcheck decorations after typing", async () => {
    const { container, view } = await renderEditor("", {
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    typeText(view, "environment acommodate");

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    expect(Array.from(container.querySelectorAll(".markra-spellcheck-error"), (element) => element.textContent)).toEqual([
      "acommodate"
    ]);
  });

  it("does not underline words from the personal spellcheck whitelist", async () => {
    const { container } = await renderEditor("This document mentions environment and acommodate word.", {
      spellcheckEnabled: true,
      spellcheckIgnoredWords: ["acommodate"],
      spellchecker: syntheticSpellchecker
    });

    await settleMarkdownListener();
    expect(container.querySelector(".markra-spellcheck-error")).toBeNull();
  });

  it("opens spelling suggestions with Mod+Period and replaces the current misspelling", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("This document mentions environment and acommodate word.", {
      onMarkdownChange,
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    moveCursor(view, view.state.doc.textContent.indexOf("acommodate") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: ".", metaKey: true });

    expect(await screen.findByRole("menu", { name: "Spelling suggestions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace with accommodate" }));

    await waitFor(() =>
      expect(view.state.doc.textContent).toBe("This document mentions environment and accommodate word.")
    );
    await settleMarkdownListener();
    expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining("accommodate"));
    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toBeNull());
    expect(screen.queryByRole("menu", { name: "Spelling suggestions" })).not.toBeInTheDocument();
  });

  it("opens spelling suggestions with the configured shortcut instead of the default", async () => {
    const { container, view } = await renderEditor("This document mentions environment and acommodate word.", {
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        openSpellcheckSuggestions: "Mod+Alt+."
      },
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    moveCursor(view, view.state.doc.textContent.indexOf("acommodate") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { code: "Period", key: ".", metaKey: true });

    expect(screen.queryByRole("menu", { name: "Spelling suggestions" })).not.toBeInTheDocument();

    fireEvent.keyDown(view.dom, { code: "Period", key: ".", altKey: true, metaKey: true });

    expect(await screen.findByRole("menu", { name: "Spelling suggestions" })).toBeInTheDocument();
  });

  it("lets the current misspelling be added to the personal whitelist from the spelling menu", async () => {
    const onAddSpellcheckIgnoredWord = vi.fn();
    const { container, view } = await renderEditor("This document mentions environment and acommodate word.", {
      onAddSpellcheckIgnoredWord,
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    moveCursor(view, view.state.doc.textContent.indexOf("acommodate") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: ".", ctrlKey: true });

    fireEvent.click(await screen.findByRole("menuitem", { name: "Add \"acommodate\" to whitelist" }));

    expect(onAddSpellcheckIgnoredWord).toHaveBeenCalledWith("acommodate");
    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toBeNull());
    expect(screen.queryByRole("menu", { name: "Spelling suggestions" })).not.toBeInTheDocument();
  });

  it("keeps locally ignored spelling words while adding another word before preferences sync back", async () => {
    const { container, view } = await renderEditor("acommodate enviroment", {
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelectorAll(".markra-spellcheck-error")).toHaveLength(2));
    moveCursor(view, view.state.doc.textContent.indexOf("acommodate") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: ".", metaKey: true });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add \"acommodate\" to whitelist" }));
    await waitFor(() => expect(Array.from(container.querySelectorAll(".markra-spellcheck-error"), (element) => element.textContent)).toEqual([
      "enviroment"
    ]));

    moveCursor(view, view.state.doc.textContent.indexOf("enviroment") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: ".", metaKey: true });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add \"enviroment\" to whitelist" }));

    await settleMarkdownListener();
    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toBeNull());
  });

  it("moves through spelling menu actions with arrow keys", async () => {
    const onAddSpellcheckIgnoredWord = vi.fn();
    const { container, view } = await renderEditor("This document mentions environment and acommodate word.", {
      onAddSpellcheckIgnoredWord,
      spellcheckEnabled: true,
      spellchecker: syntheticSpellchecker
    });

    await waitFor(() => expect(container.querySelector(".markra-spellcheck-error")).toHaveTextContent("acommodate"));
    moveCursor(view, view.state.doc.textContent.indexOf("acommodate") + 3);
    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: ".", metaKey: true });

    const replaceItem = await screen.findByRole("menuitem", { name: "Replace with accommodate" });
    const whitelistItem = screen.getByRole("menuitem", { name: "Add \"acommodate\" to whitelist" });
    await waitFor(() => expect(replaceItem).toHaveFocus());

    fireEvent.keyDown(screen.getByRole("menu", { name: "Spelling suggestions" }), { key: "ArrowDown" });
    expect(whitelistItem).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu", { name: "Spelling suggestions" }), { key: "ArrowUp" });
    expect(replaceItem).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu", { name: "Spelling suggestions" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("menu", { name: "Spelling suggestions" }), { key: "Enter" });

    expect(onAddSpellcheckIgnoredWord).toHaveBeenCalledWith("acommodate");
    expect(screen.queryByRole("menu", { name: "Spelling suggestions" })).not.toBeInTheDocument();
  });

  it("keeps the writing surface from macOS-style scroll dragging without pane-level horizontal scroll", async () => {
    const { container } = await renderEditor();

    expect(container.querySelector(".paper-scroll")).toHaveClass("overscroll-none");
    expect(container.querySelector(".paper-scroll")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-x-hidden",
      "overflow-y-auto"
    );
  });

  it("does not add base bottom padding to the visual editor paper", async () => {
    const { container } = await renderEditor("# Synthetic heading");
    const paper = container.querySelector(".markdown-paper");

    expect(paper).not.toHaveClass("pb-30");
    expect(paper?.getAttribute("style")).toContain("padding-bottom: 0px");
  });

  it("adds only bottom overlay spacing when a floating control is visible", async () => {
    const { container } = await renderEditor("# Synthetic heading", { bottomOverlayInset: 96 });
    const paper = container.querySelector(".markdown-paper");

    expect(paper?.getAttribute("style")).toContain("padding-bottom: 96px");
  });

  it("marks the editor paper with the default resolved app theme", async () => {
    const { container } = await renderEditor();

    expect(container.querySelector(".markdown-paper")).toHaveAttribute("data-editor-theme", "light");
  });

  it("disables browser writing suggestions on the visual editor surface", async () => {
    const { container } = await renderEditor();
    const editorSurface = container.querySelector(".ProseMirror");

    expect(editorSurface).toHaveAttribute("autocomplete", "off");
    expect(editorSurface).toHaveAttribute("autocorrect", "off");
    expect(editorSurface).toHaveAttribute("autocapitalize", "off");
    expect(editorSurface).toHaveAttribute("spellcheck", "false");
    expect(editorSurface).toHaveAttribute("writingsuggestions", "false");
  });

  it("shows the matching footnote content while hovering a footnote reference", async () => {
    const source = ["A sentence with a footnote[^preview].", "", "[^preview]: Synthetic footnote preview text."].join(
      "\n"
    );
    const { container } = await renderEditor(source);
    const reference = container.querySelector<HTMLElement>(
      '.ProseMirror sup[data-type="footnote_reference"][data-label="preview"]'
    );

    expect(reference).toBeInTheDocument();

    fireEvent.mouseEnter(reference!);

    const preview = await screen.findByRole("tooltip");
    expect(preview).toHaveTextContent("Synthetic footnote preview text.");

    fireEvent.mouseLeave(reference!);

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("keeps nested footnote definitions out of the parent reference preview", async () => {
    const source = ["Only the first footnote is referenced[^1].", "", "[^1]: First preview text."].join("\n");
    const { container, view } = await renderEditor(source);
    const reference = container.querySelector<HTMLElement>(
      '.ProseMirror sup[data-type="footnote_reference"][data-label="1"]'
    );
    const firstDefinition = view.state.doc.lastChild;
    const paragraph = view.state.schema.nodes.paragraph;
    const footnoteDefinition = view.state.schema.nodes.footnote_definition;

    expect(reference).toBeInTheDocument();
    expect(firstDefinition?.type.name).toBe("footnote_definition");
    expect(paragraph).toBeDefined();
    expect(footnoteDefinition).toBeDefined();

    const nestedDefinition = footnoteDefinition!.create(
      { label: "2" },
      paragraph!.create(null, view.state.schema.text("Second preview text."))
    );
    view.dispatch(
      view.state.tr.insert(view.state.doc.content.size - 2, nestedDefinition)
    );

    fireEvent.mouseEnter(reference!);

    const preview = await screen.findByRole("tooltip");
    expect(preview).toHaveTextContent("First preview text.");
    expect(preview).not.toHaveTextContent("Second preview text.");
  });

  it("positions short footnote previews from their rendered width", async () => {
    const source = ["A sentence with a footnote[^preview].", "", "[^preview]: Short preview."].join("\n");
    const { container } = await renderEditor(source);
    const reference = container.querySelector<HTMLElement>(
      '.ProseMirror sup[data-type="footnote_reference"][data-label="preview"]'
    );

    expect(reference).toBeInTheDocument();

    reference!.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 116,
          height: 16,
          left: 240,
          right: 252,
          top: 100,
          width: 12,
          x: 240,
          y: 100,
          toJSON: () => ({})
        }) as DOMRect
    );
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("markra-footnote-preview")) {
          return {
            bottom: 44,
            height: 44,
            left: 0,
            right: 148,
            top: 0,
            width: 148,
            x: 0,
            y: 0,
            toJSON: () => ({})
          } as DOMRect;
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({})
        } as DOMRect;
      });

    try {
      fireEvent.mouseEnter(reference!);

      const preview = await screen.findByRole("tooltip");
      expect(preview.style.left).toBe("172px");
      expect(preview.style.top).toBe("124px");
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("keeps typed footnote references as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    typeText(view, "A typed footnote[^1]");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("[^1]");
    expect(lastMarkdown).not.toContain("\\[^1]");
  });

  it("keeps an existing footnote reference when another reference is typed after it", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "Synthetic references[^1][^2]");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror sup[data-type="footnote_reference"]')).toHaveLength(2)
    );
    expect(
      container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="2"]')
    ).toBeInTheDocument();

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("Synthetic references[^1][^2]");
    expect(markdown).not.toContain("\\[^");
  });

  it("keeps an existing footnote reference when raw reference markdown is inserted after it", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "Synthetic references[^1]");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
      ).toBeInTheDocument()
    );

    insertTextDirectly(view, "[^2]");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror sup[data-type="footnote_reference"]')).toHaveLength(2)
    );
    expect(
      container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="2"]')
    ).toBeInTheDocument();

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("Synthetic references[^1][^2]");
    expect(markdown).not.toContain("\\[^");
  });

  it("keeps typed footnote definitions as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    typeText(view, "[^1]: Synthetic typed definition.");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("[^1]: Synthetic typed definition.");
    expect(lastMarkdown).not.toContain("\\[^1]");
  });

  it("keeps full footnote definition input as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    expect(insertTextThroughInputHandler(view, "[^1]: asdfds")).toBe(true);

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("[^1]: asdfds");
    expect(lastMarkdown).not.toContain("\\[^1]");
  });

  it("turns a typed footnote definition marker into a definition when the colon is typed", async () => {
    const { container, view } = await renderEditor("");

    typeText(view, "[^2]:");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="2"]')
      ).toBeInTheDocument()
    );
    expect(
      container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="2"]')
    ).not.toBeInTheDocument();
  });

  it("serializes adjacent footnote definitions without continuation indentation", async () => {
    const source = ["[^1]: First synthetic footnote.", "", "[^2]: Second synthetic footnote."].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);

    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
  });

  it("keeps text typed after an empty footnote definition marker unindented", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "[^1]: First synthetic footnote.");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );

    expect(pressEnter(view)).toBe(true);
    typeText(view, "[^2]:");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="2"]')
      ).toBeInTheDocument()
    );

    expect(pressEnter(view)).toBe(true);
    typeText(view, "Second synthetic footnote.");

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
    expect(markdown).not.toContain("\n    Second synthetic footnote.");
  });

  it("exits a footnote definition when pressing Enter after definition text", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "[^1]: First synthetic footnote.");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );

    expect(pressEnter(view)).toBe(true);
    typeText(view, "Second synthetic paragraph.");

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\nSecond synthetic paragraph.");
    expect(markdown).not.toContain("\n    Second synthetic paragraph.");
  });

  it("normalizes pasted adjacent footnote definitions without continuation indentation", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    insertTextDirectly(view, "[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror dl[data-type="footnote_definition"]')).toHaveLength(2)
    );

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
  });

  it("keeps pasted multiline footnote definitions without dropping continuation text", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    insertTextDirectly(
      view,
      ["[^1]: First synthetic footnote.", "    Continued synthetic line.", "", "[^2]: Second synthetic footnote."].join(
        "\n"
      )
    );

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror dl[data-type="footnote_definition"]')).toHaveLength(2)
    );

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("First synthetic footnote.");
    expect(markdown).toContain("Continued synthetic line.");
    expect(markdown).toContain("[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
  });

  it("normalizes pasted footnote definitions separated by a single newline", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    insertTextDirectly(view, "[^1]: First synthetic footnote.\n[^2]: Second synthetic footnote.");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror dl[data-type="footnote_definition"]')).toHaveLength(2)
    );

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("[^1]: First synthetic footnote.\n    [^2]: Second synthetic footnote.");
  });

  it("serializes consecutively typed footnote definitions without continuation indentation", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "[^1]: First synthetic footnote.");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );

    expect(pressEnter(view)).toBe(true);
    expect(pressEnter(view)).toBe(true);
    typeText(view, "[^2]: Second synthetic footnote.");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror dl[data-type="footnote_definition"]')).toHaveLength(2)
    );

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
  });

  it("lifts a typed footnote definition after one Enter out of the previous definition", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "[^1]: First synthetic footnote.");
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );

    expect(pressEnter(view)).toBe(true);
    typeText(view, "[^2]: Second synthetic footnote.");

    await waitFor(() =>
      expect(container.querySelectorAll('.ProseMirror dl[data-type="footnote_definition"]')).toHaveLength(2)
    );

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("[^1]: First synthetic footnote.\n\n[^2]: Second synthetic footnote.");
    expect(markdown).not.toContain("\n    [^2]:");
  });

  it("normalizes pasted footnote markdown as footnotes instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    insertTextDirectly(view, "这是引用：[^1]\n\n[^1]: 这是脚注");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror dl[data-type="footnote_definition"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("这是引用：[^1]");
    expect(lastMarkdown).toContain("[^1]: 这是脚注");
    expect(lastMarkdown).not.toContain("\\[^1]");
  });

  it("normalizes a sentence-ending footnote reference as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    insertTextDirectly(view, "这是引用[^1]\n\n[^1]: 这是脚注");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("这是引用[^1]");
    expect(lastMarkdown).not.toContain("这是引用\\[^1]");
  });

  it("normalizes a standalone sentence-ending footnote reference as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });

    insertTextDirectly(view, "这是引用[^1]");

    await waitFor(() =>
      expect(
        container.querySelector('.ProseMirror sup[data-type="footnote_reference"][data-label="1"]')
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalled());
    const lastMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(lastMarkdown).toContain("这是引用[^1]");
    expect(lastMarkdown).not.toContain("这是引用\\[^1]");
  });

  it("keeps typed footnote syntax inside inline code instead of converting it to a reference", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "Synthetic code `[^1]`");
    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror code")).toHaveTextContent("[^1]"));
    expect(container.querySelector('.ProseMirror sup[data-type="footnote_reference"]')).not.toBeInTheDocument();

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`[^1]`");
  });

  it("keeps pasted footnote syntax between inline code markers unescaped", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "``");
    moveCursor(view, 2);
    insertTextDirectly(view, "[^2]");
    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror code")).toHaveTextContent("[^2]"));
    expect(container.querySelector('.ProseMirror sup[data-type="footnote_reference"]')).not.toBeInTheDocument();

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`[^2]`");
    expect(markdown).not.toContain("`\\[^2]`");
  });

  it("serializes pasted footnote syntax between live inline code markers unescaped", async () => {
    const { editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "``");
    moveCursor(view, 2);
    view.pasteText("[^2]", new Event("paste") as ClipboardEvent);

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`[^2]`");
    expect(markdown).not.toContain("\\`\\[^2]\\`");
  });

  it("keeps pasted footnote syntax inside fenced code instead of converting it to a reference", async () => {
    const { container, view } = await renderEditor("");

    insertTextDirectly(view, ["```", "[^1]", "```"].join("\n"));

    await waitFor(() =>
      expect(container.querySelector('.ProseMirror sup[data-type="footnote_reference"]')).not.toBeInTheDocument()
    );
  });

  it("blocks document-changing editor transactions while read-only", async () => {
    const onMarkdownChange = vi.fn();
    const { editor, view } = await renderEditor("Locked content", {
      onMarkdownChange,
      readOnly: true
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const initialMarkdown = serializeMarkdown(view.state.doc);

    onMarkdownChange.mockClear();
    const insertionPoint = findTextPosition(view, "Locked content", "Locked content".length);
    view.dispatch(view.state.tr.insertText(" edited", insertionPoint, insertionPoint).scrollIntoView());
    await settleMarkdownListener();

    expect(serializeMarkdown(view.state.doc)).toBe(initialMarkdown);
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });

  it("keeps finalized image source controls hidden while read-only", async () => {
    const { container } = await renderEditor("![Screenshot](assets/pasted-image.png)", {
      readOnly: true
    });

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    clickFinalizedImage(image!);

    expect(container.querySelector(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();
  });

  it("selects the finalized image block before editing its source input", async () => {
    const { container, editor, view } = await renderEditor(
      ["Intro", "", "![Screenshot](assets/pasted-image.png)", "", "Following content"].join("\n")
    );
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(image).toBeInTheDocument();

    moveCursor(view, findTextPosition(view, "Following content", "Following".length));
    fireEvent.mouseDown(image!);

    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "image"));
    expect(view.dom).toHaveFocus();
    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();

    fireEvent.click(image!);

    const sourceInput = await waitFor(() => {
      const input = container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source");
      expect(input).toBeInTheDocument();
      return input!;
    });
    expect(sourceInput).not.toHaveFocus();

    const sourceCursor = sourceInput.value.length;
    sourceInput.setSelectionRange(sourceCursor, sourceCursor);
    fireEvent.mouseDown(sourceInput);

    await waitFor(() => expect(sourceInput).toHaveFocus());
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(sourceInput.selectionStart).toBe(sourceCursor);
    expect(sourceInput.selectionEnd).toBe(sourceCursor);

    moveCursor(view, findTextPosition(view, "Following content", "Following".length));
    expect(sourceInput).toBeInTheDocument();
    expect(sourceInput).toHaveFocus();

    fireEvent.input(sourceInput, { target: { value: "" } });

    await waitFor(() =>
      expect(
        container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]')
      ).not.toBeInTheDocument()
    );
    expect(serializeMarkdown(view.state.doc)).toContain("Following content");
    expect(serializeMarkdown(view.state.doc)).not.toContain("assets/pasted-image.png");
  });

  it("focuses the finalized image source input when its source row is clicked", async () => {
    const { container } = await renderEditor("![Screenshot](assets/pasted-image.png)");
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(image).toBeInTheDocument();

    clickFinalizedImage(image!);

    const sourceRow = await waitFor(() => {
      const row = container.querySelector<HTMLElement>(".ProseMirror .markra-image-node-source-row");
      expect(row).toBeInTheDocument();
      return row!;
    });
    const sourceInput = sourceRow.querySelector<HTMLInputElement>(".markra-image-node-source");

    expect(sourceInput).toBeInTheDocument();
    expect(sourceRow).toHaveAttribute("contenteditable", "true");
    expect(sourceInput).toHaveAttribute("contenteditable", "true");
    expect(sourceInput).not.toHaveFocus();

    fireEvent.mouseDown(sourceRow);

    await waitFor(() => expect(sourceInput).toHaveFocus());
    expect(sourceInput?.selectionStart).toBe(sourceInput?.value.length);
    expect(sourceInput?.selectionEnd).toBe(sourceInput?.value.length);
  });

  it("can select a finalized image block after another text range was selected", async () => {
    const { container, view } = await renderEditor(
      ["Intro text", "", "![Screenshot](assets/pasted-image.png)", "", "Following content"].join("\n")
    );
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(image).toBeInTheDocument();

    const from = findTextPosition(view, "Following");
    const to = findTextPosition(view, "Following", "Following".length);
    const followingText = Array.from(container.querySelectorAll(".ProseMirror p"))
      .find((paragraph) => paragraph.textContent?.includes("Following"))
      ?.firstChild;

    expect(followingText).toBeInstanceOf(Text);

    const range = document.createRange();
    range.setStart(followingText!, 0);
    range.setEnd(followingText!, "Following".length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    selectText(view, from, to);
    expect(view.state.selection.empty).toBe(false);
    expect(document.getSelection()?.toString()).toBe("Following");

    fireEvent.mouseDown(image!);

    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "image"));
    expect(document.getSelection()?.toString()).toBe("");
    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();

    fireEvent.click(image!);

    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).toBeInTheDocument();
  });

  it("clears the native text caret when a finalized image block is selected", async () => {
    const { container, view } = await renderEditor(
      ["Intro text", "", "![Screenshot](assets/pasted-image.png)", "", "Following content"].join("\n")
    );
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    const introText = Array.from(container.querySelectorAll(".ProseMirror p"))
      .find((paragraph) => paragraph.textContent?.includes("Intro text"))
      ?.firstChild;

    expect(image).toBeInTheDocument();
    expect(introText).toBeInstanceOf(Text);

    const range = document.createRange();
    range.setStart(introText!, "Intro text".length);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    moveCursor(view, findTextPosition(view, "Intro text", "Intro text".length));
    expect(document.getSelection()?.anchorNode).toBe(introText);

    fireEvent.mouseDown(image!);

    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "image"));
    await waitFor(() => expect(document.getSelection()?.rangeCount).toBe(0));
    expect(document.getSelection()?.anchorNode).not.toBe(introText);
    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();
  });

  it("selects a finalized image block when its outer block surface is pressed after text focus", async () => {
    const { container, view } = await renderEditor(
      ["Intro text", "", "![Screenshot](assets/pasted-image.png)"].join("\n")
    );
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    const imageNode = image?.closest<HTMLElement>(".markra-image-node");

    expect(image).toBeInTheDocument();
    expect(imageNode).toBeInTheDocument();

    moveCursor(view, findTextPosition(view, "Intro", "Intro".length));
    expect(view.state.selection.empty).toBe(true);

    fireEvent.mouseDown(imageNode!);

    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "image"));
    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();

    fireEvent.click(imageNode!);

    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).toBeInTheDocument();
  });

  it("waits until the image click completes before showing finalized image source controls", async () => {
    const { container } = await renderEditor("Intro text\n\n![Screenshot](assets/pasted-image.png)");
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(image).toBeInTheDocument();

    fireEvent.mouseDown(image!);

    expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();

    fireEvent.click(image!);

    await waitFor(() =>
      expect(container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source")).toBeInTheDocument()
    );
  });

  it("hides open finalized image source controls when read-only is enabled", async () => {
    let editor: Editor | null = null;
    const onEditorReady = (instance: Editor | null) => {
      editor = instance;
    };
    const { container, rerender } = render(
      <MarkdownPaper
        initialContent="![Screenshot](assets/pasted-image.png)"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    await waitFor(() => expect(editor).not.toBeNull());
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    clickFinalizedImage(image!);
    expect(container.querySelector(".ProseMirror .markra-image-node-source")).toBeInTheDocument();

    rerender(
      <MarkdownPaper
        initialContent="![Screenshot](assets/pasted-image.png)"
        onEditorReady={onEditorReady}
        onMarkdownChange={() => {}}
        readOnly
        revision={0}
      />
    );

    await waitFor(() => expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false"));
    expect(container.querySelector(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();
  });

  it("keeps the editor mounted when an untitled document receives a saved path", async () => {
    let editor: Editor | null = null;
    const savedContent = "# Scratch\n\nSaved immediately.";
    const { container, rerender } = render(
      <MarkdownPaper
        documentKey="untitled:0"
        documentPath={null}
        initialContent={savedContent}
        onEditorReady={(instance) => {
          editor = instance;
        }}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    await waitFor(() => expect(editor).not.toBeNull());
    const initialEditor = editor;
    const initialPaper = container.querySelector('[data-editor-engine="milkdown"]');
    expect(initialPaper).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")).toHaveTextContent("Saved immediately.");

    rerender(
      <MarkdownPaper
        documentKey="untitled:0"
        documentPath="/mock-files/scratch.md"
        initialContent={savedContent}
        onEditorReady={(instance) => {
          editor = instance;
        }}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    expect(container.querySelector('[data-editor-engine="milkdown"]')).toBe(initialPaper);
    expect(editor).toBe(initialEditor);
    expect(container.querySelector(".ProseMirror")).toHaveTextContent("Saved immediately.");
  });

  it("renders fenced code blocks with syntax highlighting and line numbers", async () => {
    const source = ["```ts", "const answer = 42;", "return answer;", "```"].join("\n");
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror .markra-code-block")).toHaveAttribute("data-language", "ts");
    expect(
      Array.from(container.querySelectorAll(".ProseMirror .markra-code-line-number")).map((node) => node.textContent)
    ).toEqual(["1", "2"]);
    expect(container.querySelector(".ProseMirror .hljs-keyword")).toHaveTextContent("const");
    expect(container.querySelector(".ProseMirror .hljs-number")).toHaveTextContent("42");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(source);
  });

  it("renders GFM task list items as clickable checkboxes", async () => {
    const source = ["- [x] Finish mock draft", "- [ ] Review mock copy"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.ProseMirror input[type="checkbox"]'));

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(serializeMarkdown(view.state.doc)).toBe("- [x] Finish mock draft\n- [ ] Review mock copy\n");

    fireEvent.click(checkboxes[1]);

    expect(checkboxes[1]).toBeChecked();
    expect(serializeMarkdown(view.state.doc)).toBe("- [x] Finish mock draft\n- [x] Review mock copy\n");
  });

  it("turns typed GFM task list syntax into a checkbox", async () => {
    const { container, editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "- [ ] a");

    const checkbox = container.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]');

    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    expect(container.querySelector(".ProseMirror li")).toHaveTextContent("a");
    expect(serializeMarkdown(view.state.doc)).toContain("- [ ] a");
  });

  it.each([
    {
      label: "YAML",
      source: [
        "---",
        'title: "Mock post"',
        "pubDate: 2026-01-02T03:04:05+08:00",
        "---",
        "",
        "# Body"
      ].join("\n")
    },
    {
      label: "TOML",
      source: [
        "+++",
        '"title" = "Mock post"',
        '"pubDate" = "2026-01-02T03:04:05+08:00"',
        "+++",
        "",
        "# Body"
      ].join("\n")
    },
    {
      label: "JSON",
      source: [
        "{",
        '  "title": "Mock post",',
        '  "pubDate": "2026-01-02T03:04:05+08:00"',
        "}",
        "",
        "# Body"
      ].join("\n")
    }
  ])("preserves $label frontmatter as a dedicated editor block", async ({ source }) => {
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.child(0).type.name).toBe("frontmatter");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("preserves JSON frontmatter with blank lines inside the object", async () => {
    const source = [
      "{",
      '  "title": "Mock post",',
      "",
      '  "description": "Draft metadata"',
      "}",
      "",
      "# Body"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.child(0).type.name).toBe("frontmatter");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("preserves JSON frontmatter with nested objects and braces inside strings", async () => {
    const source = [
      "{",
      '  "title": "Mock {post}",',
      '  "draft": true,',
      '  "meta": {',
      '    "description": "Synthetic } metadata"',
      "  }",
      "}",
      "",
      "# Body"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.child(0).type.name).toBe("frontmatter");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it.each([
    {
      label: "empty YAML",
      source: ["---", "---", "", "# Body"].join("\n")
    },
    {
      label: "empty TOML",
      source: ["+++", "+++", "", "# Body"].join("\n")
    },
    {
      label: "empty JSON",
      source: ["{}", "", "# Body"].join("\n")
    }
  ])("preserves $label frontmatter", async ({ source }) => {
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.child(0).type.name).toBe("frontmatter");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it.each([
    {
      label: "malformed JSON object",
      source: ["{", '  "title": "Mock post",', "}", "", "# Body"].join("\n")
    },
    {
      label: "top-level JSON array",
      source: ["[", '  "not metadata"', "]", "", "# Body"].join("\n")
    },
    {
      label: "non-leading YAML block",
      source: ["# Intro", "", "---", "title: nope", "---"].join("\n")
    },
    {
      label: "inline JSON prose",
      source: '{"title":"Mock post"} is ordinary text'
    },
    {
      label: "fenced JSON code block",
      source: ["```json", '{"title":"Mock post"}', "```", "", "# Body"].join("\n")
    }
  ])("does not promote $label to frontmatter", async ({ source }) => {
    const { view } = await renderEditor(source);
    let hasFrontmatter = false;

    view.state.doc.descendants((node) => {
      hasFrontmatter = node.type.name === "frontmatter";
      return !hasFrontmatter;
    });

    expect(hasFrontmatter).toBe(false);
  });

  it("renders Mermaid code blocks as folded diagrams and reveals source for editing", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```", "", "After"].join("\n");
    const { container, editor, view } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const lineNumbers = container.querySelector<HTMLElement>(".ProseMirror .markra-code-line-numbers");
    const copyButton = container.querySelector<HTMLElement>(".ProseMirror .markra-code-copy-button");
    const languageControl = container.querySelector<HTMLElement>(".ProseMirror .markra-code-language-control");
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");
    const zoomButton = screen.getByRole("button", { name: "Enlarge Mermaid diagram" });
    const sourcePre = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block pre");

    expect(codeBlock).toHaveAttribute("data-language", "mermaid");
    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
    expect(copyButton).toHaveAttribute("hidden");
    expect(languageControl).toHaveAttribute("hidden");
    expect(preview).not.toHaveAttribute("hidden");
    expect(zoomButton).not.toHaveAttribute("hidden");

    fireEvent.click(preview!);

    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "source");
    expect(copyButton).not.toHaveAttribute("hidden");
    expect(languageControl).not.toHaveAttribute("hidden");
    expect(sourcePre).not.toHaveAttribute("hidden");
    expect(lineNumbers).not.toHaveAttribute("hidden");
    expect(preview).toHaveAttribute("hidden");
    expect(zoomButton).toHaveAttribute("hidden");
    expect(container.querySelector(".ProseMirror .markra-code-content")).toHaveTextContent("flowchart TD");

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.child(0).nodeSize + 1))
    );
    document.dispatchEvent(new Event("selectionchange"));

    await waitFor(() => {
      expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
      expect(copyButton).toHaveAttribute("hidden");
      expect(languageControl).toHaveAttribute("hidden");
      expect(preview).not.toHaveAttribute("hidden");
      expect(zoomButton).not.toHaveAttribute("hidden");
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(source);
  });

  it("opens an enlarged Mermaid diagram from the zoom control without editing the source", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const zoomButton = screen.getByRole("button", { name: "Enlarge Mermaid diagram" });

    fireEvent.click(zoomButton);

    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");

    const dialog = screen.getByRole("dialog", { name: "Enlarged Mermaid diagram" });
    const enlargedDiagram = dialog.querySelector(".markra-mermaid-zoom-content svg");

    expect(within(dialog).queryByRole("img", { name: "Enlarged Mermaid diagram" })).not.toBeInTheDocument();
    expect(enlargedDiagram).toBeInTheDocument();
    expect(enlargedDiagram).toHaveAttribute("id", expect.stringContaining("markra-editor-mermaid"));
    expect(enlargedDiagram).toHaveClass("markra-mermaid-zoom-svg");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Enlarged Mermaid diagram" })).not.toBeInTheDocument();
    expect(zoomButton).toHaveFocus();
  });

  it("zooms and pans the enlarged Mermaid diagram", async () => {
    const source = ["```mermaid", "flowchart LR", "  A --> B --> C --> D", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Enlarge Mermaid diagram" }));

    const dialog = screen.getByRole("dialog", { name: "Enlarged Mermaid diagram" });
    const content = dialog.querySelector<HTMLElement>(".markra-mermaid-zoom-content");
    const canvas = dialog.querySelector<HTMLElement>(".markra-mermaid-zoom-canvas");

    expect(content).toHaveAttribute("data-zoom", "1");
    expect(canvas).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Zoom in Mermaid diagram" }));

    expect(content).toHaveAttribute("data-zoom", "1.25");
    expect(within(dialog).getByText("125%")).toBeInTheDocument();
    expect(canvas?.style.transform).toBe("translate(0px, 0px) scale(1.25)");

    fireEvent.wheel(content!, { deltaY: -100 });

    expect(Number(content?.dataset.zoom)).toBeGreaterThan(1.25);

    fireEvent.pointerDown(content!, { button: 0, clientX: 100, clientY: 80, pointerId: 9 });
    fireEvent.pointerMove(content!, { clientX: 132, clientY: 96, pointerId: 9 });
    fireEvent.pointerUp(content!, { pointerId: 9 });

    expect(canvas?.style.transform).toContain("translate(32px, 16px)");

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Mermaid diagram view" }));

    expect(content).toHaveAttribute("data-zoom", "1");
    expect(within(dialog).getByText("100%")).toBeInTheDocument();
    expect(canvas?.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("returns a single Mermaid block to preview mode from the source control", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");

    fireEvent.click(preview!);
    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "source");

    fireEvent.click(screen.getByRole("button", { name: "Preview Mermaid diagram" }));

    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
    expect(preview).not.toHaveAttribute("hidden");
  });

  it("returns a Mermaid source block to preview mode after clicking editor blank space", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container, view } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");

    fireEvent.click(preview!);
    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "source");

    fireEvent.pointerDown(view.dom);

    await waitFor(() => {
      expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
      expect(preview).not.toHaveAttribute("hidden");
    });
  });

  it("returns a Mermaid source block to preview mode after clicking paper blank space", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");

    fireEvent.click(preview!);
    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "source");

    fireEvent.pointerDown(screen.getByLabelText("Markdown editor"));

    await waitFor(() => {
      expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
      expect(preview).not.toHaveAttribute("hidden");
    });
  });

  it("returns a Mermaid source block to preview mode with Escape", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");
    const codeContent = container.querySelector<HTMLElement>(".ProseMirror .markra-code-content");

    fireEvent.click(preview!);
    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "source");

    fireEvent.keyDown(codeContent!, { key: "Escape" });

    expect(codeBlock).toHaveAttribute("data-mermaid-mode", "preview");
    expect(preview).not.toHaveAttribute("hidden");
  });

  it("uses a dark Mermaid theme for dark editor palettes", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source, { editorTheme: "night" });

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");

    expect(preview?.closest(".markdown-paper")).toHaveAttribute("data-editor-theme", "night");
    expect(mermaidThemeFromElement(preview)).toBe("dark");
  });

  it("uses a dark Mermaid theme for GitHub Dark and One dark palettes", () => {
    const paper = document.createElement("article");
    const preview = document.createElement("div");
    paper.className = "markdown-paper";
    paper.append(preview);

    for (const theme of ["github-dark", "one-dark", "one-dark-pro"]) {
      paper.setAttribute("data-editor-theme", theme);
      expect(mermaidThemeFromElement(preview)).toBe("dark");
    }

    paper.setAttribute("data-editor-theme", "one-light");
    expect(mermaidThemeFromElement(preview)).toBe("default");
  });

  it("rerenders Mermaid diagrams when the editor theme changes", async () => {
    const source = ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    const { container } = await renderEditor(source);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument();
    });
    const preview = container.querySelector<HTMLElement>(".ProseMirror .markra-mermaid-render");
    const paper = preview?.closest<HTMLElement>(".markdown-paper");
    const initialSvgId = preview?.querySelector("svg")?.id;

    expect(initialSvgId).toBeTruthy();

    paper?.setAttribute("data-editor-theme", "night");

    await waitFor(() => {
      expect(preview?.querySelector("svg")?.id).not.toBe(initialSvgId);
    });
    expect(mermaidThemeFromElement(preview)).toBe("dark");
  });

  it("copies code block content from the inline copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const source = ["```ts", "const answer = 42;", "return answer;", "```"].join("\n");
    await renderEditor(source);

    const copyButton = screen.getByRole("button", { name: "Copy code block" });

    expect(copyButton).toHaveAttribute("data-copied", "false");
    expect(copyButton.querySelector(".markra-code-copy-icon")).toBeInTheDocument();
    expect(copyButton.querySelector(".markra-code-copy-check-icon")).toBeInTheDocument();

    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("const answer = 42;\nreturn answer;");

    await waitFor(() => expect(copyButton).toHaveAccessibleName("Code copied"));
    expect(copyButton).toHaveAttribute("data-copied", "true");
  });

  it("updates a code block language from the inline language selector", async () => {
    const source = ["```ts", "const answer = 42;", "```"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const languageSelect = container.querySelector<HTMLSelectElement>(
      ".ProseMirror .markra-code-language-select"
    );

    expect(languageSelect).toHaveValue("ts");
    expect(Array.from(languageSelect!.options).map((option) => option.value)).toEqual(
      expect.arrayContaining(["", "json", "ts", "tsx", "python"])
    );

    fireEvent.change(languageSelect!, { target: { value: "json" } });

    await waitFor(() => expect(view.state.doc.child(0).attrs.language).toBe("json"));
    expect(container.querySelector(".ProseMirror .markra-code-block")).toHaveAttribute("data-language", "json");
    expect(container.querySelector(".ProseMirror .markra-code-content")).toHaveClass("language-json");
    expect(serializeMarkdown(view.state.doc)).toContain(["```json", "const answer = 42;", "```"].join("\n"));
  });

  it("places the code block language selector after the code content", async () => {
    const source = ["```bash", "echo hello", "```"].join("\n");
    const { container } = await renderEditor(source);
    const codeBlock = container.querySelector<HTMLElement>(".ProseMirror .markra-code-block");
    const languageControl = container.querySelector<HTMLElement>(".ProseMirror .markra-code-language-control");

    expect(codeBlock?.lastElementChild).toBe(languageControl);
  });

  it("keeps uncommon code block languages available in the inline selector", async () => {
    const source = ["```custom-lang", "alpha", "```"].join("\n");
    const { container } = await renderEditor(source);
    const languageSelect = container.querySelector<HTMLSelectElement>(
      ".ProseMirror .markra-code-language-select"
    );

    expect(languageSelect).toHaveValue("custom-lang");
    expect(Array.from(languageSelect!.options).map((option) => option.value)).toContain("custom-lang");
  });

  it("disables text substitutions inside editable code blocks", async () => {
    const source = ["```python", "print('')", "```"].join("\n");
    const { container } = await renderEditor(source);
    const codeContent = container.querySelector<HTMLElement>(".ProseMirror .markra-code-content");

    expect(codeContent).toHaveAttribute("spellcheck", "false");
    expect(codeContent).toHaveAttribute("autocorrect", "off");
    expect(codeContent).toHaveAttribute("autocapitalize", "off");
  });

  it("turns typed triple backticks into a code block when pressing Enter", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "```");

    expect(pressEnter(view)).toBe(true);
    expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.textContent).toBe("");
  });

  it("turns typed language fences into a code block when pressing Enter", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "```json");

    expect(pressEnter(view)).toBe(true);
    expect(container.querySelector(".ProseMirror .markra-code-block")).toHaveAttribute("data-language", "json");
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).attrs.language).toBe("json");
    expect(view.state.doc.textContent).toBe("");
  });

  it("normalizes a language fence even if Enter first inserts a new paragraph", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "```json");
    splitCurrentTextBlockDirectly(view);

    expect(container.querySelector(".ProseMirror .markra-code-block")).toHaveAttribute("data-language", "json");
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).attrs.language).toBe("json");
    expect(view.state.doc.textContent).toBe("");
  });

  it("turns typed triple backticks into a code block after existing text", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "Before");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "```");
    expect(pressEnter(view)).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("Before");
    expect(view.state.doc.child(1).type.name).toBe("code_block");
  });

  it("turns typed triple backticks into a code block when pressing Space", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "``` ");

    expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.textContent).toBe("");
  });

  it("turns a single triple-backtick text insertion into a code block", async () => {
    const { container, view } = await renderEditor();

    expect(insertTextThroughInputHandler(view, "```")).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.textContent).toBe("");
  });

  it("closes a code block when typing a trailing triple backtick fence", async () => {
    const { editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "```");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "const answer = 42;");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "```");
    typeText(view, "After");

    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).textContent).toBe("const answer = 42;");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).textContent).toBe("After");
    expect(serializeMarkdown(view.state.doc)).toContain(["```", "const answer = 42;", "```", "", "After"].join("\n"));
  });

  it("closes a code block when a trailing triple-backtick fence is inserted at once", async () => {
    const { editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "```");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "const answer = 42;");
    expect(pressEnter(view)).toBe(true);
    expect(insertTextThroughInputHandler(view, "```")).toBe(true);
    typeText(view, "After");

    expect(view.state.doc.child(0).type.name).toBe("code_block");
    expect(view.state.doc.child(0).textContent).toBe("const answer = 42;");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).textContent).toBe("After");
    expect(serializeMarkdown(view.state.doc)).toContain(["```", "const answer = 42;", "```", "", "After"].join("\n"));
  });

  it("renders block and inline math formulas with KaTeX while preserving markdown source", async () => {
    const blockFormula = String.raw`$$ A = P \left(1 + \frac{r}{n}\right)^{nt} $$`;
    const source = [blockFormula, "", "Where $A$ is the final amount."].join("\n");
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror .markra-math-render-display .katex")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-render-inline .katex")).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-hidden")).map((node) => node.textContent)
    ).toEqual([blockFormula, "$A$"]);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(blockFormula);
    expect(serializeMarkdown(view.state.doc)).toContain("Where $A$ is the final amount.");
  });

  it("preserves escaped underscore math source in inline formulas", async () => {
    const source = String.raw`> **Synthetic material Si$\\\_3$N$\\\_4$ remains stable.**`;
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe(source);
  });

  it("renders Hugo-style inline and display math formulas while preserving markdown source", async () => {
    const inlineFormula = String.raw`\(a^2 + b^2 = c^2\)`;
    const displayFormula = [
      String.raw`\[`,
      String.raw`\begin{aligned}`,
      String.raw`x &= a \\`,
      String.raw`- y &= b`,
      String.raw`\end{aligned}`,
      String.raw`\]`
    ].join("\n");
    const source = [`Where ${inlineFormula}.`, "", displayFormula].join("\n");
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror .markra-math-render-inline .katex")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-render-display .katex")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror ul")).not.toBeInTheDocument();
    const hiddenMathSource = Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-hidden"))
      .map((node) => node.textContent)
      .join("");
    expect(hiddenMathSource).toContain(inlineFormula);
    expect(hiddenMathSource).toContain(String.raw`\begin{aligned}`);
    expect(hiddenMathSource).toContain("- y &= b");
    expect(hiddenMathSource).toContain(String.raw`\]`);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(`Where ${inlineFormula}.`);
    expect(serializeMarkdown(view.state.doc)).toContain(displayFormula);
  });

  it("keeps dollar-prefixed amounts as plain markdown text", async () => {
    const source = "Invoice options: $1000、 $100";
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(container.querySelector(".ProseMirror .markra-math-render-inline")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    expect(view.state.doc.textContent).toBe(source);
    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe(source);
  });

  it("keeps literal math delimiter examples in inline code spans", async () => {
    const source = "Math examples use `$...$` inline and `$$...$$` display.";
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(container.querySelector(".ProseMirror .markra-math-render")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    expect(Array.from(container.querySelectorAll(".ProseMirror code")).map((node) => node.textContent)).toEqual([
      "$...$",
      "$$...$$"
    ]);
    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe(source);
  });

  it("applies display math macro definitions to later formulas", async () => {
    const macroDefinition = ["$$", String.raw`\newcommand{\RR}{\mathbb{R}}`, "$$"].join("\n");
    const source = [macroDefinition, "", String.raw`The domain is $\RR$.`].join("\n");
    const { container } = await renderEditor(source);

    const inlineFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-inline");
    const macroFold = container.querySelector<HTMLElement>(".ProseMirror .markra-math-macro-fold");

    expect(inlineFormula).toBeInTheDocument();
    expect(inlineFormula?.querySelector(".mathbb")).toHaveTextContent("R");
    expect(macroFold).toBeInTheDocument();
    expect(macroFold).toHaveTextContent(String.raw`\newcommand`);
    expect(container.querySelector(".ProseMirror .markra-math-render-display")).not.toBeInTheDocument();

    macroFold?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    const activeMacroSource = Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-active-display"))
      .map((node) => node.textContent)
      .join("");
    expect(activeMacroSource).toContain(String.raw`\newcommand{\RR}{\mathbb{R}}`);
  });

  it("renders multiline display math without treating minus-led rows as lists", async () => {
    const source = [
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`x &= a \\`,
      String.raw`- y &= b`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const hiddenMathSource = Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-hidden"))
      .map((node) => node.textContent)
      .join("");

    expect(container.querySelector(".ProseMirror .markra-math-render-display .katex")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror ul")).not.toBeInTheDocument();
    expect(hiddenMathSource).toContain("- y &= b");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(source);
  });

  it("renders multiline display math when typed directly", async () => {
    const { container, editor, view } = await renderEditor();

    typeText(view, "$$");
    expect(pressEnter(view)).toBe(true);
    typeText(view, String.raw`\int_0^1 x^2 \, dx`);
    expect(pressEnter(view)).toBe(true);
    typeText(view, "$$");

    expect(container.querySelector(".ProseMirror .markra-math-render-display .katex")).toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(["$$", String.raw`\int_0^1 x^2 \, dx`, "$$"].join("\n"));
  });

  it("renders Hugo-style multiline display math when typed directly", async () => {
    const { container, editor, view } = await renderEditor();

    typeText(view, String.raw`\[`);
    expect(pressEnter(view)).toBe(true);
    typeText(view, String.raw`\int_0^1 x^2 \, dx`);
    expect(pressEnter(view)).toBe(true);
    typeText(view, String.raw`\]`);

    expect(container.querySelector(".ProseMirror .markra-math-render-display .katex")).toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(
      [String.raw`\[`, String.raw`\int_0^1 x^2 \, dx`, String.raw`\]`].join("\n")
    );
  });

  it("renders ordinary paragraph line breaks without requiring explicit br tags", async () => {
    const source = ["First line", "Second line"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const paragraph = container.querySelector(".ProseMirror p");

    expect(paragraph).toContainHTML("<br");
    expect(serializeMarkdown(view.state.doc)).toContain(source);
    expect(serializeMarkdown(view.state.doc)).not.toContain("<br");
  });

  it("renders formatted paragraph soft line breaks while preserving source newlines", async () => {
    const source = ["**Mock bold**: line 1", "**Mock bold**: line 2", "**Mock bold**: line 3"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const paragraph = container.querySelector(".ProseMirror p");

    expect(paragraph?.querySelectorAll("br")).toHaveLength(2);
    expect(paragraph?.querySelectorAll("strong")).toHaveLength(3);
    expect(serializeMarkdown(view.state.doc)).toContain(source);
    expect(serializeMarkdown(view.state.doc)).not.toContain("<br");
  });

  it("inserts an explicit paragraph line break when pressing Enter inside paragraph text", async () => {
    const { container, editor, view } = await renderEditor("MockBeforeMockAfter");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "MockBefore", "MockBefore".length));

    expect(pressEnter(view)).toBe(true);

    const paragraph = container.querySelector(".ProseMirror p");
    expect(view.state.doc.childCount).toBe(1);
    const hardbreak = view.state.doc.resolve(findTextPosition(view, "MockAfter")).parent.child(1);
    expect(hardbreak.type.name).toBe("hardbreak");
    expect(hardbreak.attrs.isInline).toBe(true);
    expect(hardbreak.attrs.renderLineBreak).toBe(true);
    expect(paragraph?.querySelector('span.markra-hardbreak[data-type="hardbreak"] br')).toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc)).toBe("MockBefore<br>MockAfter\n");
    expect(serializeMarkdown(view.state.doc)).not.toContain("MockBefore\n\nMockAfter");
  });

  it("keeps the native caret anchor when leaving display math source at the closing delimiter", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, view } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    });

    moveCursor(view, findTextPosition(view, source, source.length));
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
    });

    const nativeCaretAnchor = container.querySelector<HTMLImageElement>(
      ".ProseMirror img.ProseMirror-separator.markra-math-caret-anchor"
    );
    const domSelection = container.ownerDocument.getSelection();
    const selectionParent =
      domSelection?.anchorNode instanceof HTMLElement
        ? domSelection.anchorNode
        : domSelection?.anchorNode?.parentElement ?? null;

    expect(view.state.selection.from).toBe(findTextPosition(view, source, source.length));
    expect(selectionParent).toHaveClass("markra-math-source-hidden-display");
    expect(nativeCaretAnchor).toBeInTheDocument();
    expect(nativeCaretAnchor).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
  });

  it("suppresses the display math caret anchor while visual document search is active", async () => {
    const source = [
      "# c",
      "",
      "112",
      "",
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`b &= a \\`,
      String.raw`-y &= b \\`,
      String.raw`z &= csa \\`,
      String.raw`z &= csb`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container, view } = await renderEditor(source);

    moveCursor(view, findLastTextBlockEndCursor(view));
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror img.markra-math-caret-anchor")).toBeInTheDocument()
    );

    const matches = findSearchMatchesInDoc(view.state.doc, "c");
    expect(matches.length).toBeGreaterThan(0);

    updateSearchDecorations(view, matches, 0, { suppressEditorChrome: true });
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror img.markra-math-caret-anchor")).not.toBeInTheDocument()
    );

    updateSearchDecorations(view, [], -1, { suppressEditorChrome: false });
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror img.markra-math-caret-anchor")).toBeInTheDocument()
    );
  });

  it("does not expose hidden display math source when the query matches formula text", async () => {
    const source = [
      "# c",
      "",
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`z &= csa \\`,
      String.raw`z &= csb`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container, view } = await renderEditor(source);

    moveCursor(view, findLastTextBlockEndCursor(view));
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror img.markra-math-caret-anchor")).toBeInTheDocument()
    );

    const matches = findSearchMatchesInDoc(view.state.doc, "csa");
    expect(matches).toHaveLength(1);

    updateSearchDecorations(view, matches, 0, { suppressEditorChrome: true });

    expect(container.querySelector(".ProseMirror .markra-math-source-hidden-display")).toBeInTheDocument();
    expect(
      container.querySelector(".ProseMirror .markra-math-source-hidden-display .markra-search-match")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".ProseMirror .markra-math-source-hidden-display.markra-search-match")
    ).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-search-match-current")).not.toBeInTheDocument();
  });

  it("omits visual search matches that overlap hidden display math source", async () => {
    const source = "Visible $$ E = mc^2 $$";
    const { view } = await renderEditor(source);

    const allMatches = findSearchMatchesInDoc(view.state.doc, "Visible $$");
    expect(allMatches).toHaveLength(1);

    expect(findVisibleSearchMatchesInState(view.state, "Visible $$")).toHaveLength(0);
  });

  it("reveals math source for editing when a rendered formula is clicked", async () => {
    const source = "Where $A$ is the final amount.";
    const { container, view } = await renderEditor(source);
    const inlineFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-inline");

    expect(inlineFormula).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).toHaveTextContent("$A$");

    fireEvent.mouseDown(inlineFormula!);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-math-render-inline")).not.toBeInTheDocument();
    expect(view.state.selection.from).toBeGreaterThan(source.indexOf("$A$") + 1);
    expect(view.state.selection.from).toBeLessThan(source.indexOf("$A$") + "$A$".length + 1);
  });

  it("reveals math source for editing from keyboard activation", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, view } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    expect(blockFormula).toBeInTheDocument();

    fireEvent.keyDown(blockFormula!, { key: "Enter" });

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    });
    expect(
      Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-active"))
        .map((node) => node.textContent)
        .join("")
    ).toBe(source);
    expect(container.querySelector(".ProseMirror .markra-math-render-active-preview .katex")).toBeInTheDocument();
    expect(view.state.selection.from).toBeGreaterThan(source.indexOf("E"));
    expect(view.state.selection.from).toBeLessThan(source.indexOf("$$", 2) + 1);
  });

  it("keeps a live preview below display math source while editing", async () => {
    const source = [
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`b &= a \\`,
      String.raw`- y &= b \\`,
      String.raw`z &= c`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    });

    const activeSourceText = Array.from(container.querySelectorAll(".ProseMirror .markra-math-source-active"))
      .map((node) => node.textContent)
      .join("");
    const activeSourceBreaks = container.querySelectorAll(
      '.ProseMirror .markra-math-source-active[data-type="hardbreak"]'
    );

    expect(container.querySelector(".ProseMirror .markra-math-render-active-preview .katex")).toBeInTheDocument();
    expect(activeSourceText).toContain("\\begin{aligned}");
    expect(activeSourceBreaks).toHaveLength(source.split("\n").length - 1);
    expect(container.querySelector(".ProseMirror .markra-math-token-delimiter")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-token-command")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-token-operator")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-caret-anchor")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
  });

  it("keeps display math source open when pressing inside the source block", async () => {
    const source = [
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`b &= a \\`,
      String.raw`z &= c`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);

    const sourceBlock = await waitFor(() =>
      container.querySelector<HTMLElement>(".ProseMirror p:has(.markra-math-source-active-display)")
    );

    fireEvent.pointerDown(sourceBlock!, {
      clientX: 320,
      clientY: 112
    });

    expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-render-active-preview")).toBeInTheDocument();
  });

  it("inserts a source newline instead of folding display math on Enter", async () => {
    const source = [
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`b &= a \\`,
      String.raw`- y &= b \\`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    });

    const firstEquation = String.raw`b &= a \\`;
    moveCursor(view, findTextPosition(view, firstEquation, firstEquation.length));

    expect(pressEnter(view)).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-math-render-active-preview")).toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc)).toContain(`${firstEquation}\n\n- y &= b`);
  });

  it("moves to the current display math source line end on Cmd+ArrowRight", async () => {
    const source = [
      "$$",
      String.raw`\begin{aligned}`,
      String.raw`b &= a \\`,
      String.raw`- y &= b \\`,
      String.raw`\end{aligned}`,
      "$$"
    ].join("\n");
    const { container, view } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
    });

    const firstEquation = String.raw`b &= a \\`;
    const lineStart = findTextPosition(view, firstEquation);
    const lineEnd = findTextPosition(view, firstEquation, firstEquation.length);
    moveCursor(view, lineStart + 2);

    expect(pressShortcut(view, "ArrowRight", { metaKey: true })).toBe(true);

    expect(view.state.selection.from).toBe(lineEnd);
    expect(container.querySelector(".ProseMirror .markra-math-source-active")).toBeInTheDocument();
  });

  it("folds math source when the cursor leaves the formula", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, view } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    });

    moveCursor(view, source.length + 1);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).toHaveTextContent(source);
  });

  it("folds math source after clicking editor blank space", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, view } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    });

    fireEvent.pointerDown(view.dom);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).toHaveTextContent(source);
  });

  it("folds math source after clicking paper blank space", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container } = await renderEditor(source);
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    fireEvent.mouseDown(blockFormula!);
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).not.toBeInTheDocument();
    });

    fireEvent.pointerDown(screen.getByLabelText("Markdown editor"));

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-math-source-hidden")).toHaveTextContent(source);
  });

  it("deletes a rendered math block from either side", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();

    moveCursor(view, 1);
    expect(pressShortcut(view, "Delete")).toBe(true);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).not.toBeInTheDocument();
    });
    expect(serializeMarkdown(view.state.doc)).not.toContain(source);

    insertTextDirectly(view, source);
    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
    });

    moveCursor(view, source.length + 1);
    expect(pressShortcut(view, "Backspace")).toBe(true);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).not.toBeInTheDocument();
    });
    expect(serializeMarkdown(view.state.doc)).not.toContain(source);
  });

  it("deletes a focused rendered math block with Delete", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const blockFormula = container.querySelector<HTMLElement>(".ProseMirror .markra-math-render-display");

    expect(blockFormula).toBeInTheDocument();

    moveCursor(view, source.length + 1);
    fireEvent.keyDown(blockFormula!, { key: "Delete" });

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).not.toBeInTheDocument();
    });
    expect(serializeMarkdown(view.state.doc)).not.toContain(source);
  });

  it("saves pasted clipboard images and inserts markdown image references", async () => {
    const onMarkdownChange = vi.fn();
    const onSaveClipboardImage = vi.fn().mockResolvedValue({
      alt: "Screenshot",
      src: "assets/pasted-image.png"
    });
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot.png", { type: "image/png" });
    const { container, editor, view } = await renderEditor("", { onMarkdownChange, onSaveClipboardImage });

    expect(pasteImage(view, image)).toBe(true);

    await waitFor(() => expect(onSaveClipboardImage).toHaveBeenCalledWith(image));
    await waitFor(() => {
      const insertedImage = container.querySelector<HTMLImageElement>('img[src="assets/pasted-image.png"]');
      expect(insertedImage).toHaveAttribute("alt", "Screenshot");
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Screenshot](assets/pasted-image.png)");
    expect(serializeMarkdown(view.state.doc)).not.toContain("!\\[Screenshot\\]\\(assets/pasted-image.png\\)");
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining("![Screenshot](assets/pasted-image.png)")));
  });

  it("lets pasted spreadsheet tables use structured clipboard data instead of the bitmap preview", async () => {
    const onSaveClipboardImage = vi.fn().mockResolvedValue({
      alt: "Spreadsheet preview",
      src: "assets/spreadsheet-preview.png"
    });
    const image = new File([new Uint8Array([1, 2, 3])], "Spreadsheet preview.png", { type: "image/png" });
    const { container, view } = await renderEditor("", { onSaveClipboardImage });

    dispatchMixedClipboardPaste(
      view,
      {
        files: [image],
        html: "<table><tbody><tr><td>Name</td><td>Role</td></tr><tr><td>Alpha</td><td>Beta</td></tr></tbody></table>",
        plainText: "Name\tRole\nAlpha\tBeta"
      }
    );

    expect(onSaveClipboardImage).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector(".ProseMirror table")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror table")).toHaveTextContent("Name");
    expect(container.querySelector(".ProseMirror table")).toHaveTextContent("Beta");
  });

  it("saves pasted clipboard attachments and inserts markdown links", async () => {
    const onMarkdownChange = vi.fn();
    const onSaveClipboardAttachment = vi.fn().mockResolvedValue({
      label: "Reference Doc.docx",
      src: "assets/Reference%20Doc.docx"
    });
    const attachment = new File([new Uint8Array([4, 5, 6])], "Reference Doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    const { container, editor, view } = await renderEditor("", {
      onMarkdownChange,
      onSaveClipboardAttachment
    });

    expect(pasteFile(view, attachment)).toBe(true);

    await waitFor(() => expect(onSaveClipboardAttachment).toHaveBeenCalledWith(attachment));
    await waitFor(() => {
      const insertedLink = container.querySelector<HTMLAnchorElement>('a[href="assets/Reference%20Doc.docx"]');
      expect(insertedLink).toHaveTextContent("Reference Doc.docx");
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("[Reference Doc.docx](assets/Reference%20Doc.docx)");
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(
      expect.stringContaining("[Reference Doc.docx](assets/Reference%20Doc.docx)")
    ));
  });

  it("adapts pasted markdown source into rich editor content", async () => {
    const onMarkdownChange = vi.fn();
    const { container, editor, view } = await renderEditor("", { onMarkdownChange });
    const markdownSource = [
      "# Pasted title",
      "",
      "A **bold** line with [a link](https://example.test).",
      "",
      "- First",
      "- Second",
      "",
      "![Diagram](assets/diagram.png)"
    ].join("\n");

    expect(pasteText(view, markdownSource)).toBe(true);

    expect(container.querySelector(".ProseMirror h1")).toHaveTextContent("Pasted title");
    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    expect(container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.test"]')).toHaveTextContent(
      "a link"
    );
    expect(container.querySelectorAll(".ProseMirror li")).toHaveLength(2);
    expect(container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/diagram.png"]')).toHaveAttribute(
      "alt",
      "Diagram"
    );
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("**bold**");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("# Pasted title");
    expect(serializeMarkdown(view.state.doc)).toContain("A **bold** line with [a link](https://example.test).");
    expect(serializeMarkdown(view.state.doc)).toContain("![Diagram](assets/diagram.png)");
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining("# Pasted title")));
  });

  it("adapts markdown source when the clipboard also includes source-shaped html", async () => {
    const { container, editor, view } = await renderEditor("");
    const markdownSource = [
      "# Pasted title",
      "",
      "A **bold** line with [a link](https://example.test)."
    ].join("\n");

    dispatchMixedClipboardPaste(view, {
      files: [],
      html: [
        '<pre class="editor-clipboard">',
        '<span># Pasted title</span>',
        "<br>",
        "<br>",
        '<span>A **bold** line with [a link](https://example.test).</span>',
        "</pre>"
      ].join(""),
      plainText: markdownSource
    });

    await waitFor(() => expect(container.querySelector(".ProseMirror h1")).toHaveTextContent("Pasted title"));
    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    expect(container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.test"]')).toHaveTextContent(
      "a link"
    );
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("**bold**");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("A **bold** line with [a link](https://example.test).");
  });

  it("adapts pasted inline markdown source inside the current paragraph", async () => {
    const { container, editor, view } = await renderEditor("Intro");
    moveCursor(view, findTextPosition(view, "Intro", "Intro".length));

    expect(pasteText(view, " with **bold** and [link](https://example.test)")).toBe(true);

    expect(container.querySelector(".ProseMirror p")).toHaveTextContent("Intro with bold and link");
    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    expect(container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.test"]')).toHaveTextContent(
      "link"
    );

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(
      "Intro with **bold** and [link](https://example.test)"
    );
  });

  it("transfers remote images from pasted web HTML through the image save pipeline", async () => {
    const onMarkdownChange = vi.fn();
    const onSaveRemoteClipboardImage = vi.fn().mockResolvedValue({
      alt: "Kitten",
      src: "assets/kitten.png"
    });
    const { container, editor, view } = await renderEditor("", {
      onMarkdownChange,
      onSaveRemoteClipboardImage
    });
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    const pastedDocument = parseMarkdown("Intro\n\n![Kitten](https://images.example.com/kitten.png)\n\nOutro");

    expect(pasteHtml(
      view,
      '<p>Intro</p><img src="https://images.example.com/kitten.png" alt="Kitten"><p>Outro</p>',
      new Slice(pastedDocument.content, 0, 0)
    )).toBe(true);

    await waitFor(() => {
      expect(onSaveRemoteClipboardImage).toHaveBeenCalledWith({
        alt: "Kitten",
        src: "https://images.example.com/kitten.png",
        title: ""
      });
    });
    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>('img[src="assets/kitten.png"]')).toHaveAttribute(
        "alt",
        "Kitten"
      );
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Kitten](assets/kitten.png)");
    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining("![Kitten](assets/kitten.png)")));
  });

  it("keeps pasted web image URLs when remote image transfer is skipped", async () => {
    const onSaveRemoteClipboardImage = vi.fn().mockResolvedValue(null);
    const { container, editor, view } = await renderEditor("", { onSaveRemoteClipboardImage });
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    const pastedDocument = parseMarkdown("![Logo](https://images.example.com/logo.png)");

    expect(pasteHtml(
      view,
      '<img src="https://images.example.com/logo.png" alt="Logo">',
      new Slice(pastedDocument.content, 0, 0)
    )).toBe(true);

    await waitFor(() => expect(onSaveRemoteClipboardImage).toHaveBeenCalled());
    expect(container.querySelector<HTMLImageElement>('img[src="https://images.example.com/logo.png"]')).toHaveAttribute(
      "alt",
      "Logo"
    );
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Logo](https://images.example.com/logo.png)");
  });

  it("saves dropped image files and inserts markdown image references", async () => {
    const onSaveClipboardImage = vi.fn().mockResolvedValue({
      alt: "Diagram",
      src: "https://cdn.example.com/notes/diagram.png"
    });
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });
    const { container, editor, view } = await renderEditor("", { onSaveClipboardImage });

    expect(dropImage(view, image)).toBe(true);

    await waitFor(() => expect(onSaveClipboardImage).toHaveBeenCalledWith(image));
    await waitFor(() => {
      const insertedImage = container.querySelector<HTMLImageElement>(
        'img[src="https://cdn.example.com/notes/diagram.png"]'
      );
      expect(insertedImage).toHaveAttribute("alt", "Diagram");
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Diagram](https://cdn.example.com/notes/diagram.png)");
  });

  it("inserts existing file-tree image assets without saving them again", async () => {
    const onSaveClipboardImage = vi.fn();
    const { container, editor, view } = await renderEditor("", {
      documentPath: "/vault/docs/note.md",
      onSaveClipboardImage
    });

    expect(dropMarkdownImageDragPayload(view, {
      alt: "Diagram",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    })).toBe(true);

    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>('img[src="../assets/diagram.png"]')).toHaveAttribute(
        "alt",
        "Diagram"
      );
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Diagram](../assets/diagram.png)");
    expect(onSaveClipboardImage).not.toHaveBeenCalled();
  });

  it("inserts dragged image asset text when the custom drag payload is unavailable", async () => {
    const onSaveClipboardImage = vi.fn();
    const { container, editor, view } = await renderEditor("", {
      documentPath: "/vault/docs/note.md",
      onSaveClipboardImage
    });

    expect(dropPlainMarkdownImageText(view, "![Diagram](../assets/diagram.png)")).toBe(true);

    await waitFor(() => {
      expect(container.querySelector<HTMLImageElement>('img[src="../assets/diagram.png"]')).toHaveAttribute(
        "alt",
        "Diagram"
      );
    });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Diagram](../assets/diagram.png)");
    expect(onSaveClipboardImage).not.toHaveBeenCalled();
  });

  it("replaces a blank line when dropping an existing file-tree image asset there", async () => {
    const onSaveClipboardImage = vi.fn();
    const { editor, view } = await renderEditor("First\n\n\n\nSecond", {
      documentPath: "/vault/docs/note.md",
      onSaveClipboardImage
    });
    const emptyParagraphPosition = findTopLevelEmptyParagraphPosition(view);

    moveCursor(view, emptyParagraphPosition + 1);

    expect(dropMarkdownImageDragPayload(view, {
      alt: "Diagram",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    })).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\n![Diagram](../assets/diagram.png)\n\nSecond\n");
    expect(onSaveClipboardImage).not.toHaveBeenCalled();
  });

  it("does not select the image below after dropping an existing image asset", async () => {
    const onSaveClipboardImage = vi.fn();
    const { container, editor, view } = await renderEditor("First\n\n\n\n![Below](../assets/below.png)", {
      documentPath: "/vault/docs/note.md",
      onSaveClipboardImage
    });
    const emptyParagraphPosition = findTopLevelEmptyParagraphPosition(view);

    moveCursor(view, emptyParagraphPosition + 1);

    expect(dropMarkdownImageDragPayload(view, {
      alt: "Dropped",
      path: "/vault/assets/dropped.png",
      relativePath: "assets/dropped.png"
    })).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe(
      "First\n\n![Dropped](../assets/dropped.png)\n\n![Below](../assets/below.png)\n"
    );

    const droppedImage = container.querySelector<HTMLImageElement>('img[src="../assets/dropped.png"]');
    const belowImage = container.querySelector<HTMLImageElement>('img[src="../assets/below.png"]');
    const droppedImageNode = droppedImage?.closest(".markra-image-node");
    const belowImageNode = belowImage?.closest(".markra-image-node");
    let belowImagePosition: number | null = null;
    view.state.doc.descendants((node, nodePosition) => {
      if (belowImagePosition !== null) return false;
      if (node.type.name === "image" && node.attrs.src === "../assets/below.png") {
        belowImagePosition = nodePosition;
        return false;
      }

      return true;
    });

    expect(droppedImageNode).toBeInTheDocument();
    expect(belowImagePosition).not.toBeNull();
    if (view.state.selection instanceof NodeSelection) {
      expect(view.state.selection.from).not.toBe(belowImagePosition);
    }
    expect(belowImageNode).not.toHaveClass("ProseMirror-selectednode");
    expect(container.querySelector(".ProseMirror-selectednode")).not.toBe(belowImageNode);
    expect(onSaveClipboardImage).not.toHaveBeenCalled();
  });

  it("reorders top-level blocks from the hover drag handle", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const editorRoot = surface?.parentElement;
    expect(surface).toBeInTheDocument();
    expect(editorRoot).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    expect(handle.closest<HTMLElement>(".markra-block-toolbar")?.style.left).toBe("106px");
    const dataTransfer = createDragDataTransfer();

    dispatchDragEvent(handle, "dragstart", {
      clientX: 136,
      clientY: 112,
      dataTransfer
    });
    dispatchDragEvent(editorRoot!, "dragover", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(editorRoot!, "drop", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Second\n\nFirst\n\nThird\n");
    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(container.querySelector(".ProseMirror-selectednode")).not.toBeInTheDocument();
    restoreLayout();
  });

  it("reveals the block drag handle from the editor gutter and reorders blocks there", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    const dataTransfer = createDragDataTransfer();

    dispatchDragEvent(handle, "dragstart", {
      clientX: 136,
      clientY: 112,
      dataTransfer
    });
    dispatchDragEvent(paper!, "dragover", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(paper!, "drop", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Second\n\nFirst\n\nThird\n");
    restoreLayout();
  });

  it("reorders a horizontal rule from a nearby gutter hover", async () => {
    const { container, editor, view } = await renderEditor("First\n\n---\n\nSecond");
    const restoreLayout = mockThinHorizontalRuleBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface?.querySelector("hr")).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 146
    });

    const handle = screen.getByRole("button", { name: "Drag block" });
    expect(handle.closest(".markra-block-toolbar")).toHaveAttribute("data-show", "true");

    fireEvent.pointerDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 146,
      pointerId: 9
    });
    fireEvent.pointerMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 180,
      pointerId: 9
    });
    expect(paper!.querySelector(".markra-block-drop-indicator")).toHaveAttribute("data-show", "true");
    fireEvent.pointerUp(document, {
      button: 0,
      clientX: 136,
      clientY: 180,
      pointerId: 9
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\nSecond\n\n***\n");
    restoreLayout();
  });

  it("ignores horizontal rule surrounding clicks", async () => {
    const { container, view } = await renderEditor("First\n\n---\n\nSecond");
    const restoreLayout = mockThinHorizontalRuleBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface?.querySelector("hr")).toBeInTheDocument();

    const secondCursor = findTextPosition(view, "Second");
    moveCursor(view, secondCursor);
    const upperWhitespaceResult = fireEvent.mouseDown(surface!, {
      button: 0,
      clientX: 200,
      clientY: 130
    });
    expect(upperWhitespaceResult).toBe(false);
    expect(view.state.selection.from).toBe(secondCursor);

    const topGapResult = fireEvent.mouseDown(surface!, {
      button: 0,
      clientX: 200,
      clientY: 134
    });
    expect(topGapResult).toBe(false);
    expect(view.state.selection.from).toBe(secondCursor);

    const firstCursor = findTextPosition(view, "First");
    moveCursor(view, firstCursor);
    const bottomGapResult = fireEvent.mouseDown(surface!, {
      button: 0,
      clientX: 200,
      clientY: 147
    });
    expect(bottomGapResult).toBe(false);
    expect(view.state.selection.from).toBe(firstCursor);

    const lowerWhitespaceResult = fireEvent.mouseDown(surface!, {
      button: 0,
      clientX: 200,
      clientY: 153
    });
    expect(lowerWhitespaceResult).toBe(false);
    expect(view.state.selection.from).toBe(firstCursor);

    restoreLayout();
  });

  it("selects a horizontal rule from a line click", async () => {
    const { container, view } = await renderEditor("First\n\n---\n\nSecond");
    const restoreLayout = mockThinHorizontalRuleBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const rule = surface?.querySelector<HTMLElement>("hr");
    expect(rule).toBeInTheDocument();

    moveCursor(view, findTextPosition(view, "Second"));
    const lineResult = fireEvent.mouseDown(rule!, {
      button: 0,
      clientX: 200,
      clientY: 140
    });

    expect(lineResult).toBe(false);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "hr"));
    restoreLayout();
  });

  it("selects a horizontal rule between an image and another horizontal rule", async () => {
    const markdown = [
      "![First](assets/first.png)",
      "",
      "***",
      "",
      "![Second](assets/second.png)",
      "",
      "***",
      "",
      "***"
    ].join("\n");
    const { container, view } = await renderEditor(markdown);
    const rules = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror hr"));
    const rulePositions = nodePositionsByType(view, "hr");

    expect(rules).toHaveLength(3);
    expect(rulePositions).toHaveLength(3);
    moveCursor(view, findNodeStartPosition(view, "image"));

    fireEvent.mouseDown(rules[1]);

    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));
    expect(view.state.selection.from).toBe(rulePositions[1]);
  });

  it("selects a horizontal rule below an image from its forgiving hit target", async () => {
    const { container, view } = await renderEditor("![Screenshot](assets/image.png)\n\n---\n\nSecond");
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const rule = surface?.querySelector<HTMLElement>("hr");
    expect(rule).toBeInTheDocument();

    rule!.getBoundingClientRect = vi.fn(() => ({
      bottom: 146,
      height: 12,
      left: 160,
      right: 640,
      top: 134,
      width: 480,
      x: 160,
      y: 134,
      toJSON: () => ({})
    } as DOMRect));

    moveCursor(view, findTextPosition(view, "Second"));
    fireEvent.mouseDown(rule!, {
      button: 0,
      clientX: 200,
      clientY: 136
    });

    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "hr"));
  });

  it("ignores clicks above the visual line outside a horizontal rule element", async () => {
    const { container, view } = await renderEditor("First\n\n---\n\nSecond");
    const restoreLayout = mockThinHorizontalRuleBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const rule = surface?.querySelector<HTMLElement>("hr");
    expect(rule).toBeInTheDocument();

    rule!.getBoundingClientRect = vi.fn(() => ({
      bottom: 146,
      height: 12,
      left: 160,
      right: 640,
      top: 134,
      width: 480,
      x: 160,
      y: 134,
      toJSON: () => ({})
    } as DOMRect));

    const secondCursor = findTextPosition(view, "Second");
    moveCursor(view, secondCursor);
    const upperHitTargetResult = fireEvent.mouseDown(surface!, {
      button: 0,
      clientX: 200,
      clientY: 136
    });

    expect(upperHitTargetResult).toBe(false);
    expect(view.state.selection.from).toBe(secondCursor);

    restoreLayout();
  });

  it("serializes horizontal rules without creating a setext-heading trap in source mode", async () => {
    const { editor, view } = await renderEditor("First\n\n---\n\nSecond");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    const markdown = serializeMarkdown(view.state.doc);

    expect(markdown).toBe("First\n\n***\n\nSecond\n");

    const editedMarkdown = markdown.replace("\n\n***", "\nInserted\n***");
    const editedDocument = parseMarkdown(editedMarkdown);
    expect(editedDocument.child(0).type.name).toBe("paragraph");
    expect(editedDocument.child(0).textContent).toContain("Inserted");
    expect(editedDocument.child(1).type.name).toBe("hr");
  });

  it("removes an empty paragraph below a horizontal rule on Backspace", async () => {
    const { editor, view } = await renderEditor("First\n\n---\n\n\n\nSecond");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const emptyParagraphPosition = findTopLevelEmptyParagraphPosition(view);

    expect(view.state.doc.child(2).type.name).toBe("paragraph");
    expect(view.state.doc.child(2).content.size).toBe(0);
    moveCursor(view, emptyParagraphPosition + 1);

    expect(pressBackspace(view)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "hr"));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\n***\n\nSecond\n");
  });

  it("removes an empty paragraph above a horizontal rule on Delete", async () => {
    const { editor, view } = await renderEditor("First\n\n\n\n---\n\nSecond");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const emptyParagraphPosition = findTopLevelEmptyParagraphPosition(view);

    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);
    moveCursor(view, emptyParagraphPosition + 1);

    expect(pressShortcut(view, "Delete")).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(view.state.selection.from).toBe(findNodeStartPosition(view, "hr"));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\n***\n\nSecond\n");
  });

  it("reorders blocks below a table drop target", async () => {
    const tableMarkdown = ["| Name | Role |", "| --- | --- |", "| Markra | Editor |"].join("\n");
    const { container, editor, view } = await renderEditor(["First", "", tableMarkdown, "", "Second"].join("\n"));
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    const dataTransfer = createDragDataTransfer();

    dispatchDragEvent(handle, "dragstart", {
      clientX: 136,
      clientY: 112,
      dataTransfer
    });
    dispatchDragEvent(paper!, "dragover", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(paper!, "drop", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("| Markra | Editor |\n\nFirst\n\nSecond");
    restoreLayout();
  });

  it("reorders blocks below an image drop target", async () => {
    const { container, editor, view } = await renderEditor("First\n\n![Screenshot](assets/pasted-image.png)\n\nSecond");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    const dataTransfer = createDragDataTransfer();

    dispatchDragEvent(handle, "dragstart", {
      clientX: 136,
      clientY: 112,
      dataTransfer
    });
    dispatchDragEvent(paper!, "dragover", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(paper!, "drop", {
      clientX: 136,
      clientY: 160,
      dataTransfer
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("![Screenshot](assets/pasted-image.png)\n\nFirst\n\nSecond\n");
    restoreLayout();
  });

  it("anchors the block toolbar near the first line of tall heading content", async () => {
    const { container, view } = await renderEditor("# Parent\n\nBody");
    const heading = container.querySelector<HTMLElement>(".ProseMirror > h1");
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(heading).toBeInTheDocument();
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    heading!.style.paddingBottom = "10px";
    heading!.style.borderBottomWidth = "1px";
    heading!.style.borderBottomStyle = "solid";
    heading!.style.lineHeight = "52px";
    heading!.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 184,
          height: 84,
          left: 160,
          right: 640,
          top: 100,
          width: 480,
          x: 160,
          y: 100,
          toJSON: () => ({})
        }) as DOMRect
    );
    view.dom.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 260,
          height: 180,
          left: 160,
          right: 640,
          top: 90,
          width: 480,
          x: 160,
          y: 90,
          toJSON: () => ({})
        }) as DOMRect
    );

    const originalPosAtCoords = view.posAtCoords.bind(view);
    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: () => ({ inside: 0, pos: 1 })
    });

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    expect(handle.closest<HTMLElement>(".markra-block-toolbar")?.style.top).toBe("126px");

    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: originalPosAtCoords
    });
  });

  it("reorders blocks with pointer dragging from the gutter handle", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.pointerMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.pointerDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112,
      pointerId: 7
    });
    fireEvent.pointerMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160,
      pointerId: 7
    });
    fireEvent.pointerUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160,
      pointerId: 7
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Second\n\nFirst\n\nThird\n");
    restoreLayout();
  });

  it("reorders blocks with mouse dragging from the gutter handle", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    expect(handle.closest(".markra-block-toolbar")).toHaveAttribute("data-show", "true");

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Second\n\nFirst\n\nThird\n");
    restoreLayout();
  });

  it("shows a lightweight drag ghost while dragging a block", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160
    });

    const ghost = paper!.querySelector<HTMLElement>(".markra-block-drag-ghost");
    expect(ghost).toBeInTheDocument();
    expect(ghost).toHaveAttribute("data-show", "true");
    expect(ghost).toHaveTextContent("First");
    expect(ghost?.style.left).toBe("0px");
    expect(ghost?.style.top).toBe("0px");
    expect(ghost?.style.transform).toBe("translate(148px, 170px)");

    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160
    });

    expect(ghost).toHaveAttribute("data-show", "false");
    restoreLayout();
  });

  it("keeps the drop indicator close to the content width", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    const secondBlock = surface?.children.item(1) as HTMLElement | null;
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();
    expect(secondBlock).toBeInstanceOf(HTMLElement);

    secondBlock!.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 168,
          height: 28,
          left: 160,
          right: 1160,
          top: 140,
          width: 1000,
          x: 160,
          y: 140,
          toJSON: () => ({})
        }) as DOMRect
    );

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160
    });

    const indicator = paper!.querySelector<HTMLElement>(".markra-block-drop-indicator");
    expect(indicator).toHaveAttribute("data-show", "true");
    expect(indicator?.style.left).toBe("162px");
    expect(indicator?.style.width).toBe("640px");

    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160
    });
    restoreLayout();
  });

  it("scrolls the editor edge while dragging a block near the viewport boundary", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    const paperScroll = surface?.closest<HTMLElement>(".paper-scroll");
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();
    expect(paperScroll).toBeInTheDocument();

    paperScroll!.getBoundingClientRect = vi.fn(
      () =>
        ({
          bottom: 200,
          height: 200,
          left: 0,
          right: 900,
          top: 0,
          width: 900,
          x: 0,
          y: 0,
          toJSON: () => ({})
        }) as DOMRect
    );
    const scrollBy = vi.fn();
    paperScroll!.scrollBy = scrollBy;

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 188
    });

    const scrollOptions = scrollBy.mock.calls[0]?.[0] as ScrollToOptions | undefined;
    expect(scrollOptions?.top).toBeGreaterThan(0);

    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 188
    });
    restoreLayout();
  });

  it("prevents native text selection while dragging a block", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    const firstText = surface?.querySelector("p")?.firstChild;
    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();
    expect(firstText).toBeInstanceOf(Text);

    const selection = window.getSelection();
    const selectionRange = document.createRange();
    selectionRange.selectNodeContents(firstText!);
    selection?.removeAllRanges();
    selection?.addRange(selectionRange);
    expect(selection?.toString()).toBe("First");

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160
    });

    expect(document.documentElement).toHaveAttribute("data-markra-block-dragging", "true");
    expect(paper).toHaveAttribute("data-block-dragging", "true");
    expect(selection?.toString()).toBe("");

    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160
    });

    expect(document.documentElement).not.toHaveAttribute("data-markra-block-dragging");
    expect(paper).not.toHaveAttribute("data-block-dragging");
    restoreLayout();
  });

  it("animates blocks into their reordered positions", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayoutByCurrentDomOrder(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const paper = surface?.closest<HTMLElement>(".markdown-paper");
    const originalAnimate = HTMLElement.prototype.animate;
    const animate = vi.fn(() => ({
      addEventListener: vi.fn(),
      finished: Promise.resolve()
    } as unknown as Animation));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate
    });

    expect(surface).toBeInTheDocument();
    expect(paper).toBeInTheDocument();

    fireEvent.mouseMove(paper!, {
      clientX: 136,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 136,
      clientY: 160
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 136,
      clientY: 160
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Second\n\nFirst\n\nThird\n");
    expect(animate).toHaveBeenCalledWith(
      [
        expect.objectContaining({ transform: expect.stringContaining("translate") }),
        { transform: "translate(0, 0)" }
      ],
      expect.objectContaining({
        duration: expect.any(Number),
        easing: expect.stringContaining("cubic-bezier")
      })
    );

    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: originalAnimate
    });
    restoreLayout();
  });

  it("reorders list items from the hover drag handle", async () => {
    const { container, editor, view } = await renderEditor("- First\n- Second\n- Third");
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    const dataTransfer = createDragDataTransfer();

    dispatchDragEvent(handle, "dragstart", {
      clientX: 136,
      clientY: 112,
      dataTransfer
    });
    dispatchDragEvent(surface!, "dragover", {
      clientX: 170,
      clientY: 160,
      dataTransfer
    });
    dispatchDragEvent(surface!, "drop", {
      clientX: 170,
      clientY: 160,
      dataTransfer
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("- Second\n\n- First\n\n- Third\n");
    restoreLayout();
  });

  it("does not show a separate drag handle for the whole list container", async () => {
    const { container, view } = await renderEditor("- First\n- Second\n- Third");
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    const originalPosAtCoords = view.posAtCoords.bind(view);
    const listContainerPosition = positionWithAncestorExcluding(view, "bullet_list", "list_item");
    expect(surface).toBeInTheDocument();
    expect(listContainerPosition).not.toBeNull();

    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: () => ({ inside: listContainerPosition, pos: listContainerPosition })
    });

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    expect(container.querySelector(".markra-block-toolbar")).toHaveAttribute("data-show", "false");
    Object.defineProperty(view, "posAtCoords", {
      configurable: true,
      value: originalPosAtCoords
    });
  });

  it("keeps the list block toolbar anchored while hovering its drag handle", async () => {
    const { container, view } = await renderEditor("- First\n- Second\n- Third");
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });
    const toolbar = handle.closest<HTMLElement>(".markra-block-toolbar");
    expect(toolbar).toBeInTheDocument();
    const anchoredTop = toolbar!.style.top;

    fireEvent.mouseMove(handle, {
      clientX: 136,
      clientY: 160
    });

    expect(toolbar!.style.top).toBe(anchoredTop);
    restoreLayout();
  });

  it("moves a list item outside its list near another top-level block", async () => {
    const { container, editor, view } = await renderEditor("Intro\n\n- First\n- Second\n\nOutro");
    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > p"));
    const listItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror li"));
    const topLevelPositions = topLevelBlockPositions(view);
    const listItemPositions = nodePositionsByType(view, "list_item");
    const restoreLayout = mockBlockDragLayout(view, [listItems[0], listItems[1], paragraphs[1]], [
      listItemPositions[0],
      listItemPositions[1],
      topLevelPositions[2]
    ]);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 152
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 240,
      clientY: 200
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 240,
      clientY: 200
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("Intro\n\n- First\n\nOutro\n\n- Second\n");
    restoreLayout();
  });

  it("moves a paragraph into a list as a list item", async () => {
    const { container, editor, view } = await renderEditor("Intro\n\n- First\n- Second");
    const intro = container.querySelector<HTMLElement>(".ProseMirror > p");
    const listItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror li"));
    const restoreLayout = mockBlockDragLayout(view, [intro!, listItems[0], listItems[1]], [
      topLevelBlockPositions(view)[0],
      ...nodePositionsByType(view, "list_item")
    ]);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();
    expect(intro).toBeInTheDocument();

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 170,
      clientY: 160
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 170,
      clientY: 160
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("- First\n\n- Intro\n\n- Second\n");
    restoreLayout();
  });

  it("nests a paragraph when dragged rightward into a list", async () => {
    const { container, editor, view } = await renderEditor("Intro\n\n- First\n- Second");
    const intro = container.querySelector<HTMLElement>(".ProseMirror > p");
    const listItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror li"));
    const restoreLayout = mockBlockDragLayout(view, [intro!, listItems[0], listItems[1]], [
      topLevelBlockPositions(view)[0],
      ...nodePositionsByType(view, "list_item")
    ]);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();
    expect(intro).toBeInTheDocument();

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 112
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 240,
      clientY: 160
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 240,
      clientY: 160
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("- First\n\n  - Intro\n\n- Second\n");
    restoreLayout();
  });

  it("nests a list item when dragged with a rightward offset", async () => {
    const { container, editor, view } = await renderEditor("- First\n- Second\n- Third");
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.mouseMove(surface!, {
      clientX: 240,
      clientY: 192
    });

    const handle = await screen.findByRole("button", { name: "Drag block" });

    fireEvent.mouseDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 136,
      clientY: 192
    });
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 220,
      clientY: 112
    });
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: 220,
      clientY: 112
    });

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("- First\n\n  - Third\n\n- Second\n");
    restoreLayout();
  });

  it("adds a paragraph below the hovered block from the side toolbar", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));
    typeText(view, "Inserted");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\nSecond\n\nInserted\n\nThird\n");
    restoreLayout();
  });

  it("opens slash commands after adding a paragraph from the side toolbar", async () => {
    const { container, editor, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Heading 1" })).toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("First\n\nSecond\n\n\n\nThird\n");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("/");
    restoreLayout();
  });

  it("saves side-toolbar blank paragraphs as markdown blank lines instead of br tags", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird", { onMarkdownChange });
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    await settleMarkdownListener();
    const latestMarkdown = String(onMarkdownChange.mock.calls.at(-1)?.[0] ?? "");
    expect(latestMarkdown).toContain("Second\n\n\n\nThird");
    expect(latestMarkdown).not.toContain("<br");
    restoreLayout();
  });

  it("loads template blank lines as editable empty paragraphs", async () => {
    const { editor, view } = await renderEditor("# Template\n\n\n\n## Next");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);
    expect(serializeMarkdown(view.state.doc)).toBe("# Template\n\n\n\n## Next\n");
  });

  it("loads multiple paragraph blank lines as editable empty paragraphs", async () => {
    const source = "First\n\n\n\nSecond";
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).textContent).toBe("First");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);
    expect(view.state.doc.child(2).textContent).toBe("Second");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("loads a triple newline between paragraphs as an editable empty paragraph", async () => {
    const { view } = await renderEditor("First\n\n\nSecond");

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);
  });

  it("saves blank list items without br tags", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("- First\n- Second", { onMarkdownChange });
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    await settleMarkdownListener();
    const latestMarkdown = String(onMarkdownChange.mock.calls.at(-1)?.[0] ?? "");
    expect(latestMarkdown).not.toContain("<br");
    expect(latestMarkdown).toContain("- First");
    expect(latestMarkdown).toContain("- Second");
    restoreLayout();
  });

  it("runs slash commands by mouse after adding a paragraph from the side toolbar", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    const headingOption = await screen.findByRole("option", { name: "Heading 1" });
    fireEvent.pointerDown(headingOption, {
      button: 0,
      buttons: 1,
      pointerId: 11
    });

    await waitFor(() => expect(view.state.doc.child(2).type.name).toBe("heading"));
    expect(view.state.doc.child(2).attrs.level).toBe(1);
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
    restoreLayout();
  });

  it("runs slash commands when a mouse event targets the option text", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    const headingOption = await screen.findByRole("option", { name: "Heading 1" });
    const optionText = headingOption.firstChild;
    expect(optionText?.nodeType).toBe(Node.TEXT_NODE);
    optionText?.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true
    }));

    await waitFor(() => expect(view.state.doc.child(2).type.name).toBe("heading"));
    expect(view.state.doc.child(2).attrs.level).toBe(1);
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
    restoreLayout();
  });

  it("keeps a hovered slash command option clickable", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    const headingOption = await screen.findByRole("option", { name: "Heading 1" });
    fireEvent.mouseOver(headingOption);
    fireEvent.mouseDown(headingOption, {
      button: 0,
      buttons: 1
    });

    await waitFor(() => expect(view.state.doc.child(2).type.name).toBe("heading"));
    expect(view.state.doc.child(2).attrs.level).toBe(1);
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
    restoreLayout();
  });

  it("filters slash commands from a side toolbar inserted paragraph", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");
    const restoreLayout = mockTopLevelBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 152
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));
    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();

    typeText(view, "co");

    expect(screen.getByRole("option", { name: "Code Block" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("option", { name: "Heading 1" })).not.toBeInTheDocument();

    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument());
    expect(view.state.doc.textContent).toBe("FirstSecondThird");
    restoreLayout();
  });

  it("adds a blank paragraph below the hovered list item from the side toolbar", async () => {
    const { container, editor, view } = await renderEditor("- First\n- Second");
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));
    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    typeText(view, "Inserted");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("- First\n\nInserted\n\n- Second\n");
    restoreLayout();
  });

  it("runs slash commands after adding a blank paragraph from a list item", async () => {
    const { container, view } = await renderEditor("- First\n- Second");
    const restoreLayout = mockListItemBlockDragLayout(view, container);
    const surface = container.querySelector<HTMLElement>(".ProseMirror");
    expect(surface).toBeInTheDocument();

    fireEvent.pointerMove(surface!, {
      clientX: 240,
      clientY: 112
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add block below" }));

    const headingOption = await screen.findByRole("option", { name: "Heading 1" });
    fireEvent.pointerDown(headingOption, {
      button: 0,
      buttons: 1,
      pointerId: 12
    });

    await waitFor(() => expect(view.state.doc.child(1).type.name).toBe("heading"));
    expect(view.state.doc.child(1).attrs.level).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe("bullet_list");
    expect(view.state.doc.child(2).type.name).toBe("bullet_list");
    restoreLayout();
  });

  it("adds table rows and columns from the hover controls", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, view } = await renderEditor(initialTable);
    const cellCountInFirstRow = () => container.querySelectorAll(".ProseMirror table tr:first-child th, .ProseMirror table tr:first-child td").length;
    const rowCount = () => container.querySelectorAll(".ProseMirror table tr").length;
    const firstRowCells = () =>
      Array.from(container.querySelectorAll(".ProseMirror table tr:first-child th, .ProseMirror table tr:first-child td")).map(
        (cell) => cell.textContent
      );
    const lastRowCells = () =>
      Array.from(container.querySelectorAll(".ProseMirror table tr:last-child th, .ProseMirror table tr:last-child td")).map(
        (cell) => cell.textContent
      );

    expect(cellCountInFirstRow()).toBe(2);
    expect(rowCount()).toBe(2);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Add column to the right" }));

    await waitFor(() => expect(cellCountInFirstRow()).toBe(3));
    expect(container.querySelector(".ProseMirror .selectedCell")).not.toBeInTheDocument();
    typeText(view, "New column");
    await waitFor(() => expect(firstRowCells()).toEqual(["Field", "Value", "New column"]));

    fireEvent.mouseDown(screen.getByRole("button", { name: "Add row below" }));

    await waitFor(() => expect(rowCount()).toBe(3));
    expect(container.querySelector(".ProseMirror .selectedCell")).not.toBeInTheDocument();
    typeText(view, "New row");
    await waitFor(() => expect(lastRowCells()).toEqual(["New row", "", ""]));
  });

  it("deletes the hovered table row and column from visual controls", async () => {
    const initialTable = ["| A | B | C |", "| --- | --- | --- |", "| 1 | 2 | 3 |", "| 4 | 5 | 6 |"].join("\n");
    const { container } = await renderEditor(initialTable);
    const tableRows = () =>
      Array.from(container.querySelectorAll(".ProseMirror table tr")).map((row) =>
        Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent)
      );

    fireEvent.mouseMove(screen.getByRole("cell", { name: "5" }));

    expect(screen.queryByRole("button", { name: "Delete column" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete row" })).toBeInTheDocument();

    fireEvent.mouseMove(screen.getByRole("columnheader", { name: "B" }));

    expect(screen.getByRole("button", { name: "Delete column" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete row" })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete column" }));

    await waitFor(() =>
      expect(tableRows()).toEqual([
        ["A", "C"],
        ["1", "3"],
        ["4", "6"]
      ])
    );
    expect(container.querySelector(".ProseMirror .selectedCell")).not.toBeInTheDocument();

    fireEvent.mouseMove(screen.getByRole("cell", { name: "4" }));

    expect(screen.queryByRole("button", { name: "Delete column" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete row" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete row" }));

    await waitFor(() =>
      expect(tableRows()).toEqual([
        ["A", "C"],
        ["1", "3"]
      ])
    );
    expect(container.querySelector(".ProseMirror .selectedCell")).not.toBeInTheDocument();
  });

  it("deletes a whole table from the visual controls", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, editor, view } = await renderEditor(initialTable);

    expect(container.querySelector(".ProseMirror table")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete table" }));

    await waitFor(() => expect(container.querySelector(".ProseMirror table")).not.toBeInTheDocument());
    typeText(view, "After table");

    expect(container.querySelector(".ProseMirror")).toHaveTextContent("After table");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("After table\n");
    await settleMarkdownListener();
  });

  it("keeps a table when right-clicking the delete table control", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, editor, view } = await renderEditor(initialTable);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdownBeforeRightClick = serializeMarkdown(view.state.doc);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete table" }), { button: 2 });

    expect(container.querySelector(".ProseMirror table")).toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc)).toBe(markdownBeforeRightClick);
    await settleMarkdownListener();
  });

  it("keeps a table when ctrl-clicking the delete table control", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, editor, view } = await renderEditor(initialTable);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdownBeforeContextClick = serializeMarkdown(view.state.doc);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete table" }), { button: 0, ctrlKey: true });

    expect(container.querySelector(".ProseMirror table")).toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc)).toBe(markdownBeforeContextClick);
    await settleMarkdownListener();
  });

  it("places the row delete control at the hovered row right edge", async () => {
    const initialTable = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const { container } = await renderEditor(initialTable);
    const wrapper = container.querySelector<HTMLElement>(".ProseMirror .markra-table-controls-wrapper");
    const row = container.querySelector<HTMLTableRowElement>(".ProseMirror table tr:nth-child(2)");
    const cell = screen.getByRole("cell", { name: "1" });

    expect(wrapper).not.toBeNull();
    expect(row).not.toBeNull();

    wrapper!.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 20,
          top: 10,
          right: 260,
          bottom: 90,
          width: 240,
          height: 80,
          x: 20,
          y: 10,
          toJSON: () => ({})
        }) as DOMRect
    );
    row!.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 20,
          top: 50,
          right: 220,
          bottom: 90,
          width: 200,
          height: 40,
          x: 20,
          y: 50,
          toJSON: () => ({})
        }) as DOMRect
    );
    cell.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 20,
          top: 50,
          right: 120,
          bottom: 90,
          width: 100,
          height: 40,
          x: 20,
          y: 50,
          toJSON: () => ({})
        }) as DOMRect
    );

    fireEvent.mouseMove(cell);

    expect(screen.getByRole("button", { name: "Delete row" })).toHaveStyle({
      left: "200px",
      top: "60px"
    });
  });

  it("aligns the whole table from the top-left controls", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { editor, view } = await renderEditor(initialTable);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    fireEvent.mouseDown(screen.getByRole("button", { name: "Align table center" }));

    expect(serializeMarkdown(view.state.doc)).toMatch(/\| :---+: \| :---+: \|/u);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Align table right" }));

    expect(serializeMarkdown(view.state.doc)).toMatch(/\| ---+: \| ---+: \|/u);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Align table left" }));

    expect(serializeMarkdown(view.state.doc)).toMatch(/\| :---+ \| :---+ \|/u);
    expect(screen.getByRole("button", { name: "Align table left" })).toHaveAttribute("aria-pressed", "true");
  });

  it("defaults tables to auto column width and persists toggled width mode for the current document", async () => {
    window.localStorage.clear();

    const initialTable = [
      "| Short | Long value |",
      "| --- | --- |",
      "| A | Content with enough words to need a wider column |"
    ].join("\n");
    const firstRender = await renderEditor(initialTable, { documentPath: "/vault/current.md" });
    const wrapper = () => firstRender.container.querySelector(".ProseMirror .markra-table-controls-wrapper");
    const table = () => firstRender.container.querySelector(".ProseMirror table");

    expect(wrapper()).toHaveAttribute("data-width-mode", "auto");
    expect(table()).toHaveAttribute("data-width-mode", "auto");
    expect(table()).toHaveClass("markra-table-width-auto");
    const columns = Array.from(table()?.querySelectorAll("col") ?? []);
    expect(columns).toHaveLength(2);
    expect(columns[0]?.style.width).not.toBe(columns[1]?.style.width);
    expect(table()).not.toHaveStyle({
      display: "inline-table",
      width: "auto"
    });
    expect(screen.getByRole("button", { name: tableColumnWidthModeLabel })).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseDown(screen.getByRole("button", { name: tableColumnWidthModeLabel }));

    expect(wrapper()).toHaveAttribute("data-width-mode", "even");
    expect(table()).toHaveAttribute("data-width-mode", "even");
    expect(table()).not.toHaveClass("markra-table-width-auto");
    expect(table()?.querySelectorAll("col")).toHaveLength(0);
    expect(screen.getByRole("button", { name: tableColumnWidthModeLabel })).toHaveAttribute("aria-pressed", "false");

    firstRender.unmount();

    const secondRender = await renderEditor(initialTable, { documentPath: "/vault/current.md" });
    expect(secondRender.container.querySelector(".ProseMirror table")).not.toHaveClass("markra-table-width-auto");

    fireEvent.mouseDown(screen.getByRole("button", { name: tableColumnWidthModeLabel }));

    const autoTable = secondRender.container.querySelector<HTMLTableElement>(".ProseMirror table");
    expect(secondRender.container.querySelector(".ProseMirror .markra-table-controls-wrapper")).toHaveAttribute(
      "data-width-mode",
      "auto"
    );
    expect(autoTable).toHaveClass("markra-table-width-auto");
    expect(autoTable?.querySelectorAll("col")).toHaveLength(2);
    expect(autoTable?.style.display).toBe("");
    expect(autoTable?.style.tableLayout).toBe("");
    expect(autoTable?.style.width).toBe("");
    window.localStorage.clear();
  });

  it("uses the editor default table column width mode when a table has no saved mode", async () => {
    window.localStorage.clear();

    const initialTable = ["| Short | Longer value |", "| --- | --- |", "| A | Content with more text |"].join("\n");
    const { container } = await renderEditor(initialTable, {
      documentPath: "/vault/default-auto-width.md",
      tableColumnWidthMode: "auto"
    });
    const wrapper = container.querySelector(".ProseMirror .markra-table-controls-wrapper");
    const table = container.querySelector(".ProseMirror table");

    expect(wrapper).toHaveAttribute("data-width-mode", "auto");
    expect(table).toHaveAttribute("data-width-mode", "auto");
    expect(table).toHaveClass("markra-table-width-auto");
    expect(table?.querySelectorAll("col")).toHaveLength(2);
    expect(screen.getByRole("button", { name: tableColumnWidthModeLabel })).toHaveAttribute("aria-pressed", "true");

    window.localStorage.clear();
  });

  it("persists table column width mode at document level when tables are inserted before a saved table", async () => {
    window.localStorage.clear();

    const tableMarkdown = ["| Short | Long value |", "| --- | --- |", "| A | Content |"].join("\n");
    const firstRender = await renderEditor([tableMarkdown, "", tableMarkdown].join("\n"), {
      documentPath: "/vault/current.md"
    });
    const tables = firstRender.container.querySelectorAll(".ProseMirror table");
    const buttons = screen.getAllByRole("button", { name: tableColumnWidthModeLabel });

    expect(tables[0]).toHaveClass("markra-table-width-auto");
    expect(tables[1]).toHaveClass("markra-table-width-auto");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseDown(buttons[1]);
    expect(tables[0]).not.toHaveClass("markra-table-width-auto");
    expect(tables[1]).not.toHaveClass("markra-table-width-auto");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    firstRender.unmount();

    const insertedTable = ["| Inserted | Table |", "| --- | --- |", "| Before | Saved content |"].join("\n");
    const secondRender = await renderEditor([insertedTable, "", tableMarkdown, "", tableMarkdown].join("\n"), {
      documentPath: "/vault/current.md"
    });
    const restoredTables = secondRender.container.querySelectorAll(".ProseMirror table");

    expect(restoredTables[0]).not.toHaveClass("markra-table-width-auto");
    expect(restoredTables[1]).not.toHaveClass("markra-table-width-auto");
    expect(restoredTables[2]).not.toHaveClass("markra-table-width-auto");

    window.localStorage.clear();
  });

  it("keeps document-level table column width mode sync after an untitled document is saved", async () => {
    window.localStorage.clear();

    const tableMarkdown = ["| Short | Long value |", "| --- | --- |", "| A | Content |"].join("\n");
    const initialContent = [tableMarkdown, "", tableMarkdown].join("\n");
    const firstRender = await renderEditor(initialContent, { documentPath: null });

    firstRender.rerender(
      <MarkdownPaper
        documentPath="/vault/saved.md"
        initialContent={initialContent}
        onEditorReady={() => {}}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const buttons = screen.getAllByRole("button", { name: tableColumnWidthModeLabel });
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseDown(buttons[1]);

    const tables = firstRender.container.querySelectorAll(".ProseMirror table");
    expect(tables[0]).not.toHaveClass("markra-table-width-auto");
    expect(tables[1]).not.toHaveClass("markra-table-width-auto");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");

    window.localStorage.clear();
  });

  it("supports keyboard activation for table column width mode", async () => {
    window.localStorage.clear();

    const initialTable = ["| Short | Long value |", "| --- | --- |", "| A | Content |"].join("\n");
    const { container } = await renderEditor(initialTable, { documentPath: "/vault/keyboard-width.md" });
    const button = screen.getByRole("button", { name: tableColumnWidthModeLabel });
    const table = container.querySelector(".ProseMirror table");

    expect(table).toHaveClass("markra-table-width-auto");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(button, { key: " " });

    expect(table).not.toHaveClass("markra-table-width-auto");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(button, { key: "Enter" });

    expect(table).toHaveClass("markra-table-width-auto");
    expect(button).toHaveAttribute("aria-pressed", "true");

    window.localStorage.clear();
  });

  it("keeps table alignment controls independent from auto-width mode", async () => {
    window.localStorage.clear();

    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, editor, view } = await renderEditor(initialTable, { documentPath: "/vault/aligned-width.md" });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    fireEvent.mouseDown(screen.getByRole("button", { name: "Align table center" }));

    expect(container.querySelector(".ProseMirror .markra-table-controls-wrapper")).toHaveAttribute(
      "data-width-mode",
      "auto"
    );
    expect(container.querySelector(".ProseMirror .markra-table-controls-wrapper")).toHaveAttribute(
      "data-table-alignment",
      "center"
    );
    expect(container.querySelector(".ProseMirror table")).toHaveClass("markra-table-width-auto");
    expect(screen.getByRole("button", { name: "Align table center" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: tableColumnWidthModeLabel })).toHaveAttribute("aria-pressed", "true");
    expect(serializeMarkdown(view.state.doc)).toMatch(/\| :---+: \| :---+: \|/u);

    window.localStorage.clear();
  });

  it("resizes a table from the top-left size picker", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    const { container, view } = await renderEditor(initialTable);
    const tableRows = () =>
      Array.from(container.querySelectorAll(".ProseMirror table tr")).map((row) =>
        Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent)
      );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Adjust table" }));

    const resizeOption = screen.getByRole("button", { name: "Resize table to 3 columns by 4 rows" });
    fireEvent.mouseEnter(resizeOption);

    expect(screen.getByLabelText("Table columns")).toHaveValue(3);
    expect(screen.getByLabelText("Table rows")).toHaveValue(4);

    fireEvent.mouseDown(resizeOption);

    await waitFor(() =>
      expect(tableRows()).toEqual([
        ["Field", "Value", ""],
        ["Name", "Markra", ""],
        ["", "", ""],
        ["", "", ""]
      ])
    );
    expect(container.querySelector(".ProseMirror .selectedCell")).not.toBeInTheDocument();

    typeText(view, "New cell");

    await waitFor(() =>
      expect(tableRows()).toEqual([
        ["Field", "Value", ""],
        ["Name", "Markra", ""],
        ["", "", ""],
        ["", "", "New cell"]
      ])
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Adjust table" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Resize table to 2 columns by 2 rows" }));

    await waitFor(() =>
      expect(tableRows()).toEqual([
        ["Field", "Value"],
        ["Name", "Markra"]
      ])
    );
  });

  it("renders the table size picker outside the table wrapper", async () => {
    const initialTable = ["| Field | Value |", "| --- | --- |", "| Name | Markra |"].join("\n");
    await renderEditor(initialTable);
    const restoreInnerHeight = window.innerHeight;
    const restoreInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });

    const sizeButton = screen.getByRole("button", { name: "Adjust table" });
    vi.spyOn(sizeButton, "getBoundingClientRect").mockReturnValue({
      bottom: 72,
      height: 24,
      left: 48,
      right: 72,
      top: 48,
      width: 24,
      x: 48,
      y: 48,
      toJSON: () => ({})
    });

    fireEvent.mouseDown(sizeButton);

    const popover = document.querySelector<HTMLElement>(".markra-table-size-popover");
    expect(popover).not.toBeNull();
    expect(popover?.parentElement).toBe(document.body);
    expect(popover).toHaveStyle({
      left: "48px",
      maxHeight: "552px",
      overflowY: "auto",
      position: "fixed",
      top: "80px"
    });

    Object.defineProperty(window, "innerHeight", { configurable: true, value: restoreInnerHeight });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: restoreInnerWidth });
  });

  it("renders AI replacement comparison inside the editor", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const to = from + "Original".length;

    showAiEditorPreview(view, {
      from,
      original: "Original",
      replacement: "Improved",
      to,
      type: "replace"
    });

    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Original");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toHaveClass("markra-ai-preview-actions-quiet");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-apply")).toHaveAccessibleName("Apply");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-apply svg")).toBeInTheDocument();

    clearAiEditorPreview(view);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();
  });

  it("shows AI preview impact scope for selected text", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const to = from + "Original".length;

    showAiEditorPreview(view, {
      from,
      original: "Original",
      replacement: "Improved",
      to,
      type: "replace"
    });

    const scope = container.querySelector(".ProseMirror .markra-ai-preview-scope");
    const toolbar = scope?.closest(".markra-ai-preview-actions");
    const widget = container.querySelector(".ProseMirror .markra-ai-preview-widget");

    expect(scope).toHaveTextContent("Replace selection");
    expect(scope).toHaveTextContent("8 chars");
    expect(toolbar).toHaveClass("markra-ai-preview-actions-quiet");
    expect(widget?.firstElementChild).toHaveClass("markra-ai-preview-insert");
  });

  it("shows AI preview impact scope for whole-document replacements", async () => {
    const { container, view } = await renderEditor("Original text");

    showAiEditorPreview(view, {
      from: 0,
      original: "Original text",
      replacement: "Focused note",
      to: view.state.doc.content.size,
      type: "replace"
    });

    const scope = container.querySelector(".ProseMirror .markra-ai-preview-scope");

    expect(scope).toHaveTextContent("Replace entire document");
    expect(scope).toHaveTextContent("13 chars");
  });

  it("shows AI preview target details for table replacements", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const to = from + "Original".length;

    showAiEditorPreview(view, {
      from,
      original: "Original",
      replacement: "Improved",
      target: {
        from,
        id: "table:0",
        kind: "table",
        title: "Cost impact",
        to
      },
      to,
      type: "replace"
    });

    const scope = container.querySelector(".ProseMirror .markra-ai-preview-scope");

    expect(scope).toHaveTextContent("table: Cost impact");
  });

  it("updates an existing AI replacement preview when streaming text grows", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const to = from + "Original".length;

    showAiEditorPreview(view, {
      from,
      original: "Original",
      replacement: "I",
      to,
      type: "replace"
    });
    showAiEditorPreview(view, {
      from,
      original: "Original",
      replacement: "Improved",
      to,
      type: "replace"
    });

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");

    clearAiEditorPreview(view);
  });

  it("scrolls to a pending AI preview on request", async () => {
    const { view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };

    showAiEditorPreview(view, result);
    const dispatchSpy = vi.spyOn(view, "dispatch");
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      expect(scrollAiEditorPreviewIntoView(view, result)).toBe(true);

      const scrollTransaction = dispatchSpy.mock.calls[0]?.[0];
      expect(scrollTransaction?.scrolledIntoView).toBe(true);
      expect(scrollTransaction?.selection.from).toBe(result.to);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        inline: "nearest"
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }

    dispatchSpy.mockRestore();
    clearAiEditorPreview(view);
  });

  it("shows inline success feedback when copying an AI suggestion", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");

    showAiEditorPreview(
      view,
      {
        from,
        original: "Original",
        replacement: "Improved",
        to: from + "Original".length,
        type: "replace"
      },
      {
        apply: "Apply",
        copied: "Copied",
        copy: "Copy",
        reject: "Reject"
      }
    );

    container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-copy")?.click();

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-copy")).toHaveAccessibleName("Copied");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-copy")).toHaveAttribute("data-copied", "true");

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("does not let markdown replacement preview inherit heading styling", async () => {
    const { container, view } = await renderEditor("> Original quote\n\n## Existing heading");
    const from = findTextPosition(view, "Original quote");
    const to = from + "Original quote".length;

    showAiEditorPreview(view, {
      from,
      original: "Original quote",
      replacement: "> Improved quote",
      to,
      type: "replace"
    });

    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");

    expect(insertedPreview).toHaveTextContent("> Improved quote");
    expect(insertedPreview?.closest("h1,h2,h3,h4,h5,h6")).toBeNull();
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();
  });

  it("appends AI replacement preview after the original text inside a selected block", async () => {
    const { container, view } = await renderEditor("> First quote\n>\n> Second quote\n\n## Existing heading");
    const from = findTextPosition(view, "First quote");
    const to = findNodeEndPosition(view, "blockquote");

    showAiEditorPreview(view, {
      from,
      original: "First quote\n\nSecond quote",
      replacement: "Improved quote",
      to,
      type: "replace"
    });

    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");

    expect(insertedPreview).toHaveTextContent("Improved quote");
    expect(insertedPreview?.closest("blockquote")).toBeInTheDocument();
    expect(insertedPreview?.closest("h1,h2,h3,h4,h5,h6")).toBeNull();
  });

  it("keeps AI replacement preview inside the current heading block", async () => {
    const { container, view } = await renderEditor("# Original title\n\nBody");
    const from = findTextPosition(view, "Original title");
    const to = from + "Original title".length;

    showAiEditorPreview(view, {
      from,
      original: "Original title",
      replacement: "Improved title",
      to,
      type: "replace"
    });

    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");

    expect(insertedPreview).toHaveTextContent("Improved title");
    expect(insertedPreview?.closest("h1")).toBeInTheDocument();

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("keeps multiline markdown replacement preview out of the current heading block", async () => {
    const { container, view } = await renderEditor("# Original title\n\nBody");
    const from = findTextPosition(view, "Original title");
    const to = from + "Original title".length;

    showAiEditorPreview(view, {
      from,
      original: "Original title",
      replacement: "# Improved title\n\nVersion: v1\n\nBody paragraph.",
      to,
      type: "replace"
    });

    const previewWidget = container.querySelector(".ProseMirror .markra-ai-preview-widget");
    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");

    expect(previewWidget).toHaveClass("markra-ai-preview-widget-block");
    expect(insertedPreview).toHaveTextContent("# Improved title");
    expect(insertedPreview).toHaveTextContent("Body paragraph.");
    expect(insertedPreview?.closest("h1,h2,h3,h4,h5,h6")).toBeNull();

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("applies multiline markdown replacement as parsed document blocks", async () => {
    const { container, editor, view } = await renderEditor("# Original title\n\nTail");
    const from = findTextPosition(view, "Original title");
    const result = {
      from,
      original: "Original title",
      replacement: "# Improved title\n\nVersion: v1\n\nBody paragraph.",
      to: from + "Original title".length,
      type: "replace" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));

    expect(applyAiEditorResult(view, result, { parseMarkdown })).toBe(true);

    expect(container.querySelector(".ProseMirror h1")).toHaveTextContent("Improved title");
    expect(container.querySelector(".ProseMirror h1")).not.toHaveTextContent("#");
    expect(container.querySelector(".ProseMirror p")).toHaveTextContent("Version: v1");
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Tail");
    expect(view.state.selection.from).toBeLessThanOrEqual(findTextPosition(view, "Tail"));

    await settleMarkdownListener();
  });

  it("previews and applies a full Markdown table replacement from editor table anchors", async () => {
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const { container, editor, view } = await renderEditor(["### Section Alpha", "", table, "", "Tail"].join("\n"));
    const [tableAnchor] = readAiTableAnchorsFromView(view);

    expect(tableAnchor).toEqual(expect.objectContaining({
      id: "table:0",
      kind: "table",
      text: table
    }));
    expect(tableAnchor?.from).toBeGreaterThan(0);
    expect(tableAnchor?.to).toBeGreaterThan(tableAnchor?.from ?? 0);

    const result = {
      from: tableAnchor?.from,
      original: tableAnchor?.text ?? table,
      replacement,
      to: tableAnchor?.to,
      type: "replace" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    showAiEditorPreview(view, result, undefined, { parseMarkdown });

    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");
    expect(insertedPreview).toHaveTextContent("new-token");
    expect(insertedPreview?.querySelector("table")).toBeInTheDocument();
    expect(insertedPreview?.textContent).not.toContain("| Field |");
    expect(insertedPreview?.closest("td,th")).toBeNull();

    expect(applyAiEditorResult(view, result, { parseMarkdown })).toBe(true);
    expect(container.querySelector(".ProseMirror table")).toHaveTextContent("new-token");
    expect(container.querySelector(".ProseMirror table")).not.toHaveTextContent("old-token");

    await settleMarkdownListener();
  });

  it("reads section anchors from editor document positions", async () => {
    const { view } = await renderEditor([
      "# Section Alpha",
      "",
      "Alpha body",
      "",
      "## Section Beta",
      "",
      "Beta body",
      "",
      "# Section Gamma",
      "",
      "Gamma body"
    ].join("\n"));

    const sections = readAiSectionAnchorsFromView(view);

    expect(sections[0]).toEqual(expect.objectContaining({
      from: 0,
      id: "section:0",
      kind: "section",
      text: expect.stringContaining("Alpha body"),
      title: "Section Alpha"
    }));
    expect(sections[0]?.text).toContain("Section Beta");
    expect(sections[0]?.text).not.toContain("Section Gamma");
    expect(sections[1]).toEqual(expect.objectContaining({
      id: "section:1",
      kind: "section",
      text: expect.stringContaining("Beta body"),
      title: "Section Beta"
    }));
    expect(sections[2]).toEqual(expect.objectContaining({
      id: "section:2",
      kind: "section",
      text: expect.stringContaining("Gamma body"),
      title: "Section Gamma"
    }));
    expect(sections[0]?.to).toBe(sections[2]?.from);
  });

  it("keeps an applied block markdown preview cleared when the replacement still contains the original heading text", async () => {
    const { container, editor, view } = await renderEditor("### Section Alpha\n\nOld body\n\nTail");
    const from = findTextPosition(view, "Section Alpha");
    const result = {
      from,
      original: "Section Alpha",
      replacement: [
        "### Section Alpha",
        "",
        "| Field | Variant One | Variant Two |",
        "| ----- | ----------- | ----------- |",
        "| Sync note | None | Needs source token (new-token) |"
      ].join("\n"),
      to: from + "Section Alpha".length,
      type: "replace" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));

    showAiEditorPreview(view, result);
    expect(applyAiEditorResult(view, result, { parseMarkdown })).toBe(true);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    const tailPosition = findTextPosition(view, "Tail", "Tail".length);
    view.dispatch(view.state.tr.insertText(" updated", tailPosition, tailPosition));

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();
    await settleMarkdownListener();
  });

  it("notifies when the user selects text in the editor", async () => {
    const onTextSelectionChange = vi.fn();
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    selectText(view, from, to);

    expect(onTextSelectionChange).toHaveBeenCalledWith({
      from,
      source: "selection",
      text: "Second sentence.",
      to
    });
  });

  it.each([
    ["bold", "b", { metaKey: true }, "strong"],
    ["italic", "i", { metaKey: true }, "em"],
    ["strikethrough", "x", { metaKey: true, shiftKey: true }, "del"],
    ["inline code", "e", { metaKey: true }, "code"]
  ] as const)("notifies when the %s shortcut changes the current text selection", async (_label, key, modifiers, selector) => {
    const onTextSelectionChange = vi.fn();
    const { container, view } = await renderEditor("Format me", { onTextSelectionChange });
    const from = findTextPosition(view, "Format me");
    const to = from + "Format me".length;

    selectText(view, from, to);
    onTextSelectionChange.mockClear();

    expect(pressShortcut(view, key, modifiers)).toBe(true);

    expect(container.querySelector(`.ProseMirror ${selector}`)).toHaveTextContent("Format me");
    expect(onTextSelectionChange).toHaveBeenCalledWith({
      from,
      source: "selection",
      text: "Format me",
      to
    });
  });

  it("waits until pointer text selection settles before notifying selected text", async () => {
    const onTextSelectionChange = vi.fn();
    const selectedDomSelection = {
      isCollapsed: false,
      toString: () => "Second sentence."
    } as Selection;
    const getSelectionSpy = vi.spyOn(document, "getSelection").mockReturnValue(selectedDomSelection);
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    try {
      fireEvent.mouseDown(screen.getByLabelText("Markdown editor"), { button: 0 });
      selectText(view, from, to);

      expect(onTextSelectionChange).not.toHaveBeenCalled();

      fireEvent.mouseUp(screen.getByLabelText("Markdown editor"), { button: 0 });

      await waitFor(() =>
        expect(onTextSelectionChange).toHaveBeenCalledWith({
          from,
          source: "selection",
          text: "Second sentence.",
          to
        })
      );
    } finally {
      getSelectionSpy.mockRestore();
    }
  });

  it("does not notify code block selections as automatic AI selection changes", async () => {
    const onTextSelectionChange = vi.fn();
    const { view } = await renderEditor(["```ts", "const answer = 42;", "```"].join("\n"), {
      onTextSelectionChange
    });
    const from = findTextPosition(view, "const answer");
    const to = from + "const answer = 42;".length;

    onTextSelectionChange.mockClear();
    selectText(view, from, to);

    expect(onTextSelectionChange).not.toHaveBeenCalled();
  });

  it("does not notify transient selections while IME input is composing", async () => {
    const onTextSelectionChange = vi.fn();
    const { view } = await renderEditor("Synthetic IME text.", { onTextSelectionChange });
    const from = findTextPosition(view, "IME");
    const to = from + "IME".length;
    const composingDescriptor = Object.getOwnPropertyDescriptor(view, "composing");

    Object.defineProperty(view, "composing", {
      configurable: true,
      value: true
    });

    try {
      onTextSelectionChange.mockClear();
      selectText(view, from, to);

      expect(onTextSelectionChange).not.toHaveBeenCalled();
    } finally {
      if (composingDescriptor) {
        Object.defineProperty(view, "composing", composingDescriptor);
      } else {
        delete (view as unknown as { composing?: boolean }).composing;
      }
    }
  });

  it("selects the current code block content with Ctrl+A inside the code editor", async () => {
    const source = ["Before", "", "```ts", "const answer = 42;", "return answer;", "```", "", "After"].join("\n");
    const { container, view } = await renderEditor(source);
    const codeContent = container.querySelector<HTMLElement>(".ProseMirror .markra-code-content");

    moveCursor(view, findTextPosition(view, "answer"));

    expect(codeContent).toBeInTheDocument();

    expect(pressShortcut(view, "a", { ctrlKey: true })).toBe(true);

    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "\n")).toBe(
      "const answer = 42;\nreturn answer;"
    );
  });

  it("falls back to the current text block when the editor text selection is cleared", async () => {
    const onTextSelectionChange = vi.fn();
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    view.focus();
    selectText(view, from, to);
    moveCursor(view, from);

    expect(onTextSelectionChange).toHaveBeenLastCalledWith({
      cursor: from,
      from: 1,
      source: "block",
      text: "First sentence. Second sentence.",
      to: "First sentence. Second sentence.".length + 1
    });
  });

  it("keeps the active text selection when focus moves out of the editor", async () => {
    const onTextSelectionChange = vi.fn();
    const outsideInput = document.createElement("textarea");
    document.body.append(outsideInput);
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    view.focus();
    selectText(view, from, to);
    outsideInput.focus();
    moveCursor(view, to);

    expect(onTextSelectionChange).not.toHaveBeenLastCalledWith(null);
    outsideInput.remove();
  });

  it("clears a stale text selection after an editor click leaves only a collapsed DOM selection", async () => {
    const onTextSelectionChange = vi.fn();
    const collapsedDomSelection = {
      isCollapsed: true,
      toString: () => ""
    } as Selection;
    const getSelectionSpy = vi.spyOn(document, "getSelection").mockReturnValue(collapsedDomSelection);
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    try {
      selectText(view, from, to);
      onTextSelectionChange.mockClear();
      fireEvent.mouseUp(view.dom);

      await waitFor(() => expect(onTextSelectionChange).toHaveBeenCalledWith(null));
    } finally {
      getSelectionSpy.mockRestore();
    }
  });

  it("clears a stale text selection after clicking the paper blank area outside the editor root", async () => {
    const onTextSelectionChange = vi.fn();
    const collapsedDomSelection = {
      isCollapsed: true,
      toString: () => ""
    } as Selection;
    const getSelectionSpy = vi.spyOn(document, "getSelection").mockReturnValue(collapsedDomSelection);
    const { view } = await renderEditor("First sentence. Second sentence.", { onTextSelectionChange });
    const from = findTextPosition(view, "Second");
    const to = from + "Second sentence.".length;

    try {
      selectText(view, from, to);
      onTextSelectionChange.mockClear();
      fireEvent.mouseUp(screen.getByLabelText("Markdown editor"));

      await waitFor(() => expect(onTextSelectionChange).toHaveBeenCalledWith(null));
    } finally {
      getSelectionSpy.mockRestore();
    }
  });

  it("uses the current text block as AI context when no text is selected", async () => {
    const { view } = await renderEditor("# Title\n\nFirst paragraph.\n\nSecond paragraph.");
    const from = findTextPosition(view, "First paragraph.");
    const to = from + "First paragraph.".length;

    moveCursor(view, findTextPosition(view, "paragraph", 2));

    expect(readAiSelectionContextFromView(view)).toEqual({
      cursor: findTextPosition(view, "paragraph", 2),
      from,
      source: "block",
      text: "First paragraph.",
      to
    });
    await settleMarkdownListener();
  });

  it("reports the current text block through the selection callback when only the cursor moves", async () => {
    const onTextSelectionChange = vi.fn();
    const { view } = await renderEditor("# Title\n\nFirst paragraph.\n\nSecond paragraph.", { onTextSelectionChange });

    view.focus();
    moveCursor(view, findTextPosition(view, "paragraph", 2));

    expect(onTextSelectionChange).toHaveBeenLastCalledWith({
      cursor: findTextPosition(view, "paragraph", 2),
      from: findTextPosition(view, "First paragraph."),
      source: "block",
      text: "First paragraph.",
      to: findTextPosition(view, "First paragraph.") + "First paragraph.".length
    });
    await settleMarkdownListener();
  });

  it("restores the pending AI comparison when undoing an applied suggestion", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };

    showAiEditorPreview(view, result);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");

    expect(applyAiEditorResult(view, result)).toBe(true);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Improved text");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Original");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Original");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("restores the pending AI comparison in a heading after undoing an applied suggestion", async () => {
    const { container, view } = await renderEditor("# Original title\n\nBody");
    const from = findTextPosition(view, "Original title");
    const result = {
      from,
      original: "Original title",
      replacement: "Improved title",
      to: from + "Original title".length,
      type: "replace" as const
    };

    showAiEditorPreview(view, result);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved title");

    expect(applyAiEditorResult(view, result)).toBe(true);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    const insertedPreview = container.querySelector(".ProseMirror .markra-ai-preview-insert");

    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Original title");
    expect(insertedPreview).toHaveTextContent("Improved title");
    expect(insertedPreview?.closest("h1")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("notifies the app when undo restores an applied AI comparison", async () => {
    const { view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onRestore = vi.fn();

    window.addEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);

    showAiEditorPreview(view, result);
    expect(applyAiEditorResult(view, result)).toBe(true);
    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          result
        })
      })
    );

    window.removeEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("keeps an AI selection highlight visible after the editor loses its native selection", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const selection = {
      from,
      text: "Original",
      to: from + "Original".length
    };

    showAiSelectionHold(view, selection);
    expect(container.querySelector(".ProseMirror .markra-ai-selection-hold")).toHaveTextContent("Original");

    moveCursor(view, selection.to);

    expect(container.querySelector(".ProseMirror .markra-ai-selection-hold")).toHaveTextContent("Original");

    clearAiSelectionHold(view);

    expect(container.querySelector(".ProseMirror .markra-ai-selection-hold")).not.toBeInTheDocument();
    await settleMarkdownListener();
  });

  it("keeps multi-line AI selection highlights scoped to text inside list items", async () => {
    const { container, view } = await renderEditor(["- First item", "- Second item", "- Third item"].join("\n"));
    const from = findTextPosition(view, "First item");
    const to = findTextPosition(view, "Third item", "Third item".length);

    showAiSelectionHold(view, {
      from,
      text: ["First item", "Second item", "Third item"].join("\n"),
      to
    });

    const holds = Array.from(container.querySelectorAll(".ProseMirror .markra-ai-selection-hold"));
    expect(holds.map((element) => element.textContent)).toEqual(["First item", "Second item", "Third item"]);
    expect(holds.every((element) => element.closest("li"))).toBe(true);

    clearAiSelectionHold(view);
    await settleMarkdownListener();
  });

  it("can apply a restored AI comparison and undo it back to pending again", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") applyAiEditorResult(view, detail.result, { previewId: detail.previewId });
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);

    showAiEditorPreview(view, result);
    expect(applyAiEditorResult(view, result)).toBe(true);
    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply")?.click();

    expect(onPreviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          action: "apply",
          result
        })
      })
    );
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Improved text");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Original");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("clears a stale pending preview after the applied result is confirmed", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };

    showAiEditorPreview(view, result);
    expect(applyAiEditorResult(view, result)).toBe(true);

    showAiEditorPreview(view, result);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");

    confirmAiEditorResultApplied(view, result);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("dispatches an applied acknowledgement when an AI preview is applied", async () => {
    const { view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onApplied = vi.fn((event: Event) => (event as CustomEvent<AiEditorPreviewAppliedDetail>).detail);

    window.addEventListener(AI_EDITOR_PREVIEW_APPLIED_EVENT, onApplied);
    showAiEditorPreview(view, result);

    expect(applyAiEditorResult(view, result)).toBe(true);

    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        result
      })
    }));

    window.removeEventListener(AI_EDITOR_PREVIEW_APPLIED_EVENT, onApplied);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("logs preview queue details when a block insert preview is applied", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { view } = await renderEditor("# Alpha\n\nBody");
    const afterAlpha = findTextPosition(view, "Alpha") + "Alpha".length;
    const result = {
      from: afterAlpha,
      original: "",
      replacement: "\n\n## Follow-up\n\nGenerated block.",
      to: afterAlpha,
      type: "insert" as const
    };

    showAiEditorPreview(view, result, undefined, { previewId: "follow-up-preview" });
    expect(applyAiEditorResult(view, result, { previewId: "follow-up-preview" })).toBe(true);

    expect(debugSpy.mock.calls).toEqual(expect.arrayContaining([
      [
        "[markra-ai-preview] plugin apply meta",
        expect.objectContaining({
          appliedPreviewId: "follow-up-preview",
          pendingCount: 0
        })
      ]
    ]));

    debugSpy.mockRestore();
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("keeps AI preview actions clickable after mousedown inside the editor widget", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") applyAiEditorResult(view, detail.result, { previewId: detail.previewId });
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, result);

    const applyButton = container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply");
    expect(applyButton).toBeInTheDocument();

    applyButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    applyButton?.click();

    expect(onPreviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          action: "apply",
          result
        })
      })
    );
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Improved text");

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("applies an AI preview action directly on pointerdown for editor widgets", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") applyAiEditorResult(view, detail.result, { previewId: detail.previewId });
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, result);

    const applyButton = container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply");
    expect(applyButton).toBeInTheDocument();

    applyButton?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));

    expect(onPreviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          action: "apply",
          result
        })
      })
    );
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Improved text");

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("clears a parsed heading replacement preview after applying from the widget", async () => {
    const { container, editor, view } = await renderEditor("## Pull img\n\nBody");
    const from = findTextPosition(view, "Pull img");
    const result = {
      from,
      original: "Pull img",
      replacement: "# Pull img",
      target: {
        from: 0,
        id: "current-context",
        kind: "current_block" as const,
        title: "Pull img",
        to: "## Pull img".length
      },
      to: from + "Pull img".length,
      type: "replace" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") {
        applyAiEditorResult(view, detail.result, {
          parseMarkdown,
          previewId: detail.previewId
        });
      }
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, result, undefined, { parseMarkdown, previewId: "tool-heading" });

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Pull img");

    container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply")?.click();

    expect(container.querySelector(".ProseMirror h1")).toHaveTextContent("Pull img");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);
    expect(container.querySelector(".ProseMirror h2")).toHaveTextContent("Pull img");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Pull img");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Pull img");

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("marks the AI preview apply action busy and prevents repeated dispatches", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };
    const onPreviewAction = vi.fn();

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, result);

    const applyButton = container.querySelector<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply");
    expect(applyButton).toBeInTheDocument();

    applyButton?.click();
    applyButton?.click();

    expect(onPreviewAction).toHaveBeenCalledTimes(1);
    expect(applyButton).toBeDisabled();
    expect(applyButton).toHaveAttribute("aria-busy", "true");
    expect(applyButton).toHaveClass("markra-ai-preview-applying");
    expect(applyButton?.querySelector(".markra-ai-preview-spinner")).toBeInTheDocument();

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("keeps remaining AI previews visible after applying one of multiple insertions", async () => {
    const { container, view } = await renderEditor("# Alpha\n\nBeta");
    const afterAlpha = findTextPosition(view, "Alpha") + "Alpha".length;
    const beforeBeta = findTextPosition(view, "Beta");
    const firstResult = {
      from: afterAlpha,
      original: "",
      replacement: "\n\n## Intro",
      to: afterAlpha,
      type: "insert" as const
    };
    const secondResult = {
      from: beforeBeta,
      original: "",
      replacement: "## Summary\n\n",
      to: beforeBeta,
      type: "insert" as const
    };
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") applyAiEditorResult(view, detail.result, { previewId: detail.previewId });
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, firstResult);
    showAiEditorPreview(view, secondResult);

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(2);

    const applyButtons = container.querySelectorAll<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply");
    expect(applyButtons).toHaveLength(2);

    applyButtons[0]?.click();

    expect(onPreviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          action: "apply",
          result: firstResult
        })
      })
    );
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(1);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("## Summary");
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Intro");

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("keeps separate AI insert previews at the same position when preview ids differ", async () => {
    const { container, view } = await renderEditor("# Alpha");
    const documentEnd = view.state.doc.content.size;
    const firstResult = {
      from: documentEnd,
      original: "",
      replacement: "\n\n## Intro",
      to: documentEnd,
      type: "insert" as const
    };
    const secondResult = {
      from: documentEnd,
      original: "",
      replacement: "\n\n## Summary",
      to: documentEnd,
      type: "insert" as const
    };

    showAiEditorPreview(view, firstResult, undefined, { previewId: "intro-preview" });
    showAiEditorPreview(view, secondResult, undefined, { previewId: "summary-preview" });

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(2);
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Intro");
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Summary");

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("applies identical insert previews independently when their preview ids differ", async () => {
    const { container, view } = await renderEditor("# Alpha");
    const documentEnd = view.state.doc.content.size;
    const sharedResult = {
      from: documentEnd,
      original: "",
      replacement: "\n\n## Follow-up",
      to: documentEnd,
      type: "insert" as const
    };
    const onPreviewAction = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<AiEditorPreviewActionDetail>).detail;
      if (detail.action === "apply") applyAiEditorResult(view, detail.result, { previewId: detail.previewId });
    });

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    showAiEditorPreview(view, sharedResult, undefined, { previewId: "follow-up-a" });
    showAiEditorPreview(view, sharedResult, undefined, { previewId: "follow-up-b" });

    const applyButtons = container.querySelectorAll<HTMLButtonElement>(".ProseMirror .markra-ai-preview-apply");
    expect(applyButtons).toHaveLength(2);

    applyButtons[0]?.click();

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(1);
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Follow-up");

    applyButtons[1]?.click();

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(0);
    expect((container.querySelector(".ProseMirror")?.textContent?.match(/Follow-up/g) ?? []).length).toBe(2);

    window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, onPreviewAction);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("does not restore a block insert preview after later document changes", async () => {
    const { container, view } = await renderEditor("# Alpha\n\nBody");
    const afterAlpha = findTextPosition(view, "Alpha") + "Alpha".length;
    const result = {
      from: afterAlpha,
      original: "",
      replacement: "\n\n## Follow-up\n\nGenerated block.",
      to: afterAlpha,
      type: "insert" as const
    };

    showAiEditorPreview(view, result, undefined, { previewId: "follow-up-preview" });
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(1);

    expect(applyAiEditorResult(view, result, { previewId: "follow-up-preview" })).toBe(true);
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(0);

    view.dispatch(view.state.tr.insertText(" ", view.state.doc.content.size, view.state.doc.content.size));

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(0);

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("does not restore a parsed Markdown block insert preview after applying it", async () => {
    const { container, editor, view } = await renderEditor("# Alpha\n\nBody");
    const documentEnd = view.state.doc.content.size;
    const result = {
      from: documentEnd,
      original: "",
      replacement: [
        "## Summary",
        "",
        "`vue3-lazyload` is a lightweight image lazy-loading plugin for Vue 3 with these strengths:",
        "",
        "- **No runtime dependencies**: No extra bundle weight",
        "- **TypeScript support**: Ships complete type definitions",
        "- **Multiple usage modes**: Supports directives and components"
      ].join("\n"),
      to: documentEnd,
      type: "insert" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));

    showAiEditorPreview(view, result, undefined, { parseMarkdown, previewId: "tool-call-7" });
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(1);

    expect(applyAiEditorResult(view, result, { parseMarkdown, previewId: "tool-call-7" })).toBe(true);

    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(0);
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("vue3-lazyload");
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("No runtime dependencies");

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("does not restore a parsed Markdown block insert preview with leading whitespace in the middle of a document", async () => {
    const { container, editor, view } = await renderEditor([
      "# Alpha",
      "",
      "Intro paragraph.",
      "",
      "## Existing Section",
      "",
      "The original body stays after the insertion point."
    ].join("\n"));
    const afterIntro = findTextPosition(view, "Intro paragraph.") + "Intro paragraph.".length;
    const result = {
      from: afterIntro,
      original: "",
      replacement: [
        "",
        "## 测试标题",
        "",
        "甲甲**乙乙**丙丙。",
        "",
        "### 测试小节",
        "- **项目**：占位条目。"
      ].join("\n"),
      to: afterIntro,
      type: "insert" as const
    };
    const parseMarkdown = editor.action((ctx) => ctx.get(parserCtx));
    const onRestore = vi.fn();

    window.addEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
    showAiEditorPreview(view, result, undefined, { parseMarkdown, previewId: "tool-call-leading-space" });
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(1);

    expect(applyAiEditorResult(view, result, { parseMarkdown, previewId: "tool-call-leading-space" })).toBe(true);

    expect(onRestore).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".ProseMirror .markra-ai-preview-insert")).toHaveLength(0);
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("测试标题");
    expect(container.querySelector(".ProseMirror")?.textContent).toContain("Existing Section");

    window.removeEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, onRestore);
    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("can reject an AI comparison and undo it back to pending again", async () => {
    const { container, view } = await renderEditor("Original text");
    const from = findTextPosition(view, "Original");
    const result = {
      from,
      original: "Original",
      replacement: "Improved",
      to: from + "Original".length,
      type: "replace" as const
    };

    showAiEditorPreview(view, result);
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");

    clearAiEditorPreview(view);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).not.toBeInTheDocument();

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror .markra-ai-preview-delete")).toHaveTextContent("Original");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-insert")).toHaveTextContent("Improved");
    expect(container.querySelector(".ProseMirror .markra-ai-preview-actions")).toBeInTheDocument();

    clearAiEditorPreview(view);
    await settleMarkdownListener();
  });

  it("turns typed strong markdown into bold text", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "**a**");

    expectLiveMark(container, "strong", "a");
    expectMarkdownDelimiters(container, 2);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("**a**");

    expect(pressEnter(view)).toBe(true);

    const strong = container.querySelector(".ProseMirror strong");
    expect(strong).toHaveTextContent("a");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("a");
    await settleMarkdownListener();
  });

  it("keeps intraword underscores in identifiers as plain text", async () => {
    const { container, view } = await renderEditor("user_info_data user__meta__data");

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("user_info_data user__meta__data");
    expect(container.querySelector(".ProseMirror .markra-live-mark-emphasis")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-live-mark-strong")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(container, 0);

    moveCursor(view, findTextPosition(view, "user__meta__data", "user__meta__data".length));
    typeText(view, " mock_value_name mock__token__name");

    expect(container.querySelector(".ProseMirror")?.textContent).toBe(
      "user_info_data user__meta__data mock_value_name mock__token__name"
    );
    expect(container.querySelector(".ProseMirror .markra-live-mark-emphasis")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror .markra-live-mark-strong")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(container, 0);
    await settleMarkdownListener();
  });

  it("keeps escaped literal asterisks between inline code visible", async () => {
    const source = "`n!`/`(n1!` \\* `n2!` \\* ... \\* `nk!`)";
    const { container } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("n!/(n1! * n2! * ... * nk!)");
    expect(container.querySelectorAll(".ProseMirror code")).toHaveLength(4);
    expect(container.querySelector(".ProseMirror .markra-live-mark-emphasis")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(container, 0);
    await settleMarkdownListener();
  });

  it("keeps escaped literal markdown delimiters visible as plain text", async () => {
    const cases = [
      { source: "\\*literal\\*", text: "*literal*", selector: ".markra-live-mark-emphasis" },
      { source: "\\*\\*literal\\*\\*", text: "**literal**", selector: ".markra-live-mark-strong" },
      {
        source: "\\*\\*\\*literal\\*\\*\\*",
        text: "***literal***",
        selector: ".markra-live-mark-strong.markra-live-mark-emphasis"
      },
      { source: "\\_literal\\_", text: "_literal_", selector: ".markra-live-mark-emphasis" },
      { source: "\\_\\_literal\\_\\_", text: "__literal__", selector: ".markra-live-mark-strong" },
      { source: "\\~\\~literal\\~\\~", text: "~~literal~~", selector: ".markra-live-mark-strikethrough" },
      { source: "\\=\\=literal\\=\\=", text: "==literal==", selector: ".markra-live-mark-highlight" },
      { source: "\\`literal\\`", text: "`literal`", selector: ".markra-live-mark-inlineCode" }
    ];

    for (const { source, text, selector } of cases) {
      const { container } = await renderEditor(source);

      expect(container.querySelector(".ProseMirror")?.textContent).toBe(text);
      expect(container.querySelector(`.ProseMirror ${selector}`)).not.toBeInTheDocument();
      expectHiddenMarkdownDelimiters(container, 0);
    }

    await settleMarkdownListener();
  });

  it("keeps edited escaped literal markdown delimiters as plain text", async () => {
    const { container, view } = await renderEditor("\\*literal\\*");

    const from = findTextPosition(view, "literal");
    selectText(view, from, from + "literal".length);
    typeText(view, "edited");

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("*edited*");
    expect(container.querySelector(".ProseMirror .markra-live-mark-emphasis")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(container, 0);
    await settleMarkdownListener();
  });

  it("supports inline markdown formatting shortcuts", async () => {
    const strong = await renderEditor();
    typeText(strong.view, "bold");
    selectText(strong.view, 1, 5);

    expect(pressShortcut(strong.view, "b", { metaKey: true })).toBe(true);

    expect(strong.container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");

    const emphasis = await renderEditor();
    typeText(emphasis.view, "italic");
    selectText(emphasis.view, 1, 7);

    expect(pressShortcut(emphasis.view, "i", { metaKey: true })).toBe(true);

    expect(emphasis.container.querySelector(".ProseMirror em")).toHaveTextContent("italic");

    const strikethrough = await renderEditor();
    typeText(strikethrough.view, "strike");
    selectText(strikethrough.view, 1, 7);

    expect(pressShortcut(strikethrough.view, "x", { metaKey: true, shiftKey: true })).toBe(true);

    expect(strikethrough.container.querySelector(".ProseMirror del")).toHaveTextContent("strike");

    const inlineCode = await renderEditor();
    typeText(inlineCode.view, "code");
    selectText(inlineCode.view, 1, 5);

    expect(pressShortcut(inlineCode.view, "e", { metaKey: true })).toBe(true);

    expect(inlineCode.container.querySelector(".ProseMirror code")).toHaveTextContent("code");
    await settleMarkdownListener();
  });

  it("supports custom markdown formatting shortcuts", async () => {
    const strong = await renderEditor("", {
      markdownShortcuts: {
        bold: "Mod+Alt+B"
      }
    });
    typeText(strong.view, "bold");
    selectText(strong.view, 1, 5);

    expect(pressShortcut(strong.view, "b", { metaKey: true, altKey: true })).toBe(true);

    expect(strong.container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    await settleMarkdownListener();
  });

  it("applies markdown shortcut changes to an open editor", async () => {
    let editor: Editor | null = null;
    const { container, rerender } = render(
      <MarkdownPaper
        initialContent="bold"
        markdownShortcuts={defaultMarkdownShortcuts}
        onEditorReady={(instance) => {
          editor = instance;
        }}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    await waitFor(() => expect(editor).not.toBeNull());
    let view = editor!.action((ctx) => ctx.get(editorViewCtx));
    selectText(view, 1, 5);

    expect(pressShortcut(view, "b", { metaKey: true, altKey: true })).not.toBe(true);

    rerender(
      <MarkdownPaper
        initialContent="bold"
        markdownShortcuts={{
          ...defaultMarkdownShortcuts,
          bold: "Mod+Alt+B"
        }}
        onEditorReady={(instance) => {
          editor = instance;
        }}
        onMarkdownChange={() => {}}
        revision={0}
      />
    );

    await waitFor(() => expect(editor).not.toBeNull());
    view = editor!.action((ctx) => ctx.get(editorViewCtx));
    selectText(view, 1, 5);

    expect(pressShortcut(view, "b", { metaKey: true, altKey: true })).toBe(true);
    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    await settleMarkdownListener();
  });

  it("keeps Tab inside plain text blocks as indentation", async () => {
    const { editor, view } = await renderEditor("Alphabeta");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "beta"));

    expect(pressShortcut(view, "Tab")).toBe(true);
    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe("Alpha  beta");
    await settleMarkdownListener();
  });

  it("nests the current list item when Tab is pressed inside it", async () => {
    const { container, editor, view } = await renderEditor(["- First", "- Second"].join("\n"));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    const topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li"));
    const nestedItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li > ul > li"));
    expect(topLevelItems).toHaveLength(1);
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second");
    expect(serializeMarkdown(view.state.doc)).toContain("  - Second");
    await settleMarkdownListener();
  });

  it("nests the first item of an adjacent mixed-marker bullet list with Tab", async () => {
    const { container, editor, view } = await renderEditor(["- Parent", "", "* Child"].join("\n"));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Child"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    const topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li"));
    const nestedItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li > ul > li"));
    expect(topLevelItems).toHaveLength(1);
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Child");
    expect(serializeMarkdown(view.state.doc)).toContain("  - Child");
    await settleMarkdownListener();
  });

  it("nests only the current list item when Tab is pressed before following siblings", async () => {
    const { editor, view } = await renderEditor(["- A", "- B", "- C", "- D"].join("\n"));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "C"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "- A",
      "- B",
      "  - C",
      "- D"
    ]);
    await settleMarkdownListener();
  });

  it("lifts only the current list item with Shift+Tab", async () => {
    const source = ["- Parent", "  - First child", "  - Second child", "- After"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "First child"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li"));
    const nestedItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li > ul > li"));
    expect(topLevelItems).toHaveLength(3);
    expect(topLevelItems[0]).toHaveTextContent("Parent");
    expect(topLevelItems[1]).toHaveTextContent("First child");
    expect(topLevelItems[2]).toHaveTextContent("After");
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second child");

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown.split("\n").filter((line) => line.length > 0)).toEqual([
      "- Parent",
      "- First child",
      "  - Second child",
      "- After"
    ]);
  });

  it("lifts list items without reducing following sibling indentation", async () => {
    const source = [
      "- Parent",
      "  - First child",
      "  - Second child",
      "    - Nested detail",
      "  - Third child",
      "- After"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second child"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "- Parent",
      "  - First child",
      "- Second child",
      "  - Nested detail",
      "  - Third child",
      "- After"
    ]);
    await settleMarkdownListener();
  });

  it("lifts only the active list continuation line with Shift+Tab", async () => {
    const source = [
      "- s",
      "  - sa",
      "  - sd",
      "    - sad",
      "    - sad",
      "    - First detail",
      "      Second detail"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second detail"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const markdown = serializeMarkdown(view.state.doc);
    const lines = markdown.split("\n").filter((line) => line.length > 0);
    expect(lines).toContain("    - First detail");
    expect(lines).toContain("  - Second detail");
    expect(lines).not.toContain("  - First detail");
    expect(lines).not.toContain("    Second detail");
  });

  it("keeps list continuation Shift+Tab undoable as one step", async () => {
    const source = [
      "- s",
      "  - sa",
      "  - sd",
      "    - sad",
      "    - sad",
      "    - First detail",
      "      Second detail"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second detail"));
    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);
    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toContain(
      "  - Second detail"
    );

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);
    let lines = serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0);
    expect(lines).toContain("    - First detail");
    expect(lines).toContain("      Second detail");
    expect(lines).not.toContain("  - Second detail");

    expect(pressShortcut(view, "z", { metaKey: true, shiftKey: true })).toBe(true);
    lines = serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0);
    expect(lines).toContain("    - First detail");
    expect(lines).toContain("  - Second detail");
  });

  it("exits a terminal code block so text can be added below it", async () => {
    const source = ["## Pull image", "", "```", "sudo docker pull image", "```"].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "sudo docker pull image") + "sudo docker pull image".length);

    expect(pressShortcut(view, "Enter", { metaKey: true })).toBe(true);
    insertTextDirectly(view, "Next paragraph");

    expect(serializeMarkdown(view.state.doc)).toContain([
      "```",
      "sudo docker pull image",
      "```",
      "",
      "Next paragraph"
    ].join("\n"));
    await settleMarkdownListener();
  });

  it("supports block markdown formatting shortcuts", async () => {
    const heading = await renderEditor();
    typeText(heading.view, "Heading");

    expect(pressShortcut(heading.view, "2", { metaKey: true, altKey: true })).toBe(true);

    expect(heading.container.querySelector(".ProseMirror h2")).toHaveTextContent("Heading");

    const bullet = await renderEditor();
    typeText(bullet.view, "Bullet");

    expect(pressShortcut(bullet.view, "*", { code: "Digit8", metaKey: true, shiftKey: true })).toBe(true);

    expect(bullet.container.querySelector(".ProseMirror ul li")).toHaveTextContent("Bullet");

    const ordered = await renderEditor();
    typeText(ordered.view, "Ordered");

    expect(pressShortcut(ordered.view, "&", { code: "Digit7", metaKey: true, shiftKey: true })).toBe(true);

    expect(ordered.container.querySelector(".ProseMirror ol li")).toHaveTextContent("Ordered");

    const quote = await renderEditor();
    typeText(quote.view, "Quote");

    expect(pressShortcut(quote.view, "b", { metaKey: true, shiftKey: true })).toBe(true);

    expect(quote.container.querySelector(".ProseMirror blockquote")).toHaveTextContent("Quote");
    await settleMarkdownListener();
  });

  it("toggles quote formatting off without deleting the quoted text", async () => {
    const { container, view } = await renderEditor();
    typeText(view, "Quote");

    expect(pressShortcut(view, "b", { metaKey: true, shiftKey: true })).toBe(true);
    expect(container.querySelector(".ProseMirror blockquote")).toHaveTextContent("Quote");

    expect(pressShortcut(view, "b", { metaKey: true, shiftKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror p")).toHaveTextContent("Quote");
    await settleMarkdownListener();
  });

  it("exits empty quote formatting when pressing Enter", async () => {
    const { container, editor, view } = await renderEditor("> ");
    moveCursor(view, findFirstTextBlockCursor(view));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(container.querySelector(".ProseMirror blockquote")).toBeInTheDocument();
    expect(pressEnter(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote")).not.toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);
    typeText(view, "Next");
    expect(serializeMarkdown(view.state.doc)).toBe("Next\n");
    await settleMarkdownListener();
  });

  it("continues quote formatting at the quote end and exits from a blank quote line", async () => {
    const { container, editor, view } = await renderEditor("> Quote");
    moveCursor(view, findTextPosition(view, "Quote", "Quote".length));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(container.querySelector(".ProseMirror blockquote")).toHaveTextContent("Quote");
    expect(pressEnter(view)).toBe(true);

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    typeText(view, "Next");
    expect(serializeMarkdown(view.state.doc)).toContain("> Quote\n>\n> Next");

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);
    typeText(view, "After");
    expect(serializeMarkdown(view.state.doc)).toBe("> Quote\n>\n> Next\n\nAfter\n");
    await settleMarkdownListener();
  });

  it("moves to a new quote line after one Enter from typed quote content", async () => {
    const { editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "> ");
    typeText(view, "First line");

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(pressEnter(view)).toBe(true);

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe("");
    typeText(view, "Second line");
    expect(serializeMarkdown(view.state.doc)).toContain("> First line\n>\n> Second line");
    await settleMarkdownListener();
  });

  it("keeps Enter inside quote formatting before the quote end", async () => {
    const { container, editor, view } = await renderEditor(["> First", ">", "> Second"].join("\n"));
    moveCursor(view, findTextPosition(view, "First", "First".length));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(pressEnter(view)).toBe(true);
    typeText(view, "Middle");

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(container.querySelector(".ProseMirror blockquote")).toHaveTextContent("FirstMiddleSecond");
    expect(serializeMarkdown(view.state.doc)).toContain("> First\n>\n> Middle");
    expect(serializeMarkdown(view.state.doc)).toContain("> Second");
    await settleMarkdownListener();
  });

  it("continues quote list items when pressing Enter", async () => {
    const { container, editor, view } = await renderEditor("> - First");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "First", "First".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    typeText(view, "Second");

    const quote = container.querySelector<HTMLElement>(".ProseMirror blockquote");
    expect(quote?.querySelectorAll("ul li")).toHaveLength(2);
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n> - Second");
    await settleMarkdownListener();
  });

  it("nests and lifts quote list items with Tab like ordinary lists", async () => {
    const { container, editor, view } = await renderEditor("> - First\n> - Second");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    let topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror blockquote > ul > li"));
    let nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(1);
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second");
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n>   - Second");

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror blockquote > ul > li"));
    nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(2);
    expect(nestedItems).toHaveLength(0);
    expect(topLevelItems[1]).toHaveTextContent("Second");
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n> - Second");
    await settleMarkdownListener();
  });

  it("nests only the current quote list item when Tab is pressed before following siblings", async () => {
    const { editor, view } = await renderEditor(["> - A", "> - B", "> - C", "> - D"].join("\n"));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "C"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "> - A",
      "> - B",
      ">   - C",
      "> - D"
    ]);
    await settleMarkdownListener();
  });

  it("keeps following quote list siblings outside when nesting an item with children", async () => {
    const source = ["> - A", "> - B", "> - C", ">   - C child", "> - D"].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "C"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "> - A",
      "> - B",
      ">   - C",
      ">     - C child",
      "> - D"
    ]);
    await settleMarkdownListener();
  });

  it("keeps following quote list siblings outside when nesting after an item with children", async () => {
    const source = ["> - A", "> - B", ">   - B child", "> - C", "> - D"].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "C"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "> - A",
      "> - B",
      ">   - B child",
      ">   - C",
      "> - D"
    ]);
    await settleMarkdownListener();
  });

  it("lifts quote list items without reducing following sibling indentation", async () => {
    const source = [
      "> - Parent",
      ">   - First child",
      ">   - Second child",
      ">     - Nested detail",
      ">   - Third child",
      "> - After"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second child"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const lines = serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0);
    expect(lines).toEqual([
      "> - Parent",
      ">   - First child",
      "> - Second child",
      ">   - Nested detail",
      ">   - Third child",
      "> - After"
    ]);
    await settleMarkdownListener();
  });

  it("removes emptied quote list items without recreating the bullet", async () => {
    const source = ["> - Parent", ">   - First child", ">   - Empty child", ">   - Last child"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const emptyFrom = findTextPosition(view, "Empty child");

    selectText(view, emptyFrom, emptyFrom + "Empty child".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    expect(pressBackspace(view)).toBe(true);

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const emptyItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror blockquote li")).filter(
      (item) => item.textContent?.trim().length === 0
    );
    expect(emptyItems).toHaveLength(0);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Parent\n>   - First child\n>   - Last child");
    expect(markdown).not.toContain("Empty child");
    expect(markdown).not.toContain(">   -\n");
    await settleMarkdownListener();
  });

  it("keeps quote formatting before following prose when pressing Enter at the quote end", async () => {
    const { editor, view } = await renderEditor(["> Quote", "", "After"].join("\n"));
    moveCursor(view, findTextPosition(view, "Quote", "Quote".length));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expect(pressEnter(view)).toBe(true);
    typeText(view, "Next");

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(serializeMarkdown(view.state.doc)).toBe("> Quote\n>\n> Next\n\nAfter\n");
    await settleMarkdownListener();
  });

  it("finalizes live markdown inside quote formatting and continues on one Enter", async () => {
    const { container, editor, view } = await renderEditor("> ");
    moveCursor(view, findFirstTextBlockCursor(view));
    typeText(view, "**Quote**");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    expectLiveMark(container, "strong", "Quote");
    expect(pressEnter(view)).toBe(true);
    expect(container.querySelector(".ProseMirror blockquote strong")).toHaveTextContent("Quote");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    expect(view.state.selection.$from.parent.textContent).toBe("");
    typeText(view, "Next");

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(serializeMarkdown(view.state.doc)).toBe("> **Quote**\n>\n> Next\n");

    expect(pressEnter(view)).toBe(true);
    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);
    await settleMarkdownListener();
  });

  it("keeps the cursor inside quote formatting when pressing Shift+Enter", async () => {
    const { container, view } = await renderEditor("> Quote");
    moveCursor(view, findTextPosition(view, "Quote", "Quote".length));

    expect(pressShortcut(view, "Enter", { shiftKey: true })).toBe(true);

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    typeText(view, "Next");
    expect(container.querySelector(".ProseMirror blockquote br")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote")).toHaveTextContent("QuoteNext");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    await settleMarkdownListener();
  });

  it("removes empty quote formatting when pressing Backspace", async () => {
    const { container, view } = await renderEditor("> ");
    moveCursor(view, findFirstTextBlockCursor(view));

    expect(container.querySelector(".ProseMirror blockquote")).toBeInTheDocument();
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror p")).toHaveTextContent("");
    await settleMarkdownListener();
  });

  it("supports undo and redo shortcuts", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "undoable");

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("undoable");

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("");

    expect(pressShortcut(view, "z", { metaKey: true, shiftKey: true })).toBe(true);

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("undoable");
    await settleMarkdownListener();
  });

  it("turns typed strong markdown into bold text after existing prose", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "pre**a**");

    expectLiveMark(container, "strong", "a");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("pre**a**");

    expect(pressEnter(view)).toBe(true);

    const strong = container.querySelector(".ProseMirror strong");
    expect(strong).toHaveTextContent("a");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("prea");
    await settleMarkdownListener();
  });

  it("turns typed strong markdown into bold text after latin prose", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "after**a**");

    expectLiveMark(container, "strong", "a");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("after**a**");

    expect(pressEnter(view)).toBe(true);

    const strong = container.querySelector(".ProseMirror strong");
    expect(strong).toHaveTextContent("a");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("aftera");
    await settleMarkdownListener();
  });

  it("turns typed strong emphasis markdown into bold italic text", async () => {
    const stars = await renderEditor();
    typeText(stars.view, "***bold italic text***");

    expectLiveStrongEmphasis(stars.container, "bold italic text");
    expectMarkdownDelimiters(stars.container, 2);
    expect(stars.container.querySelector(".ProseMirror")?.textContent).toBe("***bold italic text***");

    expect(pressEnter(stars.view)).toBe(true);

    expect(stars.container.querySelector(".ProseMirror strong")).toHaveTextContent("bold italic text");
    expect(stars.container.querySelector(".ProseMirror em")).toHaveTextContent("bold italic text");
    expect(stars.container.querySelector(".ProseMirror")?.textContent).toBe("bold italic text");

    const underscores = await renderEditor();
    typeText(underscores.view, "___bold italic text___");

    expectLiveStrongEmphasis(underscores.container, "bold italic text");
    expectMarkdownDelimiters(underscores.container, 2);
    expect(underscores.container.querySelector(".ProseMirror")?.textContent).toBe("___bold italic text___");

    expect(pressEnter(underscores.view)).toBe(true);

    expect(underscores.container.querySelector(".ProseMirror strong")).toHaveTextContent("bold italic text");
    expect(underscores.container.querySelector(".ProseMirror em")).toHaveTextContent("bold italic text");
    expect(underscores.container.querySelector(".ProseMirror")?.textContent).toBe("bold italic text");
    await settleMarkdownListener();
  });

  it("turns filled strong emphasis delimiters into bold italic text", async () => {
    const stars = await renderEditor();
    typeText(stars.view, "******");
    moveCursor(stars.view, 4);
    typeText(stars.view, "2");

    expectLiveStrongEmphasis(stars.container, "2");
    expectMarkdownDelimiters(stars.container, 2);
    expect(stars.container.querySelector(".ProseMirror")?.textContent).toBe("***2***");

    expect(pressEnter(stars.view)).toBe(true);

    expect(stars.container.querySelector(".ProseMirror strong")).toHaveTextContent("2");
    expect(stars.container.querySelector(".ProseMirror em")).toHaveTextContent("2");
    expect(stars.container.querySelector(".ProseMirror")?.textContent).toBe("2");

    const underscores = await renderEditor();
    typeText(underscores.view, "______");
    moveCursor(underscores.view, 4);
    typeText(underscores.view, "2");

    expectLiveStrongEmphasis(underscores.container, "2");
    expectMarkdownDelimiters(underscores.container, 2);
    expect(underscores.container.querySelector(".ProseMirror")?.textContent).toBe("___2___");

    expect(pressEnter(underscores.view)).toBe(true);

    expect(underscores.container.querySelector(".ProseMirror strong")).toHaveTextContent("2");
    expect(underscores.container.querySelector(".ProseMirror em")).toHaveTextContent("2");
    expect(underscores.container.querySelector(".ProseMirror")?.textContent).toBe("2");
    await settleMarkdownListener();
  });

  it("reveals folded markdown delimiters when the cursor returns to a formatted edge", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "~~123~~");

    expectLiveMark(container, "strikethrough", "123");
    expectMarkdownDelimiterText(container, "~~");

    expect(pressEnter(view)).toBe(true);

    expect(container.querySelector(".ProseMirror del")).toHaveTextContent("123");
    expectMarkdownDelimiters(container, 0);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("123");

    moveCursor(view, 1);
    moveCursor(view, 4);

    expectMarkdownDelimiterText(container, "~~");
    expect(container.querySelector(".ProseMirror del")).toHaveTextContent("123");
    await settleMarkdownListener();
  });

  it("places the folded closing delimiter after the cursor at the end of formatted text", async () => {
    const { container, view } = await renderEditor("`sample`");

    moveCursor(view, findLastTextBlockEndCursor(view));

    expect(container.querySelector(".ProseMirror code")).toHaveTextContent("sample");
    const codeEnd = findTextPosition(view, "sample", "sample".length);
    const closingDelimiterDecorations: Array<{ from: number; to: number }> = [];
    view.someProp("decorations", (decorations) => {
      const value = typeof decorations === "function" ? decorations(view.state) : decorations;
      value?.forEachSet((set) => {
        closingDelimiterDecorations.push(
          ...set.find(codeEnd, codeEnd, (spec: { side?: number }) => spec.side === 1)
        );
      });
      return undefined;
    });
    expect(
      closingDelimiterDecorations.some((decoration) => decoration.from === codeEnd && decoration.to === codeEnd)
    ).toBe(true);
    await settleMarkdownListener();
  });

  it("keeps text typed at finalized formatting edges outside the mark", async () => {
    const cases = [
      { markdown: "*emphasis*", selector: "em", text: "emphasis", expected: "before *emphasis* after" },
      { markdown: "**strong**", selector: "strong", text: "strong", expected: "before **strong** after" },
      { markdown: "~~strike~~", selector: "del", text: "strike", expected: "before ~~strike~~ after" }
    ];

    for (const { markdown, selector, text, expected } of cases) {
      const { container, editor, view } = await renderEditor(markdown);
      const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

      moveCursor(view, findTextPosition(view, text));
      typeText(view, "before ");
      moveCursor(view, findTextPosition(view, text, text.length));
      typeText(view, " after");

      expect(container.querySelector(`.ProseMirror ${selector}`)).toHaveTextContent(text);
      expect(container.querySelector(".ProseMirror")?.textContent).toBe(`before ${text} after`);
      expect(serializeMarkdown(view.state.doc).trimEnd()).toBe(expected);
    }

    await settleMarkdownListener();
  });

  it("snaps finalized formatting edge clicks to the mark boundary", async () => {
    const { container, editor, unmount, view } = await renderEditor("alpha **bold** omega");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const strong = container.querySelector<HTMLElement>(".ProseMirror strong");

    expect(strong).toHaveTextContent("bold");
    mockInlineElementRect(strong!, {
      bottom: 32,
      left: 100,
      right: 148,
      top: 12
    });

    moveCursor(view, findFirstTextBlockCursor(view));

    const rightEdgeClick = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 147,
      clientY: 22
    });
    Object.defineProperty(rightEdgeClick, "target", {
      configurable: true,
      value: strong
    });
    const handled = view.someProp("handleDOMEvents", (handlers) => handlers.mousedown?.(view, rightEdgeClick));

    expect(handled).toBe(true);
    expect(rightEdgeClick.defaultPrevented).toBe(true);
    expect(view.state.selection.from).toBe(findTextPosition(view, " omega"));

    typeText(view, "!");

    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe("alpha **bold**! omega");
    unmount();

    const before = await renderEditor("alpha **bold** omega");
    const beforeSerializer = before.editor.action((ctx) => ctx.get(serializerCtx));
    const beforeStrong = before.container.querySelector<HTMLElement>(".ProseMirror strong");
    expect(beforeStrong).toHaveTextContent("bold");
    mockInlineElementRect(beforeStrong!, {
      bottom: 32,
      left: 100,
      right: 148,
      top: 12
    });

    const leftEdgeClick = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 101,
      clientY: 22
    });
    Object.defineProperty(leftEdgeClick, "target", {
      configurable: true,
      value: beforeStrong
    });
    const leftHandled = before.view.someProp(
      "handleDOMEvents",
      (handlers) => handlers.mousedown?.(before.view, leftEdgeClick)
    );

    expect(leftHandled).toBe(true);
    expect(before.view.state.selection.from).toBe(findTextPosition(before.view, "bold"));

    typeText(before.view, "!");

    expect(before.container.querySelector(".ProseMirror strong")).toHaveTextContent("bold");
    expect(beforeSerializer(before.view.state.doc).trimEnd()).toBe("alpha !**bold** omega");
    await settleMarkdownListener();
  });

  it("leaves finalized formatting center clicks to the browser selection handler", async () => {
    const { container, view } = await renderEditor("alpha **bold** omega");
    const strong = container.querySelector<HTMLElement>(".ProseMirror strong");

    expect(strong).toHaveTextContent("bold");
    mockInlineElementRect(strong!, {
      bottom: 32,
      left: 100,
      right: 148,
      top: 12
    });

    const centerClick = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 124,
      clientY: 22
    });
    Object.defineProperty(centerClick, "target", {
      configurable: true,
      value: strong
    });

    const handled = view.someProp("handleDOMEvents", (handlers) => handlers.mousedown?.(view, centerClick));

    expect(handled).toBeUndefined();
    expect(centerClick.defaultPrevented).toBe(false);
    await settleMarkdownListener();
  });

  it("snaps finalized formatting edge clicks when the WebView reports a surrounding target", async () => {
    const { container, editor, view } = await renderEditor("alpha **bold** omega");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const paragraph = container.querySelector<HTMLElement>(".ProseMirror p");
    const strong = container.querySelector<HTMLElement>(".ProseMirror strong");

    expect(paragraph).toBeInTheDocument();
    expect(strong).toHaveTextContent("bold");
    mockInlineElementRect(strong!, {
      bottom: 32,
      left: 100,
      right: 148,
      top: 12
    });

    const edgeClick = new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 147,
      clientY: 22
    });
    Object.defineProperty(edgeClick, "target", {
      configurable: true,
      value: paragraph
    });

    const handled = view.someProp("handleDOMEvents", (handlers) => handlers.mousedown?.(view, edgeClick));

    expect(handled).toBe(true);
    expect(view.state.selection.from).toBe(findTextPosition(view, " omega"));

    typeText(view, "!");

    expect(serializeMarkdown(view.state.doc).trimEnd()).toBe("alpha **bold**! omega");
    await settleMarkdownListener();
  });

  it("hides folded markdown delimiters after the cursor moves to other text", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "~~around~~ selected text");

    expectLiveMark(container, "strikethrough", "around");
    expectMarkdownDelimiters(container, 0);

    moveCursor(view, findTextPosition(view, "around", "around".length));
    expectMarkdownDelimiterText(container, "~~");

    moveCursor(view, findTextPosition(view, "selected", "selected".length));

    expectMarkdownDelimiters(container, 0);
    await settleMarkdownListener();
  });

  it("keeps live closing delimiters visible after deleting adjacent plain text", async () => {
    const cases = [
      { markdown: "*a*a", marker: "*", kind: "emphasis" },
      { markdown: "**a**a", marker: "**", kind: "strong" },
      { markdown: "~~a~~a", marker: "~~", kind: "strikethrough" },
      { markdown: "`a`a", marker: "`", kind: "inlineCode" }
    ];

    for (const { markdown, marker, kind } of cases) {
      const { container, view } = await renderEditor();

      typeText(view, markdown);

      expectMarkdownDelimiters(container, 0);
      expect(pressBackspace(view)).toBe(true);

      expectLiveMark(container, kind, "a");
      expectMarkdownDelimiterText(container, marker);
      expect(container.querySelector(".ProseMirror p")?.textContent).toBe(markdown.slice(0, -1));
      expect(view.state.selection.from).toBe(findLastTextBlockEndCursor(view));
    }

    await settleMarkdownListener();
  });

  it("moves the cursor over live markdown delimiters as a single visible step", async () => {
    const { view } = await renderEditor();

    typeText(view, "~~around~~");

    moveCursor(view, 1);
    expect(pressArrowRight(view)).toBe(true);
    expect(view.state.selection.from).toBe(3);

    moveCursor(view, 2);
    expect(pressArrowRight(view)).toBe(true);
    expect(view.state.selection.from).toBe(3);

    moveCursor(view, 9);
    expect(pressArrowRight(view)).toBe(true);
    expect(view.state.selection.from).toBe(11);

    moveCursor(view, 10);
    expect(pressArrowRight(view)).toBe(true);
    expect(view.state.selection.from).toBe(11);

    moveCursor(view, 11);
    expect(pressArrowLeft(view)).toBe(true);
    expect(view.state.selection.from).toBe(9);

    moveCursor(view, 3);
    expect(pressArrowLeft(view)).toBe(true);
    expect(view.state.selection.from).toBe(1);
    await settleMarkdownListener();
  });

  it("places the cursor outside active live markdown delimiters from mouse clicks", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "**ABC**");

    expectLiveMark(container, "strong", "ABC");

    const sourceStart = findFirstTextBlockCursor(view);
    const sourceEnd = findLastTextBlockEndCursor(view);
    const delimiters = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror .markra-md-delimiter"));
    expect(delimiters).toHaveLength(2);
    const [openingDelimiter] = delimiters;

    moveCursor(view, findTextPosition(view, "ABC", 1));
    openingDelimiter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));

    expect(view.state.selection.from).toBe(sourceStart);

    const nextDelimiters = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror .markra-md-delimiter"));
    expect(nextDelimiters).toHaveLength(2);
    const [, closingDelimiter] = nextDelimiters;

    moveCursor(view, findTextPosition(view, "ABC", 1));
    closingDelimiter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));

    expect(view.state.selection.from).toBe(sourceEnd);
    await settleMarkdownListener();
  });

  it("places the cursor before adjacent punctuation from live closing delimiter clicks", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "**ABC**:");

    expectLiveMark(container, "strong", "ABC");

    const punctuationPosition = findTextPosition(view, ":");

    moveCursor(view, findTextPosition(view, "ABC", 1));

    const delimiters = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror .markra-md-delimiter")).filter(
      (delimiter) => !delimiter.classList.contains("markra-md-virtual-delimiter")
    );
    expect(delimiters).toHaveLength(2);
    const [, closingDelimiter] = delimiters;

    closingDelimiter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));

    expect(view.state.selection.from).toBe(punctuationPosition);
    await settleMarkdownListener();
  });

  it("places the cursor before adjacent punctuation from folded closing delimiter clicks", async () => {
    const { container, view } = await renderEditor("**ABC**:");

    expect(container.querySelector(".ProseMirror strong")).toHaveTextContent("ABC");

    const punctuationPosition = findTextPosition(view, ":");

    moveCursor(view, findTextPosition(view, "ABC", 1));

    const delimiters = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror .markra-md-virtual-delimiter"));
    expect(delimiters).toHaveLength(2);
    const [, closingDelimiter] = delimiters;

    closingDelimiter?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));

    expect(view.state.selection.from).toBe(punctuationPosition);
    await settleMarkdownListener();
  });

  it("keeps the cursor on the visible text edge when collapsing a live markdown mark", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "~~a~~b");
    moveCursor(view, 6);

    expect(pressArrowRight(view)).toBe(true);

    expect(view.state.selection.from).toBe(4);
    expectMarkdownDelimiters(container, 0);
    expectHiddenMarkdownDelimiters(container, 2);

    expect(pressArrowRight(view)).toBe(true);

    expect(view.state.selection.from).toBe(7);
    expectMarkdownDelimiters(container, 0);
    expectHiddenMarkdownDelimiters(container, 2);

    expect(pressArrowRight(view)).toBeUndefined();
    expect(view.state.selection.from).toBe(7);
    expectMarkdownDelimiters(container, 0);
    expectHiddenMarkdownDelimiters(container, 2);
    await settleMarkdownListener();
  });

  it("lets the browser continue right-arrow movement after exiting inline code delimiters", async () => {
    const source = "`n!`/`n₁!` \\* `n₂!` \\* … \\* `nₖ!`)";
    const { container, view } = await renderEditor(source);
    const firstCodeEnd = findTextPosition(view, "n!", "n!".length);

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("n!/n₁! * n₂! * … * nₖ!)");
    expect(container.querySelectorAll(".ProseMirror code")).toHaveLength(4);

    moveCursor(view, firstCodeEnd);
    expect(pressArrowRight(view)).toBe(true);
    expect(view.state.selection.from).toBe(firstCodeEnd);
    expect(pressArrowRight(view)).toBeUndefined();
    expect(view.state.selection.from).toBe(firstCodeEnd);
    await settleMarkdownListener();
  });

  it("turns filled strong delimiters into bold text", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "****");
    moveCursor(view, 3);
    typeText(view, "2");

    expectLiveMark(container, "strong", "2");
    expectMarkdownDelimiters(container, 2);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("**2**");

    expect(pressEnter(view)).toBe(true);

    const strong = container.querySelector(".ProseMirror strong");
    expect(strong).toHaveTextContent("2");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("2");
    await settleMarkdownListener();
  });

  it("turns filled underscore strong delimiters into bold text", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "____");
    moveCursor(view, 3);
    typeText(view, "2");

    expectLiveMark(container, "strong", "2");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("__2__");

    expect(pressEnter(view)).toBe(true);

    const strong = container.querySelector(".ProseMirror strong");
    expect(strong).toHaveTextContent("2");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("2");
    await settleMarkdownListener();
  });

  it("turns filled inline delimiters into styled marks", async () => {
    const emphasis = await renderEditor();
    typeText(emphasis.view, "**");
    moveCursor(emphasis.view, 2);
    typeText(emphasis.view, "2");

    expectLiveMark(emphasis.container, "emphasis", "2");
    expect(emphasis.container.querySelector(".ProseMirror")?.textContent).toBe("*2*");

    expect(pressEnter(emphasis.view)).toBe(true);

    expect(emphasis.container.querySelector(".ProseMirror em")).toHaveTextContent("2");
    expect(emphasis.container.querySelector(".ProseMirror")?.textContent).toBe("2");

    const underscoreEmphasis = await renderEditor();
    typeText(underscoreEmphasis.view, "__");
    moveCursor(underscoreEmphasis.view, 2);
    typeText(underscoreEmphasis.view, "2");

    expectLiveMark(underscoreEmphasis.container, "emphasis", "2");
    expect(underscoreEmphasis.container.querySelector(".ProseMirror")?.textContent).toBe("_2_");

    expect(pressEnter(underscoreEmphasis.view)).toBe(true);

    expect(underscoreEmphasis.container.querySelector(".ProseMirror em")).toHaveTextContent("2");
    expect(underscoreEmphasis.container.querySelector(".ProseMirror")?.textContent).toBe("2");

    const inlineCode = await renderEditor();
    typeText(inlineCode.view, "``");
    moveCursor(inlineCode.view, 2);
    typeText(inlineCode.view, "2");

    expectLiveMark(inlineCode.container, "inlineCode", "2");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("`2`");

    expect(pressEnter(inlineCode.view)).toBe(true);

    expect(inlineCode.container.querySelector(".ProseMirror code")).toHaveTextContent("2");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("2");

    const strikethrough = await renderEditor();
    typeText(strikethrough.view, "~~~~");

    expect(strikethrough.container.querySelector(".ProseMirror")?.textContent).toBe("~~~~");
    expectHiddenMarkdownDelimiters(strikethrough.container, 0);

    moveCursor(strikethrough.view, 3);
    typeText(strikethrough.view, "2");

    expectLiveMark(strikethrough.container, "strikethrough", "2");
    expect(strikethrough.container.querySelector(".ProseMirror")?.textContent).toBe("~~2~~");

    expect(pressEnter(strikethrough.view)).toBe(true);

    expect(strikethrough.container.querySelector(".ProseMirror del")).toHaveTextContent("2");
    expect(strikethrough.container.querySelector(".ProseMirror")?.textContent).toBe("2");
    await settleMarkdownListener();
  });

  it("clears inline formatting after deleting finalized markdown marks", async () => {
    const cases = [
      { markdown: "_2_", selectors: ["em"] },
      { markdown: "**2**", selectors: ["strong"] },
      { markdown: "___2___", selectors: ["strong", "em"] },
      { markdown: "~~2~~", selectors: ["del"] },
      { markdown: "`2`", selectors: ["code"] }
    ];

    for (const { markdown, selectors } of cases) {
      const { container, view } = await renderEditor();

      typeText(view, markdown);
      expect(pressEnter(view)).toBe(true);

      for (const selector of selectors) {
        expect(container.querySelector(`.ProseMirror ${selector}`)).toHaveTextContent("2");
      }

      selectText(view, 1, 2);
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
      typeText(view, "plain");

      for (const selector of selectors) {
        expect(container.querySelector(`.ProseMirror ${selector}`)).not.toBeInTheDocument();
      }

      expect(container.querySelector(".ProseMirror")?.textContent).toBe("plain");
    }

    await settleMarkdownListener();
  });

  it("keeps inline formatting when editing inside remaining finalized marks", async () => {
    const cases = [
      { markdown: "_bold_", selector: "em" },
      { markdown: "**bold**", selector: "strong" },
      { markdown: "~~bold~~", selector: "del" },
      { markdown: "`bold`", selector: "code" }
    ];

    for (const { markdown, selector } of cases) {
      const { container, view } = await renderEditor();

      typeText(view, markdown);
      expect(pressEnter(view)).toBe(true);

      selectText(view, findTextPosition(view, "ol"), findTextPosition(view, "ol", "ol".length));
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
      typeText(view, "OO");

      const markedText = Array.from(container.querySelectorAll(`.ProseMirror ${selector}`))
        .map((node) => node.textContent ?? "")
        .join("");
      expect(markedText).toBe("bOOd");
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("bOOd");
    }

    await settleMarkdownListener();
  });

  it("renders ==text== highlight syntax only when the extension is enabled", async () => {
    const enabled = await renderEditor("", {
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      }
    });
    typeText(enabled.view, "==marked==");

    expectLiveMark(enabled.container, "highlight", "marked");
    expectMarkdownDelimiterText(enabled.container, "==");
    expect(enabled.container.querySelector(".ProseMirror")?.textContent).toBe("==marked==");

    const disabled = await renderEditor("", {
      extendedSyntax: {
        githubAlerts: true,
        highlight: false
      }
    });
    typeText(disabled.view, "==marked==");

    expect(disabled.container.querySelector(".ProseMirror .markra-live-mark-highlight")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(disabled.container, 0);
    expect(disabled.container.querySelector(".ProseMirror")?.textContent).toBe("==marked==");
    await settleMarkdownListener();
  });

  it("does not render highlight syntax across separate inline code blocks", async () => {
    const { container } = await renderEditor("Check `left == value`, `right == value`", {
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      }
    });

    expect(container.querySelectorAll(".ProseMirror code")).toHaveLength(2);
    expect(container.querySelector(".ProseMirror .markra-live-mark-highlight")).not.toBeInTheDocument();
    expectHiddenMarkdownDelimiters(container, 0);
    await settleMarkdownListener();
  });

  it("keeps typing inside filled inline delimiters styled", async () => {
    const strong = await renderEditor();
    typeText(strong.view, "****");
    moveCursor(strong.view, 3);
    typeText(strong.view, "23");

    expectLiveMark(strong.container, "strong", "23");
    expect(strong.container.querySelector(".ProseMirror")?.textContent).toBe("**23**");

    expect(pressEnter(strong.view)).toBe(true);

    expect(strong.container.querySelector(".ProseMirror strong")).toHaveTextContent("23");
    expect(strong.container.querySelector(".ProseMirror")?.textContent).toBe("23");

    const inlineCode = await renderEditor();
    typeText(inlineCode.view, "``");
    moveCursor(inlineCode.view, 2);
    typeText(inlineCode.view, "23");

    expectLiveMark(inlineCode.container, "inlineCode", "23");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("`23`");

    expect(pressEnter(inlineCode.view)).toBe(true);

    expect(inlineCode.container.querySelector(".ProseMirror code")).toHaveTextContent("23");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("23");
    await settleMarkdownListener();
  });

  it("keeps text typed at the end of finalized inline code inside the code mark", async () => {
    const { container, editor, view } = await renderEditor("`sample`");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findLastTextBlockEndCursor(view));
    typeText(view, " text");

    expect(container.querySelector(".ProseMirror code")).toHaveTextContent("sample text");
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`sample text`");
    await settleMarkdownListener();
  });

  it("keeps text typed after confirming live inline code inside the code mark", async () => {
    const { container, editor, view } = await renderEditor("");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "``");
    moveCursor(view, 2);
    typeText(view, "sample");
    expect(pressEnter(view)).toBe(true);
    typeText(view, " text");

    expect(container.querySelector(".ProseMirror code")).toHaveTextContent("sample text");
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`sample text`");
    await settleMarkdownListener();
  });

  it("keeps text typed after moving past the folded closing delimiter outside the code mark", async () => {
    const { container, editor, view } = await renderEditor("`sample`");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findLastTextBlockEndCursor(view));
    expect(pressArrowRight(view)).toBe(true);
    const codeEnd = findTextPosition(view, "sample", "sample".length);
    const exitedClosingDelimiterDecorations: Array<{ from: number; to: number }> = [];
    view.someProp("decorations", (decorations) => {
      const value = typeof decorations === "function" ? decorations(view.state) : decorations;
      value?.forEachSet((set) => {
        exitedClosingDelimiterDecorations.push(
          ...set.find(codeEnd, codeEnd, (spec: { side?: number }) => spec.side === -1)
        );
      });
      return undefined;
    });
    expect(
      exitedClosingDelimiterDecorations.some((decoration) => decoration.from === codeEnd && decoration.to === codeEnd)
    ).toBe(true);
    expect(container.querySelector(".ProseMirror code")?.textContent).toBe("sample");
    expect(pressArrowRight(view)).toBeUndefined();
    const stableExitedClosingDelimiterDecorations: Array<{ from: number; to: number }> = [];
    view.someProp("decorations", (decorations) => {
      const value = typeof decorations === "function" ? decorations(view.state) : decorations;
      value?.forEachSet((set) => {
        stableExitedClosingDelimiterDecorations.push(
          ...set.find(codeEnd, codeEnd, (spec: { side?: number }) => spec.side === -1)
        );
      });
      return undefined;
    });
    expect(
      stableExitedClosingDelimiterDecorations.some(
        (decoration) => decoration.from === codeEnd && decoration.to === codeEnd
      )
    ).toBe(true);
    expect(container.querySelector(".ProseMirror code")?.textContent).toBe("sample");
    typeText(view, " text");

    expect(container.querySelector(".ProseMirror code")).toHaveTextContent("sample");
    expect(container.querySelector(".ProseMirror code")).not.toHaveTextContent("sample text");
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("`sample` text");
    expect(markdown).not.toContain("`sample text`");
    await settleMarkdownListener();
  });

  it("keeps text typed at the start of finalized inline code inside the code mark", async () => {
    const { container, editor, view } = await renderEditor("`sample`");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "sample"));
    typeText(view, "pre");

    expect(container.querySelector(".ProseMirror code")).toHaveTextContent("presample");
    expect(serializeMarkdown(view.state.doc)).toContain("`presample`");
    await settleMarkdownListener();
  });

  it("turns typed markdown shortcuts into styled document nodes", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "## Title");

    expect(container.querySelector(".ProseMirror h2")).toHaveTextContent("Title");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Title");
    await settleMarkdownListener();
  });

  it("collapses a heading section from the heading toggle", async () => {
    const source = "# Intro\n\nIntro body\n\n## Nested\n\nNested body\n\n# Outro\n\nOutro body";
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const headings = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2"));
    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror p"));

    expect(headings).toHaveLength(3);
    expect(paragraphs).toHaveLength(3);

    fireEvent.click(within(headings[0]).getByRole("button", { name: "Collapse section" }));

    expect(within(headings[0]).getByRole("button", { name: "Expand section" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(paragraphs[0]).toHaveClass("markra-heading-collapsed-content");
    expect(headings[1]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[1]).toHaveClass("markra-heading-collapsed-content");
    expect(headings[2]).not.toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[2]).not.toHaveClass("markra-heading-collapsed-content");
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("inserts a new paragraph after a collapsed heading section when Enter is pressed at the heading end", async () => {
    const source = "# Intro\n\nIntro body\n\n## Nested\n\nNested body\n\n# Outro\n\nOutro body";
    const { container, view } = await renderEditor(source);
    const heading = container.querySelector<HTMLElement>(".ProseMirror h1");

    fireEvent.click(within(heading!).getByRole("button", { name: "Collapse section" }));
    moveCursor(view, findTextPosition(view, "Intro", "Intro".length));

    expect(pressEnter(view)).toBe(true);

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror p"));
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[1]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[2]).not.toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[3]).toHaveTextContent("Outro body");
  });

  it("keeps the paragraph inserted after a collapsed heading visible when the section is toggled again", async () => {
    const source = "# Intro\n\nIntro body\n\n## Nested\n\nNested body\n\n# Outro\n\nOutro body";
    const { container, view } = await renderEditor(source);
    const heading = container.querySelector<HTMLElement>(".ProseMirror h1");

    fireEvent.click(within(heading!).getByRole("button", { name: "Collapse section" }));
    moveCursor(view, findTextPosition(view, "Intro", "Intro".length));

    expect(pressEnter(view)).toBe(true);

    fireEvent.click(within(heading!).getByRole("button", { name: "Expand section" }));
    fireEvent.click(within(heading!).getByRole("button", { name: "Collapse section" }));

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror p"));
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[1]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[2]).not.toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[3]).toHaveTextContent("Outro body");
  });

  it("preserves nested heading folds when a parent heading is expanded again", async () => {
    const { container } = await renderEditor("# Parent\n\n## Child\n\nChild body\n\n# Next\n\nNext body");
    const headings = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2"));
    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror p"));

    fireEvent.click(within(headings[1]).getByRole("button", { name: "Collapse section" }));

    expect(within(headings[1]).getByRole("button", { name: "Expand section" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(paragraphs[0]).toHaveClass("markra-heading-collapsed-content");

    fireEvent.click(within(headings[0]).getByRole("button", { name: "Collapse section" }));

    expect(headings[1]).toHaveClass("markra-heading-collapsed-content");

    fireEvent.click(within(headings[0]).getByRole("button", { name: "Expand section" }));

    expect(headings[1]).not.toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[0]).toHaveClass("markra-heading-collapsed-content");
    expect(paragraphs[1]).not.toHaveClass("markra-heading-collapsed-content");
  });

  it("collapses a nested list from the list toggle", async () => {
    const source = ["- Parent", "  - Child", "- Peer"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const topLevelItems = Array.from(container.querySelectorAll<HTMLElement>(".ProseMirror > ul > li"));
    const nestedList = container.querySelector<HTMLElement>(".ProseMirror > ul > li > ul");
    const initialMarkdown = serializeMarkdown(view.state.doc);

    expect(topLevelItems).toHaveLength(2);
    expect(nestedList).toBeInTheDocument();

    fireEvent.click(within(topLevelItems[0]!).getByRole("button", { name: "Collapse list item" }));

    expect(within(topLevelItems[0]!).getByRole("button", { name: "Expand list item" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(nestedList).toHaveClass("markra-list-collapsed-content");
    expect(topLevelItems[1]).not.toHaveClass("markra-list-collapsed-content");
    expect(serializeMarkdown(view.state.doc)).toBe(initialMarkdown);

    fireEvent.click(within(topLevelItems[0]!).getByRole("button", { name: "Expand list item" }));

    expect(within(topLevelItems[0]!).getByRole("button", { name: "Collapse list item" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(nestedList).not.toHaveClass("markra-list-collapsed-content");
  });

  it("keeps a rendered heading in visual mode when clicked", async () => {
    const { container, editor, view } = await renderEditor("## Title");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    const heading = container.querySelector<HTMLElement>(".ProseMirror h2");
    expect(heading).toHaveTextContent("Title");

    fireEvent.click(heading!);

    expect(container.querySelector(".ProseMirror h2")).toHaveTextContent("Title");
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Title");
    expect(serializeMarkdown(view.state.doc)).toContain("## Title");
    await settleMarkdownListener();
  });

  it("marks the active rendered heading with a quiet level control", async () => {
    const { container, view } = await renderEditor("## Title\n\nTail");

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title"));

    const heading = container.querySelector<HTMLElement>(".ProseMirror h2");
    const levelButton = screen.getByRole("button", { name: "Heading level H2" });

    expect(heading).toHaveClass("markra-heading-editing");
    expect(heading).toHaveAttribute("data-heading-level", "H2");
    expect(heading).toHaveAttribute("aria-label", "Title");
    expect(levelButton).toHaveClass("markra-heading-level-button");
    expect(levelButton).toHaveAttribute("data-heading-level", "H2");
    expect(levelButton).toHaveAttribute("aria-haspopup", "listbox");
    expect(levelButton).toHaveAttribute("aria-expanded", "false");
    expect(heading).toContainElement(levelButton);
    expect(screen.queryByRole("listbox", { name: "Heading level" })).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("TitleTail");
  });

  it("shows the heading level control only while editing the heading", async () => {
    const { container, view } = await renderEditor("## Title\n\nTail");

    moveCursor(view, findTextPosition(view, "Title"));

    const heading = container.querySelector<HTMLElement>(".ProseMirror h2");

    expect(heading).not.toHaveClass("markra-heading-editing");
    expect(screen.queryByRole("button", { name: "Heading level H2" })).not.toBeInTheDocument();

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title"));

    expect(heading).toHaveClass("markra-heading-editing");
    expect(screen.getByRole("button", { name: "Heading level H2" })).toBeInTheDocument();

    fireEvent.blur(view.dom);

    expect(heading).not.toHaveClass("markra-heading-editing");
    expect(screen.queryByRole("button", { name: "Heading level H2" })).not.toBeInTheDocument();
  });

  it("keeps the heading level control hidden while read-only", async () => {
    const { container, view } = await renderEditor("## Title", {
      readOnly: true
    });

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title"));

    const heading = container.querySelector<HTMLElement>(".ProseMirror h2");

    expect(container.querySelector(".ProseMirror")).toHaveAttribute("contenteditable", "false");
    expect(heading).not.toHaveClass("markra-heading-editing");
    expect(screen.queryByRole("button", { name: "Heading level H2" })).not.toBeInTheDocument();
  });

  it("opens a heading level list and applies the selected level", async () => {
    const { container, editor, view } = await renderEditor("## Title");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title"));

    fireEvent.click(screen.getByRole("button", { name: "Heading level H2" }));

    expect(screen.getByRole("listbox", { name: "Heading level" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Paragraph",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6"
    ]);
    expect(screen.getByRole("option", { name: "H2" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: "H3" }));

    expect(container.querySelector(".ProseMirror h3")).toHaveTextContent("Title");
    expect(serializeMarkdown(view.state.doc)).toContain("### Title");
    expect(screen.queryByRole("listbox", { name: "Heading level" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heading level H3" })).toHaveAttribute("aria-expanded", "false");
  });

  it("converts a heading to paragraph from the heading level list", async () => {
    const { container, editor, view } = await renderEditor("## Title");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title"));

    fireEvent.click(screen.getByRole("button", { name: "Heading level H2" }));
    fireEvent.click(screen.getByRole("option", { name: "Paragraph" }));

    expect(container.querySelector(".ProseMirror p")).toHaveTextContent("Title");
    expect(container.querySelector(".ProseMirror h2")).not.toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc).trim()).toBe("Title");
    expect(screen.queryByRole("listbox", { name: "Heading level" })).not.toBeInTheDocument();
  });

  it("keeps inline heading formatting rendered while editing the heading", async () => {
    const { container, view } = await renderEditor("## **Bold**");

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Bold"));

    expect(container.querySelector(".ProseMirror h2 strong")).toHaveTextContent("Bold");
    expect(container.querySelector(".ProseMirror h2")).toHaveClass("markra-heading-editing");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("##");
    await settleMarkdownListener();
  });

  it("edits heading text directly without expanding markdown source", async () => {
    const { container, editor, view } = await renderEditor("## Title");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    focusEditor(view);
    moveCursor(view, findTextPosition(view, "Title", "Title".length));

    insertTextDirectly(view, " Revised");

    expect(container.querySelector(".ProseMirror h2")).toHaveTextContent("Title Revised");
    expect(container.querySelector(".ProseMirror h2")).toHaveClass("markra-heading-editing");
    expect(serializeMarkdown(view.state.doc)).toContain("## Title Revised");
    await settleMarkdownListener();
  });

  it("renders GFM markdown tables as document tables", async () => {
    const { container } = await renderEditor("| Name | Role |\n| --- | --- |\n| Markra | Editor |");

    const table = container.querySelector(".ProseMirror table");

    expect(table).toBeInTheDocument();
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("td")).toHaveLength(2);
    expect(table).toHaveTextContent("Name");
    expect(table).toHaveTextContent("Editor");
  });

  it("inserts a cell line break with Shift+Enter inside tables", async () => {
    const { container, editor, view } = await renderEditor("| Name | Notes |\n| --- | --- |\n| Example | First line |");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "First line", "First line".length));

    expect(pressShortcut(view, "Enter", { shiftKey: true })).toBe(true);

    typeText(view, "Second line");

    const cellHardbreak = view.state.doc.resolve(findTextPosition(view, "Second line")).parent.child(1);
    expect(cellHardbreak.type.name).toBe("hardbreak");
    expect(cellHardbreak.attrs.renderLineBreak).toBe(true);

    const notesCell = container.querySelector<HTMLElement>(".ProseMirror tbody td:nth-child(2)");
    const hardbreak = notesCell?.querySelector<HTMLElement>(
      'br[data-type="hardbreak"], span.markra-hardbreak[data-type="hardbreak"] br'
    );
    expect(hardbreak).toBeInTheDocument();

    expect(notesCell).toHaveTextContent("First lineSecond line");
    expect(serializeMarkdown(view.state.doc)).toContain("| Example | First line<br>Second line |");
    await settleMarkdownListener();
  });

  it("keeps a preceding table when pressing Backspace from an empty paragraph below it", async () => {
    const tableMarkdown = ["| Name | Role |", "| --- | --- |", "| Markra | Editor |"].join("\n");
    const { container, editor, view } = await renderEditor([tableMarkdown, "", "![Screenshot](assets/pasted-image.png)"].join("\n"));
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const insertPosition = findNodeEndPosition(view, "table");
    const paragraph = view.state.schema.nodes.paragraph.create();
    const transaction = view.state.tr.insert(insertPosition, paragraph);

    view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, insertPosition + 1)));

    expect(view.state.doc.child(0).type.name).toBe("table");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror table")).toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("table");
    expect(view.state.doc.child(1).type.name).toBe("image");
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(view.state.selection.$from.parent.textContent).toBe("Editor");
    expect(serializeMarkdown(view.state.doc)).toContain("| Markra | Editor |");
  });

  it.each([
    {
      label: "table",
      source: ["| Name | Role |", "| --- | --- |", "| Example | Writer |"].join("\n"),
      terminalType: "table"
    },
    {
      label: "callout",
      source: "> [!WARNING]\n>\n> Check this first.",
      terminalType: "blockquote"
    },
    {
      label: "bullet list",
      source: "- First\n- Second",
      terminalType: "bullet_list"
    },
    {
      label: "ordered list",
      source: "1. First\n2. Second",
      terminalType: "ordered_list"
    },
    {
      label: "heading",
      source: "## Terminal heading",
      terminalType: "heading"
    },
    {
      label: "code block",
      source: ["```ts", "const value = 1;", "```"].join("\n"),
      terminalType: "code_block"
    },
    {
      label: "Mermaid code block",
      source: ["```mermaid", "flowchart TD", "  A --> B", "```"].join("\n"),
      terminalType: "code_block"
    },
    {
      label: "horizontal rule",
      source: "___",
      terminalType: "hr"
    },
    {
      label: "image",
      source: "![Screenshot](assets/example-image.png)",
      terminalType: "image"
    },
    {
      label: "frontmatter",
      source: ["---", "title: Synthetic draft", "---"].join("\n"),
      terminalType: "frontmatter"
    }
  ])("creates a trailing paragraph after clicking past a terminal $label", async ({ source, terminalType }) => {
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    let trailingAffordance: HTMLElement | null = null;

    await waitFor(() => {
      trailingAffordance = container.querySelector(".ProseMirror .markra-trailing-paragraph");
      expect(trailingAffordance).toBeInTheDocument();
    });

    expect(view.state.doc.child(0).type.name).toBe(terminalType);
    expect(view.state.doc.child(view.state.doc.childCount - 1).type.name).toBe(terminalType);

    fireEvent.mouseDown(trailingAffordance!);

    await waitFor(() => expect(view.state.doc.child(view.state.doc.childCount - 1).type.name).toBe("paragraph"));
    expect(view.state.doc.child(view.state.doc.childCount - 1).content.size).toBe(0);

    moveCursor(view, findLastTextBlockCursor(view));
    typeText(view, "After terminal block");

    expect(view.state.doc.child(view.state.doc.childCount - 1).type.name).toBe("paragraph");
    expect(view.state.doc.child(view.state.doc.childCount - 1).textContent).toBe("After terminal block");
    expect(serializeMarkdown(view.state.doc)).toContain("After terminal block");
  });

  it("creates a trailing paragraph after clicking past a terminal body paragraph", async () => {
    const { container, editor, view } = await renderEditor("Synthetic body");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    let trailingAffordance: HTMLElement | null = null;

    await waitFor(() => {
      trailingAffordance = container.querySelector(".ProseMirror .markra-trailing-paragraph");
      expect(trailingAffordance).toBeInTheDocument();
    });

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("Synthetic body");

    fireEvent.mouseDown(trailingAffordance!);

    await waitFor(() => expect(view.state.doc.childCount).toBe(2));
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);

    typeText(view, "Next body");

    expect(view.state.doc.child(1).textContent).toBe("Next body");
    expect(serializeMarkdown(view.state.doc)).toContain("Next body");
  });

  it("does not create a trailing paragraph after clicking paper blank space before the final block", async () => {
    const { container, view } = await renderEditor("First\n\nSecond\n\nThird");

    mockTopLevelBlockRects(container, [
      {
        bottom: 128,
        height: 28,
        left: 160,
        right: 640,
        top: 100,
        width: 480,
        x: 160,
        y: 100,
        toJSON: () => ({})
      },
      {
        bottom: 188,
        height: 28,
        left: 160,
        right: 640,
        top: 160,
        width: 480,
        x: 160,
        y: 160,
        toJSON: () => ({})
      },
      {
        bottom: 248,
        height: 28,
        left: 160,
        right: 640,
        top: 220,
        width: 480,
        x: 160,
        y: 220,
        toJSON: () => ({})
      }
    ] as DOMRect[]);

    fireEvent.mouseDown(screen.getByLabelText("Markdown editor"), {
      button: 0,
      clientX: 672,
      clientY: 174
    });

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(2).textContent).toBe("Third");
  });

  it("creates a trailing paragraph after clicking paper blank space below a terminal body paragraph", async () => {
    const { editor, view } = await renderEditor("Synthetic body");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    fireEvent.mouseDown(screen.getByLabelText("Markdown editor"), { button: 0 });

    await waitFor(() => expect(view.state.doc.childCount).toBe(2));
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);

    typeText(view, "Next body");

    expect(view.state.doc.child(1).textContent).toBe("Next body");
    expect(serializeMarkdown(view.state.doc)).toContain("Next body");
  });

  it("creates a trailing paragraph after clicking past terminal display math", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    let trailingAffordance: HTMLElement | null = null;

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
      trailingAffordance = container.querySelector(".ProseMirror .markra-trailing-paragraph");
      expect(trailingAffordance).toBeInTheDocument();
    });

    fireEvent.mouseDown(trailingAffordance!);

    await waitFor(() => expect(view.state.doc.childCount).toBe(2));
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);

    typeText(view, "After formula");

    expect(view.state.doc.child(1).textContent).toBe("After formula");
    expect(serializeMarkdown(view.state.doc)).toContain(source);
    expect(serializeMarkdown(view.state.doc)).toContain("After formula");
  });

  it("creates a trailing paragraph after clicking paper blank space below terminal display math", async () => {
    const source = String.raw`$$ E = mc^2 $$`;
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror .markra-math-render-display")).toBeInTheDocument();
      expect(container.querySelector(".ProseMirror .markra-trailing-paragraph")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByLabelText("Markdown editor"), { button: 0 });

    await waitFor(() => expect(view.state.doc.childCount).toBe(2));
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.doc.child(1).content.size).toBe(0);

    typeText(view, "After formula");

    expect(view.state.doc.child(1).textContent).toBe("After formula");
    expect(serializeMarkdown(view.state.doc)).toContain(source);
    expect(serializeMarkdown(view.state.doc)).toContain("After formula");
  });

  it.each([
    { label: "level 1 heading", source: "# Terminal heading" },
    { label: "level 2 heading", source: "## Terminal heading" }
  ])("creates a trailing paragraph after clicking editor blank space below a terminal $label", async ({ source }) => {
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    fireEvent.mouseDown(view.dom, { button: 0 });

    await waitFor(() => expect(view.state.doc.child(view.state.doc.childCount - 1).type.name).toBe("paragraph"));
    expect(view.state.doc.child(view.state.doc.childCount - 1).content.size).toBe(0);

    typeText(view, "After heading");

    expect(serializeMarkdown(view.state.doc)).toContain("After heading");
  });

  it("renders GitHub-style alert blockquotes as callouts while preserving Markdown source", async () => {
    const source = "> [!NOTE]\n> Keep this in mind.";
    const { container, editor, view } = await renderEditor(source);

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");

    expect(callout).toBeInTheDocument();
    expect(callout).toHaveAttribute("data-callout-type", "note");
    expect(callout).toHaveAttribute("data-callout-label", "Note");
    expect(callout?.querySelector(".markra-callout-title")).toHaveTextContent("Note");
    expect(callout).toHaveTextContent("Keep this in mind.");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain(source);
  });

  it("renders Typora-exported escaped alert markers as callouts with nested lists", async () => {
    const source = [
      "> **\\[!NOTE]**",
      ">",
      "> - Synthetic parent",
      ">",
      ">   - Nested detail"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");

    expect(callout).toBeInTheDocument();
    expect(callout).toHaveAttribute("data-callout-type", "note");
    expect(callout?.querySelector(".markra-callout-title")).toHaveTextContent("Note");
    expect(callout?.querySelectorAll("ul li")).toHaveLength(2);
    expect(callout?.querySelector("ul ul li")).toHaveTextContent("Nested detail");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> [!NOTE]");
    expect(markdown).not.toContain("\\[!NOTE]");
    expect(markdown).not.toContain("**[!NOTE]**");
  });

  it("continues callout list items when pressing Enter", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> - First");

    moveCursor(view, findTextPosition(view, "First", "First".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    typeText(view, "Second");

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    expect(callout?.querySelectorAll("ul li")).toHaveLength(2);
    expect(callout).toHaveTextContent("First");
    expect(callout).toHaveTextContent("Second");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n> - Second");
  });

  it("exits callout lists on Enter from an empty list item", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> - First");

    moveCursor(view, findTextPosition(view, "First", "First".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(false);

    typeText(view, "After list");

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    expect(callout?.querySelectorAll("ul li")).toHaveLength(1);
    expect(callout).toHaveTextContent("First");
    expect(callout).toHaveTextContent("After list");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n>\n> After list");
  });

  it("exits callouts on Enter from a blank body line after a list", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> - First");

    moveCursor(view, findTextPosition(view, "First", "First".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(false);

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    typeText(view, "After callout");

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    expect(callout?.querySelectorAll("ul li")).toHaveLength(1);
    expect(callout).toHaveTextContent("First");
    expect(callout).not.toHaveTextContent("After callout");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n\nAfter callout");
  });

  it("keeps callout list source tight after exiting the list with Enter", async () => {
    const onMarkdownChange = vi.fn();
    const { editor, view } = await renderEditor("> [!NOTE]\n>", { onMarkdownChange });

    typeText(view, "- 1");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "21");
    expect(pressEnter(view)).toBe(true);
    typeText(view, "21");
    expect(pressEnter(view)).toBe(true);
    expect(pressEnter(view)).toBe(true);
    typeText(view, "Synthetic details");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - 1\n> - 21\n> - 21\n>\n> Synthetic details");
    expect(markdown).not.toContain("> - 1\n>\n> - 21");
    expect(markdown).not.toContain("> - 21\n>\n> - 21");

    await settleMarkdownListener();
    const savedMarkdown = onMarkdownChange.mock.lastCall?.[0] ?? "";
    expect(savedMarkdown).toContain("> - 1\n> - 21\n> - 21\n>\n> Synthetic details");
    expect(savedMarkdown).not.toContain("> - 1\n>\n> - 21");
    expect(savedMarkdown).not.toContain("> - 21\n>\n> - 21");
  });

  it("keeps loaded callout list source tight when the marker has a blank body line", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - First",
      ">",
      "> - Second",
      ">",
      "> - Third"
    ].join("\n");
    const { editor, view } = await renderEditor(source);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);

    expect(markdown).toContain("> - First\n> - Second\n> - Third");
    expect(markdown).not.toContain("> - First\n>\n> - Second");
    expect(markdown).not.toContain("> - Second\n>\n> - Third");
  });

  it("nests and lifts callout list items with Tab like ordinary lists", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> - First\n> - Second");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    let topLevelItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li")
    );
    let nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote.markra-callout > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(1);
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second");
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n>   - Second");

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    topLevelItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li")
    );
    nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote.markra-callout > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(2);
    expect(nestedItems).toHaveLength(0);
    expect(topLevelItems[1]).toHaveTextContent("Second");
    expect(serializeMarkdown(view.state.doc)).toContain("> - First\n> - Second");
  });

  it("nests the first item of an adjacent mixed-marker callout bullet list with Tab", async () => {
    const source = ["> [!NOTE]", ">", "> - Parent", ">", "> * Child"].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Child"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    const topLevelItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li")
    );
    const nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote.markra-callout > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(1);
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Child");
    expect(serializeMarkdown(view.state.doc)).toContain(">   - Child");
    await settleMarkdownListener();
  });

  it("nests only the current callout list item when Tab is pressed before following siblings", async () => {
    const source = ["> [!NOTE]", ">", "> - A", "> - B", "> - C", "> - D"].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "C"));

    expect(pressShortcut(view, "Tab")).toBe(true);

    expect(serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0)).toEqual([
      "> [!NOTE]",
      ">",
      "> - A",
      "> - B",
      ">   - C",
      "> - D"
    ]);
  });

  it("lifts only the current callout list item with Shift+Tab", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - First child",
      ">   - Second child",
      "> - After"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "First child"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const topLevelItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li")
    );
    const nestedItems = Array.from(container.querySelectorAll<HTMLElement>(
      ".ProseMirror blockquote.markra-callout > ul > li > ul > li"
    ));
    expect(topLevelItems).toHaveLength(3);
    expect(topLevelItems[0]).toHaveTextContent("Parent");
    expect(topLevelItems[1]).toHaveTextContent("First child");
    expect(topLevelItems[2]).toHaveTextContent("After");
    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second child");

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Parent\n> - First child\n>   - Second child\n> - After");
  });

  it("lifts callout list items without reducing following sibling indentation", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - First child",
      ">   - Second child",
      ">     - Nested detail",
      ">   - Third child",
      "> - After"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second child"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const lines = serializeMarkdown(view.state.doc).split("\n").filter((line) => line.length > 0);
    expect(lines).toEqual([
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - First child",
      "> - Second child",
      ">   - Nested detail",
      ">   - Third child",
      "> - After"
    ]);
  });

  it("lifts only the active callout continuation paragraph with Shift+Tab", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - s",
      ">   - sa",
      ">   - sd",
      ">     - sad",
      ">     - sad",
      ">     - First detail",
      ">       Second detail"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second detail"));

    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);

    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain(">     - First detail\n>   - Second detail");
    expect(markdown).not.toContain(">   - First detail\n>     Second detail");
  });

  it("keeps callout continuation Shift+Tab undoable as one step", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - s",
      ">   - sa",
      ">   - sd",
      ">     - sad",
      ">     - sad",
      ">     - First detail",
      ">       Second detail"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    moveCursor(view, findTextPosition(view, "Second detail"));
    expect(pressShortcut(view, "Tab", { shiftKey: true })).toBe(true);
    expect(serializeMarkdown(view.state.doc)).toContain(">     - First detail\n>   - Second detail");

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);
    expect(serializeMarkdown(view.state.doc)).toContain(">     - First detail\n>       Second detail");
    expect(serializeMarkdown(view.state.doc)).not.toContain(">     - First detail\n>   - Second detail");

    expect(pressShortcut(view, "z", { metaKey: true, shiftKey: true })).toBe(true);
    expect(serializeMarkdown(view.state.doc)).toContain(">     - First detail\n>   - Second detail");
  });

  it("continues typed list items inside callouts on Enter", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>");

    typeText(view, "- Synthetic item");

    const listItem = container.querySelector(".ProseMirror blockquote.markra-callout ul li");
    expect(listItem).toHaveTextContent("Synthetic item");

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Second item");

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    expect(callout?.querySelectorAll("ul li")).toHaveLength(2);
    expect(callout?.querySelectorAll("ul li")[1]).toHaveTextContent("Second item");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> - Synthetic item\n> - Second item");
  });

  it("leaves GitHub-style alert blockquotes plain when the extension is disabled", async () => {
    const { container } = await renderEditor("> [!NOTE]\n> Keep this in mind.", {
      extendedSyntax: {
        githubAlerts: false,
        highlight: true
      }
    });

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toBeInTheDocument();
    const blockquote = container.querySelector(".ProseMirror blockquote");
    expect(blockquote).toHaveTextContent("[!NOTE]Keep this in mind.");
    expect(blockquote?.querySelector("br")).toBeInTheDocument();
    expect(container.querySelector(".markra-callout-title")).not.toBeInTheDocument();
  });

  it("marks empty callout source lines so the display has no spacer paragraph", async () => {
    const { container } = await renderEditor("> [!NOTE]\n>\n> Keep this in mind.");

    const markerLine = container.querySelector<HTMLElement>(
      ".ProseMirror blockquote.markra-callout .markra-callout-marker-line"
    );

    expect(markerLine).toBeInTheDocument();
    expect(markerLine).toHaveTextContent("[!NOTE]");
  });

  it("marks marker-only callout source lines before body content exists", async () => {
    const { container } = await renderEditor("> [!WARNING]");

    const markerLine = container.querySelector<HTMLElement>(
      ".ProseMirror blockquote.markra-callout .markra-callout-marker-line"
    );
    const sourceMarker = container.querySelector<HTMLElement>(
      ".ProseMirror blockquote.markra-callout .markra-callout-source-marker"
    );

    expect(markerLine).toBeInTheDocument();
    expect(markerLine).toHaveTextContent("[!WARNING]");
    expect(sourceMarker).toBeInTheDocument();
    expect(sourceMarker).toHaveTextContent("[!WARNING]");
  });

  it("preserves an explicit empty callout body line", async () => {
    const source = "> [!WARNING]\n>";
    const { container, editor, view } = await renderEditor(source);

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    const bodyParagraph = container.querySelector(".ProseMirror blockquote.markra-callout p:nth-of-type(2)");
    expect(callout).toBeInTheDocument();
    expect(bodyParagraph).toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);

    moveCursor(view, findLastTextBlockCursor(view));
    typeText(view, "Synthetic details");

    expect(callout).toHaveTextContent("Synthetic details");
    expect(serializeMarkdown(view.state.doc)).toBe("> [!WARNING]\n>\n> Synthetic details\n");
    await settleMarkdownListener();
  });

  it("moves a cursor from the hidden callout marker line into the empty body", async () => {
    const source = "> [!NOTE]\n>";
    const { container, editor, view } = await renderEditor(source);

    moveCursor(view, findTextPosition(view, "[!NOTE]", "[!NOTE]".length));

    expect(view.state.selection.$from.parent.textContent).toBe("");

    typeText(view, "Synthetic details");

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    expect(callout).toHaveTextContent("Synthetic details");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("> [!NOTE]\n>\n> Synthetic details\n");
    await settleMarkdownListener();
  });

  it("starts an empty loaded callout with the cursor in the editable body", async () => {
    const source = "> [!NOTE]\n>";
    const { container, editor, view } = await renderEditor(source);

    expect(view.state.selection.$from.parent.textContent).toBe("");

    typeText(view, "Synthetic details");

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    expect(callout).toHaveTextContent("Synthetic details");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("> [!NOTE]\n>\n> Synthetic details\n");
    await settleMarkdownListener();
  });

  it("preserves two explicit empty callout body lines", async () => {
    const source = "> [!WARNING]\n>\n>";
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(3);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("preserves trailing empty callout body lines after content", async () => {
    const source = "> [!WARNING]\n>\n> Synthetic details\n>\n>";
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(4);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe(`${source}\n`);
  });

  it("keeps an empty callout body line when pressing Enter to exit", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>");

    moveCursor(view, findLastTextBlockCursor(view));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(2);

    typeText(view, "After callout");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toBe("> [!NOTE]\n>\n\nAfter callout\n");
    await settleMarkdownListener();
  });

  it("keeps same-paragraph callout content visible", async () => {
    const { container } = await renderEditor("> [!WARNING]\n> Check before publishing.");

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");

    expect(callout).toHaveTextContent("Check before publishing.");
    expect(callout?.querySelector(".markra-callout-marker-line")).not.toBeInTheDocument();
  });

  it("updates the callout type without leaving GitHub Alerts syntax", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n> Keep this in mind.");

    const typeSelect = screen.getByRole("combobox", { name: "Callout type" });
    fireEvent.change(typeSelect, {
      target: {
        value: "warning"
      }
    });

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    expect(callout).toHaveAttribute("data-callout-type", "warning");
    expect(callout?.querySelector(".markra-callout-title")).toHaveTextContent("Warning");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n> Keep this in mind.");
  });

  it("renders links and images from existing markdown", async () => {
    const { container } = await renderEditor(
      "[Markra](https://example.com)\n\n![Markra logo](https://example.com/logo.png)"
    );

    const link = container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.com"]');
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="https://example.com/logo.png"]');

    expect(link).toHaveTextContent("Markra");
    expectLinkIconCount(container, 1);
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "Markra logo");
    await settleMarkdownListener();
  });

  it("renders raw HTML image badges from existing markdown", async () => {
    const source = [
      '<div style="display:flex;width:100%;justify-content:center;">',
      '<img src="https://example.test/badges/version.svg" />',
      '<img src="assets/example-badge.svg" alt="Example badge" />',
      "</div>"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source, {
      resolveImageSrc: (src) => src.startsWith("assets/") ? `asset://current-note/${src}` : src
    });

    const renderedHtml = container.querySelector<HTMLElement>('.ProseMirror [data-type="html"]');
    const remoteBadge = container.querySelector<HTMLImageElement>(
      '.ProseMirror img[src="https://example.test/badges/version.svg"]'
    );
    const localBadge = container.querySelector<HTMLImageElement>(
      '.ProseMirror img[src="asset://current-note/assets/example-badge.svg"]'
    );

    expect(renderedHtml).toBeInTheDocument();
    expect(renderedHtml).toHaveStyle({ display: "flex", justifyContent: "center", width: "100%" });
    expect(remoteBadge).toBeInTheDocument();
    expect(remoteBadge?.draggable).toBe(false);
    expect(localBadge).toHaveAttribute("alt", "Example badge");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("<img");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain('<img src="https://example.test/badges/version.svg" />');
  });

  it("keeps GitHub README HTML badge rows together", async () => {
    const source = [
      '<p align="center">',
      '  <img alt="Desktop" src="https://example.test/badges/desktop.svg" />',
      '  <img alt="Web Editor" src="https://example.test/badges/web-editor.svg" />',
      '  <a href="https://example.test/product">',
      '    <img alt="Product" src="https://example.test/badges/product.svg" />',
      "  </a>",
      "</p>"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);

    const renderedHtml = container.querySelector<HTMLElement>(".ProseMirror .markra-html-node");
    const centeredParagraph = renderedHtml?.querySelector<HTMLElement>('p[align="center"]');
    const badgeImages = renderedHtml?.querySelectorAll("img");
    const linkedBadge = renderedHtml?.querySelector<HTMLImageElement>(
      'a[href="https://example.test/product"] img[src="https://example.test/badges/product.svg"]'
    );

    expect(renderedHtml).toBeInTheDocument();
    expect(centeredParagraph).toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror .markra-html-node")).toHaveLength(1);
    expect(Array.from(badgeImages ?? []).map((image) => image.alt)).toEqual([
      "Desktop",
      "Web Editor",
      "Product"
    ]);
    expect(linkedBadge).toHaveAttribute("alt", "Product");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain('<p align="center">');
    expect(serializeMarkdown(view.state.doc)).toContain('<a href="https://example.test/product">');
  });

  it("hides empty Slidev wrapper tags without swallowing nearby markdown blocks", async () => {
    const source = [
      "<v-clicks>",
      "",
      "- **Duration**: synthetic session",
      "- **Format**: guided lab",
      "",
      "</v-clicks>",
      "",
      "| Variable | Purpose |",
      "| --- | --- |",
      "| `EXAMPLE_API_KEY` | Synthetic authentication |",
      "",
      "```mermaid",
      "graph TD",
      "  A[Global<br/>Rules] --> B[Project]",
      "```"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);

    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("<v-clicks>");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("</v-clicks>");
    expect(container.querySelectorAll(".ProseMirror ul li")).toHaveLength(2);
    expect(container.querySelector(".ProseMirror table")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector(".ProseMirror .markra-mermaid-render svg")).toBeInTheDocument());

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("<v-clicks>");
    expect(serializeMarkdown(view.state.doc)).toContain("</v-clicks>");
  });

  it("hides empty raw HTML wrapper boundary tags without swallowing markdown blocks", async () => {
    const source = [
      '<div class="text-center">',
      "",
      "## Synthetic questions?",
      "",
      "**Example Presenter**",
      "",
      "</div>"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);

    const surfaceText = container.querySelector(".ProseMirror")?.textContent ?? "";

    expect(surfaceText).toContain("Synthetic questions?");
    expect(surfaceText).toContain("Example Presenter");
    expect(surfaceText).not.toContain('<div class="text-center">');
    expect(surfaceText).not.toContain("</div>");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain('<div class="text-center">');
    expect(serializeMarkdown(view.state.doc)).toContain("</div>");
  });

  it("keeps raw HTML class attributes out of preview layout while preserving source", async () => {
    const source = [
      '<div class="text-center mt-20">',
      '  <h2 class="text-4xl font-bold">Synthetic title</h2>',
      '  <p class="mt-4">Synthetic body</p>',
      "</div>"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);

    const renderedHtml = container.querySelector<HTMLElement>('.ProseMirror [data-type="html"]');
    const heading = renderedHtml?.querySelector<HTMLElement>("h2");
    const paragraph = renderedHtml?.querySelector<HTMLElement>("p");

    expect(renderedHtml).toBeInTheDocument();
    expect(heading).toBeInTheDocument();
    expect(paragraph).toBeInTheDocument();
    expect(renderedHtml).not.toHaveClass("text-center");
    expect(renderedHtml).not.toHaveClass("mt-20");
    expect(heading).not.toHaveAttribute("class");
    expect(paragraph).not.toHaveAttribute("class");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain('<div class="text-center mt-20">');
    expect(serializeMarkdown(view.state.doc)).toContain('<h2 class="text-4xl font-bold">Synthetic title</h2>');
  });

  it("switches rendered HTML into editable source when clicked", async () => {
    const source = '<div class="example-badge">Alpha</div>';
    const { container, editor, view } = await renderEditor(source);

    const renderedHtml = container.querySelector<HTMLElement>('.ProseMirror [data-type="html"]');
    expect(renderedHtml).toHaveTextContent("Alpha");

    fireEvent.click(renderedHtml!);

    const sourceInput = screen.getByRole("textbox", { name: "HTML source" });
    const applyButton = screen.getByRole("button", { name: "Apply HTML source" });
    expect(container.querySelector(".ProseMirror .markra-html-node-editor-label")).toHaveTextContent("HTML");
    expect(container.querySelector(".ProseMirror .markra-html-token-tag")).toHaveTextContent("<div");
    expect(container.querySelector(".ProseMirror .markra-html-token-attr")).toHaveTextContent("class");
    expect(container.querySelector(".ProseMirror .markra-html-token-string")).toHaveTextContent('"example-badge"');
    expect(sourceInput).toHaveValue(source);

    fireEvent.change(sourceInput, { target: { value: '<div class="example-badge">Beta</div>' } });
    expect(container.querySelector(".ProseMirror .markra-html-node-highlight")).toHaveTextContent("Beta");
    fireEvent.mouseDown(applyButton);

    expect(container.querySelector(".ProseMirror .markra-html-node")).toHaveTextContent("Beta");
    expect(screen.queryByRole("textbox", { name: "HTML source" })).not.toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain('<div class="example-badge">Beta</div>');
  });

  it("returns rendered HTML source to preview after clicking editor blank space", async () => {
    const source = '<div class="example-badge">Alpha</div>';
    const { container, view } = await renderEditor(source);

    fireEvent.click(container.querySelector<HTMLElement>(".ProseMirror .markra-html-node")!);
    expect(screen.getByRole("textbox", { name: "HTML source" })).toBeInTheDocument();

    fireEvent.pointerDown(view.dom);

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "HTML source" })).not.toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-html-node")).toHaveTextContent("Alpha");
  });

  it("returns rendered HTML source to preview after clicking paper blank space", async () => {
    const source = '<div class="example-badge">Alpha</div>';
    const { container } = await renderEditor(source);

    fireEvent.click(container.querySelector<HTMLElement>(".ProseMirror .markra-html-node")!);
    expect(screen.getByRole("textbox", { name: "HTML source" })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByLabelText("Markdown editor"));

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "HTML source" })).not.toBeInTheDocument();
    });
    expect(container.querySelector(".ProseMirror .markra-html-node")).toHaveTextContent("Alpha");
  });

  it("keeps normal finalized link clicks editable and opens links with a modifier click", async () => {
    const openExternalUrl = vi.fn();
    const modifierCase = await renderEditor("[Markra](https://example.com)", { openExternalUrl });

    const modifierLink = modifierCase.container.querySelector<HTMLAnchorElement>(
      '.ProseMirror a[href="https://example.com"]'
    );
    expect(modifierLink).toBeInTheDocument();

    expect(fireEvent.mouseDown(modifierLink!, { metaKey: true })).toBe(false);
    modifierLink?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));

    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
    expect(modifierCase.container.querySelector(".ProseMirror")?.textContent).toBe("Markra");

    const editCase = await renderEditor("[Markra](https://example.com)", { openExternalUrl });
    const editableLink = editCase.container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.com"]');
    const editableSurface = editCase.container.querySelector<HTMLElement>(".ProseMirror");
    expect(editableLink).toBeInTheDocument();
    expect(editableSurface).not.toHaveClass("markra-link-open-modifier-active");

    fireEvent.keyDown(editableSurface!, { key: "Meta", metaKey: true });

    expect(editableSurface).toHaveClass("markra-link-open-modifier-active");

    fireEvent.keyUp(editableSurface!, { key: "Meta" });

    expect(editableSurface).not.toHaveClass("markra-link-open-modifier-active");

    expect(fireEvent.dragStart(editableLink!)).toBe(false);
    editableLink?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(editCase.container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com)");
    expectActiveSourceLinkLabel(editCase.container, "Markra");
    expect(editCase.container.querySelector(".ProseMirror .markra-live-link-mark-source-text")).not.toBeInTheDocument();
  });

  it("opens relative attachment links with the local attachment opener", async () => {
    const openExternalUrl = vi.fn();
    const openLocalAttachment = vi.fn();
    const { container } = await renderEditor("[Reference Doc](assets/reference.docx)", {
      openExternalUrl,
      openLocalAttachment
    });
    const link = container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="assets/reference.docx"]');

    expect(link).toBeInTheDocument();

    expect(fireEvent.mouseDown(link!, { ctrlKey: true })).toBe(false);
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));

    expect(openLocalAttachment).toHaveBeenCalledWith("assets/reference.docx");
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("opens absolute file attachment links with the local attachment opener", async () => {
    const openExternalUrl = vi.fn();
    const openLocalAttachment = vi.fn();
    const { container } = await renderEditor("[Reference Doc](file:///C:/mock-files/reference.docx)", {
      openExternalUrl,
      openLocalAttachment
    });
    const link = container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="file:///C:/mock-files/reference.docx"]');

    expect(link).toBeInTheDocument();

    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));

    expect(openLocalAttachment).toHaveBeenCalledWith("file:///C:/mock-files/reference.docx");
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("inserts a standard markdown document link from double-bracket completion", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", {
      documentPath: "/mock-files/vault/index.md",
      onMarkdownChange,
      workspaceFiles: [
        { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
        { name: "Guide Notes.md", path: "/mock-files/vault/docs/Guide Notes.md", relativePath: "docs/Guide Notes.md" },
        { kind: "asset", name: "cover.png", path: "/mock-files/vault/cover.png", relativePath: "cover.png" }
      ]
    });

    typeText(view, "[[guide");

    expect(await screen.findByRole("listbox", { name: "Document links" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Guide Notes docs/Guide Notes.md" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    expect(pressEnter(view)).toBe(true);
    expect(screen.queryByRole("listbox", { name: "Document links" })).not.toBeInTheDocument();
    expect(container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="./docs/Guide%20Notes.md"]')).toHaveTextContent(
      "Guide Notes"
    );

    await settleMarkdownListener();
    const changedMarkdown = String(onMarkdownChange.mock.calls.at(-1)?.[0] ?? "");
    expect(changedMarkdown).toContain("[Guide Notes](./docs/Guide%20Notes.md)");
    expect(changedMarkdown).not.toContain("[[guide");
  });

  it("expands finalized links into editable markdown source", async () => {
    const { container, editor, view } = await renderEditor("[Markra](https://example.com) after");

    const link = container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.com"]');
    expect(link).toBeInTheDocument();
    expectLinkIconCount(container, 1);

    expect(fireEvent.dragStart(link!)).toBe(false);
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expectLinkIconCount(container, 0);
    expect(container.querySelector(".ProseMirror .markra-live-link-mark-source-text")).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com) after");
    expectActiveSourceLinkLabel(container, "Markra");

    const hrefFrom = findTextPosition(view, "https://example.com");
    selectText(view, hrefFrom, hrefFrom + "https://example.com".length);

    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-delimiter")).toHaveLength(2);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com) after");

    insertTextDirectly(view, "https://edited.example");

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://edited.example) after");
    expect(pressEnter(view)).toBe(true);
    expect(container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://edited.example"]')).toHaveTextContent(
      "Markra"
    );

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("[Markra](https://edited.example)");
  });

  it("serializes edited expanded links as markdown instead of escaped text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("[About us](https://example.test/articles/about)", {
      onMarkdownChange
    });

    const link = container.querySelector<HTMLAnchorElement>(
      '.ProseMirror a[href="https://example.test/articles/about"]'
    );
    expect(link).toBeInTheDocument();

    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const labelFrom = findTextPosition(view, "About us");
    selectText(view, labelFrom, labelFrom + "About us".length);
    insertTextDirectly(view, "Edited about us");

    await waitFor(() => {
      expect(
        onMarkdownChange.mock.calls.some(([markdown]) =>
          String(markdown).includes("[Edited about us](https://example.test/articles/about)")
        )
      ).toBe(true);
    });

    const latestMarkdown = String(onMarkdownChange.mock.calls.at(-1)?.[0] ?? "");
    expect(latestMarkdown).not.toContain("\\[Edited about us\\]");
    expect(latestMarkdown).not.toContain("\\(https\\://example.test/articles/about\\)");
  });

  it("renders local image markdown with resolved preview sources", async () => {
    const { container } = await renderEditor("![Screenshot](assets/pasted-image.png)", {
      resolveImageSrc: (src) => `asset://current-note/${src}`
    });

    const image = container.querySelector<HTMLImageElement>(
      '.ProseMirror img[src="asset://current-note/assets/pasted-image.png"]'
    );
    const imageNode = image?.closest<HTMLElement>(".markra-image-node");

    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "Screenshot");
    expect(imageNode?.draggable).toBe(false);
    expect(image?.draggable).toBe(false);
    expect(fireEvent.dragStart(imageNode!)).toBe(false);
  });

  it("renders standalone images as top-level image nodes", async () => {
    const { container, view } = await renderEditor("![Screenshot](assets/pasted-image.png)");
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    const imageNode = image?.closest<HTMLElement>(".markra-image-node");

    expect(view.state.doc.child(0).type.name).toBe("image");
    expect(imageNode?.parentElement).toBe(container.querySelector(".ProseMirror"));
  });

  it("renders escaped image alt text as a finalized image node", async () => {
    const { container, view } = await renderEditor(String.raw`![A \] bracket \\ slash](assets/image.png)`);
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/image.png"]');

    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", String.raw`A ] bracket \ slash`);
    expect(view.state.doc.child(0).type.name).toBe("image");
  });

  it("splits paragraph image markdown into block image nodes", async () => {
    const { container, view } = await renderEditor("Before ![Screenshot](assets/pasted-image.png) after");
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.child(0).textContent).toBe("Before");
    expect(view.state.doc.child(1).type.name).toBe("image");
    expect(view.state.doc.child(2).type.name).toBe("paragraph");
    expect(view.state.doc.child(2).textContent).toBe("after");
    expect(image?.closest(".markra-image-node")?.parentElement).toBe(container.querySelector(".ProseMirror"));
  });

  it("keeps image markdown source stable when editing surrounding text", async () => {
    const source = ["Intro", "", "![Screenshot](assets/pasted-image.png)", "", "Outro"].join("\n");
    const onMarkdownChange = vi.fn();
    const { editor, view } = await renderEditor(source, { onMarkdownChange });
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const expectedMarkdown = ["Intro updated", "", "![Screenshot](assets/pasted-image.png)", "", "Outro", ""].join(
      "\n"
    );

    moveCursor(view, findTextPosition(view, "Intro", "Intro".length));
    typeText(view, " updated");
    await settleMarkdownListener();

    expect(serializeMarkdown(view.state.doc)).toBe(expectedMarkdown);
    expect(onMarkdownChange).toHaveBeenLastCalledWith(expectedMarkdown);
  });

  it("shows finalized image markdown source when the image is clicked", async () => {
    const { container, editor, view } = await renderEditor("![Screenshot](assets/pasted-image.png)");

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    expect(clickFinalizedImage(image!)).toBe(false);

    const sourceRow = container.querySelector<HTMLElement>(".ProseMirror .markra-image-node-source-row");
    expect(sourceRow?.querySelector(".markra-image-node-source-icon")).toHaveAttribute("aria-hidden", "true");

    const source = container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source");
    expect(source).toHaveValue("![Screenshot](assets/pasted-image.png)");
    expect(image?.closest(".markra-image-node")).toHaveClass("markra-image-node-selected");
    expect(image?.closest(".markra-image-node")).not.toHaveClass("ProseMirror-selectednode");

    fireEvent.change(source!, { target: { value: "![Edited screenshot](assets/edited.png)" } });

    expect(source).toHaveValue("![Edited screenshot](assets/edited.png)");
    expect(container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/edited.png"]')).toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("![Edited screenshot](assets/edited.png)");
  });

  it("moves from finalized image source editing to a new paragraph on Enter", async () => {
    const { container, editor, view } = await renderEditor("![Screenshot](assets/pasted-image.png)");
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    expect(clickFinalizedImage(image!)).toBe(false);

    const source = container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source");
    expect(source).toHaveValue("![Screenshot](assets/pasted-image.png)");

    fireEvent.mouseDown(source!);
    await waitFor(() => expect(source).toHaveFocus());

    expect(fireEvent.keyDown(source!, { key: "Enter" })).toBe(false);

    expect(container.querySelector(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();
    expect(view.state.doc.child(0).type.name).toBe("image");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");

    typeText(view, "Next");

    expect(serializeMarkdown(view.state.doc)).toBe("![Screenshot](assets/pasted-image.png)\n\nNext\n");
  });

  it("removes the image source Enter paragraph on Backspace", async () => {
    const { container, view } = await renderEditor("![Screenshot](assets/pasted-image.png)");

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    expect(clickFinalizedImage(image!)).toBe(false);

    const source = container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source");
    expect(source).toHaveValue("![Screenshot](assets/pasted-image.png)");
    expect(fireEvent.keyDown(source!, { key: "Enter" })).toBe(false);

    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(pressBackspace(view)).toBe(true);

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.child(0).type.name).toBe("image");
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("deletes the selected finalized image block on Backspace", async () => {
    const { container, editor, view } = await renderEditor(
      ["Intro", "", "![Screenshot](assets/pasted-image.png)", "", "Outro"].join("\n")
    );
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');

    expect(image).toBeInTheDocument();

    clickFinalizedImage(image!);
    await waitFor(() => expect(view.state.selection).toBeInstanceOf(NodeSelection));

    expect(fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true })).toBe(false);

    expect(
      container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]')
    ).not.toBeInTheDocument();
    expect(serializeMarkdown(view.state.doc)).toContain("Intro");
    expect(serializeMarkdown(view.state.doc)).toContain("Outro");
    expect(serializeMarkdown(view.state.doc)).not.toContain("assets/pasted-image.png");
  });

  it("deletes a finalized image when its markdown source is cleared", async () => {
    const { container, editor, view } = await renderEditor("Intro\n\n![Screenshot](assets/pasted-image.png)");

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    expect(clickFinalizedImage(image!)).toBe(false);

    const source = container.querySelector<HTMLInputElement>(".ProseMirror .markra-image-node-source");
    expect(source).toHaveValue("![Screenshot](assets/pasted-image.png)");

    fireEvent.change(source!, { target: { value: "" } });

    expect(
      container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]')
    ).not.toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).not.toContain("![Screenshot](assets/pasted-image.png)");
  });

  it("hides finalized image markdown source when another editor area is pressed", async () => {
    const { container } = await renderEditor("Intro\n\n![Screenshot](assets/pasted-image.png)");

    const image = container.querySelector<HTMLImageElement>('.ProseMirror img[src="assets/pasted-image.png"]');
    expect(image).toBeInTheDocument();

    expect(clickFinalizedImage(image!)).toBe(false);
    expect(container.querySelector(".ProseMirror .markra-image-node-source")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(container.querySelector(".ProseMirror .markra-image-node-source")).not.toBeInTheDocument();
  });

  it("keeps typed link markdown editable and styles the label live", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "[Markra](https://example.com)");

    expectActiveSourceLinkLabel(container, "Markra");
    expect(container.querySelector('.ProseMirror a[href="https://example.com"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-delimiter")).toHaveLength(2);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com)");
    await settleMarkdownListener();
  });

  it("turns pasted standalone URLs into finalized links", async () => {
    const { container, editor, view } = await renderEditor();

    expect(pasteText(view, "https://example.test/articles/about")).toBe(true);

    const link = container.querySelector<HTMLAnchorElement>(
      '.ProseMirror a[href="https://example.test/articles/about"]'
    );
    expect(link).toHaveTextContent("https://example.test/articles/about");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("<https://example.test/articles/about>");
    await settleMarkdownListener();
  });

  it("pastes URLs over a selected raw image source as plain text", async () => {
    const onMarkdownChange = vi.fn();
    const { container, view } = await renderEditor("", { onMarkdownChange });
    const pastedSrc = "https://cdn.example.test/images/pasted.png";

    insertTextDirectly(view, "![alt](assets/image.png)");
    const sourceFrom = findTextPosition(view, "assets/image.png");
    selectText(view, sourceFrom, sourceFrom + "assets/image.png".length);

    expect(pasteText(view, pastedSrc)).toBe(true);

    expect(container.querySelector<HTMLAnchorElement>(`.ProseMirror a[href="${pastedSrc}"]`)).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")?.textContent).toBe(`![alt](${pastedSrc})`);

    await waitFor(() => expect(onMarkdownChange).toHaveBeenCalledWith(expect.stringContaining(`![alt](${pastedSrc})`)));
  });

  it("keeps typed image markdown editable until it folds into a live preview", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "![Markra logo](https://example.com/logo.png) after");
    moveCursor(view, findTextPosition(view, "Markra logo", "Markra logo".length));

    expect(container.querySelector(".ProseMirror img.markra-live-image-preview")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror .markra-live-image-source.markra-md-delimiter")).toHaveLength(1);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe(
      "![Markra logo](https://example.com/logo.png) after"
    );

    moveCursor(view, findTextPosition(view, "after", "after".length));

    const image = expectLiveImagePreview(container, "https://example.com/logo.png");
    expect(image).toHaveAttribute("alt", "Markra logo");
    expect(
      container.querySelectorAll(".ProseMirror .markra-live-image-source.markra-md-hidden-delimiter")
    ).toHaveLength(1);
    await settleMarkdownListener();
  });

  it("folds raw link markdown when the cursor leaves the source", async () => {
    const { container, view } = await renderEditor();

    insertTextDirectly(view, "[Markra](https://example.com) after");
    moveCursor(view, findTextPosition(view, "Markra", "Markra".length));

    expectActiveSourceLinkLabel(container, "Markra");
    expectLinkIconCount(container, 0);
    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-delimiter")).toHaveLength(2);

    moveCursor(view, findTextPosition(view, "after", "after".length));

    expectLiveLink(container, "Markra");
    expectLinkIconCount(container, 1);
    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-hidden-delimiter")).toHaveLength(
      2
    );
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com) after");
    await settleMarkdownListener();
  });

  it("folds raw link markdown after clicking editor blank space", async () => {
    const { container, view } = await renderEditor();

    insertTextDirectly(view, "[Markra](https://example.com)");
    moveCursor(view, findTextPosition(view, "Markra", "Markra".length));

    expectActiveSourceLinkLabel(container, "Markra");
    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-delimiter")).toHaveLength(2);

    fireEvent.pointerDown(view.dom);

    await waitFor(() => {
      expectLiveLink(container, "Markra");
    });
    expect(container.querySelectorAll(".ProseMirror .markra-live-link-source.markra-md-hidden-delimiter")).toHaveLength(
      2
    );
    await settleMarkdownListener();
  });

  it("folds typed image markdown after clicking paper blank space", async () => {
    const { container, view } = await renderEditor();

    insertTextDirectly(view, "![Markra logo](https://example.com/logo.png)");
    moveCursor(view, findTextPosition(view, "Markra logo", "Markra logo".length));

    expect(container.querySelector(".ProseMirror img.markra-live-image-preview")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror .markra-live-image-source.markra-md-delimiter")).toHaveLength(1);

    fireEvent.pointerDown(screen.getByLabelText("Markdown editor"));

    await waitFor(() => {
      expectLiveImagePreview(container, "https://example.com/logo.png");
    });
    expect(
      container.querySelectorAll(".ProseMirror .markra-live-image-source.markra-md-hidden-delimiter")
    ).toHaveLength(1);
    await settleMarkdownListener();
  });

  it("finalizes raw link and image markdown on enter", async () => {
    const linkCase = await renderEditor();
    insertTextDirectly(linkCase.view, "[Markra](https://example.com)");

    expect(linkCase.container.querySelector(".ProseMirror")?.textContent).toBe("[Markra](https://example.com)");
    expect(pressEnter(linkCase.view)).toBe(true);

    const link = linkCase.container.querySelector<HTMLAnchorElement>('.ProseMirror a[href="https://example.com"]');
    expect(link).toHaveTextContent("Markra");
    expect(linkCase.container.querySelector(".ProseMirror")?.textContent).toBe("Markra");
    expect(linkCase.container.querySelector(".ProseMirror .markra-live-link-mark-source-text")).not.toBeInTheDocument();

    const imageCase = await renderEditor();
    insertTextDirectly(imageCase.view, "![Markra logo](https://example.com/logo.png)");

    expect(imageCase.container.querySelector(".ProseMirror")?.textContent).toBe(
      "![Markra logo](https://example.com/logo.png)"
    );
    expect(pressEnter(imageCase.view)).toBe(true);

    const image = imageCase.container.querySelector<HTMLImageElement>(
      '.ProseMirror img[src="https://example.com/logo.png"]'
    );
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("alt", "Markra logo");
    await settleMarkdownListener();
  });

  it("turns list and quote markdown shortcuts into styled blocks", async () => {
    const bullet = await renderEditor();
    typeText(bullet.view, "- item");

    expect(bullet.container.querySelector(".ProseMirror ul li")).toHaveTextContent("item");
    expect(bullet.container.querySelector(".ProseMirror")?.textContent).toBe("item");
    {
      const serializeMarkdown = bullet.editor.action((ctx) => ctx.get(serializerCtx));
      expect(serializeMarkdown(bullet.view.state.doc)).toBe("- item\n");
    }

    const ordered = await renderEditor();
    typeText(ordered.view, "1. item");

    expect(ordered.container.querySelector(".ProseMirror ol li")).toHaveTextContent("item");
    expect(ordered.container.querySelector(".ProseMirror")?.textContent).toBe("item");

    const quote = await renderEditor();
    typeText(quote.view, "> quote");

    expect(quote.container.querySelector(".ProseMirror blockquote")).toHaveTextContent("quote");
    expect(quote.container.querySelector(".ProseMirror")?.textContent).toBe("quote");
    await settleMarkdownListener();
  });

  it("opens and dismisses the slash command menu from an empty block", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "/");

    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Heading 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Code Block" })).toBeInTheDocument();

    expect(pressShortcut(view, "Escape")).toBe(true);

    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument());
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("/");
    await settleMarkdownListener();
  });

  it("closes the slash command menu after clicking outside it", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "/");

    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument());
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("/");
    await settleMarkdownListener();
  });

  it("keeps the slash command menu inside the viewport when opened near the bottom", async () => {
    const { view } = await renderEditor();
    const innerHeight = vi.spyOn(window, "innerHeight", "get").mockReturnValue(640);
    const innerWidth = vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(700);
    const offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(240);
    const coordsAtPos = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 578,
      left: 120,
      right: 140,
      top: 560
    });

    try {
      typeText(view, "/");

      const menu = await screen.findByRole("listbox", { name: "Slash commands" });

      expect(Number.parseFloat(menu.style.top)).toBeLessThan(560);
      expect(menu.style.maxHeight).toBe("544px");
      expect(menu.style.overflowY).toBe("auto");
    } finally {
      coordsAtPos.mockRestore();
      offsetWidth.mockRestore();
      offsetHeight.mockRestore();
      innerWidth.mockRestore();
      innerHeight.mockRestore();
    }
  });

  it("closes the document link completion menu after clicking outside it", async () => {
    const { container, view } = await renderEditor("", {
      documentPath: "/vault/current.md",
      workspaceFiles: [
        { name: "guide.md", path: "/vault/guide.md", relativePath: "guide.md" },
        { name: "notes.md", path: "/vault/notes.md", relativePath: "notes.md" }
      ]
    });

    typeText(view, "[[guide");

    expect(await screen.findByRole("listbox", { name: "Document links" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Document links" })).not.toBeInTheDocument());
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("[[guide");
    await settleMarkdownListener();
  });

  it("keeps the document link completion menu inside the viewport when opened near the bottom", async () => {
    const { view } = await renderEditor("", {
      documentPath: "/vault/current.md",
      workspaceFiles: [
        { name: "guide.md", path: "/vault/guide.md", relativePath: "guide.md" },
        { name: "guide-two.md", path: "/vault/guide-two.md", relativePath: "guide-two.md" }
      ]
    });
    const innerHeight = vi.spyOn(window, "innerHeight", "get").mockReturnValue(640);
    const innerWidth = vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(700);
    const offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(240);
    const coordsAtPos = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 578,
      left: 120,
      right: 140,
      top: 560
    });

    try {
      typeText(view, "[[guide");

      const menu = await screen.findByRole("listbox", { name: "Document links" });

      expect(Number.parseFloat(menu.style.top)).toBeLessThan(560);
      expect(menu.style.maxHeight).toBe("544px");
      expect(menu.style.overflowY).toBe("auto");
    } finally {
      coordsAtPos.mockRestore();
      offsetWidth.mockRestore();
      offsetHeight.mockRestore();
      innerWidth.mockRestore();
      innerHeight.mockRestore();
    }
  });

  it("filters slash commands and inserts a code block from the keyboard", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "/co");

    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Code Block" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("option", { name: "Heading 1" })).not.toBeInTheDocument();

    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror .markra-code-block")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("/co");
    await settleMarkdownListener();
  });

  it("inserts a table from the slash command menu", async () => {
    const { container, view } = await renderEditor();

    typeText(view, "/ta");

    const tableOption = await screen.findByRole("option", { name: "Table" });
    fireEvent.mouseDown(tableOption);

    await waitFor(() => expect(container.querySelector(".ProseMirror table")).toBeInTheDocument());
    const headerCells = Array.from(container.querySelectorAll(".ProseMirror table tr:first-child th")).map(
      (cell) => cell.textContent
    );
    expect(headerCells).toEqual(["", ""]);
    expect(container.querySelector(".ProseMirror table")).not.toHaveTextContent("Column 1");
    expect(container.querySelector(".ProseMirror table")).not.toHaveTextContent("Column 2");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("/ta");
    await settleMarkdownListener();
  });

  it("copies selected tables as markdown plain text", async () => {
    const tableMarkdown = ["| Alpha | Beta |", "| --- | --- |", "| Gamma | Delta |"].join("\n");
    const { view } = await renderEditor(tableMarkdown);
    const expectedClipboardMarkdown = ["| Alpha | Beta  |", "| ----- | ----- |", "| Gamma | Delta |"].join("\n");

    selectNode(view, findNodeStartPosition(view, "table"));

    expect(selectedPlainClipboardText(view)).toBe(expectedClipboardMarkdown);
  });

  it("copies selected text inside a table cell as plain text", async () => {
    const tableMarkdown = ["| Alpha | Beta |", "| --- | --- |", "| Gamma | Delta |"].join("\n");
    const { view } = await renderEditor(tableMarkdown);

    selectText(view, findTextPosition(view, "Alpha", 1), findTextPosition(view, "Alpha", 4));

    expect(selectedPlainClipboardText(view)).toBe("lph");
  });

  it("copies selected text inside a table cell without table html", async () => {
    const tableMarkdown = ["| Alpha | Beta |", "| --- | --- |", "| Gamma | Delta |"].join("\n");
    const { view } = await renderEditor(tableMarkdown);

    selectText(view, findTextPosition(view, "Alpha"), findTextPosition(view, "Alpha", "Alpha".length));

    const clipboardData = dispatchCopy(view);

    expect(clipboardData.get("text/plain")).toBe("Alpha");
    expect(clipboardData.get("text/html") ?? "").not.toContain("<table");
  });

  it("copies table row clipboard slices as markdown plain text", async () => {
    const tableMarkdown = ["| Alpha | Beta |", "| --- | --- |", "| Gamma | Delta |"].join("\n");
    const { view } = await renderEditor(tableMarkdown);
    const table = findFirstProseNode(view, "table");
    const rows: ProseNode[] = [];

    table.forEach((row: ProseNode) => rows.push(row));

    const slice = new Slice(Fragment.from(rows), 1, 1);

    expect(plainClipboardTextFromSlice(view, slice)).toBe(
      ["| Alpha | Beta  |", "| ----- | ----- |", "| Gamma | Delta |"].join("\n")
    );
  });

  it("runs slash commands from a callout body line", async () => {
    const { container, view } = await renderEditor("> [!WARNING]\n>\n> ");

    moveCursor(view, findLastTextBlockCursor(view));
    typeText(view, "/ta");

    const tableOption = await screen.findByRole("option", { name: "Table" });
    fireEvent.mouseDown(tableOption);

    await waitFor(() => expect(container.querySelector(".ProseMirror blockquote.markra-callout table")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("/ta");
    await settleMarkdownListener();
  });

  it("runs selected slash commands from a callout body line with Enter", async () => {
    const { container, view } = await renderEditor("> [!WARNING]\n>\n> ");

    moveCursor(view, findLastTextBlockCursor(view));
    typeText(view, "/co");

    expect(await screen.findByRole("option", { name: "Code Block" })).toHaveAttribute("aria-selected", "true");
    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror blockquote.markra-callout .markra-code-block")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("/co");
    await settleMarkdownListener();
  });

  it("inserts a note callout from the slash command menu", async () => {
    const { container, editor, view } = await renderEditor();

    typeText(view, "/call");

    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Callout" })).toHaveAttribute("aria-selected", "true");

    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveAttribute("data-callout-type", "note");
    expect(container.querySelector(".ProseMirror")?.textContent).not.toContain("/call");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> [!NOTE]");
    expect(markdown).not.toContain("<br");
    await settleMarkdownListener();
  });

  it("uses slash command callout aliases as the inserted callout type", async () => {
    const { container, editor, view } = await renderEditor();

    typeText(view, "/warn");

    expect(await screen.findByRole("option", { name: "Callout" })).toHaveAttribute("aria-selected", "true");
    expect(pressEnter(view)).toBe(true);

    await waitFor(() => expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument());
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveAttribute("data-callout-type", "warning");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]");
    await settleMarkdownListener();
  });

  it("exits a typed callout when pressing Enter from the empty body", async () => {
    const { container, editor, view } = await renderEditor();

    typeText(view, "> [!WARNING]");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote.markra-callout .markra-callout-marker-line")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote.markra-callout .markra-callout-source-marker")).toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe("");

    focusEditor(view);
    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    typeText(view, "After callout");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("After callout");
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n\nAfter callout");
    await settleMarkdownListener();
  });

  it("exits a marker-only callout when pressing Enter before body content exists", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]");

    moveCursor(view, findTextPosition(view, "[!WARNING]", "[!WARNING]".length));

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    typeText(view, "After callout");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("After callout");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n\nAfter callout");
    await settleMarkdownListener();
  });

  it("continues callout body content when pressing Enter", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> First line");

    moveCursor(view, findTextPosition(view, "First line", "First line".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Second line");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("First line");
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("Second line");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> First line\n>\n> Second line");
    await settleMarkdownListener();
  });

  it("moves to a new callout body line after one Enter from typed callout content", async () => {
    const { editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "> [!WARNING]");
    typeText(view, "First line");

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(pressEnter(view)).toBe(true);

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe("");
    typeText(view, "Second line");
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> First line\n>\n> Second line");
    await settleMarkdownListener();
  });

  it("finalizes live markdown inside callout body content and continues on one Enter", async () => {
    const { container, editor, view } = await renderEditor();
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));

    typeText(view, "> [!WARNING]");
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(view.state.selection.$from.parent.textContent).toBe("");
    typeText(view, "**First line**");

    expectLiveMark(container, "strong", "First line");
    expect(pressEnter(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout strong")).toHaveTextContent("First line");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe("");

    typeText(view, "Second line");
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> **First line**\n>\n> Second line");
    await settleMarkdownListener();
  });

  it("removes the trailing empty callout line when Enter exits after body content", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> First line");

    moveCursor(view, findTextPosition(view, "First line", "First line".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(3);

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(2);

    typeText(view, "After callout");

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    expect(callout).toHaveTextContent("First line");
    expect(callout).not.toHaveTextContent("After callout");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> First line\n\nAfter callout");
    await settleMarkdownListener();
  });

  it("keeps a typed quote below a callout outside the callout block", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> First line");

    moveCursor(view, findTextPosition(view, "First line", "First line".length));

    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(pressEnter(view)).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    typeText(view, "> ");

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    const blockquotes = container.querySelectorAll(".ProseMirror blockquote");
    expect(callout).toHaveTextContent("First line");
    expect(callout).not.toHaveTextContent(">");
    expect(blockquotes).toHaveLength(2);
    expect(blockquotes[1]).not.toHaveClass("markra-callout");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Plain quote");

    expect(callout).not.toHaveTextContent("Plain quote");
    expect(blockquotes[1]).toHaveTextContent("Plain quote");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> First line\n\n> Plain quote");
    await settleMarkdownListener();
  });

  it("keeps Shift+Enter line breaks inside callout body content without hard-break escapes", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> First line");

    moveCursor(view, findTextPosition(view, "First line", "First line".length));

    expect(pressShortcut(view, "Enter", { shiftKey: true })).toBe(true);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Second line");

    const bodyParagraph = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout p:nth-of-type(2)");
    const hardbreak = bodyParagraph?.querySelector<HTMLElement>('span.markra-hardbreak[data-type="hardbreak"]');
    expect(hardbreak?.querySelector("br")).toBeInTheDocument();
    expect(hardbreak).toHaveTextContent("");
    const bodyHardbreak = view.state.doc.resolve(findTextPosition(view, "Second line")).parent.child(1);
    expect(bodyHardbreak.type.name).toBe("hardbreak");
    expect(bodyHardbreak.attrs.isInline).toBe(true);
    expect(bodyHardbreak.attrs.renderLineBreak).toBe(true);
    expect(bodyParagraph).toHaveTextContent("First lineSecond line");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> [!WARNING]\n>\n> First line\n> Second line");
    expect(markdown).not.toContain("> First line\n>\n> Second line");
    expect(markdown).not.toContain("\\");
    await settleMarkdownListener();
  });

  it("restores serialized callout body line breaks when loading Markdown source", async () => {
    const { container, editor, view } = await renderEditor("> [!WARNING]\n>\n> First line\n> Second line");

    const bodyParagraph = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout p:nth-of-type(2)");
    const hardbreak = bodyParagraph?.querySelector<HTMLElement>('span.markra-hardbreak[data-type="hardbreak"]');
    expect(hardbreak?.querySelector("br")).toBeInTheDocument();
    expect(hardbreak).toHaveTextContent("");
    const bodyHardbreak = view.state.doc.resolve(findTextPosition(view, "Second line")).parent.child(1);
    expect(bodyHardbreak.type.name).toBe("hardbreak");
    expect(bodyHardbreak.attrs.isInline).toBe(true);
    expect(bodyHardbreak.attrs.renderLineBreak).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> First line\n> Second line");
    await settleMarkdownListener();
  });

  it("finalizes a raw callout marker line into an editable callout on Enter", async () => {
    const { container, editor, view } = await renderEditor();

    insertTextDirectly(view, "> [!WARNING]");

    focusEditor(view);
    expect(fireEvent.keyDown(view.dom, { key: "Enter" })).toBe(false);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Synthetic details");

    const callout = container.querySelector(".ProseMirror blockquote.markra-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent("Synthetic details");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!WARNING]\n>\n> Synthetic details");
    await settleMarkdownListener();
  });

  it("keeps an empty callout editable after deleting its final body text", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> Synthetic detail");
    const bodyFrom = findTextPosition(view, "Synthetic detail");

    selectText(view, bodyFrom, bodyFrom + "Synthetic detail".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "Synthetic detail");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("Synthetic detail");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!NOTE]\n>\n> Synthetic detail");
    await settleMarkdownListener();
  });

  it("deletes an empty callout when pressing Backspace from its body", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> Synthetic detail");
    const bodyFrom = findTextPosition(view, "Synthetic detail");

    selectText(view, bodyFrom, bodyFrom + "Synthetic detail".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(false);

    typeText(view, "After delete");

    expect(container.querySelector(".ProseMirror")).toHaveTextContent("After delete");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("After delete");
    expect(markdown).not.toContain("[!NOTE]");
    await settleMarkdownListener();
  });

  it("keeps an emptied callout editable when Backspace is repeating", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> Synthetic detail");
    const bodyFrom = findTextPosition(view, "Synthetic detail");

    selectText(view, bodyFrom, bodyFrom + "Synthetic detail".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(pressBackspace(view, { repeat: true })).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "After repeat");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("After repeat");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!NOTE]\n>\n> After repeat");
    await settleMarkdownListener();
  });

  it("keeps an emptied callout editable while Backspace is held", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> A");
    const bodyFrom = findTextPosition(view, "A");

    moveCursor(view, bodyFrom + 1);

    expect(pressBackspace(view)).not.toBe(true);
    const deleteTransaction = view.state.tr.delete(bodyFrom, bodyFrom + 1);
    view.dispatch(
      deleteTransaction
        .setSelection(TextSelection.create(deleteTransaction.doc, bodyFrom))
        .scrollIntoView()
    );

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, "After hold");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("After hold");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!NOTE]\n>\n> After hold");
    await settleMarkdownListener();
  });

  it("keeps the cursor in a callout after deleting the last body line", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> First line\n>\n> Second line\n\nAfter callout");
    const bodyFrom = findTextPosition(view, "Second line");

    selectText(view, bodyFrom, bodyFrom + "Second line".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("First line");
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("Second line");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);

    typeText(view, " continued");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("First line continued");
    expect(container.querySelector(".ProseMirror")).toHaveTextContent("After callout");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!NOTE]\n>\n> First line continued\n\nAfter callout");
    await settleMarkdownListener();
  });

  it("keeps the cursor in a callout list after deleting an emptied list item", async () => {
    const { container, editor, view } = await renderEditor("> [!NOTE]\n>\n> - One\n> - Two");
    const itemFrom = findTextPosition(view, "Two");

    selectText(view, itemFrom, itemFrom + "Two".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    focusEditor(view);
    expect(fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true })).toBe(false);

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    typeText(view, " continued");

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("One continued");
    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).not.toHaveTextContent("Two");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    expect(serializeMarkdown(view.state.doc)).toContain("> [!NOTE]\n>\n> - One continued");
    await settleMarkdownListener();
  });

  it("removes an emptied nested callout list item without leaving a child list", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent one",
      ">   - Child one",
      ">   - Child two",
      "> - Parent two",
      ">   - Nested child",
      "> - Parent three",
      "> - Parent four"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const childFrom = findTextPosition(view, "Nested child");

    selectText(view, childFrom, childFrom + "Nested child".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(selectionHasAncestor(view, "list_item")).toBe(true);

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    const topList = callout?.querySelector<HTMLElement>("ul");
    const topLevelItems = Array.from(topList?.children ?? []).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement
    );
    const parentTwo = topLevelItems.find((item) => item.textContent?.includes("Parent two"));

    expect(parentTwo).toBeDefined();
    expect(parentTwo?.querySelector("ul, ol")).not.toBeInTheDocument();
    expect(parentTwo?.querySelector(".markra-list-toggle-button")).not.toBeInTheDocument();

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Parent one\n>   - Child one\n>   - Child two");
    expect(markdown).toContain("> - Parent two\n> - Parent three");
    expect(markdown).not.toContain("Nested child");
    expect(markdown).not.toContain("> - Parent two\n>   -");
    await settleMarkdownListener();
  });

  it("does not recreate an empty nested callout list item on repeated Backspace", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - A item",
      ">   - B item",
      ">   - Empty item",
      ">   - C item"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const emptyFrom = findTextPosition(view, "Empty item");

    selectText(view, emptyFrom, emptyFrom + "Empty item".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    expect(pressBackspace(view)).toBe(true);

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const emptyItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout li")
    ).filter((item) => item.textContent?.trim().length === 0);
    expect(emptyItems).toHaveLength(0);

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).not.toContain(">   -\n");
    expect(markdown).not.toContain(">   - \n");
    expect(markdown).not.toContain("Empty item");
  });

  it("keeps child items nested when deleting an empty nested callout list parent", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - Previous child",
      ">   - Empty parent",
      ">     - Grandchild one",
      ">     - Grandchild two",
      ">   - After child"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const emptyFrom = findTextPosition(view, "Empty parent");

    selectText(view, emptyFrom, emptyFrom + "Empty parent".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    expect(pressBackspace(view)).toBe(true);

    const previousChild = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li > ul > li")
    ).find((item) => item.textContent?.includes("Previous child"));
    expect(previousChild).toBeDefined();

    const nestedGrandchildren = Array.from(previousChild?.querySelectorAll<HTMLElement>("ul > li") ?? []);
    expect(nestedGrandchildren).toHaveLength(2);
    expect(nestedGrandchildren[0]).toHaveTextContent("Grandchild one");
    expect(nestedGrandchildren[1]).toHaveTextContent("Grandchild two");
    expect(view.state.selection.$from.parent.textContent).toBe("Previous child");
    expect(view.state.selection.from).toBe(findTextPosition(view, "Previous child", "Previous child".length));

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain(">   - Previous child\n>     - Grandchild one\n>     - Grandchild two");
    expect(markdown).toContain(">   - After child");
    expect(markdown).not.toContain("Empty parent");
  });

  it("removes the first emptied callout list item instead of leaving an empty bullet", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - First",
      "> - Second",
      "> - Third"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const firstFrom = findTextPosition(view, "First");

    selectText(view, firstFrom, firstFrom + "First".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    const topList = callout?.querySelector<HTMLElement>("ul");
    const topLevelItems = Array.from(topList?.children ?? []).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement
    );

    expect(topLevelItems).toHaveLength(2);
    expect(topLevelItems[0]).toHaveTextContent("Second");
    expect(topLevelItems[1]).toHaveTextContent("Third");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Second\n> - Third");
    expect(markdown).not.toContain("First");
    expect(markdown).not.toContain("> -\n> - Second");
    await settleMarkdownListener();
  });

  it("removes the first emptied nested callout list item instead of leaving an empty bullet", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - First child",
      ">   - Second child",
      "> - After"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const firstChildFrom = findTextPosition(view, "First child");

    selectText(view, firstChildFrom, firstChildFrom + "First child".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const nestedItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li > ul > li")
    );

    expect(nestedItems).toHaveLength(1);
    expect(nestedItems[0]).toHaveTextContent("Second child");
    expect(view.state.selection.$from.parent.textContent).toBe("Parent");
    expect(view.state.selection.from).toBe(findTextPosition(view, "Parent", "Parent".length));

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Parent\n>   - Second child\n> - After");
    expect(markdown).not.toContain("First child");
    expect(markdown).not.toContain(">   -\n>   - Second child");
    await settleMarkdownListener();
  });

  it("keeps child list items nested when deleting an emptied callout list parent", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Keep",
      "> - Parent",
      ">   - Child one",
      ">   - Child two",
      "> - After"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const parentFrom = findTextPosition(view, "Parent");

    selectText(view, parentFrom, parentFrom + "Parent".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const callout = container.querySelector<HTMLElement>(".ProseMirror blockquote.markra-callout");
    const topList = callout?.querySelector<HTMLElement>("ul");
    const topLevelItems = Array.from(topList?.children ?? []).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement
    );

    expect(topLevelItems).toHaveLength(2);
    expect(topLevelItems[0]).toHaveTextContent("Keep");
    expect(topLevelItems[1]).toHaveTextContent("After");
    expect(topLevelItems.some((item) => item.textContent?.trim().length === 0)).toBe(false);

    const nestedItems = Array.from(topLevelItems[0].querySelectorAll<HTMLElement>("ul > li"));
    expect(nestedItems).toHaveLength(2);
    expect(nestedItems[0]).toHaveTextContent("Child one");
    expect(nestedItems[1]).toHaveTextContent("Child two");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain("> - Keep\n>   - Child one\n>   - Child two\n> - After");
    expect(markdown).not.toContain("Parent");
    expect(markdown).not.toContain("> - Child one");
    await settleMarkdownListener();
  });

  it("keeps empty callout list cleanup in its own undo and redo step", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Keep",
      "> - Parent",
      ">   - Child one",
      ">   - Child two",
      "> - After"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const parentFrom = findTextPosition(view, "Parent");

    selectText(view, parentFrom, parentFrom + "Parent".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    expect(serializeMarkdown(view.state.doc)).toContain("> - Keep\n>   - Child one\n>   - Child two\n> - After");

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    const undoMarkdown = serializeMarkdown(view.state.doc);
    expect(undoMarkdown).toContain("> - Keep");
    expect(undoMarkdown).toContain("> -");
    expect(undoMarkdown).toContain(">   - Child one\n>   - Child two\n> - After");
    expect(undoMarkdown).not.toContain("Parent");

    expect(pressShortcut(view, "z", { metaKey: true, shiftKey: true })).toBe(true);

    const redoMarkdown = serializeMarkdown(view.state.doc);
    expect(redoMarkdown).toContain("> - Keep\n>   - Child one\n>   - Child two\n> - After");
    expect(redoMarkdown).not.toContain("> - Child one");
    await settleMarkdownListener();
  });

  it("keeps first nested callout list item cleanup redoable", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Parent",
      ">   - First child",
      ">   - Second child",
      "> - After"
    ].join("\n");
    const { editor, view } = await renderEditor(source);
    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const firstChildFrom = findTextPosition(view, "First child");

    selectText(view, firstChildFrom, firstChildFrom + "First child".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    expect(serializeMarkdown(view.state.doc)).toContain("> - Parent\n>   - Second child\n> - After");

    expect(pressShortcut(view, "z", { metaKey: true })).toBe(true);

    const undoMarkdown = serializeMarkdown(view.state.doc);
    expect(undoMarkdown).toContain("> - Parent");
    expect(undoMarkdown).toContain(">   -");
    expect(undoMarkdown).toContain(">   - Second child\n> - After");
    expect(undoMarkdown).not.toContain("First child");

    expect(pressShortcut(view, "z", { metaKey: true, shiftKey: true })).toBe(true);

    const redoMarkdown = serializeMarkdown(view.state.doc);
    expect(redoMarkdown).toContain("> - Parent\n>   - Second child\n> - After");
    expect(redoMarkdown).not.toContain(">   -\n>   - Second child");
    await settleMarkdownListener();
  });

  it("promotes nested child list items when deleting an emptied nested callout list parent", async () => {
    const source = [
      "> [!NOTE]",
      ">",
      "> - Root",
      ">   - Parent",
      ">     - Grandchild one",
      ">     - Grandchild two",
      ">   - Nested after",
      "> - After"
    ].join("\n");
    const { container, editor, view } = await renderEditor(source);
    const parentFrom = findTextPosition(view, "Parent");

    selectText(view, parentFrom, parentFrom + "Parent".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    focusEditor(view);
    fireEvent.keyDown(view.dom, { key: "Backspace", bubbles: true, cancelable: true });

    const nestedItems = Array.from(
      container.querySelectorAll<HTMLElement>(".ProseMirror blockquote.markra-callout > ul > li > ul > li")
    );

    expect(nestedItems).toHaveLength(3);
    expect(nestedItems[0]).toHaveTextContent("Grandchild one");
    expect(nestedItems[1]).toHaveTextContent("Grandchild two");
    expect(nestedItems[2]).toHaveTextContent("Nested after");

    const serializeMarkdown = editor.action((ctx) => ctx.get(serializerCtx));
    const markdown = serializeMarkdown(view.state.doc);
    expect(markdown).toContain(
      "> - Root\n>   - Grandchild one\n>   - Grandchild two\n>   - Nested after\n> - After"
    );
    expect(markdown).not.toContain("Parent");
    expect(markdown).not.toContain(">   -\n>     - Grandchild one");
    await settleMarkdownListener();
  });

  it("removes one empty callout body line before deleting an otherwise empty callout", async () => {
    const { container, view } = await renderEditor("> [!NOTE]\n>\n>");

    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(3);

    moveCursor(view, findLastTextBlockCursor(view));
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toBeInTheDocument();
    expect(container.querySelectorAll(".ProseMirror blockquote.markra-callout p")).toHaveLength(2);
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
  });

  it("keeps the cursor inside a callout when deleting an empty middle line", async () => {
    const { container, view } = await renderEditor("> [!NOTE]\n>\n> First line\n>\n> Second line");
    const secondLineFrom = findTextPosition(view, "Second line");

    selectText(view, secondLineFrom, secondLineFrom + "Second line".length);
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView());

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("First line");
    expect(pressBackspace(view)).toBe(true);

    expect(container.querySelector(".ProseMirror blockquote.markra-callout")).toHaveTextContent("First line");
    expect(selectionHasAncestor(view, "blockquote")).toBe(true);
    expect(view.state.selection.$from.parent.textContent).toBe("First line");
    await settleMarkdownListener();
  });

  it("turns inline markdown shortcuts into styled marks", async () => {
    const emphasis = await renderEditor();
    typeText(emphasis.view, "after*a*");

    expectLiveMark(emphasis.container, "emphasis", "a");
    expect(emphasis.container.querySelector(".ProseMirror")?.textContent).toBe("after*a*");

    expect(pressEnter(emphasis.view)).toBe(true);

    expect(emphasis.container.querySelector(".ProseMirror em")).toHaveTextContent("a");
    expect(emphasis.container.querySelector(".ProseMirror")?.textContent).toBe("aftera");

    const inlineCode = await renderEditor();
    typeText(inlineCode.view, "use `code`");

    expectLiveMark(inlineCode.container, "inlineCode", "code");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("use `code`");

    expect(pressEnter(inlineCode.view)).toBe(true);

    expect(inlineCode.container.querySelector(".ProseMirror code")).toHaveTextContent("code");
    expect(inlineCode.container.querySelector(".ProseMirror")?.textContent).toBe("use code");

    const strikethrough = await renderEditor();
    typeText(strikethrough.view, "after~~a~~");

    expectLiveMark(strikethrough.container, "strikethrough", "a");
    expect(strikethrough.container.querySelector(".ProseMirror")?.textContent).toBe("after~~a~~");

    expect(pressEnter(strikethrough.view)).toBe(true);

    expect(strikethrough.container.querySelector(".ProseMirror del")).toHaveTextContent("a");
    expect(strikethrough.container.querySelector(".ProseMirror")?.textContent).toBe("aftera");
    await settleMarkdownListener();
  });
});
