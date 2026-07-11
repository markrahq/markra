import { invoke } from "@tauri-apps/api/core";
import type { AppAiChatAttachmentRuntime } from "@markra/app/runtime";
import { desktopRuntime } from "../index";

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tauri-apps/api/core")>();

  return {
    ...original,
    invoke: vi.fn()
  };
});

const mockedInvoke = vi.mocked(invoke);

describe("native AI chat attachments", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("maps attachment persistence to narrow Tauri commands", async () => {
    expect(desktopRuntime).toHaveProperty("aiChatAttachments.save", expect.any(Function));
    expect(desktopRuntime).toHaveProperty("aiChatAttachments.read", expect.any(Function));
    expect(desktopRuntime).toHaveProperty("aiChatAttachments.deleteSession", expect.any(Function));

    const attachments = Reflect.get(desktopRuntime, "aiChatAttachments") as AppAiChatAttachmentRuntime;
    const input = {
      attachmentId: "attachment-1",
      mimeType: "image/png" as const,
      sessionId: "session-1"
    };

    mockedInvoke.mockResolvedValueOnce(undefined);
    await attachments.save({ ...input, bytes: [1, 2, 3] });
    expect(mockedInvoke).toHaveBeenLastCalledWith("save_ai_chat_attachment", {
      ...input,
      bytes: [1, 2, 3]
    });

    mockedInvoke.mockResolvedValueOnce([1, 2, 3]);
    await expect(attachments.read(input)).resolves.toEqual([1, 2, 3]);
    expect(mockedInvoke).toHaveBeenLastCalledWith("read_ai_chat_attachment", input);

    mockedInvoke.mockResolvedValueOnce(undefined);
    await attachments.deleteSession("session-1");
    expect(mockedInvoke).toHaveBeenLastCalledWith("delete_ai_chat_attachment_session", {
      sessionId: "session-1"
    });
  });
});
