import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import {
  chatCompletionStream,
  runInlineAiAgent,
  type AgentWorkspaceFile,
  type AiDiffResult,
  type AiEditIntent,
  type AiSelectionContext
} from "@markra/ai";
import { getProviderCapabilities, type AiProviderConfig } from "@markra/providers";
import type { I18nKey } from "@markra/shared";
import { requestNativeChatStream } from "../lib/tauri";

type AiTextDiffResult = Extract<AiDiffResult, { type: "insert" | "replace" }>;
export type AiCommandStatus = "idle" | "composing" | "thinking" | "streaming" | "suggestion" | "error";

type AiCommandContext = {
  documentPath?: string | null;
  getDocumentContent: () => string;
  getPendingResult?: () => AiDiffResult | null;
  getSelection: () => AiSelectionContext | null;
  model: string | null;
  onAiResult: (result: AiDiffResult, previewId?: string) => unknown;
  provider: AiProviderConfig | null;
  settingsLoading: boolean;
  translate?: (key: I18nKey) => string;
  translationTargetLanguage?: string;
  workspaceFiles?: AgentWorkspaceFile[];
};

export type AiCommandSubmitOptions = {
  thinkingEnabled?: boolean;
};

type RestoreAiCommandOptions = {
  reopen?: boolean;
};

export function useAiCommandUi(ctx: AiCommandContext) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AiCommandStatus>("idle");
  const requestIdRef = useRef(0);
  const submitting = isSubmittingStatus(status);

  const openAiCommand = useCallback((selectionOverride?: AiSelectionContext | null) => {
    const selection = selectionOverride === undefined ? ctx.getSelection() : selectionOverride;
    if (!hasSelectedText(selection)) return false;

    setOpen(true);
    return true;
  }, [ctx]);

  const closeAiCommand = useCallback(() => {
    setOpen(false);
    setStatus((currentStatus) => (isSubmittingStatus(currentStatus) ? currentStatus : "idle"));
  }, []);

  const restoreAiCommand = useCallback((options: RestoreAiCommandOptions = {}) => {
    if (options.reopen ?? true) setOpen(true);
    setStatus("suggestion");
  }, []);

  const interruptPrompt = useCallback(() => {
    requestIdRef.current += 1;
    setStatus("idle");
  }, []);

  const updatePrompt = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
    setStatus((currentStatus) => {
      if (isSubmittingStatus(currentStatus)) return currentStatus;
      if (nextPrompt.trim().length > 0) return "composing";

      return currentStatus === "suggestion" ? "suggestion" : "idle";
    });
  }, []);

  const submitPrompt = useCallback(async (
    promptOverride?: string,
    intent: AiEditIntent = "custom",
    options: AiCommandSubmitOptions = {}
  ) => {
    const trimmedPrompt = (promptOverride ?? prompt).trim();
    if (!trimmedPrompt || submitting) return;
    const message = (key: I18nKey) => ctx.translate?.(key) ?? key;

    if (ctx.settingsLoading) {
      ctx.onAiResult({ message: message("app.aiSettingsLoading"), type: "error" });
      setStatus("error");
      return;
    }

    if (!ctx.provider || !ctx.model) {
      ctx.onAiResult({ message: message("app.aiMissingProvider"), type: "error" });
      setStatus("error");
      return;
    }

    const capabilities = getProviderCapabilities(ctx.provider.id, ctx.provider.type);
    if (!capabilities.chat) {
      ctx.onAiResult({ message: message("app.aiProviderUnsupported"), type: "error" });
      setStatus("error");
      return;
    }

    const documentContent = ctx.getDocumentContent();
    const selection = ctx.getSelection();
    const target = getAiCommandTarget(selection, ctx.getPendingResult?.(), intent);
    if (!target) {
      setStatus("idle");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("thinking");
    try {
      const response = await runInlineAiAgent({
        complete: (provider, model, messages, completionOptions) =>
          chatCompletionStream(provider, model, messages, {
            ...completionOptions,
            streamTransport: requestNativeChatStream
          }),
        documentContent,
        documentPath: ctx.documentPath ?? null,
        intent,
        model: ctx.model,
        prompt: trimmedPrompt,
        provider: ctx.provider,
        target,
        thinkingEnabled: options.thinkingEnabled,
        translationTargetLanguage: ctx.translationTargetLanguage ?? "English",
        onEvent: (event) => {
          if (requestIdRef.current !== requestId) return;
          setStatus(agentStatusFromEvent(event));
          const streamedReplacement = agentReplacementFromEvent(event);
          if (!streamedReplacement) return;

          ctx.onAiResult({
            from: target.from,
            original: target.original,
            replacement: streamedReplacement,
            to: target.to,
            type: target.type
          });
        },
        workspaceFiles: ctx.workspaceFiles ?? []
      });
      if (requestIdRef.current !== requestId) return;

      if (!response.content.trim()) {
        ctx.onAiResult({ message: message("app.aiEmptyResponse"), type: "error" });
        setStatus("error");
        return;
      }

      ctx.onAiResult({
        from: target.from,
        original: target.original,
        replacement: response.content,
        to: target.to,
        type: target.type
      });
      setPrompt("");
      setStatus("suggestion");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      ctx.onAiResult({
        message: error instanceof Error ? error.message : message("app.aiRequestFailed"),
        type: "error"
      });
      setStatus("error");
    }
  }, [ctx, prompt, submitting]);

  return {
    closeAiCommand,
    interruptPrompt,
    openAiCommand,
    open,
    prompt,
    restoreAiCommand,
    status,
    submitPrompt,
    submitting,
    updatePrompt
  };
}

function isSubmittingStatus(status: AiCommandStatus) {
  return status === "thinking" || status === "streaming";
}

function agentStatusFromEvent(event: AgentEvent): AiCommandStatus {
  if (event.type === "agent_start") return "thinking";
  if (event.type === "message_start") return "thinking";
  if (event.type === "message_update") return "streaming";

  return "thinking";
}

function agentReplacementFromEvent(event: AgentEvent) {
  if (event.type !== "message_update" || event.message.role !== "assistant") return null;
  if (event.assistantMessageEvent.type !== "text_delta" && event.assistantMessageEvent.type !== "text_end") return null;

  const text = event.message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
  return text.trim().length > 0 ? text : null;
}

function hasSelectedText(selection: AiSelectionContext | null | undefined): selection is AiSelectionContext {
  return Boolean(selection?.text.trim());
}

function getAiCommandTarget(
  selection: AiSelectionContext | null,
  pendingResult: AiDiffResult | null | undefined,
  intent: AiEditIntent
) {
  if (hasSelectedText(selection)) {
    const scope = selection.source ?? "selection";
    if (intent === "continue") {
      return {
        from: selection.to,
        original: "",
        promptText: selection.text,
        scope,
        to: selection.to,
        type: "insert" as const
      };
    }

    return {
      from: selection.from,
      original: selection.text,
      promptText: selection.text,
      scope,
      to: selection.to,
      type: "replace" as const
    };
  }

  if (!isTextDiffResult(pendingResult)) return null;

  // Follow-up prompts should refine the visible suggestion while keeping the original diff anchor intact.
  return {
    from: pendingResult.from,
    original: pendingResult.original,
    promptText: pendingResult.replacement,
    scope: "suggestion" as const,
    suggestionContext: {
      original: pendingResult.original,
      replacement: pendingResult.replacement
    },
    to: pendingResult.to,
    type: pendingResult.type
  };
}

function isTextDiffResult(result: AiDiffResult | null | undefined): result is AiTextDiffResult {
  return result?.type === "insert" || result?.type === "replace";
}
