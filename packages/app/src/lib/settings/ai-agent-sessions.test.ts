import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { configureAppRuntime, createDefaultAppRuntime, type RuntimeStore } from "../../runtime";
import {
  createAiAgentSessionId,
  deleteStoredAiAgentSession,
  getStoredAiAgentPreferences,
  getStoredAiAgentSession,
  initializeStoredAiAgentSession,
  listStoredAiAgentSessions,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle,
  setStoredAiAgentSessionArchived
} from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("AI agent session settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads a stored AI agent session for the current document", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockResolvedValue(sessionStore as unknown as RuntimeStore);
    sessionStore.get.mockResolvedValue({
      draft: "follow up",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: true,
      webSearchEnabled: false
    });

    await expect(getStoredAiAgentSession("session-a")).resolves.toMatchObject({
      draft: "follow up",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: true,
      webSearchEnabled: false
    });

    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/session-a.json", {
      autoSave: false,
      defaults: {}
    });
    expect(sessionStore.get).toHaveBeenCalledWith("session");
  });

  it("persists AI agent session state and updates the session index", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "follow up",
      messages: [{ id: 1, role: "assistant", text: "hi", thinking: "..." }],
      panelOpen: true,
      panelWidth: 480,
      thinkingEnabled: true,
      webSearchEnabled: true
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/session-a.json", {
      autoSave: false,
      defaults: {}
    });
    expect(mockedLoadStore).toHaveBeenCalledWith("ai-agent-sessions/index.json", {
      autoSave: false,
      defaults: {}
    });
    expect(sessionStore.set).toHaveBeenCalledWith("session", {
      agentModelId: null,
      agentProviderId: null,
      draft: "follow up",
      messages: [expect.objectContaining({ id: 1, isError: false, role: "assistant", text: "hi", thinking: "..." })],
      panelOpen: true,
      panelWidth: 480,
      thinkingEnabled: true,
      webSearchEnabled: true
    });
    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      messageCount: 1,
      title: "hi",
      titleSource: "fallback",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        messageCount: 1,
        title: "hi",
        titleSource: "fallback",
        workspaceKey: "/mock-files/vault"
      })
    ]);
    expect(sessionStore.save).toHaveBeenCalledTimes(1);
    expect(indexStore.save).toHaveBeenCalledTimes(1);
  });

  it("does not move an existing AI agent session to a different workspace during autosave", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue({
      archivedAt: null,
      createdAt: 10,
      id: "session-a",
      messageCount: 1,
      title: "Folder chat",
      titleSource: "manual",
      updatedAt: 20,
      workspaceKey: "/mock-files/vault"
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [{ id: 1, role: "user", text: "hello" }],
      panelOpen: true,
      panelWidth: 384,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault/docs/guide.md"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        workspaceKey: "/mock-files/vault"
      })
    ]);
  });

  it("lists stored AI agent sessions for the active workspace", async () => {
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    indexStore.get.mockResolvedValue([
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      },
      {
        archivedAt: null,
        createdAt: 2,
        id: "session-b",
        messageCount: 1,
        title: "Second session",
        titleSource: "fallback",
        updatedAt: 40,
        workspaceKey: "/mock-files/other"
      },
      {
        archivedAt: 60,
        createdAt: 3,
        id: "session-c",
        messageCount: 2,
        title: null,
        titleSource: null,
        updatedAt: 50,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await expect(listStoredAiAgentSessions("/mock-files/vault")).resolves.toEqual([
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      }
    ]);
    await expect(listStoredAiAgentSessions("/mock-files/vault", { includeArchived: true })).resolves.toEqual([
      {
        archivedAt: 60,
        createdAt: 3,
        id: "session-c",
        messageCount: 2,
        title: null,
        titleSource: null,
        updatedAt: 50,
        workspaceKey: "/mock-files/vault"
      },
      {
        archivedAt: null,
        createdAt: 1,
        id: "session-a",
        messageCount: 3,
        title: "First session",
        titleSource: "ai",
        updatedAt: 30,
        workspaceKey: "/mock-files/vault"
      }
    ]);
  });

  it("archives and restores an AI agent session without deleting its file", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          archivedAt: null,
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "Gold audit session",
          titleSource: "manual",
          updatedAt: 12,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "hello" },
          { id: 2, role: "assistant", text: "hi" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([
      {
        archivedAt: null,
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "Gold audit session",
        titleSource: "manual",
        updatedAt: 12,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await setStoredAiAgentSessionArchived("session-a", true);

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      archivedAt: expect.any(Number),
      id: "session-a",
      title: "Gold audit session"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        archivedAt: expect.any(Number),
        id: "session-a"
      })
    ]);

    await setStoredAiAgentSessionArchived("session-a", false);

    expect(sessionStore.set).toHaveBeenLastCalledWith("meta", expect.objectContaining({
      archivedAt: null,
      id: "session-a"
    }));
  });

  it("initializes a blank AI agent session file for a new workspace chat", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      draft: "",
      messages: [],
      panelOpen: false,
      panelWidth: null,
      thinkingEnabled: false,
      webSearchEnabled: false
    });
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-new",
        messageCount: 0,
        title: null,
        titleSource: null,
        workspaceKey: "/mock-files/vault"
      })
    ]);
  });

  it("uses remembered AI agent thinking preference when initializing a new session", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    store.get.mockImplementation(async (key) =>
      key === "aiAgentPreferences" ? { thinkingEnabled: true, webSearchEnabled: true } : undefined
    );
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", expect.objectContaining({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek",
      thinkingEnabled: true,
      webSearchEnabled: true
    }));
  });

  it("lets new AI agent sessions use explicit mode options over remembered preferences", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-new.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    store.get.mockImplementation(async (key) =>
      key === "aiAgentPreferences" ? { thinkingEnabled: false, webSearchEnabled: false } : undefined
    );
    sessionStore.get.mockResolvedValue(undefined);
    indexStore.get.mockResolvedValue([]);

    await initializeStoredAiAgentSession("session-new", "/mock-files/vault", {
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: true
    });

    expect(sessionStore.set).toHaveBeenCalledWith("session", expect.objectContaining({
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: true
    }));
  });

  it("loads and persists AI agent preferences", async () => {
    store.get.mockResolvedValue({ thinkingEnabled: true, webSearchEnabled: true });

    await expect(getStoredAiAgentPreferences()).resolves.toEqual({ thinkingEnabled: true, webSearchEnabled: true });
    await saveStoredAiAgentPreferences({ thinkingEnabled: false });

    expect(store.set).toHaveBeenCalledWith("aiAgentPreferences", { thinkingEnabled: false, webSearchEnabled: true });
    expect(store.save).toHaveBeenCalledTimes(1);

    store.set.mockClear();
    store.save.mockClear();
    store.get.mockResolvedValue({ thinkingEnabled: true, webSearchEnabled: false });

    await saveStoredAiAgentPreferences({ webSearchEnabled: true });

    expect(store.set).toHaveBeenCalledWith("aiAgentPreferences", { thinkingEnabled: true, webSearchEnabled: true });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("persists an AI-generated session title without losing workspace metadata", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "look into gold pricing issue",
          titleSource: "fallback",
          updatedAt: 11,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "Check this dataset" },
          { id: 2, role: "assistant", text: "Gold price looks wrong" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([
      {
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "look into gold pricing issue",
        titleSource: "fallback",
        updatedAt: 11,
        workspaceKey: "/mock-files/vault"
      }
    ]);

    await saveStoredAiAgentSessionTitle("session-a", "Gold and XAU pricing audit", {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      id: "session-a",
      title: "Gold and XAU pricing audit",
      titleSource: "ai",
      workspaceKey: "/mock-files/vault"
    }));
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-a",
        title: "Gold and XAU pricing audit",
        titleSource: "ai"
      })
    ]);
  });

  it("keeps an existing AI-generated session title on later session saves", async () => {
    const sessionStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockResolvedValue({
      createdAt: 10,
      id: "session-a",
      messageCount: 2,
      title: "Gold and XAU pricing audit",
      titleSource: "ai",
      updatedAt: 11,
      workspaceKey: "/mock-files/vault"
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [
        { id: 1, role: "user", text: "hello" },
        { id: 2, role: "assistant", text: "hi" }
      ],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      title: "Gold and XAU pricing audit",
      titleSource: "ai"
    }));
  });

  it("persists a manually renamed session title and keeps it on later session saves", async () => {
    const sessionStore = {
      delete: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    sessionStore.get.mockImplementation(async (key) => {
      if (key === "meta") {
        return {
          createdAt: 10,
          id: "session-a",
          messageCount: 2,
          title: "fallback title",
          titleSource: "fallback",
          updatedAt: 11,
          workspaceKey: "/mock-files/vault"
        };
      }

      return {
        draft: "",
        messages: [
          { id: 1, role: "user", text: "hello" },
          { id: 2, role: "assistant", text: "hi" }
        ],
        panelOpen: true,
        panelWidth: 420,
        thinkingEnabled: false,
        webSearchEnabled: false
      };
    });
    indexStore.get.mockResolvedValue([]);

    await saveStoredAiAgentSessionTitle("session-a", "Gold audit session", {
      source: "manual",
      workspaceKey: "/mock-files/vault"
    });

    sessionStore.get.mockResolvedValue({
      createdAt: 10,
      id: "session-a",
      messageCount: 2,
      title: "Gold audit session",
      titleSource: "manual",
      updatedAt: 12,
      workspaceKey: "/mock-files/vault"
    });

    await saveStoredAiAgentSession("session-a", {
      agentModelId: null,
      agentProviderId: null,
      draft: "",
      messages: [
        { id: 1, role: "user", text: "hello" },
        { id: 2, role: "assistant", text: "hi again" }
      ],
      panelOpen: true,
      panelWidth: 420,
      thinkingEnabled: false,
      webSearchEnabled: false
    }, {
      workspaceKey: "/mock-files/vault"
    });

    expect(sessionStore.set).toHaveBeenCalledWith("meta", expect.objectContaining({
      title: "Gold audit session",
      titleSource: "manual"
    }));
  });

  it("deletes a stored AI agent session and removes it from the session index", async () => {
    const deleteAttachmentSession = vi.fn(async () => undefined);
    const sessionStore = {
      delete: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    const indexStore = {
      get: vi.fn(),
      save: vi.fn(),
      set: vi.fn()
    };
    mockedLoadStore.mockImplementation(async (path) => {
      if (path === "ai-agent-sessions/session-a.json") return sessionStore as unknown as RuntimeStore;
      if (path === "ai-agent-sessions/index.json") return indexStore as unknown as RuntimeStore;

      return store as unknown as RuntimeStore;
    });
    indexStore.get.mockResolvedValue([
      {
        createdAt: 10,
        id: "session-a",
        messageCount: 2,
        title: "Gold audit session",
        titleSource: "manual",
        updatedAt: 12,
        workspaceKey: "/mock-files/vault"
      },
      {
        createdAt: 11,
        id: "session-b",
        messageCount: 1,
        title: "Another session",
        titleSource: "fallback",
        updatedAt: 13,
        workspaceKey: "/mock-files/vault"
      }
    ]);
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      aiChatAttachments: {
        deleteSession: deleteAttachmentSession,
        read: async () => [],
        save: async () => undefined
      },
      settings: {
        loadStore: mockedLoadStore
      }
    });

    await deleteStoredAiAgentSession("session-a");

    expect(sessionStore.delete).toHaveBeenCalledWith("session");
    expect(sessionStore.delete).toHaveBeenCalledWith("meta");
    expect(indexStore.set).toHaveBeenCalledWith("entries", [
      expect.objectContaining({
        id: "session-b",
        title: "Another session"
      })
    ]);
    expect(deleteAttachmentSession).toHaveBeenCalledWith("session-a");
  });

  it("generates a random AI agent session id from crypto when available", () => {
    globalThis.crypto.randomUUID = vi.fn(
      (): ReturnType<Crypto["randomUUID"]> => "00000000-0000-4000-8000-000000000000"
    );

    expect(createAiAgentSessionId()).toBe("00000000-0000-4000-8000-000000000000");
  });
});
