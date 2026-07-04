import { Component, type ErrorInfo, type ReactNode } from "react";
import { isAppLanguage, t, type AppLanguage } from "@markra/shared";
import { appVersion } from "../lib/app-version";
import {
  generateCrashDiagnosticsReport,
  generateDiagnosticsIssueUrl
} from "../lib/diagnostics/diagnostics-report";
import { resolveDesktopOsVersion, resolveDesktopPlatform } from "../lib/platform";
import { openNativeExternalUrl } from "../lib/tauri";

type AppErrorBoundaryState = {
  componentStack: string | null;
  error: unknown;
  statusMessage: string | null;
};

async function writeClipboardText(text: string) {
  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
  const writeText = clipboard?.writeText;
  if (typeof writeText !== "function") throw new Error("Clipboard write is unavailable.");

  await writeText.call(clipboard, text);
}

function currentAppLanguage(): AppLanguage {
  const documentLanguage = typeof document === "undefined" ? null : document.documentElement.lang;

  return isAppLanguage(documentLanguage) ? documentLanguage : "en";
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    componentStack: null,
    error: null,
    statusMessage: null
  };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return {
      error,
      statusMessage: null
    };
  }

  componentDidCatch(_error: unknown, errorInfo: ErrorInfo) {
    this.setState({
      componentStack: errorInfo.componentStack ?? null
    });
  }

  createReport() {
    const language = currentAppLanguage();

    return generateCrashDiagnosticsReport({
      appVersion,
      componentStack: this.state.componentStack,
      error: this.state.error,
      generatedAt: new Date(),
      language,
      osVersion: resolveDesktopOsVersion(),
      platform: resolveDesktopPlatform()
    });
  }

  handleOpenIssue = async () => {
    const language = currentAppLanguage();

    try {
      await openNativeExternalUrl(generateDiagnosticsIssueUrl(this.createReport(), { title: "Crash report" }));
    } catch {
      this.setState({
        statusMessage: t(language, "app.errorBoundary.issueFailed")
      });
    }
  };

  handleCopyDiagnostics = async () => {
    const language = currentAppLanguage();

    try {
      await writeClipboardText(this.createReport());
      this.setState({
        statusMessage: t(language, "app.errorBoundary.copySucceeded")
      });
    } catch {
      this.setState({
        statusMessage: t(language, "app.errorBoundary.copyFailed")
      });
    }
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const language = currentAppLanguage();

    return (
      <main className="flex min-h-screen items-center justify-center bg-(--bg-primary) px-6 py-8 text-(--text-primary)">
        <section
          className="w-full max-w-xl rounded-md border border-(--border-default) bg-(--bg-primary) p-6 shadow-[0_14px_34px_rgba(15,23,42,0.14)]"
          aria-labelledby="app-error-boundary-title"
        >
          <h1
            className="m-0 text-[20px] leading-7 font-bold tracking-normal text-(--text-heading)"
            id="app-error-boundary-title"
          >
            {t(language, "app.errorBoundary.title")}
          </h1>
          <p className="m-0 mt-2 text-[13px] leading-5 font-[450] text-(--text-secondary)">
            {t(language, "app.errorBoundary.description")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-(--accent) bg-(--accent) px-3 text-[12px] leading-5 font-[700] text-(--bg-primary) transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              type="button"
              onClick={this.handleOpenIssue}
            >
              {t(language, "app.errorBoundary.submitIssue")}
            </button>
            <button
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              type="button"
              onClick={this.handleCopyDiagnostics}
            >
              {t(language, "app.errorBoundary.copyDiagnostics")}
            </button>
            <button
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              type="button"
              onClick={this.handleReload}
            >
              {t(language, "app.errorBoundary.reload")}
            </button>
          </div>
          {this.state.statusMessage ? (
            <p className="m-0 mt-4 text-[12px] leading-5 font-[600] text-(--text-secondary)" role="status">
              {this.state.statusMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }
}
