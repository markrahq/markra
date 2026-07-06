# Markra Plugin System

Status: Draft

This document captures the initial design direction for a Markra plugin system. It is intentionally scoped to the foundation needed for built-in extensions such as academic reference tools, citation rendering, side panels, settings, commands, context menu placements, editor contributions, and Pandoc export hooks.

## Goals

- Let specialized features live in their own packages instead of spreading domain code through app shell, editor, settings, and export files.
- Start with built-in extensions that are shipped and built with Markra.
- Expose stable extension points for settings, side panels, commands, context menus, editor behavior, document context, workspace file access, and Pandoc export.
- Keep Markra quiet by default: disabled extensions should not affect the editor or settings surface.
- Keep the internal developer API narrow and versioned so it can become public later.

## Non-Goals For The First Version

- Third-party plugin marketplace.
- User-installed plugins.
- Remote plugin installation.
- Public API compatibility guarantees for third-party authors.
- Runtime TypeScript compilation.
- Arbitrary native or Tauri command access.
- Background tasks.
- Network access.
- Plugin-to-plugin dependencies.
- AI prompt or AI agent plugin hooks.
- Full security sandbox for untrusted code.

AI integration can be added later as a new contribution type without changing the basic plugin shape.

## Terminology

- **Extension**: User-facing term. This should be used in the product UI.
- **Plugin**: Internal implementation term. This can be used in code and developer docs.
- **Built-in extension**: A plugin package shipped in the Markra workspace, such as `@markra/reference`.
- **Unpacked extension**: A developer-mode plugin loaded from a local folder containing a built JavaScript entry file.

## Recommended Package Boundary

Introduce a small internal plugin contract package:

```text
packages/plugin-api
```

It should hold the contract between Markra and built-in plugin packages first. The package is intentionally shaped like a future public API, but the first version should be treated as internal and allowed to evolve while `@markra/reference` proves the extension points. Avoid placing React, Milkdown, or Lucide types into `@markra/shared`; `shared` should remain for cross-cutting pure utilities, i18n, and lightweight types.

Suggested entry points:

```text
@markra/plugin-api
@markra/plugin-api/react
@markra/plugin-api/editor
@markra/plugin-api/export
```

The default entry point should stay light. React and editor-specific types should be available through subpath exports so package dependencies remain explicit. Even while internal, this boundary prevents built-in plugins from importing app internals.

## Dependency Direction

```text
@markra/app
  -> @markra/plugin-api
  -> built-in plugin packages

built-in plugin packages
  -> @markra/plugin-api
  -> @markra/editor / @milkdown/kit / react when needed

@markra/shared
  -> no plugin UI/editor dependencies
```

Plugins should not import from `@markra/app`. Markra should provide capabilities through `PluginContext` instead of exposing app internals.

## First-Version Capabilities

The first version should expose only the basic extension points needed by non-AI features.

### Lifecycle

- Register built-in plugins.
- Enable and disable plugins.
- Read plugin manifest metadata.
- Call `activate(ctx)` on enable.
- Call `dispose()` on disable or teardown.
- Track load errors and unsupported API versions.

### Settings Storage

Plugins need namespaced persistent settings:

- `ctx.storage.get(key, fallback)`
- `ctx.storage.set(key, value)`
- `ctx.storage.remove(key)`

The first implementation stores plugin data in a plugin-scoped settings file at `plugins/<plugin-id>/settings.json`. The storage layer should namespace data by plugin id. `watch` and portable settings import/export can be added after the internal plugin surface stabilizes.

### Commands

Commands are the reusable action layer. Menus, command palette, slash commands, buttons, and shortcuts can all point to commands later.

Examples:

- `reference.insertCitation`
- `reference.refreshBibliography`
- `reference.openPanel`

The first implementation collects command contributions from enabled plugins only. App code can list commands through the plugin command adapter and execute a command by id. Plugin command ids should still be namespaced, but app-owned surfaces that know the contributing plugin, such as Settings, context menus, and Quick Open command results, pass the plugin id into the command runner so command lookup is stable even if two internal plugins accidentally expose the same command id. The command runner creates a plugin-scoped context for the contributing plugin, so commands get the same app metadata, namespaced storage model, active-document reader, editor insertion API, and workspace file access as activation. Commands may also receive optional invocation metadata when the command is triggered from a specific surface such as the editor context menu or file tree context menu. Enabled commands are displayed in `Settings -> Extensions -> <plugin>` as plugin-specific actions and can be searched/run from Quick Open alongside files. A richer dedicated command palette can build on the same command adapter later; the workspace titlebar should stay reserved for stable workspace controls such as panel toggles.

### Context Menus

Context menus are placements for existing commands. Plugins should not register arbitrary right-click callbacks; they contribute menu items that point at command ids from the same plugin activation. This keeps Settings buttons, context menus, future command palette entries, and future shortcuts on the same command execution path.

The first implementation supports editor and file tree context menus:

```ts
type FileTreeTargetKind = "markdown" | "folder" | "asset" | "attachment";

type ContextMenuContribution = {
  id: string;
  scope: "editor" | "fileTree";
  items: Array<{
    id: string;
    command: string;
    title?: string;
    when?: {
      document?: "markdown";
      file?: "any" | FileTreeTargetKind;
      selection?: "any" | "nonEmpty";
    };
  }>;
};
```

The app adapter collects enabled plugin context menu contributions, resolves each item to a command contributed by the same plugin, and skips items whose command target is unavailable. The workspace editor and file tree right-click menus show collected items under an **Extension commands** submenu. When a menu item runs, the command receives its normal plugin command context plus invocation metadata:

```ts
type CommandInvocation =
  | {
      source: "editorContextMenu";
      editor?: {
        selectionText?: string;
      };
    }
  | {
      source: "fileTreeContextMenu";
      file: {
        kind: FileTreeTargetKind;
        name: string;
        path: string;
        relativePath: string;
        sizeBytes?: number;
        createdAt?: number;
        modifiedAt?: number;
      };
    }
  | {
      source: "quickOpen";
    }
  | {
      source: "settings";
    };
```

Richer invocation context such as clicked editor node and structured selection range can be added later without changing the command placement model.

### Settings UI

Plugins can contribute settings panels rendered inside Settings -> Extensions. Plugin-specific settings should not become top-level settings sidebar items by default.

Plugin settings panels should use Markra's shared settings UI kit instead of hand-rolled controls. The implementation lives in `@markra/ui/settings`; `@markra/plugin-api/react` directly re-exports the same `Settings*` components and keeps `PluginSettings*` aliases for plugin-oriented naming. This keeps built-in extension settings visually aligned with the rest of the app while keeping the plugin author entry point stable:

```ts
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  SettingsTextInput
} from "@markra/plugin-api/react";
```

The first settings UI kit should include:

- `PluginSettingsSection`
- `PluginSettingsRow`
- `PluginSettingsCallout`
- `PluginSettingsButton`
- `PluginSettingsSwitch`
- `PluginSettingsTextInput`
- `PluginSettingsTextarea`
- `PluginSettingsSelect`
- `PluginSettingsNumberInput`
- `PluginSettingsCheckbox`

The kit should expose enough customization space without letting plugins fork the settings visual language:

- Layout primitives accept `className` plus scoped slot classes such as `headerClassName`, `contentClassName`, `actionClassName`, and `footerClassName`.
- Labels, titles, descriptions, intros, actions, callout descriptions, row metadata, and leading affordances accept `ReactNode`.
- Single-element controls pass through native DOM props such as `id`, `name`, `disabled`, `placeholder`, `rows`, `autoComplete`, and `data-*`.
- Composite controls expose explicit sub-control customization such as `inputClassName`, `inputProps`, `labelClassName`, and `unitClassName`.
- `SettingsSelect` accepts either an `options` array or custom `<option>` / `<optgroup>` children.
- Value-level callbacks such as `onValueChange` and `onCheckedChange` are the primary API. For backwards compatibility with existing app settings, `onChange` is still value-level, not a raw DOM event.

Plugin authors should not import app-internal components such as `SettingsControls.tsx`.

Plugin settings are displayed under `Settings -> Extensions -> <plugin>`. Markra owns the page shell and plugin details:

- Plugin list navigation inside the Extensions category.
- Plugin name, description, version, status, and enable switch.
- Permissions summary.
- Capability summary.
- Diagnostics such as the last activation error.

Plugins only contribute the settings form area. They should render their own form with `SettingsSection`, `SettingsRow`, and the settings controls exported from `@markra/plugin-api/react`; they should not render a full settings page header, plugin enable switch, permissions block, or diagnostics block.

The app settings window should use `useExtensionsSettingsPlugins`, which owns a built-in plugin registry instance, exposes `togglePlugin(id, enabled)`, and adapts registry state into the Extensions page model:

```ts
type ExtensionsSettingsPlugin = PluginRegistryItem & {
  settings?: React.ReactNode;
};
```

Internal plugins are registered through the built-in plugin factory list. The first registered plugin is Document Stats, a small built-in extension used to validate settings, commands, editor context menu placements, side panels, active-document reads, editor insertion, plugin-scoped UI helpers, and plugin-scoped storage. Its manifest appears in the Extensions list while remaining disabled by default. Enabled plugin ids are persisted in app settings as `pluginSettings.enabledPluginIds` and included in settings import/export. When the settings window changes enabled plugin ids, it emits `markra://plugin-settings-changed`; workspace windows listen for that event and reconcile the built-in plugin registry so commands and Pandoc hooks become active without requiring an app restart.

### Side Panels

Plugins can contribute right-side panels, such as a References panel. Panels should be opened explicitly by the user or from a command. Enabling an extension should not automatically make the workspace noisy.

The first implementation adapts enabled plugin side panel contributions into a host model with `pluginId`, `pluginName`, `id`, `title`, `icon`, `defaultWidth`, `location`, and rendered `content`. `useExtensionsSettingsPlugins` exposes the collected `sidePanels`; the workspace titlebar shows an Extensions panel button only when enabled plugins provide panels. Clicking it opens a quiet right-side `PluginSidePanelHost` that uses the panel title, plugin name, optional tab list for multiple panels, and contributed content. Plugins can also call `ctx.ui.openSidePanel(panelId?)` from commands to open one of their own side panels; Markra resolves the request by the calling plugin id, so an extension cannot open another extension's panel. Plugins can call `ctx.ui.showToast(message, options?)` for lightweight host notifications without reaching into the toast implementation. Panels remain closed by default when an extension is enabled.

### Editor

Plugins can contribute editor behavior:

- ProseMirror/Milkdown plugins.
- Input rules.
- Decorations and widgets.
- Serializer/parser contributions when explicitly supported.
- Editor commands such as insert or replace text.

Editor contributions should declare a stage and optional priority. Avoid a single unstructured `externalPlugins` array because editor plugin ordering matters.

The first app adapter collects editor contributions from enabled plugins and exposes them through `useExtensionsSettingsPlugins`. Contributions are sorted by stage order (`inputRules`, `prosePlugins`, `serializer`, `afterCore`), then by higher `priority` first, then by plugin id and contribution id for deterministic output. Calling a contribution's `setup` creates a plugin-scoped context for the contributing plugin. The workspace app resolves enabled editor contributions into Milkdown plugins and passes them into the visual editor; when the enabled editor contribution set changes, the editor instance is recreated so the plugin set is applied predictably.

### Documents And Workspace

Plugins need controlled document and workspace context:

- Get the active document.
- Watch active document changes.
- Watch content changes.
- List workspace files.
- Read text files from the active workspace.
- Ask the user to open a text file through Markra-controlled dialogs.

The first implementation exposes the active-document and editor surface through `ctx.document` and `ctx.editor`:

- `document.getActive()` returns the currently open Markdown document snapshot with `path`, `name`, `content`, `dirty`, `revision`, and optional `sizeBytes`, or `null` when no Markdown document is active.
- `editor.getSelection()` returns a pure-data snapshot of the current visual editor selection with `text`, `from`, `to`, `cursor`, and optional `source`, or `null` when the visual editor selection is unavailable.
- `editor.insertMarkdown(markdown)` inserts Markdown source text at the current editor selection when the visual editor is available and returns whether insertion succeeded.

It also exposes the workspace file surface through `ctx.workspace`:

- `workspace.openTextFile({ title })` opens a Markra-controlled picker and returns `{ path, name, content, sizeBytes? } | null`.
- `workspace.listFiles({ extensions })` lists files under the active workspace root and filters by extension when requested.
- `workspace.readTextFile(path)` reads text through the existing Markra file runtime and rejects paths outside the active workspace root.

The app adapter intentionally wraps existing Markra runtime methods instead of letting plugins call Tauri commands directly. Document watching, source-editor insertion, and richer structured editor APIs remain later integration passes.

### Pandoc Export

First-version export support should focus on Pandoc hooks:

- Adjust markdown before export.
- Append Pandoc arguments.
- Provide temporary files such as CSL, bibliography, or reference docx data.
- Clean up after export.

This is enough for academic citation workflows without designing a full export provider system immediately.

## Extension Manifest

Every extension should declare its metadata and requested access in a manifest file:

```text
markra.extension.json
```

The manifest is the source of truth for install validation, compatibility checks, Extensions UI metadata, capability display, and permission review. Built-in extensions can import or mirror the same metadata in code, but unpacked and packaged extensions must include the file.

Example:

```json
{
  "id": "reference",
  "name": "Reference",
  "version": "0.1.0",
  "apiVersion": 1,
  "description": "Citation tools and Pandoc bibliography export.",
  "author": "Markra",
  "homepage": "https://github.com/markrahq/markra",
  "license": "AGPL-3.0-only",
  "main": "./dist/index.js",
  "style": "./dist/style.css",
  "capabilities": [
    "settings",
    "commands",
    "sidePanel",
    "contextMenu",
    "editor",
    "workspaceFiles",
    "pandocExport"
  ],
  "permissions": {
    "files": {
      "read": "userSelected",
      "write": "none"
    },
    "network": false,
    "native": false
  }
}
```

### Manifest Fields

- `id`: Stable extension id. Use lowercase kebab-case.
- `name`: Human-readable name shown in Settings -> Extensions.
- `version`: Extension version.
- `apiVersion`: Markra plugin API version required by the extension.
- `description`: Short user-facing summary.
- `author`: Optional author or organization.
- `homepage`: Optional project URL.
- `license`: Optional license string.
- `main`: Built JavaScript ESM entry file. Required for unpacked and packaged extensions.
- `style`: Optional CSS file.
- `capabilities`: Feature contributions the extension can add to Markra.
- `permissions`: Resource access requested by the extension.

Capabilities are enforced when a plugin activates. If a plugin returns `commands`, `settings`, `sidePanels`, `contextMenus`, `editor`, or `export` contributions without the matching manifest capability, Markra rejects activation and shows the extension as failed. Empty contribution arrays do not require a capability.

### Capabilities vs Permissions

Capabilities describe what the extension contributes to Markra:

```json
[
  "settings",
  "commands",
  "sidePanel",
  "contextMenu",
  "editor",
  "workspaceFiles",
  "pandocExport"
]
```

Permissions describe what resources the extension can access:

```json
{
  "files": {
    "read": "none | userSelected | workspace",
    "write": "none | userSelected"
  },
  "network": false,
  "native": false
}
```

First-version permissions should stay conservative:

- File reads should be `none`, `userSelected`, or `workspace`.
- File writes should be `none` or `userSelected`.
- Network access should be unsupported and therefore `false`.
- Native access should be unsupported and therefore `false`.

For the Reference extension, `userSelected` file reads are enough for bibliography, CSL, or reference docx selection. It should not need network access or native command access.

The Extensions UI can translate the manifest into user language:

```text
Reference can:
- Add editor behavior
- Add a References side panel
- Change Pandoc export options
- Read files you select

It cannot:
- Access the network
- Run native commands
- Write files without a save dialog
```

## Internal Developer API Shape

Built-in plugin packages should define a plugin with `definePlugin`:

```ts
import { definePlugin } from "@markra/plugin-api";
import { ReferencePanel } from "./ReferencePanel";
import { ReferenceSettings } from "./ReferenceSettings";
import { citationEditorContribution } from "./editor";
import { pandocCitationExportContribution } from "./export";

export default definePlugin({
  manifest: {
    id: "reference",
    name: "Reference",
    version: "0.1.0",
    apiVersion: 1,
    description: "Citation tools and Pandoc bibliography export.",
    capabilities: [
      "settings",
      "commands",
      "sidePanel",
      "contextMenu",
      "editor",
      "workspaceFiles",
      "pandocExport"
    ],
    permissions: {
      files: {
        read: "userSelected",
        write: "none"
      },
      network: false,
      native: false
    }
  },

  activate(ctx) {
    return {
      commands: [
        {
          id: "reference.insertCitation",
          title: "Insert citation",
          run: async () => {
            await ctx.editor.insertText("[@citekey]");
          }
        }
      ],

      contextMenus: [
        {
          id: "reference.editor",
          scope: "editor",
          items: [
            {
              id: "reference.insertCitation.editor",
              command: "reference.insertCitation"
            }
          ]
        }
      ],

      settings: [
        {
          id: "reference.settings",
          title: "Reference",
          component: ReferenceSettings
        }
      ],

      sidePanels: [
        {
          id: "reference.panel",
          title: "References",
          icon: "bookmark",
          location: "right",
          defaultWidth: 320,
          component: ReferencePanel
        }
      ],

      editor: [
        citationEditorContribution()
      ],

      export: [
        pandocCitationExportContribution()
      ]
    };
  }
});
```

Built-in plugin settings components should use `@markra/plugin-api/react`:

```tsx
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsTextInput
} from "@markra/plugin-api/react";

export function ReferenceSettings() {
  return (
    <SettingsSection
      title="Reference"
      actions={<SettingsButton label="Reset reference settings">Reset</SettingsButton>}
    >
      <SettingsRow
        title="Bibliography file"
        description="Choose the bibliography file used for citation lookup."
        meta={<span className="text-[11px] text-(--text-secondary)">BibTeX</span>}
        action={
          <div className="inline-flex items-center gap-2">
            <SettingsTextInput
              label="Bibliography file"
              value="refs.bib"
              widthClassName="w-64"
              onValueChange={() => {}}
            />
            <SettingsButton label="Choose bibliography file">Choose</SettingsButton>
          </div>
        }
      />
    </SettingsSection>
  );
}
```

### Plugin Context

The context should expose capabilities, not internals:

```ts
export type TextFile = {
  content: string;
  name: string;
  path: string;
  sizeBytes?: number;
};

export type WorkspaceFile = {
  kind?: "asset" | "attachment";
  name: string;
  path: string;
  relativePath: string;
  sizeBytes?: number;
};

export type PluginContext = {
  app: {
    version: string;
    apiVersion: number;
    platform: "macos" | "windows" | "linux" | "web";
    language: string;
  };

  storage?: {
    get<T>(key: string, fallback: T): Promise<T>;
    set<T>(key: string, value: T): Promise<unknown>;
    remove(key: string): Promise<unknown>;
  };

  documents: {
    getActive(): Promise<ActiveDocument | null>;
    watchActive(callback: (document: ActiveDocument | null) => unknown): Disposable;
    watchContent(callback: (content: string) => unknown): Disposable;
  };

  workspace: {
    listFiles(options?: { extensions?: string[] }): Promise<WorkspaceFile[]>;
    readTextFile(path: string): Promise<string>;
    openTextFile(options?: { title?: string }): Promise<TextFile | null>;
  };

  editor: {
    getSelection(): Promise<{
      cursor: number;
      from: number;
      source?: "block" | "selection";
      text: string;
      to: number;
    } | null>;
    insertMarkdown(markdown: string): Promise<boolean>;
  };

  ui: {
    openSidePanel(panelId?: string): Promise<boolean>;
    showToast(
      message: string,
      options?: {
        description?: string;
        durationMs?: number;
        status?: "error" | "info" | "success";
      }
    ): unknown;
  };
};
```

Do not expose:

```ts
ctx.tauri.invoke
ctx.appState
ctx.editorView
ctx.setSettings
window.markra
```

If low-level editor access is needed, expose it through `@markra/plugin-api/editor` as an explicit advanced API.

### Command Context

```ts
export type CommandInvocation = {
  source: "editorContextMenu";
  editor?: {
    selectionText?: string;
  };
} | {
  source: "fileTreeContextMenu";
  file: {
    kind: "markdown" | "folder" | "asset" | "attachment";
    name: string;
    path: string;
    relativePath: string;
    sizeBytes?: number;
    createdAt?: number;
    modifiedAt?: number;
  };
} | {
  source: "quickOpen";
} | {
  source: "settings";
};

export type CommandContext = PluginContext & {
  invocation?: CommandInvocation;
};
```

Commands launched from Settings include `source: "settings"`. Commands launched from Quick Open include `source: "quickOpen"`. Commands launched from the editor right-click menu include `source: "editorContextMenu"` and the current selected text when available. Commands launched from the file tree right-click menu include `source: "fileTreeContextMenu"` and the clicked file or folder target.

### Activation Result

```ts
export type PluginActivation = {
  commands?: CommandContribution[];
  contextMenus?: ContextMenuContribution[];
  settings?: SettingsContribution[];
  sidePanels?: SidePanelContribution[];
  editor?: EditorContribution[];
  export?: ExportContribution[];
  dispose?: () => unknown | Promise<unknown>;
};
```

### Editor Contribution

```ts
export type EditorContribution = {
  id: string;
  stage: "inputRules" | "prosePlugins" | "serializer" | "afterCore";
  priority?: number;
  setup: (ctx: EditorPluginContext) => MilkdownPlugin | MilkdownPlugin[];
};
```

The stage keeps extension ordering intentional. Citation rendering, for example, can live in `prosePlugins`; export-specific serialization can use `serializer`.

### Export Contribution

```ts
export type PluginExportHookContext<TExportContext = Record<string, unknown>> = {
  export: TExportContext;
  plugin: PluginContext;
};

export type ExportContribution = {
  id: string;
  pandoc?: {
    beforeExport?: (ctx: PluginExportHookContext<PandocExportData>) => Promise<PandocExportPatch>;
    afterExport?: (ctx: PluginExportHookContext<PandocExportResult>) => Promise<unknown>;
  };
};

export type PandocExportData = Record<string, unknown>;
export type PandocExportResult = Record<string, unknown>;

export type PandocExportPatch = {
  markdown?: string;
  appendArgs?: string[];
  environment?: Record<string, string>;
  temporaryFiles?: Array<{
    name: string;
    content: string | Uint8Array;
  }>;
};
```

The app adapter collects export contributions from enabled plugins and wraps Pandoc hooks so each call receives `{ export, plugin }`. `export` is the data passed by the export pipeline; `plugin` is the plugin-scoped context for the contributing plugin. The workspace app applies `beforeExport` hooks before `saveNativePandocFile`, merging returned `markdown`, `pandocArgs`, and `appendArgs`, then runs `afterExport` hooks after a successful native save.

## User Interface

The product UI should use **Extensions** as the user-facing label.

### Settings Entry

Add one Settings sidebar item:

```text
Extensions
```

Do not add every plugin as a top-level Settings category. Plugin settings should be reached from the Extensions page.

### Extensions Page

The page should follow the existing compact Markra settings style. Avoid a marketplace-like card grid in the first version.

Example structure:

```text
Extensions

Installed

Reference
Citation panel, citation rendering, and Pandoc bibliography export.
Built-in · v0.1.0
[Configure] [toggle]

Developer
Load unpacked extension
Choose a folder containing a Markra extension.
[Choose Folder]
```

If only built-in extensions exist, omit marketplace language such as Browse, Featured, or Store.

When the extension store is introduced, the Extensions page can use three tabs:

```text
Installed | Browse | Developer
```

- `Installed`: Built-in, installed, disabled, failed, and update-available extensions.
- `Browse`: Official extension directory for discovery and installation.
- `Developer`: Load unpacked extensions and local diagnostics.

### Extension Detail

Clicking an extension row or Configure should navigate inline to details:

```text
< Extensions

Reference                                      [Enabled switch]
Academic writing tools for citations and Pandoc export.

Status
Enabled

Version
0.1.0

Source
Built-in

Capabilities
Editor: Renders citation markers
Side panel: Adds References panel
Export: Adds bibliography options to Pandoc exports
Files: Reads selected bibliography and CSL files

Settings
Bibliography file        [Choose...]
Citation style           [APA v7        v]
Pandoc reference docx    [Choose...]

Danger Zone
[Reset Extension Settings]
```

Capabilities should be visible in user language. Users do not need API terminology, but they should understand where an extension affects the app.

### Workspace Surface

Enabling an extension should not automatically open persistent UI. For a side-panel extension:

- Add a right-side panel button.
- Add related commands.
- Keep the panel closed until the user opens it.
- Include an Open action if useful.

## Extension Store

The extension store should be a later phase, after the internal plugin system has shipped with built-in extensions. It is not part of the first implementation. The recommended future model is a lightweight curated directory, similar in spirit to Obsidian's community plugin directory:

- The official directory lists accepted extensions.
- Extension authors keep source, release artifacts, and version metadata in their own repositories.
- First publication requires review.
- Routine version releases are self-service.
- Permission or ownership changes require review again.

Avoid building a full marketplace backend until the ecosystem needs self-service accounts, paid extensions, ratings, download analytics, moderation queues, or private registries.

### Store Data Layers

Use three data layers:

```text
Official registry index     Browse list
Extension detail manifest   Detail page and install confirmation
Extension update feed       Installed extension update checks
```

The Browse list should not request every extension repository. It should request one official aggregated index:

```text
https://extensions.markra.app/index.v1.json
```

The app should use the index for listing, search, filtering, categories, verified status, latest known version, and permission summaries.

Example index:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-05T00:00:00Z",
  "extensions": [
    {
      "id": "reference",
      "name": "Reference",
      "publisher": "markra",
      "description": "Citation tools and Pandoc bibliography export.",
      "categories": ["writing", "export"],
      "latestVersion": "0.2.0",
      "apiVersion": 1,
      "verified": true,
      "capabilities": ["settings", "commands", "sidePanel", "contextMenu", "editor", "pandocExport"],
      "permissionsSummary": {
        "filesRead": "userSelected",
        "filesWrite": "none",
        "network": false,
        "native": false
      },
      "detailUrl": "https://extensions.markra.app/extensions/reference.json"
    }
  ]
}
```

### Browse UI

Keep the Browse page compact and product-like. It should not use marketplace hero sections, rankings, ratings, or promotional cards in the first version.

Example:

```text
Browse Extensions

Search extensions...

Academic Writing

Reference
Citation panel, citation rendering, and Pandoc bibliography export.
By Markra · AGPL-3.0 · v0.2.0
[View] [Install]
```

Simple categories are enough:

```text
All | Writing | Export | Editor | Themes | Tools
```

### Store Detail Page

The detail page can load `detailUrl` lazily when the user opens a specific extension.

Example:

```text
< Browse

Reference                                      [Install]
Citation tools and Pandoc bibliography export.

Publisher
Markra

Version
0.2.0

Compatibility
Requires Markra Plugin API v1

Capabilities
- Adds a References side panel
- Adds editor citation rendering
- Adds Pandoc export options
- Adds extension settings

Permissions
- Reads files you choose
- Does not access the network
- Does not run native commands
- Does not write files without a save dialog

Links
Homepage · Source · License

Package
Signed by Markra
Checksum verified
```

Installing an extension that runs JavaScript should require a clear confirmation:

```text
Install Reference?

Extensions run code inside Markra. Only install extensions from sources you trust.

Reference can:
- Add editor behavior
- Add a side panel
- Change Pandoc export options
- Read files you choose

[Cancel] [Install]
```

### Official Registry

The official registry can start as a GitHub repository that publishes static JSON to `extensions.markra.app`:

```text
markrahq/markra-extensions
  publishers/
    markra.json
  extensions/
    reference.json
  schema/
    registry.schema.json
    extension.schema.json
    publisher.schema.json
```

First publication should require a pull request that registers:

- Extension id.
- Publisher id.
- Display metadata.
- Source or homepage URL.
- `updateUrl`.
- Public signing keys.
- Allowed capabilities.
- Allowed permissions.

Example registry entry:

```json
{
  "id": "reference",
  "publisher": "markra",
  "name": "Reference",
  "source": "https://github.com/markrahq/markra-reference",
  "updateUrl": "https://markrahq.github.io/markra-reference/markra-updates.json",
  "publicKeys": ["..."],
  "allowedCapabilities": ["settings", "commands", "sidePanel", "contextMenu", "editor", "pandocExport"],
  "allowedPermissions": {
    "files": {
      "read": "userSelected",
      "write": "none"
    },
    "network": false,
    "native": false
  }
}
```

### Author Update Feed

After an extension is accepted into the official registry, routine version releases should not require a new pull request. The author should publish releases through their own update feed:

```text
markra-updates.json
```

Example:

```json
{
  "id": "reference",
  "versions": [
    {
      "version": "0.2.0",
      "apiVersion": 1,
      "packageUrl": "https://github.com/markrahq/markra-reference/releases/download/v0.2.0/reference-0.2.0.markra-extension",
      "sha256": "...",
      "signature": "...",
      "releasedAt": "2026-07-05T00:00:00Z",
      "changelog": "Adds bibliography file discovery.",
      "capabilities": ["settings", "commands", "sidePanel", "contextMenu", "editor", "pandocExport"],
      "permissions": {
        "files": {
          "read": "userSelected",
          "write": "none"
        },
        "network": false,
        "native": false
      }
    }
  ]
}
```

Markra should accept a routine update only if:

- The package hash matches `sha256`.
- The signature verifies against a public key listed in the official registry.
- The plugin API version is compatible.
- The new capabilities are within `allowedCapabilities`.
- The new permissions are within `allowedPermissions`.

### Review Triggers

A registry pull request should be required for:

- First publication.
- Publisher transfer.
- Public key changes.
- Extension id changes.
- New sensitive capabilities.
- Permissions that exceed the existing allowed permissions.

Routine bug fixes and feature releases should not require review if they stay within the approved capability and permission envelope.

### Update Frequency And Caching

Client requests should stay conservative:

- Store index: automatically check at most once every 24 hours.
- Extension details: request when opened, then cache for 24 hours.
- Installed extension updates: automatically check at most once every 24 hours.
- Manual refresh: run immediately.
- Package download: only when the user installs or updates.

Add jitter and backoff:

- Delay startup checks by 30-120 seconds.
- Add a random client offset, such as 0-6 hours, to avoid synchronized requests.
- Back off after failures or `429` responses: 6 hours, then 24 hours, then 48 hours.

The official registry generator can refresh the aggregated index a few times per day:

```text
Small scale: every 6 hours
Medium scale: every 12 hours
Large scale: once per day plus publish-triggered refresh
```

Serve registry files from a stable Markra-owned domain:

```text
https://extensions.markra.app
```

The initial host can be GitHub Pages or another static host, but the app should not hard-code GitHub URLs. This leaves room to move to Cloudflare Pages/R2, S3 plus CDN, Vercel, or Netlify later.

Recommended cache headers:

```http
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
ETag: "..."
```

The client should persist:

```text
lastCheckedAt
etag
cachedIndex
```

and use conditional requests such as `If-None-Match` where possible.

## Installation And Execution Model

### Phase 1: Built-In Extensions

The first implementation should support built-in extensions only. These are workspace packages imported by Markra and built into the app bundle.

Example:

```text
packages/reference/src/index.ts
```

Users can enable or disable the extension, but they do not install it separately.

### Phase 2: Load Unpacked For Developers

After built-in plugins are proven, developer mode can support loading a local built plugin folder:

```text
my-extension/
  markra.extension.json
  dist/index.js
  dist/style.css
  package.json
```

Markra should:

1. Read `markra.extension.json`.
2. Validate `id`, `name`, `version`, `apiVersion`, `main`, `capabilities`, and `permissions`.
3. Check API compatibility.
4. Show capabilities and permissions.
5. Ask for confirmation.
6. Register the extension as a development extension.
7. Load `dist/index.js` only when enabled.
8. Call `dispose()` on disable.

Markra should not run package manager commands, install dependencies, run postinstall scripts, compile TypeScript, or execute build scripts.

### Phase 3: Packaged Extension Files

A future installable format could be a zip-like package:

```text
reference.markra-extension
```

Contents:

```text
markra.extension.json
dist/index.js
dist/style.css
assets/
README.md
LICENSE
```

Installation would validate and copy the package into Markra's user data directory, then leave it disabled until the user enables it.

## JavaScript Execution

External code extensions ultimately run JavaScript. Markra should not `eval` plugin source code or compile TypeScript at runtime. It should dynamically load a built ESM entry file.

Conceptually:

```ts
const module = await import(extensionEntryUrl);
const plugin = module.default;
const activation = await plugin.activate(ctx);
```

This still means executing plugin JavaScript. If that code runs in the same WebView as Markra, it should be treated as trusted code. Tauri limits some native access by default, but same-window plugin JavaScript can still affect the renderer environment. A true untrusted plugin model would require a stronger isolation design and is outside the first version.

The product should communicate this clearly for unpacked or third-party code:

```text
Only install extensions from sources you trust. Extensions run code inside Markra.
```

## Suggested Implementation Phases

### Phase 1: Internal Plugin Foundation

- Add `@markra/plugin-api`.
- Add a built-in plugin registry in `@markra/app`.
- Add lifecycle, storage, command, context menu, settings, side panel, editor, document, workspace, and Pandoc export contribution plumbing.
- Verify that no enabled plugins preserves current behavior.

### Phase 2: Internal Extensions UI

- Add Settings -> Extensions.
- Add extension list, details view, capability display, enable/disable switch, and error states.
- Broadcast enabled extension changes from the settings window and refresh workspace plugin registries without restart.
- Render enabled command contributions in each extension detail view and Quick Open.
- Render enabled editor and file tree context menu command placements in workspace right-click menus.
- Render enabled side panel contributions through the workspace right-side panel host.
- Add built-in extension registration.

### Phase 3: Reference Extension

- Move citation/reference functionality into `packages/reference`.
- Use only the plugin API to add settings, side panel, context menu items, editor contribution, commands, and Pandoc export hooks.
- Keep Markra usable when the extension is disabled.

### Phase 4: Developer Load Unpacked

- Add developer-mode local folder loading for built ESM plugins.
- Add clear trust warnings.
- Do not support runtime dependency install or runtime TypeScript compilation.

### Phase 5: Static Extension Registry

- Add a Markra-owned registry index endpoint.
- Add Browse tab backed by the aggregated index.
- Add detail page backed by lazy-loaded extension detail data.
- Add install flow with checksum verification and permission confirmation.

### Phase 6: Author Update Feeds

- Add update feed support for installed extensions.
- Add package signature verification.
- Add capability and permission envelope checks.
- Add update UI for available versions and permission upgrades.

## Open Questions

- Should built-in extensions be enabled by default or opt-in?
- Which editor contribution stages are needed beyond `inputRules`, `prosePlugins`, `serializer`, and `afterCore`?
- Should plugin CSS be loaded globally, scoped by convention, or injected into a plugin-owned root?
- How much of the workspace file system should plugins see by default?
- What criteria should promote `@markra/plugin-api` from internal contract to public third-party API?
- Should the registry require signatures in the first public store version, or start with checksums and add signatures before community submissions?
- Should Markra support custom/private registries, or keep the first store tied to the official registry only?
