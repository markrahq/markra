import {
  createDefaultAppRuntime,
  type AppRuntime
} from "@markra/app/runtime";
import {
  createBrowserEventsRuntime,
  createIndexedDbSettingsRuntime,
  createWebAiRuntime,
  createWebDialogRuntime,
  createWebFileRuntime,
  createWebMenuRuntime,
  createWebResourceRuntime,
  createWebWindowRuntime,
  type WebRuntimeOptions
} from "./web";

export * from "./web";

export function createWebRuntime(options: WebRuntimeOptions = {}): AppRuntime {
  const defaultRuntime = createDefaultAppRuntime();
  const settings = createIndexedDbSettingsRuntime(options);

  return {
    ...defaultRuntime,
    ai: createWebAiRuntime(options),
    dialog: createWebDialogRuntime(options),
    events: createBrowserEventsRuntime(options.eventTarget),
    features: {
      ai: false,
      export: true,
      nativeWindowChrome: false,
      networkProxy: false,
      pandoc: false,
      s3ImageUpload: false,
      spellcheck: false,
      updater: false
    },
    files: createWebFileRuntime(settings, options),
    menu: createWebMenuRuntime(defaultRuntime.menu, options),
    platform: {
      resolveDesktopOsVersion: () => null,
      resolveDesktopPlatform: () => "windows"
    },
    settings,
    webResource: createWebResourceRuntime(options),
    window: createWebWindowRuntime(defaultRuntime.window, options)
  };
}
