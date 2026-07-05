import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import { listPluginEditorContributions } from "./editor";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["editor"],
  description: "Reference tools for synthetic examples.",
  id: "reference",
  main: "./dist/index.js",
  name: "Reference",
  permissions: {
    files: {
      read: "userSelected",
      write: "none"
    },
    native: false,
    network: false
  },
  version: "0.1.0"
};

const notesManifest: PluginManifest = {
  ...referenceManifest,
  description: "Note tools for synthetic examples.",
  id: "notes",
  name: "Notes"
};

function createFactory(
  manifest: PluginManifest,
  activate: (ctx: PluginContext) => PluginActivation | Promise<PluginActivation>
): BuiltInPluginFactory {
  return () => definePlugin({ activate, manifest });
}

describe("plugin editor adapter", () => {
  it("lists enabled editor contributions in stable stage and priority order", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      editor: [
        {
          id: "reference.renderCitations",
          priority: 0,
          setup: () => "citation-plugin",
          stage: "prosePlugins"
        },
        {
          id: "reference.citationInputRule",
          priority: 5,
          setup: () => "citation-input-rule",
          stage: "inputRules"
        }
      ]
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      editor: [
        {
          id: "notes.renderLinks",
          priority: 20,
          setup: () => "notes-plugin",
          stage: "prosePlugins"
        }
      ]
    })));

    await registry.enable("reference", {});
    await registry.enable("notes", {});

    expect(listPluginEditorContributions(registry, () => ({}))).toEqual([
      expect.objectContaining({
        id: "reference.citationInputRule",
        pluginId: "reference",
        pluginName: "Reference",
        priority: 5,
        stage: "inputRules"
      }),
      expect.objectContaining({
        id: "notes.renderLinks",
        pluginId: "notes",
        pluginName: "Notes",
        priority: 20,
        stage: "prosePlugins"
      }),
      expect.objectContaining({
        id: "reference.renderCitations",
        pluginId: "reference",
        pluginName: "Reference",
        priority: 0,
        stage: "prosePlugins"
      })
    ]);
  });

  it("runs setup with the contributing plugin context", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      editor: [
        {
          id: "reference.renderCitations",
          setup: (ctx) => ctx.storage?.get("citationStyle", "fallback"),
          stage: "prosePlugins"
        }
      ]
    })));
    const createContext = vi.fn(async (pluginId: string): Promise<PluginContext> => ({
      storage: {
        async get<T>(_key: string, _fallback: T) {
          return `${pluginId}:apa` as T;
        },
        async remove() {
          return undefined;
        },
        async set() {
          return undefined;
        }
      }
    }));

    await registry.enable("reference", {});

    const [contribution] = listPluginEditorContributions(registry, createContext);

    await expect(contribution?.setup()).resolves.toBe("reference:apa");
    expect(createContext).toHaveBeenCalledWith("reference");
  });

  it("does not list editor contributions from disabled plugins", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      editor: [
        {
          id: "reference.renderCitations",
          setup: () => "citation-plugin",
          stage: "prosePlugins"
        }
      ]
    })));

    expect(listPluginEditorContributions(registry, () => ({}))).toEqual([]);
  });
});
