import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import {
  closeNativeWindow,
  destroyNativeWindow,
  exitNativeApp,
  getCurrentNativeWindowLabel,
  listenNativeAppExitRequested,
  listenNativeWindowCloseRequested,
  listenNativeSettingsWindowTarget,
  listNativeEditorWindowRestoreStates,
  hideSettingsWindow,
  markSettingsWindowReady,
  minimizeNativeWindow,
  openSettingsWindow,
  prewarmSettingsWindow,
  setNativeEditorWindowRestoreState,
  showNativeWindow,
  toggleNativeWindowFullscreen,
  toggleNativeWindowMaximized
} from "./window";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn()
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: vi.fn()
}));

const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);
const mockedExit = vi.mocked(exit);

describe("native window actions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    mockedGetCurrentWindow.mockReset();
    mockedInvoke.mockReset();
    mockedListen.mockReset();
    mockedExit.mockReset();
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

  it("destroys the current Tauri window after app-level close handling", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ destroy } as unknown as ReturnType<typeof getCurrentWindow>);

    await destroyNativeWindow();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("listens for native window close requests", async () => {
    const cleanup = vi.fn();
    const onCloseRequested = vi.fn();
    const onCloseRequestedNative = vi.fn().mockResolvedValue(cleanup);
    mockedGetCurrentWindow.mockReturnValue({
      onCloseRequested: onCloseRequestedNative
    } as unknown as ReturnType<typeof getCurrentWindow>);

    await expect(listenNativeWindowCloseRequested(onCloseRequested)).resolves.toBe(cleanup);
    const nativeHandler = onCloseRequestedNative.mock.calls[0]?.[0] as ((event: { preventDefault: () => unknown }) => unknown) | undefined;
    if (!nativeHandler) throw new Error("close request listener was not registered");
    const preventDefault = vi.fn();
    await nativeHandler({ preventDefault });

    expect(onCloseRequestedNative).toHaveBeenCalledWith(expect.any(Function));
    expect(onCloseRequested).toHaveBeenCalledWith({ preventDefault: expect.any(Function) });
    const closeRequestEvent = onCloseRequested.mock.calls[0]?.[0] as { preventDefault: () => unknown } | undefined;
    closeRequestEvent?.preventDefault();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("listens for native app exit requests", async () => {
    const cleanup = vi.fn();
    mockedListen.mockImplementation((_event, callback) => Promise.resolve(cleanup));
    const onExitRequested = vi.fn();

    await expect(listenNativeAppExitRequested(onExitRequested)).resolves.toBe(cleanup);
    const onEvent = mockedListen.mock.calls[0]?.[1] as (() => unknown) | undefined;
    if (!onEvent) throw new Error("app exit request listener was not registered");
    onEvent();

    expect(mockedListen).toHaveBeenCalledWith("markra://app-exit-requested", expect.any(Function));
    expect(onExitRequested).toHaveBeenCalledTimes(1);
  });

  it("confirms and exits the native app", async () => {
    mockedExit.mockResolvedValue(undefined);

    await exitNativeApp();

    expect(mockedExit).toHaveBeenCalledWith(0);
  });

  it("minimizes the current Tauri window", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await minimizeNativeWindow();

    expect(mockedInvoke).toHaveBeenCalledWith("minimize_current_window");
    expect(mockedGetCurrentWindow).not.toHaveBeenCalled();
  });

  it("shows the current Tauri window", async () => {
    const isVisible = vi.fn().mockResolvedValue(false);
    const show = vi.fn().mockResolvedValue(undefined);
    const setFocus = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ isVisible, show, setFocus } as unknown as ReturnType<typeof getCurrentWindow>);

    await showNativeWindow();

    expect(isVisible).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(1);
  });

  it("does not show an already visible Tauri window again", async () => {
    const isVisible = vi.fn().mockResolvedValue(true);
    const show = vi.fn().mockResolvedValue(undefined);
    const setFocus = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ isVisible, show, setFocus } as unknown as ReturnType<typeof getCurrentWindow>);

    await showNativeWindow();

    expect(isVisible).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
    expect(setFocus).toHaveBeenCalledTimes(1);
  });

  it("reads the current Tauri window label", async () => {
    mockedGetCurrentWindow.mockReturnValue({ label: "markra-editor-1" } as unknown as ReturnType<typeof getCurrentWindow>);

    await expect(getCurrentNativeWindowLabel()).resolves.toBe("markra-editor-1");
  });

  it("keeps the window show action successful when focusing fails", async () => {
    const isVisible = vi.fn().mockResolvedValue(false);
    const show = vi.fn().mockResolvedValue(undefined);
    const setFocus = vi.fn().mockRejectedValue(new Error("focus denied"));
    mockedGetCurrentWindow.mockReturnValue({ isVisible, show, setFocus } as unknown as ReturnType<typeof getCurrentWindow>);

    await expect(showNativeWindow()).resolves.toBeUndefined();

    expect(show).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(1);
  });

  it("toggles the current Tauri window maximized state", async () => {
    const toggleMaximize = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ toggleMaximize } as unknown as ReturnType<typeof getCurrentWindow>);

    await toggleNativeWindowMaximized();

    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("toggles the current Tauri window fullscreen state", async () => {
    const isFullscreen = vi.fn().mockResolvedValue(false);
    const setFullscreen = vi.fn().mockResolvedValue(undefined);
    mockedGetCurrentWindow.mockReturnValue({ isFullscreen, setFullscreen } as unknown as ReturnType<typeof getCurrentWindow>);

    await toggleNativeWindowFullscreen();

    expect(isFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(true);
  });

  it("skips native calls outside Tauri", async () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

    await closeNativeWindow();
    await minimizeNativeWindow();
    await showNativeWindow();
    await toggleNativeWindowFullscreen();
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

  it("opens the settings window at the requested target", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await openSettingsWindow("exportPandocPath");

    expect(mockedInvoke).toHaveBeenCalledWith("open_settings_window", {
      target: "exportPandocPath"
    });
  });

  it("prewarms the settings window", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await prewarmSettingsWindow();

    expect(mockedInvoke).toHaveBeenCalledWith("prewarm_settings_window");
  });

  it("marks the settings window ready", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await markSettingsWindowReady();

    expect(mockedInvoke).toHaveBeenCalledWith("mark_settings_window_ready");
  });

  it("hides the settings window", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await hideSettingsWindow();

    expect(mockedInvoke).toHaveBeenCalledWith("hide_settings_window");
  });

  it("listens for native settings window target events", async () => {
    const cleanup = vi.fn();
    mockedListen.mockImplementation((_event, callback) => {
      return Promise.resolve(cleanup);
    });
    const onTarget = vi.fn();

    await expect(listenNativeSettingsWindowTarget(onTarget)).resolves.toBe(cleanup);
    const onEvent = mockedListen.mock.calls[0]?.[1] as ((event: { payload: { target?: unknown } }) => unknown) | undefined;
    if (!onEvent) throw new Error("settings target listener was not registered");
    onEvent({ payload: { target: "exportPandocPath" } });
    onEvent({ payload: { target: "unknown" } });

    expect(mockedListen).toHaveBeenCalledWith("markra://settings-window-target", expect.any(Function));
    expect(onTarget).toHaveBeenCalledTimes(1);
    expect(onTarget).toHaveBeenCalledWith("exportPandocPath");
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
