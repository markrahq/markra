import type { CSSProperties } from "react";
import { popoverPosition, type PopoverPositionOptions, type PopoverSize } from "@markra/shared";

type AnchoredPopoverStyleOptions = PopoverPositionOptions & {
  fallbackSize: PopoverSize;
};

export function anchoredPopoverStyle(
  anchorElement: Element,
  popoverElement: HTMLElement | null,
  options: AnchoredPopoverStyleOptions
): CSSProperties {
  const { fallbackSize, ...positionOptions } = options;
  const position = popoverPosition(
    anchorElement.getBoundingClientRect(),
    {
      height: popoverElement?.offsetHeight || fallbackSize.height,
      width: popoverElement?.offsetWidth || fallbackSize.width
    },
    {
      height: window.innerHeight,
      width: window.innerWidth
    },
    positionOptions
  );

  return {
    left: `${position.left}px`,
    maxHeight: `${position.maxHeight}px`,
    overflowY: "auto",
    top: `${position.top}px`
  };
}
