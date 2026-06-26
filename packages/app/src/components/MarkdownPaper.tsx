import type { CSSProperties, Ref, UIEvent } from "react";
import type { EditorView } from "@codemirror/view";
import type { AiSelectionContext } from "@markra/ai";
import type {
  MarkdownShortcutMap,
  SaveClipboardAttachment,
  SaveClipboardImage,
  SaveRemoteClipboardImage,
  Spellchecker
} from "@markra/editor-core";
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
import type {
  EditorTheme,
  ExtendedSyntaxPreferences,
  TableColumnWidthModePreference
} from "../lib/settings/app-settings";
import type { MarkdownDocumentLinkFile } from "../lib/document-links";
import { EditorWidthResizer } from "./EditorWidthResizer";
import { MarkdownCodeMirrorPaperSurface } from "./MarkdownCodeMirrorPaperSurface";

type MarkdownPaperProps = {
  autoFocus?: boolean;
  bottomOverlayInset?: number;
  bodyFontSize?: number;
  contentWidth?: EditorContentWidth;
  contentWidthMax?: number;
  contentWidthMin?: number;
  contentWidthPx?: number | null;
  documentKey?: string | null;
  documentPath?: string | null;
  editorFontFamily?: EditorFontFamilyPreference;
  editorTheme?: EditorTheme;
  extendedSyntax?: ExtendedSyntaxPreferences;
  initialContent: string;
  language?: AppLanguage;
  lineHeight?: number;
  markdownShortcuts?: MarkdownShortcutMap;
  onActiveOutlineIndexChange?: (index: number | null) => unknown;
  onEditorReady: (editor: EditorView | null, options?: { autoFocus?: boolean }) => unknown;
  onMarkdownChange: (content: string) => unknown;
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onContentWidthResizeStart?: () => unknown;
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
  onSaveClipboardAttachment?: SaveClipboardAttachment;
  onSaveClipboardImage?: SaveClipboardImage;
  onSaveRemoteClipboardImage?: SaveRemoteClipboardImage;
  onAddSpellcheckIgnoredWord?: (word: string) => unknown;
  openLocalAttachment?: (src: string) => unknown;
  openExternalUrl?: (url: string) => unknown;
  readOnly?: boolean;
  onTextSelectionChange?: (selection: AiSelectionContext | null) => unknown;
  resolveImageSrc?: (src: string) => string;
  revision: number;
  scrollRef?: Ref<HTMLElement>;
  spellcheckEnabled?: boolean;
  spellcheckIgnoredWords?: readonly string[];
  spellchecker?: Spellchecker;
  tableColumnWidthMode?: TableColumnWidthModePreference;
  topInset?: "tabs" | "titlebar";
  workspaceFiles?: MarkdownDocumentLinkFile[];
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
  tableColumnWidthMode = "auto",
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
        <MarkdownCodeMirrorPaperSurface
          autoFocus={autoFocus}
          initialContent={initialContent}
          language={language}
          onEditorReady={onEditorReady}
          onMarkdownChange={onMarkdownChange}
          readOnly={readOnly}
        />
      </article>
    </section>
  );
}
