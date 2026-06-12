import { useEffect, useMemo, useRef, type CSSProperties, type Ref, type UIEvent } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Annotation, Compartment, EditorSelection, EditorState, Transaction, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { parseMarkdownCalloutMarker, t, type AppLanguage, type SearchRange } from "@markra/shared";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  type EditorContentWidth
} from "../lib/editor-width";
import type { ExtendedSyntaxPreferences } from "../lib/settings/app-settings";
import { EditorWidthResizer } from "./EditorWidthResizer";

type MarkdownSourceEditorProps = {
  autoFocus?: boolean;
  bodyFontSize?: number;
  content: string;
  contentWidth?: EditorContentWidth;
  contentWidthMax?: number;
  contentWidthMin?: number;
  contentWidthPx?: number | null;
  extendedSyntax?: ExtendedSyntaxPreferences;
  language?: AppLanguage;
  lineHeight?: number;
  onChange: (content: string) => unknown;
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  readOnly?: boolean;
  searchActiveIndex?: number;
  searchMatches?: SearchRange[];
  scrollRef?: Ref<HTMLElement>;
  topInset?: "none" | "tabs" | "titlebar";
};

const externalSourceUpdate = Annotation.define<boolean>();

function markdownSourceContentAttributes(label: string, readOnly: boolean): Extension {
  return EditorView.contentAttributes.of({
    "aria-label": label,
    "aria-multiline": "true",
    "aria-readonly": readOnly ? "true" : "false",
    "data-language": "markdown",
    role: "textbox",
    spellcheck: "false"
  });
}

function clampSearchRange(match: SearchRange, documentLength: number) {
  const from = Math.max(0, Math.min(documentLength, match.from));
  const to = Math.max(from, Math.min(documentLength, match.to));

  return { from, to };
}

function markdownSourceSearchExtension(matches: SearchRange[] = [], activeIndex = -1): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const decorations = matches.flatMap((match, index) => {
      const { from, to } = clampSearchRange(match, state.doc.length);
      if (to <= from) return [];

      return Decoration.mark({
        class: `markra-cm-source-search-match ${
          index === activeIndex ? "markra-cm-source-search-match-current" : ""
        }`
      }).range(from, to);
    });

    return Decoration.set(decorations, true);
  });
}

function markdownSourceExtendedSyntaxExtension(githubAlertsEnabled: boolean): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const decorations: Range<Decoration>[] = [];

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const blockquoteMatch = /^(\s*>+)(\s.*)?$/u.exec(line.text);
      if (!blockquoteMatch) continue;

      const quoteMarker = blockquoteMatch[1] ?? "";
      if (quoteMarker) {
        decorations.push(
          Decoration.mark({
            class: "markdown-source-token-quote-marker"
          }).range(line.from, line.from + quoteMarker.length)
        );
      }

      if (!githubAlertsEnabled) continue;

      const calloutContent = blockquoteMatch[2] ?? "";
      const calloutPrefixMatch = /^(\s*)(.*)$/u.exec(calloutContent);
      const calloutMarker = parseMarkdownCalloutMarker(calloutPrefixMatch?.[2] ?? "");
      if (!calloutMarker || !calloutPrefixMatch) continue;

      const [, prefix = "", content = ""] = calloutPrefixMatch;
      const markerIndex = content.indexOf(calloutMarker.source);
      if (markerIndex < 0) continue;

      const markerFrom = line.from + quoteMarker.length + prefix.length + markerIndex;
      decorations.push(
        Decoration.mark({
          class: "markdown-source-token-callout"
        }).range(markerFrom, markerFrom + calloutMarker.source.length)
      );
    }

    return Decoration.set(decorations, true);
  });
}

function markdownSourceTheme(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
      fontSize: "0.94em",
      minHeight: "calc(100vh - 176px)"
    },
    "&.cm-editor": {
      height: "auto"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-activeLine": {
      backgroundColor: "transparent"
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      minHeight: "calc(100vh - 176px)",
      padding: "0",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    ".cm-cursor": {
      borderLeftColor: "var(--accent)"
    },
    ".cm-line": {
      padding: "0"
    },
    ".cm-scroller": {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: "inherit",
      overflow: "visible"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)"
    }
  });
}

export function MarkdownSourceEditor({
  autoFocus = false,
  bodyFontSize = 16,
  content,
  contentWidth = "default",
  contentWidthMax = editorCustomContentWidthMax,
  contentWidthMin = editorCustomContentWidthMin,
  contentWidthPx = null,
  extendedSyntax,
  language = "en",
  lineHeight = 1.65,
  onChange,
  onContentWidthChange,
  onContentWidthResizeEnd,
  onContentWidthResizeStart,
  onScroll,
  readOnly = false,
  searchActiveIndex = -1,
  searchMatches = [],
  scrollRef,
  topInset = "titlebar"
}: MarkdownSourceEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const initialContentRef = useRef(content);
  const onChangeRef = useRef(onChange);
  const viewRef = useRef<EditorView | null>(null);
  const contentAttributesCompartmentRef = useRef(new Compartment());
  const editableCompartmentRef = useRef(new Compartment());
  const searchCompartmentRef = useRef(new Compartment());
  const syntaxCompartmentRef = useRef(new Compartment());
  const resolvedContentWidth = contentWidthPx ?? editorContentWidthPixels[contentWidth];
  const githubAlertsEnabled = extendedSyntax?.githubAlerts ?? true;
  const sourceLabel = t(language, "app.markdownSource");
  const paperStyle = {
    fontSize: `${bodyFontSize}px`,
    lineHeight,
    maxWidth: `${resolvedContentWidth}px`
  } satisfies CSSProperties;
  const topInsetClassName =
    topInset === "tabs"
      ? "pt-24 max-[900px]:pt-20"
      : topInset === "titlebar"
        ? "pt-14 max-[900px]:pt-10"
        : "pt-6 max-[900px]:pt-5";

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => [
      minimalSetup,
      markdown({
        base: markdownLanguage
      }),
      EditorView.lineWrapping,
      contentAttributesCompartmentRef.current.of(markdownSourceContentAttributes(sourceLabel, readOnly)),
      editableCompartmentRef.current.of(EditorView.editable.of(!readOnly)),
      searchCompartmentRef.current.of(markdownSourceSearchExtension(searchMatches, searchActiveIndex)),
      syntaxCompartmentRef.current.of(markdownSourceExtendedSyntaxExtension(githubAlertsEnabled)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.transactions.some((transaction) => transaction.annotation(externalSourceUpdate))) return;

        onChangeRef.current(update.state.doc.toString());
      }),
      markdownSourceTheme()
    ],
    [githubAlertsEnabled, sourceLabel]
  );

  useEffect(() => {
    const container = editorContainerRef.current;

    if (!container || viewRef.current) return;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialContentRef.current,
        extensions
      })
    });

    viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [autoFocus, extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: [
        contentAttributesCompartmentRef.current.reconfigure(markdownSourceContentAttributes(sourceLabel, readOnly)),
        editableCompartmentRef.current.reconfigure(EditorView.editable.of(!readOnly))
      ]
    });
  }, [readOnly, sourceLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent === content) return;

    const cursor = Math.min(view.state.selection.main.head, content.length);
    view.dispatch({
      annotations: [externalSourceUpdate.of(true), Transaction.addToHistory.of(false)],
      changes: {
        from: 0,
        insert: content,
        to: view.state.doc.length
      },
      selection: EditorSelection.cursor(cursor)
    });
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const effects = searchCompartmentRef.current.reconfigure(
      markdownSourceSearchExtension(searchMatches, searchActiveIndex)
    );
    const activeMatch = searchMatches[searchActiveIndex];
    if (!activeMatch) {
      view.dispatch({ effects });
      return;
    }

    const { from, to } = clampSearchRange(activeMatch, view.state.doc.length);
    view.dispatch({
      effects,
      scrollIntoView: true,
      selection: EditorSelection.range(from, to)
    });
  }, [searchActiveIndex, searchMatches]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: syntaxCompartmentRef.current.reconfigure(markdownSourceExtendedSyntaxExtension(githubAlertsEnabled))
    });
  }, [githubAlertsEnabled]);

  useEffect(() => {
    if (!autoFocus) return;

    viewRef.current?.focus();
  }, [autoFocus]);

  return (
    <section
      className="paper-scroll h-full min-h-0 overflow-auto overscroll-none bg-transparent"
      aria-label={t(language, "app.writingSurface")}
      onScroll={onScroll}
      ref={scrollRef}
    >
      <article
        className={`markdown-source-paper relative mx-auto min-h-screen w-full max-w-215 px-18 pb-30 ${topInsetClassName} text-[16px] leading-[1.65] text-(--text-primary) caret-(--accent) outline-none focus:outline-none max-[900px]:px-5.25`}
        style={paperStyle}
        aria-label={t(language, "app.markdownEditor")}
        data-editor-engine="source"
      >
        <EditorWidthResizer
          language={language}
          maxWidth={contentWidthMax}
          minWidth={contentWidthMin}
          width={resolvedContentWidth}
          onResize={onContentWidthChange}
          onResizeEnd={onContentWidthResizeEnd}
          onResizeStart={onContentWidthResizeStart}
        />
        <div
          className="markdown-source-editor min-h-[calc(100vh-176px)]"
          data-language="markdown"
          data-testid="markdown-source-editor"
          ref={editorContainerRef}
        />
      </article>
    </section>
  );
}
