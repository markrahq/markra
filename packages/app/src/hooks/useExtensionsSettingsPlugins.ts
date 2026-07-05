import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PluginContext, PluginDocument, PluginEditor } from "@markra/plugin-api";
import { appVersion } from "../lib/app-version";
import { builtInPluginFactories } from "../lib/plugins/built-ins";
import { listPluginCommands, runPluginCommand, type PluginCommand } from "../lib/plugins/commands";
import { listPluginEditorContributions, type PluginEditorContribution } from "../lib/plugins/editor";
import { listPluginExportContributions, type PluginExportContribution } from "../lib/plugins/export";
import { listExtensionsSettingsPlugins } from "../lib/plugins/settings";
import { listPluginSidePanels, type PluginSidePanel } from "../lib/plugins/side-panels";
import { createPluginStorage } from "../lib/plugins/storage";
import { createPluginWorkspace } from "../lib/plugins/workspace";
import {
  getStoredPluginSettings,
  saveStoredPluginSettings,
  type PluginSettings
} from "../lib/settings/app-settings";
import {
  listenAppPluginSettingsChanged,
  notifyAppPluginSettingsChanged
} from "../lib/settings/settings-events";
import {
  createPluginRegistry,
  type BuiltInPluginFactory,
  type PluginRegistry
} from "../lib/plugins/registry";
import type { ExtensionsSettingsPlugin } from "../lib/plugins/settings";

const markraPluginApiVersion = 1;

export type ExtensionsSettingsPluginPlatform = NonNullable<PluginContext["app"]>["platform"];

export type UseExtensionsSettingsPluginsOptions = {
  document?: PluginDocument;
  editor?: PluginEditor;
  factories?: readonly BuiltInPluginFactory[];
  language: string;
  platform: ExtensionsSettingsPluginPlatform;
  workspaceRootPath?: string | null;
};

export type UseExtensionsSettingsPluginsResult = {
  commands: PluginCommand[];
  editorContributions: PluginEditorContribution[];
  exportContributions: PluginExportContribution[];
  runCommand: (id: string) => Promise<unknown>;
  sidePanels: PluginSidePanel[];
  plugins: ExtensionsSettingsPlugin[];
  togglePlugin: (id: string, enabled: boolean) => Promise<unknown>;
};

export function useExtensionsSettingsPlugins({
  document,
  editor,
  factories = builtInPluginFactories,
  language,
  platform,
  workspaceRootPath = null
}: UseExtensionsSettingsPluginsOptions): UseExtensionsSettingsPluginsResult {
  const registryRef = useRef<PluginRegistry | null>(null);
  const pluginSettingsVersionRef = useRef(0);
  const [revision, setRevision] = useState(0);

  if (!registryRef.current) {
    registryRef.current = createPluginRegistry({ apiVersion: markraPluginApiVersion });
    for (const factory of factories) {
      registryRef.current.registerBuiltIn(factory);
    }
  }

  const registry = registryRef.current;
  const workspace = useMemo(() => createPluginWorkspace({ rootPath: workspaceRootPath }), [workspaceRootPath]);
  const pluginContext = useMemo<PluginContext>(() => ({
    app: {
      apiVersion: markraPluginApiVersion,
      language,
      platform,
      version: appVersion
    },
    document,
    editor,
    workspace
  }), [document, editor, language, platform, workspace]);
  const createPluginContext = useCallback((id: string): PluginContext => ({
    ...pluginContext,
    storage: createPluginStorage(id)
  }), [pluginContext]);
  const createPluginContextRef = useRef(createPluginContext);
  createPluginContextRef.current = createPluginContext;
  const commands = useMemo(() => listPluginCommands(registry), [registry, revision]);
  const editorContributions = useMemo(() =>
    listPluginEditorContributions(registry, createPluginContext), [createPluginContext, registry, revision]);
  const exportContributions = useMemo(() =>
    listPluginExportContributions(registry, createPluginContext), [createPluginContext, registry, revision]);
  const plugins = useMemo(() => listExtensionsSettingsPlugins(registry), [registry, revision]);
  const sidePanels = useMemo(() => listPluginSidePanels(registry), [registry, revision]);
  const reconcilePluginSettings = useCallback(async (
    settings: PluginSettings,
    options: { shouldContinue?: () => boolean } = {}
  ) => {
    const enabledPluginIds = new Set(settings.enabledPluginIds);

    for (const plugin of registry.listPlugins()) {
      if (options.shouldContinue?.() === false) return;

      if (enabledPluginIds.has(plugin.manifest.id)) {
        await registry.enable(plugin.manifest.id, createPluginContextRef.current(plugin.manifest.id)).catch(() => null);
      } else if (plugin.enabled) {
        await registry.disable(plugin.manifest.id).catch(() => null);
      }
    }
  }, [registry]);

  useEffect(() => {
    let cancelled = false;
    const restoreVersion = pluginSettingsVersionRef.current;

    getStoredPluginSettings()
      .then((settings) =>
        reconcilePluginSettings(settings, {
          shouldContinue: () => !cancelled && pluginSettingsVersionRef.current === restoreVersion
        }))
      .finally(() => {
        if (!cancelled && pluginSettingsVersionRef.current === restoreVersion) {
          setRevision((currentRevision) => currentRevision + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reconcilePluginSettings]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => unknown) | null = null;

    listenAppPluginSettingsChanged(async (settings) => {
      pluginSettingsVersionRef.current += 1;
      const eventVersion = pluginSettingsVersionRef.current;

      await reconcilePluginSettings(settings, {
        shouldContinue: () => !cancelled && pluginSettingsVersionRef.current === eventVersion
      });
      if (!cancelled && pluginSettingsVersionRef.current === eventVersion) {
        setRevision((currentRevision) => currentRevision + 1);
      }
    })
      .then((listenerCleanup) => {
        if (cancelled) {
          listenerCleanup();
          return;
        }

        cleanup = listenerCleanup;
      })
      .catch(() => null);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [reconcilePluginSettings]);

  const togglePlugin = useCallback((id: string, enabled: boolean) => {
    pluginSettingsVersionRef.current += 1;
    const operation = enabled ? registry.enable(id, createPluginContext(id)) : registry.disable(id);

    return operation
      .catch(() => null)
      .then(async () => {
        const nextSettings = {
          enabledPluginIds: registry.listPlugins()
            .filter((plugin) => plugin.enabled)
            .map((plugin) => plugin.manifest.id)
        };

        await saveStoredPluginSettings(nextSettings);
        await notifyAppPluginSettingsChanged(nextSettings).catch(() => null);
      })
      .finally(() => {
        setRevision((currentRevision) => currentRevision + 1);
      });
  }, [createPluginContext, registry]);

  const runCommand = useCallback((id: string) =>
    runPluginCommand(registry, id, createPluginContext), [createPluginContext, registry]);

  return {
    commands,
    editorContributions,
    exportContributions,
    plugins,
    sidePanels,
    runCommand,
    togglePlugin
  };
}
