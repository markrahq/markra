import { isEquivalentEditorMarkdown } from "./document-model";

type EditorSurface = "source" | "visual";

type SavedVisualEditorStaleContent = {
  savedContent: string;
  staleContent: string;
};

export function createEditorSyncState() {
  const cleanVisualContentBeforeDirty = new Map<string, string>();
  const cleanVisualMarkdownBaseline = new Map<string, string>();
  const savedVisualEditorStaleContent = new Map<string, SavedVisualEditorStaleContent>();

  function clear(tabId: string | null | undefined) {
    if (!tabId) return;

    cleanVisualContentBeforeDirty.delete(tabId);
    cleanVisualMarkdownBaseline.delete(tabId);
    savedVisualEditorStaleContent.delete(tabId);
  }

  function clearAll() {
    cleanVisualContentBeforeDirty.clear();
    cleanVisualMarkdownBaseline.clear();
    savedVisualEditorStaleContent.clear();
  }

  function clearCleanVisualMarkdownBaseline(tabId: string | null | undefined) {
    if (!tabId) return;

    cleanVisualMarkdownBaseline.delete(tabId);
  }

  function isCleanVisualMarkdownBaseline(tabId: string | null | undefined, editorContent: string) {
    if (!tabId) return false;

    return cleanVisualMarkdownBaseline.get(tabId) === editorContent;
  }

  function rememberCleanVisualMarkdownBaseline(tabId: string | null | undefined, editorContent: string) {
    if (!tabId) return;

    cleanVisualMarkdownBaseline.set(tabId, editorContent);
  }

  function isSavedVisualEditorStaleContent(
    tabId: string | null | undefined,
    savedContent: string,
    editorContent: string
  ) {
    if (!tabId) return false;

    const staleContent = savedVisualEditorStaleContent.get(tabId);
    return Boolean(
      staleContent &&
      isEquivalentEditorMarkdown(staleContent.savedContent, savedContent) &&
      isEquivalentEditorMarkdown(staleContent.staleContent, editorContent)
    );
  }

  function rememberCleanVisualContentBeforeDirty(
    tabId: string | null | undefined,
    previousContent: string,
    nextContent: string,
    surface: EditorSurface | undefined
  ) {
    if (!tabId || surface !== "visual" || isEquivalentEditorMarkdown(previousContent, nextContent)) return;

    cleanVisualContentBeforeDirty.set(tabId, previousContent);
    savedVisualEditorStaleContent.delete(tabId);
  }

  function rememberSavedVisualEditorStaleContent(
    tabId: string | null | undefined,
    savedContent: string
  ) {
    if (!tabId) return;

    const staleContent = cleanVisualContentBeforeDirty.get(tabId);
    cleanVisualContentBeforeDirty.delete(tabId);

    if (!staleContent || isEquivalentEditorMarkdown(staleContent, savedContent)) {
      savedVisualEditorStaleContent.delete(tabId);
      return;
    }

    savedVisualEditorStaleContent.set(tabId, {
      savedContent,
      staleContent
    });
  }

  return {
    clear,
    clearAll,
    clearCleanVisualMarkdownBaseline,
    isCleanVisualMarkdownBaseline,
    isSavedVisualEditorStaleContent,
    rememberCleanVisualContentBeforeDirty,
    rememberCleanVisualMarkdownBaseline,
    rememberSavedVisualEditorStaleContent
  };
}

export type EditorSyncState = ReturnType<typeof createEditorSyncState>;
