import {
  appLogLevelOptions,
  appLogLevelAllows,
  defaultAppLogLevel,
  normalizeAppLogLevel
} from "./log-level";

describe("app log level", () => {
  it("supports debug, info, warn, and error in verbosity order", () => {
    expect(appLogLevelOptions).toEqual(["debug", "info", "warn", "error"]);
    expect(defaultAppLogLevel).toBe("info");
    expect(appLogLevelAllows("debug", "debug")).toBe(true);
    expect(appLogLevelAllows("info", "debug")).toBe(true);
    expect(appLogLevelAllows("info", "info")).toBe(true);
    expect(appLogLevelAllows("info", "warn")).toBe(false);
    expect(appLogLevelAllows("warn", "error")).toBe(false);
    expect(appLogLevelAllows("error", "error")).toBe(true);
  });

  it("normalizes invalid values to the compatible info default", () => {
    expect(normalizeAppLogLevel("debug")).toBe("debug");
    expect(normalizeAppLogLevel("trace")).toBe("info");
    expect(normalizeAppLogLevel(null)).toBe("info");
  });
});
