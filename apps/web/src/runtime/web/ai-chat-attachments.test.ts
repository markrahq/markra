import type { AppAiChatAttachmentRuntime } from "@markra/app/runtime";
import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import { createWebRuntime } from "../index";

describe("web AI chat attachments", () => {
  it("persists attachment bytes and deletes only the selected session", async () => {
    const runtime = createWebRuntime({
      databaseName: "markra-web-attachment-test",
      indexedDB: new FakeIndexedDbFactory().indexedDB
    });

    expect(runtime).toHaveProperty("aiChatAttachments.save", expect.any(Function));
    expect(runtime).toHaveProperty("aiChatAttachments.read", expect.any(Function));
    expect(runtime).toHaveProperty("aiChatAttachments.deleteSession", expect.any(Function));

    const attachments = Reflect.get(runtime, "aiChatAttachments") as AppAiChatAttachmentRuntime;
    const first = {
      attachmentId: "attachment-1",
      bytes: [1, 2, 3],
      mimeType: "image/png" as const,
      sessionId: "session-1"
    };
    const second = {
      attachmentId: "attachment-2",
      bytes: [4, 5, 6],
      mimeType: "image/webp" as const,
      sessionId: "session-2"
    };

    await attachments.save(first);
    await attachments.save(second);
    await expect(attachments.read(first)).resolves.toEqual(first.bytes);
    await expect(attachments.read(second)).resolves.toEqual(second.bytes);

    await attachments.deleteSession("session-1");

    await expect(attachments.read(first)).rejects.toThrow("AI chat attachment was not found");
    await expect(attachments.read(second)).resolves.toEqual(second.bytes);
  });
});
