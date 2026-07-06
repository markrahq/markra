import { builtInPluginFactories } from "./built-ins";

describe("built-in plugins", () => {
  it("registers Document Stats as the first internal extension", () => {
    const plugins = builtInPluginFactories.map((factory) => factory());
    const documentStats = plugins.find((plugin) => plugin.manifest.id === "document-stats");

    expect(documentStats?.manifest).toMatchObject({
      capabilities: ["settings", "commands", "sidePanel", "contextMenu"],
      description: "Basic writing statistics for the active Markdown document.",
      name: "Document Stats",
      permissions: {
        files: {
          read: "none",
          write: "none"
        },
        native: false,
        network: false
      }
    });
  });
});
