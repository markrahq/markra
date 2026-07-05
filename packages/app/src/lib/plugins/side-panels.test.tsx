import { render, screen } from "@testing-library/react";
import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import { listPluginSidePanels } from "./side-panels";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["sidePanel"],
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

function ReferencePanel() {
  return <section aria-label="Reference panel">Synthetic citations</section>;
}

describe("plugin side panel adapter", () => {
  it("lists side panel contributions from enabled plugins only", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      sidePanels: [
        {
          component: ReferencePanel,
          defaultWidth: 360,
          icon: "book-open",
          id: "reference.panel",
          location: "right",
          title: "References"
        }
      ]
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      sidePanels: [
        {
          component: <section>Inactive notes</section>,
          id: "notes.panel",
          location: "right",
          title: "Notes"
        }
      ]
    })));

    await registry.enable("reference", {});

    const panels = listPluginSidePanels(registry);

    expect(panels).toEqual([
      expect.objectContaining({
        defaultWidth: 360,
        icon: "book-open",
        id: "reference.panel",
        location: "right",
        pluginId: "reference",
        pluginName: "Reference",
        title: "References"
      })
    ]);

    render(<>{panels[0]?.content}</>);

    expect(screen.getByRole("region", { name: "Reference panel" })).toHaveTextContent("Synthetic citations");
  });

  it("renders element side panel contributions", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      sidePanels: [
        {
          component: <aside aria-label="Reference element panel">Element citations</aside>,
          id: "reference.panel",
          location: "right",
          title: "References"
        }
      ]
    })));

    await registry.enable("reference", {});

    const panels = listPluginSidePanels(registry);
    render(<>{panels[0]?.content}</>);

    expect(screen.getByRole("complementary", { name: "Reference element panel" })).toHaveTextContent("Element citations");
  });
});
