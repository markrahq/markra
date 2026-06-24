import { lazy, Suspense, type CSSProperties, type Ref, type UIEvent } from "react";
import { t, type AppLanguage } from "@markra/shared";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  type EditorContentWidth
} from "../lib/editor-width";
import {
  editorFontFamilyCssValue,
  type EditorFontFamilyPreference
} from "../lib/editor-font";
import type { EditorTheme } from "../lib/settings/app-settings";
import { EditorWidthResizer } from "./EditorWidthResizer";
import type { MarkdownPaperSurfaceProps } from "./MarkdownPaperSurface";

const MarkdownPaperSurface = lazy(async () => {
  const module = await import("./MarkdownPaperSurface");

  return { default: module.MarkdownPaperSurface };
});

type MarkdownPaperProps = {
  autoFocus?: boolean;
  bottomOverlayInset?: number;
  bodyFontSize?: number;
  contentWidth?: EditorContentWidth;
  contentWidthMax?: number;
  contentWidthMin?: number;
  contentWidthPx?: number | null;
  documentKey?: string | null;
  documentPath?: MarkdownPaperSurfaceProps["documentPath"];
  editorFontFamily?: EditorFontFamilyPreference;
  editorTheme?: EditorTheme;
  extendedSyntax?: MarkdownPaperSurfaceProps["extendedSyntax"];
  initialContent: string;
  language?: AppLanguage;
  lineHeight?: number;
  markdownShortcuts?: MarkdownPaperSurfaceProps["markdownShortcuts"];
  onActiveOutlineIndexChange?: MarkdownPaperSurfaceProps["onActiveOutlineIndexChange"];
  onEditorReady: MarkdownPaperSurfaceProps["onEditorReady"];
  onMarkdownChange: MarkdownPaperSurfaceProps["onMarkdownChange"];
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  onSaveClipboardAttachment?: MarkdownPaperSurfaceProps["onSaveClipboardAttachment"];
  onSaveClipboardImage?: MarkdownPaperSurfaceProps["onSaveClipboardImage"];
  onSaveRemoteClipboardImage?: MarkdownPaperSurfaceProps["onSaveRemoteClipboardImage"];
  onAddSpellcheckIgnoredWord?: MarkdownPaperSurfaceProps["onAddSpellcheckIgnoredWord"];
  openLocalAttachment?: MarkdownPaperSurfaceProps["openLocalAttachment"];
  openExternalUrl?: MarkdownPaperSurfaceProps["openExternalUrl"];
  readOnly?: MarkdownPaperSurfaceProps["readOnly"];
  onTextSelectionChange?: MarkdownPaperSurfaceProps["onTextSelectionChange"];
  resolveImageSrc?: MarkdownPaperSurfaceProps["resolveImageSrc"];
  revision: number;
  scrollRef?: Ref<HTMLElement>;
  spellcheckEnabled?: MarkdownPaperSurfaceProps["spellcheckEnabled"];
  spellcheckIgnoredWords?: MarkdownPaperSurfaceProps["spellcheckIgnoredWords"];
  spellchecker?: MarkdownPaperSurfaceProps["spellchecker"];
  topInset?: "tabs" | "titlebar";
  workspaceFiles?: MarkdownPaperSurfaceProps["workspaceFiles"];
  wrapCodeBlocks?: boolean;
};

type MarkdownPaperStyle = CSSProperties & {
  "--editor-font-family"?: string;
  "--editor-heading-font-family"?: string;
};

function editorBottomPadding(bottomOverlayInset: number) {
  if (bottomOverlayInset <= 0) return 0;

  return `${bottomOverlayInset}px`;
}

function MarkdownPaperSurfaceFallback() {
  return (
    <div
      aria-hidden="true"
      className="min-h-6"
      data-editor-engine="milkdown-loading"
    />
  );
}

export function MarkdownPaper({
  autoFocus = false,
  bottomOverlayInset = 0,
  bodyFontSize = 16,
  contentWidth = "default",
  contentWidthMax = editorCustomContentWidthMax,
  contentWidthMin = editorCustomContentWidthMin,
  contentWidthPx = null,
  documentKey,
  documentPath,
  editorFontFamily = { family: null, source: "theme" },
  editorTheme = "light",
  extendedSyntax,
  initialContent,
  language = "en",
  lineHeight = 1.65,
  markdownShortcuts,
  onActiveOutlineIndexChange,
  onEditorReady,
  onMarkdownChange,
  onContentWidthChange,
  onContentWidthResizeEnd,
  onContentWidthResizeStart,
  onScroll,
  onSaveClipboardAttachment,
  onSaveClipboardImage,
  onSaveRemoteClipboardImage,
  onAddSpellcheckIgnoredWord,
  openLocalAttachment,
  openExternalUrl,
  readOnly = false,
  onTextSelectionChange,
  resolveImageSrc,
  revision,
  scrollRef,
  spellcheckEnabled = false,
  spellcheckIgnoredWords,
  spellchecker,
  topInset = "titlebar",
  workspaceFiles,
  wrapCodeBlocks = true
}: MarkdownPaperProps) {
  const resolvedContentWidth = contentWidthPx ?? editorContentWidthPixels[contentWidth];
  const editorFontFamilyCss = editorFontFamilyCssValue(editorFontFamily);
  const paperStyle = {
    ...(editorFontFamilyCss
      ? {
          "--editor-font-family": editorFontFamilyCss,
          "--editor-heading-font-family": "var(--editor-font-family)"
        }
      : {}),
    fontSize: `${bodyFontSize}px`,
    lineHeight,
    maxWidth: `${resolvedContentWidth}px`,
    paddingBottom: editorBottomPadding(bottomOverlayInset)
  } satisfies MarkdownPaperStyle;
  const topInsetClassName = topInset === "tabs" ? "pt-24 max-[900px]:pt-20" : "pt-14 max-[900px]:pt-10";
  const editorInstanceKey = `${documentKey ?? "untitled"}:${revision}`;

  return (
    <section
      className="paper-scroll h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-none bg-transparent"
      aria-label={t(language, "app.writingSurface")}
      onScroll={onScroll}
      ref={scrollRef}
    >
      <article
        key={editorInstanceKey}
        className={`markdown-paper relative mx-auto min-h-screen w-full max-w-215 px-18 ${topInsetClassName} text-[16px] leading-[1.65] text-(--text-primary) caret-(--accent) outline-none focus:outline-none max-[900px]:px-5.25`}
        style={paperStyle}
        aria-label={t(language, "app.markdownEditor")}
        data-editor-engine="milkdown"
        data-editor-theme={editorTheme}
        data-code-block-wrap={wrapCodeBlocks ? "true" : "false"}
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
        <Suspense fallback={<MarkdownPaperSurfaceFallback />}>
          <MarkdownPaperSurface
            autoFocus={autoFocus}
            documentPath={documentPath}
            extendedSyntax={extendedSyntax}
            initialContent={initialContent}
            language={language}
            markdownShortcuts={markdownShortcuts}
            onActiveOutlineIndexChange={onActiveOutlineIndexChange}
            onEditorReady={onEditorReady}
            onMarkdownChange={onMarkdownChange}
            onSaveClipboardAttachment={onSaveClipboardAttachment}
            onSaveClipboardImage={onSaveClipboardImage}
            onSaveRemoteClipboardImage={onSaveRemoteClipboardImage}
            onAddSpellcheckIgnoredWord={onAddSpellcheckIgnoredWord}
            openLocalAttachment={openLocalAttachment}
            openExternalUrl={openExternalUrl}
            readOnly={readOnly}
            onTextSelectionChange={onTextSelectionChange}
            resolveImageSrc={resolveImageSrc}
            spellcheckEnabled={spellcheckEnabled}
            spellcheckIgnoredWords={spellcheckIgnoredWords}
            spellchecker={spellchecker}
            workspaceFiles={workspaceFiles}
          />
        </Suspense>
      </article>
    </section>
  );
}
