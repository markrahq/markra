import { fireEvent, render, screen } from "@testing-library/react";
import { t } from "@markra/shared";
import type { PluginManifest } from "@markra/plugin-api";
import type { ExtensionsSettingsPlugin } from "../../lib/plugins/settings";
import { SettingsRow, SettingsSection, SettingsTextInput } from "./SettingsControls";
import { ExtensionsSettings } from "./ExtensionsSettings";

function translate(key: Parameters<typeof t>[1]) {
  return t("en", key);
}

const referenceManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["settings", "commands", "workspaceFiles", "pandocExport"],
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

const failedManifest: PluginManifest = {
  ...referenceManifest,
  capabilities: ["settings"],
  description: "Synthetic failed plugin.",
  id: "broken-export",
  name: "Broken Export",
  permissions: {
    files: {
      read: "workspace",
      write: "userSelected"
    },
    native: false,
    network: false
  },
  version: "0.2.0"
};

function createPlugin(overrides: Partial<ExtensionsSettingsPlugin> = {}): ExtensionsSettingsPlugin {
  return {
    commands: [],
    enabled: true,
    manifest: referenceManifest,
    settings: (
      <SettingsSection label="Citation">
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
    ),
    status: "enabled",
    ...overrides
  };
}

describe("ExtensionsSettings", () => {
  it("shows an empty state when no plugins are installed", () => {
    render(<ExtensionsSettings plugins={[]} translate={translate} />);

    expect(screen.getByText("No extensions installed")).toBeInTheDocument();
    expect(screen.getByText("Internal plugins will appear here once they are registered.")).toBeInTheDocument();
  });

  it("lets the plugin list and detail panes scroll independently", () => {
    const { container } = render(
      <ExtensionsSettings
        plugins={[
          createPlugin(),
          createPlugin({
            manifest: {
              ...referenceManifest,
              description: "Synthetic notes extension.",
              id: "notes",
              name: "Notes"
            }
          })
        ]}
        translate={translate}
      />
    );

    expect(container.querySelector(".extensions-settings")).toHaveClass("h-full", "overflow-hidden");
    expect(container.querySelector(".extensions-settings-list")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain"
    );
    expect(container.querySelector(".extensions-settings-detail")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain"
    );
  });

  it("shows plugin details, settings, permissions, and enable controls", () => {
    const onTogglePlugin = vi.fn();

    render(
      <ExtensionsSettings
        plugins={[createPlugin()]}
        onTogglePlugin={onTogglePlugin}
        translate={translate}
      />
    );

    expect(screen.getByRole("button", { name: "Reference Enabled" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Reference" })).toBeInTheDocument();
    expect(screen.getAllByText("Reference tools for synthetic examples.")).toHaveLength(2);
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Bibliography file")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bibliography file" })).toHaveValue("refs.bib");
    expect(screen.getByText("Read files")).toBeInTheDocument();
    expect(screen.getByText("User-selected files")).toBeInTheDocument();
    expect(screen.getByText("Pandoc export")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Disable extension" }));

    expect(onTogglePlugin).toHaveBeenCalledWith("reference", false);
  });

  it("shows enabled plugin commands in the plugin detail view", () => {
    const onRunPluginCommand = vi.fn();

    render(
      <ExtensionsSettings
        plugins={[
          createPlugin({
            commands: [
              {
                description: "Insert a synthetic citation.",
                id: "reference.insertCitation",
                title: "Insert synthetic citation"
              }
            ]
          })
        ]}
        onRunPluginCommand={onRunPluginCommand}
        translate={translate}
      />
    );

    expect(screen.getByRole("heading", { name: "Commands" })).toBeInTheDocument();
    expect(screen.getByText("Insert synthetic citation")).toBeInTheDocument();
    expect(screen.getByText("Insert a synthetic citation.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Insert synthetic citation" }));

    expect(onRunPluginCommand).toHaveBeenCalledWith(
      "reference.insertCitation",
      {
        source: "settings"
      },
      "reference"
    );
  });

  it("switches between plugin details and shows activation errors", () => {
    render(
      <ExtensionsSettings
        plugins={[
          createPlugin(),
          createPlugin({
            enabled: false,
            error: "Activation failed",
            manifest: failedManifest,
            settings: null,
            status: "failed"
          })
        ]}
        translate={translate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Broken Export Failed" }));

    expect(screen.getByRole("heading", { name: "Broken Export" })).toBeInTheDocument();
    expect(screen.getAllByText("Synthetic failed plugin.")).toHaveLength(2);
    expect(screen.getByText("Activation failed")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace files").length).toBeGreaterThan(0);
    expect(screen.getByText("User-selected files")).toBeInTheDocument();
    expect(screen.getByText("This extension does not provide configurable settings.")).toBeInTheDocument();
  });
});
