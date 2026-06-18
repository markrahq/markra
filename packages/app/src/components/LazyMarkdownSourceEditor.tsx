import { lazy, Suspense, type CSSProperties } from "react";
import {
  editorContentWidthPixels,
  type EditorContentWidth
} from "../lib/editor-width";
import { editorFontFamilyCssValue } from "../lib/editor-font";
import type { MarkdownSourceEditorProps } from "./MarkdownSourceEditor";

const MarkdownSourceEditor = lazy(async () => {
  const module = await import("./MarkdownSourceEditor");

  return { default: module.MarkdownSourceEditor };
});

function markdownSourceTopInsetClassName(topInset: MarkdownSourceEditorProps["topInset"]) {
  if (topInset === "tabs") return "pt-24 max-[900px]:pt-20";
  if (topInset === "titlebar") return "pt-14 max-[900px]:pt-10";

  return "pt-6 max-[900px]:pt-5";
}

type MarkdownSourceFallbackStyle = CSSProperties & {
  "--source-editor-font-family"?: string;
};

function markdownSourceContentWidth(contentWidth: EditorContentWidth | undefined, contentWidthPx: number | null | undefined) {
  return contentWidthPx ?? editorContentWidthPixels[contentWidth ?? "default"];
}

function MarkdownSourceEditorFallback({
  bodyFontSize = 16,
  contentWidth,
  contentWidthPx,
  editorFontFamily = { family: null, source: "theme" },
  lineHeight = 1.65,
  scrollRef,
  topInset = "titlebar"
}: MarkdownSourceEditorProps) {
  const editorFontFamilyCss = editorFontFamilyCssValue(editorFontFamily);
  const paperStyle = {
    ...(editorFontFamilyCss ? { "--source-editor-font-family": editorFontFamilyCss } : {}),
    fontSize: `${bodyFontSize}px`,
    lineHeight,
    maxWidth: `${markdownSourceContentWidth(contentWidth, contentWidthPx)}px`
  } satisfies MarkdownSourceFallbackStyle;

  return (
    <section
      aria-hidden="true"
      className="paper-scroll h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-none bg-transparent"
      ref={scrollRef}
    >
      <article
        className={`markdown-source-paper relative mx-auto min-h-screen w-full max-w-215 px-18 ${markdownSourceTopInsetClassName(topInset)} text-[16px] leading-[1.65] text-(--text-primary) max-[900px]:px-5.25`}
        data-editor-engine="source-loading"
        style={paperStyle}
      />
    </section>
  );
}

export function LazyMarkdownSourceEditor(props: MarkdownSourceEditorProps) {
  return (
    <Suspense fallback={<MarkdownSourceEditorFallback {...props} />}>
      <MarkdownSourceEditor {...props} />
    </Suspense>
  );
}
