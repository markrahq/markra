import { render, screen } from "@testing-library/react";
import { definePlugin, type PluginActivation, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { SettingsRow, SettingsSection, SettingsTextInput } from "../../components/settings/SettingsControls";
import { ExtensionsSettings } from "../../components/settings/ExtensionsSettings";
import { t } from "@markra/shared";
import { createPluginRegistry, type BuiltInPluginFactory } from "./registry";
import { listExtensionsSettingsPlugins } from "./settings";

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

function translate(key: Parameters<typeof t>[1]) {
  return t("en", key);
}

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
        action={<SettingsTextInput label="Bibliography file" value="refs.bib" onValueChange={() => {}} />}
      />
    </SettingsSection>
  );
}

describe("plugin settings adapter", () => {
  it("maps enabled plugin settings contributions into the extensions settings model", async () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      settings: [
        {
          component: ReferenceSettings,
          id: "reference.settings",
          title: "Reference settings"
        }
      ]
    })));

    await registry.enable("reference", {});

    render(<ExtensionsSettings plugins={listExtensionsSettingsPlugins(registry)} translate={translate} />);

    expect(screen.getByRole("button", { name: "Reference Enabled" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reference settings" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bibliography file" })).toHaveValue("refs.bib");
  });

  it("keeps disabled plugin metadata visible without rendering inactive settings", () => {
    const registry = createPluginRegistry({ apiVersion: 1 });
    registry.registerBuiltIn(createFactory(referenceManifest, () => ({
      settings: [
        {
          component: ReferenceSettings,
          id: "reference.settings",
          title: "Reference settings"
        }
      ]
    })));

    render(<ExtensionsSettings plugins={listExtensionsSettingsPlugins(registry)} translate={translate} />);

    expect(screen.getByRole("button", { name: "Reference Disabled" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reference settings" })).not.toBeInTheDocument();
    expect(screen.getByText("This extension does not provide configurable settings.")).toBeInTheDocument();
  });
});
