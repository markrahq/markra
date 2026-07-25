import type { CodeMirrorVimLabels } from "@markra/editor/codemirror";
import { t, type AppLanguage } from "@markra/shared";

export function codeMirrorVimLabels(
  language: AppLanguage,
): CodeMirrorVimLabels {
  return {
    insertHint: t(language, "editor.vim.insertHint"),
    normalHint: t(language, "editor.vim.normalHint"),
    previousSearchFound: t(language, "editor.vim.previousSearchFound"),
    previousSearchMissing: t(language, "editor.vim.previousSearchMissing"),
    visualHint: t(language, "editor.vim.visualHint"),
  };
}
