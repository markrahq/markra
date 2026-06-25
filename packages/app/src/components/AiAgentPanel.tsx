import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
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
  Pencil,
  PencilLine,
  RefreshCcw,
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
import type { AiAgentPanelMessage, WorkspacePlanApplyStatus } from "../hooks/useAiAgentSession";
import type { WorkspacePlanVisualEvent } from "@markra/ai";
import { IconButton, RoundIconButton, ToggleButton, Tooltip } from "@markra/ui";

type AiAgentModelOption = AiModelPickerOption & { capabilities: AiModelCapability[] };

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
  availableModels?: AiAgentModelOption[];
  context?: AiAgentPanelContext | null;
  documentAvailable?: boolean;
  draft?: string;
  language?: AppLanguage;
  messages?: AiAgentPanelMessage[];
  modelName?: string | null;
  open: boolean;
  providerName?: string | null;
  selectedModelId?: string | null;
  selectedProviderId?: string | null;
  status?: "error" | "idle" | "streaming" | "thinking";
  thinkingEnabled?: boolean;
  webSearchAvailable?: boolean;
  webSearchEnabled?: boolean;
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
  onClose: () => unknown;
  onCreateSession?: () => unknown;
  onDeleteSession?: (sessionId: string) => unknown;
  onDisableThinking?: () => unknown;
  onDraftChange?: (value: string) => unknown;
  onInterrupt?: () => unknown;
  onRenameSession?: (sessionId: string, title: string) => unknown;
  onResize?: (width: number) => unknown;
  onResizeEnd?: () => unknown;
  onResizeStart?: () => unknown;
  onRetryMessage?: (messageId: number) => unknown;
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
  availableModels = [],
  context = null,
  documentAvailable = true,
  draft = "",
  language = "en",
  messages = [],
  modelName = null,
  open,
  providerName = null,
  selectedModelId = null,
  selectedProviderId = null,
  status = "idle",
  thinkingEnabled = false,
  webSearchAvailable = false,
  webSearchEnabled = false,
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
  onClose,
  onCreateSession,
  onDeleteSession,
  onDisableThinking,
  onDraftChange,
  onInterrupt,
  onRenameSession,
  onResize,
  onResizeEnd,
  onResizeStart,
  onRetryMessage,
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
  const supportsThinking = selectedModel?.capabilities.includes("reasoning") ?? false;
  const supportsWebSearch = webSearchAvailable;
  const providerModelLabel =
    selectedModel
      ? `${selectedModel.providerName} · ${selectedModel.name}`
      : providerName && modelName
        ? `${providerName} · ${modelName}`
        : (providerName ?? modelName ?? label("app.aiModelSelector"));
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
  const canSend = agentAvailable && draft.trim().length > 0 && !submitting;
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
    if (!supportsThinking && thinkingEnabled) onDisableThinking?.();
    if (!supportsWebSearch && webSearchEnabled) onToggleWebSearch?.();
  }, [onDisableThinking, onToggleWebSearch, supportsThinking, supportsWebSearch, thinkingEnabled, webSearchEnabled]);

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
          {selectedModel ? (
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
              onKeyDown={handleKeyDown}
            />
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-(--border-default) pt-2">
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
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

type WorkspacePlanConfirmationBarProps = {
  applyError?: string | null;
  applyStatus: WorkspacePlanApplyStatus;
  events: WorkspacePlanVisualEvent[];
  onApply?: () => unknown;
  onDismiss?: () => unknown;
};

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
