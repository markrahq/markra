import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { mergeClassNames } from "./classes";

export type PopoverSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  closedClassName?: string;
  open: boolean;
  openClassName?: string;
};

export const PopoverSurface = forwardRef<HTMLDivElement, PopoverSurfaceProps>(function PopoverSurface({
  children,
  className,
  closedClassName = "pointer-events-none opacity-0",
  open,
  openClassName = "pointer-events-auto opacity-100",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      className={mergeClassNames(
        "border border-(--border-default) bg-(--bg-primary) shadow-(--ai-command-popover-shadow) transition-[opacity,transform] duration-140 ease-out motion-reduce:transition-none",
        open ? openClassName : closedClassName,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
