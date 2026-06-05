import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { AiProviderBadge } from "./AiProviderBadge";
import { PopoverSurface } from "@markra/ui";
import type { AiProviderApiStyle, AiProviderConfig } from "../lib/settings/app-settings";
import type { I18nKey } from "@markra/shared";
import { anchoredPopoverStyle } from "../lib/anchored-popover";

const menuExitDurationMs = 140;

export type AiModelPickerOption = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  providerType?: AiProviderApiStyle;
};

type AiModelPickerProps = {
  ariaLabel: string;
  disabled?: boolean;
  models: AiModelPickerOption[];
  selectedModelId?: string | null;
  selectedProviderId?: string | null;
  variant?: "footer" | "subtitle";
  onSelect?: (providerId: string, modelId: string) => unknown;
  translate: (key: I18nKey) => string;
};

export function AiModelPicker({
  ariaLabel,
  disabled = false,
  models,
  selectedModelId = null,
  selectedProviderId = null,
  variant = "footer",
  onSelect,
  translate
}: AiModelPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedValue =
    selectedProviderId && selectedModelId ? getAiModelOptionValue(selectedProviderId, selectedModelId) : "";
  const selectedModel = useMemo(
    () => models.find((model) => getAiModelOptionValue(model.providerId, model.id) === selectedValue) ?? models[0] ?? null,
    [models, selectedValue]
  );

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      setMenuVisible(true);
      return;
    }

    if (!menuVisible) return;

    closeTimerRef.current = window.setTimeout(() => {
      setMenuVisible(false);
      closeTimerRef.current = null;
    }, menuExitDurationMs);
  }, [menuVisible, open]);

  const positionMenu = (trigger: HTMLButtonElement) => {
    setMenuStyle(
      anchoredPopoverStyle(trigger, menuRef.current, {
        align: variant === "subtitle" ? "center" : "end",
        fallbackSize: {
          height: variant === "subtitle" ? 64 : 288,
          width: variant === "subtitle" ? 248 : 272
        },
        gap: variant === "subtitle" ? 6 : 8,
        placement: variant === "subtitle" ? "bottom" : "top"
      })
    );
  };

  useLayoutEffect(() => {
    if (!open || !menuVisible) return;

    const trigger = triggerRef.current;
    if (trigger) positionMenu(trigger);
  }, [menuVisible, models.length, open, variant]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;

      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleLayoutChange = () => {
      const trigger = triggerRef.current;
      if (trigger) positionMenu(trigger);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current === null) return;

      window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!selectedModel) return null;

  const triggerClassName =
    variant === "subtitle"
      ? `inline-flex min-w-0 max-w-full items-center gap-0.75 rounded-sm border border-transparent bg-transparent px-0.5 py-0 text-(--text-secondary) transition-[background-color,color,opacity,transform] duration-180 ease-out hover:bg-[color:color-mix(in_oklab,var(--bg-hover)_55%,transparent)] hover:text-(--text-heading) ${open ? "bg-[color:color-mix(in_oklab,var(--bg-hover)_72%,transparent)] text-(--text-heading)" : ""}`
      : `inline-flex h-7 min-w-0 max-w-68 items-center gap-1.5 rounded-md border border-(--border-default) bg-(--bg-secondary) px-2 text-(--text-secondary) transition-[border-color,background-color,box-shadow,transform,color] duration-180 ease-out hover:border-(--border-strong) hover:bg-(--bg-hover) hover:text-(--text-heading) ${open ? "border-(--border-strong) bg-(--bg-hover) text-(--text-heading) shadow-[var(--ai-command-shadow)]" : ""}`;
  const labelClassName =
    variant === "subtitle"
      ? "min-w-0 truncate text-[10.5px] leading-4 font-[560]"
      : "min-w-0 truncate text-[12px] leading-5 font-[560]";
  const menuClassName =
    variant === "subtitle"
      ? "fixed z-40 w-62 overflow-auto rounded-lg p-1"
      : "fixed z-40 w-68 overflow-auto rounded-lg p-1";

  const handleSelect = (providerId: string, modelId: string) => {
    setOpen(false);
    onSelect?.(providerId, modelId);
  };

  const menu =
    menuVisible && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <PopoverSurface
            ref={menuRef}
            className={menuClassName}
            style={menuStyle}
            open={open}
            openClassName="pointer-events-auto scale-100 opacity-100"
            closedClassName="pointer-events-none scale-[0.98] opacity-0"
            role="listbox"
            aria-label={ariaLabel}
          >
            {models.map((model) => {
              const modelValue = getAiModelOptionValue(model.providerId, model.id);
              const active = modelValue === selectedValue;

              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-[background-color,color,transform] duration-150 ease-out ${
                    active
                      ? "bg-(--bg-hover) text-(--text-heading)"
                      : "text-(--text-primary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
                  }`}
                  key={modelValue}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(model.providerId, model.id)}
                >
                  <span className="shrink-0 scale-75">
                    <AiProviderBadge provider={buildProviderBadge(model)} translate={translate} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] leading-5 font-[560]">
                    {`${model.providerName} · ${model.name}`}
                  </span>
                  {active ? (
                    <Check
                      aria-hidden="true"
                      className="shrink-0 text-(--accent) transition-[opacity,transform] duration-150 ease-out"
                      size={14}
                    />
                  ) : null}
                </button>
              );
            })}
          </PopoverSurface>,
          document.body
        )
      : null;

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        ref={triggerRef}
        className={triggerClassName}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled || models.length === 0 || !onSelect}
        onClick={(event) => {
          if (!open) positionMenu(event.currentTarget);
          setOpen(!open);
        }}
      >
        <span className="shrink-0 scale-[0.68]">
          <AiProviderBadge provider={buildProviderBadge(selectedModel)} translate={translate} />
        </span>
        <span className={labelClassName}>{`${selectedModel.providerName} · ${selectedModel.name}`}</span>
        <ChevronDown
          aria-hidden="true"
          className={`shrink-0 opacity-60 transition-transform duration-180 ease-out ${open ? "rotate-180" : "rotate-0"}`}
          size={12}
        />
      </button>
      {menu}
    </div>
  );
}

function buildProviderBadge(model: AiModelPickerOption): AiProviderConfig {
  return {
    enabled: true,
    id: model.providerId,
    models: [],
    name: model.providerName,
    type: model.providerType ?? "openai-compatible"
  };
}

export function getAiModelOptionValue(providerId: string, modelId: string) {
  return `${providerId}::${modelId}`;
}
