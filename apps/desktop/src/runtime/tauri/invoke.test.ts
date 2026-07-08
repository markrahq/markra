import { invoke } from "@tauri-apps/api/core";
import { appLogger } from "@markra/app/runtime";
import { invokeNative } from "./invoke";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@markra/app/runtime", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

const mockedInvoke = vi.mocked(invoke);
const mockedAppLogger = vi.mocked(appLogger);

describe("invokeNative", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedAppLogger.error.mockReset();
    mockedAppLogger.info.mockReset();
    mockedAppLogger.warn.mockReset();
  });

  it("forwards command calls to Tauri invoke", async () => {
    mockedInvoke.mockResolvedValue({ ok: true });

    await expect(invokeNative("mock_command", { value: 1 })).resolves.toEqual({ ok: true });

    expect(mockedInvoke).toHaveBeenCalledWith("mock_command", { value: 1 });
    expect(mockedAppLogger.info).toHaveBeenCalledWith("system", "Native command started", {
      argumentKeys: "value",
      command: "mock_command",
      hasArgs: true
    });
    expect(mockedAppLogger.info).toHaveBeenCalledWith("system", "Native command completed", expect.objectContaining({
      argumentKeys: "value",
      command: "mock_command",
      durationMs: expect.any(Number),
      hasArgs: true
    }));
  });

  it("omits Tauri invoke args when no args are provided", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await expect(invokeNative("mock_command")).resolves.toBeUndefined();

    expect(mockedInvoke).toHaveBeenCalledWith("mock_command");
    expect(mockedAppLogger.info).toHaveBeenCalledWith("system", "Native command started", {
      command: "mock_command",
      hasArgs: false
    });
    expect(mockedAppLogger.info).toHaveBeenCalledWith("system", "Native command completed", expect.objectContaining({
      command: "mock_command",
      durationMs: expect.any(Number),
      hasArgs: false
    }));
  });

  it("logs command failures through the app logger and rethrows the original error", async () => {
    const error = new Error("backend failed");
    mockedInvoke.mockRejectedValue(error);

    await expect(invokeNative("sync_webdav_markdown_folder", { serverUrl: "https://dav.example.test" })).rejects.toBe(
      error
    );

    expect(mockedAppLogger.error).toHaveBeenCalledWith("sync", "Native command failed", {
      argumentKeys: "serverUrl",
      command: "sync_webdav_markdown_folder",
      error: "backend failed",
      hasArgs: true
    });
  });

  it("does not log native command argument values", async () => {
    const error = "S3 image upload failed: PUT pasted-image.png: HTTP 403";
    mockedInvoke.mockRejectedValue(error);

    await expect(invokeNative("upload_s3_image", {
      request: {
        endpointUrl: "https://s3.example.test/private",
        fileName: "pasted-image.png",
        secretAccessKey: "synthetic-secret",
        sourcePath: "/Users/example/private-note.md"
      }
    })).rejects.toBe(error);

    const loggedDetails = mockedAppLogger.error.mock.calls[0]?.[2] ?? {};
    expect(loggedDetails).toMatchObject({
      argumentKeys: "request",
      command: "upload_s3_image",
      error: "S3 image upload failed: PUT [file]: HTTP 403",
      hasArgs: true
    });

    const serializedDetails = JSON.stringify(loggedDetails);
    expect(serializedDetails).not.toContain("synthetic-secret");
    expect(serializedDetails).not.toContain("s3.example.test");
    expect(serializedDetails).not.toContain("/Users/example");
    expect(serializedDetails).not.toContain("pasted-image.png");
  });
});
