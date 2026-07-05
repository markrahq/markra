import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import type { PluginSidePanelContribution } from "@markra/plugin-api";
import type { PluginRegistry } from "./registry";

type PluginSidePanelComponent = ComponentType<Record<string, never>>;

export type PluginSidePanel = Omit<PluginSidePanelContribution, "component"> & {
  content: ReactNode;
  pluginId: string;
  pluginName: string;
};

export function listPluginSidePanels(registry: PluginRegistry): PluginSidePanel[] {
  return registry.listPlugins().flatMap((plugin) => {
    if (!plugin.enabled) return [];

    return (registry.getActivation(plugin.manifest.id)?.sidePanels ?? [])
      .map((panel) => renderPluginSidePanel(panel, plugin.manifest.id, plugin.manifest.name))
      .filter((panel) => panel !== null);
  });
}

function renderPluginSidePanel(
  contribution: PluginSidePanelContribution,
  pluginId: string,
  pluginName: string
): PluginSidePanel | null {
  const content = renderPluginSidePanelContribution(contribution);
  if (!content) return null;

  return {
    defaultWidth: contribution.defaultWidth,
    icon: contribution.icon,
    id: contribution.id,
    location: contribution.location,
    pluginId,
    pluginName,
    title: contribution.title,
    content
  };
}

function renderPluginSidePanelContribution(contribution: PluginSidePanelContribution): ReactNode {
  const { component } = contribution;

  if (isValidElement(component)) return component;
  if (typeof component === "function") return createElement(component as PluginSidePanelComponent);

  return null;
}
