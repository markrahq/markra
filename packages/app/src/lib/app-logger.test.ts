import { clearRuntimeLogEntries, formatRuntimeLogEntries, listRuntimeLogEntries } from "./runtime-log";
import { appLogger, resetAppLogBackendWriterForTests, setAppLogBackendWriter, type AppLogEvent } from "./app-logger";

describe("app logger", () => {
  beforeEach(() => {
    resetAppLogBackendWriterForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    resetAppLogBackendWriterForTests();
    clearRuntimeLogEntries();
    vi.restoreAllMocks();
  });

  it("writes info, warn, and error entries to the runtime log", () => {
    appLogger.info("update", "Automatic update check completed", { result: "current" });
    appLogger.warn("sync", "Sync skipped", { reason: "disabled" });
    appLogger.error("file", "Markdown save failed", { extension: ".md" });

    const entries = listRuntimeLogEntries();

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.level)).toEqual(["info", "warn", "error"]);
    expect(entries.map((entry) => entry.area)).toEqual(["update", "sync", "file"]);
    expect(entries.map((entry) => entry.message)).toEqual([
      "Automatic update check completed",
      "Sync skipped",
      "Markdown save failed"
    ]);
  });

  it("redacts sensitive details before storing and forwarding logs", () => {
    const backendEvents: AppLogEvent[] = [];
    setAppLogBackendWriter((event) => {
      backendEvents.push(event);
    });

    appLogger.info("storage", "Storage upload completed", {
      count: 2,
      endpointUrl: "https://s3.example.test/private",
      sourcePath: "/Users/example/private-note.md",
      token: "synthetic-token"
    });

    const formatted = formatRuntimeLogEntries(listRuntimeLogEntries());
    expect(formatted).toContain("INFO storage Storage upload completed");
    expect(formatted).toContain('"count":2');
    expect(formatted).not.toContain("s3.example.test");
    expect(formatted).not.toContain("/Users/example");
    expect(formatted).not.toContain("synthetic-token");
    expect(backendEvents[0]?.details).toMatchObject({
      count: 2,
      endpointUrl: "[redacted]",
      sourcePath: "[redacted]",
      token: "[redacted]"
    });
  });

  it("does not throw when runtime storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => {
      appLogger.warn("settings", "Settings save skipped", { reason: "readonly" });
    }).not.toThrow();
  });

  it("does not throw or recursively log when backend logging fails", async () => {
    const backendError = new Error("log file unavailable");
    setAppLogBackendWriter(() => Promise.reject(backendError));

    appLogger.error("system", "Background operation failed", { operation: "startup" });
    await Promise.resolve();

    const entries = listRuntimeLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      area: "system",
      level: "error",
      message: "Background operation failed"
    });
  });

  it("continues forwarding logs while an async backend write is pending", async () => {
    const backendEvents: AppLogEvent[] = [];
    let resolveFirstWrite!: () => void;
    setAppLogBackendWriter((event) => {
      backendEvents.push(event);
      if (event.message !== "First file log") return undefined;

      return new Promise((resolve) => {
        resolveFirstWrite = () => resolve(undefined);
      });
    });

    appLogger.info("system", "First file log");
    appLogger.warn("system", "Second file log");

    expect(backendEvents.map((event) => event.message)).toEqual([
      "First file log",
      "Second file log"
    ]);
    resolveFirstWrite();
    await Promise.resolve();
  });

  it("does not recursively call the backend when the backend logs again", () => {
    const backendEvents: AppLogEvent[] = [];
    setAppLogBackendWriter((event) => {
      backendEvents.push(event);
      appLogger.warn("system", "Nested backend warning");
    });

    appLogger.info("system", "Outer backend event");

    expect(backendEvents).toHaveLength(1);
    expect(listRuntimeLogEntries()).toEqual([
      expect.objectContaining({ message: "Outer backend event" }),
      expect.objectContaining({ message: "Nested backend warning" })
    ]);
  });
});
