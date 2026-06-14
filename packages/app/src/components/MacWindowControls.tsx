import type { MouseEvent } from "react";
import {
  closeNativeWindow,
  minimizeNativeWindow,
  toggleNativeWindowFullscreen
} from "../lib/tauri/window";

type WindowControlAction = () => Promise<unknown> | unknown;

type MacWindowControlsProps = {
  className?: string;
  onClose?: WindowControlAction;
  onFullscreen?: WindowControlAction;
  onMinimize?: WindowControlAction;
  onZoom?: WindowControlAction;
};

type WindowControlButtonProps = {
  action: WindowControlAction;
  className: string;
  icon: "close" | "minimize" | "zoom";
  label: string;
};

const controlButtonBaseClassName =
  "mac-window-control group/control relative inline-flex size-[15px] shrink-0 cursor-default items-center justify-center rounded-full border p-0 transition-[box-shadow,filter] duration-150 ease-out hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-primary)";
const glyphClassName =
  "mac-window-control-glyph pointer-events-none absolute inset-0 m-auto size-[9px] opacity-0 text-[#2f2f2f] transition-opacity duration-100 group-hover/window-controls:opacity-70 group-focus-within/window-controls:opacity-70";

function runWindowControlAction(action: WindowControlAction) {
  try {
    Promise.resolve(action()).catch(() => {});
  } catch {
    // Native window actions can fail while a window is closing; the UI should stay inert.
  }
}

function WindowControlGlyph({ icon }: { icon: WindowControlButtonProps["icon"] }) {
  if (icon === "close") {
    return (
      <svg
        aria-hidden="true"
        className={glyphClassName}
        data-icon="macos-close"
        viewBox="0 0 9 9"
      >
        <path
          d="M2.25 2.25L6.75 6.75M6.75 2.25L2.25 6.75"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.9"
        />
      </svg>
    );
  }

  if (icon === "minimize") {
    return (
      <svg
        aria-hidden="true"
        className={glyphClassName}
        data-icon="macos-minimize"
        viewBox="0 0 9 9"
      >
        <path
          d="M2 4.5H7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={glyphClassName}
      data-icon="macos-zoom"
      viewBox="0 0 9 9"
    >
      <path d="M2.45 1.45H7.55V6.55Z" fill="currentColor" />
      <path d="M6.55 7.55H1.45V2.45Z" fill="currentColor" />
    </svg>
  );
}

function WindowControlButton({ action, className, icon, label }: WindowControlButtonProps) {
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    runWindowControlAction(action);
  };

  return (
    <button
      aria-label={label}
      className={`${controlButtonBaseClassName} ${className}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      type="button"
    >
      <WindowControlGlyph icon={icon} />
    </button>
  );
}

export function MacWindowControls({
  className = "",
  onClose = closeNativeWindow,
  onFullscreen,
  onMinimize = minimizeNativeWindow,
  onZoom
}: MacWindowControlsProps) {
  const fullscreenAction = onFullscreen ?? onZoom ?? toggleNativeWindowFullscreen;

  return (
    <div
      className={`mac-window-controls group/window-controls flex h-10 select-none items-center gap-2 pl-4 pr-2 [-webkit-user-select:none] ${className}`}
      aria-hidden={false}
    >
      <WindowControlButton
        action={onClose}
        className="border-[#e0443e] bg-[#ff5f57]"
        icon="close"
        label="Close window"
      />
      <WindowControlButton
        action={onMinimize}
        className="border-[#dea123] bg-[#ffbd2e]"
        icon="minimize"
        label="Minimize window"
      />
      <WindowControlButton
        action={fullscreenAction}
        className="border-[#1aab29] bg-[#28c840]"
        icon="zoom"
        label="Toggle full screen"
      />
    </div>
  );
}
