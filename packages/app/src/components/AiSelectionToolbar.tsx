import { type CSSProperties } from "react";
import {
  Bold,
  Check,
  Code2,
  Copy,
  FileText,
  Heading1,
  Italic,
  Languages,
  Link,
  List,
  ListOrdered,
  PenLine,
  Plus,
  Quote,
  Sparkles,
  Strikethrough,
  WandSparkles,
  type LucideIcon
} from "lucide-react";
import { aiTranslationLanguageName, t, type AppLanguage, type I18nKey } from "@markra/shared";
import {
  aiQuickActionLabelKeys,
  defaultAiQuickActionPrompt,
  defaultAiQuickActionPrompts,
  resolveAiQuickActionPrompt,
  type AiQuickActionId,
  type AiQuickActionPrompts
} from "../lib/ai-actions";
import type { SelectionAnchor } from "../lib/selection-anchor";
import {
  type SelectionFormattingAction,
  type SelectionFormattingShortcutAction
} from "../lib/selection-formatting";

type AiSelectionAction = {
  icon: LucideIcon;
  intent: AiQuickActionId;
};

type BasicSelectionAction = {
  action: SelectionFormattingShortcutAction;
  icon: LucideIcon;
  labelKey: I18nKey;
};

type AiSelectionToolbarProps = {
  anchor: SelectionAnchor | null;
  busy?: boolean;
  copySucceeded?: boolean;
  language?: AppLanguage;
  open: boolean;
  activeFormattingActions?: readonly SelectionFormattingAction[];
  quickActionPrompts?: AiQuickActionPrompts;
  onCopySelection: () => unknown;
  onInsertLink: () => unknown;
  onOpenCommand: () => unknown;
  onRunFormattingAction: (action: SelectionFormattingShortcutAction) => unknown;
  onRunAction: (intent: AiQuickActionId, prompt: string) => unknown;
};

const toolbarOffsetPx = 12;

const aiSelectionActions: AiSelectionAction[] = [
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

const basicSelectionActions: BasicSelectionAction[] = [
  {
    action: "bold",
    icon: Bold,
    labelKey: "menu.bold"
  },
  {
    action: "italic",
    icon: Italic,
    labelKey: "menu.italic"
  },
  {
    action: "strikethrough",
    icon: Strikethrough,
    labelKey: "menu.strikethrough"
  },
  {
    action: "inlineCode",
    icon: Code2,
    labelKey: "menu.inlineCode"
  },
  {
    action: "heading1",
    icon: Heading1,
    labelKey: "menu.heading1"
  },
  {
    action: "quote",
    icon: Quote,
    labelKey: "menu.quote"
  },
  {
    action: "bulletList",
    icon: List,
    labelKey: "menu.bulletList"
  },
  {
    action: "orderedList",
    icon: ListOrdered,
    labelKey: "menu.orderedList"
  }
];

export function AiSelectionToolbar({
  anchor,
  busy = false,
  copySucceeded = false,
  language = "en",
  open,
  activeFormattingActions = [],
  quickActionPrompts = defaultAiQuickActionPrompts,
  onCopySelection,
  onInsertLink,
  onOpenCommand,
  onRunFormattingAction,
  onRunAction
}: AiSelectionToolbarProps) {
  if (!open || !anchor) return null;

  const label = (key: I18nKey) => t(language, key);
  const activeFormattingActionSet = new Set(activeFormattingActions);
  const copyLabel = label(copySucceeded ? "app.aiCopied" : "app.aiCopy");
  const translationTargetLanguage = aiTranslationLanguageName(language);
  const style: CSSProperties = {
    left: `${Math.round((anchor.left + anchor.right) / 2)}px`,
    top: `${Math.max(12, Math.round(anchor.top - toolbarOffsetPx))}px`
  };

  return (
    <section
      className="ai-selection-toolbar pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full animate-[markra-ai-float-in_160ms_ease-out_both] motion-reduce:animate-none"
      style={style}
      role="toolbar"
      aria-label={label("app.aiQuickActions")}
    >
      <div className="pointer-events-auto inline-flex max-w-[calc(100vw-24px)] items-center gap-1 overflow-x-auto rounded-lg border border-(--border-default) bg-(--bg-primary) p-1 shadow-(--ai-command-popover-shadow)">
        <button
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-(--accent-soft) text-(--accent) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55"
          type="button"
          disabled={busy}
          title={label("app.aiCommandInput")}
          onClick={onOpenCommand}
          aria-label={label("app.aiCommandInput")}
        >
          <WandSparkles aria-hidden="true" size={15} />
        </button>
        <span className="mx-0.5 h-5 w-px bg-(--border-default)" aria-hidden="true" />
        {aiSelectionActions.map((action) => {
          const Icon = action.icon;
          const actionLabel = label(aiQuickActionLabelKeys[action.intent]);
          const actionPrompt = resolveAiQuickActionPrompt(
            quickActionPrompts,
            action.intent,
            defaultAiQuickActionPrompt(action.intent, translationTargetLanguage)
          );

          return (
            <button
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--text-primary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55"
              key={action.intent}
              type="button"
              disabled={busy}
              title={actionLabel}
              onClick={() => onRunAction(action.intent, actionPrompt)}
              aria-label={actionLabel}
            >
              <Icon aria-hidden="true" size={14} />
            </button>
          );
        })}
        <span className="mx-0.5 h-5 w-px bg-(--border-default)" aria-hidden="true" />
        {basicSelectionActions.map((action) => {
          const Icon = action.icon;
          const actionLabel = label(action.labelKey);
          const active = activeFormattingActionSet.has(action.action);

          return (
            <button
              className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 ${
                active
                  ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
                  : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
              }`}
              key={action.action}
              type="button"
              disabled={busy}
              title={actionLabel}
              onClick={() => onRunFormattingAction(action.action)}
              aria-label={actionLabel}
              aria-pressed={active}
            >
              <Icon aria-hidden="true" size={14} />
            </button>
          );
        })}
        <button
          className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 ${
            activeFormattingActionSet.has("link")
              ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
              : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
          }`}
          type="button"
          disabled={busy}
          title={label("menu.link")}
          onClick={onInsertLink}
          aria-label={label("menu.link")}
          aria-pressed={activeFormattingActionSet.has("link")}
        >
          <Link aria-hidden="true" size={14} />
        </button>
        <span className="mx-0.5 h-5 w-px bg-(--border-default)" aria-hidden="true" />
        <button
          className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 ${
            copySucceeded
              ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
              : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
          }`}
          type="button"
          disabled={busy}
          title={copyLabel}
          onClick={onCopySelection}
          aria-label={copyLabel}
        >
          {copySucceeded ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
        </button>
      </div>
    </section>
  );
}
