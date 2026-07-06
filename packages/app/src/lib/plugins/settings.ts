import { Fragment, createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import type { PluginCommandContribution, PluginSettingsContribution } from "@markra/plugin-api";
import type { PluginRegistry, PluginRegistryItem } from "./registry";

type PluginSettingsComponent = ComponentType<Record<string, never>>;

export type ExtensionsSettingsPluginCommand = Pick<
  PluginCommandContribution,
  "description" | "id" | "title"
>;

export type ExtensionsSettingsPlugin = PluginRegistryItem & {
  commands: ExtensionsSettingsPluginCommand[];
  settings?: ReactNode;
};

export function listExtensionsSettingsPlugins(registry: PluginRegistry): ExtensionsSettingsPlugin[] {
  return registry.listPlugins().map((plugin) => {
    const activation = registry.getActivation(plugin.manifest.id);

    return {
      ...plugin,
      commands: listPluginSettingCommands(activation?.commands),
      settings: renderPluginSettings(activation?.settings)
    };
  });
}

function listPluginSettingCommands(commands: readonly PluginCommandContribution[] | undefined) {
  return (commands ?? []).map((command) => ({
    description: command.description,
    id: command.id,
    title: command.title
  }));
}

function renderPluginSettings(settings: readonly PluginSettingsContribution[] | undefined): ReactNode {
  if (!settings || settings.length === 0) return undefined;

  const renderedSettings = settings
    .map((contribution) => renderPluginSettingsContribution(contribution))
    .filter((node) => node !== null && node !== undefined && node !== false);

  if (renderedSettings.length === 0) return undefined;
  if (renderedSettings.length === 1) return renderedSettings[0];

  return createElement(
    Fragment,
    null,
    ...renderedSettings.map((node, index) => createElement(Fragment, { key: settings[index]?.id ?? index }, node))
  );
}

function renderPluginSettingsContribution(contribution: PluginSettingsContribution): ReactNode {
  const { component } = contribution;

  if (isValidElement(component)) return component;
  if (typeof component === "function") return createElement(component as PluginSettingsComponent);

  return null;
}
