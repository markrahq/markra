import { useCallback, useEffect, useMemo, useRef } from "react";
import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, parserCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { headingSchema, imageSchema, linkSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import type { AiSelectionContext } from "@markra/ai";
import {
  markraAiEditorPreviewPlugin,
  markraAiSelectionHoldPlugin,
  markraBlockDragPlugin,
  markraCalloutPlugin,
  markraCalloutSerializerPlugin,
  markraClipboardImagePluginWithOptions,
  markraCodeBlockPlugin,
  markraHeadingSourcePlugin,
  markraHeadingTogglePlugin,
  markraLinkImageLivePlugin,
  markraLiveMarkdownPlugin,
  markraMarkdownShortcuts,
  markraMathPlugin,
  markraMathRemarkPlugin,
  markraMathSourcePlugin,
  markraRawHtmlPlugin,
  markraSlashCommands,
  markraTableControlsPlugin,
  normalizeHeadingSourceDocument,
  normalizeMarkdownShortcuts,
  serializeLinkImageLiveMarkdown,
  type MarkdownShortcutMap,
  type SaveClipboardImage,
  type SaveRemoteClipboardImage,
  type SlashCommandLabels
} from "@markra/editor";
import { t, type AppLanguage } from "@markra/shared";
import type { MarkdownDocumentLinkFile } from "../lib/document-links";
import { markraDocumentLinkCompletionPlugin } from "./document-link-completion";
import {
  markraCommonmark,
  markraExternalLinkClickPlugin,
  markraGfm,
  markraTextSelectionObserverPlugin
} from "./markdown-paper-plugins";

export type MarkdownPaperSurfaceProps = {
  autoFocus: boolean;
  documentPath?: string | null;
  initialContent: string;
  language: AppLanguage;
  markdownShortcuts?: MarkdownShortcutMap;
  onEditorReady: (editor: Editor | null, options?: { autoFocus?: boolean }) => unknown;
  onMarkdownChange: (content: string) => unknown;
  onSaveClipboardImage?: SaveClipboardImage;
  onSaveRemoteClipboardImage?: SaveRemoteClipboardImage;
  openExternalUrl?: (url: string) => unknown;
  onTextSelectionChange?: (selection: AiSelectionContext | null) => unknown;
  resolveImageSrc?: (src: string) => string;
  workspaceFiles?: MarkdownDocumentLinkFile[];
};

function markdownShortcutSignature(shortcuts: MarkdownShortcutMap | undefined) {
  return JSON.stringify(normalizeMarkdownShortcuts(shortcuts));
}

function MilkdownInstanceBridge({ autoFocus, onEditorReady }: Pick<MarkdownPaperSurfaceProps, "autoFocus" | "onEditorReady">) {
  const [loading, getEditor] = useInstance();
  const autoFocusRef = useRef(autoFocus);

  useEffect(() => {
    autoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    onEditorReady(editor, { autoFocus: autoFocusRef.current });

    return () => {
      onEditorReady(null);
    };
  }, [getEditor, loading, onEditorReady]);

  return null;
}

function MilkdownEditorSurface({
  autoFocus,
  documentPath,
  initialContent,
  language,
  markdownShortcuts,
  onEditorReady,
  onMarkdownChange,
  onSaveClipboardImage,
  onSaveRemoteClipboardImage,
  openExternalUrl,
  onTextSelectionChange,
  resolveImageSrc,
  workspaceFiles
}: MarkdownPaperSurfaceProps) {
  const initialContentRef = useRef(initialContent);
  const documentPathRef = useRef(documentPath);
  const openExternalUrlRef = useRef(openExternalUrl);
  const onSaveClipboardImageRef = useRef(onSaveClipboardImage);
  const onSaveRemoteClipboardImageRef = useRef(onSaveRemoteClipboardImage);
  const onTextSelectionChangeRef = useRef(onTextSelectionChange);
  const workspaceFilesRef = useRef(workspaceFiles ?? []);
  const externalLinkOpeningEnabled = Boolean(openExternalUrl);
  const markdownDocumentLabel = t(language, "app.markdownDocument");
  const shortcutsSignature = markdownShortcutSignature(markdownShortcuts);
  const normalizedMarkdownShortcuts = useMemo(
    () => normalizeMarkdownShortcuts(markdownShortcuts),
    [shortcutsSignature]
  );
  const tableControlLabels = {
    addColumnRight: t(language, "editor.table.addColumnRight"),
    addRowBelow: t(language, "editor.table.addRowBelow"),
    alignLeft: t(language, "editor.table.alignLeft"),
    alignCenter: t(language, "editor.table.alignCenter"),
    alignRight: t(language, "editor.table.alignRight"),
    deleteColumn: t(language, "editor.table.deleteColumn"),
    deleteRow: t(language, "editor.table.deleteRow"),
    adjustTable: t(language, "editor.table.adjustTable"),
    resizeTableTo: t(language, "editor.table.resizeTableTo"),
    tableColumns: t(language, "editor.table.columns"),
    tableRows: t(language, "editor.table.rows")
  };
  const blockDragLabels = {
    addBlock: t(language, "editor.blockAdd"),
    dragBlock: t(language, "editor.blockDrag")
  };
  const headingToggleLabels = {
    collapseSection: t(language, "editor.collapseSection"),
    expandSection: t(language, "editor.expandSection")
  };
  const slashCommandLabels = useMemo<SlashCommandLabels>(() => ({
    menu: t(language, "editor.slashCommands"),
    noResults: t(language, "editor.slashCommandsNoResults"),
    commands: {
      bulletList: t(language, "menu.bulletList"),
      callout: t(language, "menu.callout"),
      codeBlock: t(language, "menu.codeBlock"),
      heading1: t(language, "menu.heading1"),
      heading2: t(language, "menu.heading2"),
      heading3: t(language, "menu.heading3"),
      orderedList: t(language, "menu.orderedList"),
      paragraph: t(language, "menu.paragraph"),
      quote: t(language, "menu.quote"),
      table: t(language, "menu.table")
    }
  }), [language]);

  useEffect(() => {
    onSaveClipboardImageRef.current = onSaveClipboardImage;
  }, [onSaveClipboardImage]);

  useEffect(() => {
    documentPathRef.current = documentPath;
  }, [documentPath]);

  useEffect(() => {
    openExternalUrlRef.current = openExternalUrl;
  }, [openExternalUrl]);

  useEffect(() => {
    onSaveRemoteClipboardImageRef.current = onSaveRemoteClipboardImage;
  }, [onSaveRemoteClipboardImage]);

  useEffect(() => {
    onTextSelectionChangeRef.current = onTextSelectionChange;
  }, [onTextSelectionChange]);

  useEffect(() => {
    workspaceFilesRef.current = workspaceFiles ?? [];
  }, [workspaceFiles]);

  const createEditor = useCallback(
    (root: HTMLElement) => {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialContentRef.current);
          ctx.update(editorViewOptionsCtx, (options) => ({
            ...options,
            attributes: {
              ...options.attributes,
              "aria-label": markdownDocumentLabel,
              spellcheck: "true"
            }
          }));
          ctx.get(listenerCtx).updated((editorCtx, doc) => {
            try {
              const view = editorCtx.get(editorViewCtx);
              const normalizedDoc = normalizeHeadingSourceDocument(
                view.state,
                paragraphSchema.type(editorCtx),
                headingSchema.type(editorCtx),
                editorCtx.get(parserCtx)
              );
              onMarkdownChange(
                serializeLinkImageLiveMarkdown(
                  normalizedDoc === view.state.doc ? doc : normalizedDoc,
                  editorCtx.get(serializerCtx),
                  linkSchema.type(editorCtx),
                  imageSchema.type(editorCtx)
                )
              );
            } catch {
              // Milkdown can flush a delayed update after teardown in tests or fast window closes.
            }
          });
        })
        .use(listener)
        .use(history)
        .use(markraMathRemarkPlugin)
        .use(markraCommonmark)
        .use(markraGfm)
        .use(markraCalloutSerializerPlugin)
        .use(markraCalloutPlugin)
        .use(markraSlashCommands(slashCommandLabels))
        .use(markraMathSourcePlugin)
        .use(markraMarkdownShortcuts(normalizedMarkdownShortcuts))
        .use(markraCodeBlockPlugin)
        .use(markraMathPlugin)
        .use(markraAiSelectionHoldPlugin)
        .use(markraAiEditorPreviewPlugin)
        .use(markraBlockDragPlugin(blockDragLabels))
        .use(markraHeadingTogglePlugin(headingToggleLabels))
        .use(
          markraDocumentLinkCompletionPlugin({
            getDocumentPath: () => documentPathRef.current,
            getWorkspaceFiles: () => workspaceFilesRef.current
          })
        )
        .use(
          markraTextSelectionObserverPlugin((selection) => {
            onTextSelectionChangeRef.current?.(selection);
          })
        )
        .use(markraTableControlsPlugin(tableControlLabels))
        .use(markraLinkImageLivePlugin(resolveImageSrc))
        .use(markraHeadingSourcePlugin)
        .use(
          markraRawHtmlPlugin({
            htmlSourceApplyLabel: t(language, "editor.htmlSourceApply"),
            htmlSourceLabel: t(language, "editor.htmlSource"),
            resolveImageSrc
          })
        )
        .use(markraLiveMarkdownPlugin);

      if (externalLinkOpeningEnabled) {
        editor.use(
          markraExternalLinkClickPlugin((url) => {
            return openExternalUrlRef.current?.(url);
          })
        );
      }

      if (onSaveClipboardImageRef.current || onSaveRemoteClipboardImageRef.current) {
        editor.use(
          markraClipboardImagePluginWithOptions(
            (image) => onSaveClipboardImageRef.current?.(image) ?? Promise.resolve(null),
            {
              saveRemoteImage: (image) => onSaveRemoteClipboardImageRef.current?.(image) ?? Promise.resolve(null)
            }
          )
        );
      }

      return editor;
    },
    [
      externalLinkOpeningEnabled,
      language,
      markdownDocumentLabel,
      normalizedMarkdownShortcuts,
      onMarkdownChange,
      resolveImageSrc,
      slashCommandLabels
    ]
  );

  useEditor(createEditor, [createEditor]);

  return (
    <>
      <Milkdown />
      <MilkdownInstanceBridge autoFocus={autoFocus} onEditorReady={onEditorReady} />
    </>
  );
}

export function MarkdownPaperSurface(props: MarkdownPaperSurfaceProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorSurface {...props} />
    </MilkdownProvider>
  );
}
