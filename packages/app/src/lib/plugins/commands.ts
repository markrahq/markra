import type {
  PluginCommandContext,
  PluginCommandContribution,
  PluginCommandInvocation
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
  createContext: PluginCommandContextFactory,
  invocation?: PluginCommandInvocation,
  pluginId?: string
) {
  const command = listPluginCommands(registry).find((candidate) =>
    candidate.id === commandId && (!pluginId || candidate.pluginId === pluginId));
  if (!command) {
    throw new Error(pluginId
      ? `Plugin command "${commandId}" from plugin "${pluginId}" is not available.`
      : `Plugin command "${commandId}" is not available.`);
  }

  const context = await createContext(command.pluginId);

  return command.run(invocation ? { ...context, invocation } : context);
}
