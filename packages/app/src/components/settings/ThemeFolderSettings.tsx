import { FolderOpen, RefreshCw } from "lucide-react";
import type { useThemeFiles } from "../../hooks/useThemeFiles";
import { SettingsButton, SettingsRow, SettingsSelect } from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

type ThemeFiles = ReturnType<typeof useThemeFiles>;

export function ThemeFolderSettings({ themeFiles, translate }: {
  themeFiles: ThemeFiles;
  translate: SettingsTranslate;
}) {
  return (
    <>
      <SettingsRow
        title={translate("settings.theme.folderTitle")}
        description={translate("settings.theme.folderDescription")}
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            <SettingsButton label={translate("settings.theme.openFolder")} onClick={themeFiles.openFolder}>
              <FolderOpen aria-hidden="true" size={13} />
              {translate("settings.theme.openFolder")}
            </SettingsButton>
            <SettingsButton label={translate("settings.theme.refreshFiles")} disabled={themeFiles.loading} onClick={themeFiles.refresh}>
              <RefreshCw aria-hidden="true" size={13} />
              {translate(themeFiles.loading ? "settings.theme.loadingFiles" : "settings.theme.refreshFiles")}
            </SettingsButton>
          </div>
        }
      />
      {themeFiles.error ? (
        <p role="alert" className="my-2 text-[13px] leading-5 text-(--danger)">
          {translate("settings.theme.filesError")}
        </p>
      ) : null}
      {themeFiles.failedFiles.length > 0 ? (
        <p role="status" className="my-2 text-[13px] leading-5 wrap-anywhere text-(--text-secondary)">
          {translate("settings.theme.fileFallback")} {themeFiles.failedFiles.join(", ")}
        </p>
      ) : null}
    </>
  );
}

export function ThemeFileSelect({ appearance, themeFiles, translate }: {
  appearance: "light" | "dark";
  themeFiles: ThemeFiles;
  translate: SettingsTranslate;
}) {
  const selected = themeFiles.selection[appearance];
  const files = selected && !themeFiles.files.includes(selected) ? [selected, ...themeFiles.files] : themeFiles.files;
  return (
    <fieldset
      disabled={themeFiles.loading}
      title={selected ?? undefined}
      className="m-0 mb-3 min-w-0 border-0 p-0 disabled:opacity-60 [&>div]:max-w-full [&_select]:max-w-full [&_select]:truncate"
    >
      <SettingsSelect
        label={translate(appearance === "light" ? "settings.theme.lightSource" : "settings.theme.darkSource")}
        value={selected ?? ""}
        options={[
          { label: translate("settings.theme.inlineSource"), value: "" },
          ...files.map((name) => ({ label: name, value: name }))
        ]}
        onChange={(value) => themeFiles.select(appearance, value || null)}
      />
    </fieldset>
  );
}
