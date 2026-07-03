import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx
} from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { imageSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { $prose } from "@milkdown/kit/utils";
import type { AiSelectionContext } from "@markra/ai";
import {
  markraAiEditorPreviewPlugin,
  markraAiSelectionHoldPlugin,
  markraBlockDragPlugin,
  markraBlockGapPlugin,
  markraCalloutPlugin,
  markraCalloutRemarkPlugin,
  markraCalloutSerializerPlugin,
  markraClipboardImagePluginWithOptions,
  markraCodeBlockPlugin,
  markraVisualCaretPlugin,
  markraFrontmatterRemarkPlugin,
  markraFrontmatterSchema,
  markraFootnoteDefinitionInputPlugin,
  markraFootnotePreviewPlugin,
  markraFootnoteReferenceInputRule,
  markraHeadingLevelPlugin,
  markraHeadingTogglePlugin,
  markraListTogglePlugin,
  markraLinkImageLivePlugin,
  markraLiveMarkdownPlugin,
  markraMarkdownSourcePastePlugin,
  markraMarkdownShortcuts,
  markraMathCaretAnchorSuppressionPlugin,
  markraMathPlugin,
  markraMathRemarkPlugin,
  markraMathSourcePlugin,
  markraRawHtmlPlugin,
  markraSearchPlugin,
  markraSlashCommands,
  markraSpellcheckPlugin,
  markraTableControlsPlugin,
  markraTaskListPlugin,
  markraTrailingParagraphPlugin,
  markraTaskListSchema,
  getActiveSpellcheckMatch,
  normalizeMarkdownShortcuts,
  replaceSpellcheckMatch,
  serializeLinkImageLiveMarkdown,
  updateSpellcheckOptions,
  type MarkdownShortcutMap,
  type SaveClipboardAttachment,
  type SaveClipboardImage,
  type SaveRemoteClipboardImage,
  type SpellcheckMatch,
  type Spellchecker,
  type SlashCommandLabels
} from "@markra/editor";
import { matchesKeyboardShortcutEvent, t, type AppLanguage } from "@markra/shared";
import type { ExtendedSyntaxPreferences, TableColumnWidthModePreference } from "../lib/settings/app-settings";
import type { MarkdownDocumentLinkFile } from "../lib/document-links";
import { markraDocumentLinkCompletionPlugin } from "./document-link-completion";
import {
  markraCommonmark,
  markraExternalLinkClickPlugin,
  markraGfm,
  markraTextSelectionObserverPlugin,
  serializeMarkdownClipboardText
} from "./markdown-paper-plugins";
import { SpellcheckSuggestionMenu, type SpellcheckSuggestionMenuState } from "./SpellcheckSuggestionMenu";

export type MarkdownPaperSurfaceProps = {
  autoFocus: boolean;
  documentPath?: string | null;
  initialContent: string;
  language: AppLanguage;
  extendedSyntax?: ExtendedSyntaxPreferences;
  markdownShortcuts?: MarkdownShortcutMap;
  onEditorReady: (editor: Editor | null, options?: { autoFocus?: boolean }) => unknown;
  onActiveOutlineIndexChange?: (index: number | null) => unknown;
  onMarkdownChange: (content: string) => unknown;
  onSaveClipboardAttachment?: SaveClipboardAttachment;
  onSaveClipboardImage?: SaveClipboardImage;
  onSaveRemoteClipboardImage?: SaveRemoteClipboardImage;
  openLocalAttachment?: (src: string) => unknown;
  openExternalUrl?: (url: string) => unknown;
  readOnly?: boolean;
  onTextSelectionChange?: (selection: AiSelectionContext | null) => unknown;
  resolveImageSrc?: (src: string) => string;
  spellcheckEnabled?: boolean;
  spellcheckIgnoredWords?: readonly string[];
  spellchecker?: Spellchecker;
  tableColumnWidthMode?: TableColumnWidthModePreference;
  onAddSpellcheckIgnoredWord?: (word: string) => unknown;
  workspaceFiles?: MarkdownDocumentLinkFile[];
};

const emptySpellcheckIgnoredWords: readonly string[] = [];

function markdownShortcutSignature(shortcuts: MarkdownShortcutMap | undefined) {
  return JSON.stringify(normalizeMarkdownShortcuts(shortcuts));
}

function MilkdownInstanceBridge({ autoFocus, onEditorReady }: Pick<MarkdownPaperSurfaceProps, "autoFocus" | "onEditorReady">) {
  const [loading, getEditor] = useInstance();
  const autoFocusRef = useRef(autoFocus);
  const onEditorReadyRef = useRef(onEditorReady);

  useEffect(() => {
    autoFocusRef.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    onEditorReadyRef.current(editor, { autoFocus: autoFocusRef.current });

    return () => {
      onEditorReadyRef.current(null);
    };
  }, [getEditor, loading]);

  return null;
}

function MilkdownReadOnlyBridge({ readOnly = false }: Pick<MarkdownPaperSurfaceProps, "readOnly">) {
  const [loading, getEditor] = useInstance();

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({
        editable: () => !readOnly
      });
      view.dom.setAttribute("aria-readonly", readOnly ? "true" : "false");
    });
  }, [getEditor, loading, readOnly]);

  return null;
}

function MilkdownSpellcheckBridge({
  spellcheckEnabled = false,
  spellcheckIgnoredWords = emptySpellcheckIgnoredWords
}: Pick<MarkdownPaperSurfaceProps, "spellcheckEnabled" | "spellcheckIgnoredWords">) {
  const [loading, getEditor] = useInstance();

  useEffect(() => {
    if (loading) return;

    getEditor()?.action((ctx) => {
      updateSpellcheckOptions(ctx.get(editorViewCtx), {
        enabled: spellcheckEnabled,
        ignoredWords: spellcheckIgnoredWords
      });
    });
  }, [getEditor, loading, spellcheckEnabled, spellcheckIgnoredWords]);

  return null;
}

function markraReadOnlyTransactionGuard(readOnlyRef: { current: boolean }) {
  return $prose(() => new Plugin({
    filterTransaction(transaction) {
      return !readOnlyRef.current || !transaction.docChanged;
    }
  }));
}

function markraSpellcheckMenuShortcutPlugin(
  shortcut: string,
  openMenu: (match: SpellcheckMatch, view: EditorView) => unknown
) {
  return $prose(() => new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (!matchesKeyboardShortcutEvent(event, shortcut)) return false;

        const match = getActiveSpellcheckMatch(view);
        if (!match) return false;

        event.preventDefault();
        openMenu(match, view);

        return true;
      }
    }
  }));
}

function MilkdownEditorSurface({
  autoFocus,
  documentPath,
  extendedSyntax,
  initialContent,
  language,
  markdownShortcuts,
  onEditorReady,
  onActiveOutlineIndexChange,
  onMarkdownChange,
  onSaveClipboardAttachment,
  onSaveClipboardImage,
  onSaveRemoteClipboardImage,
  openLocalAttachment,
  openExternalUrl,
  readOnly = false,
  onTextSelectionChange,
  resolveImageSrc,
  spellcheckEnabled = false,
  spellcheckIgnoredWords = emptySpellcheckIgnoredWords,
  spellchecker,
  tableColumnWidthMode,
  onAddSpellcheckIgnoredWord,
  workspaceFiles
}: MarkdownPaperSurfaceProps) {
  const initialContentRef = useRef(initialContent);
  const documentPathRef = useRef(documentPath);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onActiveOutlineIndexChangeRef = useRef(onActiveOutlineIndexChange);
  const openExternalUrlRef = useRef(openExternalUrl);
  const openLocalAttachmentRef = useRef(openLocalAttachment);
  const onSaveClipboardAttachmentRef = useRef(onSaveClipboardAttachment);
  const onSaveClipboardImageRef = useRef(onSaveClipboardImage);
  const onSaveRemoteClipboardImageRef = useRef(onSaveRemoteClipboardImage);
  const onTextSelectionChangeRef = useRef(onTextSelectionChange);
  const readOnlyRef = useRef(readOnly);
  const resolveImageSrcRef = useRef(resolveImageSrc);
  const spellcheckEnabledRef = useRef(spellcheckEnabled);
  const spellcheckIgnoredWordsRef = useRef(spellcheckIgnoredWords);
  const tableColumnWidthModeRef = useRef(tableColumnWidthMode ?? "auto");
  const spellcheckMenuViewRef = useRef<EditorView | null>(null);
  const onAddSpellcheckIgnoredWordRef = useRef(onAddSpellcheckIgnoredWord);
  const workspaceFilesRef = useRef(workspaceFiles ?? []);
  const [spellcheckMenu, setSpellcheckMenu] = useState<SpellcheckSuggestionMenuState | null>(null);
  const externalLinkOpeningEnabled = Boolean(openExternalUrl || openLocalAttachment);
  const markdownDocumentLabel = t(language, "app.markdownDocument");
  const githubAlertsEnabled = extendedSyntax?.githubAlerts ?? true;
  const highlightSyntaxEnabled = extendedSyntax?.highlight ?? true;
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
    autoWidth: t(language, "editor.table.columnWidthMode"),
    deleteColumn: t(language, "editor.table.deleteColumn"),
    deleteRow: t(language, "editor.table.deleteRow"),
    deleteTable: t(language, "editor.table.deleteTable"),
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
  const headingLevelLabels = {
    paragraph: t(language, "menu.paragraph")
  };
  const listToggleLabels = {
    collapseListItem: t(language, "editor.collapseListItem"),
    expandListItem: t(language, "editor.expandListItem")
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
    onSaveClipboardAttachmentRef.current = onSaveClipboardAttachment;
  }, [onSaveClipboardAttachment]);

  useEffect(() => {
    documentPathRef.current = documentPath;
  }, [documentPath]);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  useEffect(() => {
    onActiveOutlineIndexChangeRef.current = onActiveOutlineIndexChange;
  }, [onActiveOutlineIndexChange]);

  useEffect(() => {
    openExternalUrlRef.current = openExternalUrl;
  }, [openExternalUrl]);

  useEffect(() => {
    openLocalAttachmentRef.current = openLocalAttachment;
  }, [openLocalAttachment]);

  useEffect(() => {
    onSaveRemoteClipboardImageRef.current = onSaveRemoteClipboardImage;
  }, [onSaveRemoteClipboardImage]);

  useEffect(() => {
    onTextSelectionChangeRef.current = onTextSelectionChange;
  }, [onTextSelectionChange]);

  useEffect(() => {
    onAddSpellcheckIgnoredWordRef.current = onAddSpellcheckIgnoredWord;
  }, [onAddSpellcheckIgnoredWord]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    resolveImageSrcRef.current = resolveImageSrc;
  }, [resolveImageSrc]);

  spellcheckEnabledRef.current = spellcheckEnabled;

  useEffect(() => {
    spellcheckIgnoredWordsRef.current = spellcheckIgnoredWords;
  }, [spellcheckIgnoredWords]);

  useEffect(() => {
    tableColumnWidthModeRef.current = tableColumnWidthMode ?? "auto";
  }, [tableColumnWidthMode]);

  useEffect(() => {
    workspaceFilesRef.current = workspaceFiles ?? [];
  }, [workspaceFiles]);

  useEffect(() => {
    if (!spellcheckMenu) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpellcheckMenu(null);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [spellcheckMenu]);

  const resolveCurrentImageSrc = useCallback((src: string) => {
    return resolveImageSrcRef.current?.(src) ?? src;
  }, []);

  const openSpellcheckSuggestionMenu = useCallback((match: SpellcheckMatch, view: EditorView) => {
    spellcheckMenuViewRef.current = view;
    setSpellcheckMenu({
      ...spellcheckMenuPosition(view, match),
      match
    });
  }, []);

  const handleReplaceSpellcheckSuggestion = useCallback((suggestion: string) => {
    const view = spellcheckMenuViewRef.current;
    if (!view || !spellcheckMenu) return;

    const transaction = replaceSpellcheckMatch(view.state, spellcheckMenu.match, suggestion);
    if (transaction) {
      view.dispatch(transaction);
      view.focus();
    }
    setSpellcheckMenu(null);
  }, [spellcheckMenu]);

  const handleAddSpellcheckIgnoredWord = useCallback(() => {
    const view = spellcheckMenuViewRef.current;
    if (!spellcheckMenu) return;

    const nextIgnoredWords = mergeSpellcheckIgnoredWords(spellcheckIgnoredWordsRef.current, spellcheckMenu.match.word);
    spellcheckIgnoredWordsRef.current = nextIgnoredWords;
    if (view) {
      updateSpellcheckOptions(view, { ignoredWords: nextIgnoredWords });
      view.focus();
    }
    onAddSpellcheckIgnoredWordRef.current?.(spellcheckMenu.match.word);
    setSpellcheckMenu(null);
  }, [spellcheckMenu]);

  const createEditor = useCallback(
    (root: HTMLElement) => {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialContentRef.current);
          ctx.update(remarkStringifyOptionsCtx, (options) => ({
            ...options,
            bullet: "-" as const
          }));
          ctx.update(editorViewOptionsCtx, (options) => ({
            ...options,
            attributes: {
              ...options.attributes,
              "aria-label": markdownDocumentLabel,
              "aria-readonly": readOnlyRef.current ? "true" : "false",
              autocomplete: "off",
              autocapitalize: "off",
              autocorrect: "off",
              spellcheck: "false",
              writingsuggestions: "false"
            },
            editable: () => !readOnlyRef.current,
            clipboardTextSerializer: (slice, view) =>
              serializeMarkdownClipboardText(slice, view, ctx.get(serializerCtx))
          }));
          ctx.get(listenerCtx).updated((editorCtx, doc) => {
            try {
              const view = editorCtx.get(editorViewCtx);
              onMarkdownChangeRef.current(
                serializeLinkImageLiveMarkdown(
                  view.state.doc === doc ? doc : view.state.doc,
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
        .use(markraReadOnlyTransactionGuard(readOnlyRef))
        .use(listener)
        .use(history)
        .use(markraFrontmatterRemarkPlugin)
        .use(markraMathRemarkPlugin)
        .use(markraCommonmark)
        .use(markraFrontmatterSchema)
        .use(markraGfm)
        .use(markraFootnoteReferenceInputRule)
        .use(markraFootnoteDefinitionInputPlugin())
        .use(markraTaskListSchema)
        .use(markraTaskListPlugin)
        .use(markraCalloutSerializerPlugin);

      if (githubAlertsEnabled) {
        editor.use(markraCalloutRemarkPlugin);
        editor.use(markraCalloutPlugin);
      }

      editor
        .use(markraSlashCommands(slashCommandLabels, { callout: githubAlertsEnabled }))
        .use(markraMathSourcePlugin)
        .use(markraMarkdownShortcuts(normalizedMarkdownShortcuts))
        .use(markraMarkdownSourcePastePlugin)
        .use(markraCodeBlockPlugin)
        .use(markraMathCaretAnchorSuppressionPlugin)
        .use(markraMathPlugin)
        .use(markraAiSelectionHoldPlugin)
        .use(markraAiEditorPreviewPlugin)
        .use(markraVisualCaretPlugin)
        .use(markraSearchPlugin())
        .use(markraSpellcheckPlugin({
          enabled: spellcheckEnabledRef.current,
          ignoredWords: spellcheckIgnoredWordsRef.current,
          spellchecker
        }))
        .use(markraSpellcheckMenuShortcutPlugin(
          normalizedMarkdownShortcuts.openSpellcheckSuggestions,
          openSpellcheckSuggestionMenu
        ))
        .use(markraFootnotePreviewPlugin())
        .use(markraBlockGapPlugin)
        .use(markraBlockDragPlugin(blockDragLabels))
        .use(markraHeadingTogglePlugin(headingToggleLabels))
        .use(markraListTogglePlugin(listToggleLabels))
        .use(
          markraDocumentLinkCompletionPlugin({
            getDocumentPath: () => documentPathRef.current,
            getWorkspaceFiles: () => workspaceFilesRef.current
          })
        )
        .use(
          markraTextSelectionObserverPlugin(
            (selection) => {
              onTextSelectionChangeRef.current?.(selection);
            },
            {
              onActiveOutlineIndexChange: (index) => {
                onActiveOutlineIndexChangeRef.current?.(index);
              }
            }
          )
        )
        .use(markraTableControlsPlugin(tableControlLabels, {
          getDefaultWidthMode: () => tableColumnWidthModeRef.current,
          getDocumentKey: () => documentPathRef.current
        }))
        .use(markraTrailingParagraphPlugin)
        .use(markraLinkImageLivePlugin(resolveCurrentImageSrc))
        .use(markraHeadingLevelPlugin(headingLevelLabels))
        .use(
          markraRawHtmlPlugin({
            htmlSourceApplyLabel: t(language, "editor.htmlSourceApply"),
            htmlSourceLabel: t(language, "editor.htmlSource"),
            resolveImageSrc: resolveCurrentImageSrc
          })
        )
        .use(markraLiveMarkdownPlugin({ highlight: highlightSyntaxEnabled, initialMarkdown: initialContentRef.current }));

      if (externalLinkOpeningEnabled) {
        editor.use(
          markraExternalLinkClickPlugin({
            openExternalUrl: (url) => {
              return openExternalUrlRef.current?.(url);
            },
            openLocalAttachment: (src) => {
              return openLocalAttachmentRef.current?.(src);
            }
          })
        );
      }

      if (onSaveClipboardImageRef.current || onSaveClipboardAttachmentRef.current || onSaveRemoteClipboardImageRef.current) {
        editor.use(
          markraClipboardImagePluginWithOptions(
            (image) => onSaveClipboardImageRef.current?.(image) ?? Promise.resolve(null),
            {
              documentPath: () => documentPathRef.current,
              saveAttachment: (attachment) => onSaveClipboardAttachmentRef.current?.(attachment) ?? Promise.resolve(null),
              saveRemoteImage: (image) => onSaveRemoteClipboardImageRef.current?.(image) ?? Promise.resolve(null)
            }
          )
        );
      }

      return editor;
    },
    [
      externalLinkOpeningEnabled,
      githubAlertsEnabled,
      highlightSyntaxEnabled,
      language,
      markdownDocumentLabel,
      normalizedMarkdownShortcuts,
      resolveCurrentImageSrc,
      slashCommandLabels,
      openSpellcheckSuggestionMenu,
      spellchecker
    ]
  );

  useEditor(createEditor, [createEditor]);

  return (
    <>
      <Milkdown />
      <MilkdownReadOnlyBridge readOnly={readOnly} />
      <MilkdownSpellcheckBridge spellcheckEnabled={spellcheckEnabled} spellcheckIgnoredWords={spellcheckIgnoredWords} />
      <MilkdownInstanceBridge autoFocus={autoFocus} onEditorReady={onEditorReady} />
      {spellcheckMenu ? (
        <SpellcheckSuggestionMenu
          language={language}
          menu={spellcheckMenu}
          onAddIgnoredWord={handleAddSpellcheckIgnoredWord}
          onReplace={handleReplaceSpellcheckSuggestion}
        />
      ) : null}
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

function spellcheckMenuPosition(view: EditorView, match: SpellcheckMatch) {
  try {
    const coordinates = view.coordsAtPos(match.to);

    return {
      left: Math.max(8, coordinates.left),
      top: Math.max(8, coordinates.bottom + 6)
    };
  } catch {
    return {
      left: 8,
      top: 8
    };
  }
}

function mergeSpellcheckIgnoredWords(currentWords: readonly string[], word: string) {
  const ignoredWords: string[] = [];
  const seenWords = new Set<string>();

  for (const item of [...currentWords, word]) {
    const normalizedWord = item.trim().toLocaleLowerCase();
    if (!normalizedWord || seenWords.has(normalizedWord)) continue;

    seenWords.add(normalizedWord);
    ignoredWords.push(normalizedWord);
  }

  return ignoredWords;
}
