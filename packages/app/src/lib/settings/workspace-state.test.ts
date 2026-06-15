import { createSettingsStoreHarness, resetSettingsStoreRuntime, setupSettingsStoreHarness } from "../../test/settings-store";
import { getStoredWorkspaceState, saveStoredWorkspaceState } from "./app-settings";

const settingsStore = createSettingsStoreHarness();
const { loadStore: mockedLoadStore, store } = settingsStore;

describe("workspace state settings", () => {
  beforeEach(() => {
    setupSettingsStoreHarness(settingsStore);
  });

  afterEach(() => {
    resetSettingsStoreRuntime();
  });

  it("loads the last workspace state from settings", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/notes.md",
        " ",
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: [
        {
          filePath: "/mock-files/vault/README.md",
          label: "main",
          openFilePaths: [
            "/mock-files/vault/notes.md",
            "/mock-files/vault/README.md",
            "/mock-files/vault/notes.md"
          ]
        },
        {
          filePath: " ",
          label: "blank-window",
          openFilePaths: []
        },
        {
          filePath: "/mock-files/vault/archive.md",
          label: "main",
          openFilePaths: ["/mock-files/vault/archive.md"]
        }
      ],
      activeDraftId: "untitled:1",
      draftTabs: [
        {
          content: "# Local draft\n\nStill unsaved.",
          id: "untitled:1",
          name: " Draft.md ",
          path: null
        },
        {
          content: "",
          id: "file:/mock-files/vault/README.md",
          name: "README.md",
          path: " /mock-files/vault/README.md "
        },
        {
          content: "# Duplicate",
          id: "untitled:1",
          name: "Duplicate.md",
          path: null
        },
        {
          content: "   ",
          id: "untitled:blank",
          name: "Blank.md",
          path: null
        }
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await expect(getStoredWorkspaceState()).resolves.toEqual({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/notes.md",
        "/mock-files/vault/README.md"
      ],
      openWindows: [
        {
          filePath: "/mock-files/vault/README.md",
          label: "main",
          openFilePaths: [
            "/mock-files/vault/notes.md",
            "/mock-files/vault/README.md"
          ]
        }
      ],
      activeDraftId: "untitled:1",
      draftTabs: [
        {
          content: "# Local draft\n\nStill unsaved.",
          id: "untitled:1",
          name: "Draft.md",
          path: null
        },
        {
          content: "",
          id: "file:/mock-files/vault/README.md",
          name: "README.md",
          path: "/mock-files/vault/README.md"
        }
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    expect(store.get).toHaveBeenCalledWith("workspace");
  });

  it("merges and persists partial workspace state updates", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: null,
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/notes.md"],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/notes.md",
        sideFilePath: "/mock-files/vault/archive.md"
      }
    });

    await saveStoredWorkspaceState({
      filePath: "/mock-files/vault/README.md",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    expect(store.set).toHaveBeenCalledWith("workspace", {
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: [],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("clears the saved side-by-side workspace group", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await saveStoredWorkspaceState({
      sideBySideGroup: null
    });

    expect(store.set).toHaveBeenCalledWith("workspace", {
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: [
        "/mock-files/vault/README.md",
        "/mock-files/vault/notes.md"
      ],
      openWindows: []
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("clears saved workspace draft tabs", async () => {
    store.get.mockResolvedValue({
      activeDraftId: "untitled:1",
      aiAgentSessionId: "session-a",
      draftTabs: [
        {
          content: "# Draft",
          id: "untitled:1",
          name: "Draft.md",
          path: null
        }
      ],
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: []
    });

    await saveStoredWorkspaceState({
      activeDraftId: null,
      draftTabs: []
    });

    expect(store.set).toHaveBeenCalledWith("workspace", {
      aiAgentSessionId: "session-a",
      filePath: null,
      fileTreeOpen: false,
      folderName: null,
      folderPath: null,
      openFilePaths: [],
      openWindows: []
    });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("drops a side-by-side workspace group when one grouped file is not open", async () => {
    store.get.mockResolvedValue({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/README.md"],
      sideBySideGroup: {
        primaryFilePath: "/mock-files/vault/README.md",
        sideFilePath: "/mock-files/vault/notes.md"
      }
    });

    await expect(getStoredWorkspaceState()).resolves.toEqual({
      aiAgentSessionId: "session-a",
      filePath: "/mock-files/vault/README.md",
      fileTreeOpen: true,
      folderName: "vault",
      folderPath: "/mock-files/vault",
      openFilePaths: ["/mock-files/vault/README.md"],
      openWindows: []
    });
  });
});
