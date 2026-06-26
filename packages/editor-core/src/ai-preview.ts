export const AI_EDITOR_PREVIEW_ACTION_EVENT = "markra-ai-preview-action";
export const AI_EDITOR_PREVIEW_APPLIED_EVENT = "markra-ai-preview-applied";
export const AI_EDITOR_PREVIEW_RESTORE_EVENT = "markra-ai-preview-restore";

export type AiEditorPreviewAction = "apply" | "copy" | "reject";

export type AiEditorPreviewTextDiffResult = {
  from?: number;
  original: string;
  replacement: string;
  target?: {
    from?: number;
    id?: string;
    kind: "current_block" | "document" | "document_end" | "heading" | "section" | "selection" | "table";
    title?: string;
    to?: number;
  };
  to?: number;
  type: "insert" | "replace";
};

export type AiEditorPreviewAppliedDetail = {
  previewId?: string;
  previews: AiEditorPreviewTextDiffResult[];
  result: AiEditorPreviewTextDiffResult;
};

export type AiEditorPreviewActionDetail = {
  action: AiEditorPreviewAction;
  previewId?: string;
  result: AiEditorPreviewTextDiffResult;
};

export type AiEditorPreviewRestoreDetail = {
  previewId?: string;
  previews: AiEditorPreviewTextDiffResult[];
  result: AiEditorPreviewTextDiffResult;
};
