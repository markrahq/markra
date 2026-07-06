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
    capabilities: ["settings", "commands", "sidePanel", "editor", "contextMenu", "pandocExport"],
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
      activate: (_ctx) => ({
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
        async getSelection() {
          return null;
        },
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

  it("defines plugins that can read the current editor selection", async () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.wrapSelection",
            run: async (commandCtx) => {
              const selection = await commandCtx.editor?.getSelection();

              return selection?.text ?? "";
            },
            title: "Read selection"
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    await expect(activation?.commands?.[0]?.run({
      editor: {
        async getSelection() {
          return {
            cursor: 21,
            from: 10,
            source: "selection",
            text: "selected citation",
            to: 21
          };
        },
        async insertMarkdown() {
          return true;
        }
      }
    })).resolves.toBe("selected citation");
  });

  it("defines plugins that can request their own side panel to open", async () => {
    const openSidePanel = vi.fn(async (_panelId?: string) => true);
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (ctx) => ({
        commands: [
          {
            id: "reference.openPanel",
            run: () => ctx.ui?.openSidePanel("reference.panel"),
            title: "Open references"
          }
        ],
        sidePanels: [
          {
            component: {},
            id: "reference.panel",
            location: "right",
            title: "References"
          }
        ]
      })
    });

    const activation = plugin.activate?.({
      ui: {
        openSidePanel,
        showToast: vi.fn()
      }
    });

    await expect(activation?.commands?.[0]?.run()).resolves.toBe(true);
    expect(openSidePanel).toHaveBeenCalledWith("reference.panel");
  });

  it("defines plugins that can show host toasts", async () => {
    const showToast = vi.fn();
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (ctx) => ({
        commands: [
          {
            id: "reference.refresh",
            run: () => ctx.ui?.showToast("References refreshed", {
              description: "2 entries",
              durationMs: 1200,
              status: "success"
            }),
            title: "Refresh references"
          }
        ]
      })
    });

    const activation = plugin.activate?.({
      ui: {
        async openSidePanel() {
          return false;
        },
        showToast
      }
    });

    await activation?.commands?.[0]?.run();
    expect(showToast).toHaveBeenCalledWith("References refreshed", {
      description: "2 entries",
      durationMs: 1200,
      status: "success"
    });
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

  it("defines editor context menu items that point at plugin commands", () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.insertCitation",
            run: () => "inserted",
            title: "Insert citation"
          }
        ],
        contextMenus: [
          {
            id: "reference.editor",
            scope: "editor",
            items: [
              {
                command: "reference.insertCitation",
                id: "reference.insertCitation.editor",
                when: {
                  document: "markdown",
                  selection: "any"
                }
              }
            ]
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    expect(activation?.contextMenus?.[0]).toMatchObject({
      id: "reference.editor",
      scope: "editor",
      items: [
        {
          command: "reference.insertCitation",
          id: "reference.insertCitation.editor",
          when: {
            document: "markdown",
            selection: "any"
          }
        }
      ]
    });
  });

  it("defines file tree context menu items that point at plugin commands", () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.copyPath",
            run: (commandCtx) =>
              commandCtx.invocation?.source === "fileTreeContextMenu"
                ? commandCtx.invocation.file.relativePath
                : "",
            title: "Copy relative path"
          }
        ],
        contextMenus: [
          {
            id: "reference.fileTree",
            scope: "fileTree",
            items: [
              {
                command: "reference.copyPath",
                id: "reference.copyPath.fileTree",
                when: {
                  file: "markdown"
                }
              }
            ]
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    expect(activation?.contextMenus?.[0]).toMatchObject({
      id: "reference.fileTree",
      scope: "fileTree",
      items: [
        {
          command: "reference.copyPath",
          id: "reference.copyPath.fileTree",
          when: {
            file: "markdown"
          }
        }
      ]
    });
  });

  it("defines commands that can inspect invocation context", async () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.wrapSelection",
            run: (commandCtx) =>
              commandCtx.invocation?.source === "editorContextMenu"
                ? commandCtx.invocation.editor?.selectionText ?? ""
                : "",
            title: "Wrap selection"
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    await expect(Promise.resolve(activation?.commands?.[0]?.run({
      invocation: {
        source: "editorContextMenu",
        editor: {
          selectionText: "selected citation"
        }
      }
    }))).resolves.toBe("selected citation");
  });

  it("defines commands that can inspect file tree invocation context", async () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.copyPath",
            run: (commandCtx) =>
              commandCtx.invocation?.source === "fileTreeContextMenu"
                ? commandCtx.invocation.file.relativePath
                : "",
            title: "Copy relative path"
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    await expect(Promise.resolve(activation?.commands?.[0]?.run({
      invocation: {
        source: "fileTreeContextMenu",
        file: {
          kind: "markdown",
          name: "example.md",
          path: "/mock-workspace/example.md",
          relativePath: "example.md"
        }
      }
    }))).resolves.toBe("example.md");
  });

  it("defines commands that can inspect quick open invocation context", async () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.refreshBibliography",
            run: (commandCtx) =>
              commandCtx.invocation?.source === "quickOpen"
                ? commandCtx.invocation.source
                : "",
            title: "Refresh bibliography"
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    await expect(Promise.resolve(activation?.commands?.[0]?.run({
      invocation: {
        source: "quickOpen"
      }
    }))).resolves.toBe("quickOpen");
  });

  it("defines commands that can inspect settings invocation context", async () => {
    const plugin = definePlugin({
      manifest: referenceManifest,
      activate: (_ctx) => ({
        commands: [
          {
            id: "reference.resetSettings",
            run: (commandCtx) =>
              commandCtx.invocation?.source === "settings"
                ? commandCtx.invocation.source
                : "",
            title: "Reset settings"
          }
        ]
      })
    });

    const activation = plugin.activate?.({});

    await expect(Promise.resolve(activation?.commands?.[0]?.run({
      invocation: {
        source: "settings"
      }
    }))).resolves.toBe("settings");
  });

  it("recognizes supported capabilities and permission grants", () => {
    expect(isPluginCapability("sidePanel")).toBe(true);
    expect(isPluginCapability("contextMenu")).toBe(true);
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
