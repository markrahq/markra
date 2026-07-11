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
  type ApplyWorkspaceChangePlanResult,
  type AgentWorkspaceFile,
  type AiDiffResult,
  type AiDocumentAnchor,
  type AiHeadingAnchor,
  type AcpPermissionOption,
  type AcpPermissionRequest,
  type AcpPermissionRequestOutcome,
  type AiSelectionContext,
  type AiAgentSessionPreview,
  type AiAgentSessionAttachment,
  type AiAgentSessionMessage,
  type DocumentAiHistoryMessage,
  type DocumentAiImage,
  type WebSearchSettings,
  type StoredAiAgentSessionState,
  type WorkspaceChangePlanArgs,
  type WorkspacePlanVisualEvent
} from "@markra/ai";
import { getProviderCapabilities, type AiProviderConfig } from "@markra/providers";
import type { I18nKey } from "@markra/shared";
import { requestNativeChat, requestNativeChatStream, requestNativeWebResource } from "../lib/tauri";
import {
  getStoredAcpAgentSettings,
  getStoredAiAgentPreferences,
  getStoredAiAgentSession,
  getStoredAiAgentSessionSummary,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle
} from "../lib/settings/app-settings";
import { runAcpDocumentAgent, type AcpAgentModelOption } from "../lib/acp-agent";
import {
  workspaceChangePlanFromToolResult,
  workspacePlanEventsFromToolResult
} from "../lib/workspace-plan-events";
import {
  AiChatAttachmentValidationError,
  createDraftAiChatAttachments,
  persistDraftAiChatAttachments,
  resolveAiChatAttachments,
  revokeDraftAiChatAttachments,
  type DraftAiChatAttachment
} from "../lib/ai-chat-attachments";

export type AiAgentPanelMessage = AiAgentSessionMessage & {
  attachmentSources?: Record<string, string>;
};

export type AcpAgentPermissionPrompt = {
  detail?: string;
  id: string;
  options: AcpPermissionOption[];
  title: string;
};

type AiAgentSessionContext = {
  applyWorkspacePlan?: (
    plan: WorkspaceChangePlanArgs,
    options: { onVisualEvent: (event: WorkspacePlanVisualEvent) => unknown }
  ) => Promise<ApplyWorkspaceChangePlanResult>;
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

export type WorkspacePlanApplyStatus = "applied" | "applying" | "error" | "idle";

const workspacePlanVisualEventDelayMs = 420;

type RunningAiAgentRequest = {
  assistantMessageId: number;
  cancel?: () => unknown;
  draft: string;
  messages: AiAgentPanelMessage[];
  requestId: number;
  status: "thinking" | "streaming";
  thinkingEnabled: boolean;
  webSearchEnabled: boolean;
};

type PendingAcpPermissionResolution = {
  prompt: AcpAgentPermissionPrompt;
  requestId: number;
  resolve: (outcome: AcpPermissionRequestOutcome) => unknown;
  sessionKey: string | null;
};

type PendingAcpPermissionFilter = {
  requestId?: number;
  sessionKey?: string | null;
};

export function useAiAgentSession(ctx: AiAgentSessionContext) {
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAiChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiAgentPanelMessage[]>([]);
  const [thinkingEnabled, setThinkingEnabledState] = useState(false);
  const [webSearchEnabled, setWebSearchEnabledState] = useState(false);
  const [acpModels, setAcpModels] = useState<AcpAgentModelOption[]>([]);
  const [pendingAcpPermission, setPendingAcpPermission] = useState<AcpAgentPermissionPrompt | null>(null);
  const [selectedAcpModelId, setSelectedAcpModelId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming" | "error">("idle");
  const [titleVersion, setTitleVersion] = useState(0);
  const [workspacePlanEvents, setWorkspacePlanEvents] = useState<WorkspacePlanVisualEvent[]>([]);
  const [workspacePlanApplyStatus, setWorkspacePlanApplyStatus] = useState<WorkspacePlanApplyStatus>("idle");
  const [workspacePlanApplyError, setWorkspacePlanApplyError] = useState<string | null>(null);
  const [latestWorkspacePlan, setLatestWorkspacePlan] = useState<WorkspaceChangePlanArgs | null>(null);
  const requestIdRef = useRef(0);
  const draftAttachmentsRef = useRef<DraftAiChatAttachment[]>([]);
  const draftAttachmentSessionKeyRef = useRef<string | null>(null);
  const hydrationRequestIdRef = useRef(0);
  const activeSessionKeyRef = useRef<string | null>(null);
  const runningRequestsRef = useRef(new Map<string | null, RunningAiAgentRequest>());
  const pendingAcpPermissionRef = useRef<PendingAcpPermissionResolution | null>(null);
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

  activeSessionKeyRef.current = sessionKey;
  onSessionModelRestoreRef.current = ctx.onSessionModelRestore;
  onSessionRestoreRef.current = ctx.onSessionRestore;

  const replaceDraftAttachments = useCallback((attachments: DraftAiChatAttachment[]) => {
    draftAttachmentsRef.current = attachments;
    setDraftAttachments(attachments);
  }, []);

  const addAttachments = useCallback(async (files: readonly File[]) => {
    try {
      const attachments = await createDraftAiChatAttachments(files, draftAttachmentsRef.current);
      replaceDraftAttachments([...draftAttachmentsRef.current, ...attachments]);
      setAttachmentError(null);
    } catch (error) {
      setAttachmentError(
        error instanceof AiChatAttachmentValidationError ? error.code : "attachment_failed"
      );
    }
  }, [replaceDraftAttachments]);

  const removeAttachment = useCallback((attachmentId: string) => {
    const attachment = draftAttachmentsRef.current.find((item) => item.metadata.id === attachmentId);
    if (!attachment) return;

    revokeDraftAiChatAttachments([attachment]);
    replaceDraftAttachments(draftAttachmentsRef.current.filter((item) => item.metadata.id !== attachmentId));
    setAttachmentError(null);
  }, [replaceDraftAttachments]);

  useEffect(() => {
    if (draftAttachmentSessionKeyRef.current !== sessionKey) {
      revokeDraftAiChatAttachments(draftAttachmentsRef.current);
      replaceDraftAttachments([]);
      setAttachmentError(null);
      draftAttachmentSessionKeyRef.current = sessionKey;
    }
  }, [replaceDraftAttachments, sessionKey]);

  useEffect(() => () => {
    revokeDraftAiChatAttachments(draftAttachmentsRef.current);
    draftAttachmentsRef.current = [];
  }, []);

  const cancelPendingAcpPermission = useCallback((filter: PendingAcpPermissionFilter = {}) => {
    const pending = pendingAcpPermissionRef.current;
    if (!pending) return;
    if ("requestId" in filter && filter.requestId !== pending.requestId) return;
    if ("sessionKey" in filter && filter.sessionKey !== pending.sessionKey) return;

    pendingAcpPermissionRef.current = null;
    if (activeSessionKeyRef.current === pending.sessionKey) {
      setPendingAcpPermission(null);
    }
    pending.resolve({ outcome: "cancelled" });
  }, []);

  const resolveAcpPermission = useCallback((outcome: AcpPermissionRequestOutcome) => {
    const pending = pendingAcpPermissionRef.current;
    if (!pending) return;

    pendingAcpPermissionRef.current = null;
    if (activeSessionKeyRef.current === pending.sessionKey) {
      setPendingAcpPermission(null);
    }
    pending.resolve(outcome);
  }, []);

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

  const selectAcpModel = useCallback((modelId: string) => {
    setSelectedAcpModelId((currentModelId) =>
      acpModels.some((model) => model.id === modelId) ? modelId : currentModelId
    );
  }, [acpModels]);

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

  const interrupt = useCallback(() => {
    cancelPendingAcpPermission({ sessionKey });
    const runningRequest = runningRequestsRef.current.get(sessionKey);
    if (runningRequest) {
      runningRequest.cancel?.();
      runningRequestsRef.current.delete(sessionKey);
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === runningRequest.assistantMessageId
            ? {
                ...message,
                activities: cancelAgentProcesses(message.activities ?? [])
              }
            : message
        )
      );
    }
    setStatus("idle");
  }, [cancelPendingAcpPermission, sessionKey]);

  useEffect(() => {
    let active = true;

    hydrationRequestIdRef.current += 1;
    const hydrationRequestId = hydrationRequestIdRef.current;
    const runningRequest = runningRequestsRef.current.get(sessionKey);
    hydratedSessionKeyRef.current = null;
    skipNextPersistRef.current = false;
    setWorkspacePlanEvents([]);
    setLatestWorkspacePlan(null);
    setWorkspacePlanApplyError(null);
    setWorkspacePlanApplyStatus("idle");
    setPendingAcpPermission(
      pendingAcpPermissionRef.current?.sessionKey === sessionKey
        ? pendingAcpPermissionRef.current.prompt
        : null
    );
    sessionTitleSourceRef.current = null;
    titleGenerationSignatureRef.current = null;
    setStatus(runningRequest?.status ?? "idle");
    const shouldRestorePanelState = !didRestorePanelStateRef.current;

    if (!sessionKey) {
      const defaultSession = createDefaultAiAgentSessionState();
      setDraft(runningRequest?.draft ?? defaultSession.draft);
      setMessages(runningRequest?.messages ?? defaultSession.messages);
      setThinkingEnabledState(runningRequest?.thinkingEnabled ?? defaultSession.thinkingEnabled);
      setWebSearchEnabledState(runningRequest?.webSearchEnabled ?? defaultSession.webSearchEnabled);
      hydratedSessionKeyRef.current = null;
      skipNextPersistRef.current = true;
      return () => {
        active = false;
      };
    }

    Promise.all([getStoredAiAgentSession(sessionKey), getStoredAiAgentSessionSummary(sessionKey)])
      .then(async ([storedSession, storedSummary]) => {
        if (!active) return;
        if (hydrationRequestIdRef.current !== hydrationRequestId) {
          hydratedSessionKeyRef.current = sessionKey;
          return;
        }

        const currentRunningRequest = runningRequestsRef.current.get(sessionKey);
        const hydratedMessages = currentRunningRequest?.messages
          ?? await hydrateAiAgentPanelMessages(storedSession.messages, sessionKey);
        if (!active || hydrationRequestIdRef.current !== hydrationRequestId) return;
        setDraft(currentRunningRequest?.draft ?? storedSession.draft);
        setMessages(hydratedMessages);
        setThinkingEnabledState(currentRunningRequest?.thinkingEnabled ?? storedSession.thinkingEnabled);
        setWebSearchEnabledState(currentRunningRequest?.webSearchEnabled ?? storedSession.webSearchEnabled);
        setStatus(currentRunningRequest?.status ?? "idle");
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
        if (hydrationRequestIdRef.current !== hydrationRequestId) {
          hydratedSessionKeyRef.current = sessionKey;
          return;
        }

        const defaultSession = createDefaultAiAgentSessionState();
        const currentRunningRequest = runningRequestsRef.current.get(sessionKey);
        setDraft(currentRunningRequest?.draft ?? defaultSession.draft);
        setMessages(currentRunningRequest?.messages ?? defaultSession.messages);
        setThinkingEnabledState(currentRunningRequest?.thinkingEnabled ?? defaultSession.thinkingEnabled);
        setWebSearchEnabledState(currentRunningRequest?.webSearchEnabled ?? defaultSession.webSearchEnabled);
        setStatus(currentRunningRequest?.status ?? "idle");
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

  const submit = useCallback(async (
    promptOverride?: string,
    options: {
      attachments?: AiAgentSessionAttachment[];
      baseMessages?: AiAgentPanelMessage[];
    } = {}
  ) => {
    const prompt = (promptOverride ?? draft).trim();
    const pendingDraftAttachments = options.attachments ? [] : draftAttachmentsRef.current;
    if (!prompt && pendingDraftAttachments.length === 0 && !options.attachments?.length) return;
    const message = (key: I18nKey) => ctx.translate?.(key) ?? key;
    const requestId = requestIdRef.current + 1;
    const transcriptBaseMessages = options.baseMessages ?? messages;

    requestIdRef.current = requestId;
    hydrationRequestIdRef.current += 1;
    cancelPendingAcpPermission({ sessionKey });

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

    const acpAgentSettings = await getStoredAcpAgentSettings().catch(() => null);
    const runWithAcpAgent = acpAgentSettings?.enabled === true && Boolean(acpAgentSettings.command.trim());

    if (!runWithAcpAgent && (!ctx.provider || !ctx.model)) {
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

    const capabilities = ctx.provider ? getProviderCapabilities(ctx.provider.id, ctx.provider.type) : null;
    if (!runWithAcpAgent && !capabilities?.chat) {
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
    const hasImageAttachments = pendingDraftAttachments.length > 0 || Boolean(options.attachments?.length);
    const selectedModelSupportsVision = ctx.provider?.models.some(
      (model) => model.id === ctx.model && model.enabled && model.capabilities.includes("vision")
    ) === true;
    if (!runWithAcpAgent && hasImageAttachments && !selectedModelSupportsVision) {
      setAttachmentError("vision_model_required");
      return;
    }

    const userMessageId = Date.now();
    const assistantMessageId = userMessageId + 1;
    const runSessionKey = sessionKey;
    const runAgentModelId = agentModelId;
    const runAgentProviderId = agentProviderId;
    const runPanelOpen = ctx.panelOpen === true;
    const runPanelWidth = ctx.panelWidth ?? null;
    const runThinkingEnabled = thinkingEnabled;
    const runWebSearchEnabled = webSearchEnabled;
    const runWorkspaceKey = ctx.workspaceKey ?? null;
    const acpAbortController = runWithAcpAgent ? new AbortController() : null;
    const attachmentSessionId = runSessionKey ?? "default";
    let currentAttachments = options.attachments ?? [];
    let currentImages: Awaited<ReturnType<typeof resolveAiChatAttachments>>["images"] = [];
    let history: DocumentAiHistoryMessage[] = [];
    try {
      if (pendingDraftAttachments.length > 0) {
        // Persist before starting the request so a sent transcript never points at unsaved image bytes.
        currentAttachments = await persistDraftAiChatAttachments(attachmentSessionId, pendingDraftAttachments);
      }
      currentImages = currentAttachments.length > 0
        ? (await resolveAiChatAttachments(attachmentSessionId, currentAttachments)).images
        : [];
      history = await resolveDocumentAiHistory(transcriptBaseMessages, attachmentSessionId);
    } catch {
      setAttachmentError("attachment_storage_failed");
      setStatus("error");
      return;
    }
    if (pendingDraftAttachments.length > 0) {
      revokeDraftAiChatAttachments(pendingDraftAttachments);
      replaceDraftAttachments([]);
    }
    setAttachmentError(null);
    const attachmentSources = Object.fromEntries(currentImages.map((image) => [image.id, image.dataUrl]));
    const initialMessages: AiAgentPanelMessage[] = [
      ...transcriptBaseMessages,
      {
        ...(currentAttachments.length ? { attachments: currentAttachments } : {}),
        ...(currentImages.length ? { attachmentSources } : {}),
        id: userMessageId,
        role: "user",
        text: prompt
      },
      {
        activities: createInitialAgentProcesses(message),
        id: assistantMessageId,
        role: "assistant",
        text: "",
        thinking: ""
      }
    ];
    const runIsCurrent = () => runningRequestsRef.current.get(runSessionKey)?.requestId === requestId;
    const updateRunRequest = (updater: (request: RunningAiAgentRequest) => RunningAiAgentRequest) => {
      const currentRequest = runningRequestsRef.current.get(runSessionKey);
      if (!currentRequest || currentRequest.requestId !== requestId) return null;

      const nextRequest = updater(currentRequest);
      runningRequestsRef.current.set(runSessionKey, nextRequest);

      if (activeSessionKeyRef.current === runSessionKey) {
        setMessages(nextRequest.messages);
        setStatus(nextRequest.status);
      }

      return nextRequest;
    };
    const updateRunAssistantMessage = (
      updater: (message: AiAgentPanelMessage) => AiAgentPanelMessage,
      nextStatus?: RunningAiAgentRequest["status"]
    ) =>
      updateRunRequest((currentRequest) => ({
        ...currentRequest,
        messages: currentRequest.messages.map((message) =>
          message.id === currentRequest.assistantMessageId ? updater(message) : message
        ),
        status: nextStatus ?? currentRequest.status
      }));
    const persistCompletedRun = async (completedRequest: RunningAiAgentRequest) => {
      if (activeSessionKeyRef.current === runSessionKey) {
        hydrationRequestIdRef.current += 1;
      }

      await saveStoredAiAgentSession(runSessionKey, {
        agentModelId: runAgentModelId,
        agentProviderId: runAgentProviderId,
        draft: completedRequest.draft,
        messages: completedRequest.messages,
        panelOpen: runPanelOpen,
        panelWidth: runPanelWidth,
        thinkingEnabled: runThinkingEnabled,
        webSearchEnabled: runWebSearchEnabled
      }, {
        workspaceKey: runWorkspaceKey
      }).catch(() => {});
      setTitleVersion((currentVersion) => currentVersion + 1);
    };

    runningRequestsRef.current.set(runSessionKey, {
      assistantMessageId,
      ...(acpAbortController ? { cancel: () => acpAbortController.abort() } : {}),
      draft: "",
      messages: initialMessages,
      requestId,
      status: "thinking",
      thinkingEnabled: runThinkingEnabled,
      webSearchEnabled: runWebSearchEnabled
    });
    setDraft("");
    setWorkspacePlanEvents([]);
    setLatestWorkspacePlan(null);
    setWorkspacePlanApplyError(null);
    setWorkspacePlanApplyStatus("idle");
    setPendingAcpPermission(null);
    setStatus("thinking");
    let preparedEditorPreview = false;
    const latestPreparedEditorPreview: { current: { previewId?: string; result: AiDiffResult } | null } = {
      current: null
    };
    setMessages(initialMessages);

    try {
      const response = runWithAcpAgent && acpAgentSettings
        ? await runAcpDocumentAgent({
            documentContent: ctx.getDocumentContent(),
            documentPath: ctx.documentPath ?? null,
            history,
            images: currentImages,
            onModelState: (state) => {
              if (!runIsCurrent()) return;

              setAcpModels(state.models);
              setSelectedAcpModelId((currentModelId) => {
                if (currentModelId && state.models.some((model) => model.id === currentModelId)) {
                  return currentModelId;
                }

                return state.selectedModelId;
              });
            },
            onPermissionRequest: (request, permissionContext) => {
              if (!runIsCurrent()) return permissionContext.safeOutcome;

              const prompt = acpPermissionPromptFromRequest(request, permissionContext.toolCallId);
              const currentPending = pendingAcpPermissionRef.current;
              if (currentPending) {
                pendingAcpPermissionRef.current = null;
                if (activeSessionKeyRef.current === currentPending.sessionKey) {
                  setPendingAcpPermission(null);
                }
                currentPending.resolve({ outcome: "cancelled" });
              }

              return new Promise<AcpPermissionRequestOutcome>((resolve) => {
                pendingAcpPermissionRef.current = {
                  prompt,
                  requestId,
                  resolve,
                  sessionKey: runSessionKey
                };
                if (activeSessionKeyRef.current === runSessionKey) {
                  setPendingAcpPermission(prompt);
                }
              });
            },
            onPreviewResult: (result, previewId) => {
              if (!runIsCurrent()) return;

              const preview = sessionPreviewFromAiResult(result);
              if (preview) {
                preparedEditorPreview = true;
                latestPreparedEditorPreview.current = { previewId, result };
                updateRunAssistantMessage((currentMessage) => ({
                  ...currentMessage,
                  previews: [...(currentMessage.previews ?? []), preview],
                  preview
                }));
              }
              if (activeSessionKeyRef.current === runSessionKey) {
                ctx.onAiResult?.(result, previewId);
              }
            },
            onEvent: (event) => {
              if (!runIsCurrent()) return;

              updateRunAssistantMessage((currentMessage) => ({
                ...currentMessage,
                activities: applyAgentEventToProcesses(currentMessage.activities ?? [], event, message)
              }));
            },
            onTextDelta: (text) => {
              if (!runIsCurrent()) return;
              updateRunAssistantMessage((currentMessage) => ({
                ...currentMessage,
                text
              }), "streaming");
            },
            prompt,
            readWorkspaceFile: ctx.readWorkspaceFile,
            selectedModelId: selectedAcpModelId,
            selection: ctx.getSelection?.() ?? null,
            settings: acpAgentSettings,
            signal: acpAbortController?.signal,
            workspaceKey: ctx.workspaceKey ?? null
          })
        : await runDocumentAiAgent({
            complete: (provider, model, messages, completionOptions) =>
              chatCompletionStream(provider, model, messages, {
                ...completionOptions,
                fallbackTransport: requestNativeChat,
                streamTransport: requestNativeChatStream,
                useVercelAiSdk: true
              }),
            documentContent: ctx.getDocumentContent(),
            documentEndPosition: ctx.getDocumentEndPosition?.() ?? 0,
            documentPath: ctx.documentPath ?? null,
            history,
            images: currentImages,
            model: ctx.model!,
            onPreviewResult: (result, previewId) => {
              if (!runIsCurrent()) return;

              const preview = sessionPreviewFromAiResult(result);
              if (preview) {
                preparedEditorPreview = true;
                latestPreparedEditorPreview.current = { previewId, result };
                updateRunAssistantMessage((currentMessage) => ({
                  ...currentMessage,
                  previews: [...(currentMessage.previews ?? []), preview],
                  preview
                }));
              }
              if (activeSessionKeyRef.current === runSessionKey) {
                ctx.onAiResult?.(result, previewId);
              }
            },
            onEvent: (event) => {
              if (!runIsCurrent()) return;

              updateRunAssistantMessage((currentMessage) => ({
                ...currentMessage,
                activities: applyAgentEventToProcesses(currentMessage.activities ?? [], event, message)
              }));

              if (
                event.type === "tool_execution_end" &&
                !event.isError &&
                event.toolName === "prepare_workspace_change_plan"
              ) {
                const nextWorkspacePlanEvents = workspacePlanEventsFromToolResult(event.result);
                const nextWorkspacePlan = workspaceChangePlanFromToolResult(event.result);
                if (nextWorkspacePlanEvents.length > 0 && activeSessionKeyRef.current === runSessionKey) {
                  setLatestWorkspacePlan(nextWorkspacePlan);
                  setWorkspacePlanApplyError(null);
                  setWorkspacePlanApplyStatus("idle");
                  setWorkspacePlanEvents(nextWorkspacePlanEvents);
                }
              }

              if (event.type === "message_end" && event.message.role === "assistant") {
                const completedThinking = assistantThinkingFromAgentMessageContent(event.message.content);
                if (!completedThinking) return;

                updateRunAssistantMessage((currentMessage) => ({
                  ...currentMessage,
                  thinkingTurns: appendThinkingTurn(currentMessage.thinkingTurns, completedThinking)
                }));
              }
            },
            onTextDelta: (text) => {
              if (!runIsCurrent()) return;
              updateRunAssistantMessage((currentMessage) => ({
                ...currentMessage,
                text
              }), "streaming");
            },
            onThinkingDelta: (thinking) => {
              if (!runIsCurrent()) return;

              updateRunAssistantMessage((currentMessage) => ({
                ...currentMessage,
                thinking
              }), "thinking");
            },
            prompt,
            provider: ctx.provider!,
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

      if (!runIsCurrent()) return;

      if (!response.content.trim()) {
        if (preparedEditorPreview || response.preparedPreview) {
          const completedRequest = updateRunAssistantMessage((currentMessage) => ({
            ...currentMessage,
            activities: finalizeAgentProcesses(currentMessage.activities ?? [], message, true),
            text: message("app.aiAgentPreviewReady")
          }));
          if (!completedRequest) return;

          runningRequestsRef.current.delete(runSessionKey);
          cancelPendingAcpPermission({ requestId, sessionKey: runSessionKey });
          if (activeSessionKeyRef.current === runSessionKey) setStatus("idle");
          await persistCompletedRun(completedRequest);
          if (latestPreparedEditorPreview.current && activeSessionKeyRef.current === runSessionKey) {
            ctx.onAiPreviewReady?.(
              latestPreparedEditorPreview.current.result,
              latestPreparedEditorPreview.current.previewId
            );
          }
          return;
        }

        const failedRequest = updateRunAssistantMessage((currentMessage) => ({
          ...currentMessage,
          activities: failAgentProcesses(currentMessage.activities ?? []),
          isError: true,
          text: message(emptyResponseMessageKey(response.stopReasonCode))
        }));
        if (!failedRequest) return;

        runningRequestsRef.current.delete(runSessionKey);
        cancelPendingAcpPermission({ requestId, sessionKey: runSessionKey });
        if (activeSessionKeyRef.current === runSessionKey) setStatus("error");
        await persistCompletedRun(failedRequest);
        return;
      }

      const completedRequest = updateRunAssistantMessage((currentMessage) => ({
        ...currentMessage,
        activities: finalizeAgentProcesses(currentMessage.activities ?? [], message, response.content.trim().length > 0),
        text: response.content
      }));
      if (!completedRequest) return;

      runningRequestsRef.current.delete(runSessionKey);
      cancelPendingAcpPermission({ requestId, sessionKey: runSessionKey });
      if (activeSessionKeyRef.current === runSessionKey) setStatus("idle");
      await persistCompletedRun(completedRequest);
      if (latestPreparedEditorPreview.current && activeSessionKeyRef.current === runSessionKey) {
        ctx.onAiPreviewReady?.(
          latestPreparedEditorPreview.current.result,
          latestPreparedEditorPreview.current.previewId
        );
      }
    } catch (error) {
      if (!runIsCurrent()) return;

      const failedRequest = updateRunAssistantMessage((currentMessage) => ({
        ...currentMessage,
        activities: failAgentProcesses(currentMessage.activities ?? []),
        isError: true,
        text: messageFromCaughtError(error, message("app.aiRequestFailed"))
      }));
      if (!failedRequest) return;

      runningRequestsRef.current.delete(runSessionKey);
      cancelPendingAcpPermission({ requestId, sessionKey: runSessionKey });
      if (activeSessionKeyRef.current === runSessionKey) setStatus("error");
      await persistCompletedRun(failedRequest);
    }
  }, [
    agentModelId,
    agentProviderId,
    cancelPendingAcpPermission,
    ctx,
    draft,
    messages,
    selectedAcpModelId,
    sessionKey,
    thinkingEnabled,
    webSearchEnabled
  ]);

  const retryMessage = useCallback(async (assistantMessageId: number) => {
    if (status === "thinking" || status === "streaming") return;

    const assistantMessageIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.role === "assistant"
    );
    if (assistantMessageIndex < 0) return;

    let userMessageIndex = -1;
    for (let index = assistantMessageIndex - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      if (!message.text.trim() && !message.attachments?.length) continue;

      userMessageIndex = index;
      break;
    }
    if (userMessageIndex < 0) return;

    const userMessage = messages[userMessageIndex];
    if (!userMessage) return;

    await submit(userMessage.text, {
      attachments: userMessage.attachments,
      baseMessages: messages.slice(0, userMessageIndex)
    });
  }, [messages, status, submit]);

  const submitEditedMessage = useCallback(async (userMessageId: number, promptOverride?: string) => {
    if (status === "thinking" || status === "streaming") return;

    const userMessageIndex = messages.findIndex(
      (message) => message.id === userMessageId && message.role === "user"
    );
    if (userMessageIndex < 0) return;

    const prompt = promptOverride ?? messages[userMessageIndex]?.text ?? draft;
    await submit(prompt, {
      attachments: messages[userMessageIndex]?.attachments,
      baseMessages: messages.slice(0, userMessageIndex)
    });
  }, [draft, messages, status, submit]);

  const applyWorkspacePlan = useCallback(async () => {
    if (!latestWorkspacePlan || !ctx.applyWorkspacePlan) return null;

    const runSessionKey = sessionKey;
    let queuedVisualEventCount = 0;
    let visualEventQueue = Promise.resolve();
    const queueVisualEvent = (event: WorkspacePlanVisualEvent) => {
      const queuedIndex = queuedVisualEventCount;
      queuedVisualEventCount += 1;
      visualEventQueue = visualEventQueue.then(async () => {
        if (queuedIndex > 0) {
          await delayWorkspacePlanVisualEvent();
        }
        if (activeSessionKeyRef.current !== runSessionKey) return;

        setWorkspacePlanEvents((currentEvents) =>
          event.type === "plan_validating" ? [event] : [...currentEvents, event]
        );
      });

      return visualEventQueue;
    };

    setWorkspacePlanApplyError(null);
    setWorkspacePlanApplyStatus("applying");

    try {
      const result = await ctx.applyWorkspacePlan(latestWorkspacePlan, {
        onVisualEvent: queueVisualEvent
      });
      await visualEventQueue;

      if (activeSessionKeyRef.current === runSessionKey) {
        setWorkspacePlanApplyStatus("applied");
      }

      return result;
    } catch (error) {
      await visualEventQueue.catch(() => {});

      if (activeSessionKeyRef.current === runSessionKey) {
        setWorkspacePlanApplyError(error instanceof Error ? error.message : "Workspace plan execution failed.");
        setWorkspacePlanApplyStatus("error");
      }

      return null;
    }
  }, [ctx.applyWorkspacePlan, latestWorkspacePlan, sessionKey]);

  return {
    acpModels,
    addAttachments,
    applyWorkspacePlan,
    attachmentError,
    draft,
    draftAttachments,
    interrupt,
    messages,
    pendingAcpPermission,
    removeAttachment,
    retryMessage,
    resolveAcpPermission,
    selectAcpModel,
    selectedAcpModelId,
    setDraft,
    setThinkingEnabled,
    setSessionThinkingEnabled: setThinkingEnabledState,
    setWebSearchEnabled,
    status,
    submit,
    submitEditedMessage,
    thinkingEnabled,
    titleVersion,
    webSearchEnabled,
    workspacePlanApplyError,
    workspacePlanApplyStatus,
    workspacePlanEvents
  };
}

function delayWorkspacePlanVisualEvent() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, workspacePlanVisualEventDelayMs);
  });
}

async function resolveDocumentAiHistory(
  messages: readonly AiAgentPanelMessage[],
  attachmentSessionId: string
): Promise<DocumentAiHistoryMessage[]> {
  return Promise.all(messages
    .filter((message) => !message.isError)
    .map(async (message) => {
      const resolved = message.attachments?.length
        ? await resolveAiChatAttachments(attachmentSessionId, message.attachments, { allowMissing: true })
        : { images: [], missing: [] };
      const missingImageNote = resolved.missing.length > 0
        ? "One or more earlier images are unavailable."
        : "";

      return {
        ...(resolved.images.length ? { images: resolved.images } : {}),
        preview: message.preview,
        previews: message.previews,
        role: message.role,
        text: [message.text, missingImageNote].filter(Boolean).join("\n\n")
      };
    }));
}

async function hydrateAiAgentPanelMessages(
  messages: readonly AiAgentSessionMessage[],
  attachmentSessionId: string
): Promise<AiAgentPanelMessage[]> {
  return Promise.all(messages.map(async (message) => {
    if (!message.attachments?.length) return message;

    const resolved = await resolveAiChatAttachments(attachmentSessionId, message.attachments, { allowMissing: true });
    const attachmentSources = Object.fromEntries(resolved.images.map((image) => [image.id, image.dataUrl]));

    return {
      ...message,
      ...(resolved.images.length ? { attachmentSources } : {})
    };
  }));
}

function acpPermissionPromptFromRequest(
  request: AcpPermissionRequest,
  id: string
): AcpAgentPermissionPrompt {
  const toolCall = recordValue(request.toolCall);
  const toolTitle =
    stringValue(toolCall?.title) ??
    stringValue(toolCall?.name) ??
    stringValue(toolCall?.kind);
  const detail =
    stringValue(toolCall?.path) ??
    stringValue(toolCall?.command) ??
    stringValue(toolCall?.summary) ??
    stringValue(toolCall?.kind);

  return {
    ...(detail ? { detail } : {}),
    id,
    options: request.options,
    title: toolTitle ? `Permission requested: ${toolTitle}` : "Permission requested"
  };
}

function messageFromCaughtError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();

  return fallback;
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
