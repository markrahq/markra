import { Fragment, createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import type { PluginSettingsContribution } from "@markra/plugin-api";
import type { PluginRegistry, PluginRegistryItem } from "./registry";

type PluginSettingsComponent = ComponentType<Record<string, never>>;

export type ExtensionsSettingsPlugin = PluginRegistryItem & {
  settings?: ReactNode;
};

export function listExtensionsSettingsPlugins(registry: PluginRegistry): ExtensionsSettingsPlugin[] {
  return registry.listPlugins().map((plugin) => ({
    ...plugin,
    settings: renderPluginSettings(registry.getActivation(plugin.manifest.id)?.settings)
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
