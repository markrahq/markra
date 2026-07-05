import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import {
  applyPluginPandocBeforeExportHooks,
  listPluginExportContributions,
  runPluginPandocAfterExportHooks
} from "./export";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["pandocExport"],
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

describe("plugin export adapter", () => {
  it("lists Pandoc export contributions from enabled plugins only", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      export: [
        {
          id: "reference.pandocBibliography",
          pandoc: {
            beforeExport: async () => ({ appendArgs: ["--bibliography=refs.bib"] })
          }
        }
      ]
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      export: [
        {
          id: "notes.pandocNotes",
          pandoc: {
            beforeExport: async () => ({ appendArgs: ["--metadata=notes:true"] })
          }
        }
      ]
    })));

    await registry.enable("reference", {});

    expect(listPluginExportContributions(registry, () => ({}))).toEqual([
      expect.objectContaining({
        id: "reference.pandocBibliography",
        pandoc: expect.objectContaining({
          beforeExport: expect.any(Function)
        }),
        pluginId: "reference",
        pluginName: "Reference"
      })
    ]);
  });

  it("runs Pandoc hooks with export data and the contributing plugin context", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      export: [
        {
          id: "reference.pandocBibliography",
          pandoc: {
            afterExport: async (ctx) => ctx.plugin.storage?.get("bibliographyPath", "fallback.bib"),
            beforeExport: async (ctx) => ({
              appendArgs: [`--bibliography=${await ctx.plugin.storage?.get("bibliographyPath", "fallback.bib")}`],
              markdown: ctx.export.markdown
            })
          }
        }
      ]
    })));
    const createContext = vi.fn(async (pluginId: string): Promise<PluginContext> => ({
      storage: {
        async get<T>(_key: string, fallback: T) {
          return (pluginId === "reference" ? "refs.bib" : fallback) as T;
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

    const [contribution] = listPluginExportContributions(registry, createContext);

    await expect(contribution?.pandoc?.beforeExport?.({ markdown: "# Example" })).resolves.toEqual({
      appendArgs: ["--bibliography=refs.bib"],
      markdown: "# Example"
    });
    await expect(contribution?.pandoc?.afterExport?.({ outputPath: "/mock/export.docx" })).resolves.toBe("refs.bib");
    expect(createContext).toHaveBeenCalledWith("reference");
  });

  it("does not list export contributions from disabled plugins", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      export: [
        {
          id: "reference.pandocBibliography",
          pandoc: {
            beforeExport: async () => ({ appendArgs: ["--bibliography=refs.bib"] })
          }
        }
      ]
    })));

    expect(listPluginExportContributions(registry, () => ({}))).toEqual([]);
  });

  it("applies Pandoc before-export patches in contribution order", async () => {
    const contributions = [
      {
        id: "reference.pandocBibliography",
        pandoc: {
          beforeExport: vi.fn(async (ctx) => ({
            appendArgs: ["--bibliography=refs.bib"],
            markdown: `${ctx.markdown}\n\n::: references\n:::`
          }))
        },
        pluginId: "reference",
        pluginName: "Reference"
      },
      {
        id: "reference.pandocCsl",
        pandoc: {
          beforeExport: vi.fn(async () => ({
            appendArgs: ["--csl=apa.csl"]
          }))
        },
        pluginId: "reference",
        pluginName: "Reference"
      }
    ];

    await expect(applyPluginPandocBeforeExportHooks({
      documentPath: "/mock-workspace/portable.md",
      format: "docx",
      markdown: "# Portable",
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      suggestedName: "portable.docx"
    }, contributions)).resolves.toEqual({
      documentPath: "/mock-workspace/portable.md",
      format: "docx",
      markdown: "# Portable\n\n::: references\n:::",
      pandocArgs: "--toc --bibliography=refs.bib --csl=apa.csl",
      pandocPath: "/usr/local/bin/pandoc",
      suggestedName: "portable.docx"
    });
    expect(contributions[1]?.pandoc?.beforeExport).toHaveBeenCalledWith(expect.objectContaining({
      markdown: "# Portable\n\n::: references\n:::",
      pandocArgs: "--toc --bibliography=refs.bib"
    }));
  });

  it("runs Pandoc after-export hooks in contribution order", async () => {
    const calls: string[] = [];
    const contributions = [
      {
        id: "reference.pandocBibliography",
        pandoc: {
          afterExport: vi.fn(async () => {
            calls.push("bibliography");
          })
        },
        pluginId: "reference",
        pluginName: "Reference"
      },
      {
        id: "reference.pandocCsl",
        pandoc: {
          afterExport: vi.fn(async () => {
            calls.push("csl");
          })
        },
        pluginId: "reference",
        pluginName: "Reference"
      }
    ];

    await runPluginPandocAfterExportHooks({
      documentPath: "/mock-workspace/portable.md",
      format: "docx",
      markdown: "# Portable",
      outputPath: "/mock-workspace/portable.docx",
      pandocArgs: "--toc",
      pandocPath: "/usr/local/bin/pandoc",
      suggestedName: "portable.docx"
    }, contributions);

    expect(calls).toEqual(["bibliography", "csl"]);
  });
});
