import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  closeNativeWindow,
  listNativeEditorWindowRestoreStates,
  minimizeNativeWindow,
  setNativeEditorWindowRestoreState,
  toggleNativeWindowMaximized
} from "./window";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn()
}));

const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockedInvoke = vi.mocked(invoke);

describe("native window actions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    mockedGetCurrentWindow.mockReset();
    mockedInvoke.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("closes the current Tauri window", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ close } as unknown as ReturnType<typeof getCurrentWindow>);

    await closeNativeWindow();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("minimizes the current Tauri window", async () => {
    const minimize = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ minimize } as unknown as ReturnType<typeof getCurrentWindow>);

    await minimizeNativeWindow();

    expect(minimize).toHaveBeenCalledTimes(1);
  });

  it("toggles the current Tauri window maximized state", async () => {
    const toggleMaximize = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ toggleMaximize } as unknown as ReturnType<typeof getCurrentWindow>);

    await toggleNativeWindowMaximized();

    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("skips native calls outside Tauri", async () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

    await closeNativeWindow();
    await minimizeNativeWindow();
    await toggleNativeWindowMaximized();

    expect(mockedGetCurrentWindow).not.toHaveBeenCalled();
  });

  it("registers the current editor window restore state in Tauri", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await setNativeEditorWindowRestoreState({
      filePath: "/mock-files/notes.md",
      openFilePaths: ["/mock-files/notes.md"]
    });

    expect(mockedInvoke).toHaveBeenCalledWith("set_editor_window_restore_state", {
      filePath: "/mock-files/notes.md",
      openFilePaths: ["/mock-files/notes.md"]
    });
  });

  it("lists normalized editor window restore states from Tauri", async () => {
    mockedInvoke.mockResolvedValue([
      {
        filePath: " /mock-files/first.md ",
        label: "main",
        openFilePaths: [" /mock-files/first.md ", " "]
      },
      {
        filePath: null,
        label: "empty",
        openFilePaths: []
      }
    ]);

    await expect(listNativeEditorWindowRestoreStates()).resolves.toEqual([
      {
        filePath: "/mock-files/first.md",
        label: "main",
        openFilePaths: ["/mock-files/first.md"]
      }
    ]);
    expect(mockedInvoke).toHaveBeenCalledWith("list_editor_window_restore_states");
  });
});
