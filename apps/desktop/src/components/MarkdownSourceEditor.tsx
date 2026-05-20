import { Fragment, type CSSProperties, type ChangeEvent, type ReactNode, type Ref, type UIEvent } from "react";
import { parseMarkdownCalloutMarker, t, type AppLanguage } from "@markra/shared";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  type EditorContentWidth
} from "../lib/editor-width";
import { EditorWidthResizer } from "./EditorWidthResizer";

type MarkdownSourceEditorProps = {
  autoFocus?: boolean;
  bodyFontSize?: number;
  content: string;
  contentWidth?: EditorContentWidth;
  contentWidthMax?: number;
  contentWidthMin?: number;
  contentWidthPx?: number | null;
  language?: AppLanguage;
  lineHeight?: number;
  onChange: (content: string) => unknown;
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  readOnly?: boolean;
  scrollRef?: Ref<HTMLElement>;
  topInset?: "none" | "tabs" | "titlebar";
};

type FenceState = {
  marker: "`" | "~" | null;
};

function renderMarkdownSourceHighlight(content: string) {
  const lines = content.split("\n");
  const fenceState: FenceState = { marker: null };

  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {renderMarkdownSourceLine(line, index, fenceState)}
      {index < lines.length - 1 ? "\n" : null}
    </Fragment>
  ));
}

function renderMarkdownSourceLine(line: string, lineIndex: number, fenceState: FenceState): ReactNode {
  const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/u);
  if (fenceMatch && (!fenceState.marker || fenceMatch[2]!.startsWith(fenceState.marker))) {
    const [, indent = "", fence = "", info = ""] = fenceMatch;
    fenceState.marker = fenceState.marker ? null : fence[0] === "~" ? "~" : "`";

    return (
      <>
        {indent ? <span className="markdown-source-token-muted">{indent}</span> : null}
        <span className="markdown-source-token-code-fence">{fence}</span>
        {info ? <span className="markdown-source-token-code-info">{info}</span> : null}
      </>
    );
  }

  if (fenceState.marker) {
    return <span className="markdown-source-token-code">{line}</span>;
  }

  const headingMatch = line.match(/^(#{1,6})(\s.*)?$/u);
  if (headingMatch) {
    return (
      <>
        <span className="markdown-source-token-heading-marker">{headingMatch[1]}</span>
        {headingMatch[2] ? <span className="markdown-source-token-heading">{headingMatch[2]}</span> : null}
      </>
    );
  }

  const blockquoteMatch = line.match(/^(\s*>+)(\s.*)?$/u);
  if (blockquoteMatch) {
    const calloutContent = blockquoteMatch[2] ?? "";
    const calloutPrefixMatch = /^(\s*)(.*)$/u.exec(calloutContent);
    const calloutMarker = parseMarkdownCalloutMarker(calloutPrefixMatch?.[2] ?? "");
    if (calloutMarker && calloutPrefixMatch) {
      const [, prefix = "", content = ""] = calloutPrefixMatch;
      const markerIndex = content.indexOf(calloutMarker.source);
      const afterMarker = content.slice(markerIndex + calloutMarker.source.length);

      return (
        <>
          <span className="markdown-source-token-quote-marker">{blockquoteMatch[1]}</span>
          {prefix ? <span className="markdown-source-token-muted">{prefix}</span> : null}
          {markerIndex > 0 ? renderInlineMarkdownSource(content.slice(0, markerIndex), lineIndex) : null}
          <span className="markdown-source-token-callout">{calloutMarker.source}</span>
          {afterMarker ? renderInlineMarkdownSource(afterMarker, lineIndex) : null}
        </>
      );
    }

    return (
      <>
        <span className="markdown-source-token-quote-marker">{blockquoteMatch[1]}</span>
        {blockquoteMatch[2] ? renderInlineMarkdownSource(blockquoteMatch[2], lineIndex) : null}
      </>
    );
  }

  const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])(\s+.*)?$/u);
  if (listMatch) {
    return (
      <>
        {listMatch[1] ? <span className="markdown-source-token-muted">{listMatch[1]}</span> : null}
        <span className="markdown-source-token-list-marker">{listMatch[2]}</span>
        {listMatch[3] ? renderInlineMarkdownSource(listMatch[3], lineIndex) : null}
      </>
    );
  }

  const ruleMatch = line.match(/^(\s*)([-*_])(?:\s*\2){2,}\s*$/u);
  if (ruleMatch) {
    return (
      <>
        {ruleMatch[1] ? <span className="markdown-source-token-muted">{ruleMatch[1]}</span> : null}
        <span className="markdown-source-token-rule">{line.slice(ruleMatch[1]!.length)}</span>
      </>
    );
  }

  return renderInlineMarkdownSource(line, lineIndex);
}

function renderInlineMarkdownSource(text: string, lineIndex: number) {
  const tokens: ReactNode[] = [];
  const tokenPattern = /(!?\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/gu;
  let offset = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > offset) tokens.push(text.slice(offset, index));

    tokens.push(
      <span
        className={markdownInlineTokenClassName(token)}
        key={`line-${lineIndex}-token-${index}`}
      >
        {token}
      </span>
    );
    offset = index + token.length;
  }

  if (offset < text.length) tokens.push(text.slice(offset));

  return tokens;
}

function markdownInlineTokenClassName(token: string) {
  if (token.startsWith("`")) return "markdown-source-token-inline-code";
  if (token.startsWith("!") || token.startsWith("[")) return "markdown-source-token-link";

  return "markdown-source-token-emphasis";
}

export function MarkdownSourceEditor({
  autoFocus = false,
  bodyFontSize = 16,
  content,
  contentWidth = "default",
  contentWidthMax = editorCustomContentWidthMax,
  contentWidthMin = editorCustomContentWidthMin,
  contentWidthPx = null,
  language = "en",
  lineHeight = 1.65,
  onChange,
  onContentWidthChange,
  onContentWidthResizeEnd,
  onContentWidthResizeStart,
  onScroll,
  readOnly = false,
  scrollRef,
  topInset = "titlebar"
}: MarkdownSourceEditorProps) {
  const resolvedContentWidth = contentWidthPx ?? editorContentWidthPixels[contentWidth];
  const paperStyle = {
    fontSize: `${bodyFontSize}px`,
    lineHeight,
    maxWidth: `${resolvedContentWidth}px`
  } satisfies CSSProperties;
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;

    onChange(event.currentTarget.value);
  };
  const topInsetClassName =
    topInset === "tabs"
      ? "pt-24 max-[900px]:pt-20"
      : topInset === "titlebar"
        ? "pt-14 max-[900px]:pt-10"
        : "pt-6 max-[900px]:pt-5";

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
        <div className="markdown-source-layer relative min-h-[calc(100vh-176px)]">
          <pre
            className="markdown-source-highlight pointer-events-none m-0 min-h-[calc(100vh-176px)] whitespace-pre-wrap wrap-break-word border-0 bg-transparent p-0 font-mono text-[0.94em] leading-[inherit] tracking-normal"
            aria-hidden="true"
          >
            <code>{renderMarkdownSourceHighlight(content)}</code>
          </pre>
          <textarea
            className="markdown-source-input absolute inset-0 block h-full min-h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-mono text-[0.94em] leading-[inherit] tracking-normal text-transparent outline-none placeholder:text-(--text-secondary) focus:outline-none"
            aria-label={t(language, "app.markdownSource")}
            autoFocus={autoFocus}
            readOnly={readOnly}
            spellCheck={false}
            value={content}
            onChange={handleChange}
          />
        </div>
      </article>
    </section>
  );
}
