import type { MouseEvent, ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import {
  closeNativeWindow,
  minimizeNativeWindow,
  toggleNativeWindowMaximized
} from "../lib/tauri/window";

type WindowControlAction = () => Promise<unknown> | unknown;

type WindowsWindowControlsProps = {
  className?: string;
  onClose?: WindowControlAction;
  onMaximize?: WindowControlAction;
  onMinimize?: WindowControlAction;
};

type WindowControlButtonProps = {
  action: WindowControlAction;
  children: ReactNode;
  className?: string;
  label: string;
};

const controlButtonBaseClassName =
  "windows-window-control inline-flex h-10 w-11 shrink-0 cursor-default items-center justify-center border-0 bg-transparent p-0 text-(--text-secondary) transition-[background-color,color] duration-100 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-inset";

function runWindowControlAction(action: WindowControlAction) {
  try {
    Promise.resolve(action()).catch(() => {});
  } catch {
    // Native window actions can fail while a window is closing; keep controls inert.
  }
}

function WindowControlButton({ action, children, className = "", label }: WindowControlButtonProps) {
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
      {children}
    </button>
  );
}

export function WindowsWindowControls({
  className = "",
  onClose = closeNativeWindow,
  onMaximize = toggleNativeWindowMaximized,
  onMinimize = minimizeNativeWindow
}: WindowsWindowControlsProps) {
  return (
    <div
      className={`windows-window-controls relative z-20 flex h-10 select-none items-center justify-end [-webkit-user-select:none] ${className}`}
      aria-hidden={false}
    >
      <WindowControlButton action={onMinimize} label="Minimize window">
        <Minus aria-hidden="true" size={14} strokeWidth={1.8} />
      </WindowControlButton>
      <WindowControlButton action={onMaximize} label="Maximize or restore window">
        <Square aria-hidden="true" size={12} strokeWidth={1.8} />
      </WindowControlButton>
      <WindowControlButton
        action={onClose}
        className="hover:bg-[#c42b1c] hover:text-[#fdfdfd]"
        label="Close window"
      >
        <X aria-hidden="true" size={15} strokeWidth={1.8} />
      </WindowControlButton>
    </div>
  );
}
