import { getAppRuntime } from "../runtime";

export type DesktopPlatform = "macos" | "windows" | "linux";

export const macosWebKitScrollWorkaroundAttribute = "macos-27";

export function normalizeDesktopPlatform(platform: string | null | undefined): DesktopPlatform | null {
  if (platform === "windows" || platform === "macos" || platform === "linux") {
    return platform;
  }

  return null;
}

function resolveBrowserDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "macos";
  }

  const userAgentDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  const platform = userAgentDataPlatform ?? navigator.platform;

  if (/win/i.test(platform)) {
    return "windows";
  }

  if (/linux/i.test(platform)) {
    return "linux";
  }

  return "macos";
}

export function resolveDesktopPlatform(): DesktopPlatform {
  return getAppRuntime().platform.resolveDesktopPlatform() ?? resolveBrowserDesktopPlatform();
}

export function resolveDesktopOsVersion() {
  return getAppRuntime().platform.resolveDesktopOsVersion();
}

export function webKitScrollWorkaroundForPlatform(platform: DesktopPlatform | null, osVersion: string | null) {
  if (platform !== "macos" || !osVersion) return null;

  return /^27(?:\.|$)/u.test(osVersion.trim()) ? macosWebKitScrollWorkaroundAttribute : null;
}
