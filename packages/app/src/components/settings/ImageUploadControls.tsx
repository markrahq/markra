import {
  Cloud,
  Database,
  HardDrive,
  Server,
  type LucideIcon
} from "lucide-react";
import { SegmentedControl, SegmentedControlItem } from "@markra/ui";
import type { I18nKey } from "@markra/shared";
import type { ImageUploadProvider } from "../../lib/settings/app-settings";
import type { SettingsTranslate } from "./translate";

const imageUploadProviderOptions: Array<{
  actionLabelKey: I18nKey;
  icon: LucideIcon;
  labelKey: I18nKey;
  value: ImageUploadProvider;
}> = [
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useLocal",
    icon: HardDrive,
    labelKey: "settings.editor.imageUploadProvider.local",
    value: "local"
  },
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useWebDav",
    icon: Cloud,
    labelKey: "settings.editor.imageUploadProvider.webdav",
    value: "webdav"
  },
  {
    actionLabelKey: "settings.editor.imageUploadProvider.usePicGo",
    icon: Server,
    labelKey: "settings.editor.imageUploadProvider.picgo",
    value: "picgo"
  },
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useS3",
    icon: Database,
    labelKey: "settings.editor.imageUploadProvider.s3",
    value: "s3"
  }
];

const imageUploadProviderSettingsActionLabelKeys: Record<ImageUploadProvider, I18nKey> = {
  local: "settings.editor.imageUploadProvider.showLocalSettings",
  picgo: "settings.editor.imageUploadProvider.showPicGoSettings",
  s3: "settings.editor.imageUploadProvider.showS3Settings",
  webdav: "settings.editor.imageUploadProvider.showWebDavSettings"
};

function availableImageUploadProviderOptions(s3ImageUploadEnabled: boolean) {
  return imageUploadProviderOptions.filter((option) => option.value !== "s3" || s3ImageUploadEnabled);
}

export function availableImageUploadProvider(
  provider: ImageUploadProvider,
  s3ImageUploadEnabled: boolean
): ImageUploadProvider {
  return availableImageUploadProviderOptions(s3ImageUploadEnabled).some((option) => option.value === provider)
    ? provider
    : "local";
}

function imageUploadProviderGridClass(optionCount: number) {
  if (optionCount >= 4) return "grid-cols-4";
  if (optionCount === 3) return "grid-cols-3";

  return "grid-cols-2";
}

export function ImageUploadProviderControl({
  onSelectProvider,
  provider,
  s3ImageUploadEnabled = true,
  translate
}: {
  onSelectProvider: (provider: ImageUploadProvider) => unknown;
  provider: ImageUploadProvider;
  s3ImageUploadEnabled?: boolean;
  translate: SettingsTranslate;
}) {
  const options = availableImageUploadProviderOptions(s3ImageUploadEnabled);
  const visibleProvider = availableImageUploadProvider(provider, s3ImageUploadEnabled);

  return (
    <SegmentedControl className={imageUploadProviderGridClass(options.length)} label={translate("settings.editor.imageUploadProvider")}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = visibleProvider === option.value;

        return (
          <SegmentedControlItem
            key={option.value}
            label={translate(option.actionLabelKey)}
            selected={active}
            onClick={() => onSelectProvider(option.value)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(option.labelKey)}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}

export function ImageUploadProviderSettingsControl({
  onSelectProvider,
  provider,
  s3ImageUploadEnabled = true,
  translate
}: {
  onSelectProvider: (provider: ImageUploadProvider) => unknown;
  provider: ImageUploadProvider;
  s3ImageUploadEnabled?: boolean;
  translate: SettingsTranslate;
}) {
  const options = availableImageUploadProviderOptions(s3ImageUploadEnabled);
  const visibleProvider = availableImageUploadProvider(provider, s3ImageUploadEnabled);

  return (
    <SegmentedControl className={imageUploadProviderGridClass(options.length)} label={translate("settings.editor.imageUploadProviderSettings")}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = visibleProvider === option.value;

        return (
          <SegmentedControlItem
            key={option.value}
            label={translate(imageUploadProviderSettingsActionLabelKeys[option.value])}
            selected={active}
            onClick={() => onSelectProvider(option.value)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(option.labelKey)}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}
