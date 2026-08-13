import { markdown } from "@codemirror/lang-markdown";
import { codeFolding } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import {
  jsonSyntaxHighlighting,
  markdownSourceSyntaxHighlighting,
  markdownSyntaxHighlighting,
  markraHighlight,
} from "./highlight.ts";
import {
  markraPlugins,
  type MarkraPlugin,
} from "./plugin.ts";
import { livePreview, type LivePreviewConfig } from "./preview.ts";
import { markraSlashMenu } from "./slash-menu.ts";
import { markraTheme } from "./theme.ts";

export type {
  AiEditorPreviewLabels,
} from "../ai-preview-events.ts";
export {
  AI_EDITOR_PREVIEW_ACTION_EVENT,
  AI_EDITOR_PREVIEW_APPLIED_EVENT,
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
} from "../ai-preview-events.ts";
export type {
  CodeMirrorAiPreviewOptions,
} from "./ai-preview.ts";
export {
  applyCodeMirrorAiResult,
  clearCodeMirrorAiPreview,
  codeMirrorAiPreviewPlugin,
  confirmCodeMirrorAiResultApplied,
  listCodeMirrorAiPreviewResults,
  restoreCodeMirrorAiPreviews,
  scrollCodeMirrorAiPreviewIntoView,
  showCodeMirrorAiPreview,
} from "./ai-preview.ts";
export {
  clearCodeMirrorAiSelectionHold,
  codeMirrorAiSelectionHoldPlugin,
  showCodeMirrorAiSelectionHold,
} from "./ai-selection-hold.ts";
export type {
  BlockCommandId,
  BlockLabels,
  BlocksPluginOptions,
} from "./blocks.ts";
export { blocksPlugin } from "./blocks.ts";
export type {
  CodeMirrorBlockDragLabels,
  CodeMirrorBlockDragPluginOptions,
  CodeMirrorBlockDropSide,
  CodeMirrorBlockRange,
} from "./block-drag.ts";
export {
  addCodeMirrorBlockBelow,
  codeMirrorBlockDragPlugin,
  moveCodeMirrorBlock,
  readCodeMirrorBlockRanges,
} from "./block-drag.ts";
export type { CodeMirrorClipboardAssetsPluginOptions } from "./clipboard-assets.ts";
export { codeMirrorClipboardAssetsPlugin } from "./clipboard-assets.ts";
export type { CalloutPreviewPluginOptions } from "./callout-preview.ts";
export { calloutPreviewPlugin } from "./callout-preview.ts";
export type {
  CodeBlockHighlightContext,
  CodeBlockHighlightSpan,
  CodeBlockPreviewPluginOptions,
} from "./code-block.ts";
export { codeBlockPreviewPlugin } from "./code-block.ts";
export type {
  CodeMirrorSearchOptions,
  CodeMirrorMarkdownImageReference,
  CodeMirrorMarkdownLinkReference,
  ReplaceCodeMirrorMarkdownOptions,
} from "./controller.ts";
export {
  comparableCodeMirrorMarkdown,
  codeMirrorSelectionIsInsideFencedCode,
  findCodeMirrorSearchMatches,
  insertCodeMirrorMarkdownImage,
  insertCodeMirrorMarkdownImages,
  insertCodeMirrorMarkdownLink,
  insertCodeMirrorMarkdownLinks,
  insertCodeMirrorMarkdownSnippet,
  insertCodeMirrorMarkdownTable,
  isCodeMirrorMarkdownEquivalent,
  readCodeMirrorAiSelectionContext,
  readCodeMirrorHeadingAnchors,
  readCodeMirrorSectionAnchors,
  readCodeMirrorTableAnchors,
  replaceAllCodeMirrorSearchMatches,
  replaceCodeMirrorMarkdown,
  replaceCodeMirrorSearchMatch,
  serializeCodeMirrorMarkdownImage,
  serializeCodeMirrorMarkdownLink,
  updateCodeMirrorHeadingAnchors,
} from "./controller.ts";
export type {
  DocumentLinksPluginOptions,
  MarkraDocumentLinkAction,
  MarkraDocumentLinkItem,
  MarkraDocumentLinksContext,
  MarkraDocumentLinksState,
} from "./document-links.ts";
export {
  closeMarkraDocumentLinks,
  documentLinksPlugin,
  getMarkraDocumentLinksState,
  runMarkraDocumentLink,
} from "./document-links.ts";
export type {
  FormattingCommandId,
  FormattingLabels,
  FormattingPluginOptions,
} from "./formatting.ts";
export {
  clearCodeMirrorSelectionFormatting,
  formattingPlugin,
} from "./formatting.ts";
export { footnotePreviewPlugin } from "./footnote-preview.ts";
export type { FoldToggleLabels, FoldTogglePluginOptions } from "./fold-toggle.ts";
export { foldTogglePlugin } from "./fold-toggle.ts";
export { toggleAllCodeMirrorFolds } from "./folding.ts";
export type {
  CodeMirrorFrontmatterKind,
  CodeMirrorFrontmatterRange,
} from "./frontmatter-preview.ts";
export {
  frontmatterPreviewPlugin,
  readCodeMirrorFrontmatter,
} from "./frontmatter-preview.ts";
export type {
  ImagePreviewPluginOptions,
  MarkraImageSourceContext,
} from "./image.ts";
export { imagePreviewPlugin, resolveSafeImageSource } from "./image.ts";
export {
  jsonSyntaxHighlighting,
  markdownSourceSyntaxHighlighting,
  markdownSyntaxHighlighting,
  markraHighlight,
} from "./highlight.ts";
export { horizontalRulePlugin } from "./horizontal-rule.ts";
export {
  clearCodeMirrorLocationCue,
  codeMirrorLocationCue,
  locationCueDurationMs,
  showCodeMirrorLocationCue,
} from "./location-cue.ts";
export type {
  InsertionCommandId,
  InsertionLabels,
  InsertionsPluginOptions,
} from "./insertions.ts";
export { insertionsPlugin } from "./insertions.ts";
export { markdownEditingPlugin } from "./markdown-editing.ts";
export type { MarkdownShortcutsPluginOptions } from "./markdown-shortcuts.ts";
export { markdownShortcutsPlugin } from "./markdown-shortcuts.ts";
export type {
  LinksPluginOptions,
  MarkraLinkActivation,
  MarkraLinkOpenContext,
  MarkraLinkSourceContext,
} from "./links.ts";
export {
  linksPlugin,
  resolveAutolinkTarget,
  resolveSafeLinkTarget,
} from "./links.ts";
export type { CodeMirrorMathRange } from "./math-preview.ts";
export { findCodeMirrorMathRanges, mathPreviewPlugin } from "./math-preview.ts";
export type { RevealContext, RevealPolicy, RevealScope } from "./policy.ts";
export type {
  MarkraCommand,
  MarkraCommandContext,
  MarkraKeyBinding,
  MarkraPlugin,
  MarkraUiAction,
  MarkraUiContribution,
  MarkraUiPlacement,
} from "./plugin.ts";
export type { LivePreviewConfig } from "./preview.ts";
export type {
  MarkraRenderer,
  MarkraRendererContext,
  MarkraRendererScope,
  MarkraSyntaxNode,
} from "./renderers.ts";
export { revealActiveLine } from "./policy.ts";
export type { RawHtmlPreviewPluginOptions } from "./raw-html-preview.ts";
export { rawHtmlPreviewPlugin } from "./raw-html-preview.ts";
export {
  defineMarkraPlugin,
  listMarkraPlugins,
  listMarkraUi,
  markraPlugins,
  runMarkraCommand,
  searchMarkraUi,
} from "./plugin.ts";
export type {
  MarkraSlashMenuSource,
  MarkraSlashMenuState,
} from "./slash-menu.ts";
export {
  closeMarkraSlashMenu,
  getMarkraSlashMenuState,
  markraSlashMenu,
  openMarkraSlashMenu,
  runMarkraSlashMenuAction,
} from "./slash-menu.ts";
export { livePreview } from "./preview.ts";
export { markraRenderer } from "./renderers.ts";
export type { CodeMirrorSearchState } from "./search.ts";
export {
  codeMirrorSearchPlugin,
  getCodeMirrorSearchState,
  scrollCodeMirrorSearchMatchIntoView,
  updateCodeMirrorSearchDecorations,
} from "./search.ts";
export type {
  CodeMirrorSpellcheckState,
  CodeMirrorSpellcheckUpdate,
} from "./spellcheck.ts";
export {
  codeMirrorSpellcheckPlugin,
  getActiveCodeMirrorSpellcheckMatch,
  getCodeMirrorSpellcheckState,
  replaceCodeMirrorSpellcheckMatch,
  updateCodeMirrorSpellcheckOptions,
} from "./spellcheck.ts";
export { markraTheme } from "./theme.ts";
export { convertCodeMirrorClipboardHtml } from "./html-paste.ts";
export type { TableFragmentMergePluginOptions } from "./table-fragment-merge.ts";
export { tableFragmentMergePlugin } from "./table-fragment-merge.ts";
export type {
  CodeMirrorTableAlignment,
  CodeMirrorTableShape,
  CodeMirrorTableWidthMode,
  TablePreviewPluginOptions,
} from "./table.ts";
export { readCodeMirrorTableShape, tablePreviewPlugin } from "./table.ts";
export { trailingSpacePlugin } from "./trailing-space.ts";
export type { CodeMirrorTypewriterModeOptions } from "./typewriter.ts";
export { codeMirrorTypewriterMode } from "./typewriter.ts";
export type { CodeMirrorVimLabels } from "./vim.ts";
export { reconfigureCodeMirrorVimMode } from "./vim.ts";

export interface LiveMarkdownConfig extends LivePreviewConfig {
  highlight?: boolean;
  plugins?: readonly MarkraPlugin[];
  slashMenu?: boolean;
}

export const markraLanguage = markdown({
  extensions: [GFM, markraHighlight],
});

export function liveMarkdown(config: LiveMarkdownConfig = {}): Extension {
  const {
    highlight = true,
    plugins = [],
    slashMenu = false,
    ...previewConfig
  } = config;
  return [
    highlight
      ? markraLanguage
      : markdown({ extensions: [GFM] }),
    markdownSyntaxHighlighting,
    codeFolding(),
    livePreview(previewConfig),
    markraTheme,
    markraPlugins(plugins),
    slashMenu ? markraSlashMenu() : [],
  ];
}
