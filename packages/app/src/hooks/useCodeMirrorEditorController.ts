import { EditorSelection } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import {
  applyCodeMirrorAiResult,
  clearCodeMirrorAiPreview,
  clearCodeMirrorAiSelectionHold,
  clearCodeMirrorSelectionFormatting,
  confirmCodeMirrorAiResultApplied,
  findCodeMirrorSearchMatches,
  insertCodeMirrorMarkdownImage,
  insertCodeMirrorMarkdownImages,
  insertCodeMirrorMarkdownLink,
  insertCodeMirrorMarkdownLinks,
  insertCodeMirrorMarkdownSnippet,
  insertCodeMirrorMarkdownTable,
  isCodeMirrorMarkdownEquivalent,
  listCodeMirrorAiPreviewResults,
  listMarkraUi,
  readCodeMirrorAiSelectionContext,
  readCodeMirrorHeadingAnchors,
  readCodeMirrorSectionAnchors,
  readCodeMirrorTableAnchors,
  replaceAllCodeMirrorSearchMatches,
  replaceCodeMirrorMarkdown,
  replaceCodeMirrorSearchMatch,
  runMarkraCommand,
  scrollCodeMirrorAiPreviewIntoView,
  scrollCodeMirrorSearchMatchIntoView,
  updateCodeMirrorSearchDecorations,
  showCodeMirrorAiPreview,
  showCodeMirrorAiSelectionHold,
  type AiEditorPreviewLabels,
  type CodeMirrorMarkdownImageReference,
  type CodeMirrorMarkdownLinkReference,
  type ReplaceCodeMirrorMarkdownOptions,
} from "@markra/editor/codemirror";
import type { AiDiffResult, AiSelectionContext } from "@markra/ai";
import {
  keyboardShortcutFromKeyboardEvent,
  parseKeyboardShortcut,
  type SearchRange,
} from "@markra/shared";
import { useCallback, useEffect, useRef } from "react";
import type {
  SelectionFormattingAction,
  SelectionFormattingState,
  SelectionFormattingToolbarAction,
  SelectionHeadingLevel,
} from "../lib/selection-formatting";
import type { SelectionAnchor } from "../lib/selection-anchor";
import type { MarkdownOutlineItem } from "@markra/markdown";

type EditorReadyOptions = {
  autoFocus?: boolean;
};

const aiSelectionHoldSelector = ".markra-ai-selection-hold";

function scrollAiSelectionHold(
  view: EditorView,
  bottomInset: number,
) {
  const scrollContainer = view.dom.closest<HTMLElement>(".paper-scroll");
  const elements = Array.from(
    view.dom.querySelectorAll<HTMLElement>(aiSelectionHoldSelector),
  );
  if (!scrollContainer || elements.length === 0 || bottomInset <= 0) return false;

  const targetBottom = Math.max(
    ...elements.map((element) => element.getBoundingClientRect().bottom),
  );
  const containerRect = scrollContainer.getBoundingClientRect();
  const safeBottom = containerRect.bottom - bottomInset - 24;
  if (targetBottom <= safeBottom) return false;

  scrollContainer.scrollTo({
    behavior: "smooth",
    top: Math.max(0, scrollContainer.scrollTop + targetBottom - safeBottom),
  });
  return true;
}

const formattingActions = new Map<string, SelectionFormattingAction>([
  ["format.bold", "bold"],
  ["format.code", "inlineCode"],
  ["format.highlight", "highlight"],
  ["format.italic", "italic"],
  ["format.strikethrough", "strikethrough"],
  ["block.bullet-list", "bulletList"],
  ["block.heading.1", "heading1"],
  ["block.ordered-list", "orderedList"],
  ["block.quote", "quote"],
]);

const selectionFormattingCommands: Partial<
  Record<SelectionFormattingToolbarAction, string>
> = {
  bold: "format.bold",
  bulletList: "block.bullet-list",
  heading1: "block.heading.1",
  highlight: "format.highlight",
  inlineCode: "format.code",
  italic: "format.italic",
  orderedList: "block.ordered-list",
  paragraph: "block.paragraph",
  quote: "block.quote",
  strikethrough: "format.strikethrough",
};

function activeFormattingState(view: EditorView): SelectionFormattingState {
  const actions: SelectionFormattingAction[] = [];
  const contributions = [
    ...listMarkraUi(view, "selection-toolbar"),
    ...listMarkraUi(view, "slash-menu"),
  ];

  for (const contribution of contributions) {
    const action = formattingActions.get(contribution.command);
    if (action && contribution.active && !actions.includes(action)) {
      actions.push(action);
    }
  }

  const heading = contributions.find(
    (contribution) =>
      contribution.active && contribution.command.startsWith("block.heading."),
  );
  const level = heading
    ? Number(heading.command.slice("block.heading.".length))
    : null;

  return {
    actions,
    headingLevel:
      level && level >= 1 && level <= 6
        ? (level as SelectionHeadingLevel)
        : null,
  };
}

function selectionAnchor(view: EditorView): SelectionAnchor | null {
  const { from, to } = view.state.selection.main;
  if (from === to) return null;

  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  if (!start || !end) return null;

  return {
    bottom: Math.max(start.bottom, end.bottom),
    left: Math.min(start.left, end.left),
    right: Math.max(start.right, end.right),
    top: Math.min(start.top, end.top),
  };
}

export function useCodeMirrorEditorController() {
  const viewRef = useRef<EditorView | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  const getMarkdownFromEditor = useCallback(
    (view: EditorView, fallbackContent = "") => {
      try {
        return view.state.doc.toString();
      } catch {
        return fallbackContent;
      }
    },
    [],
  );

  const getCurrentMarkdown = useCallback(
    (fallbackContent: string) => {
      const view = viewRef.current;
      return view ? getMarkdownFromEditor(view, fallbackContent) : fallbackContent;
    },
    [getMarkdownFromEditor],
  );

  const isCurrentMarkdownEquivalent = useCallback((markdown: string) => {
    const view = viewRef.current;
    return view ? isCodeMirrorMarkdownEquivalent(view, markdown) : undefined;
  }, []);

  const replaceMarkdown = useCallback(
    (markdown: string, options: ReplaceCodeMirrorMarkdownOptions = {}) => {
      const view = viewRef.current;
      return view ? replaceCodeMirrorMarkdown(view, markdown, options) : false;
    },
    [],
  );

  const getSelection = useCallback(() => {
    const view = viewRef.current;
    return view ? readCodeMirrorAiSelectionContext(view) : null;
  }, []);

  const getSelectionAnchor = useCallback(() => {
    const view = viewRef.current;
    return view ? selectionAnchor(view) : null;
  }, []);

  const getSelectionFormattingState = useCallback(() => {
    const view = viewRef.current;
    return view
      ? activeFormattingState(view)
      : { actions: [], headingLevel: null } satisfies SelectionFormattingState;
  }, []);

  const getSelectionFormattingActions = useCallback(
    () => getSelectionFormattingState().actions,
    [getSelectionFormattingState],
  );

  const getHeadingAnchors = useCallback(() => {
    const view = viewRef.current;
    return view ? readCodeMirrorHeadingAnchors(view.state) : [];
  }, []);

  const getSectionAnchors = useCallback(() => {
    const view = viewRef.current;
    return view ? readCodeMirrorSectionAnchors(view.state) : [];
  }, []);

  const getTableAnchors = useCallback(() => {
    const view = viewRef.current;
    return view ? readCodeMirrorTableAnchors(view.state) : [];
  }, []);

  const getDocumentEndPosition = useCallback(
    () => viewRef.current?.state.doc.length ?? 0,
    [],
  );

  const handleEditorReady = useCallback(
    (view: EditorView | null, options: EditorReadyOptions = {}) => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      viewRef.current = view;
      if (!view || !options.autoFocus) return;

      focusTimerRef.current = window.setTimeout(() => {
        if (viewRef.current === view) view.focus();
        focusTimerRef.current = null;
      }, 0);
    },
    [],
  );

  const runEditorShortcut = useCallback(
    (
      key: string,
      modifiers: Pick<KeyboardEventInit, "altKey" | "code" | "shiftKey"> & { modKey?: boolean } = {},
      options: { focusEditor?: boolean } = {},
    ) => {
      const view = viewRef.current;
      if (!view) return false;

      const mac = /Mac/u.test(navigator.platform);
      if (key.toLowerCase() === "z") {
        const handled = modifiers.shiftKey ? redo(view) : undo(view);
        if (handled && options.focusEditor !== false) view.focus();
        return handled;
      }

      const { modKey = true, ...eventModifiers } = modifiers;
      const ctrlKey = modKey && !mac;
      const metaKey = modKey && mac;
      const physicalShortcut = eventModifiers.code
        ? keyboardShortcutFromKeyboardEvent({
            altKey: Boolean(eventModifiers.altKey),
            code: eventModifiers.code,
            ctrlKey,
            key,
            metaKey,
            shiftKey: Boolean(eventModifiers.shiftKey),
          })
        : null;
      const physicalShortcutKey =
        parseKeyboardShortcut(physicalShortcut)?.key;
      // Synthetic events have keyCode 0, so CodeMirror cannot recover the
      // unshifted digit or punctuation key from values such as "*" or "&".
      const shiftedLetterKey =
        eventModifiers.shiftKey && /^[A-Z]$/u.test(key)
          ? key.toLocaleLowerCase()
          : key;
      const normalizedKey =
        physicalShortcutKey && !/^[A-Z]$/u.test(physicalShortcutKey)
          ? physicalShortcutKey
          : shiftedLetterKey;
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey,
        key: normalizedKey,
        metaKey,
        ...eventModifiers,
      });
      const handled = runScopeHandlers(view, event, "editor");
      if (handled && options.focusEditor !== false) view.focus();
      return handled;
    },
    [],
  );

  const findSearchMatches = useCallback(
    (query: string, options: { caseSensitive?: boolean } = {}) => {
      const view = viewRef.current;
      return view ? findCodeMirrorSearchMatches(view.state, query, options) : [];
    },
    [],
  );

  const showSearchMatches = useCallback(
    (
      matches: SearchRange[],
      activeIndex: number,
      _options: { suppressEditorChrome?: boolean } = {},
    ) => {
      const view = viewRef.current;
      if (view) updateCodeMirrorSearchDecorations(view, matches, activeIndex);
    },
    [],
  );

  const revealSearchMatch = useCallback(
    (match: SearchRange | null | undefined) => {
      const view = viewRef.current;
      return view ? scrollCodeMirrorSearchMatchIntoView(view, match) : false;
    },
    [],
  );

  const replaceSearchMatch = useCallback(
    (match: SearchRange | null | undefined, replacement: string) => {
      const view = viewRef.current;
      return view
        ? replaceCodeMirrorSearchMatch(view, match, replacement)
        : false;
    },
    [],
  );

  const replaceAllSearchMatches = useCallback(
    (matches: SearchRange[], replacement: string) => {
      const view = viewRef.current;
      return view
        ? replaceAllCodeMirrorSearchMatches(view, matches, replacement)
        : false;
    },
    [],
  );

  const insertMarkdownSnippet = useCallback(
    (open: string, close: string, placeholder: string) => {
      const view = viewRef.current;
      return view
        ? insertCodeMirrorMarkdownSnippet(view, open, close, placeholder)
        : false;
    },
    [],
  );

  const insertMarkdownImage = useCallback(() => {
    const view = viewRef.current;
    return view ? insertCodeMirrorMarkdownImage(view) : false;
  }, []);

  const insertMarkdownImages = useCallback(
    (images: CodeMirrorMarkdownImageReference[]) => {
      const view = viewRef.current;
      return view ? insertCodeMirrorMarkdownImages(view, images) : false;
    },
    [],
  );

  const insertMarkdownImagesAtPoint = useCallback(
    (
      images: CodeMirrorMarkdownImageReference[],
      point: { left: number; top: number },
    ) => {
      const view = viewRef.current;
      if (!view) return false;
      const position = view.posAtCoords({ x: point.left, y: point.top });
      if (position === null) return false;
      view.dispatch({ selection: EditorSelection.cursor(position) });
      return insertCodeMirrorMarkdownImages(view, images);
    },
    [],
  );

  const insertMarkdownLink = useCallback(() => {
    const view = viewRef.current;
    return view ? insertCodeMirrorMarkdownLink(view) : false;
  }, []);

  const insertMarkdownLinks = useCallback(
    (links: CodeMirrorMarkdownLinkReference[]) => {
      const view = viewRef.current;
      return view ? insertCodeMirrorMarkdownLinks(view, links) : false;
    },
    [],
  );

  const insertMarkdownTable = useCallback(() => {
    const view = viewRef.current;
    return view ? insertCodeMirrorMarkdownTable(view) : false;
  }, []);

  const setSelectionHeadingLevel = useCallback((level: SelectionHeadingLevel) => {
    const view = viewRef.current;
    return view ? runMarkraCommand(view, `block.heading.${level}`) : false;
  }, []);

  const toggleSelectionHighlight = useCallback(() => {
    const view = viewRef.current;
    return view ? runMarkraCommand(view, "format.highlight") : false;
  }, []);

  const clearSelectionFormatting = useCallback(() => {
    const view = viewRef.current;
    return view ? clearCodeMirrorSelectionFormatting(view) : false;
  }, []);

  const runSelectionFormattingAction = useCallback(
    (action: SelectionFormattingToolbarAction) => {
      const view = viewRef.current;
      if (!view) return false;

      if (action === "clearFormatting") {
        return clearCodeMirrorSelectionFormatting(view);
      }

      const command = selectionFormattingCommands[action];
      return command ? runMarkraCommand(view, command) : false;
    },
    [],
  );

  const applyAiResult = useCallback(
    (result: AiDiffResult, options: { previewId?: string } = {}) => {
      const view = viewRef.current;
      return view ? applyCodeMirrorAiResult(view, result, options) : false;
    },
    [],
  );

  const previewAiResult = useCallback(
    (
      result: AiDiffResult,
      labels?: AiEditorPreviewLabels,
      options: { previewId?: string } = {},
    ) => {
      const view = viewRef.current;
      return view ? showCodeMirrorAiPreview(view, result, labels, options) : false;
    },
    [],
  );

  const confirmAiResultApplied = useCallback(
    (result: AiDiffResult, options: { previewId?: string } = {}) => {
      const view = viewRef.current;
      return view
        ? confirmCodeMirrorAiResultApplied(view, result, options)
        : false;
    },
    [],
  );

  const holdAiSelection = useCallback((selection: AiSelectionContext) => {
    const view = viewRef.current;
    return view ? showCodeMirrorAiSelectionHold(view, selection) : false;
  }, []);

  const clearAiSelection = useCallback(() => {
    const view = viewRef.current;
    if (view) clearCodeMirrorAiSelectionHold(view);
  }, []);

  const scrollAiSelectionAboveCommand = useCallback((bottomInset: number) => {
    const view = viewRef.current;
    return view ? scrollAiSelectionHold(view, bottomInset) : false;
  }, []);

  const clearAiPreview = useCallback(
    (result?: AiDiffResult, options: { previewId?: string } = {}) => {
      const view = viewRef.current;
      if (view) clearCodeMirrorAiPreview(view, result, options);
    },
    [],
  );

  const listAiPreviews = useCallback(() => {
    const view = viewRef.current;
    return view ? listCodeMirrorAiPreviewResults(view) : [];
  }, []);

  const scrollToAiPreview = useCallback(
    (result?: AiDiffResult, options: { previewId?: string } = {}) => {
      const view = viewRef.current;
      return view
        ? scrollCodeMirrorAiPreviewIntoView(view, result, options)
        : false;
    },
    [],
  );

  const selectOutlineItem = useCallback(
    (targetItem: MarkdownOutlineItem, targetIndex: number) => {
      const view = viewRef.current;
      if (!view) return;
      const target = readCodeMirrorHeadingAnchors(view.state)
        .filter((heading) => heading.title)
        .find(
          (heading, index) =>
            index === targetIndex &&
            heading.level === targetItem.level &&
            heading.title === targetItem.title,
        );
      if (!target) {
        view.focus();
        return;
      }

      view.dispatch({
        effects: EditorView.scrollIntoView(target.from, { y: "start" }),
        selection: EditorSelection.cursor(target.from),
      });
      view.focus();
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  return {
    applyAiResult,
    clearAiPreview,
    clearAiSelection,
    clearSelectionFormatting,
    confirmAiResultApplied,
    findSearchMatches,
    getCurrentMarkdown,
    getDocumentEndPosition,
    getHeadingAnchors,
    getMarkdownFromEditor,
    getSectionAnchors,
    getSelection,
    getSelectionAnchor,
    getSelectionFormattingActions,
    getSelectionFormattingState,
    getTableAnchors,
    handleEditorReady,
    holdAiSelection,
    insertMarkdownImage,
    insertMarkdownImages,
    insertMarkdownImagesAtPoint,
    insertMarkdownLink,
    insertMarkdownLinks,
    insertMarkdownSnippet,
    insertMarkdownTable,
    isCurrentMarkdownEquivalent,
    listAiPreviews,
    previewAiResult,
    replaceAllSearchMatches,
    replaceMarkdown,
    replaceSearchMatch,
    revealSearchMatch,
    runEditorShortcut,
    runSelectionFormattingAction,
    scrollAiSelectionAboveCommand,
    scrollToAiPreview,
    selectOutlineItem,
    setSelectionHeadingLevel,
    showSearchMatches,
    toggleSelectionHighlight,
  };
}
