import { fireEvent, render, screen } from "@testing-library/react";
import { WindowsWindowControls } from "./WindowsWindowControls";
import {
  closeNativeWindow,
  minimizeNativeWindow,
  toggleNativeWindowMaximized
} from "../lib/tauri/window";

vi.mock("../lib/tauri/window", () => ({
  closeNativeWindow: vi.fn(),
  minimizeNativeWindow: vi.fn(),
  toggleNativeWindowMaximized: vi.fn()
}));

describe("WindowsWindowControls", () => {
  beforeEach(() => {
    vi.mocked(closeNativeWindow).mockReset();
    vi.mocked(minimizeNativeWindow).mockReset();
    vi.mocked(toggleNativeWindowMaximized).mockReset();
  });

  it("renders fixed-size self-drawn Windows window controls", () => {
    const { container } = render(<WindowsWindowControls />);

    const minimize = screen.getByRole("button", { name: "Minimize window" });
    const maximize = screen.getByRole("button", { name: "Maximize or restore window" });
    const close = screen.getByRole("button", { name: "Close window" });

    expect(container.querySelector(".windows-window-controls")).toHaveClass("h-10");
    expect(minimize).toHaveClass("h-10", "w-11");
    expect(maximize).toHaveClass("h-10", "w-11");
    expect(close).toHaveClass("h-10", "w-11", "hover:bg-[#c42b1c]", "hover:text-[#fdfdfd]");
    expect(minimize.querySelector(".lucide-minus")).toBeInTheDocument();
    expect(maximize.querySelector(".lucide-square")).toBeInTheDocument();
    expect(close.querySelector(".lucide-x")).toBeInTheDocument();
  });

  it("dispatches native window actions without bubbling into drag regions", () => {
    const parentPointerDown = vi.fn();
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick} onMouseDown={parentPointerDown}>
        <WindowsWindowControls />
      </div>
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize or restore window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    expect(minimizeNativeWindow).toHaveBeenCalledTimes(1);
    expect(toggleNativeWindowMaximized).toHaveBeenCalledTimes(1);
    expect(closeNativeWindow).toHaveBeenCalledTimes(1);
    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
