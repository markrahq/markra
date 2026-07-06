import { createElement } from "react";
import { definePlugin, type PluginContext, type PluginManifest } from "@markra/plugin-api";
import { DocumentStatsPanel } from "./DocumentStatsPanel";
import { DocumentStatsSettings } from "./DocumentStatsSettings";
import { analyzeMarkdown, formatDocumentStatsMarkdown } from "./stats";
import { loadDocumentStatsOptions } from "./storage";

export const documentStatsManifest: PluginManifest = {
  apiVersion: 1,
  capabilities: ["settings", "commands", "sidePanel", "contextMenu"],
  description: "Basic writing statistics for the active Markdown document.",
  id: "document-stats",
  main: "./dist/index.js",
  name: "Document Stats",
  permissions: {
    files: {
      read: "none",
      write: "none"
    },
    native: false,
    network: false
  },
  version: "0.1.0"
};

export function createDocumentStatsPlugin() {
  return definePlugin({
    manifest: documentStatsManifest,
    activate(ctx: PluginContext) {
      return {
        commands: [
          {
            description: "Insert a summary of the active Markdown document statistics.",
            id: "document-stats.insertSummary",
            title: "Insert document stats",
            run: insertDocumentStatsSummary
          },
          {
            description: "Open the live document statistics panel.",
            id: "document-stats.openPanel",
            title: "Open document stats panel",
            run: openDocumentStatsPanel
          }
        ],
        contextMenus: [
          {
            id: "document-stats.editor",
            scope: "editor",
            items: [
              {
                command: "document-stats.insertSummary",
                id: "document-stats.insertSummary.editor"
              }
            ]
          }
        ],
        settings: [
          {
            component: createElement(DocumentStatsSettings, { storage: ctx.storage }),
            id: "document-stats.settings",
            title: "Document Stats"
          }
        ],
        sidePanels: [
          {
            component: createElement(DocumentStatsPanel, { document: ctx.document, storage: ctx.storage }),
            defaultWidth: 320,
            icon: "bar-chart",
            id: "document-stats.panel",
            location: "right",
            title: "Document Stats"
          }
        ]
      };
    }
  });
}

function openDocumentStatsPanel(ctx: PluginContext) {
  return ctx.ui?.openSidePanel("document-stats.panel") ?? false;
}

async function insertDocumentStatsSummary(ctx: PluginContext) {
  const activeDocument = await ctx.document?.getActive();
  if (!activeDocument || !ctx.editor) return false;

  const options = await loadDocumentStatsOptions(ctx.storage);
  const stats = analyzeMarkdown(activeDocument.content, options);

  return ctx.editor.insertMarkdown(formatDocumentStatsMarkdown(stats, activeDocument.name));
}
