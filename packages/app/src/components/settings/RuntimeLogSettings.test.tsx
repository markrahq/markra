import { fireEvent, render, screen } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import type { RuntimeLogEntry } from "../../lib/runtime-log";
import { RuntimeLogSettings } from "./RuntimeLogSettings";

describe("RuntimeLogSettings", () => {
  it("shows newest runtime log entries as compact rows and exposes copy and clear actions", () => {
    const onClearLogs = vi.fn();
    const onCopyLogs = vi.fn();
    const onOpenLogFolder = vi.fn();
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
      },
      {
        area: "update",
        details: {
          result: "available"
        },
        id: "entry-2",
        level: "info",
        message: "Update available",
        timestamp: "2030-01-02T03:05:05.000Z"
      }
    ];

    render(
      <RuntimeLogSettings
        entries={entries}
        translate={translate}
        onClearLogs={onClearLogs}
        onCopyLogs={onCopyLogs}
        onOpenLogFolder={onOpenLogFolder}
      />
    );

    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();
    const logOutput = screen.getByRole("log", { name: "Runtime log entries" });
    expect(logOutput.tagName.toLowerCase()).toBe("ol");
    expect(logOutput).toHaveClass("overflow-auto");
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass("w-max");
    expect(rows[0]).toHaveClass("whitespace-pre");
    expect(rows[0]).not.toHaveClass("text-ellipsis");
    expect(rows[0]).toHaveTextContent("[2030-01-02T03:05:05.000Z] INFO update Update available");
    expect(rows[0]).toHaveTextContent('{"result":"available"}');
    expect(rows[1]).toHaveTextContent("[2030-01-02T03:04:05.000Z] ERROR sync Sync failed");
    expect(rows[1]).toHaveTextContent('{"error":"WebDAV sync upload failed: HTTP 507","uploadedFiles":0}');

    fireEvent.click(screen.getByRole("button", { name: "Copy logs" }));
    expect(onCopyLogs).toHaveBeenCalledWith(expect.stringContaining("HTTP 507"));

    fireEvent.click(screen.getByRole("button", { name: "Clear logs" }));
    expect(onClearLogs).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open log folder" }));
    expect(onOpenLogFolder).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByRole("button", { name: "Open log folder" })).not.toBeInTheDocument();
  });
});
