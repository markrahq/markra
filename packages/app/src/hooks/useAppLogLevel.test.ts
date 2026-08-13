import { act, renderHook, waitFor } from "@testing-library/react";
import { getAppLogLevel, resetAppLogLevelForTests } from "../lib/app-logger";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import { useAppLogLevel } from "./useAppLogLevel";

describe("useAppLogLevel", () => {
  const values = new Map<string, unknown>([["logLevel", "warn"]]);
  const emit = vi.fn(async () => undefined);
  const listen = vi.fn(async () => () => undefined);
  const save = vi.fn(async () => undefined);
  const set = vi.fn(async (key: string, value: unknown) => {
    values.set(key, value);
  });

  beforeEach(() => {
    values.set("logLevel", "warn");
    emit.mockClear();
    listen.mockClear();
    save.mockClear();
    set.mockClear();
    resetAppLogLevelForTests();
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      events: {
        emit,
        isAvailable: () => true,
        listen
      },
      settings: {
        async loadStore() {
          return {
            async delete(key: string) {
              values.delete(key);
            },
            async get<T>(key: string) {
              return values.get(key) as T | undefined;
            },
            save,
            set
          };
        }
      }
    });
  });

  afterEach(() => {
    resetAppLogLevelForTests();
    resetAppRuntimeForTests();
  });

  it("applies the stored level and persists user selections", async () => {
    const { result } = renderHook(() => useAppLogLevel());

    await waitFor(() => {
      expect(result.current.level).toBe("warn");
    });
    expect(getAppLogLevel()).toBe("warn");

    act(() => {
      result.current.selectLevel("error");
    });

    expect(result.current.level).toBe("error");
    expect(getAppLogLevel()).toBe("error");
    await waitFor(() => {
      expect(set).toHaveBeenCalledWith("logLevel", "error");
      expect(save).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith("markra://log-level-changed", { level: "error" });
    });
  });
});
