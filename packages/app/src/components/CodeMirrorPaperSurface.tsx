import {
  blocksPlugin,
  codeMirrorBlockDragPlugin,
  calloutPreviewPlugin,
  codeMirrorClipboardAssetsPlugin,
  codeMirrorAiPreviewPlugin,
  codeMirrorAiSelectionHoldPlugin,
  codeBlockPreviewPlugin,
  codeMirrorSearchPlugin,
  codeMirrorSelectionIsInsideFencedCode,
  codeMirrorSpellcheckPlugin,
  codeMirrorLocationCue,
  codeMirrorTypewriterMode,
  documentLinksPlugin,
  footnotePreviewPlugin,
  foldTogglePlugin,
  formattingPlugin,
  frontmatterPreviewPlugin,
  getActiveCodeMirrorSpellcheckMatch,
  horizontalRulePlugin,
  imagePreviewPlugin,
  insertionsPlugin,
  liveMarkdown,
  linksPlugin,
  markdownEditingPlugin,
  markdownShortcutsPlugin,
  markraPlugins,
  mathPreviewPlugin,
  rawHtmlPreviewPlugin,
  readCodeMirrorAiSelectionContext,
  readCodeMirrorHeadingAnchors,
  reconfigureCodeMirrorVimMode,
  replaceCodeMirrorMarkdown,
  replaceCodeMirrorSpellcheckMatch,
  resolveSafeLinkTarget,
  tableFragmentMergePlugin,
  tablePreviewPlugin,
  trailingSpacePlugin,
  updateCodeMirrorHeadingAnchors,
  updateCodeMirrorSpellcheckOptions,
  type MarkraPlugin,
} from "@markra/editor/codemirror";
import type {
  SaveClipboardAttachment,
  SaveClipboardImage,
  SaveRemoteClipboardImage,
  MarkdownShortcutMap,
  Spellchecker,
} from "@markra/editor";
import type { AiSelectionContext } from "@markra/ai";
import {
  MarkraEditorProvider,
  markraEditorReactBridge,
} from "@markra/editor-react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useCallback, useEffect, useRef, useState } from "react";
import { t, type AppLanguage } from "@markra/shared";
import type {
  ExtendedSyntaxPreferences,
  TableColumnWidthModePreference,
} from "../lib/settings/app-settings";
import {
  documentLinkCompletionFiles,
  markdownDocumentLinkForFile,
  markdownDocumentLinkHrefForFile,
  markdownDocumentLinkTitle,
  type MarkdownDocumentLinkFile,
} from "../lib/document-links";
import { isLocalAttachmentHref } from "../lib/markdown-link-target";
import {
  mergeSpellcheckIgnoredWords,
  spellcheckMenuPosition,
} from "../lib/spellcheck-menu";
import {
  pasteCodeMirrorPlainText,
  readAppClipboardText,
  type ClipboardTextReader,
} from "../lib/plain-text-paste";
import { codeMirrorVimLabels } from "../lib/vim-labels";
import { CodeMirrorEditorFloatingMenus } from "./CodeMirrorEditorFloatingMenus";
import { CodeMirrorPluginUi } from "./CodeMirrorPluginUi";
import {
  SpellcheckSuggestionMenu,
  type SpellcheckSuggestionMenuState,
} from "./SpellcheckSuggestionMenu";

const emptyPlugins: readonly MarkraPlugin[] = [];

export interface CodeMirrorPaperSurfaceProps {
  autoFocus?: boolean;
  documentPath?: string | null;
  extendedSyntax?: ExtendedSyntaxPreferences;
  initialContent: string;
  language?: AppLanguage;
  markdownShortcuts?: MarkdownShortcutMap;
  onAddSpellcheckIgnoredWord?: (word: string) => unknown;
  onActiveOutlineIndexChange?: (index: number | null) => unknown;
  onEditorReady: (
    view: EditorView | null,
    disposedView?: EditorView,
  ) => unknown;
  onMarkdownChange: (content: string) => unknown;
  onSaveClipboardAttachment?: SaveClipboardAttachment;
  onSaveClipboardImage?: SaveClipboardImage;
  onSaveRemoteClipboardImage?: SaveRemoteClipboardImage;
  onTextSelectionChange?: (selection: AiSelectionContext | null) => unknown;
  openExternalUrl?: (url: string) => unknown;
  openLocalAttachment?: (src: string) => unknown;
  plugins?: readonly MarkraPlugin[];
  readClipboardText?: ClipboardTextReader;
  readOnly?: boolean;
  resolveImageSrc?: (src: string) => string;
  hideHeadingMarkersOnFocus?: boolean;
  showCodeBlockLineNumbers?: boolean;
  spellcheckEnabled?: boolean;
  spellcheckIgnoredWords?: readonly string[];
  spellchecker?: Spellchecker;
  tableColumnWidthMode?: TableColumnWidthModePreference;
  typewriterModeEnabled?: boolean;
  vimModeEnabled?: boolean;
  workspaceFiles?: MarkdownDocumentLinkFile[];
}

function editableExtension(readOnly: boolean, language: AppLanguage): Extension {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({
      "aria-label": t(language, "app.markdownDocument"),
      "aria-multiline": "true",
      "aria-readonly": readOnly ? "true" : "false",
      "data-language": "markdown",
      role: "textbox",
      spellcheck: "false",
    }),
  ];
}

interface MarkdownExtensionOptions {
  documentPath: () => string | null | undefined;
  extendedSyntax?: ExtendedSyntaxPreferences;
  language: AppLanguage;
  openExternalUrl: () => ((url: string) => unknown) | undefined;
  openLocalAttachment: () => ((src: string) => unknown) | undefined;
  openSpellcheckSuggestions: (view: EditorView) => boolean;
  resolveImageSrc: (source: string) => string | undefined;
  hideHeadingMarkersOnFocus: boolean;
  showCodeBlockLineNumbers: boolean;
  plugins: readonly MarkraPlugin[];
  pastePlainText: (view: EditorView, shortcut: string) => boolean;
  shortcuts?: MarkdownShortcutMap;
  tableColumnWidthMode: TableColumnWidthModePreference;
  workspaceFiles: () => MarkdownDocumentLinkFile[];
}

function markdownExtension({
  documentPath,
  extendedSyntax,
  language,
  openExternalUrl,
  openLocalAttachment,
  openSpellcheckSuggestions,
  resolveImageSrc,
  hideHeadingMarkersOnFocus,
  showCodeBlockLineNumbers,
  plugins,
  pastePlainText,
  shortcuts,
  tableColumnWidthMode,
  workspaceFiles,
}: MarkdownExtensionOptions) {
  const linkOptions = openExternalUrl() || openLocalAttachment()
    ? {
        open: ({ source, target }: { source: string; target: string }) => {
          const localAttachment = isLocalAttachmentHref(source);
          const localOpener = openLocalAttachment();
          if (localAttachment && localOpener) {
            return localOpener(source);
          }
          return openExternalUrl()?.(target);
        },
        resolveTarget: ({ source }: { source: string }) => {
          if (isLocalAttachmentHref(source)) {
            return openLocalAttachment() || openExternalUrl()
              ? source
              : null;
          }
          return openExternalUrl()
            ? resolveSafeLinkTarget(source)
            : null;
        },
    }
    : undefined;
  const imageOptions = {
    resolveSource: ({ source }: { source: string }) =>
      resolveImageSrc(source) ?? null,
  };

  return liveMarkdown({
    highlight: extendedSyntax?.highlight ?? true,
    resolveLinkTarget: linkOptions?.resolveTarget,
    hideHeadingMarkersOnFocus,
    plugins: [
      blocksPlugin({
        callout: extendedSyntax?.githubAlerts ?? true,
        headingLevelLabel: t(language, "menu.headingLevel"),
        keybindings: false,
        labels: {
          "block.bullet-list": t(language, "menu.bulletList"),
          "block.callout": t(language, "menu.callout"),
          "block.code": t(language, "menu.codeBlock"),
          "block.heading.1": t(language, "menu.heading1"),
          "block.heading.2": t(language, "menu.heading2"),
          "block.heading.3": t(language, "menu.heading3"),
          "block.ordered-list": t(language, "menu.orderedList"),
          "block.paragraph": t(language, "menu.paragraph"),
          "block.quote": t(language, "menu.quote"),
          "block.table": t(language, "menu.table"),
          "block.task-list": t(language, "menu.taskList"),
        },
      }),
      codeMirrorBlockDragPlugin({
        labels: {
          addBlock: t(language, "editor.blockAdd"),
          dragBlock: t(language, "editor.blockDrag"),
        },
      }),
      calloutPreviewPlugin({
        enabled: extendedSyntax?.githubAlerts ?? true,
      }),
      codeBlockPreviewPlugin({ showLineNumbers: showCodeBlockLineNumbers }),
      documentLinksPlugin({
        items: ({ query }) =>
          documentLinkCompletionFiles(
            workspaceFiles(),
            query,
            documentPath(),
          ).map((file) => ({
            detail: file.relativePath,
            href: markdownDocumentLinkHrefForFile(file, documentPath()),
            id: file.path,
            keywords: [file.relativePath],
            label: markdownDocumentLinkTitle(file),
            markdown: markdownDocumentLinkForFile(file, documentPath()),
          })),
      }),
      footnotePreviewPlugin(),
      foldTogglePlugin({
        labels: {
          collapseListItem: t(language, "editor.collapseListItem"),
          collapseSection: t(language, "editor.collapseSection"),
          expandListItem: t(language, "editor.expandListItem"),
          expandSection: t(language, "editor.expandSection"),
        },
      }),
      formattingPlugin({
        keybindings: false,
        labels: {
          "format.bold": t(language, "menu.bold"),
          "format.code": t(language, "menu.inlineCode"),
          "format.highlight": t(language, "menu.highlight"),
          "format.italic": t(language, "menu.italic"),
          "format.strikethrough": t(language, "menu.strikethrough"),
        },
      }),
      frontmatterPreviewPlugin(),
      horizontalRulePlugin(),
      imagePreviewPlugin(imageOptions),
      insertionsPlugin({
        labels: {
          "insert.today": t(language, "menu.today"),
        },
      }),
      ...(linkOptions ? [linksPlugin(linkOptions)] : []),
      mathPreviewPlugin(),
      markdownEditingPlugin(),
      markdownShortcutsPlugin({
        openSpellcheckSuggestions,
        pastePlainText,
        shortcuts,
      }),
      rawHtmlPreviewPlugin({
        resolveImageSrc: (source) => resolveImageSrc(source) ?? source,
      }),
      tableFragmentMergePlugin({
        label: t(language, "editor.table.mergeFragment"),
      }),
      tablePreviewPlugin({
        getDocumentKey: documentPath,
        images: imageOptions,
        labels: {
          addColumnRight: t(language, "editor.table.addColumnRight"),
          addRowBelow: t(language, "editor.table.addRowBelow"),
          adjustTable: t(language, "editor.table.adjustTable"),
          alignCenter: t(language, "editor.table.alignCenter"),
          alignLeft: t(language, "editor.table.alignLeft"),
          alignRight: t(language, "editor.table.alignRight"),
          columnWidthMode: t(language, "editor.table.columnWidthMode"),
          deleteColumn: t(language, "editor.table.deleteColumn"),
          deleteRow: t(language, "editor.table.deleteRow"),
          deleteTable: t(language, "editor.table.deleteTable"),
          resizeTableTo: t(language, "editor.table.resizeTableTo"),
          tableColumns: t(language, "editor.table.columns"),
          tableRows: t(language, "editor.table.rows"),
        },
        links: linkOptions,
        widthMode: tableColumnWidthMode,
      }),
      trailingSpacePlugin(),
      ...plugins,
    ],
    slashMenu: true,
  });
}

const paperTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    height: "100%",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
  },
});

export function CodeMirrorPaperSurface({
  autoFocus = false,
  documentPath,
  extendedSyntax,
  initialContent,
  language = "en",
  markdownShortcuts,
  onAddSpellcheckIgnoredWord,
  onActiveOutlineIndexChange,
  onEditorReady,
  onMarkdownChange,
  onSaveClipboardAttachment,
  onSaveClipboardImage,
  onSaveRemoteClipboardImage,
  onTextSelectionChange,
  openExternalUrl,
  openLocalAttachment,
  plugins = emptyPlugins,
  readClipboardText = readAppClipboardText,
  readOnly = false,
  resolveImageSrc,
  hideHeadingMarkersOnFocus = false,
  showCodeBlockLineNumbers = true,
  spellcheckEnabled = false,
  spellcheckIgnoredWords = [],
  spellchecker,
  tableColumnWidthMode = "auto",
  typewriterModeEnabled = false,
  vimModeEnabled = false,
  workspaceFiles = [],
}: CodeMirrorPaperSurfaceProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [spellcheckMenu, setSpellcheckMenu] =
    useState<SpellcheckSuggestionMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialContentRef = useRef(initialContent);
  const documentPathRef = useRef(documentPath);
  const extendedSyntaxRef = useRef(extendedSyntax);
  const onEditorReadyRef = useRef(onEditorReady);
  const onActiveOutlineIndexChangeRef = useRef(onActiveOutlineIndexChange);
  const onAddSpellcheckIgnoredWordRef = useRef(onAddSpellcheckIgnoredWord);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onSaveClipboardAttachmentRef = useRef(onSaveClipboardAttachment);
  const onSaveClipboardImageRef = useRef(onSaveClipboardImage);
  const onSaveRemoteClipboardImageRef = useRef(onSaveRemoteClipboardImage);
  const onTextSelectionChangeRef = useRef(onTextSelectionChange);
  const openExternalUrlRef = useRef(openExternalUrl);
  const openLocalAttachmentRef = useRef(openLocalAttachment);
  const resolveImageSrcRef = useRef(resolveImageSrc);
  const imeCompositionActiveRef = useRef(false);
  const imeMarkdownChangePendingRef = useRef(false);
  const markdownCompartmentRef = useRef(new Compartment());
  const editableCompartmentRef = useRef(new Compartment());
  const spellcheckCompartmentRef = useRef(new Compartment());
  const typewriterModeCompartmentRef = useRef(new Compartment());
  const vimModeCompartmentRef = useRef(new Compartment());
  const spellcheckIgnoredWordsRef = useRef(spellcheckIgnoredWords);
  const workspaceFilesRef = useRef(workspaceFiles);

  useEffect(() => {
    documentPathRef.current = documentPath;
  }, [documentPath]);

  useEffect(() => {
    extendedSyntaxRef.current = extendedSyntax;
  }, [extendedSyntax]);

  useEffect(() => {
    resolveImageSrcRef.current = resolveImageSrc;
  }, [resolveImageSrc]);

  useEffect(() => {
    workspaceFilesRef.current = workspaceFiles;
  }, [workspaceFiles]);

  useEffect(() => {
    onActiveOutlineIndexChangeRef.current = onActiveOutlineIndexChange;
  }, [onActiveOutlineIndexChange]);

  useEffect(() => {
    onAddSpellcheckIgnoredWordRef.current = onAddSpellcheckIgnoredWord;
  }, [onAddSpellcheckIgnoredWord]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  useEffect(() => {
    onSaveClipboardAttachmentRef.current = onSaveClipboardAttachment;
  }, [onSaveClipboardAttachment]);

  useEffect(() => {
    onSaveClipboardImageRef.current = onSaveClipboardImage;
  }, [onSaveClipboardImage]);

  useEffect(() => {
    onSaveRemoteClipboardImageRef.current = onSaveRemoteClipboardImage;
  }, [onSaveRemoteClipboardImage]);

  useEffect(() => {
    onTextSelectionChangeRef.current = onTextSelectionChange;
  }, [onTextSelectionChange]);

  useEffect(() => {
    openExternalUrlRef.current = openExternalUrl;
  }, [openExternalUrl]);

  useEffect(() => {
    openLocalAttachmentRef.current = openLocalAttachment;
  }, [openLocalAttachment]);

  useEffect(() => {
    spellcheckIgnoredWordsRef.current = spellcheckIgnoredWords;
  }, [spellcheckIgnoredWords]);

  useEffect(() => {
    if (!spellcheckMenu) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpellcheckMenu(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [spellcheckMenu]);

  const openSpellcheckSuggestionMenu = useCallback((view: EditorView) => {
    const match = getActiveCodeMirrorSpellcheckMatch(view);
    if (!match) return false;

    setSpellcheckMenu({
      ...spellcheckMenuPosition(view, match),
      match,
    });
    return true;
  }, []);

  const handleReplaceSpellcheckSuggestion = useCallback(
    (suggestion: string) => {
      const view = viewRef.current;
      if (view && spellcheckMenu) {
        replaceCodeMirrorSpellcheckMatch(
          view,
          spellcheckMenu.match,
          suggestion,
        );
      }
      setSpellcheckMenu(null);
    },
    [spellcheckMenu],
  );

  const handleAddSpellcheckIgnoredWord = useCallback(() => {
    if (!spellcheckMenu) return;

    const nextIgnoredWords = mergeSpellcheckIgnoredWords(
      spellcheckIgnoredWordsRef.current,
      spellcheckMenu.match.word,
    );
    spellcheckIgnoredWordsRef.current = nextIgnoredWords;
    const view = viewRef.current;
    if (view) {
      updateCodeMirrorSpellcheckOptions(view, {
        ignoredWords: nextIgnoredWords,
      });
      view.focus();
    }
    onAddSpellcheckIgnoredWordRef.current?.(spellcheckMenu.match.word);
    setSpellcheckMenu(null);
  }, [spellcheckMenu]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewRef.current) return;

    let headingAnchors: ReturnType<typeof readCodeMirrorHeadingAnchors> | null =
      null;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialContentRef.current,
        extensions: [
          vimModeCompartmentRef.current.of([]),
          minimalSetup,
          EditorView.lineWrapping,
          markdownCompartmentRef.current.of(
            markdownExtension({
              documentPath: () => documentPathRef.current,
              extendedSyntax: extendedSyntaxRef.current,
              language,
              openExternalUrl: () => openExternalUrlRef.current,
              openLocalAttachment: () => openLocalAttachmentRef.current,
              openSpellcheckSuggestions: openSpellcheckSuggestionMenu,
              resolveImageSrc: (source) => resolveImageSrcRef.current?.(source),
              hideHeadingMarkersOnFocus,
              showCodeBlockLineNumbers,
              plugins,
              pastePlainText: (shortcutView, shortcut) =>
                pasteCodeMirrorPlainText(
                  shortcutView,
                  readClipboardText,
                  shortcut,
                ),
              shortcuts: markdownShortcuts,
              tableColumnWidthMode,
              workspaceFiles: () => workspaceFilesRef.current,
            }),
          ),
          markraPlugins([
            codeMirrorClipboardAssetsPlugin({
              documentPath: () => documentPathRef.current,
              saveAttachment: (attachment) =>
                onSaveClipboardAttachmentRef.current?.(attachment) ?? Promise.resolve(null),
              saveImage: (image) =>
                onSaveClipboardImageRef.current?.(image) ?? Promise.resolve(null),
              saveRemoteImage: (image) =>
                onSaveRemoteClipboardImageRef.current?.(image) ?? Promise.resolve(null),
            }),
          ]),
          codeMirrorAiPreviewPlugin(),
          codeMirrorAiSelectionHoldPlugin(),
          markraEditorReactBridge,
          codeMirrorSearchPlugin(),
          codeMirrorLocationCue(),
          spellcheckCompartmentRef.current.of(
            codeMirrorSpellcheckPlugin({
              enabled: spellcheckEnabled,
              ignoredWords: spellcheckIgnoredWords,
              spellchecker,
            }),
          ),
          typewriterModeCompartmentRef.current.of(
            codeMirrorTypewriterMode({ enabled: typewriterModeEnabled }),
          ),
          editableCompartmentRef.current.of(
            editableExtension(readOnly, language),
          ),
          EditorView.domEventHandlers({
            compositionstart() {
              imeCompositionActiveRef.current = true;
              imeMarkdownChangePendingRef.current = false;
              return false;
            },
            compositionend(_event, compositionView) {
              imeCompositionActiveRef.current = false;
              if (!imeMarkdownChangePendingRef.current) return false;

              // IMEs can finalize their last DOM input immediately after
              // compositionend. Publish in a microtask so React receives one
              // settled snapshot and cannot disturb the composing DOM.
              queueMicrotask(() => {
                if (
                  !imeMarkdownChangePendingRef.current ||
                  viewRef.current !== compositionView
                ) {
                  return;
                }
                imeMarkdownChangePendingRef.current = false;
                onMarkdownChangeRef.current(
                  compositionView.state.doc.toString(),
                );
              });
              return false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
              const selection = update.state.selection.main;
              if (!update.view.composing) {
                const selectionContext = codeMirrorSelectionIsInsideFencedCode(
                  update.state,
                )
                  ? null
                  : readCodeMirrorAiSelectionContext(update.view);
                onTextSelectionChangeRef.current?.(
                  selectionContext?.text.trim() ? selectionContext : null,
                );
              }

              if (headingAnchors === null) {
                headingAnchors = readCodeMirrorHeadingAnchors(update.state);
              } else if (update.docChanged) {
                headingAnchors = updateCodeMirrorHeadingAnchors(
                  headingAnchors,
                  update.startState,
                  update.state,
                  update.changes,
                );
              }
              let activeOutlineIndex: number | null = null;
              for (const [index, heading] of headingAnchors.entries()) {
                if (heading.from > selection.head) break;
                activeOutlineIndex = index;
              }
              onActiveOutlineIndexChangeRef.current?.(activeOutlineIndex);
            }

            if (update.docChanged) {
              if (
                imeCompositionActiveRef.current ||
                update.view.composing
              ) {
                imeMarkdownChangePendingRef.current = true;
              } else {
                imeMarkdownChangePendingRef.current = false;
                onMarkdownChangeRef.current(update.state.doc.toString());
              }
            }
          }),
          paperTheme,
        ],
      }),
    });

    viewRef.current = view;
    setEditorView(view);
    onEditorReadyRef.current(view);
    if (autoFocus) view.focus();

    return () => {
      onActiveOutlineIndexChangeRef.current?.(null);
      onTextSelectionChangeRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      onEditorReadyRef.current(null, view);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: markdownCompartmentRef.current.reconfigure(
        markdownExtension({
          documentPath: () => documentPathRef.current,
          extendedSyntax,
          language,
          openExternalUrl: () => openExternalUrlRef.current,
          openLocalAttachment: () => openLocalAttachmentRef.current,
          openSpellcheckSuggestions: openSpellcheckSuggestionMenu,
          resolveImageSrc: (source) => resolveImageSrcRef.current?.(source),
          hideHeadingMarkersOnFocus,
          showCodeBlockLineNumbers,
          plugins,
          pastePlainText: (shortcutView, shortcut) =>
            pasteCodeMirrorPlainText(
              shortcutView,
              readClipboardText,
              shortcut,
            ),
          shortcuts: markdownShortcuts,
          tableColumnWidthMode,
          workspaceFiles: () => workspaceFilesRef.current,
        }),
      ),
    });
  }, [
    extendedSyntax,
    language,
    markdownShortcuts,
    Boolean(openExternalUrl),
    Boolean(openLocalAttachment),
    openSpellcheckSuggestionMenu,
    plugins,
    readClipboardText,
    hideHeadingMarkersOnFocus,
    showCodeBlockLineNumbers,
    tableColumnWidthMode,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(
        editableExtension(readOnly, language),
      ),
    });
  }, [language, readOnly]);

  useEffect(() => {
    initialContentRef.current = initialContent;
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === initialContent) return;

    replaceCodeMirrorMarkdown(view, initialContent);
  }, [initialContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: spellcheckCompartmentRef.current.reconfigure(
        codeMirrorSpellcheckPlugin({
          enabled: spellcheckEnabled,
          ignoredWords: spellcheckIgnoredWords,
          spellchecker,
        }),
      ),
    });
  }, [spellcheckEnabled, spellcheckIgnoredWords, spellchecker]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: typewriterModeCompartmentRef.current.reconfigure(
        codeMirrorTypewriterMode({ enabled: typewriterModeEnabled }),
      ),
    });
  }, [typewriterModeEnabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    return reconfigureCodeMirrorVimMode(
      view,
      vimModeCompartmentRef.current,
      vimModeEnabled,
      codeMirrorVimLabels(language),
    );
  }, [language, vimModeEnabled]);

  useEffect(() => {
    if (!autoFocus) return;
    viewRef.current?.focus();
  }, [autoFocus]);

  return (
    <MarkraEditorProvider view={editorView}>
      <div className="h-full min-h-0" ref={containerRef} />
      <CodeMirrorEditorFloatingMenus
        documentLinksLabel={t(language, "app.markdownDocument")}
        slashMenuEmptyLabel={t(language, "editor.slashCommandsNoResults")}
        slashMenuLabel={t(language, "editor.slashCommands")}
      />
      <CodeMirrorPluginUi pluginIds={plugins.map((plugin) => plugin.id)} />
      {spellcheckMenu ? (
        <SpellcheckSuggestionMenu
          language={language}
          menu={spellcheckMenu}
          onAddIgnoredWord={handleAddSpellcheckIgnoredWord}
          onReplace={handleReplaceSpellcheckSuggestion}
        />
      ) : null}
    </MarkraEditorProvider>
  );
}
