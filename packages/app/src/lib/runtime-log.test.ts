import {
  clearRuntimeLogEntries,
  formatRuntimeLogEntries,
  installRuntimeLogCapture,
  listRuntimeLogEntries
} from "./runtime-log";

describe("runtime log", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores recent captured log entries and formats them for sharing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const uninstall = installRuntimeLogCapture();

    try {
      for (let index = 0; index < 201; index += 1) {
        console.warn(`Sync warning ${index}`, {
          password: "secret-token",
          serverUrl: "https://dav.example.test/private",
          uploadedFiles: index
        });
      }
    } finally {
      uninstall();
      warnSpy.mockRestore();
    }

    const entries = listRuntimeLogEntries();
    expect(entries).toHaveLength(200);
    expect(entries[0]?.message).toBe("Console warning");
    expect(entries[199]?.message).toBe("Console warning");

    const formatted = formatRuntimeLogEntries(entries);
    expect(formatted).toContain("WARN system Console warning");
    expect(formatted).toContain("Sync warning 200");
    expect(formatted).toContain("\\\"uploadedFiles\\\":200");
    expect(formatted).not.toContain("Sync warning 0");
    expect(formatted).not.toContain("secret-token");
    expect(formatted).not.toContain("dav.example.test");
  });

  it("formats runtime logs with the newest entry first and one entry per line", () => {
    const entries = [
      {
        area: "sync",
        details: { uploadedFiles: 1 },
        id: "older",
        level: "warn",
        message: "Older warning",
        timestamp: "2030-01-02T03:04:05.000Z"
      },
      {
        area: "update",
        details: { result: "available" },
        id: "newer",
        level: "info",
        message: "Newer update",
        timestamp: "2030-01-02T03:05:05.000Z"
      }
    ] as const;

    const formatted = formatRuntimeLogEntries(entries);
    const lines = formatted.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("INFO update Newer update");
    expect(lines[0]).toContain('{"result":"available"}');
    expect(lines[1]).toContain("WARN sync Older warning");
    expect(lines[1]).toContain('{"uploadedFiles":1}');
  });

  it("clears runtime log entries", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const uninstall = installRuntimeLogCapture();

    try {
      console.warn("Sync skipped");
    } finally {
      uninstall();
      warnSpy.mockRestore();
    }

    clearRuntimeLogEntries();

    expect(listRuntimeLogEntries()).toEqual([]);
  });

  it("captures console warnings and runtime errors with redacted details", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const uninstall = installRuntimeLogCapture();

    try {
      console.warn("Sync warning", {
        password: "secret",
        serverUrl: "https://dav.example.test/private"
      });
      console.error(new Error("Native bridge failed for /Users/example/private-note.md"));

      const errorEvent = new ErrorEvent("error", {
        error: new Error("Unhandled crash at https://dav.example.test/private"),
        filename: "https://dav.example.test/app.js",
        lineno: 12,
        colno: 4
      });
      window.dispatchEvent(errorEvent);

      const rejectionEvent = new Event("unhandledrejection") as PromiseRejectionEvent;
      Object.defineProperty(rejectionEvent, "reason", {
        value: new Error("Rejected at C:\\Users\\example\\secret.md")
      });
      window.dispatchEvent(rejectionEvent);
    } finally {
      uninstall();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }

    const formatted = formatRuntimeLogEntries(listRuntimeLogEntries());
    expect(formatted).toContain("WARN system Console warning");
    expect(formatted).toContain("ERROR system Console error");
    expect(formatted).toContain("ERROR system Unhandled runtime error");
    expect(formatted).toContain("ERROR system Unhandled promise rejection");
    expect(formatted).not.toContain("secret");
    expect(formatted).not.toContain("dav.example.test");
    expect(formatted).not.toContain("/Users/example");
    expect(formatted).not.toContain("C:\\Users\\example");
  });

  it("captures structured native command diagnostics with redacted details", () => {
    const uninstall = installRuntimeLogCapture();

    try {
      window.dispatchEvent(new CustomEvent("markra:runtime-diagnostic", {
        detail: {
          area: "storage",
          details: {
            args: {
              request: {
                endpointUrl: "https://s3.example.test/private",
                fileName: "pasted-image.png",
                secretAccessKey: "synthetic-secret",
                sourcePath: "/Users/example/private-note.md"
              }
            },
            command: "upload_s3_image",
            error: "S3 image upload failed: PUT pasted-image.png: HTTP 403"
          },
          level: "error",
          message: "Native command failed"
        }
      }));
    } finally {
      uninstall();
    }

    const entries = listRuntimeLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      area: "storage",
      level: "error",
      message: "Native command failed"
    });

    const formatted = formatRuntimeLogEntries(entries);
    expect(formatted).toContain("ERROR storage Native command failed");
    expect(formatted).toContain('"command":"upload_s3_image"');
    expect(formatted).toContain("S3 image upload failed: PUT pasted-image.png: HTTP 403");
    expect(formatted).toContain("pasted-image.png");
    expect(formatted).not.toContain("synthetic-secret");
    expect(formatted).not.toContain("s3.example.test");
    expect(formatted).not.toContain("/Users/example");
  });

  it("does not recursively log console errors raised while writing a log entry", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation((event) => {
      if (event.type === "markra:runtime-log-changed") console.error("Nested console error");

      return true;
    });
    const uninstall = installRuntimeLogCapture();

    try {
      console.error("Outer console error");
    } finally {
      uninstall();
      dispatchSpy.mockRestore();
      errorSpy.mockRestore();
    }

    const consoleErrors = listRuntimeLogEntries().filter((entry) => entry.message === "Console error");
    expect(consoleErrors).toHaveLength(1);
  });
});
