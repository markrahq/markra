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

type FenceState = {
  marker: "`" | "~" | null;
};

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

function addMarkdownSourceDecoration(
  decorations: Range<Decoration>[],
  from: number,
  to: number,
  className: string
) {
  if (to <= from) return;

  decorations.push(Decoration.mark({ class: className }).range(from, to));
}

function markdownInlineTokenClassName(token: string) {
  if (token.startsWith("`")) return "markdown-source-token-inline-code";
  if (token.startsWith("!") || token.startsWith("[")) return "markdown-source-token-link";

  return "markdown-source-token-emphasis";
}

function addMarkdownInlineSourceDecorations(decorations: Range<Decoration>[], text: string, from: number) {
  const tokenPattern = /(!?\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/gu;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    addMarkdownSourceDecoration(
      decorations,
      from + index,
      from + index + token.length,
      markdownInlineTokenClassName(token)
    );
  }
}

function markdownSourceSyntaxExtension(githubAlertsEnabled: boolean): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const decorations: Range<Decoration>[] = [];
    const fenceState: FenceState = { marker: null };

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/u.exec(line.text);
      if (fenceMatch && (!fenceState.marker || fenceMatch[2]!.startsWith(fenceState.marker))) {
        const [, indent = "", fence = "", info = ""] = fenceMatch;
        const fenceFrom = line.from + indent.length;
        addMarkdownSourceDecoration(decorations, line.from, fenceFrom, "markdown-source-token-muted");
        addMarkdownSourceDecoration(decorations, fenceFrom, fenceFrom + fence.length, "markdown-source-token-code-fence");
        addMarkdownSourceDecoration(decorations, fenceFrom + fence.length, line.to, "markdown-source-token-code-info");
        fenceState.marker = fenceState.marker ? null : fence[0] === "~" ? "~" : "`";
        continue;
      }

      if (fenceState.marker) {
        addMarkdownSourceDecoration(decorations, line.from, line.to, "markdown-source-token-code");
        continue;
      }

      const headingMatch = /^(#{1,6})(\s.*)?$/u.exec(line.text);
      if (headingMatch) {
        const marker = headingMatch[1] ?? "";
        addMarkdownSourceDecoration(decorations, line.from, line.from + marker.length, "markdown-source-token-heading-marker");
        addMarkdownSourceDecoration(decorations, line.from + marker.length, line.to, "markdown-source-token-heading");
        continue;
      }

      const blockquoteMatch = /^(\s*>+)(\s.*)?$/u.exec(line.text);
      if (blockquoteMatch) {
        const quoteMarker = blockquoteMatch[1] ?? "";
        const quoteTo = line.from + quoteMarker.length;
        addMarkdownSourceDecoration(decorations, line.from, quoteTo, "markdown-source-token-quote-marker");

        const calloutContent = blockquoteMatch[2] ?? "";
        const calloutStart = quoteTo;
        const calloutPrefixMatch = /^(\s*)(.*)$/u.exec(calloutContent);
        const calloutMarker = githubAlertsEnabled ? parseMarkdownCalloutMarker(calloutPrefixMatch?.[2] ?? "") : null;
        if (calloutMarker && calloutPrefixMatch) {
          const [, prefix = "", content = ""] = calloutPrefixMatch;
          const contentStart = calloutStart + prefix.length;
          const markerIndex = content.indexOf(calloutMarker.source);
          if (markerIndex < 0) {
            addMarkdownInlineSourceDecorations(decorations, calloutContent, calloutStart);
            continue;
          }

          const markerFrom = contentStart + markerIndex;
          if (markerIndex > 0) addMarkdownInlineSourceDecorations(decorations, content.slice(0, markerIndex), contentStart);
          addMarkdownSourceDecoration(
            decorations,
            markerFrom,
            markerFrom + calloutMarker.source.length,
            "markdown-source-token-callout"
          );
          addMarkdownInlineSourceDecorations(
            decorations,
            content.slice(markerIndex + calloutMarker.source.length),
            markerFrom + calloutMarker.source.length
          );
        } else {
          addMarkdownInlineSourceDecorations(decorations, calloutContent, calloutStart);
        }

        continue;
      }

      const listMatch = /^(\s*)([-*+]|\d+[.)])(\s+.*)?$/u.exec(line.text);
      if (listMatch) {
        const indent = listMatch[1] ?? "";
        const marker = listMatch[2] ?? "";
        const markerFrom = line.from + indent.length;
        const markerTo = markerFrom + marker.length;
        addMarkdownSourceDecoration(decorations, line.from, markerFrom, "markdown-source-token-muted");
        addMarkdownSourceDecoration(decorations, markerFrom, markerTo, "markdown-source-token-list-marker");
        addMarkdownInlineSourceDecorations(decorations, listMatch[3] ?? "", markerTo);
        continue;
      }

      const ruleMatch = /^(\s*)([-*_])(?:\s*\2){2,}\s*$/u.exec(line.text);
      if (ruleMatch) {
        const indent = ruleMatch[1] ?? "";
        const ruleFrom = line.from + indent.length;
        addMarkdownSourceDecoration(decorations, line.from, ruleFrom, "markdown-source-token-muted");
        addMarkdownSourceDecoration(decorations, ruleFrom, line.to, "markdown-source-token-rule");
        continue;
      }

      addMarkdownInlineSourceDecorations(decorations, line.text, line.from);
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
      syntaxCompartmentRef.current.of(markdownSourceSyntaxExtension(githubAlertsEnabled)),
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
      effects: syntaxCompartmentRef.current.reconfigure(markdownSourceSyntaxExtension(githubAlertsEnabled))
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
