import { type CSSProperties, type Ref, type UIEvent } from "react";
import { t, type AppLanguage } from "@markra/shared";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  type EditorContentWidth
} from "../lib/editor-width";
import type { EditorTheme } from "../lib/settings/app-settings";
import { EditorWidthResizer } from "./EditorWidthResizer";
import { MarkdownPaperSurface, type MarkdownPaperSurfaceProps } from "./MarkdownPaperSurface";

type MarkdownPaperProps = {
  autoFocus?: boolean;
  bottomOverlayInset?: number;
  bodyFontSize?: number;
  contentWidth?: EditorContentWidth;
  contentWidthMax?: number;
  contentWidthMin?: number;
  contentWidthPx?: number | null;
  documentPath?: MarkdownPaperSurfaceProps["documentPath"];
  editorTheme?: EditorTheme;
  initialContent: string;
  language?: AppLanguage;
  lineHeight?: number;
  markdownShortcuts?: MarkdownPaperSurfaceProps["markdownShortcuts"];
  onEditorReady: MarkdownPaperSurfaceProps["onEditorReady"];
  onMarkdownChange: MarkdownPaperSurfaceProps["onMarkdownChange"];
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  onSaveClipboardImage?: MarkdownPaperSurfaceProps["onSaveClipboardImage"];
  onSaveRemoteClipboardImage?: MarkdownPaperSurfaceProps["onSaveRemoteClipboardImage"];
  openExternalUrl?: MarkdownPaperSurfaceProps["openExternalUrl"];
  onTextSelectionChange?: MarkdownPaperSurfaceProps["onTextSelectionChange"];
  resolveImageSrc?: MarkdownPaperSurfaceProps["resolveImageSrc"];
  revision: number;
  scrollRef?: Ref<HTMLElement>;
  topInset?: "tabs" | "titlebar";
  workspaceFiles?: MarkdownPaperSurfaceProps["workspaceFiles"];
};

export function MarkdownPaper({
  autoFocus = false,
  bottomOverlayInset = 0,
  bodyFontSize = 16,
  contentWidth = "default",
  contentWidthMax = editorCustomContentWidthMax,
  contentWidthMin = editorCustomContentWidthMin,
  contentWidthPx = null,
  documentPath,
  editorTheme = "light",
  initialContent,
  language = "en",
  lineHeight = 1.65,
  markdownShortcuts,
  onEditorReady,
  onMarkdownChange,
  onContentWidthChange,
  onContentWidthResizeEnd,
  onContentWidthResizeStart,
  onScroll,
  onSaveClipboardImage,
  onSaveRemoteClipboardImage,
  openExternalUrl,
  onTextSelectionChange,
  resolveImageSrc,
  revision,
  scrollRef,
  topInset = "titlebar",
  workspaceFiles
}: MarkdownPaperProps) {
  const resolvedContentWidth = contentWidthPx ?? editorContentWidthPixels[contentWidth];
  const paperStyle = {
    fontSize: `${bodyFontSize}px`,
    lineHeight,
    maxWidth: `${resolvedContentWidth}px`,
    ...(bottomOverlayInset > 0 ? { paddingBottom: `${bottomOverlayInset}px` } : {})
  } satisfies CSSProperties;
  const topInsetClassName = topInset === "tabs" ? "pt-24 max-[900px]:pt-20" : "pt-14 max-[900px]:pt-10";

  return (
    <section
      className="paper-scroll h-full min-h-0 overflow-auto overscroll-none bg-transparent"
      aria-label={t(language, "app.writingSurface")}
      onScroll={onScroll}
      ref={scrollRef}
    >
      <article
        key={revision}
        className={`markdown-paper relative mx-auto min-h-screen w-full max-w-215 px-18 pb-30 ${topInsetClassName} text-[16px] leading-[1.65] text-(--text-primary) caret-(--accent) outline-none focus:outline-none max-[900px]:px-5.25`}
        style={paperStyle}
        aria-label={t(language, "app.markdownEditor")}
        data-editor-engine="milkdown"
        data-editor-theme={editorTheme}
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
        <MarkdownPaperSurface
          autoFocus={autoFocus}
          documentPath={documentPath}
          initialContent={initialContent}
          language={language}
          markdownShortcuts={markdownShortcuts}
          onEditorReady={onEditorReady}
          onMarkdownChange={onMarkdownChange}
          onSaveClipboardImage={onSaveClipboardImage}
          onSaveRemoteClipboardImage={onSaveRemoteClipboardImage}
          openExternalUrl={openExternalUrl}
          onTextSelectionChange={onTextSelectionChange}
          resolveImageSrc={resolveImageSrc}
          workspaceFiles={workspaceFiles}
        />
      </article>
    </section>
  );
}
