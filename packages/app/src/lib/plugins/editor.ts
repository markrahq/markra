import type {
  PluginContext,
  PluginEditorContribution as PluginEditorContributionDefinition
} from "@markra/plugin-api";
import type { PluginRegistry } from "./registry";

type PluginEditorStage = PluginEditorContributionDefinition["stage"];

export type PluginEditorContextFactory = (
  pluginId: string
) => PluginContext | Promise<PluginContext>;

export type PluginEditorContribution = Omit<PluginEditorContributionDefinition, "setup"> & {
  pluginId: string;
  pluginName: string;
  setup: () => Promise<unknown | readonly unknown[]>;
};

const editorStageOrder: Record<PluginEditorStage, number> = {
  inputRules: 0,
  prosePlugins: 1,
  serializer: 2,
  afterCore: 3
};

export function listPluginEditorContributions(
  registry: PluginRegistry,
  createContext: PluginEditorContextFactory
): PluginEditorContribution[] {
  return registry.listPlugins()
    .flatMap((plugin) => {
      if (!plugin.enabled) return [];

      return (registry.getActivation(plugin.manifest.id)?.editor ?? []).map((contribution) => ({
        id: contribution.id,
        pluginId: plugin.manifest.id,
        pluginName: plugin.manifest.name,
        priority: contribution.priority,
        setup: async () => contribution.setup(await createContext(plugin.manifest.id)),
        stage: contribution.stage
      }));
    })
    .sort(compareEditorContributions);
}

function compareEditorContributions(
  left: PluginEditorContribution,
  right: PluginEditorContribution
) {
  const stageComparison = editorStageOrder[left.stage] - editorStageOrder[right.stage];
  if (stageComparison !== 0) return stageComparison;

  const priorityComparison = (right.priority ?? 0) - (left.priority ?? 0);
  if (priorityComparison !== 0) return priorityComparison;

  const pluginComparison = left.pluginId.localeCompare(right.pluginId);
  if (pluginComparison !== 0) return pluginComparison;

  return left.id.localeCompare(right.id);
}
