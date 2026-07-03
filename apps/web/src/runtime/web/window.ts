import type {
  AppWindowRuntime,
  NativeSettingsWindowTarget,
  RuntimeCleanup
} from "@markra/app/runtime";
import type { WebRuntimeOptions } from "./types";

const settingsWindowTargetEvent = "markra://settings-window-target";

type SettingsWindowTargetEventDetail = {
  target?: NativeSettingsWindowTarget;
};

function isSettingsWindowTarget(value: unknown): value is NativeSettingsWindowTarget {
  return value === "exportPandocPath";
}

function resolveBrowserWindow(options: WebRuntimeOptions): Window | null {
  return options.document?.defaultView ?? (typeof window === "undefined" ? null : window);
}

function createSettingsRouteUrl(windowTarget: Window, target?: NativeSettingsWindowTarget) {
  const url = new URL(windowTarget.location.href);
  url.searchParams.set("settings", "1");

  if (target) {
    url.searchParams.set("settingsTarget", target);
  } else {
    url.searchParams.delete("settingsTarget");
  }

  return url;
}

function createEditorRouteUrl(windowTarget: Window) {
  const url = new URL(windowTarget.location.href);
  url.searchParams.delete("settings");
  url.searchParams.delete("settingsTarget");

  return url;
}

function dispatchBrowserRouteChange(windowTarget: Window) {
  const event = typeof PopStateEvent === "function"
    ? new PopStateEvent("popstate", { state: windowTarget.history.state })
    : new Event("popstate");

  windowTarget.dispatchEvent(event);
}

function dispatchSettingsWindowTarget(eventTarget: EventTarget, target: NativeSettingsWindowTarget) {
  eventTarget.dispatchEvent(new CustomEvent<SettingsWindowTargetEventDetail>(settingsWindowTargetEvent, {
    detail: { target }
  }));
}

async function listenWebSettingsWindowTarget(
  eventTarget: EventTarget | null,
  onTarget: (target: NativeSettingsWindowTarget) => unknown
): Promise<RuntimeCleanup> {
  if (!eventTarget) return () => undefined;

  const handleTarget = (event: Event) => {
    const detail = "detail" in event
      ? (event as CustomEvent<{ target?: unknown }>).detail
      : null;

    if (isSettingsWindowTarget(detail?.target)) {
      onTarget(detail.target);
    }
  };

  eventTarget.addEventListener(settingsWindowTargetEvent, handleTarget);

  return () => {
    eventTarget.removeEventListener(settingsWindowTargetEvent, handleTarget);
  };
}

export function createWebWindowRuntime(
  defaultWindowRuntime: AppWindowRuntime,
  options: WebRuntimeOptions
): AppWindowRuntime {
  const openExternalUrl = options.openExternalUrl ?? ((url: string) => {
    globalThis.open?.(url, "_blank", "noopener,noreferrer");
  });

  return {
    ...defaultWindowRuntime,
    closeWindow: async () => {
      const windowTarget = resolveBrowserWindow(options);
      if (!windowTarget) return;

      windowTarget.close();
      if (windowTarget.closed) return;

      if (new URLSearchParams(windowTarget.location.search).has("settings")) {
        windowTarget.history.pushState({}, "", createEditorRouteUrl(windowTarget));
        dispatchBrowserRouteChange(windowTarget);
      }
    },
    destroyWindow: async () => {
      const windowTarget = resolveBrowserWindow(options);
      if (!windowTarget) return;

      windowTarget.close();
      if (windowTarget.closed) return;

      if (new URLSearchParams(windowTarget.location.search).has("settings")) {
        windowTarget.history.pushState({}, "", createEditorRouteUrl(windowTarget));
        dispatchBrowserRouteChange(windowTarget);
      }
    },
    listenSettingsWindowTarget: (onTarget) =>
      listenWebSettingsWindowTarget(options.eventTarget ?? resolveBrowserWindow(options), onTarget),
    openExternalUrl: async (url) => {
      await openExternalUrl(url);
    },
    openSettingsWindow: async (target) => {
      const windowTarget = resolveBrowserWindow(options);
      if (!windowTarget) return;

      const routeUrl = createSettingsRouteUrl(windowTarget, target);
      windowTarget.history.pushState({}, "", routeUrl);
      dispatchBrowserRouteChange(windowTarget);

      if (target) {
        dispatchSettingsWindowTarget(options.eventTarget ?? windowTarget, target);
      }
    },
    setWindowTitle: async (title) => {
      const documentTarget = options.document ?? globalThis.document;
      if (documentTarget) {
        documentTarget.title = title;
      }
    }
  };
}
