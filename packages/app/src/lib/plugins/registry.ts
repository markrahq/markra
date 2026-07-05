import {
  isPluginManifest,
  listPluginManifestProblems,
  type MarkraPlugin,
  type PluginCapability,
  type PluginActivation,
  type PluginContext,
  type PluginManifest
} from "@markra/plugin-api";

export type BuiltInPluginFactory = () => MarkraPlugin;

export type PluginRegistryStatus = "disabled" | "enabled" | "failed";

export type PluginRegistryItem = {
  enabled: boolean;
  error?: string;
  manifest: PluginManifest;
  status: PluginRegistryStatus;
};

export type PluginRegistryOptions = {
  apiVersion: number;
};

type PluginRegistryEntry = {
  activation: PluginActivation | null;
  error: string | null;
  factory: BuiltInPluginFactory;
  manifest: PluginManifest;
  plugin: MarkraPlugin;
  status: PluginRegistryStatus;
};

type ActivationCapabilityRequirement = {
  capability: PluginCapability;
  contribution: keyof PluginActivation;
  label: string;
};

const activationCapabilityRequirements: readonly ActivationCapabilityRequirement[] = [
  { capability: "commands", contribution: "commands", label: "commands" },
  { capability: "settings", contribution: "settings", label: "settings" },
  { capability: "sidePanel", contribution: "sidePanels", label: "side panels" },
  { capability: "editor", contribution: "editor", label: "editor contributions" },
  { capability: "pandocExport", contribution: "export", label: "Pandoc export hooks" }
];

export function createPluginRegistry(options: PluginRegistryOptions) {
  return new PluginRegistry(options);
}

export class PluginRegistry {
  private readonly entries = new Map<string, PluginRegistryEntry>();

  constructor(private readonly options: PluginRegistryOptions) {}

  registerBuiltIn(factory: BuiltInPluginFactory) {
    const plugin = factory();
    const manifestProblems = listPluginManifestProblems(plugin.manifest);

    if (!isPluginManifest(plugin.manifest)) {
      throw new Error(`Plugin manifest is invalid: ${manifestProblems.join(" ")}`);
    }

    if (plugin.manifest.apiVersion > this.options.apiVersion) {
      throw new Error(
        `Plugin "${plugin.manifest.id}" requires plugin API v${plugin.manifest.apiVersion}, but Markra supports v${this.options.apiVersion}.`
      );
    }

    if (this.entries.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered.`);
    }

    this.entries.set(plugin.manifest.id, {
      activation: null,
      error: null,
      factory,
      manifest: plugin.manifest,
      plugin,
      status: "disabled"
    });
  }

  listPlugins() {
    return Array.from(this.entries.values(), (entry): PluginRegistryItem => {
      const item: PluginRegistryItem = {
        enabled: entry.status === "enabled",
        manifest: entry.manifest,
        status: entry.status
      };

      if (entry.error) item.error = entry.error;

      return item;
    });
  }

  getActivation(id: string) {
    return this.entries.get(id)?.activation ?? null;
  }

  async enable(id: string, ctx: PluginContext) {
    const entry = this.requireEntry(id);
    if (entry.activation) return entry.activation;

    try {
      const activation = await entry.plugin.activate?.(ctx) ?? {};
      validateActivationCapabilities(entry.manifest, activation);
      entry.activation = activation;
      entry.error = null;
      entry.status = "enabled";

      return activation;
    } catch (error) {
      entry.activation = null;
      entry.error = errorMessage(error);
      entry.status = "failed";
      throw error;
    }
  }

  async disable(id: string) {
    const entry = this.requireEntry(id);
    const activation = entry.activation;
    if (!activation) {
      entry.status = entry.status === "failed" ? "failed" : "disabled";
      return;
    }

    await activation.dispose?.();
    entry.activation = null;
    entry.status = "disabled";
  }

  private requireEntry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Plugin "${id}" is not registered.`);

    return entry;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function validateActivationCapabilities(manifest: PluginManifest, activation: PluginActivation) {
  const capabilities = new Set(manifest.capabilities);

  for (const requirement of activationCapabilityRequirements) {
    if (
      hasContribution(activation[requirement.contribution]) &&
      !capabilities.has(requirement.capability)
    ) {
      throw new Error(
        `Plugin "${manifest.id}" contributed ${requirement.label} but does not declare the "${requirement.capability}" capability.`
      );
    }
  }
}

function hasContribution(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}
