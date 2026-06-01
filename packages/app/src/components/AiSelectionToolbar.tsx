import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Check,
  Code2,
  Copy,
  FileText,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
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
  selectionHeadingLevels,
  type SelectionHeadingLevel,
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

type HeadingLevelOption = {
  icon: LucideIcon;
  label: string;
  level: SelectionHeadingLevel;
};

type AiSelectionToolbarProps = {
  anchor: SelectionAnchor | null;
  busy?: boolean;
  copySucceeded?: boolean;
  language?: AppLanguage;
  open: boolean;
  activeFormattingActions?: readonly SelectionFormattingAction[];
  activeHeadingLevel?: SelectionHeadingLevel | null;
  quickActionPrompts?: AiQuickActionPrompts;
  onCopySelection: () => unknown;
  onInsertLink: () => unknown;
  onOpenCommand: () => unknown;
  onRunFormattingAction: (action: SelectionFormattingShortcutAction) => unknown;
  onSetHeadingLevel?: (level: SelectionHeadingLevel) => unknown;
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

const headingLevelIcons: Record<SelectionHeadingLevel, LucideIcon> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
  4: Heading4,
  5: Heading5,
  6: Heading6
};

const headingLevelOptions: HeadingLevelOption[] = selectionHeadingLevels.map((level) => ({
  icon: headingLevelIcons[level],
  label: `H${level}`,
  level
}));

export function AiSelectionToolbar({
  anchor,
  busy = false,
  copySucceeded = false,
  language = "en",
  open,
  activeFormattingActions = [],
  activeHeadingLevel = null,
  quickActionPrompts = defaultAiQuickActionPrompts,
  onCopySelection,
  onInsertLink,
  onOpenCommand,
  onRunFormattingAction,
  onSetHeadingLevel = () => {},
  onRunAction
}: AiSelectionToolbarProps) {
  const [headingLevelMenuOpen, setHeadingLevelMenuOpen] = useState(false);
  const [headingLevelMenuStyle, setHeadingLevelMenuStyle] = useState<CSSProperties | null>(null);
  const headingLevelButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingLevelMenuRef = useRef<HTMLDivElement | null>(null);

  const positionHeadingLevelMenu = (button: HTMLButtonElement) => {
    const buttonRect = button.getBoundingClientRect();
    const menuWidthPx = 112;
    const viewportPaddingPx = 8;
    const maxLeft = Math.max(viewportPaddingPx, window.innerWidth - menuWidthPx - viewportPaddingPx);
    const left = Math.min(Math.max(buttonRect.left, viewportPaddingPx), maxLeft);

    setHeadingLevelMenuStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(buttonRect.bottom + 4)}px`
    });
  };

  useEffect(() => {
    if (!open) {
      setHeadingLevelMenuOpen(false);
      setHeadingLevelMenuStyle(null);
    }
  }, [open]);

  useEffect(() => {
    setHeadingLevelMenuOpen(false);
    setHeadingLevelMenuStyle(null);
  }, [anchor?.bottom, anchor?.left, anchor?.right, anchor?.top]);

  useEffect(() => {
    if (!headingLevelMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (headingLevelButtonRef.current?.contains(target) || headingLevelMenuRef.current?.contains(target)) {
        return;
      }

      setHeadingLevelMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHeadingLevelMenuOpen(false);
      }
    };

    const handleLayoutChange = () => {
      const button = headingLevelButtonRef.current;
      if (button) {
        positionHeadingLevelMenu(button);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [headingLevelMenuOpen]);

  if (!open || !anchor) return null;

  const label = (key: I18nKey) => t(language, key);
  const activeFormattingActionSet = new Set(activeFormattingActions);
  const activeHeadingLevelOption =
    activeHeadingLevel === null
      ? null
      : headingLevelOptions.find((option) => option.level === activeHeadingLevel) ?? null;
  const ActiveHeadingLevelIcon = activeHeadingLevelOption?.icon ?? Heading;
  const headingLevelLabel = activeHeadingLevelOption
    ? `${label("menu.headingLevel")} ${activeHeadingLevelOption.label}`
    : label("menu.headingLevel");
  const copyLabel = label(copySucceeded ? "app.aiCopied" : "app.aiCopy");
  const translationTargetLanguage = aiTranslationLanguageName(language);
  const style: CSSProperties = {
    left: `${Math.round((anchor.left + anchor.right) / 2)}px`,
    top: `${Math.max(12, Math.round(anchor.top - toolbarOffsetPx))}px`
  };
  const headingLevelMenu =
    headingLevelMenuOpen && headingLevelMenuStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-auto fixed z-[60] grid grid-cols-3 gap-1 rounded-md border border-(--border-default) bg-(--bg-primary) p-1 shadow-(--ai-command-popover-shadow)"
            ref={headingLevelMenuRef}
            style={headingLevelMenuStyle}
            role="menu"
            aria-label={label("menu.headingLevel")}
          >
            {headingLevelOptions.map((option) => {
              const HeadingLevelIcon = option.icon;
              const selected = option.level === activeHeadingLevel;

              return (
                <button
                  className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
                    selected
                      ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
                      : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
                  }`}
                  key={option.level}
                  type="button"
                  role="menuitemradio"
                  aria-label={option.label}
                  aria-checked={selected}
                  title={option.label}
                  onClick={() => {
                    setHeadingLevelMenuOpen(false);
                    onSetHeadingLevel(option.level);
                  }}
                >
                  <HeadingLevelIcon aria-hidden="true" size={15} />
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

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
            <Fragment key={action.action}>
              <button
                className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 ${
                  active
                    ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
                    : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
                }`}
                type="button"
                disabled={busy}
                title={actionLabel}
                onClick={() => onRunFormattingAction(action.action)}
                aria-label={actionLabel}
                aria-pressed={active}
              >
                <Icon aria-hidden="true" size={14} />
              </button>
              {action.action === "inlineCode" ? (
                <div className="relative inline-flex shrink-0">
                  <button
                    className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-default disabled:opacity-55 ${
                      activeHeadingLevelOption
                        ? "bg-(--accent-soft) text-(--accent) hover:bg-(--accent-soft)"
                        : "bg-transparent text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading)"
                    }`}
                    ref={headingLevelButtonRef}
                    type="button"
                    disabled={busy}
                    title={headingLevelLabel}
                    onClick={(event) => {
                      if (!headingLevelMenuOpen) {
                        positionHeadingLevelMenu(event.currentTarget);
                      }
                      setHeadingLevelMenuOpen(!headingLevelMenuOpen);
                    }}
                    aria-label={headingLevelLabel}
                    aria-haspopup="menu"
                    aria-expanded={headingLevelMenuOpen}
                  >
                    <ActiveHeadingLevelIcon aria-hidden="true" size={15} />
                  </button>
                </div>
              ) : null}
            </Fragment>
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
      {headingLevelMenu}
    </section>
  );
}
