import { fireEvent, render, screen } from "@testing-library/react";
import { MacWindowControls } from "./MacWindowControls";
import {
  closeNativeWindow,
  minimizeNativeWindow,
  toggleNativeWindowFullscreen
} from "../lib/tauri/window";

vi.mock("../lib/tauri/window", () => ({
  closeNativeWindow: vi.fn(),
  minimizeNativeWindow: vi.fn(),
  toggleNativeWindowFullscreen: vi.fn()
}));

const mockedToggleNativeWindowFullscreen = vi.mocked(toggleNativeWindowFullscreen);

describe("MacWindowControls", () => {
  beforeEach(() => {
    vi.mocked(closeNativeWindow).mockReset();
    vi.mocked(minimizeNativeWindow).mockReset();
    mockedToggleNativeWindowFullscreen.mockReset();
  });

  it("renders fixed-size self-drawn macOS window controls", () => {
    const { container } = render(<MacWindowControls />);

    const close = screen.getByRole("button", { name: "Close window" });
    const minimize = screen.getByRole("button", { name: "Minimize window" });
    const fullscreen = screen.getByRole("button", { name: "Toggle full screen" });
    const glyphs = container.querySelectorAll(".mac-window-control-glyph");
    const controls = close.closest(".mac-window-controls");

    expect(close).toHaveClass("size-[15px]");
    expect(minimize).toHaveClass("size-[15px]");
    expect(fullscreen).toHaveClass("size-[15px]");
    expect(close).toHaveClass("relative");
    expect(minimize).toHaveClass("relative");
    expect(fullscreen).toHaveClass("relative");
    expect(controls).toHaveClass("h-10", "group/window-controls");
    expect(glyphs).toHaveLength(3);
    glyphs.forEach((glyph) => {
      expect(glyph).toHaveAttribute("aria-hidden", "true");
      expect(glyph).toHaveClass(
        "absolute",
        "inset-0",
        "m-auto",
        "size-[9px]",
        "opacity-0",
        "group-hover/window-controls:opacity-70"
      );
    });
    expect(close.querySelector('[data-icon="macos-close"]')).toHaveAttribute("viewBox", "0 0 9 9");
    expect(minimize.querySelector('[data-icon="macos-minimize"]')).toHaveAttribute("viewBox", "0 0 9 9");
    expect(fullscreen.querySelector('[data-icon="macos-zoom"]')).toHaveAttribute("viewBox", "0 0 9 9");
    expect(fullscreen.querySelectorAll("path")).toHaveLength(2);
  });

  it("dispatches the native window actions without letting clicks start dragging", () => {
    const close = vi.fn();
    const minimize = vi.fn();
    const zoom = vi.fn();

    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <MacWindowControls
          onClose={close}
          onMinimize={minimize}
          onZoom={zoom}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle full screen" }));

    expect(close).toHaveBeenCalledTimes(1);
    expect(minimize).toHaveBeenCalledTimes(1);
    expect(zoom).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("uses true fullscreen for the default green traffic-light action", () => {
    render(<MacWindowControls />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle full screen" }));

    expect(mockedToggleNativeWindowFullscreen).toHaveBeenCalledTimes(1);
  });
});
