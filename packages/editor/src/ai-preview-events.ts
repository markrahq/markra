import type { AiDiffResult } from "@markra/ai";

export const AI_EDITOR_PREVIEW_ACTION_EVENT = "markra-ai-preview-action";
export const AI_EDITOR_PREVIEW_APPLIED_EVENT = "markra-ai-preview-applied";
export const AI_EDITOR_PREVIEW_RESTORE_EVENT = "markra-ai-preview-restore";

export type AiTextDiffResult = Extract<
  AiDiffResult,
  { type: "insert" | "replace" }
>;

export type AiEditorPreviewAction = "append" | "apply" | "copy" | "reject";

export interface AiEditorPreviewAppliedDetail {
  previewId?: string;
  previews: AiTextDiffResult[];
  result: AiTextDiffResult;
}

export interface AiEditorPreviewActionDetail {
  action: AiEditorPreviewAction;
  previewId?: string;
  result: AiTextDiffResult;
}

export interface AiEditorPreviewRestoreDetail {
  previewId?: string;
  previews: AiTextDiffResult[];
  result: AiTextDiffResult;
}

export interface AiEditorPreviewLabels {
  append?: string;
  apply: string;
  chars?: string;
  copied: string;
  copy: string;
  insertScope?: string;
  reject: string;
  replaceDocumentScope?: string;
  replaceRegionScope?: string;
  replaceSelectionScope?: string;
}
