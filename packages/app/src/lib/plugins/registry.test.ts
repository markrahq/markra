import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["settings", "commands"],
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

function createFactory(
  manifest: PluginManifest,
  activate: (ctx: PluginContext) => PluginActivation | Promise<PluginActivation> = () => ({ commands: [] })
): BuiltInPluginFactory {
  return () => definePlugin({ activate, manifest });
}

describe("plugin registry", () => {
  it("registers built-in plugin metadata without enabling the plugin", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });

    registry.registerBuiltIn(createFactory(referenceManifest));

    expect(registry.listPlugins()).toEqual([
      {
        enabled: false,
        manifest: referenceManifest,
        status: "disabled"
      }
    ]);
    expect(registry.getActivation("reference")).toBeNull();
  });

  it("enables and disables a built-in plugin", async () => {
    const dispose = vi.fn();
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          id: "reference.insertCitation",
          run: () => "inserted",
          title: "Insert citation"
        }
      ],
      dispose
    })));

    await registry.enable("reference", {});

    expect(registry.getActivation("reference")?.commands?.[0]?.title).toBe("Insert citation");
    expect(registry.listPlugins()[0]).toMatchObject({ enabled: true, status: "enabled" });

    await registry.disable("reference");

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registry.getActivation("reference")).toBeNull();
    expect(registry.listPlugins()[0]).toMatchObject({ enabled: false, status: "disabled" });
  });

  it("does not activate the same plugin twice", async () => {
    const activate = vi.fn(() => ({ commands: [] }));
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, activate));

    await registry.enable("reference", {});
    await registry.enable("reference", {});

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate plugin ids", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest));

    expect(() => registry.registerBuiltIn(createFactory(referenceManifest))).toThrow(
      'Plugin "reference" is already registered.'
    );
  });

  it("rejects plugins that require an unsupported API version", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });

    expect(() =>
      registry.registerBuiltIn(createFactory({
        ...referenceManifest,
        apiVersion: 2
      }))
    ).toThrow('Plugin "reference" requires plugin API v2, but Markra supports v1.');
  });

  it("marks a plugin as failed when activation throws", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => {
      throw new Error("activation failed");
    }));

    await expect(registry.enable("reference", {})).rejects.toThrow("activation failed");

    expect(registry.listPlugins()[0]).toMatchObject({
      enabled: false,
      error: "activation failed",
      status: "failed"
    });
  });

  it("rejects activation contributions that are not declared in manifest capabilities", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory({
      ...referenceManifest,
      capabilities: ["settings"]
    }, () => ({
      commands: [
        {
          id: "reference.insertCitation",
          run: () => "inserted",
          title: "Insert citation"
        }
      ]
    })));

    await expect(registry.enable("reference", {})).rejects.toThrow(
      'Plugin "reference" contributed commands but does not declare the "commands" capability.'
    );
    expect(registry.getActivation("reference")).toBeNull();
    expect(registry.listPlugins()[0]).toMatchObject({
      enabled: false,
      error: 'Plugin "reference" contributed commands but does not declare the "commands" capability.',
      status: "failed"
    });
  });

  it("allows empty undeclared contribution arrays", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory({
      ...referenceManifest,
      capabilities: ["settings"]
    }, () => ({
      commands: []
    })));

    await expect(registry.enable("reference", {})).resolves.toEqual({ commands: [] });
    expect(registry.listPlugins()[0]).toMatchObject({ enabled: true, status: "enabled" });
  });
});
