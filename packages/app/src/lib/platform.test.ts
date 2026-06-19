import { afterEach, describe, expect, it } from "vitest";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import {
  macosWebKitScrollWorkaroundAttribute,
  resolveDesktopPlatform,
  webKitScrollWorkaroundForPlatform
} from "./platform";

const originalNavigatorPlatform = navigator.platform;

function setNavigatorPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform
  });
}

describe("resolveDesktopPlatform", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
    setNavigatorPlatform(originalNavigatorPlatform);
  });

  it("uses the configured runtime platform when available", () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      platform: {
        resolveDesktopOsVersion: () => null,
        resolveDesktopPlatform: () => "windows"
      }
    });

    expect(resolveDesktopPlatform()).toBe("windows");
  });

  it("falls back to the browser platform when the runtime platform is unavailable", () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      platform: {
        resolveDesktopOsVersion: () => null,
        resolveDesktopPlatform: () => null
      }
    });
    setNavigatorPlatform("MacIntel");

    expect(resolveDesktopPlatform()).toBe("macos");
  });
});

describe("webKitScrollWorkaroundForPlatform", () => {
  it("enables the macOS 27 WebKit scrolling workaround", () => {
    expect(webKitScrollWorkaroundForPlatform("macos", "27.0")).toBe(macosWebKitScrollWorkaroundAttribute);
    expect(webKitScrollWorkaroundForPlatform("macos", "27.1.2")).toBe(macosWebKitScrollWorkaroundAttribute);
  });

  it("leaves other platforms and macOS releases untouched", () => {
    expect(webKitScrollWorkaroundForPlatform("macos", "26.6")).toBeNull();
    expect(webKitScrollWorkaroundForPlatform("windows", "27.0")).toBeNull();
    expect(webKitScrollWorkaroundForPlatform("linux", "27.0")).toBeNull();
    expect(webKitScrollWorkaroundForPlatform(null, "27.0")).toBeNull();
    expect(webKitScrollWorkaroundForPlatform("macos", null)).toBeNull();
  });
});
