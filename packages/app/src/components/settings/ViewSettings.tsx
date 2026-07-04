import { type I18nKey } from "@markra/shared";
import { type EditorPreferences } from "../../lib/settings/app-settings";
import {
  resolveViewModeChrome,
  viewModeOptions,
  type ViewMode,
  type ViewModeChrome,
  type ViewModeCustomizations
} from "../../lib/view-mode";
import {
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

const viewModeSelectOptions: Array<{
  labelKey: I18nKey;
  value: ViewMode;
}> = viewModeOptions.map((value) => ({
  labelKey: `settings.editor.viewMode.${value}` as I18nKey,
  value
}));

type ViewModeElementKey = keyof ViewModeChrome & keyof ViewModeCustomizations;

type ViewModeCustomizationOption = {
  key: ViewModeElementKey;
  labelKey: I18nKey;
};

const viewModeCustomizationGroups: Array<{
  key: string;
  labelKey: I18nKey;
  options: ViewModeCustomizationOption[];
}> = [
  {
    key: "sidebar",
    labelKey: "settings.editor.viewMode.group.sidebar",
    options: [
      {
        key: "recentFolders",
        labelKey: "settings.editor.viewMode.recentFolders"
      },
      {
        key: "fileList",
        labelKey: "settings.editor.viewMode.fileList"
      },
      {
        key: "outline",
        labelKey: "settings.editor.viewMode.outline"
      },
      {
        key: "documentLinks",
        labelKey: "app.documentLinks"
      }
    ]
  },
  {
    key: "titlebar",
    labelKey: "settings.editor.viewMode.group.titlebar",
    options: [
      {
        key: "fileTreeButton",
        labelKey: "settings.editor.viewMode.fileTreeButton"
      },
      {
        key: "openButton",
        labelKey: "settings.editor.viewMode.openButton"
      },
      {
        key: "quickCreateButton",
        labelKey: "settings.editor.viewMode.quickCreateButton"
      },
      {
        key: "documentTabs",
        labelKey: "settings.editor.viewMode.documentTabs"
      },
      {
        key: "titlebarActions",
        labelKey: "settings.editor.viewMode.titlebarActions"
      }
    ]
  },
  {
    key: "workspace",
    labelKey: "settings.editor.viewMode.group.workspace",
    options: [
      {
        key: "aiPanel",
        labelKey: "settings.editor.viewMode.aiPanel"
      },
      {
        key: "statusBar",
        labelKey: "settings.editor.viewMode.statusBar"
      },
      {
        key: "wordCount",
        labelKey: "settings.editor.showWordCount"
      }
    ]
  }
];

function ViewModeVisibilityList({
  chrome,
  onUpdatePreferences,
  preferences,
  translate
}: {
  chrome: ViewModeChrome;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const editable = preferences.viewMode === "custom";

  const updateGroupVisibility = (options: ViewModeCustomizationOption[], visible: boolean) => {
    const nextCustomizations = { ...preferences.viewModeCustomizations };

    options.forEach((option) => {
      nextCustomizations[option.key] = visible ? "visible" : "hidden";
    });

    onUpdatePreferences({
      ...preferences,
      viewModeCustomizations: nextCustomizations
    });
  };

  return (
    <div
      className="w-full space-y-4"
      role="list"
      aria-label={translate("settings.editor.viewModeStatus")}
    >
      {viewModeCustomizationGroups.map((group) => {
        const groupLabel = translate(group.labelKey);
        const groupVisible = group.options.some((option) => chrome[option.key]);

        return (
          <section
            className="border-t border-(--border-default) pt-3 first:border-t-0 first:pt-0"
            key={group.key}
            role="group"
            aria-label={groupLabel}
          >
            <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
              <p className="m-0 text-[12px] leading-5 font-[650] text-(--text-secondary)">
                {groupLabel}
              </p>
              {editable ? (
                <SettingsSwitch
                  checked={groupVisible}
                  label={groupLabel}
                  onChange={() => updateGroupVisibility(group.options, !groupVisible)}
                />
              ) : null}
            </div>
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-2">
              {group.options.map((option) => {
                const label = translate(option.labelKey);
                const visible = chrome[option.key];
                const stateLabel = translate(
                  visible ? "settings.editor.viewModeStatus.visible" : "settings.editor.viewModeStatus.hidden"
                );

                return (
                  <div
                    key={option.key}
                    role="listitem"
                    aria-label={`${label}: ${stateLabel}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-(--border-default) bg-(--bg-secondary) px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[12px] leading-5 font-[560] text-(--text-heading)">
                      {label}
                    </span>
                    {editable ? (
                      <SettingsSwitch
                        checked={visible}
                        label={label}
                        onChange={() =>
                          onUpdatePreferences({
                            ...preferences,
                            viewModeCustomizations: {
                              ...preferences.viewModeCustomizations,
                              [option.key]: visible ? "hidden" : "visible"
                            }
                          })
                        }
                      />
                    ) : (
                      <span
                        className={
                          visible
                            ? "shrink-0 rounded-full bg-(--accent-soft) px-2 py-0.5 text-[11px] leading-4 font-[650] text-(--accent)"
                            : "shrink-0 rounded-full border border-(--border-default) bg-(--bg-primary) px-2 py-0.5 text-[11px] leading-4 font-[650] text-(--text-secondary)"
                        }
                      >
                        {stateLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ViewSettings({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const viewModeChrome = resolveViewModeChrome(
    preferences.viewMode,
    preferences.viewModeCustomizations
  );

  return (
    <SettingsSection label={translate("settings.editor.viewMode")}>
      <SettingsRow
        title={translate("settings.editor.viewMode")}
        description={translate("settings.editor.viewModeDescription")}
        action={
          <SettingsSelect
            label={translate("settings.editor.viewMode")}
            value={preferences.viewMode}
            options={viewModeSelectOptions.map((option) => ({
              label: translate(option.labelKey),
              value: option.value
            }))}
            onChange={(value) =>
              onUpdatePreferences({
                ...preferences,
                viewMode: viewModeOptions.includes(value as ViewMode) ? value as ViewMode : "daily"
              })
            }
          />
        }
      />
      <div className="py-4">
        <ViewModeVisibilityList
          chrome={viewModeChrome}
          preferences={preferences}
          translate={translate}
          onUpdatePreferences={onUpdatePreferences}
        />
      </div>
    </SettingsSection>
  );
}
