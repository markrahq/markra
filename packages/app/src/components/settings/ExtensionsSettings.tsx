import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { I18nKey } from "@markra/shared";
import type {
  PluginCapability,
  PluginFileReadPermissionGrant,
  PluginFileWritePermissionGrant
} from "@markra/plugin-api";
import type { ExtensionsSettingsPlugin } from "../../lib/plugins/settings";
import type { PluginRegistryStatus } from "../../lib/plugins/registry";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsControls";

type Translate = (key: I18nKey) => string;

export type ExtensionsSettingsProps = {
  onTogglePlugin?: (id: string, enabled: boolean) => unknown;
  plugins: readonly ExtensionsSettingsPlugin[];
  translate: Translate;
};

const capabilityLabelKeys: Record<PluginCapability, I18nKey> = {
  commands: "settings.extensions.capability.commands",
  editor: "settings.extensions.capability.editor",
  pandocExport: "settings.extensions.capability.pandocExport",
  settings: "settings.extensions.capability.settings",
  sidePanel: "settings.extensions.capability.sidePanel",
  workspaceFiles: "settings.extensions.capability.workspaceFiles"
};

export function ExtensionsSettings({ onTogglePlugin, plugins, translate }: ExtensionsSettingsProps) {
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(() => plugins[0]?.manifest.id ?? null);

  useEffect(() => {
    if (plugins.some((plugin) => plugin.manifest.id === selectedPluginId)) return;

    setSelectedPluginId(plugins[0]?.manifest.id ?? null);
  }, [plugins, selectedPluginId]);

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.manifest.id === selectedPluginId) ?? plugins[0] ?? null,
    [plugins, selectedPluginId]
  );

  if (plugins.length === 0) {
    return (
      <section className="extensions-settings-empty max-w-[68ch] py-3" aria-labelledby="extensions-empty-title">
        <h3
          className="m-0 text-[15px] leading-6 font-bold tracking-normal text-(--text-heading)"
          id="extensions-empty-title"
        >
          {translate("settings.extensions.emptyTitle")}
        </h3>
        <p className="m-0 mt-1 text-[13px] leading-5 font-[450] text-(--text-secondary)">
          {translate("settings.extensions.emptyDescription")}
        </p>
      </section>
    );
  }

  return (
    <div className="extensions-settings grid min-h-0 grid-cols-[minmax(190px,240px)_minmax(0,1fr)] gap-7 max-[860px]:grid-cols-1">
      <nav
        className="extensions-settings-list flex min-w-0 flex-col gap-1"
        aria-label={translate("settings.extensions.pluginListLabel")}
      >
        {plugins.map((plugin) => {
          const statusLabel = pluginStatusLabel(plugin.status, translate);
          const selected = plugin.manifest.id === selectedPlugin?.manifest.id;

          return (
            <button
              key={plugin.manifest.id}
              className="group grid min-h-14 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-(--bg-hover) aria-current:bg-(--bg-active) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
              type="button"
              aria-current={selected ? "page" : undefined}
              aria-label={`${plugin.manifest.name} ${statusLabel}`}
              onClick={() => setSelectedPluginId(plugin.manifest.id)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] leading-5 font-[650] text-(--text-heading)">
                  {plugin.manifest.name}
                </span>
                <span className="block truncate text-[12px] leading-4.5 font-[450] text-(--text-secondary)">
                  {plugin.manifest.description}
                </span>
              </span>
              <span className={pluginStatusBadgeClassName(plugin.status)}>{statusLabel}</span>
            </button>
          );
        })}
      </nav>

      {selectedPlugin ? (
        <section className="extensions-settings-detail min-w-0" aria-labelledby="extensions-plugin-title">
          <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5">
            <div className="min-w-0">
              <h3
                className="m-0 text-[17px] leading-6 font-bold tracking-normal text-(--text-heading)"
                id="extensions-plugin-title"
              >
                {selectedPlugin.manifest.name}
              </h3>
              <p className="m-0 mt-1 max-w-[72ch] text-[13px] leading-5 font-[450] text-(--text-secondary)">
                {selectedPlugin.manifest.description}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={pluginStatusBadgeClassName(selectedPlugin.status)}>
                  {pluginStatusLabel(selectedPlugin.status, translate)}
                </span>
                <span className="text-[12px] leading-5 font-[560] text-(--text-secondary)">
                  v{selectedPlugin.manifest.version}
                </span>
              </div>
            </div>
            <SettingsSwitch
              checked={selectedPlugin.enabled}
              label={
                selectedPlugin.enabled
                  ? translate("settings.extensions.disablePlugin")
                  : translate("settings.extensions.enablePlugin")
              }
              onCheckedChange={(enabled) => onTogglePlugin?.(selectedPlugin.manifest.id, enabled)}
            />
          </header>

          <section
            className="extensions-plugin-settings mb-8"
            aria-labelledby="extensions-plugin-settings-title"
          >
            <h3
              className="m-0 mb-3 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)"
              id="extensions-plugin-settings-title"
            >
              {translate("settings.extensions.settings")}
            </h3>
            {selectedPlugin.settings ? (
              selectedPlugin.settings
            ) : (
              <div className="py-4 text-[13px] leading-5 font-[450] text-(--text-secondary)">
                {translate("settings.extensions.noSettings")}
              </div>
            )}
          </section>

          <SettingsSection label={translate("settings.extensions.permissions")}>
            <SettingsRow
              title={translate("settings.extensions.filesRead")}
              action={
                <PermissionValue>
                  {fileReadPermissionLabel(selectedPlugin.manifest.permissions.files.read, translate)}
                </PermissionValue>
              }
            />
            <SettingsRow
              title={translate("settings.extensions.filesWrite")}
              action={
                <PermissionValue>
                  {fileWritePermissionLabel(selectedPlugin.manifest.permissions.files.write, translate)}
                </PermissionValue>
              }
            />
            <SettingsRow
              title={translate("settings.extensions.network")}
              action={
                <PermissionValue>
                  {selectedPlugin.manifest.permissions.network
                    ? translate("settings.extensions.allowed")
                    : translate("settings.extensions.notAllowed")}
                </PermissionValue>
              }
            />
            <SettingsRow
              title={translate("settings.extensions.native")}
              action={
                <PermissionValue>
                  {selectedPlugin.manifest.permissions.native
                    ? translate("settings.extensions.allowed")
                    : translate("settings.extensions.notAllowed")}
                </PermissionValue>
              }
            />
          </SettingsSection>

          <SettingsSection label={translate("settings.extensions.capabilities")}>
            <div className="flex flex-wrap gap-2 py-4">
              {selectedPlugin.manifest.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-full bg-(--bg-secondary) px-2.5 py-1 text-[12px] leading-4 font-[560] text-(--text-secondary)"
                >
                  {translate(capabilityLabelKeys[capability])}
                </span>
              ))}
            </div>
          </SettingsSection>

          {selectedPlugin.error ? (
            <SettingsSection label={translate("settings.extensions.diagnostics")}>
              <SettingsRow
                title={translate("settings.extensions.lastError")}
                action={
                  <span className="max-w-80 text-right text-[12px] leading-5 font-[560] text-(--text-heading)">
                    {selectedPlugin.error}
                  </span>
                }
              />
            </SettingsSection>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PermissionValue({ children }: { children: ReactNode }) {
  return <span className="text-[12px] leading-5 font-[560] text-(--text-secondary)">{children}</span>;
}

function pluginStatusLabel(status: PluginRegistryStatus, translate: Translate) {
  if (status === "enabled") return translate("settings.extensions.enabled");
  if (status === "failed") return translate("settings.extensions.failed");

  return translate("settings.extensions.disabled");
}

function pluginStatusBadgeClassName(status: PluginRegistryStatus) {
  const colorClassName = status === "enabled"
    ? "bg-(--bg-active) text-(--accent)"
    : status === "failed"
      ? "bg-(--bg-secondary) text-(--text-heading)"
      : "bg-(--bg-secondary) text-(--text-secondary)";

  return `inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-[650] ${colorClassName}`;
}

function fileReadPermissionLabel(permission: PluginFileReadPermissionGrant, translate: Translate) {
  if (permission === "workspace") return translate("settings.extensions.permissionWorkspace");
  if (permission === "userSelected") return translate("settings.extensions.permissionUserSelected");

  return translate("settings.extensions.permissionNone");
}

function fileWritePermissionLabel(permission: PluginFileWritePermissionGrant, translate: Translate) {
  if (permission === "userSelected") return translate("settings.extensions.permissionUserSelected");

  return translate("settings.extensions.permissionNone");
}
