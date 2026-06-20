import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { UpdateProgressToast } from "../components/UpdateProgressToast";
import { showAppToast } from "../lib/app-toast";
import { checkNativeAppUpdate, type NativeAppUpdate } from "../lib/tauri/updater";
import { useAutoUpdater } from "./useAutoUpdater";

vi.mock("../lib/app-toast", () => ({
  showAppToast: vi.fn()
}));

vi.mock("../lib/tauri/updater", () => ({
  checkNativeAppUpdate: vi.fn()
}));

const mockedShowAppToast = vi.mocked(showAppToast);
const mockedCheckNativeAppUpdate = vi.mocked(checkNativeAppUpdate);

type ClickableToastAction = {
  onClick: () => unknown;
};

function AutoUpdaterHarness({
  autoCheck,
  beforeRestart,
  checkIntervalMs,
  confirmRestart,
  language = "en"
}: {
  autoCheck?: boolean;
  beforeRestart?: () => Promise<unknown>;
  checkIntervalMs?: number;
  confirmRestart?: () => Promise<boolean>;
  language?: "en" | "zh-CN";
}) {
  const updater = useAutoUpdater(language, true, { autoCheck, beforeRestart, checkIntervalMs, confirmRestart });

  return (
    <button type="button" onClick={updater.checkForUpdates}>
      Manual check
    </button>
  );
}

function DisabledUpdaterHarness() {
  const updater = useAutoUpdater("en", false, { autoCheck: false });

  return (
    <button type="button" onClick={updater.checkForUpdates}>
      Manual check
    </button>
  );
}

function createUpdate(overrides: Partial<NativeAppUpdate> = {}): NativeAppUpdate {
  return {
    body: "Release notes",
    currentVersion: "0.0.6",
    date: "2026-05-11T00:00:00Z",
    downloadAndInstall: vi.fn(),
    restart: vi.fn(),
    version: "0.0.7",
    ...overrides
  };
}

function isClickableToastAction(action: unknown): action is ClickableToastAction {
  return typeof action === "object"
    && action !== null
    && "onClick" in action
    && typeof (action as { onClick?: unknown }).onClick === "function";
}

function getToastAction(callIndex = 0) {
  const action = mockedShowAppToast.mock.calls[callIndex]?.[0].action;
  if (!isClickableToastAction(action)) {
    throw new Error(`Expected toast call ${callIndex} to include a clickable action.`);
  }

  return action;
}

function isProgressToastMessage(message: unknown): message is ReactElement<{ progress: number | null }> {
  return isValidElement<{ progress: number | null }>(message) && message.type === UpdateProgressToast;
}

function expectProgressToast(progress: number | null) {
  expect(mockedShowAppToast).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "app-update-toast",
      message: expect.anything(),
      status: "loading"
    })
  );
  const progressCall = mockedShowAppToast.mock.calls.find(([toast]) => {
    const message = toast.message;
    return isProgressToastMessage(message) && message.props.progress === progress;
  });
  expect(progressCall).toBeTruthy();
}

describe("useAutoUpdater", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockedShowAppToast.mockReset();
    mockedCheckNativeAppUpdate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks for updates once on startup and stays quiet when none are available", async () => {
    mockedCheckNativeAppUpdate.mockResolvedValue(null);

    render(<AutoUpdaterHarness />);

    await waitFor(() => expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1));
    expect(mockedShowAppToast).not.toHaveBeenCalled();
  });

  it("downloads an available update in the background and prompts restart", async () => {
    const confirmRestart = vi.fn(async () => true);
    const restart = vi.fn();
    const downloadAndInstall = vi.fn(async ({ onProgress }: Parameters<NativeAppUpdate["downloadAndInstall"]>[0] = {}) => {
      onProgress?.({ contentLength: 100, downloaded: 50, progress: 50 });
      onProgress?.({ contentLength: 100, downloaded: 100, progress: 100 });
    });
    mockedCheckNativeAppUpdate.mockResolvedValue(createUpdate({ downloadAndInstall, restart }));

    render(<AutoUpdaterHarness confirmRestart={confirmRestart} />);

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1));
    expect(confirmRestart).not.toHaveBeenCalled();
    expectProgressToast(50);
    expect(mockedShowAppToast).toHaveBeenLastCalledWith({
      action: expect.objectContaining({
        label: "Restart now"
      }),
      duration: Infinity,
      id: "app-update-toast",
      message: "Update downloaded. Restart Markra to finish.",
      status: "success"
    });

    const action = getToastAction(mockedShowAppToast.mock.calls.length - 1);
    action.onClick();

    await waitFor(() => expect(confirmRestart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
  });

  it("does not restart when restart confirmation is declined", async () => {
    const confirmRestart = vi.fn(async () => false);
    const restart = vi.fn();
    mockedCheckNativeAppUpdate.mockResolvedValue(createUpdate({ restart }));

    render(<AutoUpdaterHarness confirmRestart={confirmRestart} />);

    await waitFor(() => expect(mockedShowAppToast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ label: "Restart now" })
      })
    ));

    const action = getToastAction(mockedShowAppToast.mock.calls.length - 1);
    action.onClick();

    await waitFor(() => expect(confirmRestart).toHaveBeenCalledTimes(1));
    expect(restart).not.toHaveBeenCalled();
  });

  it("runs restart preparation before confirming and relaunching", async () => {
    const calls: string[] = [];
    const beforeRestart = vi.fn(async () => {
      calls.push("beforeRestart");
    });
    const confirmRestart = vi.fn(async () => {
      calls.push("confirmRestart");
      return true;
    });
    const restart = vi.fn(async () => {
      calls.push("restart");
    });
    mockedCheckNativeAppUpdate.mockResolvedValue(createUpdate({ restart }));

    render(
      <AutoUpdaterHarness
        autoCheck={false}
        beforeRestart={beforeRestart}
        confirmRestart={confirmRestart}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Manual check" }));
    await waitFor(() => expect(mockedShowAppToast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ label: "Restart now" })
      })
    ));

    const action = getToastAction(mockedShowAppToast.mock.calls.length - 1);
    action.onClick();

    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(beforeRestart).toHaveBeenCalledTimes(1);
    expect(confirmRestart).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["beforeRestart", "confirmRestart", "restart"]);
  });

  it("keeps background check failures quiet during startup", async () => {
    mockedCheckNativeAppUpdate.mockRejectedValue(new Error("offline"));

    render(<AutoUpdaterHarness />);

    await waitFor(() => expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1));
    expect(mockedShowAppToast).not.toHaveBeenCalled();
  });

  it("keeps checking for updates on a schedule", async () => {
    vi.useFakeTimers();

    try {
      mockedCheckNativeAppUpdate.mockResolvedValue(null);

      render(<AutoUpdaterHarness checkIntervalMs={1000} />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the UI manually check for updates and reports when Markra is current", async () => {
    mockedCheckNativeAppUpdate.mockResolvedValue(null);

    render(<AutoUpdaterHarness autoCheck={false} />);

    expect(mockedCheckNativeAppUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Manual check" }));

    await waitFor(() => expect(mockedCheckNativeAppUpdate).toHaveBeenCalledTimes(1));
    expect(mockedShowAppToast).toHaveBeenCalledWith({
      id: "app-update-toast",
      message: "Checking for Markra updates...",
      status: "loading"
    });
    expect(mockedShowAppToast).toHaveBeenLastCalledWith({
      id: "app-update-toast",
      message: "Markra is up to date.",
      status: "success"
    });
  });

  it("does not manually check while updater actions are disabled", () => {
    render(<DisabledUpdaterHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Manual check" }));

    expect(mockedCheckNativeAppUpdate).not.toHaveBeenCalled();
    expect(mockedShowAppToast).not.toHaveBeenCalled();
  });

  it("surfaces install failures after the user starts the update", async () => {
    const downloadAndInstall = vi.fn(async () => {
      throw new Error("download failed");
    });
    mockedCheckNativeAppUpdate.mockResolvedValue(createUpdate({ downloadAndInstall }));

    render(<AutoUpdaterHarness autoCheck={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Manual check" }));

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1));


    await waitFor(() =>
      expect(mockedShowAppToast).toHaveBeenLastCalledWith({
        id: "app-update-toast",
        message: "Markra update failed.",
        status: "error"
      })
    );
  });
});
