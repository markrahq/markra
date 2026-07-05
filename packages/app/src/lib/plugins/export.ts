import type {
  PluginContext,
  PluginExportContribution as PluginExportContributionDefinition
} from "@markra/plugin-api";
import type { PluginRegistry } from "./registry";

type PluginExportData = Record<string, unknown>;

export type PluginExportContextFactory = (
  pluginId: string
) => PluginContext | Promise<PluginContext>;

export type PluginPandocExportData<TFormat extends string = string> = Record<string, unknown> & {
  documentPath: string | null;
  format: TFormat;
  markdown: string;
  pandocArgs: string;
  pandocPath: string;
  suggestedName: string;
};

export type PluginPandocExportResultData<TFormat extends string = string> = PluginPandocExportData<TFormat> & {
  outputPath: string | null;
};

export type PluginExportContribution = Omit<PluginExportContributionDefinition, "pandoc"> & {
  pandoc?: {
    afterExport?: (exportContext: PluginExportData) => Promise<unknown>;
    beforeExport?: (exportContext: PluginExportData) => Promise<unknown>;
  };
  pluginId: string;
  pluginName: string;
};

export function listPluginExportContributions(
  registry: PluginRegistry,
  createContext: PluginExportContextFactory
): PluginExportContribution[] {
  return registry.listPlugins().flatMap((plugin) => {
    if (!plugin.enabled) return [];

    return (registry.getActivation(plugin.manifest.id)?.export ?? []).map((contribution) => ({
      id: contribution.id,
      pandoc: wrapPandocHooks(contribution, plugin.manifest.id, createContext),
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name
    }));
  });
}

function wrapPandocHooks(
  contribution: PluginExportContributionDefinition,
  pluginId: string,
  createContext: PluginExportContextFactory
) {
  const hooks = contribution.pandoc;
  if (!hooks) return undefined;

  const wrappedHooks: NonNullable<PluginExportContribution["pandoc"]> = {};

  const beforeExport = hooks.beforeExport;
  if (beforeExport) {
    wrappedHooks.beforeExport = async (exportContext) =>
      beforeExport({
        export: exportContext,
        plugin: await createContext(pluginId)
      });
  }

  const afterExport = hooks.afterExport;
  if (afterExport) {
    wrappedHooks.afterExport = async (exportContext) =>
      afterExport({
        export: exportContext,
        plugin: await createContext(pluginId)
      });
  }

  return wrappedHooks.beforeExport || wrappedHooks.afterExport ? wrappedHooks : undefined;
}

export async function applyPluginPandocBeforeExportHooks<TFormat extends string>(
  input: PluginPandocExportData<TFormat>,
  contributions: readonly PluginExportContribution[]
): Promise<PluginPandocExportData<TFormat>> {
  let current = { ...input };

  for (const contribution of contributions) {
    const patch = await contribution.pandoc?.beforeExport?.(current);
    current = applyPandocExportPatch(current, patch);
  }

  return current;
}

export async function runPluginPandocAfterExportHooks(
  context: PluginPandocExportResultData,
  contributions: readonly PluginExportContribution[]
) {
  for (const contribution of contributions) {
    await contribution.pandoc?.afterExport?.(context);
  }
}

function applyPandocExportPatch<TFormat extends string>(
  input: PluginPandocExportData<TFormat>,
  patch: unknown
): PluginPandocExportData<TFormat> {
  if (!isRecord(patch)) return input;

  const next = { ...input };

  if (typeof patch.markdown === "string") {
    next.markdown = patch.markdown;
  }
  if (typeof patch.pandocArgs === "string") {
    next.pandocArgs = patch.pandocArgs;
  }

  const appendArgs = normalizedAppendArgs(patch.appendArgs);
  if (appendArgs.length > 0) {
    next.pandocArgs = joinPandocArgs(next.pandocArgs, appendArgs);
  }

  return next;
}

function normalizedAppendArgs(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => item.length > 0);
}

function joinPandocArgs(currentArgs: string, appendArgs: readonly string[]) {
  const joinedAppendArgs = appendArgs.join(" ");
  const normalizedCurrentArgs = currentArgs.trim();

  return normalizedCurrentArgs ? `${normalizedCurrentArgs} ${joinedAppendArgs}` : joinedAppendArgs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
