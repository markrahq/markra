import { type CSSProperties } from "react";
import { Toaster } from "sonner";
import { t, type AppLanguage } from "@markra/shared";
import { appNoticeToasterId } from "../lib/app-toast";

const toasterStyle = { "--width": "fit-content", position: "fixed", width: "fit-content" } as CSSProperties;

export function AppToaster({ language }: { language: AppLanguage }) {
  return (
    <>
      <Toaster
        position="top-center"
        visibleToasts={1}
        offset={64}
        className="app-toaster"
        style={toasterStyle}
        containerAriaLabel={t(language, "app.notifications")}
        toastOptions={{
          closeButton: true,
          closeButtonAriaLabel: t(language, "app.closeToast"),
          unstyled: true,
          className:
            "app-toast app-toast-centered relative left-1/2 flex min-h-10 w-fit max-w-[min(var(--app-toast-max-width,28rem),calc(100vw-3rem))] -translate-x-1/2 items-start gap-2.5 rounded-md border border-(--border-default) bg-(--bg-primary) py-2 pr-9 pl-3 text-[12px] leading-5 font-[600] text-(--text-heading) shadow-[0_14px_34px_rgba(15,23,42,0.14)]",
          classNames: {
            actionButton:
              "shrink-0 cursor-pointer rounded border border-(--accent) bg-(--accent) px-2 py-1 text-[11px] leading-4 font-[700] text-(--bg-primary) transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
            description: "whitespace-normal break-words text-(--text-secondary) font-[500]",
            error: "app-toast-readable-error [--app-toast-max-width:32rem]",
            content: "min-w-0 flex-1",
            icon: "relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center self-start text-(--text-secondary)",
            title: "overflow-hidden text-ellipsis whitespace-nowrap",
            closeButton:
              "app-toast-close absolute top-2 right-2 inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-(--border-default) bg-(--bg-secondary) text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          }
        }}
      />
      <Toaster
        id={appNoticeToasterId}
        position="bottom-right"
        visibleToasts={2}
        offset={{ bottom: 24, right: 24 }}
        mobileOffset={{ bottom: 16, left: 16, right: 16 }}
        className="app-notice-toaster"
        style={toasterStyle}
        containerAriaLabel={t(language, "app.notifications")}
        toastOptions={{
          closeButton: true,
          closeButtonAriaLabel: t(language, "app.closeToast"),
          unstyled: true,
          className:
            "app-toast app-toast-notice relative flex min-h-10 w-[min(23rem,calc(100vw-1.5rem))] max-w-[min(23rem,calc(100vw-1.5rem))] items-start gap-2.5 rounded-md border border-(--border-default) bg-(--bg-primary) py-2.5 pr-8 pl-3 text-[12px] leading-5 font-[600] text-(--text-heading) shadow-[0_2px_6px_rgba(15,23,42,0.08)]",
          classNames: {
            actionButton:
              "shrink-0 cursor-pointer rounded border border-(--accent) bg-(--accent) px-2 py-1 text-[11px] leading-4 font-[700] text-(--bg-primary) transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
            description: "whitespace-normal break-words text-(--text-secondary) font-[500]",
            error: "app-toast-readable-error",
            content: "min-w-0 flex-1",
            icon: "relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center self-start text-(--text-secondary)",
            title: "whitespace-normal break-words",
            closeButton:
              "app-toast-close absolute top-2 right-2 inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          }
        }}
      />
    </>
  );
}
