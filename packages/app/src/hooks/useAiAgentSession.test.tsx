import { act, renderHook, waitFor } from "@testing-library/react";
import { generateAiAgentSessionTitle, runDocumentAiAgent } from "@markra/ai";
import {
  getStoredAcpAgentSettings,
  getStoredAiAgentSession,
  getStoredAiAgentPreferences,
  getStoredAiAgentSessionSummary,
  saveStoredAiAgentPreferences,
  saveStoredAiAgentSession,
  saveStoredAiAgentSessionTitle
} from "../lib/settings/app-settings";
import type { I18nKey } from "@markra/shared";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import { useAiAgentSession } from "./useAiAgentSession";
import { storedAgentSession, testProvider } from "../test/ai-fixtures";
import {
  createDraftAiChatAttachments,
  revokeDraftAiChatAttachments,
  type DraftAiChatAttachment
} from "../lib/ai-chat-attachments";

vi.mock("@markra/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@markra/ai")>();

  return {
    ...actual,
    generateAiAgentSessionTitle: vi.fn(),
    runDocumentAiAgent: vi.fn()
  };
});

vi.mock("../lib/settings/app-settings", () => ({
  getStoredAcpAgentSettings: vi.fn(),
  getStoredAiAgentSession: vi.fn(),
  getStoredAiAgentPreferences: vi.fn(),
  getStoredAiAgentSessionSummary: vi.fn(),
  saveStoredAiAgentPreferences: vi.fn(),
  saveStoredAiAgentSession: vi.fn(),
  saveStoredAiAgentSessionTitle: vi.fn()
}));

vi.mock("../lib/ai-chat-attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ai-chat-attachments")>();

  return {
    ...actual,
    createDraftAiChatAttachments: vi.fn(),
    revokeDraftAiChatAttachments: vi.fn()
  };
});

const mockedRunDocumentAiAgent = vi.mocked(runDocumentAiAgent);
const mockedGenerateAiAgentSessionTitle = vi.mocked(generateAiAgentSessionTitle);
const mockedGetStoredAcpAgentSettings = vi.mocked(getStoredAcpAgentSettings);
const mockedGetStoredAiAgentSession = vi.mocked(getStoredAiAgentSession);
const mockedGetStoredAiAgentPreferences = vi.mocked(getStoredAiAgentPreferences);
const mockedGetStoredAiAgentSessionSummary = vi.mocked(getStoredAiAgentSessionSummary);
const mockedSaveStoredAiAgentPreferences = vi.mocked(saveStoredAiAgentPreferences);
const mockedSaveStoredAiAgentSession = vi.mocked(saveStoredAiAgentSession);
const mockedSaveStoredAiAgentSessionTitle = vi.mocked(saveStoredAiAgentSessionTitle);
const mockedCreateDraftAiChatAttachments = vi.mocked(createDraftAiChatAttachments);
const mockedRevokeDraftAiChatAttachments = vi.mocked(revokeDraftAiChatAttachments);

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
    mockedGetStoredAcpAgentSettings.mockReset();
    mockedGetStoredAiAgentSession.mockReset();
    mockedGetStoredAiAgentPreferences.mockReset();
    mockedGetStoredAiAgentSessionSummary.mockReset();
    mockedSaveStoredAiAgentPreferences.mockReset();
    mockedSaveStoredAiAgentSession.mockReset();
    mockedSaveStoredAiAgentSessionTitle.mockReset();
    mockedCreateDraftAiChatAttachments.mockReset();
    mockedRevokeDraftAiChatAttachments.mockReset();
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession());
    mockedGetStoredAiAgentSessionSummary.mockResolvedValue(null);
    mockedGetStoredAcpAgentSettings.mockResolvedValue({ args: "", command: "", cwd: "", enabled: false });
    mockedGetStoredAiAgentPreferences.mockResolvedValue({ thinkingEnabled: false, webSearchEnabled: false });
    mockedGenerateAiAgentSessionTitle.mockResolvedValue("Polish GOLD and XAU price notes");
    mockedSaveStoredAiAgentPreferences.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSession.mockResolvedValue(undefined);
    mockedSaveStoredAiAgentSessionTitle.mockResolvedValue(undefined);
  });

  it("persists draft images before an image-only provider turn and stores attachment metadata", async () => {
    const draftAttachment: DraftAiChatAttachment = {
      file: new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" }),
      metadata: {
        height: 1,
        id: "attachment-1",
        mimeType: "image/png",
        name: "synthetic.png",
        size: 3,
        width: 1
      },
      previewUrl: "blob:preview-1"
    };
    mockedCreateDraftAiChatAttachments.mockResolvedValue([draftAttachment]);
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "The image contains a synthetic pixel.",
      finishReason: "stop"
    });
    const saved = new Map<string, number[]>();
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async (input) => saved.get(input.attachmentId) ?? [],
        save: async (input) => {
          saved.set(input.attachmentId, input.bytes);
        }
      }
    });
    const { result } = renderAiAgentSession({
      provider: testProvider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    expect(result.current).toHaveProperty("addAttachments", expect.any(Function));
    const attachmentSession = result.current as typeof result.current & {
      addAttachments: (files: File[]) => Promise<unknown>;
      draftAttachments: DraftAiChatAttachment[];
    };

    await act(async () => {
      await attachmentSession.addAttachments([draftAttachment.file]);
    });
    expect(result.current.draftAttachments).toEqual([draftAttachment]);

    await act(async () => {
      await result.current.submit();
    });

    expect(saved.get("attachment-1")).toEqual([1, 2, 3]);
    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      images: [{
        dataUrl: "data:image/png;base64,AQID",
        id: "attachment-1",
        mimeType: "image/png"
      }],
      prompt: ""
    }));
    expect(result.current.messages[0]).toMatchObject({
      attachments: [draftAttachment.metadata],
      role: "user",
      text: ""
    });
    expect(result.current.draftAttachments).toEqual([]);
    expect(mockedRevokeDraftAiChatAttachments).toHaveBeenCalledWith([draftAttachment]);
  });

  it("hydrates transient thumbnail sources for persisted message attachments", async () => {
    const attachment = {
      height: 1,
      id: "attachment-1",
      mimeType: "image/png" as const,
      name: "synthetic.png",
      size: 3,
      width: 1
    };
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      messages: [{ attachments: [attachment], id: 1, role: "user", text: "Describe this" }]
    }));
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => [1, 2, 3],
        save: async () => undefined
      }
    });

    const { result } = renderAiAgentSession({
      provider: testProvider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => {
      expect(result.current.messages[0]).toMatchObject({
        attachmentSources: {
          "attachment-1": "data:image/png;base64,AQID"
        },
        attachments: [attachment]
      });
    });
  });

  it("retries image-only user turns with their persisted attachments", async () => {
    const attachment = {
      height: 1,
      id: "attachment-1",
      mimeType: "image/png" as const,
      name: "synthetic.png",
      size: 3,
      width: 1
    };
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      messages: [
        { attachments: [attachment], id: 1, role: "user", text: "" },
        { id: 2, role: "assistant", text: "Initial visual answer." }
      ]
    }));
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Regenerated visual answer.",
      finishReason: "stop"
    });
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => [1, 2, 3],
        save: async () => undefined
      }
    });
    const { result } = renderAiAgentSession({
      provider: testProvider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      sessionId: "session-a",
      workspaceKey: "/vault"
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      await result.current.retryMessage(2);
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      images: [{
        dataUrl: "data:image/png;base64,AQID",
        id: "attachment-1",
        mimeType: "image/png"
      }],
      prompt: ""
    }));
    expect(result.current.messages[0]).toMatchObject({
      attachments: [attachment],
      role: "user",
      text: ""
    });
  });

  it("keeps draft images and blocks provider submission when the selected model lacks vision", async () => {
    const draftAttachment: DraftAiChatAttachment = {
      file: new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" }),
      metadata: {
        height: 1,
        id: "attachment-1",
        mimeType: "image/png",
        name: "synthetic.png",
        size: 3,
        width: 1
      },
      previewUrl: "blob:preview-1"
    };
    mockedCreateDraftAiChatAttachments.mockResolvedValue([draftAttachment]);
    const save = vi.fn(async () => undefined);
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => [1, 2, 3],
        save
      }
    });
    const { result } = renderAiAgentSession({
      model: "text-only",
      provider: testProvider({
        models: [{ capabilities: ["text"], enabled: true, id: "text-only", name: "Text only" }]
      }),
      sessionId: "session-a"
    });
    const attachmentSession = result.current as typeof result.current & {
      addAttachments: (files: File[]) => Promise<unknown>;
    };

    await act(async () => {
      await attachmentSession.addAttachments([draftAttachment.file]);
      await result.current.submit("Describe this image");
    });

    expect(mockedRunDocumentAiAgent).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(result.current.attachmentError).toBe("vision_model_required");
    expect(result.current.draftAttachments).toEqual([draftAttachment]);
  });

  it("keeps draft images when attachment persistence fails", async () => {
    const draftAttachment: DraftAiChatAttachment = {
      file: new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" }),
      metadata: {
        height: 1,
        id: "attachment-1",
        mimeType: "image/png",
        name: "synthetic.png",
        size: 3,
        width: 1
      },
      previewUrl: "blob:preview-1"
    };
    mockedCreateDraftAiChatAttachments.mockResolvedValue([draftAttachment]);
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => [],
        save: async () => {
          throw new Error("Synthetic storage failure");
        }
      }
    });
    const { result } = renderAiAgentSession({
      provider: testProvider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.addAttachments([draftAttachment.file]);
      await result.current.submit("Describe this image");
    });

    expect(mockedRunDocumentAiAgent).not.toHaveBeenCalled();
    expect(result.current.attachmentError).toBe("attachment_storage_failed");
    expect(result.current.draftAttachments).toEqual([draftAttachment]);
    expect(mockedRevokeDraftAiChatAttachments).not.toHaveBeenCalledWith([draftAttachment]);
  });

  it("revokes and clears draft attachments when switching sessions", async () => {
    const draftAttachment: DraftAiChatAttachment = {
      file: new File([new Uint8Array([1])], "synthetic.png", { type: "image/png" }),
      metadata: {
        height: 1,
        id: "attachment-1",
        mimeType: "image/png",
        name: "synthetic.png",
        size: 1,
        width: 1
      },
      previewUrl: "blob:preview-1"
    };
    mockedCreateDraftAiChatAttachments.mockResolvedValue([draftAttachment]);
    const { result, rerender } = renderHook(
      ({ sessionId }) => useAiAgentSession(aiAgentSessionContext({ sessionId })),
      { initialProps: { sessionId: "session-a" } }
    );
    const attachmentSession = result.current as typeof result.current & {
      addAttachments: (files: File[]) => Promise<unknown>;
    };
    await act(async () => {
      await attachmentSession.addAttachments([draftAttachment.file]);
    });

    rerender({ sessionId: "session-b" });

    await waitFor(() => expect(result.current.draftAttachments).toEqual([]));
    expect(mockedRevokeDraftAiChatAttachments).toHaveBeenCalledWith([draftAttachment]);
  });

  afterEach(() => {
    resetAppRuntimeForTests();
    vi.useRealTimers();
  });

  it("runs a configured ACP agent without requiring a chat provider", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const startAgent = vi.fn(async () => ({ connectionId: "acp-1" }));
    const stopAgent = vi.fn(async () => undefined);
    let promptBlocks: unknown = null;
    const listenAgentMessages = vi.fn(async (handler) => {
      agentEventHandler = handler;

      return () => {
        agentEventHandler = null;
      };
    });
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (!("id" in message) || !("method" in message)) return;

      if (message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if (message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-acp" } }),
          type: "message"
        });
      }

      if (message.method === "session/prompt") {
        const params = "params" in message && message.params && typeof message.params === "object"
          ? message.params as { prompt?: unknown }
          : {};
        promptBlocks = params.prompt ?? null;
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                sessionUpdate: "session_info_update",
                title: "Codex is working"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                kind: "read",
                locations: [{ path: "notes/example.md" }],
                rawInput: { path: "notes/example.md" },
                sessionUpdate: "tool_call",
                status: "in_progress",
                title: "Read file 'notes/example.md'",
                toolCallId: "acp-read-1"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                rawOutput: { formatted_output: "# Draft" },
                sessionUpdate: "tool_call_update",
                status: "completed",
                toolCallId: "acp-read-1"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                content: [{ type: "diff", text: "@@ synthetic patch" }],
                kind: "edit",
                locations: [{ path: "notes/example.md" }],
                rawInput: { path: "notes/example.md" },
                sessionUpdate: "tool_call",
                status: "completed",
                title: "Editing files",
                toolCallId: "acp-edit-1"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                content: { text: "ACP summary", type: "text" },
                messageId: "message-1",
                sessionUpdate: "agent_message_chunk"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages,
        startAgent,
        stopAgent,
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "--experimental-acp",
      command: "synthetic-agent",
      cwd: "/mock-vault",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      getSelection: () => ({
        cursor: 18,
        from: 8,
        source: "selection",
        text: "selected synthetic text",
        to: 31
      }),
      model: null,
      provider: null,
      sessionId: "session-a",
      workspaceKey: "/mock-vault"
    });

    await act(async () => {
      await result.current.submit("Summarize through ACP");
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(startAgent).toHaveBeenCalledWith({
      args: ["--experimental-acp"],
      command: "synthetic-agent",
      cwd: "/mock-vault",
      env: []
    });
    expect(mockedRunDocumentAiAgent).not.toHaveBeenCalled();
    const editorContextBlock = (promptBlocks as Array<{ text?: string; type?: string }>).find((block) =>
      block.type === "text" && block.text?.includes("Markra editor context:")
    );
    expect(editorContextBlock?.text).toContain("Current selection snapshot:");
    expect(editorContextBlock?.text).toContain("Selected text:\nselected synthetic text");
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      text: "ACP summary"
    });
    expect(result.current.messages.at(-1)?.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "tool:acp-status:session-acp:session_info_update",
        label: "Codex is working",
        status: "completed"
      }),
      expect.objectContaining({
        id: "tool:acp-read-1",
        label: "Read file 'notes/example.md'",
        status: "completed"
      }),
      expect.objectContaining({
        detail: "notes/example.md",
        id: "tool:acp-edit-1",
        label: "Editing files",
        status: "completed"
      })
    ]));
    expect(stopAgent).toHaveBeenCalledWith("acp-1");
  });

  it("cancels a running ACP agent when interrupted", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const stopAgent = vi.fn(async () => undefined);
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (!("method" in message)) return;

      if ("id" in message && message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if ("id" in message && message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-acp" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          agentEventHandler = handler;

          return () => {
            agentEventHandler = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent,
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "",
      command: "synthetic-agent",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      model: null,
      provider: null,
      sessionId: "session-a",
      workspaceKey: "/mock-vault"
    });

    let submitPromise: Promise<unknown> | null = null;
    await act(async () => {
      submitPromise = result.current.submit("Keep running through ACP");
      await Promise.resolve();
    });
    await waitFor(() => expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", expect.objectContaining({
      method: "session/prompt"
    })));

    act(() => {
      result.current.interrupt();
    });

    await waitFor(() => expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", {
      jsonrpc: "2.0",
      method: "session/cancel",
      params: {
        sessionId: "session-acp"
      }
    }));
    await waitFor(() => expect(stopAgent).toHaveBeenCalledWith("acp-1"));
    await act(async () => {
      await submitPromise;
    });
    expect(result.current.status).toBe("idle");
  });

  it("forwards ACP filesystem write previews into the editor preview flow", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const onAiPreviewReady = vi.fn();
    const onAiResult = vi.fn();
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
        return;
      }

      if (!("id" in message) || !("method" in message)) return;

      if (message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if (message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-acp" } }),
          type: "message"
        });
      }

      if (message.method === "session/prompt") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            id: 91,
            jsonrpc: "2.0",
            method: "fs/write_text_file",
            params: {
              content: "# Updated\n\nBody",
              path: "/mock-vault/note.md",
              sessionId: "session-acp"
            }
          }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          agentEventHandler = handler;

          return () => {
            agentEventHandler = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "",
      command: "synthetic-agent",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      getDocumentContent: () => "# Draft",
      model: null,
      onAiPreviewReady,
      onAiResult,
      provider: null,
      sessionId: "session-a",
      translate: testTranslate({
        "app.aiAgentPreviewReady": "The editor change is ready."
      }),
      workspaceKey: "/mock-vault"
    });

    await act(async () => {
      await result.current.submit("Update through ACP");
    });

    const preview = {
      from: 0,
      original: "# Draft",
      replacement: "# Updated\n\nBody",
      target: {
        kind: "document" as const,
        title: "note.md"
      },
      to: 7,
      type: "replace" as const
    };
    expect(onAiResult).toHaveBeenCalledWith(preview, "acp-write:/mock-vault/note.md:1");
    expect(onAiPreviewReady).toHaveBeenCalledWith(preview, "acp-write:/mock-vault/note.md:1");
    expect(result.current.status).toBe("idle");
    expect(result.current.messages.at(-1)).toMatchObject({
      preview,
      role: "assistant",
      text: "The editor change is ready."
    });
  });

  it("keeps ACP text responses in the transcript when no filesystem write occurs", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const onAiPreviewReady = vi.fn();
    const onAiResult = vi.fn();
    const suggestedResponse = [
      "```markdown",
      "Improved draft",
      "```"
    ].join("\n");
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (!("id" in message) || !("method" in message)) return;

      if (message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if (message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-acp" } }),
          type: "message"
        });
      }

      if (message.method === "session/prompt") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                content: {
                  text: suggestedResponse,
                  type: "text"
                },
                sessionUpdate: "agent_message_chunk"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          agentEventHandler = handler;

          return () => {
            agentEventHandler = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "",
      command: "synthetic-agent",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      getDocumentContent: () => "# Draft\n\nOriginal draft",
      getSelection: () => ({
        cursor: 23,
        from: 9,
        source: "selection",
        text: "Original draft",
        to: 23
      }),
      model: null,
      onAiPreviewReady,
      onAiResult,
      provider: null,
      sessionId: "session-a",
      translate: testTranslate({
        "app.aiAgentPreviewReady": "The editor change is ready."
      }),
      workspaceKey: "/mock-vault"
    });

    await act(async () => {
      await result.current.submit("Polish the selected text");
    });

    expect(onAiResult).not.toHaveBeenCalled();
    expect(onAiPreviewReady).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      text: suggestedResponse
    });
  });

  it("exposes ACP permission requests and resumes after the user chooses an option", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
        if (message.result && typeof message.result === "object" && "outcome" in message.result) {
          const outcome = message.result.outcome;
          if (outcome && typeof outcome === "object" && "optionId" in outcome && outcome.optionId === "allow_once") {
            agentEventHandler?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "session-acp",
                  update: {
                    content: { text: "Permission accepted.", type: "text" },
                    messageId: "message-1",
                    sessionUpdate: "agent_message_chunk"
                  }
                }
              }),
              type: "message"
            });
          }
        }
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
        return;
      }

      if (!("id" in message) || !("method" in message)) return;

      if (message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if (message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-acp" } }),
          type: "message"
        });
      }

      if (message.method === "session/prompt") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            id: 91,
            jsonrpc: "2.0",
            method: "session/request_permission",
            params: {
              options: [
                { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
                { kind: "reject_once", name: "Reject once", optionId: "reject_once" }
              ],
              sessionId: "session-acp",
              toolCall: {
                kind: "edit",
                path: "notes/example.md",
                title: "Write file"
              }
            }
          }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          agentEventHandler = handler;

          return () => {
            agentEventHandler = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "",
      command: "synthetic-agent",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      model: null,
      provider: null,
      sessionId: "session-a",
      workspaceKey: "/mock-vault"
    });

    let submitPromise: Promise<unknown> | null = null;
    await act(async () => {
      submitPromise = result.current.submit("Update through ACP");
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.pendingAcpPermission).toMatchObject({
      detail: "notes/example.md",
      options: [
        { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
        { kind: "reject_once", name: "Reject once", optionId: "reject_once" }
      ],
      title: "Permission requested: Write file"
    }));

    act(() => {
      result.current.resolveAcpPermission({
        optionId: "allow_once",
        outcome: "selected"
      });
    });
    await act(async () => {
      await submitPromise;
    });

    expect(result.current.pendingAcpPermission).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      text: "Permission accepted."
    });
  });

  it("shows string errors returned by the ACP runtime", async () => {
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async () => () => undefined),
        startAgent: vi.fn(() => Promise.reject("Failed to start ACP agent: npx was not found.")),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async () => undefined)
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "-lc 'exec npx -y synthetic-acp-agent'",
      command: "/bin/zsh",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      model: null,
      provider: null,
      sessionId: "session-a",
      translate: testTranslate({
        "app.aiRequestFailed": "AI request failed."
      }),
      workspaceKey: "/mock-vault"
    });

    await act(async () => {
      await result.current.submit("Hello ACP");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.messages.at(-1)).toMatchObject({
      isError: true,
      text: "Failed to start ACP agent: npx was not found."
    });
  });

  it("stores ACP-advertised models and applies the selected ACP model on the next session", async () => {
    let agentEventHandler: ((event: { connectionId: string; message: string; type: "exit" | "message" | "stderr" }) => unknown) | null = null;
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (!("id" in message) || !("method" in message)) return;

      if (message.method === "initialize") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { protocolVersion: 1 } }),
          type: "message"
        });
      }

      if (message.method === "session/new") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            id: message.id,
            jsonrpc: "2.0",
            result: {
              configOptions: [
                {
                  category: "model",
                  currentValue: "gpt-5.5",
                  id: "model",
                  options: [
                    { name: "GPT-5.5", value: "gpt-5.5" },
                    { name: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" }
                  ],
                  type: "select"
                }
              ],
              sessionId: "session-acp"
            }
          }),
          type: "message"
        });
      }

      if (message.method === "session/set_config_option") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            id: message.id,
            jsonrpc: "2.0",
            result: {
              configOptions: [
                {
                  category: "model",
                  currentValue: "claude-sonnet-4-6",
                  id: "model",
                  options: [
                    { name: "GPT-5.5", value: "gpt-5.5" },
                    { name: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" }
                  ],
                  type: "select"
                }
              ]
            }
          }),
          type: "message"
        });
      }

      if (message.method === "session/prompt") {
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-acp",
              update: {
                content: { text: "ACP response", type: "text" },
                messageId: "message-1",
                sessionUpdate: "agent_message_chunk"
              }
            }
          }),
          type: "message"
        });
        agentEventHandler?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...createDefaultAppRuntime(),
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          agentEventHandler = handler;

          return () => {
            agentEventHandler = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage
      }
    });
    mockedGetStoredAcpAgentSettings.mockResolvedValue({
      args: "",
      command: "synthetic-agent",
      cwd: "",
      enabled: true
    });

    const { result } = renderAiAgentSession({
      documentPath: "/mock-vault/note.md",
      model: null,
      provider: null,
      workspaceKey: "/mock-vault"
    });

    await act(async () => {
      await result.current.submit("List ACP models");
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.acpModels).toEqual([
      { description: undefined, id: "gpt-5.5", name: "GPT-5.5" },
      { description: undefined, id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }
    ]);
    expect(result.current.selectedAcpModelId).toBe("gpt-5.5");

    act(() => {
      result.current.selectAcpModel("claude-sonnet-4-6");
    });

    await act(async () => {
      await result.current.submit("Use selected ACP model");
    });

    expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", expect.objectContaining({
      method: "session/set_config_option",
      params: {
        configId: "model",
        sessionId: "session-acp",
        value: "claude-sonnet-4-6"
      }
    }));
    expect(result.current.selectedAcpModelId).toBe("claude-sonnet-4-6");
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

  it("retries an assistant answer from its original user turn", async () => {
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      messages: [
        { id: 1, role: "user", text: "Summarize synthetic notes" },
        { id: 2, role: "assistant", text: "Initial summary." },
        { id: 3, role: "user", text: "List follow-up actions" },
        { id: 4, role: "assistant", text: "Initial actions." }
      ]
    }));
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Regenerated actions.",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(4));

    await act(async () => {
      await (result.current as typeof result.current & { retryMessage: (messageId: number) => Promise<unknown> }).retryMessage(4);
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      history: [
        {
          preview: undefined,
          previews: undefined,
          role: "user",
          text: "Summarize synthetic notes"
        },
        {
          preview: undefined,
          previews: undefined,
          role: "assistant",
          text: "Initial summary."
        }
      ],
      prompt: "List follow-up actions"
    }));
    expect(result.current.messages).toEqual([
      { id: 1, role: "user", text: "Summarize synthetic notes" },
      { id: 2, role: "assistant", text: "Initial summary." },
      { id: expect.any(Number), role: "user", text: "List follow-up actions" },
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
        text: "Regenerated actions.",
        thinking: ""
      }
    ]);
  });

  it("submits an edited user turn by discarding later transcript messages", async () => {
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      messages: [
        { id: 1, role: "user", text: "Summarize synthetic notes" },
        { id: 2, role: "assistant", text: "Initial summary." },
        { id: 3, role: "user", text: "List follow-up actions" },
        { id: 4, role: "assistant", text: "Initial actions." }
      ]
    }));
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Regenerated actions from the edited prompt.",
      finishReason: "stop"
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/example.md",
      sessionId: "session-a",
      workspaceKey: "/vault"
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(4));

    await act(async () => {
      await (
        result.current as typeof result.current & {
          submitEditedMessage: (messageId: number, promptOverride: string) => Promise<unknown>;
        }
      ).submitEditedMessage(3, "List updated follow-up actions");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      history: [
        {
          preview: undefined,
          previews: undefined,
          role: "user",
          text: "Summarize synthetic notes"
        },
        {
          preview: undefined,
          previews: undefined,
          role: "assistant",
          text: "Initial summary."
        }
      ],
      prompt: "List updated follow-up actions"
    }));
    expect(result.current.messages).toEqual([
      { id: 1, role: "user", text: "Summarize synthetic notes" },
      { id: 2, role: "assistant", text: "Initial summary." },
      { id: expect.any(Number), role: "user", text: "List updated follow-up actions" },
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
        text: "Regenerated actions from the edited prompt.",
        thinking: ""
      }
    ]);
  });

  it("reuses persisted image attachments when submitting an edited user turn", async () => {
    const attachment = {
      height: 1,
      id: "attachment-1",
      mimeType: "image/png" as const,
      name: "synthetic.png",
      size: 3,
      width: 1
    };
    mockedGetStoredAiAgentSession.mockResolvedValue(storedAgentSession({
      messages: [
        { attachments: [attachment], id: 1, role: "user", text: "Describe this image" },
        { id: 2, role: "assistant", text: "Initial visual answer." }
      ]
    }));
    mockedRunDocumentAiAgent.mockResolvedValue({
      content: "Updated visual answer.",
      finishReason: "stop"
    });
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => [1, 2, 3],
        save: async () => undefined
      }
    });
    const { result } = renderAiAgentSession({
      provider: testProvider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      sessionId: "session-a"
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      await result.current.submitEditedMessage(1, "Describe this image in detail");
    });

    expect(mockedRunDocumentAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      images: [{
        dataUrl: "data:image/png;base64,AQID",
        id: "attachment-1",
        mimeType: "image/png"
      }],
      prompt: "Describe this image in detail"
    }));
    expect(result.current.messages[0]).toMatchObject({
      attachments: [attachment],
      role: "user",
      text: "Describe this image in detail"
    });
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
      await result.current.submit("What is in this screenshot?");
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
        toolName: "read_document",
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
        toolName: "read_document",
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
          rawLabel: "read_document",
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

  it("exposes prepared workspace plan events from agent tool results", async () => {
    mockedRunDocumentAiAgent.mockImplementation(async ({ onEvent, onTextDelta }) => {
      onEvent?.({
        isError: false,
        result: {
          details: {
            changes: [
              {
                content: "# Alpha",
                label: "Create note: topics/alpha.md",
                path: "topics/alpha.md",
                type: "create_note"
              }
            ],
            count: 1,
            summary: "Organize synthetic notes."
          }
        },
        toolCallId: "tool-plan",
        toolName: "prepare_workspace_change_plan",
        type: "tool_execution_end"
      });
      onTextDelta?.("Prepared plan.");

      return {
        content: "Prepared plan.",
        finishReason: "stop"
      };
    });

    const { result } = renderAiAgentSession({
      documentPath: "/vault/README.md",
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.submit("Organize this workspace");
    });

    expect(result.current.workspacePlanEvents.map((event) => event.type)).toEqual([
      "plan_validating",
      "step_started",
      "step_previewed"
    ]);
    expect(result.current.workspacePlanEvents[1]).toEqual(expect.objectContaining({
      action: "create_note",
      path: "topics/alpha.md",
      target: "file_tree"
    }));
  });

  it("applies the latest prepared workspace plan through a confirmed delayed executor", async () => {
    vi.useFakeTimers();
    mockedRunDocumentAiAgent.mockImplementation(async ({ onEvent, onTextDelta }) => {
      onEvent?.({
        isError: false,
        result: {
          details: {
            changes: [
              {
                content: "# Alpha",
                label: "Create note: topics/alpha.md",
                path: "topics/alpha.md",
                type: "create_note"
              }
            ],
            count: 1,
            summary: "Organize synthetic notes."
          }
        },
        toolCallId: "tool-plan",
        toolName: "prepare_workspace_change_plan",
        type: "tool_execution_end"
      });
      onTextDelta?.("Prepared plan.");

      return {
        content: "Prepared plan.",
        finishReason: "stop"
      };
    });
    const applyWorkspacePlan = vi.fn(async (plan, options) => {
      expect(plan).toEqual({
        changes: [
          {
            content: "# Alpha",
            label: "Create note: topics/alpha.md",
            path: "topics/alpha.md",
            type: "create_note"
          }
        ],
        summary: "Organize synthetic notes."
      });

      options.onVisualEvent({
        totalSteps: 1,
        type: "plan_validating"
      });
      options.onVisualEvent({
        action: "create_note",
        afterContent: "# Alpha",
        index: 0,
        label: "Create note: topics/alpha.md",
        path: "topics/alpha.md",
        target: "file_tree",
        type: "step_applied"
      });

      return {
        count: 1,
        journal: {
          changes: [
            {
              afterContent: "# Alpha",
              path: "topics/alpha.md",
              type: "create_note" as const
            }
          ]
        },
        summary: "Organize synthetic notes."
      };
    });

    const { result } = renderAiAgentSession({
      applyWorkspacePlan,
      documentPath: "/vault/README.md",
      sessionId: "session-a"
    });

    await act(async () => {
      await result.current.submit("Organize this workspace");
    });

    expect(result.current.workspacePlanApplyStatus).toBe("idle");

    let applyPromise: Promise<unknown> | null = null;
    act(() => {
      applyPromise = result.current.applyWorkspacePlan();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(applyWorkspacePlan).toHaveBeenCalledTimes(1);
    expect(result.current.workspacePlanApplyStatus).toBe("applying");
    expect(result.current.workspacePlanEvents.map((event) => event.type)).toEqual(["plan_validating"]);

    await act(async () => {
      vi.advanceTimersByTime(420);
      await Promise.resolve();
    });

    expect(result.current.workspacePlanEvents.map((event) => event.type)).toEqual([
      "plan_validating",
      "step_applied"
    ]);

    await act(async () => {
      await applyPromise;
    });

    expect(result.current.workspacePlanApplyStatus).toBe("applied");
    expect(result.current.workspacePlanApplyError).toBeNull();
    expect(result.current.workspacePlanEvents.at(-1)).toEqual(expect.objectContaining({
      path: "topics/alpha.md",
      type: "step_applied"
    }));
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

  it("lets an in-flight agent request finish in its original session after switching sessions", async () => {
    let finishRun: (() => unknown) | undefined;
    const runCanFinish = new Promise((resolve) => {
      finishRun = () => resolve(undefined);
    });
    mockedGetStoredAiAgentSession
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session A",
        panelOpen: true,
        panelWidth: 456
      }))
      .mockResolvedValueOnce(storedAgentSession({
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "Session B",
        panelOpen: true,
        panelWidth: 456
      }));
    mockedRunDocumentAiAgent.mockImplementation(async ({ onTextDelta }) => {
      await runCanFinish;
      onTextDelta?.("Finished after switching away.");

      return {
        content: "Finished after switching away.",
        finishReason: "stop"
      };
    });

    const { result, rerender } = renderHook(
      ({ sessionId }) =>
        useAiAgentSession(aiAgentSessionContext({
          panelOpen: true,
          panelWidth: 456,
          sessionId,
          workspaceKey: "/vault"
        })),
      {
        initialProps: {
          sessionId: "session-a"
        }
      }
    );

    await waitFor(() => expect(result.current.draft).toBe("Session A"));

    let submitPromise: Promise<unknown> | undefined;
    act(() => {
      submitPromise = result.current.submit("Keep this request running");
    });
    await waitFor(() => expect(mockedRunDocumentAiAgent).toHaveBeenCalledTimes(1));

    rerender({
      sessionId: "session-b"
    });
    await waitFor(() => expect(result.current.draft).toBe("Session B"));

    await act(async () => {
      finishRun?.();
      await submitPromise;
    });

    await waitFor(() =>
      expect(mockedSaveStoredAiAgentSession).toHaveBeenCalledWith("session-a", {
        agentModelId: "gpt-5.5",
        agentProviderId: "openai",
        draft: "",
        messages: [
          { id: expect.any(Number), role: "user", text: "Keep this request running" },
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
            text: "Finished after switching away.",
            thinking: ""
          }
        ],
        panelOpen: true,
        panelWidth: 456,
        thinkingEnabled: false,
        webSearchEnabled: false
      }, {
        workspaceKey: "/vault"
      })
    );
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
      await result.current.submit("Check whether the gold and silver prices in this dataset look wrong");
    });

    await waitFor(() =>
      expect(mockedGenerateAiAgentSessionTitle).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          {
            role: "user",
            text: "Check whether the gold and silver prices in this dataset look wrong"
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
