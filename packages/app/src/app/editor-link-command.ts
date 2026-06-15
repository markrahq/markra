type EditorLinkCommandOptions = {
  insertMarkdownLink: () => unknown;
  readOnlyMode: boolean;
  syncAiSelectionToolbarFormattingState: () => unknown;
  syncVisualMarkdownAfterEditorCommand: () => unknown;
};

export function runEditorLinkCommand({
  insertMarkdownLink,
  readOnlyMode,
  syncAiSelectionToolbarFormattingState,
  syncVisualMarkdownAfterEditorCommand
}: EditorLinkCommandOptions) {
  if (readOnlyMode) return false;

  insertMarkdownLink();
  syncVisualMarkdownAfterEditorCommand();
  syncAiSelectionToolbarFormattingState();
  return true;
}
