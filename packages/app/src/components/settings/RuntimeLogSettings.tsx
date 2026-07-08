import { Clipboard, FolderOpen, ScrollText, Trash2 } from "lucide-react";
import {
  formatRuntimeLogEntries,
  type RuntimeLogEntry
} from "../../lib/runtime-log";
import {
  SettingsButton,
  SettingsCallout,
  SettingsSection
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

export function RuntimeLogSettings({
  entries,
  onClearLogs,
  onCopyLogs,
  onOpenLogFolder,
  translate
}: {
  entries: readonly RuntimeLogEntry[];
  onClearLogs: () => unknown;
  onCopyLogs: (contents: string) => unknown;
  onOpenLogFolder?: () => unknown;
  translate: SettingsTranslate;
}) {
  const hasEntries = entries.length > 0;
  const formattedEntries = formatRuntimeLogEntries(entries);
  const formattedEntryRows = formattedEntries ? formattedEntries.split("\n") : [];

  return (
    <SettingsSection
      label={translate("settings.categories.logs")}
      intro={
        <SettingsCallout
          title={translate("settings.logs.summaryTitle")}
          description={translate("settings.logs.summaryDescription")}
          icon={ScrollText}
        />
      }
    >
      <div className="settings-row block min-h-0 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {onOpenLogFolder ? (
            <SettingsButton
              label={translate("settings.logs.openFolder")}
              onClick={onOpenLogFolder}
            >
              <FolderOpen aria-hidden="true" size={13} />
              {translate("settings.logs.openFolder")}
            </SettingsButton>
          ) : null}
          <SettingsButton
            disabled={!hasEntries}
            label={translate("settings.logs.copy")}
            onClick={() => onCopyLogs(formattedEntries)}
          >
            <Clipboard aria-hidden="true" size={13} />
            {translate("settings.logs.copy")}
          </SettingsButton>
          <SettingsButton
            disabled={!hasEntries}
            label={translate("settings.logs.clear")}
            onClick={onClearLogs}
          >
            <Trash2 aria-hidden="true" size={13} />
            {translate("settings.logs.clear")}
          </SettingsButton>
        </div>
        {hasEntries ? (
          <ol
            className="m-0 max-h-[420px] list-none space-y-1 overflow-auto rounded-md border border-(--border-default) bg-(--bg-secondary) px-3 py-3 font-mono text-[12px] leading-5 text-(--text-heading)"
            role="log"
            aria-label={translate("settings.logs.entries")}
          >
            {formattedEntryRows.map((entry, index) => (
              <li
                className="w-max min-w-full whitespace-pre rounded-sm px-1 py-0.5"
                key={`${index}-${entry}`}
                title={entry}
              >
                {entry}
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 rounded-md border border-dashed border-(--border-default) bg-(--bg-secondary) px-3 py-8 text-center text-[12px] leading-5 font-[450] text-(--text-secondary)">
            {translate("settings.logs.empty")}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
