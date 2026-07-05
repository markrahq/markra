import type {
  PluginCommandContext,
  PluginCommandContribution
} from "@markra/plugin-api";
import type { PluginRegistry } from "./registry";

export type PluginCommand = PluginCommandContribution & {
  pluginId: string;
  pluginName: string;
};

export type PluginCommandContextFactory = (
  pluginId: string
) => PluginCommandContext | Promise<PluginCommandContext>;

export function listPluginCommands(registry: PluginRegistry): PluginCommand[] {
  return registry.listPlugins().flatMap((plugin) => {
    if (!plugin.enabled) return [];

    return (registry.getActivation(plugin.manifest.id)?.commands ?? []).map((command) => ({
      ...command,
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name
    }));
  });
}

export async function runPluginCommand(
  registry: PluginRegistry,
  commandId: string,
  createContext: PluginCommandContextFactory
) {
  const command = listPluginCommands(registry).find((candidate) => candidate.id === commandId);
  if (!command) throw new Error(`Plugin command "${commandId}" is not available.`);

  return command.run(await createContext(command.pluginId));
}
