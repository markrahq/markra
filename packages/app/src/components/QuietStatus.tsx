import { t, type AppLanguage } from "@markra/shared";

type QuietStatusProps = {
  backupLabel?: string | null;
  dirty: boolean;
  language?: AppLanguage;
  readOnly?: boolean;
  selectedWordCount?: number | null;
  showWordCount?: boolean;
  syncLabel?: string | null;
  wordCount: number;
};

export function QuietStatus({
  backupLabel = null,
  dirty,
  language = "en",
  readOnly = false,
  selectedWordCount = null,
  showWordCount = true,
  syncLabel = null,
  wordCount
}: QuietStatusProps) {
  const label = (key: Parameters<typeof t>[1]) => t(language, key);
  const wordCountText = `${selectedWordCount ?? wordCount}`;

  return (
    <footer
      className="quiet-status pointer-events-none absolute right-4.5 bottom-3 flex justify-end gap-2.5 text-[12px] leading-5 text-(--text-secondary) opacity-[0.68]"
      aria-label={label("app.documentStatus")}
    >
      {showWordCount ? (
        <span>
          {wordCountText} {label("app.words")}
        </span>
      ) : null}
      {backupLabel ? <span>{backupLabel}</span> : null}
      {syncLabel ? <span>{syncLabel}</span> : null}
      {readOnly ? <span>{label("app.readOnly")}</span> : null}
      <span>{dirty ? label("app.unsaved") : label("app.saved")}</span>
    </footer>
  );
}
