import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { PluginContext, PluginStorage } from "@markra/plugin-api";
import { createDocumentStatsPlugin } from "./index";

function createMemoryStorage(initialValues: Record<string, unknown> = {}): PluginStorage {
  const store = new Map(Object.entries(initialValues));

  return {
    async get<T>(key: string, fallback: T) {
      return store.has(key) ? store.get(key) as T : fallback;
    },
    async remove(key: string) {
      store.delete(key);
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
    }
  };
}

function createContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    app: {
      apiVersion: 1,
      language: "en",
      platform: "macos",
      version: "0.0.0-test"
    },
    document: {
      async getActive() {
        return {
          content: "# Example\n\nOne two three.",
          dirty: false,
          name: "example.md",
          path: "/mock/example.md",
          revision: 1,
          sizeBytes: 24
        };
      }
    },
    editor: {
      async getSelection() {
        return null;
      },
      async insertMarkdown() {
        return true;
      }
    },
    storage: createMemoryStorage(),
    ...overrides
  };
}

describe("document stats plugin", () => {
  it("declares internal metadata for the built-in extension", () => {
    const plugin = createDocumentStatsPlugin();

    expect(plugin.manifest).toMatchObject({
      apiVersion: 1,
      capabilities: ["settings", "commands", "sidePanel", "contextMenu"],
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
    });
  });

  it("inserts a markdown stats summary through its command", async () => {
    const insertMarkdown = vi.fn(async () => true);
    const context = createContext({
      editor: {
        async getSelection() {
          return null;
        },
        insertMarkdown
      }
    });
    const activation = await createDocumentStatsPlugin().activate?.(context);

    await activation?.commands?.[0]?.run(context);

    expect(insertMarkdown).toHaveBeenCalledWith([
      "## Document Stats",
      "",
      "- Document: example.md",
      "- Words: 4",
      "- Characters: 18",
      "- Paragraphs: 1",
      "- Headings: 1",
      "- Reading time: 1 min"
    ].join("\n"));
  });

  it("opens its side panel through a command", async () => {
    const openSidePanel = vi.fn(async () => true);
    const context = createContext({
      ui: {
        openSidePanel,
        showToast: vi.fn()
      }
    });
    const activation = await createDocumentStatsPlugin().activate?.(context);
    const openPanelCommand = activation?.commands?.find((command) => command.id === "document-stats.openPanel");

    await expect(openPanelCommand?.run(context)).resolves.toBe(true);
    expect(openSidePanel).toHaveBeenCalledWith("document-stats.panel");
  });

  it("places its insert summary command in the editor context menu", async () => {
    const activation = await createDocumentStatsPlugin().activate?.(createContext());

    expect(activation?.contextMenus).toEqual([
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
    ]);
  });

  it("renders settings and side panel contributions", async () => {
    const context = createContext();
    const activation = await createDocumentStatsPlugin().activate?.(context);

    render(
      <>
        {activation?.settings?.[0]?.component}
        {activation?.sidePanels?.[0]?.component}
      </>
    );

    await waitFor(() => {
      expect(screen.getByText("Reading speed")).toBeInTheDocument();
      expect(screen.getByRole("spinbutton", { name: "Reading speed" })).toHaveValue(250);
      expect(screen.getByText("Words")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });
});
