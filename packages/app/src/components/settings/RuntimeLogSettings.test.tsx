import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import type { RuntimeLogEntry } from "../../lib/runtime-log";
import { RuntimeLogSettings } from "./RuntimeLogSettings";

describe("RuntimeLogSettings", () => {
  it("shows runtime log entries and exposes copy and clear actions", () => {
    const onClearLogs = vi.fn();
    const onCopyLogs = vi.fn();
    const entries: RuntimeLogEntry[] = [
      {
        area: "sync",
        details: {
          error: "WebDAV sync upload failed: HTTP 507",
          uploadedFiles: 0
        },
        id: "entry-1",
        level: "error",
        message: "Sync failed",
        timestamp: "2030-01-02T03:04:05.000Z"
      }
    ];

    render(
      <RuntimeLogSettings
        entries={entries}
        translate={translate}
        onClearLogs={onClearLogs}
        onCopyLogs={onCopyLogs}
      />
    );

    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();
    const logOutput = screen.getByRole("log", { name: "Runtime log entries" });
    expect(logOutput.tagName.toLowerCase()).toBe("pre");
    expect(logOutput).toHaveTextContent("[2030-01-02T03:04:05.000Z] ERROR sync Sync failed");
    expect(logOutput).toHaveTextContent("error: WebDAV sync upload failed: HTTP 507");
    expect(logOutput).toHaveTextContent("uploadedFiles: 0");

    fireEvent.click(screen.getByRole("button", { name: "Copy logs" }));
    expect(onCopyLogs).toHaveBeenCalledWith(expect.stringContaining("HTTP 507"));

    fireEvent.click(screen.getByRole("button", { name: "Clear logs" }));
    expect(onClearLogs).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state and disables actions when no logs exist", () => {
    render(
      <RuntimeLogSettings
        entries={[]}
        translate={translate}
        onClearLogs={vi.fn()}
        onCopyLogs={vi.fn()}
      />
    );

    expect(screen.getByText("No logs yet. Warnings, errors, and uncaught exceptions will appear here."))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy logs" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear logs" })).toBeDisabled();
  });
});
