import { useCallback, useEffect, useRef } from "react";

type MarkdownChangeOptions = {
  documentRevision?: number;
};

type ReplaceEditorMarkdown = (markdown: string, options?: { addToHistory?: boolean }) => boolean;

type SharedEditorHistoryOptions = {
  documentContent: string;
  documentRevision: number;
  largeMarkdownVisualBlocked: boolean;
  replaceEditorMarkdown: ReplaceEditorMarkdown;
  sourceSurfaceActive: boolean;
  visualEditorReadySequence: number;
};

export function useSharedEditorHistory({
  documentContent,
  documentRevision,
  largeMarkdownVisualBlocked,
  replaceEditorMarkdown,
  sourceSurfaceActive,
  visualEditorReadySequence
}: SharedEditorHistoryOptions) {
  const pendingSourceHistoryRef = useRef(false);
  const syncingSourceToVisualRef = useRef(false);

  const isApplyingSourceToVisualSync = useCallback(() => syncingSourceToVisualRef.current, []);
  const markSourceEditForHistory = useCallback((content: string, options?: MarkdownChangeOptions) => {
    if (
      content !== documentContent &&
      (options?.documentRevision === undefined || options.documentRevision === documentRevision)
    ) {
      pendingSourceHistoryRef.current = true;
    }
  }, [documentContent, documentRevision]);

  useEffect(() => {
    if (!sourceSurfaceActive || largeMarkdownVisualBlocked) {
      pendingSourceHistoryRef.current = false;
      return;
    }

    syncingSourceToVisualRef.current = true;
    try {
      const synced = replaceEditorMarkdown(documentContent, {
        addToHistory: pendingSourceHistoryRef.current
      });
      if (synced) pendingSourceHistoryRef.current = false;
    } finally {
      syncingSourceToVisualRef.current = false;
    }
  }, [
    documentContent,
    largeMarkdownVisualBlocked,
    replaceEditorMarkdown,
    sourceSurfaceActive,
    visualEditorReadySequence
  ]);

  return {
    isApplyingSourceToVisualSync,
    markSourceEditForHistory
  };
}
