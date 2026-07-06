import { act, renderHook, waitFor } from "@testing-library/react";
import {
  definePlugin,
  type PluginActivation,
  type PluginCommandContext,
  type PluginContext,
  type PluginExportHookContext,
  type PluginManifest
} from "@markra/plugin-api";
import { SettingsRow, SettingsSection, SettingsTextInput } from "../components/settings/SettingsControls";
import type { BuiltInPluginFactory } from "../lib/plugins/registry";
import {
  configureAppRuntime,
  createDefaultAppRuntime,
  resetAppRuntimeForTests
} from "../runtime";
import { useExtensionsSettingsPlugins } from "./useExtensionsSettingsPlugins";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["settings"],
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
  capabilities: ["commands"],
  description: "Note tools for synthetic examples.",
  id: "notes",
  name: "Notes"
};

function createFactory(
  manifest: PluginManifest,
  activate: (ctx: PluginContext) => PluginActivation | Promise<PluginActivation> = () => ({})
): BuiltInPluginFactory {
  return () => definePlugin({ activate, manifest });
}

function ReferenceSettings() {
  return (
    <SettingsSection label="Reference settings">
      <SettingsRow
        title="Bibliography file"
        action={
          <SettingsTextInput
            label="Bibliography file"
            value="refs.bib"
            onValueChange={() => {}}
          />
        }
      />
    </SettingsSection>
  );
}

function ReferencePanel() {
  return <section aria-label="Reference panel">Synthetic citations</section>;
}

describe("useExtensionsSettingsPlugins", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("toggles built-in plugins and refreshes settings contributions", async () => {
    const activate = vi.fn((_ctx: PluginContext) => ({
      settings: [
        {
          component: ReferenceSettings,
          id: "reference.settings",
          title: "Reference settings"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory(referenceManifest, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.plugins[0]).toMatchObject({
      enabled: false,
      manifest: referenceManifest,
      status: "disabled"
    });
    expect(result.current.plugins[0]?.settings).toBeUndefined();

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      app: {
        apiVersion: 1,
        language: "en",
        platform: "macos",
        version: expect.any(String)
      },
      storage: expect.objectContaining({
        get: expect.any(Function),
        remove: expect.any(Function),
        set: expect.any(Function)
      }),
      workspace: {
        listFiles: expect.any(Function),
        openTextFile: expect.any(Function),
        readTextFile: expect.any(Function)
      }
    }));
    expect(result.current.plugins[0]).toMatchObject({ enabled: true, status: "enabled" });
    expect(result.current.plugins[0]?.settings).toBeTruthy();

    await act(async () => {
      await result.current.togglePlugin("reference", false);
    });

    expect(result.current.plugins[0]).toMatchObject({ enabled: false, status: "disabled" });
    expect(result.current.plugins[0]?.settings).toBeUndefined();
  });

  it("keeps activation errors visible when enabling fails", async () => {
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [
          createFactory(referenceManifest, () => {
            throw new Error("activation failed");
          })
        ],
        language: "en",
        platform: "windows"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.plugins[0]).toMatchObject({
      enabled: false,
      error: "activation failed",
      status: "failed"
    });
  });

  it("restores and persists enabled plugin ids", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const store = new Map<string, unknown>([
      ["pluginSettings", { enabledPluginIds: ["reference"] }]
    ]);
    const set = vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    });
    configureAppRuntime({
      ...defaultRuntime,
      settings: {
        async loadStore() {
          return {
            async delete(key: string) {
              store.delete(key);
            },
            async get<T>(key: string) {
              return store.get(key) as T | undefined;
            },
            async save() {
              return undefined;
            },
            set
          };
        }
      }
    });
    const activate = vi.fn(() => ({ settings: [] }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory(referenceManifest, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await waitFor(() => {
      expect(result.current.plugins[0]).toMatchObject({ enabled: true, status: "enabled" });
    });
    expect(activate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.togglePlugin("reference", false);
    });

    expect(set).toHaveBeenLastCalledWith("pluginSettings", { enabledPluginIds: [] });
  });

  it("passes plugin-scoped storage into activation", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const stores = new Map<string, Map<string, unknown>>();
    configureAppRuntime({
      ...defaultRuntime,
      settings: {
        async loadStore(path: string) {
          if (!stores.has(path)) stores.set(path, new Map());
          const store = stores.get(path)!;

          return {
            async delete(key: string) {
              store.delete(key);
            },
            async get<T>(key: string) {
              return store.get(key) as T | undefined;
            },
            async save() {
              return undefined;
            },
            async set(key: string, value: unknown) {
              store.set(key, value);
            }
          };
        }
      }
    });
    const activate = vi.fn(async (ctx: PluginContext) => {
      await ctx.storage?.set("bibliographyPath", "refs.bib");

      return { settings: [] };
    });
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory(referenceManifest, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(stores.get("plugins/reference/settings.json")?.get("bibliographyPath")).toBe("refs.bib");
  });

  it("exposes enabled plugin commands and runs them with plugin-scoped storage", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const stores = new Map<string, Map<string, unknown>>();
    configureAppRuntime({
      ...defaultRuntime,
      settings: {
        async loadStore(path: string) {
          if (!stores.has(path)) stores.set(path, new Map());
          const store = stores.get(path)!;

          return {
            async delete(key: string) {
              store.delete(key);
            },
            async get<T>(key: string) {
              return store.get(key) as T | undefined;
            },
            async save() {
              return undefined;
            },
            async set(key: string, value: unknown) {
              store.set(key, value);
            }
          };
        }
      }
    });
    const activate = vi.fn(async (ctx: PluginContext) => {
      await ctx.storage?.set("bibliographyPath", "refs.bib");

      return {
        commands: [
          {
            id: "reference.readBibliographyPath",
            run: (commandCtx: PluginContext) => commandCtx.storage?.get("bibliographyPath", "fallback.bib"),
            title: "Read bibliography path"
          }
        ]
      };
    });
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.commands).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.commands).toEqual([
      expect.objectContaining({
        id: "reference.readBibliographyPath",
        pluginId: "reference",
        title: "Read bibliography path"
      })
    ]);
    await expect(result.current.runCommand("reference.readBibliographyPath")).resolves.toBe("refs.bib");
  });

  it("runs a command from the requested plugin when command ids overlap", async () => {
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [
          createFactory({ ...referenceManifest, capabilities: ["commands"] }, () => ({
            commands: [
              {
                id: "shared.describe",
                run: () => "reference",
                title: "Describe"
              }
            ]
          })),
          createFactory(notesManifest, () => ({
            commands: [
              {
                id: "shared.describe",
                run: () => "notes",
                title: "Describe"
              }
            ]
          }))
        ],
        language: "en",
        platform: "macos"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
      await result.current.togglePlugin("notes", true);
    });

    await expect(result.current.runCommand("shared.describe", undefined, "notes")).resolves.toBe("notes");
  });

  it("exposes enabled plugin editor context menu command placements", async () => {
    const activate = vi.fn(() => ({
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
          scope: "editor" as const,
          items: [
            {
              command: "reference.insertCitation",
              id: "reference.insertCitation.editor"
            }
          ]
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands", "contextMenu"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.editorContextMenuItems).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.editorContextMenuItems).toEqual([
      expect.objectContaining({
        commandId: "reference.insertCitation",
        id: "reference.insertCitation.editor",
        pluginId: "reference",
        pluginName: "Reference",
        title: "Insert citation"
      })
    ]);
  });

  it("exposes enabled plugin file tree context menu command placements", async () => {
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.copyPath",
          run: () => "copied",
          title: "Copy relative path"
        }
      ],
      contextMenus: [
        {
          id: "reference.fileTree",
          scope: "fileTree" as const,
          items: [
            {
              command: "reference.copyPath",
              id: "reference.copyPath.fileTree",
              when: {
                file: "markdown" as const
              }
            }
          ]
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands", "contextMenu"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.fileTreeContextMenuItems).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.fileTreeContextMenuItems).toEqual([
      expect.objectContaining({
        commandId: "reference.copyPath",
        id: "reference.copyPath.fileTree",
        pluginId: "reference",
        pluginName: "Reference",
        title: "Copy relative path"
      })
    ]);
  });

  it("passes invocation details when running plugin commands", async () => {
    const run = vi.fn((commandCtx: PluginCommandContext) =>
      commandCtx.invocation?.source === "editorContextMenu"
        ? commandCtx.invocation.editor?.selectionText
        : undefined);
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.wrapSelection",
          run,
          title: "Wrap selection"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    await expect(result.current.runCommand("reference.wrapSelection", {
      source: "editorContextMenu",
      editor: {
        selectionText: "selected citation"
      }
    })).resolves.toBe("selected citation");
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      invocation: {
        source: "editorContextMenu",
        editor: {
          selectionText: "selected citation"
        }
      }
    }));
  });

  it("passes active document and editor access into plugin activation and commands", async () => {
    const getActive = vi.fn(async () => ({
      content: "# Synthetic",
      dirty: false,
      name: "synthetic.md",
      path: "/mock-workspace/synthetic.md",
      revision: 7
    }));
    const getSelection = vi.fn(async () => ({
      cursor: 13,
      from: 1,
      source: "selection" as const,
      text: "Synthetic",
      to: 10
    }));
    const insertMarkdown = vi.fn(async () => true);
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.insertCitation",
          run: async (commandCtx: PluginContext) => {
            const document = await commandCtx.document?.getActive();
            const selection = await commandCtx.editor?.getSelection();

            return commandCtx.editor?.insertMarkdown(`[@${document?.name ?? "missing"}:${selection?.text ?? "none"}]`);
          },
          title: "Insert citation"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        document: { getActive },
        editor: { getSelection, insertMarkdown },
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      document: { getActive },
      editor: { getSelection, insertMarkdown }
    }));
    await expect(result.current.runCommand("reference.insertCitation")).resolves.toBe(true);
    expect(getActive).toHaveBeenCalledTimes(1);
    expect(getSelection).toHaveBeenCalledTimes(1);
    expect(insertMarkdown).toHaveBeenCalledWith("[@synthetic.md:Synthetic]");
  });

  it("refreshes enabled plugins when plugin settings change in another window", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const unlisten = vi.fn();
    const listeners = new Map<string, (event: { payload: unknown }) => unknown>();
    configureAppRuntime({
      ...defaultRuntime,
      events: {
        async emit() {
          return undefined;
        },
        isAvailable: () => true,
        async listen(event, handler) {
          listeners.set(event, handler as (event: { payload: unknown }) => unknown);
          return unlisten;
        }
      }
    });
    const dispose = vi.fn(async () => {});
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.readBibliographyPath",
          run: () => "refs.bib",
          title: "Read bibliography path"
        }
      ],
      dispose
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await waitFor(() => expect(listeners.has("markra://plugin-settings-changed")).toBe(true));
    expect(result.current.commands).toEqual([]);

    await act(async () => {
      await listeners.get("markra://plugin-settings-changed")?.({
        payload: {
          settings: {
            enabledPluginIds: ["reference"]
          }
        }
      });
    });

    await waitFor(() => expect(result.current.commands).toEqual([
      expect.objectContaining({
        id: "reference.readBibliographyPath",
        pluginId: "reference"
      })
    ]));

    await act(async () => {
      await listeners.get("markra://plugin-settings-changed")?.({
        payload: {
          settings: {
            enabledPluginIds: []
          }
        }
      });
    });

    await waitFor(() => expect(result.current.commands).toEqual([]));
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(unlisten).not.toHaveBeenCalled();
  });

  it("keeps newer plugin settings events when the initial restore resolves later", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const listeners = new Map<string, (event: { payload: unknown }) => unknown>();
    let resolveStoredSettings: ((value: unknown) => unknown) | null = null;
    configureAppRuntime({
      ...defaultRuntime,
      events: {
        async emit() {
          return undefined;
        },
        isAvailable: () => true,
        async listen(event, handler) {
          listeners.set(event, handler as (event: { payload: unknown }) => unknown);
          return () => {};
        }
      },
      settings: {
        async loadStore() {
          return {
            async delete() {
              return undefined;
            },
            async get<T>() {
              return new Promise<T | undefined>((resolve) => {
                resolveStoredSettings = resolve as (value: unknown) => unknown;
              });
            },
            async save() {
              return undefined;
            },
            async set() {
              return undefined;
            }
          };
        }
      }
    });
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.readBibliographyPath",
          run: () => "refs.bib",
          title: "Read bibliography path"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    await waitFor(() => expect(listeners.has("markra://plugin-settings-changed")).toBe(true));

    await act(async () => {
      await listeners.get("markra://plugin-settings-changed")?.({
        payload: {
          settings: {
            enabledPluginIds: ["reference"]
          }
        }
      });
    });
    await waitFor(() => expect(result.current.commands).toEqual([
      expect.objectContaining({ id: "reference.readBibliographyPath" })
    ]));

    await act(async () => {
      resolveStoredSettings?.({ enabledPluginIds: [] });
    });

    await waitFor(() => expect(result.current.commands).toEqual([
      expect.objectContaining({ id: "reference.readBibliographyPath" })
    ]));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("does not reload stale stored plugin settings when the workspace context changes", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const getStoredSettings = vi.fn(async (_key: string) => ({ enabledPluginIds: [] }));
    const listeners = new Map<string, (event: { payload: unknown }) => unknown>();
    configureAppRuntime({
      ...defaultRuntime,
      events: {
        async emit() {
          return undefined;
        },
        isAvailable: () => true,
        async listen(event, handler) {
          listeners.set(event, handler as (event: { payload: unknown }) => unknown);
          return () => {};
        }
      },
      settings: {
        async loadStore() {
          return {
            async delete() {
              return undefined;
            },
            async get<T>(key: string) {
              return getStoredSettings(key) as Promise<T | undefined>;
            },
            async save() {
              return undefined;
            },
            async set() {
              return undefined;
            }
          };
        }
      }
    });
    const activate = vi.fn(() => ({
      commands: [
        {
          id: "reference.readBibliographyPath",
          run: () => "refs.bib",
          title: "Read bibliography path"
        }
      ]
    }));
    const initialHookProps: { workspaceRootPath: string | null } = {
      workspaceRootPath: null
    };
    const { result, rerender } = renderHook(
      ({ workspaceRootPath }: { workspaceRootPath: string | null }) =>
        useExtensionsSettingsPlugins({
          factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
          language: "en",
          platform: "macos",
          workspaceRootPath
        }),
      {
        initialProps: initialHookProps
      }
    );

    await waitFor(() => expect(listeners.has("markra://plugin-settings-changed")).toBe(true));

    await act(async () => {
      await listeners.get("markra://plugin-settings-changed")?.({
        payload: {
          settings: {
            enabledPluginIds: ["reference"]
          }
        }
      });
    });
    await waitFor(() => expect(result.current.commands).toEqual([
      expect.objectContaining({ id: "reference.readBibliographyPath" })
    ]));
    expect(getStoredSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({
        workspaceRootPath: "/mock-workspace"
      });
      await Promise.resolve();
    });

    expect(getStoredSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.commands).toEqual([
      expect.objectContaining({ id: "reference.readBibliographyPath" })
    ]));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("passes controlled workspace file access into plugin activation and commands", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const readMarkdownFile = vi.fn(async (path: string) => ({
      content: `read ${path}`,
      name: "refs.bib",
      path
    }));
    configureAppRuntime({
      ...defaultRuntime,
      files: {
        ...defaultRuntime.files,
        async listMarkdownFilesForPath() {
          return [
            {
              name: "refs.bib",
              path: "/mock-workspace/refs.bib",
              relativePath: "refs.bib"
            }
          ];
        },
        readMarkdownFile
      }
    });
    const activate = vi.fn(async (ctx: PluginContext) => {
      const files = await ctx.workspace?.listFiles({ extensions: [".bib"] }) ?? [];

      return {
        commands: [
          {
            id: "reference.readBibliography",
            run: (commandCtx: PluginContext) => commandCtx.workspace?.readTextFile(files[0]?.path ?? ""),
            title: "Read bibliography"
          }
        ]
      };
    });
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [
          createFactory({
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
          }, activate)
        ],
        language: "en",
        platform: "macos",
        workspaceRootPath: "/mock-workspace"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      workspace: {
        listFiles: expect.any(Function),
        openTextFile: expect.any(Function),
        readTextFile: expect.any(Function)
      }
    }));
    await expect(result.current.runCommand("reference.readBibliography")).resolves.toBe(
      "read /mock-workspace/refs.bib"
    );
    expect(readMarkdownFile).toHaveBeenCalledWith("/mock-workspace/refs.bib");
  });

  it("exposes enabled plugin side panels", async () => {
    const activate = vi.fn(() => ({
      sidePanels: [
        {
          component: ReferencePanel,
          defaultWidth: 360,
          icon: "book-open",
          id: "reference.panel",
          location: "right" as const,
          title: "References"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["sidePanel"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.sidePanels).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.sidePanels).toEqual([
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
  });

  it("passes plugin-scoped side panel opening into activation and commands", async () => {
    const openSidePanel = vi.fn(async () => true);
    const activate = vi.fn((ctx: PluginContext) => ({
      commands: [
        {
          id: "reference.openPanel",
          run: () => ctx.ui?.openSidePanel("reference.panel"),
          title: "Open references"
        }
      ],
      sidePanels: [
        {
          component: ReferencePanel,
          defaultWidth: 360,
          icon: "book-open",
          id: "reference.panel",
          location: "right" as const,
          title: "References"
        }
      ]
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands", "sidePanel"] }, activate)],
        language: "en",
        openSidePanel,
        platform: "macos"
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      ui: expect.objectContaining({
        openSidePanel: expect.any(Function),
        showToast: expect.any(Function)
      })
    }));
    await expect(result.current.runCommand("reference.openPanel", undefined, "reference")).resolves.toBe(true);
    expect(openSidePanel).toHaveBeenCalledWith("reference", "reference.panel");
  });

  it("passes plugin-scoped toast requests into activation and commands", async () => {
    const showToast = vi.fn();
    const activate = vi.fn((ctx: PluginContext) => ({
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
    }));
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["commands"] }, activate)],
        language: "en",
        platform: "macos",
        showToast
      })
    );

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      ui: expect.objectContaining({
        openSidePanel: expect.any(Function),
        showToast: expect.any(Function)
      })
    }));
    await result.current.runCommand("reference.refresh", undefined, "reference");
    expect(showToast).toHaveBeenCalledWith("reference", "References refreshed", {
      description: "2 entries",
      durationMs: 1200,
      status: "success"
    });
  });

  it("exposes enabled plugin editor contributions with plugin-scoped setup context", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const stores = new Map<string, Map<string, unknown>>();
    configureAppRuntime({
      ...defaultRuntime,
      settings: {
        async loadStore(path: string) {
          if (!stores.has(path)) stores.set(path, new Map());
          const store = stores.get(path)!;

          return {
            async delete(key: string) {
              store.delete(key);
            },
            async get<T>(key: string) {
              return store.get(key) as T | undefined;
            },
            async save() {
              return undefined;
            },
            async set(key: string, value: unknown) {
              store.set(key, value);
            }
          };
        }
      }
    });
    const activate = vi.fn(async (ctx: PluginContext) => {
      await ctx.storage?.set("citationStyle", "apa");

      return {
        editor: [
          {
            id: "reference.renderCitations",
            priority: 10,
            setup: (editorCtx: PluginContext) => editorCtx.storage?.get("citationStyle", "fallback"),
            stage: "prosePlugins" as const
          }
        ]
      };
    });
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["editor"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.editorContributions).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.editorContributions).toEqual([
      expect.objectContaining({
        id: "reference.renderCitations",
        pluginId: "reference",
        pluginName: "Reference",
        priority: 10,
        stage: "prosePlugins"
      })
    ]);
    await expect(result.current.editorContributions[0]?.setup()).resolves.toBe("apa");
  });

  it("exposes enabled plugin export contributions with plugin-scoped hook context", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const stores = new Map<string, Map<string, unknown>>();
    configureAppRuntime({
      ...defaultRuntime,
      settings: {
        async loadStore(path: string) {
          if (!stores.has(path)) stores.set(path, new Map());
          const store = stores.get(path)!;

          return {
            async delete(key: string) {
              store.delete(key);
            },
            async get<T>(key: string) {
              return store.get(key) as T | undefined;
            },
            async save() {
              return undefined;
            },
            async set(key: string, value: unknown) {
              store.set(key, value);
            }
          };
        }
      }
    });
    const activate = vi.fn(async (ctx: PluginContext) => {
      await ctx.storage?.set("bibliographyPath", "refs.bib");

      return {
        export: [
          {
            id: "reference.pandocBibliography",
            pandoc: {
              beforeExport: async (exportCtx: PluginExportHookContext) => ({
                appendArgs: [`--bibliography=${await exportCtx.plugin.storage?.get("bibliographyPath", "")}`],
                markdown: exportCtx.export.markdown
              })
            }
          }
        ]
      };
    });
    const { result } = renderHook(() =>
      useExtensionsSettingsPlugins({
        factories: [createFactory({ ...referenceManifest, capabilities: ["pandocExport"] }, activate)],
        language: "en",
        platform: "macos"
      })
    );

    expect(result.current.exportContributions).toEqual([]);

    await act(async () => {
      await result.current.togglePlugin("reference", true);
    });

    expect(result.current.exportContributions).toEqual([
      expect.objectContaining({
        id: "reference.pandocBibliography",
        pluginId: "reference",
        pluginName: "Reference"
      })
    ]);
    await expect(result.current.exportContributions[0]?.pandoc?.beforeExport?.({ markdown: "# Example" })).resolves.toEqual({
      appendArgs: ["--bibliography=refs.bib"],
      markdown: "# Example"
    });
  });
});
