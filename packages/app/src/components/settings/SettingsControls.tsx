import type { LucideIcon } from "lucide-react";
import {
  SettingsCallout as UiSettingsCallout,
  type SettingsCalloutProps as UiSettingsCalloutProps
} from "@markra/ui/settings";

export {
  SettingsButton,
  SettingsCheckbox,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextarea,
  SettingsTextInput,
  type SettingsButtonProps,
  type SettingsCheckboxProps,
  type SettingsNumberInputProps,
  type SettingsRowProps,
  type SettingsSectionProps,
  type SettingsSelectOption,
  type SettingsSelectProps,
  type SettingsSwitchProps,
  type SettingsTextareaProps,
  type SettingsTextInputProps
} from "@markra/ui/settings";

export type AppSettingsCalloutProps = Omit<UiSettingsCalloutProps, "icon"> & {
  icon: LucideIcon;
};

export type SettingsCalloutProps = AppSettingsCalloutProps;

export function SettingsCallout({ icon: Icon, ...props }: SettingsCalloutProps) {
  return <UiSettingsCallout {...props} icon={<Icon size={14} />} />;
}
