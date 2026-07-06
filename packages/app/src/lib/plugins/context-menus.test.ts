import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import {
  listPluginEditorContextMenuItems,
  listPluginFileTreeContextMenuItems
} from "./context-menus";

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["commands", "contextMenu"],
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

describe("plugin context menu adapter", () => {
  it("lists editor context menu items from enabled plugins only", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          description: "Insert a synthetic citation.",
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
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      commands: [
        {
          id: "notes.format",
          run: () => "formatted",
          title: "Format note"
        }
      ],
      contextMenus: [
        {
          id: "notes.editor",
          scope: "editor",
          items: [
            {
              command: "notes.format",
              id: "notes.format.editor"
            }
          ]
        }
      ]
    })));

    await registry.enable("reference", {});

    expect(listPluginEditorContextMenuItems(registry)).toEqual([
      {
        commandId: "reference.insertCitation",
        description: "Insert a synthetic citation.",
        id: "reference.insertCitation.editor",
        pluginId: "reference",
        pluginName: "Reference",
        title: "Insert citation",
        when: {
          document: "markdown",
          selection: "any"
        }
      }
    ]);
  });

  it("uses item titles when provided and ignores missing command targets", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
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
              command: "reference.missing",
              id: "reference.missing.editor"
            },
            {
              command: "reference.insertCitation",
              id: "reference.insertCitation.editor",
              title: "Cite selected text"
            }
          ]
        }
      ]
    })));

    await registry.enable("reference", {});

    expect(listPluginEditorContextMenuItems(registry)).toEqual([
      {
        commandId: "reference.insertCitation",
        description: undefined,
        id: "reference.insertCitation.editor",
        pluginId: "reference",
        pluginName: "Reference",
        title: "Cite selected text",
        when: undefined
      }
    ]);
  });

  it("lists file tree context menu items from enabled plugins only", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      commands: [
        {
          description: "Copy a synthetic relative path.",
          id: "reference.copyPath",
          run: () => "copied",
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
    })));
    registry.registerBuiltIn(createFactory(notesManifest, () => ({
      commands: [
        {
          id: "notes.copyPath",
          run: () => "copied",
          title: "Copy note path"
        }
      ],
      contextMenus: [
        {
          id: "notes.fileTree",
          scope: "fileTree",
          items: [
            {
              command: "notes.copyPath",
              id: "notes.copyPath.fileTree"
            }
          ]
        }
      ]
    })));

    await registry.enable("reference", {});

    expect(listPluginFileTreeContextMenuItems(registry)).toEqual([
      {
        commandId: "reference.copyPath",
        description: "Copy a synthetic relative path.",
        id: "reference.copyPath.fileTree",
        pluginId: "reference",
        pluginName: "Reference",
        title: "Copy relative path",
        when: {
          file: "markdown"
        }
      }
    ]);
  });
});
