import type { PluginManifest } from "./manifest.ts";

export type Disposable = {
  dispose: () => unknown | Promise<unknown>;
};

export type PluginStorage = {
  get: <T>(key: string, fallback: T) => Promise<T>;
  remove: (key: string) => Promise<unknown>;
  set: <T>(key: string, value: T) => Promise<unknown>;
};

export type PluginTextFile = {
  content: string;
  name: string;
  path: string;
  sizeBytes?: number;
};

export type PluginWorkspaceFile = {
  createdAt?: number;
  kind?: "asset" | "attachment";
  modifiedAt?: number;
  name: string;
  path: string;
  relativePath: string;
  sizeBytes?: number;
};

export type PluginOpenTextFileOptions = {
  title?: string;
};

export type PluginWorkspaceListFilesOptions = {
  extensions?: readonly string[];
};

export type PluginWorkspace = {
  listFiles: (options?: PluginWorkspaceListFilesOptions) => Promise<PluginWorkspaceFile[]>;
  openTextFile: (options?: PluginOpenTextFileOptions) => Promise<PluginTextFile | null>;
  readTextFile: (path: string) => Promise<string>;
};

export type PluginActiveDocument = {
  content: string;
  dirty: boolean;
  name: string;
  path: string | null;
  revision: number;
  sizeBytes?: number;
};

export type PluginDocument = {
  getActive: () => Promise<PluginActiveDocument | null>;
};

export type PluginEditor = {
  insertMarkdown: (markdown: string) => Promise<boolean>;
};

export type PluginContext = {
  app?: {
    apiVersion: number;
    language: string;
    platform: "linux" | "macos" | "web" | "windows";
    version: string;
  };
  document?: PluginDocument;
  editor?: PluginEditor;
  storage?: PluginStorage;
  workspace?: PluginWorkspace;
};

export type PluginCommandContext = PluginContext;

export type PluginCommandContribution = {
  description?: string;
  id: string;
  run: (ctx: PluginCommandContext) => unknown | Promise<unknown>;
  title: string;
};

export type PluginSettingsContribution = {
  component: unknown;
  id: string;
  title: string;
};

export type PluginSidePanelContribution = {
  component: unknown;
  defaultWidth?: number;
  icon?: string;
  id: string;
  location: "right";
  title: string;
};

export type PluginEditorContribution = {
  id: string;
  priority?: number;
  setup: (ctx: PluginContext) => unknown | readonly unknown[];
  stage: "afterCore" | "inputRules" | "prosePlugins" | "serializer";
};

export type PluginExportHookContext<TExportContext = Record<string, unknown>> = {
  export: TExportContext;
  plugin: PluginContext;
};

export type PluginExportContribution = {
  id: string;
  pandoc?: {
    afterExport?: (ctx: PluginExportHookContext) => Promise<unknown>;
    beforeExport?: (ctx: PluginExportHookContext) => Promise<unknown>;
  };
};

export type PluginActivation = {
  commands?: PluginCommandContribution[];
  dispose?: () => unknown | Promise<unknown>;
  editor?: PluginEditorContribution[];
  export?: PluginExportContribution[];
  settings?: PluginSettingsContribution[];
  sidePanels?: PluginSidePanelContribution[];
};

export type MarkraPlugin = {
  activate?: (ctx: PluginContext) => PluginActivation | Promise<PluginActivation>;
  manifest: PluginManifest;
};

export function definePlugin<Plugin extends MarkraPlugin>(plugin: Plugin) {
  return plugin;
}
