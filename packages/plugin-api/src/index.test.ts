import {
  definePlugin,
  isPluginCapability,
  isPluginManifest,
  isPluginPermissionGrant,
  listPluginManifestProblems,
  type PluginManifest
} from "./index.ts";

describe("plugin api", () => {
  const referenceManifest: PluginManifest = {
    apiVersion: 1,
    capabilities: ["settings", "commands", "sidePanel", "editor", "pandocExport"],
    description: "Citation tools for example documents.",
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
    style: "./dist/style.css",
    version: "0.1.0"
  };

  it("defines a plugin without changing the supplied manifest", () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({ commands: [] })
    });

    expect(plugin.manifest).toBe(referenceManifest);
    expect(plugin.activate?.({} as never)).toEqual({ commands: [] });
  });

  it("defines plugins that can use context storage", async () => {
    const storedValues = new Map<string, unknown>();
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: async (ctx) => {
        await ctx.storage?.set("bibliographyPath", "refs.bib");

        return {
          commands: [
            {
              id: "reference.readBibliographyPath",
              run: (commandCtx) => commandCtx.storage?.get("bibliographyPath", ""),
              title: "Read bibliography path"
            }
          ]
        };
      }
    });
    const storage = {
      async get<T>(key: string, fallback: T) {
        return storedValues.has(key) ? storedValues.get(key) as T : fallback;
      },
      async remove(key: string) {
        storedValues.delete(key);
      },
      async set<T>(key: string, value: T) {
        storedValues.set(key, value);
      }
    };

    const activation = await plugin.activate?.({ storage });

    await expect(activation?.commands?.[0]?.run({ storage })).resolves.toBe("refs.bib");
  });

  it("defines plugins that can use controlled workspace files", async () => {
    const plugin = definePlugin({
      manifest: {
        ...referenceManifest,
        capabilities: ["commands", "workspaceFiles"],
        permissions: {
          files: {
            read: "workspace",
            write: "none"
          },
          native: false,
          network: false
        }
      },
      activate: async (ctx) => {
        const files = await ctx.workspace?.listFiles({ extensions: [".bib"] }) ?? [];
        const opened = await ctx.workspace?.openTextFile({ title: "Choose bibliography" }) ?? null;

        return {
          commands: [
            {
              id: "reference.readBibliography",
              run: (commandCtx) => commandCtx.workspace?.readTextFile(files[0]?.path ?? opened?.path ?? ""),
              title: "Read bibliography"
            }
          ]
        };
      }
    });
    const workspace = {
      async listFiles() {
        return [
          {
            name: "refs.bib",
            path: "/mock-workspace/refs.bib",
            relativePath: "refs.bib"
          }
        ];
      },
      async openTextFile() {
        return {
          content: "@book{example}",
          name: "refs.bib",
          path: "/mock-workspace/refs.bib"
        };
      },
      async readTextFile(path: string) {
        return `read ${path}`;
      }
    };

    const activation = await plugin.activate?.({ workspace });

    await expect(activation?.commands?.[0]?.run({ workspace })).resolves.toBe("read /mock-workspace/refs.bib");
  });

  it("defines plugins that can read the active document and edit the current editor", async () => {
    const insertedMarkdown: string[] = [];
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: () => ({
        commands: [
          {
            id: "reference.insertCitation",
            run: async (commandCtx) => {
              const document = await commandCtx.document?.getActive();

              return commandCtx.editor?.insertMarkdown(`[@${document?.name ?? "missing"}]`);
            },
            title: "Insert citation"
          }
        ]
      })
    });
    const commandContext = {
      document: {
        async getActive() {
          return {
            content: "# Example",
            dirty: false,
            name: "example.md",
            path: "/mock-workspace/example.md",
            revision: 3
          };
        }
      },
      editor: {
        async insertMarkdown(markdown: string) {
          insertedMarkdown.push(markdown);
          return true;
        }
      }
    };

    const activation = plugin.activate?.({});

    await expect(activation?.commands?.[0]?.run(commandContext)).resolves.toBe(true);
    expect(insertedMarkdown).toEqual(["[@example.md]"]);
  });

  it("defines plugins with Pandoc export hooks that receive export and plugin context", async () => {
    const storedValues = new Map<string, unknown>([
      ["bibliographyPath", "refs.bib"]
    ]);
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        export: [
          {
            id: "reference.pandocBibliography",
            pandoc: {
              beforeExport: async (ctx) => ({
                appendArgs: [`--bibliography=${await ctx.plugin.storage?.get("bibliographyPath", "")}`],
                markdown: ctx.export.markdown
              })
            }
          }
        ]
      })
    });
    const storage = {
      async get<T>(key: string, fallback: T) {
        return storedValues.has(key) ? storedValues.get(key) as T : fallback;
      },
      async remove(key: string) {
        storedValues.delete(key);
      },
      async set<T>(key: string, value: T) {
        storedValues.set(key, value);
      }
    };

    const activation = plugin.activate?.({});

    await expect(activation?.export?.[0]?.pandoc?.beforeExport?.({
      export: { markdown: "# Example" },
      plugin: { storage }
    })).resolves.toEqual({
      appendArgs: ["--bibliography=refs.bib"],
      markdown: "# Example"
    });
  });

  it("recognizes supported capabilities and permission grants", () => {
    expect(isPluginCapability("sidePanel")).toBe(true);
    expect(isPluginCapability("aiPromptHooks")).toBe(false);
    expect(isPluginPermissionGrant("userSelected")).toBe(true);
    expect(isPluginPermissionGrant("network")).toBe(false);
  });

  it("validates a manifest with conservative permissions", () => {
    expect(isPluginManifest(referenceManifest)).toBe(true);
    expect(listPluginManifestProblems(referenceManifest)).toEqual([]);
  });

  it("rejects invalid ids, unsupported API versions, and unknown capabilities", () => {
    const invalidManifest = {
      ...referenceManifest,
      apiVersion: 0,
      capabilities: ["settings", "aiPromptHooks"],
      id: "Reference Plugin"
    };

    expect(isPluginManifest(invalidManifest)).toBe(false);
    expect(listPluginManifestProblems(invalidManifest)).toEqual([
      "id must be lowercase kebab-case.",
      "apiVersion must be a positive integer.",
      'capabilities[1] "aiPromptHooks" is not supported.'
    ]);
  });

  it("rejects permissions outside the first-version safety envelope", () => {
    const invalidManifest = {
      ...referenceManifest,
      permissions: {
        files: {
          read: "allFiles",
          write: "workspace"
        },
        native: true,
        network: true
      }
    };

    expect(isPluginManifest(invalidManifest)).toBe(false);
    expect(listPluginManifestProblems(invalidManifest)).toEqual([
      'permissions.files.read "allFiles" is not supported.',
      'permissions.files.write "workspace" is not supported.',
      "permissions.network must be false.",
      "permissions.native must be false."
    ]);
  });
});
