import { AlertTriangle, Code2 } from "lucide-react";
import { t, type AppLanguage } from "@markra/shared";

type LargeMarkdownNoticeProps = {
  language?: AppLanguage;
  onOpenSourceMode?: () => unknown;
};

export function LargeMarkdownNotice({
  language = "en",
  onOpenSourceMode
}: LargeMarkdownNoticeProps) {
  const title = t(language, "app.largeMarkdownNoticeTitle");

  return (
    <section
      aria-label={title}
      className="flex h-full min-h-screen items-center justify-center bg-(--bg-primary) px-6 py-16 text-center"
      data-editor-engine="large-markdown-notice"
    >
      <div className="flex max-w-110 flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-(--bg-secondary) text-(--text-secondary)"
        >
          <AlertTriangle size={24} strokeWidth={2.2} />
        </span>
        <div className="space-y-2">
          <h2 className="text-[18px] leading-7 font-[720] text-(--text-heading)">
            {title}
          </h2>
          <p className="text-[13px] leading-6 font-[520] text-(--text-secondary)">
            {t(language, "app.largeMarkdownNoticeBody")}
          </p>
        </div>
        {onOpenSourceMode ? (
          <button
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[13px] leading-5 font-[650] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            type="button"
            onClick={onOpenSourceMode}
          >
            <Code2 aria-hidden="true" size={15} strokeWidth={2.2} />
            {t(language, "app.largeMarkdownNoticeSourceAction")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
