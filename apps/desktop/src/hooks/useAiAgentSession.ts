import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import {
  applyAgentEventToProcesses,
  cancelAgentProcesses,
  chatCompletionStream,
  createDefaultAiAgentSessionState,
  createInitialAgentProcesses,
  failAgentProcesses,
  finalizeAgentProcesses,
  generateAiAgentSessionTitle,
  runDocumentAiAgent,
  type AgentWorkspaceFile,
  type AiDiffResult,
  type AiDocumentAnchor,
  type AiHeadingAnchor,
  type AiSelectionContext,
  type AiAgentSessionPreview,
  type AiAgentSessionMessage,
  type DocumentAiHistoryMessage,
  type DocumentAiImage,
  type WebSearchSettings,
  type StoredAiAgentSessionState
} from "@markra/ai";
import { getProviderCapabilities, type AiProviderConfig } from "@markra/providers";
import type { I18nKey } from "@markra/shared";
import { requestNativeChat, requestNativeChatStream, requestNativeWebResource } from "../lib/tauri";
import {
  getStoredAiAgentPreferences,
  getStoredAiAgentSession,
  getStoredAiAgentSessionSummary,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle
} from "../lib/settings/app-settings";

export type AiAgentPanelMessage = AiAgentSessionMessage;

type AiAgentSessionContext = {
  documentPath?: string | null;
  getDocumentContent: () => string;
  getDocumentEndPosition?: () => number;
  getHeadingAnchors?: () => AiHeadingAnchor[];
  getSectionAnchors?: () => AiDocumentAnchor[];
  getSelection?: () => AiSelectionContext | null;
  getTableAnchors?: () => AiDocumentAnchor[];
  model: string | null;
  onAiPreviewReady?: (result: AiDiffResult, previewId?: string) => unknown;
  onAiResult?: (result: AiDiffResult, previewId?: string) => unknown;
  onSessionModelRestore?: (
    selection: Pick<StoredAiAgentSessionState, "agentModelId" | "agentProviderId">
  ) => unknown;
  onSessionRestore?: (session: Pick<StoredAiAgentSessionState, "panelOpen" | "panelWidth">) => unknown;
  panelOpen?: boolean;
  panelWidth?: number | null;
  provider: AiProviderConfig | null;
  readDocumentImage?: (src: string) => Promise<DocumentAiImage | null>;
  readWorkspaceFile?: (path: string) => Promise<string>;
  sessionId?: string | null;
  settingsLoading: boolean;
  translate?: (key: I18nKey) => string;
  webSearchSettings?: WebSearchSettings | null;
  workspaceKey?: string | null;
  workspaceFiles?: AgentWorkspaceFile[];
};

export function useAiAgentSession(ctx: AiAgentSessionContext) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AiAgentPanelMessage[]>([]);
  const [thinkingEnabled, setThinkingEnabledState] = useState(false);
  const [webSearchEnabled, setWebSearchEnabledState] = useState(false);
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming" | "error">("idle");
  const [titleVersion, setTitleVersion] = useState(0);
  const requestIdRef = useRef(0);
  const assistantMessageIdRef = useRef<number | null>(null);
  const hydratedSessionKeyRef = useRef<string | null>(null);
  const didRestorePanelStateRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const skipNextPersistRef = useRef(false);
  const userChangedThinkingPreferenceRef = useRef(false);
  const userChangedWebSearchPreferenceRef = useRef(false);
  const sessionTitleSourceRef = useRef<"ai" | "fallback" | "manual" | null>(null);
  const titleGenerationSignatureRef = useRef<string | null>(null);
  const onSessionModelRestoreRef = useRef(ctx.onSessionModelRestore);
  const onSessionRestoreRef = useRef(ctx.onSessionRestore);
  const sessionKey = ctx.sessionId?.trim() ? ctx.sessionId : null;
  const agentModelId = ctx.model ?? null;
  const agentProviderId = ctx.provider?.id ?? null;

  onSessionModelRestoreRef.current = ctx.onSessionModelRestore;
  onSessionRestoreRef.current = ctx.onSessionRestore;

  const setThinkingEnabled = useCallback((action: SetStateAction<boolean>) => {
    setThinkingEnabledState((currentValue) => {
      const nextValue = typeof action === "function" ? action(currentValue) : action;

      userChangedThinkingPreferenceRef.current = true;
      saveStoredAiAgentPreferences({ thinkingEnabled: nextValue }).catch(() => {});
      return nextValue;
    });
  }, []);

  const setWebSearchEnabled = useCallback((action: SetStateAction<boolean>) => {
    setWebSearchEnabledState((currentValue) => {
      const nextValue = typeof action === "function" ? action(currentValue) : action;

      userChangedWebSearchPreferenceRef.current = true;
      saveStoredAiAgentPreferences({ webSearchEnabled: nextValue }).catch(() => {});
      return nextValue;
    });
  }, []);

  useEffect(() => {
    if (sessionKey) return;

    let active = true;

    getStoredAiAgentPreferences()
      .then((preferences) => {
        if (!active) return;

        if (!userChangedThinkingPreferenceRef.current) {
          setThinkingEnabledState(preferences.thinkingEnabled);
        }
        if (!userChangedWebSearchPreferenceRef.current) {
          setWebSearchEnabledState(preferences.webSearchEnabled);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sessionKey]);

  const updateAssistantMessage = useCallback((updater: (message: AiAgentPanelMessage) => AiAgentPanelMessage) => {
    const assistantId = assistantMessageIdRef.current;
    if (assistantId === null) return;

    setMessages((currentMessages) =>
      currentMessages.map((message) => (message.id === assistantId ? updater(message) : message))
    );
  }, []);

  const interrupt = useCallback(() => {
    requestIdRef.current += 1;
    updateAssistantMessage((currentMessage) => ({
      ...currentMessage,
      activities: cancelAgentProcesses(currentMessage.activities ?? [])
    }));
    assistantMessageIdRef.current = null;
    setStatus("idle");
  }, [updateAssistantMessage]);

  useEffect(() => {
    let active = true;

    requestIdRef.current += 1;
    const hydrationRequestId = requestIdRef.current;
    assistantMessageIdRef.current = null;
    hydratedSessionKeyRef.current = null;
    skipNextPersistRef.current = false;
    sessionTitleSourceRef.current = null;
    titleGenerationSignatureRef.current = null;
    setStatus("idle");
    const shouldRestorePanelState = !didRestorePanelStateRef.current;

    if (!sessionKey) {
      const defaultSession = createDefaultAiAgentSessionState();
      setDraft(defaultSession.draft);
      setMessages(defaultSession.messages);
      setThinkingEnabledState(defaultSession.thinkingEnabled);
      setWebSearchEnabledState(defaultSession.webSearchEnabled);
      hydratedSessionKeyRef.current = null;
      skipNextPersistRef.current = true;
      return () => {
        active = false;
      };
    }

    Promise.all([getStoredAiAgentSession(sessionKey), getStoredAiAgentSessionSummary(sessionKey)])
      .then(([storedSession, storedSummary]) => {
        if (!active) return;
        if (requestIdRef.current !== hydrationRequestId) {
          hydratedSessionKeyRef.current = sessionKey;
          return;
        }

        setDraft(storedSession.draft);
        setMessages(storedSession.messages);
        setThinkingEnabledState(storedSession.thinkingEnabled);
        setWebSearchEnabledState(storedSession.webSearchEnabled);
        onSessionModelRestoreRef.current?.({
          agentModelId: storedSession.agentModelId,
          agentProviderId: storedSession.agentProviderId
        });
        sessionTitleSourceRef.current = storedSummary?.titleSource ?? null;
        if (shouldRestorePanelState) {
          onSessionRestoreRef.current?.({
            panelOpen: storedSession.panelOpen,
            panelWidth: storedSession.panelWidth
          });
          didRestorePanelStateRef.current = true;
        }
        hydratedSessionKeyRef.current = sessionKey;
        skipNextPersistRef.current = true;
      })
      .catch(() => {
        if (!active) return;
        if (requestIdRef.current !== hydrationRequestId) {
          hydratedSessionKeyRef.current = sessionKey;
          return;
        }

        const defaultSession = createDefaultAiAgentSessionState();
        setDraft(defaultSession.draft);
        setMessages(defaultSession.messages);
        setThinkingEnabledState(defaultSession.thinkingEnabled);
        setWebSearchEnabledState(defaultSession.webSearchEnabled);
        onSessionModelRestoreRef.current?.({
          agentModelId: defaultSession.agentModelId,
          agentProviderId: defaultSession.agentProviderId
        });
        sessionTitleSourceRef.current = null;
        if (shouldRestorePanelState) {
          onSessionRestoreRef.current?.({
            panelOpen: defaultSession.panelOpen,
            panelWidth: defaultSession.panelWidth
          });
          didRestorePanelStateRef.current = true;
        }
        hydratedSessionKeyRef.current = sessionKey;
        skipNextPersistRef.current = true;
      });

    return () => {
      active = false;
    };
  }, [sessionKey]);

  useEffect(() => {
    if (hydratedSessionKeyRef.current !== sessionKey) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      saveStoredAiAgentSession(sessionKey, {
        agentModelId,
        agentProviderId,
        draft,
        messages,
        panelOpen: ctx.panelOpen === true,
        panelWidth: ctx.panelWidth ?? null,
        thinkingEnabled,
        webSearchEnabled
      }, {
        workspaceKey: ctx.workspaceKey ?? null
      }).catch(() => {});
    }, 120);

    return () => {
      if (persistTimerRef.current === null) return;
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    };
  }, [
    agentModelId,
    agentProviderId,
    ctx.panelOpen,
    ctx.panelWidth,
    ctx.workspaceKey,
    draft,
    messages,
    sessionKey,
    thinkingEnabled,
    webSearchEnabled
  ]);

  useEffect(() => {
    if (!sessionKey) return;
    if (hydratedSessionKeyRef.current !== sessionKey) return;
    if (ctx.settingsLoading) return;
    if (!ctx.provider || !ctx.model) return;
    if (status !== "idle") return;
    if (sessionTitleSourceRef.current === "ai" || sessionTitleSourceRef.current === "manual") return;

    const transcriptMessages = messages
      .filter((message) => !message.isError && message.text.trim().length > 0)
      .map((message) => ({
        role: message.role,
        text: message.text.trim()
      }));

    if (!transcriptMessages.some((message) => message.role === "user")) return;
    if (!transcriptMessages.some((message) => message.role === "assistant")) return;

    const generationSignature = JSON.stringify(transcriptMessages);
    if (titleGenerationSignatureRef.current === generationSignature) return;

    titleGenerationSignatureRef.current = generationSignature;
    let active = true;

    generateAiAgentSessionTitle({
      messages: transcriptMessages,
      model: ctx.model,
      provider: ctx.provider,
      transport: requestNativeChat
    })
      .then((title) => {
        if (!active) return;
        if (!title) return;
        if (hydratedSessionKeyRef.current !== sessionKey) return;

        return saveStoredAiAgentSessionTitle(sessionKey, title, {
          workspaceKey: ctx.workspaceKey ?? null
        }).then(() => {
          sessionTitleSourceRef.current = "ai";
          setTitleVersion((currentVersion) => currentVersion + 1);
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [ctx.model, ctx.provider, ctx.settingsLoading, ctx.workspaceKey, messages, sessionKey, status]);

  const submit = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride ?? draft).trim();
    if (!prompt) return;
    const message = (key: I18nKey) => ctx.translate?.(key) ?? key;
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    assistantMessageIdRef.current = null;

    if (ctx.settingsLoading) {
      setStatus("error");
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          isError: true,
          role: "assistant",
          text: message("app.aiSettingsLoading")
        }
      ]);
      return;
    }

    if (!ctx.provider || !ctx.model) {
      setStatus("error");
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          isError: true,
          role: "assistant",
          text: message("app.aiMissingProvider")
        }
      ]);
      return;
    }

    const capabilities = getProviderCapabilities(ctx.provider.id, ctx.provider.type);
    if (!capabilities.chat) {
      setStatus("error");
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          isError: true,
          role: "assistant",
          text: message("app.aiProviderUnsupported")
        }
      ]);
      return;
    }

    const userMessageId = Date.now();
    const assistantMessageId = userMessageId + 1;
    const history: DocumentAiHistoryMessage[] = messages
      .filter((item) => !item.isError)
      .map((item) => ({
        preview: item.preview,
        previews: item.previews,
        role: item.role,
        text: item.text
      }));
    assistantMessageIdRef.current = assistantMessageId;
    setDraft("");
    setStatus("thinking");
    let preparedEditorPreview = false;
    const latestPreparedEditorPreview: { current: { previewId?: string; result: AiDiffResult } | null } = {
      current: null
    };
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: userMessageId, role: "user", text: prompt },
      {
        activities: createInitialAgentProcesses(message),
        id: assistantMessageId,
        role: "assistant",
        text: "",
        thinking: ""
      }
    ]);

    try {
      const response = await runDocumentAiAgent({
        complete: (provider, model, messages, completionOptions) =>
          chatCompletionStream(provider, model, messages, {
            ...completionOptions,
            streamTransport: requestNativeChatStream
          }),
        documentContent: ctx.getDocumentContent(),
        documentEndPosition: ctx.getDocumentEndPosition?.() ?? 0,
        documentPath: ctx.documentPath ?? null,
        history,
        model: ctx.model,
        onPreviewResult: (result, previewId) => {
          if (requestIdRef.current !== requestId) return;

          const preview = sessionPreviewFromAiResult(result);
          if (preview) {
            preparedEditorPreview = true;
            latestPreparedEditorPreview.current = { previewId, result };
            updateAssistantMessage((currentMessage) => ({
              ...currentMessage,
              previews: [...(currentMessage.previews ?? []), preview],
              preview
            }));
          }
          ctx.onAiResult?.(result, previewId);
        },
        onEvent: (event) => {
          if (requestIdRef.current !== requestId) return;

          updateAssistantMessage((currentMessage) => ({
            ...currentMessage,
            activities: applyAgentEventToProcesses(currentMessage.activities ?? [], event, message)
          }));

          if (event.type === "message_end" && event.message.role === "assistant") {
            const completedThinking = assistantThinkingFromAgentMessageContent(event.message.content);
            if (!completedThinking) return;

            updateAssistantMessage((currentMessage) => ({
              ...currentMessage,
              thinkingTurns: appendThinkingTurn(currentMessage.thinkingTurns, completedThinking)
            }));
          }
        },
        onTextDelta: (text) => {
          if (requestIdRef.current !== requestId) return;
          setStatus("streaming");
          updateAssistantMessage((currentMessage) => ({
            ...currentMessage,
            text
          }));
        },
        onThinkingDelta: (thinking) => {
          if (requestIdRef.current !== requestId) return;

          setStatus("thinking");
          updateAssistantMessage((currentMessage) => ({
            ...currentMessage,
            thinking
          }));
        },
        prompt,
        provider: ctx.provider,
        readDocumentImage: ctx.readDocumentImage,
        readWorkspaceFile: ctx.readWorkspaceFile,
        headingAnchors: ctx.getHeadingAnchors?.() ?? [],
        sectionAnchors: ctx.getSectionAnchors?.(),
        selection: ctx.getSelection?.() ?? null,
        tableAnchors: ctx.getTableAnchors?.(),
        thinkingEnabled,
        webSearchEnabled,
        webSearchSettings: ctx.webSearchSettings ?? null,
        webSearchTransport: requestNativeWebResource,
        workspaceFiles: ctx.workspaceFiles ?? []
      });

      if (requestIdRef.current !== requestId) return;

      if (!response.content.trim()) {
        if (preparedEditorPreview || response.preparedPreview) {
          updateAssistantMessage((currentMessage) => ({
            ...currentMessage,
            activities: finalizeAgentProcesses(currentMessage.activities ?? [], message, true),
            text: message("app.aiAgentPreviewReady")
          }));
          setStatus("idle");
          if (latestPreparedEditorPreview.current) {
            ctx.onAiPreviewReady?.(
              latestPreparedEditorPreview.current.result,
              latestPreparedEditorPreview.current.previewId
            );
          }
          return;
        }

        updateAssistantMessage((currentMessage) => ({
          ...currentMessage,
          activities: failAgentProcesses(currentMessage.activities ?? []),
          isError: true,
          text: message(emptyResponseMessageKey(response.stopReasonCode))
        }));
        setStatus("error");
        return;
      }

      updateAssistantMessage((currentMessage) => ({
        ...currentMessage,
        activities: finalizeAgentProcesses(currentMessage.activities ?? [], message, response.content.trim().length > 0),
        text: response.content
      }));
      setStatus("idle");
      if (latestPreparedEditorPreview.current) {
        ctx.onAiPreviewReady?.(
          latestPreparedEditorPreview.current.result,
          latestPreparedEditorPreview.current.previewId
        );
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) return;

      updateAssistantMessage((currentMessage) => ({
        ...currentMessage,
        activities: failAgentProcesses(currentMessage.activities ?? []),
        isError: true,
        text: error instanceof Error ? error.message : message("app.aiRequestFailed")
      }));
      setStatus("error");
    } finally {
      if (requestIdRef.current === requestId) assistantMessageIdRef.current = null;
    }
  }, [ctx, draft, messages, thinkingEnabled, updateAssistantMessage, webSearchEnabled]);

  return {
    draft,
    interrupt,
    messages,
    setDraft,
    setThinkingEnabled,
    setSessionThinkingEnabled: setThinkingEnabledState,
    setWebSearchEnabled,
    status,
    submit,
    thinkingEnabled,
    titleVersion,
    webSearchEnabled
  };
}

function assistantThinkingFromAgentMessageContent(content: unknown) {
  if (!Array.isArray(content)) return "";

  return content
    .map((part) =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "thinking" &&
      "thinking" in part &&
      typeof part.thinking === "string"
        ? part.thinking
        : ""
    )
    .join("")
    .trim();
}

function appendThinkingTurn(currentTurns: string[] | undefined, nextTurn: string) {
  const normalizedNextTurn = nextTurn.trim();
  if (!normalizedNextTurn) return currentTurns;
  const turns = currentTurns ?? [];
  if (turns.at(-1) === normalizedNextTurn) return turns;

  return [...turns, normalizedNextTurn];
}

function emptyResponseMessageKey(stopReasonCode: "repeated_multi_write" | undefined): I18nKey {
  if (stopReasonCode === "repeated_multi_write") {
    return "app.aiAgentRepeatedMultiWrite";
  }

  return "app.aiEmptyResponse";
}

function sessionPreviewFromAiResult(result: AiDiffResult): AiAgentSessionPreview | undefined {
  if (result.type === "error") return undefined;

  return {
    from: result.from,
    original: result.original,
    replacement: result.replacement,
    ...(result.target ? { target: result.target } : {}),
    to: result.to,
    type: result.type
  };
}
