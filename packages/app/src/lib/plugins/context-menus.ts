import type {
  PluginContextMenuWhen
} from "@markra/plugin-api";
import type { PluginRegistry } from "./registry";

export type PluginContextMenuItem = {
  commandId: string;
  description?: string;
  id: string;
  pluginId: string;
  pluginName: string;
  title: string;
  when?: PluginContextMenuWhen;
};

export type PluginEditorContextMenuItem = PluginContextMenuItem;
export type PluginFileTreeContextMenuItem = PluginContextMenuItem;

export function listPluginEditorContextMenuItems(registry: PluginRegistry): PluginEditorContextMenuItem[] {
  return listPluginContextMenuItems(registry, "editor");
}

export function listPluginFileTreeContextMenuItems(registry: PluginRegistry): PluginFileTreeContextMenuItem[] {
  return listPluginContextMenuItems(registry, "fileTree");
}

function listPluginContextMenuItems(
  registry: PluginRegistry,
  scope: "editor" | "fileTree"
): PluginContextMenuItem[] {
  return registry.listPlugins().flatMap((plugin) => {
    if (!plugin.enabled) return [];

    const activation = registry.getActivation(plugin.manifest.id);
    const commands = new Map((activation?.commands ?? []).map((command) => [command.id, command]));

    return (activation?.contextMenus ?? []).flatMap((menu) => {
      if (menu.scope !== scope) return [];

      return menu.items.flatMap((item) => {
        const command = commands.get(item.command);
        if (!command) return [];

        return [{
          commandId: command.id,
          description: command.description,
          id: item.id,
          pluginId: plugin.manifest.id,
          pluginName: plugin.manifest.name,
          title: item.title ?? command.title,
          when: item.when
        }];
      });
    });
  });
}
