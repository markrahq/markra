import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { mergeClassNames } from "./classes";
import { Tooltip, type TooltipSide } from "./Tooltip";

export type IconButtonProps = Omit<ComponentPropsWithoutRef<"button">, "aria-label" | "children"> & {
  children: ReactNode;
  label: string;
  pressed?: boolean;
  size?: Extract<ButtonSize, `icon-${string}`>;
  tooltip?: ReactNode;
  tooltipSide?: TooltipSide;
  variant?: ButtonVariant;
};

export function IconButton({
  children,
  className,
  label,
  pressed,
  size = "icon-sm",
  tooltip,
  tooltipSide,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      className={mergeClassNames("rounded-lg", className)}
      size={size}
      variant={variant}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      {...props}
    >
      {children}
    </Button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : button;
}
