import { appLogger, configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "./index";

describe("app runtime logging", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("connects the app logger to the configured runtime log backend", () => {
    const defaultRuntime = createDefaultAppRuntime();
    const writeLog = vi.fn();

    configureAppRuntime({
      ...defaultRuntime,
      logs: {
        isAvailable: () => true,
        openLogFolder: async () => undefined,
        writeLog
      }
    });

    appLogger.info("system", "Runtime logging configured", { operation: "test" });

    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({
      area: "system",
      details: {
        operation: "test"
      },
      level: "info",
      message: "Runtime logging configured"
    }));
  });

  it("exposes an unavailable AI chat attachment runtime by default", async () => {
    const defaultRuntime = createDefaultAppRuntime();

    expect(defaultRuntime).toHaveProperty("aiChatAttachments.save", expect.any(Function));
    expect(defaultRuntime).toHaveProperty("aiChatAttachments.read", expect.any(Function));
    expect(defaultRuntime).toHaveProperty("aiChatAttachments.deleteSession", expect.any(Function));

    const attachments = Reflect.get(defaultRuntime, "aiChatAttachments") as {
      deleteSession: (sessionId: string) => Promise<unknown>;
      read: (input: unknown) => Promise<unknown>;
      save: (input: unknown) => Promise<unknown>;
    };

    await expect(attachments.save({})).rejects.toThrow("saveAiChatAttachment is unavailable");
    await expect(attachments.read({})).rejects.toThrow("readAiChatAttachment is unavailable");
    await expect(attachments.deleteSession("session-1")).rejects.toThrow("deleteAiChatAttachmentSession is unavailable");
  });
});
