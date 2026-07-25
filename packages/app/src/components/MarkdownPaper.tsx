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
import type { TableColumnWidthModePreference } from "../lib/settings/app-settings";
import { EditorWidthResizer } from "./EditorWidthResizer";
import type { CodeMirrorPaperSurfaceProps } from "./CodeMirrorPaperSurface";

const MarkdownPaperSurface = lazy(async () => {
  const module = await import("./CodeMirrorPaperSurface");

  return { default: module.CodeMirrorPaperSurface };
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
  documentPath?: CodeMirrorPaperSurfaceProps["documentPath"];
  editorFontFamily?: EditorFontFamilyPreference;
  editorTheme?: EditorTheme;
  extendedSyntax?: CodeMirrorPaperSurfaceProps["extendedSyntax"];
  initialContent: string;
  language?: AppLanguage;
  lineHeight?: number;
  markdownShortcuts?: CodeMirrorPaperSurfaceProps["markdownShortcuts"];
  onActiveOutlineIndexChange?: CodeMirrorPaperSurfaceProps["onActiveOutlineIndexChange"];
  onEditorReady: CodeMirrorPaperSurfaceProps["onEditorReady"];
  onMarkdownChange: CodeMirrorPaperSurfaceProps["onMarkdownChange"];
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  paragraphSpacingPx?: number;
  onSaveClipboardAttachment?: CodeMirrorPaperSurfaceProps["onSaveClipboardAttachment"];
  onSaveClipboardImage?: CodeMirrorPaperSurfaceProps["onSaveClipboardImage"];
  onSaveRemoteClipboardImage?: CodeMirrorPaperSurfaceProps["onSaveRemoteClipboardImage"];
  onAddSpellcheckIgnoredWord?: CodeMirrorPaperSurfaceProps["onAddSpellcheckIgnoredWord"];
  openLocalAttachment?: CodeMirrorPaperSurfaceProps["openLocalAttachment"];
  openExternalUrl?: CodeMirrorPaperSurfaceProps["openExternalUrl"];
  readOnly?: CodeMirrorPaperSurfaceProps["readOnly"];
  onTextSelectionChange?: CodeMirrorPaperSurfaceProps["onTextSelectionChange"];
  resolveImageSrc?: CodeMirrorPaperSurfaceProps["resolveImageSrc"];
  revision: number;
  scrollRef?: Ref<HTMLElement>;
  spellcheckEnabled?: CodeMirrorPaperSurfaceProps["spellcheckEnabled"];
  spellcheckIgnoredWords?: CodeMirrorPaperSurfaceProps["spellcheckIgnoredWords"];
  spellchecker?: CodeMirrorPaperSurfaceProps["spellchecker"];
  tableColumnWidthMode?: TableColumnWidthModePreference;
  topInset?: "tabs" | "titlebar";
  typewriterModeEnabled?: CodeMirrorPaperSurfaceProps["typewriterModeEnabled"];
  workspaceFiles?: CodeMirrorPaperSurfaceProps["workspaceFiles"];
  wrapCodeBlocks?: boolean;
};

type MarkdownPaperStyle = CSSProperties & {
  "--editor-font-family"?: string;
  "--editor-heading-font-family"?: string;
  "--editor-paragraph-spacing"?: string;
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
      data-editor-engine="codemirror-loading"
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
  paragraphSpacingPx = 8,
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
  tableColumnWidthMode = "auto",
  topInset = "titlebar",
  typewriterModeEnabled = false,
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
    "--editor-paragraph-spacing": `${paragraphSpacingPx}px`,
    paddingBottom: editorBottomPadding(bottomOverlayInset)
  } satisfies MarkdownPaperStyle;
  const topInsetClassName = topInset === "tabs" ? "pt-24 max-[900px]:pt-20" : "pt-14 max-[900px]:pt-10";
  const editorInstanceKey = documentKey ?? "untitled";

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
        data-document-revision={revision}
        data-editor-engine="codemirror"
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
            tableColumnWidthMode={tableColumnWidthMode}
            typewriterModeEnabled={typewriterModeEnabled}
            workspaceFiles={workspaceFiles}
          />
        </Suspense>
      </article>
    </section>
  );
}
