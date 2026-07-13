import * as nativeFiles from "../lib/tauri/file";
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

describe("app file runtime workspace export contract", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("uses unavailable defaults outside a configured file runtime", async () => {
    const files = createDefaultAppRuntime().files;

    expect(files.canExportMarkdownFolder("web-workspace://default")).toBe(false);
    await expect(files.exportMarkdownFolder("web-workspace://default")).resolves.toBeNull();
    await expect(files.getDefaultMarkdownFolder()).resolves.toBeNull();
  });

  it("forwards the workspace export bridge to the configured file runtime", async () => {
    const runtime = createDefaultAppRuntime();
    const archive = { name: "notes.zip", path: "web-download://notes.zip" };
    const canExportMarkdownFolder = vi.fn(() => true);
    const exportMarkdownFolder = vi.fn(async () => archive);
    const getDefaultMarkdownFolder = vi.fn(async () => ({
      name: "Workspace",
      path: "web-workspace://default"
    }));
    configureAppRuntime({
      ...runtime,
      files: {
        ...runtime.files,
        canExportMarkdownFolder,
        exportMarkdownFolder,
        getDefaultMarkdownFolder
      }
    });

    const getDefault = Reflect.get(nativeFiles, "getNativeDefaultMarkdownFolder") as
      (() => Promise<unknown>) | undefined;
    const canExport = Reflect.get(nativeFiles, "canExportNativeMarkdownFolder") as
      ((path: string) => boolean) | undefined;
    const exportFolder = Reflect.get(nativeFiles, "exportNativeMarkdownFolder") as
      ((path: string) => Promise<unknown>) | undefined;

    expect(getDefault).toEqual(expect.any(Function));
    expect(canExport).toEqual(expect.any(Function));
    expect(exportFolder).toEqual(expect.any(Function));
    await expect(getDefault!()).resolves.toEqual({
      name: "Workspace",
      path: "web-workspace://default"
    });
    expect(canExport!("web-workspace://default/notes")).toBe(true);
    await expect(exportFolder!("web-workspace://default/notes")).resolves.toEqual(archive);
  });
});
