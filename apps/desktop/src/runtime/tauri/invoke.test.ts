import { invoke } from "@tauri-apps/api/core";
import { invokeNative } from "./invoke";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

const mockedInvoke = vi.mocked(invoke);

describe("invokeNative", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("forwards command calls to Tauri invoke", async () => {
    mockedInvoke.mockResolvedValue({ ok: true });

    await expect(invokeNative("mock_command", { value: 1 })).resolves.toEqual({ ok: true });

    expect(mockedInvoke).toHaveBeenCalledWith("mock_command", { value: 1 });
  });

  it("omits Tauri invoke args when no args are provided", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await expect(invokeNative("mock_command")).resolves.toBeUndefined();

    expect(mockedInvoke).toHaveBeenCalledWith("mock_command");
  });

  it("logs command failures and rethrows the original error", async () => {
    const error = new Error("backend failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedInvoke.mockRejectedValue(error);

    await expect(invokeNative("sync_webdav_markdown_folder", { serverUrl: "https://dav.example.test" })).rejects.toBe(
      error
    );

    expect(consoleError).toHaveBeenCalledWith("[native command failed]", expect.objectContaining({
      args: "{\"serverUrl\":\"[redacted]\"}",
      command: "sync_webdav_markdown_folder",
      error: "backend failed"
    }));

    consoleError.mockRestore();
  });

  it("emits sanitized runtime diagnostics for every native command failure", async () => {
    const error = "S3 image upload failed: PUT pasted-image.png: HTTP 403";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    mockedInvoke.mockRejectedValue(error);

    await expect(invokeNative("upload_s3_image", {
      request: {
        endpointUrl: "https://s3.example.test/private",
        fileName: "pasted-image.png",
        secretAccessKey: "synthetic-secret",
        sourcePath: "/Users/example/private-note.md"
      }
    })).rejects.toBe(error);

    const diagnosticEvent = dispatchEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "markra:runtime-diagnostic") as CustomEvent | undefined;
    expect(diagnosticEvent?.detail).toMatchObject({
      area: "storage",
      details: {
        args: expect.stringContaining("pasted-image.png"),
        command: "upload_s3_image",
        error
      },
      level: "error",
      message: "Native command failed"
    });

    const diagnosticDetails = JSON.stringify(diagnosticEvent?.detail);
    expect(diagnosticDetails).not.toContain("synthetic-secret");
    expect(diagnosticDetails).not.toContain("s3.example.test");
    expect(diagnosticDetails).not.toContain("/Users/example");

    expect(consoleError).toHaveBeenCalledWith("[native command failed]", expect.objectContaining({
      args: expect.stringContaining("pasted-image.png"),
      command: "upload_s3_image",
      error
    }));

    dispatchEvent.mockRestore();
    consoleError.mockRestore();
  });
});
