import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import { listPluginCommands, runPluginCommand } from "./commands";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["commands"],
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

describe("plugin commands adapter", () => {
  it("lists command contributions from enabled plugins only", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          description: "Insert a synthetic citation.",
          id: "reference.insertCitation",
          run: () => "inserted",
          title: "Insert citation"
        }
      ]
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      commands: [
        {
          id: "notes.format",
          run: () => "formatted",
          title: "Format note"
        }
      ]
    })));

    await registry.enable("reference", {});

    expect(listPluginCommands(registry)).toEqual([
      {
        description: "Insert a synthetic citation.",
        id: "reference.insertCitation",
        pluginId: "reference",
        pluginName: "Reference",
        run: expect.any(Function),
        title: "Insert citation"
      }
    ]);
  });

  it("runs a command with the contributing plugin context", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          id: "reference.readBibliographyPath",
          run: (ctx) => ctx.storage?.get("bibliographyPath", "fallback.bib"),
          title: "Read bibliography path"
        }
      ]
    })));
    const storedValues = new Map<string, unknown>([
      ["bibliographyPath", "refs.bib"]
    ]);
    const createContext = vi.fn(async (pluginId: string): Promise<PluginContext> => ({
      storage: {
        async get<T>(key: string, fallback: T) {
          return storedValues.has(key) ? storedValues.get(key) as T : fallback;
        },
        async remove(key: string) {
          storedValues.delete(key);
        },
        async set<T>(key: string, value: T) {
          storedValues.set(key, value);
        }
      },
      app: {
        apiVersion: 1,
        language: "en",
        platform: "macos",
        version: "0.0.0-test"
      }
    }));

    await registry.enable("reference", {});

    await expect(runPluginCommand(registry, "reference.readBibliographyPath", createContext)).resolves.toBe("refs.bib");
    expect(createContext).toHaveBeenCalledWith("reference");
  });

  it("rejects unknown or disabled commands", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          id: "reference.insertCitation",
          run: () => "inserted",
          title: "Insert citation"
        }
      ]
    })));

    await expect(runPluginCommand(registry, "reference.insertCitation", () => ({}))).rejects.toThrow(
      'Plugin command "reference.insertCitation" is not available.'
    );
  });
});
