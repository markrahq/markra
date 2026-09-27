import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  ArrowUp,
  BrainCircuit,
  FileText,
  Languages,
  LoaderCircle,
  PenLine,
  Plus,
  Sparkles,
  Square,
  type LucideIcon
} from "lucide-react";
import { AiModelPicker, type AiModelPickerOption } from "./AiModelPicker";
import { useImeInputGuard } from "../hooks/useImeInputGuard";
import type { AiDiffResult, AiEditIntent } from "@markra/ai";
import type { AiProviderApiStyle } from "../lib/settings/app-settings";
import { aiTranslationLanguageName, t, type AppLanguage, type I18nKey } from "@markra/shared";
import { RoundIconButton, ToggleButton } from "@markra/ui";
import {
  aiQuickActionLabelKeys,
  defaultAiQuickActionPrompt,
  defaultAiQuickActionPrompts,
  resolveAiQuickActionPrompt,
  type AiQuickActionId,
  type AiQuickActionPrompts
} from "../lib/ai-actions";

type AiCommandAction = {
  icon: LucideIcon;
  intent: AiQuickActionId;
};

type AiCommandModelOption = AiModelPickerOption & {
  providerType?: AiProviderApiStyle;
};

type AiCommandSubmitOptions = {
  thinkingEnabled?: boolean;
};

type AiCommandState = "compact" | "expanded" | "collapsing" | "closing";

function complexInlinePromptSignalScore(prompt: string, selectedText: string) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return 0;

  const lineCount = normalizedPrompt.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  const questionCount = normalizedPrompt.match(/[?？]/g)?.length ?? 0;
  const listLikePrompt = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/.test(normalizedPrompt);
  const normalizedSelection = selectedText.trim();

  return [
    normalizedPrompt.length > 120,
    normalizedSelection.length > 1600,
    normalizedSelection.length === 0,
    lineCount >= 3,
    listLikePrompt,
    questionCount >= 2
  ].filter(Boolean).length;
}

const collapseDurationMs = 160;
const exitDurationMs = 200;

const aiCommandActions: AiCommandAction[] = [
  {
    icon: Sparkles,
    intent: "polish"
  },
  {
    icon: PenLine,
    intent: "rewrite"
  },
  {
    icon: Plus,
    intent: "continue"
  },
  {
    icon: FileText,
    intent: "summarize"
  },
  {
    icon: Languages,
    intent: "translate"
  }
];

const aiCommandLoadingLabelKeys: Record<Exclude<AiEditIntent, "custom">, I18nKey> = {
  continue: "app.aiContinuingWriting",
  polish: "app.aiPolishing",
  rewrite: "app.aiRewriting",
  summarize: "app.aiSummarizing",
  translate: "app.aiTranslating"
};

type AiCommandBarProps = {
  aiResult?: AiDiffResult | null;
  availableModels?: AiCommandModelOption[];
  editorLeftInset?: string;
  editorRightInset?: string;
  externalActionPending?: boolean;
  language?: AppLanguage;
  open: boolean;
  prompt: string;
  quickActionPrompts?: AiQuickActionPrompts;
  selectedModelId?: string | null;
  selectedProviderId?: string | null;
  selectedText?: string;
  submitting?: boolean;
  supportsThinking?: boolean;
  onClose: () => unknown;
  onInterrupt?: () => unknown;
  onOverlayInsetChange?: (inset: number) => unknown;
  onPromptChange: (prompt: string) => unknown;
  onSelectionContextFocus?: () => unknown;
  onSelectModel?: (providerId: string, modelId: string) => unknown;
  onSubmit: (promptOverride?: string, intent?: AiEditIntent, options?: AiCommandSubmitOptions) => unknown;
  onTransferToAiPanel?: (prompt: string) => unknown;
};

export function AiCommandBar({
  aiResult = null,
  availableModels = [],
  editorLeftInset = "0px",
  editorRightInset = "0px",
  externalActionPending = false,
  language = "en",
  open,
  prompt,
  quickActionPrompts = defaultAiQuickActionPrompts,
  selectedModelId = null,
  selectedProviderId = null,
  selectedText = "",
  submitting = false,
  supportsThinking = false,
  onClose,
  onInterrupt,
  onOverlayInsetChange,
  onPromptChange,
  onSelectionContextFocus,
  onSelectModel,
  onSubmit,
  onTransferToAiPanel
}: AiCommandBarProps) {
  const collapseTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const commandLayerRef = useRef<HTMLElement | null>(null);
  const commandRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const commandStateRef = useRef<AiCommandState>("compact");
  const renderedRef = useRef(open);
  const [commandState, setCommandState] = useState<AiCommandState>("compact");
  const [closingFromExpanded, setClosingFromExpanded] = useState(false);
  const [entered, setEntered] = useState(false);
  const [activeQuickActionIntent, setActiveQuickActionIntent] = useState<Exclude<AiEditIntent, "custom"> | null>(null);
  const [playCompactOpenAnimation, setPlayCompactOpenAnimation] = useState(open);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const previousSubmittingRef = useRef(submitting);
  const { handleCompositionEnd, handleCompositionStart, isComposingEnter } = useImeInputGuard();
  const busy = submitting || externalActionPending;
  const label = (key: I18nKey) => t(language, key);
  const translationTargetLanguage = aiTranslationLanguageName(language);
  const canSubmit = prompt.trim().length > 0 && !busy;
  const closing = commandState === "closing";
  const expanded = commandState === "expanded";
  const showingExpandedSurface = commandState === "expanded" || commandState === "collapsing" || (closing && closingFromExpanded);

  const setCommandStateValue = useCallback((nextState: AiCommandState) => {
    commandStateRef.current = nextState;
    setCommandState(nextState);
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current === null) return;

    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current === null) return;

    window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
  }, []);

  useEffect(() => {
    commandStateRef.current = commandState;
  }, [commandState]);

  useEffect(() => {
    renderedRef.current = rendered;
  }, [rendered]);

  useEffect(() => {
    if (open) {
      clearCollapseTimer();
      clearExitTimer();
      setRendered(true);
      setActiveQuickActionIntent(null);
      setClosingFromExpanded(false);
      setPlayCompactOpenAnimation(true);
      setQuickActionsVisible(false);
      setCommandStateValue("compact");
      setEntered(false);

      const enterTimer = window.setTimeout(() => {
        setEntered(true);
      }, 0);

      return () => {
        window.clearTimeout(enterTimer);
      };
    }

    if (!renderedRef.current) return;

    clearCollapseTimer();
    clearExitTimer();
    setClosingFromExpanded(commandStateRef.current === "expanded" || commandStateRef.current === "collapsing");
    setCommandStateValue("closing");
    setEntered(false);

    exitTimerRef.current = window.setTimeout(() => {
      setRendered(false);
      setClosingFromExpanded(false);
      setPlayCompactOpenAnimation(false);
      setCommandStateValue("compact");
      exitTimerRef.current = null;
    }, exitDurationMs);
  }, [clearCollapseTimer, clearExitTimer, open, setCommandStateValue]);

  useEffect(() => {
    if (previousSubmittingRef.current && !busy) setActiveQuickActionIntent(null);
    previousSubmittingRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (supportsThinking) return;

    setThinkingEnabled(false);
  }, [supportsThinking]);

  useEffect(() => {
    return () => {
      clearCollapseTimer();
      clearExitTimer();
    };
  }, [clearCollapseTimer, clearExitTimer]);

  const reportOverlayInset = useCallback(() => {
    if (!onOverlayInsetChange) return;

    const commandLayer = commandLayerRef.current;
    if (!commandLayer) {
      onOverlayInsetChange(0);
      return;
    }

    const occludingElements = commandLayer.querySelectorAll<HTMLElement>(".ai-command-box, .ai-command-actions");
    const rects = Array.from(occludingElements)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);
    if (rects.length === 0) {
      onOverlayInsetChange(0);
      return;
    }

    const top = Math.min(...rects.map((rect) => rect.top));
    onOverlayInsetChange(Math.max(0, Math.ceil(window.innerHeight - top)));
  }, [onOverlayInsetChange]);

  useLayoutEffect(() => {
    if (!onOverlayInsetChange) return;

    if (!rendered) {
      onOverlayInsetChange(0);
      return;
    }

    const animationFrame = window.requestAnimationFrame(reportOverlayInset);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reportOverlayInset);

    reportOverlayInset();
    if (commandLayerRef.current) resizeObserver?.observe(commandLayerRef.current);
    if (commandRef.current) resizeObserver?.observe(commandRef.current);
    window.addEventListener("resize", reportOverlayInset);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", reportOverlayInset);
    };
  });

  const expandCommand = useCallback(() => {
    if (!open || closing) return;

    clearCollapseTimer();
    clearExitTimer();
    setPlayCompactOpenAnimation(false);
    if (expanded) return;

    setQuickActionsVisible(prompt.trim().length === 0);
    setCommandStateValue("expanded");
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [clearCollapseTimer, clearExitTimer, closing, expanded, open, prompt, setCommandStateValue]);

  const collapseCommand = useCallback(() => {
    if (!expanded) return;

    clearCollapseTimer();
    setPlayCompactOpenAnimation(false);
    setCommandStateValue("collapsing");
    collapseTimerRef.current = window.setTimeout(() => {
      setCommandStateValue("compact");
      collapseTimerRef.current = null;
    }, collapseDurationMs);
  }, [clearCollapseTimer, expanded, setCommandStateValue]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (commandRef.current?.contains(event.target as Node)) return;

      const state = commandStateRef.current;
      if (!busy && !aiResult && !prompt.trim() && (state === "compact" || state === "expanded")) {
        onClose();
        return;
      }

      if (state === "expanded") collapseCommand();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [aiResult, busy, collapseCommand, onClose, open, prompt]);

  useEffect(() => {
    if (!rendered) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "escape") return;

      const state = commandStateRef.current;
      if (state === "closing") return;

      event.preventDefault();

      if (state === "expanded") {
        collapseCommand();
        return;
      }

      if (state === "collapsing") return;

      onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [collapseCommand, onClose, rendered]);

  if (!rendered) return null;

  const thinkingOptions = () => (supportsThinking && thinkingEnabled ? { thinkingEnabled: true } : undefined);

  const submitCurrentPrompt = () => {
    const options = thinkingOptions();
    if (options) {
      onSubmit(undefined, "custom", options);
      return;
    }

    onSubmit();
  };

  const submitPromptOverride = (promptOverride: string, intent: AiEditIntent) => {
    const options = thinkingOptions();
    if (options) {
      onSubmit(promptOverride, intent, options);
      return;
    }

    onSubmit(promptOverride, intent);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setActiveQuickActionIntent(null);
    submitCurrentPrompt();
  };

  const handlePromptChange = (nextPrompt: string) => {
    if (busy) return;
    if (nextPrompt.trim().length > 0) {
      setActiveQuickActionIntent(null);
      setQuickActionsVisible(false);
    }
    onPromptChange(nextPrompt);
  };

  const insertPromptNewline = (input: HTMLTextAreaElement) => {
    if (busy) return;

    const start = input.selectionStart ?? prompt.length;
    const end = input.selectionEnd ?? start;
    const cursor = start + 1;
    const nextPrompt = `${prompt.slice(0, start)}\n${prompt.slice(end)}`;

    handlePromptChange(nextPrompt);
    window.setTimeout(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || isComposingEnter(event)) return;

    event.preventDefault();
    if (event.ctrlKey || event.shiftKey) {
      insertPromptNewline(event.currentTarget);
      return;
    }

    if (!canSubmit) return;
    setActiveQuickActionIntent(null);
    submitCurrentPrompt();
  };

  const handleQuickAction = (action: AiCommandAction) => {
    if (busy) return;

    const quickPrompt = resolveAiQuickActionPrompt(
      quickActionPrompts,
      action.intent,
      defaultAiQuickActionPrompt(action.intent, translationTargetLanguage)
    );
    setActiveQuickActionIntent(action.intent);
    setQuickActionsVisible(false);
    onPromptChange(quickPrompt);
    submitPromptOverride(quickPrompt, action.intent);
  };

  const quickActionSubmitting = busy && activeQuickActionIntent !== null;
  const activeExpandedSurface = showingExpandedSurface || (busy && !quickActionSubmitting);
  const unifiedExpandedSurface = quickActionSubmitting ? false : activeExpandedSurface || Boolean(aiResult);
  const showQuickActions = showingExpandedSurface && !aiResult && quickActionsVisible && !busy;
  const showExpandedInput = unifiedExpandedSurface;
  const showCompactLoading = quickActionSubmitting && !showExpandedInput;
  const commandWidthClassName = showExpandedInput ? "max-w-205" : "max-w-176";
  const commandLayerStyle: CSSProperties = {
    left: editorLeftInset,
    right: editorRightInset
  };
  const inputPlaceholder =
    aiResult && aiResult.type !== "error"
      ? label("app.aiCommandCompactPlaceholder")
      : showExpandedInput
        ? label("app.aiCommandPlaceholder")
        : label("app.aiCommandCompactPlaceholder");
  const showModelSelector = showExpandedInput && availableModels.length > 1 && Boolean(onSelectModel);
  const showAgentStatus = showExpandedInput && busy;
  const showThinkingToggle = showExpandedInput && supportsThinking;
  const showAiPanelSuggestion =
    showExpandedInput &&
    !aiResult &&
    !busy &&
    Boolean(onTransferToAiPanel) &&
    complexInlinePromptSignalScore(prompt, selectedText) > 0;
  const compactLoadingText = activeQuickActionIntent
    ? label(aiCommandLoadingLabelKeys[activeQuickActionIntent])
    : label("app.aiAgentThinking");
  const renderSubmitButton = (compactSize: boolean) => (
    <RoundIconButton
      size={compactSize ? "md" : "lg"}
      type={busy ? "button" : "submit"}
      disabled={!busy && !canSubmit}
      label={busy ? label("app.aiCommandStop") : label("app.aiCommandSend")}
      onClick={busy ? onInterrupt : undefined}
    >
      {busy ? (
        <span className="relative inline-flex items-center justify-center">
          <LoaderCircle aria-hidden="true" className="ai-command-loading-icon animate-spin" size={17} />
          <Square aria-hidden="true" className="absolute" size={7} fill="currentColor" strokeWidth={0} />
        </span>
      ) : (
        <ArrowUp aria-hidden="true" size={17} />
      )}
    </RoundIconButton>
  );
  const renderAgentStatus = () => (
    <div
      className="flex min-w-0 flex-1 items-center text-[12px] leading-5 font-[560] text-(--text-secondary)"
      role="status"
      aria-live="polite"
    >
      <span className="ai-command-thinking-text truncate">{label("app.aiAgentThinking")}</span>
    </div>
  );
  const renderCompactLoadingStatus = () => (
    <div className="flex h-10 min-w-0 flex-1 items-center overflow-hidden text-[16px] leading-10" role="status" aria-live="polite">
      <span className="ai-command-inline-loading-text truncate">{compactLoadingText}</span>
    </div>
  );
  const commandForm = (
    <form
      className={
        unifiedExpandedSurface
            ? `ai-command-box flex min-h-21 origin-bottom ${closing ? "animate-[markra-ai-command-close_180ms_ease-in_both] " : ""}flex-col gap-2 rounded-lg border border-(--ai-command-expanded-border) bg-(--bg-primary) p-3 shadow-(--ai-command-expanded-shadow) transition-[border-color,box-shadow,opacity,transform] duration-200 ease-out motion-reduce:animate-none motion-reduce:transition-none`
            : `ai-command-box flex h-14 origin-bottom ${closing ? "animate-[markra-ai-command-close_180ms_ease-in_both]" : playCompactOpenAnimation ? "animate-[markra-ai-command-open_220ms_ease-out_both]" : ""} items-center gap-3 rounded-xl border border-(--border-default) bg-(--bg-primary) px-4 py-2 shadow-(--ai-command-shadow) transition-[border-color,box-shadow,opacity,transform] duration-200 ease-out motion-reduce:animate-none motion-reduce:transition-none`
      }
      data-state={commandState}
      onSubmit={handleSubmit}
    >
      <div className={showExpandedInput ? "flex w-full min-w-0 items-end gap-3" : "flex w-full min-w-0 items-center gap-3"}>
        <label className="sr-only" htmlFor="markra-ai-command-input">
          {label("app.aiCommandInput")}
        </label>
        {!showExpandedInput ? <Sparkles aria-hidden="true" className="shrink-0 self-center text-(--text-secondary)" size={18} /> : null}
        {showCompactLoading ? (
          renderCompactLoadingStatus()
        ) : (
          <textarea
            id="markra-ai-command-input"
            ref={inputRef}
            className={
              showExpandedInput
                ? "min-h-10 flex-1 resize-none border-0 bg-transparent p-0 text-[16px] leading-6 text-(--text-primary) outline-none placeholder:text-(--text-secondary)"
                : "h-10 min-h-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-[16px] leading-10 text-(--text-primary) outline-none placeholder:text-(--text-secondary)"
            }
            value={prompt}
            placeholder={inputPlaceholder}
            readOnly={busy}
            aria-busy={busy}
            rows={showExpandedInput ? 2 : 1}
            onClick={expandCommand}
            onChange={(event) => handlePromptChange(event.target.value)}
            onCompositionEnd={handleCompositionEnd}
            onCompositionStart={handleCompositionStart}
            onFocus={onSelectionContextFocus}
            onKeyDown={handlePromptKeyDown}
            aria-label={label("app.aiCommandInput")}
          />
        )}
        {!showExpandedInput ? renderSubmitButton(false) : null}
      </div>
      {showExpandedInput ? (
        showAiPanelSuggestion ? (
          <div className="ai-command-panel-suggestion flex w-full items-center justify-between gap-3 rounded-md bg-(--bg-secondary) px-3 py-2 text-[12px] leading-5 text-(--text-secondary)">
            <span className="min-w-0 truncate">{label("app.aiCommandPanelSuggestion")}</span>
            <button
              className="shrink-0 cursor-pointer rounded-md border border-(--border-default) bg-(--bg-primary) px-2 py-1 text-[12px] leading-4 font-[650] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              type="button"
              onClick={() => onTransferToAiPanel?.(prompt)}
            >
              {label("app.aiCommandOpenPanel")}
            </button>
          </div>
        ) : null
      ) : null}
      {showExpandedInput ? (
        <div
          className={
            showAgentStatus
              ? "ai-command-footer flex w-full items-center justify-between gap-3"
              : showThinkingToggle
                ? "ai-command-footer flex w-full items-center justify-between gap-3"
                : "ai-command-footer flex w-full items-center justify-end gap-2"
          }
        >
          {showAgentStatus ? renderAgentStatus() : null}
          {!showAgentStatus && showThinkingToggle ? (
            <ToggleButton
              label={label("app.aiDeepThinking")}
              pressed={thinkingEnabled}
              size="sm"
              disabled={busy}
              onClick={() => setThinkingEnabled((enabled) => !enabled)}
            >
              <BrainCircuit aria-hidden="true" size={14} />
              <span>{label("app.aiDeepThinking")}</span>
            </ToggleButton>
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            {showModelSelector ? (
              <AiModelPicker
                ariaLabel={label("app.aiModelSelector")}
                disabled={busy}
                models={availableModels}
                selectedModelId={selectedModelId}
                selectedProviderId={selectedProviderId}
                variant="footer"
                onSelect={onSelectModel}
                translate={(key) => label(key)}
              />
            ) : null}
            {renderSubmitButton(true)}
          </div>
        </div>
      ) : null}
    </form>
  );

  return (
    <section
      ref={commandLayerRef}
      className={`ai-command-layer pointer-events-none fixed bottom-12 z-40 flex justify-center px-6 transition-[opacity,transform] duration-200 ease-out will-change-transform max-[760px]:bottom-8 max-[760px]:px-4 motion-reduce:transition-none ${entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"}`}
      style={commandLayerStyle}
      role="dialog"
      aria-label={label("app.aiCommandDialog")}
      data-state={commandState}
    >
      <div
        ref={commandRef}
        className={`relative w-full ${commandWidthClassName} ${closing ? "pointer-events-none" : "pointer-events-auto"}`}
      >
        {showQuickActions ? (
          <div
            className={
              commandState === "collapsing" || closing
                ? "ai-command-actions absolute bottom-[calc(100%+10px)] left-0 w-66 animate-[markra-ai-float-out_160ms_ease-in_both] rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 py-3 shadow-(--ai-command-popover-shadow) transition-[opacity,transform] duration-160 ease-in max-[760px]:hidden motion-reduce:animate-none motion-reduce:transition-none"
                : "ai-command-actions absolute bottom-[calc(100%+10px)] left-0 w-66 animate-[markra-ai-float-in_180ms_ease-out_both] rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 py-3 shadow-(--ai-command-popover-shadow) transition-[opacity,transform] duration-180 ease-out max-[760px]:hidden motion-reduce:animate-none motion-reduce:transition-none"
            }
            aria-label={label("app.aiQuickActions")}
          >
            <div className="mb-2 px-2 text-[13px] leading-5 font-bold text-(--text-heading)">
              {label("app.aiToolkit")}
            </div>
            <div className="grid gap-0.5">
              {aiCommandActions.map((action) => {
                const Icon = action.icon;
                const actionLabel = label(aiQuickActionLabelKeys[action.intent]);

                return (
                  <button
                    className="inline-flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-[13px] leading-5 font-[560] text-(--text-primary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none"
                    key={action.intent}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    aria-label={actionLabel}
                  >
                    <Icon aria-hidden="true" size={15} />
                    <span className="min-w-0 truncate">{actionLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {commandForm}
      </div>
    </section>
  );
}
