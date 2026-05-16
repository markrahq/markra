import { act, renderHook, waitFor } from "@testing-library/react";
import { generateAiAgentSessionTitle, runDocumentAiAgent } from "@markra/ai";
import {
  getStoredAiAgentSession,
  getStoredAiAgentPreferences,
  getStoredAiAgentSessionSummary,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle
} from "../lib/settings/app-settings";
import type { I18nKey } from "@markra/shared";
import { useAiAgentSession } from "./useAiAgentSession";
import { storedAgentSession, testProvider } from "../test/ai-fixtures";

vi.mock("@markra/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@markra/ai")>();

  return {
    ...actual,
    generateAiAgentSessionTitle: vi.fn(),
    runDocumentAiAgent: vi.fn()
  };
});

vi.mock("../lib/settings/app-settings", () => ({
  getStoredAiAgentSession: vi.fn(),
  getStoredAiAgentPreferences: vi.fn(),
  getStoredAiAgentSessionSummary: vi.fn(),
  saveStoredAiAgentPreferences: vi.fn(),
  saveStoredAiAgentSession: vi.fn(),
  saveStoredAiAgentSessionTitle: vi.fn()
}));

const mockedRunDocumentAiAgent = vi.mocked(runDocumentAiAgent);
const mockedGenerateAiAgentSessionTitle = vi.mocked(generateAiAgentSessionTitle);
const mockedGetStoredAiAgentSession = vi.mocked(getStoredAiAgentSession);
const mockedGetStoredAiAgentPreferences = vi.mocked(getStoredAiAgentPreferences);
const mockedGetStoredAiAgentSessionSummary = vi.mocked(getStoredAiAgentSessionSummary);
const mockedSaveStoredAiAgentPreferences = vi.mocked(saveStoredAiAgentPreferences);
const mockedSaveStoredAiAgentSession = vi.mocked(saveStoredAiAgentSession);
const mockedSaveStoredAiAgentSessionTitle = vi.mocked(saveStoredAiAgentSessionTitle);

function testTranslate(translations: Partial<Record<I18nKey, string>> = {}) {
  return (key: I18nKey) => translations[key] ?? key;
}

type AiAgentSessionContext = Parameters<typeof useAiAgentSession>[0];

function aiAgentSessionContext(overrides: Partial<AiAgentSessionContext> = {}): AiAgentSessionContext {
  return {
    getDocumentContent: () => "# Draft",
    model: "gpt-5.5",
    provider: testProvider(),
    settingsLoading: false,
    translate: (key) => key,
    workspaceFiles: [],
    ...overrides
  };
}

function renderAiAgentSession(overrides: Partial<AiAgentSessionContext> = {}) {
  return renderHook(() => useAiAgentSession(aiAgentSessionContext(overrides)));
}

describe("useAiAgentSession", () => {
  beforeEach(() => {
    mockedRunDocumentAiAgent.mockReset();
    mockedGenerateAiAgentSessionTitle.mockReset();
    mockedGetStoredAiAgentSession.mockReset();
    mockedGetStoredAiAgentPreferences.mockReset();
    mockedGetStoredAiAgentSessionSummary.mockReset();
    mockedSaveStoredAiAgentPreferences.mockReset();
    mockedSaveStoredAiAgentSession.mockReset();
    mockedSaveStoredAiAgentSessionTitle.mockReset();
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession());
    mockedGetStoredAiAgentSessionSummary.mockResolvedValue(null);
    mockedGetStoredAiAgentPreferences.mockResolvedValue({ thinkingEnabled: false, webSearchEnabled: false });
    mockedGenerateAiAgentSessionTitle.mockResolvedValue("Polish GOLD and XAU price notes");
    mockedSaveStoredAiAgentPreferences.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSession.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSessionTitle.mockResolvedValue(undefined);
  });

  it("streams an assistant reply into the transcript", async () => {
    mockedRunDocumentAiAgent.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta?.("Hello");

      return { content: "Hello", finishReason: "stop" };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.submit("Summarize this");
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.messages).toEqual([
      { id: expect.any(Number), role: "user", text: "Summarize this" },
      {
        activities: [
          {
            id: "call:1",
            kind: "ai_call",
            label: "app.aiAgentTraceCall 1",
            status: "completed",
            turn: 1
          }
        ],
        id: expect.any(Number),
        role: "assistant",
        text: "Hello",
        thinking: ""
      }
    ]);
  });

  it("preserves multiple assistant thinking rounds from one agent run", async () => {
    mockedRunDocumentAiAgent.mockImplementation(async ({ onEvent, onThinkingDelta }) => {
      onThinkingDelta?.("Inspecting the document structure.");
      onEvent?.({
        message: {
          content: [{ thinking: "Inspecting the document structure.", type: "thinking" }],
          role: "assistant",
          stopReason: "toolUse"
        },
        type: "message_end"
      } as Parameters<NonNullable<typeof onEvent>>[0]);
      onThinkingDelta?.("Preparing the insertion.");
      onThinkingDelta?.("Preparing the insertion near the end of the document.");
      onEvent?.({
        message: {
          content: [{ thinking: "Preparing the insertion near the end of the document.", type: "thinking" }],
          role: "assistant",
          stopReason: "stop"
        },
        type: "message_end"
      } as Parameters<NonNullable<typeof onEvent>>[0]);

      return {
        content: "Prepared.",
        finishReason: "stop"
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.submit("Insert something.");
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      text: "Prepared.",
      thinking: "Preparing the insertion near the end of the document.",
      thinkingTurns: [
        "Inspecting the document structure.",
        "Preparing the insertion near the end of the document."
      ]
    });
  });

  it("surfaces provider configuration errors without calling the runtime", async () => {
    const { result } = renderAiAgentSession({
      getDocumentContent: () => "",
      model: null,
      provider: null,
      translate: (key) => (key === "app.aiMissingProvider" ? "Missing provider" : key)
    });

    await act(async () => {
      await result.current.submit("Hello");
    });

    expect(mockedRunDocumentAiAgent).not.toHaveBeenCalled();
    expect(result.current.messages.at(-1)).toEqual({
      id: expect.any(Number),
      isError: true,
      role: "assistant",
      text: "Missing provider"
    });
    expect(result.current.status).toBe("error");
  });

  it("forwards document edit tool results into the editor preview flow", async () => {
    const onAiResult = vi.fn();
    mockedRunDocumentAiAgent.mockImplementation(async ({ onPreviewResult }) => {
      onPreviewResult?.({
        from: 4,
        original: "Draft",
        replacement: "Polished draft",
        to: 9,
        type: "replace"
      });

      return {
        content: "I prepared a polished replacement for the current selection.",
        finishReason: "stop"
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      getSelection: () => ({
        from: 4,
        source: "selection",
        text: "Draft",
        to: 9
      }),
      onAiResult
    });

    await act(async () => {
      await result.current.submit("Polish this");
    });

    expect(onAiResult).toHaveBeenCalledWith({
      from: 4,
      original: "Draft",
      replacement: "Polished draft",
      to: 9,
      type: "replace"
    }, undefined);
  });

  it("forwards preview ids for multiple prepared editor previews", async () => {
    const onAiResult = vi.fn();
    mockedRunDocumentAiAgent.mockImplementation(async ({ onPreviewResult }) => {
      onPreviewResult?.({
        from: 4,
        original: "",
        replacement: "## Intro",
        to: 4,
        type: "insert"
      }, "tool-intro");
      onPreviewResult?.({
        from: 4,
        original: "",
        replacement: "## Summary",
        to: 4,
        type: "insert"
      }, "tool-summary");

      return {
        content: "",
        finishReason: "stop",
        preparedPreview: true
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      onAiResult
    });

    await act(async () => {
      await result.current.submit("Add an intro and summary");
    });

    expect(onAiResult).toHaveBeenNthCalledWith(1, {
      from: 4,
      original: "",
      replacement: "## Intro",
      to: 4,
      type: "insert"
    }, "tool-intro");
    expect(onAiResult).toHaveBeenNthCalledWith(2, {
      from: 4,
      original: "",
      replacement: "## Summary",
      to: 4,
      type: "insert"
    }, "tool-summary");
  });

  it("notifies that the latest prepared editor preview is ready after the agent finishes", async () => {
    const onAiResult = vi.fn();
    const onAiPreviewReady = vi.fn();
    const latestPreview = {
      from: 4,
      original: "",
      replacement: "## Summary",
      to: 4,
      type: "insert" as const
    };
    mockedRunDocumentAiAgent.mockImplementation(async ({ onPreviewResult }) => {
      onPreviewResult?.({
        from: 4,
        original: "",
        replacement: "## Intro",
        to: 4,
        type: "insert"
      }, "tool-intro");
      onPreviewResult?.(latestPreview, "tool-summary");

      expect(onAiPreviewReady).not.toHaveBeenCalled();

      return {
        content: "",
        finishReason: "stop",
        preparedPreview: true
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      onAiPreviewReady,
      onAiResult
    });

    await act(async () => {
      await result.current.submit("Add an intro and summary");
    });

    expect(onAiResult).toHaveBeenCalledWith(latestPreview, "tool-summary");
    expect(onAiPreviewReady).toHaveBeenCalledWith(latestPreview, "tool-summary");
  });

  it("passes editor table anchors to the document agent runtime", async () => {
    const tableAnchors = [
      {
        description: "Markdown table Section Alpha table: Field / Variant One / Variant Two",
        from: 42,
        id: "table:0",
        kind: "table" as const,
        text: "| Field | Variant One | Variant Two |\n| ----- | ----------- | ----------- |",
        title: "Section Alpha table",
        to: 91
      }
    ];
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Done",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      getDocumentContent: () => "# Section Alpha",
      getTableAnchors: () => tableAnchors
    });

    await act(async () => {
      await result.current.submit("Update the synthetic table");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      tableAnchors
    }));
  });

  it("passes editor section anchors to the document agent runtime", async () => {
    const sectionAnchors = [
      {
        description: "Section Section Alpha",
        from: 42,
        id: "section:0",
        kind: "section" as const,
        text: "Section Alpha\n\nSynthetic body",
        title: "Section Alpha",
        to: 91
      }
    ];
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Done",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      getDocumentContent: () => "# Section Alpha\n\nSynthetic body",
      getSectionAnchors: () => sectionAnchors
    });

    await act(async () => {
      await result.current.submit("Rewrite the synthetic section");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      sectionAnchors
    }));
  });

  it("does not turn a prepared editor preview into an empty-response error", async () => {
    const onAiResult = vi.fn();
    mockedRunDocumentAiAgent.mockImplementation(async ({ onPreviewResult }) => {
      onPreviewResult?.({
        from: 0,
        original: "",
        replacement: "# Synthetic comparison title",
        to: 0,
        type: "insert"
      });

      return {
        content: "",
        finishReason: "stop"
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      getDocumentContent: () => "",
      onAiResult,
      translate: testTranslate({
        "app.aiAgentPreviewReady": "The editor change is ready.",
        "app.aiEmptyResponse": "AI returned no usable text."
      })
    });

    await act(async () => {
      await result.current.submit("Write a comparison");
    });

    expect(onAiResult).toHaveBeenCalledWith({
      from: 0,
      original: "",
      replacement: "# Synthetic comparison title",
      to: 0,
      type: "insert"
    }, undefined);
    expect(result.current.status).toBe("idle");
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      text: "The editor change is ready."
    });
    expect(result.current.messages.at(-1)?.isError).not.toBe(true);
  });

  it("carries prepared editor preview details into the next agent turn history", async () => {
    const preview = {
      from: 10,
      original: "old-token",
      replacement: "new-token",
      target: {
        from: 10,
        id: "table:0",
        kind: "table" as const,
        title: "Cost impact",
        to: 19
      },
      to: 19,
      type: "replace" as const
    };
    mockedRunDocumentAiAgent
      .mockImplementationOnce(async ({ onPreviewResult }) => {
        onPreviewResult?.(preview);

        return {
          content: "",
          finishReason: "stop",
          preparedPreview: true
        };
      })
      .mockResolvedValueOnce({
        content: "Follow-up synthetic answer",
        finishReason: "stop"
      });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      getDocumentContent: () => "# Section Alpha",
      translate: testTranslate({
        "app.aiAgentPreviewReady": "The editor change is ready."
      })
    });

    await act(async () => {
      await result.current.submit("Prepare synthetic edit");
    });

    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe("The editor change is ready."));

    await act(async () => {
      await result.current.submit("Follow-up synthetic request");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledTimes(2);
    expect(mockedRunDocumentAiAgent.mock.calls[1]?.[0].history).toEqual([
      { preview: undefined, previews: undefined, role: "user", text: "Prepare synthetic edit" },
      {
        preview,
        previews: [preview],
        role: "assistant",
        text: "The editor change is ready."
      }
    ]);
  });

  it("carries multiple prepared editor previews into the next agent turn history", async () => {
    const introPreview = {
      from: 10,
      original: "",
      replacement: "## Synthetic intro",
      to: 10,
      type: "insert" as const
    };
    const summaryPreview = {
      from: 28,
      original: "",
      replacement: "## Synthetic summary",
      to: 28,
      type: "insert" as const
    };
    mockedRunDocumentAiAgent
      .mockImplementationOnce(async ({ onPreviewResult }) => {
        onPreviewResult?.(introPreview);
        onPreviewResult?.(summaryPreview);

        return {
          content: "",
          finishReason: "stop",
          preparedPreview: true
        };
      })
      .mockResolvedValueOnce({
        content: "Follow-up synthetic answer",
        finishReason: "stop"
      });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      getDocumentContent: () => "# Section Alpha",
      translate: testTranslate({
        "app.aiAgentPreviewReady": "The editor change is ready."
      })
    });

    await act(async () => {
      await result.current.submit("Prepare synthetic edits");
    });

    await waitFor(() => expect(result.current.messages.at(-1)?.text).toBe("The editor change is ready."));

    await act(async () => {
      await result.current.submit("Follow-up synthetic request");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledTimes(2);
    expect(mockedRunDocumentAiAgent.mock.calls[1]?.[0].history).toEqual([
      { preview: undefined, previews: undefined, role: "user", text: "Prepare synthetic edits" },
      {
        preview: summaryPreview,
        previews: [introPreview, summaryPreview],
        role: "assistant",
        text: "The editor change is ready."
      }
    ]);
  });

  it("passes the workspace file reader to the document agent runtime", async () => {
    const readWorkspaceFile = vi.fn(async () => "# Nearby");
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Done",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      readWorkspaceFile,
      sessionId: "session-a",
      workspaceFiles: [
        {
          name: "nearby.md",
          path: "/vault/nearby.md",
          relativePath: "nearby.md"
        }
      ]
    });

    await act(async () => {
      await result.current.submit("Compare nearby notes");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      readWorkspaceFile,
      workspaceFiles: [
        {
          name: "nearby.md",
          path: "/vault/nearby.md",
          relativePath: "nearby.md"
        }
      ]
    }));
  });

  it("passes the document image reader to the document agent runtime", async () => {
    const readDocumentImage = vi.fn(async (src: string) => ({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: `/vault/${src}`,
      src
    }));
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Done",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      getDocumentContent: () => "![Architecture](assets/arch.png)",
      provider: testProvider({
        models: [
          {
            capabilities: ["text", "vision"],
            enabled: true,
            id: "gpt-5.5",
            name: "GPT-5.5"
          }
        ]
      }),
      readDocumentImage,
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.submit("这张截图里有什么？");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      readDocumentImage
    }));
  });

  it("records visible agent process steps from runtime events", async () => {
    mockedRunDocumentAiAgent.mockImplementation(async ({ onEvent, onTextDelta }) => {
      onEvent?.({ type: "agent_start" });
      onEvent?.({ type: "turn_start" });
      onEvent?.({
        args: {},
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool_execution_start"
      });
      onEvent?.({
        isError: false,
        result: {
          details: {
            length: 42
          }
        },
        toolCallId: "tool-1",
        toolName: "get_document",
        type: "tool_execution_end"
      });
      onEvent?.({
        message: {
          content: [{ text: "Done", type: "text" }],
          role: "assistant",
          stopReason: "toolUse"
        },
        type: "message_end"
      } as Parameters<NonNullable<typeof onEvent>>[0]);
      onEvent?.({ type: "turn_start" });
      onTextDelta?.("Done");
      onEvent?.({
        message: {
          content: [{ text: "Done", type: "text" }],
          role: "assistant",
          stopReason: "stop"
        },
        type: "message_end"
      } as Parameters<NonNullable<typeof onEvent>>[0]);
      onEvent?.({ messages: [], type: "agent_end" });

      return {
        content: "Done",
        finishReason: "stop"
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      sessionId: "session-a",
      translate: testTranslate({
        "app.aiAgentTraceCall": "AI call",
        "app.aiAgentTraceRequestedTools": "Requested tool calls",
        "app.aiAgentProcessReadDocument": "Read current document"
      })
    });

    await act(async () => {
      await result.current.submit("Check this");
    });

    expect(result.current.messages[1]).toMatchObject({
      activities: [
        {
          detail: "Requested tool calls",
          id: "call:1",
          kind: "ai_call",
          label: "AI call 1",
          status: "completed"
        },
        {
          detail: "42 chars",
          id: "tool:tool-1",
          kind: "tool_call",
          label: "Read current document",
          rawLabel: "get_document",
          status: "completed"
        },
        {
          id: "assistant:1",
          kind: "assistant_message",
          label: "Done",
          status: "completed"
        },
        {
          id: "call:2",
          kind: "ai_call",
          label: "AI call 2",
          status: "completed"
        }
      ],
      role: "assistant",
      text: "Done"
    });
  });

  it("restores and persists a stored session for the active document", async () => {
    mockedGetStoredAiAgentPreferences.mockResolvedValue({ thinkingEnabled: true, webSearchEnabled: true });
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek",
      draft: "Continue this",
      messages: [{ id: 1, role: "user", text: "Earlier question" }],
      panelOpen: true,
      panelWidth: 456,
      thinkingEnabled: false,
      webSearchEnabled: true
    }));
    const onSessionRestore = vi.fn();
    const onSessionModelRestore = vi.fn();

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      onSessionModelRestore,
      onSessionRestore,
      panelOpen: true,
      panelWidth: 456,
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => expect(result.current.draft).toBe("Continue this"));
    expect(result.current.messages).toEqual([{ id: 1, role: "user", text: "Earlier question" }]);
    expect(result.current.thinkingEnabled).toBe(false);
    expect(result.current.webSearchEnabled).toBe(true);
    expect(onSessionRestore).toHaveBeenCalledWith({
      panelOpen: true,
      panelWidth: 456
    });
    expect(onSessionModelRestore).toHaveBeenCalledWith({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek"
    });

    await act(async () => {
      result.current.setDraft("Next prompt");
    });

    await waitFor(() =>
      expect(mockedSaveStoredAiAgentSession).toHaveBeenCalledWith("session-a", {
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Next prompt",
        messages: [{ id: 1, role: "user", text: "Earlier question" }],
        panelOpen: true,
        panelWidth: 456,
        thinkingEnabled: false,
        webSearchEnabled: true
      }, {
        workspaceKey: "/vault"
      })
    );
  });

  it("remembers explicit deep thinking toggles for future sessions", async () => {
    const { result } = renderAiAgentSession({
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledWith("session-a"));

    await act(async () => {
      result.current.setThinkingEnabled((enabled) => !enabled);
    });

    expect(result.current.thinkingEnabled).toBe(true);
    expect(mockedSaveStoredAiAgentPreferences).toHaveBeenCalledWith({ thinkingEnabled: true });
  });

  it("remembers explicit web search toggles for future sessions", async () => {
    const { result } = renderAiAgentSession({
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledWith("session-a"));

    await act(async () => {
      result.current.setWebSearchEnabled((enabled) => !enabled);
    });

    expect(result.current.webSearchEnabled).toBe(true);
    expect(mockedSaveStoredAiAgentPreferences).toHaveBeenCalledWith({ webSearchEnabled: true });
  });

  it("restores the deep thinking setting when switching stored sessions", async () => {
    mockedGetStoredAiAgentSession
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session A",
        thinkingEnabled: false,
        webSearchEnabled: false
      }))
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "deepseek-v4-flash",
        agentProviderId: "deepseek",
        draft: "Session B",
        thinkingEnabled: false,
        webSearchEnabled: false
      }));

    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useAiAgentSession(aiAgentSessionContext({
          sessionId,
          workspaceKey: "/vault",
        })),
      {
        initialProps: {
          sessionId: "session-a"
        }
      }
    );

    await waitFor(() => expect(result.current.draft).toBe("Session A"));

    await act(async () => {
      result.current.setThinkingEnabled(true);
    });

    expect(result.current.thinkingEnabled).toBe(true);

    rerender({
      sessionId: "session-b"
    });

    await waitFor(() => expect(result.current.draft).toBe("Session B"));
    expect(result.current.thinkingEnabled).toBe(false);
  });

  it("restores the web search setting when switching stored sessions", async () => {
    mockedGetStoredAiAgentSession
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session A",
        thinkingEnabled: false,
        webSearchEnabled: false
      }))
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "deepseek-v4-flash",
        agentProviderId: "deepseek",
        draft: "Session B",
        thinkingEnabled: false,
        webSearchEnabled: false
      }));

    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useAiAgentSession(aiAgentSessionContext({
          sessionId,
          workspaceKey: "/vault",
        })),
      {
        initialProps: {
          sessionId: "session-a"
        }
      }
    );

    await waitFor(() => expect(result.current.draft).toBe("Session A"));

    await act(async () => {
      result.current.setWebSearchEnabled(true);
    });

    expect(result.current.webSearchEnabled).toBe(true);

    rerender({
      sessionId: "session-b"
    });

    await waitFor(() => expect(result.current.draft).toBe("Session B"));
    expect(result.current.webSearchEnabled).toBe(false);
  });

  it("restores the agent model selection when switching stored sessions", async () => {
    mockedGetStoredAiAgentSession
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session A",
        thinkingEnabled: false,
        webSearchEnabled: false
      }))
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "deepseek-v4-flash",
        agentProviderId: "deepseek",
        draft: "Session B",
        thinkingEnabled: true,
        webSearchEnabled: true
      }));
    const onSessionModelRestore = vi.fn();

    const { rerender } = renderHook(
      ({ sessionId }) =>
        useAiAgentSession(aiAgentSessionContext({
          onSessionModelRestore,
          sessionId,
          workspaceKey: "/vault",
        })),
      {
        initialProps: {
          sessionId: "session-a"
        }
      }
    );

    await waitFor(() =>
      expect(onSessionModelRestore).toHaveBeenCalledWith({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai"
      })
    );

    rerender({
      sessionId: "session-b"
    });

    await waitFor(() =>
      expect(onSessionModelRestore).toHaveBeenCalledWith({
        agentModelId: "deepseek-v4-flash",
        agentProviderId: "deepseek"
      })
    );
  });

  it("does not reload the active session when restore callbacks change", async () => {
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      draft: "Session A"
    }));
    const firstRestore = vi.fn();
    const secondRestore = vi.fn();

    const { rerender } = renderHook(
      ({ onSessionModelRestore }) =>
        useAiAgentSession(aiAgentSessionContext({
          onSessionModelRestore,
          sessionId: "session-a",
          workspaceKey: "/vault"
        })),
      {
        initialProps: {
          onSessionModelRestore: firstRestore
        }
      }
    );

    await waitFor(() => expect(mockedGetStoredAiAgentSession).toHaveBeenCalledTimes(1));
    expect(firstRestore).toHaveBeenCalledWith({
      agentModelId: "gpt-5.5",
      agentProviderId: "openai"
    });

    rerender({
      onSessionModelRestore: secondRestore
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    expect(mockedGetStoredAiAgentSession).toHaveBeenCalledTimes(1);
    expect(secondRestore).not.toHaveBeenCalled();
  });

  it("keeps the panel open while switching to another stored session", async () => {
    mockedGetStoredAiAgentSession
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session A",
        messages: [{ id: 1, role: "user", text: "First" }],
        panelOpen: true,
        panelWidth: 456,
        thinkingEnabled: false,
        webSearchEnabled: false
      }))
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "deepseek-v4-flash",
        agentProviderId: "deepseek",
        draft: "Session B",
        messages: [{ id: 2, role: "user", text: "Second" }],
        panelOpen: false,
        panelWidth: null,
        thinkingEnabled: true,
        webSearchEnabled: true
      }));
    const onSessionRestore = vi.fn();
    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useAiAgentSession(aiAgentSessionContext({
          onSessionRestore,
          panelOpen: true,
          panelWidth: 456,
          sessionId,
          workspaceKey: "/vault",
        })),
      {
        initialProps: {
          sessionId: "session-a"
        }
      }
    );

    await waitFor(() => expect(result.current.draft).toBe("Session A"));

    rerender({
      sessionId: "session-b"
    });

    await waitFor(() => expect(result.current.draft).toBe("Session B"));
    expect(onSessionRestore).toHaveBeenCalledTimes(1);
    expect(onSessionRestore).toHaveBeenCalledWith({
      panelOpen: true,
      panelWidth: 456
    });
  });

  it("generates and persists an AI session title after the first completed exchange", async () => {
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Gold pricing looks incorrect while XAU is missing in the dataset.",
      finishReason: "stop"
    });

    const provider = testProvider();

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      provider,
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await act(async () => {
      await result.current.submit("看看这组数据，黄金和白银价格是不是获取的有问题");
    });

    await waitFor(() =>
      expect(mockedGenerateAiAgentSessionTitle).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          {
            role: "user",
            text: "看看这组数据，黄金和白银价格是不是获取的有问题"
          },
          {
            role: "assistant",
            text: "Gold pricing looks incorrect while XAU is missing in the dataset."
          }
        ],
        model: "gpt-5.5",
        provider
      }))
    );
    await waitFor(() =>
      expect(mockedSaveStoredAiAgentSessionTitle).toHaveBeenCalledWith("session-a", "Polish GOLD and XAU price notes", {
        workspaceKey: "/vault"
      })
    );
  });
});
