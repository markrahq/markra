export type PopoverAnchorRect = Pick<DOMRectReadOnly, "bottom" | "left" | "right" | "top">;

export type PopoverSize = {
  height: number;
  width: number;
};

export type PopoverViewport = {
  height: number;
  width: number;
};

export type PopoverAlignment = "center" | "end" | "start";
export type PopoverPlacement = "bottom" | "top";

export type PopoverPositionOptions = {
  align?: PopoverAlignment;
  gap?: number;
  margin?: number;
  placement?: PopoverPlacement;
};

export type PopoverPosition = {
  left: number;
  maxHeight: number;
  placement: PopoverPlacement;
  top: number;
};

function alignedLeft(anchor: PopoverAnchorRect, width: number, align: PopoverAlignment) {
  if (align === "center") return (anchor.left + anchor.right - width) / 2;
  if (align === "end") return anchor.right - width;

  return anchor.left;
}

function clampPosition(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function popoverPosition(
  anchor: PopoverAnchorRect,
  size: PopoverSize,
  viewport: PopoverViewport,
  options: PopoverPositionOptions = {}
): PopoverPosition {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 8;
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  const bottomTop = anchor.bottom + gap;
  const topTop = anchor.top - gap - height;
  const bottomSpace = Math.max(0, viewportHeight - margin - bottomTop);
  const topSpace = Math.max(0, anchor.top - gap - margin);
  const preferredPlacement = options.placement ?? "bottom";
  const placement = preferredPlacement === "bottom" && height > bottomSpace && topSpace > bottomSpace
    ? "top"
    : preferredPlacement === "top" && height > topSpace && bottomSpace > topSpace
      ? "bottom"
      : preferredPlacement;
  const availableHeight = placement === "top" ? topSpace : bottomSpace;
  const top = placement === "top"
    ? clampPosition(topTop, margin, Math.max(margin, viewportHeight - margin - height))
    : clampPosition(bottomTop, margin, Math.max(margin, viewportHeight - margin));
  const left = clampPosition(
    alignedLeft(anchor, width, options.align ?? "start"),
    margin,
    Math.max(margin, viewportWidth - margin - width)
  );

  return {
    left: Math.round(left),
    maxHeight: Math.round(availableHeight),
    placement,
    top: Math.round(top)
  };
}
