import type { ReactNode } from "react";
import { t, type AppLanguage } from "@markra/shared";
import type { MarkdownShortcutMap, Spellchecker } from "@markra/editor";
import type { EditorContentWidth } from "../lib/editor-width";
import type { EditorFontFamilyPreference } from "../lib/editor-font";
import type { EditorTheme, ExtendedSyntaxPreferences, TableColumnWidthModePreference } from "../lib/settings/app-settings";
import type { MarkdownDocumentLinkFile } from "../lib/document-links";
import { shouldBlockLargeMarkdownVisual } from "../lib/large-markdown";
import { LazyMarkdownSourceEditor } from "./LazyMarkdownSourceEditor";
import { LargeMarkdownNotice } from "./LargeMarkdownNotice";
import { MarkdownPaper } from "./MarkdownPaper";

type SideDocumentPaneProps = {
  bodyFontSize: number;
  bottomOverlayInset?: number;
  content: string;
  contentWidth: EditorContentWidth;
  contentWidthPx: number | null;
  documentKey?: string | null;
  documentPath?: string | null;
  editorFontFamily: EditorFontFamilyPreference;
  editorTheme: EditorTheme;
  extendedSyntax?: ExtendedSyntaxPreferences;
  language?: AppLanguage;
  lineHeight: number;
  markdownShortcuts?: MarkdownShortcutMap;
  mode: "source" | "visual";
  paragraphSpacingPx?: number;
  openLocalAttachment?: (src: string) => unknown;
  openExternalUrl?: (url: string) => unknown;
  readOnly?: boolean;
  resolveImageSrc?: (src: string) => string;
  revision: number;
  sizeBytes?: number;
  showLineNumbers?: boolean;
  spellcheckEnabled?: boolean;
  spellcheckIgnoredWords?: readonly string[];
  spellchecker?: Spellchecker;
  status?: ReactNode;
  tableColumnWidthMode?: TableColumnWidthModePreference;
  onAddSpellcheckIgnoredWord?: (word: string) => unknown;
  onSaveClipboardAttachment?: (attachment: File) => Promise<{ label: string; src: string } | null>;
  workspaceFiles?: MarkdownDocumentLinkFile[];
  wrapCodeBlocks?: boolean;
  onChange: (content: string) => unknown;
  onContentWidthChange?: (width: number) => unknown;
  onContentWidthResizeEnd?: () => unknown;
  onFocus?: () => unknown;
};

function ignoreSideEditorReady() {
  return null;
}

export function SideDocumentPane({
  bodyFontSize,
  bottomOverlayInset = 0,
  content,
  contentWidth,
  contentWidthPx,
  documentKey,
  documentPath,
  editorFontFamily,
  editorTheme,
  extendedSyntax,
  language = "en",
  lineHeight,
  markdownShortcuts,
  mode,
  paragraphSpacingPx = 8,
  openLocalAttachment,
  openExternalUrl,
  readOnly = false,
  resolveImageSrc,
  revision,
  sizeBytes,
  showLineNumbers = false,
  spellcheckEnabled = false,
  spellcheckIgnoredWords,
  spellchecker,
  status = null,
  tableColumnWidthMode = "auto",
  onAddSpellcheckIgnoredWord,
  onSaveClipboardAttachment,
  workspaceFiles,
  wrapCodeBlocks = true,
  onChange,
  onContentWidthChange,
  onContentWidthResizeEnd,
  onFocus
}: SideDocumentPaneProps) {
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const visualBlocked = mode === "visual" && shouldBlockLargeMarkdownVisual(content, { sizeBytes });

  return (
    <section
      className="side-document-pane relative h-full min-h-0 overflow-hidden bg-(--bg-primary)"
      aria-label={label("app.sideDocument")}
      onFocusCapture={onFocus}
    >
      {mode === "source" ? (
        <LazyMarkdownSourceEditor
          bottomOverlayInset={bottomOverlayInset}
          bodyFontSize={bodyFontSize}
          content={content}
          contentWidth={contentWidth}
          contentWidthPx={contentWidthPx}
          editorFontFamily={editorFontFamily}
          extendedSyntax={extendedSyntax}
          language={language}
          lineHeight={lineHeight}
          onChange={onChange}
          onContentWidthChange={onContentWidthChange}
          onContentWidthResizeEnd={onContentWidthResizeEnd}
          readOnly={readOnly}
          showLineNumbers={showLineNumbers}
          topInset="titlebar"
        />
      ) : visualBlocked ? (
        <LargeMarkdownNotice language={language} />
      ) : (
        <MarkdownPaper
          autoFocus={false}
          bottomOverlayInset={bottomOverlayInset}
          bodyFontSize={bodyFontSize}
          contentWidth={contentWidth}
          contentWidthPx={contentWidthPx}
          documentKey={documentKey}
          documentPath={documentPath}
          editorFontFamily={editorFontFamily}
          editorTheme={editorTheme}
          extendedSyntax={extendedSyntax}
          initialContent={content}
          language={language}
          lineHeight={lineHeight}
          markdownShortcuts={markdownShortcuts}
          paragraphSpacingPx={paragraphSpacingPx}
          onEditorReady={ignoreSideEditorReady}
          onMarkdownChange={onChange}
          onContentWidthChange={onContentWidthChange}
          onContentWidthResizeEnd={onContentWidthResizeEnd}
          onSaveClipboardAttachment={onSaveClipboardAttachment}
          openLocalAttachment={openLocalAttachment}
          openExternalUrl={openExternalUrl}
          readOnly={readOnly}
          resolveImageSrc={resolveImageSrc}
          revision={revision}
          spellcheckEnabled={spellcheckEnabled}
          spellcheckIgnoredWords={spellcheckIgnoredWords}
          spellchecker={spellchecker}
          tableColumnWidthMode={tableColumnWidthMode}
          onAddSpellcheckIgnoredWord={onAddSpellcheckIgnoredWord}
          topInset="titlebar"
          workspaceFiles={workspaceFiles}
          wrapCodeBlocks={wrapCodeBlocks}
        />
      )}
      {status}
    </section>
  );
}
