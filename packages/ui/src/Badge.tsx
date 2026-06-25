import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { mergeClassNames } from "./classes";
import { Tooltip, type TooltipSide } from "./Tooltip";

export type BadgeSize = "md" | "sm";

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  size?: BadgeSize;
  tooltip?: ReactNode;
  tooltipSide?: TooltipSide;
};

const badgeSizeClassNames: Record<BadgeSize, string> = {
  md: "h-6 min-w-6 px-2 text-[11px] leading-4",
  sm: "h-5 min-w-5 px-1.5 text-[11px] leading-4"
};

export function Badge({ children, className, size = "md", tooltip, tooltipSide, ...props }: BadgeProps) {
  const badge = (
    <span
      className={mergeClassNames(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-full font-bold",
        badgeSizeClassNames[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );

  return tooltip ? (
    <Tooltip content={tooltip} side={tooltipSide}>
      {badge}
    </Tooltip>
  ) : badge;
}
