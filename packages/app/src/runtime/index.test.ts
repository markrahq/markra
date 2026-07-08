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
});
