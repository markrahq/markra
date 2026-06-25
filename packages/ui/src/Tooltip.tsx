import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type DOMAttributes,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from "react";
import { createPortal } from "react-dom";

import { mergeClassNames } from "./classes";

export type TooltipSide = "bottom" | "top";

type TooltipTriggerProps = DOMAttributes<HTMLElement> & AriaAttributes & {
  className?: string;
  ref?: Ref<HTMLElement>;
  title?: string;
};

export type TooltipProps = {
  children: ReactElement<TooltipTriggerProps>;
  className?: string;
  content: ReactNode;
  delayMs?: number;
  disabled?: boolean;
  side?: TooltipSide;
};

const tooltipGap = 8;
const tooltipViewportMargin = 8;

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  (ref as { current: T | null }).current = value;
}

function mergeDescribedBy(current: string | undefined, tooltipId: string, open: boolean) {
  if (!open) return current;

  return [current, tooltipId].filter(Boolean).join(" ") || undefined;
}

function clampedTooltipLeft(trigger: DOMRect, tooltipWidth: number, viewportWidth: number) {
  const preferredLeft = trigger.left + trigger.width / 2 - tooltipWidth / 2;
  const maxLeft = viewportWidth - tooltipViewportMargin - tooltipWidth;

  return Math.max(tooltipViewportMargin, Math.min(preferredLeft, maxLeft));
}

function tooltipTop(trigger: DOMRect, tooltipHeight: number, viewportHeight: number, side: TooltipSide) {
  const preferredTop = side === "bottom"
    ? trigger.bottom + tooltipGap
    : trigger.top - tooltipHeight - tooltipGap;

  if (side === "bottom" && preferredTop + tooltipHeight <= viewportHeight - tooltipViewportMargin) {
    return preferredTop;
  }

  if (side === "top" && preferredTop >= tooltipViewportMargin) {
    return preferredTop;
  }

  const fallbackTop = side === "bottom"
    ? trigger.top - tooltipHeight - tooltipGap
    : trigger.bottom + tooltipGap;

  return Math.max(
    tooltipViewportMargin,
    Math.min(fallbackTop, viewportHeight - tooltipViewportMargin - tooltipHeight)
  );
}

function callHandler<Event>(handler: ((event: Event) => unknown) | undefined, event: Event) {
  handler?.(event);
}

export function Tooltip({
  children,
  className,
  content,
  delayMs = 500,
  disabled = false,
  side = "top"
}: TooltipProps) {
  const generatedId = useId();
  const tooltipId = `${generatedId}-tooltip`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pointerDownRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
    left: tooltipViewportMargin,
    top: tooltipViewportMargin
  });

  const hasContent = content !== null && content !== undefined && content !== false && content !== "";
  const tooltipOpen = open && hasContent && !disabled;

  const clearHoverTimer = () => {
    if (!hoverTimerRef.current) return;

    globalThis.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };
  const openWithDelay = () => {
    if (!hasContent || disabled) return;

    clearHoverTimer();
    if (delayMs <= 0) {
      setOpen(true);
      return;
    }

    hoverTimerRef.current = globalThis.setTimeout(() => {
      hoverTimerRef.current = null;
      setOpen(true);
    }, delayMs);
  };
  const closeTooltip = () => {
    clearHoverTimer();
    setOpen(false);
  };

  useEffect(() => () => clearHoverTimer(), []);

  useLayoutEffect(() => {
    if (!tooltipOpen) return;

    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    const ownerWindow = trigger?.ownerDocument.defaultView;
    if (!trigger || !tooltip || !ownerWindow) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 240;
    const tooltipHeight = tooltip.offsetHeight || 32;

    setTooltipStyle({
      left: clampedTooltipLeft(triggerRect, tooltipWidth, ownerWindow.innerWidth),
      top: tooltipTop(triggerRect, tooltipHeight, ownerWindow.innerHeight, side)
    });
  }, [side, tooltipOpen, content]);

  if (!isValidElement<TooltipTriggerProps>(children)) return children;

  const childRef = children.props.ref;
  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
    setRef(childRef, node);
  };
  const describedBy = mergeDescribedBy(children.props["aria-describedby"], tooltipId, tooltipOpen);
  const trigger = cloneElement(children, {
    "aria-describedby": describedBy,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      callHandler(children.props.onBlur, event);
      pointerDownRef.current = false;
      closeTooltip();
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      callHandler(children.props.onClick, event);
      closeTooltip();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      callHandler(children.props.onFocus, event);
      clearHoverTimer();
      if (pointerDownRef.current) return;

      setOpen(true);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      callHandler(children.props.onKeyDown, event);
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") closeTooltip();
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      callHandler(children.props.onPointerCancel, event);
      pointerDownRef.current = false;
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      callHandler(children.props.onPointerDown, event);
      pointerDownRef.current = true;
      closeTooltip();
    },
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      callHandler(children.props.onPointerEnter, event);
      if (event.pointerType === "touch") return;

      openWithDelay();
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      callHandler(children.props.onPointerLeave, event);
      closeTooltip();
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      callHandler(children.props.onPointerUp, event);
      pointerDownRef.current = false;
    },
    ref: setTriggerRef,
    title: undefined
  });
  const portalTarget = triggerRef.current?.ownerDocument.body ?? null;

  return (
    <>
      {trigger}
      {tooltipOpen && portalTarget
        ? createPortal(
            <div
              ref={tooltipRef}
              className={mergeClassNames(
                "pointer-events-none fixed z-50 max-w-[min(28rem,calc(100vw-1rem))] rounded-md border border-(--border-default) bg-(--bg-primary) px-2 py-1 text-[11px] leading-4 font-[520] break-words text-(--text-heading) shadow-(--ai-command-popover-shadow)",
                className
              )}
              id={tooltipId}
              role="tooltip"
              style={tooltipStyle}
            >
              {content}
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
