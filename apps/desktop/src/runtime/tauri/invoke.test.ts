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

    expect(consoleError).toHaveBeenCalledWith("[native command failed]", {
      command: "sync_webdav_markdown_folder",
      error
    });

    consoleError.mockRestore();
  });
});
