import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  ArrowUp,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Globe2,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  PencilLine,
  RefreshCcw,
  ShieldQuestion,
  Sparkles,
  X
} from "lucide-react";
import { AiModelPicker, getAiModelOptionValue, type AiModelPickerOption } from "./AiModelPicker";
import { AiAgentSessionMenu } from "./AiAgentSessionMenu";
import { AiMarkdownMessage } from "./AiMarkdownMessage";
import { AiAgentProcessList } from "./AiAgentProcessList";
import { useImeInputGuard } from "../hooks/useImeInputGuard";
import { clampNumber, t, type AppLanguage, type I18nKey } from "@markra/shared";
import type { AiModelCapability, AiProviderApiStyle, StoredAiAgentSessionSummary } from "../lib/settings/app-settings";
import type { AcpAgentPermissionPrompt, AiAgentPanelMessage, WorkspacePlanApplyStatus } from "../hooks/useAiAgentSession";
import type { AcpPermissionRequestOutcome, WorkspacePlanVisualEvent } from "@markra/ai";
import { IconButton, RoundIconButton, ToggleButton, Tooltip } from "@markra/ui";
import type { DraftAiChatAttachment } from "../lib/ai-chat-attachments";

type AiAgentModelOption = AiModelPickerOption & { capabilities: AiModelCapability[] };
type AcpAgentModelOption = {
  description?: string;
  id: string;
  name: string;
};

export type AiAgentPanelContext = {
  documentName?: string | null;
  headingCount?: number;
  messageCount?: number;
  sectionCount?: number;
  selectionChars?: number;
  sessionId?: string | null;
  tableCount?: number;
};

type AiAgentPanelProps = {
  activeSessionId?: string | null;
  acpAgentEnabled?: boolean;
  acpAgentName?: string | null;
  acpModels?: AcpAgentModelOption[];
  availableModels?: AiAgentModelOption[];
  context?: AiAgentPanelContext | null;
  documentAvailable?: boolean;
  draft?: string;
  draftAttachments?: DraftAiChatAttachment[];
  attachmentError?: string | null;
  language?: AppLanguage;
  messages?: AiAgentPanelMessage[];
  modelName?: string | null;
  open: boolean;
  pendingAcpPermission?: AcpAgentPermissionPrompt | null;
  providerName?: string | null;
  selectedAcpModelId?: string | null;
  selectedModelId?: string | null;
  selectedProviderId?: string | null;
  status?: "error" | "idle" | "streaming" | "thinking";
  thinkingEnabled?: boolean;
  webSearchAvailable?: boolean;
  webSearchEnabled?: boolean;
  visionAvailable?: boolean;
  workspaceAvailable?: boolean;
  workspacePlanApplyError?: string | null;
  workspacePlanApplyStatus?: WorkspacePlanApplyStatus;
  workspacePlanEvents?: WorkspacePlanVisualEvent[];
  maxWidth?: number;
  minWidth?: number;
  width?: number;
  sessions?: StoredAiAgentSessionSummary[];
  onArchiveSession?: (sessionId: string, archived: boolean) => unknown;
  onApplyWorkspacePlan?: () => unknown;
  onAddAttachments?: (files: File[]) => unknown;
  onClose: () => unknown;
  onCreateSession?: () => unknown;
  onDeleteSession?: (sessionId: string) => unknown;
  onDisableThinking?: () => unknown;
  onComposerFocus?: () => unknown;
  onDraftChange?: (value: string) => unknown;
  onInterrupt?: () => unknown;
  onRenameSession?: (sessionId: string, title: string) => unknown;
  onRemoveAttachment?: (attachmentId: string) => unknown;
  onResize?: (width: number) => unknown;
  onResizeEnd?: () => unknown;
  onResizeStart?: () => unknown;
  onRetryMessage?: (messageId: number) => unknown;
  onResolveAcpPermission?: (outcome: AcpPermissionRequestOutcome) => unknown;
  onSelectAcpModel?: (modelId: string) => unknown;
  onSelectSession?: (sessionId: string) => unknown;
  onSelectModel?: (providerId: string, modelId: string) => unknown;
  onSubmit?: (promptOverride?: string) => unknown;
  onSubmitEditedMessage?: (messageId: number, promptOverride: string) => unknown;
  onToggleThinking?: () => unknown;
  onToggleWebSearch?: () => unknown;
};

const suggestionIconClassName = "shrink-0 text-(--text-secondary)";
const defaultMinWidth = 320;
const defaultMaxWidth = 760;

export function AiAgentPanel({
  activeSessionId = null,
  acpAgentEnabled = false,
  acpAgentName = null,
  acpModels = [],
  availableModels = [],
  context = null,
  documentAvailable = true,
  draft = "",
  draftAttachments = [],
  attachmentError = null,
  language = "en",
  messages = [],
  modelName = null,
  open,
  pendingAcpPermission = null,
  providerName = null,
  selectedAcpModelId = null,
  selectedModelId = null,
  selectedProviderId = null,
  status = "idle",
  thinkingEnabled = false,
  webSearchAvailable = false,
  webSearchEnabled = false,
  visionAvailable = false,
  workspaceAvailable = false,
  workspacePlanApplyError = null,
  workspacePlanApplyStatus = "idle",
  workspacePlanEvents = [],
  maxWidth = defaultMaxWidth,
  minWidth = defaultMinWidth,
  sessions = [],
  width,
  onArchiveSession,
  onApplyWorkspacePlan,
  onAddAttachments,
  onClose,
  onComposerFocus,
  onCreateSession,
  onDeleteSession,
  onDisableThinking,
  onDraftChange,
  onInterrupt,
  onRenameSession,
  onRemoveAttachment,
  onResize,
  onResizeEnd,
  onResizeStart,
  onRetryMessage,
  onResolveAcpPermission,
  onSelectAcpModel,
  onSelectSession,
  onSelectModel,
  onSubmit,
  onSubmitEditedMessage,
  onToggleThinking,
  onToggleWebSearch
}: AiAgentPanelProps) {
  const resizeCleanupRef = useRef<(() => unknown) | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const draftBeforeEditRef = useRef<string | null>(null);
  const transcriptShouldFollowRef = useRef(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [dismissedAppliedWorkspacePlanKey, setDismissedAppliedWorkspacePlanKey] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [collapsedThinkingMessageIds, setCollapsedThinkingMessageIds] = useState<Set<string>>(() =>
    collectCompletedThinkingMessageKeys(messages, status, activeSessionId)
  );
  const previousCompletedThinkingMessageKeysRef = useRef(
    collectCompletedThinkingMessageKeys(messages, status, activeSessionId)
  );
  const { handleCompositionEnd, handleCompositionStart, isComposingEnter } = useImeInputGuard();
  const label = (key: I18nKey) => t(language, key);
  const resolvedMinWidth = Math.max(240, minWidth);
  const resolvedMaxWidth = Math.max(resolvedMinWidth, maxWidth);
  const resolvedWidth = clampNumber(width, resolvedMinWidth, resolvedMaxWidth) ?? null;
  const selectedModelValue =
    selectedProviderId && selectedModelId ? getAiModelOptionValue(selectedProviderId, selectedModelId) : "";
  const selectedModel =
    availableModels.find((model) => getAiModelOptionValue(model.providerId, model.id) === selectedModelValue) ??
    availableModels[0] ??
    null;
  const acpModelOptions: AiModelPickerOption[] = acpModels.map((model) => ({
    id: model.id,
    name: model.name,
    providerId: "acp",
    providerName: label("app.aiAcpMode")
  }));
  const acpSelectedModel = acpModels.find((model) => model.id === selectedAcpModelId) ?? acpModels[0] ?? null;
  const showProviderModeControls = !acpAgentEnabled;
  const supportsThinking = !acpAgentEnabled && (selectedModel?.capabilities.includes("reasoning") ?? false);
  const supportsWebSearch = !acpAgentEnabled && webSearchAvailable;
  const providerModelLabel =
    selectedModel
      ? `${selectedModel.providerName} · ${selectedModel.name}`
      : providerName && modelName
        ? `${providerName} · ${modelName}`
        : (providerName ?? modelName ?? label("app.aiModelSelector"));
  const acpAgentLabel = `${label("app.aiAcpMode")} · ${acpAgentName?.trim() || label("app.aiAcpAgent")}`;
  const suggestions = [
    {
      icon: FileText,
      label: label("app.aiAgentSuggestionSummarize")
    },
    {
      icon: PencilLine,
      label: label("app.aiAgentSuggestionFindEdits")
    },
    {
      icon: Sparkles,
      label: label("app.aiAgentSuggestionCompareNotes")
    }
  ];
  const submitting = status === "thinking" || status === "streaming";
  const agentAvailable = documentAvailable || workspaceAvailable;
  const editingMessage = editingMessageId === null
    ? null
    : messages.find((message) => message.id === editingMessageId && message.role === "user") ?? null;
  const composerHasAttachments = draftAttachments.length > 0 || Boolean(editingMessage?.attachments?.length);
  const canSend = agentAvailable
    && (draft.trim().length > 0 || composerHasAttachments)
    && (!composerHasAttachments || visionAvailable)
    && !submitting;
  const attachmentIssueKey = composerHasAttachments && !visionAvailable
    ? "app.aiAgentVisionRequired" as const
    : attachmentErrorKey(attachmentError);
  const emptyTitle = agentAvailable ? label("app.aiAgentEmptyTitle") : label("app.aiAgentUnavailableTitle");
  const emptyBody = agentAvailable ? label("app.aiAgentEmptyBody") : label("app.aiAgentUnavailableBody");
  const composerPlaceholder = agentAvailable ? label("app.aiAgentPlaceholder") : label("app.aiAgentUnavailablePlaceholder");
  const workspacePlanConfirmationKey = workspacePlanKey(workspacePlanEvents);
  const workspacePlanConfirmationDismissed =
    workspacePlanApplyStatus === "applied" &&
    dismissedAppliedWorkspacePlanKey === workspacePlanConfirmationKey;
  const contextDocumentName = context?.documentName?.trim() || "Untitled.md";
  const contextSelection =
    (context?.selectionChars ?? 0) > 0
      ? `${context?.selectionChars ?? 0} ${label("app.aiPreviewChars")}`
      : label("app.aiAgentContextNone");
  const contextSession = context?.sessionId?.trim() || label("app.aiAgentContextNone");
  const contextAnchors = [
    `${context?.headingCount ?? 0} ${label("app.aiAgentContextHeadings")}`,
    `${context?.sectionCount ?? 0} ${label("app.aiAgentContextSections")}`,
    `${context?.tableCount ?? 0} ${label("app.aiAgentContextTables")}`
  ].join(" · ");

  useEffect(() => {
    if (acpAgentEnabled) return;

    if (!supportsThinking && thinkingEnabled) onDisableThinking?.();
    if (!supportsWebSearch && webSearchEnabled) onToggleWebSearch?.();
  }, [acpAgentEnabled, onDisableThinking, onToggleWebSearch, supportsThinking, supportsWebSearch, thinkingEnabled, webSearchEnabled]);

  useEffect(() => {
    if (workspacePlanApplyStatus === "applied" || dismissedAppliedWorkspacePlanKey === null) return;

    setDismissedAppliedWorkspacePlanKey(null);
  }, [dismissedAppliedWorkspacePlanKey, workspacePlanApplyStatus]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (editingMessageId === null) return;
    if (submitting) {
      draftBeforeEditRef.current = null;
      setEditingMessageId(null);
      return;
    }

    const editedMessageExists = messages.some((message) => message.id === editingMessageId && message.role === "user");
    if (!editedMessageExists) {
      draftBeforeEditRef.current = null;
      setEditingMessageId(null);
    }
  }, [editingMessageId, messages, submitting]);

  useEffect(() => {
    if (!open) return;

    const transcript = transcriptScrollRef.current;
    if (!transcript) return;
    if (!transcriptShouldFollowRef.current) return;

    transcript.scrollTop = transcript.scrollHeight;
  }, [messages, open, status]);

  useEffect(() => {
    const visibleThinkingMessageKeys = collectThinkingMessageKeys(messages, activeSessionId);
    const completedThinkingMessageKeys = collectCompletedThinkingMessageKeys(messages, status, activeSessionId);
    const previousCompletedThinkingMessageKeys = previousCompletedThinkingMessageKeysRef.current;
    previousCompletedThinkingMessageKeysRef.current = completedThinkingMessageKeys;

    setCollapsedThinkingMessageIds((currentIds) => {
      const nextIds = new Set<string>();

      for (const id of currentIds) {
        if (visibleThinkingMessageKeys.has(id)) nextIds.add(id);
      }

      for (const id of completedThinkingMessageKeys) {
        if (!previousCompletedThinkingMessageKeys.has(id)) nextIds.add(id);
      }

      if (setsAreEqual(currentIds, nextIds)) return currentIds;
      return nextIds;
    });
  }, [activeSessionId, messages, status]);

  const resizePanel = (nextWidth: number | null) => {
    if (nextWidth === null) return;
    onResize?.(nextWidth);
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onResize || resolvedWidth === null) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = resolvedWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    onResizeStart?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizePanel(clampNumber(startWidth + startX - moveEvent.clientX, resolvedMinWidth, resolvedMaxWidth));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
      onResizeEnd?.();
    };

    const handlePointerUp = () => {
      cleanup();
    };

    resizeCleanupRef.current?.();
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onResize || resolvedWidth === null) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizePanel(clampNumber(resolvedWidth + 24, resolvedMinWidth, resolvedMaxWidth));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizePanel(clampNumber(resolvedWidth - 24, resolvedMinWidth, resolvedMaxWidth));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizePanel(resolvedMinWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizePanel(resolvedMaxWidth);
    }
  };

  const submitComposer = () => {
    if (!canSend) return;
    const editedMessageId = editingMessageId;

    draftBeforeEditRef.current = null;
    setEditingMessageId(null);

    if (editedMessageId !== null && onSubmitEditedMessage) {
      onSubmitEditedMessage(editedMessageId, draft);
      return;
    }

    onSubmit?.();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitComposer();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || isComposingEnter(event)) return;
    if (event.ctrlKey) return;

    event.preventDefault();
    submitComposer();
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (!agentAvailable || submitting || !visionAvailable || editingMessageId !== null) return;

    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;

    event.preventDefault();
    onAddAttachments?.(files);
  };

  const handleSuggestion = (suggestion: string) => {
    if (!documentAvailable || submitting) return;

    draftBeforeEditRef.current = null;
    setEditingMessageId(null);
    onDraftChange?.(suggestion);
    onSubmit?.(suggestion);
  };

  const handleCopyMessage = (message: AiAgentPanelMessage) => {
    if (!message.text.trim()) return;
    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (!writeText) return;

    writeText(message.text).then(() => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      setCopiedMessageId(message.id);
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((currentMessageId) => currentMessageId === message.id ? null : currentMessageId);
        copyResetTimerRef.current = null;
      }, 1600);
    }).catch(() => {});
  };

  const handleEditMessage = (message: AiAgentPanelMessage) => {
    if (!documentAvailable || submitting) return;

    draftBeforeEditRef.current ??= draft;
    setEditingMessageId(message.id);
    onDraftChange?.(message.text);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const handleCancelEditMessage = () => {
    const restoredDraft = draftBeforeEditRef.current ?? "";
    draftBeforeEditRef.current = null;
    setEditingMessageId(null);
    onDraftChange?.(restoredDraft);
  };

  const handleRetryMessage = (messageId: number) => {
    if (!documentAvailable || submitting) return;

    draftBeforeEditRef.current = null;
    setEditingMessageId(null);
    onRetryMessage?.(messageId);
  };

  const toggleThinkingMessage = (messageKey: string) => {
    setCollapsedThinkingMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(messageKey)) {
        nextIds.delete(messageKey);
      } else {
        nextIds.add(messageKey);
      }

      return nextIds;
    });
  };

  const handleTranscriptScroll = () => {
    const transcript = transcriptScrollRef.current;
    if (!transcript) return;

    transcriptShouldFollowRef.current =
      transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 48;
  };

  const renderMessageActions = (message: AiAgentPanelMessage, align: "end" | "start") => {
    const copied = copiedMessageId === message.id;
    const editing = editingMessageId === message.id;

    return (
      <div className={`flex min-w-0 gap-0.5 ${align === "end" ? "justify-end" : "justify-start"}`}>
        <IconButton
          className={`rounded-md ${copied ? "text-(--accent)" : ""}`}
          disabled={!message.text.trim()}
          label={copied ? label("app.aiCopied") : label("app.aiAgentCopyMessage")}
          size="icon-xs"
          tooltip={copied ? label("app.aiCopied") : label("app.aiAgentCopyMessage")}
          onClick={() => handleCopyMessage(message)}
        >
          {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        </IconButton>
        {message.role === "user" ? (
          <IconButton
            className={`rounded-md ${editing ? "bg-(--bg-hover) text-(--accent)" : ""}`}
            disabled={!documentAvailable || submitting}
            label={editing ? label("app.aiAgentCancelEditMessage") : label("app.aiAgentEditMessage")}
            pressed={editing}
            size="icon-xs"
            tooltip={editing ? label("app.aiAgentCancelEditMessage") : label("app.aiAgentEditMessage")}
            onClick={editing ? handleCancelEditMessage : () => handleEditMessage(message)}
          >
            {editing ? <X aria-hidden="true" size={13} /> : <Pencil aria-hidden="true" size={13} />}
          </IconButton>
        ) : (
          <IconButton
            className="rounded-md"
            disabled={!documentAvailable || submitting}
            label={label("app.aiAgentRetryMessage")}
            size="icon-xs"
            tooltip={label("app.aiAgentRetryMessage")}
            onClick={() => handleRetryMessage(message.id)}
          >
            <RefreshCcw aria-hidden="true" size={13} />
          </IconButton>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`ai-agent-panel relative z-20 flex h-full min-h-0 w-full flex-col border-l border-(--border-default) bg-(--bg-secondary) text-(--text-primary) transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        open ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
      }`}
      role="complementary"
      aria-label={label("app.aiAgent")}
      aria-hidden={open ? undefined : true}
      style={resolvedWidth === null ? undefined : { maxWidth: resolvedWidth, minWidth: resolvedWidth, width: resolvedWidth }}
    >
      <div
        className="absolute top-10 bottom-0 left-0 z-30 w-2 cursor-col-resize touch-none outline-none"
        role="separator"
        tabIndex={0}
        aria-label={label("app.resizeAiAgent")}
        aria-orientation="vertical"
        aria-valuemin={resolvedMinWidth}
        aria-valuemax={resolvedMaxWidth}
        aria-valuenow={resolvedWidth ?? undefined}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
      />
      <header className="relative z-20 min-h-12 shrink-0 border-b border-(--border-default) px-2 py-1.5">
        <IconButton
          className="absolute top-1.5 left-2"
          label={label("app.collapseAiAgent")}
          size="icon-md"
          onClick={onClose}
        >
          <Bot aria-hidden="true" size={15} />
        </IconButton>
        <div className="absolute top-1.5 right-10 z-30">
          <AiAgentSessionMenu
            activeSessionId={activeSessionId}
            language={language}
            sessions={sessions}
            onArchiveSession={onArchiveSession}
            onCreateSession={onCreateSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            onSelectSession={onSelectSession}
          />
        </div>
        <div className="flex min-h-9 min-w-0 flex-col items-center justify-center px-10 text-center">
          <h2 className="m-0 truncate text-[14px] leading-5 font-[560] tracking-normal text-(--text-heading)">
            {label("app.aiAgent")}
          </h2>
          {acpAgentEnabled && acpModelOptions.length > 0 && acpSelectedModel ? (
            <div className="mt-0.5 flex min-w-0 items-center justify-center">
              <AiModelPicker
                ariaLabel={label("app.aiAcpModelSelector")}
                models={acpModelOptions}
                selectedModelId={acpSelectedModel.id}
                selectedProviderId="acp"
                showProviderBadge={false}
                variant="subtitle"
                onSelect={onSelectAcpModel ? (_providerId, modelId) => onSelectAcpModel(modelId) : undefined}
                translate={(key) => label(key)}
              />
            </div>
          ) : acpAgentEnabled ? (
            <p className="m-0 truncate text-[10px] leading-3 font-[520] text-(--text-secondary)">{acpAgentLabel}</p>
          ) : selectedModel ? (
            <div className="mt-0.5 flex min-w-0 items-center justify-center">
              <AiModelPicker
                ariaLabel={label("app.aiModelSelector")}
                models={availableModels}
                selectedModelId={selectedModelId}
                selectedProviderId={selectedProviderId}
                variant="subtitle"
                onSelect={onSelectModel}
                translate={(key) => label(key)}
              />
            </div>
          ) : (
            <p className="m-0 truncate text-[10px] leading-3 font-[520] text-(--text-secondary)">{providerModelLabel}</p>
          )}
        </div>
        <IconButton
          className="absolute top-1.5 right-2 z-30"
          label={label("app.closeAiAgent")}
          size="icon-md"
          onClick={onClose}
        >
          <X aria-hidden="true" size={15} />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {context ? (
          <section className="shrink-0 border-b border-(--border-default) bg-(--bg-secondary) px-3 py-2">
            <button
              className="flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-1 text-left text-[12px] leading-4 font-[620] text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
              type="button"
              aria-expanded={contextOpen}
              aria-label={label("app.aiAgentContext")}
              onClick={() => setContextOpen((openContext) => !openContext)}
            >
              <span>{label("app.aiAgentContext")}</span>
              <ChevronDown
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-150 ease-out ${contextOpen ? "rotate-180" : ""}`}
                size={14}
              />
            </button>
            {contextOpen ? (
              <dl className="m-0 mt-1 grid gap-1.5 px-1 pb-1 text-[11px] leading-4">
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
                  <dt className="truncate text-(--text-secondary)">{label("app.aiAgentContextDocument")}</dt>
                  <dd className="m-0 min-w-0 truncate text-(--text-primary)">{contextDocumentName}</dd>
                </div>
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
                  <dt className="truncate text-(--text-secondary)">{label("app.aiAgentContextSelection")}</dt>
                  <dd className="m-0 min-w-0 truncate text-(--text-primary)">{contextSelection}</dd>
                </div>
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
                  <dt className="truncate text-(--text-secondary)">{label("app.aiAgentContextMessages")}</dt>
                  <dd className="m-0 min-w-0 truncate text-(--text-primary)">{context?.messageCount ?? 0}</dd>
                </div>
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
                  <dt className="truncate text-(--text-secondary)">{label("app.aiAgentContextSession")}</dt>
                  <dd className="m-0 min-w-0 truncate text-(--text-primary)">{contextSession}</dd>
                </div>
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
                  <dt className="truncate text-(--text-secondary)">{label("app.aiAgentContextAnchors")}</dt>
                  <dd className="m-0 min-w-0 truncate text-(--text-primary)">{contextAnchors}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-auto overscroll-none px-3 py-3"
          ref={transcriptScrollRef}
          role="log"
          aria-label={label("app.aiAgent")}
          onScroll={handleTranscriptScroll}
        >
          {messages.length === 0 ? (
            <div className="grid gap-3">
              <div className="px-1 py-2">
                <p className="m-0 text-[13px] leading-5 font-[560] text-(--text-heading)">
                  {emptyTitle}
                </p>
                <p className="m-0 mt-1 text-[12px] leading-5 font-[520] text-(--text-secondary)">
                  {emptyBody}
                </p>
              </div>
              <div className="grid border-y border-(--border-default)">
                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon;

                  return (
                    <button
                      className="inline-flex h-9 w-full cursor-pointer items-center gap-2 border-0 border-b border-(--border-default) bg-transparent px-1 text-left text-[13px] leading-5 font-[540] text-(--text-primary) transition-[background-color,color] duration-150 ease-out last:border-b-0 hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-(--text-primary)"
                      key={suggestion.label}
                      type="button"
                      disabled={!documentAvailable || submitting}
                      onClick={() => handleSuggestion(suggestion.label)}
                    >
                      <Icon aria-hidden="true" className={suggestionIconClassName} size={15} />
                      <span className="min-w-0 truncate">{suggestion.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0">
              {messages.map((message) => {
                const thinkingSections = messageThinkingSections(message);
                const thinkingMessageKey = createThinkingMessageKey(message.id, activeSessionId);

                if (message.role === "user") {
                  const editing = editingMessageId === message.id;

                  return (
                    <li className="ml-auto grid min-w-0 max-w-[82%] justify-items-end gap-1" key={message.id}>
                      <div
                        className={`min-w-0 rounded-lg bg-(--bg-active) px-3 py-2 text-[13px] leading-5 font-[560] text-(--text-heading) ${
                          editing ? "ring-2 ring-(--accent) ring-offset-1 ring-offset-(--bg-secondary)" : ""
                        }`}
                      >
                        {message.attachments?.length ? (
                          <MessageAttachmentGrid
                            attachments={message.attachments}
                            sources={message.attachmentSources}
                            unavailableLabel={label("app.aiAgentAttachmentUnavailable")}
                          />
                        ) : null}
                        <AiMarkdownMessage content={message.text} />
                      </div>
                      {renderMessageActions(message, "end")}
                    </li>
                  );
                }

                const assistantBubbleClassName = message.isError
                  ? "min-w-0 overflow-hidden rounded-lg border border-(--danger) bg-(--bg-primary) px-3 py-2 text-[13px] leading-5 font-[540] text-(--danger)"
                  : "min-w-0 overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-[13px] leading-5 font-[540] text-(--text-primary)";
                const hasVisibleActivities = message.activities?.some(
                  (activity) => activity.kind === "assistant_message" || activity.kind === "tool_call"
                ) ?? false;
                const hasRunningActivity = message.activities?.some((activity) => activity.status === "running") ?? false;
                const showFallbackThinking =
                  !message.text && thinkingSections.length === 0 && !message.isError && hasRunningActivity && !hasVisibleActivities;
                const thinkingCollapsed = collapsedThinkingMessageIds.has(thinkingMessageKey);

                return (
                  <li className="mr-auto min-w-0 max-w-[86%]" key={message.id}>
                    <div className="grid gap-2">
                      {message.activities?.length ? <AiAgentProcessList activities={message.activities} translate={label} /> : null}
                      {message.text || thinkingSections.length > 0 || message.isError || showFallbackThinking || !message.activities?.length ? (
                        <>
                          <div className={assistantBubbleClassName}>
                            {thinkingSections.length > 0 ? (
                              <div className={message.text ? "mb-2 border-b border-(--border-default) pb-2" : ""}>
                                <button
                                  className="mb-1 inline-flex h-6 max-w-full cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-0 text-[11px] leading-4 font-[560] text-(--text-tertiary) transition-colors duration-150 ease-out hover:text-(--text-heading) focus-visible:text-(--text-heading) focus-visible:outline-none"
                                  type="button"
                                  aria-expanded={!thinkingCollapsed}
                                  aria-label={label("app.aiAgentThinking")}
                                  onClick={() => toggleThinkingMessage(thinkingMessageKey)}
                                >
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={`shrink-0 transition-transform duration-150 ease-out ${thinkingCollapsed ? "-rotate-90" : ""}`}
                                    size={13}
                                  />
                                  <span className="min-w-0 truncate">{label("app.aiAgentThinking")}</span>
                                </button>
                                {thinkingCollapsed ? null : (
                                  <div className="min-w-0 text-[12px] leading-5 text-(--text-secondary)">
                                    {thinkingSections.map((section, index) => (
                                      <div
                                        className={index === 0 ? "" : "mt-2 border-t border-(--border-default) pt-2"}
                                        key={`${message.id}:thinking:${index + 1}`}
                                      >
                                        <AiMarkdownMessage className="ai-chat-markdown-thinking" content={section} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : showFallbackThinking && !message.text ? (
                              <p className="m-0 text-[12px] leading-5 text-(--text-secondary)">{label("app.aiAgentThinking")}</p>
                            ) : null}
                            <AiMarkdownMessage className={message.isError ? "ai-chat-markdown-danger" : ""} content={message.text} />
                          </div>
                          {renderMessageActions(message, "start")}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <form className="shrink-0 border-t border-(--border-default) p-3" onSubmit={handleSubmit}>
          {pendingAcpPermission ? (
            <AcpPermissionPromptBar
              permission={pendingAcpPermission}
              onResolve={onResolveAcpPermission}
            />
          ) : null}
          {workspacePlanEvents.length > 0 && !workspacePlanConfirmationDismissed ? (
            <WorkspacePlanConfirmationBar
              applyError={workspacePlanApplyError}
              applyStatus={workspacePlanApplyStatus}
              events={workspacePlanEvents}
              onApply={onApplyWorkspacePlan}
              onDismiss={workspacePlanApplyStatus === "applied" ? () => {
                setDismissedAppliedWorkspacePlanKey(workspacePlanConfirmationKey);
              } : undefined}
            />
          ) : null}
          <div
            className={`ai-agent-composer relative overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 pt-3 pb-2 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-(--accent) focus-within:shadow-(--ai-command-shadow) ${
              submitting ? "ai-agent-composer-running" : ""
            }`}
          >
            <input
              ref={attachmentInputRef}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label={label("app.aiAgentAttachImages")}
              multiple
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length > 0) onAddAttachments?.(files);
              }}
            />
            {draftAttachments.length > 0 ? (
              <DraftAttachmentStrip
                attachments={draftAttachments}
                removeLabel={label("app.aiAgentRemoveImage")}
                onRemove={onRemoveAttachment}
              />
            ) : null}
            <label className="sr-only" htmlFor="markra-ai-agent-input">
              {label("app.aiAgentMessage")}
            </label>
            <textarea
              id="markra-ai-agent-input"
              ref={composerInputRef}
              className="max-h-32 min-h-14 w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-5 text-(--text-primary) outline-none placeholder:text-(--text-secondary)"
              value={draft}
              placeholder={composerPlaceholder}
              rows={2}
              aria-label={label("app.aiAgentMessage")}
              disabled={!agentAvailable}
              readOnly={submitting}
              onChange={(event) => {
                if (!agentAvailable) return;
                onDraftChange?.(event.target.value);
              }}
              onCompositionEnd={handleCompositionEnd}
              onCompositionStart={handleCompositionStart}
              onFocus={onComposerFocus}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
            {attachmentIssueKey ? (
              <p className="mt-1 mb-0 text-[11px] leading-4 font-[540] text-(--danger)" role="alert">
                {label(attachmentIssueKey)}
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-(--border-default) pt-2">
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
                <IconButton
                  className="rounded-md"
                  disabled={!agentAvailable || submitting || !visionAvailable || editingMessageId !== null}
                  label={label("app.aiAgentAttachImages")}
                  size="icon-sm"
                  tooltip={visionAvailable ? label("app.aiAgentAttachImages") : label("app.aiAgentVisionRequired")}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  <Paperclip aria-hidden="true" size={14} />
                </IconButton>
                {showProviderModeControls ? (
                  <>
                    <ToggleButton
                      label={label("app.aiDeepThinking")}
                      tooltip={label("app.aiDeepThinking")}
                      pressed={thinkingEnabled}
                      disabled={!supportsThinking}
                      onClick={onToggleThinking}
                    >
                      <BrainCircuit aria-hidden="true" size={14} />
                      <span>{label("app.aiDeepThinking")}</span>
                    </ToggleButton>
                    <ToggleButton
                      label={label("app.aiWebSearch")}
                      tooltip={label("app.aiWebSearch")}
                      pressed={webSearchEnabled}
                      disabled={!supportsWebSearch}
                      onClick={onToggleWebSearch}
                    >
                      <Globe2 aria-hidden="true" size={14} />
                      <span>{label("app.aiWebSearch")}</span>
                    </ToggleButton>
                  </>
                ) : null}
              </div>
              <RoundIconButton
                className="disabled:opacity-40"
                type={submitting ? "button" : "submit"}
                disabled={!canSend && !submitting}
                label={label("app.aiAgentSend")}
                onClick={submitting ? onInterrupt : undefined}
              >
                {submitting ? <X aria-hidden="true" size={16} /> : <ArrowUp aria-hidden="true" size={16} />}
              </RoundIconButton>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}

type DraftAttachmentStripProps = {
  attachments: DraftAiChatAttachment[];
  onRemove?: (attachmentId: string) => unknown;
  removeLabel: string;
};

function DraftAttachmentStrip({ attachments, onRemove, removeLabel }: DraftAttachmentStripProps) {
  return (
    <div className="mb-2 flex min-w-0 gap-2 overflow-x-auto pb-0.5">
      {attachments.map((attachment) => (
        <div
          className="relative size-12 shrink-0 rounded-md bg-(--bg-secondary)"
          key={attachment.metadata.id}
        >
          <img
            alt={attachment.metadata.name}
            className="size-12 rounded-md object-cover"
            src={attachment.previewUrl}
          />
          <button
            className="absolute -top-1 -right-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-(--border-default) bg-(--bg-primary) p-0 text-(--text-secondary) shadow-sm transition-colors duration-150 hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            type="button"
            aria-label={`${removeLabel}: ${attachment.metadata.name}`}
            onClick={() => onRemove?.(attachment.metadata.id)}
          >
            <X aria-hidden="true" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

type MessageAttachmentGridProps = {
  attachments: NonNullable<AiAgentPanelMessage["attachments"]>;
  sources?: Record<string, string>;
  unavailableLabel: string;
};

function MessageAttachmentGrid({ attachments, sources, unavailableLabel }: MessageAttachmentGridProps) {
  return (
    <div className="mb-1.5 flex max-w-full flex-wrap gap-1.5">
      {attachments.map((attachment) => {
        const source = sources?.[attachment.id];

        return source ? (
          <img
            alt={attachment.name}
            className="max-h-36 min-h-12 max-w-full rounded-md object-cover"
            key={attachment.id}
            src={source}
          />
        ) : (
          <div
            aria-label={`${attachment.name}: ${unavailableLabel}`}
            className="inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-md bg-(--bg-secondary) px-2 text-[11px] text-(--text-secondary)"
            key={attachment.id}
            role="img"
          >
            <ImageIcon aria-hidden="true" size={14} />
            <span>{unavailableLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function attachmentErrorKey(error: string | null): I18nKey | null {
  switch (error) {
    case "unsupported_format":
      return "app.aiAgentAttachmentUnsupported";
    case "unreadable_image":
      return "app.aiAgentAttachmentUnreadable";
    case "file_too_large":
      return "app.aiAgentAttachmentTooLarge";
    case "total_too_large":
      return "app.aiAgentAttachmentsTooLarge";
    case "too_many":
      return "app.aiAgentAttachmentLimit";
    case "attachment_failed":
    case "attachment_storage_failed":
      return "app.aiAgentAttachmentStorageFailed";
    case "vision_model_required":
      return "app.aiAgentVisionRequired";
    default:
      return null;
  }
}

type WorkspacePlanConfirmationBarProps = {
  applyError?: string | null;
  applyStatus: WorkspacePlanApplyStatus;
  events: WorkspacePlanVisualEvent[];
  onApply?: () => unknown;
  onDismiss?: () => unknown;
};

type AcpPermissionPromptBarProps = {
  permission: AcpAgentPermissionPrompt;
  onResolve?: (outcome: AcpPermissionRequestOutcome) => unknown;
};

function AcpPermissionPromptBar({
  permission,
  onResolve
}: AcpPermissionPromptBarProps) {
  const detailText = permission.detail ?? "ACP is asking for permission.";

  return (
    <section
      aria-label="ACP permission request"
      className="mb-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-(--border-default) bg-(--bg-primary) px-2.5 py-2 shadow-(--ai-command-shadow)"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-(--accent)">
        <ShieldQuestion aria-hidden="true" size={13} />
      </span>
      <div className="min-w-0">
        <p className="m-0 truncate text-[12px] leading-4 font-[620] text-(--text-heading)">
          {permission.title}
        </p>
        <Tooltip content={detailText}>
          <p className="m-0 truncate text-[11px] leading-4 text-(--text-secondary)">
            {detailText}
          </p>
        </Tooltip>
      </div>
      <div className="col-span-2 flex min-w-0 flex-wrap justify-end gap-1">
        {permission.options.map((option) => (
          <button
            aria-label={option.name}
            className={acpPermissionOptionButtonClassName(option.kind)}
            disabled={!onResolve}
            key={option.optionId}
            type="button"
            onClick={() => onResolve?.({
              optionId: option.optionId,
              outcome: "selected"
            })}
          >
            <span className="min-w-0 truncate">{option.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function acpPermissionOptionButtonClassName(kind: AcpAgentPermissionPrompt["options"][number]["kind"]) {
  const baseClassName = "inline-flex h-7 max-w-full cursor-pointer items-center justify-center rounded-md border px-2 text-[11px] leading-4 font-[620] transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55";

  if (kind === "allow_once" || kind === "allow_always") {
    return `${baseClassName} border-(--accent) bg-(--accent) text-(--bg-primary) hover:border-(--accent-hover) hover:bg-(--accent-hover) disabled:hover:border-(--accent) disabled:hover:bg-(--accent)`;
  }

  return `${baseClassName} border-(--border-default) bg-(--bg-primary) text-(--text-heading) hover:bg-(--bg-hover) disabled:hover:bg-(--bg-primary)`;
}

function WorkspacePlanConfirmationBar({
  applyError = null,
  applyStatus,
  events,
  onApply,
  onDismiss
}: WorkspacePlanConfirmationBarProps) {
  const latestStep = latestWorkspacePlanStep(events);
  const stepCount = workspacePlanStepCount(events);
  const applied = applyStatus === "applied";
  const disabled = applyStatus === "applying" || applied || !onApply;
  const labelText = latestStep?.label ?? "Workspace changes";
  const detailText = applyError ?? (stepCount > 0 ? `${stepCount} workspace ${stepCount === 1 ? "action" : "actions"}` : "Workspace changes");

  return (
    <section
      aria-label="Workspace plan confirmation"
      className="mb-2 flex min-w-0 items-center gap-2 rounded-md border border-(--border-default) bg-(--bg-primary) px-2.5 py-2 shadow-(--ai-command-shadow)"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-(--accent)">
        <WorkspacePlanConfirmationIcon status={applyStatus} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[12px] leading-4 font-[620] text-(--text-heading)">{labelText}</p>
        <Tooltip content={detailText}>
          <p
            className={`m-0 truncate text-[11px] leading-4 ${applyError ? "text-(--danger)" : "text-(--text-secondary)"}`}
          >
            {detailText}
          </p>
        </Tooltip>
      </div>
      {applied ? (
        <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-(--bg-active) px-2 text-[11px] leading-4 font-[620] text-(--text-heading)">
          {workspacePlanApplyLabel(applyStatus)}
        </span>
      ) : (
        <button
          aria-label="Apply workspace plan"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-(--accent) bg-(--accent) px-2 text-[11px] leading-4 font-[620] text-(--bg-primary) transition-[background-color,border-color,color,opacity] duration-150 ease-out hover:border-(--accent-hover) hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 disabled:hover:border-(--accent) disabled:hover:bg-(--accent)"
          disabled={disabled}
          type="button"
          onClick={onApply}
        >
          <span>{workspacePlanApplyLabel(applyStatus)}</span>
        </button>
      )}
      {applied && onDismiss ? (
        <Tooltip content="Dismiss workspace plan confirmation">
          <button
            aria-label="Dismiss workspace plan confirmation"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-(--text-secondary) transition-[background-color,color] duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            type="button"
            onClick={onDismiss}
          >
            <X aria-hidden="true" size={13} />
          </button>
        </Tooltip>
      ) : null}
    </section>
  );
}

function WorkspacePlanConfirmationIcon({ status }: { status: WorkspacePlanApplyStatus }) {
  if (status === "applied") return <Check aria-hidden="true" size={13} />;
  if (status === "error") return <X aria-hidden="true" size={13} />;

  return <PencilLine aria-hidden="true" size={13} />;
}

function workspacePlanApplyLabel(status: WorkspacePlanApplyStatus) {
  if (status === "applying") return "Applying";
  if (status === "applied") return "Applied";
  if (status === "error") return "Retry";

  return "Apply";
}

function latestWorkspacePlanStep(events: WorkspacePlanVisualEvent[]) {
  return [...events].reverse().find(isWorkspacePlanStepEvent) ?? null;
}

function workspacePlanStepCount(events: WorkspacePlanVisualEvent[]) {
  const planEvent = [...events].reverse().find((event) => event.type === "plan_validating");
  if (planEvent?.type === "plan_validating") return planEvent.totalSteps;

  return new Set(events.filter(isWorkspacePlanStepEvent).map((event) => event.index)).size;
}

function workspacePlanKey(events: WorkspacePlanVisualEvent[]) {
  return JSON.stringify(events);
}

function isWorkspacePlanStepEvent(
  event: WorkspacePlanVisualEvent
): event is Extract<WorkspacePlanVisualEvent, { index: number }> {
  return event.type === "step_applied" ||
    event.type === "step_failed" ||
    event.type === "step_previewed" ||
    event.type === "step_started";
}

function messageThinkingSections(message: AiAgentPanelMessage) {
  const completedTurns = message.thinkingTurns?.filter((turn) => turn.trim().length > 0) ?? [];
  const currentThinking = message.thinking?.trim();
  if (!currentThinking) return completedTurns;
  if (completedTurns.at(-1) === currentThinking) return completedTurns;

  return [...completedTurns, currentThinking];
}

function collectThinkingMessageKeys(messages: AiAgentPanelMessage[], activeSessionId?: string | null) {
  const keys = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    if (messageThinkingSections(message).length === 0) continue;

    keys.add(createThinkingMessageKey(message.id, activeSessionId));
  }

  return keys;
}

function collectCompletedThinkingMessageKeys(
  messages: AiAgentPanelMessage[],
  status: AiAgentPanelProps["status"],
  activeSessionId?: string | null
) {
  const keys = new Set<string>();

  for (const [index, message] of messages.entries()) {
    if (!isCompletedThinkingMessage(message, index, messages, status)) continue;

    keys.add(createThinkingMessageKey(message.id, activeSessionId));
  }

  return keys;
}

function isCompletedThinkingMessage(
  message: AiAgentPanelMessage,
  index: number,
  messages: AiAgentPanelMessage[],
  status: AiAgentPanelProps["status"]
) {
  if (message.role !== "assistant") return false;
  if (messageThinkingSections(message).length === 0) return false;

  const hasRunningActivity = message.activities?.some((activity) => activity.status === "running") ?? false;
  if (hasRunningActivity) return false;

  const isLatestMessage = index === messages.length - 1;
  if (isLatestMessage && (status === "thinking" || status === "streaming")) return false;

  return true;
}

function createThinkingMessageKey(messageId: number, activeSessionId?: string | null) {
  return `${activeSessionId ?? "__active__"}:${messageId}`;
}

function setsAreEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}
