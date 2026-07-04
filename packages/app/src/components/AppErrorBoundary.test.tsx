import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppErrorBoundary } from "./AppErrorBoundary";
import {
  configureAppRuntime,
  createDefaultAppRuntime,
  resetAppRuntimeForTests
} from "../runtime";

function BrokenView(): never {
  throw new Error("Render exploded");
}

describe("AppErrorBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    resetAppRuntimeForTests();
  });

  afterEach(() => {
    consoleError.mockRestore();
    resetAppRuntimeForTests();
  });

  it("offers a prefilled issue when the app crashes", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const openExternalUrl = vi.fn(async (_url: string | URL) => undefined);

    configureAppRuntime({
      ...defaultRuntime,
      platform: {
        resolveDesktopOsVersion: () => "15.5",
        resolveDesktopPlatform: () => "macos"
      },
      window: {
        ...defaultRuntime.window,
        openExternalUrl
      }
    });

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Markra needs to reload" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit issue" }));

    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledTimes(1));
    const issueUrlInput = openExternalUrl.mock.calls[0]?.[0];
    expect(issueUrlInput).toBeDefined();
    const issueUrl = new URL(String(issueUrlInput));

    expect(issueUrl.pathname).toBe("/markrahq/markra/issues/new");
    expect(issueUrl.searchParams.get("title")).toBe("Crash report");
    expect(issueUrl.searchParams.get("body")).toContain("## Markra Crash Report");
    expect(issueUrl.searchParams.get("body")).toContain("- Error message: Render exploded");
    expect(issueUrl.searchParams.get("body")).toContain("- Platform: macos");
  });

  it("copies crash diagnostics from the error fallback", async () => {
    const writeText = vi.fn(async () => undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## Markra Crash Report")));
    expect(screen.getByRole("status")).toHaveTextContent("Diagnostics copied.");
  });
});
