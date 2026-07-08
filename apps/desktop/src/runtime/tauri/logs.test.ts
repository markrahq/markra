import { error, info, warn } from "@tauri-apps/plugin-log";
import type { AppLogEvent } from "@markra/app/runtime";
import { invokeNative } from "./invoke";
import { isNativeLoggingAvailable, openNativeLogFolder, writeNativeLog } from "./logs";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}));

vi.mock("./invoke", () => ({
  invokeNative: vi.fn()
}));

const mockedInfo = vi.mocked(info);
const mockedWarn = vi.mocked(warn);
const mockedError = vi.mocked(error);
const mockedInvokeNative = vi.mocked(invokeNative);

function createLogEvent(overrides: Partial<AppLogEvent> = {}): AppLogEvent {
  return {
    area: "update",
    details: {
      endpointUrl: "https://updates.example.test/private",
      result: "available",
      sourcePath: "/Users/example/private-note.md"
    },
    level: "info",
    message: "Automatic update check completed",
    timestamp: "2026-07-08T00:00:00.000Z",
    ...overrides
  };
}

describe("native log runtime", () => {
  beforeEach(() => {
    mockedInfo.mockReset();
    mockedWarn.mockReset();
    mockedError.mockReset();
    mockedInvokeNative.mockReset();
  });

  it("reports native logging as available", () => {
    expect(isNativeLoggingAvailable()).toBe(true);
  });

  it("maps info, warn, and error events to the Tauri log plugin", async () => {
    await writeNativeLog(createLogEvent({ level: "info", message: "Info event" }));
    await writeNativeLog(createLogEvent({ level: "warn", message: "Warn event" }));
    await writeNativeLog(createLogEvent({ level: "error", message: "Error event" }));

    expect(mockedInfo).toHaveBeenCalledWith(expect.stringContaining("INFO update Info event"));
    expect(mockedWarn).toHaveBeenCalledWith(expect.stringContaining("WARN update Warn event"));
    expect(mockedError).toHaveBeenCalledWith(expect.stringContaining("ERROR update Error event"));
  });

  it("redacts sensitive details before writing desktop logs", async () => {
    await writeNativeLog(createLogEvent());

    const message = mockedInfo.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("result");
    expect(message).toContain("available");
    expect(message).not.toContain("updates.example.test");
    expect(message).not.toContain("/Users/example");
  });

  it("catches Tauri log plugin failures", async () => {
    mockedWarn.mockRejectedValue(new Error("log file unavailable"));

    await expect(writeNativeLog(createLogEvent({ level: "warn" }))).resolves.toBeUndefined();
  });

  it("opens the native log folder", async () => {
    await openNativeLogFolder();

    expect(mockedInvokeNative).toHaveBeenCalledWith("open_log_folder");
  });
});
