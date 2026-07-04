import type { ReactNode } from "react";
import { toast, type ExternalToast } from "sonner";

export type AppToastStatus = "error" | "loading" | "success";
export type AppToastSurface = "notice" | "toast";
export type AppToastAction = ExternalToast["action"];

export const defaultAppToastId = "app-toast";
export const appNoticeToasterId = "app-notice-toaster";

export function showAppToast({
  action,
  description,
  duration,
  id = defaultAppToastId,
  message,
  status,
  surface = "toast"
}: {
  action?: AppToastAction;
  description?: ExternalToast["description"];
  duration?: ExternalToast["duration"];
  id?: string;
  message: ReactNode;
  status: AppToastStatus;
  surface?: AppToastSurface;
}) {
  const options: ExternalToast = {
    ...(action ? { action } : {}),
    ...(description ? { description } : {}),
    duration: duration ?? (status === "success" ? 4500 : Infinity),
    id,
    ...(surface === "notice"
      ? {
          position: "bottom-right" as const,
          toasterId: appNoticeToasterId
        }
      : {})
  };

  if (status === "error") {
    toast.error(message, options);
    return;
  }

  if (status === "loading") {
    toast.loading(message, options);
    return;
  }

  toast.success(message, options);
}

export function dismissAppToast(id = defaultAppToastId) {
  toast.dismiss(id);
}
