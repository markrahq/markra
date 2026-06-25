import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { mergeClassNames } from "./classes";
import { Tooltip, type TooltipSide } from "./Tooltip";

export type ToggleButtonSize = "md" | "sm";

export type ToggleButtonProps = Omit<ComponentPropsWithoutRef<"button">, "aria-label" | "aria-pressed"> & {
  label: string;
  pressed: boolean;
  size?: ToggleButtonSize;
  tooltip?: ReactNode;
  tooltipSide?: TooltipSide;
};

const toggleButtonSizeClassNames: Record<ToggleButtonSize, string> = {
  md: "h-8 disabled:opacity-45",
  sm: "h-7 disabled:opacity-50"
};

export function ToggleButton({
  children,
  className,
  label,
  pressed,
  size = "md",
  tooltip,
  tooltipSide,
  type = "button",
  ...props
}: ToggleButtonProps) {
  const button = (
    <button
      className={mergeClassNames(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] leading-5 font-[620] transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none disabled:cursor-default",
        toggleButtonSizeClassNames[size],
        pressed
          ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
          : "border-(--border-default) bg-(--bg-secondary) text-(--text-secondary) hover:border-(--accent) hover:text-(--accent)",
        className
      )}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    >
      {children}
    </button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : button;
}
